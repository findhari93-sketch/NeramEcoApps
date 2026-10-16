/**
 * What a visitor wants, from the words of their questions. Keyword rules, not
 * an AI call: instant, free, and they work on every past row. Tune the lists
 * here; each rule is a set of whole-word-ish patterns (English plus the common
 * Tamil and Hindi transliterations visitors type).
 */

export const INTENTS = [
  'fees',
  'timings',
  'demo',
  'exam_dates',
  'centres',
  'syllabus',
  'abroad',
  'scholarship',
  'emi',
  'online',
  'eligibility',
  'colleges',
] as const;

export type Intent = (typeof INTENTS)[number];

export const INTENT_LABELS: Record<Intent, string> = {
  fees: 'Fees',
  timings: 'Class timings',
  demo: 'Demo / booking',
  exam_dates: 'Exam dates',
  centres: 'Centres',
  syllabus: 'Syllabus',
  abroad: 'Studying from abroad',
  scholarship: 'Scholarship',
  emi: 'EMI',
  online: 'Online classes',
  eligibility: 'Eligibility',
  colleges: 'Colleges & cutoffs',
};

/** Questions that signal someone close to joining. */
export const HOT_INTENTS: ReadonlySet<Intent> = new Set<Intent>(['fees', 'timings', 'demo', 'emi', 'scholarship']);

const RULES: Record<Intent, RegExp> = {
  fees: /\b(fees?|cost|costs|price|pricing|charges?|amount|kitna|kitne|evlo|evvalavu|ethana|rupees?|rs\.?|inr)\b|₹|\bhow much\b/i,
  timings: /\b(timings?|time ?table|schedule|batch(es)?|weekends?|weekdays?|class time|what time|morning|evening|hours?)\b/i,
  demo: /\b(demo|trial|free class|book(ed|ing)?|join(ing)? link|where do i join)\b/i,
  exam_dates: /\b((exam|nata|jee|test) ?(date|dates|schedule|kab|eppo)|when is (the )?(nata|jee)|announced|registration (date|last date)|last date)\b/i,
  centres: /\b(centres?|centers?|branch(es)?|address|offline|near me|campus|institute in|location)\b/i,
  syllabus: /\b(syllabus|pattern|topics?|portions?|chapters?|paper ?2|paper ?2a|subjects?)\b/i,
  abroad: /\b(abroad|dubai|uae|nri|gulf|overseas|outside india|qatar|saudi|oman|kuwait|bahrain|singapore|usa|uk)\b/i,
  scholarship: /\b(scholarships?|discounts?|concessions?|special offer|coupons?|free seat)\b/i,
  emi: /\b(emi|instal+ments?|pay in parts|monthly payment)\b/i,
  online: /\b(online|recorded|recordings?|live class(es)?|zoom|teams)\b/i,
  eligibility: /\b(eligib(le|ility)|percentage|minimum marks|marks required|qualif(y|ication)|12th|plus two|class 12|11th)\b/i,
  colleges: /\b(colleges?|cut ?offs?|ranks?|admissions?|counsel+ing|josaa|tnea|keam|comedk|kcet|seats?)\b/i,
};

/** Intents of one question, in the fixed INTENTS order. */
export function intentsOf(question: string | null | undefined): Intent[] {
  const text = (question ?? '').trim();
  if (!text) return [];
  return INTENTS.filter((intent) => RULES[intent].test(text));
}

/** Union over several questions, most frequent first, then INTENTS order. */
export function intentsOfMany(questions: (string | null | undefined)[]): Intent[] {
  const counts = new Map<Intent, number>();
  for (const q of questions) for (const i of intentsOf(q)) counts.set(i, (counts.get(i) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || INTENTS.indexOf(a[0]) - INTENTS.indexOf(b[0]))
    .map(([i]) => i);
}

export function isHot(intents: Intent[]): boolean {
  return intents.some((i) => HOT_INTENTS.has(i));
}
