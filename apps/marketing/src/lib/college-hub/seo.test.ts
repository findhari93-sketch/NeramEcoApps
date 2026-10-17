import { describe, it, expect } from 'vitest';
import {
  DESCRIPTION_MAX,
  TITLE_MAX,
  STATE_TITLE_MAX,
  buildCollegeDescription,
  buildStateListingTitle,
  generateStateListingMetadata,
  buildCollegeTitle,
  collegeNotFoundMetadata,
  generateCollegeDetailMetadata,
  truncateAtWord,
} from './seo';
import { STATE_NAMES, admissionYear } from './constants';
import { STATES } from '@neram/geo';
import { makeBareCollege, makeCollege } from './__fixtures__/college';

const DASHES = /—|--|&mdash;/;

describe('admissionYear', () => {
  it('is the current year until June', () => {
    expect(admissionYear(new Date(2026, 0, 15))).toBe(2026);
    expect(admissionYear(new Date(2026, 5, 30))).toBe(2026);
  });
  it('rolls to next year from July', () => {
    expect(admissionYear(new Date(2026, 6, 1))).toBe(2027);
    expect(admissionYear(new Date(2026, 9, 10))).toBe(2027);
    expect(admissionYear(new Date(2026, 11, 31))).toBe(2027);
  });
});

describe('buildCollegeTitle', () => {
  it('uses the short name and the longest variant that fits', () => {
    const t = buildCollegeTitle(makeCollege(), 2027);
    expect(t).toBe('MSEC B.Arch 2027: Fees, Cutoff, Placements');
    expect(t.length).toBeLessThanOrEqual(TITLE_MAX);
  });

  it('steps down the ladder for longer names', () => {
    const mid = buildCollegeTitle(makeCollege({ short_name: 'Sathyabama School of Architecture' }), 2027);
    expect(mid).toBe('Sathyabama School of Architecture B.Arch Fees, Cutoff 2027');
    const short = buildCollegeTitle(makeCollege({ short_name: 'Rachana Sansad Academy of Architecture Mumbai' }), 2027);
    expect(short).toBe('Rachana Sansad Academy of Architecture Mumbai B.Arch 2027');
    for (const t of [mid, short]) expect(t.length).toBeLessThanOrEqual(TITLE_MAX);
  });

  it('truncates the name at a word when even the shortest variant is too long', () => {
    expect(buildCollegeTitle(makeCollege({ short_name: 'Sir J.J. College of Architecture and Design Mumbai' }), 2027)).toBe(
      'Sir J.J. College of Architecture and Design B.Arch 2027',
    );
  });

  it('falls back to the full name and truncates at a word when nothing fits', () => {
    const t = buildCollegeTitle(
      makeCollege({
        short_name: null,
        name: 'Meenakshi Sundararajan Engineering College School of Architecture and Planning Chennai',
      }),
      2027,
    );
    expect(t.length).toBeLessThanOrEqual(TITLE_MAX);
    expect(t.endsWith(' B.Arch 2027')).toBe(true);
    expect(t.startsWith('Meenakshi Sundararajan')).toBe(true);
  });

  it('meta_title overrides the ladder', () => {
    expect(buildCollegeTitle(makeCollege({ meta_title: 'Custom title' }), 2027)).toBe('Custom title');
  });

  it('never includes long dashes', () => {
    expect(buildCollegeTitle(makeCollege(), 2027)).not.toMatch(DASHES);
  });
});

