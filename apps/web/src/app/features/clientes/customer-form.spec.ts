import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { UserFacingError } from '../../core/friendly-error';
import { ClientesData } from './clientes.data';
import type { CustomerDraft, CustomerRecord } from './clientes.models';
import { CustomerForm } from './customer-form';
import type { KnownCustomer } from './customer-match';

const EXISTING: KnownCustomer[] = [
  { id: 'maria', name: 'María Torres' },
  { id: 'walk-in', name: 'Clientes varios', walkIn: true },
];

const MARIA: CustomerRecord = {
  id: 'maria',
  kind: 'person',
  name: 'María Torres',
  docType: 'none',
  docNumber: null,
  phone: null,
  email: null,
  note: null,
  active: true,
  walkIn: false,
  orderCount: 2,
};

interface Opened {
  fixture: ComponentFixture<CustomerForm>;
  saves: [string | null, CustomerDraft][];
  answer: (failure?: unknown) => void;
}

async function open(customer: CustomerRecord | null = null): Promise<Opened> {
  const saves: [string | null, CustomerDraft][] = [];
  let answer: (failure?: unknown) => void = () => {};
  TestBed.configureTestingModule({
    providers: [
      {
        provide: ClientesData,
        useValue: {
          save: (id: string | null, draft: CustomerDraft) => {
            saves.push([id, draft]);
            return new Promise<void>((resolve, reject) => (answer = (failure) => (failure ? reject(failure) : resolve())));
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(CustomerForm);
  fixture.componentRef.setInput('existing', EXISTING);
  fixture.componentRef.setInput('customer', customer);
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, saves, answer: (failure) => answer(failure) };
}

function typeName(fixture: ComponentFixture<CustomerForm>, name: string): void {
  const input: HTMLInputElement = fixture.nativeElement.querySelector('[formcontrolname="name"]');
  input.value = name;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

function submit(fixture: ComponentFixture<CustomerForm>): void {
  fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));
  fixture.detectChanges();
}

const text = (fixture: ComponentFixture<CustomerForm>) =>
  (fixture.nativeElement.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('CustomerForm', () => {
  it('recognises somebody already in the list, written another way (T4-10)', async () => {
    const { fixture } = await open();

    typeName(fixture, '  maria   TORRES ');

    expect(text(fixture)).toContain('Ya tienes a María Torres en la lista');
  });

  it('does not warn about the customer being edited keeping its own name', async () => {
    const { fixture } = await open(MARIA);

    typeName(fixture, 'María Torres');

    expect(text(fixture)).not.toContain('Ya tienes a');
  });

  it('says a generic name belongs to the walk-in customer (T4-05)', async () => {
    const { fixture } = await open();

    typeName(fixture, 'cliente al paso');

    expect(text(fixture)).toContain('es el nombre del cliente de las ventas al paso');
    expect(text(fixture)).not.toContain('Ya tienes a');
  });

  it('does not take a name of only spaces, and says so next to the field', async () => {
    const { fixture, saves } = await open();

    typeName(fixture, '   ');
    submit(fixture);

    expect(saves).toEqual([]);
    expect(text(fixture)).toContain('Escribe el nombre del cliente.');
  });

  it('says the same to an empty name, without talking of spaces nobody typed', async () => {
    const { fixture, saves } = await open();

    submit(fixture);

    expect(saves).toEqual([]);
    expect(text(fixture)).toContain('Escribe el nombre del cliente.');
    expect(text(fixture)).not.toContain('solo espacios');
  });

  it('saves once for a double click', async () => {
    const { fixture, saves, answer } = await open();
    typeName(fixture, 'Pedro Quispe');

    submit(fixture);
    submit(fixture);
    answer();
    await fixture.whenStable();

    expect(saves).toHaveLength(1);
    expect(saves[0]![1].name).toBe('Pedro Quispe');
  });

  it('says it was not saved when the database changed nothing', async () => {
    const { fixture, answer } = await open(MARIA);
    typeName(fixture, 'María Torres Díaz');

    submit(fixture);
    answer(new UserFacingError('No se guardó: ese cliente ya no existe o no tienes permiso para cambiarlo. Recarga la lista.'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text(fixture)).toContain('No se guardó: ese cliente ya no existe');
  });
});
