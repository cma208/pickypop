/**
 * The navigation icons, as one inline sprite.
 *
 * Inline and hand-drawn on purpose: an icon font or a library would be a
 * dependency and a network request for eighteen shapes of twenty lines each.
 * They are all 24×24 strokes with no fill, so they take the colour and the
 * weight of whatever they sit in, including the active state.
 *
 * Keep them geometric. An icon that needs detail to be recognised is already
 * too small to work at 18 px, which is the only size this app draws them at.
 */
import { Component } from '@angular/core';

@Component({
  selector: 'app-nav-icons',
  template: `
<svg aria-hidden="true" focusable="false">
  <symbol id="ic-today" viewBox="0 0 24 24">
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M8 3v4M16 3v4M3 10h18" />
    <circle cx="12" cy="15.5" r="1.5" />
  </symbol>
  <symbol id="ic-calculator" viewBox="0 0 24 24">
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <path d="M8 7h8M8 12h3M8 16h3M15.5 12v4.5M13.5 14.5h4" />
  </symbol>
  <symbol id="ic-funnel" viewBox="0 0 24 24">
    <path d="M3 5h18l-7 8v6.5l-4 2V13z" />
  </symbol>
  <symbol id="ic-doc" viewBox="0 0 24 24">
    <path d="M6 3h8l4 4v14H6z" />
    <path d="M14 3v4h4M9 12h6M9 16h4" />
  </symbol>
  <symbol id="ic-bag" viewBox="0 0 24 24">
    <path d="M5 8h14l-1 12H6z" />
    <path d="M9 8V6a3 3 0 0 1 6 0v2" />
  </symbol>
  <symbol id="ic-users" viewBox="0 0 24 24">
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 20c0-3.4 2.7-5.2 6-5.2s6 1.8 6 5.2" />
    <path d="M16.5 5.4a3.2 3.2 0 0 1 0 5.6M18 15.2c1.9.7 3 2.2 3 4.8" />
  </symbol>
  <symbol id="ic-layers" viewBox="0 0 24 24">
    <path d="M12 3l9 5-9 5-9-5z" />
    <path d="M3 13l9 5 9-5" />
  </symbol>
  <symbol id="ic-grid" viewBox="0 0 24 24">
    <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
  </symbol>
  <symbol id="ic-printer" viewBox="0 0 24 24">
    <path d="M7 9V3h10v6" />
    <rect x="3" y="9" width="18" height="7" rx="2" />
    <path d="M7 14h10v7H7z" />
  </symbol>
  <symbol id="ic-spool" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3.5v2M12 18.5v2" />
  </symbol>
  <symbol id="ic-puzzle" viewBox="0 0 24 24">
    <path d="M10 4h4v2.2a1.8 1.8 0 1 0 3.6 0V4H20v16H4v-3.6h2.2a1.8 1.8 0 1 0 0-3.6H4V4h6z" />
  </symbol>
  <symbol id="ic-box" viewBox="0 0 24 24">
    <path d="M3 7.5l9-4.5 9 4.5v9l-9 4.5-9-4.5z" />
    <path d="M3 7.5l9 4.5 9-4.5M12 12v9" />
  </symbol>
  <symbol id="ic-cart" viewBox="0 0 24 24">
    <circle cx="9.5" cy="20" r="1.4" />
    <circle cx="18" cy="20" r="1.4" />
    <path d="M2 3h3l2.6 12h11L21 7H6" />
  </symbol>
  <symbol id="ic-ledger" viewBox="0 0 24 24">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M7 8h10M7 12h10M7 16h6" />
  </symbol>
  <symbol id="ic-checklist" viewBox="0 0 24 24">
    <path d="M4 6l1.5 1.5L8 5M4 12l1.5 1.5L8 11M4 18l1.5 1.5L8 17" />
    <path d="M11 6h9M11 12h9M11 18h9" />
  </symbol>
  <symbol id="ic-wallet" viewBox="0 0 24 24">
    <rect x="3" y="6" width="18" height="13" rx="2" />
    <path d="M3 10.5h18" />
    <circle cx="17" cy="14.5" r="1.2" />
  </symbol>
  <symbol id="ic-cash" viewBox="0 0 24 24">
    <rect x="2.5" y="6" width="19" height="12" rx="2" />
    <circle cx="12" cy="12" r="3" />
    <path d="M6 10v4M18 10v4" />
  </symbol>
  <symbol id="ic-clock" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7v5.3l3.3 2" />
  </symbol>
  <symbol id="ic-chart" viewBox="0 0 24 24">
    <path d="M3 20.5h18" />
    <path d="M6.5 20.5v-6M12 20.5V7M17.5 20.5v-9.5" />
  </symbol>
  <symbol id="ic-sliders" viewBox="0 0 24 24">
    <path d="M4 7.5h9M19 7.5h1M4 16.5h4M14 16.5h6" />
    <circle cx="16" cy="7.5" r="2.4" />
    <circle cx="11" cy="16.5" r="2.4" />
  </symbol>
</svg>
  `,
  styles: `
    :host { display: none; }
  `,
})
export class NavIcons {}
