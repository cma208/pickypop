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
}

export interface ProductSummary {
  id: string;
  name: string;
  slug: string;
  status: ProductStatus;
  botVisible: boolean;
  leadTimeDays: number | null;
  category: string | null;
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
  unitsPerRun: number;
  printTimeS: number;
  filaments: RecipeFilament[];
}

export interface RecipePlateInput {
  label: string | null;
  unitsPerRun: number;
  printTimeS: number;
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
  plates: RecipePlate[];
  supplies: RecipeSupply[];
}

export interface RecipeHeaderInput {
  setupMinutes: number;
  minutesPerUnit: number;
  note: string | null;
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
  /** Cost per item unit from purchases, when any was ever recorded. */
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
