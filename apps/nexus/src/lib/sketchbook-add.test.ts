// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDrawingSubmission: vi.fn(),
  getInspirationItem: vi.fn(),
  getStudentPrimaryClassroom: vi.fn(),
  recordGamificationEvent: vi.fn(),
  upsertPracticeDay: vi.fn(),
  loadStudentRhythm: vi.fn(),
  update: vi.fn(),
  del: vi.fn(),
}));

vi.mock('@neram/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@neram/database')>()),
  getSupabaseAdminClient: () => ({
    from: () => ({
      update: (patch: unknown) => ({ eq: async () => mocks.update(patch) }),
      delete: () => ({ eq: async () => mocks.del() }),
    }),
  }),
}));
vi.mock('@neram/database/queries/nexus', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@neram/database/queries/nexus')>()),
  createDrawingSubmission: mocks.createDrawingSubmission,
  getInspirationItem: mocks.getInspirationItem,
  getStudentPrimaryClassroom: mocks.getStudentPrimaryClassroom,
  recordGamificationEvent: mocks.recordGamificationEvent,
  upsertPracticeDay: mocks.upsertPracticeDay,
}));
vi.mock('@/lib/sketchbook-payload', () => ({ loadStudentRhythm: mocks.loadStudentRhythm }));

import { addSketchForStudent, CAPTION_MAX } from './sketchbook-add';

const student = { id: 's1', user_type: 'student' };
const ok = { original_image_url: 'https://cdn.test/a.jpg', thumbnail_url: 'https://cdn.test/t.jpg', caption: 'Perspective study' };

beforeEach(() => {
  mocks.createDrawingSubmission.mockReset().mockResolvedValue({ id: 'sub1', submitted_at: '2026-10-03T12:00:00Z' });
  mocks.update.mockReset().mockResolvedValue({ error: null });
  mocks.del.mockReset().mockResolvedValue({ error: null });
  mocks.upsertPracticeDay.mockReset().mockResolvedValue({ isNewDay: true });
  mocks.getStudentPrimaryClassroom.mockReset().mockResolvedValue({ id: 'c1', batch_id: 'b1' });
  mocks.recordGamificationEvent.mockReset().mockResolvedValue(undefined);
  mocks.loadStudentRhythm.mockReset().mockResolvedValue({ rhythm: { week: { count: 1, goal: 3 } }, timeZone: 'Asia/Kolkata' });
  mocks.getInspirationItem.mockReset();
});

describe('addSketchForStudent', () => {
  it('refuses a non-student with 403 and a non-https image with 400', async () => {
    await expect(addSketchForStudent({ id: 't1', user_type: 'teacher' }, ok)).rejects.toMatchObject({ status: 403 });
    await expect(addSketchForStudent(student, { ...ok, original_image_url: 'http://x' })).rejects.toMatchObject({ status: 400 });
    expect(mocks.createDrawingSubmission).not.toHaveBeenCalled();
  });

  it('creates the sketch, finishes it as completed, and awards the first sketch of the day', async () => {
    const out = await addSketchForStudent(student, ok);
    expect(mocks.createDrawingSubmission).toHaveBeenCalledWith({ student_id: 's1', source_type: 'sketchbook', original_image_url: ok.original_image_url, self_note: 'Perspective study' });
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed', thumbnail_url: ok.thumbnail_url, thread_id: 'sub1' }));
    expect(mocks.recordGamificationEvent).toHaveBeenCalledTimes(1);
    expect(out).toMatchObject({ isNewDay: true, sketch: { id: 'sub1', status: 'completed' } });
  });

  it('truncates a long caption and skips the award on a repeat day', async () => {
    mocks.upsertPracticeDay.mockResolvedValue({ isNewDay: false });
    await addSketchForStudent(student, { ...ok, caption: 'x'.repeat(200) });
    expect(mocks.createDrawingSubmission.mock.calls[0][0].self_note).toHaveLength(CAPTION_MAX);
    expect(mocks.recordGamificationEvent).not.toHaveBeenCalled();
  });

  it('deletes the orphan when finishing the row fails', async () => {
    mocks.update.mockResolvedValueOnce({ error: { message: 'boom' } });
    await expect(addSketchForStudent(student, ok)).rejects.toBeTruthy();
    expect(mocks.del).toHaveBeenCalledTimes(1);
  });

  it('refuses an inspiration item the student cannot see', async () => {
    mocks.getInspirationItem.mockResolvedValue({ item: null });
    await expect(addSketchForStudent(student, { ...ok, inspiration_item_id: '11111111-1111-4111-8111-111111111111' })).rejects.toMatchObject({ status: 400 });
  });
});
