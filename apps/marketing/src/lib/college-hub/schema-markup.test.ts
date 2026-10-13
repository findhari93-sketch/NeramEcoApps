import { describe, it, expect } from 'vitest';
import {
  aggregateRatingFor,
  buildCollegeDetailGraph,
  buildTemplateCollegeFaqs,
  instagramUrl,
  resolveCollegeFaqs,
} from './schema-markup';
import { buildCollegeBreadcrumbs } from './detail-content';
import { makeBareCollege, makeCollege } from './__fixtures__/college';
import type { CollegeDetail } from './types';

type Node = Record<string, unknown>;

function graphOf(college: CollegeDetail, opts: { reviews?: Array<{ rating_overall: number; status: 'approved' }> } = {}) {
  const faqs = resolveCollegeFaqs([], college);
  const g = buildCollegeDetailGraph({
    college,
    faqs,
    breadcrumbs: buildCollegeBreadcrumbs(college),
    reviews: opts.reviews,
    pageTitle: 'MSEC B.Arch 2027 | Neram Classes',
    dateModified: '2026-10-01T10:00:00.000Z',
  });
  const nodes = g['@graph'] as Node[];
  const byType = (t: string) => nodes.find((n) => n['@type'] === t);
  return { g, nodes, faqs, byType };
}

describe('buildCollegeDetailGraph', () => {
  it('emits one @graph with WebPage, CollegeOrUniversity, Program, FAQPage and BreadcrumbList', () => {
    const { g, nodes } = graphOf(makeCollege());
    expect(g['@context']).toBe('https://schema.org');
    expect(nodes.map((n) => n['@type'])).toEqual([
      'WebPage',
      'CollegeOrUniversity',
      'EducationalOccupationalProgram',
      'FAQPage',
      'BreadcrumbList',
    ]);
  });

  it('links the nodes by @id and marks the speakable selectors', () => {
    const { byType } = graphOf(makeCollege());
    const url = 'https://neramclasses.com/colleges/tamil-nadu/msec-architecture';
    const page = byType('WebPage')!;
    expect(page['@id']).toBe(url);
    expect(page.about).toEqual({ '@id': `${url}#college` });
    expect(page.breadcrumb).toEqual({ '@id': `${url}#breadcrumb` });
    expect((page.speakable as Node).cssSelector).toEqual(['#college-summary', '#college-faqs']);
    expect(byType('EducationalOccupationalProgram')!.provider).toEqual({ '@id': `${url}#college` });
  });

  it('has no offers on the college, and offers on the programme with the fee', () => {
    const { byType } = graphOf(makeCollege());
    const org = byType('CollegeOrUniversity')!;
    expect(org).not.toHaveProperty('offers');
    const program = byType('EducationalOccupationalProgram')!;
    expect(program.offers).toEqual({
      '@type': 'Offer',
      price: 150000,
      priceCurrency: 'INR',
      category: 'Tuition (per year)',
    });
    expect(program.maximumEnrollment).toBe(80);
    expect(program.timeToComplete).toBe('P5Y');
    expect(JSON.stringify(org)).not.toContain('availability');
  });

  it('sameAs never includes neramclasses.com and adds wikidata and socials', () => {
    const { byType } = graphOf(
      makeCollege({ wikidata_id: 'Q123', facebook_url: 'https://neramclasses.com/colleges/x', linkedin_url: 'linkedin.com/school/msec' }),
    );
    const sameAs = byType('CollegeOrUniversity')!.sameAs as string[];
    expect(sameAs).toContain('https://www.msec.edu.in');
    expect(sameAs).toContain('https://www.wikidata.org/wiki/Q123');
    expect(sameAs).toContain('https://www.instagram.com/msec_official/');
    expect(sameAs).toContain('https://linkedin.com/school/msec');
    expect(sameAs.some((u) => u.includes('neramclasses.com'))).toBe(false);
  });

  it('builds alternateName from short name and aliases, deduped', () => {
    const { byType } = graphOf(makeCollege({ aliases: ['MSEC', 'MSEC School of Architecture'] }));
    expect(byType('CollegeOrUniversity')!.alternateName).toEqual(['MSEC', 'MSEC School of Architecture']);
  });

  it('FAQPage mainEntity equals the given FAQ array exactly', () => {
    const college = makeCollege();
    const faqs = [
      { question: 'Q1?', answer: 'A1.' },
      { question: 'Q2?', answer: 'A2.' },
    ];
    const g = buildCollegeDetailGraph({
      college,
      faqs,
      breadcrumbs: buildCollegeBreadcrumbs(college),
      pageTitle: 't',
    });
    const faqPage = (g['@graph'] as Node[]).find((n) => n['@type'] === 'FAQPage')!;
    expect((faqPage.mainEntity as Node[]).map((q) => [q.name, (q.acceptedAnswer as Node).text])).toEqual([
      ['Q1?', 'A1.'],
      ['Q2?', 'A2.'],
    ]);
  });

  it('BreadcrumbList matches the visible breadcrumb names and paths', () => {
    const college = makeCollege();
    const { byType } = graphOf(college);
    const items = byType('BreadcrumbList')!.itemListElement as Node[];
    expect(items.map((i) => i.name)).toEqual(buildCollegeBreadcrumbs(college).map((c) => c.name));
    expect(items.map((i) => i.item)).toEqual([
      'https://neramclasses.com',
      'https://neramclasses.com/colleges',
      'https://neramclasses.com/colleges/tamil-nadu',
      'https://neramclasses.com/colleges/tamil-nadu/msec-architecture',
    ]);
  });

  it('adds AggregateRating only with 3 or more rated reviews', () => {
    const two = graphOf(makeCollege(), { reviews: [{ rating_overall: 4, status: 'approved' }, { rating_overall: 5, status: 'approved' }] });
    expect(two.byType('CollegeOrUniversity')).not.toHaveProperty('aggregateRating');
    const three = graphOf(makeCollege(), {
      reviews: [
        { rating_overall: 4, status: 'approved' },
        { rating_overall: 5, status: 'approved' },
        { rating_overall: 3, status: 'approved' },
      ],
    });
    expect(three.byType('CollegeOrUniversity')!.aggregateRating).toMatchObject({ ratingValue: 4, reviewCount: 3 });
    expect(aggregateRatingFor([])).toBeNull();
  });

  it('omits every field whose data is missing', () => {
    const { byType } = graphOf(makeBareCollege());
    const org = byType('CollegeOrUniversity')!;
    for (const key of ['url', 'sameAs', 'logo', 'image', 'telephone', 'email', 'foundingDate', 'geo', 'parentOrganization', 'hasCredential', 'alternateName']) {
      expect(org).not.toHaveProperty(key);
    }
    const program = byType('EducationalOccupationalProgram')!;
    for (const key of ['offers', 'maximumEnrollment', 'programPrerequisites']) expect(program).not.toHaveProperty(key);
    expect(byType('WebPage')).not.toHaveProperty('primaryImageOfPage');
    expect(JSON.stringify(org)).not.toMatch(/null|undefined/);
  });

  it('adds geo only for real coordinates and credentials with validUntil', () => {
    const zero = graphOf(makeCollege({ latitude: 0, longitude: 0 }));
    expect(zero.byType('CollegeOrUniversity')).not.toHaveProperty('geo');
    const real = graphOf(makeCollege({ latitude: 13.05, longitude: 80.21 }));
    const org = real.byType('CollegeOrUniversity')!;
    expect(org.geo).toEqual({ '@type': 'GeoCoordinates', latitude: 13.05, longitude: 80.21 });
    const creds = org.hasCredential as Node[];
    expect(creds.map((c) => c.validUntil)).toEqual(['2027-06-30', '2028-01-01']);
    expect(org.parentOrganization).toEqual({ '@type': 'CollegeOrUniversity', name: 'Anna University' });
  });
});

