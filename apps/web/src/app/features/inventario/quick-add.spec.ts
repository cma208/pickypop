import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { CurrentWorkspace } from '../../core/workspace';
import { fakeWorkspace } from '../../core/workspace.testing';
import { QuickAdd } from './quick-add';

function open(create: (name: string) => Promise<void>) {
  const afterRefusal = vi.fn(async () => true);
  TestBed.configureTestingModule({
    providers: [{ provide: CurrentWorkspace, useValue: { ...fakeWorkspace('operator'), afterRefusal } }],
  });
  const fixture = TestBed.createComponent(QuickAdd);
  fixture.componentRef.setInput('label', 'Nueva marca');
  fixture.componentRef.setInput('create', create);
  fixture.detectChanges();
  return { fixture, afterRefusal };
}

function button(fixture: ComponentFixture<QuickAdd>, label: string): HTMLButtonElement {
  const found = ([...fixture.nativeElement.querySelectorAll('button')] as HTMLButtonElement[]).find((candidate) =>
    candidate.textContent?.includes(label),
  );
  if (!found) throw new Error(`no button «${label}»`);
  return found;
}

async function add(fixture: ComponentFixture<QuickAdd>, name: string): Promise<void> {
  button(fixture, 'Nueva marca').click();
  fixture.detectChanges();
  const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
  input.value = name;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
  button(fixture, 'Agregar').click();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('QuickAdd, refused for the role', () => {
  it('reads the role again, so the form that holds it stops offering it (ADR-025)', async () => {
    const refusal = { code: '42501', message: 'new row violates row-level security policy for table "brands"' };
    const { fixture, afterRefusal } = open(async () => {
      throw refusal;
    });

    await add(fixture, 'Bambu Lab');

    expect(afterRefusal).toHaveBeenCalledWith(refusal);
    expect(fixture.nativeElement.querySelector('.error')).not.toBeNull();
  });

  it('creates it and closes, without asking the role again', async () => {
    const created: string[] = [];
    const { fixture, afterRefusal } = open(async (name) => {
      created.push(name);
    });

    await add(fixture, 'Bambu Lab');

    expect(created).toEqual(['Bambu Lab']);
    expect(afterRefusal).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('input')).toBeNull();
  });
});
