/**
 * Which drawing brief an assignment sets.
 *
 * GET: the current tag and the brief types to choose from.
 * PUT { brief_type_id | null }: tag it, retag it, or clear it.
 *
 * A teacher's call, made whenever they know it, including after submissions
 * are in: only the fifth rubric criterion depends on it, so scores already
 * given on the shared four are kept. A fifth-criterion score from the old
 * brief stops counting towards the overall rather than being deleted.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireDrawingStaff, isNotMigrated } from '@/lib/drawing-staff-auth';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireDrawingStaff(request);
    if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { id } = await params;

    const [{ data: assignment, error: aErr }, { data: options, error: oErr }] = await Promise.all([
      auth.supabase.from('nexus_class_assignments').select('id, brief_type_id').eq('id', id).maybeSingle(),
      auth.supabase.from('drawing_brief_type').select('id, key, title, is_active').order('title', { ascending: true }),
    ]);
    if (aErr) throw new Error(aErr.message);
    if (oErr) throw new Error(oErr.message);
    if (!assignment) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    return NextResponse.json({ brief_type_id: assignment.brief_type_id ?? null, options: options ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not load the brief';
    if (isNotMigrated(message)) {
      return NextResponse.json({ error: 'Brief tagging is not migrated here', detail: message }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireDrawingStaff(request);
    if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { brief_type_id?: unknown };
    const briefTypeId = body.brief_type_id === null ? null : typeof body.brief_type_id === 'string' ? body.brief_type_id : undefined;
    if (briefTypeId === undefined) return NextResponse.json({ error: 'Send a brief type id, or null to clear it' }, { status: 400 });

    if (briefTypeId) {
      const { data: brief } = await auth.supabase.from('drawing_brief_type').select('id').eq('id', briefTypeId).maybeSingle();
      if (!brief) return NextResponse.json({ error: 'Brief type not found' }, { status: 404 });
    }

    const { data, error } = await auth.supabase
      .from('nexus_class_assignments')
      .update({ brief_type_id: briefTypeId })
      .eq('id', id)
      .eq('assignment_type', 'drawing')
      .select('id, brief_type_id')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: 'Drawing assignment not found' }, { status: 404 });
    return NextResponse.json({ ok: true, brief_type_id: data.brief_type_id ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not tag the brief';
    if (isNotMigrated(message)) {
      return NextResponse.json({ error: 'Brief tagging is not migrated here', detail: message }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
