import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { getRequestAdminId } from '@/lib/request-admin';
import { staffName } from '@/lib/aintra-inbox/server';

// PATCH /api/chatbot-logs/[id]: staff review of one Aintra turn.
//   thumbs_up       true (good answer), false (wrong answer), null (clear)
//   admin_correction  the better answer; saving one stamps who and when
//   promoted_to_kb  set after the correction is added to the knowledge base
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if ('thumbs_up' in body) {
    const v = body.thumbs_up;
    if (v !== true && v !== false && v !== null) return NextResponse.json({ error: 'thumbs_up must be true, false or null' }, { status: 400 });
    updates.thumbs_up = v;
  }
  if ('promoted_to_kb' in body) updates.promoted_to_kb = body.promoted_to_kb === true;

  try {
    const supabase = createAdminClient() as any;
    if ('admin_correction' in body) {
      const text = typeof body.admin_correction === 'string' ? body.admin_correction.trim().slice(0, 8000) : '';
      const adminId = getRequestAdminId(request);
      updates.admin_correction = text || null;
      updates.corrected_by = text ? adminId : null;
      updates.corrected_by_name = text ? await staffName(supabase, adminId) : null;
      updates.corrected_at = text ? new Date().toISOString() : null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('chatbot_conversations')
      .update(updates)
      .eq('id', params.id)
      .select('id, thumbs_up, admin_correction, corrected_by_name, corrected_at, promoted_to_kb')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (err) {
    console.error('[chatbot-logs] update failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
