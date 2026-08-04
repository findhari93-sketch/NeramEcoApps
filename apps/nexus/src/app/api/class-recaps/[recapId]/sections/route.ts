import { NextRequest, NextResponse } from 'next/server';
import { verifyTeacher } from '@/lib/verify-teacher';
import { saveRecapSections, getRecapById, getSupabaseAdminClient } from '@neram/database';
import type { GeneratedRecapSection } from '@neram/database';
import { readRecapDefaults } from '@/lib/recap-defaults';
import { resolveSectionGate } from '@/lib/recap-gate';

/**
 * PUT /api/class-recaps/[recapId]/sections
 * Save all checkpoints + questions (from the reviewed AI preview or an edit).
 * Body: { sections: GeneratedRecapSection[] }
 *
 * saveRecapSections, not replaceRecapSections. Once a recap is published or any
 * student has attempted a checkpoint, a blanket replace would cascade their
 * passed attempts away and silently re-lock them. Send each existing checkpoint
 * back with its `id` so it is updated in place; anything without an id is
 * treated as new, and anything omitted is archived rather than deleted.
 *
 * The gate is filled in here rather than trusted from the client. NULL is not
 * "unset" for these two columns: a NULL questions_to_serve serves the whole bank
 * of fifteen, and a NULL min_questions_to_pass then demands all fifteen correct.
 * The editor does not carry questions_to_serve through its form state and a
 * hand-added checkpoint has neither, so every checkpoint saved by hand was
 * unpassable. Doing it at the write covers every caller at once.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ recapId: string }> },
) {
  try {
    await verifyTeacher(request.headers.get('Authorization'));
    const { recapId } = await params;
    const body = await request.json().catch(() => ({}));
    const sections = body.sections as GeneratedRecapSection[] | undefined;

    if (!Array.isArray(sections)) {
      return NextResponse.json({ error: 'Missing sections array' }, { status: 400 });
    }
    // Basic validation so we never persist a checkpoint with no way to pass.
    for (const s of sections) {
      if (
        !s.title ||
        s.start_timestamp_seconds == null ||
        s.end_timestamp_seconds == null ||
        s.end_timestamp_seconds <= s.start_timestamp_seconds
      ) {
        return NextResponse.json({ error: 'A checkpoint has invalid timestamps' }, { status: 400 });
      }
    }

    await saveRecapSections(recapId, await withGate(recapId, sections));
    const recap = await getRecapById(recapId);
    return NextResponse.json({ recap });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save checkpoints';
    const status = message === 'Not authorized' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * Fill in how many questions each checkpoint serves and how many must be right.
 *
 * A value the teacher set explicitly is left exactly as it is; only a missing or
 * nonsensical one is derived, from the recap's own settings and then the
 * classroom defaults. Serving is capped at the number of questions the
 * checkpoint actually holds, because a checkpoint that promises ten questions
 * from a bank of four cannot draw them and a pass mark computed against ten it
 * cannot serve is a wall.
 */
async function withGate(
  recapId: string,
  sections: GeneratedRecapSection[],
): Promise<GeneratedRecapSection[]> {
  const supabase = getSupabaseAdminClient() as any;
  const defaults = await readRecapDefaults(supabase);

  const { data: recap } = await supabase
    .from('nexus_class_recaps')
    .select('question_pool_per_segment, questions_per_segment, pass_percentage')
    .eq('id', recapId)
    .maybeSingle();

  const wanted = Math.min(
    recap?.question_pool_per_segment ?? defaults.question_pool_per_segment,
    recap?.questions_per_segment ?? defaults.questions_per_segment,
  );
  const passPercentage = recap?.pass_percentage ?? defaults.pass_percentage;

  // Same resolver the student quiz route uses, so what is written and what is
  // graded can never drift apart.
  return sections.map((s) => {
    const { serve, minToPass } = resolveSectionGate(s, (s.questions || []).length, {
      questionsPerSegment: wanted,
      passPercentage,
    });
    return { ...s, questions_to_serve: serve, min_questions_to_pass: minToPass };
  });
}
