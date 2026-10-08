/**
 * Recognising a customer by the name somebody types, the same way
 * everywhere a customer is created: the quick sale, «Nuevo pedido», the
 * quote calculator and Clientes. «maria torres» is «María Torres», and a
 * second copy of her would split her history in two.
 */

/**
 * The name the walk-in customer has until the workshop creates or renames
 * it: the people who buy on the way past (the owner's decision). The
 * database names it the same in `app.walk_in_customer`.
 */
export const WALK_IN_NAME = 'Clientes varios';

/**
 * Names that mean the walk-in customer whatever it is called today: the one
 * it has now, the one it had until 2026-10-07, and both in singular or
 * plural. The database reads the same list (`app.is_walk_in_name`): typed as
 * a new customer, any of them would make one that can owe and that nobody
 * knows how to collect from (T4-05).
 */
export const GENERIC_CUSTOMER_NAMES: readonly string[] = [
  'Clientes varios',
  'Cliente varios',
  'Cliente al paso',
  'Clientes al paso',
];

/** A customer as the screens that create one know them. */
export interface KnownCustomer {
  id: string;
  name: string;
  /** «Clientes varios»: never the one a person meant by a name. */
  walkIn?: boolean;
}

/**
 * A name as a person reads it: no accents, no case, single spaces. The
 * database compares the same way (`app.name_key`). Null when nothing but
 * spaces was written.
 */
export function nameKey(name: string): string | null {
  const key = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  return key === '' ? null : key;
}

/**
 * Whether a typed name is the walk-in customer's: what it is called in the
 * workshop, or any of its generic names, written in any case or with any
 * accent.
 */
export function isWalkInName(name: string, walkInName: string = WALK_IN_NAME): boolean {
  const typed = nameKey(name);
  if (typed === null) return false;
  return [walkInName, ...GENERIC_CUSTOMER_NAMES].some((generic) => nameKey(generic) === typed);
}

/**
 * Somebody already in the list with the name being typed, written another
 * way or not. Not the walk-in customer: nobody types its name meaning it.
 * Two people can share a name, so this only warns: the screen offers the
 * existing one and still lets a new one be created.
 */
export function sameName<T extends KnownCustomer>(customers: readonly T[], name: string): T | null {
  const typed = nameKey(name);
  if (typed === null) return null;
  return customers.find((customer) => !customer.walkIn && nameKey(customer.name) === typed) ?? null;
}
