import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/checklists/[id]
 * Get checklist by ID with entries (ordered by sort_order), modules, resources, and assigned classrooms.
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

    const { data: checklist, error } = await (supabase as any)
      .from('nexus_checklists')
      .select('*, entries:nexus_checklist_entries(*, module:nexus_modules(*, items:nexus_module_items(*)), resources:nexus_checklist_entry_resources(*)), classrooms:nexus_checklist_classrooms(*, classroom:nexus_classrooms(id, name, type))')
      .eq('id', id)
      .order('sort_order', { referencedTable: 'nexus_checklist_entries', ascending: true })
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Checklist not found' }, { status: 404 });
      }
      throw error;
    }

    // Flatten nested classroom data for frontend consumption
    const flatChecklist = {
      ...checklist,
      classrooms: (checklist.classrooms || []).map((cc: any) => ({
        id: cc.classroom?.id || cc.classroom_id,
        name: cc.classroom?.name || 'Unknown',
        type: cc.classroom?.type || 'other',
      })),
    };

    return NextResponse.json({ checklist: flatChecklist });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load checklist';
    console.error('Checklist GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * PUT /api/checklists/[id]
 * Update checklist details.
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
    const { title, description, is_active } = body;

    const updateData: Record<string, unknown> = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (is_active !== undefined) updateData.is_active = is_active;

    const { data: checklist, error } = await (supabase as any)
      .from('nexus_checklists')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ checklist });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update checklist';
    console.error('Checklist PUT error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/checklists/[id]
 * Soft-delete checklist (set is_active=false).
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

    const { error } = await (supabase as any)
      .from('nexus_checklists')
      .update({ is_active: false })
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete checklist';
    console.error('Checklist DELETE error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
