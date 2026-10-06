import { describe, expect, it } from 'vitest';
import {
  absenceReasonMessage,
  classPostAbsenceNotice,
  type AbsenceStep,
} from './absence-reason-message';

const msg = (step: AbsenceStep, earlierDays: string[] = []) =>
  absenceReasonMessage({ step, classDay: '9 Oct', earlierDays });

const ALL_STEPS: AbsenceStep[] = [1, 2, 3];

describe('what every step has to say', () => {
  it('is addressed to a person sendNudge can name', () => {
    for (const step of ALL_STEPS) {
      expect(msg(step).plain).toContain('{firstName}');
    }
  });

  it('carries a subject, a body and a button on every step', () => {
    for (const step of ALL_STEPS) {
      const m = msg(step);
      expect(m.subject.length).toBeGreaterThan(0);
      expect(m.plain.length).toBeGreaterThan(0);
      expect(m.buttonLabel.length).toBeGreaterThan(0);
    }
  });

  // The house rule: these read as AI-written and the founder has banned them.
  it('uses no em dashes or double dashes anywhere', () => {
    const all = [
      ...ALL_STEPS.flatMap((s) => Object.values(msg(s, ['2 Oct', '5 Oct']))),
      classPostAbsenceNotice(true),
    ].join(' ');
    expect(all).not.toMatch(/[–—]/);
    expect(all).not.toContain('--');
    expect(all).not.toContain('&mdash;');
  });
});

/**
 * The tone is the feature. What is being asked for is one sentence of
 * communication, not attendance, and a student who reads this as an accusation
 * of truancy will not file a reason, they will stop opening Nexus.
 */
describe('it asks for a reason, never for attendance', () => {
  it('says plainly that missing a class is allowed', () => {
    expect(msg(1).plain).toContain('completely fine');
    expect(msg(2).plain).toContain('Nobody is cross');
  });

  it('names being unreachable, not being absent, as the problem', () => {
    expect(msg(2).plain).toContain('unreachable');
  });

  it('never threatens anything before the last step', () => {
    for (const step of [1, 2] as AbsenceStep[]) {
      expect(msg(step).plain.toLowerCase()).not.toContain('hold');
      expect(msg(step).plain.toLowerCase()).not.toContain('access');
    }
  });
});

describe('the last ask', () => {
  it('names the consequence in words, so nobody is held unwarned', () => {
    const m = msg(3, ['2 Oct', '5 Oct']);
    expect(m.plain).toContain('on hold');
    expect(m.subject.toLowerCase()).toContain('hold');
  });

  it('names the remedy in the same breath as the consequence', () => {
    // "Your access will be held" alone is a threat. "Add a reason now and
    // nothing happens" is a rule, and only a rule can be complied with.
    expect(msg(3).plain).toContain('Add a reason now and nothing happens');
  });

  it('leaves a door open for a student something is actually wrong for', () => {
    expect(msg(3).plain).toContain('a teacher will call you');
  });

  it('lists every class it is talking about', () => {
    const m = msg(3, ['2 Oct', '5 Oct']);
    expect(m.plain).toContain('2 Oct, 5 Oct and 9 Oct');
  });
});

describe('listing the days', () => {
  it('joins two with "and"', () => {
    expect(msg(2, ['5 Oct']).plain).toContain('5 Oct and 9 Oct');
  });

  it('reads naturally with one day and no earlier ones', () => {
    expect(msg(1).plain).toContain('on 9 Oct');
  });
});

/**
 * Standing notice on the class share and the Teams post: a student should learn
 * the rule before they miss anything, not on their third strike.
 */
describe('the notice on a class post', () => {
  it('says nothing at all while the rule is switched off', () => {
    // Advertising a rule that is not armed is an empty threat, and an empty
    // threat teaches students that a Nexus notice does not mean what it says.
    expect(classPostAbsenceNotice(false)).toBe('');
  });

  it('states the rule once the rule is real', () => {
    const line = classPostAbsenceNotice(true);
    expect(line).toContain('record it in Nexus');
    expect(line).toContain('on hold');
  });

  it('asks for the behaviour before it mentions the consequence', () => {
    const line = classPostAbsenceNotice(true);
    expect(line.indexOf('record it in Nexus')).toBeLessThan(line.indexOf('on hold'));
  });

  it('stays short enough to sit under a class post without burying it', () => {
    expect(classPostAbsenceNotice(true).length).toBeLessThan(160);
  });
});
