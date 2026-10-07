import { describe, expect, it } from 'vitest';
import type { SliceInfo, SlicedPlate } from '../../core/pricing';
import type { ImportedPlate, MaterialOption, SkuOption } from './catalogo.models';
import {
  buildDraft,
  describeObjects,
  importSummary,
  isNewPart,
  learnedParts,
  materialForType,
  mergeOutputs,
  nameTokens,
  newPartId,
  newPartsUsed,
  partNamed,
  plateLabel,
  productsPerRun,
  proposePart,
  recordFromJson,
  recordToJson,
  withCreatedParts,
} from './importacion';

const MATERIALS: MaterialOption[] = [
  { id: 'pla', code: 'PLA' },
  { id: 'petg', code: 'PETG' },
];

const PARTS = [
  { id: 'bottle', name: 'Botella impresa' },
  { id: 'bottle-cap', name: 'Tapa impresa' },
  { id: 'skull-cap', name: 'Tapa calavera' },
  { id: 'skull-body', name: 'Cuerpo calavera' },
];

describe('nameTokens', () => {
  it('splits the names Bambu Studio gives objects and adds the Spanish word', () => {
    expect(nameTokens('Body1')).toEqual(['body', 'cuerpo']);
    expect(nameTokens('SkullV4')).toEqual(['skull', 'calavera']);
    expect(nameTokens('V4.stl_2')).toEqual([]);
    expect(nameTokens('Sub-merged body')).toEqual(['sub', 'merged', 'body', 'cuerpo']);
  });

  it('reads accents and plurals the way people type them', () => {
    expect(nameTokens('Poción')).toEqual(['pocion']);
    expect(nameTokens('Caps')).toEqual(['caps', 'tapa']);
  });
});

describe('proposePart', () => {
  it('proposes the part whose name means the same, in Spanish', () => {
    expect(proposePart('Body1', PARTS)).toBe('skull-body');
  });

  it('lets the file name decide between two caps', () => {
    expect(proposePart('Cap', PARTS, { context: 'Skull_-_AMS.gcode.3mf' })).toBe('skull-cap');
  });

  it('prefers the shortest name when nothing else tells them apart', () => {
    // "impresa" says nothing, so "Tapa impresa" is just "tapa".
    expect(proposePart('Cap', PARTS)).toBe('bottle-cap');
  });

  it('proposes nothing rather than picking one of a tie at random', () => {
    const twins = [
      { id: 'a', name: 'Tapa roja' },
      { id: 'b', name: 'Tapa azul' },
    ];
    expect(proposePart('Cap', twins)).toBeNull();
  });

  it('proposes nothing when no part looks like the object', () => {
    expect(proposePart('Mold2', PARTS)).toBeNull();
    expect(proposePart('V4.stl_1', PARTS)).toBeNull();
  });

  it('trusts what the person already confirmed over any likeness', () => {
    const learned = new Map([['cap', 'skull-cap']]);
    expect(proposePart('Cap', PARTS, { learned })).toBe('skull-cap');
  });

  it('forgets a confirmation whose part no longer exists', () => {
    const learned = new Map([['cap', 'deleted-part']]);
    expect(proposePart('Cap', PARTS, { learned, context: 'skull' })).toBe('skull-cap');
  });
});

describe('mergeOutputs', () => {
  it('adds up two objects that are the same part and drops what is not a part', () => {
    expect(
      mergeOutputs([
        { inventoryItemId: 'skull-body', units: 1 },
        { inventoryItemId: 'skull-body', units: 2 },
        { inventoryItemId: null, units: 3 },
        { inventoryItemId: 'skull-cap', units: 0 },
      ]),
    ).toEqual([{ inventoryItemId: 'skull-body', unitsPerRun: 3 }]);
  });
});

describe('productsPerRun', () => {
  it('counts seven caps and seven bodies as seven products, not fourteen', () => {
    const outputs = [
      { inventoryItemId: 'skull-cap', unitsPerRun: 7 },
      { inventoryItemId: 'skull-body', unitsPerRun: 7 },
    ];
    expect(productsPerRun(outputs)).toBe(7);
  });

  it('is limited by the part that runs out first', () => {
    const outputs = [
      { inventoryItemId: 'skull-cap', unitsPerRun: 9 },
      { inventoryItemId: 'skull-body', unitsPerRun: 7 },
    ];
    expect(productsPerRun(outputs)).toBe(7);
  });

  it('reads from the recipe how many of a part one product takes', () => {
    const outputs = [{ inventoryItemId: 'skull-cap', unitsPerRun: 7 }];
    expect(productsPerRun(outputs, new Map([['skull-cap', 2]]))).toBe(3.5);
  });

  it('stays at one when nothing on the plate goes to the shelf', () => {
    expect(productsPerRun([])).toBe(1);
  });
});

