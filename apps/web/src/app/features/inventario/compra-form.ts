import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  FormControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { map } from 'rxjs';
import { Card, Field, FORMAT_PIPES, ItemPicker, type PickerOption } from '../../ui';
import { maxDecimals, notInFuture } from '../../core/form-errors';
import { blankToNull, invalidMessage } from './form-helpers';
import {
  InventarioData,
  type InventoryItemSummary,
  type PaymentAccount,
  type PurchaseDraft,
  type PurchaseDraftLine,
  type SkuSummary,
  type SupplierOption,
} from './inventario.data';
import { describeError, noAnswerReason, outcomeUnknown } from './inventario.errors';
import { INVENTORY_STYLES } from './inventario.styles';
import { ITEM_KIND_LABELS, todayIso } from './inventario.format';
import { linkPriceAndTotal } from './compra-line';
import { borrowedPhoto } from '../../core/article-photos';
import { planPurchase, PURCHASE_LIMITS, type AllocationMethod, type PlanLineInput } from '../../core/pricing';
import type { SpoolIdentity } from '../../core/spool-label';
import { PurchasePreview, type PreviewRow } from './purchase-preview';
import { QuickAdd } from './quick-add';
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS, type PaymentMethod } from '../finanzas/finanzas.models';
import { PaymentCategoryNote } from '../finanzas/payment-category-note';
import { beforeOpeningNotice, dayBeforeOpening } from '../finanzas/opening-balance';
import { purchaseEntries } from './purchase-entries';
import { purchaseLineProblems, purchaseTotalProblem, type PurchaseLineProblems } from './purchase-line-rules';
import { notBefore, purchaseDateFloor } from './purchase-dates';
import { noAccountsText } from './accounts-hint';
import { CurrentWorkspace } from '../../core/workspace';

interface Target {
  kind: 'sku' | 'item';
  id: string;
}

/** What the form says once the purchase is in. */
export interface SavedPurchase {
  rolls: number;
  /** The rolls that came in, with their label: «PETG-NEGRO-01 · PETG Negro». */
  spools: SpoolIdentity[];
  /** What was paid for it on the spot. Zero when it is still to be paid. */
  paid: number;
}

const MADE_HERE: ReadonlySet<string> = new Set(['part', 'finished_good']);
const SKU_PREFIX = 'sku:';
/** The "todavía no" answer to how it was paid. Never a uuid, so it cannot clash with an account. */
const NOT_PAID = 'not-paid';
/** What an item is counted in unless somebody says otherwise: the one unit the app writes itself. */
const DEFAULT_UNIT = 'unidad';
const FRACTIONS_OF_A_CENT_HINT = 'Aquí caben fracciones de centavo: hasta 6 decimales, como 0.015.';
const ITEM_PREFIX = 'item:';
/** Money paid is counted in cents. */
const CENTS = 2;
/** Shipping and other costs are money paid: cents, and a cap past which it is a typo. */
const EXTRA_COST_RULES = [Validators.min(0), Validators.max(PURCHASE_LIMITS.extraCost), maxDecimals(CENTS)];

function parseTarget(value: string): Target | null {
  if (value.startsWith(SKU_PREFIX)) return { kind: 'sku', id: value.slice(SKU_PREFIX.length) };
  if (value.startsWith(ITEM_PREFIX)) return { kind: 'item', id: value.slice(ITEM_PREFIX.length) };
  return null;
}

function numberOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * The purchase form. It shows the final cost of every spool, shipping already
 * spread, while the person types, and asks for a last confirmation before it
 * writes anything.
 */
