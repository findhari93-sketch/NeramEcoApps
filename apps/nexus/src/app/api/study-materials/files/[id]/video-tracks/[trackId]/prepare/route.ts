import { NextRequest, NextResponse } from 'next/server';
import { getRecapById, getSupabaseAdminClient, saveRecapSections } from '@neram/database';
import { generateSectionsAndQuestions } from '@/lib/ai-generate';
import { resolveTrackTranscript } from '@/lib/track-transcript';
import {
  countTrackAttempts,
  decidePrepare,
  stampTrackGate,
  withoutUnpassableCheckpoints,
} from '@/lib/track-recording';
import { getRequestUser, assertStaff } from '@/lib/study-materials';

/**
 * Gemini is called once per checkpoint, one after another, capped at ten calls,
 * so a long recording outlives the default function limit.
 */
export const maxDuration = 300;

/**
 * POST /api/study-materials/files/[id]/video-tracks/[trackId]/prepare   (staff)
 * Body: { vtt_content?, redo?, confirm_reset_progress? }
 *
 * Find the transcript and create the checkpoints, all on the server.
 *
 * The dialog this replaces generated in one request and saved in a second one
 * from the browser, so a teacher who closed the page in between lost the result
 * and paid for the AI call anyway. Here nothing depends on the page staying open.
 *
 * It runs once on its own. A second press does nothing unless the teacher asked
 * to redo the checkpoints or uploaded a new transcript, and replacing
 * checkpoints students have already attempted needs `confirm_reset_progress`.
 *
 *   { status: 'prepared', section_count, question_count, transcript_source }
 *   { status: 'already_prepared', section_count }
 *   { status: 'needs_transcript', code, message }
 *   { status: 'too_short', message }
 *   409 { code: 'HAS_ATTEMPTS', attempts, error }
 */

function noTranscriptMessage(code: string | undefined): string {
  switch (code) {
    case 'YOUTUBE_NO_FETCH':
      return 'This recording is on YouTube, so there is no transcript to find. Upload its .vtt file.';
    case 'NO_ACCESS':
      return 'Nexus could not open the folder the video is in to look for a transcript. Upload the .vtt file.';
    case 'VIDEO_NOT_FOUND':
      return 'The video could not be found in SharePoint. Replace it, then try again.';
    default:
      return 'No transcript was found for this recording, in the Teams class it came from or beside the video in SharePoint. Upload its .vtt file.';
  }
}

export async function POST(
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
    if (!track.recording_url) {
      return NextResponse.json({ error: 'Add the video first.', code: 'NO_VIDEO' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const vttContent =
      typeof body?.vtt_content === 'string' && body.vtt_content.trim() ? String(body.vtt_content) : null;

    const supabase = getSupabaseAdminClient() as any;
    const sectionCount = (track.sections || []).length;
    const attemptCount = sectionCount ? await countTrackAttempts(supabase, track.id) : 0;

    const decision = decidePrepare({
      sectionCount,
      attemptCount,
      redo: body?.redo === true,
      hasUpload: !!vttContent,
      confirmedReset: body?.confirm_reset_progress === true,
    });

    if (decision === 'already_prepared') {
      return NextResponse.json({ status: 'already_prepared', section_count: sectionCount });
    }
    if (decision === 'needs_confirmation') {
      return NextResponse.json(
        {
          code: 'HAS_ATTEMPTS',
          attempts: attemptCount,
          error: `Students have already made ${attemptCount} attempt${attemptCount === 1 ? '' : 's'} at these checkpoints. Replacing them resets that progress.`,
        },
        { status: 409 },
      );
    }

    const transcript = await resolveTrackTranscript({
      trackId: track.id,
      recordingUrl: track.recording_url,
      recordingFileName: (track as { recording_file_name?: string | null }).recording_file_name ?? null,
      vttContent,
      msToken: (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '') || null,
      videoSource: track.video_source,
    });

    if (!transcript.entries.length) {
      const code = transcript.sharepointError || 'NO_TRANSCRIPT';
      return NextResponse.json({ status: 'needs_transcript', code, message: noTranscriptMessage(code) });
    }

    const generated = await generateSectionsAndQuestions(transcript.entries, track.title, {
      feature: 'nexus.video-checkpoints',
      targetSegmentSeconds: track.target_segment_seconds,
      poolPerSegment: track.question_pool_per_segment,
      durationSeconds: track.video_duration_seconds || 0,
    });

    // A segment the generator left without a usable question could never be
    // passed and would lock every checkpoint after it.
    const usable = withoutUnpassableCheckpoints(generated.sections);
    if (!usable.length) {
      return NextResponse.json({
        status: 'too_short',
        transcript_source: transcript.source,
        message:
          'The transcript was too short to split into checkpoints. Check it is the whole class, or add checkpoints by hand.',
      });
    }

    await saveRecapSections(track.id, await stampTrackGate(supabase, track.id, usable));
    await supabase
      .from('nexus_class_recaps')
      .update({ readiness: 'ready', generated_at: new Date().toISOString() })
      .eq('id', track.id);

    return NextResponse.json({
      status: 'prepared',
      section_count: usable.length,
      question_count: usable.reduce((n, s) => n + (s.questions?.length || 0), 0),
      transcript_source: transcript.source,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create the checkpoints';
    if (/GEMINI_API_KEY/i.test(message)) {
      return NextResponse.json({ error: 'The AI service is not configured.' }, { status: 503 });
    }
    if (/429|Too Many Requests|quota|RESOURCE_EXHAUSTED/i.test(message)) {
      return NextResponse.json(
        { error: 'The AI service is busy right now. Try again in a few minutes.' },
        { status: 429 },
      );
    }
    return NextResponse.json({ error: message }, { status: message === 'Not authorized' ? 403 : 500 });
  }
}
