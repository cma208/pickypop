/**
 * What a button offered only to the owner says to an operator. The operator
 * creates and edits the catalogue like the owner; only removing something is
 * the owner's, because the database refuses everyone else (T2-10). The role
 * itself is read from `CurrentWorkspace` (`isOwner`, `canOperate`), the one
 * place that reads it (ADR-025); a viewer is offered nothing to change.
 */
export const OWNER_ONLY = {
  variant: 'Solo el dueño puede eliminar una variante.',
  recipeRows: 'Quitar placas, filamentos, piezas o insumos de la receta lo hace solo el dueño.',
  tiers: 'Solo el dueño puede quitar un escalón.',
} as const;
