// @ts-nocheck
// Sends a first-touch outreach email to a college via Resend and writes to
// college_outreach_log. Admin app doesn't currently do server-side MSAL token
// verification on API routes (matches the existing pattern). Staff identity
// comes from headers passed by the client, which is already authenticated
// via useMicrosoftAuth() in the (dashboard) layout.

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import {
  renderOutreachEmail,
  getRecipientEmail,
  getUnsubscribeUrl,
  parseRecipientList,
  type SubjectVariant,
  type OutreachTemplateVariant,
} from '@/lib/college-outreach/templates';
import { sendOutreachEmail } from '@/lib/college-outreach/send';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DUPLICATE_SEND_WINDOW_SECONDS = 30;
const DEFAULT_BCC = 'info@neramclasses.com';
// One outreach can go to several contacts at the SAME college (info@, admissions@,
// principal@, ...). Each gets a private copy. Cap to avoid an accidental blast.
const MAX_RECIPIENTS = 10;

// Sequencing guardrail: which contact_status values a template is allowed to be
// sent to. Stops staff sending the pitch before first-touch, or payment details
// before a yes. `force: true` (the dialog's "Send anyway") overrides.
const TEMPLATE_ALLOWED_STATUS: Record<string, string[]> = {
  first_touch_v1: ['never_contacted', 'emailed_v1', 'bounced'],
  first_touch_v2: ['never_contacted', 'emailed_v1', 'bounced'],
  content_request_v1: ['replied', 'claimed', 'engaged'],
  partnership_pitch_v1: ['engaged', 'replied', 'claimed'],
  payment_details_v1: ['engaged', 'claimed', 'partner'],
  onboarding_v1: ['partner', 'engaged', 'claimed'],
};

interface RequestBody {
  college_id?: string;
  template_variant?: OutreachTemplateVariant;
  subject_variant?: SubjectVariant;
  preview_only?: boolean;
  override_to_email?: string;
  override_subject?: string;
  force?: boolean;
  include_bcc?: boolean;
  plain_text_only?: boolean; // A/B: transmit text-only (no HTML) to test Gmail Primary placement
  staff_name?: string;
  staff_email?: string;
  // Later-stage template context:
  deal_tier?: string;
  deal_amount_inr?: number;
  deal_term?: string;
  login_email?: string;
  attachments?: Array<{ filename: string; content: string; contentType?: string }>;
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

  const variant = body.template_variant ?? 'first_touch_v2';
  const subjectVariant = (body.subject_variant ?? 1) as SubjectVariant;
  const previewOnly = body.preview_only === true;
  const includeBcc = body.include_bcc !== false;
  const plainTextOnly = body.plain_text_only === true;
  const force = body.force === true;

  const supabase = getSupabaseAdminClient();
  const { data: college, error: collegeError } = await supabase
    .from('colleges')
    .select(
      'id, name, slug, state, state_slug, city, established_year, naac_grade, total_barch_seats, annual_fee_approx, affiliated_university, highlights, data_completeness, email, admissions_email, contact_status, last_outreach_at, outreach_count, unsubscribe_token',
    )
    .eq('id', body.college_id)
    .single();

  if (collegeError || !college) {
    return NextResponse.json({ error: 'College not found' }, { status: 404 });
  }

  // Resolve one or more recipients. The dialog lets staff type several contacts
  // for the same college, separated by commas (Gmail style). Fall back to the
  // college's own email when the override is blank.
  const recipientSource = (body.override_to_email && body.override_to_email.trim())
    ? body.override_to_email
    : getRecipientEmail(college as any);
  const recipients = parseRecipientList(recipientSource);
  if (recipients.length === 0) {
    return NextResponse.json(
      { error: 'No valid recipient email. Provide override_to_email or set admissions_email on the college.' },
      { status: 422 },
    );
  }
  if (recipients.length > MAX_RECIPIENTS) {
    return NextResponse.json(
      { error: `Too many recipients (${recipients.length}). Maximum is ${MAX_RECIPIENTS} contacts per college send.` },
      { status: 422 },
    );
  }
  // First recipient is used for preview display and single-recipient code paths.
  const recipient = recipients[0];

  const unsubscribeUrl = getUnsubscribeUrl((college as any).unsubscribe_token);

