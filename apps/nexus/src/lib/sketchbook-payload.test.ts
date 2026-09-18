import { describe, expect, it, vi } from 'vitest';

vi.mock('@neram/database', () => ({ getSupabaseAdminClient: () => ({}) }));
vi.mock('@neram/database/queries/nexus', () => ({}));
vi.mock('@/lib/drawing-activity-store', () => ({}));
vi.mock('@/lib/student-drawing-payload-server', () => ({ loadManualEvaluations: async () => [] }));

import { canDeleteOwnSketch, entryFor } from './sketchbook-payload';

const row = (over: Record<string, unknown>) =>
  ({
    id: 'd1', student_id: 's1', original_image_url: 'https://x/d1.jpg', thumbnail_url: null, self_note: null,
    reaction: null, submitted_at: '2026-09-15T14:45:00Z', is_gallery_visible: true, source_type: 'sketchbook',
    status: 'completed', assignment_id: null, question_id: null, reviewed_at: null, tutor_rating: null,
    tutor_marks: null, inspiration_item_id: null, assignment: null, ...over,
  }) as any;

describe('entryFor', () => {
  it('hides an assignment review the teacher has not handed back', () => {
    const e = entryFor(row({ source_type: 'assignment', assignment_id: 'a1', status: 'submitted', tutor_rating: 5, reaction: 'star' }), 'student', new Set(), null, []);
    expect(e.tutor_rating).toBeNull();
    expect(e.reaction).toBeNull();
    expect(e.review).toEqual({ state: 'waiting', rating: null, marks: null });
    expect(e.kind).toBe('assignment');
  });

  it('hides a held review even when the status already reads completed', () => {
    const e = entryFor(row({ source_type: 'assignment', assignment_id: 'a1', status: 'completed', tutor_rating: 4, reviewed_at: '2026-09-16T10:00:00Z' }), 'student', new Set(['d1']), null, []);
    expect(e.tutor_rating).toBeNull();
    expect(e.review.state).toBe('waiting');
  });

  it('shows the student a reviewed sketch with its stars', () => {
    const e = entryFor(row({ reviewed_at: '2026-09-16T10:00:00Z', tutor_rating: 4 }), 'student', new Set(), null, []);
    expect(e.review).toEqual({ state: 'reviewed', rating: 4, marks: null });
    expect(e.is_gallery_visible).toBe(false);
  });

  it('shows staff everything, and still says an unfinished assignment is waiting', () => {
    const e = entryFor(row({ source_type: 'assignment', assignment_id: 'a1', status: 'submitted', tutor_rating: 5 }), 'staff', new Set(), null, []);
    expect(e.tutor_rating).toBe(5);
    expect(e.review.state).toBe('waiting');
  });
});

describe('canDeleteOwnSketch', () => {
  it('lets a student delete a plain unreviewed sketch', () => {
    const e = entryFor(row({}), 'student', new Set(), null, []);
    expect(canDeleteOwnSketch(e)).toBe(true);
  });

  it('keeps a reviewed sketch, even one the student cannot yet see the review of', () => {
    const e = entryFor(row({ reviewed_at: '2026-09-16T10:00:00Z', tutor_rating: 4 }), 'student', new Set(), null, []);
    expect(canDeleteOwnSketch(e)).toBe(false);
  });

  it('keeps a sketch a class is showing', () => {
    const e = entryFor(row({}), 'student', new Set(), null, [{ classroom_id: 'c1', classroom_name: 'Class 1', featured_at: '2026-09-16T10:00:00Z' }]);
    expect(canDeleteOwnSketch(e)).toBe(false);
  });

  it('never offers delete for an assignment drawing, even unreviewed', () => {
    const e = entryFor(row({ source_type: 'assignment', assignment_id: 'a1', status: 'submitted' }), 'student', new Set(), null, []);
    expect(canDeleteOwnSketch(e)).toBe(false);
  });
});
