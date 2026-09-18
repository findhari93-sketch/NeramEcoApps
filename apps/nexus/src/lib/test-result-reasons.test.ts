import { describe, expect, it } from 'vitest';
import { pickRunReasons, requestNotesByStudent } from './test-result-reasons';

/**
 * What a student said about a run they did not sit, as the teacher's row reads it.
 *
 * Two storage shapes meet here. "Tell your teacher why" writes a skip reason
 * against the placement; an older reason written against the paper alone has a
 * null placement_id. The run's own reason wins, the paper's is the fallback, and
 * a reason about a DIFFERENT run of the same paper is never shown on this one.
 */

const RUN = 'run-exam';

const skip = (over: Record<string, unknown>) => ({
  student_id: 's1',
  placement_id: RUN,
  reason_code: 'did_not_know',
  reason_note: null,
  updated_at: '2026-09-17T10:00:00Z',
  ...over,
});

describe('pickRunReasons', () => {
  it('reads the reason given for this run, in missed-test wording', () => {
    const out = pickRunReasons([skip({})], RUN);
    const why = out.get('s1')!;
    expect(why.code).toBe('did_not_know');
    expect(why.short_label).toBe("Didn't know");
    expect(why.label).toBe('I did not know the test was open');
    expect(why.for_this_run).toBe(true);
  });

  it('falls back to a reason given against the paper alone', () => {
    const out = pickRunReasons([skip({ placement_id: null, reason_code: 'unwell' })], RUN);
    expect(out.get('s1')!.short_label).toBe('Unwell');
    expect(out.get('s1')!.for_this_run).toBe(false);
  });

  it("prefers this run's reason over the paper's, whichever is newer", () => {
    const out = pickRunReasons(
      [
        skip({ placement_id: null, reason_code: 'unwell', updated_at: '2026-09-18T10:00:00Z' }),
        skip({ reason_code: 'no_time', updated_at: '2026-09-17T10:00:00Z' }),
      ],
      RUN,
    );
    expect(out.get('s1')!.code).toBe('no_time');
  });

  it('never shows a reason about a different run of the same paper', () => {
    const out = pickRunReasons([skip({ placement_id: 'run-practice' })], RUN);
    expect(out.has('s1')).toBe(false);
  });

  it('keeps the note, trimmed, and drops an empty one', () => {
    const out = pickRunReasons(
      [
        skip({ reason_code: 'technical_problem', reason_note: '  Submit spun for ten minutes  ' }),
        skip({ student_id: 's2', reason_note: '   ' }),
      ],
      RUN,
    );
    expect(out.get('s1')!.note).toBe('Submit spun for ten minutes');
    expect(out.get('s2')!.note).toBeNull();
  });

  it('skips a row whose code the app no longer knows, rather than inventing a label', () => {
    const out = pickRunReasons([skip({ reason_code: 'from_the_future' })], RUN);
    expect(out.has('s1')).toBe(false);
  });
});

describe('requestNotesByStudent', () => {
  it('keeps what a student wrote when they asked to be let back in', () => {
    const notes = requestNotesByStudent([
      { student_id: 's1', status: 'pending', student_note: ' My phone broke on the day ' },
      { student_id: 's2', status: 'granted', student_note: null },
      { student_id: 's3', status: 'granted', student_note: '   ' },
    ]);
    expect(notes).toEqual({ s1: 'My phone broke on the day' });
  });
});
