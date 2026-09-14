import { describe, it, expect } from 'vitest';
import {
  describeAgreement,
  matchApplicationForms,
  nameWords,
  type FormIdentity,
  type MatchStudent,
} from './application-form-match';

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

describe('describeAgreement', () => {
  it('reports a blank side as unknown, never as a disagreement', () => {
    // The Microsoft record carries no phone and no father's name. That is why
    // the form never reached Nexus, so it must not read as evidence against.
    const verdict = describeAgreement(student(), form({ fatherName: null }));
    expect(verdict.phone).toBe('unknown');
    expect(verdict.email).toBe('unknown');
    expect(verdict.fatherName).toBe('unknown');
  });

  it('agrees on a phone number however it is written', () => {
    const verdict = describeAgreement(student({ phones: ['9876543210'] }), form({ phones: ['+91 98765 43210'] }));
    expect(verdict.phone).toBe('same');
  });

  it('calls two different phone numbers a difference', () => {
    const verdict = describeAgreement(student({ phones: ['9876543210'] }), form({ phones: ['9000000001'] }));
    expect(verdict.phone).toBe('differs');
  });

  it('needs more than a first name to call it the same name', () => {
    const shared = describeAgreement(student(), form({ names: ['Kavin Raghunathan'] }));
    expect(shared.name).toBe('same');
    const sibling = describeAgreement(student(), form({ names: ['Kavin Subramanian'] }));
    expect(sibling.name).toBe('differs');
  });

  it("matches a surname against the father's name, as the chip does", () => {
    const verdict = describeAgreement(student(), form({ fatherName: 'Raghunathan Iyer' }));
    expect(verdict.fatherName).toBe('same');
  });

  it('never contradicts a chip: every reason the matcher gives reads as agreeing', () => {
    const theStudent = student({ phones: ['9876543210'] });
    const theForm = form({
      names: ['Kavin Raghunathan'],
      phones: ['9876543210'],
      fatherName: 'Raghunathan Iyer',
    });
    const [match] = matchApplicationForms(theStudent, [theForm]);
    const verdict = describeAgreement(theStudent, theForm);
    const row = { phone: verdict.phone, email: verdict.email, full_name: verdict.name, father_name: verdict.fatherName };
    for (const reason of match.reasons) expect(row[reason]).toBe('same');
  });

  it('still reports a matching surname when the form carries no usable name', () => {
    // The matcher gates its father's-name chip behind the first name matching,
    // because it is deciding whether to PROPOSE at all. This screen is showing a
    // person the evidence, so a real surname match is reported even when the
    // form's own name field is the apply flow's "User" placeholder. More than
    // the chip says, never less.
    const verdict = describeAgreement(student(), form({ names: ['User'], fatherName: 'Raghunathan Iyer' }));
    expect(verdict.name).toBe('unknown');
    expect(verdict.fatherName).toBe('same');
  });
});
