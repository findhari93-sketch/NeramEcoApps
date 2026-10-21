import { describe, it, expect } from 'vitest';
import { buildClassAccountMessage, startPassword, suggestUsernameFromFather } from './rules';

describe('suggestUsernameFromFather', () => {
  // Real first name and father's name pairs from prod, with the IDs staff made by hand.
  it.each([
    ['Radhika', 'Kunisetty Bhanuprakash ', 'Radhika_Bhanuprakash'],
    ['Mukunthan', 'Punithavel', 'Mukunthan_Punithavel'],
    ['Karthik', 'Gregory', 'Karthik_Gregory'],
    ['Santhosh', 'Vadivel.P', 'Santhosh_Vadivel'],
    ['Adhvika', 'Selvamuthukumar', 'Adhvika_Selvamuthukumar'],
    ['Rishi', 'Pandian.S', 'Rishi_Pandian'],
    ['Lakshita', 'Navin Prasad Radhakrishnan', 'Lakshita_Radhakrishnan'],
  ])('%s with father %s gives %s', (first, father, expected) => {
    expect(suggestUsernameFromFather(first, father)).toBe(expected);
  });

  it('skips initials and capitalises', () => {
    expect(suggestUsernameFromFather('dhisha', 'S HARIBABU')).toBe('Dhisha_Haribabu');
  });

  it('falls back to the last name, then to the first name alone', () => {
    expect(suggestUsernameFromFather('Afrin', null, 'banu')).toBe('Afrin_Banu');
    expect(suggestUsernameFromFather('Afrin', '', '')).toBe('Afrin');
    expect(suggestUsernameFromFather('Afrin', 'sm', '')).toBe('Afrin');
  });

  it('uses only the first word of a two-word first name', () => {
    expect(suggestUsernameFromFather('Saniya farin', 'Nizar ahamed')).toBe('Saniya_Ahamed');
  });

  it('returns empty with no first name', () => {
    expect(suggestUsernameFromFather('', 'Gregory')).toBe('');
  });
});

describe('startPassword', () => {
  it('is the first name with a capital and @123', () => {
    expect(startPassword('radhika')).toBe('Radhika@123');
    expect(startPassword('MUKUNTHAN')).toBe('Mukunthan@123');
  });

  it('reaches eight characters for a short name', () => {
    expect(startPassword('Uma')).toBe('Uma@1234');
    expect(startPassword('Uma')!.length).toBeGreaterThanOrEqual(8);
  });

  it('uses the first word only, letters only', () => {
    expect(startPassword('Saniya farin')).toBe('Saniya@123');
  });

  it('is null without letters', () => {
    expect(startPassword('')).toBeNull();
    expect(startPassword(null)).toBeNull();
  });
});

describe('buildClassAccountMessage', () => {
  const message = buildClassAccountMessage({ firstName: 'Radhika', upn: 'Radhika_Bhanuprakash@neramclasses.com' });

  it('carries the login ID and the setup link', () => {
    expect(message).toContain('Login ID: Radhika_Bhanuprakash@neramclasses.com');
    expect(message).toContain('https://app.neramclasses.com/onboarding');
  });

  it('never carries a password', () => {
    expect(message).not.toMatch(/@123/);
    expect(message.toLowerCase()).not.toContain('password:');
  });

  it('has no em dashes or double dashes', () => {
    expect(message).not.toMatch(/—|--/);
  });
});
