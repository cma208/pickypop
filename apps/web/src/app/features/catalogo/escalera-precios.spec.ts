import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { CatalogoData } from './catalogo.data';
import type { PriceTierRow } from './catalogo.models';
import { CatalogoPermissions } from './catalogo.permissions';
import { CatalogoError } from './catalogo.util';
import { EscaleraPrecios } from './escalera-precios';
import { VariantCostModel } from './variant-cost.model';

const TIER: PriceTierRow = { id: 'tier-5', minQuantity: 5, unitPrice: 15, validFrom: '2026-10-08', note: null };

function open(options: { owner?: boolean; addTier?: ReturnType<typeof vi.fn>; tiers?: PriceTierRow[] } = {}) {
  const addTier = options.addTier ?? vi.fn(async () => undefined);
  TestBed.configureTestingModule({
    providers: [
      VariantCostModel,
      { provide: CatalogoData, useValue: { addTier } },
      { provide: CatalogoPermissions, useValue: { isOwner: signal(options.owner ?? true) } },
    ],
  });
  TestBed.inject(VariantCostModel).tiers.set(options.tiers ?? [TIER]);
  const fixture = TestBed.createComponent(EscaleraPrecios);
  fixture.componentRef.setInput('variantId', 'variant-1');
  fixture.detectChanges();
  return { fixture, addTier };
}

function type(fixture: ComponentFixture<EscaleraPrecios>, quantity: string, price: string): void {
  const [from, unitPrice] = fixture.nativeElement.querySelectorAll('form input') as NodeListOf<HTMLInputElement>;
  from!.value = quantity;
  from!.dispatchEvent(new Event('input'));
  unitPrice!.value = price;
  unitPrice!.dispatchEvent(new Event('input'));
  fixture.nativeElement.querySelector('form button[type="submit"]').click();
  fixture.detectChanges();
}

const text = (element: Element | null) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('EscaleraPrecios, a tier that gives the product away (T2-08)', () => {
  it('refuses a price of zero with its reason, next to the field', () => {
    const { fixture, addTier } = open();

    type(fixture, '3', '0');

    expect(text(fixture.nativeElement.querySelector('p.error.hint'))).toBe(
      'Precio: tiene que ser mayor que cero. Un escalón a S/ 0.00 regala el producto.',
    );
    expect(addTier).not.toHaveBeenCalled();
  });

  it('refuses a price with more decimals than soles have (T2-17)', () => {
    const { fixture, addTier } = open();

    type(fixture, '30', '13.505');

    expect(text(fixture.nativeElement.querySelector('p.error.hint'))).toBe('Precio: en soles, con hasta 2 decimales.');
    expect(addTier).not.toHaveBeenCalled();
  });

  it('marks an old tier at zero as short of the target even without costs to compare', () => {
    const { fixture } = open({ tiers: [{ ...TIER, id: 'tier-3', minQuantity: 3, unitPrice: 0 }] });

    expect(fixture.nativeElement.querySelector('tr.low')).not.toBeNull();
  });
});

describe('EscaleraPrecios, one message at a time (T2-20)', () => {
  it('drops the refusal of the database once a new attempt fails its own validation', async () => {
    const addTier = vi.fn(async () => {
      throw new CatalogoError('Ya hay un escalón desde esa cantidad.');
    });
    const { fixture } = open({ addTier });

    type(fixture, '5', '14');
    await vi.waitFor(() => expect(addTier).toHaveBeenCalled());
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text(fixture.nativeElement.querySelector('[role="alert"]'))).toBe('Ya hay un escalón desde esa cantidad.');

    type(fixture, '2.5', '14');

    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
    expect(text(fixture.nativeElement.querySelector('p.error.hint'))).toBe('Desde: un número entero de unidades.');
  });
});

describe('EscaleraPrecios, for the operator (T2-10)', () => {
  it('offers no «✕» and says who can remove a tier', () => {
    const { fixture } = open({ owner: false });

    expect(fixture.nativeElement.querySelector('button[aria-label^="Quitar el escalón"]')).toBeNull();
    expect(text(fixture.nativeElement)).toContain('Solo el dueño puede quitar un escalón.');
  });

  it('offers it to the owner', () => {
    const { fixture } = open();

    expect(fixture.nativeElement.querySelector('button[aria-label^="Quitar el escalón"]')).not.toBeNull();
  });
});
