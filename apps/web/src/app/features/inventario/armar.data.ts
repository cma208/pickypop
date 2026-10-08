import { inject, Injectable } from '@angular/core';
import { SUPABASE } from '../../core/supabase';

/**
 * «Armar», sent once. The assembly travels with the key of its submission:
 * the same key again (a retry after the answer was lost on the workshop's
 * Wi-Fi) gets back what was assembled the first time, and nothing moves
 * twice (`assemble_product`, 20261024150000).
 */
@Injectable({ providedIn: 'root' })
export class ArmarData {
  private readonly supabase = inject(SUPABASE);

  async assemble(variantId: string, units: number, requestKey: string): Promise<void> {
    const { error } = await this.supabase.rpc('assemble_product', {
      p_variant_id: variantId,
      p_units: units,
      p_request_key: requestKey,
    });
    if (error) throw error;
  }
}
