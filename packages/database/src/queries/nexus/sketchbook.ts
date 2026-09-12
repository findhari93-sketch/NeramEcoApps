// @ts-nocheck: sketchbook tables land in the generated types after the migration is applied; regenerate with pnpm supabase:gen:types
import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import type { SketchbookReaction, NexusSketchbookFeature } from '../../types';

/**
 * Sketchbook data access. Every function here is service-role; the routes
 * decide who may call what. Nothing in this file knows about weeks or goals,
 * that is apps/nexus/src/lib/sketchbook-rhythm.ts.
 */

export interface SketchbookSketchRow {
  id: string;
  student_id: string;
  original_image_url: string;
  thumbnail_url: string | null;
  self_note: string | null;
  reaction: SketchbookReaction | null;
  submitted_at: string;
  is_gallery_visible: boolean;
}

export interface SketchbookInboxRow extends SketchbookSketchRow {
  student: { id: string; name: string | null; avatar_url: string | null; ms_oid: string | null };
}

export interface SketchbookFeatureFact {
  classroom_id: string;
  classroom_name: string;
  featured_at: string;
}

const SKETCH_COLUMNS =
  'id, student_id, original_image_url, thumbnail_url, self_note, reaction, submitted_at, is_gallery_visible';

/** IST bounds for a YYYY-MM month, as ISO strings PostgREST compares correctly. */
export function monthRangeIst(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    from: `${y}-${pad(m)}-01T00:00:00+05:30`,
    to: `${nextY}-${pad(nextM)}-01T00:00:00+05:30`,
  };
}

