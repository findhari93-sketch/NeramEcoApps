// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, listStudentsByYear, getCurrentBatch, getUsersWithActiveNexusAccess, currentAcademicYear, assessApplication } from '@neram/database';

// A "classroom" account is the class-provided identity: @neramclasses.com or any
// Microsoft tenant address (*.onmicrosoft.com, which also covers the misspelled
// nerasmclasses.onmicrosoft.com seen in real data). Personal Gmail is everything else.
function isClassroomEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.toLowerCase().trim();
  return /@.*neramclasses\.com$/.test(e) || /\.onmicrosoft\.com$/.test(e);
}

// Domain tier of a classroom email, so the table can flag accounts that still
// need correcting. onmicrosoft (the default tenant, e.g. nerasmclasses.onmicrosoft.com)
// must be tested before org since it is NOT the custom domain.
type EmailDomainStatus = 'org' | 'onmicrosoft' | 'personal' | 'none';
function classifyDomain(email: string | null | undefined): EmailDomainStatus {
  if (!email) return 'none';
  const e = email.toLowerCase().trim();
  if (!e) return 'none';
  if (/\.onmicrosoft\.com$/.test(e)) return 'onmicrosoft';
  if (/@.*neramclasses\.com$/.test(e)) return 'org';
  return 'personal';
}

// Application completeness now comes from assessApplication in @neram/database, the
// one rule the Nexus students sheet and the student's own form also read.
//
// What it replaced, and why: this route used to call a student Complete whenever a
// lead_profiles row carried a submitted / reviewed / enrolled status. No field was
// ever checked. But every write path stamps a status at insert time (direct
// enrolment writes 'enrolled', the Admin dialog writes 'enrolled', the student's own
// complete-profile page writes 'enrolled'), so the status recorded how the row was
// born, not what was in it. A row with one value filled showed a green tick.
//
// EXPECT A VISIBLE SHIFT. On production data at the time of the change, of the 50
// non-alumni students who had a form and all read "Complete", 12 stay Complete and
// 38 become Partly filled, mostly for a missing class or exam year. Nobody's data
// changed; the chip stopped overstating. That is why there are three states rather
// than a green/orange pair: "Partly filled" must not read as a regression, and
// "Not started" is the list actually worth chasing.

