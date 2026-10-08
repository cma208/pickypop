import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ClientesData } from '../clientes/clientes.data';
import { ClienteRapido, type QuickCustomer } from './cliente-rapido';

interface Opened {
  fixture: ComponentFixture<ClienteRapido>;
  created: QuickCustomer[];
  chosen: QuickCustomer[];
  calls: string[];
  finish: () => void;
}

const MARIA: QuickCustomer = { id: 'c1', name: 'María Torres' };

/** The database answers only when `finish` is called: a second click arrives while it is still busy. */
function open(customers: QuickCustomer[] = [MARIA]): Opened {
  const calls: string[] = [];
  let finish = () => {};
  TestBed.configureTestingModule({
    providers: [
      {
        provide: ClientesData,
        useValue: {
          createQuick: (name: string) => {
            calls.push(name);
            return new Promise<QuickCustomer>((resolve) => (finish = () => resolve({ id: 'new', name })));
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(ClienteRapido);
  fixture.componentRef.setInput('customers', customers);
  const opened: Opened = { fixture, created: [], chosen: [], calls, finish: () => finish() };
  fixture.componentInstance.created.subscribe((customer) => opened.created.push(customer));
  fixture.componentInstance.chosen.subscribe((customer) => opened.chosen.push(customer));
  fixture.detectChanges();
  return opened;
}

function type(fixture: ComponentFixture<ClienteRapido>, value: string): void {
  const input: HTMLInputElement = fixture.nativeElement.querySelector('input[formcontrolname="name"]');
  input.value = value;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

function button(fixture: ComponentFixture<ClienteRapido>, label: string): HTMLButtonElement {
  const buttons: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('button'));
  const found = buttons.find((candidate) => candidate.textContent?.trim() === label);
  if (!found) throw new Error(`no button «${label}» among ${buttons.map((b) => b.textContent?.trim()).join(', ')}`);
  return found;
}

const text = (fixture: ComponentFixture<ClienteRapido>) =>
  (fixture.nativeElement.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('ClienteRapido', () => {
  it('creates one customer however fast the button is pressed twice (T4-10)', async () => {
    const { fixture, calls, created, finish } = open([]);
    type(fixture, 'Pedro Doble');

    const create = button(fixture, 'Crear y elegir');
    create.click();
    create.click();
    finish();
    await fixture.whenStable();

    expect(calls).toEqual(['Pedro Doble']);
    expect(created).toEqual([{ id: 'new', name: 'Pedro Doble' }]);
  });

  it('offers the customer already in the list, written another way', () => {
    const { fixture, chosen } = open();
    type(fixture, 'maria  torres');

    expect(text(fixture)).toContain('Ya tienes a María Torres');
    button(fixture, 'Es esa persona: elegirla').click();
    expect(chosen).toEqual([MARIA]);
    // Two people may share a name: a new one can still be made, and the button says so.
    expect(button(fixture, 'Crear otro con ese nombre').disabled).toBe(false);
  });

  it('says a name of only spaces is no name, instead of a generic failure', () => {
    const { fixture, calls } = open();
    type(fixture, '   ');
    button(fixture, 'Crear y elegir').click();
    fixture.detectChanges();

    expect(calls).toEqual([]);
    expect(text(fixture)).toContain('Escribe el nombre del cliente.');
  });

  it('does not create a second walk-in customer', () => {
    const { fixture } = open();
    type(fixture, 'Cliente al paso');

    expect(text(fixture)).toContain('es el cliente de las ventas al paso');
    expect(button(fixture, 'Crear y elegir').disabled).toBe(true);
  });
});
