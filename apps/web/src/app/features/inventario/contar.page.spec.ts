import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ArticlePhotos } from '../../core/article-photos';
import { Media } from '../../core/media';
import { PlanService } from '../../core/plan';
import { CurrentWorkspace, READ_ONLY_NOTE } from '../../core/workspace';
import { fakeWorkspace } from '../../core/workspace.testing';
import type { CountRow } from './conteo';
import { ConteoData } from './conteo.data';
import { ContarPage } from './contar.page';

const CAP: CountRow = {
  kind: 'part',
  inventoryItemId: 'cap',
  variantId: null,
  name: 'Tapa impresa',
  detail: null,
  imagePath: null,
  onHand: 5,
  knownCost: 0.131,
  counted: 5,
  typedCost: null,
};

function open(canOperate: boolean, roleKnown = true) {
  const save = vi.fn(async () => 1);
  const workspace = fakeWorkspace(canOperate ? 'operator' : 'viewer');
  workspace.roleKnown.set(roleKnown);
  TestBed.configureTestingModule({
    providers: [
      { provide: ConteoData, useValue: { rows: async () => [CAP], save } },
      { provide: PlanService, useValue: { invalidate: () => undefined } },
      { provide: CurrentWorkspace, useValue: workspace },
      { provide: Media, useValue: { url: async () => null, version: signal(0) } },
      { provide: ArticlePhotos, useValue: { resolve: async () => ({ path: null, kind: 'part' }) } },
    ],
  });
  const fixture = TestBed.createComponent(ContarPage);
  fixture.detectChanges();
  return { fixture, save };
}

async function settle(fixture: ComponentFixture<ContarPage>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await fixture.whenStable();
  fixture.detectChanges();
}

function count(fixture: ComponentFixture<ContarPage>, value: string): void {
  const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('.count input')!;
  input.value = value;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

const saveButton = (fixture: ComponentFixture<ContarPage>) =>
  (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.save button')!;
const text = (fixture: ComponentFixture<ContarPage>) =>
  ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');

describe('ContarPage, who may correct the shelf', () => {
  it('lets the owner and the operator save what they counted', async () => {
    const { fixture } = open(true);
    await settle(fixture);
    count(fixture, '4');
    expect(saveButton(fixture).disabled).toBe(false);
    expect(text(fixture)).not.toContain('solo lectura');
  });

  it('shows a member who only reads what the app believes, without fields to count into nor a button', async () => {
    const { fixture } = open(false);
    await settle(fixture);
    const page = fixture.nativeElement as HTMLElement;

    expect(text(fixture)).toContain('La app cree 5');
    expect(page.querySelector('.count input')).toBeNull();
    expect(page.querySelector('.save')).toBeNull();
    expect(page.querySelector('button')).toBeNull();
    expect(text(fixture)).toContain(READ_ONLY_NOTE);
  });

  it('says nothing about reading only before the role is known', async () => {
    const { fixture } = open(false, false);
    await settle(fixture);

    expect(text(fixture)).not.toContain('solo lectura');
    expect((fixture.nativeElement as HTMLElement).querySelector('.count input')).toBeNull();
  });
});
