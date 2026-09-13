/**
 * One brief type's band wording: read it, and write it.
 *
 * GET returns every criterion with its five band descriptions, what is left
 * before activation, and SUGGESTIONS: the sentences teachers typed while
 * scoring, filed under the criterion and band they were written for. A
 * sentence written while giving a 2 describes a 2, in the teacher's own words,
 * which is the only source this wording may come from. Nothing here is
 * generated.
 *
 * PUT { criterion_key, band_descriptions } writes one criterion, admins only.
 * If that leaves an active brief with a missing band, the brief switches off:
 * a model must never run on half-written wording.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireDrawingStaff, isNotMigrated } from '@/lib/drawing-staff-auth';
import { loadAnchorBands, loadBriefByKey, loadBriefCriteria } from '@/lib/drawing-brief-server';
import { briefReadiness, parseBandDescriptions } from '@/lib/drawing-brief-readiness';
import { harvestBandSentences, type CorrectionRow } from '@/lib/drawing-grading-profile';

const unavailable = (message: string) =>
  NextResponse.json({ error: 'Drawing evaluation is not migrated here', detail: message }, { status: 503 });

export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const auth = await requireDrawingStaff(request);
    if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { key } = await params;
    const supabase = auth.supabase;

    const brief = await loadBriefByKey(supabase, decodeURIComponent(key));
    if (!brief) return NextResponse.json({ error: 'Brief type not found' }, { status: 404 });

    const [criteria, anchors] = await Promise.all([loadBriefCriteria(supabase, [brief.id]), loadAnchorBands(supabase, [brief.id])]);

    let suggestions: Record<string, Record<number, string[]>> = {};
    try {
      const { data } = await supabase
        .from('drawing_evaluation_criterion')
        .select('criterion_key, reference_band, final_band, reference_kind, correction_reason_code, correction_reason_text, corrected_at')
        .in('criterion_key', criteria.map((c) => c.key))
        .not('correction_reason_text', 'is', null)
        .order('corrected_at', { ascending: false })
        .limit(2000);
      suggestions = harvestBandSentences(((data ?? []) as Array<any>).map((r): CorrectionRow => ({
        criterion_key: r.criterion_key,
        reference_band: r.reference_band,
        final_band: r.final_band,
        reference_kind: r.reference_kind,
        reason_code: r.correction_reason_code,
        reason_text: r.correction_reason_text,
        corrected_at: r.corrected_at,
      })));
    } catch {
      suggestions = {};
    }

    return NextResponse.json({
      brief_type: brief,
      criteria: criteria.map(({ brief_type_id: _b, ...c }) => ({ ...c, band_descriptions: c.band_descriptions ?? {} })),
      readiness: briefReadiness(criteria, anchors.get(brief.id) ?? []),
      suggestions,
      can_edit: auth.isAdmin,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not load the brief type';
    if (isNotMigrated(message)) return unavailable(message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const auth = await requireDrawingStaff(request);
    if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (!auth.isAdmin) {
      return NextResponse.json({ error: 'Only an admin can change band wording' }, { status: 403 });
    }
    const { key } = await params;
    const supabase = auth.supabase;

    const body = (await request.json().catch(() => ({}))) as { criterion_key?: unknown; band_descriptions?: unknown };
    const bands = parseBandDescriptions(body.band_descriptions);
    if (typeof body.criterion_key !== 'string' || !bands) {
      return NextResponse.json({ error: 'Send a criterion and its band wording, bands 1 to 5' }, { status: 400 });
    }

    const brief = await loadBriefByKey(supabase, decodeURIComponent(key));
    if (!brief) return NextResponse.json({ error: 'Brief type not found' }, { status: 404 });

    const { data: updated, error } = await supabase
      .from('drawing_criterion')
      .update({ band_descriptions: bands, updated_at: new Date().toISOString() })
      .eq('brief_type_id', brief.id)
      .eq('key', body.criterion_key)
      .select('key')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) return NextResponse.json({ error: 'That criterion is not part of this brief' }, { status: 404 });

    const [criteria, anchors] = await Promise.all([loadBriefCriteria(supabase, [brief.id]), loadAnchorBands(supabase, [brief.id])]);
    const readiness = briefReadiness(criteria, anchors.get(brief.id) ?? []);

    let deactivated = false;
    if (brief.is_active && !readiness.ready) {
      const { error: offError } = await supabase.from('drawing_brief_type').update({ is_active: false }).eq('id', brief.id);
      if (offError) throw new Error(offError.message);
      deactivated = true;
    }

    return NextResponse.json({ ok: true, band_descriptions: bands, readiness, deactivated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not save the band wording';
    if (isNotMigrated(message)) return unavailable(message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
