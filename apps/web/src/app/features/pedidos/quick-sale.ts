import type { PlanInput, PlanResult } from '@pickypop/domain';
import { textOrNull } from '../../core/form-errors';
import { money } from '../../core/format';
import { roundMoney, sumMoney, totalFor } from '../../core/pricing';
import type { PaymentMethod } from './pedidos.labels';

/**
 * The rules of «Venta rápida» (ADR-024), apart from the screen so they can be
 * tested: what the shelf offers, what the sale adds up to, what stops it and
 * what travels to `quick_sale`.
 *
 * Nothing here decides what is free. That is the plan's answer (ADR-021),
 * read as it is; this only turns it into whole units a person can sell.
 */

/** Dust of the plan's numeric columns: 2.9999999 assembled baskets are 3. */
const UNIT_EPSILON = 1e-6;
/** A phone is recognised by its last nine digits, the length of a mobile in Peru: «+51 987…» is «987…». */
const PHONE_DIGITS = 9;
/** Fewer digits than this say too little to recognise anybody. */
const MIN_PHONE_DIGITS = 6;

/** A catalogue variant, with what a person recognises it by. */
export interface VariantInfo {
  id: string;
  productName: string;
  variantName: string;
  /** The variant's photo, or its product's. */
  imagePath: string | null;
  listPrice: number | null;
}

/** Something assembled on the shelf that no order and no hold claims: what can be sold now. */
export interface ShelfOffer extends VariantInfo {
  /** «Producto — variante», the way an order line names it. */
  label: string;
  /** Whole units nobody claims. */
  free: number;
  /** Assembled units on the shelf, claimed or not. */
  onHand: number;
  /**
   * What a unit is worth on the shelf, labour included: what the delivery
   * will take it out at, and so the cost the line keeps (ADR-022). Null when
   * nothing says what it cost.
   */
  unitCost: number | null;
}

/** Whether the ladder's price for the quantity has been read. The sale waits for it. */
export type PriceStatus = 'pending' | 'ready';

/** One line of the sale, as the form holds it. */
export interface SaleLineValue {
  variantId: string;
  quantity: number;
  unitPrice: number | null;
  /** What a unit is worth on the shelf, as the shelf was last read. The database puts the real one on the line. */
  shelfUnitCost: number | null;
  priceStatus: PriceStatus;
}

export interface SaleTotals {
  total: number;
  /** What the sale takes off the shelf, line by line as Resultados rounds it. */
  cost: number;
  collected: number;
  /** What stays in «Por cobrar». */
  owed: number;
}

/** Who the sale is for: one of the list, or a name and phone to create, or nobody (the walk-in customer). */
export interface SaleCustomer {
  customerId: string;
  name: string;
  phone: string;
}

export interface SalePayment {
  /** Null while the field is empty. */
  amount: number | null;
  accountId: string;
  method: PaymentMethod | '';
  reference: string;
  /** ISO instant, or null for the moment the sale is made. */
  soldAt: string | null;
}

/** An account money can go into, as far as the sale needs to know it. */
export interface AccountChoice {
  id: string;
  name: string;
  /** What `record_payment` uses when the sale names no method. */
  defaultMethod: PaymentMethod | null;
}

/** A customer as the sale offers it. */
export interface CustomerChoice {
  id: string;
  name: string;
  phone: string | null;
  /** «Clientes varios»: who the sales without a name go to. */
  walkIn: boolean;
}

/** A sales channel the sale can say it came through. */
export interface ChannelChoice {
  id: string;
  name: string;
}

/** The active channels, and the one that stands for direct sales, preselected. */
export interface ChannelOptions {
  channels: ChannelChoice[];
  /** Null when the workshop has none: then the sale may go without a channel. */
  defaultId: string | null;
}

/** What `quick_sale` receives. The cost is not sent: the database puts what left the shelf. */
export interface QuickSalePayload {
  lines: { variant_id: string; quantity: number; unit_price: number }[];
  /** Null is the workshop's default channel, or none if it has none. */
  channelId: string | null;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  /** Null when nothing is collected now. */
  accountId: string | null;
  amount: number;
  method: PaymentMethod | null;
  soldAt: string | null;
  reference: string | null;
  note: string | null;
}

/** A sale sent to `quick_sale` and not known to be done, with the key that names it. */
export interface SentSale {
  key: string;
  payload: QuickSalePayload;
}

/**
 * The key that names this sale in the database. The same sale sent again,
 * after an answer that never arrived, keeps its key: if the first one was
 * saved, the database answers with that order instead of making another, and
 * `reused` says it is worth asking first. Anything changed is another sale,
 * with a key of its own.
 */
export function saleKey(
  last: SentSale | null,
  payload: QuickSalePayload,
  newKey: () => string,
): { key: string; reused: boolean } {
  if (last && JSON.stringify(last.payload) === JSON.stringify(payload)) return { key: last.key, reused: true };
  return { key: newKey(), reused: false };
}

/** What the screen says once the sale is made. */
export interface SaleDone {
  orderId: string;
  number: string;
  customerName: string;
  units: number;
  total: number;
  collected: number;
  owed: number;
}

