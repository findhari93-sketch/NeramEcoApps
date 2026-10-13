import { describe, expect, it } from 'vitest';
import { buildFacts, examLabel, factsHash, formatInr, type CollegeRowForFacts } from './facts';
import { admissionYear, applicableIntents, templateFaqs } from './intents';
import { allowedNumbers, checkFaq, numbersIn } from './validate';

const base: CollegeRowForFacts = {
  id: 'c1',
  slug: 'mohamed-sathak-engineering-college',
  name: 'Mohamed Sathak Engineering College',
  short_name: 'MSEC',
  city: 'Kilakarai',
  state: 'Tamil Nadu',
  district: 'Ramanathapuram',
  address: null,
  pincode: null,
  type: 'private',
  established_year: 1993,
  affiliated_university: 'Anna University',
  coa_approved: true,
  coa_validity_till: null,
  naac_grade: 'A+',
  naac_valid_till: null,
  nba_accredited: null,
  nirf_rank_architecture: null,
  nirf_year: null,
  total_barch_seats: 40,
  annual_fee_approx: 50000,
  annual_fee_min: null,
  annual_fee_max: null,
  accepted_exams: ['NATA', 'JEE_PAPER_2', 'JEE Main Paper 2'],
  counseling_systems: ['TNEA'],
  has_management_quota: null,
  has_nri_quota: null,
  website: 'https://msec.edu.in',
  admissions_phone: null,
  admissions_email: null,
  nearest_railway: null,
  railway_distance_km: null,
  nearest_airport: null,
  airport_distance_km: null,
  avg_placement_salary: null,
  max_placement_salary: null,
  highlights: null,
};

const NOW = new Date('2026-10-10T00:00:00Z');

describe('facts', () => {
  const f = buildFacts(base);

  it('formats fees the way Indian fee pages do', () => {
    expect(formatInr(50000)).toBe('₹50,000');
    expect(formatInr(125000)).toBe('₹1.25 lakh');
    expect(f.annual_fee).toBe('₹50,000');
    expect(f.five_year_fee_estimate).toBe('₹2.5 lakh');
  });

  it('normalises exam labels and drops duplicates', () => {
    expect(examLabel('JEE_PAPER_2')).toBe('JEE Main Paper 2');
    expect(f.entrance_exams).toEqual(['NATA', 'JEE Main Paper 2']);
  });

  it('names JEE Main as Paper 2 and deemed universities properly', () => {
    expect(examLabel('JEE Main')).toBe('JEE Main Paper 2');
    const g = buildFacts({ ...base, type: 'deemed' });
    expect(g.type).toBe('Deemed-to-be university');
    const t = templateFaqs(g, NOW).find((x) => x.intent === 'type_established')!;
    expect(t.answer).toContain('is a deemed-to-be university and was established in 1993');
  });

  it('leaves out what we do not know', () => {
    expect(f.nirf_rank_architecture).toBeUndefined();
    expect(f.admissions_phone).toBeUndefined();
    expect(f.type).toBe('Private');
  });

  it('reads the latest cutoff of each counselling system', () => {
    const g = buildFacts(base, [], [
      { college_id: 'c1', academic_year: '2024-25', counseling_system: 'TNEA', category: 'OC', cutoff_type: 'aggregate', cutoff_value: 160, round_number: 1 },
      { college_id: 'c1', academic_year: '2025-26', counseling_system: 'TNEA', category: 'OC', cutoff_type: 'aggregate', cutoff_value: 165.5, round_number: 1 },
      { college_id: 'c1', academic_year: '2025-26', counseling_system: 'JoSAA', category: 'GEN', cutoff_type: 'closing rank', cutoff_value: 1200, round_number: 6 },
    ]);
    expect(g.cutoff_tnea_year).toBe('2025-26');
    expect(g.cutoff_tnea_oc).toBe('165.5 (aggregate)');
    expect(g.cutoff_josaa_gen).toBe('1200 (closing rank)');
  });

  it('changes the hash only when the facts change', () => {
    expect(factsHash(buildFacts(base))).toBe(factsHash(buildFacts({ ...base })));
    expect(factsHash(buildFacts({ ...base, total_barch_seats: 60 }))).not.toBe(factsHash(f));
  });
});

