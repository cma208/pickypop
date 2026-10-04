import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  FormControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
  type AbstractControl,
  type ValidationErrors,
} from '@angular/forms';
import { map } from 'rxjs';
import { Card, Field, FORMAT_PIPES } from '../../ui';
import { blankToNull, invalidMessage } from './form-helpers';
import {
  InventarioData,
  PartialPurchaseError,
  type InventoryItemSummary,
  type PurchaseDraft,
  type PurchaseDraftLine,
  type SkuSummary,
  type SupplierOption,
} from './inventario.data';
import { describeError } from './inventario.errors';
import { INVENTORY_STYLES } from './inventario.styles';
import { todayIso } from './inventario.format';
import { planPurchase, type AllocationMethod, type PlanLineInput } from '../../core/pricing';
import { PurchasePreview, type PreviewRow } from './purchase-preview';
import { QuickAdd } from './quick-add';

interface Target {
  kind: 'sku' | 'item';
  id: string;
}

interface PartialState {
  purchaseId: string | null;
  spoolIds: string[];
  created: string[];
  failedStep: string;
}

const SKU_PREFIX = 'sku:';
const ITEM_PREFIX = 'item:';

function parseTarget(value: string): Target | null {
  if (value.startsWith(SKU_PREFIX)) return { kind: 'sku', id: value.slice(SKU_PREFIX.length) };
  if (value.startsWith(ITEM_PREFIX)) return { kind: 'item', id: value.slice(ITEM_PREFIX.length) };
  return null;
}

/** Spools are bought whole: you cannot buy 1.5 rolls. */
function wholeRolls(line: AbstractControl): ValidationErrors | null {
  const target = line.get('target')?.value as string;
  const quantity = line.get('quantity')?.value as number | null;
  const isRoll = target?.startsWith(SKU_PREFIX);
  return isRoll && quantity != null && !Number.isInteger(quantity) ? { wholeRolls: true } : null;
}

function notInTheFuture(control: AbstractControl): ValidationErrors | null {
  return typeof control.value === 'string' && control.value > todayIso() ? { future: true } : null;
}

/**
 * The purchase form. It shows the final cost of every spool, shipping already
 * spread, while the person types, and asks for a last confirmation before it
 * writes anything.
 */
