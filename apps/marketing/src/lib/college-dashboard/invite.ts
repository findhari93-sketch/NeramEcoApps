import type { CollegeRole } from './permissions';
import { sendDashboardEmail, simpleEmail, type SendResult } from './email';
import { DashboardError } from './auth';

/**
 * Sign-in links for college accounts. No passwords are made up and shared:
 * Supabase issues a one-time token, and /college-dashboard/welcome turns it into
 * a session where the person sets their own password. Admin > College Hub >
 * Accounts builds the same link (apps/admin/src/app/api/college-hub/accounts).
 */
export async function makeSignInLink(db: any, email: string, name: string, origin: string): Promise<{ link: string; userId: string }> {
  let res = await db.auth.admin.generateLink({ type: 'invite', email, options: { data: { name, role: 'college_admin' } } });
  let type: 'invite' | 'magiclink' = 'invite';
  if (res.error && /registered|exists/i.test(res.error.message ?? '')) {
    res = await db.auth.admin.generateLink({ type: 'magiclink', email });
    type = 'magiclink';
  }
  if (res.error || !res.data?.properties?.hashed_token) {
    // 424, not 502: Cloudflare swaps an origin 502 for its own page.
    throw new DashboardError(424, `Could not create the sign-in link: ${res.error?.message ?? 'no token'}`);
  }
  const token = encodeURIComponent(res.data.properties.hashed_token);
  return { link: `${origin}/college-dashboard/welcome?token_hash=${token}&type=${type}`, userId: res.data.user.id };
}

export function inviteEmail(opts: { collegeName: string; name: string; invitedBy: string; link: string }): string {
  return simpleEmail({
    heading: `You're invited to the ${opts.collegeName} dashboard`,
    lines: [
      `Hello ${opts.name},`,
      `${opts.invitedBy} has added you to the ${opts.collegeName} dashboard on Neram Classes. There you can keep your college page up to date, see students who asked about admission, and reply to reviews.`,
      'Open the link below and choose a password to finish setting up your account.',
    ],
    button: { label: 'Set up your account', href: opts.link },
    footnote: 'The link works once and expires in 24 hours. If it has expired, ask the person who invited you to send a new one.',
  });
}

export interface InviteInput {
  collegeId: string;
  collegeName: string;
  name: string;
  email: string;
  phone?: string | null;
  designation?: string | null;
  role: CollegeRole;
  invitedBy: string;
  origin: string;
}

/** Adds a person to a college (or re-invites them) and emails the link. */
export async function inviteCollegePerson(db: any, input: InviteInput): Promise<{ id: string; invite_link: string; email: SendResult }> {
  const email = input.email.trim().toLowerCase();
  const { data: existing } = await db.from('college_admins').select('id, college_id').ilike('email', email).maybeSingle();
  if (existing && existing.college_id !== input.collegeId) {
    throw new DashboardError(409, 'This email is already linked to another college. Use a different email.');
  }

  const { link, userId } = await makeSignInLink(db, email, input.name, input.origin);
  const row = {
    college_id: input.collegeId,
    name: input.name.trim(),
    email,
    phone: input.phone?.trim() || null,
    designation: input.designation?.trim() || null,
    role: input.role,
    supabase_uid: userId,
    is_active: true,
    invited_at: new Date().toISOString(),
    invited_by: input.invitedBy,
  };
  const write = existing
    ? db.from('college_admins').update(row).eq('id', existing.id).select('id').single()
    : db.from('college_admins').insert(row).select('id').single();
  const { data, error } = await write;
  if (error) throw new DashboardError(500, error.message);

  const sent = await sendDashboardEmail(
    email,
    `You're invited to the ${input.collegeName} dashboard on Neram Classes`,
    inviteEmail({ collegeName: input.collegeName, name: row.name, invitedBy: input.invitedBy, link })
  );
  return { id: data.id, invite_link: link, email: sent };
}
