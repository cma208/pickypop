import { Component, computed, inject, input, output, signal } from '@angular/core';
import { friendlyError } from '../../core/friendly-error';
import { SECTION_STYLES } from '../../core/styles';
import { Field, FORMAT_PIPES } from '../../ui';
import { FinanzasData, type LedgerRow } from './finanzas.data';
import { TRANSACTION_TYPE_LABELS } from './finanzas.models';
import { FINANCE_STYLES } from './finanzas.styles';

/**
 * Annuls a movement. There is no delete: the row stays on the record with the
 * reason, and the table itself refuses to void one without saying why.
 */
@Component({
  selector: 'app-void-form',
  imports: [Field, FORMAT_PIPES],
  styles: [SECTION_STYLES, FINANCE_STYLES],
  template: `
    <section class="form-box">
      <h3>Anular movimiento</h3>

      <p class="muted">
        {{ typeLabels[row().type] }} de <strong>{{ row().amount | money }}</strong> en
        {{ row().accountName }}, del {{ row().occurredAt | fecha }}.
        El movimiento no se borra: deja de contar en los saldos y queda registrado como anulado.
      </p>

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
    </section>
  `,
})
export class VoidForm {
  private readonly data = inject(FinanzasData);

  readonly row = input.required<LedgerRow>();
  readonly voided = output<string>();
  readonly cancelled = output<void>();

  protected readonly typeLabels = TRANSACTION_TYPE_LABELS;

  protected readonly reason = signal('');
  protected readonly touched = signal(false);
  protected readonly saving = signal(false);
  protected readonly failure = signal<string | null>(null);

  protected readonly problem = computed(() =>
    this.touched() && !this.reason().trim() ? 'El motivo es obligatorio.' : null,
  );

  protected onReason(event: Event): void {
    this.touched.set(true);
    this.reason.set((event.target as HTMLTextAreaElement).value);
  }

  protected async submit(): Promise<void> {
    this.touched.set(true);
    const reason = this.reason().trim();
    if (!reason || this.saving()) return;

    this.saving.set(true);
    this.failure.set(null);
    try {
      await this.data.voidTransaction(this.row().transactionId, reason);
      this.voided.emit('Movimiento anulado. Los saldos ya no lo cuentan.');
    } catch (error) {
      this.failure.set(friendlyError(error, 'No pudimos anular el movimiento. Inténtalo de nuevo.'));
    } finally {
      this.saving.set(false);
    }
  }
}
