import type { PlanInput, PlanResult } from '@pickypop/domain';
import type { QuoteDetail } from '../cotizador/cotizador.data';
import { candidateLine } from '../cotizador/plan-candidate';
import { demandPromise, salePromise, type SalePromise, type WhatIf } from '../cotizador/sale-promise';

export interface QuoteSituation {
  /**
   * The quote is in the plan already: sent, with its hold running. It keeps
   * its place in the line, and accepting it now keeps it too.
   */
  held: boolean;
  promise: SalePromise;
}

/**
 * Where a quote stands, from the same plan everybody reads (ADR-021). Sent
 * with its hold running, it is one more demand and its situation is the one
 * the queue sees. A draft, or one whose hold is gone, holds nothing: what it
 * gets is what a sale written today would get, at the end of the line.
 */
export function quoteSituation(
  input: PlanInput,
  result: PlanResult,
  quote: Pick<QuoteDetail, 'id' | 'storedLines'>,
  whatIf: WhatIf,
): QuoteSituation {
  const own = result.demands.find((demand) => demand.kind === 'quote' && demand.id === quote.id);
  if (own) return { held: true, promise: demandPromise(input, result, own) };

  const lines = quote.storedLines.map((line) => candidateLine(line, (skuId) => line.filamentLabels[skuId] ?? null));
  return { held: false, promise: salePromise(input, lines, whatIf) };
}
