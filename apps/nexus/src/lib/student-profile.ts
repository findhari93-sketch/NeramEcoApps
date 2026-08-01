/**
 * The core student-profile bundle: everything a staff member may see about a
 * student that is not money and not performance.
 *
 * Kept in apps/nexus rather than packages/database on purpose. This is the same
 * reasoning documented at the top of lib/geo-students.ts: a change here rebuilds
 * one app on Vercel, a change in packages/database rebuilds all four.
 *
 * ---------------------------------------------------------------------------
 * TWO WAVES, THIRTEEN QUERIES, NO N+1.
 *
 * Wave 1 validates the student and the enrolment, because everything after it
 * needs `batch_id` and the lead-profile id. Wave 2 is eleven independent reads
 * fired together.
 *
 * Every query carries its student predicate in SQL. That is a deliberate
 * departure from getUserJourneyDetail in packages/database/src/queries/crm.ts,
 * which fetches every payment_installments row and the ten most recent
 * scholarship_applications GLOBALLY and then filters in JavaScript. Copying that
 * shape here would make one teacher opening one profile read the whole table.
 * ---------------------------------------------------------------------------
 *
 * The commercial columns are absent from every select in this file. They are
 * only ever named in the finance route. See lib/student-finance.ts.
 */

import { getSupabaseAdminClient, getCurrentBatch, pairStatus } from '@neram/database';
import {
  LEAD_PROFILE_KEY_COLUMNS,
  LEAD_PROFILE_PUBLIC_COLUMNS,
  STUDENT_PROFILE_PUBLIC_COLUMNS,
  selectColumns,
} from './student-finance';
import { maskAadhaar } from './student-profile-fields';
import type {
  ProfileChecklistItem,
  ProfileDocument,
  ProfileGuardian,
  ProfileParentAccess,
  ProfileTimelineEvent,
  StudentProfileCore,
} from './student-profile-types';

/** Above this many open checklist items we stop shipping them to a phone. */
const CHECKLIST_ITEM_CAP = 60;
/** The activity feed is a summary, not an audit log. */
const TIMELINE_CAP = 40;

export class StudentNotInClassroomError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StudentNotInClassroomError';
  }
}

/**
 * Load the core bundle.
 *
 * Throws StudentNotInClassroomError when the student does not exist or is not
 * enrolled here, so the route can answer 404 without inspecting a message.
 */
