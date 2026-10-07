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

/**
 * «Hay · Separado · Libre · Falta». A separated figure that knows who it is
 * for says so with a dotted line: the names are under the pointer.
 */
export const POSITION_STYLES = `
  .badge-line { margin-top: 0.25rem; }
  .separated[title], .sub[title] { text-decoration: underline dotted; text-underline-offset: 0.2em; cursor: help; }

  /*
   * Four columns need room. Where the table has it they are columns; where it
   * does not (a phone, or a laptop with the menu open) the four figures fold
   * into one line under "Hay", and the badge goes under the article's name,
   * where the row is read from. It is the table's width that decides, not
   * the screen's: the menu takes a third of a small laptop.
   */
  .table-wrap { container-type: inline-size; }
  .narrow-only { display: none; }
  @container (max-width: 56rem) {
    .wide-only { display: none; }
    .narrow-only { display: block; }
  }

  /* A badge such as "Falta comprar 2.38 kg" does not wrap: on a phone its
     room comes out of the gaps between cells. */
  @media (max-width: 40rem) {
    th, td { padding-inline: 0.25rem; }
    td.actions-cell button { padding-inline: 0.45rem; }
  }
`;
