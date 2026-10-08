import { Component, computed, inject, input } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CurrentWorkspace } from '../../core/workspace';
import { Field } from '../../ui';
import type { ChannelOptions } from './quick-sale';

/** Where the channels and the default one are set. */
const CHANNELS_TAB = { tab: 'sales' };

/**
 * Where the sale came from: the active channels, with the workshop's direct
 * channel already chosen. With no default there is a «Sin canal» to leave it
 * empty, and the screen says that one is missing: nothing guesses which
 * channel the sales at the door come through, and without saying so every
 * sale would go without one unnoticed. A workshop with no channels does not
 * see the question.
 */
@Component({
  selector: 'app-venta-rapida-canal',
  imports: [ReactiveFormsModule, RouterLink, Field],
  template: `
    @if (options().channels.length > 0) {
      <pp-field label="Canal" [hint]="options().defaultId ? defaultHint() : undefined">
        <select [formControl]="control()" aria-label="Canal de venta">
          @if (!options().defaultId) {
            <option value="">Sin canal</option>
          }
          @for (channel of options().channels; track channel.id) {
            <option [value]="channel.id">{{ channel.name }}</option>
          }
        </select>
      </pp-field>
      @if (!options().defaultId) {
        <!-- The channels are configuration (ADR-025): only the owner is sent to set them. -->
        <p class="alert-warn missing" role="status">
          Ningún canal es el de las ventas directas, así que no viene ninguno elegido.
          @if (isOwner()) {
            Elígelo una vez en
            <a routerLink="/configuracion" [queryParams]="channelsTab">Configuración › Canales de venta</a>
            («Usar por defecto»), o crea «Directo» si no lo tienes.
          } @else {
            Pídele al dueño del taller que elija el canal de las ventas directas.
          }
        </p>
      }
    }
  `,
  styles: `
    .missing { margin-top: -0.4rem; font-size: var(--fs-sm); }
  `,
})
export class VentaRapidaCanal {
  readonly control = input.required<FormControl<string>>();
  readonly options = input.required<ChannelOptions>();

  protected readonly isOwner = inject(CurrentWorkspace).isOwner;
  protected readonly channelsTab = CHANNELS_TAB;
  protected readonly defaultHint = computed(() =>
    this.isOwner()
      ? 'Por dónde llegó la venta. Cambia el de siempre en Configuración › Canales de venta.'
      : 'Por dónde llegó la venta. El de siempre lo elige el dueño del taller.',
  );
}
