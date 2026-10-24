import { describe, expect, it } from 'vitest';
import {
  avatarLanguageOf,
  avatarLanguageSentence,
  factsFromJourney,
  languageChipLabel,
  languageFromLocale,
  personAvatarLabel,
  resolvePersonRing,
  ringForExamYear,
  activityLine,
  examYearMark,
  glanceSentences,
  isBreakYear,
  placeLine,
  studyLine,
} from './person-avatar';

describe('resolvePersonRing', () => {
  it('draws no ring before anything is known, so nothing flashes', () => {
    expect(resolvePersonRing(null)).toBe('none');
    expect(resolvePersonRing(undefined)).toBe('none');
  });

  it('rings staff blue even when they once had a student profile', () => {
    expect(resolvePersonRing({ userType: 'admin', studentProfileId: 'sp' })).toBe('staff');
  });

  it('gives gold to every way of being our student', () => {
    expect(resolvePersonRing({ userType: 'student', lifecycleStage: 'active_student' })).toBe('student');
    expect(resolvePersonRing({ lifecycleStage: 'enrolled' })).toBe('student');
    expect(resolvePersonRing({ pipelineStage: 'enrolled' })).toBe('student');
    expect(resolvePersonRing({ studentProfileId: 'sp-1' })).toBe('student');
    expect(resolvePersonRing({ linkedClassroomEmail: 'a@neramclasses.com' })).toBe('student');
  });

  it('puts alumni before paused, and paused before student', () => {
    expect(resolvePersonRing({ isAlumni: true, studentProfileId: 'sp', lifecycleStage: 'paused' })).toBe('alumni');
    expect(resolvePersonRing({ lifecycleStage: 'alumni' })).toBe('alumni');
    expect(resolvePersonRing({ lifecycleStage: 'paused', studentProfileId: 'sp' })).toBe('paused');
  });

  it('reads everyone else in the funnel as a lead, fee pending included', () => {
    expect(resolvePersonRing({ userType: 'lead', lifecycleStage: 'applicant' })).toBe('lead');
    expect(resolvePersonRing({ pipelineStage: 'payment_pending' })).toBe('lead');
    expect(resolvePersonRing({})).toBe('lead');
  });
});

describe('languageFromLocale', () => {
  it('maps a site language to a home language, and English to nothing', () => {
    expect(languageFromLocale('ta')).toBe('tamil');
    expect(languageFromLocale('HI')).toBe('hindi');
    expect(languageFromLocale('te')).toBe('telugu');
    expect(languageFromLocale('en')).toBeNull();
    expect(languageFromLocale(null)).toBeNull();
  });
});

describe('avatarLanguageOf', () => {
  const guess = { key: 'tamil' as const, source: 'city' as const, from: 'Chennai' };

  it('shows a recorded language as a fact, ignoring any guess', () => {
    expect(avatarLanguageOf({ homeLanguage: 'hindi', guess })).toEqual({
      key: 'hindi',
      limitedEnglish: false,
      likely: false,
      guess: null,
    });
  });

  it('treats a recorded English as a decision: no mark, no guess', () => {
    expect(avatarLanguageOf({ homeLanguage: 'english', guess })).toBeNull();
  });

  it('still marks a recorded English student who has limited English', () => {
    expect(avatarLanguageOf({ homeLanguage: 'english', limitedEnglish: true })?.key).toBe('english');
  });

  it('shows a guess as likely when nothing is recorded', () => {
    expect(avatarLanguageOf({ homeLanguage: null, guess })).toMatchObject({ key: 'tamil', likely: true });
  });

  it('shows nothing when there is neither', () => {
    expect(avatarLanguageOf({ homeLanguage: null, guess: null })).toBeNull();
    expect(avatarLanguageOf(undefined)).toBeNull();
  });
});

describe('the words', () => {
  it('says a recorded, a limited and a guessed language differently', () => {
    expect(avatarLanguageSentence(avatarLanguageOf({ homeLanguage: 'tamil' }))).toBe('Tamil.');
    expect(avatarLanguageSentence(avatarLanguageOf({ homeLanguage: 'tamil', limitedEnglish: true }))).toBe(
      'Tamil, limited English.',
    );
    expect(
      avatarLanguageSentence(avatarLanguageOf({ guess: { key: 'kannada', source: 'state', from: 'Karnataka' } })),
    ).toBe('Likely Kannada, from Karnataka.');
  });

  it('puts the name first, then the ring, then the language', () => {
    expect(
      personAvatarLabel('Asha Kumar', 'student', avatarLanguageOf({ homeLanguage: 'telugu' })),
    ).toBe('Asha Kumar. Enrolled student. Telugu.');
    expect(personAvatarLabel('Ravi', 'none', null)).toBe('Ravi.');
  });

  it('labels the chip', () => {
    expect(languageChipLabel({ homeLanguage: 'malayalam' })).toBe('Malayalam');
    expect(languageChipLabel({ homeLanguage: 'english' })).toBe('English');
    expect(languageChipLabel({ guess: { key: 'hindi', source: 'locale', from: null } })).toBe('Likely Hindi');
    expect(languageChipLabel({})).toBe('Language');
  });
});

