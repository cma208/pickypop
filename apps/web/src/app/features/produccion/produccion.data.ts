import { inject, Injectable } from '@angular/core';
import { SUPABASE } from '../../core/supabase';
import { Workshop, type PrinterSummary } from '../../core/workshop';
import { CostInputs } from '../pedidos/cost-inputs';
import { roundMoney } from '../../core/pricing';
import { CurrentWorkspace } from '../../core/workspace';
import type { FailureCause, JobStatus } from './produccion.labels';
import { outputsOf, type PartCount, type PlatePart } from './produccion.outputs';
import type { RunToQueue } from './por-lanzar';
import type { PlateUse, SpoolStatus } from './produccion.spools';
import { chargedSeconds, realCostOf } from './job-time';

const SECONDS_PER_HOUR = 3600;
const WATTS_PER_KW = 1000;
const JOB_HISTORY_LIMIT = 150;
const FINISHED_ORDER_STATUSES = ['delivered', 'closed', 'cancelled'];
const USABLE_SPOOL_STATUSES = ['sealed', 'open', 'in_use'] as const;
/** Job ids per request when reading what they produced: keeps the URL short. */
const PRODUCED_CHUNK = 50;

const JOB_FIELDS =
  'id, status, printer_id, order_line_id, recipe_plate_id, label, started_at, finished_at, estimated_time_s, actual_time_s, units_produced, failure_cause, percent_complete, material_cost, energy_cost, machine_cost, note, created_at, printers(name), recipe_plates(label, thumbnail_path, recipe_plate_outputs(inventory_item_id, units_per_run, position, inventory_items(name, image_path))), ';
const JOB_RELATIONS = 'order_lines(description, order_id, orders(number)), ';
const JOB_FILAMENTS =
  'print_job_filaments(id, spool_id, slot, estimated_g, actual_g, spools(code, filament_skus(color_name, color_hex, materials(code))))';
const JOB_COLUMNS = JOB_FIELDS + JOB_RELATIONS + JOB_FILAMENTS;
/** Same columns, but keeps only jobs that belong to an order line. */
const JOB_COLUMNS_WITH_ORDER = JOB_FIELDS + JOB_RELATIONS.replace('order_lines(', 'order_lines!inner(') + JOB_FILAMENTS;

/** Shape PostgREST returns for JOB_COLUMNS; the embedded select is too deep to infer. */
interface JobRow {
  id: string;
  status: JobStatus;
  printer_id: string;
  recipe_plate_id: string | null;
  label: string | null;
  started_at: string | null;
  finished_at: string | null;
  estimated_time_s: number | null;
  actual_time_s: number | null;
  units_produced: number;
  failure_cause: FailureCause | null;
  percent_complete: number | null;
  material_cost: number | null;
  energy_cost: number | null;
  machine_cost: number | null;
  note: string | null;
  created_at: string;
  printers: { name: string } | null;
  recipe_plates: {
    label: string | null;
    thumbnail_path: string | null;
    recipe_plate_outputs: {
      inventory_item_id: string;
      units_per_run: number;
      position: number;
      inventory_items: { name: string; image_path: string | null } | null;
    }[];
  } | null;
  order_lines: { description: string; order_id: string; orders: { number: string } | null } | null;
  print_job_filaments: {
    id: string;
    spool_id: string;
    slot: number | null;
    estimated_g: number;
    actual_g: number | null;
    spools: {
      code: string | null;
      filament_skus: { color_name: string; color_hex: string | null; materials: { code: string } | null } | null;
    } | null;
  }[];
}

export interface JobFilament {
  id: string;
  spoolId: string;
  spoolCode: string;
  /** With the code, what tells two rolls apart: «NEGRO-02» is PETG, not the second PLA. */
  materialCode: string | null;
  colorName: string;
  colorHex: string | null;
  slot: number | null;
  estimatedG: number;
  actualG: number | null;
}

export interface JobItem {
  id: string;
  status: JobStatus;
  printerId: string;
  printerName: string;
  plateId: string | null;
  plateLabel: string | null;
  plateThumbnailPath: string | null;
  /** The parts the plate puts on the shelf. More than one on a mixed plate. */
  plateOutputs: PlatePart[];
  /** What really went on the shelf, part by part. Empty until it closes well. */
  produced: PartCount[];
  label: string | null;
  orderId: string | null;
  orderNumber: string | null;
  lineDescription: string | null;
  estimatedTimeS: number | null;
  actualTimeS: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  failureCause: FailureCause | null;
  percentComplete: number | null;
  unitsProduced: number;
  realCost: number | null;
  note: string | null;
  /** When it was queued: planned jobs of one printer run in this order (the plan's `queuedAt`). */
  createdAt: string;
  filaments: JobFilament[];
}