describe('buildCollegeDescription', () => {
  it('is answer-first, at most 155 characters, and names the college system', () => {
    const d = buildCollegeDescription(makeCollege());
    expect(d.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    // The 66-character full name is swapped for the short name to leave room for facts.
    expect(d).toBe('MSEC, Chennai, Tamil Nadu: B.Arch with 80 seats, ₹1.5 lakh a year and NAAC A. Admission through TNEA counselling. COA approved. See cutoffs, fees and FAQs.');
    const shortName = buildCollegeDescription(makeCollege({ name: 'MSEC School of Architecture' }));
    expect(shortName.startsWith('MSEC School of Architecture, Chennai, Tamil Nadu: B.Arch')).toBe(true);
    expect(d).toContain('TNEA');
    expect(d).not.toContain('NATA cutoffs');
    expect(d).not.toMatch(DASHES);
  });

  it('names the first two counselling systems only', () => {
    const d = buildCollegeDescription(makeCollege({ counseling_systems: ['JoSAA', 'AP_EAPCET', 'TNEA'] }));
    expect(d).toContain('JoSAA and AP EAPCET counselling');
    expect(d).not.toContain('TNEA');
  });

  it('falls back to exams when the college has no counselling systems', () => {
    const d = buildCollegeDescription(makeCollege({ counseling_systems: null }));
    expect(d).toContain('NATA or JEE Main Paper 2 scores');
    expect(d).not.toContain('TNEA');
  });

  it('works with almost no data and never prints placeholders', () => {
    const d = buildCollegeDescription(makeBareCollege());
    expect(d.length).toBeGreaterThan(20);
    expect(d).not.toMatch(/N\/A|undefined|null|soon/);
  });

  it('meta_description overrides', () => {
    expect(buildCollegeDescription(makeCollege({ meta_description: 'Staff copy.' }))).toBe('Staff copy.');
  });

  it('cuts a too-long first sentence at a word boundary', () => {
    const long = 'word '.repeat(60);
    const t = truncateAtWord(long, DESCRIPTION_MAX);
    expect(t.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    expect(t.endsWith('word')).toBe(true);
  });
});

describe('generateCollegeDetailMetadata', () => {
  it('repeats the layout openGraph and twitter fields and shares one image', () => {
    const m = generateCollegeDetailMetadata('en', makeCollege({ hero_image_url: 'https://cdn.example.com/msec.jpg' }));
    const og = m.openGraph as Record<string, unknown>;
    const tw = m.twitter as Record<string, unknown>;
    expect(og.siteName).toBe('Neram Classes');
    expect(og.locale).toBe('en_IN');
    expect(tw.card).toBe('summary_large_image');
    expect(tw.site).toBe('@neramclasses');
    expect(tw.creator).toBe('@neramclasses');
    const ogImg = (og.images as Array<{ url: string; alt: string }>)[0];
    const twImg = (tw.images as Array<{ url: string; alt: string }>)[0];
    expect(ogImg.url).toBe('https://cdn.example.com/msec.jpg');
    expect(twImg.url).toBe(ogImg.url);
    expect(ogImg.alt).toBeTruthy();
    expect((m.alternates as { canonical: string }).canonical).toBe(
      'https://neramclasses.com/colleges/tamil-nadu/msec-architecture',
    );
  });

  it('not-found metadata is noindex, follow', () => {
    expect(collegeNotFoundMetadata().robots).toEqual({ index: false, follow: true });
  });
});

describe('buildStateListingTitle', () => {
  it('leads with "Best Architecture Colleges in" for the states people search', () => {
    expect(buildStateListingTitle('Maharashtra', 2027)).toBe('Best Architecture Colleges in Maharashtra 2027');
    expect(buildStateListingTitle('Tamil Nadu', 2027)).toBe('Best Architecture Colleges in Tamil Nadu 2027');
    expect(buildStateListingTitle('Andhra Pradesh', 2027)).toBe('Best Architecture Colleges in Andhra Pradesh 2027');
    expect(buildStateListingTitle('Delhi', 2027)).toBe('Best Architecture Colleges in Delhi 2027');
  });
  it('fits under 65 characters with the layout suffix for every state whose name allows it', () => {
    // "Dadra and Nagar Haveli and Daman and Diu" is too long for any title; it gets the shortest form.
    const names = [...Object.values(STATE_NAMES), ...STATES.map((s) => s.name)].filter((n) => `B.Arch Colleges in ${n}`.length <= STATE_TITLE_MAX);
    expect(names.length).toBeGreaterThan(30);
    for (const name of names) {
      const t = buildStateListingTitle(name, 2027);
      expect(t.length, name).toBeLessThanOrEqual(STATE_TITLE_MAX);
      expect(t).toContain(name);
    }
  });
  it('writes a dash-free description with the count', () => {
    const m = generateStateListingMetadata('en', 'kerala', 'Kerala', 22);
    expect(String(m.description)).toMatch(/^22 architecture \(B\.Arch\) colleges in Kerala/);
    expect(String(m.title) + String(m.description)).not.toMatch(DASHES);
  });
});
