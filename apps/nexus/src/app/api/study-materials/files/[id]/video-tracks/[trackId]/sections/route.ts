import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, getRecapById, saveRecapSections } from '@neram/database';
import { resolveSectionGate } from '@/lib/recap-gate';
import { readRecapDefaults } from '@/lib/recap-defaults';
import { getRequestUser, assertStaff } from '@/lib/study-materials';
import type { GeneratedRecapSection } from '@neram/database';

/**
 * PUT /api/study-materials/files/[id]/video-tracks/[trackId]/sections
 * Body: { sections: GeneratedRecapSection[] }
 *
 * Save the checkpoints for one language track.
 *
 * Delegates to saveRecapSections, which DIFFS and archives rather than deleting
 * and re-inserting. That matters more than it looks:
 * nexus_class_recap_attempts.section_id is ON DELETE CASCADE, so a blanket
 * replace on a published track would destroy every student's passed checkpoints
 * and silently re-lock them mid-chapter.
 */

/**
 * Fill in how many questions each checkpoint serves and how many must be right.
 *
 * Stamped server-side, never taken from the client, and using the same resolver
 * the student quiz route reads, so what is written and what is graded cannot
 * drift. Leaving either column blank is not neutral: a NULL there once meant
 * "serve the whole bank of fifteen and get every one right", which made those
 * checkpoints quietly unpassable.
 */
async function withGate(
  trackId: string,
  sections: GeneratedRecapSection[],
): Promise<GeneratedRecapSection[]> {
  const supabase = getSupabaseAdminClient() as any;
  const defaults = await readRecapDefaults(supabase);

  const { data: track } = await supabase
    .from('nexus_class_recaps')
    .select('question_pool_per_segment, questions_per_segment, pass_percentage')
    .eq('id', trackId)
    .maybeSingle();

  const wanted = Math.min(
    track?.question_pool_per_segment ?? defaults.question_pool_per_segment,
    track?.questions_per_segment ?? defaults.questions_per_segment,
  );
  const passPercentage = track?.pass_percentage ?? defaults.pass_percentage;

  return sections.map((s) => {
    const { serve, minToPass } = resolveSectionGate(s, (s.questions || []).length, {
      questionsPerSegment: wanted,
      passPercentage,
    });
    return { ...s, questions_to_serve: serve, min_questions_to_pass: minToPass };
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string; trackId: string } },
) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);

    const track = await getRecapById(params.trackId);
    if (!track || track.study_file_id !== params.id) {
      return NextResponse.json({ error: 'Track not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const sections = Array.isArray(body?.sections) ? (body.sections as GeneratedRecapSection[]) : null;
    if (!sections) {
      return NextResponse.json({ error: 'Missing sections array' }, { status: 400 });
    }

    for (const s of sections) {
      if (
        !Number.isFinite(s.start_timestamp_seconds) ||
        !Number.isFinite(s.end_timestamp_seconds) ||
        s.end_timestamp_seconds <= s.start_timestamp_seconds
      ) {
        return NextResponse.json(
          { error: 'Every checkpoint needs an end later than its start.' },
          { status: 400 },
        );
      }
    }

    await saveRecapSections(params.trackId, await withGate(params.trackId, sections));

    // Generated and saved, so it is no longer waiting on a human.
    const supabase = getSupabaseAdminClient() as any;
    await supabase
      .from('nexus_class_recaps')
      .update({ readiness: 'ready', generated_at: new Date().toISOString() })
      .eq('id', params.trackId);

    const updated = await getRecapById(params.trackId);
    return NextResponse.json({ track: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save checkpoints';
    return NextResponse.json({ error: message }, { status: message === 'Not authorized' ? 403 : 500 });
  }
}
