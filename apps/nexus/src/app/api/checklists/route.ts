import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/checklists
 * List all active checklists with entry counts and assigned classrooms.
 */
export async function GET(request: NextRequest) {
  try {
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

    const { data: checklists, error } = await (supabase as any)
      .from('nexus_checklists')
      .select('*, entries:nexus_checklist_entries(count), classrooms:nexus_checklist_classrooms(*, classroom:nexus_classrooms(id, name, type))')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Flatten nested classroom data for frontend consumption
    const flatChecklists = (checklists || []).map((cl: any) => ({
      ...cl,
      entry_count: cl.entries?.[0]?.count ?? 0,
      entries: undefined,
      classrooms: (cl.classrooms || []).map((cc: any) => ({
        id: cc.classroom?.id || cc.classroom_id,
        name: cc.classroom?.name || 'Unknown',
        type: cc.classroom?.type || 'other',
      })),
    }));

    return NextResponse.json({ checklists: flatChecklists });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load checklists';
    console.error('Checklists GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * POST /api/checklists
 * Create a new checklist.
 */
export async function POST(request: NextRequest) {
  try {
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
    const { title, description } = body;

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const { data: checklist, error } = await (supabase as any)
      .from('nexus_checklists')
      .insert({
        title,
        description: description || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ checklist }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create checklist';
    console.error('Checklists POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
