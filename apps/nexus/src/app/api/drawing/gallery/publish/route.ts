import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { setGalleryVisibility } from '@neram/database/queries/nexus';

/**
 * Toggle whether a submission appears in the unified gallery.
 * Teacher-only. Does NOT change the submission's review status — a redo
 * submission toggled visible stays a redo, it just appears in the gallery
 * as learning material.
 *
 * Body: { submission_id: string, visible?: boolean, publish?: boolean }
 * `publish` is accepted for backwards compatibility with older clients.
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase.from('users').select('id, user_type').eq('ms_oid', msUser.oid).single();
    if (!user || !['teacher', 'admin'].includes(user.user_type ?? '')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const body = await request.json();
    const { submission_id } = body;
    if (!submission_id) return NextResponse.json({ error: 'Missing submission_id' }, { status: 400 });

    const visible = body.visible !== undefined ? !!body.visible : body.publish !== false;
    await setGalleryVisibility(submission_id, visible);
    return NextResponse.json({ success: true, visible });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}
