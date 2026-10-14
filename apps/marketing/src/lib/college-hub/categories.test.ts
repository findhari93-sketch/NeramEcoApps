import { describe, expect, it } from 'vitest';
import { CATEGORY_LINKS, relatedCategories } from './categories';

describe('relatedCategories', () => {
  it('never links a page to itself and caps the list', () => {
    const r = relatedCategories('/colleges/accreditation/coa-approved');
    expect(r.map((l) => l.href)).not.toContain('/colleges/accreditation/coa-approved');
    expect(r).toHaveLength(5);
  });

  it('puts page-specific links first without duplicates', () => {
    const r = relatedCategories('/colleges/fees/below-3-lakhs', [{ label: 'Below ₹1 Lakh/year', href: '/colleges/fees/below-1-lakh' }, CATEGORY_LINKS[0]], 4);
    expect(r[0].href).toBe('/colleges/fees/below-1-lakh');
    expect(r.filter((l) => l.href === CATEGORY_LINKS[0].href)).toHaveLength(1);
    expect(r).toHaveLength(4);
  });
});
