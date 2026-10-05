import { Component, input, output, signal } from '@angular/core';
import { describeError } from './inventario.errors';

/**
 * "+ New brand" style shortcut: a button that turns into a one-line form, so a
 * missing catalogue entry can be created without leaving the screen.
 */
@Component({
  selector: 'app-quick-add',
  template: `
    @if (!open()) {
      <button type="button" class="ghost" (click)="open.set(true)">+ {{ label() }}</button>
    } @else {
      <div class="row">
        <input
          [value]="text()"
          (input)="onInput($event)"
          (keydown.enter)="$event.preventDefault(); submit()"
          [placeholder]="placeholder()"
          [attr.aria-label]="label()"
        />
        <button type="button" [disabled]="busy() || text().trim() === ''" (click)="submit()">Agregar</button>
        <button type="button" class="ghost" (click)="cancel()">Cancelar</button>
      </div>
      @if (error(); as message) {
        <small class="error">{{ message }}</small>
      }
    }
  `,
  styles: `
    :host { display: block; margin: -0.5rem 0 0.9rem; }
    .row input { flex: 1 1 8rem; width: auto; }
    small { display: block; margin-top: 0.25rem; }
  `,
})
export class QuickAdd {
  readonly label = input.required<string>();
  readonly placeholder = input('');
  /** Creates the entry. Throwing keeps the form open and shows a friendly error. */
  readonly create = input.required<(name: string) => Promise<void>>();
  readonly done = output<void>();

  protected readonly open = signal(false);
  protected readonly text = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected onInput(event: Event): void {
    this.text.set((event.target as HTMLInputElement).value);
  }

  protected async submit(): Promise<void> {
    const name = this.text().trim();
    if (!name || this.busy()) return;

    this.busy.set(true);
    this.error.set(null);
    try {
      await this.create()(name);
      this.cancel();
      this.done.emit();
    } catch (error) {
      this.error.set(describeError(error, 'No pudimos guardarlo. Inténtalo de nuevo.'));
    } finally {
      this.busy.set(false);
    }
  }

  protected cancel(): void {
    this.open.set(false);
    this.text.set('');
    this.error.set(null);
  }
}