export async function loadStudentProfileCore(
  studentId: string,
  classroomId: string,
  options: { includeAllChecklist?: boolean } = {},
): Promise<StudentProfileCore> {
  const supabase = getSupabaseAdminClient();

  // ── Wave 1: does this student exist, and are they in this classroom ────────
  const [userResult, enrollmentResult] = await Promise.all([
    supabase
      .from('users')
      .select(
        'id, name, first_name, last_name, email, personal_email, phone, avatar_url, ' +
          'date_of_birth, gender, ms_oid, linked_classroom_email, academic_year, ' +
          'student_program, lifecycle_status, is_alumni, photo_status, ' +
          'last_login_at, nexus_first_login_at, nexus_last_login_at',
      )
      .eq('id', studentId)
      .single(),

    supabase
      .from('nexus_enrollments')
      .select(
        'enrolled_at, batch_id, current_standard, current_standard_source, ' +
          'current_standard_set_at, participation_status, dormant_since, dormant_reason',
      )
      .eq('classroom_id', classroomId)
      .eq('user_id', studentId)
      .eq('role', 'student')
      .single(),
  ]);

  if (userResult.error || !userResult.data) {
    throw new StudentNotInClassroomError('Student not found');
  }
  if (enrollmentResult.error || !enrollmentResult.data) {
    throw new StudentNotInClassroomError('Student not enrolled in this classroom');
  }

  const user = userResult.data as any;
  const enrollment = enrollmentResult.data as any;

  // ── Wave 2: eleven independent reads ──────────────────────────────────────
  const [
    leadResult,
    recordResult,
    postEnrolResult,
    parentLinkResult,
    documentsResult,
    checklistItemsResult,
    checklistProgressResult,
    topicTotalResult,
    topicProgressResult,
    classroomResult,
    historyResult,
    classificationResult,
    currentBatchRow,
  ] = await Promise.all([
    // Latest non-deleted application. Filtered and ordered in SQL, never in JS.
    supabase
      .from('lead_profiles')
      .select(selectColumns(LEAD_PROFILE_KEY_COLUMNS, LEAD_PROFILE_PUBLIC_COLUMNS))
      .eq('user_id', studentId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabase
      .from('student_profiles')
      .select(selectColumns(STUDENT_PROFILE_PUBLIC_COLUMNS))
      .eq('user_id', studentId)
      .maybeSingle(),

    supabase
      .from('post_enrollment_details')
      .select(
        'father_name, father_phone, father_occupation, mother_name, mother_phone, ' +
          'mother_occupation, emergency_contact_name, emergency_contact_phone, ' +
          'emergency_contact_relation, blood_group, medical_conditions, ' +
          'aadhar_number, aadhar_verified, nexus_account_created, nexus_created_at',
      )
      .eq('user_id', studentId)
      .maybeSingle(),

    // Credentials are NOT embedded here. nexus_parent_links has foreign keys to
    // users and to the classroom, but none to nexus_parent_credentials: the two
    // meet only through parent_user_id. PostgREST cannot embed across that, so
    // asking for it returns a relationship error rather than a null. The
    // credential row is fetched separately below, and only when a link exists.
    supabase
      .from('nexus_parent_links')
      .select('parent_user_id, relationship, is_primary, is_active')
      .eq('student_user_id', studentId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle(),

    supabase
      .from('nexus_student_documents')
      .select(
        'id, category, title, file_url, sharepoint_web_url, status, version, ' +
          'uploaded_at, verified_at, rejection_reason',
      )
      .eq('student_id', studentId)
      .eq('is_current', true)
      .eq('is_deleted', false)
      .order('uploaded_at', { ascending: false }),

    supabase
      .from('nexus_checklist_items')
      .select('id, title, topic:nexus_topics(title, category)')
      .eq('classroom_id', classroomId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),

    supabase
      .from('nexus_student_checklist_progress')
      .select('checklist_item_id, is_completed, completed_at')
      .eq('student_id', studentId),

    supabase
      .from('nexus_topics')
      .select('id', { count: 'exact', head: true })
      .eq('classroom_id', classroomId)
      .eq('is_active', true),

    supabase
      .from('nexus_student_topic_progress')
      .select('topic_id, status, completed_at')
      .eq('student_id', studentId)
      .eq('classroom_id', classroomId),

    supabase.from('nexus_classrooms').select('id, name').eq('id', classroomId).maybeSingle(),

    supabase
      .from('nexus_enrollment_history')
      .select('action, reason_category, notes, created_at')
      .eq('user_id', studentId)
      .eq('classroom_id', classroomId)
      .order('created_at', { ascending: false })
      .limit(TIMELINE_CAP),

    // nexus_enrollment_classification_events is absent from
    // database.generated.ts. Documented `as any` pattern, see lib/parent-data.ts.
    (supabase.from('nexus_enrollment_classification_events' as any) as any)
      .select('axis, from_value, to_value, reason, created_at')
      .eq('student_id', studentId)
      .eq('classroom_id', classroomId)
      .order('created_at', { ascending: false })
      .limit(TIMELINE_CAP),

    getCurrentBatch(),
  ]);

  const lead = (leadResult.data as any) ?? null;
  const record = (recordResult.data as any) ?? null;
  const postEnrol = (postEnrolResult.data as any) ?? null;

  // ── Checklist ─────────────────────────────────────────────────────────────
  const progressMap = new Map<string, { is_completed: boolean; completed_at: string | null }>(
    ((checklistProgressResult.data as any[]) || []).map((p) => [p.checklist_item_id, p]),
  );

  const allChecklist: ProfileChecklistItem[] = (
    (checklistItemsResult.data as any[]) || []
  ).map((item) => {
    const progress = progressMap.get(item.id);
    return {
      id: item.id,
      title: item.title ?? null,
      topicTitle: item.topic?.title ?? null,
      topicCategory: item.topic?.category ?? null,
      is_completed: progress?.is_completed ?? false,
      completed_at: progress?.completed_at ?? null,
    };
  });

  const completedChecklist = allChecklist.filter((i) => i.is_completed).length;

  // Only the open items travel by default. The done ones are a count; a large
  // classroom would otherwise ship tens of kilobytes a phone never renders.
  const openChecklist = options.includeAllChecklist
    ? allChecklist
    : allChecklist.filter((i) => !i.is_completed);
  const checklistItems = openChecklist.slice(0, CHECKLIST_ITEM_CAP);

  // ── Guardian, three sources in descending richness ────────────────────────
  const guardian = buildGuardian(postEnrol, lead, record);

  // ── Parent portal access ──────────────────────────────────────────────────
  // One extra query, and only when a parent is actually linked. In prod that is
  // a single-digit number of students, so this is cheaper than joining through
  // users on every profile load.
  const link = (parentLinkResult.data as any) ?? null;
  let credential: any = null;
  if (link?.parent_user_id) {
    const { data } = await supabase
      .from('nexus_parent_credentials')
      .select('login_id, is_active, last_login_at')
      .eq('parent_user_id', link.parent_user_id)
      .maybeSingle();
    credential = data ?? null;
  }

  const parentAccess: ProfileParentAccess = {
    linked: !!link,
    relationship: link?.relationship ?? null,
    is_primary: link?.is_primary ?? null,
    login_id: credential?.login_id ?? null,
    credential_active: credential?.is_active ?? null,
    last_login_at: credential?.last_login_at ?? null,
  };

  const documents: ProfileDocument[] = ((documentsResult.data as any[]) || []).map((d) => ({
    id: d.id,
    category: d.category ?? null,
    title: d.title ?? null,
    file_url: d.file_url ?? null,
    sharepoint_web_url: d.sharepoint_web_url ?? null,
    status: d.status ?? null,
    version: d.version ?? null,
    uploaded_at: d.uploaded_at ?? null,
    verified_at: d.verified_at ?? null,
    rejection_reason: d.rejection_reason ?? null,
  }));

  const topicRows = (topicProgressResult.data as any[]) || [];

  return {
    student: {
      id: user.id,
      name: user.name ?? null,
      first_name: user.first_name ?? null,
      last_name: user.last_name ?? null,
      email: user.email ?? null,
      personal_email: user.personal_email ?? null,
      phone: user.phone ?? null,
      avatar_url: user.avatar_url ?? null,
      date_of_birth: user.date_of_birth ?? null,
      gender: user.gender ?? null,
      ms_oid: user.ms_oid ?? null,
      linked_classroom_email: user.linked_classroom_email ?? null,
      academic_year: user.academic_year ?? null,
      student_program: user.student_program ?? null,
      lifecycle_status: user.lifecycle_status ?? null,
      is_alumni: user.is_alumni ?? null,
      photo_status: user.photo_status ?? null,
      last_login_at: user.last_login_at ?? null,
      nexus_first_login_at: user.nexus_first_login_at ?? null,
      nexus_last_login_at: user.nexus_last_login_at ?? null,
    },
    enrollment: {
      enrolled_at: enrollment.enrolled_at ?? null,
      batch_id: enrollment.batch_id ?? null,
      study_stage: enrollment.current_standard ?? null,
      study_stage_source: enrollment.current_standard_source ?? null,
      study_stage_set_at: enrollment.current_standard_set_at ?? null,
      participation_status: enrollment.participation_status ?? 'active',
      dormant_since: enrollment.dormant_since ?? null,
      dormant_reason: enrollment.dormant_reason ?? null,
      pair_status: pairStatus(
        enrollment.current_standard ?? null,
        user.academic_year ?? null,
        currentBatchRow?.code ?? '',
      ),
    },
    record: record
      ? {
          student_id: record.student_id ?? null,
          enrollment_date: record.enrollment_date ?? null,
          course_id: record.course_id ?? null,
          ms_teams_email: record.ms_teams_email ?? null,
          notes: record.notes ?? null,
          last_activity_at: record.last_activity_at ?? null,
        }
      : null,
    classroom: {
      id: classroomId,
      name: (classroomResult.data as any)?.name ?? null,
    },
    application: lead
      ? {
          application_number: lead.application_number ?? null,
          status: lead.status ?? null,
          form_step_completed: lead.form_step_completed ?? null,
          form_completed_at: lead.form_completed_at ?? null,
          created_at: lead.created_at ?? null,
          applicant_category: lead.applicant_category ?? null,
          target_exam_year: lead.target_exam_year ?? null,
          school_type: lead.school_type ?? null,
          learning_mode: lead.learning_mode ?? null,
          interest_course: lead.interest_course ?? null,
          hybrid_learning_accepted: lead.hybrid_learning_accepted ?? null,
          phone_verified: lead.phone_verified ?? null,
          phone_verified_at: lead.phone_verified_at ?? null,
          academic_data: lead.academic_data ?? null,
          country: lead.country ?? null,
          state: lead.state ?? null,
          district: lead.district ?? null,
          city: lead.city ?? null,
          pincode: lead.pincode ?? null,
          address: lead.address ?? null,
          latitude: lead.latitude ?? null,
          longitude: lead.longitude ?? null,
          location_source: lead.location_source ?? null,
        }
      : null,
    guardian,
    parentAccess,
    documents,
    checklist: {
      completed: completedChecklist,
      total: allChecklist.length,
      items: checklistItems,
      truncated: checklistItems.length < openChecklist.length,
    },
    topics: {
      completed: topicRows.filter((t) => t.status === 'completed').length,
      total: topicTotalResult.count || 0,
    },
    timeline: buildTimeline({
      history: (historyResult.data as any[]) || [],
      classification: (classificationResult.data as any[]) || [],
      documents,
      user,
      lead,
      postEnrol,
    }),
    currentBatch: currentBatchRow?.code ?? null,
    // Overwritten by the route, which knows the caller. Defaults closed.
    capabilities: { finance: false },
  };
}

/**
 * Merge guardian details from the three tables that hold them, and record which
 * one won.
 *
 * post_enrollment_details covers roughly a fifth of the roster, so falling back
 * silently would make a card look empty when the data exists on the application
 * form. Naming the source lets the UI say where it came from.
 */
function buildGuardian(
  postEnrol: any | null,
  lead: any | null,
  record: any | null,
): ProfileGuardian {
  const base: ProfileGuardian = {
    source: null,
    father_name: null,
    father_phone: null,
    father_occupation: null,
    mother_name: null,
    mother_phone: null,
    mother_occupation: null,
    emergency_contact_name: null,
    emergency_contact_phone: null,
    emergency_contact_relation: null,
    blood_group: null,
    medical_conditions: null,
    aadhaar_masked: null,
    aadhaar_verified: null,
  };

  if (postEnrol) {
    return {
      ...base,
      source: 'post_enrollment',
      father_name: postEnrol.father_name ?? null,
      father_phone: postEnrol.father_phone ?? null,
      father_occupation: postEnrol.father_occupation ?? null,
      mother_name: postEnrol.mother_name ?? null,
      mother_phone: postEnrol.mother_phone ?? null,
      mother_occupation: postEnrol.mother_occupation ?? null,
      emergency_contact_name: postEnrol.emergency_contact_name ?? null,
      emergency_contact_phone: postEnrol.emergency_contact_phone ?? null,
      emergency_contact_relation: postEnrol.emergency_contact_relation ?? null,
      blood_group: postEnrol.blood_group ?? null,
      medical_conditions: postEnrol.medical_conditions ?? null,
      // Masked here, at the boundary. The raw Aadhaar never enters the payload,
      // so there is nothing to leak even if a component renders the whole object.
      aadhaar_masked: postEnrol.aadhar_number ? maskAadhaar(postEnrol.aadhar_number) : null,
      aadhaar_verified: postEnrol.aadhar_verified ?? null,
    };
  }

  if (lead && (lead.father_name || lead.parent_phone)) {
    return {
      ...base,
      source: 'application',
      father_name: lead.father_name ?? null,
      father_phone: lead.parent_phone ?? null,
    };
  }

  if (record && (record.parent_contact || record.emergency_contact)) {
    return {
      ...base,
      source: 'student_profile',
      father_phone: record.parent_contact ?? null,
      emergency_contact_phone: record.emergency_contact ?? null,
    };
  }

  return base;
}

/** Merge every dated fact we hold into one feed, newest first. */
function buildTimeline(input: {
  history: any[];
  classification: any[];
  documents: ProfileDocument[];
  user: any;
  lead: any | null;
  postEnrol: any | null;
}): ProfileTimelineEvent[] {
  const events: ProfileTimelineEvent[] = [];

  for (const h of input.history) {
    if (!h.created_at) continue;
    events.push({
      at: h.created_at,
      kind: 'enrollment',
      title: labelEnrollmentAction(h.action),
      detail: h.notes || h.reason_category || null,
    });
  }

  for (const c of input.classification) {
    if (!c.created_at) continue;
    events.push({
      at: c.created_at,
      kind: 'classification',
      title: c.axis === 'participation_status' ? 'Participation changed' : 'Classification changed',
      detail: `${c.from_value ?? 'not set'} to ${c.to_value ?? 'not set'}${
        c.reason ? `. ${c.reason}` : ''
      }`,
    });
  }

  for (const d of input.documents) {
    if (d.verified_at) {
      events.push({
        at: d.verified_at,
        kind: 'document',
        title: `Document verified: ${d.title || d.category || 'Untitled'}`,
        detail: d.rejection_reason || null,
      });
    } else if (d.uploaded_at) {
      events.push({
        at: d.uploaded_at,
        kind: 'document',
        title: `Document uploaded: ${d.title || d.category || 'Untitled'}`,
        detail: null,
      });
    }
  }

  if (input.user?.nexus_first_login_at) {
    events.push({
      at: input.user.nexus_first_login_at,
      kind: 'login',
      title: 'Opened Nexus for the first time',
      detail: null,
    });
  }

  if (input.lead?.form_completed_at) {
    events.push({
      at: input.lead.form_completed_at,
      kind: 'application',
      title: 'Completed the application form',
      detail: input.lead.application_number ? `Application ${input.lead.application_number}` : null,
    });
  }

  if (input.postEnrol?.nexus_created_at) {
    events.push({
      at: input.postEnrol.nexus_created_at,
      kind: 'parent_account',
      title: 'Nexus account created',
      detail: null,
    });
  }

  return events
    .filter((e) => !Number.isNaN(Date.parse(e.at)))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, TIMELINE_CAP);
}

function labelEnrollmentAction(action: string | null): string {
  switch (action) {
    case 'enrolled':
      return 'Enrolled in this classroom';
    case 'removed':
      return 'Removed from this classroom';
    case 'reactivated':
      return 'Brought back into this classroom';
    case 'transferred':
      return 'Transferred between classrooms';
    default:
      return action ? `Enrolment: ${action.replace(/_/g, ' ')}` : 'Enrolment updated';
  }
}