@Component({
  selector: 'app-compra-form',
  imports: [ReactiveFormsModule, Card, Field, ItemPicker, QuickAdd, PurchasePreview, PaymentCategoryNote, FORMAT_PIPES],
  template: `
    <form [formGroup]="form" (ngSubmit)="askConfirmation()" novalidate class="stack">
      <!-- Locked while it is on its way and while nobody knows whether it went in: see locked. -->
      <fieldset class="contents" [disabled]="locked()">
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
            <input type="date" formControlName="purchasedAt" [min]="oldestDay" [max]="today" />
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
              <pp-item-picker
                placeholder="Elige un filamento o insumo"
                [options]="pickerOptions()"
                [value]="line.controls.target.value"
                (chosen)="line.controls.target.setValue($event); line.controls.target.markAsTouched()"
              />
            </pp-field>
            <div class="numbers">
              <pp-field [label]="quantityLabel(i)" [required]="true" [error]="quantityError(i)">
                <input type="number" step="any" formControlName="quantity" inputmode="decimal" />
              </pp-field>
              <pp-field [label]="priceLabel(i)" [required]="true" [hint]="priceHint(i)" [error]="priceError(i)">
                <input type="number" step="any" formControlName="unitPrice" inputmode="decimal" />
              </pp-field>
              @if (canTypeTotal(i)) {
                <pp-field
                  label="o el total que pagaste por esta línea (S/)"
                  hint="Si el comprobante solo dice el total, escríbelo y calculamos el precio."
                  [error]="msg(line.controls.lineTotal)"
                >
                  <input type="number" step="0.01" min="0" formControlName="lineTotal" inputmode="decimal" />
                </pp-field>
              }
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

      <pp-card heading="¿Cómo pagaste?">
        <div class="form-grid">
          <pp-field label="Desde qué cuenta" [required]="true" [error]="paymentError()">
            <select formControlName="paidFrom">
              <option value="" disabled>Elige una cuenta…</option>
              @for (account of accountOptions(); track account.id) {
                <option [value]="account.id">{{ account.name }}</option>
              }
              <option [value]="notPaid">Todavía no la pagué</option>
            </select>
            @if (accountOptions().length === 0) {
              <p class="muted no-accounts">{{ noAccounts() }} Mientras tanto, elige «Todavía no la pagué».</p>
            }
          </pp-field>
          @if (chosenAccount(); as account) {
            <pp-field label="Medio de pago" [hint]="account.defaultMethod ? undefined : account.name + ' no tiene un medio por defecto: elígelo aquí.'">
              <select formControlName="method">
                <option value="">{{ account.defaultMethod ? 'El de la cuenta (' + methodLabel[account.defaultMethod] + ')' : 'Elige el medio…' }}</option>
                @for (method of methods; track method) {
                  <option [value]="method">{{ methodLabel[method] }}</option>
                }
              </select>
            </pp-field>
          }
        </div>
        @if (raw().paidFrom === notPaid) {
          <p class="muted">Queda «por pagar» en Compras, y desde ahí registras el pago cuando lo hagas.</p>
        } @else if (chosenAccount()) {
          <app-payment-category-note kind="purchase" />
          @if (openingNotice(); as text) {
            <p class="alert-warn">{{ text }}</p>
          }
        }
      </pp-card>
      </fieldset>

      <pp-card heading="Costo final antes de confirmar">
        <app-purchase-preview [rows]="previewRows()" [plan]="plan()" />
        @if (totalProblem(); as text) {
          <p class="alert" role="alert">{{ text }}</p>
        }
      </pp-card>

      @if (failure(); as message) {
        <p class="alert" role="alert"><strong>No se guardó nada.</strong> {{ message }}</p>
      }
      @if (error(); as message) {
        <p class="alert" role="alert">{{ message }}</p>
      }

      @if (confirming()) {
        <div #confirmBox class="confirm" role="alertdialog" aria-label="Confirmar compra">
          <p>
            Vas a registrar una compra de <strong>{{ plan().total | money }}</strong>.
            {{ entriesText() }} {{ paymentText() }}
            Después no se puede editar.
          </p>
          @if (uncertain(); as reason) {
            <div class="alert" role="alert">
              <p><strong>No sabemos si la compra se guardó.</strong> {{ reason }}</p>
              <p>
                Vuelve a pulsar «Confirmar y guardar»: si ya había entrado, no se registra dos veces. Mientras tanto
                la compra no se puede cambiar, porque cambiada sería otra.
              </p>
            </div>
          }
          <div class="form-actions">
            @if (uncertain()) {
              <button type="button" class="secondary" [disabled]="busy()" (click)="cancelled.emit()">
                Salir y revisar la lista
              </button>
            } @else {
              <button type="button" class="secondary" [disabled]="busy()" (click)="confirming.set(false)">Volver</button>
            }
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
      /* Only there to lock what it holds: the cards keep the form's spacing. */
      fieldset.contents { display: contents; }
      .no-accounts { margin: 0.4rem 0 0; font-size: var(--fs-sm); }
      .confirm { padding: 1rem; border: 2px solid var(--accent); border-radius: var(--radius); background: var(--accent-soft); }
      .confirm p { margin: 0; }
      .alert p { margin: 0 0 0.5rem; }
    `,
  ],
})
export class CompraForm {
  private readonly data = inject(InventarioData);
  private readonly workspace = inject(CurrentWorkspace);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly confirmBox = viewChild<ElementRef<HTMLElement>>('confirmBox');

