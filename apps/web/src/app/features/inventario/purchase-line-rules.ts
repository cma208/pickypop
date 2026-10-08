import { PURCHASE_LIMITS } from '../../core/pricing';
import { decimalPlaces } from './form-helpers';
import { countedWhole } from './inventario.format';

const NUMBER = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 });

export interface PurchaseLineFacts {
  /** Null while no product is chosen: then only what holds for both kinds is judged. */
  kind: 'sku' | 'item' | null;
  quantity: number | null;
  unitPrice: number | null;
  /** What a supply is counted in. Null for a roll. */
  unit: string | null;
}

/** What is wrong with each number of a purchase line, said next to it. Null when it is fine. */
export interface PurchaseLineProblems {
  quantity: string | null;
  unitPrice: string | null;
}

/**
 * The limits of a purchase line, with a sentence for each. They used to be
 * two `min` validators: ten billion grams of sweets went through, and the
 * purchase was left with no lines; a roll at zero said «El valor mínimo es
 * 0.001» (T1-06, T1-24). The caps are the domain's, the same the database
 * applies.
 */
export function purchaseLineProblems(line: PurchaseLineFacts): PurchaseLineProblems {
  return { quantity: quantityProblem(line), unitPrice: priceProblem(line) };
}

function quantityProblem({ kind, quantity, unit }: PurchaseLineFacts): string | null {
  if (quantity === null) return 'Indica la cantidad.';

  if (kind === 'sku') {
    if (quantity < 1) return 'Al menos 1 rollo.';
    if (!Number.isInteger(quantity)) return 'Los rollos se compran enteros.';
    if (quantity > PURCHASE_LIMITS.rollsPerLine) {
      return `Hasta ${PURCHASE_LIMITS.rollsPerLine} rollos por línea: revisa la cantidad.`;
    }
    return null;
  }

  if (quantity <= 0) return 'La cantidad tiene que ser mayor que cero.';
  if (quantity > PURCHASE_LIMITS.quantityPerLine) {
    return `Hasta ${NUMBER.format(PURCHASE_LIMITS.quantityPerLine)} por línea: revisa la cantidad.`;
  }
  if (kind === 'item' && countedWhole(unit) && !Number.isInteger(quantity)) {
    return `Se cuenta por ${unit}: la cantidad va entera.`;
  }
  if (decimalPlaces(quantity) > PURCHASE_LIMITS.quantityDecimals) {
    return `Hasta ${PURCHASE_LIMITS.quantityDecimals} decimales.`;
  }
  return null;
}

function priceProblem({ kind, unitPrice }: PurchaseLineFacts): string | null {
  if (unitPrice === null) return 'Indica el precio.';
  if (unitPrice < 0) return 'El precio no puede ser negativo.';
  if (unitPrice > PURCHASE_LIMITS.unitPrice) {
    return `Hasta S/ ${NUMBER.format(PURCHASE_LIMITS.unitPrice)} por unidad: revisa el precio.`;
  }
  if (kind === 'sku' && decimalPlaces(unitPrice) > PURCHASE_LIMITS.rollPriceDecimals) {
    return 'El precio de un rollo va en céntimos: hasta 2 decimales.';
  }
  if (decimalPlaces(unitPrice) > PURCHASE_LIMITS.priceDecimals) {
    return `Hasta ${PURCHASE_LIMITS.priceDecimals} decimales: así se guarda el precio.`;
  }
  return null;
}

/** Past this the whole purchase is a typing mistake, whatever each line says. */
export function purchaseTotalProblem(total: number): string | null {
  return total > PURCHASE_LIMITS.total
    ? `La compra pasa de S/ ${NUMBER.format(PURCHASE_LIMITS.total)}: revisa cantidades y precios.`
    : null;
}
