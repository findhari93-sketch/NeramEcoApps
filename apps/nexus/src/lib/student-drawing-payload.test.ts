import { describe, it, expect } from 'vitest';
import {
  buildStudentRubric,
  heldIdsFrom,
  isHeldEvaluation,
  isReleasedForStudent,
  sanitizeDrawingForStudent,
  withholdUnreleasedReview,
} from './student-drawing-payload';
import { criteriaForBrief } from './drawing-rubric';

const REGION = { id: 'r1', x: 0.1, y: 0.2, width: 0.3, height: 0.2, comment: 'Vanishing lines drift' };

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    student_id: 'u1',
    assignment_id: 'a1',
    question_id: null,
    thread_id: 't1',
    source_type: 'assignment',
    original_image_url: 'https://x/orig.jpg',
    thumbnail_url: 'https://x/thumb.jpg',
    self_note: 'My first try',
    status: 'submitted',
    attempt_number: 1,
    submitted_at: '2026-09-10T10:00:00Z',
    reviewed_at: '2026-09-11T10:00:00Z',
    tutor_rating: 3,
    tutor_marks: null,
    tutor_feedback: 'SECRET DRAFT',
    tutor_resources: [{ title: 'Perspective', url: 'https://y' }],
    reaction: 'clap',
    reviewed_image_url: 'https://x/marks.jpg',
    corrected_image_url: 'https://x/corrected.jpg',
    ai_overlay_annotations: [REGION],
    ai_feedback: { grade: 'B', feedback: ['model says'] },
    ai_corrected_image_prompt: 'prompt',
    ai_annotation_prompt: 'prompt',
    ai_reference_prompts: { beginner: 'a', medium: 'b', expert: 'c' },
    ai_draft_status: 'ready',
    is_gallery_visible: true,
    alumni_featured: false,
    a_column_added_next_year: 'private',
    ...overrides,
  };
}

describe('isHeldEvaluation', () => {
  it('is held with an intent and no release', () => {
    expect(isHeldEvaluation({ intent: 'complete', released_at: null })).toBe(true);
  });
  it('is not held once released, or without an intent', () => {
    expect(isHeldEvaluation({ intent: 'complete', released_at: '2026-09-12T00:00:00Z' })).toBe(false);
    expect(isHeldEvaluation({ intent: null, released_at: null })).toBe(false);
  });
});

describe('isReleasedForStudent', () => {
  it.each(['reviewed', 'completed', 'redo'])('%s is released when not held', (status) => {
    expect(isReleasedForStudent({ id: 's1', status }, new Set())).toBe(true);
  });
  it.each(['submitted', 'under_review'])('%s is never released', (status) => {
    expect(isReleasedForStudent({ id: 's1', status }, new Set())).toBe(false);
  });
  it('a re-held review is not released even though its status says completed', () => {
    const held = heldIdsFrom([{ id: 'e1', submission_id: 's1', intent: 'complete', released_at: null }]);
    expect(isReleasedForStudent({ id: 's1', status: 'completed' }, held)).toBe(false);
  });
});

describe('sanitizeDrawingForStudent', () => {
  it('drops columns it does not know, model prompts and curation flags', () => {
    const out = sanitizeDrawingForStudent(row({ status: 'completed' }), new Set()) as unknown as Record<string, unknown>;
    for (const key of [
      'a_column_added_next_year', 'ai_feedback', 'ai_corrected_image_prompt', 'ai_annotation_prompt',
      'ai_reference_prompts', 'ai_draft_status', 'is_gallery_visible', 'alumni_featured',
      'thread_id', 'student_id', 'question_id', 'source_type',
    ]) {
      expect(out).not.toHaveProperty(key);
    }
  });

  it.each(['submitted', 'under_review'])('hides the whole review while %s', (status) => {
    const out = sanitizeDrawingForStudent(row({ status }), new Set());
    expect(out.released).toBe(false);
    expect(out.tutor_feedback).toBeNull();
    expect(out.tutor_rating).toBeNull();
    expect(out.reaction).toBeNull();
    expect(out.reviewed_image_url).toBeNull();
    expect(out.corrected_image_url).toBeNull();
    expect(out.ai_overlay_annotations).toBeNull();
    expect(out.reviewed_at).toBeNull();
    expect(out.tutor_resources).toEqual([]);
    // Their own work is always there.
    expect(out.original_image_url).toBe('https://x/orig.jpg');
    expect(out.self_note).toBe('My first try');
  });

  it.each(['reviewed', 'completed', 'redo'])('shows the review once %s', (status) => {
    const out = sanitizeDrawingForStudent(row({ status }), new Set());
    expect(out.released).toBe(true);
    expect(out.review_updating).toBe(false);
    expect(out.tutor_feedback).toBe('SECRET DRAFT');
    expect(out.ai_overlay_annotations).toEqual([REGION]);
    expect(out.tutor_resources).toHaveLength(1);
  });

  it('marks a review the teacher took back as updating, and hides it', () => {
    const out = sanitizeDrawingForStudent(row({ status: 'completed' }), new Set(['s1']));
    expect(out.released).toBe(false);
    expect(out.review_updating).toBe(true);
    expect(out.tutor_feedback).toBeNull();
  });
});

describe('withholdUnreleasedReview', () => {
  it('keeps joins and legacy ai_feedback but nulls an unsent review', () => {
    const out = withholdUnreleasedReview({ ...row(), question: { id: 'q1' } }, new Set()) as Record<string, unknown>;
    expect(out.question).toEqual({ id: 'q1' });
    expect(out.ai_feedback).toBeDefined();
    expect(out.tutor_feedback).toBeNull();
    expect(out.ai_overlay_annotations).toBeNull();
    expect(out).not.toHaveProperty('ai_annotation_prompt');
    expect(out).not.toHaveProperty('is_gallery_visible');
  });

  it('leaves a handed-back review alone', () => {
    const out = withholdUnreleasedReview(row({ status: 'reviewed' }), new Set()) as Record<string, unknown>;
    expect(out.tutor_feedback).toBe('SECRET DRAFT');
  });
});

describe('buildStudentRubric', () => {
  const criteria = criteriaForBrief('3d_composition.still_life');

  it('returns only final bands for released attempts, and nothing else', () => {
    const rubric = buildStudentRubric(
      criteria,
      {
        s1: { composition: 4, proportion: 2, not_a_criterion: 5 as any },
        s2: { composition: 5 },
      },
      new Set(['s1']),
    );
    expect(rubric).not.toBeNull();
    expect(Object.keys(rubric!.by_submission)).toEqual(['s1']);
    expect(Object.keys(rubric!.by_submission.s1).sort()).toEqual(['bands', 'overall']);
    expect(rubric!.by_submission.s1.bands).toEqual({ composition: 4, proportion: 2 });
    expect(rubric!.by_submission.s1.overall).toBe(3);
    expect(rubric!.criteria.map((c) => c.key)).toContain('depth_perspective');
    expect(Object.keys(rubric!.criteria[0]).sort()).toEqual(['hint', 'key', 'title']);
  });

  it('ignores out-of-range bands and returns null when nothing is left', () => {
    expect(buildStudentRubric(criteria, { s1: { composition: 9 as any } }, new Set(['s1']))).toBeNull();
    expect(buildStudentRubric(criteria, {}, new Set(['s1']))).toBeNull();
  });
});
