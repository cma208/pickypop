import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { InventarioData, type SpoolSummary, type WeighingInput, type WeighingResult } from './inventario.data';
import { WeighForm } from './weigh-form';

const SPOOL: SpoolSummary = {
  id: 'spool-1',
  code: 'PETG-NEGRO-01',
  skuId: 'sku-1',
  skuLabel: 'Krear3D · PETG · Negro',
  materialCode: 'PETG',
  colorName: 'Negro',
  abrasive: false,
  abrasiveBecause: null,
  colorHex: '#000000',
  tareG: 200,
  status: 'discarded',
  location: null,
  openedAt: null,
  initialWeightG: 1000,
  remainingG: 0,
  unitCost: 50,
  costPerGram: 0.05,
};

const RESULT: WeighingResult = { netG: 650, beforeG: 0, differenceG: 650, afterG: 650, status: 'open' };

function open(spool: SpoolSummary, refusal: object | null = null) {
  const calls: WeighingInput[] = [];
  TestBed.configureTestingModule({
    providers: [
      {
        provide: InventarioData,
        useValue: {
          recordWeighing: async (input: WeighingInput) => {
            calls.push(input);
            if (refusal) throw refusal;
            return RESULT;
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(WeighForm);
  fixture.componentRef.setInput('spool', spool);
  const refused = { count: 0 };
  fixture.componentInstance.refused.subscribe(() => refused.count++);
  fixture.detectChanges();
  return { fixture, calls, refused };
}

const el = (fixture: ComponentFixture<WeighForm>) => fixture.nativeElement as HTMLElement;
const text = (fixture: ComponentFixture<WeighForm>) => (el(fixture).textContent ?? '').replace(/\s+/g, ' ');
const saveButton = (fixture: ComponentFixture<WeighForm>) =>
  el(fixture).querySelector<HTMLButtonElement>('button[type=submit]')!;

function weigh(fixture: ComponentFixture<WeighForm>, grams: number): void {
  const input = el(fixture).querySelector<HTMLInputElement>('input[formcontrolname=grossG]')!;
  input.value = String(grams);
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

async function save(fixture: ComponentFixture<WeighForm>): Promise<void> {
  await (fixture.componentInstance as unknown as { submit(): Promise<void> }).submit();
}

describe('WeighForm', () => {
  it('does not bring a discarded roll back unless the person says it comes back (review of T1-08)', async () => {
    const { fixture, calls } = open(SPOOL);
    weigh(fixture, 850);

    expect(text(fixture)).toContain('Este rollo está descartado');
    expect(saveButton(fixture).disabled).toBe(true);
    await save(fixture);
    expect(calls).toEqual([]);

    el(fixture).querySelector<HTMLInputElement>('input[type=checkbox]')!.click();
    fixture.detectChanges();
    expect(saveButton(fixture).disabled).toBe(false);
    await save(fixture);

    expect(calls).toEqual([{ spoolId: 'spool-1', grossG: 850, tareG: 200, reopen: true }]);
  });

  it('weighs a discarded roll found empty without asking anything', () => {
    const { fixture } = open(SPOOL);
    weigh(fixture, 200);

    expect(text(fixture)).not.toContain('Este rollo está descartado');
    expect(saveButton(fixture).disabled).toBe(false);
  });

  it('says beforehand that an emptied roll with filament reopens', () => {
    const { fixture } = open({ ...SPOOL, status: 'empty' });
    weigh(fixture, 500);

    expect(text(fixture)).toContain('vuelve a quedar abierto');
    expect(saveButton(fixture).disabled).toBe(false);
  });

  it('never asks to reopen a roll in use', async () => {
    const { fixture, calls } = open({ ...SPOOL, status: 'open', remainingG: 600 });
    weigh(fixture, 800);
    await save(fixture);

    expect(el(fixture).querySelector('input[type=checkbox]')).toBeNull();
    expect(calls[0]?.reopen).toBe(false);
  });

  it('asks the page to reload when the database refuses, and offers «Vuelve a usarse» once the fresh roll is discarded (review)', async () => {
    // The dialog opened on a roll in use; another tab discarded it meanwhile.
    const refusal = {
      code: 'P0001',
      message: 'El rollo PETG-NEGRO-01 está descartado: para volver a usarlo marca «Vuelve a usarse».',
    };
    const { fixture, refused } = open({ ...SPOOL, status: 'open', remainingG: 500 }, refusal);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    weigh(fixture, 700);
    await save(fixture);
    fixture.detectChanges();

    expect(refused.count).toBe(1);
    expect(el(fixture).querySelector('input[type=checkbox]')).toBeNull();

    // filamentos.page reloads and hands the dialog the roll as it is now.
    fixture.componentRef.setInput('spool', { ...SPOOL, remainingG: 0 });
    fixture.detectChanges();

    expect(text(fixture)).toContain('está descartado');
    expect(el(fixture).querySelector('input[type=checkbox]')).not.toBeNull();
    vi.restoreAllMocks();
  });
});
