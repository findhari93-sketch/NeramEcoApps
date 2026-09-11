import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, getRecapById, saveRecapSections } from '@neram/database';
import { readRecapDefaults } from '@/lib/recap-defaults';
import { findUnpassableCheckpoint } from '@/lib/checkpoint-validation';
import { stampTrackGate } from '@/lib/track-recording';
import { describeRecordingUrl } from '@/lib/chapter-recordings';
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
 *
 * On a draft nobody has attempted, a save deletes and re-inserts, so every
 * checkpoint comes back with a NEW id. The response carries the saved track with
 * its sections, and the editor must adopt those ids before the next save.
 */

/**
 * GET the checkpoints so a teacher can actually read them.
 *
 * Returns each section's ID. That is not incidental: updateRecapSections
 * decides update-in-place versus re-create on the presence of that id, and
 * re-creating archives the live sections, which strands every student's passed
 * checkpoint on an invisible row and silently re-locks them mid-chapter. An
 * editor that loads without ids destroys work on its first save.
 *
 * Also returns the gate the server will stamp (how many questions a checkpoint
 * serves and the pass percentage), so the editor can say "7 of 10 to pass"
 * instead of the "Blank = all" it used to claim, which was never true.
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
      return NextResponse.json({ error: 'This recording could not be found. It may have been removed, or the link is out of date.' }, { status: 404 });
    }

    const defaults = await readRecapDefaults(getSupabaseAdminClient() as any);
    const questionsPerSegment = Math.min(
      track.question_pool_per_segment ?? defaults.question_pool_per_segment,
      track.questions_per_segment ?? defaults.questions_per_segment,
    );
    // Not on the NexusClassRecap type, which predates the column; the row has it.
    const recordingFileName = (track as { recording_file_name?: string | null }).recording_file_name ?? null;

    return NextResponse.json({
      track: {
        id: track.id,
        title: track.title,
        language: track.language,
        language_label: track.language_label,
        status: track.status,
        readiness: track.readiness,
        recording_url: track.recording_url,
        recording_name: track.recording_url
          ? describeRecordingUrl(track.recording_url, recordingFileName)
          : null,
        video_source: track.video_source,
        video_duration_seconds: track.video_duration_seconds,
        gate: {
          questions_per_segment: questionsPerSegment,
          pass_percentage: track.pass_percentage ?? defaults.pass_percentage,
        },
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
      return NextResponse.json({ error: 'This recording could not be found. It may have been removed, or the link is out of date.' }, { status: 404 });
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

    /**
     * Whitespace-only questions are dropped here, where it is deliberate, rather
     * than saved as a blank question a student would be shown. The query layer
     * only drops a question whose text is exactly empty.
     */
    const cleaned = sections.map((s) => ({
      ...s,
      questions: (s.questions || []).filter(
        (q) => q && typeof q.question_text === 'string' && q.question_text.trim(),
      ),
    }));

    /**
     * A checkpoint with no questions saves fine and can never be passed, which
     * locks every checkpoint after it for every student. Refused, and named.
     */
    const unpassable = findUnpassableCheckpoint(cleaned);
    if (unpassable !== -1) {
      return NextResponse.json(
        {
          error: `Checkpoint ${unpassable + 1} has no questions, so no student could pass it. Add a question or delete the checkpoint.`,
          code: 'CHECKPOINT_NO_QUESTIONS',
          index: unpassable,
        },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdminClient() as any;
    await saveRecapSections(params.trackId, await stampTrackGate(supabase, params.trackId, cleaned));

    // Generated and saved, so it is no longer waiting on a human.
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
