import { inject, Injectable } from '@angular/core';
import type { Database } from '../../core/database.types';
import { SUPABASE } from '../../core/supabase';
import { fetchAll } from '../../core/fetch-all';
import { daysBetween, localDate, todayLocal } from '../../core/dates';
import {
  byUrgency,
  dueWording,
  LOOKAHEAD_DAYS,
  openPrintWording,
  owingWording,
  STALE_PRINT_DAYS,
  urgencyForDueDate,
  type TodayTask,
} from './panel.tasks';
import { ImpresorasData } from '../impresoras/impresoras.data';
import { totalHours } from '../impresoras/impresoras.models';
import { dueStatuses, needsAttention, type DueState } from '../impresoras/maintenance-due';

type OrderStatus = Database['public']['Enums']['order_status'];
type FailureCause = Database['public']['Enums']['print_failure_cause'];

export interface LowFilament {
  id: string;
  name: string;
  colorHex: string | null;
  availableG: number;
  minimumG: number;
}

export interface StatusCount {
  status: OrderStatus;
  count: number;
}

export interface WeekPrints {
  successful: number;
  failed: number;
  /** Share of closed jobs that succeeded, or null when none closed. */
  successRate: number | null;
  /** All-time figures from the failure_stats view. */
  historicClosed: number;
  historicFailureRate: number | null;
  mostCommonCause: FailureCause | null;
}

export interface MaintenanceAlert {
  key: string;
  printerName: string;
  task: string;
  state: DueState;
  summary: string;
}

/** Orders that still need work, in the order they move through the shop. */
export const IN_PROGRESS_STATUSES: OrderStatus[] = [
  'confirmed',
  'queued',
  'printing',
  'post_processing',
  'ready',
  'on_hold',
];

const WEEK_DAYS = 7;
const TASK_LIMIT = 12;
const MS_PER_DAY = 86_400_000;
const ALERT_LIMIT = 6;

/** The few queries the dashboard needs, each one independent of the others. */
@Injectable({ providedIn: 'root' })
export class PanelData {
  private readonly supabase = inject(SUPABASE);
  private readonly printers = inject(ImpresorasData);

  async lowFilaments(): Promise<LowFilament[]> {
    const { data: stock, error } = await this.supabase
      .from('filament_sku_stock')
      .select('filament_sku_id, available_g, min_stock_g')
      .eq('below_minimum', true);
    if (error) throw error;
    if (stock.length === 0) return [];

    const ids = stock.map((row) => row.filament_sku_id).filter((id): id is string => id !== null);
    const [skus, brands, materials] = await Promise.all([
      this.supabase
        .from('filament_skus')
        .select('id, brand_id, material_id, color_name, color_hex, filament_finishes(name)')
        .in('id', ids),
      this.supabase.from('brands').select('id, name'),
      this.supabase.from('materials').select('id, code'),
    ]);
    for (const result of [skus, brands, materials]) {
      if (result.error) throw result.error;
    }

    const brandName = new Map((brands.data ?? []).map((brand) => [brand.id, brand.name]));
    const materialCode = new Map((materials.data ?? []).map((material) => [material.id, material.code]));
    const skuById = new Map((skus.data ?? []).map((sku) => [sku.id, sku]));

    return stock
      .map((row): LowFilament | null => {
        const sku = row.filament_sku_id ? skuById.get(row.filament_sku_id) : undefined;
        if (!sku) return null;

        const name = [brandName.get(sku.brand_id), materialCode.get(sku.material_id), sku.filament_finishes?.name, sku.color_name]
          .filter(Boolean)
          .join(' ');
        return {
          id: sku.id,
          name,
          colorHex: sku.color_hex,
          availableG: Number(row.available_g ?? 0),
          minimumG: Number(row.min_stock_g ?? 0),
        };
      })
      .filter((item): item is LowFilament => item !== null)
      .sort((a, b) => a.availableG / (a.minimumG || 1) - b.availableG / (b.minimumG || 1));
  }

  async ordersInProgress(): Promise<StatusCount[]> {
    const orders = await fetchAll((from, to) =>
      this.supabase.from('orders').select('id, status').in('status', IN_PROGRESS_STATUSES).order('id').range(from, to),
    );

    const counts = new Map<OrderStatus, number>();
    for (const order of orders) counts.set(order.status, (counts.get(order.status) ?? 0) + 1);

    return IN_PROGRESS_STATUSES.filter((status) => counts.has(status)).map((status) => ({
      status,
      count: counts.get(status) ?? 0,
    }));
  }

