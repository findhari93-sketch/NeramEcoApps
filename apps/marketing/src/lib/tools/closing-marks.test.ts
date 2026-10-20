import { describe, it, expect, vi } from 'vitest';

vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock('@neram/database', () => ({ createAdminClientISR: () => ({}) }));

import { tneaOcClosing } from './closing-marks';

describe('TNEA OC closing marks', () => {
  const names = new Map([
    ['1', { name: 'College One', city: 'Chennai' }],
    ['2', { name: 'College Two', city: 'Madurai' }],
  ]);

  it('takes the lowest OC mark per college and lists the highest first', () => {
    const rows = [
      { college_code: '1', aggregate_mark: '301.5', allotted_category: 'OC' },
      { college_code: '1', aggregate_mark: 290.25, allotted_category: 'OC' },
      { college_code: '2', aggregate_mark: 310, allotted_category: 'OC' },
      // Other categories and bad marks never count.
      { college_code: '2', aggregate_mark: 200, allotted_category: 'BC' },
      { college_code: '2', aggregate_mark: 'n/a', allotted_category: 'OC' },
    ];
    expect(tneaOcClosing(rows, names)).toEqual([
      { code: '2', name: 'College Two', city: 'Madurai', oc: 310 },
      { code: '1', name: 'College One', city: 'Chennai', oc: 290.25 },
    ]);
  });

  it('names an unknown code instead of dropping it, and respects the limit', () => {
    const rows = [
      { college_code: 9, aggregate_mark: 250, allotted_category: 'OC' },
      { college_code: '1', aggregate_mark: 260, allotted_category: 'OC' },
    ];
    expect(tneaOcClosing(rows, names, 1)).toEqual([{ code: '1', name: 'College One', city: 'Chennai', oc: 260 }]);
    expect(tneaOcClosing(rows, names)[1]).toMatchObject({ code: '9', name: 'College 9' });
  });
});
