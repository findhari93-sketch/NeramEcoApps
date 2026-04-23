// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { sendLeadNotificationToCollege } from '@/lib/college-outreach/lead-notification';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_DECISIONS = ['approve', 'reject', 'spam'] as const;
type Decision = (typeof VALID_DECISIONS)[number];

const DECISION_TO_STATUS: Record<Decision, string> = {
  approve: 'approved',
  reject: 'rejected',
  spam: 'spam',
};

const PUBLIC_SITE = process.env.NEXT_PUBLIC_MARKETING_URL || 'https://neramclasses.com';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  let body: { decision?: Decision; notes?: string; staff_name?: string; staff_email?: string };
  try {
    body = (await req.json()) as any;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.decision || !VALID_DECISIONS.includes(body.decision)) {
    return NextResponse.json({ error: `decision must be one of ${VALID_DECISIONS.join(', ')}` }, { status: 400 });
  }

  const staffName = (body.staff_name || req.headers.get('x-staff-name') || 'Neram Staff').trim();
  const staffEmail = (body.staff_email || req.headers.get('x-staff-email') || '').trim() || null;

  const supabase = getSupabaseAdminClient();

  const { data: lead, error: leadErr } = await supabase
    .from('college_leads')
    .select(
      'id, college_id, name, phone, email, city, nata_score, message, admin_review_status, ' +
        'colleges(name, slug, state_slug, neram_tier, email, admissions_email)',
    )
    .eq('id', id)
    .single();

  if (leadErr || !lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  if ((lead as any).admin_review_status !== 'pending') {
    return NextResponse.json(
      { error: `Lead is already ${(lead as any).admin_review_status}. No further action taken.` },
      { status: 409 },
    );
  }

  const newStatus = DECISION_TO_STATUS[body.decision];
  const { error: updateErr } = await supabase
    .from('college_leads')
    .update({
      admin_review_status: newStatus,
      admin_reviewed_at: new Date().toISOString(),
      admin_reviewed_by: staffEmail || staffName,
      admin_notes: body.notes ?? null,
    })
    .eq('id', id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // Only send the college notification on approve.
  let notification: { success: boolean; messageId?: string; skipped?: string; error?: string } = { success: true, skipped: 'not_approved' };
  if (body.decision === 'approve') {
    const college = (lead as any).colleges;
    const recipient = college?.admissions_email || college?.email || null;

    if (!recipient) {
      notification = { success: false, skipped: 'no_recipient', error: 'College has no admissions or contact email set. Lead is approved but no email was sent.' };
    } else {
      const dashboardUrl = `${PUBLIC_SITE}/college-dashboard/leads?highlight=${id}`;
      const collegePageUrl = `${PUBLIC_SITE}/en/colleges/${college.state_slug ?? 'india'}/${college.slug}`;

      const sendResult = await sendLeadNotificationToCollege({
        to: recipient,
        collegeName: college.name,
        collegePageUrl,
        dashboardUrl,
        studentName: (lead as any).name,
        studentPhone: (lead as any).phone,
        studentEmail: (lead as any).email ?? null,
        studentCity: (lead as any).city ?? null,
        studentNataScore: typeof (lead as any).nata_score === 'number' ? (lead as any).nata_score : null,
        studentMessage: (lead as any).message ?? null,
        neramTier: college.neram_tier ?? null,
      });

      notification = sendResult.success
        ? { success: true, messageId: sendResult.messageId }
        : { success: false, error: sendResult.error };
    }
  }

  return NextResponse.json({
    success: true,
    new_status: newStatus,
    reviewed_by: staffEmail || staffName,
    notification,
  });
}
