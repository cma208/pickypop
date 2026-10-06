import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { Thumb } from './thumb';

export interface PickerOption {
  value: string;
  label: string;
  /** Second line: unit, brand, whatever tells two similar ones apart. */
  hint?: string;
  group?: string;
  imagePath?: string | null;
  /** For things that have a colour instead of a photo, like a filament. */
  color?: string | null;
}

/**
 * Elegir un artículo de una lista que va a crecer.
 *
 * Un `select` ordena alfabéticamente y obliga a leer: con veinte artículos
 * pasa, con doscientos no. Esto busca mientras se escribe y enseña la foto,
 * que es como se reconoce "la bolsa chica" sin leer su nombre entero.
 *
 * El teclado sigue funcionando: se abre con Enter, se escribe para filtrar y
 * se elige con Enter. Quien carga diez líneas de una compra no quiere soltar
 * el teclado.
 */
@Component({
  selector: 'pp-item-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Thumb],
  template: `
    <div class="picker">
      <button type="button" class="chosen" (click)="toggle()" [attr.aria-expanded]="open()">
        @if (selected(); as option) {
          @if (option.color) {
            <span class="swatch" [style.background]="option.color"></span>
          } @else {
            <pp-thumb size="sm" [path]="option.imagePath" [name]="option.label" />
          }
          <span class="text">
            <span class="label">{{ option.label }}</span>
            @if (option.hint) { <small class="muted">{{ option.hint }}</small> }
          </span>
        } @else {
          <span class="text muted">{{ placeholder() }}</span>
        }
        <span class="caret" aria-hidden="true">▾</span>
      </button>

      @if (open()) {
        <div class="panel">
          <input
            #search
            type="search"
            class="search"
            [placeholder]="'Busca por nombre…'"
            [value]="term()"
            (input)="onTerm($event)"
            (keydown.escape)="close()"
            (keydown.enter)="chooseFirst($event)"
            autocomplete="off"
          />
          @if (visible().length === 0) {
            <p class="muted empty">Nada coincide con «{{ term() }}».</p>
          } @else {
            <ul role="listbox">
              @for (option of visible(); track option.value) {
                <li>
                  <button type="button" class="row" (click)="choose(option.value)">
                    @if (option.color) {
                      <span class="swatch" [style.background]="option.color"></span>
                    } @else {
                      <pp-thumb size="sm" [path]="option.imagePath" [name]="option.label" />
                    }
                    <span class="text">
                      <span class="label">{{ option.label }}</span>
                      @if (option.hint) { <small class="muted">{{ option.hint }}</small> }
                    </span>
                    @if (option.group) { <small class="muted group">{{ option.group }}</small> }
                  </button>
                </li>
              }
            </ul>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
    .picker { position: relative; }
    .chosen {
      display: flex; align-items: center; gap: 0.5rem; width: 100%;
      padding: 0.3rem 0.5rem; border: 1px solid var(--line-strong); border-radius: var(--radius-sm);
      background: var(--bg); color: inherit; font: inherit; text-align: left; cursor: pointer; min-height: 2.4rem;
    }
    .text { display: grid; flex: 1; min-width: 0; }
    .label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .text small { font-size: 0.75rem; }
    .caret { color: var(--muted); }
    .swatch { width: 1.75rem; height: 1.75rem; border-radius: var(--radius-sm); border: 1px solid var(--line); flex: none; }
    .panel {
      position: absolute; z-index: 20; top: calc(100% + 0.25rem); left: 0; right: 0;
      background: var(--surface); border: 1px solid var(--line-strong); border-radius: var(--radius);
      box-shadow: var(--shadow); padding: 0.4rem; max-height: 18rem; overflow: auto;
    }
    .search { margin-bottom: 0.4rem; }
    ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.15rem; }
    .row {
      display: flex; align-items: center; gap: 0.5rem; width: 100%;
      padding: 0.3rem 0.4rem; border: 0; border-radius: var(--radius-sm);
      background: none; color: inherit; font: inherit; text-align: left; cursor: pointer;
    }
    .row:hover, .row:focus-visible { background: var(--accent-soft); }
    .group { flex: none; }
    .empty { margin: 0.4rem; font-size: 0.85rem; }
  `,
  ],
})
export class ItemPicker {
  readonly options = input<readonly PickerOption[]>([]);
  readonly value = input<string>('');
  readonly placeholder = input('Elige un artículo…');

  readonly chosen = output<string>();

  protected readonly open = signal(false);
  protected readonly term = signal('');

  protected readonly selected = computed(() => this.options().find((option) => option.value === this.value()) ?? null);

  protected readonly visible = computed(() => {
    const needle = normalise(this.term());
    if (needle === '') return this.options();
    return this.options().filter((option) =>
      normalise(`${option.label} ${option.hint ?? ''} ${option.group ?? ''}`).includes(needle),
    );
  });

  protected toggle(): void {
    this.open.update((open) => !open);
    this.term.set('');
  }

  protected close(): void {
    this.open.set(false);
  }

  protected onTerm(event: Event): void {
    this.term.set((event.target as HTMLInputElement).value);
  }

  /** Enter en la búsqueda elige lo primero: es lo que espera quien escribe. */
  protected chooseFirst(event: Event): void {
    event.preventDefault();
    const first = this.visible()[0];
    if (first) this.choose(first.value);
  }

  protected choose(value: string): void {
    this.chosen.emit(value);
    this.open.set(false);
    this.term.set('');
  }
}

/** Sin tildes y en minúsculas: nadie escribe "jabón" con tilde al buscar. */
function normalise(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}
