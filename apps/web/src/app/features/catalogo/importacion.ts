import type { Json } from '../../core/database.types';
import { suggestFilamentSku } from '../../core/filament-match';
import type { PlateDetails } from '../../core/sliced-file';
import type { SliceInfo } from '../../core/pricing';
import type { ImportedFilament, PlateFileObject, PlateFileRecord, PlateOutputInput, SkuOption } from './catalogo.models';

/**
 * Lo que la importación de un `.gcode.3mf` propone, sin tocar la base: qué
 * pieza del inventario es cada objeto del archivo, cuántas salen por corrida y
 * cuántos productos alcanza a hacer la placa. La persona confirma todo.
 */

export interface PartCandidate {
  id: string;
  name: string;
}

/**
 * Los modelos se bajan en inglés y el inventario se escribe en español: "Cap"
 * nunca se parecería a "Tapa calavera" letra por letra. Esto cubre las
 * palabras que más aparecen en lo que imprime el taller; no pretende traducir.
 */
const SPANISH_FOR: Record<string, string> = {
  cap: 'tapa',
  lid: 'tapa',
  cover: 'tapa',
  top: 'tapa',
  body: 'cuerpo',
  bottle: 'botella',
  skull: 'calavera',
  head: 'cabeza',
  base: 'base',
  bottom: 'base',
  stand: 'soporte',
  holder: 'soporte',
  box: 'caja',
  case: 'estuche',
  handle: 'asa',
  pumpkin: 'calabaza',
  ghost: 'fantasma',
  mold: 'molde',
  mould: 'molde',
  keychain: 'llavero',
  heart: 'corazon',
  star: 'estrella',
  potion: 'pocion',
};

/** Palabras que no distinguen una pieza de otra. */
const NOISE = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'the', 'of', 'and', 'stl', 'part', 'pieza', 'impresa', 'impreso']);

/**
 * "SkullV4.stl_2" → ["skull", "calavera"]. Se separan las palabras pegadas
 * (camelCase, letras y números), se tiran los números y las versiones, y a
 * cada palabra inglesa conocida se le suma su traducción.
 */
export function nameTokens(text: string): string[] {
  const words = text
    .replace(/\.(stl|3mf|step|stp|obj)(?=$|[^a-z])/gi, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1 && !/^v?\d+$/.test(word) && !NOISE.has(word));

  const tokens = new Set<string>();
  for (const word of words) {
    tokens.add(word);
    const spanish = SPANISH_FOR[word] ?? SPANISH_FOR[word.replace(/s$/, '')];
    if (spanish) tokens.add(spanish);
  }
  return [...tokens];
}

/** La clave con que se recuerda un nombre de objeto: sin mayúsculas ni espacios de más. */
export function objectKey(name: string): string {
  return name.trim().toLowerCase();
}

export interface ProposalHints {
  /** Nombre de objeto (por `objectKey`) → pieza que la persona ya confirmó. */
  learned?: ReadonlyMap<string, string>;
  /** Texto que dice de qué producto se trata, como el nombre del archivo. */
  context?: string;
}

/**
 * La pieza que más probablemente es este objeto, o null si ninguna se parece.
 *
 * Lo que la persona ya confirmó en otra importación manda: si dijo que "Cap"
 * era la tapa de la calavera, lo vuelve a ser. Si no, gana la pieza que
 * comparte más palabras con el objeto; a igualdad, la que además comparte
 * palabras con el contexto ("Skull_-_AMS" dice calavera, así que "Cap" es la
 * tapa de la calavera y no la de la botella); y después, la que tiene menos
 * palabras de sobra. Un empate que sigue siendo empate no propone nada: una
 * propuesta al azar parece una respuesta y no lo es.
 */
