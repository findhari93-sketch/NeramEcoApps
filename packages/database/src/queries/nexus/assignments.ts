// @ts-nocheck — nexus_class_assignments / _attachments / _submissions not yet in generated
// Supabase types; regenerate with pnpm supabase:gen:types after the migration is applied.
import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import type {
  NexusClassAssignment,
  NexusAssignmentAttachment,
  NexusAssignmentSubmission,
  NexusAssignmentSubmissionFile,
  NexusAssignmentFormat,
} from '../../types';
import { getTopicDrillFiles } from './curriculum';

const ASSIGNMENTS = 'nexus_class_assignments';
const ATTACHMENTS = 'nexus_assignment_attachments';
const SUBMISSIONS = 'nexus_assignment_submissions';

/** System study folder that receives teacher-uploaded assignment/drill files. */
export const ASSIGNMENT_ATTACHMENTS_FOLDER_ID = 'a0000000-0000-4000-8000-000000000001';
/** Private bucket for student submission files. */
export const ASSIGNMENT_SUBMISSIONS_BUCKET = 'assignment-submissions';
/** Signed read URL lifetime (seconds). Short so leaked links expire quickly. */
const SIGNED_READ_TTL = 900;

// ============================================================
// Assignments (teacher writes)
// ============================================================

export async function createAssignment(
  input: {
    classroom_id: string;
    plan_id?: string | null;
    plan_entry_id?: string | null;
    topic_id?: string | null;
    class_date: string;
    title: string;
    instructions?: string | null;
    submission_format?: NexusAssignmentFormat;
    max_marks?: number;
    due_at?: string | null;
    created_by?: string | null;
  },
  client?: TypedSupabaseClient,
): Promise<NexusClassAssignment> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(ASSIGNMENTS)
    .insert({
      classroom_id: input.classroom_id,
      plan_id: input.plan_id ?? null,
      plan_entry_id: input.plan_entry_id ?? null,
      topic_id: input.topic_id ?? null,
      class_date: input.class_date,
      title: input.title,
      instructions: input.instructions ?? null,
      submission_format: input.submission_format ?? 'pdf_or_image',
      max_marks: input.max_marks ?? 10,
      due_at: input.due_at ?? null,
      status: 'draft',
      created_by: input.created_by ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as NexusClassAssignment;
}

export async function updateAssignment(
  id: string,
  updates: Partial<
    Pick<
      NexusClassAssignment,
      | 'title'
      | 'instructions'
      | 'submission_format'
      | 'max_marks'
      | 'due_at'
      | 'status'
      | 'published_at'
      | 'topic_id'
      | 'class_date'
    >
  >,
  client?: TypedSupabaseClient,
): Promise<NexusClassAssignment> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(ASSIGNMENTS)
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as NexusClassAssignment;
}

export async function getAssignment(
  id: string,
  client?: TypedSupabaseClient,
): Promise<NexusClassAssignment | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase.from(ASSIGNMENTS).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as NexusClassAssignment) || null;
}

export async function deleteAssignment(id: string, client?: TypedSupabaseClient): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const { error } = await supabase.from(ASSIGNMENTS).delete().eq('id', id);
  if (error) throw error;
}

export interface AssignmentAttachmentDetail extends NexusAssignmentAttachment {
  file: {
    id: string;
    title: string;
    file_name: string;
    file_type: string | null;
    file_size_bytes: number | null;
  } | null;
}

/** Assignment with its attachment files joined (teacher + student both use this). */
export async function getAssignmentDetail(
  id: string,
  client?: TypedSupabaseClient,
): Promise<(NexusClassAssignment & { attachments: AssignmentAttachmentDetail[] }) | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(ASSIGNMENTS)
    .select(
      '*, attachments:nexus_assignment_attachments(*, ' +
        'file:nexus_study_files(id, title, file_name, file_type, file_size_bytes))',
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  data.attachments = (data.attachments || []).sort(
    (a: AssignmentAttachmentDetail, b: AssignmentAttachmentDetail) => a.sort_order - b.sort_order,
  );
  return data as NexusClassAssignment & { attachments: AssignmentAttachmentDetail[] };
}

export interface AssignmentSummary extends NexusClassAssignment {
  attachment_count: number;
  submitted_count: number;
}

