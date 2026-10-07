import type { Database } from '../../core/database.types';
import type { BadgeTone } from '../../ui';

export type TaxRegime = Database['public']['Enums']['tax_regime'];
export type MemberRole = Database['public']['Enums']['member_role'];
export type Valuation = Database['public']['Enums']['material_valuation'];
export type GiftTreatment = Database['public']['Enums']['gift_treatment'];

export interface WorkshopRecord {
  id: string;
  name: string;
  currency: string;
  timezone: string;
  taxRegime: TaxRegime;
  ruc: string | null;
  legalName: string | null;
}

export interface WorkshopDraft {
  name: string;
  currency: string;
  timezone: string;
  taxRegime: TaxRegime;
  ruc: string | null;
  legalName: string | null;
}

export interface MemberRecord {
  id: string;
  userId: string;
  role: MemberRole;
  displayName: string | null;
  laborRatePerHour: number | null;
}

export interface MemberDraft {
  displayName: string | null;
  role: MemberRole;
  laborRatePerHour: number | null;
}

/** Rates as fractions (0.03 is 3 %), exactly as stored. */
export interface CostProfileRecord {
  id: string;
  validFrom: string;
  materialWasteRate: number;
  failureRate: number;
  laborRatePerHour: number;
  energyRatePerKwh: number;
  targetMargin: number;
  minOrderPrice: number;
  roundingStep: number;
  igvRate: number;
  materialValuation: Valuation;
  note: string | null;
}

export type CostProfileDraft = Omit<CostProfileRecord, 'id'>;

export interface ChannelRecord {
  id: string;
  name: string;
  commissionRate: number;
  active: boolean;
}

export interface GiftCategoryRecord {
  id: string;
  name: string;
  treatment: GiftTreatment;
}

export interface BrandRecord {
  id: string;
  name: string;
  active: boolean;
}

export type BrandDraft = Omit<BrandRecord, 'id'>;

export interface MaterialRecord {
  id: string;
  code: string;
  /** Null when the workshop has not measured it. */
  densityGCm3: number | null;
  hygroscopic: boolean;
  abrasive: boolean;
  active: boolean;
}

export type MaterialDraft = Omit<MaterialRecord, 'id'>;

/** Column is numeric(5, 3): three decimals, below 100. */
export const MAX_DENSITY = 99.999;

export const HYGROSCOPIC_HELP =
  'Absorbe humedad del aire y hay que secarlo antes de imprimir (PETG, TPU, nailon). Activa los avisos de secado.';

export const ABRASIVE_HELP =
  'Desgasta la boquilla de latón y conviene usar una de acero (fibra de carbono, madera, luminoso). Activa el aviso de boquilla.';

export const TAX_REGIME_LABELS: Record<TaxRegime, string> = {
  none: 'Sin RUC',
  nrus: 'NRUS',
  rer: 'RER',
  rmt: 'RMT',
  general: 'Régimen General',
};

/** What each regime means for the documents the workshop can issue. */
export const TAX_REGIME_HELP: Record<TaxRegime, string> = {
  none: 'Sin RUC no se emiten comprobantes: se entrega una nota de venta interna y no se desglosa IGV.',
  nrus: 'En el NRUS se emiten boletas sin desglosar IGV.',
  rer: 'En el RER se emiten boletas y facturas con IGV al 18 %. Necesitas RUC.',
  rmt: 'En el RMT se emiten boletas y facturas con IGV al 18 %. Necesitas RUC.',
  general: 'En el Régimen General se emiten boletas y facturas con IGV al 18 %. Necesitas RUC.',
};

export const TAX_REGIMES = Object.keys(TAX_REGIME_LABELS) as TaxRegime[];

export const ROLE_LABELS: Record<MemberRole, string> = {
  owner: 'Dueño',
  operator: 'Operador',
  viewer: 'Solo lectura',
};

export const ROLE_HELP: Record<MemberRole, string> = {
  owner: 'Puede cambiar la configuración y borrar datos.',
  operator: 'Registra compras, pedidos e impresiones.',
  viewer: 'Solo consulta.',
};

export const ROLES = Object.keys(ROLE_LABELS) as MemberRole[];

export const VALUATION_LABELS: Record<Valuation, string> = {
  weighted_avg: 'Costo promedio del stock',
  last_cost: 'Último costo de compra',
  replacement: 'Costo de reposición',
};

export const VALUATION_HELP: Record<Valuation, string> = {
  weighted_avg: 'El filamento se valora al costo promedio de lo que hay en el estante.',
  last_cost: 'El filamento se valora a lo que costó la última compra.',
  replacement: 'El filamento se valora al costo de reposición definido en cada SKU.',
};

export const VALUATIONS = Object.keys(VALUATION_LABELS) as Valuation[];

export const TREATMENT_LABELS: Record<GiftTreatment, string> = {
  marketing: 'Marketing',
  owner_draw: 'Retiro del dueño',
  other: 'Otro',
};

export const TREATMENT_HELP: Record<GiftTreatment, string> = {
  marketing: 'Se trata como gasto de promoción del negocio.',
  owner_draw: 'Se trata como retiro del dueño, no como gasto del negocio.',
  other: 'Gasto general, sin tratamiento especial.',
};

export const TREATMENTS = Object.keys(TREATMENT_LABELS) as GiftTreatment[];

export const TIMEZONES = [
  'America/Lima',
  'America/Bogota',
  'America/Guayaquil',
  'America/La_Paz',
  'America/Santiago',
  'America/Argentina/Buenos_Aires',
  'America/Mexico_City',
  'UTC',
];

export const CURRENCIES = ['PEN', 'USD'];

export const RUC_PATTERN = /^[0-9]{11}$/;

export interface ProfileLine {
  label: string;
  value: string;
  explanation: string;
}

/** Tone for the role badge in the members list. */
export const ROLE_TONES: Record<MemberRole, BadgeTone> = {
  owner: 'info',
  operator: 'neutral',
  viewer: 'neutral',
};

export interface FinishRecord {
  id: string;
  name: string;
  /** Un acabado puede ser abrasivo aunque el material no lo sea: Silk, Glow, Wood. */
  abrasive: boolean;
  active: boolean;
}

export type FinishDraft = Omit<FinishRecord, 'id'>;

export type MovementDirection = 'income' | 'expense';

export interface CategoryRecord {
  id: string;
  name: string;
  direction: MovementDirection;
  active: boolean;
}

export type CategoryDraft = Omit<CategoryRecord, 'id'>;

/**
 * The categories a collection and a purchase payment are filed under when
 * nobody picks one. Null leaves it automatic: the only active category of that
 * direction, if there is only one.
 */
export interface PaymentCategoryChoice {
  orderCategoryId: string | null;
  purchaseCategoryId: string | null;
}