export interface PlateFilament {
  slot: number;
  grams: number;
  skuId: string | null;
  colorHex: string | null;
}

export interface PlateOption {
  id: string;
  label: string;
  variantId: string;
  variantLabel: string;
  printTimeS: number;
  thumbnailPath: string | null;
  /** What a full run puts on the shelf. */
  outputs: PartCount[];
  filaments: PlateFilament[];
}

export interface SpoolOption {
  id: string;
  code: string;
  skuId: string;
  status: SpoolStatus;
  materialCode: string | null;
  colorName: string;
  colorHex: string | null;
  onHandG: number;
}

export interface OrderLineOption {
  id: string;
  label: string;
  variantId: string | null;
}

export interface NewJob {
  printerId: string;
  orderLineId: string | null;
  plateId: string | null;
  label: string | null;
  estimatedTimeS: number | null;
  note: string | null;
  filaments: { spoolId: string; slot: number | null; estimatedG: number }[];
}

export interface CloseJob {
  result: Extract<JobStatus, 'success' | 'failed' | 'cancelled'>;
  actualTimeS: number | null;
  usage: { spoolId: string; actualG: number }[];
  failureCause: FailureCause | null;
  percentComplete: number | null;
  /** What came out of each part of the plate; a part left out counts at full yield. */
  outputs: { inventoryItemId: string; units: number | null }[];
  note: string | null;
}

export interface StockEffect {
  spoolId: string;
  spoolCode: string;
  materialCode: string | null;
  colorName: string;
  colorHex: string | null;
  beforeG: number;
  afterG: number;
}

export interface CloseOutcome {
  effects: StockEffect[];
  /** Set when the job closed but something secondary (units, percentage) could not be saved. */
  warning: string | null;
}

/** Data access for the print queue and for closing jobs. */
@Injectable({ providedIn: 'root' })
export class ProduccionData {
  private readonly supabase = inject(SUPABASE);
  private readonly workspace = inject(CurrentWorkspace);
  private readonly workshop = inject(Workshop);
  private readonly costs = inject(CostInputs);

