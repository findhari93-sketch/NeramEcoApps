import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { toggleGalleryReaction } from '@neram/database/queries/nexus';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const { submissionId } = await params;
    const body = await request.json();
    const { reaction_type } = body;

    if (!['heart', 'clap', 'fire', 'star', 'wow'].includes(reaction_type)) {
      return NextResponse.json({ error: 'Invalid reaction type' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase.from('users').select('id').eq('ms_oid', msUser.oid).single();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const result = await toggleGalleryReaction(submissionId, user.id, reaction_type);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}