/** Assignments for a plan (optionally a specific set of class dates), with counts. */
export async function listAssignmentsForPlan(
  planId: string,
  dates?: string[],
  client?: TypedSupabaseClient,
): Promise<AssignmentSummary[]> {
  const supabase = client || getSupabaseAdminClient();
  let query = supabase
    .from(ASSIGNMENTS)
    .select(
      '*, attachments:nexus_assignment_attachments(id), submissions:nexus_assignment_submissions(id)',
    )
    .eq('plan_id', planId)
    .order('class_date', { ascending: false });
  if (dates && dates.length) query = query.in('class_date', dates);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((a) => {
    const { attachments, submissions, ...rest } = a;
    return {
      ...rest,
      attachment_count: (attachments || []).length,
      submitted_count: (submissions || []).length,
    };
  }) as AssignmentSummary[];
}

// ============================================================
// Attachments (teacher reference files, from the study-files pipeline)
// ============================================================

export async function addAssignmentAttachments(
  assignmentId: string,
  files: { study_file_id: string; source?: 'upload' | 'topic_drill' }[],
  client?: TypedSupabaseClient,
): Promise<NexusAssignmentAttachment[]> {
  if (!files.length) return [];
  const supabase = client || getSupabaseAdminClient();
  const { data: existing } = await supabase
    .from(ATTACHMENTS)
    .select('sort_order')
    .eq('assignment_id', assignmentId)
    .order('sort_order', { ascending: false })
    .limit(1);
  let nextOrder = existing && existing.length ? (existing[0].sort_order ?? 0) + 1 : 0;
  const { data, error } = await supabase
    .from(ATTACHMENTS)
    .upsert(
      files.map((f) => ({
        assignment_id: assignmentId,
        study_file_id: f.study_file_id,
        source: f.source ?? 'upload',
        sort_order: nextOrder++,
      })),
      { onConflict: 'assignment_id,study_file_id', ignoreDuplicates: true },
    )
    .select();
  if (error) throw error;
  return (data || []) as NexusAssignmentAttachment[];
}

export async function removeAssignmentAttachment(
  attachmentId: string,
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const { error } = await supabase.from(ATTACHMENTS).delete().eq('id', attachmentId);
  if (error) throw error;
}

/** Attach every drill-flagged study file of the assignment's topic in one call. */
export async function attachTopicDrills(
  assignmentId: string,
  topicId: string,
  client?: TypedSupabaseClient,
): Promise<NexusAssignmentAttachment[]> {
  const supabase = client || getSupabaseAdminClient();
  const drills = await getTopicDrillFiles(topicId, supabase);
  if (!drills.length) return [];
  return addAssignmentAttachments(
    assignmentId,
    drills.map((d) => ({ study_file_id: d.study_file_id, source: 'topic_drill' as const })),
    supabase,
  );
}

// ============================================================
// Roster + submissions
// ============================================================

export interface AssignmentRosterRow {
  student: { id: string; name: string | null; email: string | null; avatar_url: string | null };
  submission: NexusAssignmentSubmission | null;
  bucket: 'submitted' | 'late' | 'missing';
}

/**
 * Every current active student of the assignment's classroom, cross-joined with
 * their submission. Enrollment-driven so late joiners appear automatically.
 * "late" = submitted after due_at (derived, never stored).
 */
export async function getAssignmentRoster(
  assignmentId: string,
  client?: TypedSupabaseClient,
): Promise<{ assignment: NexusClassAssignment; rows: AssignmentRosterRow[] }> {
  const supabase = client || getSupabaseAdminClient();
  const assignment = await getAssignment(assignmentId, supabase);
  if (!assignment) throw new Error('Assignment not found');

  const { data: enrollments, error: enErr } = await supabase
    .from('nexus_enrollments')
    .select('user:users!nexus_enrollments_user_id_fkey(id, name, email, avatar_url, is_alumni)')
    .eq('classroom_id', assignment.classroom_id)
    .eq('role', 'student')
    .eq('is_active', true);
  if (enErr) throw enErr;

  const { data: subs, error: sErr } = await supabase
    .from(SUBMISSIONS)
    .select('*')
    .eq('assignment_id', assignmentId);
  if (sErr) throw sErr;
  const subByStudent = new Map<string, NexusAssignmentSubmission>();
  for (const s of subs || []) subByStudent.set(s.student_id, s as NexusAssignmentSubmission);

  const due = assignment.due_at ? new Date(assignment.due_at).getTime() : null;
  const rows: AssignmentRosterRow[] = [];
  const seen = new Set<string>();
  for (const en of enrollments || []) {
    const user = en.user as unknown as AssignmentRosterRow['student'] & { is_alumni?: boolean };
    if (!user || user.is_alumni) continue; // never list graduated students
    if (seen.has(user.id)) continue;
    seen.add(user.id);
    const submission = subByStudent.get(user.id) ?? null;
    let bucket: AssignmentRosterRow['bucket'] = 'missing';
    if (submission) {
      const late = due !== null && new Date(submission.submitted_at).getTime() > due;
      bucket = late ? 'late' : 'submitted';
    }
    rows.push({
      student: { id: user.id, name: user.name, email: user.email, avatar_url: user.avatar_url },
      submission,
      bucket,
    });
  }
  rows.sort((a, b) => (a.student.name || '').localeCompare(b.student.name || ''));
  return { assignment, rows };
}

