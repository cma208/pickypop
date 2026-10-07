import { inject, Injectable } from '@angular/core';
import type { Database } from '../../core/database.types';
import { SUPABASE } from '../../core/supabase';
import { fetchAll } from '../../core/fetch-all';
import { daysBetween, localDate, todayLocal } from '../../core/dates';
import { PlanService, type PlanView } from '../../core/plan';
import { orderTitle, pastEstimateJobs, planTasks, uniqueTasks } from './panel.plan-tasks';
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
  /** On the spools. Who it is for is the plan's business; the minimum is about what there is. */
  onHandG: number;
  minimumG: number;
}

/** «Lo que vence», and whether the plan's part of it could be computed. */
export interface TodayAgenda {
  tasks: TodayTask[];
  /** Holds, late orders and purchases come from the plan: without it the list is short, and says so. */
  planFailed: boolean;
}

interface OpenPrint {
  id: string;
  label: string | null;
  started_at: string | null;
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
  private readonly planner = inject(PlanService);

  async lowFilaments(): Promise<LowFilament[]> {
    // The view's `available_g` and `below_minimum` read the old reservations
    // (ADR-021); what is on the spools against the minimum is the question here.
    const { data: rows, error } = await this.supabase
      .from('filament_sku_stock')
      .select('filament_sku_id, on_hand_g, min_stock_g');
    if (error) throw error;
    const stock = rows.filter((row) => Number(row.on_hand_g ?? 0) < Number(row.min_stock_g ?? 0));
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
          onHandG: Number(row.on_hand_g ?? 0),
          minimumG: Number(row.min_stock_g ?? 0),
        };
      })
      .filter((item): item is LowFilament => item !== null)
      .sort((a, b) => a.onHandG / (a.minimumG || 1) - b.onHandG / (b.minimumG || 1));
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
   *
   * The plan adds what only it knows: holds about to lapse, orders the queue
   * will not make in time and what the confirmed orders need bought. A late
   * order says so once, with its dates, instead of also "se entrega hoy".
   */
  async todayTasks(): Promise<TodayAgenda> {
    const today = todayLocal();
    const [view, orders, prints, unpaid, maintenance] = await Promise.all([
      this.plan(),
      this.dueOrders(today),
      this.openPrints(),
      this.unpaidDeliveries(),
      this.maintenanceAlerts(),
    ]);
    const pastEstimate = view ? pastEstimateJobs(view.input) : new Set<string>();

    const overdueMaintenance = maintenance
      .filter((alert) => alert.state === 'overdue')
      .map((alert): TodayTask => ({
        key: `maintenance:${alert.key}`,
        urgency: 'late',
        title: alert.task,
        detail: `${alert.printerName} · ${alert.summary}`,
        route: '/impresoras',
        photo: null,
        kind: 'printer',
      }));

    const tasks = uniqueTasks([
      ...(view ? planTasks(view) : []),
      ...orders,
      ...prints.map((job) => openPrintTask(job, today, pastEstimate.has(job.id))),
      ...unpaid,
      ...overdueMaintenance,
    ]);
    return { tasks: tasks.sort(byUrgency).slice(0, TASK_LIMIT), planFailed: view === null };
  }

  /** The plan is one part of the list: when it fails, the rest still shows. */
  private async plan(): Promise<PlanView | null> {
    try {
      return await this.planner.current();
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  /** Orders still in the shop whose delivery date is here or nearly here. */
  private async dueOrders(today: string): Promise<TodayTask[]> {
    const { data, error } = await this.supabase
      .from('orders')
      .select('id, number, due_date, status, recipient, customers(name)')
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
          title: orderTitle(order.number, order.customers?.name ?? order.recipient),
          detail: dueWording(days),
          route: `/pedidos/${order.id}`,
          photo: { kind: 'order', id: order.id },
          kind: 'product',
        };
      });
  }

  /** A print that says it is printing but nobody closed: its cost never landed. */
  private async openPrints(): Promise<OpenPrint[]> {
    const { data, error } = await this.supabase
      .from('print_jobs')
      .select('id, label, started_at')
      .eq('status', 'printing')
      .order('started_at');
    if (error) throw error;
    return data ?? [];
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
        photo: { kind: 'order', id: row.order_id },
        kind: 'product',
      }));
  }

}

function openPrintTask(job: OpenPrint, today: string, pastEstimate: boolean): TodayTask {
  const startedOn = job.started_at ? localDate(job.started_at) : null;
  const days = startedOn ? daysBetween(startedOn, today) : 0;
  return {
    key: `print:${job.id}`,
    urgency: days >= STALE_PRINT_DAYS ? 'late' : 'today',
    title: `Impresión sin cerrar${job.label ? ` · ${job.label}` : ''}`,
    detail: openPrintWording(days, pastEstimate),
    route: '/produccion',
    photo: { kind: 'job', id: job.id },
    kind: 'plate',
  };
}
