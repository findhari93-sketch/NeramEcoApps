import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import {
  getSupabaseAdminClient,
  updateClassroomAccessRequestStatus,
} from '@neram/database';

/**
 * GET /api/classroom-access/requests
 * List all classroom access requests for admin/teacher review.
 * Query params: ?status=pending|approved|rejected (default: all)
 *
 * Each request is enriched with the requesting user's primary email,
 * linked Microsoft classroom email, and whether they actually have an
 * ms_oid linked, so admins can verify identity before approving.
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

    let query = supabase
      .from('classroom_access_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (statusFilter && statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data: requests, error } = await query;
    if (error) throw error;

    // Enrich with user identity info (so admin can see MS email vs Gmail)
    const enriched = await Promise.all(
      (requests || []).map(async (r: any) => {
        const { data: u } = await supabase
          .from('users')
          .select('email, linked_classroom_email, ms_oid, avatar_url')
          .eq('id', r.user_id)
          .maybeSingle();

        return {
          ...r,
          primary_email: u?.email || null,
          linked_classroom_email: u?.linked_classroom_email || null,
          has_ms_oid: !!u?.ms_oid,
          avatar_url: u?.avatar_url || null,
        };
      })
    );

    return NextResponse.json({ requests: enriched });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch requests';
    console.error('GET /api/classroom-access/requests error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * POST /api/classroom-access/requests
 * Approve or reject a classroom access request.
 * Body: { request_id, action: 'approve' | 'reject', classroom_id?, admin_notes? }
 *
 * On approve with classroom_id, the student is enrolled into the classroom
 * (creates a row in nexus_enrollments). Without classroom_id, only the
 * request status changes — the student stays stuck — so the UI should
 * always pass a classroom_id when approving.
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
    const { request_id, action, classroom_id, admin_notes } = body;

    if (!request_id || !action) {
      return NextResponse.json({ error: 'request_id and action required' }, { status: 400 });
    }

    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    // Look up the request to get the user_id we need for enrollment
    const { data: existingRequest } = await supabase
      .from('classroom_access_requests')
      .select('user_id')
      .eq('id', request_id)
      .single();

    if (!existingRequest) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    // On approve, enroll the student into the chosen classroom.
    // Skipping enrollment leaves the student stuck on NoClassroomWelcome
    // even though the request is "approved" — that's the bug we just fixed.
    if (action === 'approve' && classroom_id) {
      const { data: existingEnrollment } = await supabase
        .from('nexus_enrollments')
        .select('id, is_active')
        .eq('user_id', existingRequest.user_id)
        .eq('classroom_id', classroom_id)
        .maybeSingle();

      if (existingEnrollment) {
        if (!existingEnrollment.is_active) {
          await supabase
            .from('nexus_enrollments')
            .update({ is_active: true, removed_at: null, removed_by: null })
            .eq('id', existingEnrollment.id);
        }
      } else {
        const { error: enrollError } = await supabase
          .from('nexus_enrollments')
          .insert({
            user_id: existingRequest.user_id,
            classroom_id,
            role: 'student',
            is_active: true,
            enrolled_at: new Date().toISOString(),
          });

        if (enrollError) {
          console.error('Enrollment failed:', enrollError);
          return NextResponse.json(
            { error: `Enrollment failed: ${enrollError.message}` },
            { status: 500 }
          );
        }
      }
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
