import { createHash } from 'crypto';
import type { CollegeContentSection } from '@/lib/college-hub/types';
import { isSection } from '@/lib/college-dashboard/content-sections';

/**
 * No-login update links (/college-update/<token>). Staff make them in
 * Admin > College Hub > Update links and send them by hand on WhatsApp.
 *
 * Only sha256(token) is stored. Keep this in step with
 * apps/admin/src/lib/college-update-links (token = 32 random bytes base64url,
 * hash = sha256 hex of the token string).
 */

const TOKEN = /^[A-Za-z0-9_-]{32,64}$/;

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export interface UpdateLinkRow {
  id: string;
  college_id: string;
  sections: string[] | null;
  recipient_name: string | null;
  expires_at: string;
  revoked_at: string | null;
  first_opened_at: string | null;
  open_count: number;
  submit_count: number;
}

export type LinkProblem = 'invalid' | 'expired' | 'cancelled';

/** Why a link cannot be used, or null when it can. */
export function linkProblem(link: Pick<UpdateLinkRow, 'expires_at' | 'revoked_at'> | null, now: Date = new Date()): LinkProblem | null {
  if (!link) return 'invalid';
  if (link.revoked_at) return 'cancelled';
  if (new Date(link.expires_at).getTime() < now.getTime()) return 'expired';
  return null;
}

/** The sections a link asks about, in the dashboard's order, unknown keys dropped. */
export function linkSections(link: Pick<UpdateLinkRow, 'sections'>): CollegeContentSection[] {
  const order: CollegeContentSection[] = ['profile', 'fees', 'admissions', 'facilities', 'location', 'photos'];
  const asked = (link.sections ?? []).filter(isSection);
  const list = order.filter((s) => asked.includes(s));
  return list.length ? list : ['profile', 'fees', 'admissions', 'location', 'photos'];
}

export const MAX_SUBMITS_PER_LINK = 30;

/**
 * Loads a link by its raw token. A malformed token is 'invalid' without a
 * database call.
 */
export async function loadLink(db: any, token: string): Promise<{ link: UpdateLinkRow | null; problem: LinkProblem | null }> {
  if (!TOKEN.test(token)) return { link: null, problem: 'invalid' };
  const { data } = await db
    .from('college_update_links')
    .select('id, college_id, sections, recipient_name, expires_at, revoked_at, first_opened_at, open_count, submit_count')
    .eq('token_hash', hashToken(token))
    .maybeSingle();
  const link = (data ?? null) as UpdateLinkRow | null;
  return { link, problem: linkProblem(link) };
}

export const PROBLEM_TEXT: Record<LinkProblem, { title: string; body: string; status: number }> = {
  invalid: {
    title: 'This link does not work',
    body: 'Please check you opened the whole link from the message. If it still does not work, ask the person who sent it for a new one.',
    status: 404,
  },
  expired: {
    title: 'This link has expired',
    body: 'Update links work for a limited time. Ask the person at Neram Classes who sent it for a new one.',
    status: 410,
  },
  cancelled: {
    title: 'This link is no longer active',
    body: 'Neram Classes has replaced or cancelled this link. Ask the person who sent it for a new one.',
    status: 410,
  },
};
