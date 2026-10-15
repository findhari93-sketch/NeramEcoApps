/**
 * Creates the one-time link a college person uses to set up their dashboard
 * account, and emails it. Server only (uses the service role).
 */
import { getSupabaseAdminClient } from '@neram/database';
import { marketingOriginFor } from '@/lib/marketing-links';
import { sendOutreachEmail } from '@/lib/college-outreach/send';
import {
  buildWelcomeLink,
  emailSkipReason,
  isAlreadyRegisteredError,
  renderInviteEmail,
  type CollegeRole,
  type InviteLinkType,
} from './invite';

export interface GeneratedLink {
  link: string;
  type: InviteLinkType;
  userId: string;
}

/**
 * An invite link for a new auth user, or a magic link when the email already
 * has an auth user (re-invites, resends, people moved between colleges).
 */
export async function generateAccountLink(
  email: string,
  name: string,
  adminOrigin: string,
): Promise<GeneratedLink> {
  const auth = getSupabaseAdminClient().auth.admin;
  const origin = marketingOriginFor(adminOrigin, process.env.NEXT_PUBLIC_MARKETING_URL);

  const invite = await auth.generateLink({
    type: 'invite',
    email,
    options: { data: { name, role: 'college_admin' } },
  });
  if (!invite.error && invite.data?.properties?.hashed_token && invite.data.user) {
    return {
      link: buildWelcomeLink(origin, invite.data.properties.hashed_token, 'invite'),
      type: 'invite',
      userId: invite.data.user.id,
    };
  }
  if (invite.error && !isAlreadyRegisteredError(invite.error as { message?: string; code?: string })) {
    throw new Error(invite.error.message);
  }

  const magic = await auth.generateLink({ type: 'magiclink', email });
  if (magic.error || !magic.data?.properties?.hashed_token || !magic.data.user) {
    throw new Error(magic.error?.message ?? 'Could not create a sign-in link.');
  }
  return {
    link: buildWelcomeLink(origin, magic.data.properties.hashed_token, 'magiclink'),
    type: 'magiclink',
    userId: magic.data.user.id,
  };
}

export interface EmailOutcome {
  email_sent: boolean;
  email_note: string;
}

export async function sendInviteEmail(input: {
  to: string;
  name: string;
  collegeName: string;
  link: string;
  role: CollegeRole;
}): Promise<EmailOutcome> {
  const skip = emailSkipReason(input.to, Boolean(process.env.RESEND_API_KEY));
  if (skip) return { email_sent: false, email_note: `Email not sent: ${skip}` };
  const { subject, html, text } = renderInviteEmail(input);
  const result = await sendOutreachEmail({ to: input.to, subject, html, text, replyTo: 'info@neramclasses.com' });
  if (!result.success) return { email_sent: false, email_note: `Email not sent: ${result.error ?? 'unknown error'}` };
  return { email_sent: true, email_note: `Email sent to ${input.to}` };
}