export function proposePart(objectName: string, parts: readonly PartCandidate[], hints: ProposalHints = {}): string | null {
  const remembered = hints.learned?.get(objectKey(objectName));
  if (remembered && parts.some((part) => part.id === remembered)) return remembered;

  const wanted = new Set(nameTokens(objectName));
  if (wanted.size === 0) return null;
  const context = new Set(nameTokens(hints.context ?? ''));

  let best: { id: string; score: number[] } | null = null;
  let tied = false;

  for (const part of parts) {
    const tokens = nameTokens(part.name);
    const shared = tokens.filter((token) => wanted.has(token)).length;
    if (shared === 0) continue;
    const fromContext = tokens.filter((token) => !wanted.has(token) && context.has(token)).length;
    const score = [shared, fromContext, -(tokens.length - shared - fromContext)];

    const order = best === null ? 1 : compareScores(score, best.score);
    if (order > 0) {
      best = { id: part.id, score };
      tied = false;
    } else if (order === 0) {
      tied = true;
    }
  }

  return best === null || tied ? null : best.id;
}

/** Compara dos puntajes en orden, como se comparan palabras en un diccionario. */
function compareScores(a: readonly number[], b: readonly number[]): number {
  for (let index = 0; index < a.length; index++) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

/**
 * De "este objeto es esta pieza" a lo que sale de la placa. Dos objetos que
 * son la misma pieza se suman, porque la base guarda una fila por pieza; los
 * que no van al estante, o salen en cero, se quedan fuera.
 */
export function mergeOutputs(rows: readonly { inventoryItemId: string | null; units: number }[]): PlateOutputInput[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (!row.inventoryItemId || !(row.units > 0)) continue;
    totals.set(row.inventoryItemId, (totals.get(row.inventoryItemId) ?? 0) + row.units);
  }
  return [...totals].map(([inventoryItemId, unitsPerRun]) => ({ inventoryItemId, unitsPerRun }));
}

const PRODUCTS_PRECISION = 1000;

/**
 * Cuántos productos terminados alcanza a hacer una corrida, que es lo que usa
 * el costeo.
 *
 * Siete tapas y siete cuerpos son **siete** productos, no catorce: cada
 * producto lleva una de cada una. Si la receta dice que un producto lleva dos
 * tapas, siete tapas alcanzan para tres y media. Manda la pieza que primero se
 * acaba. Sin piezas confirmadas no hay de dónde sacarlo, y queda en 1 para
 * que la persona lo mire en vez de heredar un número inventado.
 */
export function productsPerRun(
  outputs: readonly PlateOutputInput[],
  perProduct: ReadonlyMap<string, number> = new Map(),
): number {
  const ratios = outputs
    .filter((output) => output.unitsPerRun > 0)
    .map((output) => output.unitsPerRun / Math.max(perProduct.get(output.inventoryItemId) ?? 1, 1e-9));
  if (ratios.length === 0) return 1;

  const fewest = Math.round(Math.min(...ratios) * PRODUCTS_PRECISION) / PRODUCTS_PRECISION;
  return fewest > 0 ? fewest : 1;
}

/** "Cap ×7, Body1 ×7", para decir qué trajo el archivo. */
export function describeObjects(objects: readonly { name: string; count: number }[]): string {
  return objects.map((object) => `${object.name} ×${object.count}`).join(', ');
}

/**
 * Una etiqueta para la placa a partir de sus objetos. "thermoformed potion
 * bottle - frontal shape.stl" es el nombre del archivo, no una etiqueta: se
 * limpia y se corta, porque se lee en una fila y de todos modos el dueño la va
 * a reescribir.
 */
