import { describe, it, expect } from 'vitest';
import type { PublicNIRFRow } from './nirf-client-filter';
import { buildNIRFInsights, displayName, joinList, nirfMeta } from './nirf-insights';

let seq = 0;
function row(year: number, rank: number, name: string, short: string | null, state: string, type: string, score: number | null = 60): PublicNIRFRow {
  seq += 1;
  return {
    id: `r${seq}`,
    college_id: `c-${name}`,
    year,
    rank,
    score,
    tlr: null,
    rpc: null,
    go: null,
    oi: null,
    pr: null,
    source_name: name,
    source_city: 'City',
    source_state: state,
    college: {
      id: `c-${name}`,
      slug: name.toLowerCase().replace(/\W+/g, '-'),
      name,
      short_name: short,
      city: 'City',
      state,
      state_slug: null,
      type: type as never,
      logo_url: null,
      neram_tier: null,
      naac_grade: null,
    },
  };
}

const ROWS: PublicNIRFRow[] = [
  row(2025, 1, 'Indian Institute of Technology Roorkee', 'IIT Roorkee', 'Uttarakhand', 'Government', 83.95),
  row(2025, 2, 'National Institute of Technology Calicut', 'NIT Calicut', 'Kerala', 'government', 77.89),
  row(2025, 3, 'Indian Institute of Technology Kharagpur', 'IIT Kharagpur', 'West Bengal', 'Government'),
  row(2025, 4, 'Indian Institute of Engineering Science and Technology Shibpur', 'IIEST Shibpur', 'West Bengal', 'Government'),
  row(2025, 6, 'CEPT University', 'CEPT', 'Gujarat', 'Private'),
  row(2025, 8, 'School of Planning and Architecture Delhi', 'SPA Delhi', 'Delhi', 'Government'),
  row(2025, 9, 'National Institute of Technology Trichy', 'NIT Trichy', 'Tamil Nadu', 'Government'),
  row(2025, 10, 'Visvesvaraya National Institute of Technology Nagpur', 'VNIT Nagpur', 'Maharashtra', 'Government'),
  row(2025, 18, 'SRM Institute of Science and Technology', 'SRM', 'Tamil Nadu', 'deemed'),
  row(2025, 28, 'School of Architecture & Planning, Anna University', 'SAP Anna Univ', 'Tamil Nadu', 'government'),
  row(2025, 40, 'Anant National University', 'AnantU', 'Gujarat', 'Private'),
  row(2024, 1, 'National Institute of Technology Calicut', 'NIT Calicut', 'Kerala', 'Government'),
  row(2024, 2, 'Indian Institute of Technology Roorkee', 'IIT Roorkee', 'Uttarakhand', 'Government'),
];

const n = buildNIRFInsights(ROWS, [2024, 2025])!;

describe('buildNIRFInsights', () => {
  it('uses the latest year and the highest published rank as the count', () => {
    expect(n.year).toBe(2025);
    expect(n.previousYear).toBe(2024);
    expect(n.rankedCount).toBe(40);
    expect(n.ranked.map((i) => i.rank)).toEqual([1, 2, 3, 4, 6, 8, 9, 10, 18, 28, 40]);
  });

  it('top 10 holds ranks 1 to 10 only', () => {
    expect(n.top10.every((i) => i.rank <= 10)).toBe(true);
    expect(n.top10).toHaveLength(8);
  });

  it('classifies IITs, NITs (including VNIT) and SPAs, and not IIEST or Anna University SAP', () => {
    expect(n.iits.map((i) => i.shortName)).toEqual(['IIT Roorkee', 'IIT Kharagpur']);
    expect(n.nits.map((i) => i.shortName)).toEqual(['NIT Calicut', 'NIT Trichy', 'VNIT Nagpur']);
    expect(n.spas.map((i) => i.shortName)).toEqual(['SPA Delhi']);
  });

  it('normalises mixed-case college types and counts deemed as private', () => {
    expect(n.govtCount).toBe(8);
    expect(n.privateCount).toBe(3);
    expect(n.topGovt?.shortName).toBe('IIT Roorkee');
    expect(n.topPrivate?.shortName).toBe('CEPT');
  });

  it('lists Tamil Nadu colleges in rank order', () => {
    expect(n.tamilNadu.map((i) => i.rank)).toEqual([9, 18, 28]);
  });

  it('answers the People Also Ask questions from the data', () => {
    const q = (s: string) => n.faqs.find((f) => f.question.includes(s))?.answer ?? '';
    expect(q('No. 1 architecture college')).toContain('Indian Institute of Technology Roorkee');
    expect(q('No. 1 architecture college')).toContain('83.95');
    expect(q('Which NIT')).toContain('National Institute of Technology Calicut');
    expect(q('Which NIT')).toContain('rank 2');
    expect(q('Tamil Nadu')).toContain('NIT Trichy (rank 9)');
    expect(q('No. 1 in NIRF 2024')).toContain('top spot went to IIT Roorkee');
  });

  it('never writes em dashes, double dashes or placeholders', () => {
    const text = JSON.stringify(n.faqs) + JSON.stringify(nirfMeta(n));
    expect(text).not.toMatch(/—|--|undefined|null|NaN/);
  });

  it('returns null with no rows for the latest year', () => {
    expect(buildNIRFInsights([], [2025])).toBeNull();
    expect(buildNIRFInsights(ROWS, [])).toBeNull();
  });
});

describe('nirfMeta', () => {
  it('builds a title under 65 characters that leads with the search phrase', () => {
    const { title, description } = nirfMeta(n);
    expect(title).toBe('NIRF Ranking 2025 Architecture Colleges: Top 40 in India');
    expect(title.length).toBeLessThan(65);
    expect(description).toContain('IIT Roorkee is No. 1 in NIRF 2025 Architecture');
    expect(description).toContain('including NIT Calicut and IIT Kharagpur');
    expect(description.split('IIT Roorkee')).toHaveLength(2);
    expect(description.length).toBeLessThanOrEqual(200);
  });

  it('has a fallback when there is no data', () => {
    expect(nirfMeta(null).title).toContain('NIRF Architecture Rankings');
  });
});

describe('helpers', () => {
  it('joinList reads naturally', () => {
    expect(joinList(['A'])).toBe('A');
    expect(joinList(['A', 'B'])).toBe('A and B');
    expect(joinList(['A', 'B', 'C'])).toBe('A, B and C');
  });

  it('displayName falls back to the full name for short codes', () => {
    expect(displayName(n.ranked.find((i) => i.rank === 18)!)).toBe('SRM Institute of Science and Technology');
  });
});
