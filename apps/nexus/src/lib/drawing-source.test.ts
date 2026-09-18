import { describe, expect, it } from 'vitest';
import {
  PRACTICE_SOURCES,
  canRedo,
  drawingSourceLabel,
  isPracticeDrawing,
  opensForGrading,
  reviewKindOf,
  reviewStateWords,
  summarizeReview,
  wasReviewedBefore,
} from './drawing-source';

describe('reviewKindOf', () => {
  it('treats a test drawing as a test even if it carries no assignment', () => {
    expect(reviewKindOf({ source_type: 'exam', assignment_id: null })).toBe('test');
  });
  it('treats anything with an assignment as owed assignment work', () => {
    expect(reviewKindOf({ source_type: 'assignment', assignment_id: 'a1' })).toBe('assignment');
  });
  it('treats sketches, question bank, free practice and homework as practice', () => {
    for (const source of ['sketchbook', 'question_bank', 'free_practice', 'homework']) {
      expect(isPracticeDrawing({ source_type: source, assignment_id: null })).toBe(true);
    }
    expect([...PRACTICE_SOURCES].sort()).toEqual(['free_practice', 'homework', 'question_bank', 'sketchbook']);
  });
});

describe('drawingSourceLabel', () => {
  it('names every source in plain words', () => {
    expect(drawingSourceLabel('sketchbook')).toBe('Sketch');
    expect(drawingSourceLabel('question_bank')).toBe('Question bank');
    expect(drawingSourceLabel('free_practice')).toBe('Practice');
    expect(drawingSourceLabel('homework')).toBe('Homework');
    expect(drawingSourceLabel('assignment')).toBe('Assignment');
    expect(drawingSourceLabel('exam')).toBe('Test');
    expect(drawingSourceLabel(null)).toBe('Drawing');
  });
});

describe('wasReviewedBefore', () => {
  it('does not read a fresh sketch as reviewed, even though it is stored completed', () => {
    expect(wasReviewedBefore({ source_type: 'sketchbook', status: 'completed', reviewed_at: null })).toBe(false);
  });
  it('reads a sketch with a review time as reviewed', () => {
    expect(wasReviewedBefore({ source_type: 'sketchbook', status: 'completed', reviewed_at: '2026-09-16T10:00:00Z' })).toBe(true);
  });
  it('reads a completed or redo assignment round as reviewed', () => {
    expect(wasReviewedBefore({ source_type: 'assignment', assignment_id: 'a', status: 'completed' })).toBe(true);
    expect(wasReviewedBefore({ source_type: 'assignment', assignment_id: 'a', status: 'redo' })).toBe(true);
  });
  it('reads a submitted round as not reviewed', () => {
    expect(wasReviewedBefore({ source_type: 'assignment', assignment_id: 'a', status: 'submitted' })).toBe(false);
  });
});

describe('opensForGrading', () => {
  it('opens a sketch nobody has reviewed ready to grade', () => {
    expect(opensForGrading({ source_type: 'sketchbook', status: 'completed', reviewed_at: null }, false)).toBe(true);
  });
  it('locks a sketch that already has a review', () => {
    expect(opensForGrading({ source_type: 'sketchbook', status: 'completed', reviewed_at: '2026-09-16T10:00:00Z' }, false)).toBe(false);
  });
  it('keeps the assignment rule: submitted and redo open, completed locks, a newer attempt locks', () => {
    expect(opensForGrading({ source_type: 'assignment', assignment_id: 'a', status: 'submitted' }, false)).toBe(true);
    expect(opensForGrading({ source_type: 'assignment', assignment_id: 'a', status: 'redo' }, false)).toBe(true);
    expect(opensForGrading({ source_type: 'assignment', assignment_id: 'a', status: 'completed' }, false)).toBe(false);
    expect(opensForGrading({ source_type: 'assignment', assignment_id: 'a', status: 'submitted' }, true)).toBe(false);
  });
});

describe('canRedo', () => {
  it('offers no redo for a sketch or a test drawing', () => {
    expect(canRedo({ source_type: 'sketchbook' })).toBe(false);
    expect(canRedo({ source_type: 'exam' })).toBe(false);
  });
  it('keeps redo for assignments and question bank practice', () => {
    expect(canRedo({ source_type: 'assignment', assignment_id: 'a' })).toBe(true);
    expect(canRedo({ source_type: 'question_bank' })).toBe(true);
  });
});

describe('summarizeReview', () => {
  const reviewedSketch = { source_type: 'sketchbook', status: 'completed', reviewed_at: '2026-09-16T10:00:00Z', tutor_rating: 4, tutor_marks: null };
  it('shows the rating of a released review', () => {
    expect(summarizeReview(reviewedSketch, true)).toEqual({ state: 'reviewed', rating: 4, marks: null });
  });
  it('says waiting for owed work that is not released, and shows nothing of it', () => {
    const held = { source_type: 'assignment', assignment_id: 'a', status: 'submitted', reviewed_at: null, tutor_rating: 5 };
    expect(summarizeReview(held, false)).toEqual({ state: 'waiting', rating: null, marks: null });
  });
  it('says none for practice nobody reviewed', () => {
    expect(summarizeReview({ source_type: 'sketchbook', status: 'completed', reviewed_at: null }, true)).toEqual({ state: 'none', rating: null, marks: null });
  });
  it('says redo and hides the grade for a redo round', () => {
    expect(summarizeReview({ source_type: 'question_bank', status: 'redo', reviewed_at: '2026-09-16T10:00:00Z', tutor_rating: 2 }, true)).toEqual({ state: 'redo', rating: null, marks: null });
  });
});

describe('reviewStateWords', () => {
  it('names stars, marks, waiting and redo in plain words', () => {
    expect(reviewStateWords({ state: 'reviewed', rating: 4, marks: null }, { maxMarks: null, viewer: 'own' })).toBe('reviewed, 4 stars');
    expect(reviewStateWords({ state: 'reviewed', rating: null, marks: 7 }, { maxMarks: 10, viewer: 'own' })).toBe('reviewed, 7 of 10 marks');
    expect(reviewStateWords({ state: 'reviewed', rating: null, marks: null }, { maxMarks: null, viewer: 'own' })).toBe('reviewed');
    expect(reviewStateWords({ state: 'waiting', rating: null, marks: null }, { maxMarks: null, viewer: 'own' })).toBe('waiting for your teacher');
    expect(reviewStateWords({ state: 'waiting', rating: null, marks: null }, { maxMarks: null, viewer: 'teacher' })).toBe('waiting for review');
    expect(reviewStateWords({ state: 'redo', rating: null, marks: null }, { maxMarks: null, viewer: 'own' })).toBe('redo asked');
    expect(reviewStateWords({ state: 'none', rating: null, marks: null }, { maxMarks: null, viewer: 'own' })).toBeNull();
  });
});