export function plateLabel(objectNames: readonly string[], fallbackNumber: number): string {
  const clean = objectNames
    .map((name) =>
      name
        .replace(/\.(stl|3mf|step|obj)(_\d+)?$/i, '')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((name) => name !== '')
    .join(' + ');
  if (clean === '') return `Placa ${fallbackNumber}`;

  const short = clean.length > 36 ? `${clean.slice(0, 35).trimEnd()}…` : clean;
  return short.charAt(0).toUpperCase() + short.slice(1);
}

// ------------------------------------------------- recipe_plates.slicer_metadata

/** Lo que se escribe en `slicer_metadata`. En la base va en snake_case, como todo. */
export function recordToJson(record: PlateFileRecord): { [key: string]: Json } {
  return {
    file_plate: record.filePlate,
    objects: record.objects.map((object) => ({
      name: object.name,
      count: object.count,
      inventory_item_id: object.inventoryItemId,
    })),
  };
}

/**
 * Lee `slicer_metadata` de vuelta. Una placa cargada a mano lo tiene en `{}`
 * y devuelve null; cualquier cosa que no se entienda, también.
 */
export function recordFromJson(json: Json | null | undefined): PlateFileRecord | null {
  if (json === null || json === undefined || typeof json !== 'object' || Array.isArray(json)) return null;
  const objects = json['objects'];
  if (!Array.isArray(objects)) return null;

  const filePlate = json['file_plate'];
  return {
    filePlate: typeof filePlate === 'number' ? filePlate : null,
    objects: objects.flatMap((object): PlateFileObject[] => {
      if (object === null || typeof object !== 'object' || Array.isArray(object)) return [];
      const { name, count, inventory_item_id: itemId } = object;
      if (typeof name !== 'string' || typeof count !== 'number') return [];
      return [{ name, count, inventoryItemId: typeof itemId === 'string' ? itemId : null }];
    }),
  };
}

/**
 * Qué pieza dijo la persona que era cada nombre de objeto, de lo ya importado.
 * Los registros llegan del más reciente al más viejo, y gana el primero: si
 * cambió de opinión, vale lo último que dijo. Un objeto que dejó fuera del
 * estante no enseña nada: quizá la pieza todavía no existía.
 */
export function learnedParts(records: readonly (PlateFileRecord | null)[]): Map<string, string> {
  const learned = new Map<string, string>();
  for (const record of records) {
    for (const object of record?.objects ?? []) {
      const key = objectKey(object.name);
      if (object.inventoryItemId && !learned.has(key)) learned.set(key, object.inventoryItemId);
    }
  }
  return learned;
}

// ---------------------------------------------------------- the review draft

/** Un objeto del archivo, con la pieza que se propone para él. */
export interface DraftObject {
  name: string;
  count: number;
  proposedItemId: string | null;
}

/** Una placa leída del archivo, antes de que la persona la confirme. */
export interface PlateDraft {
  /** El número de la placa dentro del archivo. */
  filePlate: number;
  label: string;
  printTimeS: number;
  /** Gramos de una corrida, purga incluida. Solo para mostrar. */
  grams: number;
  filaments: ImportedFilament[];
  objects: DraftObject[];
  thumbnail: Blob | null;
}

export interface ImportDraft {
  fileName: string;
  plates: PlateDraft[];
}

/**
 * Junta lo que se leyó del archivo con lo que hay en el taller: el rollo que
 * más se parece a cada filamento y la pieza que más se parece a cada objeto.
 * Las placas sin material se descartan, como antes: no son placas laminadas.
 */
export function buildDraft(
  fileName: string,
  info: SliceInfo,
  details: readonly PlateDetails[],
  sources: { skus: readonly SkuOption[]; parts: readonly PartCandidate[]; learned: ReadonlyMap<string, string> },
): ImportDraft {
  const plates = info.plates.flatMap((plate, offset): PlateDraft[] => {
    const filaments = plate.filaments
      .filter((filament) => (filament.usedGrams ?? 0) > 0)
      .map((filament): ImportedFilament => {
        const skuId = suggestFilamentSku(filament, sources.skus);
        return {
          slot: filament.id,
          grams: filament.usedGrams ?? 0,
          colorHex: filament.colorHex,
          materialId: sources.skus.find((sku) => sku.id === skuId)?.materialId ?? null,
          skuId,
        };
      });
    if (filaments.length === 0) return [];

    const found = details.find((detail) => detail.index === plate.index);
    const objects = found?.objects ?? [];
    return [
      {
        filePlate: plate.index,
        label: plateLabel(
          objects.map((object) => object.name),
          plate.index || offset + 1,
        ),
        printTimeS: plate.predictionSeconds ?? 0,
        grams: filaments.reduce((sum, filament) => sum + filament.grams, 0),
        filaments,
        objects: objects.map((object) => ({
          ...object,
          proposedItemId: proposePart(object.name, sources.parts, { learned: sources.learned, context: fileName }),
        })),
        thumbnail: found?.thumbnail ?? null,
      },
    ];
  });

  return { fileName, plates };
}
