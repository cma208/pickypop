import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { InventarioData, type SkuInput } from './inventario.data';
import { SkuForm } from './sku-form';

function open() {
  const saves: SkuInput[] = [];
  TestBed.configureTestingModule({
    providers: [
      {
        provide: InventarioData,
        useValue: {
          saveSku: async (_id: string | null, input: SkuInput) => {
            saves.push(input);
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(SkuForm);
  fixture.componentRef.setInput('brandOptions', [{ id: 'brand-1', name: 'Krear3D', active: true }]);
  fixture.componentRef.setInput('materialOptions', [{ id: 'material-1', code: 'PLA', active: true }]);
  fixture.componentRef.setInput('finishOptions', []);
  fixture.detectChanges();
  return { fixture, saves };
}

const el = (fixture: ComponentFixture<SkuForm>) => fixture.nativeElement as HTMLElement;

function type(fixture: ComponentFixture<SkuForm>, name: string, value: string): void {
  const field = el(fixture).querySelector<HTMLInputElement | HTMLSelectElement>(`[formcontrolname=${name}]`)!;
  field.value = value;
  field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? 'change' : 'input'));
}

async function fillAndSave(fixture: ComponentFixture<SkuForm>, numbers: Record<string, string>): Promise<void> {
  type(fixture, 'brandId', 'brand-1');
  type(fixture, 'materialId', 'material-1');
  type(fixture, 'colorName', 'Negro');
  for (const [name, value] of Object.entries(numbers)) type(fixture, name, value);
  await (fixture.componentInstance as unknown as { submit(): Promise<void> }).submit();
  fixture.detectChanges();
}

describe('SkuForm', () => {
  it('says the range next to the diameter for 175 (meant 1.75), and saves nothing', async () => {
    const { fixture, saves } = open();
    await fillAndSave(fixture, { diameterMm: '175' });

    expect(saves).toEqual([]);
    expect(el(fixture).textContent).toContain('El diámetro va de 1 a 3 mm: el común es 1.75.');
  });

  it('does not take a roll of 100 kg, nor a tare heavier than a spool', async () => {
    const { fixture, saves } = open();
    await fillAndSave(fixture, { netWeightG: '100000', tareG: '9000' });

    expect(saves).toEqual([]);
    expect(el(fixture).textContent).toContain('El peso neto va de 1 a 10 000 g por rollo');
    expect(el(fixture).textContent).toContain('La tara va hasta 5 000 g');
  });

  it('saves a filament whose numbers make sense', async () => {
    const { fixture, saves } = open();
    await fillAndSave(fixture, { diameterMm: '2.85', netWeightG: '1000', tareG: '180' });

    expect(saves.length).toBe(1);
    expect(saves[0]?.diameterMm).toBe(2.85);
  });
});
