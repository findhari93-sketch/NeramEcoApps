/**
 * Aintra is free for a guest on the day they first chat. When they come back
 * on a later day (India time), Aintra asks them to sign in before it answers.
 *
 * A guest is known by the neram_anon_id cookie (lib/aintra/visitor.ts), and
 * every answered question is a chatbot_conversations row carrying that id. So
 * "has this guest chatted before today?" is one indexed lookup. Clearing
 * cookies starts them fresh, which is fine for a sign-up prompt.
 *
 * Fails open: if the lookup errors, the guest gets their answer.
 */
import type { createAdminClient } from '@neram/database';

type Db = ReturnType<typeof createAdminClient>;

/** Logged as the turn's error when a returning guest is asked to sign in. Admin reads it too. */
export const SIGNUP_REQUIRED = 'SIGNUP_REQUIRED';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Midnight at the start of today in India, as an instant. */
export function startOfIstDay(now: Date): Date {
  const istMs = now.getTime() + IST_OFFSET_MS;
  return new Date(Math.floor(istMs / DAY_MS) * DAY_MS - IST_OFFSET_MS);
}

/** True when the guest's earliest chat was on an earlier India day than now. */
export function needsSignIn(input: { firstChatAt: string | Date | null; now: Date }): boolean {
  if (!input.firstChatAt) return false;
  const first = typeof input.firstChatAt === 'string' ? new Date(input.firstChatAt) : input.firstChatAt;
  if (Number.isNaN(first.getTime())) return false;
  return first.getTime() < startOfIstDay(input.now).getTime();
}

/** Has this guest chatted with Aintra on an earlier day? Never throws. */
export async function guestNeedsSignIn(db: Db, anonymousId: string | null, now = new Date()): Promise<boolean> {
  if (!anonymousId) return false;
  try {
    const { data, error } = await (db as any)
      .from('chatbot_conversations')
      .select('created_at')
      .eq('anonymous_id', anonymousId)
      .lt('created_at', startOfIstDay(now).toISOString())
      .limit(1);
    if (error || !Array.isArray(data) || !data.length) return false;
    return needsSignIn({ firstChatAt: data[0].created_at, now });
  } catch {
    return false;
  }
}

/**
 * E2E only: the suite never writes chat rows, so it cannot build a real
 * returning guest. This header stands in for one. Ignored outside E2E mode.
 */
export const E2E_RETURNING_GUEST_HEADER = 'x-e2e-returning-guest';
