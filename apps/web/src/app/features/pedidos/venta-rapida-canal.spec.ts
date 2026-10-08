import { TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import type { MemberRole } from '../../core/workspace';
import { workspaceAs } from '../../core/workspace.testing';
import type { ChannelOptions } from './quick-sale';
import { VentaRapidaCanal } from './venta-rapida-canal';

const CHANNELS = [
  { id: 'ch-ig', name: 'Instagram' },
  { id: 'ch-feria', name: 'Feria' },
];

function open(role: MemberRole, options: ChannelOptions) {
  TestBed.configureTestingModule({ providers: [provideRouter([]), workspaceAs(role)] });
  const fixture = TestBed.createComponent(VentaRapidaCanal);
  fixture.componentRef.setInput('control', new FormControl(options.defaultId ?? '', { nonNullable: true }));
  fixture.componentRef.setInput('options', options);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  return { element, text: (element.textContent ?? '').replace(/\s+/g, ' ') };
}

describe('VentaRapidaCanal, who is sent to set the channels (ADR-025)', () => {
  it('sends the owner to Configuración › Canales de venta when none is the default', () => {
    const { element, text } = open('owner', { channels: CHANNELS, defaultId: null });

    expect(element.querySelector('a[href*="configuracion"]')).not.toBeNull();
    expect(text).toContain('Elígelo una vez en');
  });

  it('tells an operator to ask the owner, without a link to a screen that only says no', () => {
    const { element, text } = open('operator', { channels: CHANNELS, defaultId: null });

    expect(element.querySelector('a')).toBeNull();
    expect(text).toContain('Pídele al dueño del taller que elija el canal de las ventas directas.');
    expect(text).not.toContain('crea «Directo»');
  });

  it('says whose the usual channel is in the hint', () => {
    expect(open('owner', { channels: CHANNELS, defaultId: 'ch-ig' }).text).toContain('Cambia el de siempre en Configuración');
    TestBed.resetTestingModule();
    const operator = open('operator', { channels: CHANNELS, defaultId: 'ch-ig' }).text;
    expect(operator).toContain('El de siempre lo elige el dueño del taller.');
    expect(operator).not.toContain('Configuración');
  });
});
