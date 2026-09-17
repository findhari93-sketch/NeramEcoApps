// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { toCsv } from '@/lib/csv-export';
import {
  REPORT_CSV_HEADERS,
  promptOutcome,
  reportCsvRows,
  reportErrorMessage,
  reportFilename,
  reportTotals,
  scorePercent,
  type ReportPrompt,
  type ReportStudent,
  type SessionReport,
} from './report';

function prompt(overrides: Partial<ReportPrompt> = {}): ReportPrompt {
  return {
    id: 'p1',
    sequence: 1,
    label: null,
    answer_type: 'mcq',
    option_count: 4,
    state: 'revealed',
    ungraded: false,
    correct_keys: ['B'],
    opened_at: '2026-09-10T14:00:00Z',
    closed_at: '2026-09-10T14:01:00Z',
    revealed_at: '2026-09-10T14:02:00Z',
    counts: { enrolled: 3, answered: 2, silent: 1, absent: 0, correct: 1, incorrect: 1, answered_off_roster: 0 },
    ...overrides,
  };
}

function student(name: string, overrides: Partial<ReportStudent> = {}): ReportStudent {
  return {
    student_id: `id-${name}`,
    name,
    on_roster: true,
    answered: 0,
    silent: 0,
    absent: 0,
    correct: 0,
    wrong: 0,
    skipped: 0,
    total_graded: 0,
    ...overrides,
  };
}

function report(overrides: Partial<SessionReport> = {}): SessionReport {
  return {
    ok: true,
    session: {
      id: 's1',
      status: 'ended',
      classroom_id: 'c1',
      classroom_name: 'NATA Evening Batch',
      scheduled_class_id: null,
      // 20:30 in India on the 10th, still the 10th in UTC too.
      created_at: '2026-09-10T15:00:00Z',
      ended_at: '2026-09-10T16:00:00Z',
      enrolled: 3,
    },
    prompts: [],
    students: [],
    ...overrides,
  };
}

describe('scorePercent', () => {
  it('shows correct out of graded, rounded, and nothing before anything is graded', () => {
    expect(scorePercent({ correct: 3, total_graded: 4 })).toBe('75%');
    expect(scorePercent({ correct: 2, total_graded: 3 })).toBe('67%');
    expect(scorePercent({ correct: 0, total_graded: 2 })).toBe('0%');
    expect(scorePercent({ correct: 0, total_graded: 0 })).toBe('');
  });
});

describe('promptOutcome', () => {
  it('names the key, a poll, or why there is no key', () => {
    expect(promptOutcome(prompt())).toBe('B');
    expect(promptOutcome(prompt({ correct_keys: ['A', 'C'] }))).toBe('A or C');
    expect(promptOutcome(prompt({ ungraded: true, correct_keys: null }))).toBe('Poll');
    expect(promptOutcome(prompt({ state: 'closed', correct_keys: null }))).toBe('Not revealed');
    expect(promptOutcome(prompt({ state: 'open', correct_keys: null }))).toBe('Still open');
    expect(promptOutcome(prompt({ answer_type: 'yesno', correct_keys: ['no'] }))).toBe('No');
  });
});

describe('reportTotals', () => {
  it('counts graded questions, polls and questions never revealed', () => {
    const totals = reportTotals(
      report({
        prompts: [
          prompt({ id: 'p1' }),
          prompt({ id: 'p2', sequence: 2, ungraded: true, correct_keys: null }),
          prompt({ id: 'p3', sequence: 3, state: 'closed', ungraded: true, correct_keys: null }),
          prompt({ id: 'p4', sequence: 4, state: 'open', correct_keys: null, counts: null }),
        ],
      }),
    );
    expect(totals).toMatchObject({ asked: 4, graded: 1, polls: 1, unrevealed: 2 });
  });

  it('scores the class list only: someone off the list does not move the class score', () => {
    const totals = reportTotals(
      report({
        students: [
          student('Asha', { correct: 3, total_graded: 4 }),
          student('Bala', { correct: 1, total_graded: 4 }),
          student('Visitor', { on_roster: false, correct: 0, total_graded: 4 }),
        ],
      }),
    );
    expect(totals.classScore).toBe('50%');
    expect(reportTotals(report()).classScore).toBe('');
  });
});

describe('CSV', () => {
  it('has one row per student in the header order, with the same score as the screen', () => {
    const rows = reportCsvRows(
      report({
        students: [
          student('Asha', { answered: 4, correct: 3, wrong: 1, total_graded: 4 }),
          student('Chitra', { silent: 2, absent: 2, skipped: 2, total_graded: 2 }),
          { ...student('x'), name: null, on_roster: false, answered: 1, wrong: 1, total_graded: 1 },
        ],
      }),
    );
    expect(rows).toEqual([
      ['Asha', 'Yes', 4, 0, 0, 3, 1, 0, 4, '75%'],
      ['Chitra', 'Yes', 0, 2, 2, 0, 0, 2, 2, '0%'],
      ['Unnamed student', 'No', 1, 0, 0, 0, 1, 0, 1, '0%'],
    ]);
    expect(rows.every((row) => row.length === REPORT_CSV_HEADERS.length)).toBe(true);
  });

  it('keeps a comma in a name inside its column and defuses a formula', () => {
    const csv = toCsv(REPORT_CSV_HEADERS, reportCsvRows(report({ students: [student('Kumar, R.'), student('=HYPERLINK("x")')] })));
    const [, first, second] = csv.split('\n');
    expect(first.startsWith('"Kumar, R.",Yes,')).toBe(true);
    expect(second.startsWith('"\t=HYPERLINK(""x"")",Yes,')).toBe(true);
  });

  it('names the file after the class and its date in India', () => {
    expect(reportFilename(report())).toBe('answer-pad-nata-evening-batch-2026-09-10.csv');
    // 00:30 in India on the 11th is still the 10th in UTC.
    expect(reportFilename(report({ session: { ...report().session, created_at: '2026-09-10T19:00:00Z' } }))).toBe(
      'answer-pad-nata-evening-batch-2026-09-11.csv',
    );
    expect(reportFilename(report({ session: { ...report().session, classroom_name: null } }))).toBe('answer-pad-class-2026-09-10.csv');
  });
});

describe('reportErrorMessage', () => {
  it('explains each refusal in plain words', () => {
    expect(reportErrorMessage(403, 'NOT_SESSION_TEACHER')).toBe('Only the teacher who ran this class can see its report.');
    expect(reportErrorMessage(404, 'NOT_FOUND')).toBe('This Answer Pad session could not be found.');
    expect(reportErrorMessage(401, null)).toBe('Your sign in has expired. Reload the page to sign in again.');
    expect(reportErrorMessage(500, null)).toBe('The report could not load. Please try again.');
  });
});
