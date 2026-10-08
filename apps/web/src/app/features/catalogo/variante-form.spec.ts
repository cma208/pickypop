import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { ArticlePhotos } from '../../core/article-photos';
import { Media } from '../../core/media';
import { CatalogoData } from './catalogo.data';
import type { Variant, VariantUsage } from './catalogo.models';
import { CatalogoPermissions } from './catalogo.permissions';
import { VarianteForm } from './variante-form';

const VARIANT: Variant = {
  id: 'variant-1',
  productId: 'product-1',
  name: 'Llavero copia',
  options: [],
  skuCode: null,
  listPrice: 5,
  minOrderUnits: null,
  active: true,
  imagePath: null,
};

async function open(options: { usage: VariantUsage; owner?: boolean; data?: object }) {
  const data = {
    variantUsage: vi.fn(async () => options.usage),
    setVariantActive: vi.fn(async () => undefined),
    updateVariant: vi.fn(async () => undefined),
    ...options.data,
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: CatalogoData, useValue: data },
      { provide: CatalogoPermissions, useValue: { isOwner: signal(options.owner ?? true) } },
      { provide: Media, useValue: { url: async () => null, version: signal(0) } },
      { provide: ArticlePhotos, useValue: { resolve: async () => ({ path: null, kind: 'product' }) } },
    ],
  });
  const fixture = TestBed.createComponent(VarianteForm);
  fixture.componentRef.setInput('productId', 'product-1');
  fixture.componentRef.setInput('variant', VARIANT);
  fixture.componentRef.setInput('siblings', [VARIANT, { id: 'variant-2', name: 'Llavero' }]);
  fixture.detectChanges();
  await vi.waitFor(() => expect(data.variantUsage).toHaveBeenCalled());
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, data };
}

/** Where the variant is used; nothing pending unless said. */
const usage = (quotes: number, orders: number, shelf: number, pending: Partial<VariantUsage> = {}): VariantUsage => ({
  quotes,
  orders,
  shelf,
  openOrders: 0,
  onHand: 0,
  ...pending,
});

const text = (element: Element | null) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

function button(fixture: ComponentFixture<VarianteForm>, label: string): HTMLButtonElement | null {
  return (
    ([...fixture.nativeElement.querySelectorAll('button')] as HTMLButtonElement[]).find(
      (candidate) => candidate.textContent?.trim() === label,
    ) ?? null
  );
}

describe('VarianteForm, a variant that a quote or an order uses (T2-01)', () => {
  it('does not offer to delete it: it says where it is used and offers to switch it off', async () => {
    const { fixture } = await open({ usage: usage(1, 2, 0) });

    expect(button(fixture, 'Eliminar variante')).toBeNull();
    expect(button(fixture, 'Desactivar variante')).not.toBeNull();
    expect(text(fixture.nativeElement)).toContain('No se puede eliminar: está en 1 cotización y en 2 pedidos.');
  });

  it('switches it off instead', async () => {
    const { fixture, data } = await open({ usage: usage(1, 0, 0) });

    button(fixture, 'Desactivar variante')!.click();
    await vi.waitFor(() => expect(data.setVariantActive).toHaveBeenCalledWith('variant-1', false));
  });
});

describe('VarianteForm, switching off a variant with orders still to deliver', () => {
  const pending = () => usage(0, 6, 1, { openOrders: 5, onHand: 2 });

  it('says before what it leaves stuck in Armar and in the shelf count', async () => {
    const { fixture } = await open({ usage: pending() });

    expect(text(fixture.nativeElement)).toContain(
      'Tiene 5 pedidos sin entregar y quedan 2 unidades armadas en el estante. Desactivada, deja de aparecer en Armar',
    );
    expect(text(fixture.nativeElement)).not.toContain('Tiene 0');
  });

  it('asks before switching it off, and does nothing if the answer is no', async () => {
    const { fixture, data } = await open({ usage: pending() });
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(false);

    button(fixture, 'Desactivar variante')!.click();
    await fixture.whenStable();

    expect(ask).toHaveBeenCalledWith(expect.stringContaining('esos pedidos no se podrán armar'));
    expect(data.setVariantActive).not.toHaveBeenCalled();
    ask.mockRestore();
  });

  it('asks too when the box «Variante activa» is unticked and saved', async () => {
    const { fixture, data } = await open({ usage: pending() });
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(false);

    const box: HTMLInputElement = fixture.nativeElement.querySelector('input[formcontrolname="active"]');
    box.click();
    fixture.detectChanges();
    expect(text(fixture.nativeElement.querySelector('label.check + p.notice'))).toContain('Tiene 5 pedidos sin entregar');

    fixture.nativeElement.querySelector('button[type="submit"]').click();
    await fixture.whenStable();

    expect(ask).toHaveBeenCalled();
    expect(data.updateVariant).not.toHaveBeenCalled();
    ask.mockRestore();
  });

  it('switches off without asking a variant with nothing pending', async () => {
    const { fixture, data } = await open({ usage: usage(1, 1, 0) });
    const ask = vi.spyOn(window, 'confirm');

    button(fixture, 'Desactivar variante')!.click();
    await vi.waitFor(() => expect(data.setVariantActive).toHaveBeenCalledWith('variant-1', false));
    expect(ask).not.toHaveBeenCalled();
    ask.mockRestore();
  });
});

describe('VarianteForm, a variant nothing uses', () => {
  it('offers the owner to delete it', async () => {
    const { fixture } = await open({ usage: usage(0, 0, 0) });

    expect(button(fixture, 'Eliminar variante')).not.toBeNull();
  });

  it('tells the operator that only the owner deletes a variant (T2-10)', async () => {
    const { fixture } = await open({ usage: usage(0, 0, 0), owner: false });

    expect(button(fixture, 'Eliminar variante')).toBeNull();
    expect(text(fixture.nativeElement)).toContain('Solo el dueño puede eliminar una variante.');
  });
});

describe('VarianteForm, what cannot be saved', () => {
  function setValue(fixture: ComponentFixture<VarianteForm>, selector: string, value: string): void {
    const input: HTMLInputElement = fixture.nativeElement.querySelector(selector);
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  it('says a name of spaces is no name, and a sibling with the same name is taken (T2-19, T2-15)', async () => {
    const { fixture, data } = await open({ usage: usage(0, 0, 0) });

    setValue(fixture, 'input[formcontrolname="name"]', '   ');
    fixture.nativeElement.querySelector('button[type="submit"]').click();
    fixture.detectChanges();
    expect(text(fixture.nativeElement)).toContain('Escribe el nombre.');

    setValue(fixture, 'input[formcontrolname="name"]', ' LLAVERO ');
    fixture.detectChanges();
    expect(text(fixture.nativeElement)).toContain('Ya hay una variante «Llavero» en este producto.');
    expect(data.updateVariant).not.toHaveBeenCalled();
  });

  it('refuses a list price of zero or with more than two decimals (T2-08, T2-17)', async () => {
    const { fixture, data } = await open({ usage: usage(0, 0, 0) });

    setValue(fixture, 'input[formcontrolname="listPrice"]', '0');
    fixture.nativeElement.querySelector('button[type="submit"]').click();
    fixture.detectChanges();
    expect(text(fixture.nativeElement)).toContain('Tiene que ser mayor que cero. Si todavía no tiene precio, déjalo vacío.');

    setValue(fixture, 'input[formcontrolname="listPrice"]', '19.999');
    fixture.detectChanges();
    expect(text(fixture.nativeElement)).toContain('En soles, con hasta 2 decimales.');
    expect(data.updateVariant).not.toHaveBeenCalled();
  });
});
