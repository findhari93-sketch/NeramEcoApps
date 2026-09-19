import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { detailRequestProgress, listLiveDetailRequests } from '@neram/database/queries';
import { getRequestUser, assertCapability } from '@/lib/study-materials';
import { errorResponse } from '@/lib/api-errors';
import { canUser } from '@/lib/staff-capabilities';
import {
  formClassLabel,
  formExamYear,
  isApplicationForm,
  pickApplicationForm,
  type ApplicationForm,
  type FormCandidateView,
  type StudentFormReview,
} from '@/lib/application-form';
import { matchApplicationForms, type FormIdentity, type FormMatch } from '@/lib/application-form-match';

export const dynamic = 'force-dynamic';

/**
 * GET /api/students/application-forms?classroom=<id>[&student=<id>]
 *
 * The students in a classroom whose OWN record holds no application form, each
 * with up to three forms on other records that may be theirs (lib/application-form-match).
 * Dormant students are left out of the classroom list, like every count on the
 * Students screen, but `student` asks about one student whatever their state.
 *
 * Read-only. Teachers see it so they know whom to ask for details; linking a form
 * (POST ./link) and rejecting one (POST ./dismiss) need structure.student.account,
 * and `canLink` tells the screen which to offer.
 *
 * No phone number or email of the other record leaves the server. The screen gets
 * the reason ("same phone number") and what the form says, which is all a person
 * needs to decide.
 */

const FORM_FIELDS =
  'id, user_id, application_number, academic_data, applicant_category, target_exam_year, ' +
  'father_name, first_name, city, district, state, source, status, created_at';
const USER_FIELDS = 'id, name, first_name, last_name, email, personal_email, phone, ms_oid, user_type, staff_role';
const MAX_CANDIDATES = 3;
/** PostgREST puts `.in()` values in the URL, so long id lists go in slices. */
const IN_SLICE = 100;

async function selectIn(
  supabase: any,
  table: string,
  fields: string,
  column: string,
  ids: string[],
  activeFormsOnly = false,
): Promise<any[]> {
  const rows: any[] = [];
  for (let i = 0; i < ids.length; i += IN_SLICE) {
    let query = supabase.from(table).select(fields).in(column, ids.slice(i, i + IN_SLICE));
    if (activeFormsOnly) query = query.is('deleted_at', null);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data || []));
  }
  return rows;
}

/** The name a person typed on that record. The apply flow's "User" is not one. */
function typedName(user: any, form: ApplicationForm): string | null {
  const typed = [user?.first_name, user?.last_name].map((part) => String(part || '').trim()).filter(Boolean).join(' ');
  if (typed) return typed;
  if (form.first_name?.trim()) return form.first_name.trim();
  const name = String(user?.name || '').trim();
  return name && name.toLowerCase() !== 'user' ? name : null;
}

function placeOf(form: ApplicationForm): string | null {
  const parts = [form.city, form.district, form.state].map((part) => String(part || '').trim()).filter(Boolean);
  const unique = Array.from(new Set(parts.map((part) => part.toLowerCase()))).map(
    (lower) => parts.find((part) => part.toLowerCase() === lower)!,
  );
  return unique.slice(0, 2).join(', ') || null;
}

