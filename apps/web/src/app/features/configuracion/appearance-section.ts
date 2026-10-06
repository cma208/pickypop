import { Component, computed, inject, signal } from '@angular/core';
import { Card } from '../../ui';
import { SECTION_STYLES } from '../../core/styles';
import {
  Appearance,
  PALETTE_OPTIONS,
  type AppearanceSettings,
  type DensityChoice,
  type ModeChoice,
  type PaletteChoice,
} from '../../core/appearance';

interface ModeOption {
  id: ModeChoice;
  label: string;
  hint: string;
}

const MODE_OPTIONS: ModeOption[] = [
  { id: 'auto', label: 'Automático', hint: 'Sigue a tu sistema: claro de día, oscuro de noche.' },
  { id: 'light', label: 'Claro', hint: 'Siempre claro, sin importar el sistema.' },
  { id: 'dark', label: 'Oscuro', hint: 'Siempre oscuro, sin importar el sistema.' },
];

const DENSITY_OPTIONS: { id: DensityChoice; label: string; hint: string }[] = [
  { id: 'comfortable', label: 'Cómoda', hint: 'Filas más altas. Se lee mejor.' },
  { id: 'compact', label: 'Compacta', hint: 'Filas más juntas. Entran más en pantalla.' },
];

/**
 * How the app looks. Everything here is a draft until Guardar: changing the
 * colours under the feet of whoever is comparing them makes comparing
 * impossible, which is exactly what the thumbnails are for.
 *
 * The thumbnails are not screenshots and they are not a copy of the palette
 * either: each one carries `data-palette` and `data-mode`, so the real rules
 * in the stylesheet paint it. Retouching a colour there retouches these too,
 * which is the whole point — with five palettes, a second copy would start
 * lying the first week.
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

    .options { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); }

    .option {
      display: grid;
      gap: 0.5rem;
      padding: 0.6rem;
      border: 1.5px solid var(--line);
      border-radius: var(--radius);
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

    /* The thumbnail wears its own palette, so everything inside it reads the
       tokens of the theme being previewed and not the one in force. */
    .thumb {
      display: grid;
      grid-template-columns: 1.7rem 1fr;
      height: 4.2rem;
      border: 1px solid var(--line);
      border-radius: var(--radius-sm);
      overflow: hidden;
      background: var(--bg);
    }
    .thumb .side { background: var(--surface); border-right: 1px solid var(--line); padding: 0.28rem 0.22rem; display: grid; gap: 0.22rem; align-content: start; }
    .thumb .side i { display: block; height: 0.3rem; border-radius: 2px; background: var(--line); }
    .thumb .side i.on { background: var(--accent); }
    .thumb .body { padding: 0.38rem; display: grid; gap: 0.26rem; align-content: start; }
    .thumb .body b { display: block; height: 0.42rem; width: 55%; border-radius: 2px; background: var(--text); }
    .thumb .body i { display: block; height: 0.28rem; border-radius: 2px; background: var(--line); }
    .thumb .body i.soft { background: var(--accent-soft); width: 70%; }
    /* A button, because the accent on a filled surface is the colour you
       actually end up looking at all day. */
    .thumb .body i.btn { background: var(--accent); height: 0.5rem; width: 2.1rem; border-radius: 3px; margin-top: 0.1rem; }

    /* "Automático" is the only one that shows two things at once, because it
       is the only one that means two things. */
    .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: var(--line); border-radius: var(--radius-sm); overflow: hidden; }
    .pair .thumb { border: 0; border-radius: 0; }

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
          Los colores de toda la aplicación. La miniatura es de verdad: está pintada con el tema que muestra, no es
          un dibujo.
        </p>
        <fieldset>
          <legend class="sr-only">Tema</legend>
          <div class="options">
            @for (option of palettes; track option.id) {
              <button
                type="button"
                class="option"
                [attr.aria-label]="'Tema ' + option.label"
                [attr.aria-pressed]="draft().palette === option.id"
                (click)="setPalette(option.id)"
              >
                <span class="thumb" aria-hidden="true" [attr.data-palette]="option.id" [attr.data-mode]="shownMode()">
                  <span class="side"><i class="on"></i><i></i><i></i></span>
                  <span class="body"><b></b><i class="soft"></i><i class="btn"></i></span>
                </span>
                <span class="name">{{ option.label }}</span>
                <span class="hint">{{ option.hint }}</span>
              </button>
            }
          </div>
        </fieldset>
      </pp-card>

      <pp-card heading="Claro u oscuro">
        <p class="muted">
          Se guarda en este navegador, no en tu cuenta: puedes tener oscuro en la laptop y claro en la tablet del
          taller. Si comparten el navegador, comparten esta preferencia.
        </p>
        <fieldset>
          <legend class="sr-only">Claro u oscuro</legend>
          <div class="options">
            @for (option of modes; track option.id) {
              <button
                type="button"
                class="option"
                [attr.aria-label]="option.label"
                [attr.aria-pressed]="draft().mode === option.id"
                (click)="setMode(option.id)"
              >
                @if (option.id === 'auto') {
                  <span class="pair" aria-hidden="true">
                    <span class="thumb" [attr.data-palette]="draft().palette" data-mode="light">
                      <span class="side"><i class="on"></i><i></i><i></i></span>
                      <span class="body"><b></b><i class="soft"></i><i class="btn"></i></span>
                    </span>
                    <span class="thumb" [attr.data-palette]="draft().palette" data-mode="dark">
                      <span class="side"><i class="on"></i><i></i><i></i></span>
                      <span class="body"><b></b><i class="soft"></i><i class="btn"></i></span>
                    </span>
                  </span>
                } @else {
                  <span class="thumb" aria-hidden="true" [attr.data-palette]="draft().palette" [attr.data-mode]="option.id">
                    <span class="side"><i class="on"></i><i></i><i></i></span>
                    <span class="body"><b></b><i class="soft"></i><i class="btn"></i></span>
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

  protected readonly modes = MODE_OPTIONS;
  protected readonly palettes = PALETTE_OPTIONS;
  protected readonly densities = DENSITY_OPTIONS;

  protected readonly draft = signal<AppearanceSettings>({ ...this.appearance.settings() });
  protected readonly collapsedNow = computed(() => this.appearance.settings().sidebarCollapsed);
  protected readonly justSaved = signal(false);

  /** What the system is asking for, so "automático" can be previewed as a real mode. */
  private readonly systemDark = signal(systemPrefersDark());

  /** The palette thumbnails show the mode being drafted, not the one in force. */
  protected readonly shownMode = computed<'light' | 'dark'>(() => {
    const mode = this.draft().mode;
    if (mode !== 'auto') return mode;
    return this.systemDark() ? 'dark' : 'light';
  });

  protected readonly dirty = computed(() => {
    const saved = this.appearance.settings();
    const draft = this.draft();
    return saved.mode !== draft.mode || saved.palette !== draft.palette || saved.density !== draft.density;
  });

  constructor() {
    // Someone may flip their system to dark while this screen is open; the
    // preview would otherwise keep showing the mode they just left.
    const query = window.matchMedia?.('(prefers-color-scheme: dark)');
    query?.addEventListener('change', (event) => this.systemDark.set(event.matches));
  }

  /** Just a count, so the thumbnail shows that compact fits more rows. */
  protected rowsFor(density: DensityChoice): number[] {
    return density === 'compact' ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4];
  }

  protected setMode(mode: ModeChoice): void {
    this.justSaved.set(false);
    this.draft.update((current) => ({ ...current, mode }));
  }

  protected setPalette(palette: PaletteChoice): void {
    this.justSaved.set(false);
    this.draft.update((current) => ({ ...current, palette }));
  }

  protected setDensity(density: DensityChoice): void {
    this.justSaved.set(false);
    this.draft.update((current) => ({ ...current, density }));
  }

  protected setCollapsed(sidebarCollapsed: boolean): void {
    this.appearance.setSidebarCollapsed(sidebarCollapsed);
  }

  protected save(): void {
    // The menu toggle applies on the spot, so the live value wins over the
    // one this form picked up when it opened.
    this.appearance.save({ ...this.draft(), sidebarCollapsed: this.appearance.settings().sidebarCollapsed });
    this.justSaved.set(true);
  }

  protected discard(): void {
    this.draft.set({ ...this.appearance.settings() });
    this.justSaved.set(false);
  }
}

function systemPrefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}
