import { describe, expect, it } from 'vitest';
import {
  faceFromCounts,
  hasEngaged,
  isPaperComplete,
  paperKey,
  paperTitles,
  summariseAttempts,
} from './qb-papers';
import type { QBPaperFaceStates } from '../../types';

/**
 * The pure rules behind a paper's three faces.
 *
 * Everything here decides something a student or a teacher then reads as fact:
 * which questions belong to a paper, whether a face is done, whether a retake
 * counts. All four have a wrong answer that looks right, and two of them shipped
 * with one during development, so they are worth pinning.
 */

const faces = (
  read: QBPaperFaceStates['read'],
  practice: QBPaperFaceStates['practice'],
  test: QBPaperFaceStates['test'],
): QBPaperFaceStates => ({ read, practice, test });

describe('paperKey', () => {
  it('treats a null session as the empty string, matching the database', () => {
    // Both nexus_qb_original_papers and nexus_qb_question_sources key on
    // COALESCE(session,''), so these two rows ARE the same paper. Splitting them
    // in TypeScript would halve a paper's question count with no error anywhere.
    const withNull = paperKey({ exam_type: 'NATA', year: 2025, session: null, shift: null });
    const withEmpty = paperKey({ exam_type: 'NATA', year: 2025, session: '', shift: '' });
    expect(withNull).toBe(withEmpty);
  });

  it('separates two shifts of the same session', () => {
    const fn = paperKey({ exam_type: 'NATA', year: 2025, session: 'april-9', shift: 'forenoon' });
    const an = paperKey({ exam_type: 'NATA', year: 2025, session: 'april-9', shift: 'afternoon' });
    expect(fn).not.toBe(an);
  });

  it('separates the same year across exams', () => {
    expect(paperKey({ exam_type: 'NATA', year: 2025, session: null, shift: null })).not.toBe(
      paperKey({ exam_type: 'JEE_PAPER_2', year: 2025, session: null, shift: null }),
    );
  });
});

describe('paperTitles', () => {
  it('names the exam in the long title and drops it from the short one', () => {
    const t = paperTitles({ exam_type: 'NATA', year: 2025, session: 'april-9', shift: 'forenoon' });
    expect(t.title).toBe('NATA 2025 April-9 (Forenoon)');
    // The grid puts short_title under a heading that already says NATA.
    expect(t.short_title).toBe('2025 April-9 (Forenoon)');
  });

  it('omits the parts a paper does not have', () => {
    expect(paperTitles({ exam_type: 'NATA', year: 2024, session: null, shift: null })).toEqual({
      title: 'NATA 2024',
      short_title: '2024',
    });
  });
});

describe('faceFromCounts', () => {
  it('reports unavailable when staff never provided the face, whatever the counts say', () => {
    // 'unavailable' outranks 'done'. A card hides an unavailable face, and a
    // face marked done that nobody can open would render a tick on nothing.
    expect(faceFromCounts(false, true, true)).toBe('unavailable');
  });

  it('distinguishes untouched from started from finished', () => {
    expect(faceFromCounts(true, false, false)).toBe('available');
    expect(faceFromCounts(true, true, false)).toBe('in_progress');
    expect(faceFromCounts(true, true, true)).toBe('done');
  });
});

describe('hasEngaged', () => {
  it('does not count an unavailable face as engagement', () => {
    // The bug this pins. Written as `!== 'available'`, a paper with no PDF made
    // every student in the cohort look touched, because their read face was
    // unavailable for a reason that had nothing to do with them.
    expect(hasEngaged(faces('unavailable', 'available', 'available'))).toBe(false);
    expect(hasEngaged(faces('unavailable', 'unavailable', 'available'))).toBe(false);
  });

  it('counts a face the student actually started or finished', () => {
    expect(hasEngaged(faces('unavailable', 'in_progress', 'available'))).toBe(true);
    expect(hasEngaged(faces('done', 'available', 'available'))).toBe(true);
  });
});

describe('isPaperComplete', () => {
  it('ignores the faces staff never provided', () => {
    // A paper with no PDF is complete once its questions and test are done.
    expect(isPaperComplete(faces('unavailable', 'done', 'done'))).toBe(true);
  });

  it('refuses to call a paper offering nothing complete', () => {
    // Vacuous truth would count an empty paper toward "papers completed".
    expect(isPaperComplete(faces('unavailable', 'unavailable', 'unavailable'))).toBe(false);
  });

  it('is false while any provided face is outstanding', () => {
    expect(isPaperComplete(faces('done', 'in_progress', 'done'))).toBe(false);
    expect(isPaperComplete(faces('done', 'done', 'available'))).toBe(false);
  });
});

describe('summariseAttempts', () => {
  const submitted = (percentage: number, mode: string | null = null) => ({
    percentage,
    status: 'submitted',
    mode,
  });

  it('ignores revision retakes entirely', () => {
    // mode='revision' exists so practice after the scored sitting stays off the
    // record. Counting a weak retake would let a student LOWER their best score
    // by practising, which is the opposite of the intent.
    const out = summariseAttempts([submitted(80), submitted(40, 'revision')], 60);
    expect(out.best_pct).toBe(80);
    expect(out.attempts).toBe(1);
    expect(out.passed).toBe(true);
  });

  it('treats a null mode as official, for rows written before revision existed', () => {
    expect(summariseAttempts([submitted(70, null)], 60).attempts).toBe(1);
  });

  it('ignores attempts still in progress and abandoned ones', () => {
    const out = summariseAttempts(
      [
        { percentage: 99, status: 'in_progress', mode: null },
        { percentage: 10, status: 'abandoned', mode: null },
        submitted(55),
      ],
      60,
    );
    expect(out.attempts).toBe(1);
    expect(out.best_pct).toBe(55);
    expect(out.passed).toBe(false);
  });

  it('keeps the best of several official sittings, not the latest', () => {
    expect(summariseAttempts([submitted(90), submitted(30)], 60).best_pct).toBe(90);
  });

  it('reads a null passing mark as no bar, matching resolvePassingPct', () => {
    // The engine treats a placement with no passing_pct as passed. Anything else
    // here would show a tick on the paper that the grader disagrees with.
    expect(summariseAttempts([submitted(1)], null).passed).toBe(true);
  });

  it('has not passed when nothing has been submitted', () => {
    const out = summariseAttempts([], 60);
    expect(out).toEqual({ attempts: 0, best_pct: null, passed: false });
  });

  it('passes on exactly the passing mark', () => {
    expect(summariseAttempts([submitted(60)], 60).passed).toBe(true);
    expect(summariseAttempts([submitted(59)], 60).passed).toBe(false);
  });
});
