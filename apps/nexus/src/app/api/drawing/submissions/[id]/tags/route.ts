import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getSubmissionTags, setSubmissionTags } from '@neram/database/queries/nexus';

/** GET: tags on a single submission. Any authenticated user. */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));
    const tags = await getSubmissionTags(params.id);
    return NextResponse.json({ tags });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}

/** PUT: replace a submission's tag set. Teacher / admin only. Body: { labels: string[] } */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
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

    const body = await request.json();
    const labels = Array.isArray(body.labels) ? body.labels.filter((l: unknown) => typeof l === 'string') : [];

    const tags = await setSubmissionTags(params.id, labels, user.id);
    return NextResponse.json({ tags });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}
