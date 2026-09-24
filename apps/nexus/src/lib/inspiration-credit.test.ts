import { describe, expect, it } from 'vitest';
import { formatInspirationCredit, shortName, type CreditInput } from './inspiration-credit';

const input = (over: Partial<CreditInput> = {}): CreditInput => ({
  kind: 'submission_original',
  firstName: 'Harshitaa',
  lastName: 'Thiyagu',
  fullName: 'Harshitaa Thiyagu',
  isAlumni: false,
  examYear: 2026,
  optedOut: false,
  ...over,
});

describe('shortName', () => {
  it('uses the first name and the surname initial', () => {
    expect(shortName('Harshitaa', 'Thiyagu', null)).toBe('Harshitaa T.');
    expect(shortName('Harshitaa', null, null)).toBe('Harshitaa');
  });

  it('falls back to the full name', () => {
    expect(shortName(null, null, 'priya  s kumar')).toBe('priya K.');
    expect(shortName(null, null, 'Kavin')).toBe('Kavin');
    expect(shortName(null, null, '  ')).toBeNull();
  });
});

describe('formatInspirationCredit', () => {
  it('credits a current student with their batch', () => {
    expect(formatInspirationCredit(input())).toBe('Harshitaa T. · 2026 batch');
    expect(formatInspirationCredit(input({ examYear: null }))).toBe('Harshitaa T.');
  });

  it('credits an alumnus with their year', () => {
    expect(formatInspirationCredit(input({ isAlumni: true, examYear: 2025 }))).toBe('Harshitaa T. · Alumni 2025');
    expect(formatInspirationCredit(input({ isAlumni: true, examYear: null }))).toBe('Harshitaa T. · Alumni');
  });

  it('names whose drawing a reference was made from', () => {
    expect(formatInspirationCredit(input({ kind: 'submission_reference' }))).toBe("Neram reference · from Harshitaa T.'s drawing");
  });

  it('never names a student who opted out, and exemplars have no student', () => {
    expect(formatInspirationCredit(input({ kind: 'submission_reference', optedOut: true }))).toBe('Neram reference');
    expect(formatInspirationCredit(input({ kind: 'exemplar', firstName: null, lastName: null, fullName: null }))).toBe('Neram reference');
    expect(formatInspirationCredit(input({ optedOut: true }))).toBe('Neram student');
  });

  it('never uses an em dash or a double dash', () => {
    const all = [
      input(),
      input({ isAlumni: true }),
      input({ kind: 'submission_reference' }),
      input({ kind: 'exemplar' }),
      input({ optedOut: true }),
    ].map(formatInspirationCredit);
    for (const line of all) expect(line).not.toMatch(/—|--/);
  });
});

describe('featured credit', () => {
  const featured = (over: Partial<CreditInput> = {}): CreditInput => ({
    kind: 'submission_original',
    firstName: 'Harshitaa',
    lastName: 'Thiyagu',
    fullName: 'Harshitaa  Thiyagu',
    isAlumni: false,
    examYear: 2026,
    optedOut: false,
    featured: true,
    ...over,
  });

  it('spells the name out in full', () => {
    expect(formatInspirationCredit(featured())).toBe('Harshitaa Thiyagu · 2026 batch');
    expect(formatInspirationCredit(featured({ fullName: null }))).toBe('Harshitaa Thiyagu · 2026 batch');
  });

  it('still hides an opted-out student, and leaves references short', () => {
    expect(formatInspirationCredit(featured({ optedOut: true }))).toBe('Neram student');
    expect(formatInspirationCredit(featured({ kind: 'submission_reference' }))).toBe("Neram reference · from Harshitaa T.'s drawing");
  });
});
