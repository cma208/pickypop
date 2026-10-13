import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { Appearance } from '../../core/appearance';
import { AppearanceSection } from './appearance-section';

async function settle(fixture: ComponentFixture<AppearanceSection>): Promise<void> {
  for (let round = 0; round < 3; round++) {
    await fixture.whenStable();
    fixture.detectChanges();
  }
}

const pressed = (fixture: ComponentFixture<AppearanceSection>) =>
  ([...fixture.nativeElement.querySelectorAll('[aria-pressed="true"]')] as HTMLElement[]).map((button) =>
    button.getAttribute('aria-label'),
  );
const pending = (fixture: ComponentFixture<AppearanceSection>) => fixture.nativeElement.querySelector('.pending');

function button(fixture: ComponentFixture<AppearanceSection>, label: string): HTMLButtonElement {
  return fixture.nativeElement.querySelector(`[aria-label="${label}"]`) as HTMLButtonElement;
}

describe('AppearanceSection next to the floating «Colores» button', () => {
  afterEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset['mode'];
    delete document.documentElement.dataset['palette'];
    delete document.documentElement.dataset['density'];
  });

  it('follows a change made with the button instead of calling it unsaved', async () => {
    const fixture = TestBed.createComponent(AppearanceSection);
    await settle(fixture);
    const appearance = TestBed.inject(Appearance);

    appearance.save({ ...appearance.settings(), palette: 'ciruela', mode: 'dark' });
    await settle(fixture);

    expect(pressed(fixture)).toEqual(expect.arrayContaining(['Tema Ciruela', 'Oscuro']));
    expect(pending(fixture)).toBeNull();
  });

  it('keeps a theme being compared when the menu is collapsed from here', async () => {
    const fixture = TestBed.createComponent(AppearanceSection);
    await settle(fixture);
    const appearance = TestBed.inject(Appearance);

    button(fixture, 'Tema Índigo').click();
    await settle(fixture);
    appearance.setSidebarCollapsed(true);
    await settle(fixture);

    expect(pressed(fixture)).toContain('Tema Índigo');
    expect(pending(fixture)).not.toBeNull();
  });
});
