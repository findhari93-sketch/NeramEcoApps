import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/modules/[id]/items
 * List items for a module.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user || !['teacher', 'admin'].includes(user.user_type)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: items, error } = await supabase
      .from('nexus_module_items')
      .select('*')
      .eq('module_id', id)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ items: items || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load module items';
    console.error('Module items GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * POST /api/modules/[id]/items
 * Create a module item.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user || !['teacher', 'admin'].includes(user.user_type)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { title, item_type, content_url, youtube_video_id, sort_order, metadata } = body;

    if (!title || !item_type) {
      return NextResponse.json({ error: 'Title and item_type are required' }, { status: 400 });
    }

    const { data: item, error } = await supabase
      .from('nexus_module_items')
      .insert({
        module_id: id,
        title,
        item_type,
        content_url: content_url || null,
        youtube_video_id: youtube_video_id || null,
        sort_order: sort_order ?? 0,
        metadata: metadata || null,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create module item';
    console.error('Module items POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
