import { Component, computed, inject, signal } from '@angular/core';
import { Card } from '../../ui';
import { SECTION_STYLES } from '../../core/styles';
import {
  Appearance,
  type AppearanceSettings,
  type DensityChoice,
  type ThemeChoice,
} from '../../core/appearance';

interface ThemeOption {
  id: ThemeChoice;
  label: string;
  hint: string;
}

const THEME_OPTIONS: ThemeOption[] = [
  { id: 'auto', label: 'Automático', hint: 'Sigue a tu sistema: claro de día, oscuro de noche.' },
  { id: 'light', label: 'Claro', hint: 'Siempre claro, sin importar el sistema.' },
  { id: 'dark', label: 'Oscuro', hint: 'Siempre oscuro, sin importar el sistema.' },
];

const DENSITY_OPTIONS: { id: DensityChoice; label: string; hint: string }[] = [
  { id: 'comfortable', label: 'Cómoda', hint: 'Filas más altas. Se lee mejor.' },
  { id: 'compact', label: 'Compacta', hint: 'Filas más juntas. Entran más en pantalla.' },
];

/**
 * How the app looks. Everything here is a draft until Guardar: cambiar el tema
 * bajo los pies de quien lo está eligiendo hace imposible comparar, que es
 * justo lo que la miniatura resuelve.
 *
 * Las miniaturas no son capturas: son el mismo marcado que el resto de la
 * aplicación con los colores del tema forzados encima, así que si la paleta
 * cambia, cambian solas.
 */
@Component({
  selector: 'app-appearance-section',
  imports: [Card],
  styles: [
    SECTION_STYLES,
    `
    .stack { display: grid; gap: 1rem; }
    fieldset { margin: 0; padding: 0; border: 0; }
    legend { padding: 0; margin-bottom: 0.6rem; font-size: 0.85rem; font-weight: 600; }

    .options { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); }

    .option {
      display: grid;
      gap: 0.5rem;
      padding: 0.6rem;
      border: 1.5px solid var(--line);
      border-radius: 10px;
      cursor: pointer;
      background: none;
      text-align: left;
      color: inherit;
      font: inherit;
    }
    .option:hover { border-color: var(--muted); }
    .option[aria-pressed='true'] { border-color: var(--accent); background: var(--accent-soft); }
    .option .name { font-weight: 600; font-size: 0.9rem; }
    .option .hint { font-size: 0.78rem; color: var(--muted); }

    /* The thumbnail. Hard-coded palettes on purpose: it has to show a theme
       that is NOT the one in force, so it cannot read the live tokens. */
    .thumb {
      display: grid;
      grid-template-columns: 1.6rem 1fr;
      height: 4.2rem;
      border: 1px solid var(--line);
      border-radius: 7px;
      overflow: hidden;
    }
    .thumb .side { padding: 0.25rem 0.2rem; display: grid; gap: 0.2rem; align-content: start; }
    .thumb .side i { display: block; height: 0.3rem; border-radius: 2px; }
    .thumb .body { padding: 0.35rem; display: grid; gap: 0.25rem; align-content: start; }
    .thumb .body b { display: block; height: 0.42rem; width: 55%; border-radius: 2px; }
    .thumb .body i { display: block; height: 0.28rem; border-radius: 2px; }
    .thumb.split { position: relative; }
    .thumb.split .half {
      position: absolute; inset: 0 0 0 50%;
      border-left: 1px solid rgba(128, 128, 128, 0.35);
      display: grid; grid-template-columns: 1.6rem 1fr;
    }

    .rows { display: grid; gap: 0.2rem; }
    .rows i { display: block; border-radius: 2px; background: var(--line); }

    .actions { display: flex; align-items: center; gap: 0.75rem; margin-top: 0.25rem; }
    .saved { color: var(--good); font-size: 0.85rem; }
    .pending { color: var(--warn); font-size: 0.85rem; }
  `,
  ],
  template: `
    <div class="stack">
      <pp-card heading="Tema">
        <p class="muted">
          Se guarda en este navegador, no en tu cuenta: puedes tener oscuro en la laptop y claro en la tablet del
          taller. Si comparten el navegador, comparten esta preferencia.
        </p>
        <fieldset>
          <legend class="sr-only">Tema</legend>
          <div class="options">
            @for (option of themes; track option.id) {
              <button
                type="button"
                class="option"
                [attr.aria-label]="'Tema ' + option.label"
                [attr.aria-pressed]="draft().theme === option.id"
                (click)="setTheme(option.id)"
              >
                @if (option.id === 'auto') {
                  <span class="thumb split" aria-hidden="true">
                    <span class="side" [style.background]="light.surface">
                      <i [style.background]="light.accent"></i>
                      <i [style.background]="light.line"></i>
                      <i [style.background]="light.line"></i>
                    </span>
                    <span class="body" [style.background]="light.bg">
                      <b [style.background]="light.text"></b>
                      <i [style.background]="light.line"></i>
                      <i [style.background]="light.line"></i>
                    </span>
                    <span class="half">
                      <span class="side" [style.background]="dark.surface">
                        <i [style.background]="dark.accent"></i>
                        <i [style.background]="dark.line"></i>
                        <i [style.background]="dark.line"></i>
                      </span>
                      <span class="body" [style.background]="dark.bg">
                        <b [style.background]="dark.text"></b>
                        <i [style.background]="dark.line"></i>
                        <i [style.background]="dark.line"></i>
                      </span>
                    </span>
                  </span>
                } @else {
                  <span class="thumb" aria-hidden="true">
                    <span class="side" [style.background]="palette(option.id).surface">
                      <i [style.background]="palette(option.id).accent"></i>
                      <i [style.background]="palette(option.id).line"></i>
                      <i [style.background]="palette(option.id).line"></i>
                    </span>
                    <span class="body" [style.background]="palette(option.id).bg">
                      <b [style.background]="palette(option.id).text"></b>
                      <i [style.background]="palette(option.id).line"></i>
                      <i [style.background]="palette(option.id).line"></i>
                    </span>
                  </span>
                }
                <span class="name">{{ option.label }}</span>
                <span class="hint">{{ option.hint }}</span>
              </button>
            }
          </div>
        </fieldset>
      </pp-card>

      <pp-card heading="Densidad de las tablas">
        <p class="muted">
          Cuánto respiran las filas en las pantallas de trabajo. Las tarjetas de resumen no cambian.
        </p>
        <fieldset>
          <legend class="sr-only">Densidad</legend>
          <div class="options">
            @for (option of densities; track option.id) {
              <button
                type="button"
                class="option"
                [attr.aria-label]="'Densidad ' + option.label"
                [attr.aria-pressed]="draft().density === option.id"
                (click)="setDensity(option.id)"
              >
                <span class="rows" aria-hidden="true">
                  @for (row of rowsFor(option.id); track $index) {
                    <i [style.height]="option.id === 'compact' ? '0.34rem' : '0.52rem'"></i>
                  }
                </span>
                <span class="name">{{ option.label }}</span>
                <span class="hint">{{ option.hint }}</span>
              </button>
            }
          </div>
        </fieldset>
      </pp-card>

      <pp-card heading="Menú lateral">
        <label class="check">
          <input
            type="checkbox"
            [checked]="collapsedNow()"
            (change)="setCollapsed($any($event.target).checked)"
          />
          Empezar con el menú contraído, mostrando solo los iconos
        </label>
        <p class="muted">
          Esta se aplica al instante, sin guardar: es lo mismo que el botón « del menú, y verla cambiar es la única
          forma de saber si te gusta. El tema y la densidad sí esperan a Guardar, porque ahí la miniatura ya te
          enseña el resultado.
        </p>
      </pp-card>

      <div class="actions">
        <button type="button" [disabled]="!dirty()" (click)="save()">Guardar</button>
        <button type="button" class="secondary" [disabled]="!dirty()" (click)="discard()">Descartar</button>
        @if (dirty()) {
          <span class="pending">Sin guardar: la aplicación todavía se ve como antes.</span>
        } @else if (justSaved()) {
          <span class="saved">Guardado.</span>
        }
      </div>
    </div>
  `,
})
export class AppearanceSection {
  private readonly appearance = inject(Appearance);

