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

describe('buildStudentResultMessage', () => {
  it('tells an exam day student their rank plainly', () => {
    const { plain } = buildStudentResultMessage({
      examTitle: 'HOA Test',
      row: ranked(),
      totalSat: 16,
      provisional: false,
      passingPct: 40,
      sitting: 'main',
    });
    expect(plain).toContain('Your rank: 3rd of 16');
    expect(plain).not.toContain('second sitting');
  });

  it('names the second sitting, and counts only that sitting', () => {
    const { plain } = buildStudentResultMessage({
      examTitle: 'HOA Test',
      row: ranked({ sitting: 'second', bucket: 'second_sitting', rank: 2, sitting_size: 9 }),
      totalSat: 9,
      provisional: false,
      passingPct: 40,
      sitting: 'second',
    });
    expect(plain).toContain('second sitting');
    expect(plain).toContain('Your rank: 2nd of 9 in the second sitting');
  });

  // 28 students on the one real exam hold live windows. Telling them they were
  // marked absent is the thing this must never do.
  it('never uses the absent wording for a student who still has time', () => {
    const { subject, plain } = buildStudentResultMessage({
      examTitle: 'HOA Test',
      row: ranked({ attempt_id: null, absent: false, bucket: 'still_to_sit', sitting: null, rank: null, sitting_size: 0 }),
      totalSat: 16,
      provisional: false,
      passingPct: 40,
      sitting: null,
    });
    expect(subject).not.toContain('absent');
    expect(plain).not.toContain('marked absent');
    expect(plain).toContain('still open');
  });

  it('keeps the absent wording for a genuinely absent student', () => {
    const { plain } = buildStudentResultMessage({
      examTitle: 'HOA Test',
      row: ranked({ attempt_id: null, absent: true, bucket: 'absent', sitting: null, rank: null, sitting_size: 0 }),
      totalSat: 16,
      provisional: false,
      passingPct: 40,
      sitting: null,
    });
    expect(plain).toContain('marked absent');
  });

  it('uses no em dash or double dash in anything a student reads', () => {
    const { subject, plain } = buildStudentResultMessage({
      examTitle: 'HOA Test',
      row: ranked({ sitting: 'second', bucket: 'second_sitting', rank: 2, sitting_size: 9 }),
      totalSat: 9,
      provisional: true,
      passingPct: 40,
      sitting: 'second',
    });
    expect(`${subject}\n${plain}`).not.toMatch(/—|--|&mdash;/);
  });
});
