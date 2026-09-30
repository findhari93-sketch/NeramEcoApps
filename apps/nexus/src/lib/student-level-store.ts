import { getSupabaseAdminClient } from '@neram/database';
import { ApiError } from '@/lib/api-errors';
import { isLevelKey, type LevelKey, type LevelSource, type SkillKey } from '@/lib/student-level';

/**
 * Reads and writes nexus_student_skill_levels and its event log. Server only:
 * both tables are service-role only, and a level never reaches a student or a
 * parent payload.
 */

export interface SkillLevelDetail {
  level: LevelKey;
  note: string | null;
  setAt: string;
  setBy: { id: string; name: string | null } | null;
}

export interface SkillLevelEvent {
  id: string;
  skill: string;
  fromLevel: LevelKey | null;
  toLevel: LevelKey | null;
  note: string | null;
  source: string;
  createdAt: string;
  by: { id: string; name: string | null } | null;
}

const db = () => getSupabaseAdminClient() as any;

function levelOrNull(value: unknown): LevelKey | null {
  return isLevelKey(value) ? value : null;
}

/** The target must be an actively enrolled student, so staff never get a level. */
export async function assertIsEnrolledStudent(studentId: string): Promise<void> {
  const { data, error } = await db()
    .from('nexus_enrollments')
    .select('id')
    .eq('user_id', studentId)
    .eq('role', 'student')
    .eq('is_active', true)
    .limit(1);
  if (error) throw error;
  if (!data || data.length === 0) throw new ApiError('That person is not an enrolled student.', 404);
}

/**
 * Sets (or clears, with null) one skill level and logs the change.
 *
 * Returns the previous level so the client's Undo can send it straight back.
 * Writing the same level again is a no-op with no event, so a double tap does
 * not fill the history with copies.
 */
export async function writeSkillLevel(args: {
  studentId: string;
  skill: SkillKey;
  level: LevelKey | null;
  note: string | null;
  source: LevelSource;
  performedBy: string;
}): Promise<{ level: LevelKey | null; previous: LevelKey | null; changed: boolean }> {
  const supabase = db();
  const { data: current, error: readError } = await supabase
    .from('nexus_student_skill_levels')
    .select('level, note')
    .eq('student_id', args.studentId)
    .eq('skill', args.skill)
    .maybeSingle();
  if (readError) throw readError;

  const previous = levelOrNull(current?.level);
  const sameNote = (current?.note ?? null) === args.note;
  if (previous === args.level && (args.level === null || sameNote)) {
    return { level: args.level, previous, changed: false };
  }

  if (args.level === null) {
    const { error } = await supabase
      .from('nexus_student_skill_levels')
      .delete()
      .eq('student_id', args.studentId)
      .eq('skill', args.skill);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('nexus_student_skill_levels').upsert(
      {
        student_id: args.studentId,
        skill: args.skill,
        level: args.level,
        note: args.note,
        set_by: args.performedBy,
        set_at: new Date().toISOString(),
      },
      { onConflict: 'student_id,skill' },
    );
    if (error) throw error;
  }

  // The history is for people, not for correctness: a failed event write is
  // logged and the level change still stands.
  const { error: eventError } = await supabase.from('nexus_student_skill_level_events').insert({
    student_id: args.studentId,
    skill: args.skill,
    from_level: previous,
    to_level: args.level,
    note: args.note,
    source: args.source,
    performed_by: args.performedBy,
  });
  if (eventError) console.error('[skill-level] event insert failed', eventError.message);

  return { level: args.level, previous, changed: true };
}

async function namesFor(ids: string[]): Promise<Map<string, string | null>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, string | null>();
  if (unique.length === 0) return map;
  const { data, error } = await db().from('users').select('id, name').in('id', unique);
  if (error) throw error;
  for (const u of (data ?? []) as { id: string; name: string | null }[]) map.set(u.id, u.name);
  return map;
}

/** One student's levels with who set them, and their last `historyLimit` changes. */
export async function loadStudentLevelDetail(
  studentId: string,
  historyLimit: number,
): Promise<{ levels: Partial<Record<SkillKey, SkillLevelDetail>>; history: SkillLevelEvent[] }> {
  const supabase = db();
  const [levelsRes, eventsRes] = await Promise.all([
    supabase.from('nexus_student_skill_levels').select('skill, level, note, set_at, set_by').eq('student_id', studentId),
    supabase
      .from('nexus_student_skill_level_events')
      .select('id, skill, from_level, to_level, note, source, created_at, performed_by')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(historyLimit),
  ]);
  if (levelsRes.error) throw levelsRes.error;
  if (eventsRes.error) throw eventsRes.error;

  const levelRows = (levelsRes.data ?? []) as {
    skill: SkillKey;
    level: string;
    note: string | null;
    set_at: string;
    set_by: string | null;
  }[];
  const eventRows = (eventsRes.data ?? []) as {
    id: string;
    skill: string;
    from_level: string | null;
    to_level: string | null;
    note: string | null;
    source: string;
    created_at: string;
    performed_by: string | null;
  }[];

  const names = await namesFor([
    ...levelRows.map((r) => r.set_by ?? ''),
    ...eventRows.map((r) => r.performed_by ?? ''),
  ]);
  const who = (id: string | null) => (id ? { id, name: names.get(id) ?? null } : null);

  const levels: Partial<Record<SkillKey, SkillLevelDetail>> = {};
  for (const row of levelRows) {
    const level = levelOrNull(row.level);
    if (!level) continue;
    levels[row.skill] = { level, note: row.note, setAt: row.set_at, setBy: who(row.set_by) };
  }

  const history = eventRows.map((row) => ({
    id: row.id,
    skill: row.skill,
    fromLevel: levelOrNull(row.from_level),
    toLevel: levelOrNull(row.to_level),
    note: row.note,
    source: row.source,
    createdAt: row.created_at,
    by: who(row.performed_by),
  }));

  return { levels, history };
}

/** Drawing levels for many students at once, with when they were set. */
export async function loadDrawingLevels(
  studentIds: readonly string[],
): Promise<Map<string, { level: LevelKey; setAt: string }>> {
  const map = new Map<string, { level: LevelKey; setAt: string }>();
  if (studentIds.length === 0) return map;
  const { data, error } = await db()
    .from('nexus_student_skill_levels')
    .select('student_id, level, set_at')
    .eq('skill', 'drawing')
    .in('student_id', studentIds as string[]);
  if (error) throw error;
  for (const row of (data ?? []) as { student_id: string; level: string; set_at: string }[]) {
    const level = levelOrNull(row.level);
    if (level) map.set(row.student_id, { level, setAt: row.set_at });
  }
  return map;
}
