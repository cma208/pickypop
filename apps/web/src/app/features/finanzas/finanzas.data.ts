import { inject, Injectable } from '@angular/core';
import { fetchAll } from '../../core/fetch-all';
import { permissionError, UserFacingError } from '../../core/friendly-error';
import { SUPABASE } from '../../core/supabase';
import { CurrentWorkspace } from '../../core/workspace';
import { accountChanges, type AccountInput, type AccountLeg } from './account-edit';
import {
  dayEnd,
  dayStart,
  defaultCategory,
  financeAccess,
  num,
  type AccountKind,
  type CategoryOption,
  type FinanceAccess,
  type PaymentMethod,
  type TransactionType,
} from './finanzas.models';
import { ledgerOrder, legKey, otherLegBeforeOpening } from './ledger-totals';
import type { MonthResult } from './results';
import type { TransactionDraft } from './transaction-draft';

// ------------------------------------------------------------------- types

export interface AccountSummary {
  id: string;
  name: string;
  kind: AccountKind;
  active: boolean;
  openingBalance: number;
  openingBalanceOn: string;
  defaultPaymentMethod: PaymentMethod | null;
  note: string | null;
  /** When it was last changed: an edit from an old tab is refused against it (T5-09). */
  updatedAt: string;
  /** In and out since the opening balance: opening + in − out is the balance. */
  totalIn: number;
  totalOut: number;
  balance: number;
  movements: number;
  lastMovementAt: string | null;
  /** Movements dated before the opening balance: already inside it, they move nothing (E5-02). */
  movementsBeforeOpening: number;
  netBeforeOpening: number;
}

export type { AccountInput };

/** Said when an old tab tries to save over an account that changed meanwhile. */
const STALE_ACCOUNT =
  'La cuenta cambió en otra pestaña, o la cambió otra persona, mientras la editabas: no se guardó nada. Vuelve a abrirla para ver cómo quedó.';

/**
 * The account moved on while the screen showed an older version of it. The
 * form open on that version cannot be saved over it: Cuentas closes it and
 * reads the list again.
 */
export class StaleAccountError extends UserFacingError {}

export interface LedgerFilter {
  accountId: string | null;
  type: TransactionType | null;
  from: string | null;
  to: string | null;
}

export interface LedgerRow {
  /** A transfer produces two legs out of one row, so the id alone is not unique. */
  key: string;
  transactionId: string;
  occurredAt: string;
  type: TransactionType;
  accountId: string | null;
  accountName: string;
  /** The other side of a transfer, seen from this leg. */
  otherAccountName: string | null;
  isCounterLeg: boolean;
  categoryName: string | null;
  paymentMethod: PaymentMethod | null;
  /** Positive when it adds to the account, negative when it takes from it. Zero once voided. */
  signedAmount: number;
  amount: number;
  counterparty: string | null;
  reference: string | null;
  note: string | null;
  /** What the movement settled, when it came from somewhere else in the app. */
  origin: string | null;
  /** The order it collected or refunded, so voiding it can say that order owes again. */
  orderNumber: string | null;
  /** The order is a quick sale to «Clientes varios», which never owes (T5-05). */
  walkInOrder: boolean;
  /** It paid a purchase, which goes back to «Por pagar» if it is voided. */
  purchaseId: string | null;
  voided: boolean;
  voidReason: string | null;
  /** Dated before this leg's account opened: already inside its opening balance, so it does not move it. */
  beforeOpening: boolean;
  /** The same for the other leg of a transfer, judged by its own account. False for anything else. */
  otherBeforeOpening: boolean;
}

export interface ReceivableRow {
  orderId: string;
  number: string;
  customerName: string | null;
  customerPhone: string | null;
  orderedOn: string;
  dueDate: string | null;
  total: number;
  paid: number;
  balance: number;
  lastPaymentAt: string | null;
  daysOverdue: number;
}

export type { MonthResult };

export interface PaymentInput {
  orderId: string;
  accountId: string;
  amount: number;
  /** Left out when the account already has a default; the function fills it in. */
  paymentMethod: PaymentMethod | null;
  occurredAt: string;
  categoryId: string | null;
  reference: string | null;
  note: string | null;
}