  async jobs(): Promise<JobItem[]> {
    const { data, error } = await this.supabase
      .from('print_jobs')
      .select(JOB_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(JOB_HISTORY_LIMIT)
      .overrideTypes<JobRow[], { merge: false }>();
    if (error) throw error;
    return this.withProduced(data.map(toJobItem));
  }

  async jobsForOrder(orderId: string): Promise<JobItem[]> {
    const { data, error } = await this.supabase
      .from('print_jobs')
      .select(JOB_COLUMNS_WITH_ORDER)
      .eq('order_lines.order_id', orderId)
      .order('created_at', { ascending: false })
      .overrideTypes<JobRow[], { merge: false }>();
    if (error) throw error;
    return this.withProduced(data.map(toJobItem));
  }

  /**
   * What each successful job put on the shelf, read from its production
   * movements: that is what the stock believes, part by part. The job only
   * keeps a total, and "13 pieces" says nothing about a plate of caps and
   * bodies.
   */
  private async withProduced(jobs: JobItem[]): Promise<JobItem[]> {
    const ids = jobs.filter((job) => job.status === 'success').map((job) => job.id);
    if (ids.length === 0) return jobs;

    const chunks: string[][] = [];
    for (let start = 0; start < ids.length; start += PRODUCED_CHUNK) chunks.push(ids.slice(start, start + PRODUCED_CHUNK));

    const results = await Promise.all(
      chunks.map((chunk) =>
        this.supabase
          .from('stock_movements')
          .select('source_id, inventory_item_id, quantity, inventory_items(name, image_path)')
          .eq('source_type', 'print_job')
          .eq('type', 'production')
          .in('source_id', chunk),
      ),
    );

    const byJob = new Map<string, PartCount[]>();
    for (const result of results) {
      if (result.error) throw result.error;
      for (const row of result.data) {
        if (!row.source_id || !row.inventory_item_id) continue;
        const list = byJob.get(row.source_id) ?? [];
        list.push({
          inventoryItemId: row.inventory_item_id,
          name: row.inventory_items?.name ?? 'Pieza',
          imagePath: row.inventory_items?.image_path ?? null,
          units: Number(row.quantity),
        });
        byJob.set(row.source_id, list);
      }
    }

    return jobs.map((job) => {
      const produced = byJob.get(job.id);
      if (!produced) return job;
      // In the order of the plate, which is the order the close form showed.
      const order = new Map(job.plateOutputs.map((part, index) => [part.inventoryItemId, index]));
      produced.sort((a, b) => (order.get(a.inventoryItemId) ?? 99) - (order.get(b.inventoryItemId) ?? 99));
      return { ...job, produced };
    });
  }

  printers(): Promise<PrinterSummary[]> {
    return this.workshop.printers();
  }

  /**
   * Made-to-order lines of orders still in progress, so a job can be tied to
   * one. Catalogue lines are left out on purpose: «Por lanzar» prints what
   * they need for every order at once (ADR-021), and a job tied to one of
   * them is the «Crear trabajo» the order page no longer offers (H33).
   */
  async openOrderLines(): Promise<OrderLineOption[]> {
    const { data, error } = await this.supabase
      .from('order_lines')
      .select('id, variant_id, description, quantity, position, orders!inner(number, status)')
      .is('variant_id', null)
      .not('orders.status', 'in', `(${FINISHED_ORDER_STATUSES.join(',')})`)
      .order('created_at', { ascending: false });
    if (error) throw error;

    return data.map((line) => ({
      id: line.id,
      variantId: line.variant_id,
      label: `${line.orders?.number ?? ''} · ${line.description} × ${line.quantity}`,
    }));
  }

  /** Plates of every active recipe, labelled with the variant they make. */
  async plates(): Promise<PlateOption[]> {
    const [plates, catalog] = await Promise.all([
      this.supabase
        .from('recipe_plates')
        .select(
          'id, label, plate_index, print_time_s, thumbnail_path, recipes!inner(variant_id, active), recipe_plate_filaments(slot, grams, filament_sku_id, color_hex), recipe_plate_outputs(inventory_item_id, units_per_run, position, inventory_items(name, image_path))',
        )
        .eq('recipes.active', true)
        .order('plate_index'),
      this.workshop.catalog(),
    ]);
    if (plates.error) throw plates.error;

    const variantNames = new Map(
      catalog.flatMap((product) =>
        product.variants.map((variant) => [variant.id, `${product.name} — ${variant.name}`] as const),
      ),
    );

    return plates.data.map((plate) => {
      const variantId = plate.recipes?.variant_id ?? '';
      return {
        id: plate.id,
        label: plate.label ?? `Placa ${plate.plate_index}`,
        variantId,
        variantLabel: variantNames.get(variantId) ?? 'Receta sin variante',
        printTimeS: plate.print_time_s,
        thumbnailPath: plate.thumbnail_path,
        outputs: [...plate.recipe_plate_outputs]
          .sort((a, b) => a.position - b.position)
          .map((out) => ({
            inventoryItemId: out.inventory_item_id,
            name: out.inventory_items?.name ?? 'Pieza',
            imagePath: out.inventory_items?.image_path ?? null,
            units: Number(out.units_per_run),
          })),
        filaments: plate.recipe_plate_filaments
          .map((filament) => ({
            slot: filament.slot,
            grams: Number(filament.grams),
            skuId: filament.filament_sku_id,
            colorHex: filament.color_hex,
          }))
          .sort((a, b) => a.slot - b.slot),
      };
    });
  }

  /** Spools that still have something to print with, and how much is left. */
  async spools(): Promise<SpoolOption[]> {
    const [spools, balances] = await Promise.all([
      this.supabase
        .from('spools')
        .select('id, code, status, filament_sku_id, filament_skus(color_name, color_hex, materials(code))')
        .in('status', [...USABLE_SPOOL_STATUSES]),
      this.supabase.from('spool_balances').select('spool_id, on_hand_g'),
    ]);
    if (spools.error) throw spools.error;
    if (balances.error) throw balances.error;

    const onHand = new Map(balances.data.map((row) => [row.spool_id, Number(row.on_hand_g)]));

    return spools.data
      .map((spool) => ({
        id: spool.id,
        code: spool.code ?? 'Sin código',
        skuId: spool.filament_sku_id,
        status: spool.status as SpoolStatus,
        materialCode: spool.filament_skus?.materials?.code ?? null,
        colorName: spool.filament_skus?.color_name ?? 'Sin color',
        colorHex: spool.filament_skus?.color_hex ?? null,
        onHandG: onHand.get(spool.id) ?? 0,
      }))
      .sort((a, b) => a.code.localeCompare(b.code, 'es'));
  }

  /** Creates the job and the rolls it will use. Undone if the rolls fail. */
  async createJob(input: NewJob): Promise<string> {
    const workspaceId = await this.workspace.requireId();

    const { data: job, error } = await this.supabase
      .from('print_jobs')
      .insert({
        workspace_id: workspaceId,
        printer_id: input.printerId,
        order_line_id: input.orderLineId,
        recipe_plate_id: input.plateId,
        label: input.label,
        estimated_time_s: input.estimatedTimeS,
        note: input.note,
      })
      .select('id')
      .single();
    if (error) throw error;

    if (input.filaments.length > 0) {
      const { error: filamentsError } = await this.supabase.from('print_job_filaments').insert(
        input.filaments.map((filament) => ({
          workspace_id: workspaceId,
          print_job_id: job.id,
          spool_id: filament.spoolId,
          slot: filament.slot,
          estimated_g: filament.estimatedG,
        })),
      );
      if (filamentsError) {
        await this.supabase.from('print_jobs').delete().eq('id', job.id);
        throw filamentsError;
      }
    }
    return job.id;
  }

  /**
   * «Poner en cola»: one planned job per run, in a single request, so a
   * failure leaves none of them instead of half the runs. They carry no
   * rolls: those are confirmed when each one starts (decision of the owner).
   */
  async queueRuns(printerId: string, runs: readonly RunToQueue[]): Promise<void> {
    if (runs.length === 0) return;
    const workspaceId = await this.workspace.requireId();
    const { error } = await this.supabase.from('print_jobs').insert(
      runs.map((run) => ({
        workspace_id: workspaceId,
        printer_id: printerId,
        order_line_id: run.orderLineId,
        recipe_plate_id: run.plateId,
        label: run.label,
        estimated_time_s: run.estimatedTimeS,
      })),
    );
    if (error) throw error;
  }

  /**
   * The picture of what each proposal puts on the bed: the plate's thumbnail
   * or its first piece's photo, or for made-to-order work the thumbnail the
   * quote kept. Keyed like the proposals (`plate:…`, `line:…`).
   */
  async proposalPictures(plateIds: readonly string[], lineIds: readonly string[]): Promise<Map<string, string>> {
    const [plates, lines] = await Promise.all([
      plateIds.length === 0
        ? Promise.resolve({ data: [], error: null })
        : this.supabase
            .from('recipe_plates')
            .select('id, thumbnail_path, recipe_plate_outputs(position, inventory_items(image_path))')
            .in('id', [...plateIds]),
      lineIds.length === 0
        ? Promise.resolve({ data: [], error: null })
        : this.supabase.from('order_lines').select('id, quote_lines(plates)').in('id', [...lineIds]),
    ]);
    if (plates.error) throw plates.error;
    if (lines.error) throw lines.error;

    const pictures = new Map<string, string>();
    for (const plate of plates.data) {
      // Like a job in the queue: the plate, else the first of its pieces with a photo.
      const piece = [...plate.recipe_plate_outputs]
        .sort((a, b) => a.position - b.position)
        .find((output) => output.inventory_items?.image_path);
      const path = plate.thumbnail_path ?? piece?.inventory_items?.image_path ?? null;
      if (path) pictures.set(`plate:${plate.id}`, path);
    }
    for (const line of lines.data) {
      const path = firstThumbnail(line.quote_lines?.plates);
      if (path) pictures.set(`line:${line.id}`, path);
    }
    return pictures;
  }

  /** The colour of each filament, for the dot next to its grams. */
  async filamentColors(skuIds: readonly string[]): Promise<Map<string, string>> {
    if (skuIds.length === 0) return new Map();
    const { data, error } = await this.supabase.from('filament_skus').select('id, color_hex').in('id', [...skuIds]);
    if (error) throw error;
    return new Map(data.filter((row) => row.color_hex).map((row) => [row.id, row.color_hex!]));
  }

  /** What one run of a recipe plate uses, slot by slot: the rolls proposed when the job starts. */
  async plateFilaments(plateId: string): Promise<PlateUse[]> {
    const { data, error } = await this.supabase
      .from('recipe_plate_filaments')
      .select('slot, grams, filament_sku_id')
      .eq('recipe_plate_id', plateId)
      .order('slot');
    if (error) throw error;
    return data.map((row) => ({ slot: row.slot, skuId: row.filament_sku_id, grams: Number(row.grams) }));
  }

  async startJob(jobId: string): Promise<void> {
    const { error } = await this.supabase
      .from('print_jobs')
      .update({ status: 'printing', started_at: new Date().toISOString() })
      .eq('id', jobId)
      .eq('status', 'planned');
    if (error) throw error;
  }

  /**
   * Starts a queued job and records the rolls it takes. The start goes first
   * because it is what usually fails (another job still on the printer), and
   * then nothing was written. If the rolls fail after it, the job goes back
   * to waiting: printing without rolls would close without discounting any
   * filament.
   */
  async startWithRolls(jobId: string, rolls: readonly NewJob['filaments'][number][]): Promise<void> {
    const workspaceId = await this.workspace.requireId();
    await this.startJob(jobId);
    if (rolls.length === 0) return;

    const { error } = await this.supabase.from('print_job_filaments').insert(
      rolls.map((roll) => ({
        workspace_id: workspaceId,
        print_job_id: jobId,
        spool_id: roll.spoolId,
        slot: roll.slot,
        estimated_g: roll.estimatedG,
      })),
    );
    if (error) {
      await this.supabase.from('print_jobs').update({ status: 'planned', started_at: null }).eq('id', jobId);
      throw error;
    }
  }

  /**
   * Closes the job through `complete_print_job`, which moves the stock in one
   * transaction, and reports what happened to each roll.
   *
   * The frozen costs are calculated here from the real grams and time, because
   * the "estimated against real" block of the order reads them from the job.
   */
  async closeJob(job: JobItem, input: CloseJob): Promise<CloseOutcome> {
    const spoolIds = input.usage.map((usage) => usage.spoolId);
    const before = await this.stockOf(spoolIds);
    // A cancelled job without a time leaves its costs empty: there is no
    // «Costo real» to show for a print that did not happen.
    const seconds = chargedSeconds(job, input.result, input.actualTimeS);
    const costs = seconds === null ? null : await this.realCosts(job, input, seconds);

    const { error } = await this.supabase.rpc('complete_print_job', {
      p_job_id: job.id,
      p_result: input.result,
      p_actual_time_s: input.actualTimeS ?? undefined,
      p_filament_usage: input.usage.map((usage) => ({
        spool_id: usage.spoolId,
        actual_g: usage.actualG,
      })),
      p_failure_cause: input.result === 'failed' ? (input.failureCause ?? undefined) : undefined,
      p_material_cost: costs?.material,
      p_energy_cost: costs?.energy,
      p_machine_cost: costs?.machine,
      // Everything the close knows goes in this one call. The units used to be
      // saved afterwards, and the function, which reads them to fill the shelf,
      // found zero and put the whole plate in: 7 caps out, 9 caps in.
      p_outputs: outputsOf(
        job.plateOutputs,
        input.result,
        new Map(input.outputs.map((output) => [output.inventoryItemId, output.units])),
      ),
      // A print cancelled halfway got somewhere too; the form asks it for that.
      p_percent_complete: input.result !== 'success' ? (input.percentComplete ?? undefined) : undefined,
      p_note: input.note ?? undefined,
    });
    if (error) throw error;

    // From here on the job is closed and the stock has moved: nothing may
    // throw, or the caller would report a failure that did not happen.
    let warning: string | null = null;

    let after: StockEffect[] = [];
    try {
      after = await this.stockOf(spoolIds);
    } catch {
      warning = (warning ?? 'La impresión se cerró.') + ' No pudimos leer el stock que quedó.';
    }

    return {
      warning,
      effects: before.map((spool) => ({
        ...spool,
        afterG: after.find((row) => row.spoolId === spool.spoolId)?.beforeG ?? spool.beforeG,
      })),
    };
  }

  /** Stock left per roll right now (`beforeG` is just "current" here). */
  async stockOf(spoolIds: string[]): Promise<StockEffect[]> {
    if (spoolIds.length === 0) return [];

    const [spools, balances] = await Promise.all([
      this.supabase
        .from('spools')
        .select('id, code, filament_skus(color_name, color_hex, materials(code))')
        .in('id', spoolIds),
      this.supabase.from('spool_balances').select('spool_id, on_hand_g').in('spool_id', spoolIds),
    ]);
    if (spools.error) throw spools.error;
    if (balances.error) throw balances.error;

    const onHand = new Map(balances.data.map((row) => [row.spool_id, Number(row.on_hand_g)]));
    return spools.data.map((spool) => ({
      spoolId: spool.id,
      spoolCode: spool.code ?? 'Sin código',
      materialCode: spool.filament_skus?.materials?.code ?? null,
      colorName: spool.filament_skus?.color_name ?? 'Sin color',
      colorHex: spool.filament_skus?.color_hex ?? null,
      beforeG: onHand.get(spool.id) ?? 0,
      afterG: onHand.get(spool.id) ?? 0,
    }));
  }

  private async realCosts(job: JobItem, input: CloseJob, seconds: number) {
    const spoolIds = input.usage.map((usage) => usage.spoolId);
    const [spools, printers, rates, profile] = await Promise.all([
      spoolIds.length === 0
        ? Promise.resolve({ data: [], error: null })
        : this.supabase.from('spools').select('id, cost_per_gram').in('id', spoolIds),
      this.costs.printers(),
      this.supabase
        .from('printer_machine_rates')
        .select('machine_rate_per_hour')
        .eq('printer_id', job.printerId)
        .maybeSingle(),
      this.costs.profile(),
    ]);
    if (spools.error) throw spools.error;
    if (rates.error) throw rates.error;

    const perGram = new Map(spools.data.map((spool) => [spool.id, Number(spool.cost_per_gram ?? 0)]));
    const grams = input.result === 'cancelled' ? [] : input.usage;
    const material = grams.reduce(
      (sum, usage) => sum + usage.actualG * (perGram.get(usage.spoolId) ?? 0),
      0,
    );

    const hours = seconds / SECONDS_PER_HOUR;
    const watts = printers.find((printer) => printer.id === job.printerId)?.profile.avgPowerWatts ?? 0;

    return {
      material: roundMoney(material),
      energy: roundMoney(hours * (watts / WATTS_PER_KW) * profile.energyRatePerKwh),
      machine: roundMoney(hours * Number(rates.data?.machine_rate_per_hour ?? 0)),
    };
  }
}

function toJobItem(row: JobRow): JobItem {
  return {
    id: row.id,
    status: row.status,
    printerId: row.printer_id,
    printerName: row.printers?.name ?? 'Impresora',
    plateId: row.recipe_plate_id,
    plateLabel: row.recipe_plates?.label ?? null,
    plateThumbnailPath: row.recipe_plates?.thumbnail_path ?? null,
    plateOutputs: [...(row.recipe_plates?.recipe_plate_outputs ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((out) => ({
        inventoryItemId: out.inventory_item_id,
        name: out.inventory_items?.name ?? 'Pieza',
        imagePath: out.inventory_items?.image_path ?? null,
        unitsPerRun: Number(out.units_per_run),
      })),
    produced: [],
    label: row.label,
    orderId: row.order_lines?.order_id ?? null,
    orderNumber: row.order_lines?.orders?.number ?? null,
    lineDescription: row.order_lines?.description ?? null,
    estimatedTimeS: row.estimated_time_s,
    actualTimeS: row.actual_time_s,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    failureCause: row.failure_cause,
    percentComplete: row.percent_complete == null ? null : Number(row.percent_complete),
    unitsProduced: Number(row.units_produced),
    realCost: realCostOf({
      status: row.status,
      actualTimeS: row.actual_time_s,
      materialCost: row.material_cost,
      energyCost: row.energy_cost,
      machineCost: row.machine_cost,
    }),
    note: row.note,
    createdAt: row.created_at,
    filaments: row.print_job_filaments
      .map((filament) => ({
        id: filament.id,
        spoolId: filament.spool_id,
        spoolCode: filament.spools?.code ?? 'Sin código',
        materialCode: filament.spools?.filament_skus?.materials?.code ?? null,
        colorName: filament.spools?.filament_skus?.color_name ?? 'Sin color',
        colorHex: filament.spools?.filament_skus?.color_hex ?? null,
        slot: filament.slot,
        estimatedG: Number(filament.estimated_g),
        actualG: filament.actual_g == null ? null : Number(filament.actual_g),
      }))
      .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0)),
  };
}

/**
 * The first plate of a quote line that kept its thumbnail. Where the
 * decision of the sweep puts it (`plates[].thumbnailPath`); a quote that did
 * not keep one leaves the plate icon, which is still better than a blank.
 */
function firstThumbnail(plates: unknown): string | null {
  if (!Array.isArray(plates)) return null;
  for (const plate of plates) {
    const path = (plate as { thumbnailPath?: unknown } | null)?.thumbnailPath;
    if (typeof path === 'string' && path) return path;
  }
  return null;
}
