/**
 * The teacher's marks on one drawing, as vectors.
 *
 * GET returns them so the canvas can reopen with the previous corrections still
 * on it and still editable. Before this existed, reopening "Draw on image"
 * started from a blank overlay and the next save overwrote everything drawn
 * before, silently.
 *
 * PUT replaces a SCOPE of the set, not the whole set. Replace rather than merge
 * because whichever surface is open owns its own marks: a stroke the teacher
 * rubbed out has to disappear, and diffing against shapes the eraser has split
 * in half is not a diff anyone should have to compute.
 *
 * The scope matters because two surfaces write here. The canvas owns strokes and
 * labels; the region layer on the review stage owns boxes. Without a scope, a
 * save from one would silently wipe the other's work.
 *
 * Marks live on `drawing_annotation`, the table the AI's own marks use, hanging
 * off a `drawing_evaluation` row with `source = 'manual'`. That is the whole
 * point: teacher corrections and model corrections in one shape, so a later
 * comparison between them is a query rather than a research project.
 */

import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api-errors';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { evalTables } from '@/lib/drawing-eval/db';
import type { DrawingMark, MarkerType } from '@/lib/drawing-marks';

/** Stamped on the shell so a later reader can tell how these rows were made. */
const MANUAL_PROMPT_VERSION = 'manual-canvas-v1';

const KINDS = new Set(['stroke', 'region', 'point']);

/** Which surface owns which kinds. See the note above PUT. */
const SCOPES: Record<string, string[]> = {
  canvas: ['stroke', 'point'],
  regions: ['region'],
  all: ['stroke', 'point', 'region'],
};
const MARKERS = new Set<MarkerType>(['problem', 'good', 'guide', 'note']);

/** Only staff mark up a drawing. */
async function requireStaff(request: NextRequest) {
  const msUser = await verifyMsToken(request.headers.get('Authorization'));
  const supabase = getSupabaseAdminClient();
  const { data: user } = await supabase
    .from('users')
    .select('id, user_type')
    .eq('ms_oid', msUser.oid)
    .maybeSingle();
  if (!user || !['teacher', 'admin'].includes(user.user_type as string)) return null;
  return { supabase, user };
}

/**
 * Accept marks off the wire, or refuse them.
 *
 * These are drawn onto a canvas and fed to a model later, so every number is
 * checked here rather than trusted because it came from our own screen.
 * Anything malformed fails the whole request: half a set of corrections is worse
 * than none, because the teacher would not be able to tell which half.
 */
function parseMarks(input: unknown): DrawingMark[] | null {
  if (!Array.isArray(input)) return null;
  if (input.length > 2000) return null;

  const frac = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= -0.5 && n <= 1.5;
  const out: DrawingMark[] = [];

  for (const raw of input) {
    if (!raw || typeof raw !== 'object') return null;
    const m = raw as Record<string, unknown>;
    if (typeof m.kind !== 'string' || !KINDS.has(m.kind)) return null;
    if (typeof m.marker !== 'string' || !MARKERS.has(m.marker as MarkerType)) return null;
    if (m.comment != null && typeof m.comment !== 'string') return null;

    const style = (m.style ?? {}) as Record<string, unknown>;
    if (typeof style !== 'object') return null;
    for (const key of ['w', 'fs'] as const) {
      if (style[key] != null && !(typeof style[key] === 'number' && Number.isFinite(style[key]))) return null;
    }
    if (style.pressures != null) {
      if (!Array.isArray(style.pressures)) return null;
      // Pressure multiplies a stroke width in two renderers, so it is bounded.
      if (!style.pressures.every((p) => typeof p === 'number' && p >= 0 && p <= 1)) return null;
    }
    if (style.leader != null) {
      if (!Array.isArray(style.leader) || style.leader.length !== 2) return null;
      if (!style.leader.every(frac)) return null;
    }

    if (m.kind === 'stroke') {
      if (!Array.isArray(m.geometry) || m.geometry.length === 0 || m.geometry.length > 5000) return null;
      if (!m.geometry.every((p) => Array.isArray(p) && p.length === 2 && p.every(frac))) return null;
    } else if (m.kind === 'region') {
      if (!Array.isArray(m.geometry) || m.geometry.length !== 4 || !m.geometry.every(frac)) return null;
    } else {
      if (!Array.isArray(m.geometry) || m.geometry.length !== 2 || !m.geometry.every(frac)) return null;
    }

    out.push({
      kind: m.kind as DrawingMark['kind'],
      geometry: m.geometry as DrawingMark['geometry'],
      marker: m.marker as MarkerType,
      comment: (m.comment as string | null) ?? null,
      style: style as DrawingMark['style'],
    });
  }

  return out;
}

