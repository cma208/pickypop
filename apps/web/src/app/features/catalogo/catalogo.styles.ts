/** Small layout helpers shared by the catalogue components. */
export const SHARED_STYLES = `
  :host { display: block; }
  .stack { display: grid; gap: 1rem; grid-template-columns: minmax(0, 1fr); }
  .fields { display: grid; gap: 0 0.75rem; grid-template-columns: repeat(auto-fit, minmax(min(10rem, 100%), 1fr)); align-items: start; }
  .fields.wide { grid-template-columns: repeat(auto-fit, minmax(min(14rem, 100%), 1fr)); }
  .fields > * { min-width: 0; }
  .check { display: flex; align-items: center; gap: 0.5rem; margin: 0.4rem 0 0.9rem; }
  .check input { width: auto; }
  .bar { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin-top: 0.5rem; }
  .bar .grow { flex: 1; }
  .scroll { overflow-x: auto; }
  .notice { padding: 0.6rem 0.8rem; border-radius: 8px; background: var(--warn-soft); color: var(--warn); font-size: 0.85rem; }
  .notice p, .notice ul { margin: 0; }
  .notice ul { padding-left: 1.1rem; }
  .ok { color: var(--good); font-size: 0.85rem; }
  small, .hint { font-size: 0.78rem; }
`;