/** Whole units: the plan may answer 2.9999999 for three baskets, never a negative. */
export function wholeUnits(value: number): number {
  return Math.max(0, Math.floor(value + UNIT_EPSILON));
}

export function validQuantity(quantity: number): boolean {
  return Number.isInteger(quantity) && quantity >= 1;
}

/**
 * What the shelf can sell now: every assembled product with units that no
 * order and no hold claims, by the plan's own position of its finished
 * article. A product that is not assembled leaves as its parts and goes
 * through a normal order; one nobody has assembled has nothing to offer.
 * `costs` is what a unit of each variant is worth on the shelf, read from
 * the database (`finished_good_costs`), never worked out here.
 */
export function shelfOffers(
  view: { input: Pick<PlanInput, 'recipes'>; result: Pick<PlanResult, 'items'> },
  variants: readonly VariantInfo[],
  costs: ReadonlyMap<string, number> = new Map(),
): ShelfOffer[] {
  const positions = new Map(view.result.items.map((position) => [position.itemId, position]));
  const known = new Map(variants.map((variant) => [variant.id, variant]));

  return view.input.recipes
    .flatMap((recipe): ShelfOffer[] => {
      if (!recipe.assembled || recipe.finishedItemId === null) return [];
      const position = positions.get(recipe.finishedItemId);
      const variant = known.get(recipe.variantId);
      if (!position || !variant) return [];
      const free = wholeUnits(position.free);
      if (free < 1) return [];
      return [
        {
          ...variant,
          label: `${variant.productName} — ${variant.variantName}`,
          free,
          onHand: wholeUnits(position.onHand),
          unitCost: costs.get(recipe.variantId) ?? null,
        },
      ];
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'es'));
}

/** One more of a product, never past what is free. */
export function oneMore(current: number, free: number): number {
  return Math.min(free, (validQuantity(current) ? current : 0) + 1);
}

/** The price that will be stored: to the cent, as the database rounds it. */
export function salePrice(unitPrice: number | null): number | null {
  return unitPrice === null || !Number.isFinite(unitPrice) ? null : roundMoney(unitPrice);
}

/** A line's total, with the price as it will be stored, so the screen and the order agree to the cent. */
export function lineTotal(line: Pick<SaleLineValue, 'quantity' | 'unitPrice'>): number {
  const price = salePrice(line.unitPrice);
  return validQuantity(line.quantity) && price !== null && price >= 0 ? totalFor(price, line.quantity) : 0;
}

export function saleTotals(lines: readonly SaleLineValue[], collected: number | null): SaleTotals {
  const total = sumMoney(lines.map(lineTotal));
  const cost = sumMoney(
    lines.map((line) =>
      validQuantity(line.quantity) && line.shelfUnitCost !== null ? totalFor(line.shelfUnitCost, line.quantity) : 0,
    ),
  );
  const paid = collected !== null && Number.isFinite(collected) ? roundMoney(Math.max(0, collected)) : 0;
  return { total, cost, collected: paid, owed: roundMoney(Math.max(0, total - paid)) };
}

/**
 * Equal totals, field by field. The form recomputes them on every
 * keystroke; a new object with the same figures must not count as a change,
 * or what follows the total (the amount collected) would be written again
 * and again.
 */
export function sameTotals(a: SaleTotals, b: SaleTotals): boolean {
  return a.total === b.total && a.cost === b.cost && a.collected === b.collected && a.owed === b.owed;
}

/** «1 libre», «3 libres». */
export function freeUnits(free: number): string {
  return `${free} ${free === 1 ? 'libre' : 'libres'}`;
}

/**
 * The first thing that stops the sale, in the words the database would use,
 * or null when it can go. The database checks all of it again: this only
 * says it before the button is pressed.
 */
export function saleProblem(check: {
  lines: readonly SaleLineValue[];
  offers: ReadonlyMap<string, ShelfOffer>;
  customer: SaleCustomer;
  payment: SalePayment;
  /** The accounts the screen offers, to know whether the chosen one brings its own method. */
  accounts?: readonly AccountChoice[];
  now?: Date;
}): string | null {
  const { lines, offers, customer, payment } = check;
  if (lines.length === 0) return 'Toca un producto del estante para agregarlo a la venta.';

  for (const line of lines) {
    const problem = lineProblem(line, offers.get(line.variantId));
    if (problem) return problem;
  }

  const totals = saleTotals(lines, payment.amount);
  if (totals.total === 0) {
    return 'La venta suma S/ 0.00. Escribe el precio, o si lo regalas, regístralo como un pedido de regalo.';
  }

  const amount = payment.amount;
  if (amount === null || !Number.isFinite(amount)) return 'Escribe cuánto te pagaron ahora, o 0 si te paga después.';
  if (amount < 0) return 'Lo cobrado no puede ser negativo.';
  if (roundMoney(amount) > totals.total) {
    return `Lo cobrado (${money(roundMoney(amount))}) pasa del total de la venta (${money(totals.total)}).`;
  }
  if (roundMoney(amount) > 0 && !payment.accountId) {
    return 'Elige la cuenta donde entró el dinero, o deja lo cobrado en cero si te paga después.';
  }
  const account = check.accounts?.find((row) => row.id === payment.accountId);
  if (roundMoney(amount) > 0 && account && !account.defaultMethod && !payment.method) {
    return `Falta el medio de pago: la cuenta ${account.name} no tiene uno por defecto.`;
  }

  if (!customer.customerId && !customer.name.trim() && customer.phone.trim()) {
    return 'Escribe el nombre del cliente para guardar su teléfono.';
  }
  if (owesWithoutName(totals, customer)) {
    return `Quedan ${money(totals.owed)} por cobrar. Escribe el nombre de quien te debe, o elige al cliente: una deuda sin nombre no hay a quién cobrársela.`;
  }

  if (payment.soldAt && Date.parse(payment.soldAt) > (check.now ?? new Date()).getTime()) {
    return 'La venta no puede tener fecha futura.';
  }
  return null;
}

