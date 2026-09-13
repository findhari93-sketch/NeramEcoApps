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

    return NextResponse.json(await loadAssignmentTriage(auth.supabase, id));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not sort the drawings';
    if (isNotMigrated(message)) {
      return NextResponse.json({ error: 'Triage is not migrated here', detail: message }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
