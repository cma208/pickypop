import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ArticlePhotos } from '../../core/article-photos';
import { Media } from '../../core/media';
import { FinanzasData } from '../finanzas/finanzas.data';
import { CompraForm } from './compra-form';
import {
  InventarioData,
  type PaymentAccount,
  type PurchaseDraft,
  type RegisteredPurchase,
  type SkuSummary,
} from './inventario.data';

const SKU: SkuSummary = {
  id: 'sku-1',
  brandId: 'brand-1',
  brandName: 'Krear3D',
  materialId: 'material-1',
  materialCode: 'PLA',
  finishId: null,
  finishName: null,
  abrasive: false,
  abrasiveBecause: null,
  colorName: 'Negro',
  colorHex: '#000000',
  diameterMm: 1.75,
  netWeightG: 1000,
  tareG: 200,
  minStockG: 0,
  replacementCostPerKg: null,
  active: true,
  onHandG: 0,
  weightedCostPerGram: null,
  belowMinimum: false,
};

const CASH: PaymentAccount = { id: 'cash', name: 'Efectivo', defaultMethod: 'cash', openingBalanceOn: '2026-01-01' };

const REGISTERED: RegisteredPurchase = {
  id: 'purchase-1',
  total: 120,
  paid: 120,
  spools: [{ code: 'PLA-NEGRO-01', materialCode: 'PLA', colorName: 'Negro' }],
};

/** What postgrest-js returns when fetch throws: the request may have gone in. */
const LOST = { code: '', message: 'TypeError: Failed to fetch' };
/** What the database says when it refuses: nothing was written. */
const REFUSED = { code: 'P0001', message: 'La cuenta Efectivo está desactivada.' };

interface Control {
  setValue(value: unknown): void;
}

interface Internals {
  form: { controls: Record<'paidFrom' | 'note', Control> };
  lines: { at(index: number): { controls: Record<'target' | 'quantity' | 'unitPrice', Control> } };
  askConfirmation(): void;
  save(): Promise<void>;
}

/** An answer that arrives when the test says so: the request is on its way until then. */
function later(): { answer: Promise<object | null>; arrive(value: object | null): void } {
  let arrive: (value: object | null) => void = () => undefined;
  const answer = new Promise<object | null>((resolve) => (arrive = resolve));
  return { answer, arrive };
}

function open(answers: Array<object | null | Promise<object | null>>) {
  const calls: Array<[PurchaseDraft, string]> = [];
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: Media, useValue: { url: async () => null, version: signal(0) } },
      { provide: ArticlePhotos, useValue: { resolve: async () => ({ path: null, kind: 'spool' }) } },
      { provide: FinanzasData, useValue: { paymentCategories: async () => ({ order: null, purchase: null }) } },
      {
        provide: InventarioData,
        useValue: {
          registerPurchase: async (draft: PurchaseDraft, key: string) => {
            calls.push([draft, key]);
            const answer = await (answers.shift() ?? null);
            if (answer) throw answer;
            return REGISTERED;
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(CompraForm);
  fixture.componentRef.setInput('skuOptions', [SKU]);
  fixture.componentRef.setInput('itemOptions', []);
  fixture.componentRef.setInput('supplierOptions', []);
  fixture.componentRef.setInput('accountOptions', [CASH]);
  const outcome = { saved: 0, refused: 0 };
  fixture.componentInstance.saved.subscribe(() => outcome.saved++);
  fixture.componentInstance.refused.subscribe(() => outcome.refused++);
  fixture.detectChanges();

  const internals = fixture.componentInstance as unknown as Internals;
  const line = internals.lines.at(0).controls;
  line.target.setValue(`sku:${SKU.id}`);
  line.quantity.setValue(2);
  line.unitPrice.setValue(60);
  internals.form.controls.paidFrom.setValue(CASH.id);
  internals.askConfirmation();
  fixture.detectChanges();

  return { fixture, calls, outcome, internals };
}

const text = (fixture: ComponentFixture<CompraForm>) =>
  ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');

async function confirm(fixture: ComponentFixture<CompraForm>, internals: Internals): Promise<void> {
  await internals.save();
  fixture.detectChanges();
}

describe('CompraForm', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  it('does not say «No se guardó nada» when the answer was lost, and retries with the same key (T1-04)', async () => {
    const { fixture, calls, outcome, internals } = open([LOST, null]);

    await confirm(fixture, internals);

    expect(text(fixture)).toContain('No sabemos si la compra se guardó.');
    expect(text(fixture)).not.toContain('No se guardó nada');
    // The page does not reload behind a form whose purchase may be in.
    expect(outcome.refused).toBe(0);
    // Locked: a change would be another key, and another purchase.
    expect((fixture.nativeElement as HTMLElement).querySelector('fieldset')?.disabled).toBe(true);

    await confirm(fixture, internals);

    expect(calls.length).toBe(2);
    expect(calls[1]?.[1]).toBe(calls[0]?.[1]);
    expect(outcome.saved).toBe(1);
  });

  it('says nothing was saved when the database refused it, and lets the form change again', async () => {
    const { fixture, outcome, internals } = open([LOST, REFUSED]);

    await confirm(fixture, internals);
    await confirm(fixture, internals);

    expect(text(fixture)).toContain('No se guardó nada.');
    expect(text(fixture)).toContain('La cuenta Efectivo está desactivada.');
    expect(text(fixture)).not.toContain('No sabemos si la compra se guardó.');
    expect(outcome.refused).toBe(1);
    expect((fixture.nativeElement as HTMLElement).querySelector('fieldset')?.disabled).toBe(false);
  });

  it('lets go of an account and a filament that the reload after a refusal no longer has', async () => {
    const closed = { code: 'P0001', message: 'La cuenta Efectivo está desactivada.' };
    const { fixture, internals } = open([closed]);

    await confirm(fixture, internals);
    // compras.page reloads: the account was closed and the filament switched off in another tab.
    fixture.componentRef.setInput('accountOptions', []);
    fixture.componentRef.setInput('skuOptions', [{ ...SKU, active: false }]);
    fixture.detectChanges();

    const raw = (internals as unknown as { form: { getRawValue(): { paidFrom: string; lines: { target: string }[] } } }).form.getRawValue();
    expect(raw.paidFrom).toBe('');
    expect(raw.lines[0]?.target).toBe('');
    expect(text(fixture)).toContain('Elige desde qué cuenta la pagaste');
  });

  it('locks the form while the purchase is on its way, and a change that slips in keeps the key (review)', async () => {
    const lost = later();
    const { fixture, calls, outcome, internals } = open([lost.answer, null]);

    const saving = internals.save();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('fieldset')?.disabled).toBe(true);
    // What the locked fieldset stops a person from doing, done anyway.
    internals.form.controls.note.setValue('Corregida en vuelo');
    lost.arrive(LOST);
    await saving;
    fixture.detectChanges();
    await confirm(fixture, internals);

    expect(calls.length).toBe(2);
    expect(calls[1]?.[1]).toBe(calls[0]?.[1]);
    expect(outcome.saved).toBe(1);
  });
});
