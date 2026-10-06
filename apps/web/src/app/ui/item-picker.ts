import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  forwardRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { NG_VALUE_ACCESSOR, type ControlValueAccessor } from '@angular/forms';
import type { ArticleKind, PhotoRef } from '../core/article-photos';
import { Thumb } from './thumb';

export interface PickerOption {
  value: string;
  label: string;
  /** Second line: unit, brand, whatever tells two similar ones apart. */
  hint?: string;
  group?: string;
  imagePath?: string | null;
  /** For options that only know the id of what they show, like a variant. */
  photo?: PhotoRef | null;
  /** The icon shown when there is no picture. */
  kind?: ArticleKind | null;
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
 * El teclado sigue funcionando: se abre con Enter, el cursor cae en el
 * buscador, se escribe para filtrar, las flechas recorren y Enter elige.
 * Quien carga diez líneas de una compra no quiere soltar el teclado. Se
 * cierra con Escape o tocando fuera, como cualquier menú.
 *
 * Sirve suelto, con `value` y `chosen`, o dentro de un formulario reactivo
 * con `formControlName`, igual que el `select` que reemplaza.
 */
@Component({
  selector: 'pp-item-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Thumb],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => ItemPicker), multi: true }],
  host: { '(document:pointerdown)': 'onOutside($event)', '(focusout)': 'onFocusOut($event)' },
  template: `
    <div class="picker">
      <button
        #trigger
        type="button"
        class="chosen"
        (click)="toggle()"
        (keydown.arrowdown)="openFromKeyboard($event)"
        [disabled]="isDisabled()"
        [attr.aria-expanded]="open()"
        aria-haspopup="listbox"
        [attr.aria-label]="label() || null"
      >
        @if (selected(); as option) {
          <pp-thumb
            size="option"
            [path]="option.imagePath"
            [photo]="option.photo"
            [kind]="option.kind"
            [color]="option.color"
            [name]="option.label"
          />
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
            (keydown.escape)="close(true)"
            (keydown.enter)="chooseActive($event)"
            (keydown.arrowdown)="move($event, 1)"
            (keydown.arrowup)="move($event, -1)"
            [attr.aria-activedescendant]="activeId()"
            [attr.aria-controls]="uid + '-list'"
            autocomplete="off"
          />
          @if (visible().length === 0) {
            <p class="muted empty">Nada coincide con «{{ term() }}».</p>
          } @else {
            <ul role="listbox" [id]="uid + '-list'">
              @for (option of visible(); track option.value; let i = $index) {
                <li>
                  <button
                    type="button"
                    class="row"
                    role="option"
                    tabindex="-1"
                    [id]="optionId(i)"
                    [class.active]="i === active()"
                    [attr.aria-selected]="option.value === current()"
                    (click)="choose(option.value)"
                    (pointerenter)="active.set(i)"
                  >
                    <pp-thumb
                      size="option"
                      [path]="option.imagePath"
                      [photo]="option.photo"
                      [kind]="option.kind"
                      [color]="option.color"
                      [name]="option.label"
                    />
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
      display: flex; align-items: center; gap: 0.6rem; width: 100%;
      padding: 0.25rem 0.6rem 0.25rem 0.3rem; border: 1px solid var(--line-strong); border-radius: var(--radius-sm);
      background: var(--bg); color: inherit; font: inherit; text-align: left; cursor: pointer; min-height: 3rem;
    }
    .chosen:hover { background: var(--bg); border-color: var(--text); }
    .text { display: grid; flex: 1; min-width: 0; }
    .label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .text small { font-size: var(--fs-sm); }
    .caret { color: var(--muted); }
    .panel {
      position: absolute; z-index: 20; top: calc(100% + 0.25rem); left: 0; right: 0;
      background: var(--surface); border: 1px solid var(--line-strong); border-radius: var(--radius);
      box-shadow: var(--shadow); padding: 0.4rem; max-height: 20rem; overflow: auto;
    }
    .search { margin-bottom: 0.4rem; }
    ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.1rem; }
    .row {
      display: flex; align-items: center; justify-content: flex-start; gap: 0.6rem; width: 100%; min-height: 0;
      padding: 0.25rem 0.4rem; border: 0; border-radius: var(--radius-sm);
      background: none; color: inherit; font: inherit; text-align: left; cursor: pointer;
    }
    .row.active, .row:focus-visible { background: var(--accent-soft); }
    .row[aria-selected='true'] .label { font-weight: 600; }
    .group { flex: none; }
    .empty { margin: 0.4rem; font-size: var(--fs-sm); }
  `,
  ],
})
export class ItemPicker implements ControlValueAccessor {
  readonly options = input<readonly PickerOption[]>([]);
  readonly value = input<string>('');
  readonly placeholder = input('Elige un artículo…');
  /** For screen readers, when no visible label wraps the picker. */
  readonly label = input<string>('');
  readonly disabled = input(false);

