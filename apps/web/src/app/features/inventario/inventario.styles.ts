/**
 * Layout bits shared by the inventory screens (toolbars, table wrappers,
 * colour swatches, form grid). Colours come from the global tokens, so light
 * and dark themes both work.
 */
export const INVENTORY_STYLES = `
  .toolbar { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: flex-end; margin-bottom: 1rem; }
  .filter { display: grid; gap: 0.25rem; font-size: 0.8rem; flex: 1 1 9rem; max-width: 15rem; min-width: 8rem; }
  .filter.wide { max-width: 22rem; flex-basis: 12rem; }
  .table-wrap { overflow-x: auto; }
  .swatch {
    display: inline-block; flex: none; width: 1rem; height: 1rem; margin-right: 0.5rem;
    border: 1px solid var(--line); border-radius: 50%; vertical-align: middle;
  }
  .swatch.empty { background: repeating-linear-gradient(45deg, var(--line), var(--line) 3px, transparent 3px, transparent 6px); }
  .only-small { display: none !important; }
  @media (max-width: 40rem) {
    .only-small { display: block !important; }
    .hide-small { display: none; }
    th, td { padding: 0.5rem 0.4rem; }
  }
  .actions-cell { white-space: nowrap; text-align: right; }
  .notice, .alert { margin: 0 0 1rem; padding: 0.6rem 0.9rem; border-radius: 8px; }
  .notice { background: var(--good-soft); color: var(--good); }
  .alert { background: var(--danger-soft); color: var(--danger); }
  .alert-warn { background: var(--warn-soft); color: var(--warn); }
  .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); gap: 0 1rem; }
  .form-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: flex-end; margin-top: 1rem; }
  .check { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.9rem; }
  .check input { width: auto; }
  .stack { display: grid; gap: 1rem; }
  .strong { font-weight: 600; }
  small.sub { display: block; font-size: 0.75rem; color: var(--muted); }
  .pos { color: var(--good); }
  .neg { color: var(--danger); }
`;
