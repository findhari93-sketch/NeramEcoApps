/**
 * The signed-in teacher's grading profile and rules.
 *
 * GET: what their corrections say (counts and direction, never percentages)
 * and their active rules. POST: add a rule by hand. Rules are retired through
 * /api/drawing/grading-rules/[id].
 *
 * Per-teacher and low traffic, so computed on read rather than snapshotted.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireDrawingStaff, isNotMigrated } from '@/lib/drawing-staff-auth';
import { summariseProfile, type CorrectionRow } from '@/lib/drawing-grading-profile';
import { cleanRuleText } from '@/lib/drawing-grading-rules';
import { SHARED_CRITERIA, BRIEF_CRITERION } from '@/lib/drawing-rubric';

const KNOWN_KEYS = new Set([...SHARED_CRITERIA, ...Object.values(BRIEF_CRITERION)].map((c) => c.key));

export async function GET(request: NextRequest) {
  try {
    const auth = await requireDrawingStaff(request);
    if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const supabase = auth.supabase;

    const [{ data: corrections, error: cErr }, { data: rules, error: rErr }] = await Promise.all([
      supabase
        .from('drawing_evaluation_criterion')
        .select('criterion_key, reference_band, final_band, reference_kind, correction_reason_code, correction_reason_text, corrected_at')
        .eq('corrected_by', auth.user.id)
        .not('corrected_at', 'is', null)
        .order('corrected_at', { ascending: false })
        .limit(2000),
      supabase
        .from('drawing_grading_rule')
        .select('id, criterion_key, reason_code, text, applied_count, created_at')
        .eq('teacher_id', auth.user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false }),
    ]);
    if (cErr) throw new Error(cErr.message);
    if (rErr) throw new Error(rErr.message);

    const rows: CorrectionRow[] = ((corrections ?? []) as Array<any>).map((r) => ({
      criterion_key: r.criterion_key,
      reference_band: r.reference_band,
      final_band: r.final_band,
      reference_kind: r.reference_kind,
      reason_code: r.correction_reason_code,
      reason_text: r.correction_reason_text,
      corrected_at: r.corrected_at,
    }));

    return NextResponse.json({ profile: summariseProfile(rows), rules: rules ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not load your grading profile';
    if (isNotMigrated(message)) {
      return NextResponse.json({ error: 'Grading profile is not migrated here', detail: message }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireDrawingStaff(request);
    if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const body = (await request.json().catch(() => ({}))) as { text?: unknown; criterion_key?: unknown };

    const text = cleanRuleText(body.text);
    if (!text) return NextResponse.json({ error: 'A rule is a sentence of 3 to 400 characters' }, { status: 400 });
    const criterionKey = typeof body.criterion_key === 'string' && body.criterion_key ? body.criterion_key : null;
    if (criterionKey && !KNOWN_KEYS.has(criterionKey)) {
      return NextResponse.json({ error: 'Unknown criterion' }, { status: 400 });
    }

    const { data, error } = await auth.supabase
      .from('drawing_grading_rule')
      .insert({ teacher_id: auth.user.id, criterion_key: criterionKey, text, origin: 'teacher', reason_code: 'other' })
      .select('id, criterion_key, reason_code, text, applied_count, created_at')
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, rule: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not keep that rule';
    if (isNotMigrated(message)) {
      return NextResponse.json({ error: 'Grading rules are not migrated here', detail: message }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
