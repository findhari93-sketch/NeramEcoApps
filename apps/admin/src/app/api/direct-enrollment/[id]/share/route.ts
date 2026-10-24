export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  getDirectEnrollmentLinkById,
  logDirectEnrollmentLinkEvent,
  markDirectEnrollmentLinkShared,
  sendEnrolmentLinkEmail,
  sendEnrolmentLinkWhatsApp,
  getWhatsAppSendBlock,
  formatDueDate,
} from '@neram/database';
import { enrolmentPlanLines } from '@neram/database/enrolment-link';
import { offerFromLink, offerLines } from '@neram/database/student-pay';
import { UUID_REGEX, actingAdminId } from '@/lib/fee-request';
import { effectiveStatus, toLinkView } from '@/lib/enrolment-link-server';
import { UPSTREAM_FAILED } from '@/lib/upstream-status';

const COURSE_LABEL: Record<string, string> = {
  nata: 'NATA',
  jee_paper2: 'JEE Paper 2',
  both: 'NATA and JEE Paper 2',
  revit: 'Revit',
  not_sure: 'Neram Classes coaching',
};

/** GET: can WhatsApp send automatically right now? { whatsappBlock: reason | null } */
export async function GET() {
  const whatsappBlock = await getWhatsAppSendBlock().catch(() => null);
  return NextResponse.json({ whatsappBlock });
}

type Channel = 'copy' | 'whatsapp_open' | 'email' | 'whatsapp_auto';
const CHANNELS: Channel[] = ['copy', 'whatsapp_open', 'email', 'whatsapp_auto'];

/**
 * POST /api/direct-enrollment/[id]/share  { channel }
 * copy / whatsapp_open: staff did it in the browser; we only record it.
 * email / whatsapp_auto: we send it, then record what happened.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_REGEX.test(id)) return NextResponse.json({ error: 'Invalid link.' }, { status: 400 });
  const body = await request.json().catch(() => ({}));
  const channel = body?.channel as Channel;
  if (!CHANNELS.includes(channel)) return NextResponse.json({ error: 'Unknown share channel.' }, { status: 400 });
  const adminId = actingAdminId(request, body);

  try {
    const supabase: any = getSupabaseAdminClient();
    const link: any = await getDirectEnrollmentLinkById(id, supabase);
    if (!link) return NextResponse.json({ error: 'That link was not found.' }, { status: 404 });
    if (effectiveStatus(link) !== 'active') {
      return NextResponse.json({ error: `This link is ${effectiveStatus(link)}. Make or renew a link first.` }, { status: 409 });
    }

    const view = await toLinkView(link, request, supabase);
    // Student pays: nothing is paid yet, so the message offers the two plans
    // instead of "Paid: ₹0".
    const planLines =
      link.payment_mode === 'student_pays'
        ? offerLines(offerFromLink(link))
        : enrolmentPlanLines({
            finalFee: Number(link.final_fee) || 0,
            amountPaid: Number(link.amount_paid) || 0,
            scheme: link.payment_scheme || 'full',
            balanceDueDate: link.installment_2_due_date,
          });

    if (channel === 'email') {
      if (!link.student_email) return NextResponse.json({ error: 'There is no email address on this link.' }, { status: 400 });
      const sent = await sendEnrolmentLinkEmail({
        to: link.student_email,
        studentName: link.student_name,
        url: view.url,
        courseLabel: COURSE_LABEL[link.interest_course] || 'Neram Classes coaching',
        planLines,
        expiresOn: link.expires_at ? formatDueDate(String(link.expires_at).slice(0, 10)) : null,
        studentPays: link.payment_mode === 'student_pays',
      });
      if (!sent.success) {
        await logDirectEnrollmentLinkEvent(id, 'email_failed', adminId, { error: sent.error }, supabase);
        return NextResponse.json({ error: `The email did not send: ${sent.error || 'unknown error'}` }, { status: UPSTREAM_FAILED });
      }
      await logDirectEnrollmentLinkEvent(id, 'emailed', adminId, { to: link.student_email }, supabase);
    } else if (channel === 'whatsapp_auto') {
      if (!link.student_phone) return NextResponse.json({ error: 'There is no phone number on this link.' }, { status: 400 });
      const block = await getWhatsAppSendBlock();
      if (block) {
        await logDirectEnrollmentLinkEvent(id, 'whatsapp_failed', adminId, { error: block }, supabase);
        return NextResponse.json(
          { error: 'WhatsApp cannot send automatically right now. Use Open WhatsApp instead.', code: 'WA_BLOCKED', detail: block },
          { status: 409 }
        );
      }
      const sent = await sendEnrolmentLinkWhatsApp(link.student_phone, link.student_name, planLines.join('. ') + '.', view.url);
      if (!sent.success) {
        await logDirectEnrollmentLinkEvent(id, 'whatsapp_failed', adminId, { error: sent.error }, supabase);
        return NextResponse.json(
          { error: 'WhatsApp did not send. Use Open WhatsApp instead.', detail: sent.error },
          { status: UPSTREAM_FAILED }
        );
      }
      await logDirectEnrollmentLinkEvent(id, 'whatsapp_sent', adminId, { messageId: sent.messageId }, supabase);
    } else {
      await logDirectEnrollmentLinkEvent(id, channel === 'copy' ? 'copied' : 'whatsapp_opened', adminId, {}, supabase);
    }

    await markDirectEnrollmentLinkShared(link, supabase);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Enrolment link share failed:', error);
    return NextResponse.json({ error: error?.message || 'Could not share the link.' }, { status: 500 });
  }
}
