import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { setAlumniFeatured } from '@neram/database/queries/nexus';

/**
 * Pin / unpin an alumnus submission in the Alumni Hall of Fame. Teacher/admin only.
 * Body: { featured: boolean }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { submissionId: string } }
) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();
    if (!user || !['teacher', 'admin'].includes(user.user_type ?? '')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const { submissionId } = params;
    if (!submissionId) return NextResponse.json({ error: 'Missing submissionId' }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const featured = !!body.featured;

    await setAlumniFeatured(submissionId, featured);
    return NextResponse.json({ success: true, featured });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}
