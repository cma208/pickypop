/**
 * What a person calls an order or a quote: who it is for and what it is.
 * "Ana Quispe · 10 × Botella de poción con dulces surtidos", not "PED-0003":
 * nobody in the workshop remembers numbers, they remember the customer and
 * the product. The number still shows, underneath, for when it is asked for.
 */

interface TitleLine {
  description: string;
  quantity: number;
}

const NOBODY = 'Sin cliente';

export function documentTitle(party: string | null | undefined, lines: readonly TitleLine[]): string {
  const who = party?.trim() || NOBODY;
  const what = linesSummary(lines);
  return what ? `${who} · ${what}` : who;
}

/** The first line, and how many more there are: the title has to fit on a phone. */
export function linesSummary(lines: readonly TitleLine[]): string {
  const [first, ...rest] = lines;
  if (!first) return '';
  const head = `${first.quantity} × ${first.description}`;
  if (rest.length === 0) return head;
  return `${head} y ${rest.length} ${rest.length === 1 ? 'producto más' : 'productos más'}`;
}
