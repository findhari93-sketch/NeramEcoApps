/**
 * Every sentence the location pages say about a place, built from its facts.
 * Pure, so the page, its FAQ schema and llms.txt say exactly the same thing,
 * and so tests can pin the copy rules: no em dashes, no unverifiable claims,
 * and never "our {city} centre" without a real centre.
 */
import { getBySlug } from '@/data/counselling-2026';
import { COURSE_FEES } from '@/lib/fees';
import { EXAMS } from './exam-config';
import { streetOnly } from './centre-page';
import type { CityFacts, StateFacts, TestCityFact } from './location-facts';

export const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

const CRASH = COURSE_FEES.find((c) => c.slug === 'crash-course');
const ONE_YEAR = COURSE_FEES.find((c) => c.slug === '1-year-program');

/** "₹15,000 for the 3-month crash course and ₹30,000 for the 1-year programme". */
export function feeSentence(): string {
  const parts: string[] = [];
  if (CRASH) parts.push(`${inr(CRASH.price)} for the ${CRASH.durationMonths}-month crash course`);
  if (ONE_YEAR) parts.push(`${inr(ONE_YEAR.price)} for the 1-year programme`);
  return parts.join(' and ');
}

/** "Ashok Nagar, Tambaram, Trichy": one short name per place, even with two centres in a town. */
export function classroomPlaces(classrooms: Array<{ centre: { areaLabel: string } }>): string {
  return Array.from(new Set(classrooms.map((c) => c.centre.areaLabel.split(',')[0].trim()))).join(', ');
}

export function hubNames(slugs: string[]): Array<{ slug: string; name: string; url: string | null }> {
  return slugs
    .map((slug) => getBySlug(slug))
    .filter((h): h is NonNullable<typeof h> => !!h)
    .map((h) => ({ slug: h.slug, name: h.shortName, url: h.available ? `/counseling/${h.slug}` : null }));
}

function testCityPhrase(t: TestCityFact, cityName: string): string {
  if (t.inThisCity) return `${cityName} itself is a NATA ${t.year} test city`;
  if (t.km === null) return `the nearest NATA ${t.year} test city is ${t.label}`;
  return `the nearest NATA ${t.year} test city is ${t.label}, about ${t.km} km away`;
}

// ─── City ──────────────────────────────────────────────────────────────────

/** "Vasanth Nagar" from "Vasanth Nagar, Madurai"; null when the label is just the city. */
export function centreLocality(f: CityFacts): string | null {
  const label = f.classroom?.centre.areaLabel ?? '';
  const [first, ...rest] = label.split(',').map((s) => s.trim());
  return rest.length && first && first.toLowerCase() !== f.place.name.toLowerCase() ? first : null;
}

/**
 * A classroom city answers "{exam} coaching centre in {city}", the search a
 * student makes when they want a place to walk into. Other cities are online.
 */
export function cityTitle(f: CityFacts): string {
  const exam = EXAMS[f.exam].name;
  const name = f.place.name;
  if (f.mode === 'classroom') {
    const area = f.centres.length > 1 ? null : centreLocality(f);
    const withArea = area && `${exam} Coaching Centre in ${name}: ${area} Classroom`;
    // Google shows about 60 characters; past that the locality would be cut off.
    return withArea && withArea.length <= 60 ? withArea : `${exam} Coaching Centre in ${name}: Classroom and Online`;
  }
  return `${exam} Coaching in ${name}: Live Online Classes`;
}

export function cityH1(f: CityFacts): string {
  const exam = EXAMS[f.exam].name;
  return f.mode === 'classroom' ? `${exam} Coaching Centre in ${f.place.name}` : `${exam} Coaching in ${f.place.name}`;
}

export function cityDescription(f: CityFacts): string {
  const exam = EXAMS[f.exam].name;
  const name = f.place.name;
  const mode =
    f.mode === 'classroom'
      ? `classroom batches in ${f.classroom!.centre.areaLabel} and live online classes`
      : 'live online classes with drawing feedback';
  const test = f.testCities[0];
  const testBit = test ? (test.inThisCity ? ` ${name} is a NATA test city.` : ` Nearest NATA test city: ${test.label}.`) : '';
  const fee = CRASH ? ` Fees from ${inr(CRASH.price)}.` : '';
  // A centre page leads with where the classroom is: that is what the searcher wants.
  const own = f.mode === 'classroom' && f.centres.length === 1 ? f.centres[0] : null;
  const street = own ? streetOnly(own.address, own.city) : null;
  if (own && street) {
    const near = own.landmark ? ` (${own.landmark})` : '';
    return `${exam} coaching centre at ${street}, ${own.city}${near}. Classroom batches and live online classes, mock tests and B.Arch counselling help.${fee}`.slice(0, 300);
  }
  return `${exam} coaching for ${name} students: ${mode}, mock tests and B.Arch counselling help.${testBit}${fee}`.slice(0, 300);
}

