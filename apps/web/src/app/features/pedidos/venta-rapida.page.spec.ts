import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ArticlePhotos } from '../../core/article-photos';
import { UserFacingError } from '../../core/friendly-error';
import { Media } from '../../core/media';
import { FinanzasData } from '../finanzas/finanzas.data';
import { PedidosData, type AccountOption } from './pedidos.data';
import type { ChannelOptions, QuickSalePayload, ShelfOffer } from './quick-sale';
import { QuickSaleData, type SoldOrder } from './venta-rapida.data';
import { VentaRapidaPage } from './venta-rapida.page';

const PINK: ShelfOffer = {
  id: 'pink',
  productName: 'Canastita',
  variantName: 'Rosada',
  imagePath: null,
  listPrice: 15,
  label: 'Canastita — Rosada',
  free: 5,
  onHand: 5,
  unitCost: 6.4,
};

const CHANNELS: ChannelOptions = {
  channels: [
    { id: 'direct', name: 'Directo' },
    { id: 'instagram', name: 'Instagram' },
  ],
  defaultId: 'direct',
};

const CASH: AccountOption = { id: 'cash', name: 'Efectivo', defaultMethod: 'cash', openingBalanceOn: '2026-01-01' };
const BANK: AccountOption = { id: 'bank', name: 'Cuenta bancaria', defaultMethod: 'transfer', openingBalanceOn: '2026-01-01' };

/** What the browser says when the answer never arrives. */
const OFFLINE = new TypeError('Failed to fetch');

interface Sent {
  payload: QuickSalePayload;
  key: string;
}

interface Opened {
  fixture: ComponentFixture<VentaRapidaPage>;
  sent: Sent[];
  lookups: string[];
}

interface Script {
  accounts?: AccountOption[];
  channels?: ChannelOptions;
  /** What the database does with each sale, in order. By default it makes it. */
  sell?: ((sent: Sent, made: SoldOrder) => Promise<SoldOrder>)[];
  /** What asking for a sale by its key answers, in order. By default, what was made with that key. */
  findSale?: ((key: string, made: ReadonlyMap<string, SoldOrder>) => Promise<SoldOrder | null>)[];
}

async function open(script: Script = {}): Promise<Opened> {
  const sent: Sent[] = [];
  const lookups: string[] = [];
  // What the database saved, by key: a sale whose answer was lost is still here.
  const made = new Map<string, SoldOrder>();
  let number = 0;

  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      // The pictures are not what is being tested: nothing is signed or looked up.
      { provide: Media, useValue: { url: async () => null, version: signal(0) } },
      { provide: ArticlePhotos, useValue: { resolve: async () => ({ path: null, kind: 'part' }) } },
      { provide: FinanzasData, useValue: { paymentCategories: async () => ({ order: null, purchase: null }) } },
      {
        provide: PedidosData,
        useValue: { paymentAccounts: async () => script.accounts ?? [CASH], suggestedPrice: async () => 15 },
      },
      {
        provide: QuickSaleData,
        useValue: {
          offers: async () => [PINK],
          customers: async () => [],
          channels: async () => script.channels ?? CHANNELS,
          sell: async (payload: QuickSalePayload, key: string) => {
            const call = { payload, key };
            sent.push(call);
            const order = made.get(key) ?? {
              id: `order-${++number}`,
              number: `ORD-2026-000${number}`,
              total: payload.lines.reduce((sum, line) => sum + line.quantity * line.unit_price, 0),
            };
            const step = script.sell?.[sent.length - 1];
            // The database saves it before the answer is lost: that is the case worth testing.
            made.set(key, order);
            return step ? step(call, order) : order;
          },
          findSale: async (key: string) => {
            lookups.push(key);
            const step = script.findSale?.[lookups.length - 1];
            return step ? step(key, made) : (made.get(key) ?? null);
          },
        },
      },
    ],
  });
  // The summary scrolls itself into view, which jsdom does not draw.
  Element.prototype.scrollIntoView = () => undefined;

  const fixture = TestBed.createComponent(VentaRapidaPage);
  await settle(fixture);
  return { fixture, sent, lookups };
}

