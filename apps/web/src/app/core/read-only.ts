import { effect, untracked, type Signal } from '@angular/core';
import type { AbstractControl } from '@angular/forms';

/**
 * Shows a form to someone who may only read it (ADR-025) as the data it
 * holds: every field disabled, so nothing can be typed, while its buttons are
 * left out by the template. Called from a constructor, like any effect.
 *
 * `afterEnable` puts back what the form keeps disabled on its own (an article
 * that cannot change once chosen), for the rare tab whose role went up while
 * it was open.
 *
 * Returns what to call after rows are added to a form array: a control pushed
 * into a disabled array arrives enabled.
 */
export function lockWhileReadOnly(form: AbstractControl, canWrite: Signal<boolean>, afterEnable?: () => void): () => void {
  effect(() => {
    if (!canWrite()) {
      form.disable({ emitEvent: false });
    } else if (form.disabled) {
      form.enable({ emitEvent: false });
      afterEnable?.();
    }
  });
  return () => {
    if (!untracked(canWrite)) form.disable({ emitEvent: false });
  };
}