/** The 2 to 3 sentence answer that opens the page (what AI assistants quote). */
export function cityAnswer(f: CityFacts): string[] {
  const exam = EXAMS[f.exam];
  const name = f.place.name;
  const out: string[] = [];

  if (f.mode === 'classroom') {
    out.push(
      `Neram Classes teaches ${exam.name} to students in ${name} in two ways: classroom batches at its ${f.classroom!.centre.areaLabel} centre and live online classes with drawing feedback.`,
    );
  } else if (f.mode === 'online-near-classroom') {
    out.push(
      `Neram Classes teaches ${exam.name} to students in ${name} through live online classes with drawing feedback. The nearest Neram classroom is in ${f.classroom!.centre.areaLabel}, about ${f.classroom!.km} km away.`,
    );
  } else {
    out.push(
      `Neram Classes teaches ${exam.name} to students in ${name} through live online classes with drawing feedback, so you can prepare from home.`,
    );
  }

  const facts: string[] = [];
  if (f.testCities[0]) facts.push(testCityPhrase(f.testCities[0], name));
  if (f.localCollegeCount > 0) {
    facts.push(`our college list has ${f.localCollegeCount} B.Arch ${f.localCollegeCount === 1 ? 'college' : 'colleges'} in and around ${name}`);
  }
  if (facts.length) out.push(`${facts.join(', and ')}.`.replace(/^./, (c) => c.toUpperCase()));

  const fees = feeSentence();
  if (fees) out.push(`Fees are ${fees}.`);
  return out;
}

export interface Faq {
  question: string;
  answer: string;
}

export function cityFaqs(f: CityFacts): Faq[] {
  const exam = EXAMS[f.exam];
  const name = f.place.name;
  const region = f.regionName;
  const faqs: Faq[] = [];

  faqs.push({ question: `Is there ${exam.name} coaching in ${name}?`, answer: cityAnswer(f).join(' ') });

  faqs.push({
    question: `Can I attend ${exam.name} classes in person in ${name}?`,
    answer:
      f.mode === 'classroom'
        ? `Yes. Neram Classes runs classroom batches at its ${f.classroom!.centre.areaLabel} centre, and you can switch to live online classes whenever you need to.`
        : f.mode === 'online-near-classroom'
          ? `Classes for ${name} students are live online. If you prefer a classroom, the nearest Neram centre is in ${f.classroom!.centre.areaLabel}, about ${f.classroom!.km} km away.`
          : `Classes for ${name} students are live online, with drawing reviews and mock tests. Neram's classrooms are in Tamil Nadu and Bangalore.`,
  });

  if (f.testCities.length) {
    const list = f.testCities
      .map((t) => (t.inThisCity ? `${t.label} (in the city)` : t.km === null ? t.label : `${t.label} (about ${t.km} km)`))
      .join(', ');
    faqs.push({
      question: `Where is the nearest NATA exam centre to ${name}?`,
      answer: `From the NATA ${f.testCities[0].year} test city list, the closest to ${name} are ${list}. Test cities can change every year, so confirm on the official NATA website before you apply.`,
    });
  }

  if (f.colleges.length) {
    const names = f.colleges.slice(0, 3).map((c) => c.shortName || c.name);
    faqs.push({
      question: `Which B.Arch colleges can ${name} students aim for?`,
      answer:
        f.localCollegeCount > 0
          ? `Colleges in and around ${name} include ${names.join(', ')}. Our college hub lists ${f.stateCollegeCount} ${exam.name}-accepting B.Arch colleges in ${region} with fees and cutoffs.`
          : `There is no B.Arch college in ${name} in our list yet. Students here usually aim for colleges elsewhere in ${region}, such as ${names.join(', ')}, or apply nationally.`,
    });
  }

  const hubs = hubNames(f.counsellingHubs);
  if (f.place.kind === 'india') {
    const national = f.exam === 'jee-paper-2' ? ' NIT, IIIT and SPA seats are filled through JoSAA and CSAB counselling.' : '';
    faqs.push({
      question: `How do B.Arch admissions work in ${region}?`,
      answer: hubs.length
        ? `State B.Arch seats in ${region} are filled through ${hubs.map((h) => h.name).join(' and ')} counselling, using your ${exam.name} score.${national}`
        : `${region} has no separate B.Arch counselling of its own, so students apply to colleges in other states and through national counselling.${national}`,
    });
  }

  faqs.push({
    question: `How much does ${exam.name} coaching cost?`,
    answer: `Neram's fees are ${feeSentence()}. The 2-year programme covers both NATA and JEE Paper 2.`,
  });

  return faqs;
}