describe('describeObjects', () => {
  it('says what the file brought', () => {
    expect(
      describeObjects([
        { name: 'Cap', count: 7 },
        { name: 'Body1', count: 7 },
      ]),
    ).toBe('Cap ×7, Body1 ×7');
  });
});

describe('plateLabel', () => {
  it('names a mixed plate after everything on it', () => {
    expect(plateLabel(['Cap', 'Body1'], 6)).toBe('Cap + Body1');
  });

  it('cleans file names into something that reads as a label', () => {
    expect(plateLabel(['V4.stl_2'], 4)).toBe('V4');
    expect(plateLabel(['thermoformed potion bottle - frontal shape.stl'], 1)).toBe('Thermoformed potion bottle frontal…');
  });

  it('falls back to the plate number', () => {
    expect(plateLabel([], 3)).toBe('Placa 3');
  });
});

describe('slicer_metadata', () => {
  const record = {
    filePlate: 6,
    objects: [
      { name: 'Cap', count: 7, inventoryItemId: 'skull-cap' },
      { name: 'Body1', count: 7, inventoryItemId: null },
    ],
  };

  it('goes to the database and back unchanged', () => {
    expect(recordFromJson(recordToJson(record))).toEqual(record);
  });

  it('is null for a plate loaded by hand', () => {
    expect(recordFromJson({})).toBeNull();
    expect(recordFromJson(null)).toBeNull();
    expect(recordFromJson([])).toBeNull();
  });

  it('remembers the most recent confirmation of each name', () => {
    const older = { filePlate: 1, objects: [{ name: 'cap', count: 9, inventoryItemId: 'bottle-cap' }] };
    const learned = learnedParts([record, null, older]);

    expect(learned.get('cap')).toBe('skull-cap');
    expect(learned.has('body1')).toBe(false);
  });
});

describe('buildDraft', () => {
  const white: SkuOption = {
    id: 'white-pla',
    materialId: 'pla',
    label: 'PLA Blanco',
    colorHex: '#FFFFFF',
    trayInfoIdx: 'GFA00',
    active: true,
    stockCostPerGram: 0.07,
    replacementCostPerGram: null,
  };

  function slicedPlate(index: number, grams: number, objectNames: string[]): SlicedPlate {
    return {
      index,
      predictionSeconds: 2666,
      weightGrams: grams,
      printerModelId: 'N1',
      nozzleDiameters: '0.4',
      supportUsed: false,
      outsideBed: false,
      objectNames,
      filaments: [{ id: 1, trayInfoIdx: 'GFA00', type: 'PLA', colorHex: '#FFFFFF', usedMeters: 2.11, usedGrams: grams }],
    };
  }

  it('proposes a part for every object of the plate and the roll for its filament', () => {
    const info: SliceInfo = { slicerVersion: '02.08.02.61', isSliced: true, plates: [slicedPlate(6, 6.41, [])] };
    const details = [{ index: 6, objects: [{ name: 'Cap', count: 7 }, { name: 'Body1', count: 7 }], thumbnail: null }];

    const draft = buildDraft('Skull_-_AMS.gcode.3mf', info, details, {
      skus: [white],
      materials: MATERIALS,
      parts: PARTS,
      learned: new Map(),
    });

    expect(draft.plates).toHaveLength(1);
    const plate = draft.plates[0]!;
    expect(plate.filePlate).toBe(6);
    expect(plate.label).toBe('Cap + Body1');
    expect(plate.printTimeS).toBe(2666);
    expect(plate.filaments).toEqual([
      { slot: 1, grams: 6.41, colorHex: '#FFFFFF', materialId: 'pla', skuId: 'white-pla', fileType: 'PLA' },
    ]);
    expect(plate.objects).toEqual([
      { name: 'Cap', count: 7, proposedItemId: 'skull-cap' },
      { name: 'Body1', count: 7, proposedItemId: 'skull-body' },
    ]);
  });

  it('leaves out a plate that uses no material', () => {
    const empty = { ...slicedPlate(2, 0, ['Mold2']) };
    const info: SliceInfo = { slicerVersion: null, isSliced: true, plates: [empty] };

    expect(
      buildDraft('x.gcode.3mf', info, [], { skus: [white], materials: MATERIALS, parts: PARTS, learned: new Map() }).plates,
    ).toEqual([]);
  });

  it('keeps the material the file names when no roll looks like the filament', () => {
    // The skull's moulds: red PETG in the file, and no red roll on the shelf.
    const mould = slicedPlate(2, 95.91, ['Mold']);
    mould.filaments = [{ id: 3, trayInfoIdx: 'GFG99', type: 'PETG', colorHex: '#C12E1F', usedMeters: 30, usedGrams: 95.91 }];
    const info: SliceInfo = { slicerVersion: null, isSliced: true, plates: [mould] };

    const draft = buildDraft('skull.gcode.3mf', info, [], { skus: [white], materials: MATERIALS, parts: PARTS, learned: new Map() });

    expect(draft.plates[0]!.filaments).toEqual([
      { slot: 3, grams: 95.91, colorHex: '#C12E1F', materialId: 'petg', skuId: null, fileType: 'PETG' },
    ]);
  });
});