export async function getSubmission(
  assignmentId: string,
  studentId: string,
  client?: TypedSupabaseClient,
): Promise<NexusAssignmentSubmission | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(SUBMISSIONS)
    .select('*')
    .eq('assignment_id', assignmentId)
    .eq('student_id', studentId)
    .maybeSingle();
  if (error) throw error;
  return (data as NexusAssignmentSubmission) || null;
}

/** A student's submissions across a set of assignments (for the course-plan timeline). */
export async function getMySubmissions(
  studentId: string,
  assignmentIds: string[],
  client?: TypedSupabaseClient,
): Promise<Map<string, NexusAssignmentSubmission>> {
  const map = new Map<string, NexusAssignmentSubmission>();
  if (!assignmentIds.length) return map;
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(SUBMISSIONS)
    .select('*')
    .eq('student_id', studentId)
    .in('assignment_id', assignmentIds);
  if (error) throw error;
  for (const s of data || []) map.set(s.assignment_id, s as NexusAssignmentSubmission);
  return map;
}

/**
 * Insert or resubmit a student's work. On resubmit (a row already exists) the
 * previous attempt is pushed into history, attempt_number increments, status
 * resets to 'submitted', and the prior marks are cleared (feedback kept for
 * context). submitted_at is refreshed so lateness reflects the latest attempt.
 */
export async function upsertSubmission(
  assignmentId: string,
  studentId: string,
  files: NexusAssignmentSubmissionFile[],
  client?: TypedSupabaseClient,
): Promise<NexusAssignmentSubmission> {
  const supabase = client || getSupabaseAdminClient();
  const existing = await getSubmission(assignmentId, studentId, supabase);
  const now = new Date().toISOString();

  if (!existing) {
    const { data, error } = await supabase
      .from(SUBMISSIONS)
      .insert({
        assignment_id: assignmentId,
        student_id: studentId,
        files,
        status: 'submitted',
        attempt_number: 1,
        submitted_at: now,
      })
      .select('*')
      .single();
    if (error) throw error;
    return data as NexusAssignmentSubmission;
  }

  const history = Array.isArray(existing.history) ? existing.history : [];
  history.push({
    attempt: existing.attempt_number,
    files: existing.files || [],
    submitted_at: existing.submitted_at,
    marks: existing.marks,
    feedback: existing.feedback,
  });
  const { data, error } = await supabase
    .from(SUBMISSIONS)
    .update({
      files,
      status: 'submitted',
      attempt_number: existing.attempt_number + 1,
      marks: null,
      reviewed_by: null,
      reviewed_at: null,
      submitted_at: now,
      history,
      updated_at: now,
    })
    .eq('id', existing.id)
    .select('*')
    .single();
  if (error) throw error;
  return data as NexusAssignmentSubmission;
}

