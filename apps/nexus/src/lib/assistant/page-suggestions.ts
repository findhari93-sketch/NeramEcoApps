import type { AssistantFeatures, PageContext, Suggestion } from './types';

const BASE: Suggestion[] = [
  { label: "What's due?", send: "What's due?" },
  { label: 'My next class', send: 'When is my next class?' },
  { label: "I can't attend a class", send: "I can't attend a class" },
  { label: 'Remind me', send: 'Remind me' },
  { label: 'Add a sketch', send: 'Add a sketch' },
];

/** Which feature each feature-bound chip leads into; a chip whose feature is off is never shown (Ruling 25). */
const CHIP_FEATURE: Record<string, keyof AssistantFeatures> = {
  'Add a sketch': 'sketchbook',
  'How is my rhythm?': 'sketchbook',
  'Which chapters matter most?': 'questionBank',
  'What tests do I have?': 'tests',
  'Explain this question': 'questionBank',
  'Give me a hint': 'questionBank',
};

export const EXPLAIN_THIS = 'Explain this question step by step.';
export const HINT_THIS = 'Give me a hint for this question.';

/** With a bank question open, the maths tutor leads. The same words as the panel's quick actions. */
const ON_QUESTION: Suggestion[] = [
  { label: 'Explain this question', send: EXPLAIN_THIS },
  { label: 'Give me a hint', send: HINT_THIS },
];

const BY_PAGE: Array<[string, Suggestion]> = [
  ['/student/sketchbook', { label: 'How is my rhythm?', send: 'How is my sketchbook rhythm?' }],
  ['/student/catch-up', { label: 'What do I have to catch up on?', send: 'What do I have to catch up on?' }],
  ['/student/question-bank', { label: 'Which chapters matter most?', send: 'Which chapters matter most for my exam?' }],
  ['/student/tests', { label: 'What tests do I have?', send: 'What tests do I have?' }],
  ['/student/timetable', BASE[1]],
  ['/student/assignments', BASE[0]],
];

/**
 * Drops chips that lead into a switched-off feature. Used for fresh chips and
 * for chips restored from a stored envelope, which were filtered under the
 * switches of their day, not today's.
 */
export function filterSuggestions(list: Suggestion[], features: AssistantFeatures): Suggestion[] {
  return list.filter((s) => {
    const need = CHIP_FEATURE[s.label];
    return !need || features[need];
  });
}

/** Chips for an empty composer: the page's own ask first, then the standard set, no repeats. */
export function defaultSuggestions(page: PageContext | null | undefined, features: AssistantFeatures): Suggestion[] {
  const byPage = BY_PAGE.find(([prefix]) => page?.path?.startsWith(prefix))?.[1];
  const lead = page?.questionId && page.path.startsWith('/student/question-bank') ? ON_QUESTION : byPage ? [byPage] : [];
  const out: Suggestion[] = filterSuggestions(lead, features);
  for (const s of filterSuggestions(BASE, features)) if (!out.some((o) => o.label === s.label)) out.push(s);
  return out.slice(0, 5);
}
