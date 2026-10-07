import type { CostProfile, PrinterProfile } from '../../core/pricing';
import type { BadgeTone } from '../../ui';

export type ProductStatus = 'draft' | 'published' | 'archived';

export const STATUS_LABELS: Record<ProductStatus, string> = {
  draft: 'Borrador',
  published: 'Publicado',
  archived: 'Archivado',
};

export const STATUS_TONES: Record<ProductStatus, BadgeTone> = {
  draft: 'neutral',
  published: 'good',
  archived: 'warn',
};

/** A free-form name/value pair, the editable shape of a jsonb object. */
export interface Pair {
  name: string;
  value: string;
}

export interface VariantBrief {
  id: string;
  name: string;
  listPrice: number | null;
  active: boolean;
  imagePath: string | null;
}

export interface ProductSummary {
  id: string;
  name: string;
  slug: string;
  status: ProductStatus;
  botVisible: boolean;
  leadTimeDays: number | null;
  category: string | null;
  imagePath: string | null;
  variants: VariantBrief[];
}

export interface ProductDetail {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  tags: string[];
  status: ProductStatus;
  botVisible: boolean;
  leadTimeDays: number | null;
  imagePath: string | null;
  specs: Pair[];
}

/** Fields the person edits; status, bot visibility and specs are optional on create. */
export interface ProductInput {
  name: string;
  slug: string;
  description: string | null;
  category: string | null;
  tags: string[];
  leadTimeDays: number | null;
  imagePath?: string | null;
  status?: ProductStatus;
  botVisible?: boolean;
  specs?: Pair[];
}

export interface Variant {
  id: string;
  productId: string;
  name: string;
  options: Pair[];
  skuCode: string | null;
  listPrice: number | null;
  minOrderUnits: number | null;
  active: boolean;
  imagePath: string | null;
}

export type VariantInput = Omit<Variant, 'id' | 'productId'>;

export interface RecipeFilament {
  id: string;
  slot: number;
  materialId: string | null;
  colorHex: string | null;
  skuId: string | null;
  /** Grams for ONE run of the plate, purge included. */
  grams: number;
}

export type RecipeFilamentInput = Omit<RecipeFilament, 'id'>;

export interface RecipePlate {
  id: string;
  label: string | null;
  plateIndex: number;
  /** Para el costeo: cuántos productos terminados aporta una corrida. */
  unitsPerRun: number;
  printTimeS: number;
  filaments: RecipeFilament[];
  /** Las piezas que salen al estante. Vacía: la placa no aporta stock. */
  outputs: PlateOutput[];
  /** La vista de la placa recortada del archivo laminado. */
  thumbnailPath: string | null;
  sourceFileName: string | null;
  /** Lo que dijo el archivo laminado; null si la placa se cargó a mano. */
  fileRecord: PlateFileRecord | null;
}

/**
 * Lo que trajo el archivo laminado sobre una placa, tal como se importó. Se
 * guarda en `recipe_plates.slicer_metadata` para poder decir, junto a la lista
 * de piezas, "el archivo dice: Cap ×7, Body1 ×7", y para proponer la misma
 * pieza la próxima vez que aparezca un objeto con ese nombre.
 */
export interface PlateFileRecord {
  /** El número de la placa dentro del archivo, la N de plate_N. */
  filePlate: number | null;
  objects: PlateFileObject[];
}

export interface PlateFileObject {
  /** El nombre del objeto en Bambu Studio, que casi nunca es el del inventario. */
  name: string;
  count: number;
  /** La pieza que la persona dijo que es; null si dijo que no va al estante. */
  inventoryItemId: string | null;
}

/** Una pieza que sale de una placa, y cuántas salen por corrida. */
export interface PlateOutput {
  id: string;
  inventoryItemId: string;
  unitsPerRun: number;
}

export type PlateOutputInput = Omit<PlateOutput, 'id'>;

export interface RecipePlateInput {
  label: string | null;
  unitsPerRun: number;
  printTimeS: number;
}

/** Una placa recién leída de un archivo laminado, ya revisada, lista para guardarse. */
export interface ImportedPlate {
  label: string | null;
  unitsPerRun: number;
  printTimeS: number;
  sourceFileName: string;
  filaments: ImportedFilament[];
  /** Las piezas que la persona confirmó, ya sumadas si dos objetos eran la misma. */
  outputs: PlateOutputInput[];
  record: PlateFileRecord;
  /** La miniatura recortada, todavía sin subir. */
  thumbnail: Blob | null;
}

export interface ImportedFilament {
  slot: number;
  grams: number;
  colorHex: string | null;
  materialId: string | null;
  /** Null cuando ningún rollo del taller se parece lo bastante. */
  skuId: string | null;
}

export interface RecipeSupply {
  id: string;
  inventoryItemId: string;
  quantityPerUnit: number;
}

export interface Recipe {
  id: string;
  variantId: string;
  version: number;
  setupMinutes: number;
  minutesPerUnit: number;
  note: string | null;
  /** Falso: se entrega tal como sale de la impresora, sin pasar por Armar. */
  assembled: boolean;
  plates: RecipePlate[];
  supplies: RecipeSupply[];
}

export interface RecipeHeaderInput {
  setupMinutes: number;
  minutesPerUnit: number;
  note: string | null;
  assembled: boolean;
}

export interface PriceTierRow {
  id: string;
  minQuantity: number;
  unitPrice: number;
  validFrom: string;
  note: string | null;
}

export interface MaterialOption {
  id: string;
  code: string;
}

export interface SkuOption {
  id: string;
  materialId: string;
  label: string;
  colorHex: string | null;
  /** Perfil de Bambu (GFA00…): con el color, es lo que permite adivinar el rollo. */
  trayInfoIdx: string | null;
  active: boolean;
  /** Weighted cost per gram of what is on the shelf, when there is stock. */
  stockCostPerGram: number | null;
  /** What it would cost to buy again, when the SKU says so. */
  replacementCostPerGram: number | null;
}

export interface SupplyOption {
  id: string;
  name: string;
  unit: string;
  /** From `inventory_item_costs`: last purchase, else standard cost; null when neither exists. */
  costPerUnit: number | null;
}

export interface Lookups {
  materials: MaterialOption[];
  skus: SkuOption[];
  supplies: SupplyOption[];
}

export interface PrinterOption {
  id: string;
  name: string;
  /** Hourly machine cost as the database view reports it, for display. */
  machineRatePerHour: number;
  profile: PrinterProfile;
}

export interface CostContext {
  profile: CostProfile | null;
  printers: PrinterOption[];
}
