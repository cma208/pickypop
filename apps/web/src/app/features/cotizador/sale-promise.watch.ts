import { effect, inject, signal, untracked, type Signal } from '@angular/core';
import type { PlanCandidateLine } from '@pickypop/domain';
import { PlanService } from '../../core/plan';
import { salePromise, type SalePromise } from './sale-promise';

/** Long enough not to ask on every key, short enough to feel like an answer. */
export const TYPING_DELAY_MS = 300;

export interface WatchedPromise {
  /** The last answer. It stays while a new one is asked, so the screen does not jump. */
  promise: Signal<SalePromise | null>;
  /** A new answer is on its way: what shows may be one keystroke old. */
  asking: Signal<boolean>;
  /** The plan could not be read. The sale goes on: it only informs. */
  failed: Signal<boolean>;
}

/**
 * Keeps "¿para cuándo?" answered for the lines of a sale being written. It
 * asks again a moment after they change and whenever something moved the
 * plan; the snapshot itself is shared by `PlanService` for a few seconds, so
 * typing a quantity costs a computation, not a request.
 *
 * Call it from a constructor: it lives as long as the component.
 */
export function watchSalePromise(lines: Signal<readonly (PlanCandidateLine | null)[]>): WatchedPromise {
  const planner = inject(PlanService);
  const promise = signal<SalePromise | null>(null);
  const asking = signal(false);
  const failed = signal(false);
  let request = 0;

  effect((onCleanup) => {
    const wanted = lines();
    planner.version();
    const current = ++request;

    // A line added or taken away shifts which answer goes under which line.
    // Read untracked: setting the answer must not ask again.
    if (untracked(promise)?.lines.length !== wanted.length) promise.set(null);
    asking.set(true);

    const timer = setTimeout(async () => {
      try {
        const { input } = await planner.current();
        if (current !== request) return;
        promise.set(salePromise(input, wanted, (change) => planner.whatIf(input, change)));
        failed.set(false);
      } catch {
        if (current === request) failed.set(true);
      } finally {
        if (current === request) asking.set(false);
      }
    }, TYPING_DELAY_MS);
    onCleanup(() => clearTimeout(timer));
  });

  return { promise: promise.asReadonly(), asking: asking.asReadonly(), failed: failed.asReadonly() };
}
