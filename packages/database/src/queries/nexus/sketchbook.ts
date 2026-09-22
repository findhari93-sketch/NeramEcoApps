// @ts-nocheck: sketchbook tables land in the generated types after the migration is applied; regenerate with pnpm supabase:gen:types
import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import type { SketchbookReaction, NexusSketchbookFeature } from '../../types';
import { SAME_SHEET_WINDOW_HOURS, fingerprintOf, isSameSheet } from './drawing-fingerprint';

/**
 * Sketchbook data access. Every function here is service-role; the routes
 * decide who may call what. Nothing in this file knows about weeks or goals,
 * that is apps/nexus/src/lib/sketchbook-rhythm.ts.
 */

/** Practice kinds: marking is optional and nothing is pending. Mirrors apps/nexus/src/lib/drawing-source.ts. */
export const PRACTICE_SOURCE_TYPES = ['sketchbook', 'question_bank', 'free_practice', 'homework'] as const;

/** Who is reading. A student never sees their own test papers here: those marks are embargoed until results are published. */
export type SketchbookViewer = 'student' | 'staff';

export interface SketchbookSketchRow {
  id: string;
  student_id: string;
  original_image_url: string;
  thumbnail_url: string | null;
  self_note: string | null;
  reaction: SketchbookReaction | null;
  submitted_at: string;
  is_gallery_visible: boolean;
  source_type: string;
  status: string;
  assignment_id: string | null;
  question_id: string | null;
  reviewed_at: string | null;
  tutor_rating: number | null;
  tutor_marks: number | null;
  inspiration_item_id: string | null;
  assignment: { id: string; title: string | null; evaluation_type: string | null; max_marks: number | null } | null;
}

export interface SketchbookInboxRow extends SketchbookSketchRow {
  student: { id: string; name: string | null; avatar_url: string | null; ms_oid: string | null };
  /**
   * Other rows on this page that are the same sheet (photo fingerprint), so the
   * screen can drop the rest once a teacher handles one. Absent when none.
   */
  twin_ids?: string[];
}

export interface SketchbookFeatureFact {
  classroom_id: string;
  classroom_name: string;
  featured_at: string;
}

