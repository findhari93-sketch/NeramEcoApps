import { describe, expect, it } from 'vitest';
import { defaultSuggestions, filterSuggestions } from './page-suggestions';

const ON = { sketchbook: true, attendance: true, tests: true, questionBank: true, inspiration: true };

describe('defaultSuggestions', () => {
  it('leads with the page the student is on', () => {
    expect(defaultSuggestions({ path: '/student/sketchbook' }, ON)[0].label).toBe('How is my rhythm?');
    expect(defaultSuggestions({ path: '/student/catch-up' }, ON)[0].label).toBe('What do I have to catch up on?');
    expect(defaultSuggestions({ path: '/student/timetable' }, ON)[0].label).toBe('My next class');
  });
  it('falls back to the standard five anywhere else, and never repeats a chip', () => {
    const chips = defaultSuggestions({ path: '/student/dashboard' }, ON);
    expect(chips.map((c) => c.label)).toEqual(["What's due?", 'My next class', "I can't attend a class", 'Remind me', 'Add a sketch']);
    const sb = defaultSuggestions({ path: '/student/sketchbook' }, ON);
    expect(new Set(sb.map((c) => c.label)).size).toBe(sb.length);
  });

  it('leads with the maths tutor when a bank question is open, and not without the bank', () => {
    const page = { path: '/student/question-bank/questions', questionId: 'a1b2c3d4-0000-4000-8000-000000000001' };
    expect(defaultSuggestions(page, ON).slice(0, 2).map((c) => c.label)).toEqual(['Explain this question', 'Give me a hint']);
    expect(defaultSuggestions({ path: '/student/question-bank/questions' }, ON)[0].label).toBe('Which chapters matter most?');
    expect(defaultSuggestions(page, { ...ON, questionBank: false }).map((c) => c.label)).not.toContain('Explain this question');
  });

  it('drops the sketch chips while the sketchbook is off (Ruling 25)', () => {
    const off = { sketchbook: false, attendance: true, tests: true, questionBank: true, inspiration: true };
    expect(defaultSuggestions({ path: '/student/dashboard' }, off).map((c) => c.label)).toEqual(["What's due?", 'My next class', "I can't attend a class", 'Remind me']);
    expect(defaultSuggestions({ path: '/student/sketchbook' }, off).map((c) => c.label)).not.toContain('How is my rhythm?');
  });
});

describe('filterSuggestions', () => {
  const ALL = { sketchbook: true, attendance: true, tests: true, questionBank: true, inspiration: true };
  it('drops chips that lead into a switched-off feature, keeps the rest in order', () => {
    const list = [
      { label: 'Add a sketch', send: 'Add a sketch' },
      { label: "What's due?", send: "What's due?" },
      { label: 'Which chapters matter most?', send: 'Which chapters matter most for my exam?' },
      { label: 'What tests do I have?', send: 'What tests do I have?' },
    ];
    expect(filterSuggestions(list, { ...ALL, sketchbook: false, questionBank: false, tests: false }).map((s) => s.label)).toEqual(["What's due?"]);
    expect(filterSuggestions(list, ALL)).toEqual(list);
  });

  it('leads with the question bank chip on bank pages only while the bank is on', () => {
    expect(defaultSuggestions({ path: '/student/question-bank/nata' }, ALL)[0].label).toBe('Which chapters matter most?');
    expect(defaultSuggestions({ path: '/student/question-bank/nata' }, { ...ALL, questionBank: false })[0].label).not.toBe('Which chapters matter most?');
  });
});
