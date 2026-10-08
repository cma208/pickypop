import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AsyncState, Badge, Card, Empty, Field, FORMAT_PIPES } from '../../ui';
import { ConfiguracionData } from './configuracion.data';
import type { ChannelRecord } from './configuracion.models';
import { errorOf, requiredText } from '../../core/form-errors';
import { friendlyError } from '../../core/friendly-error';
import { SECTION_STYLES } from '../../core/styles';
import { isOwnerRole } from '../../core/workspace';

const PERCENT_SCALE = 100;
const MAX_PERCENT = 99.99;
const RATE_DECIMALS = 10_000;

/**
 * Sales channels with the commission each one charges, and which one stands
 * for direct sales: the one the quick sale preselects and the database uses
 * when a sale names none. Nothing chooses it on its own: with none chosen
 * the section says so, because the quick sale would sell without a channel.
 * The commission only grosses up the price of made-to-order work in the
 * quote calculator; a catalogue sale is at its list price, so for the quick
 * sale the channel is only recorded.
 *
 * Only the owner changes channels and the default (ADR-025); the operator sees
 * them, because the quick sale offers them.
 */
@Component({
  selector: 'app-channels-section',
  imports: [ReactiveFormsModule, Card, Field, Badge, Empty, AsyncState, FORMAT_PIPES],
  styles: SECTION_STYLES,
  template: `
    <pp-async [loading]="loading()" [error]="loadError()">
      <pp-card heading="Canales de venta">
        <p class="muted">
          Por dónde llegan las ventas. La comisión es lo que el canal se queda de cada venta (0 % si no cobra): el
          cotizador la suma al precio de lo hecho a medida; lo del catálogo se vende a su precio de lista. El canal
          «Por defecto» es el de las ventas directas: la Venta rápida lo trae elegido.
        </p>
        @if (!canEdit()) {
          <p class="notice warn">Solo el dueño del taller puede cambiar los canales de venta. Aquí los ves en modo lectura.</p>
        }
        @if (canEdit()) {
          <div class="toolbar">
            <!-- Always there: when it vanished while the form was open, the form's own title took its place and looked like the button. -->
            <button type="button" [class.secondary]="formOpen()" (click)="open(null)">+ Nuevo canal</button>
          </div>
        }

        @if (missingDefault()) {
          <p class="notice warn" role="status">
            Ningún canal es el de las ventas directas: la Venta rápida no trae ninguno elegido, y lo que se venda sin
            cambiarlo queda sin canal.
            {{ canEdit() ? 'Elige el que corresponda con «Usar por defecto».' : 'Pídele al dueño del taller que elija uno.' }}
          </p>
        }
        @if (notice(); as text) {
          <p class="notice" role="status">{{ text }}</p>
        }
        @if (listError(); as message) {
          <p class="error" role="alert">{{ message }}</p>
        }

        @if (formOpen()) {
          <form class="form-box" [formGroup]="form" (ngSubmit)="submit()">
            <h3>{{ editing() ? 'Editar «' + editing()?.name + '»' : 'Datos del canal nuevo' }}</h3>
            <div class="grid two">
              <pp-field label="Nombre" [required]="true" [error]="nameError()">
                <input formControlName="name" placeholder="Ej.: Instagram, Feria, Tienda online" />
              </pp-field>
              <pp-field label="Comisión (%)" [required]="true" [error]="rateError()" hint="Sobre el precio de venta.">
                <input type="number" step="0.01" min="0" formControlName="commissionPct" inputmode="decimal" />
              </pp-field>
            </div>
            <label class="check"><input type="checkbox" formControlName="active" /> Canal activo</label>
            @if (error(); as message) {
              <p class="error" role="alert">{{ message }}</p>
            }
            <div class="form-actions">
              <button type="submit" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar canal' }}</button>
              <button type="button" class="secondary" (click)="formOpen.set(false)">Cancelar</button>
            </div>
          </form>
        }

        @if (channels().length === 0) {
          <pp-empty message="Aún no hay canales de venta." />
        } @else {
          <ul class="items">
            @for (channel of channels(); track channel.id) {
              <li class="item">
                <header>
                  <span class="title">{{ channel.name }}</span>
                  @if (channel.id === defaultId()) {
                    <pp-badge tone="info">Por defecto</pp-badge>
                  }
                  <pp-badge [tone]="channel.active ? 'good' : 'neutral'">{{ channel.active ? 'Activo' : 'Inactivo' }}</pp-badge>
                </header>
                <p class="muted">
                  {{ channel.commissionRate === 0 ? 'Sin comisión' : 'Comisión de ' + (channel.commissionRate | percent1) }}
                </p>
                @if (canEdit()) {
                  <div class="actions">
                    <button type="button" class="secondary" (click)="open(channel)">Editar</button>
                    @if (channel.active && channel.id !== defaultId()) {
                      <button type="button" class="secondary" [disabled]="saving()" (click)="makeDefault(channel)">
                        Usar por defecto
                      </button>
                    }
                  </div>
                }
              </li>
            }
          </ul>
        }
      </pp-card>
    </pp-async>
  `,
})
export class ChannelsSection {
  private readonly data = inject(ConfiguracionData);

