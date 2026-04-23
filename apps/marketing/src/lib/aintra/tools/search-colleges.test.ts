import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/college-hub/queries', () => ({
  getColleges: vi.fn(),
}));

import { getColleges } from '@/lib/college-hub/queries';
import { searchCollegesTool } from './search-colleges';

describe('searchCollegesTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns trimmed cards with internal URLs', async () => {
    (getColleges as any).mockResolvedValue({
      data: [
        {
          id: '1',
          slug: 'papni-architecture',
          state_slug: 'tamil-nadu',
          name: 'Papni',
          city: 'Kancheepuram',
          state: 'Tamil Nadu',
          type: 'private',
          annual_fee_min: 45000,
          annual_fee_max: 60000,
          annual_fee_approx: 50000,
          coa_approved: true,
          naac_grade: null,
          nirf_rank: null,
          neram_tier: 'gold',
          total_barch_seats: 40,
          accepted_exams: ['nata'],
        },
      ],
      count: 1,
    });

    const res = await searchCollegesTool({ state: 'tamil-nadu', fee_max: 100000 });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.count).toBe(1);
      expect(res.data.results[0].url).toBe('/colleges/tamil-nadu/papni-architecture');
      expect(res.data.results[0].name).toBe('Papni');
    }
  });

  it('maps q -> search and fee_max -> maxFee filter', async () => {
    (getColleges as any).mockResolvedValue({ data: [], count: 0 });
    await searchCollegesTool({ q: 'sathyabama', fee_max: 200000 });

    const call = (getColleges as any).mock.calls[0][0];
    expect(call.search).toBe('sathyabama');
    expect(call.maxFee).toBe(200000);
  });

  it('caps limit at 20', async () => {
    (getColleges as any).mockResolvedValue({ data: [], count: 0 });
    await searchCollegesTool({ limit: 999 });
    const call = (getColleges as any).mock.calls[0][0];
    expect(call.limit).toBe(20);
  });

  it('defaults limit to 10', async () => {
    (getColleges as any).mockResolvedValue({ data: [], count: 0 });
    await searchCollegesTool({});
    const call = (getColleges as any).mock.calls[0][0];
    expect(call.limit).toBe(10);
  });

  it('passes coa_approved boolean through', async () => {
    (getColleges as any).mockResolvedValue({ data: [], count: 0 });
    await searchCollegesTool({ coa_approved: true });
    const call = (getColleges as any).mock.calls[0][0];
    expect(call.coa).toBe(true);
  });

  it('returns tool_error on query throw', async () => {
    (getColleges as any).mockRejectedValue(new Error('db boom'));
    const res = await searchCollegesTool({});
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('tool_error');
  });
});
