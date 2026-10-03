import type { PageContext, Suggestion } from './types';

const BASE: Suggestion[] = [
  { label: "What's due?", send: "What's due?" },
  { label: 'My next class', send: 'When is my next class?' },
  { label: "I can't attend a class", send: "I can't attend a class" },
  { label: 'Remind me', send: 'Remind me' },
  { label: 'Add a sketch', send: 'Add a sketch' },
];

const BY_PAGE: Array<[string, Suggestion]> = [
  ['/student/sketchbook', { label: 'How is my rhythm?', send: 'How is my sketchbook rhythm?' }],
  ['/student/catch-up', { label: 'What do I have to catch up on?', send: 'What do I have to catch up on?' }],
  ['/student/timetable', BASE[1]],
  ['/student/assignments', BASE[0]],
];

/** Chips for an empty composer: the page's own ask first, then the standard set, no repeats. */
export function defaultSuggestions(page: PageContext | null | undefined): Suggestion[] {
  const lead = BY_PAGE.find(([prefix]) => page?.path?.startsWith(prefix))?.[1];
  const out: Suggestion[] = lead ? [lead] : [];
  for (const s of BASE) if (!out.some((o) => o.label === s.label)) out.push(s);
  return out.slice(0, 5);
}