/** The line asks for its price after a short delay: real time has to pass. */
async function settle(fixture: ComponentFixture<VentaRapidaPage>): Promise<void> {
  for (let round = 0; round < 4; round++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    await fixture.whenStable();
    fixture.detectChanges();
  }
}

/** A new quantity asks for its price again once typing stops (300 ms). */
async function moreOfTheSame(fixture: ComponentFixture<VentaRapidaPage>): Promise<void> {
  button(fixture, 'Agregar Canastita — Rosada').click();
  await new Promise((resolve) => setTimeout(resolve, 350));
  await settle(fixture);
}

const text = (fixture: ComponentFixture<VentaRapidaPage>) =>
  (fixture.nativeElement.textContent ?? '').replace(/\s+/g, ' ').trim();

function button(fixture: ComponentFixture<VentaRapidaPage>, label: string | RegExp): HTMLButtonElement {
  const buttons: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('button'));
  const found = buttons.find((candidate) => {
    const name = candidate.getAttribute('aria-label') ?? candidate.textContent?.trim() ?? '';
    return typeof label === 'string' ? name === label : label.test(name);
  });
  if (!found) throw new Error(`no button «${label}» among ${buttons.map((b) => b.textContent?.trim()).join(', ')}`);
  return found;
}

function sellButton(fixture: ComponentFixture<VentaRapidaPage>): HTMLButtonElement {
  return button(fixture, /^(Vender|Vendiendo)/);
}

async function press(fixture: ComponentFixture<VentaRapidaPage>, label: string | RegExp): Promise<void> {
  button(fixture, label).click();
  await settle(fixture);
}

function field<T extends HTMLElement>(fixture: ComponentFixture<VentaRapidaPage>, name: string): T {
  const element = fixture.nativeElement.querySelector(`[formcontrolname="${name}"]`) as T | null;
  if (!element) throw new Error(`no field «${name}»`);
  return element;
}

async function type(fixture: ComponentFixture<VentaRapidaPage>, name: string, value: string): Promise<void> {
  const input = field<HTMLInputElement>(fixture, name);
  input.value = value;
  input.dispatchEvent(new Event('input'));
  await settle(fixture);
}

async function choose(fixture: ComponentFixture<VentaRapidaPage>, name: string, value: string): Promise<void> {
  const select = field<HTMLSelectElement>(fixture, name);
  select.value = value;
  select.dispatchEvent(new Event('change'));
  await settle(fixture);
}

/** One pink basket in the sale, collected in full in the only account. */
async function oneBasket(script: Script = {}): Promise<Opened> {
  const opened = await open(script);
  await press(opened.fixture, 'Agregar Canastita — Rosada');
  expect(sellButton(opened.fixture).disabled).toBe(false);
  return opened;
}

function channelSelect(fixture: ComponentFixture<VentaRapidaPage>): HTMLSelectElement | null {
  return fixture.nativeElement.querySelector('select[aria-label="Canal de venta"]');
}

