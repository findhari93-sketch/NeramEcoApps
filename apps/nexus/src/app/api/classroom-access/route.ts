import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import {
  getSupabaseAdminClient,
  createClassroomAccessRequest,
  getClassroomAccessRequest,
  notifyClassroomAccessRequested,
} from '@neram/database';

/**
 * GET /api/classroom-access
 * Returns the current user's latest classroom access request (or null).
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const msUser = await verifyMsToken(authHeader);

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ request: null });
    }

    const accessRequest = await getClassroomAccessRequest(user.id);
    return NextResponse.json({ request: accessRequest });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch request';
    console.error('GET /api/classroom-access error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * POST /api/classroom-access
 * Creates a classroom access request. Idempotent — returns existing if pending.
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const msUser = await verifyMsToken(authHeader);

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id, name, email')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const accessRequest = await createClassroomAccessRequest(
      user.id,
      user.name || msUser.name,
      user.email || msUser.email
    );

    // Only notify if this is a fresh request (created just now, not an existing one)
    const createdJustNow = Date.now() - new Date(accessRequest.created_at).getTime() < 5000;
    if (createdJustNow) {
      try {
        await notifyClassroomAccessRequested({
          userId: user.id,
          userName: user.name || msUser.name,
          userEmail: user.email || msUser.email,
          requestId: accessRequest.id,
        });
      } catch (notifErr) {
        console.error('Notification dispatch error:', notifErr);
        // Don't fail the request if notification fails
      }
    }

    return NextResponse.json({ request: accessRequest }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create request';
    console.error('POST /api/classroom-access error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
