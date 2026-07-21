import { describe, expect, it } from 'vitest';
import { formatArea, formatLength } from './format';

describe('formatLength', () => {
  it('shows centimeters below 1 m', () => {
    expect(formatLength(85)).toBe('85 cm');
    expect(formatLength(99)).toBe('99 cm');
  });

  it('shows meters with 2 decimals and a comma at or above 1 m', () => {
    expect(formatLength(100)).toBe('1,00 m');
    expect(formatLength(350)).toBe('3,50 m');
    expect(formatLength(1234)).toBe('12,34 m');
  });

  it('rounds fractional centimeters', () => {
    expect(formatLength(99.6)).toBe('1,00 m');
    expect(formatLength(84.4)).toBe('84 cm');
  });
});

describe('formatArea', () => {
  it('converts cm² to m² with 2 decimals and a comma', () => {
    expect(formatArea(400 * 300)).toBe('12,00 m²');
    expect(formatArea(125000)).toBe('12,50 m²');
  });
});
