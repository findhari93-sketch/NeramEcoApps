import { describe, expect, it } from 'vitest';
import {
  accuracyLine,
  activityLine,
  countedLine,
  personaliseResults,
  rankLine,
  resultMessage,
  rightLine,
  roundName,
  scoreLine,
  summaryLine,
  type RoundStudentRow,
} from './round-results';

const row = (over: Partial<RoundStudentRow>): RoundStudentRow => ({
  student_id: 's1',
  name: 'Asha',
  correct: 12,
  wrong: 4,
  no_answer: 2,
  excused: 0,
  away: 0,
  counted: 18,
  attempted: 16,
  answered: 16,
  present_for: 18,
  score_pct: 67,
  accuracy_pct: 75,
  participation_pct: 89,
  label: 'good',
  not_active: false,
  rank: 7,
  ranked_of: 22,
  ...over,
});

describe('round results words', () => {
  it('names a round', () => {
    expect(roundName(2)).toBe('Round 2');
    expect(roundName(null)).toBe('This round');
  });

  it('says the score plainly, and gently when nothing was graded', () => {
    expect(scoreLine(row({}))).toBe('12 of 18 correct');
    expect(scoreLine(row({ correct: 0, counted: 0 }))).toBe('No graded questions for you in this round');
  });

  it('nudges a quiet student kindly', () => {
    expect(activityLine(row({}))).toBe('You answered 16 of 18 questions.');
    expect(activityLine(row({ answered: 6, not_active: true }))).toBe(
      'You answered 6 of 18 questions. Answer every question next time, a guess is fine.',
    );
    expect(activityLine(row({ present_for: 0, answered: 0 }))).toBe('You were not in the pad for any question.');
  });

  it('builds one message with per-student values', () => {
    const { subject, plain } = resultMessage(1, 'JEE B.Arch Session 1');
    expect(subject).toBe('Your Round 1 result is out');
    expect(plain).toBe('Hi {firstName}, your Answer Pad result for Round 1 in JEE B.Arch Session 1: {score}. {activity}');
    expect(personaliseResults([row({})])).toEqual({
      s1: { score: 'attempted 16 of 18, 12 right, rank 7 of 22 (Good)', activity: 'You answered 16 of 18 questions.' },
    });
  });

  it('gives attempted, right, rank and what counted', () => {
    expect(rightLine(row({}))).toBe('12 of 16');
    expect(rightLine(row({ correct: 0, attempted: 0 }))).toBe('0');
    expect(rankLine(row({}))).toBe('7 of 22');
    expect(rankLine(row({ rank: null }))).toBeNull();
    expect(accuracyLine(row({}))).toBe('75% of your attempts were right');
    expect(accuracyLine(row({ attempted: 0, accuracy_pct: null }))).toBeNull();
    expect(countedLine(row({}))).toBe('18 questions counted for you.');
    expect(countedLine(row({ counted: 1, away: 1, excused: 2 }))).toBe(
      "1 question counted for you. 1 asked while you were away doesn't count. 2 excused by your teacher.",
    );
    expect(summaryLine(row({ counted: 0 }))).toBe('no graded questions for you in this round');
  });

  it('never uses a dash in what students read', () => {
    const text = JSON.stringify([resultMessage(3, 'Class'), personaliseResults([row({ label: 'needs_practice', not_active: true, away: 2, excused: 1 })]), countedLine(row({ away: 2, excused: 1 }))]);
    expect(text).not.toMatch(/[–—]|--/);
  });
});
