import { applyLineKind, createOrderLineForm, lineFieldError, MAX_LINE_UNITS, toNewOrderLine } from './pedido-linea';

const BOTTLE = 'variant-bottle';
const label = (id: string) => (id === BOTTLE ? 'Botella de poción — Con dulces surtidos' : undefined);

describe('createOrderLineForm', () => {
  it('starts as a catalogue line that asks for its variant', () => {
    const line = createOrderLineForm();

    expect(line.controls.kind.value).toBe('catalog');
    expect(line.controls.variantId.hasError('required')).toBe(true);
    expect(line.controls.description.valid).toBe(true);
  });
});

describe('the ceilings of a line (T4-02)', () => {
  it('refuses a quantity no workshop sells, next to the field', () => {
    const line = createOrderLineForm();
    line.controls.quantity.setValue(3_000_000_000);
    expect(line.controls.quantity.hasError('max')).toBe(true);
    expect(lineFieldError('quantity', line.controls.quantity.errors ?? {})).toContain('entre 1 y');
    line.controls.quantity.setValue(MAX_LINE_UNITS);
    expect(line.controls.quantity.valid).toBe(true);
  });

  it('asks for a price instead of sending an empty one', () => {
    const line = createOrderLineForm();
    line.controls.unitPrice.setValue(null as unknown as number);
    expect(lineFieldError('unitPrice', line.controls.unitPrice.errors ?? {})).toContain('Escribe el precio');
    line.controls.unitPrice.setValue(5_000_000);
    expect(lineFieldError('unitPrice', line.controls.unitPrice.errors ?? {})).toContain('no puede pasar de');
  });
});

describe('applyLineKind', () => {
  it('a custom line does not ask for a variant, it asks what it is', () => {
    const line = createOrderLineForm();
    applyLineKind(line, 'custom');

    expect(line.controls.kind.value).toBe('custom');
    expect(line.controls.variantId.valid).toBe(true);
    expect(line.controls.description.hasError('required')).toBe(true);
  });

  it('only spaces do not say what a custom line is', () => {
    const line = createOrderLineForm();
    applyLineKind(line, 'custom');
    line.controls.description.setValue('   ');

    expect(line.controls.description.valid).toBe(false);
  });

  it('a custom line refuses a negative cost', () => {
    const line = createOrderLineForm();
    applyLineKind(line, 'custom');
    line.controls.description.setValue('Llavero con nombre');
    line.controls.estimatedUnitCost.setValue(-1);

    expect(line.controls.estimatedUnitCost.hasError('min')).toBe(true);
  });

  it('drops the variant and the recipe cost when the line becomes custom', () => {
    const line = createOrderLineForm();
    line.patchValue({ variantId: BOTTLE, estimatedUnitCost: 5.23 });
    applyLineKind(line, 'custom');

    expect(line.controls.variantId.value).toBe('');
    expect(line.controls.estimatedUnitCost.value).toBeNull();
  });

  it('back to the catalogue, asks for the variant again and forgets the description', () => {
    const line = createOrderLineForm();
    applyLineKind(line, 'custom');
    line.controls.description.setValue('Llavero con nombre');
    applyLineKind(line, 'catalog');

    expect(line.controls.variantId.hasError('required')).toBe(true);
    expect(line.controls.description.value).toBe('');
    expect(line.valid).toBe(false);
  });
});

describe('toNewOrderLine', () => {
  it('a catalogue line keeps its variant and is named after it', () => {
    const line = createOrderLineForm();
    line.patchValue({ variantId: BOTTLE, quantity: 4, unitPrice: 10, estimatedUnitCost: 5.23 });

    expect(toNewOrderLine(line.getRawValue(), label)).toEqual({
      variantId: BOTTLE,
      description: 'Botella de poción — Con dulces surtidos',
      quantity: 4,
      unitPrice: 10,
      estimatedUnitCost: 5.23,
    });
  });

  it('a custom line goes without a variant, with its description and the cost written by hand', () => {
    const line = createOrderLineForm();
    applyLineKind(line, 'custom');
    line.patchValue({ description: '  Llavero con nombre  ', quantity: 3, unitPrice: 7.5, estimatedUnitCost: 2.1 });

    expect(toNewOrderLine(line.getRawValue(), label)).toEqual({
      variantId: null,
      description: 'Llavero con nombre',
      quantity: 3,
      unitPrice: 7.5,
      estimatedUnitCost: 2.1,
    });
  });

  it('a custom line without a cost estimate counts as zero, like a variant without a recipe', () => {
    const line = createOrderLineForm();
    applyLineKind(line, 'custom');
    line.patchValue({ description: 'Modelado', quantity: 1, unitPrice: 30 });

    expect(toNewOrderLine(line.getRawValue(), label).estimatedUnitCost).toBe(0);
  });
});
