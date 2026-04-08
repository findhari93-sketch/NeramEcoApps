import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getDrawingReviewQueue } from '@neram/database/queries/nexus';

export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user || !['teacher', 'admin'].includes(user.user_type)) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const params = request.nextUrl.searchParams;
    const rawStatus = params.get('status') || 'submitted';
    // The 'reviewed' tab covers both 'reviewed' (feedback sent) and 'redo' (sent back for improvement)
    // 'reviewed_only' is a sub-filter for just the 'reviewed' status (excludes redo)
    let status: string | string[];
    if (rawStatus === 'reviewed') status = ['reviewed', 'redo'];
    else if (rawStatus === 'reviewed_only') status = 'reviewed';
    else status = rawStatus;
    const filters = {
      status,
      category: params.get('category') || undefined,
      student_id: params.get('student_id') || undefined,
      limit: params.get('limit') ? parseInt(params.get('limit')!) : 50,
      offset: params.get('offset') ? parseInt(params.get('offset')!) : 0,
    };

    const submissions = await getDrawingReviewQueue(filters);
    return NextResponse.json({ submissions });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load review queue';
    console.error('Review queue GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