// Never name exam_attempt_id here: staging has no such column, and a named
// missing column makes PostgREST answer an error instead of rows.
const SKETCH_COLUMNS =
  'id, student_id, original_image_url, thumbnail_url, self_note, reaction, submitted_at, is_gallery_visible, ' +
  'source_type, status, assignment_id, question_id, reviewed_at, tutor_rating, tutor_marks, inspiration_item_id, ' +
  'assignment:nexus_class_assignments!drawing_submissions_assignment_id_fkey(id, title, evaluation_type, max_marks)';

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
  viewer: SketchbookViewer = 'student',
  client?: TypedSupabaseClient,
): Promise<SketchbookSketchRow[]> {
  const supabase = client || getSupabaseAdminClient();
  const { from, to } = monthRangeIst(month);
  let query = supabase
    .from('drawing_submissions')
    .select(SKETCH_COLUMNS)
    .eq('student_id', studentId)
    .gte('submitted_at', from)
    .lt('submitted_at', to);
  if (viewer === 'student') query = query.neq('source_type', 'exam');
  const { data, error } = await query.order('submitted_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function countSketches(
  studentId: string,
  viewer: SketchbookViewer = 'student',
  client?: TypedSupabaseClient,
): Promise<number> {
  const supabase = client || getSupabaseAdminClient();
  let query = supabase
    .from('drawing_submissions')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', studentId);
  if (viewer === 'student') query = query.neq('source_type', 'exam');
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export async function firstAndLatestSketch(
  studentId: string,
  client?: TypedSupabaseClient,
): Promise<{ first: SketchbookSketchRow; latest: SketchbookSketchRow } | null> {
  const supabase = client || getSupabaseAdminClient();
  // "Then and now" compares the student's own drawings, never a test paper.
  const base = () =>
    supabase.from('drawing_submissions').select(SKETCH_COLUMNS).eq('student_id', studentId).neq('source_type', 'exam');
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

/** One drawing of any kind, to open it inside its sketchbook month. */
export async function getSketchbookDrawing(
  id: string,
  client?: TypedSupabaseClient,
): Promise<SketchbookSketchRow | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase.from('drawing_submissions').select(SKETCH_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * One practice drawing: a sketch, question bank, free practice or homework, and
 * never an assignment or a test. The flip, react and feature routes use it, so a
 * wrong id can never react to or feature owed work.
 */
export async function getPracticeDrawing(
  id: string,
  client?: TypedSupabaseClient,
): Promise<SketchbookSketchRow | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('drawing_submissions')
    .select(SKETCH_COLUMNS)
    .eq('id', id)
    .in('source_type', [...PRACTICE_SOURCE_TYPES])
    .is('assignment_id', null)
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
  const { data: existing, error: existingError } = await supabase
    .from('nexus_sketchbook_practice_days')
    .select('sketch_count')
    .eq('student_id', studentId)
    .eq('practice_date', practiceDate)
    .maybeSingle();
  if (existingError) throw existingError;
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
    const { error: deleteError } = await supabase
      .from('nexus_sketchbook_practice_days')
      .delete()
      .eq('student_id', studentId)
      .eq('practice_date', practiceDate);
    if (deleteError) throw deleteError;
    return;
  }
  const { error: upsertError } = await supabase
    .from('nexus_sketchbook_practice_days')
    .upsert(
      { student_id: studentId, practice_date: practiceDate, sketch_count: sameDay.length, first_submission_id: sameDay[0].id },
      { onConflict: 'student_id,practice_date' },
    );
  if (upsertError) throw upsertError;
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

/** Handled drawings this far either side of the candidates are enough to catch a re-upload. */
const SAME_SHEET_WINDOW_MS = SAME_SHEET_WINDOW_HOURS * 3600 * 1000;
/** Ceiling on the reference rows read for re-upload matching: a few students over four days. */
const SAME_SHEET_REFERENCE_LIMIT = 500;

/** Postgres "undefined column": an environment that has not had image_quality migrated in. */
const isMissingColumn = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === '42703' || /image_quality/.test(e.message || ''));

/**
 * The flip inbox: practice drawings still waiting for a look, newest first.
 *
 * Evaluated anywhere counts as evaluated. A drawing leaves EVERY teacher inbox
 * once anyone reacted to it, commented on it, featured it or completed a
 * review; only a Skip (or a passing glance) stays personal to the teacher who
 * did it. It also leaves when it is a re-upload of a sheet that was already
 * handled or sent to an assignment: same student, within SAME_SHEET_WINDOW_HOURS,
 * matching photo fingerprint (drawing-fingerprint.ts). Before this, a sheet a
 * teacher marked 4 stars in an assignment came back in Flip through as new work.
 */
export async function listUnflipped(
  teacherId: string,
  studentIds: string[],
  limit: number,
  client?: TypedSupabaseClient,
): Promise<{ rows: SketchbookInboxRow[]; remaining: number }> {
  const supabase = client || getSupabaseAdminClient();
  if (studentIds.length === 0) return { rows: [], remaining: 0 };

  // Bounded candidate window, not a teacher's whole flip history: joining every
  // flipped id into one `.not('id', 'in', (...))` query breaks once a teacher
  // has flipped enough sketches that the id list overflows the Supabase-proxy
  // request line (roughly 220 UUIDs, reached within about two weeks at ~115
  // flips/week). Fetch a capped window of the newest candidate sketches
  // instead, then only ask which of those were already flipped.
  const candidateLimit = Math.min(limit * 5, 200);
  // drawing_submissions has exactly one FK to users (student_id), so the
  // relationship is unambiguous and needs no !hint.
  const candidatesQuery = (columns: string) =>
    supabase
      .from('drawing_submissions')
      .select(`${columns}, student:users(id, name, avatar_url, ms_oid)`)
      // Practice nobody has reacted to or reviewed yet. Assignment and test
      // drawings are owed work with their own homes and badges, and a drawing a
      // teacher already answered is not news to the next teacher.
      .in('source_type', [...PRACTICE_SOURCE_TYPES])
      .is('assignment_id', null)
      .is('reviewed_at', null)
      .is('reaction', null)
      .in('student_id', studentIds)
      .order('submitted_at', { ascending: false })
      .limit(candidateLimit);
  let { data: candidates, error: candidatesError } = await candidatesQuery(`${SKETCH_COLUMNS}, image_quality`);
  if (isMissingColumn(candidatesError)) ({ data: candidates, error: candidatesError } = await candidatesQuery(SKETCH_COLUMNS));
  if (candidatesError) throw candidatesError;
  const candidateRows = (candidates || []) as Array<SketchbookInboxRow & { image_quality?: unknown }>;
  if (candidateRows.length === 0) return { rows: [], remaining: 0 };

  const candidateIds = candidateRows.map((r) => r.id);
  const [flipsRes, commentsRes, featuresRes] = await Promise.all([
    supabase.from('nexus_sketchbook_flips').select('submission_id').eq('teacher_id', teacherId).in('submission_id', candidateIds),
    supabase.from('drawing_submission_comments').select('submission_id').eq('author_role', 'teacher').in('submission_id', candidateIds),
    supabase.from('nexus_sketchbook_features').select('submission_id').is('unfeatured_at', null).in('submission_id', candidateIds),
  ]);
  if (flipsRes.error) throw flipsRes.error;
  if (commentsRes.error) throw commentsRes.error;
  if (featuresRes.error) throw featuresRes.error;
  const flippedSet = new Set((flipsRes.data || []).map((f) => f.submission_id));
  // Answered by any teacher: a comment or a live feature. A reaction or a
  // completed review never reaches this point (the candidate query drops them).
  const answered = new Set([...(commentsRes.data || []), ...(featuresRes.data || [])].map((r) => r.submission_id));

  const fp = new Map<string, string>();
  for (const r of candidateRows) {
    const f = fingerprintOf(r.image_quality);
    if (f) fp.set(r.id, f);
  }
  const reuploads = await findReuploads(supabase, candidateRows.filter((r) => fp.has(r.id)), fp, answered);

  const unflippedInWindow = candidateRows.filter((r) => !flippedSet.has(r.id) && !answered.has(r.id) && !reuploads.has(r.id));
  const page = unflippedInWindow.slice(0, limit);
  const rows = page.map(({ image_quality: _quality, ...row }) => {
    const mine = fp.get(row.id);
    const twins = mine
      ? page.filter((o) => o.id !== row.id && o.student_id === row.student_id && isSameSheet(mine, fp.get(o.id))).map((o) => o.id)
      : [];
    return (twins.length ? { ...row, twin_ids: twins } : row) as SketchbookInboxRow;
  });
  // `remaining` counts only what is left unflipped within this bounded
  // candidate window, not across the student's entire sketchbook history.
  return { rows, remaining: Math.max(0, unflippedInWindow.length - rows.length) };
}

/**
 * Candidates that are the same sheet as a drawing already handled: owed work
 * (an assignment or exam copy, which is reviewed there), or a practice copy a
 * teacher reacted to, reviewed, commented on or featured. Read only when some
 * candidate has a fingerprint, so it costs nothing until photos carry one.
 */
async function findReuploads(
  supabase: TypedSupabaseClient,
  withFingerprint: Array<{ id: string; student_id: string; submitted_at: string }>,
  fp: Map<string, string>,
  answered: Set<string>,
): Promise<Set<string>> {
  const out = new Set<string>();
  if (withFingerprint.length === 0) return out;
  const times = withFingerprint.map((r) => Date.parse(r.submitted_at));
  const from = new Date(Math.min(...times) - SAME_SHEET_WINDOW_MS).toISOString();
  const to = new Date(Math.max(...times) + SAME_SHEET_WINDOW_MS).toISOString();
  const { data, error } = await supabase
    .from('drawing_submissions')
    .select('id, student_id, submitted_at, source_type, assignment_id, reaction, reviewed_at, image_quality')
    .in('student_id', [...new Set(withFingerprint.map((r) => r.student_id))])
    .gte('submitted_at', from)
    .lte('submitted_at', to)
    .limit(SAME_SHEET_REFERENCE_LIMIT);
  if (error) {
    // Matching is a courtesy on top of the inbox, never a reason to lose it.
    if (isMissingColumn(error)) return out;
    throw error;
  }
  const handled = (data || []).filter((r) =>
    fingerprintOf(r.image_quality) &&
    (r.assignment_id || r.source_type === 'assignment' || r.source_type === 'exam' || r.reaction || r.reviewed_at || answered.has(r.id)),
  );
  for (const c of withFingerprint) {
    const at = Date.parse(c.submitted_at);
    const mine = fp.get(c.id);
    const twin = handled.find((r) =>
      r.id !== c.id &&
      r.student_id === c.student_id &&
      Math.abs(Date.parse(r.submitted_at) - at) <= SAME_SHEET_WINDOW_MS &&
      isSameSheet(mine, fingerprintOf(r.image_quality)),
    );
    if (twin) out.add(c.id);
  }
  return out;
}

export async function recordFlip(
  teacherId: string,
  submissionId: string,
  action: 'seen' | 'skipped',
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const { data: existing, error: existingError } = await supabase
    .from('nexus_sketchbook_flips')
    .select('id, action')
    .eq('teacher_id', teacherId)
    .eq('submission_id', submissionId)
    .maybeSingle();
  if (existingError) throw existingError;
  // 'seen' is the stronger fact; never downgrade it to 'skipped'.
  if (existing) {
    if (existing.action === 'skipped' && action === 'seen') {
      const { error: updateError } = await supabase
        .from('nexus_sketchbook_flips')
        .update({ action: 'seen' })
        .eq('id', existing.id);
      if (updateError) throw updateError;
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
  const { count, error } = await supabase
    .from('nexus_sketchbook_features')
    .select('id', { count: 'exact', head: true })
    .eq('submission_id', submissionId)
    .is('unfeatured_at', null);
  if (error) throw error;
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
  // Scoped to practice so a wrong id can never overwrite the shared `reaction`
  // column on an assignment or test drawing, which the review screen owns.
  const { error } = await supabase
    .from('drawing_submissions')
    .update({ reaction })
    .eq('id', submissionId)
    .in('source_type', [...PRACTICE_SOURCE_TYPES])
    .is('assignment_id', null);
  if (error) throw error;
}

export async function setFeatureOptOut(userId: string, optOut: boolean, client?: TypedSupabaseClient): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const { error } = await supabase.from('users').update({ sketchbook_feature_opt_out: optOut }).eq('id', userId);
  if (error) throw error;
}

export async function getFeatureOptOut(userId: string, client?: TypedSupabaseClient): Promise<boolean> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase.from('users').select('sketchbook_feature_opt_out').eq('id', userId).maybeSingle();
  if (error) throw error;
  return !!data?.sketchbook_feature_opt_out;
}
