import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

import { verifyMsToken } from '@/lib/ms-verify';
import { describeMissingBands, isReadyToActivate } from '@/lib/drawing-eval/seed-criteria';
import { evalTables } from '@/lib/drawing-eval/db';

/**
 * Manage the graded reference sheets a brief type is scored against.
 *
 * These five sheets are the instrument. The model is never asked for an
 * absolute score, only for where a new sheet falls between these, so marking
 * the wrong sheet as band 4 moves every later evaluation of that brief type.
 * That is why this is a deliberate teacher action with its own screen rather
 * than something inferred from tutor_rating: the ratings in history were given
 * over many months against no fixed reference, and a few of them will not
 * survive being looked at side by side.
 *
 * GET    ?brief_type=<key>   the brief type, its criteria, and its anchors
 * POST   { brief_type_key, band, submission_id }   set the anchor for a band
 * DELETE ?id=<anchor id>     retire an anchor
 */

/**
 * The tables are missing, or the query failed for a reason the caller cannot
 * fix. 503 rather than an empty 200: "not set up here" and "nothing in it yet"
 * must not look the same, to a screen or to a test.
 */
function unavailable(detail: string) {
  return NextResponse.json(
    { error: `Drawing evaluation is not available in this environment: ${detail}` },
    { status: 503 },
  );
}

async function requireTeacher(request: NextRequest) {
  const msUser = await verifyMsToken(request.headers.get('Authorization'));
  const supabase = getSupabaseAdminClient();
  const { data: user } = await supabase
    .from('users')
    .select('id, user_type')
    .eq('ms_oid', msUser.oid)
    .single();

  if (!user || !['teacher', 'admin'].includes(user.user_type ?? '')) return { supabase, user: null };
  return { supabase, user };
}

export async function GET(request: NextRequest) {
  try {
    const { supabase, user } = await requireTeacher(request);
    if (!user) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    const db = evalTables(supabase);

    const key = request.nextUrl.searchParams.get('brief_type');

    if (!key) {
      const { data, error } = await db
        .from('drawing_brief_type')
        .select('id, key, category, sub_type, title, description, is_active')
        .order('title', { ascending: true });

      // Checked rather than swallowed. Without this a missing table answers
      // 200 with an empty list, and the screen says "no brief types set up
      // yet", which is indistinguishable from the genuine empty state. That is
      // how an unapplied migration reads as a working feature with no data.
      if (error) return unavailable(error.message);
      return NextResponse.json({ brief_types: data || [] });
    }

    const { data: briefType, error: briefError } = await db
      .from('drawing_brief_type')
      .select('id, key, category, sub_type, title, description, is_active')
      .eq('key', key)
      .maybeSingle();

    if (briefError) return unavailable(briefError.message);
    if (!briefType) return NextResponse.json({ error: 'Brief type not found' }, { status: 404 });

    const [{ data: criteria }, { data: anchors }] = await Promise.all([
      db
        .from('drawing_criterion')
        .select('key, title, observable_checks, band_descriptions, sort_order')
        .eq('brief_type_id', briefType.id)
        .order('sort_order', { ascending: true }),
      db
        .from('drawing_anchor_sheet')
        .select('id, band, submission_id, image_url, comment, created_at')
        .eq('brief_type_id', briefType.id)
        .eq('is_active', true)
        .order('band', { ascending: true }),
    ]);

    const shaped = (criteria || []).map((c: any) => ({
      key: c.key,
      bandDescriptions: (c.band_descriptions || {}) as Record<string, string>,
    }));

    return NextResponse.json({
      brief_type: briefType,
      criteria: criteria || [],
      anchors: anchors || [],
      // Everything still standing between this brief type and its first
      // evaluation, so the screen can show one list rather than a bare toggle.
      missing_bands: describeMissingBands(shaped as any),
      criteria_ready: isReadyToActivate(shaped as any),
      anchors_ready: (anchors || []).length === 5,
    });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await requireTeacher(request);
    if (!user) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    const db = evalTables(supabase);

    const body = await request.json().catch(() => ({}));
    const briefTypeKey = typeof body?.brief_type_key === 'string' ? body.brief_type_key : '';
    const submissionId = typeof body?.submission_id === 'string' ? body.submission_id : '';
    const band = Number(body?.band);
    const comment = typeof body?.comment === 'string' ? body.comment.trim() : null;

    if (!briefTypeKey || !submissionId || !Number.isInteger(band) || band < 1 || band > 5) {
      return NextResponse.json(
        { error: 'brief_type_key, submission_id and a band from 1 to 5 are required' },
        { status: 400 },
      );
    }

    const { data: briefType, error: briefError } = await db
      .from('drawing_brief_type')
      .select('id, title')
      .eq('key', briefTypeKey)
      .maybeSingle();

    if (briefError) return unavailable(briefError.message);
    if (!briefType) return NextResponse.json({ error: 'Brief type not found' }, { status: 404 });

    const { data: submission } = await supabase
      .from('drawing_submissions')
      .select('id, original_image_url, status')
      .eq('id', submissionId)
      .maybeSingle();

    if (!submission) return NextResponse.json({ error: 'Submission not found' }, { status: 404 });

    // An ungraded sheet carries no judgement, so it cannot anchor anything.
    if (!['completed', 'reviewed'].includes(submission.status ?? '')) {
      return NextResponse.json(
        { error: 'Only a graded submission can be used as an anchor.' },
        { status: 409 },
      );
    }

    // image_url is copied rather than referenced so the anchor keeps showing
    // the sheet that was actually graded, even if the submission is later
    // rotated, replaced or deleted.
    const { data: existing } = await db
      .from('drawing_anchor_sheet')
      .select('id')
      .eq('brief_type_id', briefType.id)
      .eq('band', band)
      .eq('is_active', true)
      .maybeSingle();

    if (existing) {
      // Retire rather than delete: the partial unique index only covers active
      // rows, and keeping the old one preserves why the scale moved.
      await db
        .from('drawing_anchor_sheet')
        .update({ is_active: false })
        .eq('id', existing.id);
    }

    const { data: anchor, error } = await db
      .from('drawing_anchor_sheet')
      .insert({
        brief_type_id: briefType.id,
        band,
        submission_id: submissionId,
        image_url: submission.original_image_url,
        comment,
        created_by: user.id,
        is_active: true,
      })
      .select('id, band, image_url, comment, submission_id, created_at')
      .single();

    if (error) {
      return NextResponse.json({ error: `Could not save the anchor: ${error.message}` }, { status: 500 });
    }

    const { count } = await db
      .from('drawing_anchor_sheet')
      .select('id', { count: 'exact', head: true })
      .eq('brief_type_id', briefType.id)
      .eq('is_active', true);

    return NextResponse.json({
      anchor,
      replaced: Boolean(existing),
      anchors_ready: (count ?? 0) === 5,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    if (message.includes('token') || message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Could not save the anchor' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { supabase, user } = await requireTeacher(request);
    if (!user) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    const db = evalTables(supabase);

    const id = request.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    // Retired, not deleted. A brief type that loses an anchor stops being
    // evaluable, and the history of which sheet used to hold the band is worth
    // more than the row it occupies.
    const { error } = await db
      .from('drawing_anchor_sheet')
      .update({ is_active: false })
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