  readonly skuOptions = input.required<SkuSummary[]>();
  readonly itemOptions = input.required<InventoryItemSummary[]>();
  readonly supplierOptions = input.required<SupplierOption[]>();
  readonly accountOptions = input.required<PaymentAccount[]>();
  /** Only the owner creates accounts: the operator is told whom to ask. */
  /** Only to word what the operator cannot do (create an account); the database decides. */
  protected readonly isOwner = this.workspace.isOwner;
  readonly saved = output<SavedPurchase>();
  readonly cancelled = output<void>();
  /** The database refused it: what the form was built from may be old (a filament switched off, an account closed). */
  readonly refused = output<void>();

  protected readonly skuPrefix = SKU_PREFIX;
  protected readonly itemPrefix = ITEM_PREFIX;
  protected readonly today = todayIso();
  protected readonly oldestDay = purchaseDateFloor(this.today);
  protected readonly msg = invalidMessage;
  protected readonly notPaid = NOT_PAID;
  protected readonly methods = PAYMENT_METHODS;
  protected readonly methodLabel = PAYMENT_METHOD_LABELS;

  protected readonly skus = computed(() => this.skuOptions().filter((sku) => sku.active));
  protected readonly items = computed(() => this.itemOptions().filter((item) => item.active));

  /**
   * Todo lo que se puede comprar, en una sola lista buscable. Un filamento
   * lleva su color y un insumo su foto, que es como se reconocen de verdad: la
   * lista va a crecer mucho más que la paciencia de quien la recorre.
   */
  protected readonly pickerOptions = computed<PickerOption[]>(() => [
    ...this.skus().map((sku) => ({
      value: SKU_PREFIX + sku.id,
      label: this.skuName(sku),
      hint: 'Filamento',
      color: sku.colorHex,
      group: 'Filamentos',
    })),
    // A printed part and an assembled product are made here, never bought
    // (ADR-016, ADR-018): offering them would value the shelf at a price paid.
    ...this.items().filter((item) => !MADE_HERE.has(item.kind)).map((item) => ({
      value: ITEM_PREFIX + item.id,
      label: item.name,
      hint: item.unit,
      imagePath: item.imagePath,
      photo: borrowedPhoto(item.id, item.kind),
      group: ITEM_KIND_LABELS[item.kind],
    })),
  ]);
  private readonly addedSuppliers = signal<SupplierOption[]>([]);
  protected readonly suppliers = computed(() => [...this.supplierOptions(), ...this.addedSuppliers()]);

