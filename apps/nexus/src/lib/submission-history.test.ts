import { describe, it, expect } from 'vitest';
import {
  drawingRoundOpensForGrading,
  attemptStatusLabel,
  isAwaitingReReview,
  drawingAttemptsToViews,
} from './submission-history';
import type { DrawingSubmission } from '@neram/database/types';

type DrawingStatus = DrawingSubmission['status'];

function drawing(
  over: Partial<DrawingSubmission> & { id: string; submitted_at: string; status: DrawingStatus },
) {
  return {
    tutor_marks: null,
    tutor_rating: null,
    tutor_feedback: null,
    reaction: null,
    reviewed_at: null,
    original_image_url: 'https://example.test/a.jpg',
    reviewed_image_url: null,
    corrected_image_url: null,
    ai_overlay_annotations: null,
    ...over,
  } as unknown as DrawingSubmission;
}

describe('drawingRoundOpensForGrading', () => {
  it('opens a pending round ready to grade', () => {
    expect(drawingRoundOpensForGrading('submitted', false)).toBe(true);
    expect(drawingRoundOpensForGrading('under_review', false)).toBe(true);
  });

  // The bug this guards: a 'redo' round used to be bucketed with 'completed',
  // so the teacher landed on a screen with no way to evaluate or complete it.
  it('opens a redo round ready to grade while it is still the latest attempt', () => {
    expect(drawingRoundOpensForGrading('redo', false)).toBe(true);
  });

  it('locks a finished round', () => {
    expect(drawingRoundOpensForGrading('reviewed', false)).toBe(false);
    expect(drawingRoundOpensForGrading('completed', false)).toBe(false);
  });

  it('locks any round the student has already superseded', () => {
    expect(drawingRoundOpensForGrading('submitted', true)).toBe(false);
    expect(drawingRoundOpensForGrading('redo', true)).toBe(false);
    expect(drawingRoundOpensForGrading('completed', true)).toBe(false);
  });
});

describe('attemptStatusLabel', () => {
  it('labels every drawing round status', () => {
    expect(attemptStatusLabel('submitted')).toBe('Submitted');
    expect(attemptStatusLabel('under_review')).toBe('Under review');
    expect(attemptStatusLabel('redo')).toBe('Redo requested');
    expect(attemptStatusLabel('reviewed')).toBe('Reviewed');
    expect(attemptStatusLabel('completed')).toBe('Completed');
  });

  it('falls back to the raw status it does not know', () => {
    expect(attemptStatusLabel('archived')).toBe('archived');
  });
});

describe('drawingAttemptsToViews', () => {
  const rows = [
    drawing({ id: 'b', submitted_at: '2026-07-22T15:07:24Z', status: 'redo' }),
    drawing({ id: 'a', submitted_at: '2026-07-22T15:06:43Z', status: 'submitted' }),
  ];

  it('orders oldest first and numbers by order, not by stored attempt_number', () => {
    const views = drawingAttemptsToViews(rows, { evaluationType: 'stars', maxMarks: 5 });
    expect(views.map((v) => v.key)).toEqual(['a', 'b']);
    expect(views.map((v) => v.index)).toEqual([1, 2]);
  });

  it('marks only the newest round as latest, so the timeline can key off it', () => {
    const views = drawingAttemptsToViews(rows, { evaluationType: 'stars', maxMarks: 5 });
    expect(views.map((v) => v.isLatest)).toEqual([false, true]);
  });

  it('keys each view by its submission id so the teacher can navigate to that round', () => {
    const views = drawingAttemptsToViews(rows, { evaluationType: 'stars', maxMarks: 5 });
    expect(views.map((v) => v.drawing?.submissionId)).toEqual(['a', 'b']);
    expect(views.every((v) => v.key === v.drawing?.submissionId)).toBe(true);
  });
});

describe('isAwaitingReReview', () => {
  const views = (statuses: DrawingStatus[]) =>
    drawingAttemptsToViews(
      statuses.map((status, i) =>
        drawing({ id: `s${i}`, submitted_at: `2026-07-22T15:0${i}:00Z`, status }),
      ),
      { evaluationType: 'stars', maxMarks: 5 },
    );

  it('is false for a single attempt', () => {
    expect(isAwaitingReReview(views(['submitted']))).toBe(false);
  });

  it('is true when the newest round is a resubmission still waiting', () => {
    expect(isAwaitingReReview(views(['redo', 'submitted']))).toBe(true);
  });

  it('is false when the newest round was sent back again', () => {
    expect(isAwaitingReReview(views(['redo', 'redo']))).toBe(false);
  });
});
