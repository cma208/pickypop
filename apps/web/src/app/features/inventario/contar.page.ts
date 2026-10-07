import { Component, computed, inject, signal } from '@angular/core';
import { friendlyError } from '../../core/friendly-error';
import { AsyncState, Badge, Card, Empty, FORMAT_PIPES, Page, Thumb } from '../../ui';
import { countPayload, difference, isChanged, needsCost, rowProblem, saveLabel, type CountRow } from './conteo';
import { ConteoData } from './conteo.data';
import { INVENTORY_STYLES } from './inventario.styles';

/**
 * Contar el estante: decir cuántas hay de verdad.
 *
 * Existe porque el estante de la aplicación empezó vacío mientras el taller ya
 * tenía pociones armadas y tapas impresas, y desde la etapa 1 entregar saca
 * del estante (ADR-020). Sirve igual para corregir después: una tapa que se
 * rompió, una poción regalada sin pedido.
 *
 * Cada fila ya viene con lo que la aplicación cree, así que solo se cambia lo
 * que no coincide. La base compara contra lo que hay al guardar y mueve solo
 * las diferencias.
 */
@Component({
  selector: 'app-contar',
  imports: [Page, Card, AsyncState, Empty, Badge, Thumb, ...FORMAT_PIPES],
  template: `
    <pp-page title="Contar el estante" subtitle="Cuántas hay de verdad, para que entregar no se trabe">
      <pp-async [loading]="loading()" [error]="error()">
        @if (rows().length === 0) {
          <pp-empty message="Todavía no hay piezas impresas ni productos que se armen. Se definen en Catálogo y recetas." />
        } @else {
          <p class="lead muted">
            Cada fila ya dice lo que la aplicación cree que hay. Cuenta lo que hay en el estante y cambia solo lo que no
            coincide: lo que sobra entra, lo que falta sale como ajuste, y queda anotado en el kardex como «Conteo del estante».
          </p>

          @for (group of groups(); track group.title) {
            @if (group.rows.length > 0) {
              <pp-card [heading]="group.title">
                <p class="muted hint">{{ group.hint }}</p>
                <ul class="rows">
                  @for (row of group.rows; track key(row)) {
                    <li [class.changed]="changed(row)">
                      <span class="with-thumb who">
                        <pp-thumb [path]="row.imagePath" [name]="row.name" />
                        <span>
                          <span class="strong">{{ row.name }}</span>
                          @if (row.detail) { <small class="sub">{{ row.detail }}</small> }
                        </span>
                      </span>

                      <span class="believed muted">La app cree <strong>{{ row.onHand }}</strong></span>

                      <label class="count">
                        Hay
                        <input
                          type="number"
                          min="0"
                          step="1"
                          inputmode="numeric"
                          [value]="row.counted ?? ''"
                          (input)="setCounted(row, $event)"
                          [attr.aria-label]="'Cuántas hay de ' + label(row)"
                        />
                      </label>

                      <span class="diff">
                        @if (changed(row)) {
                          <pp-badge [tone]="difference(row) > 0 ? 'good' : 'warn'">{{ signed(difference(row)) }}</pp-badge>
                        }
                      </span>

                      @if (needsCost(row)) {
                        <label class="cost">
                          Costo aproximado por unidad (S/)
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            inputmode="decimal"
                            [value]="row.typedCost ?? ''"
                            (input)="setCost(row, $event)"
                            [attr.aria-label]="'Costo por unidad de ' + label(row)"
                          />
                        </label>
                      } @else if (changed(row) && difference(row) > 0 && row.knownCost !== null) {
                        <small class="sub cost">Entran a {{ row.knownCost | money }} cada una.</small>
                      }

                      @if (rowProblem(row); as problem) { <p class="error problem">{{ problem }}</p> }
                    </li>
                  }
                </ul>
              </pp-card>
            }
          }

          <div class="save">
            <label class="note">
              Nota
              <input type="text" [value]="note()" (input)="setNote($event)" placeholder="Conteo del estante" autocomplete="off" />
            </label>
            <button type="button" (click)="save()" [disabled]="!canSave()">
              {{ saving() ? 'Guardando…' : buttonLabel() }}
            </button>
          </div>
          @if (notice(); as message) { <p class="notice" role="status">{{ message }}</p> }
          @if (saveError(); as message) { <p class="alert" role="alert">{{ message }}</p> }
        }
      </pp-async>
    </pp-page>
  `,
  styles: [
    INVENTORY_STYLES,
    `
    .lead { margin: 0 0 1rem; max-width: 46rem; font-size: 0.9rem; }
    .hint { margin: 0 0 0.5rem; font-size: 0.85rem; }
    .rows { list-style: none; margin: 0; padding: 0; }
    .rows li {
      display: grid; grid-template-columns: minmax(0, 1fr) auto 6rem 3.5rem; gap: 0.4rem 0.9rem; align-items: center;
      padding: 0.6rem 0.4rem; border-top: 1px solid var(--line);
    }
    .rows li.changed { background: var(--accent-soft); }
    .count { display: grid; gap: 0.15rem; font-size: 0.75rem; color: var(--muted); }
    .count input { width: 100%; text-align: right; }
    .cost { grid-column: 1 / -1; display: grid; gap: 0.15rem; font-size: 0.8rem; color: var(--muted); max-width: 16rem; }
    .problem { grid-column: 1 / -1; margin: 0; font-size: 0.8rem; }
    .save { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 0.75rem; margin: 1rem 0; }
    .save .note { display: grid; gap: 0.25rem; font-size: 0.85rem; flex: 1 1 14rem; max-width: 24rem; }
    @media (max-width: 40rem) {
      .rows li { grid-template-columns: minmax(0, 1fr) 5.5rem 3rem; }
      .rows li .who { grid-column: 1 / -1; }
      .believed { font-size: 0.85rem; }
    }
  `,
  ],
})
export class ContarPage {
  private readonly data = inject(ConteoData);

