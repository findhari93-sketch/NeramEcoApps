import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { archiveReferenceImage } from '@neram/database/queries/nexus';

/** DELETE /api/drawing/references/[id]  — staff archive (soft-delete) a reference. */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase.from('users').select('id, user_type').eq('ms_oid', msUser.oid).single();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (user.user_type !== 'teacher' && user.user_type !== 'admin') {
      return NextResponse.json({ error: 'Only teachers can remove references' }, { status: 403 });
    }

    await archiveReferenceImage(params.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}
