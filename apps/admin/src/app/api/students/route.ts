// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, listStudentsByYear, getCurrentBatch, getUsersWithActiveNexusAccess, currentAcademicYear } from '@neram/database';

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

// "Completed the basic application form" is driven by the lead status, not the apply
// wizard's step counter (direct-enrolled students never touch the wizard, so their
// form_step_completed stays 0 even though they are fully enrolled). A submitted /
// reviewed / enrolled lead has the basics; draft or pending_verification does not;
// no lead row at all means the student never started the form.
const COMPLETE_APP_STATUSES = new Set(['submitted', 'under_review', 'approved', 'enrolled', 'partial_payment']);
function appStatuses(status: string | null | undefined, hasLead: boolean) {
  if (!hasLead) {
    return { application_complete: false, application_status: null, application_missing: 'no_application' as const };
  }
  const complete = !!status && COMPLETE_APP_STATUSES.has(status);
  return {
    application_complete: complete,
    application_status: status || null,
    application_missing: complete ? null : ('incomplete' as const),
  };
}

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
          'user_id, interest_course, application_number, final_fee, full_payment_discount, discount_amount, source, status, form_step_completed'
        )
        .in('user_id', userIds);
      for (const l of leads || []) leadByUser[l.user_id] = l;
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
      const app = appStatuses(lead?.status, !!lead);

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
        application_complete: app.application_complete,
        application_status: app.application_status,
        application_missing: app.application_missing,
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
