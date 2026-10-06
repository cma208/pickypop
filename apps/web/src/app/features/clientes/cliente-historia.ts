import { Component, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { friendlyError } from '../../core/friendly-error';
import { SECTION_STYLES } from '../../core/styles';
import { Badge, Card, Empty, FORMAT_PIPES } from '../../ui';
import { PAYMENT_STATUS_LABEL, PAYMENT_STATUS_TONE, STATUS_LABEL, STATUS_TONE } from '../pedidos/pedidos.labels';
import { STAGE_LABEL, STAGE_TONE } from '../oportunidades/oportunidades.models';
import { ClientesData, type CustomerStory } from './clientes.data';

/**
 * La relación con un cliente de un vistazo: sus tratos, sus pedidos, lo que
 * ha comprado y lo que debe. Antes había que saltar entre cuatro pantallas
 * para responder "¿y este cliente qué tal?".
 */
@Component({
  selector: 'app-cliente-historia',
  imports: [RouterLink, Card, Badge, Empty, ...FORMAT_PIPES],
  styles: [
    SECTION_STYLES,
    `
      .figures { display: flex; flex-wrap: wrap; gap: 1.25rem; margin-bottom: 1rem; }
      .figure { display: grid; gap: 0.1rem; }
      .figure .value { font-size: 1.15rem; font-weight: 650; }
      .figure .label { font-size: 0.75rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
      .figure .value.owes { color: var(--danger); }
      h3 { margin: 1.25rem 0 0.5rem; font-size: 0.95rem; }
      h3:first-of-type { margin-top: 0; }
    `,
  ],
  template: `
    <pp-card [heading]="'Historia de ' + name()">
      <div class="toolbar">
        <span class="grow"></span>
        <button type="button" class="ghost" (click)="reload()">Actualizar</button>
      </div>

      @if (error(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      } @else if (story(); as s) {
        <div class="figures">
          <span class="figure">
            <span class="value">{{ s.orders }}</span><span class="label">Pedidos</span>
          </span>
          <span class="figure">
            <span class="value">{{ s.sold | money }}</span><span class="label">Comprado</span>
          </span>
          <span class="figure">
            <span class="value" [class.owes]="s.balance > 0">{{ s.balance | money }}</span>
            <span class="label">Debe</span>
          </span>
          <span class="figure">
            <span class="value">{{ s.openOpportunities }}</span><span class="label">Tratos abiertos</span>
          </span>
          <span class="figure">
            <span class="value">{{ s.lastOrderOn ? (s.lastOrderOn | fecha) : '—' }}</span>
            <span class="label">Último pedido</span>
          </span>
        </div>

        <h3>Sus tratos</h3>
        @if (s.opportunities.length === 0) {
          <pp-empty message="Sin tratos registrados. Un trato agrupa lo que se le cotizó y lo que compró.">
            <a routerLink="/oportunidades"><button type="button" class="secondary">Ir a oportunidades</button></a>
          </pp-empty>
        } @else {
          <div class="table-wrap">
            <table>
              <thead><tr><th>Trato</th><th>Etapa</th><th>Se decide</th></tr></thead>
              <tbody>
                @for (deal of s.opportunities; track deal.id) {
                  <tr>
                    <td>
                      {{ deal.title }}
                      @if (deal.blockedReason; as reason) { <small class="muted">Esperando: {{ reason }}</small> }
                    </td>
                    <td><pp-badge [tone]="stageTone[deal.stage]">{{ stageLabel[deal.stage] }}</pp-badge></td>
                    <td>{{ deal.expectedClose ? (deal.expectedClose | fecha) : '—' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }

        <h3>Sus pedidos</h3>
        @if (s.recentOrders.length === 0) {
          <pp-empty message="Todavía no le has vendido nada." />
        } @else {
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>Número</th><th>Estado</th><th>Cobro</th><th class="num">Total</th><th class="num">Saldo</th></tr>
              </thead>
              <tbody>
                @for (order of s.recentOrders; track order.id) {
                  <tr>
                    <td><a [routerLink]="['/pedidos', order.id]">{{ order.number }}</a></td>
                    <td><pp-badge [tone]="statusTone[order.status]">{{ statusLabel[order.status] }}</pp-badge></td>
                    <td><pp-badge [tone]="paymentTone[order.paymentStatus]">{{ paymentLabel[order.paymentStatus] }}</pp-badge></td>
                    <td class="num">{{ order.total | money }}</td>
                    <td class="num">{{ order.balance | money }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }

        <h3>Lo que ha comprado</h3>
        @if (s.purchases.length === 0) {
          <pp-empty message="Sin líneas de venta todavía." />
        } @else {
          <div class="table-wrap">
            <table>
              <thead><tr><th>Producto</th><th class="num">Unidades</th><th class="num">Total</th><th>Última vez</th></tr></thead>
              <tbody>
                @for (item of s.purchases; track item.description) {
                  <tr>
                    <td>{{ item.description }}</td>
                    <td class="num">{{ item.quantity }}</td>
                    <td class="num">{{ item.total | money }}</td>
                    <td>{{ item.lastOrderedOn | fecha }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      } @else {
        <p class="muted">Cargando…</p>
      }
    </pp-card>
  `,
})
export class ClienteHistoria {
  private readonly data = inject(ClientesData);

  readonly customerId = input.required<string>();
  readonly name = input.required<string>();

  protected readonly story = signal<CustomerStory | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly stageLabel = STAGE_LABEL;
  protected readonly stageTone = STAGE_TONE;
  protected readonly statusLabel = STATUS_LABEL;
  protected readonly statusTone = STATUS_TONE;
  protected readonly paymentLabel = PAYMENT_STATUS_LABEL;
  protected readonly paymentTone = PAYMENT_STATUS_TONE;

  constructor() {
    effect(() => {
      void this.load(this.customerId());
    });
  }

  protected reload(): void {
    void this.load(this.customerId());
  }

  private async load(id: string): Promise<void> {
    this.story.set(null);
    try {
      this.story.set(await this.data.story(id));
      this.error.set(null);
    } catch (error) {
      this.error.set(friendlyError(error, 'No pudimos leer la historia de este cliente.'));
    }
  }
}
