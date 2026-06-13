import { describe, it, expect } from 'vitest';
import { partitionByIit, dedupeIitByInstitute } from './josaa-zones';

const rows = [
  { institute: 'NIT Trichy', institute_type: 'NIT', closing_rank: 5000, nirf_rank: 9 },
  { institute: 'IIT Kharagpur', institute_type: 'IIT', closing_rank: 17823, nirf_rank: 5 },
  { institute: 'IIT Kharagpur', institute_type: 'IIT', closing_rank: 2817, nirf_rank: 5 },
  { institute: 'IIT Roorkee', institute_type: 'IIT', closing_rank: 16596, nirf_rank: 1 },
  { institute: 'SPA Delhi', institute_type: 'SPA', closing_rank: 1200, nirf_rank: 2 },
];

describe('partitionByIit', () => {
  it('routes IIT rows to iit and the rest to nonIit', () => {
    const { nonIit, iit } = partitionByIit(rows);
    expect(iit.map((r) => r.institute)).toEqual(['IIT Kharagpur', 'IIT Kharagpur', 'IIT Roorkee']);
    expect(nonIit.map((r) => r.institute)).toEqual(['NIT Trichy', 'SPA Delhi']);
  });

  it('never lets an IIT leak into nonIit (the core bug guard)', () => {
    const { nonIit } = partitionByIit(rows);
    expect(nonIit.some((r) => r.institute_type === 'IIT')).toBe(false);
  });

  it('handles an empty list', () => {
    expect(partitionByIit([])).toEqual({ nonIit: [], iit: [] });
  });
});

describe('dedupeIitByInstitute', () => {
  it('keeps the lowest closing rank per institute and sorts by NIRF', () => {
    const { iit } = partitionByIit(rows);
    const deduped = dedupeIitByInstitute(iit);
    expect(deduped.map((r) => r.institute)).toEqual(['IIT Roorkee', 'IIT Kharagpur']);
    expect(deduped.find((r) => r.institute === 'IIT Kharagpur')?.closing_rank).toBe(2817);
  });

  it('sorts null closing ranks last within an institute and null nirf last overall', () => {
    const deduped = dedupeIitByInstitute([
      { institute: 'IIT BHU', institute_type: 'IIT', closing_rank: null, nirf_rank: null },
      { institute: 'IIT Roorkee', institute_type: 'IIT', closing_rank: 16596, nirf_rank: 1 },
    ]);
    expect(deduped.map((r) => r.institute)).toEqual(['IIT Roorkee', 'IIT BHU']);
  });
});
