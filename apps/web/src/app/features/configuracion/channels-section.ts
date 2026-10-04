import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AsyncState, Badge, Card, Empty, Field, FORMAT_PIPES } from '../../ui';
import { ConfiguracionData } from './configuracion.data';
import type { ChannelRecord } from './configuracion.models';
import { errorOf } from './shared/form-errors';
import { friendlyError } from './shared/friendly-error';
import { SECTION_STYLES } from './shared/styles';

const PERCENT_SCALE = 100;
const MAX_PERCENT = 99.99;
const RATE_DECIMALS = 10_000;

/** Sales channels with the commission each one charges. */
@Component({
  selector: 'app-channels-section',
  imports: [ReactiveFormsModule, Card, Field, Badge, Empty, AsyncState, FORMAT_PIPES],
  styles: SECTION_STYLES,
  template: `
    <pp-async [loading]="loading()" [error]="loadError()">
      <pp-card heading="Canales de venta">
        <p class="muted">
          Por dónde llegan las ventas. La comisión es lo que el canal se queda de cada venta (0 % si no cobra).
        </p>
        <div class="toolbar">
          @if (!formOpen()) {
            <button type="button" (click)="open(null)">Nuevo canal</button>
          }
        </div>

        @if (formOpen()) {
          <form class="form-box" [formGroup]="form" (ngSubmit)="submit()">
            <h3>{{ editing() ? 'Editar canal' : 'Nuevo canal' }}</h3>
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
                  <pp-badge [tone]="channel.active ? 'good' : 'neutral'">{{ channel.active ? 'Activo' : 'Inactivo' }}</pp-badge>
                </header>
                <p class="muted">
                  {{ channel.commissionRate === 0 ? 'Sin comisión' : 'Comisión de ' + (channel.commissionRate | percent1) }}
                </p>
                <div class="actions">
                  <button type="button" class="secondary" (click)="open(channel)">Editar</button>
                </div>
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
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<ChannelRecord | null>(null);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
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
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;

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
      await this.reload();
    } catch (error) {
      this.error.set(friendlyError(error, 'No pudimos guardar el canal.'));
    } finally {
      this.saving.set(false);
    }
  }

  private async reload(): Promise<void> {
    try {
      this.channels.set(await this.data.channels());
      this.loadError.set(null);
    } catch (error) {
      this.loadError.set(friendlyError(error, 'No pudimos cargar los canales de venta.'));
    } finally {
      this.loading.set(false);
    }
  }
}
