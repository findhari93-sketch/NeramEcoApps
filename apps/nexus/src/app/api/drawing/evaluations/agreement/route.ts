/**
 * Shadow comparison: how close AI drafts have landed to teachers' own scores.
 *
 * Counts per criterion, from every criterion a teacher scored beside a draft,
 * and the gate that decides whether unread drafts may be approved in bulk.
 * With evaluation switched off there are no pairs, and the answer says so.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireDrawingStaff, isNotMigrated } from '@/lib/drawing-staff-auth';
import { loadScorePairs } from '@/lib/drawing-ai-draft-server';
import { SHADOW_MIN_SHEETS, SHADOW_MIN_WITHIN_ONE, shadowAgreement, unreadDraftsGate } from '@/lib/drawing-ai-draft';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireDrawingStaff(request);
    if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const agreement = shadowAgreement(await loadScorePairs(auth.supabase));
    let drafts = 0;
    try {
      const { count } = await auth.supabase
        .from('drawing_evaluation')
        .select('id', { count: 'exact', head: true })
        .eq('source', 'ai');
      drafts = count ?? 0;
    } catch {
      drafts = 0;
    }

    return NextResponse.json({
      agreement,
      drafts,
      gate: unreadDraftsGate(agreement),
      floor: { sheets: SHADOW_MIN_SHEETS, within_one: SHADOW_MIN_WITHIN_ONE },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not compare';
    if (isNotMigrated(message)) {
      return NextResponse.json({ error: 'Drawing evaluation is not migrated here', detail: message }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
