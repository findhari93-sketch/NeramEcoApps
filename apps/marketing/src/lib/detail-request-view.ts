/**
 * What the public "your details" page is allowed to know before anything is proved.
 *
 * Possession of the link is the ONLY authentication this page has. The link travels
 * by WhatsApp, so it gets forwarded, screenshotted, and lands in family group chats
 * and on shared phones. Whatever this function returns should be assumed to be
 * readable by someone other than the student.
 *
 * So it returns a first name and a masked mailbox, which is enough for the right
 * student to recognise the link as theirs and not enough for anyone else to learn
 * anything. Nothing else: no phone, no surname, no father's name, no date of birth,
 * no address, no class, no fee, no application number, no classroom or teacher, no
 * user id.
 *
 * In particular it does NOT echo back answers we already hold. Prefilling would be
 * friendlier and would turn a forwarded link into a read oracle for a minor's date
 * of birth and home address. The form asks every question fresh instead; a draft in
 * the browser's own storage covers the student who closes the tab halfway.
 *
 * Kept in its own file, away from the route, so the exact key set can be pinned by a
 * test without a database. That test is the thing that stops a future "just prefill
 * it, it is friendlier" change going in unnoticed.
 */

/** Exactly the keys the browser may receive. Anything else is a leak. */
export const PUBLIC_VIEW_KEYS = ['firstName', 'maskedEmail', 'expiresAt'] as const;

export interface PublicDetailRequestView {
  firstName: string | null;
  maskedEmail: string | null;
  expiresAt: string;
}

const PLACEHOLDER_NAMES = new Set(['user', 'student', 'unnamed student']);

/**
 * "aXXX@neramclasses.com". Same shape as maskEmail in
 * apps/nexus/src/lib/application-form.ts, which makes the same judgement about
 * showing a contact detail to someone who has not proved who they are.
 */
export function maskEmail(value: string | null | undefined): string | null {
  const raw = String(value ?? '').trim();
  const at = raw.indexOf('@');
  if (at < 1) return null;
  return `${raw[0]}XXX${raw.slice(at)}`;
}

/**
 * A greeting name, or null.
 *
 * Deliberately does NOT fall back to the mailbox local part. That would print
 * "Ananya_AnoopPuthan" at whoever opened the link, which is both a surname we did
 * not mean to disclose and an organisation address. Better to greet nobody.
 */
function greetingName(user: { first_name?: string | null; name?: string | null }): string | null {
  for (const candidate of [user.first_name, user.name]) {
    const value = String(candidate ?? '').trim();
    if (!value) continue;
    if (PLACEHOLDER_NAMES.has(value.toLowerCase())) continue;
    return value.split(/\s+/)[0];
  }
  return null;
}

export function publicDetailRequestView(
  user: { first_name?: string | null; name?: string | null; email?: string | null },
  request: { expires_at: string },
): PublicDetailRequestView {
  return {
    firstName: greetingName(user),
    maskedEmail: maskEmail(user.email),
    expiresAt: request.expires_at,
  };
}
