import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * POST /api/checklists/[id]/entries/reorder
 * Reorder checklist entries by updating sort_order.
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
    const { entries } = body;

    if (!entries || !Array.isArray(entries)) {
      return NextResponse.json({ error: 'entries array is required' }, { status: 400 });
    }

    // Update sort_order for each entry
    const updates = entries.map((e: { id: string; sort_order: number }) =>
      (supabase as any)
        .from('nexus_checklist_entries')
        .update({ sort_order: e.sort_order })
        .eq('id', e.id)
        .eq('checklist_id', id)
    );

    await Promise.all(updates);

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to reorder entries';
    console.error('Checklist entries reorder error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
