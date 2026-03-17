import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/modules/[id]/items/[itemId]/feedback
 * Returns the student's reaction and counts for this module item.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { itemId } = await params;
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const [reactionResult, likeResult, dislikeResult] = await Promise.all([
      supabase
        .from('nexus_module_item_reactions')
        .select('reaction')
        .eq('student_id', user.id)
        .eq('module_item_id', itemId)
        .single(),
      supabase
        .from('nexus_module_item_reactions')
        .select('id', { count: 'exact', head: true })
        .eq('module_item_id', itemId)
        .eq('reaction', 'like'),
      supabase
        .from('nexus_module_item_reactions')
        .select('id', { count: 'exact', head: true })
        .eq('module_item_id', itemId)
        .eq('reaction', 'dislike'),
    ]);

    return NextResponse.json({
      reaction: reactionResult.data || null,
      counts: {
        like_count: likeResult.count || 0,
        dislike_count: dislikeResult.count || 0,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to get feedback';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * POST /api/modules/[id]/items/[itemId]/feedback
 * Set or remove reaction: { reaction: "like" | "dislike" | null }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { itemId } = await params;
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const body = await request.json();
    const supabase = getSupabaseAdminClient() as any;

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (body.reaction === null) {
      await supabase
        .from('nexus_module_item_reactions')
        .delete()
        .eq('student_id', user.id)
        .eq('module_item_id', itemId);
    } else if (body.reaction === 'like' || body.reaction === 'dislike') {
      await supabase
        .from('nexus_module_item_reactions')
        .upsert(
          {
            student_id: user.id,
            module_item_id: itemId,
            reaction: body.reaction,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'student_id,module_item_id' }
        );
    } else {
      return NextResponse.json({ error: 'Invalid reaction' }, { status: 400 });
    }

    // Return updated counts
    const [likeResult, dislikeResult] = await Promise.all([
      supabase
        .from('nexus_module_item_reactions')
        .select('id', { count: 'exact', head: true })
        .eq('module_item_id', itemId)
        .eq('reaction', 'like'),
      supabase
        .from('nexus_module_item_reactions')
        .select('id', { count: 'exact', head: true })
        .eq('module_item_id', itemId)
        .eq('reaction', 'dislike'),
    ]);

    return NextResponse.json({
      reaction: body.reaction ? { reaction: body.reaction } : null,
      counts: {
        like_count: likeResult.count || 0,
        dislike_count: dislikeResult.count || 0,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save feedback';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
