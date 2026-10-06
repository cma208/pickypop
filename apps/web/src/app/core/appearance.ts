import { Injectable, signal } from '@angular/core';

export type ThemeChoice = 'auto' | 'light' | 'dark';
export type DensityChoice = 'comfortable' | 'compact';

export interface AppearanceSettings {
  theme: ThemeChoice;
  density: DensityChoice;
  /** Whether the side menu starts as a rail of icons. */
  sidebarCollapsed: boolean;
}

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  theme: 'auto',
  density: 'comfortable',
  sidebarCollapsed: false,
};

/**
 * Where it is stored, read in two places: here, and by the small script in
 * index.html that applies the theme before Angular boots. Without that script
 * the app paints light and then flips, which looks broken.
 */
export const APPEARANCE_KEY = 'pickypop.appearance';

const THEMES: ThemeChoice[] = ['auto', 'light', 'dark'];
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
    if (settings.theme === 'auto') delete root.dataset['theme'];
    else root.dataset['theme'] = settings.theme;
    root.dataset['density'] = settings.density;
  }
}

/** Anything unknown or corrupt falls back to the default, one field at a time. */
export function parseAppearance(raw: unknown): AppearanceSettings {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_APPEARANCE;
  const value = raw as Partial<Record<keyof AppearanceSettings, unknown>>;
  return {
    theme: THEMES.includes(value.theme as ThemeChoice) ? (value.theme as ThemeChoice) : DEFAULT_APPEARANCE.theme,
    density: DENSITIES.includes(value.density as DensityChoice)
      ? (value.density as DensityChoice)
      : DEFAULT_APPEARANCE.density,
    sidebarCollapsed:
      typeof value.sidebarCollapsed === 'boolean' ? value.sidebarCollapsed : DEFAULT_APPEARANCE.sidebarCollapsed,
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
