import { NextRequest, NextResponse } from 'next/server';
import { verifyTeacher } from '@/lib/verify-teacher';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * PATCH /api/class-recaps/[recapId]/settings
 * Body: { target_segment_seconds?, question_pool_per_segment?, questions_per_segment?, questions_to_pass? }
 *
 * The four knobs behind checkpoint generation: how long a segment should be, how
 * many questions to bank, how many to serve per attempt, and how many must be
 * right to pass.
 *
 * Serving fewer than are banked is what makes a retry meaningful. If they are
 * equal, a failed attempt is re-served the same questions and can be beaten by
 * remembering positions instead of rewatching, so the pool is clamped to be at
 * least the served count and the served count at least the pass mark. Clamping
 * rather than rejecting keeps a teacher out of a validation argument about
 * numbers whose relationship is not obvious.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ recapId: string }> },
) {
  try {
    await verifyTeacher(request.headers.get('Authorization'));
    const { recapId } = await params;
    const body = await request.json().catch(() => ({}));

    const int = (v: unknown, lo: number, hi: number): number | null => {
      const n = Number(v);
      if (!Number.isFinite(n)) return null;
      return Math.max(lo, Math.min(hi, Math.round(n)));
    };

    const supabase = getSupabaseAdminClient() as any;
    const { data: current } = await supabase
      .from('nexus_class_recaps')
      .select(
        'target_segment_seconds, question_pool_per_segment, questions_per_segment, questions_to_pass',
      )
      .eq('id', recapId)
      .single();
    if (!current) return NextResponse.json({ error: 'Recap not found' }, { status: 404 });

    // 60s to 30min. Shorter than a minute is not a topic; longer than half an
    // hour is not a checkpoint.
    const target =
      int(body.target_segment_seconds, 60, 1800) ?? current.target_segment_seconds ?? 300;
    let pool = int(body.question_pool_per_segment, 1, 40) ?? current.question_pool_per_segment ?? 15;
    let serve = int(body.questions_per_segment, 1, 40) ?? current.questions_per_segment ?? 10;
    let pass = int(body.questions_to_pass, 1, 40) ?? current.questions_to_pass ?? 8;

    serve = Math.min(serve, pool);
    pass = Math.min(pass, serve);
    pool = Math.max(pool, serve);

    const { error } = await supabase
      .from('nexus_class_recaps')
      .update({
        target_segment_seconds: target,
        question_pool_per_segment: pool,
        questions_per_segment: serve,
        questions_to_pass: pass,
      })
      .eq('id', recapId);
    if (error) throw error;

    // Push the pass mark and the served count down onto the checkpoints, which
    // is where the quiz engine actually reads them. Without this the knobs would
    // only affect the NEXT generation and a teacher would see no change.
    const { error: sErr } = await supabase
      .from('nexus_class_recap_sections')
      .update({ questions_to_serve: serve, min_questions_to_pass: pass })
      .eq('recap_id', recapId)
      .is('archived_at', null);
    if (sErr) throw sErr;

    return NextResponse.json({
      ok: true,
      settings: {
        target_segment_seconds: target,
        question_pool_per_segment: pool,
        questions_per_segment: serve,
        questions_to_pass: pass,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save settings';
    const status = message === 'Not authorized' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