  protected readonly form = this.fb.group({
    supplierId: [''],
    purchasedAt: [todayIso(), [Validators.required, notInFuture, notBefore(purchaseDateFloor(todayIso()))]],
    documentRef: [''],
    shippingCost: new FormControl<number | null>(0, [Validators.required, ...EXTRA_COST_RULES]),
    otherCosts: new FormControl<number | null>(0, EXTRA_COST_RULES),
    allocation: ['by_amount' as AllocationMethod],
    note: [''],
    paidFrom: ['', Validators.required],
    method: ['' as PaymentMethod | ''],
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

  /** What is wrong with each line, from the domain's limits. Shown next to the field once it is touched. */
  protected readonly lineProblems = computed<PurchaseLineProblems[]>(() =>
    this.resolved().map(({ line, target, item }) =>
      purchaseLineProblems({
        kind: target?.kind ?? null,
        quantity: numberOrNull(line.quantity),
        unitPrice: numberOrNull(line.unitPrice),
        unit: item?.unit ?? null,
      }),
    ),
  );

  protected readonly totalProblem = computed(() => purchaseTotalProblem(this.plan().total));

  protected readonly previewRows = computed(() =>
    this.resolved().flatMap(({ line, sku, item }, index): PreviewRow[] => {
      if (!sku && !item) return [];
      return [
        {
          label: sku ? this.skuName(sku) : (item?.name ?? ''),
          kind: sku ? 'sku' : 'item',
          imagePath: item?.imagePath ?? null,
          articleKind: sku ? 'spool' : (item?.kind ?? 'supply'),
          colorHex: sku?.colorHex ?? null,
          unit: sku ? 'rollo' : (item?.unit ?? ''),
          netWeightG: sku?.netWeightG ?? null,
          line: this.plan().lines[index],
        },
      ];
    }),
  );

  protected readonly rollCount = computed(() =>
    this.plan().lines.reduce((sum, line) => sum + line.unitCosts.length, 0),
  );
  /** Rolls and articles that come in, each article under its own kind. */
  protected readonly entriesText = computed(() =>
    purchaseEntries(
      this.rollCount(),
      this.resolved().flatMap(({ item }) => (item ? [item.kind] : [])),
    ),
  );

  protected readonly noAccounts = computed(() => noAccountsText(this.isOwner()));

  protected readonly chosenAccount = computed(() =>
    this.accountOptions().find((account) => account.id === this.raw().paidFrom),
  );

  /** Paid on the purchase's own day: before the account opened, that money is already inside its opening balance (E5-02). */
  protected readonly openingNotice = computed(() => {
    const account = this.chosenAccount();
    const day = this.raw().purchasedAt;
    return account && day && dayBeforeOpening(day, account.openingBalanceOn)
      ? beforeOpeningNotice(account, 'el pago cuenta para la compra')
      : null;
  });

  protected readonly paymentText = computed(() => {
    const account = this.chosenAccount();
    return account ? `El pago sale de ${account.name}.` : 'Queda por pagar.';
  });

  /** An account with no default method needs one chosen, or the payment would be refused. */
  protected readonly methodMissing = computed(() => {
    const account = this.chosenAccount();
    return account !== undefined && account.defaultMethod === null && this.raw().method === '';
  });

  protected paymentError(): string | null {
    const control = this.form.controls.paidFrom;
    return control.touched && control.invalid ? 'Elige desde qué cuenta la pagaste, o «Todavía no la pagué».' : null;
  }

  protected readonly confirming = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Why the database refused the purchase. Nothing of it was written: it is one transaction. */
  protected readonly failure = signal<string | null>(null);
  /**
   * Why there is no answer, when the request may have gone in anyway (the
   * connection dropped after the database committed). Until a retry with the
   * same key settles it, the form is locked (a disabled fieldset, which
   * reaches the item picker and the buttons too): a change would be a new
   * key, and a second purchase if the first one did go in.
   */
  protected readonly uncertain = signal<string | null>(null);

  /**
   * The form says what was sent until the answer settles it. Edited while
   * «Guardando…», it would get a new key, and the retry a lost answer asks for
   * would register a second purchase.
   */
  protected readonly locked = computed(() => this.busy() || this.uncertain() !== null);

  /**
   * Names this purchase for the database, which makes it once however many
   * times it is asked: a double click, or an answer lost on the way back. A
   * change to the form is another purchase, with a key of its own.
   */
  private purchaseKey = crypto.randomUUID();

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      // A change that slips in while it is locked is not the person's: the key stays with what was sent.
      if (!this.locked()) this.purchaseKey = crypto.randomUUID();
    });
    // After a refusal the lists reload. An account closed or a filament
    // switched off in another tab is gone from them: the form lets go of it
    // and asks again, instead of showing nothing chosen, saying «Queda por
    // pagar» in the confirmation and sending it anyway.
    effect(() => {
      const accounts = this.accountOptions();
      const skus = this.skuById();
      const items = this.itemById();
      untracked(() => this.dropVanishedChoices(accounts, skus, items));
    });
  }

  private dropVanishedChoices(
    accounts: PaymentAccount[],
    skus: ReadonlyMap<string, SkuSummary>,
    items: ReadonlyMap<string, InventoryItemSummary>,
  ): void {
    // On its way, or while nobody knows whether it went in, the purchase stays as it was sent.
    if (this.locked()) return;
    const paidFrom = this.form.controls.paidFrom;
    if (paidFrom.value !== '' && paidFrom.value !== NOT_PAID && !accounts.some((account) => account.id === paidFrom.value)) {
      paidFrom.setValue('');
      paidFrom.markAsTouched();
    }
    for (const line of this.lines.controls) {
      const target = parseTarget(line.controls.target.value);
      const gone = target !== null && !(target.kind === 'sku' ? skus.has(target.id) : items.has(target.id));
      if (gone) {
        line.controls.target.setValue('');
        line.controls.target.markAsTouched();
      }
    }
  }

  protected readonly createSupplier = async (name: string): Promise<void> => {
    const supplier = await this.data.createSupplier(name);
    this.addedSuppliers.update((list) => [...list, supplier]);
    this.form.controls.supplierId.setValue(supplier.id);
  };

  protected skuName(sku: SkuSummary): string {
    return [sku.colorName, sku.materialCode, sku.finishName, sku.brandName].filter(Boolean).join(' · ');
  }

  /** «Rollos» for a filament; for a supply, the unit it is counted in, so «Cantidad (g)» says what the number means. */
  protected quantityLabel(index: number): string {
    const { target, item } = this.resolved()[index] ?? {};
    if (target?.kind !== 'item') return 'Rollos';
    return item && item.unit !== DEFAULT_UNIT ? `Cantidad (${item.unit})` : 'Cantidad';
  }

  /** The price is per whatever the quantity counts: «Precio por g» for a gram, «Precio unitario» for a unit or a roll. */
  protected priceLabel(index: number): string {
    const item = this.resolved()[index]?.item;
    return item && item.unit !== DEFAULT_UNIT ? `Precio por ${item.unit} (S/)` : 'Precio unitario (S/)';
  }

  protected priceHint(index: number): string | undefined {
    const unit = this.resolved()[index]?.item?.unit;
    return unit === 'g' || unit === 'ml' ? FRACTIONS_OF_A_CENT_HINT : undefined;
  }

  /** A roll is bought whole and priced in cents; the total only helps with what is bought by weight, volume or count. */
  protected canTypeTotal(index: number): boolean {
    return this.resolved()[index]?.target?.kind === 'item';
  }

  protected quantityError(index: number): string | null {
    return this.lines.at(index).controls.quantity.touched ? (this.lineProblems()[index]?.quantity ?? null) : null;
  }

  protected priceError(index: number): string | null {
    return this.lines.at(index).controls.unitPrice.touched ? (this.lineProblems()[index]?.unitPrice ?? null) : null;
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
    if (this.uncertain()) return;
    this.form.markAllAsTouched();
    this.error.set(null);
    this.failure.set(null);
    const lineProblem = this.lineProblems().some((problems) => problems.quantity || problems.unitPrice);
    if (this.form.invalid || lineProblem) {
      this.error.set('Revisa los campos marcados antes de guardar.');
      return;
    }
    if (this.totalProblem()) {
      this.error.set(this.totalProblem());
      return;
    }
    if (this.methodMissing()) {
      this.error.set(`Elige el medio de pago: ${this.chosenAccount()?.name} no tiene uno por defecto.`);
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
    this.failure.set(null);
    try {
      const registered = await this.data.registerPurchase(this.toDraft(), this.purchaseKey);
      this.uncertain.set(null);
      this.saved.emit({ rolls: registered.spools.length, spools: registered.spools, paid: registered.paid });
    } catch (error) {
      void this.workspace.afterRefusal(error);
      if (outcomeUnknown(error)) {
        // It may be in: same key, same purchase, and the form stays as it was sent.
        this.uncertain.set(noAnswerReason(error));
        return;
      }
      // The database answered no, and a refusal with this key also means the
      // first try never went in: with it in, the key would have returned it.
      this.uncertain.set(null);
      this.confirming.set(false);
      this.failure.set(describeError(error, 'Inténtalo de nuevo en un momento.'));
      this.refused.emit();
    } finally {
      this.busy.set(false);
    }
  }

  /** The plan's numbers, not the typed ones: they are what the preview showed and what the database checks. */
  private toDraft(): PurchaseDraft {
    const raw = this.form.getRawValue();
    const plan = this.plan();
    const lines = this.resolved().map(({ line, target }, index): PurchaseDraftLine => {
      const planned = plan.lines[index];
      return {
        kind: target?.kind ?? 'sku',
        targetId: target?.id ?? '',
        quantity: planned?.quantity ?? 0,
        unitPrice: planned?.unitPrice ?? 0,
        extra: planned?.extra ?? 0,
        unitCosts: planned?.unitCosts ?? [],
        unitCost: planned?.effectiveUnitCost ?? 0,
        expiresOn: target?.kind === 'item' ? blankToNull(line.expiresOn) : null,
      };
    });

    return {
      supplierId: blankToNull(raw.supplierId),
      purchasedAt: raw.purchasedAt,
      documentRef: blankToNull(raw.documentRef),
      shippingCost: Number(raw.shippingCost) || 0,
      otherCosts: Number(raw.otherCosts) || 0,
      allocation: plan.method,
      note: blankToNull(raw.note),
      lines,
      payment:
        raw.paidFrom === NOT_PAID ? null : { accountId: raw.paidFrom, method: raw.method === '' ? null : raw.method },
    };
  }

  private newLine() {
    const line = this.fb.group({
      target: ['', Validators.required],
      quantity: new FormControl<number | null>(1, Validators.required),
      unitPrice: new FormControl<number | null>(null, Validators.required),
      lineTotal: new FormControl<number | null>(null, [Validators.min(0), maxDecimals(CENTS)]),
      expiresOn: [''],
    });
    linkPriceAndTotal(line.controls, this.destroyRef);
    return line;
  }
}
