import { Component, computed, inject, input, output, signal } from '@angular/core';
import { friendlyError } from '../../core/friendly-error';
import { SECTION_STYLES } from '../../core/styles';
import { Field, FORMAT_PIPES } from '../../ui';
import { FinanzasData, isRefusal, type LedgerRow } from './finanzas.data';
import { FINANCE_STYLES } from './finanzas.styles';
import type { TransactionPreset } from './transaction-draft';
import { voidSummary } from './void-summary';
import { CurrentWorkspace } from '../../core/workspace';

/**
 * Annuls a movement. There is no delete: the row stays on the record with the
 * reason. Only the owner opens it, and `void_transaction` checks it again.
 * When it cannot be voided it says why before anyone writes a reason, and
 * offers what to register instead when there is something to correct.
 */
@Component({
  selector: 'app-void-form',
  imports: [Field, FORMAT_PIPES],
  styles: [
    SECTION_STYLES,
    FINANCE_STYLES,
    `.correction { margin: 0 0 0.75rem; } .correction p { margin: 0 0 0.4rem; }`,
  ],
  template: `
    <section class="form-box" aria-labelledby="void-title">
      <h3 id="void-title">Anular movimiento</h3>

      <p class="muted">
        <strong>{{ summary().what }}</strong>, del {{ row().occurredAt | fecha }}.
        @if (summary().legs; as legs) { {{ legs }} }
        El movimiento no se borra: deja de contar en los saldos y queda registrado como anulado.
      </p>

      @if (summary().blocked; as text) {
        <p class="alert alert-warn">{{ text }}</p>
        @for (fix of summary().corrections; track fix.action) {
          <div class="correction">
            <p><strong>{{ fix.when }}.</strong> {{ fix.what }}</p>
            <button type="button" class="secondary" (click)="correct.emit(fix.preset)">{{ fix.action }}</button>
          </div>
        }
        <div class="form-actions">
          <button type="button" class="secondary" (click)="cancelled.emit()">Cerrar</button>
        </div>
      } @else {
        @if (summary().consequence; as text) {
          <p class="alert alert-warn">{{ text }}</p>
        }

        <pp-field label="Motivo de la anulación" [required]="true" [error]="problem()">
          <textarea rows="2" [value]="reason()" (input)="onReason($event)" autocomplete="off"></textarea>
        </pp-field>

        @if (failure(); as message) {
          <p class="alert" role="alert">{{ message }}</p>
        }

        <div class="form-actions">
          <button type="button" class="danger" [disabled]="saving() || !reason().trim()" (click)="submit()">
            {{ saving() ? 'Anulando…' : 'Anular movimiento' }}
          </button>
          <button type="button" class="secondary" (click)="cancelled.emit()">Cancelar</button>
        </div>
      }
    </section>
  `,
})
export class VoidForm {
  private readonly data = inject(FinanzasData);
  private readonly workspace = inject(CurrentWorkspace);

  readonly row = input.required<LedgerRow>();
  readonly voided = output<string>();
  /** The database said no, in these words: the book behind the form may be out of date. */
  readonly refused = output<string>();
  /** It cannot be voided, and Caja's form is opened with the correction instead. */
  readonly correct = output<TransactionPreset>();
  readonly cancelled = output<void>();

  protected readonly summary = computed(() => voidSummary(this.row()));

  protected readonly reason = signal('');
  protected readonly touched = signal(false);
  protected readonly saving = signal(false);
  protected readonly failure = signal<string | null>(null);

  protected readonly problem = computed(() =>
    this.touched() && !this.reason().trim() ? 'El motivo es obligatorio.' : null,
  );

  protected onReason(event: Event): void {
    this.touched.set(true);
    this.failure.set(null);
    this.reason.set((event.target as HTMLTextAreaElement).value);
  }

  protected async submit(): Promise<void> {
    if (this.saving()) return;
    this.touched.set(true);
    const reason = this.reason().trim();
    if (!reason || this.summary().blocked) return;

    this.saving.set(true);
    this.failure.set(null);
    try {
      await this.data.voidTransaction(this.row().transactionId, reason);
      this.voided.emit('Movimiento anulado. Los saldos ya no lo cuentan.');
    } catch (error) {
      const message = friendlyError(error, 'No pudimos anular el movimiento. Inténtalo de nuevo.');
      void this.workspace.afterRefusal(error);
      this.failure.set(message);
      if (isRefusal(error)) this.refused.emit(message);
    } finally {
      this.saving.set(false);
    }
  }
}
