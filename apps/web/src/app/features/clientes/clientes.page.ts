import { Component, computed, inject, signal } from '@angular/core';
import { AsyncState, Badge, Empty, Page } from '../../ui';
import { friendlyError } from '../configuracion/shared/friendly-error';
import { SECTION_STYLES } from '../configuracion/shared/styles';
import { ClientesData } from './clientes.data';
import { DOC_TYPE_LABELS, KIND_LABELS, type CustomerRecord } from './clientes.models';
import { CustomerForm } from './customer-form';

/** Lowercase and strip accents so "perez" finds "Pérez". */
function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

@Component({
  selector: 'app-clientes.page',
  imports: [Page, AsyncState, Empty, Badge, CustomerForm],
  styles: [
    SECTION_STYLES,
    `
      .search { max-width: 24rem; }
      td small { display: block; color: var(--muted); overflow-wrap: anywhere; }
      .edit { margin-top: 0.4rem; padding: 0.2rem 0.6rem; font-size: 0.85rem; }
    `,
  ],
  template: `
    <pp-page title="Clientes" subtitle="A quién le vendes, cómo contactarlo y cuántos pedidos tiene">
      <button actions type="button" (click)="openForm(null)">Nuevo cliente</button>

      @if (formOpen()) {
        <!-- Keyed by customer so the form restarts when another one is picked. -->
        @for (key of [editing()?.id ?? 'new']; track key) {
          <app-customer-form [customer]="editing()" (saved)="afterSave()" (cancelled)="closeForm()" />
        }
      }

      <pp-async [loading]="loading()" [error]="error()">
        @if (customers().length === 0) {
          <pp-empty message="Todavía no tienes clientes. Crea el primero para poder vender a su nombre.">
            <button type="button" (click)="openForm(null)">Nuevo cliente</button>
          </pp-empty>
        } @else {
          <div class="toolbar">
            <input
              class="search"
              type="search"
              placeholder="Buscar por nombre, documento, teléfono o correo"
              aria-label="Buscar cliente"
              [value]="query()"
              (input)="query.set($any($event.target).value)"
            />
            <span class="muted">{{ visible().length }} de {{ customers().length }}</span>
          </div>

          @if (visible().length === 0) {
            <pp-empty message="Ningún cliente coincide con la búsqueda." />
          } @else {
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Documento y contacto</th>
                    <th class="num">Pedidos</th>
                  </tr>
                </thead>
                <tbody>
                  @for (customer of visible(); track customer.id) {
                    <tr>
                      <td>
                        {{ customer.name }}
                        <small>
                          {{ kindLabels[customer.kind] }}
                          @if (!customer.active) { · <pp-badge>Inactivo</pp-badge> }
                        </small>
                        <button type="button" class="secondary edit" (click)="openForm(customer)">Editar</button>
                      </td>
                      <td>
                        @if (customer.docType === 'none') {
                          <span class="muted">Sin documento</span>
                        } @else {
                          {{ docLabels[customer.docType] }} {{ customer.docNumber }}
                        }
                        @if (customer.phone) { <small>{{ customer.phone }}</small> }
                        @if (customer.email) { <small>{{ customer.email }}</small> }
                      </td>
                      <td class="num">{{ customer.orderCount }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        }
      </pp-async>
    </pp-page>
  `,
})
export class ClientesPage {
  private readonly data = inject(ClientesData);

  protected readonly customers = signal<CustomerRecord[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly query = signal('');
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<CustomerRecord | null>(null);

  protected readonly kindLabels = KIND_LABELS;
  protected readonly docLabels = DOC_TYPE_LABELS;

  protected readonly visible = computed(() => {
    const needle = normalize(this.query().trim());
    if (needle === '') return this.customers();

    return this.customers().filter((customer) =>
      normalize(
        [customer.name, customer.docNumber, customer.phone, customer.email].filter(Boolean).join(' '),
      ).includes(needle),
    );
  });

  constructor() {
    void this.reload();
  }

  protected openForm(customer: CustomerRecord | null): void {
    this.editing.set(customer);
    this.formOpen.set(true);
  }

  protected closeForm(): void {
    this.formOpen.set(false);
    this.editing.set(null);
  }

  protected afterSave(): void {
    this.closeForm();
    void this.reload();
  }

  private async reload(): Promise<void> {
    try {
      this.customers.set(await this.data.list());
      this.error.set(null);
    } catch (error) {
      this.error.set(friendlyError(error, 'No pudimos cargar los clientes. Inténtalo de nuevo en un momento.'));
    } finally {
      this.loading.set(false);
    }
  }
}
