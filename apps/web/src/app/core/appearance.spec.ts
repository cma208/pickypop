import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE, parseAppearance } from './appearance';

/**
 * What is stored survives upgrades, downgrades and anything a person types
 * into the console, so every field falls back on its own. A single bad value
 * must never leave the app unable to pick a theme.
 */
describe('parseAppearance', () => {
  it('keeps what is valid', () => {
    expect(
      parseAppearance({ mode: 'dark', palette: 'indigo', density: 'compact', sidebarCollapsed: true }),
    ).toEqual({ mode: 'dark', palette: 'indigo', density: 'compact', sidebarCollapsed: true });
  });

  it('falls back field by field, not all at once', () => {
    expect(parseAppearance({ mode: 'neon', palette: 'fucsia', density: 'compact' })).toEqual({
      mode: DEFAULT_APPEARANCE.mode,
      palette: DEFAULT_APPEARANCE.palette,
      density: 'compact',
      sidebarCollapsed: DEFAULT_APPEARANCE.sidebarCollapsed,
    });
  });

  it('reads the old `theme` as the mode', () => {
    // Before palettes existed the mode was called `theme`. Whoever had chosen
    // dark back then must stay in dark, not be reset without being asked.
    expect(parseAppearance({ theme: 'dark', density: 'compact' })).toEqual({
      mode: 'dark',
      palette: DEFAULT_APPEARANCE.palette,
      density: 'compact',
      sidebarCollapsed: DEFAULT_APPEARANCE.sidebarCollapsed,
    });
  });

  it('prefers the new field when both are stored', () => {
    expect(parseAppearance({ mode: 'light', theme: 'dark' }).mode).toBe('light');
  });

  it('survives anything that is not an object', () => {
    for (const value of [null, undefined, 'dark', 42, []]) {
      expect(parseAppearance(value)).toEqual(DEFAULT_APPEARANCE);
    }
  });

  it('does not take a truthy value for a boolean', () => {
    expect(parseAppearance({ sidebarCollapsed: 'yes' }).sidebarCollapsed).toBe(false);
  });
});
