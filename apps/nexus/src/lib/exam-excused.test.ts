import { describe, expect, it } from 'vitest';
import type { ExamBucket } from '@neram/database';
import type { EligibilityRosterRow } from './exam-eligibility-roster';
import { describeExcused, excusedReasons, setAsideExcused, summariseExcused } from './exam-excused';

/**
 * Publishing an exam, and the students it was never set for.
 *
 * Found 2026-09-17 on the 18 Aug exam: publishing would have bucketed the five
 * students who enrolled weeks later as `absent`, written them an absent row, and
 * privately told each one "You were marked absent because no attempt was
 * recorded". The eligibility engine already knew they were excused; publishing
 * never asked it.
 */

const eligibility = (student_id: string, bucket: EligibilityRosterRow['bucket'], is_mandatory: boolean) =>
  ({ student_id, bucket, is_mandatory }) as Pick<EligibilityRosterRow, 'student_id' | 'bucket' | 'is_mandatory'>;

const row = (student_id: string, bucket: ExamBucket) => ({ student_id, bucket });

describe('excusedReasons', () => {
  it('names why each non-mandatory student is excused, and nobody else', () => {
    const reasons = excusedReasons([
      eligibility('in-class', 'mandatory_attended', true),
      eligibility('joined', 'excused_new_joiner', false),
      eligibility('catching', 'excused_pending_catchup', false),
      eligibility('by-you', 'teacher_override_excused', false),
      eligibility('required-by-you', 'teacher_override_mandatory', true),
    ]);
    expect(Object.fromEntries(reasons)).toEqual({
      joined: 'new_joiner',
      catching: 'catching_up',
      'by-you': 'by_teacher',
    });
  });
});

describe('setAsideExcused', () => {
  const reasons = excusedReasons([
    eligibility('joined-no-paper', 'excused_new_joiner', false),
    eligibility('joined-sat', 'excused_new_joiner', false),
    eligibility('joined-window', 'excused_new_joiner', false),
    eligibility('really-absent', 'mandatory_attended', true),
  ]);

  const rows = [
    row('on-the-day', 'exam_day'),
    row('joined-no-paper', 'absent'),
    row('joined-sat', 'second_sitting'),
    row('joined-window', 'still_to_sit'),
    row('really-absent', 'absent'),
  ];

  it('takes an excused student with no paper and no open window out of the results', () => {
    const { kept, excused } = setAsideExcused(rows, reasons);
    expect(kept.map((r) => r.student_id)).not.toContain('joined-no-paper');
    expect(excused).toEqual([{ student_id: 'joined-no-paper', reason: 'new_joiner' }]);
  });

  it('never bucketed absent, so they get no absent row and no absent message', () => {
    const { kept } = setAsideExcused(rows, reasons);
    expect(kept.filter((r) => r.bucket === 'absent').map((r) => r.student_id)).toEqual(['really-absent']);
  });

  it('keeps an excused student who sat it, ranked like anyone else', () => {
    const { kept } = setAsideExcused(rows, reasons);
    expect(kept.find((r) => r.student_id === 'joined-sat')?.bucket).toBe('second_sitting');
  });

  it('keeps an excused student who chose a window that is still open', () => {
    const { kept } = setAsideExcused(rows, reasons);
    expect(kept.find((r) => r.student_id === 'joined-window')?.bucket).toBe('still_to_sit');
  });

  /** The spec invariant, restated for a roster that no longer holds the excused. */
  it('leaves every kept student in exactly one of the four buckets, summing to the kept roster', () => {
    const { kept, excused } = setAsideExcused(rows, reasons);
    const counts = kept.reduce<Record<string, number>>((acc, r) => {
      acc[r.bucket] = (acc[r.bucket] ?? 0) + 1;
      return acc;
    }, {});
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(kept.length);
    expect(kept.length + excused.length).toBe(rows.length);
  });
});

describe('describeExcused', () => {
  it('says nothing when nobody is excused', () => {
    expect(describeExcused(summariseExcused([]))).toBeNull();
  });

  it('counts the late joiners in the words the teacher asked for', () => {
    const summary = summariseExcused(
      Array.from({ length: 5 }, (_, i) => ({ student_id: `s${i}`, reason: 'new_joiner' as const })),
    );
    expect(summary).toEqual({ total: 5, new_joiner: 5, catching_up: 0, by_teacher: 0 });
    expect(describeExcused(summary)).toBe('5 joined after the covered classes and are not part of this exam.');
  });

  it('gets one student right', () => {
    expect(describeExcused(summariseExcused([{ student_id: 'a', reason: 'new_joiner' }]))).toBe(
      '1 joined after the covered classes and is not part of this exam.',
    );
  });

  it('names each reason when there is more than one', () => {
    const line = describeExcused(
      summariseExcused([
        { student_id: 'a', reason: 'new_joiner' },
        { student_id: 'b', reason: 'new_joiner' },
        { student_id: 'c', reason: 'catching_up' },
        { student_id: 'd', reason: 'by_teacher' },
      ]),
    );
    expect(line).toBe(
      '4 are not part of this exam: 2 joined after the covered classes, 1 is still catching up, 1 excused by you.',
    );
    expect(line).not.toMatch(/—|–|--/);
  });
});
