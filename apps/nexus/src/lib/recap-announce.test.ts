import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./nudge-delivery', () => ({
  sendNudge: vi.fn(async () => ({ results: [], counts: {} })),
}));
vi.mock('./teams-sender', () => ({
  senderLookup: vi.fn(() => async (classroomId: string | null) =>
    classroomId ? { sendAs: { senderUserId: `teacher-of-${classroomId}` } } : {},
  ),
}));

import { announcePublishedRecaps } from './recap-announce';
import { sendNudge } from './nudge-delivery';

/**
 * Enough of the Supabase builder for three chains: read the classes, read the
 * open absences, and claim the recap.
 *
 * `claimed` is the set of recap ids whose `students_notified_at` is ALREADY set,
 * which is what an update with `.is(..., null)` in its predicate would match
 * nothing for. A claim that succeeds adds to it, so a second call inside one run
 * behaves like a second run.
 */
function fakeSupabase(opts: {
  classes?: Array<{ id: string; classroom_id: string | null; title: string | null }>;
  absences?: Record<string, string[]>;
  claimed?: Set<string>;
  claimError?: string;
}) {
  const claimed = opts.claimed ?? new Set<string>();
  const updates: string[] = [];

  return {
    claimed,
    updates,
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let isUpdate = false;

      const resolve = () => {
        if (table === 'nexus_scheduled_classes') {
          return { data: opts.classes ?? [], error: null };
        }
        if (table === 'nexus_class_absences') {
          const classId = String(filters.scheduled_class_id);
          const ids = (opts.absences ?? {})[classId] ?? [];
          return { data: ids.map((student_id) => ({ student_id })), error: null };
        }
        if (table === 'nexus_class_recaps' && isUpdate) {
          if (opts.claimError) return { data: null, error: { message: opts.claimError } };
          const id = String(filters.id);
          updates.push(id);
          if (claimed.has(id)) return { data: [], error: null };
          claimed.add(id);
          return { data: [{ id }], error: null };
        }
        return { data: [], error: null };
      };

      const builder: any = {
        select: () => builder,
        update: () => {
          isUpdate = true;
          return builder;
        },
        eq: (col: string, val: unknown) => {
          filters[col] = val;
          return builder;
        },
        is: () => builder,
        in: () => builder,
        then: (res: any) => res(resolve()),
      };
      return builder;
    },
  };
}

