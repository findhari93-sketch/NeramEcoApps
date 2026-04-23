import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/college-hub/queries', () => ({
  getCollegeBySlug: vi.fn(),
}));

import { getCollegeBySlug } from '@/lib/college-hub/queries';
import { compareCollegesTool } from './compare-colleges';

const makeCollege = (slug: string, name: string) => ({
  id: slug,
  slug,
  name,
  state_slug: 'tamil-nadu',
  annual_fee_approx: 50000,
  total_barch_seats: 40,
  coa_approved: true,
  naac_grade: null,
  nirf_rank: null,
  accepted_exams: ['nata'],
  fees: [{ year_number: 1, tuition_fees: 40000 }],
  cutoffs: [{ academic_year: 2024, category: 'OC', cutoff_value: 120 }],
  placements: [{ academic_year: 2024, placement_rate_percent: 70, avg_package_lpa: 4.5 }],
});

describe('compareCollegesTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns comparison records for 2 slugs', async () => {
    (getCollegeBySlug as any).mockImplementation((slug: string) =>
      Promise.resolve(slug === 'a' ? makeCollege('a', 'A') : makeCollege('b', 'B'))
    );

    const res = await compareCollegesTool({ slugs: ['a', 'b'] });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toHaveLength(2);
      expect((res.data[0] as any).name).toBe('A');
      expect((res.data[1] as any).url).toBe('/colleges/tamil-nadu/b');
    }
  });

  it('returns not_found slot for missing college', async () => {
    (getCollegeBySlug as any).mockImplementation((slug: string) =>
      Promise.resolve(slug === 'real' ? makeCollege('real', 'R') : null)
    );
    const res = await compareCollegesTool({ slugs: ['real', 'ghost'] });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect((res.data[1] as any).error).toBe('not_found');
      expect((res.data[1] as any).slug).toBe('ghost');
    }
  });

  it('rejects fewer than 2 slugs', async () => {
    const res = await compareCollegesTool({ slugs: ['only-one'] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('invalid_slug_count');
  });

  it('rejects more than 3 slugs', async () => {
    const res = await compareCollegesTool({ slugs: ['a', 'b', 'c', 'd'] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('invalid_slug_count');
  });

  it('returns tool_error when any slug throws', async () => {
    (getCollegeBySlug as any).mockRejectedValue(new Error('db boom'));
    const res = await compareCollegesTool({ slugs: ['a', 'b'] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('tool_error');
  });
});
