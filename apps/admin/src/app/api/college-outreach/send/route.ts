// @ts-nocheck
// Sends a first-touch outreach email to a college via Resend and writes to
// college_outreach_log. Admin app doesn't currently do server-side MSAL token
// verification on API routes (matches the existing pattern). Staff identity
// comes from headers passed by the client, which is already authenticated
// via useMicrosoftAuth() in the (dashboard) layout.

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { renderOutreachEmail, getRecipientEmail, type SubjectVariant } from '@/lib/college-outreach/templates';
import { sendOutreachEmail } from '@/lib/college-outreach/send';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DUPLICATE_SEND_WINDOW_SECONDS = 30;
const DEFAULT_BCC = 'info@neramclasses.com';

interface RequestBody {
  college_id?: string;
  template_variant?: 'first_touch_v1';
  subject_variant?: SubjectVariant;
  preview_only?: boolean;
  override_to_email?: string;
  override_subject?: string;
  force?: boolean;
  include_bcc?: boolean;
  staff_name?: string;
  staff_email?: string;
}

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.college_id) {
    return NextResponse.json({ error: 'college_id is required' }, { status: 400 });
  }

  const senderName = (body.staff_name || req.headers.get('x-staff-name') || 'Neram Classes Team').trim();
  const senderEmail = (body.staff_email || req.headers.get('x-staff-email') || '').trim() || null;

  const variant = body.template_variant ?? 'first_touch_v1';
  const subjectVariant = (body.subject_variant ?? 1) as SubjectVariant;
  const previewOnly = body.preview_only === true;
  const includeBcc = body.include_bcc !== false;
  const force = body.force === true;

  const supabase = getSupabaseAdminClient();
  const { data: college, error: collegeError } = await supabase
    .from('colleges')
    .select(
      'id, name, slug, state_slug, city, established_year, naac_grade, total_barch_seats, annual_fee_approx, affiliated_university, highlights, data_completeness, email, admissions_email, contact_status, last_outreach_at, outreach_count',
    )
    .eq('id', body.college_id)
    .single();

  if (collegeError || !college) {
    return NextResponse.json({ error: 'College not found' }, { status: 404 });
  }

  const recipient = getRecipientEmail(college as any, body.override_to_email);
  if (!recipient) {
    return NextResponse.json(
      { error: 'No recipient email available. Provide override_to_email or set admissions_email on the college.' },
      { status: 422 },
    );
  }

  const rendered = renderOutreachEmail({
    variant,
    subjectVariant,
    college: college as any,
    senderName,
  });

  const subject = body.override_subject?.trim() || rendered.subject;
  const bcc = includeBcc ? DEFAULT_BCC : null;

  if (previewOnly) {
    return NextResponse.json({
      subject,
      html: rendered.html,
      text: rendered.text,
      recipient,
      bcc,
      contact_status: (college as any).contact_status,
      outreach_count: (college as any).outreach_count,
      last_outreach_at: (college as any).last_outreach_at,
    });
  }

  // Duplicate-send guard
  const lastAt = (college as any).last_outreach_at as string | null;
  if (lastAt && !force) {
    const elapsedSec = (Date.now() - new Date(lastAt).getTime()) / 1000;
    if (elapsedSec < DUPLICATE_SEND_WINDOW_SECONDS) {
      return NextResponse.json(
        {
          error: 'Duplicate send guard triggered',
          hint: `Last outreach sent ${Math.round(elapsedSec)}s ago. Pass force: true to override.`,
          last_outreach_at: lastAt,
        },
        { status: 409 },
      );
    }
  }

  const sendResult = await sendOutreachEmail({
    to: recipient,
    bcc,
    subject,
    html: rendered.html,
    text: rendered.text,
  });

  const { data: logRow, error: logErr } = await supabase
    .from('college_outreach_log')
    .insert({
      college_id: (college as any).id,
      template_variant: variant,
      sent_to: recipient,
      sent_bcc: bcc,
      subject,
      body_html: rendered.html,
      body_text: rendered.text,
      channel: 'resend',
      resend_message_id: sendResult.messageId ?? null,
      status: sendResult.success ? 'sent' : 'failed',
      error_message: sendResult.error ?? null,
      sent_by_name: senderName,
      sent_by_email: senderEmail,
    })
    .select('id')
    .single();

  if (!sendResult.success) {
    return NextResponse.json(
      {
        success: false,
        error: sendResult.error,
        outreach_log_id: logRow?.id ?? null,
      },
      { status: 502 },
    );
  }

  const currentStatus = (college as any).contact_status as string;
  const nextStatus = currentStatus === 'never_contacted' ? 'emailed_v1' : currentStatus;
  const nextOutreachCount = ((college as any).outreach_count ?? 0) + 1;

  const { data: refreshed } = await supabase
    .from('colleges')
    .update({
      contact_status: nextStatus,
      last_outreach_at: new Date().toISOString(),
      outreach_count: nextOutreachCount,
    })
    .eq('id', (college as any).id)
    .select('contact_status, outreach_count')
    .single();

  const newContactStatus = refreshed?.contact_status ?? nextStatus;
  const newOutreachCount = refreshed?.outreach_count ?? nextOutreachCount;

  if (logErr) console.error('[college-outreach] failed to insert outreach log row:', logErr);

  return NextResponse.json({
    success: true,
    message_id: sendResult.messageId,
    outreach_log_id: logRow?.id ?? null,
    new_contact_status: newContactStatus,
    new_outreach_count: newOutreachCount,
  });
}