// GET /api/students - List enrolled students for the academic-year working hub.
// Population is users-based (so profile-less actives and past-year graduates appear),
// with fees left-joined from student_profiles. Per-column filtering / global search
// happen client-side in the grid, so this route only takes the year/status scope.
// Stats are scoped to the returned set.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    // Accept ?batch= (new) with ?year= as a back-compat alias.
    const year = searchParams.get('batch') || searchParams.get('year') || 'current';
    const status = searchParams.get('status') || undefined; // 'active' | 'graduated' | 'all'

    const supabase = getSupabaseAdminClient();

    // Resolve the registry current batch so 'current' means the admin-set batch,
    // not the April-March calendar helper.
    let currentBatchCode: string | undefined;
    if (year === 'current') {
      try {
        currentBatchCode = (await getCurrentBatch(supabase)).code;
      } catch {
        /* fall back to the helper inside listStudentsByYear */
      }
    }

    const { students: hub } = await listStudentsByYear(
      {
        year,
        status: status as any,
        program: 'architecture',
        currentBatchCode,
        // In the default current view, also pull active students still stuck on a
        // past batch so the roster can flag and promote them.
        includePastActive: year === 'current',
      },
      supabase
    );

    // Enrich with lead_profiles (interest course, source / join method, fee plan,
    // and application-completeness signals) keyed by user_id, so the table keeps its
    // context columns without coupling the shared query to admin concerns.
    const userIds = hub.map((s) => s.id);
    const leadByUser: Record<string, any> = {};
    if (userIds.length) {
      const { data: leads } = await supabase
        .from('lead_profiles')
        .select(
          'user_id, interest_course, application_number, final_fee, full_payment_discount, discount_amount, source, status, form_step_completed, first_name, father_name, date_of_birth, applicant_category, academic_data, target_exam_year, city, state, created_at'
        )
        .in('user_id', userIds)
        // Two bugs fixed here at once. Without the deleted_at filter a soft-deleted
        // application still counted as the student's form. Without the ordering, a
        // student with several rows got whichever one PostgREST happened to return
        // last, so the same student could read differently on two page loads.
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      // Newest first, so the first row seen for a user is the one that counts.
      for (const l of leads || []) if (!leadByUser[l.user_id]) leadByUser[l.user_id] = l;
    }

    // Which of these students currently hold LIVE Nexus access (active enrollment
    // in an active classroom). Used to flag non-graduated past-batch students who
    // lost their enrollment (e.g. during the single-classroom consolidation).
    const accessIds = await getUsersWithActiveNexusAccess(userIds, supabase);
    // Compare code for the past-batch flag: registry current, else the calendar helper
    // (never undefined, so a past-batch row is never mis-read as current).
    const cmpCode = currentBatchCode || currentAcademicYear();

    const students = hub.map((s) => {
      const lead = leadByUser[s.id];
      const app = assessApplication({
        lead: lead || null,
        // Date of birth and first name live on users as well as on the lead row,
        // and either satisfies the rule: the student's complete-profile page writes
        // them to users while the apply wizard writes them to lead_profiles.
        user: { first_name: s.first_name, name: s.name, date_of_birth: s.date_of_birth },
      });

      // Split the class-provided "Classroom ID" from the personal Gmail.
      const classroom_email =
        (isClassroomEmail(s.ms_teams_email) && s.ms_teams_email) ||
        (isClassroomEmail(s.email) && s.email) ||
        s.linked_classroom_email ||
        null;
      const personal_email =
        s.personal_email || (!isClassroomEmail(s.email) ? s.email : null) || null;

      return {
        id: s.id, // user_id (the per-student routes key off this)
        user_id: s.id,
        student_id: s.student_id,
        student_profile_id: s.student_profile_id,
        first_name: s.first_name || '',
        last_name: s.last_name || '',
        name: s.name,
        email: s.email || '',
        classroom_email,
        classroom_email_status: classifyDomain(classroom_email),
        personal_email,
        // Microsoft org identity. Null = no @neramclasses.com/Entra account, i.e. a
        // personal-only (Gmail) row that Nexus now hides. Drives the admin "Personal-only"
        // filter (the exact inverse of the Nexus org gate).
        ms_oid: s.ms_oid,
        phone: s.phone || '',
        avatar_url: s.avatar_url,
        academic_year: s.academic_year,
        is_alumni: s.is_alumni,
        // Active (non-alumni) student whose exam batch is behind the current one:
        // still ours, but needs promoting to the current batch or graduating.
        past_batch: !s.is_alumni && !!s.academic_year && s.academic_year < cmpCode,
        // Live Nexus access right now (active enrollment in an active classroom).
        has_nexus_access: !s.is_alumni && accessIds.has(s.id),
        last_login_at: s.last_login_at,
        // Nexus-only login signal (null until they open the Nexus app themselves).
        nexus_first_login_at: s.nexus_first_login_at,
        nexus_last_login_at: s.nexus_last_login_at,
        enrollment_date: s.enrollment_date,
        payment_status: s.payment_status,
        total_fee: s.total_fee,
        fee_paid: s.fee_paid,
        fee_due: s.fee_due,
        ms_teams_email: s.ms_teams_email,
        interest_course: lead?.interest_course || null,
        application_number: lead?.application_number || null,
        final_fee: lead?.final_fee ?? null,
        full_payment_discount: lead?.full_payment_discount ?? null,
        discount_amount: lead?.discount_amount ?? null,
        source: lead?.source || null,
        // The three-state answer the chip reads, plus what is short and a sentence
        // for the tooltip.
        application_state: app.state,
        application_missing_fields: app.missing,
        application_summary: app.summary,
        application_status: lead?.status || null,
        // Kept for one release: other screens and saved grid filters still read the
        // old boolean pair. 'partial' deliberately lands as not-complete-but-started.
        application_complete: app.state === 'complete',
        application_missing:
          app.state === 'complete' ? null : app.state === 'missing' ? 'no_application' : 'incomplete',
      };
    });

    // Stats scoped to the returned (filtered) set, so the tiles always match the
    // visible list for the selected year (fixes the old global-scan inconsistency).
    const stats = {
      totalStudents: students.length,
      fullyPaid: students.filter((s) => s.payment_status === 'paid').length,
      partialPayment: students.filter((s) => s.payment_status === 'pending' && (s.fee_paid || 0) > 0).length,
      totalRevenue: students.reduce((sum, s) => sum + (s.fee_paid || 0), 0),
      totalPending: students.reduce((sum, s) => sum + (s.fee_due || 0), 0),
      // Active students stuck on a past batch, and how many of those have lost Nexus access.
      pastBatchActive: students.filter((s) => s.past_batch).length,
      pastBatchNoAccess: students.filter((s) => s.past_batch && !s.has_nexus_access).length,
      // Personal-only (Gmail, no Microsoft org identity) students: hidden from Nexus,
      // and how many still hold a Nexus enrollment (the phantom rows to link/merge).
      personalOnly: students.filter((s) => !s.ms_oid).length,
      personalOnlyEnrolled: students.filter((s) => !s.ms_oid && s.has_nexus_access).length,
      // Have Nexus access but have never opened the Nexus app, the ones to chase.
      accessNeverOpened: students.filter((s) => s.has_nexus_access && !s.nexus_first_login_at).length,
    };

    return NextResponse.json({ students, total: students.length, stats });
  } catch (error: any) {
    console.error('Error fetching students:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch students' },
      { status: 500 }
    );
  }
}
