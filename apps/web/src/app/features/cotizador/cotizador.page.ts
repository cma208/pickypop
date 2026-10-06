import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import type { Observable } from 'rxjs';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
// core/pricing does not re-export these yet, and rewriting rounding here would
// be exactly what docs/06-frontend.md 6.3 forbids. See the report.
import { chargesIgv, roundMoney, sumMoney } from '../../core/pricing';
import { AsyncState, Badge, Card, Empty, Field, FORMAT_PIPES, Page } from '../../ui';
import type { BatchCostBreakdown, PriceBreakdown } from '../../core/pricing';
import {
  CotizadorData,
  DataError,
  type NewQuoteLine,
  type QuoteSnapshot,
  type QuotingContext,
} from './cotizador.data';
import { Desglose } from './desglose';
import {
  calculateLine,
  emptyFilament,
  emptyLine,
  emptyPlate,
  gramsBySku,
  materialLines,
  plateFromSlicedPlate,
  suggestFilamentSku,
  VALUATION_LABELS,
  type LineDraft,
  type MaterialLineRow,
  type PlateDraft,
  type PriceSettings,
  type SupplyScope,
} from './quote-model';
import { readSlicedFile, SlicedFileError } from '../../core/sliced-file';
import { lacksRecordedCost } from './supply-costs';

/** A line already added to the quote being built. */
interface QuoteLineDraft {
  key: number;
  draft: LineDraft;
  cost: BatchCostBreakdown;
  price: PriceBreakdown;
  materials: MaterialLineRow[];
}

const PERCENT = 100;

/** El mismo tope que valida el formulario, aplicado también al calcular. */
const MAX_DISCOUNT_PERCENT = 90;
const MAX_SURCHARGE_PERCENT = 100;

function clampPercent(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), max);
}
const DEFAULT_VALIDITY_DAYS = 15;
const MS_PER_DAY = 86_400_000;

@Component({
  selector: 'app-cotizador',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    Page,
    Card,
    Badge,
    AsyncState,
    Empty,
    Field,
    Desglose,
    ...FORMAT_PIPES,
  ],
  templateUrl: './cotizador.page.html',
  styleUrl: './cotizador.page.scss',
})
export class CotizadorPage {
  private readonly data = inject(CotizadorData);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly context = signal<QuotingContext | null>(null);

  /** What the user is composing right now. */
  protected readonly plates = signal<PlateDraft[]>([]);
  protected readonly supplies = signal<LineDraft['supplies']>([]);
  protected readonly lines = signal<QuoteLineDraft[]>([]);

  protected readonly fileErrors = signal<string[]>([]);
  protected readonly dragging = signal(false);
  protected readonly reading = signal(false);
  protected readonly saving = signal(false);
  protected readonly notice = signal<string | null>(null);

  /** Set when this will be a new version of an existing quote. */
  protected readonly previousVersion = signal<{
    quoteId: string;
    number: string;
    version: number;
  } | null>(null);

  private nextKey = 1;

  // ------------------------------------------------------------- forms

  protected readonly lineForm = this.fb.nonNullable.group({
    description: ['', [Validators.required, Validators.maxLength(180)]],
    variantId: [''],
    quantity: [1, [Validators.required, Validators.min(1)]],
    setupMinutes: [0, [Validators.min(0)]],
    minutesPerUnit: [0, [Validators.min(0)]],
  });

  protected readonly priceForm = this.fb.nonNullable.group({
    printerId: [''],
    channelId: [''],
    volumeDiscountPercent: [0, [Validators.min(0), Validators.max(90)]],
    urgencySurchargePercent: [0, [Validators.min(0), Validators.max(200)]],
  });

  protected readonly quoteForm = this.fb.nonNullable.group({
    customerId: [''],
    requestId: [''],
    validityDays: [DEFAULT_VALIDITY_DAYS, [Validators.min(0), Validators.max(365)]],
    note: [''],
  });

  /** Reactive forms are not signals yet, so one tick republishes their value. */
  private readonly formTick = signal(0);

  constructor() {
    this.watch(this.lineForm.valueChanges);
    this.watch(this.priceForm.valueChanges);
    this.watch(this.quoteForm.valueChanges);

    void this.load();
  }