  protected readonly channels = signal<ChannelRecord[]>([]);
  /** The channel of direct sales as the database applies it: the owner's choice, while it is active. */
  protected readonly defaultId = signal<string | null>(null);
  /** Active channels and none of them the default: the quick sale would sell without one. */
  protected readonly missingDefault = computed(
    () => !this.loading() && this.defaultId() === null && this.channels().some((channel) => channel.active),
  );
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly canEdit = signal(false);
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<ChannelRecord | null>(null);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly listError = signal<string | null>(null);

  protected readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [requiredText] }),
    commissionPct: new FormControl<number | null>(0, [
      Validators.required,
      Validators.min(0),
      Validators.max(MAX_PERCENT),
    ]),
    active: new FormControl(true, { nonNullable: true }),
  });

  constructor() {
    void this.reload();
  }

  protected open(channel: ChannelRecord | null): void {
    this.form.reset({
      name: channel?.name ?? '',
      commissionPct: channel ? Math.round(channel.commissionRate * PERCENT_SCALE * 100) / 100 : 0,
      active: channel?.active ?? true,
    });
    this.error.set(null);
    this.notice.set(null);
    this.editing.set(channel);
    this.formOpen.set(true);
  }

  protected nameError(): string | null {
    return errorOf(this.form.controls.name, { required: 'Escribe el nombre del canal.' });
  }

  protected rateError(): string | null {
    return errorOf(this.form.controls.commissionPct, {
      required: 'Indica la comisión (0 si no cobra).',
      min: 'La comisión no puede ser negativa.',
      max: 'La comisión debe ser menor que 100 %.',
    });
  }

  protected async submit(): Promise<void> {
    if (this.saving()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const value = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);

    try {
      await this.data.saveChannel(this.editing()?.id ?? null, {
        name: value.name,
        commissionRate: Math.round(((value.commissionPct ?? 0) / PERCENT_SCALE) * RATE_DECIMALS) / RATE_DECIMALS,
        active: value.active,
      });
      this.formOpen.set(false);
      this.notice.set(`Canal «${value.name.trim()}» guardado.`);
      await this.reload();
    } catch (error) {
      this.error.set(friendlyError(error, 'No pudimos guardar el canal.'));
      if (await this.data.afterRefusal(error)) {
        this.formOpen.set(false);
        this.listError.set(this.error());
        await this.reload();
      }
    } finally {
      this.saving.set(false);
    }
  }

  protected async makeDefault(channel: ChannelRecord): Promise<void> {
    if (this.saving()) return;

    this.saving.set(true);
    this.listError.set(null);
    this.notice.set(null);
    try {
      await this.data.saveDefaultChannel(channel.id);
      this.notice.set(`«${channel.name}» es el canal por defecto: la Venta rápida lo trae elegido.`);
      await this.reload();
    } catch (error) {
      this.listError.set(friendlyError(error, 'No pudimos cambiar el canal por defecto.'));
      if (await this.data.afterRefusal(error)) await this.reload();
    } finally {
      this.saving.set(false);
    }
  }

  private async reload(): Promise<void> {
    try {
      const [channels, defaultId, role] = await Promise.all([
        this.data.channels(),
        this.data.defaultChannel(),
        this.data.currentRole(),
      ]);
      this.channels.set(channels);
      this.defaultId.set(defaultId);
      this.canEdit.set(isOwnerRole(role));
      this.loadError.set(null);
    } catch (error) {
      this.loadError.set(friendlyError(error, 'No pudimos cargar los canales de venta.'));
    } finally {
      this.loading.set(false);
    }
  }
}
