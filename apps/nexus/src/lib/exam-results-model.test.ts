import { describe, it, expect } from 'vitest';
import { buildExamResultSections, buildStudentResultMessage } from './exam-results-model';
import { renderShareText } from './class-share-render';
import type { ExamResultsSummary, RankedCandidate } from '@neram/database';

const ranked = (over: Partial<RankedCandidate> = {}): RankedCandidate => ({
  student_id: 's1',
  student_name: 'Kaveya',
  avatar_url: null,
  attempt_id: 'a1',
  score: 38,
  total_marks: 50,
  percentage: 76,
  provisional: false,
  absent: false,
  time_spent_seconds: 3600,
  section_scores: [],
  sitting: 'main',
  bucket: 'exam_day',
  window_closes_at: null,
  rank: 3,
  sitting_size: 16,
  ...over,
});

const summary = (over: Partial<ExamResultsSummary> = {}): ExamResultsSummary => ({
  rows: [ranked()],
  stats: {
    roster: 47,
    sat: 16,
    absent: 3,
    still_to_sit: 19,
    average: 61,
    highest: 84,
    lowest: 30,
    passed: 12,
    passing_pct: 40,
  },
  section_averages: [],
  podium: [ranked({ rank: 1, student_name: 'Arun', percentage: 84 })],
  drawings_ungraded: 0,
  second: null,
  ...over,
});

describe('buildExamResultSections', () => {
  // The channel is told the exam day figures on results day. A sitting three
  // weeks later must not make that announcement retrospectively wrong.
  it('renders identically once a second sitting exists', () => {
    const before = renderShareText(
      buildExamResultSections({ examTitle: 'HOA Test', classroomName: 'NATA 2027', results: summary(), provisional: false }),
      new Set(['exam_summary', 'exam_podium', 'exam_sections']),
    );

    const withLate = summary({
      rows: [ranked(), ranked({ student_id: 's9', student_name: 'Late', sitting: 'second', bucket: 'second_sitting', percentage: 99, rank: 1, sitting_size: 9 })],
      second: { sat: 9, average: 71, highest: 99, lowest: 44, passed: 8 },
    });
    const after = renderShareText(
      buildExamResultSections({ examTitle: 'HOA Test', classroomName: 'NATA 2027', results: withLate, provisional: false }),
      new Set(['exam_summary', 'exam_podium', 'exam_sections']),
    );

    expect(after).toBe(before);
  });

  it('never names anyone from the second sitting', () => {
    const withLate = summary({
      podium: [ranked({ rank: 1, student_name: 'Arun' })],
      rows: [ranked({ student_id: 's9', student_name: 'Latecomer', sitting: 'second', bucket: 'second_sitting' })],
      second: { sat: 1, average: 76, highest: 76, lowest: 76, passed: 1 },
    });
    const text = renderShareText(
      buildExamResultSections({ examTitle: 'HOA Test', classroomName: null, results: withLate, provisional: false }),
      new Set(['exam_summary', 'exam_podium', 'exam_sections']),
    );
    expect(text).not.toContain('Latecomer');
  });
});

describe('the podium, when two students tie', () => {
  // The 18 Aug exam ranks 1, 2, 3, 3, 5. Labelling by POSITION in the list
  // printed "3th" for the fourth row and called a joint third "2nd".
  const tied = summary({
    podium: [
      ranked({ rank: 1, student_name: 'Abhitha', percentage: 100 }),
      ranked({ rank: 2, student_name: 'Aradya', percentage: 94 }),
      ranked({ rank: 3, student_name: 'Ayana', percentage: 92 }),
      ranked({ rank: 3, student_name: 'Sanjay', percentage: 92 }),
    ],
  });

  const text = () =>
    renderShareText(
      buildExamResultSections({ examTitle: 'HOA Test', classroomName: null, results: tied, provisional: false }),
      new Set(['exam_summary', 'exam_podium', 'exam_sections']),
    );

  it('never writes an ordinal like 3th', () => {
    expect(text()).not.toMatch(/\b\d+th\b(?<!11th)(?<!12th)(?<!13th)/);
    expect(text()).not.toContain('3th');
  });

  it('gives both joint thirds the same ordinal, and neither of them second place', () => {
    const out = text();
    expect(out).toContain('3rd  Ayana');
    expect(out).toContain('3rd  Sanjay');
    expect(out).toContain('2nd  Aradya');
    expect(out).not.toContain('2nd  Ayana');
  });

  it('names four, because the founder asked for four', () => {
    for (const name of ['Abhitha', 'Aradya', 'Ayana', 'Sanjay']) expect(text()).toContain(name);
  });
});

describe('buildStudentResultMessage', () => {
  const sat = (over: Partial<Parameters<typeof buildStudentResultMessage>[0]> = {}) =>
    buildStudentResultMessage({
      examTitle: 'HOA Test',
      hasPaper: true,
      absent: false,
      sitting: 'main' as const,
      provisional: false,
      ...over,
    });

  // The whole point of the rewrite: a Teams notification preview on a shared
  // phone must not be where somebody learns another person's marks.
  it('carries no score, no percentage and no rank', () => {
    const { plain } = sat();
    expect(plain).not.toMatch(/\d/);
    // The sentence may say "your rank"; what it may never do is state one.
    expect(plain).not.toContain('Your rank:');
    expect(plain).not.toContain('Your score:');
    expect(plain).toContain('are out');
    expect(plain).toContain('ready in Nexus');
  });

  it('names the second sitting, without saying where they would have placed on exam day', () => {
    const { plain } = sat({ sitting: 'second' });
    expect(plain).toContain('second sitting');
    expect(plain).not.toMatch(/\d/);
  });

  it('warns before they open a total that can still move', () => {
    expect(sat({ provisional: true }).plain).toContain('still being marked');
    expect(sat({ provisional: false }).plain).not.toContain('still being marked');
  });

  // 28 students on the one real exam hold live windows. Telling them they were
  // marked absent is the thing this must never do.
  it('never uses the absent wording for a student who still has time', () => {
    const { subject, plain } = sat({ hasPaper: false, absent: false, sitting: null });
    expect(subject).not.toContain('absent');
    expect(plain).not.toContain('marked absent');
    expect(plain).toContain('still open');
  });

  it('keeps the absent wording for a genuinely absent student', () => {
    expect(sat({ hasPaper: false, absent: true, sitting: null }).plain).toContain('marked absent');
  });

  it('uses no em dash or double dash in anything a student reads', () => {
    for (const over of [{}, { sitting: 'second' as const, provisional: true }, { hasPaper: false, absent: true, sitting: null }]) {
      const { subject, plain } = sat(over);
      expect(`${subject}\n${plain}`).not.toMatch(/—|--|&mdash;/);
    }
  });
});
