/**
 * Pure helpers for college dashboard accounts (Admin > College Hub > Accounts).
 *
 * People get an email link to set their own password; staff never see or send
 * a password. The link points at marketing's /college-dashboard/welcome, which
 * exchanges the Supabase token_hash for a session.
 */

export const COLLEGE_ROLES = ['owner', 'editor', 'viewer'] as const;
export type CollegeRole = (typeof COLLEGE_ROLES)[number];

export const ROLE_LABEL: Record<CollegeRole, string> = {
  owner: 'Owner',
  editor: 'Editor',
  viewer: 'Viewer',
};

export const ROLE_DESCRIPTION: Record<CollegeRole, string> = {
  owner: 'Manages the team and everything else.',
  editor: 'Edits the profile and handles leads.',
  viewer: 'Can only look.',
};

export type InviteLinkType = 'invite' | 'magiclink';

export function isCollegeRole(v: unknown): v is CollegeRole {
  return typeof v === 'string' && (COLLEGE_ROLES as readonly string[]).includes(v);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(v: unknown): string {
  return typeof v === 'string' ? v.trim().toLowerCase() : '';
}

export function isValidEmail(v: string): boolean {
  return EMAIL.test(v);
}

const TEST_DOMAINS = ['@neram.test', '@example.com', '@example.org'];

/** Why the invite email will not be sent, or null when it will. */
export function emailSkipReason(email: string, hasResendKey: boolean): string | null {
  const e = email.toLowerCase();
  if (TEST_DOMAINS.some((d) => e.endsWith(d))) return 'test address, no email sent';
  if (!hasResendKey) return 'email is not set up on this server (RESEND_API_KEY missing)';
  return null;
}

/** The link the person opens: <marketing>/college-dashboard/welcome?token_hash=...&type=invite|magiclink */
export function buildWelcomeLink(marketingOrigin: string, hashedToken: string, type: InviteLinkType): string {
  const base = marketingOrigin.replace(/\/+$/, '');
  const qs = new URLSearchParams({ token_hash: hashedToken, type });
  return `${base}/college-dashboard/welcome?${qs.toString()}`;
}

/** Supabase says this when an auth user with the email already exists. */
export function isAlreadyRegisteredError(err: { message?: string; code?: string; status?: number } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === 'email_exists' || err.code === 'user_already_exists') return true;
  return /already (been )?registered|already exists/i.test(err.message ?? '');
}

export interface InviteInput {
  college_id: string;
  name: string;
  email: string;
  phone: string | null;
  designation: string | null;
  role: CollegeRole;
  request_id: string | null;
}

export function validateInvite(body: unknown): { ok: true; value: InviteInput } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const str = (v: unknown, max = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
  const collegeId = str(b.college_id, 64);
  if (!collegeId) return { ok: false, error: 'Choose a college.' };
  const name = str(b.name);
  if (!name) return { ok: false, error: 'Enter the person\'s name.' };
  const email = normalizeEmail(b.email);
  if (!isValidEmail(email)) return { ok: false, error: 'Enter a valid email address.' };
  const role = b.role === undefined || b.role === null || b.role === '' ? 'editor' : b.role;
  if (!isCollegeRole(role)) return { ok: false, error: 'Role must be Owner, Editor or Viewer.' };
  return {
    ok: true,
    value: {
      college_id: collegeId,
      name,
      email,
      phone: str(b.phone, 40),
      designation: str(b.designation, 120),
      role,
      request_id: str(b.request_id, 64),
    },
  };
}

export interface AccountLike {
  id: string;
  college_id: string;
  role: string;
  is_active: boolean;
}

/** Active owners of a college, other than `exceptId`. */
export function otherActiveOwners(accounts: AccountLike[], collegeId: string, exceptId: string): number {
  return accounts.filter((a) => a.college_id === collegeId && a.id !== exceptId && a.is_active && a.role === 'owner').length;
}

/** Would this change leave the college with no active owner? */
export function removesLastOwner(
  accounts: AccountLike[],
  target: AccountLike,
  change: { role?: CollegeRole; is_active?: boolean },
): boolean {
  const wasOwner = target.is_active && target.role === 'owner';
  if (!wasOwner) return false;
  const stillOwner = (change.is_active ?? target.is_active) && (change.role ?? target.role) === 'owner';
  if (stillOwner) return false;
  return otherActiveOwners(accounts, target.college_id, target.id) === 0;
}

export type AccountStatus = 'invited' | 'active' | 'deactivated';

export function accountStatus(a: { is_active: boolean; accepted_at: string | null; last_login_at: string | null }): AccountStatus {
  if (!a.is_active) return 'deactivated';
  if (!a.accepted_at && !a.last_login_at) return 'invited';
  return 'active';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** The invite email. Same look as the lead notification email. No em dashes. */
export function renderInviteEmail(input: { name: string; collegeName: string; link: string; role: CollegeRole }): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `You're invited to the ${input.collegeName} dashboard on Neram Classes`;
  const first = input.name.split(/\s+/)[0] || input.name;
  const roleLine = `Your role: ${ROLE_LABEL[input.role]}. ${ROLE_DESCRIPTION[input.role]}`;
  const text = [
    `Hello ${first},`,
    '',
    `You have been invited to manage ${input.collegeName} on the Neram College Hub. From the dashboard you can update your college page, see student enquiries and reply to reviews.`,
    '',
    roleLine,
    '',
    'Set up your account (choose a password) here:',
    input.link,
    '',
    'This link works once and expires in 24 hours. If it has expired, reply to this email and we will send a new one.',
    '',
    'Warm regards,',
    'Neram Classes',
    'info@neramclasses.com',
  ].join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.6;color:#1e293b;max-width:620px;margin:0 auto;padding:24px;background:#ffffff">
<p>Hello ${escapeHtml(first)},</p>
<p>You have been invited to manage <strong>${escapeHtml(input.collegeName)}</strong> on the Neram College Hub. From the dashboard you can update your college page, see student enquiries and reply to reviews.</p>
<p style="font-size:14px;color:#475569">${escapeHtml(roleLine)}</p>
<p style="text-align:center;margin:24px 0">
  <a href="${escapeHtml(input.link)}" style="display:inline-block;background:#16a34a;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700">Set up your account</a>
</p>
<p style="font-size:13px;color:#64748b">This link works once and expires in 24 hours. If it has expired, reply to this email and we will send a new one.</p>
<p style="margin-top:28px">Warm regards,<br>
Neram Classes<br>
<a href="mailto:info@neramclasses.com" style="color:#2563eb">info@neramclasses.com</a></p>
</body>
</html>`;
  return { subject, html, text };
}