interface ErrorLike {
  code?: string;
  message?: string;
}

const RAISED_EXCEPTION = 'P0001';

/**
 * A `raise exception` from a database function is already a sentence in
 * Spanish, with the amounts in it. Showing a generic message instead would
 * throw away the only explanation the person needs.
 */
function withRaisedMessage(error: unknown): unknown {
  const { code, message } = (error ?? {}) as ErrorLike;
  return code === RAISED_EXCEPTION && message ? new UserFacingError(message) : error;
}

/** Whether the database refused with a sentence of its own: the screen then reloads what it showed. */
export function isRefusal(error: unknown): boolean {
  return error instanceof UserFacingError || (error as ErrorLike | null)?.code === RAISED_EXCEPTION;
}

/**
 * Everything the finance screens read and write. Pages never talk to Supabase
 * directly. Row Level Security scopes every query to the signed-in person's
 * workshop, so nothing here filters by workspace.
 */
@Injectable({ providedIn: 'root' })
export class FinanzasData {
  private readonly supabase = inject(SUPABASE);
  private readonly workspace = inject(CurrentWorkspace);

  /**
   * What the signed-in person may do here: the owner sets up the accounts and
   * voids, the owner and the operators register and collect (the owner's
   * decision of 2026-10-08). Read fresh each time, not from the workshop's
   * cached role: after a refusal the screens ask again, and a role changed in
   * another tab counts at once instead of at the next sign-in.
   */
  async access(): Promise<FinanceAccess> {
    const { id, userId } = await this.workspace.info();
    if (!userId) return financeAccess(null);
    const { data, error } = await this.supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', id)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return financeAccess(data?.role);
  }

  // ---------------------------------------------------------------- accounts

