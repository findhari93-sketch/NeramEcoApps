import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { listDrawingTags, upsertDrawingTag } from '@neram/database/queries/nexus';

/** GET: list all tags (seeded + user-created). */
export async function GET(request: NextRequest) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));
    const tags = await listDrawingTags();
    return NextResponse.json({ tags });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}

/** POST: create (or fetch existing) tag. Teacher / admin only. */
export async function POST(request: NextRequest) {
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
    const label = typeof body.label === 'string' ? body.label : '';
    if (!label.trim()) return NextResponse.json({ error: 'Missing label' }, { status: 400 });

    const tag = await upsertDrawingTag(label, user.id);
    return NextResponse.json({ tag });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}