  readonly chosen = output<string>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private readonly search = viewChild<ElementRef<HTMLInputElement>>('search');

  protected readonly open = signal(false);
  protected readonly term = signal('');
  protected readonly active = signal(0);

  /** Set by a reactive form; wins over the `value` input while a form drives it. */
  private readonly formValue = signal<string | null>(null);
  private readonly formDisabled = signal(false);
  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  protected readonly current = computed(() => this.formValue() ?? this.value());
  protected readonly isDisabled = computed(() => this.disabled() || this.formDisabled());

  protected readonly selected = computed(() => this.options().find((option) => option.value === this.current()) ?? null);

  protected readonly visible = computed(() => {
    const needle = normalise(this.term());
    if (needle === '') return this.options();
    return this.options().filter((option) =>
      normalise(`${option.label} ${option.hint ?? ''} ${option.group ?? ''}`).includes(needle),
    );
  });

  protected readonly activeId = computed(() => (this.visible().length > 0 ? this.optionId(this.active()) : null));

  protected readonly uid = `pp-picker-${++pickerCount}`;

  constructor() {
    // The search box exists only once the panel is drawn; put the cursor in it
    // then, so opening the picker and typing is one gesture.
    effect(() => this.search()?.nativeElement.focus());
  }

  protected optionId(index: number): string {
    return `${this.uid}-${index}`;
  }

  protected toggle(): void {
    if (this.open()) {
      this.close(false);
      return;
    }
    this.openPanel();
  }

  protected openFromKeyboard(event: Event): void {
    event.preventDefault();
    if (!this.open()) this.openPanel();
  }

  /** Escape gives the focus back to the trigger; a click elsewhere leaves it where it went. */
  protected close(refocus: boolean): void {
    if (!this.open()) return;
    this.open.set(false);
    this.term.set('');
    this.onTouched();
    if (refocus) this.trigger()?.nativeElement.focus();
  }

  protected onTerm(event: Event): void {
    this.term.set((event.target as HTMLInputElement).value);
    this.active.set(0);
  }

  protected move(event: Event, step: number): void {
    event.preventDefault();
    const count = this.visible().length;
    if (count === 0) return;
    this.active.update((index) => (index + step + count) % count);
    this.host.nativeElement.querySelector(`#${this.optionId(this.active())}`)?.scrollIntoView({ block: 'nearest' });
  }

  /** Enter en la búsqueda elige lo marcado, que es lo primero mientras nadie mueva las flechas. */
  protected chooseActive(event: Event): void {
    event.preventDefault();
    const option = this.visible()[this.active()];
    if (option) this.choose(option.value);
  }

  protected choose(value: string): void {
    this.formValue.update((previous) => (previous === null ? null : value));
    this.onChange(value);
    this.chosen.emit(value);
    this.close(true);
  }

  protected onOutside(event: Event): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.close(false);
  }

  /** Tabbing out of the panel closes it too, or it would hang over the next field. */
  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (this.open() && next && !this.host.nativeElement.contains(next)) this.close(false);
  }

  writeValue(value: string | null): void {
    this.formValue.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.formDisabled.set(disabled);
  }

  private openPanel(): void {
    const index = this.options().findIndex((option) => option.value === this.current());
    this.term.set('');
    this.active.set(Math.max(index, 0));
    this.open.set(true);
  }
}

let pickerCount = 0;

/** Sin tildes y en minúsculas: nadie escribe "jabón" con tilde al buscar. */
function normalise(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}
