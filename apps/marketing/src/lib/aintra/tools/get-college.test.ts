import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/college-hub/queries', () => ({
  getCollegeBySlug: vi.fn(),
}));

import { getCollegeBySlug } from '@/lib/college-hub/queries';
import { getCollegeTool } from './get-college';

describe('getCollegeTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns ok with trimmed record when college exists', async () => {
    (getCollegeBySlug as any).mockResolvedValue({
      id: 'c-1',
      slug: 'papni-architecture',
      state_slug: 'tamil-nadu',
      name: 'Papni School of Architecture',
      short_name: 'PISA',
      city: 'Kancheepuram',
      state: 'Tamil Nadu',
      type: 'private',
      neram_tier: 'gold',
      coa_approved: true,
      naac_grade: null,
      nirf_rank: null,
      annual_fee_min: 45000,
      annual_fee_max: 60000,
      annual_fee_approx: 50000,
      total_barch_seats: 40,
      accepted_exams: ['nata'],
      counseling_systems: ['tnea'],
      highlights: ['Focused on B.Arch'],
      fees: [{ year_number: 1, tuition_fees: 40000 }],
      cutoffs: [{ academic_year: 2024, cutoff_value: 120 }],
      placements: [{ placement_rate_percent: 70 }],
      infrastructure: { hostel_available: true },
      faculty: [{ name: 'A', is_practicing_architect: true }],
    });

    const res = await getCollegeTool({ slug: 'papni-architecture' });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect((res.data as any).name).toBe('Papni School of Architecture');
      expect((res.data as any).url).toBe('/colleges/tamil-nadu/papni-architecture');
      expect((res.data as any).fees).toHaveLength(1);
      expect((res.data as any).cutoffs).toHaveLength(1);
      expect((res.data as any).faculty).toHaveLength(1);
    }
  });

  it('returns not_found when college missing', async () => {
    (getCollegeBySlug as any).mockResolvedValue(null);
    const res = await getCollegeTool({ slug: 'does-not-exist' });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe('not_found');
      expect(res.slug).toBe('does-not-exist');
    }
  });

  it('rejects empty slug', async () => {
    const res = await getCollegeTool({ slug: '' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('invalid_slug');
  });

  it('returns tool_error on query throw', async () => {
    (getCollegeBySlug as any).mockRejectedValue(new Error('db boom'));
    const res = await getCollegeTool({ slug: 'anything' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('tool_error');
  });
});