@Component({
  selector: 'app-compra-form',
  imports: [ReactiveFormsModule, Card, Field, QuickAdd, PurchasePreview, FORMAT_PIPES],
  template: `
    <form [formGroup]="form" (ngSubmit)="askConfirmation()" novalidate class="stack">
      <pp-card heading="Datos de la compra">
        <div class="form-grid">
          <div>
            <pp-field label="Proveedor">
              <select formControlName="supplierId">
                <option value="">Sin proveedor</option>
                @for (supplier of suppliers(); track supplier.id) {
                  <option [value]="supplier.id">{{ supplier.name }}</option>
                }
              </select>
            </pp-field>
            <app-quick-add label="Nuevo proveedor" placeholder="Nombre del proveedor" [create]="createSupplier" />
          </div>
          <pp-field label="Fecha" [required]="true" [error]="msg(form.controls.purchasedAt)">
            <input type="date" formControlName="purchasedAt" [max]="today" />
          </pp-field>
          <pp-field label="Referencia del documento" hint="Factura, boleta o guía">
            <input formControlName="documentRef" autocomplete="off" />
          </pp-field>
        </div>
      </pp-card>

      <pp-card heading="Qué compraste">
        @for (line of lines.controls; track line; let i = $index) {
          <div class="line" [formGroup]="line">
            <pp-field label="Producto" [required]="true" [error]="msg(line.controls.target)">
              <select formControlName="target">
                <option value="" disabled>Elige un filamento o insumo</option>
                @if (skus().length > 0) {
                  <optgroup label="Filamentos">
                    @for (sku of skus(); track sku.id) {
                      <option [value]="skuPrefix + sku.id">{{ skuName(sku) }}</option>
                    }
                  </optgroup>
                }
                @if (items().length > 0) {
                  <optgroup label="Insumos y repuestos">
                    @for (item of items(); track item.id) {
                      <option [value]="itemPrefix + item.id">{{ item.name }} ({{ item.unit }})</option>
                    }
                  </optgroup>
                }
              </select>
            </pp-field>
            <div class="numbers">
              <pp-field
                [label]="unitLabel(i)"
                [required]="true"
                [error]="line.hasError('wholeRolls') ? 'Los rollos se compran enteros.' : msg(line.controls.quantity)"
              >
                <input type="number" step="any" formControlName="quantity" inputmode="decimal" />
              </pp-field>
              <pp-field label="Precio unitario (S/)" [required]="true" [error]="msg(line.controls.unitPrice)">
                <input type="number" step="0.01" formControlName="unitPrice" inputmode="decimal" />
              </pp-field>
              @if (isPerishable(i)) {
                <pp-field label="Vence el">
                  <input type="date" formControlName="expiresOn" />
                </pp-field>
              }
              <div class="subtotal">
                <span class="muted">Subtotal</span>
                <strong>{{ plan().lines[i].subtotal | money }}</strong>
              </div>
              <button type="button" class="ghost danger-text" (click)="removeLine(i)" [disabled]="lines.length === 1">
                Quitar
              </button>
            </div>
          </div>
        }
        <button type="button" class="secondary" (click)="addLine()">+ Agregar otro producto</button>
      </pp-card>

      <pp-card heading="Envío y otros costos">
        <div class="form-grid">
          <pp-field label="Costo de envío (S/)" [required]="true" [error]="msg(form.controls.shippingCost)">
            <input type="number" step="0.01" formControlName="shippingCost" inputmode="decimal" />
          </pp-field>
          <pp-field label="Otros costos (S/)" hint="Comisiones, impuestos, empaque…" [error]="msg(form.controls.otherCosts)">
            <input type="number" step="0.01" formControlName="otherCosts" inputmode="decimal" />
          </pp-field>
          <pp-field label="Cómo repartirlos entre los rollos">
            <select formControlName="allocation">
              <option value="by_amount">Por monto (más caro, más envío)</option>
              <option value="by_weight">Por peso (más gramos, más envío)</option>
            </select>
          </pp-field>
        </div>
        <pp-field label="Nota">
          <textarea formControlName="note" rows="2"></textarea>
        </pp-field>
      </pp-card>

      <pp-card heading="Costo final antes de confirmar">
        <app-purchase-preview [rows]="previewRows()" [plan]="plan()" />
      </pp-card>

      @if (partial(); as problem) {
        <div class="alert" role="alert">
          @if (problem.purchaseId) {
            <p>
              <strong>La compra quedó a medias.</strong>
              Se creó: {{ problem.created.join(', ') }}. Falló al guardar {{ problem.failedStep }}.
            </p>
            <p>
              El stock puede estar incompleto. Puedes deshacer lo que se creó y volver a intentar, o revisarlo en
              Rollos y Movimientos antes de decidir.
            </p>
            <div class="row">
              <button type="button" class="danger" [disabled]="busy()" (click)="undo(problem)">
                Deshacer lo creado
              </button>
              <button type="button" class="secondary" (click)="partial.set(null)">Lo reviso yo</button>
            </div>
          } @else {
            <p><strong>No se guardó nada.</strong> {{ failureText() }}</p>
          }
        </div>
      }
      @if (error(); as message) {
        <p class="alert" role="alert">{{ message }}</p>
      }

      @if (confirming()) {
        <div #confirmBox class="confirm" role="alertdialog" aria-label="Confirmar compra">
          <p>
            Vas a registrar una compra de <strong>{{ plan().total | money }}</strong>.
            Se crearán <strong>{{ rollCount() }}</strong> {{ rollCount() === 1 ? 'rollo' : 'rollos' }}
            con sus movimientos de entrada{{ itemsText() }}.
            Después no se puede editar.
          </p>
          <div class="form-actions">
            <button type="button" class="secondary" [disabled]="busy()" (click)="confirming.set(false)">Volver</button>
            <button type="button" [disabled]="busy()" (click)="save()">
              {{ busy() ? 'Guardando…' : 'Confirmar y guardar' }}
            </button>
          </div>
        </div>
      } @else {
        <div class="form-actions">
          <button type="button" class="secondary" (click)="cancelled.emit()">Cancelar</button>
          <button type="submit">Revisar y guardar</button>
        </div>
      }
    </form>
  `,
  styles: [
    INVENTORY_STYLES,
    `
      .line { padding: 0.75rem 0 0.25rem; border-bottom: 1px solid var(--line); margin-bottom: 0.75rem; }
      .numbers { display: grid; grid-template-columns: repeat(auto-fit, minmax(8.5rem, 1fr)); gap: 0 0.75rem; align-items: start; }
      .subtotal { display: grid; gap: 0.2rem; margin-bottom: 0.9rem; font-size: 0.9rem; }
      .danger-text { color: var(--danger); justify-self: start; align-self: end; margin-bottom: 0.9rem; }
      textarea { resize: vertical; }
      .confirm { padding: 1rem; border: 2px solid var(--accent); border-radius: 12px; background: var(--accent-soft); }
      .confirm p { margin: 0; }
      .alert p { margin: 0 0 0.5rem; }
    `,
  ],
})
export class CompraForm {
  private readonly data = inject(InventarioData);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly injector = inject(Injector);
  private readonly confirmBox = viewChild<ElementRef<HTMLElement>>('confirmBox');

