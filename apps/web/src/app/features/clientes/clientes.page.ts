import { Component, computed, inject, signal } from '@angular/core';
import { AsyncState, Badge, Empty, Page } from '../../ui';
import { friendlyError } from '../../core/friendly-error';
import { SECTION_STYLES } from '../../core/styles';
import { ClientesData } from './clientes.data';
import { DOC_TYPE_LABELS, KIND_LABELS, type CustomerRecord } from './clientes.models';
import { ClienteHistoria } from './cliente-historia';
import { CustomerForm } from './customer-form';

/** Lowercase and strip accents so "perez" finds "Pérez". */
function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

@Component({
  selector: 'app-clientes.page',
  imports: [Page, AsyncState, Empty, Badge, CustomerForm, ClienteHistoria],
  styles: [
    SECTION_STYLES,
    `
      .search { max-width: 24rem; }
      td small { display: block; color: var(--muted); overflow-wrap: anywhere; }
      .edit { margin-top: 0.4rem; padding: 0.2rem 0.6rem; font-size: 0.85rem; }
      tr.picked { background: var(--accent-soft); }
    `,
  ],
  template: `
    <pp-page title="Clientes" subtitle="A quién le vendes, cómo contactarlo y cuántos pedidos tiene">
      <button actions type="button" (click)="openForm(null)">Nuevo cliente</button>

      @if (showing(); as customer) {
        <app-cliente-historia [customerId]="customer.id" [name]="customer.name" />
      }

      @if (formOpen()) {
        <!-- Keyed by customer so the form restarts when another one is picked. -->
        @for (key of [editing()?.id ?? 'new']; track key) {
          <app-customer-form [customer]="editing()" [existing]="customers()" (saved)="afterSave()" (cancelled)="closeForm()" />
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
                    <tr [class.picked]="showingId() === customer.id">
                      <td>
                        {{ customer.name }}
                        <small>
                          {{ kindLabels[customer.kind] }}
                          @if (!customer.active) { · <pp-badge>Inactivo</pp-badge> }
                        </small>
                        <button type="button" class="secondary edit" (click)="openForm(customer)">Editar</button>
                        <button type="button" class="ghost edit" (click)="toggleStory(customer)">
                          {{ showingId() === customer.id ? 'Ocultar historia' : 'Ver historia' }}
                        </button>
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
  /** Qué cliente tiene la ficha abierta. Solo una a la vez: es una lectura, no un panel. */
  protected readonly showingId = signal<string | null>(null);

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

  protected readonly showing = computed(
    () => this.customers().find((customer) => customer.id === this.showingId()) ?? null,
  );

  constructor() {
    void this.reload();
  }

  protected toggleStory(customer: CustomerRecord): void {
    this.showingId.set(this.showingId() === customer.id ? null : customer.id);
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
