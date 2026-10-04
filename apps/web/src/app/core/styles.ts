/**
 * Styles shared by the lists and inline forms of the workshop screens. The
 * global stylesheet handles tables, buttons and inputs; this covers the little
 * that is left, so every screen of this package looks the same.
 */
export const SECTION_STYLES = `
  :host { display: block; }
  .check { display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.9rem; font-size: 0.9rem; }
  .check input { width: auto; }
  .items { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.75rem; }
  .item { display: grid; gap: 0.35rem; padding: 0.75rem 0.9rem; border: 1px solid var(--line); border-radius: 10px; }
  .item header { display: flex; align-items: flex-start; gap: 0.5rem; flex-wrap: wrap; }
  .item .title { flex: 1; min-width: 10rem; font-weight: 600; }
  .item p { margin: 0; font-size: 0.85rem; }
  .actions, .form-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .form-actions { margin-top: 0.5rem; }
  .toolbar { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem; }
  .toolbar .grow { flex: 1; }
  .form-box { margin-bottom: 1rem; padding: 1rem; border: 1px solid var(--line); border-radius: 10px; background: var(--bg); }
  .form-box h3 { margin: 0 0 0.75rem; font-size: 0.95rem; }
  .notice { margin: 0 0 1rem; padding: 0.6rem 0.8rem; border-radius: 8px; background: var(--accent-soft); font-size: 0.85rem; }
  .notice.warn { background: var(--warn-soft); color: var(--warn); }
  .table-wrap { overflow-x: auto; }
  fieldset { margin: 0 0 0.9rem; padding: 0.5rem 0.8rem 0.2rem; border: 1px solid var(--line); border-radius: 8px; }
  legend { padding: 0 0.3rem; font-size: 0.85rem; font-weight: 500; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
`;
