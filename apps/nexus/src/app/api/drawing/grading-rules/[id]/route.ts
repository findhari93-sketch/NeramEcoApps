/**
 * Retire one of your own grading rules.
 *
 * Soft: the row stays, marked inactive with the date, because scores already
 * saved may name it as the rule they followed and that history should still
 * read correctly. Another teacher's rule answers 404, not 403, so rule ids
 * cannot be probed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireDrawingStaff, isNotMigrated } from '@/lib/drawing-staff-auth';

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireDrawingStaff(request);
    if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { id } = await params;

    const { data, error } = await auth.supabase
      .from('drawing_grading_rule')
      .update({ is_active: false, retired_at: new Date().toISOString() })
      .eq('id', id)
      .eq('teacher_id', auth.user.id)
      .eq('is_active', true)
      .select('id')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not remove that rule';
    if (isNotMigrated(message)) {
      return NextResponse.json({ error: 'Grading rules are not migrated here', detail: message }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