describe('template FAQs', () => {
  it('never falls back to TNEA when the college has no counselling systems', () => {
    const faqs = buildTemplateCollegeFaqs(makeCollege({ counseling_systems: null }));
    expect(JSON.stringify(faqs)).not.toContain('TNEA');
  });

  it('does not point to a fee section that is not there', () => {
    const without = buildTemplateCollegeFaqs(makeCollege());
    expect(JSON.stringify(without)).not.toMatch(/fee section/i);
    const withRows = buildTemplateCollegeFaqs({ ...makeCollege(), hasFeeBreakdown: true });
    expect(JSON.stringify(withRows)).toMatch(/fee section on this page/);
  });

  it('skips questions whose facts are missing but always has the location answer', () => {
    const faqs = buildTemplateCollegeFaqs(makeBareCollege());
    expect(faqs.length).toBeGreaterThanOrEqual(1);
    expect(faqs.map((f) => f.question)).toEqual([`Where is ${makeBareCollege().name} located?`]);
    expect(JSON.stringify(faqs)).not.toMatch(/N\/A|undefined|null|soon|verified with/);
  });

  it('never uses long dashes', () => {
    expect(JSON.stringify(buildTemplateCollegeFaqs(makeCollege()))).not.toMatch(/—|--/);
  });

  it('college_faqs rows win, ordered by position', () => {
    const faqs = resolveCollegeFaqs(
      [
        { question: 'Second?', answer: 'B', position: 2 },
        { question: 'First?', answer: 'A', position: 1 },
        { question: ' ', answer: 'dropped', position: 3 },
      ],
      makeCollege(),
    );
    expect(faqs).toEqual([
      { question: 'First?', answer: 'A' },
      { question: 'Second?', answer: 'B' },
    ]);
  });
});

describe('instagramUrl', () => {
  it('normalises handles and URLs', () => {
    expect(instagramUrl('@abc.arch')).toBe('https://www.instagram.com/abc.arch/');
    expect(instagramUrl('https://instagram.com/abc')).toBe('https://instagram.com/abc');
    expect(instagramUrl('not a handle')).toBeNull();
    expect(instagramUrl(null)).toBeNull();
  });
});
