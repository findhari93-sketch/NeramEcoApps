/**
 * Triage for an assignment's drawings still waiting to be read.
 *
 * GET only. Returns every waiting sheet sorted flagged, needs a look, routine,
 * each with the sentence saying why, plus the ids held for a hand-back so the
 * roster can tell "waiting for me" from "waiting on a release".
 *
 * Per-teacher and changes whenever anyone submits or grades, so not cached.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireDrawingStaff, isNotMigrated } from '@/lib/drawing-staff-auth';
import { loadAssignmentTriage } from '@/lib/drawing-triage-server';
import { loadScorePairs } from '@/lib/drawing-ai-draft-server';
import { shadowAgreement, unreadDraftsGate } from '@/lib/drawing-ai-draft';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireDrawingStaff(request);
    if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { id } = await params;

    const { data: assignment } = await auth.supabase
      .from('nexus_class_assignments')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    if (!assignment) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });

    const triage = await loadAssignmentTriage(auth.supabase, id);
    // The unread-approval gate only matters where there are drafts to approve,
    // so the agreement read is skipped for every assignment without one.
    const routineDrafts = triage.items.filter((t) => t.band === 'routine' && t.has_ai_draft).length;
    const unreadGate = routineDrafts > 0
      ? unreadDraftsGate(shadowAgreement(await loadScorePairs(auth.supabase).catch(() => [])))
      : null;
    return NextResponse.json({ ...triage, routine_drafts: routineDrafts, unread_gate: unreadGate });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not sort the drawings';
    if (isNotMigrated(message)) {
      return NextResponse.json({ error: 'Triage is not migrated here', detail: message }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
