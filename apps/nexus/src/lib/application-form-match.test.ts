import { describe, it, expect } from 'vitest';
import { matchApplicationForms, nameWords, type FormIdentity, type MatchStudent } from './application-form-match';

function student(over: Partial<MatchStudent> = {}): MatchStudent {
  return { id: 'nexus-1', name: 'Kavin Raghunathan', phones: [], emails: [], ...over };
}

function form(over: Partial<FormIdentity> = {}): FormIdentity {
  return { userId: 'form-1', names: ['User'], fatherName: null, phones: [], emails: [], ...over };
}

describe('nameWords', () => {
  it('ignores the placeholder name the apply form writes', () => {
    expect(nameWords('User')).toEqual([]);
  });

  it('splits camelCase mailboxes, folds spelling and drops initials', () => {
    expect(nameWords('Meera AnandKumar P')).toEqual(['mira', 'anand', 'kumar']);
  });
});

describe('matchApplicationForms', () => {
  it('treats the same phone number as strong, however it is written', () => {
    const matches = matchApplicationForms(student({ phones: ['9876543210'] }), [
      form({ phones: ['+91 98765 43210'] }),
    ]);
    expect(matches).toEqual([{ userId: 'form-1', strength: 'strong', reasons: ['phone'] }]);
  });

  it('treats the same email address as strong, in any case', () => {
    const matches = matchApplicationForms(student({ emails: ['Kavin.R@gmail.com'] }), [
      form({ emails: ['kavin.r@gmail.com'] }),
    ]);
    expect(matches[0]).toMatchObject({ strength: 'strong', reasons: ['email'] });
  });

  it('finds a "User" record by the full name typed into first_name', () => {
    const matches = matchApplicationForms(student(), [form({ names: ['User', 'Kavin Raghunathan'] })]);
    expect(matches).toEqual([{ userId: 'form-1', strength: 'likely', reasons: ['full_name'] }]);
  });

  it('accepts the first name when the father carries the family name', () => {
    const matches = matchApplicationForms(student({ name: 'Zoya Khan' }), [
      form({ names: ['User', 'Zoya'], fatherName: 'Imran Ahmed Khan' }),
    ]);
    expect(matches[0]).toMatchObject({ strength: 'likely', reasons: ['father_name'] });
  });

  it('never proposes a record on a first name alone', () => {
    expect(
      matchApplicationForms(student({ name: 'Kavin Raghunathan' }), [
        form({ names: ['Kavin Subramani'], fatherName: 'Subramani' }),
      ]),
    ).toEqual([]);
    expect(matchApplicationForms(student({ name: 'Kavin' }), [form({ names: ['Kavin'] })])).toEqual([]);
  });

  it('forgives one letter in a long name and a missing h', () => {
    const matches = matchApplicationForms(student({ name: 'Kaviya Srinivasan' }), [
      form({ names: ['Kavya Shrinivasan'] }),
    ]);
    expect(matches[0]?.reasons).toEqual(['full_name']);
  });

  it('never matches a student to their own record', () => {
    expect(
      matchApplicationForms(student({ phones: ['9876543210'] }), [
        form({ userId: 'nexus-1', phones: ['9876543210'] }),
      ]),
    ).toEqual([]);
  });

  it('lists strong matches before likely ones', () => {
    const matches = matchApplicationForms(student({ phones: ['9876543210'] }), [
      form({ userId: 'by-name', names: ['Kavin Raghunathan'] }),
      form({ userId: 'by-phone', phones: ['9876543210'] }),
    ]);
    expect(matches.map((m) => m.userId)).toEqual(['by-phone', 'by-name']);
  });
});