  async accounts(): Promise<AccountSummary[]> {
    const [accounts, balances] = await Promise.all([
      this.supabase
        .from('accounts')
        .select('id, name, kind, opening_balance, opening_balance_on, default_payment_method, note, active, updated_at'),
      this.supabase
        .from('account_balances')
        .select('account_id, total_in, total_out, balance, movements, last_movement_at, movements_before_opening, net_before_opening'),
    ]);
    if (accounts.error) throw accounts.error;
    if (balances.error) throw balances.error;

    const byId = new Map(balances.data.map((row) => [row.account_id, row]));

    return accounts.data
      .map((account): AccountSummary => {
        const balance = byId.get(account.id);
        return {
          id: account.id,
          name: account.name,
          kind: account.kind,
          active: account.active,
          openingBalance: num(account.opening_balance),
          openingBalanceOn: account.opening_balance_on,
          defaultPaymentMethod: account.default_payment_method,
          note: account.note,
          updatedAt: account.updated_at,
          totalIn: num(balance?.total_in),
          totalOut: num(balance?.total_out),
          // Without its balance row the account is worth what it opened with.
          balance: balance ? num(balance.balance) : num(account.opening_balance),
          movements: num(balance?.movements),
          lastMovementAt: balance?.last_movement_at ?? null,
          movementsBeforeOpening: num(balance?.movements_before_opening),
          netBeforeOpening: num(balance?.net_before_opening),
        };
      })
      .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'es'));
  }

  /** A new account starts active: deactivating one is its own button. */
  async createAccount(input: AccountInput): Promise<void> {
    const workspace_id = await this.workspace.requireId();
    const { error } = await this.supabase.from('accounts').insert({
      workspace_id,
      name: input.name.trim(),
      kind: input.kind,
      opening_balance: input.openingBalance,
      opening_balance_on: input.openingBalanceOn,
      default_payment_method: input.defaultPaymentMethod,
      note: input.note,
    });
    if (error) throw withRaisedMessage(error);
  }

  /**
   * Saves only what changed, and only over the version the form was opened
   * with: from an old tab the form used to send every field back, and undid a
   * deactivation or an opening moved meanwhile without a word (T5-09).
   * Returns false when there was nothing to save.
   */
  async updateAccount(account: AccountSummary, input: AccountInput): Promise<boolean> {
    const changes = accountChanges(account, input);
    if (Object.keys(changes).length === 0) return false;

    const { data, error } = await this.supabase
      .from('accounts')
      .update(changes)
      .eq('id', account.id)
      .eq('updated_at', account.updatedAt)
      .select('id');
    if (error) throw withRaisedMessage(error);
    if (data.length === 0) throw await this.whyNothingChanged(account.id, (row) => row.updated_at !== account.updatedAt);
    return true;
  }

  /**
   * Accounts are never deleted: a closed one still has to explain its
   * movements. Only an account still in the state the screen showed is
   * switched, so two tabs cannot undo each other.
   */
  async setAccountActive(account: AccountSummary, active: boolean): Promise<void> {
    const { data, error } = await this.supabase
      .from('accounts')
      .update({ active })
      .eq('id', account.id)
      .eq('active', !active)
      .select('id');
    if (error) throw withRaisedMessage(error);
    if (data.length === 0) {
      throw await this.whyNothingChanged(account.id, (row) => row.active === active, active
        ? `La cuenta ${account.name} ya estaba activa: alguien la reactivó en otra pestaña.`
        : `La cuenta ${account.name} ya estaba desactivada: alguien la desactivó en otra pestaña.`);
    }
  }

  /**
   * An update that touched no row returns no error. Either the account moved
   * on meanwhile, or the rules of the table did not let this person change it.
   */
  private async whyNothingChanged(
    id: string,
    movedOn: (row: { updated_at: string; active: boolean }) => boolean,
    message = STALE_ACCOUNT,
  ): Promise<Error> {
    const { data } = await this.supabase.from('accounts').select('updated_at, active').eq('id', id).maybeSingle();
    return data && movedOn(data) ? new StaleAccountError(message) : permissionError();
  }

  /** The legs an account has, to say which change side when its opening day moves. */
  async accountLegs(accountId: string): Promise<AccountLeg[]> {
    const rows = await fetchAll((from, to) =>
      this.supabase
        .from('transaction_entries')
        .select('transaction_id, is_counter_leg, occurred_at, signed_amount, type')
        .eq('account_id', accountId)
        .order('occurred_at')
        .order('transaction_id')
        .order('is_counter_leg')
        .range(from, to),
    );
    return rows.map((row) => ({
      occurredAt: row.occurred_at ?? '',
      signedAmount: num(row.signed_amount),
      type: row.type ?? 'income',
    }));
  }

  // -------------------------------------------------------------- categories

  async categories(): Promise<CategoryOption[]> {
    const { data, error } = await this.supabase
      .from('transaction_categories')
      .select('id, name, direction, sales, capital')
      .eq('active', true)
      .order('name');
    if (error) throw error;

    return data.map((row) => ({
      id: row.id,
      name: row.name,
      direction: row.direction,
      sales: row.sales,
      capital: row.capital,
    }));
  }

  /**
   * What a collection and a purchase payment will be filed under if the form
   * does not say. The database decides it when the movement is written; this
   * only lets the form announce it first.
   */
  async paymentCategories(): Promise<{ order: CategoryOption | null; purchase: CategoryOption | null }> {
    const workspaceId = await this.workspace.requireId();
    const [categories, settings] = await Promise.all([
      this.categories(),
      this.supabase
        .from('workshop_settings')
        .select('order_payment_category_id, purchase_payment_category_id')
        .eq('workspace_id', workspaceId)
        .maybeSingle(),
    ]);
    if (settings.error) throw settings.error;

    return {
      order: defaultCategory('income', settings.data?.order_payment_category_id ?? null, categories),
      purchase: defaultCategory('expense', settings.data?.purchase_payment_category_id ?? null, categories),
    };
  }

  // ----------------------------------------------------------------- ledger

  /**
   * The book, leg by leg. Live movements come from `transaction_entries`,
   * which already splits a transfer into the side that leaves and the side
   * that arrives; the voided ones are read from the table, because the view
   * drops them on purpose, and they are shown without amount so they cannot
   * be mistaken for money that moved.
   */
  async ledger(filter: LedgerFilter): Promise<LedgerRow[]> {
    const [accounts, categories, entries, details] = await Promise.all([
      this.accountRefs(),
      this.categoryNames(),
      this.liveEntries(filter),
      this.transactionDetails(filter),
    ]);

    const legs = new Map(
      entries.map((entry) => [
        legKey(entry.transaction_id ?? '', entry.is_counter_leg ?? false),
        entry.before_opening ?? false,
      ]),
    );

    const rows = entries.map((entry): LedgerRow => {
      const detail = details.get(entry.transaction_id ?? '');
      const otherId = entry.is_counter_leg ? detail?.accountId : detail?.counterAccountId;
      const other = otherId ? accounts.get(otherId) : undefined;
      const leg = {
        transactionId: entry.transaction_id ?? '',
        isCounterLeg: entry.is_counter_leg ?? false,
        occurredAt: entry.occurred_at ?? '',
      };

      return {
        key: `${entry.transaction_id}-${entry.is_counter_leg ? 'in' : 'out'}`,
        transactionId: leg.transactionId,
        occurredAt: leg.occurredAt,
        type: entry.type ?? 'income',
        accountId: entry.account_id,
        accountName: accounts.get(entry.account_id ?? '')?.name ?? 'Cuenta desconocida',
        otherAccountName: other?.name ?? null,
        isCounterLeg: leg.isCounterLeg,
        categoryName: entry.category_id ? (categories.get(entry.category_id) ?? null) : null,
        paymentMethod: entry.payment_method,
        signedAmount: num(entry.signed_amount),
        amount: Math.abs(num(entry.signed_amount)),
        counterparty: entry.counterparty,
        reference: detail?.reference ?? null,
        note: entry.note,
        origin: originOf(entry.order_id, entry.purchase_id, entry.maintenance_log_id, detail?.orderNumber),
        orderNumber: detail?.orderNumber ?? null,
        walkInOrder: detail?.walkInOrder ?? false,
        purchaseId: entry.purchase_id,
        voided: false,
        voidReason: null,
        beforeOpening: entry.before_opening ?? false,
        otherBeforeOpening:
          entry.type === 'transfer' && otherLegBeforeOpening(leg, legs, other?.openingBalanceOn ?? null),
      };
    });

    const voided = [...details.values()]
      .filter((detail) => detail.voidedAt !== null)
      .map((detail): LedgerRow => ({
        key: `${detail.id}-void`,
        transactionId: detail.id,
        occurredAt: detail.occurredAt,
        type: detail.type,
        accountId: detail.accountId,
        accountName: accounts.get(detail.accountId)?.name ?? 'Cuenta desconocida',
        otherAccountName: detail.counterAccountId
          ? (accounts.get(detail.counterAccountId)?.name ?? null)
          : null,
        isCounterLeg: false,
        categoryName: detail.categoryId ? (categories.get(detail.categoryId) ?? null) : null,
        paymentMethod: detail.paymentMethod,
        // A voided movement is worth nothing: it must not add up anywhere.
        signedAmount: 0,
        amount: detail.amount,
        counterparty: detail.counterparty,
        reference: detail.reference,
        note: detail.note,
        origin: originOf(detail.orderId, detail.purchaseId, detail.maintenanceLogId, detail.orderNumber),
        orderNumber: detail.orderNumber,
        walkInOrder: detail.walkInOrder,
        purchaseId: detail.purchaseId,
        voided: true,
        voidReason: detail.voidReason,
        // An annulled movement moves no balance at all, before or after the opening.
        beforeOpening: false,
        otherBeforeOpening: false,
      }));

    return [...rows, ...voided].sort(ledgerOrder);
  }

  /**
   * Writes one movement. `key` is the form's: the same key twice is the same
   * movement, so a request the browser resends on its own leaves the first
   * one and adds nothing (`transactions.entry_key`).
   */
  async createTransaction(draft: TransactionDraft, key: string): Promise<void> {
    const workspace_id = await this.workspace.requireId();

    const { error } = await this.supabase.from('transactions').upsert(
      {
        workspace_id,
        account_id: draft.accountId,
        counter_account_id: draft.counterAccountId,
        type: draft.type,
        category_id: draft.categoryId,
        amount: draft.amount,
        occurred_at: draft.occurredAt,
        payment_method: draft.paymentMethod,
        counterparty: draft.counterparty,
        reference: draft.reference,
        note: draft.note,
        entry_key: key,
      },
      { onConflict: 'workspace_id,entry_key', ignoreDuplicates: true },
    );
    if (error) throw withRaisedMessage(error);
  }

  /**
   * Money is never deleted. Voiding takes the movement out of every balance
   * and every report and leaves the reason on the record. Only the owner
   * does it, through `void_transaction`, which says in words why not when it
   * cannot: already voided from another tab (T5-10), or the collection of a
   * sale to «Clientes varios» (T5-05).
   */
  async voidTransaction(id: string, reason: string): Promise<void> {
    const { error } = await this.supabase.rpc('void_transaction', { p_id: id, p_reason: reason.trim() });
    if (error) throw withRaisedMessage(error);
  }

  // ------------------------------------------------------------ receivables

  async receivables(): Promise<ReceivableRow[]> {
    const rows = await fetchAll((from, to) =>
      this.supabase
        .from('receivables')
        .select(
          'order_id, number, customer_name, customer_phone, ordered_on, due_date, total, paid, balance, last_payment_at, days_overdue',
        )
        .order('days_overdue', { ascending: false })
        .order('ordered_on', { ascending: true })
        .range(from, to),
    );

    return rows.map((row) => ({
      orderId: row.order_id ?? '',
      number: row.number ?? '—',
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      orderedOn: row.ordered_on ?? '',
      dueDate: row.due_date,
      total: num(row.total),
      paid: num(row.paid),
      balance: num(row.balance),
      lastPaymentAt: row.last_payment_at,
      daysOverdue: num(row.days_overdue),
    }));
  }

  /**
   * Collects an order through `record_payment`, which checks the overpayment
   * and moves the order's payment status in the same transaction. Its own
   * error message is kept word for word. With the form's key, the same
   * collection sent twice is recorded once.
   */
  async recordPayment(input: PaymentInput, key: string): Promise<void> {
    const { error } = await this.supabase.rpc('record_payment', {
      p_order_id: input.orderId,
      p_account_id: input.accountId,
      p_amount: input.amount,
      p_payment_method: input.paymentMethod ?? undefined,
      p_occurred_at: input.occurredAt,
      p_category_id: input.categoryId ?? undefined,
      p_reference: input.reference ?? undefined,
      p_note: input.note ?? undefined,
      p_key: key,
    });
    if (error) throw withRaisedMessage(error);
  }

  /**
   * Whether a movement sent with this key is in the book: the answer to
   * «¿quedó registrado?» when the connection dropped before the reply came.
   * The key travels into `transactions.entry_key`, from Caja and from
   * `record_payment` alike.
   */
  async entryRecorded(key: string): Promise<boolean> {
    const { data, error } = await this.supabase.from('transactions').select('id').eq('entry_key', key).maybeSingle();
    if (error) throw error;
    return data !== null;
  }

  // ---------------------------------------------------------------- results

  async incomeStatement(): Promise<MonthResult[]> {
    const rows = await fetchAll((from, to) =>
      this.supabase
        .from('monthly_income_statement')
        .select(
          'month, sales, cost_of_sales, gross_profit, operating_expenses, net_profit, other_income, inventory_purchases, owner_contributions, owner_draws, unsold_production, tools_and_tests, shelf_count_losses, failed_prints, print_cost, failure_reserve_rate, uncovered_failed_prints',
        )
        .order('month', { ascending: false })
        .range(from, to),
    );

    return rows
      .filter((row) => row.month !== null)
      .map((row) => ({
        month: row.month as string,
        sales: num(row.sales),
        costOfSales: num(row.cost_of_sales),
        grossProfit: num(row.gross_profit),
        operatingExpenses: num(row.operating_expenses),
        netProfit: num(row.net_profit),
        otherIncome: num(row.other_income),
        inventoryPurchases: num(row.inventory_purchases),
        ownerContributions: num(row.owner_contributions),
        ownerDraws: num(row.owner_draws),
        unsoldProduction: num(row.unsold_production),
        toolsAndTests: num(row.tools_and_tests),
        shelfCountLosses: num(row.shelf_count_losses),
        failedPrints: num(row.failed_prints),
        uncoveredFailedPrints: num(row.uncovered_failed_prints),
        printCost: num(row.print_cost),
        failureReserveRate: row.failure_reserve_rate === null ? null : Number(row.failure_reserve_rate),
      }));
  }

  // ---------------------------------------------------------------- helpers

  /** Names for the book, and the opening day to judge a transfer leg the book did not bring. */
  private async accountRefs(): Promise<Map<string, { name: string; openingBalanceOn: string }>> {
    const { data, error } = await this.supabase.from('accounts').select('id, name, opening_balance_on');
    if (error) throw error;
    return new Map(data.map((row) => [row.id, { name: row.name, openingBalanceOn: row.opening_balance_on }]));
  }

  private async categoryNames(): Promise<Map<string, string>> {
    const { data, error } = await this.supabase.from('transaction_categories').select('id, name');
    if (error) throw error;
    return new Map(data.map((row) => [row.id, row.name]));
  }

  private liveEntries(filter: LedgerFilter) {
    return fetchAll((from, to) => {
      let query = this.supabase
        .from('transaction_entries')
        .select(
          'transaction_id, account_id, is_counter_leg, occurred_at, type, category_id, payment_method, signed_amount, order_id, purchase_id, maintenance_log_id, counterparty, note, before_opening',
        )
        // The form saves to the minute, so ties are common. Without a tie-break
        // the two legs of a transfer could land apart, and pages could repeat
        // or skip a row past the first thousand.
        .order('occurred_at', { ascending: false })
        .order('transaction_id')
        .order('is_counter_leg')
        .range(from, to);

      if (filter.accountId) query = query.eq('account_id', filter.accountId);
      if (filter.type) query = query.eq('type', filter.type);
      if (filter.from) query = query.gte('occurred_at', dayStart(filter.from));
      if (filter.to) query = query.lte('occurred_at', dayEnd(filter.to));

      return query;
    });
  }

  /**
   * The rows behind the legs: the reference, the order they settled and the
   * voiding, none of which the entries view carries.
   */
  private async transactionDetails(filter: LedgerFilter) {
    const rows = await fetchAll((from, to) => {
      let query = this.supabase
        .from('transactions')
        .select(
          'id, account_id, counter_account_id, type, category_id, amount, occurred_at, payment_method, counterparty, reference, note, voided_at, void_reason, order_id, purchase_id, maintenance_log_id, orders(number, customers(walk_in))',
        )
        .order('occurred_at', { ascending: false })
        .order('id')
        .range(from, to);

      // A transfer is only visible from the account it left or the one it
      // reached, so both sides have to be looked at.
      if (filter.accountId) {
        query = query.or(`account_id.eq.${filter.accountId},counter_account_id.eq.${filter.accountId}`);
      }
      if (filter.type) query = query.eq('type', filter.type);
      if (filter.from) query = query.gte('occurred_at', dayStart(filter.from));
      if (filter.to) query = query.lte('occurred_at', dayEnd(filter.to));

      return query;
    });

    return new Map(
      rows.map((row) => [
        row.id,
        {
          id: row.id,
          accountId: row.account_id,
          counterAccountId: row.counter_account_id,
          type: row.type,
          categoryId: row.category_id,
          amount: num(row.amount),
          occurredAt: row.occurred_at,
          paymentMethod: row.payment_method,
          counterparty: row.counterparty,
          reference: row.reference,
          note: row.note,
          voidedAt: row.voided_at,
          voidReason: row.void_reason,
          orderId: row.order_id,
          purchaseId: row.purchase_id,
          maintenanceLogId: row.maintenance_log_id,
          orderNumber: row.orders?.number ?? null,
          walkInOrder: row.orders?.customers?.walk_in ?? false,
        },
      ]),
    );
  }
}

/** Where a movement came from, when it was not typed in by hand. */
function originOf(
  orderId: string | null | undefined,
  purchaseId: string | null | undefined,
  maintenanceLogId: string | null | undefined,
  orderNumber: string | null | undefined,
): string | null {
  if (orderId) return orderNumber ? `Pedido ${orderNumber}` : 'Pedido';
  if (purchaseId) return 'Compra de inventario';
  if (maintenanceLogId) return 'Mantenimiento';
  return null;
}