// ─── State ─────────────────────────────────────────────────────────────────

export function stateTitle(f: StateFacts): string {
  return `${EXAMS[f.exam].name} Coaching in ${f.state.name}: Online and Classroom`;
}

export function stateDescription(f: StateFacts): string {
  const exam = EXAMS[f.exam].name;
  const hubs = hubNames(f.counsellingHubs).map((h) => h.name);
  const bits = [
    `${exam} coaching for students across ${f.state.name}: live online classes${f.classrooms.length ? ' and classroom batches' : ''}.`,
    f.collegeCount ? `${f.collegeCount} B.Arch colleges listed` : '',
    hubs.length ? `${hubs.join(' and ')} counselling explained.` : '',
  ].filter(Boolean);
  return bits.join(' ').slice(0, 300);
}

export function stateAnswer(f: StateFacts): string[] {
  const exam = EXAMS[f.exam];
  const out: string[] = [];
  out.push(
    f.classrooms.length
      ? `Neram Classes teaches ${exam.name} across ${f.state.name} with classroom batches in ${classroomPlaces(f.classrooms)} and live online classes for every other district.`
      : `Neram Classes teaches ${exam.name} to students across ${f.state.name} through live online classes with drawing feedback.`,
  );
  const hubs = hubNames(f.counsellingHubs);
  const bits: string[] = [];
  if (f.collegeCount) bits.push(`our college list has ${f.collegeCount} B.Arch colleges in ${f.state.name}`);
  if (hubs.length) bits.push(`state seats are filled through ${hubs.map((h) => h.name).join(' and ')} counselling`);
  if (bits.length) out.push(`${bits.join(', and ')}.`.replace(/^./, (c) => c.toUpperCase()));
  out.push(`Fees are ${feeSentence()}.`);
  return out;
}

export function stateFaqs(f: StateFacts): Faq[] {
  const exam = EXAMS[f.exam];
  const name = f.state.name;
  const hubs = hubNames(f.counsellingHubs);
  const faqs: Faq[] = [{ question: `Is there ${exam.name} coaching in ${name}?`, answer: stateAnswer(f).join(' ') }];
  if (f.testCities.length) {
    faqs.push({
      question: `Where are the NATA exam centres in ${name}?`,
      answer: `NATA ${f.testCities[0].year} listed these test cities in ${name}: ${f.testCities.map((t) => t.label).join(', ')}. Confirm the current list on the official NATA website.`,
    });
  }
  faqs.push({
    question: `How do B.Arch admissions work in ${name}?`,
    answer: hubs.length
      ? `State seats are allotted through ${hubs.map((h) => h.name).join(' and ')} counselling using your ${exam.name} score. JEE Paper 2 candidates can also apply to NITs, IIITs and SPAs through JoSAA.`
      : `${name} has no separate B.Arch counselling of its own. Students apply to colleges in other states and, with JEE Paper 2, to NITs, IIITs and SPAs through JoSAA.`,
  });
  if (f.colleges.length) {
    faqs.push({
      question: `Which B.Arch colleges are in ${name}?`,
      answer: `Our list includes ${f.colleges.slice(0, 4).map((c) => c.shortName || c.name).join(', ')}${f.collegeCount > 4 ? ` and ${f.collegeCount - 4} more` : ''}.`,
    });
  }
  faqs.push({ question: `How much does ${exam.name} coaching cost?`, answer: `Neram's fees are ${feeSentence()}.` });
  return faqs;
}
