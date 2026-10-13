import { describe, it, expect } from 'vitest';
import {
  SUMMARY_MAX_WORDS,
  buildCollegeBreadcrumbs,
  buildCollegeSummary,
  buildCutoffTables,
  buildInternalLinks,
  buildSources,
  feeText,
  formatIstDate,
  lastUpdatedIso,
  latestCutoffYear,
  wordCount,
  type LinkContext,
} from './detail-content';
import { makeBareCollege, makeCollege } from './__fixtures__/college';
import type { CollegeCutoff } from './types';

const PLACEHOLDERS = /N\/A|undefined|null|updated soon|not yet available/i;

describe('buildCollegeSummary', () => {
  it('is 40 to 70 words with full data, built only from facts', () => {
    const s = buildCollegeSummary(makeCollege());
    const words = wordCount(s);
    expect(words).toBeGreaterThanOrEqual(40);
    expect(words).toBeLessThanOrEqual(SUMMARY_MAX_WORDS);
    expect(s).toContain('Chennai, Tamil Nadu');
    expect(s).toContain('80 B.Arch seats approved by the Council of Architecture');
    expect(s).toContain('₹1.5 lakh a year');
    expect(s).toContain('TNEA counselling');
    expect(s).toContain('JEE Main Paper 2');
    expect(s).not.toMatch(PLACEHOLDERS);
    expect(s).not.toMatch(/—|--/);
  });

  it('is deterministic', () => {
    expect(buildCollegeSummary(makeCollege())).toBe(buildCollegeSummary(makeCollege()));
  });

  it('drops sentences whose facts are missing', () => {
    const s = buildCollegeSummary(makeBareCollege());
    expect(s).toBe(`${makeBareCollege().name} offers the five-year B.Arch programme in Chennai, Tamil Nadu.`);
    const noType = buildCollegeSummary(makeCollege({ type: null, naac_grade: null, nirf_rank_architecture: null }));
    expect(noType).toContain('It was established in 2001 and is affiliated to Anna University.');
  });

  it('uses the right article and never exceeds the word cap', () => {
    const aided = buildCollegeSummary(makeCollege({ type: 'Government Aided', naac_grade: null, nirf_rank_architecture: null }));
    expect(aided).toContain('It is a government aided college, established in 2001 and affiliated to Anna University.');
    const s = buildCollegeSummary(
      makeCollege({
        type: 'Government Aided',
        affiliated_university: 'Visvesvaraya Technological University, Belagavi, Karnataka State',
        accepted_exams: ['NATA', 'JEE Main Paper 2', 'KCET', 'COMEDK UGET', 'AP EAPCET'],
        counseling_systems: ['KCET', 'COMEDK', 'JoSAA', 'TNEA'],
      }),
    );
    // Over the cap the lowest-priority sentences go first; the opener always stays.
    expect(s.startsWith(makeCollege().name)).toBe(true);
    expect(wordCount(s)).toBeLessThanOrEqual(SUMMARY_MAX_WORDS);
  });
});

function cutoff(over: Partial<CollegeCutoff>): CollegeCutoff {
  return {
    id: Math.random().toString(36),
    college_id: 'c1',
    academic_year: '2025',
    counseling_system: 'TNEA',
    round_number: 1,
    category: 'general',
    cutoff_type: 'rank',
    cutoff_value: 1000,
    total_seats: null,
    filled_seats: null,
    source: null,
    ...over,
  };
}

describe('buildCutoffTables', () => {
  it('returns nothing without cutoff rows', () => {
    expect(buildCutoffTables([], ['TNEA'])).toEqual([]);
    expect(latestCutoffYear([])).toBeNull();
  });

  it('builds one table per system, last three years, final round', () => {
    const rows = [
      cutoff({ academic_year: '2022', cutoff_value: 900 }),
      cutoff({ academic_year: '2023', cutoff_value: 1100 }),
      cutoff({ academic_year: '2024', cutoff_value: 1200 }),
      cutoff({ academic_year: '2025', cutoff_value: 1300, round_number: 1 }),
      cutoff({ academic_year: '2025', cutoff_value: 15000, round_number: 3 }),
      cutoff({ academic_year: '2025', category: 'sc', cutoff_value: 25000 }),
      cutoff({ academic_year: '2025', counseling_system: 'JoSAA', category: 'general', cutoff_value: 5000 }),
    ];
    const tables = buildCutoffTables(rows, ['TNEA']);
    expect(tables.map((t) => t.system)).toEqual(['TNEA', 'JoSAA']);
    const tnea = tables[0];
    expect(tnea.years).toEqual(['2025', '2024', '2023']);
    expect(tnea.rows.map((r) => r.label)).toEqual(['General', 'SC']);
    expect(tnea.rows[0].values).toEqual(['15,000', '1,200', '1,100']);
    expect(tnea.rows[1].values).toEqual(['25,000', null, null]);
    expect(tnea.trendPoints).toBe(4);
    expect(latestCutoffYear(tables)).toBe('2025');
  });
});

