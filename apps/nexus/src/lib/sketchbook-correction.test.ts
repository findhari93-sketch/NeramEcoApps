import { describe, it, expect } from 'vitest';
import {
  correctionUpdate,
  retryStatus,
  retryLine,
  canCorrect,
  type RetryFacts,
} from './sketchbook-correction';

const TODAY = '2026-09-20';

function facts(overrides: Partial<RetryFacts> = {}): RetryFacts {
  return { retry_asked_at: null, retry_due_on: null, hasLaterAttempt: false, ...overrides };
}

describe('retryStatus', () => {
  it('is none when no teacher has asked', () => {
    expect(retryStatus(facts(), TODAY)).toBe('none');
  });

  it('is open once asked, with a date still ahead', () => {
    expect(retryStatus(facts({ retry_asked_at: '2026-09-18T10:00:00Z', retry_due_on: '2026-09-25' }), TODAY)).toBe('open');
  });

  it('is still open on the day it is due, not overdue', () => {
    expect(retryStatus(facts({ retry_asked_at: '2026-09-18T10:00:00Z', retry_due_on: TODAY }), TODAY)).toBe('open');
  });

  it('is overdue the day after the date passes', () => {
    expect(retryStatus(facts({ retry_asked_at: '2026-09-10T10:00:00Z', retry_due_on: '2026-09-19' }), TODAY)).toBe('overdue');
  });

  it('is open for ever when the teacher set no date', () => {
    expect(retryStatus(facts({ retry_asked_at: '2026-01-01T10:00:00Z' }), TODAY)).toBe('open');
  });

  it('is answered once a later attempt lands, even past the date', () => {
    expect(retryStatus(facts({ retry_asked_at: '2026-09-10T10:00:00Z', retry_due_on: '2026-09-19', hasLaterAttempt: true }), TODAY)).toBe('answered');
  });
});

describe('retryLine', () => {
  it('names the day so a student does not have to work out a date', () => {
    expect(retryLine('2026-09-25', TODAY)).toBe('Try this again by Friday 25 September');
  });

  it('says it plainly when the date has passed', () => {
    expect(retryLine('2026-09-19', TODAY)).toBe('This was due Saturday 19 September');
  });

  it('asks without a deadline when the teacher set no date', () => {
    expect(retryLine(null, TODAY)).toBe('Try this one again when you can');
  });

  it('never uses an em dash or a double dash', () => {
    for (const due of ['2026-09-25', '2026-09-19', null]) {
      const line = retryLine(due, TODAY);
      expect(line).not.toMatch(/\u2014|--|&mdash;/);
    }
  });
});

describe('correctionUpdate', () => {
  it('writes the note, the overlay and when it was sent', () => {
    const update = correctionUpdate({ note: 'Watch the ellipses', overlayUrl: 'https://x/marks.jpg', now: '2026-09-20T10:00:00Z' });
    expect(update.tutor_feedback).toBe('Watch the ellipses');
    expect(update.reviewed_image_url).toBe('https://x/marks.jpg');
    expect(update.reviewed_at).toBe('2026-09-20T10:00:00Z');
  });

  it('never writes a grade, because a sketch is not marked', () => {
    const update = correctionUpdate({ note: 'x', overlayUrl: null, now: '2026-09-20T10:00:00Z' }) as Record<string, unknown>;
    expect('tutor_rating' in update).toBe(false);
    expect('tutor_marks' in update).toBe(false);
  });

  it('never writes corrected_image_url, which would publish the correction to the whole school', () => {
    // nexus_inspiration_sync_submission turns any submission with a
    // corrected_image_url into a visible Inspiration reference item.
    const update = correctionUpdate({ note: 'x', overlayUrl: 'https://x/marks.jpg', now: '2026-09-20T10:00:00Z' }) as Record<string, unknown>;
    expect('corrected_image_url' in update).toBe(false);
  });

  it('leaves status alone, since a sketch is stored completed from upload', () => {
    const update = correctionUpdate({ note: 'x', overlayUrl: null, now: '2026-09-20T10:00:00Z' }) as Record<string, unknown>;
    expect('status' in update).toBe(false);
  });

  it('omits the note when the teacher only drew on it', () => {
    const update = correctionUpdate({ note: '   ', overlayUrl: 'https://x/marks.jpg', now: '2026-09-20T10:00:00Z' }) as Record<string, unknown>;
    expect('tutor_feedback' in update).toBe(false);
  });
});

describe('canCorrect', () => {
  it('allows a sketch', () => {
    expect(canCorrect({ source_type: 'sketchbook', assignment_id: null }, false)).toEqual({ ok: true });
  });

  it('sends an assignment drawing to the review screen, where it is marked', () => {
    expect(canCorrect({ source_type: 'assignment', assignment_id: 'a1' }, false).ok).toBe(false);
  });

  it('refuses a test drawing', () => {
    expect(canCorrect({ source_type: 'exam', assignment_id: null }, false).ok).toBe(false);
  });

  it('refuses a graduated student, who can no longer sign in to read it', () => {
    expect(canCorrect({ source_type: 'sketchbook', assignment_id: null }, true)).toEqual({
      ok: false,
      reason: expect.stringContaining('graduated'),
    });
  });
});
