import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ArticlePhotos } from '../../core/article-photos';
import { Media } from '../../core/media';
import { PlanService } from '../../core/plan';
import { ProductionAccess } from '../produccion/production-access';
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

function open(canOperate: boolean) {
  const save = vi.fn(async () => 1);
  TestBed.configureTestingModule({
    providers: [
      { provide: ConteoData, useValue: { rows: async () => [CAP], save } },
      { provide: PlanService, useValue: { invalidate: () => undefined } },
      { provide: ProductionAccess, useValue: { canOperate: signal(canOperate) } },
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

  it('keeps the button disabled for a member who only reads, and says why', async () => {
    const { fixture, save } = open(false);
    await settle(fixture);
    count(fixture, '4');

    expect(saveButton(fixture).disabled).toBe(true);
    expect(text(fixture)).toContain('solo el dueño y los operadores pueden corregir el estante');
    saveButton(fixture).click();
    await settle(fixture);
    expect(save).not.toHaveBeenCalled();
  });
});
