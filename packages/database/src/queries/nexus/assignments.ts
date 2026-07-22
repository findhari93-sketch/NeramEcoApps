// @ts-nocheck — nexus_class_assignments / _attachments / _submissions not yet in generated
// Supabase types; regenerate with pnpm supabase:gen:types after the migration is applied.
import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import type {
  NexusClassAssignment,
  NexusAssignmentAttachment,
  NexusAssignmentSubmission,
  NexusAssignmentSubmissionFile,
  NexusAssignmentFormat,
  NexusAssignmentType,
  NexusAssignmentEvaluationType,
  NexusAssignmentLink,
  NexusAssignmentRecordingSource,
  GalleryReactionType,
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
    assignment_type?: NexusAssignmentType;
    drawing_question_id?: string | null;
    submission_format?: NexusAssignmentFormat;
    evaluation_type?: NexusAssignmentEvaluationType;
    max_marks?: number;
    due_at?: string | null;
    content_image_url?: string | null;
    content_video_url?: string | null;
    links?: NexusAssignmentLink[];
    recording_url?: string | null;
    recording_source?: NexusAssignmentRecordingSource | null;
    catchup_window_days?: number;
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
      assignment_type: input.assignment_type ?? 'document',
      drawing_question_id: input.drawing_question_id ?? null,
      submission_format: input.submission_format ?? 'pdf_or_image',
      evaluation_type: input.evaluation_type ?? 'marks',
      // Stars are stored on the marks column against a max of 5.
      max_marks: input.evaluation_type === 'stars' ? 5 : input.max_marks ?? 10,
      due_at: input.due_at ?? null,
      content_image_url: input.content_image_url ?? null,
      content_video_url: input.content_video_url ?? null,
      links: input.links ?? [],
      recording_url: input.recording_url ?? null,
      recording_source: input.recording_source ?? null,
      catchup_window_days: input.catchup_window_days ?? 7,
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
      | 'assignment_type'
      | 'drawing_question_id'
      | 'submission_format'
      | 'evaluation_type'
      | 'max_marks'
      | 'due_at'
      | 'status'
      | 'published_at'
      | 'topic_id'
      | 'class_date'
      | 'content_image_url'
      | 'content_video_url'
      | 'links'
      | 'recording_url'
      | 'recording_source'
      | 'catchup_window_days'
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
): Promise<
  | (NexusClassAssignment & { attachments: AssignmentAttachmentDetail[]; reference_images: string[] })
  | null
> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(ASSIGNMENTS)
    .select(
      '*, attachments:nexus_assignment_attachments(*, ' +
        'file:nexus_study_files(id, title, file_name, file_type, file_size_bytes)), ' +
        'drawing_question:drawing_questions(reference_images)',
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  data.attachments = (data.attachments || []).sort(
    (a: AssignmentAttachmentDetail, b: AssignmentAttachmentDetail) => a.sort_order - b.sort_order,
  );
  // Flatten the backing drawing question's reference_images ([{url}]) to a plain
  // string[] so every consumer (student + teacher) can render a reference gallery.
  const rawRefs = data.drawing_question?.reference_images || [];
  data.reference_images = rawRefs
    .map((r: any) => (typeof r === 'string' ? r : r?.url))
    .filter((u: any): u is string => typeof u === 'string' && u.length > 0);
  delete data.drawing_question;
  return data as NexusClassAssignment & {
    attachments: AssignmentAttachmentDetail[];
    reference_images: string[];
  };
}

export interface AssignmentSummary extends NexusClassAssignment {
  attachment_count: number;
  submitted_count: number;
}

/**
 * Assignments for a classroom (the durable anchor, survives plan reorders /
 * archival), newest class first. Powers the standalone Assignments hub, which is
 * classroom-scoped rather than tied to one teaching plan.
 */
