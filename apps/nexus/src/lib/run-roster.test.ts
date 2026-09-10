import { describe, it, expect } from 'vitest';
import { narrowToRoster, resolveRunClassroom, resolveRunRoster } from './run-roster';

/**
 * A stub that answers the two tables this module reads, and shouts if anything
 * asks for a third. The point of these tests is that context_id is read as the
 * right KIND of id, which a live database would answer with a silent empty.
 */
function stubSupabase(opts: {
  classOf?: Record<string, string>;
  enrolments?: Record<string, string[]>;
  onSelect?: (table: string, column: string, value: string) => void;
}) {
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const builder: any = {
        select() {
          return builder;
        },
        eq(column: string, value: unknown) {
          filters[column] = value;
          return builder;
        },
        maybeSingle() {
          opts.onSelect?.(table, 'id', String(filters.id));
          if (table !== 'nexus_scheduled_classes') throw new Error(`unexpected table ${table}`);
          const classroomId = opts.classOf?.[String(filters.id)];
          return Promise.resolve({ data: classroomId ? { classroom_id: classroomId } : null });
        },
        then(resolve: (v: unknown) => void) {
          opts.onSelect?.(table, 'classroom_id', String(filters.classroom_id));
          if (table !== 'nexus_enrollments') throw new Error(`unexpected table ${table}`);
          const ids = opts.enrolments?.[String(filters.classroom_id)] || [];
          return Promise.resolve(
            resolve({ data: ids.map((user_id) => ({ user_id })) }),
          );
        },
      };
      return builder;
    },
  };
}

describe('resolveRunClassroom', () => {
  it('reads a classroom-anchored context_id as a classroom id, with no lookup', async () => {
    let touched = false;
    const supabase = stubSupabase({ onSelect: () => (touched = true) });
    const got = await resolveRunClassroom(
      { context_type: 'classroom_assignment', context_id: 'classroom-1' },
      supabase,
    );
    expect(got).toBe('classroom-1');
    expect(touched).toBe(false);
  });

  it('treats student_practice the same way', async () => {
    const supabase = stubSupabase({});
    expect(
      await resolveRunClassroom(
        { context_type: 'student_practice', context_id: 'classroom-9' },
        supabase,
      ),
    ).toBe('classroom-9');
  });

  it('reads a class-anchored context_id as a SCHEDULED CLASS, then finds its classroom', async () => {
    const supabase = stubSupabase({ classOf: { 'class-7': 'classroom-3' } });
    expect(
      await resolveRunClassroom({ context_type: 'exam', context_id: 'class-7' }, supabase),
    ).toBe('classroom-3');
  });

  it('covers every class-anchored context, not just exam', async () => {
    const supabase = stubSupabase({ classOf: { 'class-7': 'classroom-3' } });
    for (const contextType of ['class_test', 'class_prep_test', 'catchup_class']) {
      expect(
        await resolveRunClassroom({ context_type: contextType, context_id: 'class-7' }, supabase),
      ).toBe('classroom-3');
    }
  });

  it('returns null for a context that has no roster', async () => {
    const supabase = stubSupabase({});
    expect(
      await resolveRunClassroom({ context_type: 'study_file', context_id: 'file-1' }, supabase),
    ).toBeNull();
    expect(
      await resolveRunClassroom(
        { context_type: 'class_recap_section', context_id: 'section-1' },
        supabase,
      ),
    ).toBeNull();
  });

  it('returns null when the scheduled class is gone', async () => {
    const supabase = stubSupabase({ classOf: {} });
    expect(
      await resolveRunClassroom({ context_type: 'exam', context_id: 'class-missing' }, supabase),
    ).toBeNull();
  });

  it('returns null for a placement with no context_id at all', async () => {
    const supabase = stubSupabase({});
    expect(
      await resolveRunClassroom({ context_type: 'exam', context_id: null }, supabase),
    ).toBeNull();
  });
});

describe('resolveRunRoster', () => {
  it('returns the active student ids of the run classroom', async () => {
    const supabase = stubSupabase({
      classOf: { 'class-7': 'classroom-3' },
      enrolments: { 'classroom-3': ['u1', 'u2', 'u3'] },
    });
    const roster = await resolveRunRoster(
      { context_type: 'exam', context_id: 'class-7' },
      supabase,
    );
    expect(roster).not.toBeNull();
    expect([...(roster as Set<string>)].sort()).toEqual(['u1', 'u2', 'u3']);
  });

  it('returns null, not an empty set, when the run has no roster', async () => {
    const supabase = stubSupabase({});
    // Null is the load-bearing distinction: an empty set reads as "reached
    // nobody", and the caller should refuse the action instead.
    expect(
      await resolveRunRoster({ context_type: 'study_file', context_id: 'file-1' }, supabase),
    ).toBeNull();
  });

  it('returns an empty set for a real but unenrolled classroom', async () => {
    const supabase = stubSupabase({ enrolments: {} });
    const roster = await resolveRunRoster(
      { context_type: 'classroom_assignment', context_id: 'classroom-empty' },
      supabase,
    );
    expect(roster).toEqual(new Set());
  });
});

describe('narrowToRoster', () => {
  it('drops ids that are not on the roster', () => {
    expect(narrowToRoster(['u1', 'stranger', 'u2'], new Set(['u1', 'u2']))).toEqual(['u1', 'u2']);
  });

  it('keeps the order the teacher selected them in', () => {
    expect(narrowToRoster(['u3', 'u1', 'u2'], new Set(['u1', 'u2', 'u3']))).toEqual([
      'u3',
      'u1',
      'u2',
    ]);
  });

  it('collapses a duplicated id, so nobody is messaged twice', () => {
    expect(narrowToRoster(['u1', 'u1', 'u2'], new Set(['u1', 'u2']))).toEqual(['u1', 'u2']);
  });

  it('narrows to nothing rather than falling back to the whole roster', () => {
    expect(narrowToRoster(['stranger'], new Set(['u1']))).toEqual([]);
  });
});
