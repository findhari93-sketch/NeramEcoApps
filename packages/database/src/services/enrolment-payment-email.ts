/**
 * Emails and staff alerts for student-pays enrolment links:
 *  - submitted: the student is told we have their payment and are checking it;
 *    staff get the bell, a push and an email to verify it.
 *  - verified:  the student is welcomed, with the receipt facts.
 *  - rejected:  the student is told why, and that the link is open again.
 * Every send returns a result and never throws: a failed email must never undo
 * a payment claim or a verification.
 */
import type { TypedSupabaseClient } from '../client';
import { sendEmail } from './email';
import { sendStaffPush } from './staff-push';
import { createAdminNotification } from '../queries/notifications';
import { formatRupees } from '../utils/fee-plan';
import type { PaymentPayee } from '../utils/student-pay';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@neramclasses.com';
const ADMIN_URL = (process.env.NEXT_PUBLIC_ADMIN_URL || 'https://admin.neramclasses.com').replace(/\/+$/, '');

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const firstName = (name: string) => esc(name.trim().split(/\s+/)[0] || 'there');

function rowsHtml(rows: [string, string][]): string {
  return rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:8px 0;color:#555;border-bottom:1px solid #eef0f3;">${esc(label)}</td><td style="padding:8px 0;text-align:right;font-weight:600;color:#111;border-bottom:1px solid #eef0f3;">${esc(value)}</td></tr>`,
    )
    .join('');
}