export async function reviewSubmission(
  submissionId: string,
  review: { marks: number | null; feedback: string | null; action: 'complete' | 'redo'; reviewed_by: string },
  client?: TypedSupabaseClient,
): Promise<NexusAssignmentSubmission> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(SUBMISSIONS)
    .update({
      marks: review.marks,
      feedback: review.feedback,
      status: review.action === 'redo' ? 'redo' : 'reviewed',
      reviewed_by: review.reviewed_by,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', submissionId)
    .select('*')
    .single();
  if (error) throw error;
  return data as NexusAssignmentSubmission;
}

// ============================================================
// Student course-plan support
// ============================================================

export interface StudentActivePlan {
  classroom: { id: string; name: string | null; type: string | null };
  plan: { id: string; title: string; exam_type: string; start_date: string; expected_end_date: string; saturday_classes: boolean; exam_date: string | null; status: string };
}

/** Active teaching plans across the student's enrolled classrooms. */
export async function listActivePlansForStudent(
  userId: string,
  client?: TypedSupabaseClient,
): Promise<StudentActivePlan[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data: enrollments, error: enErr } = await supabase
    .from('nexus_enrollments')
    .select('classroom_id, classroom:nexus_classrooms(id, name, type)')
    .eq('user_id', userId)
    .eq('role', 'student')
    .eq('is_active', true);
  if (enErr) throw enErr;
  const classroomIds = [...new Set((enrollments || []).map((e) => e.classroom_id).filter(Boolean))];
  if (!classroomIds.length) return [];

  const classroomById = new Map<string, { id: string; name: string | null; type: string | null }>();
  for (const e of enrollments || []) {
    const c = e.classroom as unknown as { id: string; name: string | null; type: string | null };
    if (c) classroomById.set(c.id, c);
  }

  const { data: plans, error: pErr } = await supabase
    .from('nexus_teaching_plans')
    .select('id, classroom_id, title, exam_type, start_date, expected_end_date, saturday_classes, exam_date, status')
    .in('classroom_id', classroomIds)
    .eq('status', 'active')
    .order('start_date', { ascending: true });
  if (pErr) throw pErr;

  return (plans || []).map((p) => {
    const { classroom_id, ...plan } = p;
    return {
      classroom: classroomById.get(classroom_id) || { id: classroom_id, name: null, type: null },
      plan,
    };
  }) as StudentActivePlan[];
}

export async function updateScheduledClassLinks(
  classId: string,
  links: { recording_url?: string | null; youtube_url?: string | null },
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const patch: Record<string, unknown> = {};
  if (links.recording_url !== undefined) patch.recording_url = links.recording_url;
  if (links.youtube_url !== undefined) patch.youtube_url = links.youtube_url;
  if (!Object.keys(patch).length) return;
  const { error } = await supabase.from('nexus_scheduled_classes').update(patch).eq('id', classId);
  if (error) throw error;
}

/** Published-recap lookup keyed by scheduled_class_id (for the gated "Guided recap" chip). */
export async function getPublishedRecapsByScheduledClassIds(
  classIds: string[],
  client?: TypedSupabaseClient,
): Promise<Map<string, { id: string; status: string }>> {
  const map = new Map<string, { id: string; status: string }>();
  if (!classIds.length) return map;
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_class_recaps')
    .select('id, status, scheduled_class_id')
    .in('scheduled_class_id', classIds);
  if (error) throw error;
  for (const r of data || []) {
    if (r.scheduled_class_id) map.set(r.scheduled_class_id, { id: r.id, status: r.status });
  }
  return map;
}

// ============================================================
// Storage: signed upload + signed read URLs (service-role)
// ============================================================

/** Issue signed upload URLs so the browser PUTs bytes straight to storage. */
export async function createSubmissionUploadUrls(
  paths: string[],
  client?: TypedSupabaseClient,
): Promise<{ path: string; token: string; signedUrl: string }[]> {
  const supabase = client || getSupabaseAdminClient();
  const out: { path: string; token: string; signedUrl: string }[] = [];
  for (const path of paths) {
    const { data, error } = await supabase.storage
      .from(ASSIGNMENT_SUBMISSIONS_BUCKET)
      .createSignedUploadUrl(path);
    if (error) throw error;
    out.push({ path, token: data.token, signedUrl: data.signedUrl });
  }
  return out;
}

/** Short-TTL signed read URLs for a submission's files (viewer/download). */
export async function signSubmissionFiles(
  files: NexusAssignmentSubmissionFile[],
  client?: TypedSupabaseClient,
): Promise<(NexusAssignmentSubmissionFile & { url: string | null })[]> {
  if (!files.length) return [];
  const supabase = client || getSupabaseAdminClient();
  const paths = files.map((f) => f.path);
  const { data, error } = await supabase.storage
    .from(ASSIGNMENT_SUBMISSIONS_BUCKET)
    .createSignedUrls(paths, SIGNED_READ_TTL);
  if (error) throw error;
  const urlByPath = new Map<string, string>();
  for (const row of data || []) {
    if (row.path && row.signedUrl) urlByPath.set(row.path, row.signedUrl);
  }
  return files.map((f) => ({ ...f, url: urlByPath.get(f.path) ?? null }));
}
