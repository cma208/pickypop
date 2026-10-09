import { Injectable, signal } from '@angular/core';

/**
 * Light or dark. `auto` follows the system, and is stored as the absence of a
 * choice so the media query keeps deciding.
 */
export type ModeChoice = 'auto' | 'light' | 'dark';

/**
 * The colour palette. These ids are the one thing shared with `_palettes.scss`
 * by hand: the colours themselves live only there, and an id that does not
 * match a palette simply falls back to the default, visibly and harmlessly.
 */
export type PaletteChoice = 'terracota' | 'indigo' | 'turquesa' | 'ciruela' | 'grafito';

export type DensityChoice = 'comfortable' | 'compact';

export interface AppearanceSettings {
  mode: ModeChoice;
  palette: PaletteChoice;
  density: DensityChoice;
  /** Whether the side menu starts as a rail of icons. */
  sidebarCollapsed: boolean;
}

export interface PaletteOption {
  id: PaletteChoice;
  label: string;
  hint: string;
}

/** Names and descriptions only. Not a single colour: those are in the stylesheet. */
export const PALETTE_OPTIONS: PaletteOption[] = [
  { id: 'terracota', label: 'Terracota', hint: 'Barro sobre crema, la primera de Pickypop.' },
  { id: 'indigo', label: 'Índigo', hint: 'Fría y seria, de tinta azul.' },
  { id: 'turquesa', label: 'Turquesa', hint: 'Fresca, de taller limpio.' },
  { id: 'ciruela', label: 'Ciruela', hint: 'La más alegre, de dulce de feria.' },
  { id: 'grafito', label: 'Grafito', hint: 'Sin color propio: lo pone el contenido.' },
];

// Grafito in light mode until someone picks otherwise: the owner's choice
// (2026-10-09). index.html paints the same before Angular boots.
export const DEFAULT_APPEARANCE: AppearanceSettings = {
  mode: 'light',
  palette: 'grafito',
  density: 'comfortable',
  sidebarCollapsed: false,
};

/**
 * Where it is stored, read in two places: here, and by the small script in
 * index.html that applies it before Angular boots. Without that script the app
 * paints in the default palette and then flips, which looks broken.
 */
export const APPEARANCE_KEY = 'pickypop.appearance';

const MODES: ModeChoice[] = ['auto', 'light', 'dark'];
const PALETTES: PaletteChoice[] = PALETTE_OPTIONS.map((option) => option.id);
const DENSITIES: DensityChoice[] = ['comfortable', 'compact'];

/**
 * How the app looks, for this browser.
 *
 * Deliberately **not** in the database. Appearance is a property of the
 * screen you are looking at, not of who you are: the same person may want
 * dark on the laptop at night and light on the shop tablet under the lamp.
 * It also has to be readable before anything has loaded, which rules out a
 * round trip.
 *
 * The flip side, and it is a real one: two people sharing a browser share
 * these settings. That is a fair trade for something with no consequences.
 */
@Injectable({ providedIn: 'root' })
export class Appearance {
  private readonly current = signal<AppearanceSettings>(read());

  /** The settings in force. The form edits a copy and only lands here on save. */
  readonly settings = this.current.asReadonly();

  constructor() {
    this.apply(this.current());
  }

  /** Writes and applies at once: used by the save button and the menu toggle. */
  save(next: AppearanceSettings): void {
    this.current.set(next);
    this.apply(next);
    try {
      localStorage.setItem(APPEARANCE_KEY, JSON.stringify(next));
    } catch {
      // A browser with storage blocked still works; it just forgets.
    }
  }

  setSidebarCollapsed(collapsed: boolean): void {
    this.save({ ...this.current(), sidebarCollapsed: collapsed });
  }

  private apply(settings: AppearanceSettings): void {
    const root = document.documentElement;
    // "auto" is the absence of a choice, so the media query can do its job.
    if (settings.mode === 'auto') delete root.dataset['mode'];
    else root.dataset['mode'] = settings.mode;
    root.dataset['palette'] = settings.palette;
    root.dataset['density'] = settings.density;
  }
}

/** Anything unknown or corrupt falls back to the default, one field at a time. */
export function parseAppearance(raw: unknown): AppearanceSettings {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_APPEARANCE;
  const value = raw as Record<string, unknown>;
  // Until 2026-10-06 the mode was stored as `theme`, before palettes existed
  // and made that name a lie. Reading the old key keeps whoever had chosen
  // dark on dark instead of silently resetting them.
  const mode = value['mode'] ?? value['theme'];
  return {
    mode: MODES.includes(mode as ModeChoice) ? (mode as ModeChoice) : DEFAULT_APPEARANCE.mode,
    palette: PALETTES.includes(value['palette'] as PaletteChoice)
      ? (value['palette'] as PaletteChoice)
      : DEFAULT_APPEARANCE.palette,
    density: DENSITIES.includes(value['density'] as DensityChoice)
      ? (value['density'] as DensityChoice)
      : DEFAULT_APPEARANCE.density,
    sidebarCollapsed:
      typeof value['sidebarCollapsed'] === 'boolean'
        ? value['sidebarCollapsed']
        : DEFAULT_APPEARANCE.sidebarCollapsed,
  };
}

function read(): AppearanceSettings {
  try {
    const stored = localStorage.getItem(APPEARANCE_KEY);
    return stored ? parseAppearance(JSON.parse(stored)) : DEFAULT_APPEARANCE;
  } catch {
    return DEFAULT_APPEARANCE;
  }
}
