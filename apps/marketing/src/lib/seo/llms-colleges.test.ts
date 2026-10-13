import { describe, it, expect } from 'vitest';
import { buildLlmsFullTxt, buildLlmsTxt, collegeDirectory, collegeLine, type LlmsCollege } from './llms';
import type { GeoDatasets } from './location-facts';

const college = (over: Partial<LlmsCollege>): LlmsCollege => ({
  name: 'MSEC School of Architecture',
  slug: 'msec-architecture',
  state: 'Tamil Nadu',
  state_slug: 'tamil-nadu',
  city: 'Chennai',
  type: 'private',
  annual_fee_approx: 150000,
  total_barch_seats: 80,
  counseling_systems: ['TNEA', 'other'],
  ...over,
});

const emptyDs: GeoDatasets = { examCentres: [], colleges: [], centres: [] };

describe('llms college directory', () => {
  it('writes one line per college and skips missing facts', () => {
    expect(collegeLine(college({}))).toBe(
      '- [MSEC School of Architecture](https://neramclasses.com/colleges/tamil-nadu/msec-architecture): Chennai, Private, ₹1,50,000/yr, 80 seats, TNEA',
    );
    expect(
      collegeLine(college({ city: null, type: null, annual_fee_approx: null, total_barch_seats: null, counseling_systems: null })),
    ).toBe('- [MSEC School of Architecture](https://neramclasses.com/colleges/tamil-nadu/msec-architecture)');
  });

  it('groups by state with the state hub URL', () => {
    const out = collegeDirectory([
      college({ name: 'B College', slug: 'b' }),
      college({ name: 'K College', slug: 'k', state: 'Kerala', state_slug: 'kerala', counseling_systems: ['KEAM'] }),
      college({ name: 'A College', slug: 'a' }),
    ]);
    expect(out[0]).toBe('## B.Arch colleges in India');
    const ker = out.indexOf('### Kerala');
    const tn = out.indexOf('### Tamil Nadu');
    expect(ker).toBeGreaterThan(0);
    expect(tn).toBeGreaterThan(ker);
    expect(out[tn + 1]).toBe('https://neramclasses.com/colleges/tamil-nadu');
    expect(out[tn + 2]).toContain('[A College]');
    expect(out[tn + 3]).toContain('[B College]');
    expect(collegeDirectory([])).toEqual([]);
  });

  it('adds the directory to llms-full.txt and state hubs to llms.txt', () => {
    const list = [college({})];
    expect(buildLlmsFullTxt(emptyDs, list)).toContain('## B.Arch colleges in India');
    const short = buildLlmsTxt(emptyDs, list);
    expect(short).toContain('## B.Arch colleges by state');
    expect(short).toContain('- Tamil Nadu (1 college): https://neramclasses.com/colleges/tamil-nadu');
    expect(buildLlmsTxt(emptyDs)).not.toContain('B.Arch colleges by state');
  });
});
