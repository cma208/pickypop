import { Injectable } from '@angular/core';
import { isEmptyDraft, parseDraft, serializeDraft, type QuoteDraft } from './quote-draft';

const STORAGE_KEY = 'pickypop.cotizador.borrador';

/**
 * Keeps the quote being written while the person goes elsewhere.
 *
 * In memory first, because the service lives as long as the app: that alone
 * survives going to Clientes and back. `sessionStorage` adds surviving a
 * reload, in this tab only. Storage may be full, blocked or missing (a private
 * window, a strict browser), so every access is guarded and the memory copy
 * still works without it.
 */
@Injectable({ providedIn: 'root' })
export class QuoteDraftStore {
  private memory: QuoteDraft | null = null;

  /** The draft of this person in this workshop, or null. */
  read(owner: string): QuoteDraft | null {
    if (this.memory !== null) return this.memory.owner === owner ? this.memory : null;

    try {
      return parseDraft(sessionStorage.getItem(STORAGE_KEY), owner);
    } catch {
      return null;
    }
  }

  /** Saves it, or forgets it when there is nothing worth keeping. */
  write(draft: QuoteDraft): void {
    if (isEmptyDraft(draft)) {
      this.clear();
      return;
    }

    this.memory = draft;
    try {
      sessionStorage.setItem(STORAGE_KEY, serializeDraft(draft));
    } catch {
      // Without storage a reload starts over; navigating still keeps it.
    }
  }

  clear(): void {
    this.memory = null;
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing stored that could come back.
    }
  }
}
