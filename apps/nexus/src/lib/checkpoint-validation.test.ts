import { describe, it, expect } from 'vitest';
import {
  validateCheckpoints,
  hasBlockingIssues,
  findUnpassableCheckpoint,
  timelineSegments,
} from './checkpoint-validation';
import type { EditableQuestion, EditableSection } from './recap-sections';

/**
 * What a teacher has to fix before a checkpoint set can reach students.
 *
 * Two of these are silent today. A question whose text is blank is dropped by
 * the save without a word, so a teacher who half-wrote one loses it. And a
 * checkpoint with no questions saves fine and then can never be passed, which
 * locks every checkpoint after it for every student.
 */

const q = (over: Partial<EditableQuestion> = {}): EditableQuestion => ({
  question_text: 'Why did early settlements grow along rivers?',
  option_a: 'Defence',
  option_b: 'Fertile land',
  option_c: 'Trade winds',
  option_d: 'Mountains',
  correct_option: 'b',
  explanation: '',
  ...over,
});

const s = (start: number, end: number, over: Partial<EditableSection> = {}): EditableSection => ({
  title: 'River valley civilisations',
  description: '',
  start_timestamp_seconds: start,
  end_timestamp_seconds: end,
  min_questions_to_pass: null,
  questions: [q()],
  ...over,
});

const codes = (issues: { code: string }[]) => issues.map((i) => i.code);

describe('validateCheckpoints', () => {
  it('finds nothing wrong with back to back checkpoints inside the video', () => {
    expect(validateCheckpoints([s(0, 924), s(924, 1800)], { durationSeconds: 3758 })).toEqual([]);
  });

  it('refuses an end that is not after its start', () => {
    const [issue] = validateCheckpoints([s(100, 100)]);
    expect(issue).toMatchObject({ code: 'END_NOT_AFTER_START', severity: 'error', sectionIndex: 0 });
  });

  it('refuses a checkpoint with no questions, because nobody could ever pass it', () => {
    const [issue] = validateCheckpoints([s(0, 60, { questions: [] })]);
    expect(issue).toMatchObject({ code: 'NO_QUESTIONS', severity: 'error', sectionIndex: 0 });
  });

  it('names a question of only spaces, which the save would otherwise drop without a word', () => {
    const issues = validateCheckpoints([s(0, 60, { questions: [q({ question_text: '   ' })] })]);
    expect(codes(issues)).toEqual(['BLANK_QUESTION']);
    expect(issues[0]).toMatchObject({ severity: 'error', sectionIndex: 0, questionIndex: 0 });
  });

  it('names an empty option on a question that has text', () => {
    const issues = validateCheckpoints([s(0, 60, { questions: [q({ option_c: ' ' })] })]);
    expect(codes(issues)).toEqual(['BLANK_OPTION']);
    expect(issues[0].message).toContain('Option C');
  });

  it('does not also list the options of a question that has no text yet', () => {
    const issues = validateCheckpoints([
      s(0, 60, { questions: [q({ question_text: '', option_a: '', option_b: '' })] }),
    ]);
    expect(codes(issues)).toEqual(['BLANK_QUESTION']);
  });

  it('numbers checkpoints and questions from one in what it says', () => {
    const issues = validateCheckpoints([
      s(0, 60),
      s(60, 120, { questions: [q(), q({ option_d: '' })] }),
    ]);
    expect(issues[0].message).toContain('question 2');
    expect(issues[0].message).toContain('checkpoint 2');
  });

  it('warns when a checkpoint runs past the end of the video', () => {
    const [issue] = validateCheckpoints([s(3700, 3800)], { durationSeconds: 3758 });
    expect(issue).toMatchObject({ code: 'BEYOND_DURATION', severity: 'warning' });
  });

  it('allows a second of rounding at the end of the video', () => {
    expect(validateCheckpoints([s(3700, 3759)], { durationSeconds: 3758 })).toEqual([]);
  });

  it('does not guess about the end when the video length is unknown', () => {
    expect(validateCheckpoints([s(3700, 99999)], { durationSeconds: null })).toEqual([]);
  });

  it('warns about overlapping checkpoints, whatever order they are listed in', () => {
    const issues = validateCheckpoints([s(600, 1200), s(0, 700)]);
    expect(codes(issues)).toEqual(['OVERLAP']);
    expect(issues[0].severity).toBe('warning');
  });

  it('warns about a stretch of video with no checkpoint, and says how long it is', () => {
    const issues = validateCheckpoints([s(0, 600), s(700, 1200)]);
    expect(codes(issues)).toEqual(['GAP']);
    expect(issues[0].message).toContain('1:40');
  });

  it('lets a gap of a few seconds pass', () => {
    expect(validateCheckpoints([s(0, 600), s(604, 1200)])).toEqual([]);
  });

  it('warns about a checkpoint with no title', () => {
    const issues = validateCheckpoints([s(0, 60, { title: '  ' })]);
    expect(issues[0]).toMatchObject({ code: 'NO_TITLE', severity: 'warning' });
  });
});

describe('hasBlockingIssues', () => {
  it('blocks on an error and not on a warning', () => {
    expect(hasBlockingIssues(validateCheckpoints([s(0, 60, { questions: [] })]))).toBe(true);
    expect(hasBlockingIssues(validateCheckpoints([s(0, 60, { title: '' })]))).toBe(false);
    expect(hasBlockingIssues([])).toBe(false);
  });
});

describe('findUnpassableCheckpoint', () => {
  it('returns the first checkpoint whose questions are all blank', () => {
    expect(
      findUnpassableCheckpoint([s(0, 60), s(60, 120, { questions: [q({ question_text: ' ' })] })]),
    ).toBe(1);
  });

  it('returns -1 when every checkpoint has a real question', () => {
    expect(findUnpassableCheckpoint([s(0, 60), s(60, 120)])).toBe(-1);
  });

  it('treats a missing question list as empty, since the body comes from a client', () => {
    expect(findUnpassableCheckpoint([{ questions: undefined }])).toBe(0);
  });
});

describe('timelineSegments', () => {
  it('lays checkpoints and gaps along the video in time order', () => {
    expect(timelineSegments([s(700, 1200), s(0, 600)], 1500)).toEqual([
      { kind: 'checkpoint', start: 0, end: 600, sectionIndex: 1 },
      { kind: 'gap', start: 600, end: 700 },
      { kind: 'checkpoint', start: 700, end: 1200, sectionIndex: 0 },
    ]);
  });

  it('marks where two checkpoints overlap', () => {
    expect(timelineSegments([s(0, 700), s(600, 1200)], 1500)).toContainEqual({
      kind: 'overlap',
      start: 600,
      end: 700,
    });
  });

  it('clips a checkpoint to the length of the video', () => {
    expect(timelineSegments([s(1400, 1600)], 1500)).toEqual([
      { kind: 'checkpoint', start: 1400, end: 1500, sectionIndex: 0 },
    ]);
  });

  it('leaves out a checkpoint whose times are impossible', () => {
    expect(timelineSegments([s(100, 50)], 1500)).toEqual([]);
  });
});