describe('materialForType', () => {
  it('finds the material by its code, whatever the case', () => {
    expect(materialForType('petg', MATERIALS)).toBe('petg');
    expect(materialForType(' PLA ', MATERIALS)).toBe('pla');
  });

  it('guesses nothing for a type the workshop does not have, or none at all', () => {
    expect(materialForType('PLA-CF', MATERIALS)).toBeNull();
    expect(materialForType(null, MATERIALS)).toBeNull();
    expect(materialForType('', MATERIALS)).toBeNull();
  });
});

describe('parts named during the review', () => {
  const plate = (ids: (string | null)[]): ImportedPlate => ({
    label: 'Tapas',
    unitsPerRun: 7,
    printTimeS: 3600,
    sourceFileName: 'skull.gcode.3mf',
    filaments: [],
    outputs: mergeOutputs(ids.map((id) => ({ inventoryItemId: id, units: 7 }))),
    record: { filePlate: 1, objects: ids.map((id, index) => ({ name: `Obj${index}`, count: 7, inventoryItemId: id })) },
    thumbnail: null,
  });

  it('gets an id no table would take, never the same twice', () => {
    const first = newPartId();
    const second = newPartId();

    expect(isNewPart(first)).toBe(true);
    expect(first).not.toBe(second);
    expect(isNewPart('3f1c2b9e-0000-4000-8000-000000000000')).toBe(false);
    expect(isNewPart(null)).toBe(false);
  });

  it('refuses a name already taken, as a person reads it', () => {
    expect(partNamed('  tapa   CALAVERA ', PARTS)?.id).toBe('skull-cap');
    expect(partNamed('Tapa de calavera', PARTS)).toBeNull();
    expect(partNamed('   ', PARTS)).toBeNull();
  });

  it('creates each new part some saved object uses once, and no existing part', () => {
    const cap = newPartId();
    // A part named and then taken off its object is in no plate, so it is not here either.
    newPartId();

    expect(newPartsUsed([plate([cap, 'skull-body', null]), plate([cap])])).toEqual([cap]);
  });

  it('swaps each temporary id for the created part, in what comes out and in what the file said', () => {
    const cap = newPartId();
    const saved = withCreatedParts(plate([cap, 'skull-body', null]), new Map([[cap, 'real-cap']]));

    expect(saved.outputs.map((output) => output.inventoryItemId)).toEqual(['real-cap', 'skull-body']);
    expect(saved.record.objects.map((object) => object.inventoryItemId)).toEqual(['real-cap', 'skull-body', null]);
  });
});

describe('importSummary', () => {
  it('agrees with every number', () => {
    expect(importSummary({ created: 1, withoutThumbnail: 0, unmatchedFilaments: 0, partsCreated: 0 }, 'a.gcode.3mf')).toBe(
      'Se cargó 1 placa de «a.gcode.3mf».',
    );
    expect(importSummary({ created: 3, withoutThumbnail: 1, unmatchedFilaments: 2, partsCreated: 4 }, 'skull.gcode.3mf')).toBe(
      'Se cargaron 3 placas de «skull.gcode.3mf» y se crearon 4 piezas nuevas. ' +
        'Falta: elige el rollo de 2 filamentos que no reconocimos; 1 vista no se pudo guardar.',
    );
    expect(importSummary({ created: 2, withoutThumbnail: 2, unmatchedFilaments: 1, partsCreated: 1 }, 'b.3mf')).toBe(
      'Se cargaron 2 placas de «b.3mf» y se creó 1 pieza nueva. ' +
        'Falta: elige el rollo de 1 filamento que no reconocimos; 2 vistas no se pudieron guardar.',
    );
  });
});
