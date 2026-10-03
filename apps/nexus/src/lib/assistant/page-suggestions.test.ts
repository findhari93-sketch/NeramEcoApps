import { describe, expect, it } from 'vitest';
import { defaultSuggestions } from './page-suggestions';

describe('defaultSuggestions', () => {
  it('leads with the page the student is on', () => {
    expect(defaultSuggestions({ path: '/student/sketchbook' })[0].label).toBe('How is my rhythm?');
    expect(defaultSuggestions({ path: '/student/catch-up' })[0].label).toBe('What do I have to catch up on?');
    expect(defaultSuggestions({ path: '/student/timetable' })[0].label).toBe('My next class');
  });
  it('falls back to the standard five anywhere else, and never repeats a chip', () => {
    const chips = defaultSuggestions({ path: '/student/dashboard' });
    expect(chips.map((c) => c.label)).toEqual(["What's due?", 'My next class', "I can't attend a class", 'Remind me', 'Add a sketch']);
    const sb = defaultSuggestions({ path: '/student/sketchbook' });
    expect(new Set(sb.map((c) => c.label)).size).toBe(sb.length);
  });
});
