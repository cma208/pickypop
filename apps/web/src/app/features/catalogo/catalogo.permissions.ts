import { computed, inject, Injectable } from '@angular/core';
import { CurrentWorkspace } from '../../core/workspace';

/**
 * What the signed-in person may do in the catalogue. The operator creates and
 * edits it like the owner; only removing something is the owner's, because
 * the database refuses everyone else (T2-10). The screens use this to not
 * offer what would be refused: a «Quitar» that asks to confirm and then does
 * nothing reads as a broken page.
 *
 * The role comes from `CurrentWorkspace`, the one place that reads it. While
 * it is not known yet, nobody is the owner: a button that appears a moment
 * late is better than one that is offered and then refused.
 */
@Injectable({ providedIn: 'root' })
export class CatalogoPermissions {
  private readonly workspace = inject(CurrentWorkspace);

  readonly isOwner = computed(() => this.workspace.role() === 'owner');

  constructor() {
    // Any screen of the catalogue asks for the workshop soon after; this only
    // makes sure the role is there even if none has asked yet.
    this.workspace.info().catch(() => undefined);
  }
}

/** What a button offered only to the owner says to everyone else. */
export const OWNER_ONLY = {
  variant: 'Solo el dueño puede eliminar una variante.',
  recipeRows: 'Quitar placas, filamentos, piezas o insumos de la receta lo hace solo el dueño.',
  tiers: 'Solo el dueño puede quitar un escalón.',
} as const;
