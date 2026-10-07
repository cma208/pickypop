/**
 * Layout bits shared by the inventory screens (toolbars, filters, colour
 * swatches, form grid). The utilities every package uses (`table-wrap`,
 * `hide-small`, `with-thumb`, `alert`…) live in `styles.scss`, once. Colours
 * come from the global tokens, so light and dark themes both work.
 */
export const INVENTORY_STYLES = `
  .toolbar { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: flex-end; margin-bottom: 1rem; }
  .filter { display: grid; gap: 0.25rem; font-size: var(--fs-sm); flex: 1 1 9rem; max-width: 15rem; min-width: 8rem; }
  .filter.wide { max-width: 22rem; flex-basis: 12rem; }
  .swatch {
    display: inline-block; flex: none; width: 1rem; height: 1rem; margin-right: 0.5rem;
    border: 1px solid var(--line); border-radius: 50%; vertical-align: middle;
  }
  .swatch.empty { background: repeating-linear-gradient(45deg, var(--line), var(--line) 3px, transparent 3px, transparent 6px); }
  .notice { margin: 0 0 1rem; padding: 0.6rem 0.9rem; border-radius: var(--radius-sm); background: var(--good-soft); color: var(--good); }
  .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); gap: 0 1rem; }
  .form-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: flex-end; margin-top: 1rem; }
  .check { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.9rem; }
  .check input { width: auto; }
`;
