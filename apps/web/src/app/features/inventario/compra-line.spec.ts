import { DestroyRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { itemToBuy, linkPriceAndTotal } from './compra-line';
import type { InventoryItemSummary } from './inventario.data';

function linkedLine(quantity: number | null = 1000) {
  const controls = {
    target: new FormControl('item:harina', { nonNullable: true }),
    quantity: new FormControl<number | null>(quantity),
    unitPrice: new FormControl<number | null>(null),
    lineTotal: new FormControl<number | null>(null),
  };
  linkPriceAndTotal(controls, TestBed.inject(DestroyRef));
  return controls;
}

describe('linkPriceAndTotal', () => {
  it('works out the price of a gram from what the invoice says for the line', () => {
    const line = linkedLine(1000);

    line.lineTotal.setValue(15);

    expect(line.unitPrice.value).toBe(0.015);
  });

  it('keeps the total as the anchor: changing the quantity prices it again', () => {
    const line = linkedLine(1000);
    line.lineTotal.setValue(15);

    line.quantity.setValue(2000);

    expect(line.unitPrice.value).toBe(0.0075);
    expect(line.lineTotal.value).toBe(15);
  });

  it('does not clear the total it just priced from', () => {
    const line = linkedLine(3);

    line.lineTotal.setValue(10);

    expect(line.unitPrice.value).toBe(3.333333);
    expect(line.lineTotal.value).toBe(10);
  });

  it('leaves the price alone when the quantity changes and no total was typed', () => {
    const line = linkedLine(10);
    line.unitPrice.setValue(0.5);

    line.quantity.setValue(20);

    expect(line.unitPrice.value).toBe(0.5);
  });

  it('forgets the total when a price is typed instead', () => {
    const line = linkedLine(1000);
    line.lineTotal.setValue(15);

    line.unitPrice.setValue(0.02);

    expect(line.lineTotal.value).toBeNull();
    expect(line.unitPrice.value).toBe(0.02);
  });

  it('forgets the total when the product changes: it is another line', () => {
    const line = linkedLine(1000);
    line.lineTotal.setValue(15);

    line.target.setValue('sku:negro');

    expect(line.lineTotal.value).toBeNull();
  });

  it('prices at zero while the quantity is empty, instead of dividing by nothing', () => {
    const line = linkedLine(null);

    line.lineTotal.setValue(15);

    expect(line.unitPrice.value).toBe(0);
  });
});

describe('itemToBuy', () => {
  const tape = { id: 'tape', kind: 'packaging', active: true } as InventoryItemSummary;

  it('finds the item a purchase line can take', () => {
    expect(itemToBuy([tape], 'tape')).toBe(tape);
  });

  it('gives nothing for no id, an unknown id, an item switched off or one made here', () => {
    expect(itemToBuy([tape], null)).toBeNull();
    expect(itemToBuy([tape], '')).toBeNull();
    expect(itemToBuy([tape], 'other')).toBeNull();
    expect(itemToBuy([{ ...tape, active: false }], 'tape')).toBeNull();
    expect(itemToBuy([{ ...tape, kind: 'part' }], 'tape')).toBeNull();
    expect(itemToBuy([{ ...tape, kind: 'finished_good' }], 'tape')).toBeNull();
  });
});
