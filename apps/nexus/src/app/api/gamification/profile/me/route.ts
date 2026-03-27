import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/gamification/profile/me
 *
 * Redirects to the current user's profile endpoint.
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Proxy to the [studentId] route with self flag
    const url = new URL(request.url);
    url.pathname = `/api/gamification/profile/${user.id}`;
    const proxyResponse = await fetch(url.toString(), {
      headers: { Authorization: request.headers.get('Authorization') || '' },
    });

    const data = await proxyResponse.json();
    return NextResponse.json(data, { status: proxyResponse.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load profile';
    console.error('Profile me error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
