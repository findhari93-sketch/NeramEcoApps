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

/**
 * GET the checkpoints so a teacher can actually read them.
 *
 * The editor used to save whatever the generator produced and then tell the
 * teacher to "review them, then publish", with no screen anywhere that could
 * open them. The two-step this whole feature rests on, generate then review,
 * only existed in the comments.
 *
 * Returns each section's ID. That is not incidental: updateRecapSections
 * decides update-in-place versus re-create on the presence of that id, and
 * re-creating archives the live sections, which strands every student's passed
 * checkpoint on an invisible row and silently re-locks them mid-chapter. An
 * editor that loads without ids destroys work on its first save.
 */
export async function GET(
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

    return NextResponse.json({
      track: {
        id: track.id,
        title: track.title,
        language: track.language,
        language_label: track.language_label,
        status: track.status,
        readiness: track.readiness,
        recording_url: track.recording_url,
        video_source: track.video_source,
        video_duration_seconds: track.video_duration_seconds,
      },
      sections: (track.sections || []).map((s: any) => ({
        id: s.id,
        title: s.title || '',
        description: s.description || '',
        start_timestamp_seconds: s.start_timestamp_seconds ?? 0,
        end_timestamp_seconds: s.end_timestamp_seconds ?? 0,
        min_questions_to_pass: s.min_questions_to_pass ?? null,
        questions_to_serve: s.questions_to_serve ?? null,
        questions: (s.questions || []).map((q: any) => ({
          question_text: q.question_text || '',
          option_a: q.option_a || '',
          option_b: q.option_b || '',
          option_c: q.option_c || '',
          option_d: q.option_d || '',
          correct_option: q.correct_option || 'a',
          explanation: q.explanation || '',
        })),
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load checkpoints';
    return NextResponse.json({ error: message }, { status: message === 'Not authorized' ? 403 : 500 });
  }
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