/** The manual review row for a submission, made on first use. */
async function manualEvaluationId(db: ReturnType<typeof evalTables>, submissionId: string, userId: string) {
  const { data: existing } = await db
    .from('drawing_evaluation')
    .select('id')
    .eq('submission_id', submissionId)
    .eq('source', 'manual')
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data: created, error } = await db
    .from('drawing_evaluation')
    .insert({
      submission_id: submissionId,
      source: 'manual',
      status: 'reviewed',
      provider: 'manual',
      prompt_version: MANUAL_PROMPT_VERSION,
      created_by: userId,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return created.id as string;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireStaff(request);
    if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { id } = await params;
    const db = evalTables(auth.supabase);

    const { data: evaluation } = await db
      .from('drawing_evaluation')
      .select('id')
      .eq('submission_id', id)
      .eq('source', 'manual')
      .maybeSingle();
    if (!evaluation?.id) return NextResponse.json({ marks: [] });

    const { data: rows, error } = await db
      .from('drawing_annotation')
      .select('kind, geometry, marker, comment, style')
      .eq('evaluation_id', evaluation.id)
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);

    return NextResponse.json({ marks: rows ?? [] });
  } catch (err) {
    // An environment without the migration answers 503 rather than an empty
    // list, so "not set up here" can never read as "set up and nothing drawn".
    const message = err instanceof Error ? err.message : 'Could not load marks';
    if (/does not exist|schema cache/i.test(message)) {
      return NextResponse.json({ error: 'Drawing marks are not migrated here', detail: message }, { status: 503 });
    }
    return errorResponse(err, message);
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireStaff(request);
    if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { id } = await params;

    const body = await request.json().catch(() => null);
    const marks = parseMarks((body as Record<string, unknown>)?.marks);
    if (!marks) return NextResponse.json({ error: 'Malformed marks' }, { status: 400 });

    const scope = ((body as Record<string, unknown>)?.scope ?? 'all') as string;
    const scopeKinds = SCOPES[scope];
    if (!scopeKinds) return NextResponse.json({ error: 'Unknown scope' }, { status: 400 });
    const stray = marks.find((mark) => !scopeKinds.includes(mark.kind));
    if (stray) {
      return NextResponse.json(
        { error: `A ${stray.kind} does not belong to the ${scope} scope` },
        { status: 400 },
      );
    }

    const { data: submission } = await auth.supabase
      .from('drawing_submissions')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    if (!submission) return NextResponse.json({ error: 'Submission not found' }, { status: 404 });

    const db = evalTables(auth.supabase);
    const evaluationId = await manualEvaluationId(db, id, auth.user.id as string);

    // Replace only this surface's own kinds, so the canvas and the region layer
    // cannot overwrite each other.
    const { error: clearError } = await db
      .from('drawing_annotation')
      .delete()
      .eq('evaluation_id', evaluationId)
      .in('kind', scopeKinds);
    if (clearError) throw new Error(clearError.message);

    if (marks.length > 0) {
      const { error: insertError } = await db.from('drawing_annotation').insert(
        marks.map((mark) => ({
          evaluation_id: evaluationId,
          source: 'human',
          action: 'created',
          kind: mark.kind,
          geometry: mark.geometry,
          marker: mark.marker,
          comment: mark.comment,
          style: mark.style,
        })),
      );
      if (insertError) throw new Error(insertError.message);
    }

    return NextResponse.json({ ok: true, evaluation_id: evaluationId, count: marks.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not save marks';
    if (/does not exist|schema cache/i.test(message)) {
      return NextResponse.json({ error: 'Drawing marks are not migrated here', detail: message }, { status: 503 });
    }
    return errorResponse(err, message);
  }
}
