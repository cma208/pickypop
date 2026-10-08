import { computed, Injectable, signal } from '@angular/core';
import { priceForQuantity } from '../../core/pricing';
import type { CostContext, Lookups, PriceTierRow, PrinterOption, Recipe, Variant } from './catalogo.models';
import { computeCost, marginOf, priceFallsShort, targetPriceFor, type CostResult } from './costing';

export const DEFAULT_COST_UNITS = 10;

/** One line of the price ladder with what it leaves after costs. */
export interface LadderRow {
  key: string;
  /** Null for the list price row. */
  tierId: string | null;
  label: string;
  quantity: number;
  unitPrice: number;
  costPerUnit: number | null;
  margin: number | null;
  targetPrice: number | null;
  belowTarget: boolean;
}

/**
 * Shared state of one variant's detail: the recipe, the price tiers and the
 * costing sources, so the recipe editor, the ladder and the cost panel always
 * agree. Provided by the variant detail component, one instance per variant.
 */
@Injectable()
export class VariantCostModel {
  readonly variant = signal<Variant | null>(null);
  readonly recipe = signal<Recipe | null>(null);
  readonly tiers = signal<PriceTierRow[]>([]);
  readonly lookups = signal<Lookups | null>(null);
  readonly context = signal<CostContext | null>(null);

  readonly units = signal(DEFAULT_COST_UNITS);
  readonly printerId = signal<string | null>(null);
  /** Costs typed by hand for supplies that have none on record. Not saved. */
  readonly provisionalCosts = signal<Record<string, number>>({});

  readonly profile = computed(() => this.context()?.profile ?? null);

  readonly printer = computed<PrinterOption | null>(() => {
    const printers = this.context()?.printers ?? [];
    return printers.find((printer) => printer.id === this.printerId()) ?? printers[0] ?? null;
  });

  /** Why the cost cannot be shown, or null when it can. */
  readonly blocker = computed<string | null>(() => {
    if (!this.context() || !this.lookups()) return 'Todavía no se cargaron los costos del taller.';
    if (!this.profile()) return 'No hay parámetros de costo vigentes. Créalos en Configuración.';
    if (!this.printer()) return 'No hay una impresora activa para calcular la hora de máquina.';
    const recipe = this.recipe();
    if (!recipe) return 'Esta variante no tiene receta todavía.';
    if (recipe.plates.length === 0) return 'Agrega al menos una placa a la receta para calcular el costo.';
    return null;
  });

  readonly current = computed(() => this.costFor(this.units()));

  /** List price first, then every tier, each with its cost and margin. */
  readonly ladder = computed<LadderRow[]>(() => {
    const variant = this.variant();
    const profile = this.profile();
    const rows: LadderRow[] = [];

    // A tier that starts at or below the list price's quantity replaces it.
    const listQuantity = variant?.minOrderUnits ?? 1;
    const listIsCovered = this.tiers().some((tier) => tier.minQuantity <= listQuantity);

    if (variant?.listPrice != null && !listIsCovered) {
      rows.push(this.ladderRow('list', null, 'Precio de lista', listQuantity, variant.listPrice));
    }
    for (const tier of this.tiers()) {
      rows.push(this.ladderRow(tier.id, tier.id, `Desde ${tier.minQuantity}`, tier.minQuantity, tier.unitPrice));
    }
    // A price of zero gives the product away whatever it costs, so it is
    // marked even when there is no profile to compare against.
    return profile
      ? rows
      : rows.map((row) => ({ ...row, costPerUnit: null, margin: null, belowTarget: row.unitPrice <= 0 }));
  });

  /** The unit price a customer would pay for the units being costed. */
  readonly priceAtUnits = computed(() => {
    const units = this.units();
    if (!Number.isInteger(units) || units <= 0) return null;
    try {
      return priceForQuantity(
        this.tiers().map((tier) => ({ minQuantity: tier.minQuantity, unitPrice: tier.unitPrice })),
        units,
        this.variant()?.listPrice ?? undefined,
      );
    } catch {
      return null;
    }
  });

  costFor(units: number): CostResult | null {
    const recipe = this.recipe();
    const lookups = this.lookups();
    const profile = this.profile();
    const printer = this.printer();
    if (this.blocker() !== null || !recipe || !lookups || !profile || !printer) return null;

    return computeCost(
      { recipe, lookups, profile, printer: printer.profile, provisionalSupplyCosts: this.provisionalCosts() },
      units,
    );
  }

  private ladderRow(key: string, tierId: string | null, label: string, quantity: number, unitPrice: number): LadderRow {
    const profile = this.profile();
    const costPerUnit = this.costFor(quantity)?.breakdown.costPerUnit ?? null;
    const margin = costPerUnit === null ? null : marginOf(unitPrice, costPerUnit);

    return {
      key,
      tierId,
      label,
      quantity,
      unitPrice,
      costPerUnit,
      margin,
      targetPrice: costPerUnit === null || !profile ? null : targetPriceFor(costPerUnit, profile),
      belowTarget: profile !== null && priceFallsShort(unitPrice, margin, profile.targetMargin),
    };
  }
}