  readonly skuOptions = input.required<SkuSummary[]>();
  readonly itemOptions = input.required<InventoryItemSummary[]>();
  readonly supplierOptions = input.required<SupplierOption[]>();
  readonly saved = output<number>();
  readonly cancelled = output<void>();

  protected readonly skuPrefix = SKU_PREFIX;
  protected readonly itemPrefix = ITEM_PREFIX;
  protected readonly today = todayIso();
  protected readonly msg = invalidMessage;

  protected readonly skus = computed(() => this.skuOptions().filter((sku) => sku.active));
  protected readonly items = computed(() => this.itemOptions().filter((item) => item.active));
  private readonly addedSuppliers = signal<SupplierOption[]>([]);
  protected readonly suppliers = computed(() => [...this.supplierOptions(), ...this.addedSuppliers()]);

  protected readonly form = this.fb.group({
    supplierId: [''],
    purchasedAt: [todayIso(), [Validators.required, notInTheFuture]],
    documentRef: [''],
    shippingCost: new FormControl<number | null>(0, [Validators.required, Validators.min(0)]),
    otherCosts: new FormControl<number | null>(0, Validators.min(0)),
    allocation: ['by_amount' as AllocationMethod],
    note: [''],
    lines: this.fb.array([this.newLine()]),
  });

  protected get lines() {
    return this.form.controls.lines;
  }

