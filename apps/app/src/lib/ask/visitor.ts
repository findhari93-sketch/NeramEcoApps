/**
 * Who is asking: a signed-in student (verified Firebase token, mapped to the
 * Supabase user) or a guest, known by the shared neram_anon_id cookie that the
 * marketing site and the app already use for analytics. A guest without the
 * cookie gets a new id, set on the response, so their daily allowance and their
 * remembered details follow them across visits.
 */
import type { NextRequest } from 'next/server';
import { getSupabaseAdminClient, getUserByFirebaseUid } from '@neram/database';
import { ANON_ID_COOKIE, anonIdCookie, isValidAnonymousId, newAnonymousId, readCookie } from '@neram/database/analytics';
import { verifyIdToken } from '@/lib/firebase-admin';

export interface AskVisitor {
  userId: string | null;
  anonId: string;
  /** The anon id is new; send `setCookie` with the response. */
  minted: boolean;
  setCookie: string | null;
}

export async function askVisitorFrom(req: NextRequest): Promise<AskVisitor> {
  let userId: string | null = null;
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (token) {
    try {
      const decoded = await verifyIdToken(token);
      const user = await getUserByFirebaseUid(decoded.uid, getSupabaseAdminClient());
      userId = (user as { id?: string } | null)?.id ?? null;
    } catch {
      // An expired or bad token is treated as a guest, never as an error.
    }
  }
  const existing = readCookie(req.headers.get('cookie'), ANON_ID_COOKIE);
  if (isValidAnonymousId(existing)) return { userId, anonId: existing, minted: false, setCookie: null };
  const anonId = newAnonymousId();
  const host = req.headers.get('host')?.split(':')[0] ?? 'app.neramclasses.com';
  const secure = !/^(localhost|127\.0\.0\.1)$/.test(host);
  return { userId, anonId, minted: true, setCookie: anonIdCookie(anonId, host, secure) };
}
