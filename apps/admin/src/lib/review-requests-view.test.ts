import { describe, expect, test } from 'vitest';
import {
  examTypeFrom,
  examYearFor,
  examYearFromCohort,
  googleLinkWarning,
  greetingName,
  guessCentre,
  previousCohort,
  rankByName,
  reminderFor,
  resultLine,
  rowsNeedingResults,
  toBatchRow,
} from './review-requests-view';
import { reviewReminderMessage, reviewRequestMessage, reviewRequestUrl } from './marketing-links';

describe('rankByName', () => {
  const people = [{ name: 'Afrin Banu' }, { name: 'Bavishiya' }, { name: 'Sabari' }, { name: 'Ram Babu' }];
  test('name start, then word start (earlier hit first), then contains', () => {
    expect(rankByName(people, 'ba').map((p) => p.name)).toEqual(['Bavishiya', 'Ram Babu', 'Afrin Banu', 'Sabari']);
  });
  test('an empty query keeps the order', () => {
    expect(rankByName(people, '  ')).toEqual(people);
  });
});

describe('resultLine', () => {
  test('prefers the rank, falls back to percentile', () => {
    expect(resultLine({ air_rank: 142, college_admitted: 'SPA Delhi' })).toBe('AIR 142 · SPA Delhi');
    expect(resultLine({ percentile: 98.5 })).toBe('98.5 percentile');
    expect(resultLine({})).toBe('');
  });
});

describe('googleLinkWarning', () => {
  test('says what to fix', () => {
    expect(googleLinkWarning({ learningMode: 'offline', centreName: 'Madurai', hasTarget: false })).toMatch(/Madurai has no Google Place ID/);
    expect(googleLinkWarning({ learningMode: 'online', centreName: null, hasTarget: false })).toMatch(/headquarters/);
    expect(googleLinkWarning({ learningMode: 'offline', centreName: 'Coimbatore', hasTarget: true })).toBeNull();
  });
});

describe('review link copy', () => {
  test('builds the short link on the marketing host', () => {
    expect(reviewRequestUrl('abc', { adminOrigin: 'https://admin.neramclasses.com' })).toBe('https://neramclasses.com/r/abc');
    expect(reviewRequestUrl('abc', { adminOrigin: 'http://localhost:3013' })).toBe('http://localhost:3010/r/abc');
  });
  test('the WhatsApp message congratulates, mentions speaking and has no dashes', () => {
    const msg = reviewRequestMessage('Priya', 'https://neramclasses.com/r/abc', 'SPA Delhi');
    expect(msg).toContain('Congratulations on joining SPA Delhi!');
    expect(msg).toContain('tap the mic');
    expect(msg).not.toMatch(/—|--/);
  });
  test('greets nobody rather than a placeholder', () => {
    expect(greetingName('Student')).toBeNull();
    expect(greetingName('Priya Sharma')).toBe('Priya');
  });
});

describe('reminderFor', () => {
  const base = {
    submitted_at: '2026-10-01',
    google_target_url: 'https://g.page/r/x/review',
    google_posted_self_reported_at: null,
    secondary_platform: 'justdial' as const,
    secondary_clicked_at: null,
    reminder_sent_at: null,
    status: 'submitted',
  };
  test('Google first, then the directory, then nothing', () => {
    expect(reminderFor(base)).toBe('google');
    expect(reminderFor({ ...base, google_posted_self_reported_at: 'x' })).toBe('justdial');
    expect(reminderFor({ ...base, google_posted_self_reported_at: 'x', secondary_clicked_at: 'y' })).toBeNull();
  });
  test('one reminder only, and never before they reviewed', () => {
    expect(reminderFor({ ...base, reminder_sent_at: 'z' })).toBeNull();
    expect(reminderFor({ ...base, submitted_at: null })).toBeNull();
    expect(reminderFor({ ...base, status: 'cancelled' })).toBeNull();
  });
  test('the reminder message names the platform and has no dashes', () => {
    const msg = reviewReminderMessage('Priya', 'https://neramclasses.com/r/abc', 'google');
    expect(msg).toContain('post the same review on Google');
    expect(msg).toContain('https://neramclasses.com/r/abc');
    expect(msg).not.toMatch(/\u2014|--/);
  });
});

describe('batch prefill', () => {
  const centres = [
    { id: 'c-try', city: 'Tiruchirapalli' },
    { id: 'c-cbe', city: 'Coimbatore' },
    { id: 'c-chn', city: 'Chennai' },
    { id: 'c-tbm', city: 'Chennai' },
  ];

  test('exam year from the cohort, the application form winning', () => {
    expect(examYearFromCohort('2025-26')).toBe(2026);
    expect(examYearFromCohort('2025')).toBeNull();
    expect(examYearFor({ targetExamYear: '2027', academicYear: '2025-26' })).toBe(2027);
    expect(examYearFor({ targetExamYear: null, academicYear: '2025-26' })).toBe(2026);
    expect(previousCohort('2026-27')).toBe('2025-26');
    expect(previousCohort('1999-00')).toBe('1998-99');
  });

  test('centre by city, with Trichy spellings as one, and no guess for two centres in a city', () => {
    expect(guessCentre('Trichy', centres)).toBe('c-try');
    expect(guessCentre(' coimbatore ', centres)).toBe('c-cbe');
    expect(guessCentre('Chennai', centres)).toBeNull();
    expect(guessCentre(null, centres)).toBeNull();
  });

  test('a verified result wins over the alumni record and the avatar', () => {
    const row = toBatchRow({
      user: { id: 'u1', name: 'Priya Sharma', avatar_url: 'https://x/avatar.jpg', phone: '+919999900011', academic_year: '2025-26', is_alumni: true },
      lead: { city: 'Trichy', target_exam_year: null, interest_course: 'NATA' },
      alumni: { college_name: 'Old College', exam_name: 'NATA' },
      result: { id: 'r1', exam_type: 'jee_paper2', exam_year: 2026, rank: 142, percentile: null, college_name: 'NIT Trichy', photo_url: 'https://x/result.jpg' },
      centres,
    });
    expect(row).toMatchObject({
      examType: 'JEE_PAPER_2',
      examYear: 2026,
      airRank: 142,
      collegeAdmitted: 'NIT Trichy',
      photoUrl: 'https://x/result.jpg',
      centreId: 'c-try',
      studentResultId: 'r1',
      existingRequest: null,
    });
  });

  test('with no result, fills from records and leaves the result for staff', () => {
    const row = toBatchRow({
      user: { id: 'u2', name: null, avatar_url: null, phone: null, academic_year: '2025-26', is_alumni: false },
      alumni: { college_name: 'SPA Delhi' },
      centres,
      existing: { id: 'rr-1', progress: 'sent' },
    });
    expect(row).toMatchObject({ name: 'Unnamed student', examYear: 2026, collegeAdmitted: 'SPA Delhi', airRank: null, existingRequest: { id: 'rr-1', progress: 'sent' } });
    expect(rowsNeedingResults([row, { ...row, percentile: 99 }])).toHaveLength(1);
  });
});

describe('examTypeFrom', () => {
  test('reads every spelling we store', () => {
    expect(examTypeFrom('both')).toBe('BOTH');
    expect(examTypeFrom('jee_paper2')).toBe('JEE_PAPER_2');
    expect(examTypeFrom('nata')).toBe('NATA');
    expect(examTypeFrom('NATA and JEE')).toBe('BOTH');
    expect(examTypeFrom('not_sure')).toBe('NATA');
    expect(examTypeFrom(null)).toBe('NATA');
  });
});