  async weekPrints(): Promise<WeekPrints> {
    const since = new Date(Date.now() - WEEK_DAYS * MS_PER_DAY).toISOString();

    const [jobs, stats] = await Promise.all([
      fetchAll((from, to) =>
        this.supabase
          .from('print_jobs')
          .select('id, status')
          .in('status', ['success', 'failed'])
          .gte('finished_at', since)
          .order('id')
          .range(from, to),
      ),
      this.supabase.from('failure_stats').select('closed_jobs, failed_jobs, most_common_cause'),
    ]);
    if (stats.error) throw stats.error;

    const successful = jobs.filter((job) => job.status === 'success').length;
    const failed = jobs.length - successful;

    const rows = stats.data ?? [];
    const historicClosed = rows.reduce((sum, row) => sum + Number(row.closed_jobs ?? 0), 0);
    const historicFailed = rows.reduce((sum, row) => sum + Number(row.failed_jobs ?? 0), 0);
    const worst = [...rows].sort((a, b) => Number(b.failed_jobs ?? 0) - Number(a.failed_jobs ?? 0))[0];

    return {
      successful,
      failed,
      successRate: jobs.length === 0 ? null : successful / jobs.length,
      historicClosed,
      historicFailureRate: historicClosed === 0 ? null : historicFailed / historicClosed,
      mostCommonCause: worst && Number(worst.failed_jobs ?? 0) > 0 ? worst.most_common_cause : null,
    };
  }

  async maintenanceAlerts(): Promise<MaintenanceAlert[]> {
    const workshop = await this.printers.load();
    const today = todayLocal();

    return workshop.printers
      .filter((printer) => printer.status !== 'retired')
      .flatMap((printer) => {
        const plans = workshop.plans.filter((plan) => plan.printerId === printer.id);
        const logs = workshop.logs.filter((log) => log.printerId === printer.id);
        return needsAttention(dueStatuses(plans, logs, totalHours(printer), today)).map((status) => ({
          key: status.plan.id,
          urgency: status.urgency,
          printerName: printer.name,
          task: status.plan.task,
          state: status.state,
          summary: status.summary,
        }));
      })
      .sort((a, b) => a.urgency - b.urgency)
      .slice(0, ALERT_LIMIT)
      .map(({ urgency: _urgency, ...alert }) => alert);
  }

  /**
   * The queue the owner actually works from: everything that is late or due in
   * the next few days, newest problem first. The cards below answer "how is the
   * shop doing"; this answers "what do I do now", which is a different question
   * and the one he was asking when he opened the app and did not know where to
   * start.
   *
   * Low filament is deliberately NOT here. It is a condition, not a deadline:
   * it has its own card and repeating it would drown the things that do expire.
   */
  async todayTasks(): Promise<TodayTask[]> {
    const today = todayLocal();
    const [orders, prints, unpaid, maintenance] = await Promise.all([
      this.dueOrders(today),
      this.openPrints(today),
      this.unpaidDeliveries(),
      this.maintenanceAlerts(),
    ]);

    const overdueMaintenance = maintenance
      .filter((alert) => alert.state === 'overdue')
      .map((alert): TodayTask => ({
        key: `maintenance:${alert.key}`,
        urgency: 'late',
        title: alert.task,
        detail: `${alert.printerName} · ${alert.summary}`,
        route: '/impresoras',
      }));

    return [...orders, ...prints, ...unpaid, ...overdueMaintenance]
      .sort(byUrgency)
      .slice(0, TASK_LIMIT);
  }

  /** Orders still in the shop whose delivery date is here or nearly here. */
  private async dueOrders(today: string): Promise<TodayTask[]> {
    const { data, error } = await this.supabase
      .from('orders')
      .select('id, number, due_date, status')
      .in('status', IN_PROGRESS_STATUSES)
      .not('due_date', 'is', null)
      .order('due_date');
    if (error) throw error;

    return (data ?? [])
      .filter((order) => order.due_date !== null && daysBetween(today, order.due_date) <= LOOKAHEAD_DAYS)
      .map((order): TodayTask => {
        const days = daysBetween(today, order.due_date as string);
        return {
          key: `order:${order.id}`,
          urgency: urgencyForDueDate(days),
          title: `Pedido ${order.number}`,
          detail: dueWording(days),
          route: `/pedidos/${order.id}`,
        };
      });
  }

  /** A print that says it is printing but nobody closed: its cost never landed. */
  private async openPrints(today: string): Promise<TodayTask[]> {
    const { data, error } = await this.supabase
      .from('print_jobs')
      .select('id, label, started_at')
      .eq('status', 'printing')
      .order('started_at');
    if (error) throw error;

    return (data ?? []).map((job): TodayTask => {
      const startedOn = job.started_at ? localDate(job.started_at) : null;
      const days = startedOn ? daysBetween(startedOn, today) : 0;
      return {
        key: `print:${job.id}`,
        urgency: days >= STALE_PRINT_DAYS ? 'late' : 'today',
        title: `Impresión sin cerrar${job.label ? ` · ${job.label}` : ''}`,
        detail: openPrintWording(days),
        route: '/produccion',
      };
    });
  }

  /** Delivered and still owing. Money already earned that nobody went to collect. */
  private async unpaidDeliveries(): Promise<TodayTask[]> {
    const { data, error } = await this.supabase
      .from('order_payment_summary')
      .select('order_id, number, balance, status')
      .in('status', ['delivered', 'closed'])
      .gt('balance', 0)
      .order('balance', { ascending: false });
    if (error) throw error;

    return (data ?? [])
      .filter((row) => row.order_id !== null)
      .map((row): TodayTask => ({
        key: `payment:${row.order_id}`,
        urgency: 'late',
        title: `Cobrar el pedido ${row.number}`,
        detail: owingWording(Number(row.balance ?? 0)),
        route: '/finanzas/por-cobrar',
      }));
  }

}