export async function listAssignmentsForClassroom(
  classroomId: string,
  opts?: { status?: NexusAssignmentStatus },
  client?: TypedSupabaseClient,
): Promise<AssignmentSummary[]> {
  const supabase = client || getSupabaseAdminClient();
  let query = supabase
    .from(ASSIGNMENTS)
    .select(
      '*, attachments:nexus_assignment_attachments(id), submissions:nexus_assignment_submissions(id)',
    )
    .eq('classroom_id', classroomId)
    .order('class_date', { ascending: false });
  if (opts?.status) query = query.eq('status', opts.status);
  const { data, error } = await query;
  if (error) throw error;
  const list = (data || []).map((a) => {
    const { attachments, submissions, ...rest } = a;
    return {
      ...rest,
      attachment_count: (attachments || []).length,
      submitted_count: (submissions || []).length,
    };
  }) as AssignmentSummary[];

  // Drawing-type assignments keep their submissions in drawing_submissions;
  // count distinct students who submitted so the hub's "submitted" is accurate.
  const drawingIds = list.filter((a) => a.assignment_type === 'drawing').map((a) => a.id);
  if (drawingIds.length) {
    const { data: ds } = await supabase
      .from('drawing_submissions')
      .select('assignment_id, student_id')
      .in('assignment_id', drawingIds);
    const studentsByAssignment = new Map<string, Set<string>>();
    for (const r of ds || []) {
      const set = studentsByAssignment.get(r.assignment_id) || new Set<string>();
      set.add(r.student_id);
      studentsByAssignment.set(r.assignment_id, set);
    }
    for (const a of list) {
      if (a.assignment_type === 'drawing') a.submitted_count = studentsByAssignment.get(a.id)?.size ?? 0;
    }
  }
  return list;
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

export interface AssignmentDrawingRosterRow {
  student: { id: string; name: string | null; email: string | null; avatar_url: string | null };
  drawing: {
    id: string;
    status: string;
    submitted_at: string;
    tutor_rating: number | null;
    tutor_marks: number | null;
    attempt_number: number;
    /** Total submissions this student made for the assignment (real count, not the stored attempt_number). */
    attempt_count: number;
    /** Latest attempt is a resubmission still awaiting the teacher (count > 1 and not yet reviewed). */
    is_resubmission: boolean;
  } | null;
  bucket: 'submitted' | 'reviewed' | 'missing';
}

/**
 * Roster for a DRAWING-type assignment. Like getAssignmentRoster, but each
 * student's work comes from the Drawing channel (drawing_submissions keyed by
 * assignment_id), latest attempt only. Buckets: submitted (awaiting/redo),
 * reviewed (teacher completed), missing. The teacher opens the drawing id in
 * the existing smart-evaluation screen.
 */
export async function getAssignmentDrawingRoster(
  assignmentId: string,
  client?: TypedSupabaseClient,
): Promise<{ assignment: NexusClassAssignment; rows: AssignmentDrawingRosterRow[] }> {
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
    .from('drawing_submissions')
    .select('id, student_id, status, submitted_at, tutor_rating, tutor_marks, attempt_number')
    .eq('assignment_id', assignmentId)
    .order('submitted_at', { ascending: false });
  if (sErr) throw sErr;
  // Latest attempt per student (rows already newest-first) plus a real count of
  // attempts, so the roster can flag resubmissions and show "attempt N of M".
  const latestByStudent = new Map<string, any>();
  const countByStudent = new Map<string, number>();
  for (const s of subs || []) {
    countByStudent.set(s.student_id, (countByStudent.get(s.student_id) || 0) + 1);
    if (!latestByStudent.has(s.student_id)) latestByStudent.set(s.student_id, s);
  }

  const rows: AssignmentDrawingRosterRow[] = [];
  const seen = new Set<string>();
  for (const en of enrollments || []) {
    const user = en.user as unknown as AssignmentDrawingRosterRow['student'] & { is_alumni?: boolean };
    if (!user || user.is_alumni || seen.has(user.id)) continue;
    seen.add(user.id);
    const d = latestByStudent.get(user.id) || null;
    const count = countByStudent.get(user.id) || 0;
    let bucket: AssignmentDrawingRosterRow['bucket'] = 'missing';
    if (d) bucket = d.status === 'completed' || d.status === 'reviewed' ? 'reviewed' : 'submitted';
    rows.push({
      student: { id: user.id, name: user.name, email: user.email, avatar_url: user.avatar_url },
      drawing: d
        ? {
            id: d.id,
            status: d.status,
            submitted_at: d.submitted_at,
            tutor_rating: d.tutor_rating,
            tutor_marks: d.tutor_marks,
            attempt_number: d.attempt_number,
            attempt_count: count,
            is_resubmission: count > 1 && d.status !== 'completed' && d.status !== 'reviewed',
          }
        : null,
      bucket,
    });
  }
  rows.sort((a, b) => (a.student.name || '').localeCompare(b.student.name || ''));
  return { assignment, rows };
}

// ------------------------------------------------------------------
// Personal-clock helpers (day math). Canonical client-safe copy lives in
// apps/nexus/src/lib/assignment-clock.ts; duplicated here (like
// ASSIGNMENT_ATTACHMENTS_FOLDER_ID) so server rollups avoid importing app code.
// ------------------------------------------------------------------
const DAY_MS = 86_400_000;
function istTodayYmd(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}
function dayEpoch(s: string): number {
  return Date.parse(`${s.slice(0, 10)}T00:00:00Z`);
}
function addDaysYmd(ymd: string, days: number): string {
  return new Date(dayEpoch(ymd) + days * DAY_MS).toISOString().slice(0, 10);
}
function diffDaysYmd(from: string, to: string): number {
  return Math.round((dayEpoch(to) - dayEpoch(from)) / DAY_MS);
}
/** Personal start/due for one (assignment, student), mirroring assignment-clock.ts. */
function personalDeadline(
  classDate: string,
  enrolledAt: string | null,
  dueAt: string | null,
  windowDays: number,
): { personalStart: string; personalDue: string | null; isLate: boolean } {
  const classDay = classDate.slice(0, 10);
  const enrolledDay = enrolledAt ? enrolledAt.slice(0, 10) : null;
  const isLate = !!enrolledDay && enrolledDay > classDay;
  const personalStart = isLate ? (enrolledDay as string) : classDay;
  const personalDue = isLate
    ? addDaysYmd(personalStart, Math.max(0, windowDays || 0))
    : dueAt
      ? dueAt.slice(0, 10)
      : null;
  return { personalStart, personalDue, isLate };
}

/**
 * Resolve the class recording to show a late joiner: the assignment's own
 * recording, else the recording on its linked scheduled class (YouTube backup
 * preferred, then the Teams/SharePoint copy).
 */
export async function resolveAssignmentRecording(
  assignment: Pick<NexusClassAssignment, 'recording_url' | 'recording_source' | 'plan_entry_id'>,
  client?: TypedSupabaseClient,
): Promise<{ url: string | null; source: 'youtube' | 'sharepoint' | null }> {
  if (assignment.recording_url) {
    return { url: assignment.recording_url, source: (assignment.recording_source as any) ?? 'sharepoint' };
  }
  if (!assignment.plan_entry_id) return { url: null, source: null };
  const supabase = client || getSupabaseAdminClient();
  const { data } = await supabase
    .from('nexus_scheduled_classes')
    .select('recording_url, youtube_url')
    .eq('plan_entry_id', assignment.plan_entry_id)
    .limit(1);
  const row = (data || [])[0];
  if (row?.youtube_url) return { url: row.youtube_url, source: 'youtube' };
  if (row?.recording_url) return { url: row.recording_url, source: 'sharepoint' };
  return { url: null, source: null };
}

export interface StudentAssignmentItem extends NexusClassAssignment {
  submission: NexusAssignmentSubmission | null;
  /** For drawing assignments: the teacher's 1-5 rating (null until reviewed). */
  drawing_rating?: number | null;
  /** For marks-graded drawing assignments: the numeric mark (null until reviewed). */
  drawing_marks?: number | null;
  /** For drawing assignments: the teacher's encouraging reaction (null until sent). */
  drawing_reaction?: GalleryReactionType | null;
  /** The student's enrolment timestamp (drives the personal clock in the UI). */
  enrolled_at: string | null;
  /** Class recording for catch-up: the assignment's own, else the linked class. */
  resolved_recording_url: string | null;
  resolved_recording_source: 'youtube' | 'sharepoint' | null;
}

/**
 * A student's published assignments for a classroom, each with their submission,
 * their enrolment date (so the UI can render the personal clock), and a resolved
 * class-recording link (the assignment's own, else the linked scheduled class).
 */
export async function listAssignmentsForStudent(
  studentId: string,
  classroomId: string,
  client?: TypedSupabaseClient,
): Promise<StudentAssignmentItem[]> {
  const supabase = client || getSupabaseAdminClient();

  const { data: enrollment } = await supabase
    .from('nexus_enrollments')
    .select('enrolled_at')
    .eq('classroom_id', classroomId)
    .eq('user_id', studentId)
    .eq('is_active', true)
    .maybeSingle();
  const enrolledAt = enrollment?.enrolled_at ?? null;

  const { data: assignments, error: aErr } = await supabase
    .from(ASSIGNMENTS)
    .select('*')
    .eq('classroom_id', classroomId)
    .eq('status', 'published')
    .order('class_date', { ascending: false });
  if (aErr) throw aErr;
  const list = (assignments || []) as NexusClassAssignment[];
  if (!list.length) return [];

  const ids = list.map((a) => a.id);
  const subMap = await getMySubmissions(studentId, ids, supabase);

  // Drawing assignments keep the student's work in drawing_submissions; synthesize
  // a submission (status + rating) so the To do / Done tabs and chips work.
  const drawingIds = list.filter((a) => a.assignment_type === 'drawing').map((a) => a.id);
  const drawingByAssignment = new Map<
    string,
    { status: string; tutor_rating: number | null; tutor_marks: number | null; reaction: GalleryReactionType | null; tutor_feedback: string | null; submitted_at: string }
  >();
  if (drawingIds.length) {
    const { data: ds } = await supabase
      .from('drawing_submissions')
      .select('assignment_id, status, tutor_rating, tutor_marks, reaction, tutor_feedback, submitted_at')
      .eq('student_id', studentId)
      .in('assignment_id', drawingIds)
      .order('submitted_at', { ascending: false });
    for (const r of ds || []) {
      if (!drawingByAssignment.has(r.assignment_id)) {
        drawingByAssignment.set(r.assignment_id, {
          status: r.status,
          tutor_rating: r.tutor_rating,
          tutor_marks: r.tutor_marks,
          reaction: r.reaction,
          tutor_feedback: r.tutor_feedback,
          submitted_at: r.submitted_at,
        });
      }
    }
  }
  const mapDrawingStatus = (s: string): 'submitted' | 'reviewed' | 'redo' =>
    s === 'completed' || s === 'reviewed' ? 'reviewed' : s === 'redo' ? 'redo' : 'submitted';

  // Resolve fallback recordings from the linked scheduled classes in one query.
  const entryIds = [...new Set(list.map((a) => a.plan_entry_id).filter(Boolean))] as string[];
  const recByEntry = new Map<string, { recording_url: string | null; youtube_url: string | null }>();
  if (entryIds.length) {
    const { data: classes } = await supabase
      .from('nexus_scheduled_classes')
      .select('plan_entry_id, recording_url, youtube_url')
      .in('plan_entry_id', entryIds);
    for (const c of classes || []) {
      if (c.plan_entry_id && !recByEntry.has(c.plan_entry_id)) {
        recByEntry.set(c.plan_entry_id, { recording_url: c.recording_url, youtube_url: c.youtube_url });
      }
    }
  }

  return list.map((a) => {
    let recUrl = a.recording_url;
    let recSrc = a.recording_source as 'youtube' | 'sharepoint' | null;
    if (!recUrl && a.plan_entry_id) {
      const fallback = recByEntry.get(a.plan_entry_id);
      if (fallback?.youtube_url) {
        recUrl = fallback.youtube_url;
        recSrc = 'youtube';
      } else if (fallback?.recording_url) {
        recUrl = fallback.recording_url;
        recSrc = 'sharepoint';
      }
    }
    let submission = subMap.get(a.id) ?? null;
    let drawingRating: number | null = null;
    let drawingMarks: number | null = null;
    let drawingReaction: GalleryReactionType | null = null;
    if (a.assignment_type === 'drawing') {
      const d = drawingByAssignment.get(a.id);
      submission = d
        ? ({
            status: mapDrawingStatus(d.status),
            marks: d.tutor_marks,
            reaction: d.reaction,
            feedback: d.tutor_feedback,
            submitted_at: d.submitted_at,
          } as unknown as NexusAssignmentSubmission)
        : null;
      drawingRating = d ? d.tutor_rating : null;
      drawingMarks = d ? d.tutor_marks : null;
      drawingReaction = d ? d.reaction : null;
    }
    return {
      ...a,
      submission,
      drawing_rating: drawingRating,
      drawing_marks: drawingMarks,
      drawing_reaction: drawingReaction,
      enrolled_at: enrolledAt,
      resolved_recording_url: recUrl ?? null,
      resolved_recording_source: recUrl ? recSrc : null,
    } as StudentAssignmentItem;
  });
}

export type AssignmentEngagementStatus = 'active' | 'partial' | 'inactive';

export interface AssignmentEngagementRow {
  student: { id: string; name: string | null; email: string | null; avatar_url: string | null };
  enrolled_at: string | null;
  is_late_joiner: boolean;
  /** Assignments whose personal clock has started for this student (due to them). */
  applicable: number;
  submitted: number;
  reviewed: number;
  on_time: number;
  overdue: number;
  avg_marks_pct: number | null;
  last_submitted_at: string | null;
  days_since_last: number | null;
  status: AssignmentEngagementStatus;
}

export interface AssignmentEngagement {
  stats: { total_students: number; active: number; partial: number; inactive: number; avg_marks_pct: number | null };
  rows: AssignmentEngagementRow[];
}

/**
 * Per active non-alumni student, their standing across all published assignments
 * of the classroom, judged on each student's PERSONAL clock (so late joiners are
 * fair). Status thresholds mirror the library-engagement convention:
 *   active   = submitted within 7 days AND submitted/applicable >= 0.7
 *   inactive = nothing submitted, OR nothing in the last 14 days
 *   partial  = everything in between
 */
export async function getAssignmentEngagement(
  classroomId: string,
  client?: TypedSupabaseClient,
): Promise<AssignmentEngagement> {
  const supabase = client || getSupabaseAdminClient();
  const today = istTodayYmd();

  const { data: assignments, error: aErr } = await supabase
    .from(ASSIGNMENTS)
    .select('id, class_date, due_at, catchup_window_days, max_marks, assignment_type')
    .eq('classroom_id', classroomId)
    .eq('status', 'published');
  if (aErr) throw aErr;
  const assns = (assignments || []) as Array<{
    id: string;
    class_date: string;
    due_at: string | null;
    catchup_window_days: number;
    max_marks: number;
    assignment_type: string;
  }>;
  const assnById = new Map(assns.map((a) => [a.id, a]));

  const { data: enrollments, error: enErr } = await supabase
    .from('nexus_enrollments')
    .select(
      'enrolled_at, user:users!nexus_enrollments_user_id_fkey(id, name, email, avatar_url, is_alumni)',
    )
    .eq('classroom_id', classroomId)
    .eq('role', 'student')
    .eq('is_active', true);
  if (enErr) throw enErr;

  const students: { id: string; name: string | null; email: string | null; avatar_url: string | null; enrolled_at: string | null }[] = [];
  const seen = new Set<string>();
  for (const en of enrollments || []) {
    const u = en.user as unknown as { id: string; name: string | null; email: string | null; avatar_url: string | null; is_alumni?: boolean };
    if (!u || u.is_alumni || seen.has(u.id)) continue;
    seen.add(u.id);
    students.push({ id: u.id, name: u.name, email: u.email, avatar_url: u.avatar_url, enrolled_at: en.enrolled_at ?? null });
  }

  // All submissions for these assignments, grouped by student, normalized across
  // document (nexus_assignment_submissions) and drawing (drawing_submissions).
  type NormSub = { assignment_id: string; reviewed: boolean; submitted_at: string; marks_pct: number | null };
  const subsByStudent = new Map<string, NormSub[]>();
  const pushNorm = (studentId: string, s: NormSub) => {
    const arr = subsByStudent.get(studentId) || [];
    arr.push(s);
    subsByStudent.set(studentId, arr);
  };

  const docIds = assns.filter((a) => a.assignment_type !== 'drawing').map((a) => a.id);
  const drawIds = assns.filter((a) => a.assignment_type === 'drawing').map((a) => a.id);

  if (docIds.length) {
    const { data: subs, error: sErr } = await supabase.from(SUBMISSIONS).select('*').in('assignment_id', docIds);
    if (sErr) throw sErr;
    for (const s of subs || []) {
      const a = assnById.get(s.assignment_id);
      const pct = s.marks != null && a && a.max_marks > 0 ? (s.marks / a.max_marks) * 100 : null;
      pushNorm(s.student_id, { assignment_id: s.assignment_id, reviewed: s.status === 'reviewed', submitted_at: s.submitted_at, marks_pct: pct });
    }
  }

  if (drawIds.length) {
    const { data: ds, error: dErr } = await supabase
      .from('drawing_submissions')
      .select('assignment_id, student_id, status, tutor_rating, submitted_at')
      .in('assignment_id', drawIds)
      .order('submitted_at', { ascending: false });
    if (dErr) throw dErr;
    // Latest attempt only, per (student, assignment).
    const seenPair = new Set<string>();
    for (const r of ds || []) {
      const key = `${r.student_id}_${r.assignment_id}`;
      if (seenPair.has(key)) continue;
      seenPair.add(key);
      const reviewed = r.status === 'completed' || r.status === 'reviewed';
      const pct = reviewed && r.tutor_rating != null ? (r.tutor_rating / 5) * 100 : null;
      pushNorm(r.student_id, { assignment_id: r.assignment_id, reviewed, submitted_at: r.submitted_at, marks_pct: pct });
    }
  }

  const rows: AssignmentEngagementRow[] = students.map((st) => {
    let applicable = 0;
    let isLate = false;
    const dueByAssn = new Map<string, string | null>();
    for (const a of assns) {
      const pd = personalDeadline(a.class_date, st.enrolled_at, a.due_at, a.catchup_window_days);
      if (pd.isLate) isLate = true;
      dueByAssn.set(a.id, pd.personalDue);
      if (pd.personalStart <= today) applicable += 1;
    }

    const subs = subsByStudent.get(st.id) || [];
    let submitted = 0;
    let reviewed = 0;
    let onTime = 0;
    let lastSubmittedAt: string | null = null;
    const marksPcts: number[] = [];
    for (const s of subs) {
      submitted += 1;
      if (s.reviewed) reviewed += 1;
      const personalDue = dueByAssn.get(s.assignment_id) ?? null;
      if (!personalDue || s.submitted_at.slice(0, 10) <= personalDue) onTime += 1;
      if (!lastSubmittedAt || s.submitted_at > lastSubmittedAt) lastSubmittedAt = s.submitted_at;
      if (s.marks_pct != null) marksPcts.push(s.marks_pct);
    }
    const overdue = Math.max(0, applicable - submitted); // rough: unmet applicable work
    const avgMarksPct = marksPcts.length ? Math.round(marksPcts.reduce((x, y) => x + y, 0) / marksPcts.length) : null;
    const daysSinceLast = lastSubmittedAt ? diffDaysYmd(lastSubmittedAt, today) : null;

    let status: AssignmentEngagementStatus;
    const ratio = applicable > 0 ? submitted / applicable : 0;
    if (submitted === 0 || (daysSinceLast != null && daysSinceLast > 14)) status = 'inactive';
    else if (daysSinceLast != null && daysSinceLast <= 7 && ratio >= 0.7) status = 'active';
    else status = 'partial';

    return {
      student: { id: st.id, name: st.name, email: st.email, avatar_url: st.avatar_url },
      enrolled_at: st.enrolled_at,
      is_late_joiner: isLate,
      applicable,
      submitted,
      reviewed,
      on_time: onTime,
      overdue,
      avg_marks_pct: avgMarksPct,
      last_submitted_at: lastSubmittedAt,
      days_since_last: daysSinceLast,
      status,
    };
  });

  rows.sort((a, b) => (a.student.name || '').localeCompare(b.student.name || ''));
  const allPcts = rows.map((r) => r.avg_marks_pct).filter((x): x is number => x != null);
  const stats = {
    total_students: rows.length,
    active: rows.filter((r) => r.status === 'active').length,
    partial: rows.filter((r) => r.status === 'partial').length,
    inactive: rows.filter((r) => r.status === 'inactive').length,
    avg_marks_pct: allPcts.length ? Math.round(allPcts.reduce((x, y) => x + y, 0) / allPcts.length) : null,
  };
  return { stats, rows };
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
  review: {
    marks: number | null;
    feedback: string | null;
    action: 'complete' | 'redo';
    reviewed_by: string;
    reaction?: GalleryReactionType | null;
  },
  client?: TypedSupabaseClient,
): Promise<NexusAssignmentSubmission> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(SUBMISSIONS)
    .update({
      marks: review.marks,
      feedback: review.feedback,
      status: review.action === 'redo' ? 'redo' : 'reviewed',
      reaction: review.reaction ?? null,
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

/** Classrooms a student is actively enrolled in (for the Assignments space). */
export async function listActiveEnrolledClassrooms(
  userId: string,
  client?: TypedSupabaseClient,
): Promise<{ id: string; name: string | null; type: string | null }[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_enrollments')
    .select('classroom:nexus_classrooms(id, name, type, is_active)')
    .eq('user_id', userId)
    .eq('role', 'student')
    .eq('is_active', true);
  if (error) throw error;
  const byId = new Map<string, { id: string; name: string | null; type: string | null }>();
  for (const e of data || []) {
    const c = e.classroom as unknown as { id: string; name: string | null; type: string | null; is_active?: boolean };
    if (c && c.is_active !== false && !byId.has(c.id)) byId.set(c.id, { id: c.id, name: c.name, type: c.type });
  }
  return [...byId.values()];
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

// ============================================================
// Assignment reminders (sent-log): who was reminded, when, by whom
// ============================================================

const REMINDERS = 'nexus_assignment_reminders';

/** Per-student reminder rollup for one assignment. */
export interface AssignmentReminderSummary {
  count: number;
  last_sent_at: string;
}

/**
 * Record one reminder send for a (assignment, student) pair. Best-effort: the
 * caller has already delivered the message, so a logging failure must never
 * break the send flow.
 */
export async function recordAssignmentReminder(
  input: {
    assignment_id: string;
    student_id: string;
    sent_by?: string | null;
    channel?: string | null;
    template?: string | null;
  },
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  try {
    await supabase.from(REMINDERS).insert({
      assignment_id: input.assignment_id,
      student_id: input.student_id,
      sent_by: input.sent_by ?? null,
      channel: input.channel ?? null,
      template: input.template ?? null,
    });
  } catch (err) {
    console.error('recordAssignmentReminder failed:', err);
  }
}

/**
 * Per-student reminder summary for one assignment: how many reminders each student
 * has received and when the most recent one went out. Drives the "Reminded 2d ago
 * · x2" hint on the not-submitted list so staff don't double-nag.
 */
export async function getAssignmentReminderSummary(
  assignmentId: string,
  client?: TypedSupabaseClient,
): Promise<Record<string, AssignmentReminderSummary>> {
  const supabase = client || getSupabaseAdminClient();
  const { data } = await supabase
    .from(REMINDERS)
    .select('student_id, sent_at')
    .eq('assignment_id', assignmentId)
    .order('sent_at', { ascending: false });

  const out: Record<string, AssignmentReminderSummary> = {};
  for (const row of (data as { student_id: string; sent_at: string }[]) || []) {
    const existing = out[row.student_id];
    if (!existing) {
      // Rows arrive newest-first, so the first one seen is the latest send.
      out[row.student_id] = { count: 1, last_sent_at: row.sent_at };
    } else {
      existing.count += 1;
    }
  }
  return out;
}
