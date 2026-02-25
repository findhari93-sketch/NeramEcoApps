// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import {
  getUserByFirebaseUid,
  getSupabaseAdminClient,
  getUserUnreadNotificationCount,
  listUserNotifications,
} from '@neram/database';

// CORS headers for cross-domain requests (marketing app)
const corsHeaders = {
  'Access-Control-Allow-Origin': process.env.NEXT_PUBLIC_MARKETING_URL || 'http://localhost:3010',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * GET /api/notifications
 * Query params:
 *   ?countOnly=true  - Returns just the unread count (for polling)
 *   ?limit=10&offset=0 - Returns paginated notifications list
 *
 * Auth: Firebase ID token in Authorization: Bearer <token>
 */
export async function GET(request: NextRequest) {
  try {
    // Extract and verify Firebase token
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
    }

    const idToken = authHeader.slice(7);
    const decodedToken = await verifyIdToken(idToken);

    // Resolve Firebase UID to Supabase user ID
    const adminClient = getSupabaseAdminClient();
    const user = await getUserByFirebaseUid(decodedToken.uid, adminClient);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404, headers: corsHeaders });
    }

    const { searchParams } = new URL(request.url);
    const countOnly = searchParams.get('countOnly') === 'true';

    if (countOnly) {
      const count = await getUserUnreadNotificationCount(user.id, adminClient);
      return NextResponse.json({ count }, { headers: corsHeaders });
    }

    const limit = parseInt(searchParams.get('limit') || '15');
    const offset = parseInt(searchParams.get('offset') || '0');
    const data = await listUserNotifications(user.id, { limit, offset }, adminClient);

    return NextResponse.json(data, { headers: corsHeaders });
  } catch (error: any) {
    console.error('Error fetching user notifications:', error);
    return NextResponse.json(
      { error: 'Failed to fetch notifications' },
      { status: 500, headers: corsHeaders }
    );
  }
}
