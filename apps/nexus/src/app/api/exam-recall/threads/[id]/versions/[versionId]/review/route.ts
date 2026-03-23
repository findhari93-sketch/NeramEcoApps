import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { reviewVersion } from '@neram/database/queries';

/**
 * PATCH /api/exam-recall/threads/[id]/versions/[versionId]/review
 *
 * Approve or reject a version. Only teachers/admins.
 * Body: { status: 'approved' | 'rejected' }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const { versionId } = await params;

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!['teacher', 'admin'].includes(user.user_type ?? '')) {
      return NextResponse.json({ error: 'Forbidden: only teachers and admins can review versions' }, { status: 403 });
    }

    const body = await request.json();
    const { status } = body;

    if (!status || !['approved', 'rejected'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be "approved" or "rejected"' },
        { status: 400 },
      );
    }

    const version = await reviewVersion(versionId, status, user.id);

    return NextResponse.json(version);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to review version';
    console.error('[exam-recall/threads/[id]/versions/[versionId]/review] PATCH error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