  private readonly raw = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });

  private readonly skuById = computed(() => new Map(this.skus().map((sku) => [sku.id, sku])));
  private readonly itemById = computed(() => new Map(this.items().map((item) => [item.id, item])));

  /** One entry per form line, in order, so indexes match the plan. */
  private readonly resolved = computed(() =>
    this.raw().lines.map((line) => {
      const target = parseTarget(line.target);
      const sku = target?.kind === 'sku' ? this.skuById().get(target.id) : undefined;
      const item = target?.kind === 'item' ? this.itemById().get(target.id) : undefined;
      return { line, target, sku, item };
    }),
  );

  protected readonly plan = computed(() => {
    const inputs = this.resolved().map(({ line, target, sku }): PlanLineInput => ({
      kind: target?.kind ?? 'sku',
      quantity: Number(line.quantity) || 0,
      unitPrice: Number(line.unitPrice) || 0,
      unitWeightG: sku?.netWeightG ?? null,
    }));
    const { shippingCost, otherCosts, allocation } = this.raw();
    return planPurchase(inputs, Number(shippingCost) || 0, Number(otherCosts) || 0, allocation);
  });

  protected readonly previewRows = computed(() =>
    this.resolved().flatMap(({ line, sku, item }, index): PreviewRow[] => {
      if (!sku && !item) return [];
      return [
        {
          label: sku ? this.skuName(sku) : (item?.name ?? ''),
          kind: sku ? 'sku' : 'item',
          quantity: Number(line.quantity) || 0,
          unit: sku ? (Number(line.quantity) === 1 ? 'rollo' : 'rollos') : (item?.unit ?? ''),
          unitPrice: Number(line.unitPrice) || 0,
          netWeightG: sku?.netWeightG ?? null,
          line: this.plan().lines[index],
        },
      ];
    }),
  );

  protected readonly rollCount = computed(() =>
    this.plan().lines.reduce((sum, line) => sum + line.unitCosts.length, 0),
  );
  protected readonly itemLineCount = computed(
    () => this.resolved().filter(({ target }) => target?.kind === 'item').length,
  );

  protected readonly itemsText = computed(() => {
    const count = this.itemLineCount();
    return count > 0 ? `, más la entrada de ${count} ${count === 1 ? 'insumo' : 'insumos'}` : '';
  });

  protected readonly confirming = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly partial = signal<PartialState | null>(null);
  protected readonly failureText = signal('Inténtalo de nuevo en un momento.');

  protected readonly createSupplier = async (name: string): Promise<void> => {
    const supplier = await this.data.createSupplier(name);
    this.addedSuppliers.update((list) => [...list, supplier]);
    this.form.controls.supplierId.setValue(supplier.id);
  };

  protected skuName(sku: SkuSummary): string {
    return [sku.colorName, sku.materialCode, sku.finish, sku.brandName].filter(Boolean).join(' · ');
  }

  protected unitLabel(index: number): string {
    const target = this.resolved()[index]?.target;
    return target?.kind === 'item' ? 'Cantidad' : 'Rollos';
  }

  protected isPerishable(index: number): boolean {
    return this.resolved()[index]?.item?.perishable ?? false;
  }

  protected addLine(): void {
    this.lines.push(this.newLine());
  }

  protected removeLine(index: number): void {
    if (this.lines.length > 1) this.lines.removeAt(index);
  }

  protected askConfirmation(): void {
    this.form.markAllAsTouched();
    this.error.set(null);
    this.partial.set(null);
    if (this.form.invalid) {
      this.error.set('Revisa los campos marcados antes de guardar.');
      return;
    }
    this.confirming.set(true);
    afterNextRender(() => this.confirmBox()?.nativeElement.scrollIntoView({ block: 'center', behavior: 'smooth' }), {
      injector: this.injector,
    });
  }

  protected async save(): Promise<void> {
    if (this.busy()) return;

    this.busy.set(true);
    this.error.set(null);
    try {
      await this.data.registerPurchase(this.toDraft());
      this.saved.emit(this.rollCount());
    } catch (error) {
      this.confirming.set(false);
      this.reportFailure(error);
    } finally {
      this.busy.set(false);
    }
  }

  protected async undo(problem: PartialState): Promise<void> {
    if (!problem.purchaseId || this.busy()) return;

    this.busy.set(true);
    try {
      await this.data.undoPurchase(problem.purchaseId, problem.spoolIds);
      this.partial.set(null);
      this.error.set('Se deshizo lo que se había creado. Puedes volver a intentar el guardado.');
    } catch (error) {
      this.error.set(
        describeError(error, 'No pudimos deshacer lo creado. Revísalo en Rollos y Movimientos antes de reintentar.'),
      );
    } finally {
      this.busy.set(false);
    }
  }

  private reportFailure(error: unknown): void {
    if (error instanceof PartialPurchaseError) {
      console.error(error.cause);
      this.failureText.set(describeError(error.cause, 'Inténtalo de nuevo en un momento.'));
      this.partial.set({
        purchaseId: error.purchaseId,
        spoolIds: error.spoolIds,
        created: error.created,
        failedStep: error.failedStep,
      });
      return;
    }

    this.partial.set({ purchaseId: null, spoolIds: [], created: [], failedStep: '' });
    this.failureText.set(describeError(error, 'Inténtalo de nuevo en un momento.'));
  }

  private toDraft(): PurchaseDraft {
    const raw = this.form.getRawValue();
    const lines = this.resolved().map(({ line, target, sku }): PurchaseDraftLine => ({
      kind: target?.kind ?? 'sku',
      targetId: target?.id ?? '',
      quantity: Number(line.quantity),
      unitPrice: Number(line.unitPrice),
      expiresOn: target?.kind === 'item' ? blankToNull(line.expiresOn) : null,
      netWeightG: sku?.netWeightG ?? null,
      colorName: sku?.colorName ?? null,
    }));

    return {
      supplierId: blankToNull(raw.supplierId),
      purchasedAt: raw.purchasedAt,
      documentRef: blankToNull(raw.documentRef),
      shippingCost: Number(raw.shippingCost) || 0,
      otherCosts: Number(raw.otherCosts) || 0,
      note: blankToNull(raw.note),
      lines,
      plan: this.plan(),
    };
  }

  private newLine() {
    return this.fb.group(
      {
        target: ['', Validators.required],
        quantity: new FormControl<number | null>(1, [Validators.required, Validators.min(0.001)]),
        unitPrice: new FormControl<number | null>(null, [Validators.required, Validators.min(0)]),
        expiresOn: [''],
      },
      { validators: wholeRolls },
    );
  }
}
