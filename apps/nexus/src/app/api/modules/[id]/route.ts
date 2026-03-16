import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/modules/[id]
 * Get module by ID with items ordered by sort_order.
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

    const [moduleResult, itemsResult] = await Promise.all([
      supabase.from('nexus_modules').select('*').eq('id', id).single(),
      supabase
        .from('nexus_module_items')
        .select('*')
        .eq('module_id', id)
        .order('sort_order', { ascending: true }),
    ]);

    if (moduleResult.error) {
      if (moduleResult.error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Module not found' }, { status: 404 });
      }
      throw moduleResult.error;
    }

    return NextResponse.json({
      module: {
        ...moduleResult.data,
        items: itemsResult.data || [],
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load module';
    console.error('Module GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * PUT /api/modules/[id]
 * Update a module.
 */
export async function PUT(
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
    const { title, description, icon, color, is_published } = body;

    const updateData: Record<string, unknown> = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (icon !== undefined) updateData.icon = icon;
    if (color !== undefined) updateData.color = color;
    if (is_published !== undefined) updateData.is_published = is_published;

    const { data: module, error } = await supabase
      .from('nexus_modules')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ module });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update module';
    console.error('Module PUT error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/modules/[id]
 * Hard-delete a module.
 */
export async function DELETE(
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

    const { error } = await supabase
      .from('nexus_modules')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete module';
    console.error('Module DELETE error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