const published = (classId: string, recapId: string) => ({
  ok: true as const,
  classId,
  recapId,
  sections: 5,
  questions: 50,
  published: true,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('announcing a published recap', () => {
  it('messages only the students who owe that class', async () => {
    const supabase = fakeSupabase({
      classes: [{ id: 'class-1', classroom_id: 'room-1', title: 'Coordinate Geometry Basics' }],
      absences: { 'class-1': ['stu-1', 'stu-2'] },
    });

    const out = await announcePublishedRecaps(supabase as any, [published('class-1', 'recap-1')]);

    expect(out).toMatchObject({ announced: 1, students: 2, alreadyTold: 0 });
    expect(sendNudge).toHaveBeenCalledOnce();
    const input = vi.mocked(sendNudge).mock.calls[0][0];
    expect(input.studentIds).toEqual(['stu-1', 'stu-2']);
    expect(input.eventType).toBe('recap_ready');
    expect(input.subject).toBe('Your catch-up is ready');
    expect(input.plain).toContain('Coordinate Geometry Basics');
  });

  it('chats as the classroom connected teacher, never as nobody', async () => {
    const supabase = fakeSupabase({
      classes: [{ id: 'class-1', classroom_id: 'room-1', title: 'Shadows' }],
      absences: { 'class-1': ['stu-1'] },
    });

    await announcePublishedRecaps(supabase as any, [published('class-1', 'recap-1')]);

    expect(vi.mocked(sendNudge).mock.calls[0][0].sendAs).toEqual({
      senderUserId: 'teacher-of-room-1',
    });
  });

  it('says nothing twice, however many times the sweep runs', async () => {
    // The sweep runs every fifteen minutes and a repair republishes, so without
    // the claim a student is messaged about the same class all evening.
    const supabase = fakeSupabase({
      classes: [{ id: 'class-1', classroom_id: 'room-1', title: 'Shadows' }],
      absences: { 'class-1': ['stu-1'] },
    });

    const first = await announcePublishedRecaps(supabase as any, [published('class-1', 'recap-1')]);
    const second = await announcePublishedRecaps(supabase as any, [published('class-1', 'recap-1')]);

    expect(first.announced).toBe(1);
    expect(second).toMatchObject({ announced: 0, alreadyTold: 1 });
    expect(sendNudge).toHaveBeenCalledOnce();
  });

  it('claims before it sends, so a crash costs silence rather than a repeat', async () => {
    const supabase = fakeSupabase({
      classes: [{ id: 'class-1', classroom_id: 'room-1', title: 'Shadows' }],
      absences: { 'class-1': ['stu-1'] },
    });
    vi.mocked(sendNudge).mockRejectedValueOnce(new Error('Graph is down'));

    const out = await announcePublishedRecaps(supabase as any, [published('class-1', 'recap-1')]);

    expect(out.errors).toHaveLength(1);
    expect(supabase.claimed.has('recap-1')).toBe(true);
  });

  it('ignores a recap that was held rather than published', async () => {
    const supabase = fakeSupabase({
      classes: [{ id: 'class-1', classroom_id: 'room-1', title: 'Shadows' }],
      absences: { 'class-1': ['stu-1'] },
    });

    const out = await announcePublishedRecaps(supabase as any, [
      { ok: true, classId: 'class-1', recapId: 'recap-1', sections: 4, questions: 8, held: true },
    ]);

    expect(out.announced).toBe(0);
    expect(sendNudge).not.toHaveBeenCalled();
  });

  it('does not spend the claim on a class nobody missed', async () => {
    // Everyone attended. Claiming here would burn the single message this recap
    // gets, so a student enrolled later could never be told about it.
    const supabase = fakeSupabase({
      classes: [{ id: 'class-1', classroom_id: 'room-1', title: 'Shadows' }],
      absences: { 'class-1': [] },
    });

    const out = await announcePublishedRecaps(supabase as any, [published('class-1', 'recap-1')]);

    expect(out.announced).toBe(0);
    expect(supabase.updates).toHaveLength(0);
    expect(sendNudge).not.toHaveBeenCalled();
  });

  it('survives the column not existing yet, without messaging anyone', async () => {
    // The migration lands with the deploy, not before it. A cron that 500s
    // between the two would take attendance down with it.
    const supabase = fakeSupabase({
      classes: [{ id: 'class-1', classroom_id: 'room-1', title: 'Shadows' }],
      absences: { 'class-1': ['stu-1'] },
      claimError: 'column "students_notified_at" does not exist',
    });

    const out = await announcePublishedRecaps(supabase as any, [published('class-1', 'recap-1')]);

    expect(out.announced).toBe(0);
    expect(sendNudge).not.toHaveBeenCalled();
  });

  it('keeps going when one class fails', async () => {
    const supabase = fakeSupabase({
      classes: [
        { id: 'class-1', classroom_id: 'room-1', title: 'One' },
        { id: 'class-2', classroom_id: 'room-1', title: 'Two' },
      ],
      absences: { 'class-1': ['stu-1'], 'class-2': ['stu-2'] },
    });
    vi.mocked(sendNudge).mockRejectedValueOnce(new Error('Graph is down'));

    const out = await announcePublishedRecaps(supabase as any, [
      published('class-1', 'recap-1'),
      published('class-2', 'recap-2'),
    ]);

    expect(out.announced).toBe(1);
    expect(out.errors).toHaveLength(1);
  });

  it('does nothing at all when the run published nothing', async () => {
    const supabase = fakeSupabase({});
    const out = await announcePublishedRecaps(supabase as any, [
      { ok: false, classId: 'class-1', reason: 'rate_limited' },
    ]);

    expect(out).toMatchObject({ announced: 0, students: 0 });
    expect(sendNudge).not.toHaveBeenCalled();
  });
});
