import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE, parseAppearance } from './appearance';

/**
 * What is stored survives upgrades, downgrades and anything a person types
 * into the console, so every field falls back on its own. A single bad value
 * must never leave the app unable to pick a theme.
 */
describe('parseAppearance', () => {
  it('keeps what is valid', () => {
    expect(parseAppearance({ theme: 'dark', density: 'compact', sidebarCollapsed: true })).toEqual({
      theme: 'dark',
      density: 'compact',
      sidebarCollapsed: true,
    });
  });

  it('falls back field by field, not all at once', () => {
    expect(parseAppearance({ theme: 'neon', density: 'compact' })).toEqual({
      theme: DEFAULT_APPEARANCE.theme,
      density: 'compact',
      sidebarCollapsed: DEFAULT_APPEARANCE.sidebarCollapsed,
    });
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
