import { describe, expect, it } from 'vitest';
import { defaultSuggestions } from './page-suggestions';

const ON = { sketchbook: true, attendance: true };

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

  it('drops the sketch chips while the sketchbook is off (Ruling 25)', () => {
    const off = { sketchbook: false, attendance: true };
    expect(defaultSuggestions({ path: '/student/dashboard' }, off).map((c) => c.label)).toEqual(["What's due?", 'My next class', "I can't attend a class", 'Remind me']);
    expect(defaultSuggestions({ path: '/student/sketchbook' }, off).map((c) => c.label)).not.toContain('How is my rhythm?');
  });
});
