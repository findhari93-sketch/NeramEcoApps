// @ts-nocheck
// The college_outreach_log table and new colleges.contact_status/last_outreach_at/outreach_count
// columns were added in migration 20260418_college_outreach.sql. Generated Supabase types
// have not been regenerated to include them, so this route uses implicit `any` for DB calls.
// Runtime behavior is validated against the DB schema, not the TS types.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { getStaffSessionOptional } from '@/lib/admin/staff-auth';
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
}

function originOk(req: NextRequest): boolean {
  const expected = process.env.NEXT_PUBLIC_MARKETING_URL;
  if (!expected) return true; // skip check if not configured (e.g., local dev)
  const origin = req.headers.get('origin');
  if (!origin) return true; // Next.js may omit origin on same-origin fetches
  try {
    return new URL(origin).origin === new URL(expected).origin;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const session = getStaffSessionOptional(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!originOk(req)) {
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.college_id) {
    return NextResponse.json({ error: 'college_id is required' }, { status: 400 });
  }
  const variant = body.template_variant ?? 'first_touch_v1';
  const subjectVariant = (body.subject_variant ?? 1) as SubjectVariant;
  const previewOnly = body.preview_only === true;
  const includeBcc = body.include_bcc !== false; // default ON
  const force = body.force === true;

  const supabase = createAdminClient();
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
    senderName: session.name,
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

  // Send via Resend
  const sendResult = await sendOutreachEmail({
    to: recipient,
    bcc: bcc,
    subject,
    html: rendered.html,
    text: rendered.text,
  });

  // Insert log row regardless of success (capture failures)
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
      sent_by_name: session.name,
      sent_by_email: session.email,
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

  // Conditional status transition: only move never_contacted -> emailed_v1.
  // Do NOT regress replied / engaged / claimed / bounced / opted_out / emailed_v1.
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

  if (logErr) {
    // Log insert error is surfaced but doesn't block success
    console.error('[outreach] failed to insert outreach log row:', logErr);
  }

  return NextResponse.json({
    success: true,
    message_id: sendResult.messageId,
    outreach_log_id: logRow?.id ?? null,
    new_contact_status: newContactStatus,
    new_outreach_count: newOutreachCount,
  });
}