  protected readonly themes = THEME_OPTIONS;
  protected readonly densities = DENSITY_OPTIONS;

  /** Same values as the tokens in styles.scss. The thumbnail has to be able to
   *  paint a theme that is not the one in force, so it cannot read them live. */
  protected readonly light = {
    bg: '#fbfaf9',
    surface: '#ffffff',
    text: '#1c1b1a',
    line: '#e4e1dd',
    accent: '#b4532a',
  };
  protected readonly dark = {
    bg: '#17161a',
    surface: '#201f24',
    text: '#ece9e6',
    line: '#34323a',
    accent: '#e0855c',
  };

  protected readonly draft = signal<AppearanceSettings>({ ...this.appearance.settings() });
  protected readonly collapsedNow = computed(() => this.appearance.settings().sidebarCollapsed);
  protected readonly justSaved = signal(false);

  protected readonly dirty = computed(() => {
    const saved = this.appearance.settings();
    const draft = this.draft();
    return saved.theme !== draft.theme || saved.density !== draft.density;
  });

  protected palette(theme: ThemeChoice): typeof this.light {
    return theme === 'dark' ? this.dark : this.light;
  }

  /** Just a count, so the thumbnail shows that compact fits more rows. */
  protected rowsFor(density: DensityChoice): number[] {
    return density === 'compact' ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4];
  }

  protected setTheme(theme: ThemeChoice): void {
    this.justSaved.set(false);
    this.draft.update((current) => ({ ...current, theme }));
  }

  protected setDensity(density: DensityChoice): void {
    this.justSaved.set(false);
    this.draft.update((current) => ({ ...current, density }));
  }

  protected setCollapsed(sidebarCollapsed: boolean): void {
    this.appearance.setSidebarCollapsed(sidebarCollapsed);
  }

  protected save(): void {
    this.appearance.save({ ...this.draft(), sidebarCollapsed: this.appearance.settings().sidebarCollapsed });
    this.justSaved.set(true);
  }

  protected discard(): void {
    this.draft.set({ ...this.appearance.settings() });
    this.justSaved.set(false);
  }
}