  /** Republishes a form's value as a signal dependency. */
  private watch(changes: Observable<unknown>): void {
    changes
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.formTick.update((tick) => tick + 1));
  }

  // ----------------------------------------------------------- loading

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const context = await this.data.context();
      this.context.set(context);
      this.priceForm.controls.printerId.setValue(context.printers[0]?.id ?? '');

      const source = this.route.snapshot.queryParamMap.get('nuevaVersionDe');
      if (source !== null) await this.loadPreviousVersion(source, context);
    } catch (cause) {
      this.error.set(
        cause instanceof DataError ? cause.message : 'No pudimos preparar el cotizador.',
      );
    } finally {
      this.loading.set(false);
    }
  }

  /** Brings a sent quote back into the calculator so it can be re-priced. */
  private async loadPreviousVersion(quoteId: string, context: QuotingContext): Promise<void> {
    const quote = await this.data.quote(quoteId);

    this.previousVersion.set({
      quoteId: quote.id,
      number: quote.number,
      version: quote.version,
    });
    this.quoteForm.patchValue({
      customerId: quote.customerId ?? '',
      requestId: quote.requestId ?? '',
      note: quote.note ?? '',
    });
    this.priceForm.patchValue({
      printerId: quote.snapshot?.printerId ?? context.printers[0]?.id ?? '',
      channelId: quote.channelId ?? '',
      volumeDiscountPercent: (quote.snapshot?.priceSettings.volumeDiscountRate ?? 0) * PERCENT,
      urgencySurchargePercent: (quote.snapshot?.priceSettings.urgencySurchargeRate ?? 0) * PERCENT,
    });

    // Rebuild every line from the inputs that were stored with it, and price
    // it again with today's parameters: that is the point of a new version.
    for (const stored of quote.storedLines) {
      this.loadLine({
        description: stored.description,
        variantId: stored.variantId,
        quantity: stored.quantity,
        setupMinutes: stored.setupMinutes,
        minutesPerUnit: stored.minutesPerUnit,
        plates: stored.plates,
        supplies: stored.supplies,
      });
      this.addLine();
    }

    this.notice.set(
      `Vas a crear la versión ${quote.version + 1} de ${quote.number}. Ajusta lo que haga falta y guarda.`,
    );
  }

  // ------------------------------------------------------- derived state

  protected readonly printer = computed(() => {
    this.formTick();
    const context = this.context();
    if (context === null) return null;
    const chosen = this.priceForm.controls.printerId.value;

    return context.printers.find((item) => item.id === chosen) ?? context.printers[0] ?? null;
  });

  protected readonly priceSettings = computed<PriceSettings>(() => {
    this.formTick();
    const { channelId, volumeDiscountPercent, urgencySurchargePercent } =
      this.priceForm.getRawValue();
    const channel = this.context()?.channels.find((item) => item.id === channelId);

    // El formulario ya valida los rangos, pero esto lee el valor **crudo**, y
    // un valor inválido no deja de calcularse: tecleando un 1010 % salía un
    // descuento de S/ 847 sobre una venta de S/ 45, con el precio pegado al
    // piso de redondeo y sin un solo aviso. Acotar aquí es lo que impide que
    // un número imposible llegue a una cotización que alguien manda.
    return {
      volumeDiscountRate: clampPercent(volumeDiscountPercent, MAX_DISCOUNT_PERCENT) / PERCENT,
      urgencySurchargeRate: clampPercent(urgencySurchargePercent, MAX_SURCHARGE_PERCENT) / PERCENT,
      channelCommissionRate: channel?.commissionRate ?? 0,
    };
  });

  /** The line being composed, forms and signals put back together. */
  protected readonly draft = computed<LineDraft>(() => {
    this.formTick();
    const { description, variantId, quantity, setupMinutes, minutesPerUnit } =
      this.lineForm.getRawValue();

    return {
      description,
      variantId: variantId === '' ? null : variantId,
      quantity,
      setupMinutes,
      minutesPerUnit,
      plates: this.plates(),
      supplies: this.supplies(),
    };
  });

  protected readonly result = computed(() => {
    const context = this.context();
    const printer = this.printer();
    if (context === null || printer === null) return null;

    const draft = this.draft();
    const variant = context.variants.find((item) => item.id === draft.variantId) ?? null;

    return calculateLine(draft, context.filaments, context.profile, printer, this.priceSettings(), variant);
  });

  protected readonly materials = computed<MaterialLineRow[]>(() => {
    const context = this.context();
    const printer = this.printer();
    if (context === null || printer === null) return [];

    return materialLines(this.draft(), context.filaments, context.profile, printer);
  });

  /** SKUs the batch would eat more of than there is on the shelf. */
  protected readonly shortStock = computed(() => {
    const context = this.context();
    if (context === null) return [];

    return [...gramsBySku(this.draft(), context.filaments)].flatMap(([id, grams]) => {
      const sku = context.filaments.find((item) => item.id === id);
      return sku !== undefined && grams > sku.availableG ? [{ sku, grams }] : [];
    });
  });

  protected readonly pricelessSkus = computed(
    () => this.context()?.filaments.filter((sku) => sku.costPerKg === null) ?? [],
  );

  protected readonly canAddLine = computed(() => {
    // Every signal is read before the first condition on purpose: `&&` would
    // short-circuit past them, and a computed that never read a signal never
    // recomputes, so the button would stay disabled for good.
    this.formTick();
    const result = this.result();
    const hasPlates = this.plates().length > 0;

    return this.lineForm.valid && hasPlates && result !== null && result.missingSkus === 0;
  });

  protected readonly totals = computed(() => {
    const context = this.context();
    const lines = this.lines();
    if (context === null || lines.length === 0) return null;

    const withTax = chargesIgv(context.profile.taxRegime);
    const igvRate = context.profile.igvRate;

    const perLine = lines.map((line) => {
      const total = roundMoney(line.price.total * line.cost.units);
      const igv = withTax ? roundMoney(total - total / (1 + igvRate)) : 0;
      const discount = roundMoney(
        Math.max(0, line.price.basePrice - line.price.adjustedPrice) * line.cost.units,
      );

      return { total, igv, subtotal: roundMoney(total - igv), discount };
    });

    return {
      total: sumMoney(perLine.map((line) => line.total)),
      igv: sumMoney(perLine.map((line) => line.igv)),
      subtotal: sumMoney(perLine.map((line) => line.subtotal)),
      discount: sumMoney(perLine.map((line) => line.discount)),
      cash: sumMoney(lines.map((line) => line.cost.cashOutOfPocket)),
      cost: sumMoney(lines.map((line) => line.cost.total)),
    };
  });

  protected readonly valuationLabel = computed(() => {
    const context = this.context();
    return context === null ? '' : VALUATION_LABELS[context.valuation];
  });

  // ------------------------------------------------------ sliced files

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  protected onDragLeave(): void {
    this.dragging.set(false);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    void this.readFiles(event.dataTransfer?.files ?? null);
  }

  protected onPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    void this.readFiles(input.files);
    input.value = '';
  }

  /** Reads dropped files in the browser; nothing is uploaded anywhere. */
  private async readFiles(files: FileList | null): Promise<void> {
    const context = this.context();
    if (files === null || files.length === 0 || context === null) return;

    this.reading.set(true);
    this.fileErrors.set([]);
    const problems: string[] = [];
    const found: PlateDraft[] = [];

    for (const file of Array.from(files)) {
      try {
        const { info, fileName } = await readSlicedFile(file);
        for (const plate of info.plates) {
          found.push(plateFromSlicedPlate(plate, fileName, context.filaments));
        }
      } catch (cause) {
        problems.push(
          cause instanceof SlicedFileError
            ? cause.message
            : `No pudimos leer «${file.name}».`,
        );
      }
    }

    this.plates.update((current) => [...current, ...found]);
    this.fileErrors.set(problems);
    this.reading.set(false);

    if (found.length > 0 && this.lineForm.controls.description.value === '') {
      this.lineForm.controls.description.setValue(found[0]?.label ?? '');
    }
  }

  // -------------------------------------------------------- composing

  protected addPlate(): void {
    this.plates.update((current) => [...current, emptyPlate(current.length + 1)]);
  }

  protected removePlate(index: number): void {
    this.plates.update((current) => current.filter((_, position) => position !== index));
  }

  protected updatePlate(index: number, patch: Partial<PlateDraft>): void {
    this.plates.update((current) =>
      current.map((plate, position) => (position === index ? { ...plate, ...patch } : plate)),
    );
  }

  protected addFilament(plateIndex: number): void {
    this.plates.update((current) =>
      current.map((plate, position) =>
        position === plateIndex
          ? {
              ...plate,
              filaments: [
                ...plate.filaments,
                emptyFilament((plate.filaments.at(-1)?.slot ?? 0) + 1),
              ],
            }
          : plate,
      ),
    );
  }

  protected removeFilament(plateIndex: number, filamentIndex: number): void {
    this.plates.update((current) =>
      current.map((plate, position) =>
        position === plateIndex
          ? { ...plate, filaments: plate.filaments.filter((_, i) => i !== filamentIndex) }
          : plate,
      ),
    );
  }

  protected updateFilament(
    plateIndex: number,
    filamentIndex: number,
    patch: Partial<LineDraft['plates'][number]['filaments'][number]>,
  ): void {
    this.plates.update((current) =>
      current.map((plate, position) =>
        position === plateIndex
          ? {
              ...plate,
              filaments: plate.filaments.map((filament, i) =>
                i === filamentIndex ? { ...filament, ...patch } : filament,
              ),
            }
          : plate,
      ),
    );
  }

  /** Puts back the SKU the colour and the Bambu profile point at. */
  protected suggestAgain(): void {
    const context = this.context();
    if (context === null) return;

    this.plates.update((current) =>
      current.map((plate) => ({
        ...plate,
        filaments: plate.filaments.map((filament) => ({
          ...filament,
          filamentSkuId: filament.filamentSkuId ?? suggestFilamentSku(filament, context.filaments),
        })),
      })),
    );
  }

  /** Flags a stock item counted at zero because it has no cost on record. */
  protected lacksCost(supply: LineDraft['supplies'][number]): boolean {
    return lacksRecordedCost(supply, this.context()?.supplies ?? []);
  }

  protected addSupply(): void {
    this.supplies.update((current) => [
      ...current,
      { label: '', inventoryItemId: null, scope: 'unit' as SupplyScope, quantity: 1, unitCost: 0 },
    ]);
  }

  protected removeSupply(index: number): void {
    this.supplies.update((current) => current.filter((_, position) => position !== index));
  }

  protected updateSupply(index: number, patch: Partial<LineDraft['supplies'][number]>): void {
    this.supplies.update((current) =>
      current.map((supply, position) => (position === index ? { ...supply, ...patch } : supply)),
    );
  }

  /** Picking a stock item fills in its name and what it last cost. */
  protected pickSupplyItem(index: number, itemId: string): void {
    const item = this.context()?.supplies.find((option) => option.id === itemId);
    if (item === undefined) {
      this.updateSupply(index, { inventoryItemId: null });
      return;
    }

    this.updateSupply(index, {
      inventoryItemId: item.id,
      label: item.name,
      unitCost: item.unitCost ?? 0,
    });
  }

  // ------------------------------------------------------ from catalog

  /**
   * The picker is an action, not a field: it goes back to its placeholder once
   * the recipe is in. A value binding would not, because Angular only writes
   * when the bound value itself changes.
   */
  protected async loadVariant(event: Event): Promise<void> {
    const select = event.target as HTMLSelectElement;
    const variantId = select.value;
    select.value = '';

    const context = this.context();
    const variant = context?.variants.find((item) => item.id === variantId);
    if (context === null || variant === undefined) return;

    this.error.set(null);
    try {
      this.loadLine(await this.data.recipeFor(variant, context.supplies));
      this.notice.set(`Cargamos la receta de «${variant.label}». Revisa los filamentos y la cantidad.`);
    } catch (cause) {
      this.fileErrors.set([
        cause instanceof DataError ? cause.message : 'No pudimos cargar la receta.',
      ]);
    }
  }

  private loadLine(line: LineDraft): void {
    this.lineForm.patchValue({
      description: line.description,
      variantId: line.variantId ?? '',
      quantity: line.quantity,
      setupMinutes: line.setupMinutes,
      minutesPerUnit: line.minutesPerUnit,
    });
    this.plates.set(line.plates);
    this.supplies.set(line.supplies);
  }

  protected clearLine(): void {
    this.loadLine(emptyLine());
    this.fileErrors.set([]);
  }

  // ------------------------------------------------------ quote lines

  protected addLine(): void {
    const result = this.result();
    if (result === null) return;

    this.lines.update((current) => [
      ...current,
      {
        key: this.nextKey++,
        draft: this.draft(),
        cost: result.cost,
        price: result.price,
        materials: this.materials(),
      },
    ]);
    this.clearLine();
    this.notice.set(null);
  }

  protected removeLine(key: number): void {
    this.lines.update((current) => current.filter((line) => line.key !== key));
  }

  protected editLine(key: number): void {
    const line = this.lines().find((item) => item.key === key);
    if (line === undefined) return;

    this.loadLine(line.draft);
    this.removeLine(key);
  }

  // ---------------------------------------------------------- saving

  protected async save(): Promise<void> {
    const context = this.context();
    const printer = this.printer();
    const totals = this.totals();
    if (context === null || printer === null || totals === null || this.saving()) return;

    this.saving.set(true);
    this.error.set(null);

    const { customerId, requestId, validityDays, note } = this.quoteForm.getRawValue();
    const { channelId } = this.priceForm.getRawValue();

    const snapshot: QuoteSnapshot = {
      profile: context.profile,
      profileId: context.profileId,
      profileValidFrom: context.profileValidFrom,
      printer: { ...printer },
      printerId: printer.id,
      valuation: context.valuation,
      priceSettings: this.priceSettings(),
      calculatedAt: new Date().toISOString(),
    };

    try {
      const saved = await this.data.saveQuote({
        workspaceId: context.workspaceId,
        customerId: customerId === '' ? null : customerId,
        channelId: channelId === '' ? null : channelId,
        requestId: requestId === '' ? null : requestId,
        validUntil:
          validityDays > 0
            ? new Date(Date.now() + validityDays * MS_PER_DAY).toISOString().slice(0, 10)
            : null,
        note: note.trim() === '' ? null : note.trim(),
        snapshot,
        subtotal: totals.subtotal,
        discount: totals.discount,
        igv: totals.igv,
        total: totals.total,
        lines: this.lines().map((line) => this.toStoredLine(line, context)),
        previousVersionOf: this.previousVersion(),
      });

      await this.router.navigate(['/cotizaciones', saved.id]);
    } catch (cause) {
      this.error.set(
        cause instanceof DataError ? cause.message : 'No pudimos guardar la cotización.',
      );
    } finally {
      this.saving.set(false);
    }
  }

  /** Freezes the names and prices used, so the quote reads the same forever. */
  private toStoredLine(line: QuoteLineDraft, context: QuotingContext): NewQuoteLine {
    const labels: Record<string, string> = {};
    const costs: Record<string, number> = {};

    for (const plate of line.draft.plates) {
      for (const filament of plate.filaments) {
        const sku = context.filaments.find((item) => item.id === filament.filamentSkuId);
        if (sku === undefined) continue;
        labels[sku.id] = sku.label;
        costs[sku.id] = sku.costPerKg ?? 0;
      }
    }

    return {
      description: line.draft.description,
      variantId: line.draft.variantId,
      quantity: line.cost.units,
      setupMinutes: line.draft.setupMinutes,
      minutesPerUnit: line.draft.minutesPerUnit,
      unitCost: line.cost.costPerUnit,
      unitPrice: line.price.total,
      plates: line.draft.plates,
      supplies: line.draft.supplies,
      filamentLabels: labels,
      filamentCostPerKg: costs,
    };
  }

  // --------------------------------------------------------- template

  protected readonly subtitle = computed(() => {
    const previous = this.previousVersion();

    return previous === null
      ? 'Arrastra un archivo laminado, parte del catálogo o arma el lote a mano'
      : `Nueva versión de ${previous.number}`;
  });

  /** Nobody types print time in seconds, so the field works in minutes. */
  protected readonly minutesOf = (seconds: number): number => Math.round(seconds / 60);

  protected readonly value = (event: Event): string =>
    (event.target as HTMLInputElement | HTMLSelectElement).value;

  protected readonly numberValue = (event: Event): number => {
    const parsed = Number((event.target as HTMLInputElement).value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  /** Minutes in, seconds out: nobody types print time in seconds. */
  protected readonly minutesToSeconds = (event: Event): number =>
    Math.round(this.numberValue(event) * 60);
}