/**
 * Something stays owed and nobody is named to owe it. The walk-in customer
 * is everybody: «Por cobrar» would list the debt and nobody could say whom to
 * ask. The database refuses it too.
 */
export function owesWithoutName(totals: Pick<SaleTotals, 'owed'>, customer: SaleCustomer): boolean {
  return totals.owed > 0 && !customer.customerId && !customer.name.trim();
}

function lineProblem(line: SaleLineValue, offer: ShelfOffer | undefined): string | null {
  if (!offer) return 'Uno de los productos ya no está libre en el estante: quítalo de la venta.';
  if (!validQuantity(line.quantity)) {
    return `La cantidad de «${offer.label}» tiene que ser un número entero mayor que cero.`;
  }
  if (line.quantity > offer.free) {
    return `De «${offer.label}» hay ${freeUnits(offer.free)} en el estante: no alcanza para ${line.quantity}.`;
  }
  const price = salePrice(line.unitPrice);
  if (price === null || price < 0) return `Escribe el precio de «${offer.label}».`;
  // The ladder may lower the price for this quantity: selling before it answers would sell at the old one.
  if (line.priceStatus === 'pending') return `Un momento: estamos leyendo el precio de «${offer.label}» para esa cantidad.`;
  return null;
}

/**
 * What `quick_sale` receives. A customer from the list goes alone; a name
 * and phone go to be created; neither is the walk-in customer. Nothing
 * collected sends no account: there is no money to put anywhere. No cost
 * travels: the database writes on each line what left the shelf.
 */
export function toQuickSale(sale: {
  lines: readonly SaleLineValue[];
  customer: SaleCustomer;
  payment: SalePayment;
  note: string;
  /** Empty is no channel chosen: the database takes the workshop's default. */
  channelId?: string;
}): QuickSalePayload {
  const { lines, customer, payment } = sale;
  const amount = roundMoney(Math.max(0, payment.amount ?? 0));
  const collects = amount > 0;
  const chosen = customer.customerId || null;

  return {
    lines: lines.map((line) => ({
      variant_id: line.variantId,
      quantity: line.quantity,
      unit_price: salePrice(line.unitPrice) ?? 0,
    })),
    channelId: sale.channelId || null,
    customerId: chosen,
    customerName: chosen ? null : textOrNull(customer.name),
    customerPhone: chosen ? null : textOrNull(customer.phone),
    accountId: collects ? payment.accountId || null : null,
    amount,
    method: collects && payment.method ? payment.method : null,
    soldAt: payment.soldAt,
    reference: collects ? textOrNull(payment.reference) : null,
    note: textOrNull(sale.note),
  };
}

/**
 * Somebody already in the list who looks like the one being typed: the
 * same phone, or the same name written another way («maria torres» is
 * «María Torres»). Typing a regular customer by hand would otherwise leave a
 * second one in Clientes with half of her history.
 */
export function sameCustomer(customers: readonly CustomerChoice[], name: string, phone: string): CustomerChoice | null {
  const typedPhone = phoneKey(phone);
  const typedName = nameKey(name);
  if (!typedPhone && !typedName) return null;

  const people = customers.filter((customer) => !customer.walkIn);
  return (
    (typedPhone ? people.find((customer) => phoneKey(customer.phone ?? '') === typedPhone) : undefined) ??
    (typedName ? people.find((customer) => nameKey(customer.name) === typedName) : undefined) ??
    null
  );
}

/** What the screen says when the sale is made, with what the database answered. */
export function saleDone(
  order: { id: string; number: string; total: number },
  payload: QuickSalePayload,
  customerName: string,
): SaleDone {
  const total = roundMoney(order.total);
  return {
    orderId: order.id,
    number: order.number,
    customerName,
    units: payload.lines.reduce((sum, line) => sum + line.quantity, 0),
    total,
    collected: payload.amount,
    owed: roundMoney(Math.max(0, total - payload.amount)),
  };
}

function phoneKey(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= MIN_PHONE_DIGITS ? digits.slice(-PHONE_DIGITS) : null;
}

function nameKey(name: string): string | null {
  const key = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  return key === '' ? null : key;
}