describe('templates', () => {
  const f = buildFacts(base);
  const faqs = templateFaqs(f, NOW);

  it('uses the admission cycle students search for', () => {
    expect(admissionYear(new Date('2026-03-01'))).toBe(2026);
    expect(admissionYear(NOW)).toBe(2027);
  });

  it('only asks what the facts can answer', () => {
    const ids = applicableIntents(f).map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining(['location', 'fees', 'seats', 'exams', 'admission', 'eligibility', 'coa', 'naac']));
    expect(ids).not.toContain('nirf');
    expect(ids).not.toContain('cutoff');
    expect(ids).not.toContain('placements');
  });

  it('writes every template answer so it passes validation', () => {
    const seen = new Set<string>();
    for (const faq of faqs) expect([faq.intent, checkFaq(faq, f, 2027, seen)]).toEqual([faq.intent, null]);
  });

  it('uses the short name in questions and copies facts exactly', () => {
    const fee = faqs.find((x) => x.intent === 'fees')!;
    expect(fee.question).toBe('What is the B.Arch fee at MSEC?');
    expect(fee.answer).toContain('₹50,000');
  });

  it('never writes an em dash', () => {
    expect(faqs.some((x) => /[—–]|--/.test(x.question + x.answer))).toBe(false);
  });
});

describe('validation', () => {
  const f = buildFacts(base);
  const ok = { intent: 'fees', question: 'What is the fee at MSEC?', answer: 'The B.Arch fee at MSEC is about ₹50,000 per year, and hostel is extra.', fact_keys: [] };

  it('reads numbers the way they are written', () => {
    expect(numbersIn('₹1,25,000 or ₹1.25 lakh in 2025-26.')).toEqual([125000, 1.25, 2025, 26]);
  });

  it('allows the facts, the admission years and small counts', () => {
    const allowed = allowedNumbers(f, 2027);
    expect([50000, 2.5, 40, 1993, 2027, 2026, 5, 50].every((n) => allowed.has(n))).toBe(true);
  });

  it('accepts a grounded answer', () => {
    expect(checkFaq(ok, f, 2027, new Set())).toBeNull();
  });

  it('rejects an invented fee or seat count', () => {
    expect(checkFaq({ ...ok, answer: 'The B.Arch fee at MSEC is about ₹75,000 per year, and hostel is extra.' }, f, 2027, new Set())).toBe('ungrounded-number');
    expect(checkFaq({ ...ok, answer: 'MSEC has 60 B.Arch seats each year through TNEA counselling for students.' }, f, 2027, new Set())).toBe('ungrounded-number');
  });

  it('rejects filler and non-answers', () => {
    expect(checkFaq({ ...ok, answer: 'MSEC has 40 seats. This number indicates the total intake capacity for the course.' }, f, 2027, new Set())).toBe('filler');
    expect(checkFaq({ ...ok, answer: 'The provided information does not include details on how to prepare for NATA here.' }, f, 2027, new Set())).toBe('filler');
  });

  it('tells students to take either exam, not both', () => {
    const admission = templateFaqs(f, NOW).find((x) => x.intent === 'admission')!;
    expect(admission.answer).toMatch(/^Take NATA or JEE Main Paper 2 and score well\./);
  });

  it('rejects dashes, duplicates, long and empty answers', () => {
    expect(checkFaq({ ...ok, answer: 'The fee is ₹50,000 per year — hostel is extra for all students.' }, f, 2027, new Set())).toBe('dash');
    const seen = new Set<string>();
    expect(checkFaq(ok, f, 2027, seen)).toBeNull();
    expect(checkFaq(ok, f, 2027, seen)).toBe('duplicate');
    expect(checkFaq({ ...ok, answer: 'word '.repeat(120) }, f, 2027, new Set())).toBe('too-long');
    expect(checkFaq({ ...ok, answer: '' }, f, 2027, new Set())).toBe('empty');
    expect(checkFaq({ ...ok, question: 'Fees at MSEC' }, f, 2027, new Set())).toBe('not-a-question');
  });
});
