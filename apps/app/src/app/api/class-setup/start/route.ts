export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { adminOriginFor } from '@/lib/admin-origin';

/**
 * POST: an enrolled student with no class account asks for it to be made now.
 * Admin makes it (it alone holds the Microsoft rights) after checking the
 * student's own Firebase token, which is forwarded as is. Replies with Admin's
 * status: ready, working, not_enrolled, has_account or failed.
 */
export async function POST(request: NextRequest) {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  const origin = adminOriginFor(request.headers.get('host'), process.env.ADMIN_APP_URL);
  try {
    const res = await fetch(`${origin}/api/class-account/self-serve`, {
      method: 'POST',
      headers: { Authorization: authorization },
      cache: 'no-store',
      signal: AbortSignal.timeout(55_000),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) return NextResponse.json({ error: json?.error || 'Could not start your class account.' }, { status: clientStatus(res.status) });
    return NextResponse.json({ success: true, data: json?.data ?? null }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error: any) {
    console.error('[class-setup/start] failed:', error?.message);
    return NextResponse.json({ error: 'Could not start your class account.' }, { status: 424 });
  }
}

/**
 * Never answer 502 or 504: Cloudflare in front of app.neramclasses.com swaps
 * those for its own HTML page and the student never sees the message.
 */
function clientStatus(status: number): number {
  return status === 502 || status === 504 ? 424 : status;
}
