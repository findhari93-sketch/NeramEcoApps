import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * POST /api/modules/[id]/items/[itemId]/issues
 * Body: { module_item_id, section_id?, title, description }
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

    if (!body.title?.trim()) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }

    const { data: user } = await supabase
      .from('users')
      .select('id, name')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { data: issue, error } = await supabase
      .from('nexus_module_item_issues')
      .insert({
        student_id: user.id,
        module_item_id: itemId,
        section_id: body.section_id || null,
        title: body.title.trim(),
        description: (body.description || '').trim(),
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ issue }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create issue';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