export async function GET(request: NextRequest) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    assertCapability(caller, 'coord.student.view');

    const classroomId = request.nextUrl.searchParams.get('classroom');
    const onlyStudent = request.nextUrl.searchParams.get('student');
    if (!classroomId) {
      return NextResponse.json({ error: 'classroom is required' }, { status: 400 });
    }

    const canLink = canUser(caller as any, 'structure.student.account');
    const supabase = getSupabaseAdminClient() as any;

    const { data: enrollments, error: enrollmentError } = await supabase
      .from('nexus_enrollments')
      .select(
        'user_id, participation_status, ' +
          'user:users!nexus_enrollments_user_id_fkey!inner(id, name, email, personal_email, linked_classroom_email, phone, ms_oid, is_alumni)',
      )
      .eq('classroom_id', classroomId)
      .eq('role', 'student')
      .eq('is_active', true)
      .eq('users.is_alumni', false);
    if (enrollmentError) throw enrollmentError;

    const roster = ((enrollments || []) as any[]).filter((row) =>
      onlyStudent ? row.user_id === onlyStudent : row.participation_status !== 'dormant',
    );
    if (!roster.length) return NextResponse.json({ students: [], canLink });

    const ownForms = await selectIn(
      supabase,
      'lead_profiles',
      FORM_FIELDS,
      'user_id',
      roster.map((row) => row.user_id),
      true,
    );
    const hasForm = new Set(ownForms.filter((row) => isApplicationForm(row)).map((row) => row.user_id));
    const missing = roster.filter((row) => !hasForm.has(row.user_id));
    if (!missing.length) return NextResponse.json({ students: [], canLink });
    const missingIds = missing.map((row) => row.user_id as string);

    // The pool: the newest real form on every record that is not itself a Nexus
    // student. A second ENROLLED record is the "may have two records" case, which
    // is merged in Admin, not here.
    const [{ data: poolRows, error: poolError }, { data: nexusStudents, error: nexusError }] = await Promise.all([
      supabase.from('lead_profiles').select(FORM_FIELDS).is('deleted_at', null).limit(5000),
      supabase.from('nexus_enrollments').select('user_id').eq('role', 'student').eq('is_active', true).limit(5000),
    ]);
    if (poolError) throw poolError;
    if (nexusError) throw nexusError;

    const enrolled = new Set(((nexusStudents || []) as any[]).map((row) => row.user_id));
    const rowsByUser = new Map<string, ApplicationForm[]>();
    for (const row of (poolRows || []) as ApplicationForm[]) {
      if (enrolled.has(row.user_id)) continue;
      const list = rowsByUser.get(row.user_id) ?? [];
      list.push(row);
      rowsByUser.set(row.user_id, list);
    }
    const poolForms = new Map<string, ApplicationForm>();
    for (const [userId, rows] of rowsByUser) {
      const form = pickApplicationForm(rows);
      if (form) poolForms.set(userId, form);
    }

    const usersById = new Map<string, any>();
    const identities: FormIdentity[] = [];
    for (const user of await selectIn(supabase, 'users', USER_FIELDS, 'id', Array.from(poolForms.keys()))) {
      if (user.staff_role || user.user_type === 'admin' || user.user_type === 'teacher') continue;
      const form = poolForms.get(user.id)!;
      usersById.set(user.id, user);
      identities.push({
        userId: user.id,
        names: [user.name, user.first_name, user.last_name, form.first_name],
        fatherName: form.father_name ?? null,
        phones: [user.phone],
        emails: [user.email, user.personal_email],
      });
    }

    // Forms staff already rejected for a student. Missing until the migration that
    // creates the table has run, which must not break the screen.
    const dismissed = new Set<string>();
    const { data: dismissals, error: dismissalError } = await supabase
      .from('nexus_application_form_dismissals')
      .select('student_id, form_user_id')
      .in('student_id', missingIds);
    if (dismissalError) console.warn('[application-forms] dismissals unavailable:', dismissalError.message);
    for (const row of (dismissals || []) as any[]) dismissed.add(`${row.student_id}:${row.form_user_id}`);

    // Where the "please fill in your details" link has got to for each of them, in
    // one query rather than a fetch per card. Read best-effort for the same reason
    // as the dismissals above: a missing table must not blank the whole screen, and
    // a null tells the sheet to say nothing rather than claim nobody has been asked.
    const requestByUser: Record<string, any> = {};
    const askedByName: Record<string, string | null> = {};
    try {
      const live = await listLiveDetailRequests(missingIds, supabase);
      Object.assign(requestByUser, live);
      const askerIds = Array.from(
        new Set(Object.values(live).map((row: any) => row.created_by).filter(Boolean)),
      ) as string[];
      if (askerIds.length) {
        const { data: askers } = await supabase.from('users').select('id, name').in('id', askerIds);
        for (const asker of (askers || []) as any[]) askedByName[asker.id] = asker.name || null;
      }
    } catch (requestError: any) {
      console.warn('[application-forms] detail requests unavailable:', requestError?.message);
    }

    const matchesByStudent = new Map<string, FormMatch[]>();
    const candidateIds = new Set<string>();
    for (const row of missing) {
      const user = row.user;
      const matches = matchApplicationForms(
        {
          id: row.user_id,
          name: user.name,
          phones: [user.phone],
          emails: [user.email, user.personal_email, user.linked_classroom_email],
        },
        identities,
      )
        .filter((match) => !dismissed.has(`${row.user_id}:${match.userId}`))
        .slice(0, MAX_CANDIDATES);
      matchesByStudent.set(row.user_id, matches);
      for (const match of matches) candidateIds.add(match.userId);
    }

    // merge_user_records keeps only one fee record, so two of them cannot be joined here.
    const withFees = new Set<string>();
    if (candidateIds.size) {
      const profiles = await selectIn(supabase, 'student_profiles', 'user_id', 'user_id', [
        ...Array.from(candidateIds),
        ...missingIds,
      ]);
      for (const profile of profiles) withFees.add(profile.user_id);
    }

    const students: StudentFormReview[] = missing.map((row) => {
      const user = row.user;
      const candidates: FormCandidateView[] = (matchesByStudent.get(row.user_id) || []).map((match) => {
        const formUser = usersById.get(match.userId);
        const form = poolForms.get(match.userId)!;
        const blocked =
          formUser?.ms_oid && formUser.ms_oid !== user.ms_oid
            ? 'other_microsoft_account'
            : withFees.has(match.userId) && withFees.has(row.user_id)
              ? 'both_fee_records'
              : null;
        return {
          userId: match.userId,
          strength: match.strength,
          reasons: match.reasons,
          name: typedName(formUser, form),
          fatherName: form.father_name?.trim() || null,
          place: placeOf(form),
          classLabel: formClassLabel(form),
          examYear: formExamYear(form),
          appliedAt: form.created_at,
          applicationNumber: form.application_number ?? null,
          hasFeeRecord: withFees.has(match.userId),
          blocked,
        };
      });
      const live = requestByUser[row.user_id];
      return {
        id: row.user_id,
        name: user.name || 'Student',
        email: user.linked_classroom_email || user.email || user.personal_email || null,
        candidates,
        detailRequest: live
          ? {
              progress: detailRequestProgress(live),
              askedAt: live.sent_at || live.created_at || null,
              askedByName: askedByName[live.created_by] ?? null,
              openedAt: live.opened_at || null,
              answeredAt: live.answered_at || null,
              expiresAt: live.expires_at || null,
            }
          : {
              progress: 'not_asked' as const,
              askedAt: null,
              askedByName: null,
              openedAt: null,
              answeredAt: null,
              expiresAt: null,
            },
      };
    });

    // Something to confirm first, then something to chase.
    const rank = (student: StudentFormReview) =>
      !student.candidates.length ? 2 : student.candidates[0].strength === 'strong' ? 0 : 1;
    students.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));

    return NextResponse.json({ students, canLink });
  } catch (err) {
    return errorResponse(err, 'Failed to look for application forms');
  }
}