  protected readonly rows = signal<CountRow[]>([]);
  protected readonly note = signal('');
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly saveError = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  protected readonly groups = computed(() => [
    {
      title: 'Productos armados',
      hint: 'Lo que ya está listo para entregar. Los que salen tal cual de la impresora se cuentan por sus piezas.',
      rows: this.rows().filter((row) => row.kind === 'product'),
    },
    {
      title: 'Piezas impresas',
      hint: 'Lo que espera a que se arme, o a que se entregue suelto.',
      rows: this.rows().filter((row) => row.kind === 'part'),
    },
  ]);

  protected readonly buttonLabel = computed(() => saveLabel(this.rows()));

  protected readonly canSave = computed(
    () => !this.saving() && this.rows().some(isChanged) && this.rows().every((row) => rowProblem(row) === null),
  );

  protected readonly changed = isChanged;
  protected readonly difference = difference;
  protected readonly needsCost = needsCost;
  protected readonly rowProblem = rowProblem;

  constructor() {
    void this.load();
  }

  protected key(row: CountRow): string {
    return `${row.kind}:${row.variantId ?? row.inventoryItemId}`;
  }

  protected label(row: CountRow): string {
    return row.detail ? `${row.name} · ${row.detail}` : row.name;
  }

  protected signed(value: number): string {
    return value > 0 ? `+${value}` : `−${Math.abs(value)}`;
  }

  protected setCounted(row: CountRow, event: Event): void {
    this.update(row, { counted: readNumber(event) });
  }

  protected setCost(row: CountRow, event: Event): void {
    this.update(row, { typedCost: readNumber(event) });
  }

  protected setNote(event: Event): void {
    this.note.set((event.target as HTMLInputElement).value);
  }

  protected async save(): Promise<void> {
    if (!this.canSave()) return;
    this.saving.set(true);
    this.saveError.set(null);
    this.notice.set(null);
    try {
      const corrected = await this.data.save(countPayload(this.rows()), this.note().trim() || null);
      this.notice.set(
        corrected === 0
          ? 'No hubo nada que corregir: el estante ya coincidía.'
          : corrected === 1
            ? 'Listo: se corrigió 1 artículo. Queda en el kardex como «Conteo del estante».'
            : `Listo: se corrigieron ${corrected} artículos. Quedan en el kardex como «Conteo del estante».`,
      );
      this.note.set('');
      await this.load();
    } catch (error) {
      this.saveError.set(friendlyError(error, 'No pudimos guardar el conteo. Inténtalo de nuevo.'));
    } finally {
      this.saving.set(false);
    }
  }

  private update(row: CountRow, change: Partial<CountRow>): void {
    const key = this.key(row);
    this.rows.update((rows) => rows.map((current) => (this.key(current) === key ? { ...current, ...change } : current)));
    this.notice.set(null);
    this.saveError.set(null);
  }

  private async load(): Promise<void> {
    this.loading.set(this.rows().length === 0);
    try {
      this.rows.set(await this.data.rows());
      this.error.set(null);
    } catch (error) {
      this.error.set(friendlyError(error, 'No pudimos leer el estante. Inténtalo de nuevo.'));
    } finally {
      this.loading.set(false);
    }
  }
}

/** An empty field is "not counted yet", not zero. */
function readNumber(event: Event): number | null {
  const raw = (event.target as HTMLInputElement).value.trim();
  if (raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}
