/**
 * What a student gets once their class account exists, and where their batch
 * WhatsApp group is:
 *  - the welcome email (login ID and the setup link, never the password: the
 *    setup page shows that, only to the student signed in as themselves);
 *  - the batch WhatsApp group, set per exam batch in Admin > Exam Batches;
 *  - the WhatsApp template, held while the WhatsApp account is blocked.
 * Sends return a result and never throw.
 */
import type { TypedSupabaseClient } from '../client';
import { sendEmail } from './email';
import { sendWhatsAppTemplate, isWhatsAppConfigured } from './whatsapp';

type WhatsAppSendResult = Awaited<ReturnType<typeof sendWhatsAppTemplate>>;

export const STUDENT_SETUP_URL = `${(process.env.NEXT_PUBLIC_APP_URL || 'https://app.neramclasses.com').replace(/\/+$/, '')}/onboarding`;

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const SETUP_STEPS = [
  'Join your batch WhatsApp group',
  'Install Microsoft Authenticator',
  'Install Microsoft Teams',
  'Sign in and choose your own password',
  'Open Nexus and add your photo',
] as const;

export function classAccountWelcomeHtml(input: { firstName: string; upn: string; setupUrl?: string }): string {
  const first = esc(input.firstName.trim().split(/\s+/)[0] || 'there');
  const url = esc(input.setupUrl || STUDENT_SETUP_URL);
  const steps = SETUP_STEPS.map(
    (step, i) =>
      `<tr><td style="padding:6px 10px 6px 0;vertical-align:top;"><span style="display:inline-block;width:24px;height:24px;line-height:24px;border-radius:12px;background:#E3F2FD;color:#0D47A1;font-weight:700;text-align:center;font-size:13px;">${i + 1}</span></td><td style="padding:6px 0;color:#222;">${esc(step)}</td></tr>`,
  ).join('');
  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
    <body style="margin:0;background:#f4f6f8;font-family:'Segoe UI',Arial,sans-serif;line-height:1.6;color:#222;">
      <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
        <div style="background:#0D47A1;color:#fff;padding:24px;border-radius:8px 8px 0 0;">
          <h1 style="margin:0;font-size:22px;">Your class account is ready</h1>
          <p style="margin:4px 0 0;opacity:.92;">Neram Classes</p>
        </div>
        <div style="background:#fff;padding:24px;border-radius:0 0 8px 8px;">
          <p style="margin-top:0;">Hi <strong>${first}</strong>,</p>
          <p>Welcome to the class. You will use this Microsoft login for live classes on Teams and for Nexus, our class app.</p>
          <div style="background:#F5F8FF;border:1px solid #D6E2FF;border-radius:8px;padding:14px 16px;margin:16px 0;">
            <div style="font-size:13px;color:#555;">Your login ID</div>
            <div style="font-size:17px;font-weight:700;color:#0D47A1;word-break:break-all;">${esc(input.upn)}</div>
            <div style="font-size:13px;color:#555;margin-top:6px;">Your password is shown in the setup page, after you sign in.</div>
          </div>
          <p style="margin-bottom:4px;">The setup takes about 10 minutes:</p>
          <table role="presentation" style="border-collapse:collapse;margin:0 0 8px;">${steps}</table>
          <p style="text-align:center;margin:24px 0;">
            <a href="${url}" style="display:inline-block;background:#1565C0;color:#fff;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:600;">Start your setup</a>
          </p>
          <p style="font-size:13px;color:#555;">Sign in with the same Google account or phone number you enrolled with. It is your personal page, so please do not share it.</p>
          <p style="font-size:13px;color:#555;margin-bottom:0;">Stuck anywhere? Reply to this email and our team will help.</p>
        </div>
        <p style="text-align:center;font-size:12px;color:#777;">Neram Classes, Architecture Entrance Coaching | www.neramclasses.com</p>
      </div>
    </body>
    </html>`;
}

export async function sendClassAccountWelcomeEmail(input: {
  to: string;
  firstName: string;
  upn: string;
  setupUrl?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    return await sendEmail({
      to: input.to,
      subject: 'Your Neram Classes class account is ready',
      html: classAccountWelcomeHtml(input),
    });
  } catch (err: any) {
    return { success: false, error: err?.message || 'Email failed' };
  }
}

// ── The batch WhatsApp group ────────────────────────────────────────────────

const GROUP_LINK = /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+\/?$/;

export function isWhatsAppGroupLink(value: unknown): value is string {
  return typeof value === 'string' && GROUP_LINK.test(value.trim());
}

/**
 * The join_whatsapp step config has held the link both as {"url": "..."} and,
 * after a hand edit, as a key ({"https://chat.whatsapp.com/...": ""}).
 */
export function linkFromStepConfig(config: unknown): string | null {
  if (!config || typeof config !== 'object') return null;
  const record = config as Record<string, unknown>;
  if (isWhatsAppGroupLink(record.url)) return String(record.url).trim();
  const key = Object.keys(record).find((k) => isWhatsAppGroupLink(k));
  return key || null;
}

export interface WhatsAppGroupLink {
  url: string;
  /** Where it came from, so Admin can say what to edit. */
  source: 'batch' | 'course' | 'onboarding_step';
  batchLabel: string | null;
}

/**
 * The student's batch group: the batch of their active classroom first (a
 * student who picked the wrong exam year on the form is still in the right
 * class), then users.academic_year, then the course link, then the old step
 * config. Null when none is set.
 */
export async function getWhatsAppGroupLinkForUser(
  supabase: TypedSupabaseClient,
  userId: string,
): Promise<WhatsAppGroupLink | null> {
  const db = supabase as any;
  const years: string[] = [];

  const { data: enrolments } = await db
    .from('nexus_enrollments')
    .select('classroom:nexus_classrooms(academic_year, is_archived)')
    .eq('user_id', userId)
    .eq('is_active', true);
  for (const row of (enrolments || []) as any[]) {
    const year = row.classroom?.academic_year;
    if (year && !row.classroom?.is_archived && !years.includes(year)) years.push(year);
  }
  const { data: user } = await db.from('users').select('academic_year').eq('id', userId).maybeSingle();
  if (user?.academic_year && !years.includes(user.academic_year)) years.push(user.academic_year);

  if (years.length) {
    const { data: batches } = await db
      .from('academic_batches')
      .select('code, label, whatsapp_group_url')
      .in('code', years);
    for (const year of years) {
      const batch = ((batches || []) as any[]).find((b) => b.code === year);
      if (batch && isWhatsAppGroupLink(batch.whatsapp_group_url)) {
        return { url: batch.whatsapp_group_url.trim(), source: 'batch', batchLabel: batch.label || batch.code };
      }
    }
  }

  const { data: profile } = await db.from('student_profiles').select('course_id').eq('user_id', userId).maybeSingle();
  if (profile?.course_id) {
    const { data: links } = await db
      .from('course_group_links')
      .select('whatsapp_group_url')
      .eq('course_id', profile.course_id)
      .maybeSingle();
    if (isWhatsAppGroupLink(links?.whatsapp_group_url)) {
      return { url: links.whatsapp_group_url.trim(), source: 'course', batchLabel: null };
    }
  }

  const { data: step } = await db
    .from('onboarding_step_definitions')
    .select('action_config')
    .eq('step_key', 'join_whatsapp')
    .maybeSingle();
  const fromStep = linkFromStepConfig(step?.action_config);
  return fromStep ? { url: fromStep, source: 'onboarding_step', batchLabel: null } : null;
}

// ── WhatsApp (held while the account is blocked) ────────────────────────────

export const CLASS_ACCOUNT_WA_TEMPLATES = {
  class_account_ready: {
    name: 'class_account_ready',
    params: ['recipientName', 'loginId', 'url'] as const,
    body:
      'Hi {{1}}, welcome to Neram Classes! Your class account is ready. Login ID: {{2}}. ' +
      'Open {{3}} and sign in with the Google account or phone you enrolled with to see your password and finish 5 short setup steps. ' +
      'Reply here if you need help.',
  },
};

export async function sendClassAccountWhatsApp(phone: string, firstName: string, upn: string): Promise<WhatsAppSendResult> {
  if (!isWhatsAppConfigured()) {
    return { success: false, error: 'WA_NOT_CONFIGURED: WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN is not set' };
  }
  return sendWhatsAppTemplate(phone, CLASS_ACCOUNT_WA_TEMPLATES.class_account_ready.name, 'en', [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: firstName.trim().split(/\s+/)[0] || 'there' },
        { type: 'text', text: upn },
        { type: 'text', text: STUDENT_SETUP_URL },
      ],
    },
  ]);
}

// ── How far the student is in the setup guide ───────────────────────────────

export const GUIDE_STEP_KEYS = ['whatsapp', 'authenticator', 'teams', 'signin', 'nexus'] as const;
export type GuideStepKey = (typeof GUIDE_STEP_KEYS)[number];

/** The steps a student ticks themselves. The others are detected. */
export const SELF_TICK_STEPS: readonly GuideStepKey[] = ['whatsapp', 'authenticator', 'teams'];

export interface GuideSignals {
  ticks: Partial<Record<GuideStepKey, string>> | null | undefined;
  /** They chose their own password: they signed in to Microsoft. */
  passwordChangedAt: string | null | undefined;
  nexusFirstLoginAt: string | null | undefined;
  photoStatus: string | null | undefined;
}

/**
 * Each step done or not. Signing in also proves the apps exist on some device,
 * so a student who skipped ticking them is not told to install them again.
 */
export function guideProgress(signals: GuideSignals): { done: Record<GuideStepKey, boolean>; count: number; total: number } {
  const ticks = signals.ticks || {};
  const signedIn = !!signals.passwordChangedAt || !!signals.nexusFirstLoginAt;
  const photo = signals.photoStatus === 'pending' || signals.photoStatus === 'approved';
  const done: Record<GuideStepKey, boolean> = {
    whatsapp: !!ticks.whatsapp,
    authenticator: !!ticks.authenticator || signedIn,
    teams: !!ticks.teams || signedIn,
    signin: signedIn,
    nexus: photo,
  };
  const count = GUIDE_STEP_KEYS.filter((key) => done[key]).length;
  return { done, count, total: GUIDE_STEP_KEYS.length };
}
