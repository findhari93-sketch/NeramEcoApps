export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, getUserByFirebaseUid } from '@neram/database';
import { getFirebaseAdminAuth } from '@/lib/firebase-admin';
import { extractBearer } from '@/lib/admin-api-auth';
import { autoProvisionClassAccount } from '@/lib/class-account-auto';

/**
 * POST /api/class-account/self-serve (the student's Firebase ID token, no staff
 * token: exempt in admin-api-auth). A student opening their setup page asks for
 * their OWN class account; it is made only when they are enrolled. The app's
 * /api/class-setup/start forwards the student's token here, because only Admin
 * holds the Microsoft account rights and the setup store.
 */
export async function POST(request: NextRequest) {
  const token = extractBearer(request.headers.get('authorization'));
  if (!token) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });

  let uid: string;
  try {
    uid = (await getFirebaseAdminAuth().verifyIdToken(token)).uid;
  } catch {
    return NextResponse.json({ error: 'Sign in again to continue.' }, { status: 401 });
  }

  const supabase = getSupabaseAdminClient() as any;
  try {
    const user = await getUserByFirebaseUid(uid, supabase);
    if (!user) return NextResponse.json({ error: 'Sign in again to continue.' }, { status: 401 });
    const result = await autoProvisionClassAccount(supabase, user.id);
    if (result.status === 'failed') console.error(`[class-account/self-serve] ${user.id}: ${result.message}`);
    // The student sees "still being made" for a failure; staff see the reason on the card.
    return NextResponse.json({ success: true, data: { status: result.status } });
  } catch (error: any) {
    console.error('[class-account/self-serve] failed:', error?.message);
    return NextResponse.json({ error: 'Could not start your class account. Try again.' }, { status: 500 });
  }
}