describe('factsFromJourney', () => {
  it('carries the ring facts a CRM row already holds', () => {
    const facts = factsFromJourney({
      avatar_url: 'https://x/y.jpg',
      user_type: 'student',
      pipeline_stage: 'enrolled',
      linked_classroom_email: null,
    });
    expect(facts).toMatchObject({ avatarUrl: 'https://x/y.jpg', pipelineStage: 'enrolled', linkedClassroomEmail: null });
    expect(resolvePersonRing(facts)).toBe('student');
    // A column the row does not carry stays unset, so the looked-up value can show.
    expect(facts.isAlumni).toBeUndefined();
    expect(facts.examYear).toBeUndefined();
  });

  it('leaves the class to the provider, even when the row says null', () => {
    // The row only knows the Nexus enrolment; a lead's break year comes from their application.
    const facts = factsFromJourney({ user_type: 'lead', current_standard: null } as never);
    expect('currentStandard' in facts).toBe(false);
  });
});

describe('ringForExamYear', () => {
  it('is a student until that exam season is over, alumni after', () => {
    expect(ringForExamYear(2026, new Date(2026, 9, 24))).toBe('alumni');
    expect(ringForExamYear(2027, new Date(2026, 9, 24))).toBe('student');
    expect(ringForExamYear(2027, new Date(2027, 6, 31))).toBe('student');
    expect(ringForExamYear(2027, new Date(2027, 7, 1))).toBe('alumni');
    expect(ringForExamYear(null)).toBe('student');
  });
});

describe('every person wears a ring', () => {
  it('gives staff the blue ring and everyone outside the funnel the dotted one', () => {
    expect(resolvePersonRing({ userType: 'admin' })).toBe('staff');
    expect(resolvePersonRing({ userType: 'teacher' })).toBe('staff');
    expect(resolvePersonRing({ userType: 'parent' })).toBe('other');
  });

  it('lets a screen name the person more precisely than the ring does', () => {
    expect(personAvatarLabel('Ravi', 'other', null, 'Google reviewer')).toBe('Ravi. Google reviewer.');
    expect(personAvatarLabel('Hari', 'staff', null)).toBe('Hari. Neram staff.');
  });
});

describe('the glance', () => {
  it('writes the exam year as two digits', () => {
    expect(examYearMark(2027)).toBe('27');
    expect(examYearMark(2030)).toBe('30');
    expect(examYearMark(null)).toBeNull();
  });

  it('says class and exam together, or whichever is known', () => {
    expect(studyLine({ currentStandard: '12th', examYear: 2027 })).toBe('Class 12, 2027 exam');
    expect(studyLine({ examYear: 2028 })).toBe('2028 exam');
    expect(studyLine({ currentStandard: 'gap_year' })).toBe('Break year');
    expect(studyLine({})).toBeNull();
  });

  it('says when a break-year student finished Class 12', () => {
    expect(studyLine({ currentStandard: 'gap_year', twelfthPassedYear: 2025, examYear: 2027 })).toBe(
      'Break year: finished Class 12 in 2025, 2027 exam',
    );
    expect(isBreakYear({ currentStandard: 'gap_year' })).toBe(true);
    expect(isBreakYear({ currentStandard: '12th' })).toBe(false);
  });

  it("flags a class the student gave on a form rather than one staff or Nexus confirmed", () => {
    expect(studyLine({ currentStandard: 'gap_year', studySource: 'application' })).toBe(
      'Break year (from their application)',
    );
    expect(studyLine({ currentStandard: '12th', examYear: 2027, studySource: 'demo' })).toBe(
      'Class 12, 2027 exam (from the demo booking)',
    );
    expect(studyLine({ currentStandard: '12th', studySource: 'staff' })).toBe('Class 12');
    expect(studyLine({ examYear: 2027, studySource: 'demo' })).toBe('2027 exam');
  });

  it('does not repeat a city that shares its state name', () => {
    expect(placeLine({ city: 'Chennai', state: 'Tamil Nadu' })).toBe('Chennai, Tamil Nadu');
    expect(placeLine({ city: 'Delhi', state: 'delhi' })).toBe('Delhi');
    expect(placeLine({ state: 'Kerala' })).toBe('Kerala');
  });

  it('says how long since they were last active', () => {
    const now = new Date('2026-10-24T12:00:00Z');
    expect(activityLine('2026-10-24T09:00:00Z', now)).toBe('Active today');
    expect(activityLine('2026-10-23T09:00:00Z', now)).toBe('Active yesterday');
    expect(activityLine('2026-10-19T12:00:00Z', now)).toBe('Active 5 days ago');
    expect(activityLine('2026-08-24T12:00:00Z', now)).toBe('Last active 2 months ago');
    expect(activityLine(null, now)).toBeNull();
  });

  it('speaks the corners for people in the funnel only', () => {
    const facts = { interest: 'hot', examYear: 2027, engagement: 'engaged' };
    expect(glanceSentences(facts, 'lead')).toEqual(['Hot lead', '2027 exam', 'Active this week']);
    expect(glanceSentences(facts, 'student')).toEqual(['2027 exam', 'Active this week']);
    expect(glanceSentences(facts, 'staff')).toEqual([]);
  });
});