describe('VentaRapidaPage', () => {
  it('sells through the direct channel unless another is chosen, and keeps it for the next sale', async () => {
    const { fixture, sent } = await oneBasket();

    const select = channelSelect(fixture)!;
    expect(select.value).toBe('direct');
    // With a default every sale names a channel: there is no «Sin canal».
    expect(Array.from(select.options).map((option) => option.textContent?.trim())).toEqual(['Directo', 'Instagram']);
    await press(fixture, /^Vender/);
    expect(sent[0]!.payload.channelId).toBe('direct');

    select.value = 'instagram';
    select.dispatchEvent(new Event('change'));
    await press(fixture, 'Agregar Canastita — Rosada');
    await press(fixture, /^Vender/);
    expect(sent[1]!.payload.channelId).toBe('instagram');
    expect(channelSelect(fixture)!.value).toBe('instagram');
  });

  it('lets a sale go without a channel only when the workshop has no default', async () => {
    const { fixture, sent } = await oneBasket({ channels: { ...CHANNELS, defaultId: null } });

    const select = channelSelect(fixture)!;
    expect(select.value).toBe('');
    expect(select.options[0]!.textContent?.trim()).toBe('Sin canal');
    await press(fixture, /^Vender/);
    expect(sent[0]!.payload.channelId).toBeNull();
  });

  it('does not ask for a channel the workshop does not have', async () => {
    const { fixture } = await oneBasket({ channels: { channels: [], defaultId: null } });
    expect(channelSelect(fixture)).toBeNull();
  });

  it('shows what the basket is worth on the shelf and sends no cost: the database puts it', async () => {
    const { fixture, sent } = await oneBasket();

    expect(text(fixture)).toMatch(/Costo en el estante S\/\s6\.40 c\/u/);
    expect(text(fixture)).toContain('Sin cliente, la venta queda a nombre de «Clientes varios».');
    await press(fixture, /^Vender/);
    expect(sent[0]!.payload.lines).toEqual([{ variant_id: 'pink', quantity: 1, unit_price: 15 }]);
  });

  it('sells only with the button: Enter in a field, or «Ir» on a phone, submits nothing', async () => {
    const { fixture, sent } = await oneBasket();

    // What a browser does on Enter: submit the field's form. There must be none to submit.
    const fields: HTMLInputElement[] = Array.from(fixture.nativeElement.querySelectorAll('input'));
    expect(fields.length).toBeGreaterThan(0);
    for (const input of fields) {
      expect(input.form).toBeNull();
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    }
    await settle(fixture);
    expect(sent).toEqual([]);
    expect(sellButton(fixture).type).toBe('button');

    await press(fixture, /^Vender/);
    expect(sent.length).toBe(1);
    expect(text(fixture)).toContain('Venta registrada: ORD-2026-0001');
  });

  it('when the answer is lost after the database saved the sale, finds it by its key instead of selling twice', async () => {
    const { fixture, sent, lookups } = await oneBasket({ sell: [async () => Promise.reject(OFFLINE)] });

    await press(fixture, /^Vender/);

    expect(sent.length).toBe(1);
    expect(lookups).toEqual([sent[0]!.key]);
    expect(text(fixture)).toContain('Venta registrada: ORD-2026-0001');
    expect(text(fixture)).not.toContain('No pudimos registrar la venta');
  });

  it('when it cannot tell, says to tap again unchanged, and the second tap finds the first sale', async () => {
    const { fixture, sent, lookups } = await oneBasket({
      sell: [async () => Promise.reject(OFFLINE)],
      // Still offline right after it failed: nobody can say whether it was saved.
      findSale: [async () => Promise.reject(OFFLINE)],
    });

    await press(fixture, /^Vender/);
    expect(text(fixture)).toContain('Vuelve a tocar «Vender» sin cambiar nada: si llegó a guardarse, no se repite.');
    const link = fixture.nativeElement.querySelector('.go a') as HTMLAnchorElement;
    expect(link.textContent?.trim()).toBe('Ver los últimos pedidos');
    expect(link.getAttribute('href')).toBe('/pedidos?estado=todos');

    // The connection is back, and the same sale is sent again.
    await press(fixture, /^Vender/);

    expect(sent.length).toBe(1);
    expect(lookups).toEqual([sent[0]!.key, sent[0]!.key]);
    expect(text(fixture)).toContain('Venta registrada: ORD-2026-0001');
  });

  it('takes the last sale’s summary away when the next one fails: it would read as this one’s', async () => {
    const { fixture } = await oneBasket({ sell: [async (_, made) => made, async () => Promise.reject(OFFLINE)] });

    await press(fixture, /^Vender/);
    expect(text(fixture)).toContain('Venta registrada: ORD-2026-0001');

    await press(fixture, 'Agregar Canastita — Rosada');
    // The answer is lost and nobody can say yet whether it was saved.
    TestBed.inject(QuickSaleData).findSale = async () => Promise.reject(OFFLINE);
    await press(fixture, /^Vender/);

    expect(text(fixture)).not.toContain('Venta registrada');
    expect(text(fixture)).toContain('Vuelve a tocar «Vender» sin cambiar nada');
  });

  it('sends a sale sent again unchanged with its key, and a changed one with a new key', async () => {
    const { fixture, sent } = await oneBasket({
      sell: [async () => Promise.reject(OFFLINE), async () => Promise.reject(OFFLINE)],
      findSale: [async () => null, async () => null, async () => null],
    });

    await press(fixture, /^Vender/);
    await press(fixture, /^Vender/);
    expect(sent.map((call) => call.key)).toEqual([sent[0]!.key, sent[0]!.key]);

    // Another basket: another sale, with a key of its own.
    await moreOfTheSame(fixture);
    await press(fixture, /^Vender/);
    expect(sent.length).toBe(3);
    expect(sent[2]!.key).not.toBe(sent[0]!.key);
    expect(sent[2]!.payload.lines[0]!.quantity).toBe(2);
  });

  it('gives the next sale a key of its own, even when it is the same basket again', async () => {
    const { fixture, sent } = await oneBasket();

    await press(fixture, /^Vender/);
    await press(fixture, 'Agregar Canastita — Rosada');
    await press(fixture, /^Vender/);

    expect(sent.length).toBe(2);
    expect(JSON.stringify(sent[1]!.payload)).toBe(JSON.stringify(sent[0]!.payload));
    expect(sent[1]!.key).not.toBe(sent[0]!.key);
  });

  it('shows a refusal of the database as it comes, with nothing to look up', async () => {
    const refusal = 'No alcanza para entregar. Falta: Canastita · Rosada (hacen falta 1 y hay 0).';
    const { fixture, lookups } = await oneBasket({ sell: [async () => Promise.reject(new UserFacingError(refusal))] });

    await press(fixture, /^Vender/);

    expect(text(fixture)).toContain(refusal);
    expect(lookups).toEqual([]);
    expect(fixture.nativeElement.querySelector('.go a')).toBeNull();
  });

  it('asks who owes it before selling on credit, and lets it go once somebody is named', async () => {
    const { fixture, sent } = await oneBasket();

    await press(fixture, 'Me paga después');
    expect(text(fixture)).toContain('Quedan S/');
    expect(text(fixture)).toContain('Escribe el nombre de quien te debe');
    expect(sellButton(fixture).disabled).toBe(true);

    await type(fixture, 'name', 'Rosa Díaz');
    expect(sellButton(fixture).disabled).toBe(false);
    await press(fixture, /^Vender/);

    expect(sent[0]!.payload).toMatchObject({ customerName: 'Rosa Díaz', amount: 0, accountId: null });
  });

  it('puts the method back to the account’s when the account changes, and after each sale', async () => {
    // With two accounts nothing is chosen for the person.
    const { fixture, sent } = await open({ accounts: [CASH, BANK] });
    await press(fixture, 'Agregar Canastita — Rosada');

    await choose(fixture, 'accountId', 'bank');
    await choose(fixture, 'method', 'plin');
    await choose(fixture, 'accountId', 'cash');
    expect(field<HTMLSelectElement>(fixture, 'method').value).toBe('');

    await choose(fixture, 'method', 'plin');
    await press(fixture, /^Vender/);
    expect(sent[0]!.payload.method).toBe('plin');

    await press(fixture, 'Agregar Canastita — Rosada');
    expect(field<HTMLSelectElement>(fixture, 'method').value).toBe('');
    await press(fixture, /^Vender/);
    expect(sent[1]!.payload).toMatchObject({ accountId: 'cash', method: null });
  });

  it('keeps collecting all of it when the person typed the total itself', async () => {
    const { fixture, sent } = await oneBasket();

    await type(fixture, 'amount', '15');
    await moreOfTheSame(fixture);
    expect(field<HTMLInputElement>(fixture, 'amount').valueAsNumber).toBe(30);

    // Any other amount is what was paid, and stays.
    await type(fixture, 'amount', '10');
    await type(fixture, 'name', 'Rosa');
    await moreOfTheSame(fixture);
    expect(field<HTMLInputElement>(fixture, 'amount').valueAsNumber).toBe(10);
    await press(fixture, /^Vender/);
    expect(sent[0]!.payload.amount).toBe(10);
  });
});