describe('buildSources', () => {
  it('lists only sources whose data exists', () => {
    expect(buildSources(makeCollege(), ['TNEA'])).toEqual([
      'Council of Architecture (COA)',
      'NAAC',
      'NIRF 2025',
      'TNEA allotment data',
      'college website',
    ]);
    expect(buildSources(makeBareCollege())).toEqual([]);
  });

  it('dates the page from last_data_update, then updated_at', () => {
    expect(lastUpdatedIso(makeCollege())).toBe('2026-09-01T10:00:00.000Z');
    expect(lastUpdatedIso(makeCollege({ last_data_update: null }))).toBe('2026-10-01T10:00:00.000Z');
    expect(lastUpdatedIso(makeBareCollege())).toBeNull();
    expect(formatIstDate('2026-10-02T20:00:00.000Z')).toBe('3 October 2026');
  });
});

describe('feeText', () => {
  it('formats lakh and below-lakh amounts', () => {
    expect(feeText(150000)).toBe('₹1.5 lakh');
    expect(feeText(1200000)).toBe('₹12 lakh');
    expect(feeText(85000)).toBe('₹85,000');
  });
});

describe('breadcrumbs', () => {
  it('is Home > Colleges > state > college short name', () => {
    expect(buildCollegeBreadcrumbs(makeCollege())).toEqual([
      { name: 'Home', path: '/' },
      { name: 'Colleges', path: '/colleges' },
      { name: 'Tamil Nadu', path: '/colleges/tamil-nadu' },
      { name: 'MSEC', path: '/colleges/tamil-nadu/msec-architecture' },
    ]);
  });
});

describe('buildInternalLinks', () => {
  const ctx: LinkContext = {
    locale: 'en',
    similar: [
      { slug: 'b', name: 'B College', short_name: 'BC' },
      { slug: 'c', name: 'C College', short_name: null },
    ],
    cityListingSlugs: new Set(['chennai']),
    routedGuideSlugs: new Set(['tnea-barch']),
    counselingListingKeys: new Set(['TNEA', 'KCET']),
    cityCoachingPath: '/coaching/nata-coaching/nata-coaching-centers-in-chennai',
    stateCoachingPath: '/coaching/nata-coaching-in-tamil-nadu',
  };

  it('links only to routes that exist', () => {
    const links = buildInternalLinks(makeCollege(), ctx);
    expect(links.map((l) => l.href)).toEqual([
      '/colleges/compare?slugs=msec-architecture,b,c',
      '/colleges/tnea',
      '/counseling/tnea-barch',
      '/colleges/city/chennai',
      '/colleges/tamil-nadu',
      '/colleges/rankings/nirf/msec-architecture',
      '/nata-hub',
      '/coaching/nata-coaching/nata-coaching-centers-in-chennai',
    ]);
    expect(links[0].nofollow).toBe(true);
    expect(links[0].label).toBe('Compare MSEC with BC and C College');
  });

  it('drops links whose target is missing and falls back to the state coaching page', () => {
    const links = buildInternalLinks(
      makeCollege({ counseling_systems: ['APSCHE'], nirf_rank_architecture: null, city_slug: 'nowhere' }),
      { ...ctx, similar: [], cityCoachingPath: null },
    );
    const hrefs = links.map((l) => l.href);
    expect(hrefs.some((h) => h.includes('compare'))).toBe(false);
    expect(hrefs.some((h) => h.includes('/colleges/counseling/'))).toBe(false);
    expect(hrefs.some((h) => h.includes('/counseling/ap-barch'))).toBe(false);
    expect(hrefs.some((h) => h.includes('/colleges/city/'))).toBe(false);
    expect(hrefs.some((h) => h.includes('nirf'))).toBe(false);
    expect(hrefs).toContain('/coaching/nata-coaching-in-tamil-nadu');
  });

  it('prefixes non-English locales', () => {
    const links = buildInternalLinks(makeCollege(), { ...ctx, locale: 'ta' });
    expect(links.every((l) => l.href.startsWith('/ta/'))).toBe(true);
  });
});
