import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ArticlePhotos } from '../core/article-photos';
import { Media } from '../core/media';
import { ItemPicker, type PickerOption } from './item-picker';

const OPTIONS: PickerOption[] = [
  { value: 'bolsa', label: 'Bolsa con etiqueta' },
  { value: 'dulces', label: 'Dulces surtidos' },
];

function open(options: PickerOption[], emptyText?: string): ComponentFixture<ItemPicker> {
  TestBed.configureTestingModule({
    providers: [
      // The pictures are not what is being tested: nothing is signed or looked up.
      { provide: Media, useValue: { url: async () => null, version: signal(0) } },
      { provide: ArticlePhotos, useValue: { resolve: async () => ({ path: null, kind: 'supply' }) } },
    ],
  });
  const fixture = TestBed.createComponent(ItemPicker);
  fixture.componentRef.setInput('options', options);
  if (emptyText !== undefined) fixture.componentRef.setInput('emptyText', emptyText);
  fixture.detectChanges();
  fixture.nativeElement.querySelector('button.chosen').click();
  fixture.detectChanges();
  return fixture;
}

function type(fixture: ComponentFixture<ItemPicker>, text: string): void {
  const search: HTMLInputElement = fixture.nativeElement.querySelector('input.search');
  search.value = text;
  search.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

const emptyMessage = (fixture: ComponentFixture<ItemPicker>) =>
  (fixture.nativeElement.querySelector('.empty')?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('ItemPicker, when there is nothing to show', () => {
  it('says there is nothing to choose from when the list itself is empty', () => {
    expect(emptyMessage(open([]))).toBe('Todavía no hay nada para elegir.');
  });

  it('lets the screen say it in its own words', () => {
    expect(emptyMessage(open([], 'Todavía no hay piezas. Crea una en Piezas impresas.'))).toBe(
      'Todavía no hay piezas. Crea una en Piezas impresas.',
    );
  });

  it('says nothing matches only when there is a search that matches nothing', () => {
    const fixture = open(OPTIONS);
    expect(emptyMessage(fixture)).toBe('');

    type(fixture, 'zzz');

    expect(emptyMessage(fixture)).toBe('Nada coincide con «zzz».');
  });

  it('goes back to the list when the search is cleared', () => {
    const fixture = open(OPTIONS);
    type(fixture, 'zzz');

    type(fixture, '');

    expect(emptyMessage(fixture)).toBe('');
    expect(fixture.nativeElement.querySelectorAll('[role=option]').length).toBe(2);
  });
});
