import { Component, input } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Field } from '../../ui';
import type { ChannelOptions } from './quick-sale';

/**
 * Where the sale came from: the active channels, with the workshop's direct
 * channel already chosen. With no default there is a «Sin canal» to leave it
 * empty; with one, every sale names a channel. A workshop with no channels
 * does not see the question.
 */
@Component({
  selector: 'app-venta-rapida-canal',
  imports: [ReactiveFormsModule, Field],
  template: `
    @if (options().channels.length > 0) {
      <pp-field label="Canal" hint="Por dónde llegó la venta. Cambia el de siempre en Configuración › Canales de venta.">
        <select [formControl]="control()" aria-label="Canal de venta">
          @if (!options().defaultId) {
            <option value="">Sin canal</option>
          }
          @for (channel of options().channels; track channel.id) {
            <option [value]="channel.id">{{ channel.name }}</option>
          }
        </select>
      </pp-field>
    }
  `,
})
export class VentaRapidaCanal {
  readonly control = input.required<FormControl<string>>();
  readonly options = input.required<ChannelOptions>();
}
