import { afterNextRender, Component, ElementRef, input, output, viewChild } from '@angular/core';

/**
 * Thin wrapper over the native <dialog>: focus trap, Esc to close and the
 * backdrop come from the browser. Render it inside an @if so each opening
 * starts with a fresh form.
 */
@Component({
  selector: 'app-modal',
  template: `
    <dialog #dialog [attr.aria-label]="heading()" (close)="closed.emit()" (click)="closeOnBackdrop($event)">
      <div class="box">
        <header>
          <h2>{{ heading() }}</h2>
          <button type="button" class="ghost" aria-label="Cerrar" (click)="dialog.close()">✕</button>
        </header>
        <ng-content />
      </div>
    </dialog>
  `,
  styles: `
    dialog {
      width: min(40rem, calc(100vw - 1rem));
      max-height: calc(100dvh - 1rem);
      padding: 0;
      border: 1px solid var(--line);
      border-radius: 12px;
      background: var(--surface);
      color: var(--text);
    }
    dialog::backdrop { background: rgb(0 0 0 / 0.5); }
    .box { padding: 1.25rem; }
    header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem; }
    h2 { flex: 1; margin: 0; font-size: 1.1rem; }
  `,
})
export class Modal {
  readonly heading = input.required<string>();
  readonly closed = output<void>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    afterNextRender(() => this.dialog().nativeElement.showModal());
  }

  protected closeOnBackdrop(event: MouseEvent): void {
    const element = this.dialog().nativeElement;
    if (event.target === element) element.close();
  }
}
