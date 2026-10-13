import { afterNextRender, Component, ElementRef, inject, Injector, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Appearance, PALETTE_OPTIONS, type ModeChoice, type PaletteChoice } from '../core/appearance';

const MODE_OPTIONS: { id: ModeChoice; label: string }[] = [
  { id: 'auto', label: 'Automático' },
  { id: 'light', label: 'Claro' },
  { id: 'dark', label: 'Oscuro' },
];

/**
 * The floating «Colores» button, the same one the manual has
 * (docs/manual/build-manual.py), so whoever learned it there finds it here.
 *
 * Unlike Configuración → Apariencia, a choice applies on the spot: this is
 * for switching while working (claro under the shop lamp, oscuro at night),
 * and the panel itself is the preview. It writes the same preference, so the
 * manual follows in this browser. Density and the menu stay in Configuración:
 * they are set once, not switched.
 */
@Component({
  selector: 'app-appearance-toggle',
  imports: [RouterLink],
  host: {
    '(document:keydown.escape)': 'closeOnEscape()',
    '(document:pointerdown)': 'closeOnOutside($event)',
    '(focusout)': 'closeOnFocusAway($event)',
  },
  styles: `
    /* --lift: how much higher it sits over a bar fixed at the bottom (styles.scss). */
    :host {
      position: fixed; z-index: 10;
      right: calc(1rem + env(safe-area-inset-right, 0px));
      bottom: calc(1rem + var(--lift, 0px) + env(safe-area-inset-bottom, 0px));
      display: grid; justify-items: end; gap: 0.6rem;
    }
    .toggle {
      height: 2.75rem; padding: 0 1.1rem 0 0.9rem; border-radius: 999px;
      border: 1px solid var(--line); background: var(--surface); color: var(--text);
      font-weight: 700; display: inline-flex; align-items: center; gap: 0.5rem;
      box-shadow: 0 2px 10px rgb(0 0 0 / 0.14);
    }
    .toggle svg { color: var(--accent); }
    .toggle[aria-expanded='true'] { border-color: var(--accent); background: var(--accent-soft); }
    .toggle:hover { background: var(--accent-soft); }
    .toggle:focus-visible, input:focus-visible + span { outline: 3px solid var(--accent); outline-offset: 2px; }

    .panel {
      width: min(19rem, calc(100vw - 2rem));
      background: var(--surface); color: var(--text); border: 1px solid var(--line); border-radius: 12px;
      padding: 1rem; box-shadow: 0 8px 28px rgb(0 0 0 / 0.18); display: grid; gap: 1rem;
      /* A fixed box cannot be scrolled into view: on a phone lying down it scrolls inside. */
      max-height: calc(100dvh - 5.5rem - var(--lift, 0px) - env(safe-area-inset-bottom, 0px));
      overflow-y: auto; overscroll-behavior: contain;
    }
    fieldset { border: 0; margin: 0; padding: 0; display: grid; gap: 0.45rem; }
    legend {
      font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
      color: var(--muted); margin-bottom: 0.45rem; padding: 0;
    }
    label { display: block; cursor: pointer; }
    input { position: absolute; opacity: 0; pointer-events: none; }
    label > span {
      display: flex; align-items: center; gap: 0.6rem; padding: 0.4rem 0.55rem;
      border-radius: 8px; border: 1px solid transparent;
    }
    label:hover > span { background: var(--accent-soft); }
    input:checked + span { border-color: var(--accent); background: var(--accent-soft); font-weight: 700; }

    /* Half the palette's accent in claro, half its background in oscuro, as
       in the manual. Each half wears the palette, so the stylesheet paints it
       and a retouched colour shows here without a second copy. */
    .swatch {
      position: relative; width: 1.3rem; height: 1.3rem; flex: none;
      border-radius: 50%; border: 1px solid var(--line); overflow: hidden;
    }
    .swatch i { position: absolute; inset: 0; }
    .swatch i:first-child { background: var(--accent); }
    .swatch i:last-child { background: var(--bg); clip-path: polygon(100% 0, 100% 100%, 0 100%); }

    .modes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.35rem; }
    .modes label > span { justify-content: center; border-color: var(--line); }
    /* Scoped, the rule above outweighs the checked one: the mode in force keeps its accent border. */
    .modes input:checked + span { border-color: var(--accent); }
    .hint { margin: 0; font-size: 0.83rem; color: var(--muted); }
  `,
  template: `
    @if (open()) {
      <div class="panel" id="appearance-panel" role="dialog" aria-label="Colores y modo">
        <fieldset>
          <legend>Colores</legend>
          @for (option of palettes; track option.id) {
            <label>
              <input
                type="radio"
                name="appearance-palette"
                [value]="option.id"
                [checked]="settings().palette === option.id"
                (change)="choosePalette(option.id)"
              />
              <span>
                <span class="swatch" aria-hidden="true">
                  <i [attr.data-palette]="option.id" data-mode="light"></i>
                  <i [attr.data-palette]="option.id" data-mode="dark"></i>
                </span>
                {{ option.label }}
              </span>
            </label>
          }
        </fieldset>
        <fieldset>
          <legend>Claro u oscuro</legend>
          <div class="modes">
            @for (option of modes; track option.id) {
              <label>
                <input
                  type="radio"
                  name="appearance-mode"
                  [value]="option.id"
                  [checked]="settings().mode === option.id"
                  (change)="chooseMode(option.id)"
                />
                <span>{{ option.label }}</span>
              </label>
            }
          </div>
        </fieldset>
        <p class="hint">
          Se guarda en este navegador y también cambia el manual. La densidad de las tablas y el menú están en
          <a routerLink="/configuracion" [queryParams]="{ tab: 'appearance' }" (click)="close()">Configuración</a>.
        </p>
      </div>
    }
    <button
      type="button"
      class="toggle"
      [attr.aria-expanded]="open()"
      aria-controls="appearance-panel"
      title="Colores y modo"
      (click)="toggle()"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.4A4.6 4.6 0 0 0 21 9.8C21 6 17 3 12 3z" />
        <circle cx="7.5" cy="10.5" r="1.2" fill="currentColor" />
        <circle cx="10.5" cy="7" r="1.2" fill="currentColor" />
        <circle cx="15" cy="7.5" r="1.2" fill="currentColor" />
      </svg>
      <span>Colores</span>
    </button>
  `,
})
export class AppearanceToggle {
  private readonly appearance = inject(Appearance);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly palettes = PALETTE_OPTIONS;
  protected readonly modes = MODE_OPTIONS;
  protected readonly settings = this.appearance.settings;
  protected readonly open = signal(false);

  protected toggle(): void {
    if (this.open()) {
      this.close();
      return;
    }
    this.open.set(true);
    // Straight to the current choice, so the arrow keys move from there.
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLInputElement>('input:checked')?.focus(), {
      injector: this.injector,
    });
  }

  protected close(): void {
    this.open.set(false);
  }

  protected choosePalette(palette: PaletteChoice): void {
    this.appearance.save({ ...this.settings(), palette });
  }

  protected chooseMode(mode: ModeChoice): void {
    this.appearance.save({ ...this.settings(), mode });
  }

  /** Focus goes back to the button only from inside the panel: an Escape meant for another control keeps its focus. */
  protected closeOnEscape(): void {
    if (!this.open()) return;
    const hadFocus = this.host.nativeElement.contains(document.activeElement);
    this.close();
    if (hadFocus) this.host.nativeElement.querySelector<HTMLButtonElement>('.toggle')?.focus();
  }

  /** Tabbing out of the panel closes it, so it never sits over the control that has the focus. */
  protected closeOnFocusAway(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (this.open() && next && !this.host.nativeElement.contains(next)) this.close();
  }

  protected closeOnOutside(event: PointerEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.close();
  }
}
