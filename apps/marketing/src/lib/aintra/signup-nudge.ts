/**
 * "Ask to sign up next visit", from Admin > Aintra Inbox.
 *
 * Staff flag a guest by their neram_anon_id. The next time that visitor gets
 * an answer from Aintra, a short line and the existing Apply button are added
 * to the end of it (/apply runs the Google-then-OTP sign-in). The row is
 * claimed in one conditional update, so two tabs answering at once still show
 * the card once.
 */
import type { createAdminClient } from '@neram/database';

type Db = ReturnType<typeof createAdminClient>;

/** Added after the answer. The [[cta:apply]] directive renders as the Apply button. */
export const SIGNUP_NUDGE_TAIL =
  '\n\nWould you like our team to help you personally? Create a free account in under a minute and we will keep this chat for you.\n[[cta:apply]]';

/**
 * True when this guest has a queued sign-up card and this call claimed it.
 * Never throws: a missing table or a network blip just means no card.
 */
export async function claimSignupNudge(
  db: Db,
  input: { anonymousId: string | null; sessionId: string; signedIn: boolean; now?: Date }
): Promise<boolean> {
  if (input.signedIn || !input.anonymousId) return false;
  try {
    const { data, error } = await (db as any)
      .from('aintra_signup_nudges')
      .update({ shown_at: (input.now ?? new Date()).toISOString(), shown_session_id: input.sessionId.slice(0, 200) })
      .eq('anonymous_id', input.anonymousId)
      .is('shown_at', null)
      .select('anonymous_id');
    if (error) return false;
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}