function shell(opts: { accent: string; title: string; subtitle: string; body: string }): string {
  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
    <body style="margin:0;background:#f4f6f8;font-family:'Segoe UI',Arial,sans-serif;line-height:1.6;color:#222;">
      <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
        <div style="background:${opts.accent};color:#fff;padding:24px;border-radius:8px 8px 0 0;">
          <h1 style="margin:0;font-size:22px;">${esc(opts.title)}</h1>
          <p style="margin:4px 0 0;opacity:.92;">${esc(opts.subtitle)}</p>
        </div>
        <div style="background:#fff;padding:24px;border-radius:0 0 8px 8px;">${opts.body}</div>
        <p style="text-align:center;font-size:12px;color:#777;">Neram Classes, Architecture Entrance Coaching | www.neramclasses.com</p>
      </div>
    </body>
    </html>`;
}

const methodLabel = (m: string | null | undefined) => (m === 'bank_transfer' ? 'Bank transfer' : 'UPI');
const planLabel = (s: string | null | undefined) => (s === 'installment' ? 'Two installments' : 'Paid in full');

export interface SubmittedPaymentFacts {
  studentName: string;
  amount: number;
  scheme: 'full' | 'installment';
  method: 'upi_direct' | 'bank_transfer';
  /** Optional since Phase 1: new students rarely know it. */
  utr: string | null;
  /** 'whatsapp': the screenshot came to our WhatsApp, not the page. */
  proofChannel?: 'upload' | 'whatsapp' | null;
  payerName?: string | null;
  paidOn: string; // "19 Oct 2026"
  courseLabel: string;
  /** Installments only. */
  balance?: number | null;
  balanceDueLabel?: string | null;
  /** 'balance': a later installment by an enrolled student, not the joining payment. */
  purpose?: 'enrolment' | 'balance';
}

/** To the student, right after they submit. */
export async function sendPaymentSubmittedEmail(to: string, f: SubmittedPaymentFacts) {
  const isBalance = f.purpose === 'balance';
  const rows: [string, string][] = [
    ['Course', f.courseLabel],
    ['Plan', isBalance ? 'Balance payment' : planLabel(f.scheme)],
    ['Amount', formatRupees(f.amount)],
    ['Paid by', methodLabel(f.method)],
    ...(f.utr ? ([['Reference (UTR)', f.utr]] as [string, string][]) : []),
    ...(f.payerName ? ([['Paid from', f.payerName]] as [string, string][]) : []),
    ['Proof', f.proofChannel === 'whatsapp' ? 'Screenshot sent on WhatsApp' : 'Screenshot uploaded'],
    ['Paid on', f.paidOn],
  ];
  if (f.scheme === 'installment' && f.balance) {
    rows.push(['Second installment', `${formatRupees(f.balance)}${f.balanceDueLabel ? `, due by ${f.balanceDueLabel}` : ''}`]);
  }
  const html = shell({
    accent: '#0D47A1',
    title: 'We have your payment details',
    subtitle: isBalance ? 'Neram Classes fee payment' : 'Neram Classes enrolment',
    body: `
      <p style="margin-top:0;">Hi <strong>${firstName(f.studentName)}</strong>,</p>
      <p>Thank you. We received your payment details and our accounts team is matching them with the bank. This usually takes a few hours during working hours.</p>
      <table role="presentation" style="width:100%;border-collapse:collapse;margin:16px 0;">${rowsHtml(rows)}</table>
      <p>${isBalance ? 'As soon as it is confirmed you will get a receipt by email.' : 'As soon as it is confirmed you will get a second email with your enrolment number and how to sign in to your classes.'}</p>
      <p style="font-size:13px;color:#555;margin-bottom:0;">Paid but something looks wrong? Reply to this email with a screenshot and we will sort it out.</p>`,
  });
  return sendEmail({ to, subject: `Payment received, we are verifying it (${formatRupees(f.amount)})`, html });
}

/** To the student, once staff matched the payment to the bank. */
export async function sendPaymentVerifiedEmail(
  to: string,
  f: SubmittedPaymentFacts & { applicationNumber: string; appUrl: string; payBalanceUrl?: string | null },
) {
  const rows: [string, string][] = [
    ['Enrolment number', f.applicationNumber],
    ['Course', f.courseLabel],
    ['Plan', planLabel(f.scheme)],
    ['Amount received', formatRupees(f.amount)],
    ...(f.utr ? ([['Reference (UTR)', f.utr]] as [string, string][]) : []),
    ['Paid on', f.paidOn],
  ];
  if (f.scheme === 'installment' && f.balance) {
    rows.push(['Second installment', `${formatRupees(f.balance)}${f.balanceDueLabel ? `, due by ${f.balanceDueLabel}` : ''}`]);
  }
  const url = esc(f.appUrl);
  const html = shell({
    accent: '#2E7D32',
    title: 'Payment confirmed. Welcome to Neram!',
    subtitle: 'Your enrolment is complete',
    body: `
      <p style="margin-top:0;">Hi <strong>${firstName(f.studentName)}</strong>,</p>
      <p>Your payment is confirmed and you are now enrolled at Neram Classes. Keep this email as your receipt.</p>
      <table role="presentation" style="width:100%;border-collapse:collapse;margin:16px 0;">${rowsHtml(rows)}</table>
      <p style="text-align:center;margin:24px 0;">
        <a href="${url}" style="display:inline-block;background:#2E7D32;color:#fff;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:600;">Open the Neram app</a>
      </p>
      ${f.scheme === 'installment' && f.balance && f.payBalanceUrl ? `<p style="font-size:14px;">When you are ready to pay the second installment, use <a href="${esc(f.payBalanceUrl)}" style="color:#1565C0;font-weight:600;">your pay balance page</a>. Pay in full early and you are done.</p>` : ''}
      <p style="font-size:13px;color:#555;margin-bottom:0;">Our team will add you to your class and share the timetable. Questions? Just reply to this email.</p>`,
  });
  return sendEmail({ to, subject: `Payment confirmed (${f.applicationNumber}): welcome to Neram Classes`, html });
}

/** To the student, when staff verified a balance payment: their receipt. */
export async function sendBalanceVerifiedEmail(
  to: string,
  f: { studentName: string; amount: number; method: 'upi_direct' | 'bank_transfer'; utr: string | null; paidOn: string; balanceAfter: number | null; receiptNumber?: string | null },
) {
  const rows: [string, string][] = [
    ['Amount received', formatRupees(f.amount)],
    ['Paid by', methodLabel(f.method)],
    ...(f.utr ? ([['Reference (UTR)', f.utr]] as [string, string][]) : []),
    ['Paid on', f.paidOn],
  ];
  if (f.receiptNumber) rows.unshift(['Receipt number', f.receiptNumber]);
  rows.push(['Balance left', f.balanceAfter && f.balanceAfter > 0.01 ? formatRupees(f.balanceAfter) : 'Nothing. Your fee is fully paid.']);
  const html = shell({
    accent: '#2E7D32',
    title: 'Payment confirmed',
    subtitle: 'Your receipt from Neram Classes',
    body: `
      <p style="margin-top:0;">Hi <strong>${firstName(f.studentName)}</strong>,</p>
      <p>Thank you. We matched your payment with the bank. Keep this email as your receipt.</p>
      <table role="presentation" style="width:100%;border-collapse:collapse;margin:16px 0;">${rowsHtml(rows)}</table>
      <p style="font-size:13px;color:#555;margin-bottom:0;">Questions? Just reply to this email.</p>`,
  });
  return sendEmail({ to, subject: `Payment confirmed: ${formatRupees(f.amount)} received`, html });
}

/** To the student, when staff could not find the payment. */
export async function sendPaymentRejectedEmail(
  to: string,
  f: { studentName: string; amount: number; utr: string | null; reason: string; url: string; purpose?: 'enrolment' | 'balance' },
) {
  const url = esc(f.url);
  const html = shell({
    accent: '#B71C1C',
    title: 'We could not confirm your payment',
    subtitle: 'Neram Classes enrolment',
    body: `
      <p style="margin-top:0;">Hi <strong>${firstName(f.studentName)}</strong>,</p>
      <p>We checked our bank for ${esc(formatRupees(f.amount))}${f.utr ? ` with reference <strong>${esc(f.utr)}</strong>` : ''} but could not match it.</p>
      <p style="background:#FFF3E0;border-radius:6px;padding:12px 16px;"><strong>What our team said:</strong> ${esc(f.reason)}</p>
      <p>${f.purpose === 'balance' ? 'Your pay balance page is open again.' : 'Your enrolment link is open again.'} Please check the reference number in your payment app and submit it again.</p>
      <p style="text-align:center;margin:24px 0;">
        <a href="${url}" style="display:inline-block;background:#1565C0;color:#fff;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:600;">${f.purpose === 'balance' ? 'Open my payment page' : 'Open my enrolment link'}</a>
      </p>
      <p style="font-size:13px;color:#555;margin-bottom:0;">If money left your account, reply with a screenshot and we will find it.</p>`,
  });
  return sendEmail({ to, subject: 'Action needed: we could not confirm your payment', html });
}

/**
 * Staff: the bell, a push to every subscribed device, and an email. Each part
 * is independent; one failing never stops the others.
 */
export async function alertStaffPaymentToVerify(
  client: TypedSupabaseClient,
  f: SubmittedPaymentFacts & { linkId?: string | null; claimId?: string | null; phone: string | null; demoRegistrationId?: string | null; userId: string | null },
): Promise<void> {
  const path = f.claimId
    ? `/collections?verify=${encodeURIComponent(f.claimId)}`
    : f.demoRegistrationId
      ? `/demo-classes?id=${encodeURIComponent(f.demoRegistrationId)}`
      : `/direct-enrollment?highlight=${encodeURIComponent(f.linkId || '')}`;
  const title = `Verify payment: ${f.studentName}`;
  const proofNote = f.utr ? `UTR ${f.utr}` : f.proofChannel === 'whatsapp' ? 'screenshot on WhatsApp, no UTR' : 'screenshot uploaded, no UTR';
  const body = `${formatRupees(f.amount)} by ${methodLabel(f.method)}, ${proofNote} (${planLabel(f.scheme)})`;

  try {
    await createAdminNotification(
      {
        event_type: 'payment_to_verify',
        title,
        message: body,
        metadata: {
          link_id: f.linkId || null,
          claim_id: f.claimId || null,
          demo_registration_id: f.demoRegistrationId,
          user_id: f.userId,
          amount: f.amount,
          utr: f.utr,
          url: path,
        },
      },
      client,
    );
  } catch (e: any) {
    console.error('[payment-to-verify] bell failed:', e?.message);
  }

  await sendStaffPush(client, { title, body, url: path, tag: `verify-${f.claimId || f.linkId}` } as any).catch((e: any) =>
    console.error('[payment-to-verify] push failed:', e?.message),
  );

  const rows: [string, string][] = [
    ['Student', f.studentName],
    ['Phone', f.phone || '-'],
    ['Course', f.courseLabel],
    ['Plan', f.purpose === 'balance' ? 'Balance payment (already enrolled)' : planLabel(f.scheme)],
    ['Amount', formatRupees(f.amount)],
    ['Paid by', methodLabel(f.method)],
    ['Proof', f.utr ? `UTR ${f.utr}` : f.proofChannel === 'whatsapp' ? 'Screenshot on WhatsApp' : 'Screenshot uploaded'],
    ['Paid on', f.paidOn],
  ];
  const link = esc(`${ADMIN_URL}${path}`);
  const html = shell({
    accent: '#E65100',
    title: 'A payment is waiting for verification',
    subtitle: 'Match it with the bank before verifying',
    body: `
      <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 16px;">${rowsHtml(rows)}</table>
      <p>Check the Manoharan Trust KVB statement or the GPay history for this UTR and amount. The screenshot alone is not proof.</p>
      <p style="text-align:center;margin:24px 0 0;">
        <a href="${link}" style="display:inline-block;background:#E65100;color:#fff;padding:12px 28px;text-decoration:none;border-radius:6px;font-weight:600;">Open in Admin</a>
      </p>`,
  });
  const sent = await sendEmail({ to: ADMIN_EMAIL, subject: `[Verify payment] ${formatRupees(f.amount)} from ${f.studentName}`, html });
  if (!sent.success) console.error('[payment-to-verify] staff email failed:', sent.error);
}

// ─── Phase 1: pay later, reminders, expiry ────────────────────────────────────

export interface PayDetailsEmailFacts {
  studentName: string;
  courseLabel: string;
  /** "Pay in full: ₹25,000 (save ₹5,000)" style lines from offerLines(). */
  offerLines: string[];
  payee: PaymentPayee;
  /** The student's own link, to come back and finish. */
  resumeUrl: string;
  /** A PNG of the UPI QR for the amount due (Gmail blocks data URIs). */
  qrPngUrl: string;
  /** "26 Oct 2026" */
  expiresLabel: string;
}

function payDetailsBlock(f: PayDetailsEmailFacts): string {
  const p = f.payee;
  const lines = f.offerLines.map((l) => `<li style="margin:4px 0;">${esc(l)}</li>`).join('');
  const bank: [string, string][] = [
    ['Account name', p.bank.accountName],
    ['Account number', p.bank.accountNumber],
    ['IFSC', p.bank.ifsc],
    ['Bank', `${p.bank.bankName}, ${p.bank.branch}`],
  ];
  return `
      <ul style="padding-left:18px;margin:8px 0 16px;">${lines}</ul>
      <p style="margin:0 0 8px;font-weight:600;">Pay by UPI</p>
      <p style="margin:0 0 8px;">UPI ID: <strong>${esc(p.upiId)}</strong> (${esc(p.payeeName)})${p.gpayNumber ? ` or GPay number <strong>${esc(p.gpayNumber)}</strong>` : ''}</p>
      <p style="text-align:center;margin:12px 0;"><img src="${esc(f.qrPngUrl)}" width="200" height="200" alt="UPI QR code to pay ${esc(p.payeeName)}" style="border:1px solid #e3e6ea;border-radius:8px;" /></p>
      <p style="font-size:13px;color:#555;margin:0 0 16px;">Save the QR to your phone, open GPay or PhonePe, tap Scan and choose it from your gallery. Check the name reads <strong>${esc(p.payeeName)}</strong> before you pay.</p>
      <p style="margin:0 0 8px;font-weight:600;">Or by bank transfer</p>
      <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 16px;">${rowsHtml(bank)}</table>
      <p style="text-align:center;margin:24px 0;">
        <a href="${esc(f.resumeUrl)}" style="display:inline-block;background:#1565C0;color:#fff;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:600;">Open my enrolment link</a>
      </p>
      <p style="font-size:13px;color:#555;">After you pay, open the link and send us the screenshot (or send it on WhatsApp). Your link is open until <strong>${esc(f.expiresLabel)}</strong>.</p>`;
}

/** To the student who chose "I'll pay later": the details are safe, here is how to pay. */
export async function sendPaymentSavedEmail(to: string, f: PayDetailsEmailFacts) {
  const html = shell({
    accent: '#0D47A1',
    title: 'Your application is saved',
    subtitle: 'Pay when you are ready to confirm your seat',
    body: `
      <p style="margin-top:0;">Hi <strong>${firstName(f.studentName)}</strong>,</p>
      <p>We have your details for <strong>${esc(f.courseLabel)}</strong>. Your seat is confirmed the moment your payment reaches the trust.</p>
      ${payDetailsBlock(f)}`,
  });
  return sendEmail({ to, subject: 'Your application is saved, pay to confirm your seat', html });
}

export type EnrolmentReminderStage = 'day1' | 'day3' | 'last_chance';

const REMINDER_COPY: Record<EnrolmentReminderStage, { subject: string; title: string; lead: string }> = {
  day1: {
    subject: 'Complete your enrolment at Neram Classes',
    title: 'Your seat is waiting',
    lead: 'You opened your enrolment link yesterday. Paying takes about two minutes, and paying in full saves you money.',
  },
  day3: {
    subject: 'Still thinking? Your Neram seat is waiting',
    title: 'A quick reminder',
    lead: 'Your enrolment link is still open. If anything is unclear about the fee or the plan, just reply to this email.',
  },
  last_chance: {
    subject: 'Your enrolment link closes soon',
    title: 'Last chance to use this link',
    lead: 'Your enrolment link closes in two days. Pay before then, or reply and we will extend it for you.',
  },
};

/** To a student with an unpaid link: day 1, day 3, and two days before it closes. */
export async function sendEnrolmentReminderEmail(to: string, f: PayDetailsEmailFacts & { stage: EnrolmentReminderStage }) {
  const copy = REMINDER_COPY[f.stage];
  const html = shell({
    accent: f.stage === 'last_chance' ? '#E65100' : '#0D47A1',
    title: copy.title,
    subtitle: `Neram Classes, ${f.courseLabel}`,
    body: `
      <p style="margin-top:0;">Hi <strong>${firstName(f.studentName)}</strong>,</p>
      <p>${esc(copy.lead)}</p>
      ${payDetailsBlock(f)}`,
  });
  return sendEmail({ to, subject: copy.subject, html });
}

/** To a student whose unpaid link closed. */
export async function sendLinkExpiredEmail(to: string, f: { studentName: string; courseLabel: string; whatsappHref?: string | null }) {
  const html = shell({
    accent: '#546E7A',
    title: 'Your enrolment link has expired',
    subtitle: `Neram Classes, ${f.courseLabel}`,
    body: `
      <p style="margin-top:0;">Hi <strong>${firstName(f.studentName)}</strong>,</p>
      <p>The enrolment link we sent you has closed. Nothing is lost: reply to this email${f.whatsappHref ? ` or <a href="${esc(f.whatsappHref)}" style="color:#1565C0;font-weight:600;">message us on WhatsApp</a>` : ''} and we will open it again for you.</p>
      <p style="font-size:13px;color:#555;margin-bottom:0;">If you already paid, send us the screenshot and we will match it with the bank.</p>`,
  });
  return sendEmail({ to, subject: 'Your enrolment link has expired', html });
}
