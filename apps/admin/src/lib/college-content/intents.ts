/**
 * The questions students actually ask about a college, each with the facts it
 * needs and a template answer built only from those facts.
 *
 * An intent whose facts are missing is skipped; nothing is padded. The AI
 * writer gets the same list and may phrase answers better, but validate.ts
 * holds it to the same facts, and a rejected AI answer falls back to the
 * template here.
 *
 * House rule: no em dashes or double hyphens in any text.
 */
import { COMMON_FACTS, type Facts } from './facts';

export interface Faq {
  intent: string;
  question: string;
  answer: string;
  fact_keys: string[];
  /** Who phrased it; set by writeFaqs. */
  source?: 'ai' | 'template';
}

export interface Intent {
  id: string;
  /** All of these must exist. */
  requires?: string[];
  /** At least one of these must exist. */
  anyOf?: string[];
  question: (f: Facts, ctx: Ctx) => string;
  answer: (f: Facts, ctx: Ctx) => string;
}

export interface Ctx {
  /** short_name, or name when there is none. */
  n: string;
  /** The admission year students are searching for. */
  year: number;
}

/** The admission cycle students search for: after June it is next year's. */
export function admissionYear(now = new Date()): number {
  return now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
}

const s = (v: string | string[] | undefined): string => (Array.isArray(v) ? v.join(', ') : v ?? '');
const list = (v: string | string[] | undefined): string => {
  const a = Array.isArray(v) ? v : v ? [v] : [];
  if (a.length <= 1) return a.join('');
  return `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;
};
const orList = (v: string | string[] | undefined): string => list(v).replace(/ and ([^,]+)$/, ' or $1');
const has = (f: Facts, k: string) => f[k] !== undefined;
const place = (f: Facts) => [f.city, f.state].filter(Boolean).map(s).join(', ');

/** Keys of the latest cutoffs, e.g. cutoff_tnea_general. */
const cutoffKeys = (f: Facts) => Object.keys(f).filter((k) => /^cutoff_[a-z0-9_]+$/.test(k) && !k.endsWith('_year'));

export const INTENTS: Intent[] = [
  {
    id: 'location',
    requires: ['city', 'state'],
    question: (f, c) => `Where is ${c.n} located?`,
    answer: (f) =>
      `${s(f.name)} is in ${s(f.city)}${has(f, 'district') ? `, ${s(f.district)} district` : ''}, ${s(f.state)}.${has(f, 'address') ? ` The address is ${s(f.address)}${has(f, 'pincode') ? ` ${s(f.pincode)}` : ''}.` : ''}`,
  },
  {
    id: 'type_established',
    anyOf: ['type', 'established_year'],
    question: (f, c) =>
      has(f, 'established_year') ? `When was ${c.n} established, and is it a private or government college?` : `Is ${c.n} a private or government college?`,
    answer: (f) =>
      [
        has(f, 'type')
          ? `${s(f.name)} is a ${s(f.type).toLowerCase()}${/university/i.test(s(f.type)) ? '' : ' college'}`
          : `${s(f.name)}`,
        has(f, 'established_year') ? `${has(f, 'type') ? ' and was' : ' was'} established in ${s(f.established_year)}` : '',
        has(f, 'affiliated_university') ? `. It is affiliated to ${s(f.affiliated_university)}` : '',
        '.',
      ].join(''),
  },
  {
    id: 'coa',
    requires: ['coa_approved'],
    question: (f, c) => `Is ${c.n} approved by the Council of Architecture?`,
    answer: (f) =>
      `Yes. The B.Arch programme at ${s(f.name)} is approved by the Council of Architecture (COA), the national body that regulates architecture education in India${has(f, 'coa_validity_till') ? `, with approval valid until ${s(f.coa_validity_till)}` : ''}. A COA approved B.Arch degree lets you register as an architect after graduation.`,
  },
  {
    id: 'naac',
    requires: ['naac_grade'],
    question: (f, c) => `What is the NAAC grade of ${c.n}?`,
    answer: (f) =>
      `${s(f.name)} has a NAAC grade of ${s(f.naac_grade)}${has(f, 'naac_valid_till') ? `, valid until ${s(f.naac_valid_till)}` : ''}.${has(f, 'nba_accredited') ? ' It is also NBA accredited.' : ''}`,
  },
  {
    id: 'nirf',
    requires: ['nirf_rank_architecture'],
    question: (f, c) => `What is the NIRF architecture ranking of ${c.n}?`,
    answer: (f) =>
      `${s(f.name)} is ranked ${s(f.nirf_rank_architecture)} in the NIRF architecture rankings${has(f, 'nirf_year') ? ` (${s(f.nirf_year)})` : ''}, published by the Ministry of Education.`,
  },
  {
    id: 'fees',
    anyOf: ['annual_fee', 'tuition_general'],
    question: (f, c) => `What is the B.Arch fee at ${c.n}?`,
    answer: (f) => {
      const parts: string[] = [];
      if (has(f, 'tuition_general')) {
        parts.push(`The B.Arch tuition fee at ${s(f.name)} is ${s(f.tuition_general)} per year${has(f, 'fee_year') ? ` (${s(f.fee_year)})` : ''}.`);
        if (has(f, 'tuition_management')) parts.push(`Under the management quota it is ${s(f.tuition_management)} per year.`);
      } else {
        parts.push(`The B.Arch fee at ${s(f.name)} is about ${s(f.annual_fee)} per year.`);
        if (has(f, 'annual_fee_range')) parts.push(`It ranges from ${s(f.annual_fee_range)} depending on the quota.`);
      }
      parts.push('Hostel, mess, studio materials and site visits are extra.');
      return parts.join(' ');
    },
  },
  {
    id: 'total_cost',
    requires: ['five_year_fee_estimate'],
    question: (f, c) => `What is the total cost of the 5 year B.Arch course at ${c.n}?`,
    answer: (f) =>
      `At about ${s(f.annual_fee)} a year, tuition for the full 5 year B.Arch at ${s(f.name)} comes to roughly ${s(f.five_year_fee_estimate)}. Fees usually rise a little each year, and hostel, mess, drawing materials and study tours are paid separately, so plan for a higher total.`,
  },
  {
    id: 'hostel_fee',
    anyOf: ['hostel_fee_general', 'hostel'],
    question: (f, c) => `Does ${c.n} have a hostel, and what does it cost?`,
    answer: (f) =>
      `${has(f, 'hostel') ? `Hostel accommodation at ${s(f.name)} is ${s(f.hostel)}.` : `${s(f.name)} has hostel accommodation.`}${has(f, 'hostel_fee_general') ? ` The hostel fee is ${s(f.hostel_fee_general)} per year${has(f, 'mess_fee_general') ? `, and mess is ${s(f.mess_fee_general)}` : ''}.` : ''}`,
  },
  {
    id: 'seats',
    requires: ['barch_seats'],
    question: (f, c) => `How many B.Arch seats does ${c.n} have?`,
    answer: (f) =>
      `${s(f.name)} has ${s(f.barch_seats)} B.Arch seats each year${has(f, 'counselling') ? `, filled through ${list(f.counselling)}` : ''}${has(f, 'management_quota') ? ' and the management quota' : ''}.`,
  },
  {
    id: 'exams',
    requires: ['entrance_exams'],
    question: (f, c) => `Which entrance exam do I need for B.Arch at ${c.n}?`,
    answer: (f) =>
      `${s(f.name)} accepts ${list(f.entrance_exams)} scores for B.Arch admission. Every B.Arch college in India needs a valid NATA or JEE Main Paper 2 score under Council of Architecture rules.`,
  },
  {
    id: 'admission',
    anyOf: ['counselling', 'entrance_exams'],
    question: (f, c) => `How do I get B.Arch admission at ${c.n} in ${c.year}?`,
    answer: (f) =>
      [
        `Take ${has(f, 'entrance_exams') ? orList(f.entrance_exams) : 'NATA or JEE Main Paper 2'} and score well.`,
        has(f, 'counselling')
          ? `Then register for ${list(f.counselling)} counselling and list ${s(f.short_name ?? f.name)} in your choices; seats are allotted on merit.`
          : `Then apply to ${s(f.short_name ?? f.name)} with your score; seats are given on merit.`,
        has(f, 'management_quota') ? 'Management quota seats are filled by the college directly.' : '',
      ]
        .filter(Boolean)
        .join(' '),
  },
  {
    id: 'eligibility',
    question: (f, c) => `What is the eligibility for B.Arch at ${c.n}?`,
    answer: (f) => `To join B.Arch at ${s(f.name)} you need ${s(COMMON_FACTS.barch_eligibility)}. These are the Council of Architecture rules that apply to every B.Arch college.`,
  },
  {
    id: 'cutoff',
    anyOf: [],
    question: (f, c) => `What was the B.Arch cutoff at ${c.n}?`,
    answer: (f) => {
      const keys = cutoffKeys(f);
      const lines = keys.slice(0, 4).map((k) => {
        const [, sys, ...cat] = k.split('_');
        const year = f[`cutoff_${sys}_year`];
        return `${sys.toUpperCase()} ${cat.join(' ')}: ${s(f[k])}${year ? ` (${s(year)})` : ''}`;
      });
      return `The last B.Arch cutoffs at ${s(f.name)} were ${lines.join('; ')}. Cutoffs move every year with the number of applicants, so use them as a guide.`;
    },
  },
  {
    id: 'quota',
    anyOf: ['management_quota', 'nri_quota'],
    question: (f, c) => `Does ${c.n} have management or NRI quota seats?`,
    answer: (f) =>
      `Yes. ${s(f.name)} offers ${[has(f, 'management_quota') && 'management quota', has(f, 'nri_quota') && 'NRI quota'].filter(Boolean).join(' and ')} seats for B.Arch. You still need a valid NATA or JEE Main Paper 2 score to be admitted.${has(f, 'tuition_management') ? ` The management quota tuition is ${s(f.tuition_management)} per year.` : ''}`,
  },
  {
    id: 'placements',
    anyOf: ['average_package', 'highest_package', 'placement_rate'],
    question: (f, c) => `How are the placements for B.Arch at ${c.n}?`,
    answer: (f) =>
      `${has(f, 'placement_year') ? `In ${s(f.placement_year)}, ` : ''}${[
        has(f, 'average_package') && `the average package was ${s(f.average_package)}`,
        has(f, 'highest_package') && `the highest was ${s(f.highest_package)}`,
        has(f, 'placement_rate') && `${s(f.placement_rate)} of eligible students were placed`,
      ]
        .filter(Boolean)
        .join(', ')} for B.Arch graduates of ${s(f.name)}. Many architecture graduates also join firms through internships or go on to a master's degree.`,
  },
  {
    id: 'reach',
    anyOf: ['nearest_railway', 'nearest_airport'],
    question: (f, c) => `How do I reach ${c.n}?`,
    answer: (f) =>
      `${s(f.name)} is in ${place(f)}.${has(f, 'nearest_railway') ? ` The nearest railway station is ${s(f.nearest_railway)}.` : ''}${has(f, 'nearest_airport') ? ` The nearest airport is ${s(f.nearest_airport)}.` : ''}`,
  },
  {
    id: 'contact',
    anyOf: ['admissions_phone', 'admissions_email', 'website'],
    question: (f, c) => `How can I contact ${c.n} for B.Arch admission?`,
    answer: (f) =>
      [
        `You can reach the admissions office of ${s(f.name)}`,
        [has(f, 'admissions_phone') && `by phone on ${s(f.admissions_phone)}`, has(f, 'admissions_email') && `by email at ${s(f.admissions_email)}`]
          .filter(Boolean)
          .join(' or '),
        has(f, 'website') ? `${has(f, 'admissions_phone') || has(f, 'admissions_email') ? ', or' : ''} through the official website, ${s(f.website)}` : '',
        '.',
      ]
        .join(' ')
        .replace(/\s+([,.])/g, '$1')
        .replace(/\s+/g, ' '),
  },
  {
    id: 'duration',
    question: (f, c) => `How long is the B.Arch course at ${c.n}?`,
    answer: (f) =>
      `B.Arch at ${s(f.name)} is a 5 year full-time degree, as set by the Council of Architecture. It includes design studio work every semester and a period of practical training in an architect's office.`,
  },
  {
    id: 'highlights',
    requires: ['highlights'],
    question: (f, c) => `What is ${c.n} known for?`,
    answer: (f) => `${s(f.name)} is known for: ${list(f.highlights)}.`,
  },
  {
    id: 'preparation',
    question: (f, c) => `How should I prepare for NATA to get into ${c.n}?`,
    answer: (f) =>
      `Practise freehand drawing, perspective and composition every day, and revise maths and general aptitude with timed mock tests, since NATA tests both drawing ability and aptitude. Neram Classes runs NATA and JEE Main Paper 2 coaching online and at its centres, with daily drawing practice and teacher feedback.`,
  },
];

/** The intents this college has facts for, in page order. */
export function applicableIntents(f: Facts): Intent[] {
  return INTENTS.filter((i) => {
    if (i.id === 'cutoff') return cutoffKeys(f).length > 0;
    if (i.requires && !i.requires.every((k) => has(f, k))) return false;
    if (i.anyOf && i.anyOf.length && !i.anyOf.some((k) => has(f, k))) return false;
    return true;
  });
}

export function intentKeys(i: Intent, f: Facts): string[] {
  if (i.id === 'cutoff') return cutoffKeys(f);
  return [...(i.requires ?? []), ...(i.anyOf ?? [])].filter((k) => has(f, k));
}

export function ctxFor(f: Facts, now = new Date()): Ctx {
  return { n: s(f.short_name ?? f.name), year: admissionYear(now) };
}

export function templateFaqs(f: Facts, now = new Date()): Faq[] {
  const ctx = ctxFor(f, now);
  return applicableIntents(f).map((i) => ({
    intent: i.id,
    question: i.question(f, ctx),
    answer: i.answer(f, ctx).replace(/\s+/g, ' ').trim(),
    fact_keys: intentKeys(i, f),
  }));
}
