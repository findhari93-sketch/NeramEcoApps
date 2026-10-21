import { describe, it, expect } from 'vitest';
import { guestRemaining, istDayStartIso } from './quota';
import { splitSuggestions } from './stream';

describe('guest day boundary (India time)', () => {
  it('starts the day at 18:30 UTC the evening before', () => {
    // 20 Oct, 10:00 IST is 04:30 UTC; the day began 19 Oct 18:30 UTC.
    expect(istDayStartIso(new Date('2026-10-20T04:30:00Z'))).toBe('2026-10-19T18:30:00.000Z');
  });

  it('rolls over at midnight IST, not midnight UTC', () => {
    // 23:59 IST on the 20th, then 00:01 IST on the 21st.
    expect(istDayStartIso(new Date('2026-10-20T18:29:00Z'))).toBe('2026-10-19T18:30:00.000Z');
    expect(istDayStartIso(new Date('2026-10-20T18:31:00Z'))).toBe('2026-10-20T18:30:00.000Z');
  });

  it('never goes below zero', () => {
    expect(guestRemaining(0)).toBe(3);
    expect(guestRemaining(3)).toBe(0);
    expect(guestRemaining(9)).toBe(0);
  });
});

describe('follow-up suggestions', () => {
  it('turns the token into chips and removes it from the text', () => {
    expect(splitSuggestions('Your cutoff is **288**.\n\n[[suggest: Which colleges? | My rank? | Exam centres near me]]')).toEqual({
      body: 'Your cutoff is **288**.',
      suggestions: ['Which colleges?', 'My rank?', 'Exam centres near me'],
    });
  });

  it('accepts the list without its label, as the backup models write it', () => {
    expect(splitSuggestions('I am Aintra.\n\n[[What is my cutoff? | Which colleges?]]')).toEqual({
      body: 'I am Aintra.',
      suggestions: ['What is my cutoff?', 'Which colleges?'],
    });
  });

  it('hides a half-written token while streaming', () => {
    expect(splitSuggestions('Done.\n[[sugg')).toEqual({ body: 'Done.', suggestions: [] });
  });
});
