/**
 * Database side of the drawing rhythm: which days each student drew, their
 * newest sketch, and when tracking starts for them. The decisions live in
 * sketchbook-status.ts; this file only reads.
 *
 * Lives in apps/nexus rather than packages/database so a change here redeploys
 * Nexus only. Server only (service role).
 *
 * The two RPCs come from migration 20260915090100_nexus_sketchbook_tracking.sql
 * and are not in the generated types, hence the `as any`.
 */

import { getSupabaseAdminClient } from '@neram/database';
import { istDate } from './sketchbook-rhythm';

export interface LatestSketch {
  id: string;
  /** Thumbnail when one was made at upload, else the original. */
  thumbUrl: string | null;
  submittedAt: string;
}

export interface StudentRhythmContext {
  classroomId: string;
  classroomName: string;
  startedOn: string;
  enrolledAt: string | null;
  goal: number;
  batchId: string | null;
  dormantHere: boolean;
  reactivatedOn: string | null;
}

function client(): any {
  return getSupabaseAdminClient() as any;
}

/** Practice days per student since `since` (IST date), any drawing source. Every requested id gets a key. */
export async function loadDrawingDays(studentIds: string[], since: string): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  for (const id of studentIds) out[id] = [];
  if (studentIds.length === 0) return out;
  const { data, error } = await client().rpc('nexus_drawing_days', { p_student_ids: studentIds, p_since: since });
  if (error) throw error;
  for (const row of (data || []) as Array<{ student_id: string; practice_date: string }>) {
    (out[row.student_id] ||= []).push(row.practice_date);
  }
  for (const id of Object.keys(out)) out[id].sort();
  return out;
}

export async function loadLatestSketches(studentIds: string[]): Promise<Record<string, LatestSketch>> {
  const out: Record<string, LatestSketch> = {};
  if (studentIds.length === 0) return out;
  const { data, error } = await client().rpc('nexus_latest_sketches', { p_student_ids: studentIds });
  if (error) throw error;
  for (const row of (data || []) as Array<{
    student_id: string; submission_id: string; thumbnail_url: string | null; original_image_url: string | null; submitted_at: string;
  }>) {
    out[row.student_id] = {
      id: row.submission_id,
      thumbUrl: row.thumbnail_url || row.original_image_url || null,
      submittedAt: row.submitted_at,
    };
  }
  return out;
}

/** IST date each student was last brought back from dormant in this classroom. */
export async function loadReactivations(classroomId: string, studentIds: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (studentIds.length === 0) return out;
  const { data, error } = await client()
    .from('nexus_enrollment_classification_events')
    .select('student_id, created_at')
    .eq('classroom_id', classroomId)
    .eq('axis', 'participation')
    .eq('to_value', 'active')
    .in('student_id', studentIds)
    .order('created_at', { ascending: true });
  if (error) throw error;
  // Ascending, so the newest row for a student is written last and wins.
  for (const row of (data || []) as Array<{ student_id: string; created_at: string }>) {
    out[row.student_id] = istDate(row.created_at);
  }
  return out;
}

export async function loadClassroomSketchbookSettings(
  classroomId: string,
): Promise<{ startedOn: string; goal: number }> {
  const { data, error } = await client()
    .from('nexus_classrooms')
    .select('sketchbook_started_on, sketchbook_weekly_goal')
    .eq('id', classroomId)
    .maybeSingle();
  if (error) throw error;
  return {
    startedOn: data?.sketchbook_started_on ?? istDate(new Date()),
    goal: data?.sketchbook_weekly_goal ?? 3,
  };
}

/**
 * The student's own rhythm context: their newest active enrolment in a live
 * classroom, the same "newest wins" rule as getStudentPrimaryClassroom.
 */
export async function loadStudentRhythmContext(studentId: string): Promise<StudentRhythmContext | null> {
  const { data, error } = await client()
    .from('nexus_enrollments')
    .select('batch_id, enrolled_at, participation_status, classroom:nexus_classrooms(id, name, sketchbook_weekly_goal, sketchbook_started_on, is_active)')
    .eq('user_id', studentId)
    .eq('role', 'student')
    .eq('is_active', true)
    .order('enrolled_at', { ascending: false });
  if (error) throw error;
  const live = ((data || []) as any[]).find((r) => r.classroom?.is_active);
  if (!live) return null;
  const reactivations = await loadReactivations(live.classroom.id, [studentId]);
  return {
    classroomId: live.classroom.id,
    classroomName: live.classroom.name,
    startedOn: live.classroom.sketchbook_started_on ?? istDate(new Date()),
    enrolledAt: live.enrolled_at ?? null,
    goal: live.classroom.sketchbook_weekly_goal ?? 3,
    batchId: live.batch_id ?? null,
    dormantHere: live.participation_status === 'dormant',
    reactivatedOn: reactivations[studentId] ?? null,
  };
}
