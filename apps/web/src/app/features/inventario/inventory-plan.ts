import { inject, Injectable } from '@angular/core';
import type { PlanFilamentPosition } from '@pickypop/domain';
import { PlanService } from '../../core/plan';
import { describeError } from './inventario.errors';
import { filamentPositions, itemPositions, type ArticlePosition } from './stock-position';

/** The plan as the inventory screens read it: one position per article and per filament. */
export interface InventoryPositions {
  items: Map<string, ArticlePosition>;
  filaments: Map<string, PlanFilamentPosition>;
  /** The finished article of each catalogue variant, for «Armar». */
  finishedItemOf: Map<string, string>;
  timeZone: string;
}

/**
 * The shelf is read from the views; who it is for, from the plan. When the
 * plan cannot be computed the stock is still right, so a screen says so and
 * keeps showing what there is instead of going blank.
 */
const PLAN_FAILED = 'No pudimos calcular qué está separado. Lo que hay en el estante sí está al día; recarga en un momento.';

@Injectable({ providedIn: 'root' })
export class InventoryPlan {
  private readonly planner = inject(PlanService);

  async read(): Promise<InventoryPositions> {
    const view = await this.planner.current();
    return {
      items: itemPositions(view),
      filaments: filamentPositions(view),
      finishedItemOf: new Map(
        view.input.recipes.flatMap((recipe) =>
          recipe.finishedItemId ? [[recipe.variantId, recipe.finishedItemId] as const] : [],
        ),
      ),
      timeZone: view.input.settings.timeZone,
    };
  }

  /** Something on this screen moved stock or changed an article: every screen computes the plan again. */
  changed(): void {
    this.planner.invalidate();
  }

  /** What a screen says when the plan could not be read. */
  problem(error: unknown): string {
    return describeError(error, PLAN_FAILED);
  }
}
