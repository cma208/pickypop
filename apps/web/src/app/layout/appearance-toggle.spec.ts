import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it } from 'vitest';
import { APPEARANCE_KEY, DEFAULT_APPEARANCE } from '../core/appearance';
import { AppearanceToggle } from './appearance-toggle';

async function settle(fixture: ComponentFixture<AppearanceToggle>): Promise<void> {
  for (let round = 0; round < 3; round++) {
    await fixture.whenStable();
    fixture.detectChanges();
  }
}

async function mount(): Promise<ComponentFixture<AppearanceToggle>> {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(AppearanceToggle);
  await settle(fixture);
  return fixture;
}

const element = (fixture: ComponentFixture<AppearanceToggle>) => fixture.nativeElement as HTMLElement;
const toggleButton = (fixture: ComponentFixture<AppearanceToggle>) =>
  element(fixture).querySelector('button.toggle') as HTMLButtonElement;
const panel = (fixture: ComponentFixture<AppearanceToggle>) => element(fixture).querySelector('.panel');
const radio = (fixture: ComponentFixture<AppearanceToggle>, value: string) =>
  element(fixture).querySelector(`input[value="${value}"]`) as HTMLInputElement;
const stored = () => JSON.parse(localStorage.getItem(APPEARANCE_KEY) ?? '{}') as Record<string, unknown>;

async function open(fixture: ComponentFixture<AppearanceToggle>): Promise<void> {
  toggleButton(fixture).click();
  await settle(fixture);
}

describe('AppearanceToggle, the floating «Colores» button', () => {
  afterEach(() => {
    localStorage.clear();
    const root = document.documentElement;
    delete root.dataset['mode'];
    delete root.dataset['palette'];
    delete root.dataset['density'];
  });

  it('starts closed, showing only the button', async () => {
    const fixture = await mount();

    expect(toggleButton(fixture).textContent).toContain('Colores');
    expect(toggleButton(fixture).getAttribute('aria-expanded')).toBe('false');
    expect(panel(fixture)).toBeNull();
  });

  it('opens with the five palettes and the three modes, the ones in force checked', async () => {
    const fixture = await mount();
    await open(fixture);

    const palettes = [...element(fixture).querySelectorAll<HTMLInputElement>('input[name="appearance-palette"]')];
    const modes = [...element(fixture).querySelectorAll<HTMLInputElement>('input[name="appearance-mode"]')];
    expect(palettes.map((input) => input.value)).toEqual(['terracota', 'indigo', 'turquesa', 'ciruela', 'grafito']);
    expect(modes.map((input) => input.value)).toEqual(['auto', 'light', 'dark']);
    expect(radio(fixture, DEFAULT_APPEARANCE.palette).checked).toBe(true);
    expect(radio(fixture, DEFAULT_APPEARANCE.mode).checked).toBe(true);
    expect(toggleButton(fixture).getAttribute('aria-expanded')).toBe('true');
  });

  it('applies a palette on the spot and keeps it, leaving the rest as it was', async () => {
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify({ ...DEFAULT_APPEARANCE, density: 'compact' }));
    const fixture = await mount();
    await open(fixture);

    radio(fixture, 'indigo').click();
    await settle(fixture);

    expect(document.documentElement.dataset['palette']).toBe('indigo');
    expect(stored()).toMatchObject({ palette: 'indigo', mode: DEFAULT_APPEARANCE.mode, density: 'compact' });
    expect(panel(fixture)).not.toBeNull();
  });

  it('switches between claro and oscuro on the spot', async () => {
    const fixture = await mount();
    await open(fixture);

    radio(fixture, 'dark').click();
    await settle(fixture);
    expect(document.documentElement.dataset['mode']).toBe('dark');
    expect(stored()).toMatchObject({ mode: 'dark' });

    radio(fixture, 'light').click();
    await settle(fixture);
    expect(document.documentElement.dataset['mode']).toBe('light');
  });

  it('closes with Escape and gives the focus back to the button', async () => {
    const fixture = await mount();
    await open(fixture);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await settle(fixture);

    expect(panel(fixture)).toBeNull();
    expect(document.activeElement).toBe(toggleButton(fixture));
  });

  it('leaves the focus where it was when Escape is pressed outside the panel', async () => {
    const fixture = await mount();
    await open(fixture);
    const elsewhere = document.createElement('button');
    document.body.append(elsewhere);
    elsewhere.focus();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await settle(fixture);

    expect(panel(fixture)).toBeNull();
    expect(document.activeElement).toBe(elsewhere);
    elsewhere.remove();
  });

  it('closes when the focus is tabbed out of it, not when it moves inside', async () => {
    const fixture = await mount();
    await open(fixture);
    const elsewhere = document.createElement('button');
    document.body.append(elsewhere);

    radio(fixture, 'indigo').dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: radio(fixture, 'dark') }));
    await settle(fixture);
    expect(panel(fixture)).not.toBeNull();

    radio(fixture, 'indigo').dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: elsewhere }));
    await settle(fixture);
    expect(panel(fixture)).toBeNull();
    elsewhere.remove();
  });

  it('closes on a click outside it, and stays open on a click inside', async () => {
    const fixture = await mount();
    await open(fixture);

    panel(fixture)!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await settle(fixture);
    expect(panel(fixture)).not.toBeNull();

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await settle(fixture);
    expect(panel(fixture)).toBeNull();
  });

  it('sends density and the menu to Configuración → Apariencia', async () => {
    const fixture = await mount();
    await open(fixture);

    const link = element(fixture).querySelector('.hint a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/configuracion?tab=appearance');
  });
});
