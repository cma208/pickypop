import { GENERIC_CUSTOMER_NAMES, isWalkInName, nameKey, sameName } from './customer-match';

describe('nameKey', () => {
  it('reads a name as a person does: no accents, no case, single spaces', () => {
    expect(nameKey('  María   TORRES ')).toBe('maria torres');
    expect(nameKey('Peña')).toBe('pena');
  });

  it('treats a name of only spaces as no name', () => {
    expect(nameKey('   ')).toBeNull();
    expect(nameKey('')).toBeNull();
  });
});

describe('isWalkInName', () => {
  it('takes every generic name, singular or plural, as the walk-in customer (T4-05)', () => {
    for (const name of GENERIC_CUSTOMER_NAMES) expect(isWalkInName(name)).toBe(true);
    expect(isWalkInName('cliente al paso')).toBe(true);
    expect(isWalkInName('Clientes  AL PASO')).toBe(true);
    expect(isWalkInName('cliente varios')).toBe(true);
  });

  it('takes the name the workshop gave it too', () => {
    expect(isWalkInName('público general', 'Público General')).toBe(true);
    expect(isWalkInName('Cliente al paso', 'Público General')).toBe(true);
  });

  it('leaves real names alone', () => {
    expect(isWalkInName('Clientela al paso')).toBe(false);
    expect(isWalkInName('Rosa Díaz')).toBe(false);
    expect(isWalkInName('  ')).toBe(false);
  });
});

describe('sameName', () => {
  const customers = [
    { id: 'a', name: 'María Torres' },
    { id: 'b', name: 'Pedro Doble' },
    { id: 'w', name: 'Clientes varios', walkIn: true },
  ];

  it('finds somebody already in the list, written any way (T4-10)', () => {
    expect(sameName(customers, 'maria  torres')?.id).toBe('a');
    expect(sameName(customers, 'PEDRO DOBLE')?.id).toBe('b');
  });

  it('never offers the walk-in customer, nor answers for an empty name', () => {
    expect(sameName(customers, 'clientes varios')).toBeNull();
    expect(sameName(customers, '   ')).toBeNull();
    expect(sameName(customers, 'Rosa')).toBeNull();
  });
});
