import { Injectable, inject, signal } from '@angular/core';
import {
  plan,
  promiseFor,
  type PlanCandidateLine,
  type PlanInput,
  type PlanLinePlan,
  type PlanResult,
} from '@pickypop/domain';
import { SUPABASE } from './supabase';
import { CurrentWorkspace } from './workspace';

/**
 * How long a plan is shared between screens. Long enough for the five
 * widgets of one page to read the same plan, short enough that what another
 * person did a minute ago is already in it.
 */
const FRESH_MS = 15_000;

export interface PlanView {
  input: PlanInput;
  result: PlanResult;
}

/**
 * The single account, for the whole app (ADR-021).
 *
 * Every screen that says who something is for, what to print or "¿para
 * cuándo?" reads it from here: one snapshot from the database, one call to
 * `plan`. A screen that computes "what is free" on its own will disagree with
 * the rest sooner or later, and that is the bug this exists to prevent.
 */
@Injectable({ providedIn: 'root' })
export class PlanService {
  private readonly supabase = inject(SUPABASE);
  private readonly workspace = inject(CurrentWorkspace);

  private cached: { at: number; view: PlanView } | null = null;
  private loading: Promise<PlanView> | null = null;

  /** Goes up whenever something moved the plan, so screens showing it re-read. */
  readonly version = signal(0);

  /** The plan of the whole workshop now. Calls that overlap share one request. */
  current(): Promise<PlanView> {
    if (this.cached && Date.now() - this.cached.at < FRESH_MS) return Promise.resolve(this.cached.view);
    this.loading ??= this.load().finally(() => (this.loading = null));
    return this.loading;
  }

  /** "¿Para cuándo?" for a sale not saved yet: after everyone else, taking nothing from anybody. */
  async promise(line: PlanCandidateLine): Promise<PlanLinePlan> {
    const { input } = await this.current();
    return promiseFor(input, line);
  }

  /**
   * Something moved the stock, the queue or who goes first: the next read
   * computes again. Call it after delivering, assembling, counting, closing a
   * job, accepting a quote or changing a hold.
   */
  invalidate(): void {
    this.cached = null;
    this.version.update((value) => value + 1);
  }

  private async load(): Promise<PlanView> {
    const workspaceId = await this.workspace.requireId();
    const { data, error } = await this.supabase.rpc('planning_snapshot', { p_workspace_id: workspaceId });
    if (error) throw error;
    // The database builds exactly PlanInput (planning_snapshot); numbers come as numbers.
    const input = data as unknown as PlanInput;
    const view = { input, result: plan(input) };
    this.cached = { at: Date.now(), view };
    return view;
  }
}
