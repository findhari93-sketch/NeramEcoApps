import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/checklists/[id]/classrooms
 * List classrooms assigned to this checklist.
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

    const { data: classrooms, error } = await (supabase as any)
      .from('nexus_checklist_classrooms')
      .select('*, classroom:nexus_classrooms(id, name)')
      .eq('checklist_id', id);

    if (error) throw error;

    return NextResponse.json({ classrooms });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load checklist classrooms';
    console.error('Checklist classrooms GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * POST /api/checklists/[id]/classrooms
 * Assign checklist to classrooms.
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
    const { classroom_ids } = body;

    if (!classroom_ids || !Array.isArray(classroom_ids) || classroom_ids.length === 0) {
      return NextResponse.json({ error: 'classroom_ids array is required' }, { status: 400 });
    }

    const rows = classroom_ids.map((classroom_id: string) => ({
      checklist_id: id,
      classroom_id,
    }));

    const { data: assignments, error } = await (supabase as any)
      .from('nexus_checklist_classrooms')
      .upsert(rows, { onConflict: 'checklist_id,classroom_id' })
      .select();

    if (error) throw error;

    return NextResponse.json({ assignments });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to assign classrooms';
    console.error('Checklist classrooms POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
