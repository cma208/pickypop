/**
 * What the finance screens need on top of `core/styles.ts`: money columns,
 * the filter bar and the row of an annulled movement. Colours come from the
 * global tokens, so light and dark both work.
 */
export const FINANCE_STYLES = `
  .filters { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: flex-end; margin-bottom: 1rem; }
  .filter { display: grid; gap: 0.25rem; flex: 1 1 9rem; min-width: 8rem; max-width: 15rem; font-size: 0.8rem; }
  .filter.wide { max-width: 20rem; flex-basis: 12rem; }
  .totals { display: flex; flex-wrap: wrap; gap: 1.25rem; margin-bottom: 1rem; }
  .totals div { display: grid; gap: 0.1rem; }
  .totals dt, .totals .cap { font-size: 0.78rem; color: var(--muted); }
  .totals .amount { font-size: 1.15rem; font-weight: 600; font-variant-numeric: tabular-nums; }
  .pos { color: var(--good); }
  .neg { color: var(--danger); }
  .strong { font-weight: 600; }
  .sub { display: block; font-size: 0.75rem; color: var(--muted); }
  .amount-cell { white-space: nowrap; font-weight: 600; }
  .voided td { opacity: 0.6; }
  .voided .amount-cell { text-decoration: line-through; font-weight: 400; }
  .alert { margin: 0 0 1rem; padding: 0.6rem 0.9rem; border-radius: 8px; background: var(--danger-soft); color: var(--danger); }
  .alert-warn { background: var(--warn-soft); color: var(--warn); }
  .explainer { margin: 0 0 0.9rem; padding: 0.6rem 0.9rem; border-radius: 8px; background: var(--accent-soft); font-size: 0.85rem; }
  .explainer p { margin: 0 0 0.35rem; }
  .explainer p:last-child { margin: 0; }
  .block { display: block; }
  .right { text-align: right; }
  .nowrap { white-space: nowrap; }
  .only-small { display: none !important; }
  @media (max-width: 40rem) {
    .only-small { display: block !important; }
    .hide-small { display: none; }
    th, td { padding: 0.5rem 0.4rem; }
  }
`;
