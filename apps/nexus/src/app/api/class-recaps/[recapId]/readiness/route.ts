import { NextRequest, NextResponse } from 'next/server';
import { verifyTeacher } from '@/lib/verify-teacher';
import { getSupabaseAdminClient, setRecapReadiness } from '@neram/database';

/**
 * PATCH /api/class-recaps/[recapId]/readiness
 * Body: { action: 'publish' | 'hold', reason?: string }
 *
 * The tutor's override on the quality bar. Publishing from here is a deliberate
 * human decision that a held recap is fine, which is the whole reason a hold is
 * a queue rather than a bin.
 *
 * Holding a live recap is the emergency stop: it hides the recap from students
 * immediately while a bad question is fixed. Existing passes survive, because
 * this only moves status and readiness and never touches sections.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ recapId: string }> },
) {
  try {
    await verifyTeacher(request.headers.get('Authorization'));
    const { recapId } = await params;
    const body = await request.json().catch(() => ({}));
    const action = body.action;

    if (action !== 'publish' && action !== 'hold') {
      return NextResponse.json({ error: 'action must be publish or hold' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient() as any;

    if (action === 'publish') {
      await setRecapReadiness(
        recapId,
        { readiness: 'ready', publish: true, hold_reason: null, hold_detail: null },
        supabase,
      );
      return NextResponse.json({ ok: true, readiness: 'ready', status: 'published' });
    }

    // Back to draft. loadClassFacts and listPublishedRecapsForStudent both
    // ignore drafts, so this is all it takes to pull it from students.
    const { error } = await supabase
      .from('nexus_class_recaps')
      .update({
        readiness: 'held',
        status: 'draft',
        hold_reason: 'manual',
        hold_detail: typeof body.reason === 'string' ? body.reason.slice(0, 500) : null,
      })
      .eq('id', recapId);
    if (error) throw error;

    return NextResponse.json({ ok: true, readiness: 'held', status: 'draft' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update the recap';
    const status = message === 'Not authorized' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
