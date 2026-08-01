import { NextRequest, NextResponse } from 'next/server';
import { verifyTeacher } from '@/lib/verify-teacher';
import { getSupabaseAdminClient } from '@neram/database';
import { readRecapDefaults, questionsToPass } from '@/lib/recap-defaults';

/**
 * PATCH /api/class-recaps/[recapId]/settings
 * Body: { target_segment_seconds?, question_pool_per_segment?, questions_per_segment?, pass_percentage? }
 *
 * The four knobs behind checkpoint generation: how long a segment should be, how
 * many questions to bank, how many to serve per attempt, and what share of those
 * must be right to pass.
 *
 * The pass mark is a PERCENTAGE, not a count. A count silently breaks whenever
 * the number of questions moves: a checkpoint that produced 8 usable questions
 * rather than 10 still demanded "8 correct", which is every one of them, and no
 * retry could ever be easier than the first attempt. `questions_to_pass` is
 * still written, derived, so anything reading the old column stays correct.
 *
 * Serving fewer than are banked is what makes a retry meaningful. If they are
 * equal, a failed attempt is re-served the same questions and can be beaten by
 * remembering positions instead of rewatching, so the served count is clamped to
 * the pool. Clamping rather than rejecting keeps a teacher out of a validation
 * argument about numbers whose relationship is not obvious.
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
    const defaults = await readRecapDefaults(supabase);

    const { data: current } = await supabase
      .from('nexus_class_recaps')
      .select(
        'target_segment_seconds, question_pool_per_segment, questions_per_segment, pass_percentage',
      )
      .eq('id', recapId)
      .single();
    if (!current) return NextResponse.json({ error: 'Recap not found' }, { status: 404 });

    // 60s to 30min. Shorter than a minute is not a topic; longer than half an
    // hour is not a checkpoint.
    const target =
      int(body.target_segment_seconds, 60, 1800) ??
      current.target_segment_seconds ??
      defaults.target_segment_seconds;
    const pool =
      int(body.question_pool_per_segment, 1, 40) ??
      current.question_pool_per_segment ??
      defaults.question_pool_per_segment;
    const serve = Math.min(
      pool,
      int(body.questions_per_segment, 1, 40) ??
        current.questions_per_segment ??
        defaults.questions_per_segment,
    );
    // Floor of 50%: below that a checkpoint stops being a gate, since four-option
    // guessing already scores 25%.
    const pct =
      int(body.pass_percentage, 50, 100) ?? current.pass_percentage ?? defaults.pass_percentage;

    const { error } = await supabase
      .from('nexus_class_recaps')
      .update({
        target_segment_seconds: target,
        question_pool_per_segment: pool,
        questions_per_segment: serve,
        pass_percentage: pct,
        questions_to_pass: questionsToPass(serve, pct),
      })
      .eq('id', recapId);
    if (error) throw error;

    // Push the pass mark and the served count down onto the checkpoints, which
    // is where the quiz engine actually reads them. Without this the knobs would
    // only affect the NEXT generation and a teacher would see no change.
    //
    // Per checkpoint rather than one blanket value, because a segment that
    // yielded fewer questions than the teacher asked for must serve what it has
    // and be graded on that, not on a number it can never reach.
    const { data: liveSections, error: readErr } = await supabase
      .from('nexus_class_recap_sections')
      .select('id, questions:nexus_class_recap_questions(id)')
      .eq('recap_id', recapId)
      .is('archived_at', null);
    if (readErr) throw readErr;

    for (const s of liveSections || []) {
      const available = Array.isArray(s.questions) ? s.questions.length : serve;
      const thisServe = Math.max(1, Math.min(serve, available));
      const { error: sErr } = await supabase
        .from('nexus_class_recap_sections')
        .update({
          questions_to_serve: thisServe,
          min_questions_to_pass: questionsToPass(thisServe, pct),
        })
        .eq('id', s.id);
      if (sErr) throw sErr;
    }

    return NextResponse.json({
      ok: true,
      settings: {
        target_segment_seconds: target,
        question_pool_per_segment: pool,
        questions_per_segment: serve,
        pass_percentage: pct,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save settings';
    const status = message === 'Not authorized' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