  const rendered = renderOutreachEmail({
    variant,
    subjectVariant,
    college: college as any,
    senderName,
    dealTier: body.deal_tier,
    dealAmountInr: body.deal_amount_inr,
    dealTerm: body.deal_term,
    loginEmail: body.login_email,
    unsubscribeUrl,
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

  // Sequencing guard: block a template that does not match the college's stage
  const currentStatusForGuard = (college as any).contact_status as string;
  const allowedStatuses = TEMPLATE_ALLOWED_STATUS[variant];
  if (allowedStatuses && !allowedStatuses.includes(currentStatusForGuard) && !force) {
    return NextResponse.json(
      {
        error: 'Sequencing guard triggered',
        hint: `This college is "${currentStatusForGuard}". The ${variant} email is meant for stage: ${allowedStatuses.join(', ')}. Pass force: true to send anyway.`,
        contact_status: currentStatusForGuard,
      },
      { status: 409 },
    );
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

  // Suppression: never email an address that has unsubscribed or hard-bounced.
  // This is NOT overridable by `force` (honouring opt-outs is a legal +
  // deliverability requirement, not a sequencing nicety). With several
  // recipients we skip the opted-out ones and still send to the rest; only a
  // fully-suppressed batch hard-fails.
  const lowerToOriginal = new Map(recipients.map((e) => [e.toLowerCase(), e]));
  const { data: suppressedRows } = await supabase
    .from('email_suppression_list')
    .select('email, reason')
    .in('email', Array.from(lowerToOriginal.keys()));
  const suppressedReasonByLower = new Map(
    (suppressedRows ?? []).map((r: any) => [String(r.email).toLowerCase(), r.reason as string]),
  );
  const skipped: Array<{ email: string; reason: string }> = [];
  const toSend: string[] = [];
  for (const email of recipients) {
    const reason = suppressedReasonByLower.get(email.toLowerCase());
    if (reason) skipped.push({ email, reason });
    else toSend.push(email);
  }
  if (toSend.length === 0) {
    return NextResponse.json(
      {
        error: `All ${recipients.length} recipient(s) have opted out and cannot be emailed. Remove them from the suppression list first if this is intentional.`,
        suppressed: true,
        skipped,
      },
      { status: 403 },
    );
  }

  // One-click unsubscribe headers (Gmail/Yahoo bulk-sender requirement). The
  // https URL is the same token link shown in the footer; the mailto is a fallback.
  const unsubscribeHeaders = {
    'List-Unsubscribe': `<${unsubscribeUrl}>, <mailto:${DEFAULT_BCC}?subject=unsubscribe>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };

  // Send a private copy per recipient so contacts never see each other's address.
  const sendResults = await Promise.all(
    toSend.map(async (email) => {
      const r = await sendOutreachEmail({
        to: email,
        bcc,
        subject,
        // Plain-text-only A/B: omit the HTML part entirely so Gmail sees a text
        // email (more likely to land in Primary). The text body carries raw URLs.
        html: plainTextOnly ? undefined : rendered.html,
        text: rendered.text,
        attachments: body.attachments,
        headers: unsubscribeHeaders,
      });
      return { email, success: r.success, messageId: r.messageId, error: r.error };
    }),
  );

  const sent = sendResults.filter((r) => r.success);
  const failed = sendResults.filter((r) => !r.success);

  const sentToText = sent.map((r) => r.email).join(', ') || toSend.join(', ');
  const messageIds = sent.map((r) => r.messageId).filter(Boolean).join(', ');
  const failureNote = failed.length
    ? `Failed for ${failed.map((r) => `${r.email}: ${r.error}`).join('; ')}`
    : null;

  const { data: logRow, error: logErr } = await supabase
    .from('college_outreach_log')
    .insert({
      college_id: (college as any).id,
      template_variant: variant,
      sent_to: sentToText,
      sent_bcc: bcc,
      subject,
      body_html: rendered.html,
      body_text: rendered.text,
      channel: 'resend',
      resend_message_id: messageIds || null,
      status: sent.length ? 'sent' : 'failed',
      error_message: failureNote,
      sent_by_name: senderName,
      sent_by_email: senderEmail,
    })
    .select('id')
    .single();

  if (logErr) console.error('[college-outreach] failed to insert outreach log row:', logErr);

  // Every recipient failed to send: surface the errors, do not advance the college.
  if (sent.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error: failed.map((r) => `${r.email}: ${r.error}`).join('; ') || 'Send failed',
        outreach_log_id: logRow?.id ?? null,
        failed,
      },
      { status: 502 },
    );
  }

  // Advance the college once per outreach action (one touch, not per recipient).
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

  return NextResponse.json({
    success: true,
    message_id: sent[0]?.messageId,
    sent_to: sent.map((r) => r.email),
    sent_count: sent.length,
    skipped,
    failed,
    outreach_log_id: logRow?.id ?? null,
    new_contact_status: newContactStatus,
    new_outreach_count: newOutreachCount,
  });
}
