import { FormControl, Validators } from '@angular/forms';
import { ARTICLE_LIMITS, OUT_OF_RANGE, rangeMessage } from './article-ranges';

function touched(value: number | null, min: number, max: number): FormControl<number | null> {
  const control = new FormControl<number | null>(value, [Validators.required, Validators.min(min), Validators.max(max)]);
  control.markAsTouched();
  return control;
}

describe('rangeMessage', () => {
  const { min, max } = ARTICLE_LIMITS.diameterMm;

  it('says the field own range for a typo like 175 mm, instead of a generic error', () => {
    expect(rangeMessage(touched(175, min, max), OUT_OF_RANGE.diameterMm)).toBe('El diámetro va de 1 a 3 mm: el común es 1.75.');
  });

  it('says the same below the range', () => {
    expect(rangeMessage(touched(0.5, min, max), OUT_OF_RANGE.diameterMm)).toBe(OUT_OF_RANGE.diameterMm);
  });

  it('leaves other problems to the usual message, and says nothing for a good number', () => {
    expect(rangeMessage(touched(null, min, max), OUT_OF_RANGE.diameterMm)).toBe('Este campo es obligatorio.');
    expect(rangeMessage(touched(1.75, min, max), OUT_OF_RANGE.diameterMm)).toBeNull();
  });

  it('waits until the field is touched', () => {
    const control = new FormControl<number | null>(175, Validators.max(max));
    expect(rangeMessage(control, OUT_OF_RANGE.diameterMm)).toBeNull();
  });
});