export async function listSketchbookMonth(
  studentId: string,
  month: string,
  client?: TypedSupabaseClient,
): Promise<SketchbookSketchRow[]> {
  const supabase = client || getSupabaseAdminClient();
  const { from, to } = monthRangeIst(month);
  const { data, error } = await supabase
    .from('drawing_submissions')
    .select(SKETCH_COLUMNS)
    .eq('student_id', studentId)
    .eq('source_type', 'sketchbook')
    .gte('submitted_at', from)
    .lt('submitted_at', to)
    .order('submitted_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function countSketches(studentId: string, client?: TypedSupabaseClient): Promise<number> {
  const supabase = client || getSupabaseAdminClient();
  const { count, error } = await supabase
    .from('drawing_submissions')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', studentId)
    .eq('source_type', 'sketchbook');
  if (error) throw error;
  return count ?? 0;
}

export async function firstAndLatestSketch(
  studentId: string,
  client?: TypedSupabaseClient,
): Promise<{ first: SketchbookSketchRow; latest: SketchbookSketchRow } | null> {
  const supabase = client || getSupabaseAdminClient();
  const base = () =>
    supabase.from('drawing_submissions').select(SKETCH_COLUMNS).eq('student_id', studentId).eq('source_type', 'sketchbook');
  const [{ data: first }, { data: latest }] = await Promise.all([
    base().order('submitted_at', { ascending: true }).limit(1).maybeSingle(),
    base().order('submitted_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!first || !latest) return null;
  return { first, latest };
}

export async function getSketchbookSketch(
  id: string,
  client?: TypedSupabaseClient,
): Promise<SketchbookSketchRow | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('drawing_submissions')
    .select(SKETCH_COLUMNS)
    .eq('id', id)
    .eq('source_type', 'sketchbook')
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ── Practice days ────────────────────────────────────────────────────────────

export async function listPracticeDates(studentId: string, client?: TypedSupabaseClient): Promise<string[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_sketchbook_practice_days')
    .select('practice_date')
    .eq('student_id', studentId)
    .order('practice_date', { ascending: true });
  if (error) throw error;
  return (data || []).map((r) => r.practice_date);
}

export async function upsertPracticeDay(
  studentId: string,
  practiceDate: string,
  submissionId: string,
  client?: TypedSupabaseClient,
): Promise<{ isNewDay: boolean }> {
  const supabase = client || getSupabaseAdminClient();
  const { data: existing } = await supabase
    .from('nexus_sketchbook_practice_days')
    .select('sketch_count')
    .eq('student_id', studentId)
    .eq('practice_date', practiceDate)
    .maybeSingle();
  if (!existing) {
    const { error } = await supabase
      .from('nexus_sketchbook_practice_days')
      .insert({ student_id: studentId, practice_date: practiceDate, sketch_count: 1, first_submission_id: submissionId });
    if (error) throw error;
    return { isNewDay: true };
  }
  const { error } = await supabase
    .from('nexus_sketchbook_practice_days')
    .update({ sketch_count: existing.sketch_count + 1 })
    .eq('student_id', studentId)
    .eq('practice_date', practiceDate);
  if (error) throw error;
  return { isNewDay: false };
}

/**
 * Recount one practice day from the sketches that still exist. `istDateOf`
 * is injected so this file never decides what "a day" is.
 */
export async function repairPracticeDay(
  studentId: string,
  practiceDate: string,
  istDateOf: (iso: string) => string,
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const { data: rows, error } = await supabase
    .from('drawing_submissions')
    .select('id, submitted_at')
    .eq('student_id', studentId)
    .eq('source_type', 'sketchbook')
    .order('submitted_at', { ascending: true });
  if (error) throw error;
  const sameDay = (rows || []).filter((r) => istDateOf(r.submitted_at) === practiceDate);
  if (sameDay.length === 0) {
    await supabase.from('nexus_sketchbook_practice_days').delete().eq('student_id', studentId).eq('practice_date', practiceDate);
    return;
  }
  await supabase
    .from('nexus_sketchbook_practice_days')
    .upsert(
      { student_id: studentId, practice_date: practiceDate, sketch_count: sameDay.length, first_submission_id: sameDay[0].id },
      { onConflict: 'student_id,practice_date' },
    );
}

// ── Goal ─────────────────────────────────────────────────────────────────────

export async function getSketchbookGoalHistory(
  classroomId: string,
  client?: TypedSupabaseClient,
): Promise<{ effectiveFrom: string; goal: number }[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_sketchbook_goal_history')
    .select('effective_from, goal')
    .eq('classroom_id', classroomId)
    .order('effective_from', { ascending: true });
  if (error) throw error;
  return (data || []).map((r) => ({ effectiveFrom: r.effective_from, goal: r.goal }));
}

export async function setSketchbookWeeklyGoal(
  classroomId: string,
  goal: number,
  setBy: string,
  effectiveFrom: string,
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const { error: a } = await supabase.from('nexus_classrooms').update({ sketchbook_weekly_goal: goal }).eq('id', classroomId);
  if (a) throw a;
  const { error: b } = await supabase
    .from('nexus_sketchbook_goal_history')
    .insert({ classroom_id: classroomId, goal, effective_from: effectiveFrom, set_by: setBy });
  if (b) throw b;
}

// ── Classrooms and membership ────────────────────────────────────────────────

/** The classroom of the student's newest active enrolment: the same "newest wins" rule as stage facts. */
export async function getStudentPrimaryClassroom(
  studentId: string,
  client?: TypedSupabaseClient,
): Promise<{ id: string; name: string; sketchbook_weekly_goal: number; batch_id: string | null } | null> {
  const supabase = client || getSupabaseAdminClient();
  // nexus_enrollments has exactly one FK to nexus_classrooms (classroom_id), so
  // the relationship is unambiguous and needs no !hint.
  const { data, error } = await supabase
    .from('nexus_enrollments')
    .select('batch_id, enrolled_at, classroom:nexus_classrooms(id, name, sketchbook_weekly_goal, is_active)')
    .eq('user_id', studentId)
    .eq('role', 'student')
    .eq('is_active', true)
    .order('enrolled_at', { ascending: false });
  if (error) throw error;
  const live = (data || []).find((r) => r.classroom?.is_active);
  if (!live) return null;
  return {
    id: live.classroom.id,
    name: live.classroom.name,
    sketchbook_weekly_goal: live.classroom.sketchbook_weekly_goal ?? 3,
    batch_id: live.batch_id ?? null,
  };
}

export async function listUserClassroomIds(
  userId: string,
  role: 'student' | 'teacher',
  client?: TypedSupabaseClient,
): Promise<string[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_enrollments')
    .select('classroom_id')
    .eq('user_id', userId)
    .eq('role', role)
    .eq('is_active', true);
  if (error) throw error;
  return (data || []).map((r) => r.classroom_id);
}

export async function usersShareClassroom(
  staffId: string,
  studentId: string,
  client?: TypedSupabaseClient,
): Promise<boolean> {
  const [mine, theirs] = await Promise.all([
    listUserClassroomIds(staffId, 'teacher', client),
    listUserClassroomIds(studentId, 'student', client),
  ]);
  const set = new Set(mine);
  return theirs.some((id) => set.has(id));
}

// ── Flips ────────────────────────────────────────────────────────────────────

export async function listUnflipped(
  teacherId: string,
  studentIds: string[],
  limit: number,
  client?: TypedSupabaseClient,
): Promise<{ rows: SketchbookInboxRow[]; remaining: number }> {
  const supabase = client || getSupabaseAdminClient();
  if (studentIds.length === 0) return { rows: [], remaining: 0 };
  const { data: flips } = await supabase
    .from('nexus_sketchbook_flips')
    .select('submission_id')
    .eq('teacher_id', teacherId);
  const flipped = (flips || []).map((f) => f.submission_id);

  // drawing_submissions has exactly one FK to users (student_id), so the
  // relationship is unambiguous and needs no !hint.
  let query = supabase
    .from('drawing_submissions')
    .select(`${SKETCH_COLUMNS}, student:users(id, name, avatar_url, ms_oid)`, { count: 'exact' })
    .eq('source_type', 'sketchbook')
    .in('student_id', studentIds)
    .order('submitted_at', { ascending: false })
    .limit(limit);
  if (flipped.length > 0) query = query.not('id', 'in', `(${flipped.join(',')})`);
  const { data, count, error } = await query;
  if (error) throw error;
  const rows = data || [];
  return { rows, remaining: Math.max(0, (count ?? rows.length) - rows.length) };
}

export async function recordFlip(
  teacherId: string,
  submissionId: string,
  action: 'seen' | 'skipped',
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const { data: existing } = await supabase
    .from('nexus_sketchbook_flips')
    .select('id, action')
    .eq('teacher_id', teacherId)
    .eq('submission_id', submissionId)
    .maybeSingle();
  // 'seen' is the stronger fact; never downgrade it to 'skipped'.
  if (existing) {
    if (existing.action === 'skipped' && action === 'seen') {
      await supabase.from('nexus_sketchbook_flips').update({ action: 'seen' }).eq('id', existing.id);
    }
    return;
  }
  const { error } = await supabase
    .from('nexus_sketchbook_flips')
    .insert({ teacher_id: teacherId, submission_id: submissionId, action });
  if (error && error.code !== '23505') throw error;
}

export async function firstSeenBy(
  submissionIds: string[],
  client?: TypedSupabaseClient,
): Promise<Record<string, { name: string | null; at: string }>> {
  const supabase = client || getSupabaseAdminClient();
  if (submissionIds.length === 0) return {};
  // nexus_sketchbook_flips has exactly one FK to users (teacher_id, its other
  // FK targets drawing_submissions), so the relationship is unambiguous and
  // needs no !hint.
  const { data, error } = await supabase
    .from('nexus_sketchbook_flips')
    .select('submission_id, created_at, teacher:users(name)')
    .in('submission_id', submissionIds)
    .eq('action', 'seen')
    .order('created_at', { ascending: true });
  if (error) throw error;
  const out: Record<string, { name: string | null; at: string }> = {};
  for (const row of data || []) {
    if (!out[row.submission_id]) out[row.submission_id] = { name: row.teacher?.name ?? null, at: row.created_at };
  }
  return out;
}

// ── Features ─────────────────────────────────────────────────────────────────

export async function listLiveFeatures(
  submissionIds: string[],
  client?: TypedSupabaseClient,
): Promise<Record<string, SketchbookFeatureFact[]>> {
  const supabase = client || getSupabaseAdminClient();
  if (submissionIds.length === 0) return {};
  // nexus_sketchbook_features has exactly one FK to nexus_classrooms
  // (classroom_id, its other FKs target drawing_submissions and users), so the
  // relationship is unambiguous and needs no !hint.
  const { data, error } = await supabase
    .from('nexus_sketchbook_features')
    .select('submission_id, classroom_id, featured_at, classroom:nexus_classrooms(name)')
    .in('submission_id', submissionIds)
    .is('unfeatured_at', null);
  if (error) throw error;
  const out: Record<string, SketchbookFeatureFact[]> = {};
  for (const row of data || []) {
    (out[row.submission_id] ||= []).push({
      classroom_id: row.classroom_id,
      classroom_name: row.classroom?.name ?? '',
      featured_at: row.featured_at,
    });
  }
  return out;
}

export async function getLiveFeature(
  submissionId: string,
  classroomId: string,
  client?: TypedSupabaseClient,
): Promise<NexusSketchbookFeature | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_sketchbook_features')
    .select('*')
    .eq('submission_id', submissionId)
    .eq('classroom_id', classroomId)
    .is('unfeatured_at', null)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function insertFeature(
  row: Omit<NexusSketchbookFeature, 'id' | 'featured_at' | 'unfeatured_at'>,
  client?: TypedSupabaseClient,
): Promise<NexusSketchbookFeature> {
  const supabase = client || getSupabaseAdminClient();
  // A previously un-featured pairing is revived rather than duplicated (UNIQUE).
  const { data, error } = await supabase
    .from('nexus_sketchbook_features')
    .upsert({ ...row, featured_at: new Date().toISOString(), unfeatured_at: null }, { onConflict: 'submission_id,classroom_id' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function markUnfeatured(featureId: string, client?: TypedSupabaseClient): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const { error } = await supabase
    .from('nexus_sketchbook_features')
    .update({ unfeatured_at: new Date().toISOString() })
    .eq('id', featureId);
  if (error) throw error;
}

export async function hasAnyLiveFeature(submissionId: string, client?: TypedSupabaseClient): Promise<boolean> {
  const supabase = client || getSupabaseAdminClient();
  const { count } = await supabase
    .from('nexus_sketchbook_features')
    .select('id', { count: 'exact', head: true })
    .eq('submission_id', submissionId)
    .is('unfeatured_at', null);
  return (count ?? 0) > 0;
}

// ── Class view, reactions, preferences ───────────────────────────────────────

export async function classPracticeDates(
  studentIds: string[],
  sinceDate: string,
  client?: TypedSupabaseClient,
): Promise<Record<string, string[]>> {
  const supabase = client || getSupabaseAdminClient();
  if (studentIds.length === 0) return {};
  const { data, error } = await supabase
    .from('nexus_sketchbook_practice_days')
    .select('student_id, practice_date')
    .in('student_id', studentIds)
    .gte('practice_date', sinceDate)
    .order('practice_date', { ascending: true });
  if (error) throw error;
  const out: Record<string, string[]> = {};
  for (const id of studentIds) out[id] = [];
  for (const row of data || []) out[row.student_id].push(row.practice_date);
  return out;
}

export async function setSketchbookReaction(
  submissionId: string,
  reaction: SketchbookReaction | null,
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const { error } = await supabase.from('drawing_submissions').update({ reaction }).eq('id', submissionId);
  if (error) throw error;
}

export async function setFeatureOptOut(userId: string, optOut: boolean, client?: TypedSupabaseClient): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const { error } = await supabase.from('users').update({ sketchbook_feature_opt_out: optOut }).eq('id', userId);
  if (error) throw error;
}

export async function getFeatureOptOut(userId: string, client?: TypedSupabaseClient): Promise<boolean> {
  const supabase = client || getSupabaseAdminClient();
  const { data } = await supabase.from('users').select('sketchbook_feature_opt_out').eq('id', userId).maybeSingle();
  return !!data?.sketchbook_feature_opt_out;
}
