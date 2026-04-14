import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import {
  getSupabaseAdminClient,
  listPendingClassroomAccessRequests,
  updateClassroomAccessRequestStatus,
} from '@neram/database';

/**
 * GET /api/classroom-access/requests
 * List all classroom access requests for admin/teacher review.
 * Query params: ?status=pending|approved|rejected (default: all)
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user || (user.user_type !== 'teacher' && user.user_type !== 'admin')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const statusFilter = request.nextUrl.searchParams.get('status');

    if (statusFilter === 'pending') {
      const requests = await listPendingClassroomAccessRequests();
      return NextResponse.json({ requests });
    }

    // Fetch all requests (optionally filtered by status)
    let query = supabase
      .from('classroom_access_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (statusFilter && statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ requests: data || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch requests';
    console.error('GET /api/classroom-access/requests error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * POST /api/classroom-access/requests
 * Approve or reject a classroom access request.
 * Body: { request_id, action: 'approve' | 'reject', admin_notes? }
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    const { data: reviewer } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!reviewer || (reviewer.user_type !== 'teacher' && reviewer.user_type !== 'admin')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const body = await request.json();
    const { request_id, action, admin_notes } = body;

    if (!request_id || !action) {
      return NextResponse.json({ error: 'request_id and action required' }, { status: 400 });
    }

    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const result = await updateClassroomAccessRequestStatus(
      request_id,
      action === 'approve' ? 'approved' : 'rejected',
      reviewer.id,
      admin_notes
    );

    return NextResponse.json({ request: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to process request';
    console.error('POST /api/classroom-access/requests error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
