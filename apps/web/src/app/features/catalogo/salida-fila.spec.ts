import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArticlePhotos } from '../../core/article-photos';
import { Media } from '../../core/media';
import { CatalogoData } from './catalogo.data';
import type { PlateOutput } from './catalogo.models';
import { workspaceAs } from '../../core/workspace.testing';
import { SalidaFila, type PartOption } from './salida-fila';

const BACK: PlateOutput = {
  id: 'out-1',
  inventoryItemId: 'back',
  unitsPerRun: 1,
  part: { name: 'Trasera de calavera', imagePath: null, active: true },
};

const PARTS: PartOption[] = [
  { id: 'back', name: 'Trasera de calavera', unit: 'unidad', imagePath: null },
  { id: 'hook', name: 'Gancho', unit: 'unidad', imagePath: null },
];

function open(soleSource: boolean, options: { asked?: boolean; owner?: boolean } = {}) {
  const data = {
    deletePlateOutput: vi.fn(async () => undefined),
    updatePlateOutput: vi.fn(async () => undefined),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: CatalogoData, useValue: data },
      workspaceAs((options.owner ?? true) ? 'owner' : 'operator'),
      { provide: Media, useValue: { url: async () => null, version: signal(0) } },
      { provide: ArticlePhotos, useValue: { resolve: async () => ({ path: null, kind: 'part' }) } },
    ],
  });
  const fixture = TestBed.createComponent(SalidaFila);
  fixture.componentRef.setInput('plateId', 'plate-3');
  fixture.componentRef.setInput('current', BACK);
  fixture.componentRef.setInput('parts', PARTS);
  fixture.componentRef.setInput('usedIds', ['back']);
  fixture.componentRef.setInput('soleSource', soleSource);
  if (options.asked !== undefined) fixture.componentRef.setInput('asked', options.asked);
  fixture.detectChanges();
  const changes: true[] = [];
  fixture.componentInstance.changed.subscribe(() => changes.push(true));
  return { fixture, data, changes };
}

const removeButton = (element: HTMLElement): HTMLButtonElement => element.querySelector('button[aria-label="Quitar pieza"]')!;

describe('SalidaFila, the only output that prints a part (T2-07)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('says what removing it does to the part, and keeps it if the answer is no', async () => {
    const { fixture, data } = open(true);
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(false);

    removeButton(fixture.nativeElement).click();
    await fixture.whenStable();

    expect(ask).toHaveBeenCalledWith(expect.stringContaining('Es la única placa de la receta que la imprime.'));
    expect(data.deletePlateOutput).not.toHaveBeenCalled();
  });

  it('removes it once the person says yes, and has the recipe read again', async () => {
    const { fixture, data, changes } = open(true);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    removeButton(fixture.nativeElement).click();
    await vi.waitFor(() => expect(data.deletePlateOutput).toHaveBeenCalledWith('out-1'));
    await vi.waitFor(() => expect(changes).toHaveLength(1));
  });

  it('asks before changing it for another part, too', async () => {
    const { fixture, data } = open(true);
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const row = fixture.componentInstance as unknown as { choose(id: string): void; save(): Promise<void> };

    row.choose('hook');
    await row.save();

    expect(ask).toHaveBeenCalledWith(expect.stringContaining('¿Cambiar «Trasera de calavera» por «Gancho» en esta placa?'));
    expect(data.updatePlateOutput).not.toHaveBeenCalled();
  });
});

describe('SalidaFila, the only output of a part the recipe does not take', () => {
  afterEach(() => vi.restoreAllMocks());

  it('says only that the part stops coming out of the runs', async () => {
    const { fixture } = open(true, { asked: false });
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(false);

    removeButton(fixture.nativeElement).click();
    await fixture.whenStable();

    expect(ask).toHaveBeenCalledWith(expect.stringContaining('la receta no la pide: ya no saldrá de sus corridas.'));
    expect(ask).not.toHaveBeenCalledWith(expect.stringContaining('sigue pidiendo'));
  });
});

describe('SalidaFila, the operator changes the only output of a part', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is told to ask the owner to take the part off the recipe, which only the owner can do', async () => {
    const { fixture, data } = open(true, { owner: false });
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const row = fixture.componentInstance as unknown as { choose(id: string): void; save(): Promise<void> };

    expect(removeButton(fixture.nativeElement)).toBeNull();
    row.choose('hook');
    await row.save();

    expect(ask).toHaveBeenCalledWith(expect.stringContaining('pídele al dueño que la quite de «Piezas impresas por unidad»'));
    expect(ask).not.toHaveBeenCalledWith(expect.stringContaining('quítala también'));
    expect(data.updatePlateOutput).not.toHaveBeenCalled();
  });
});

describe('SalidaFila, a part another plate of the recipe also prints', () => {
  afterEach(() => vi.restoreAllMocks());

  it('removes it without asking', async () => {
    const { fixture, data } = open(false);
    const ask = vi.spyOn(window, 'confirm');

    removeButton(fixture.nativeElement).click();
    await vi.waitFor(() => expect(data.deletePlateOutput).toHaveBeenCalledWith('out-1'));
    expect(ask).not.toHaveBeenCalled();
  });
});
