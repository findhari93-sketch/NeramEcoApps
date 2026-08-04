import { NextRequest, NextResponse } from 'next/server';
import { getRecapById } from '@neram/database';
import { generateSectionsAndQuestions } from '@/lib/ai-generate';
import { resolveTrackTranscript } from '@/lib/track-transcript';
import { getRequestUser, assertStaff } from '@/lib/study-materials';

/**
 * POST /api/study-materials/files/[id]/video-tracks/[trackId]/generate
 * Body: { vtt_content? }
 *
 * Cut this recording into checkpoints and draft their questions. A PREVIEW: it
 * saves nothing. The teacher reads it, edits it, and saves through PUT
 * .../sections, which is the same two-step the class recaps use and the reason
 * an AI misfire never reaches a student.
 *
 * Each language track is generated from its OWN transcript. The Tamil and
 * English recordings of a chapter are different lengths and pause in different
 * places, so sharing checkpoint timings between them would put the Tamil quiz in
 * the middle of an English sentence.
 */
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

    const body = await request.json().catch(() => ({}));
    const transcript = await resolveTrackTranscript({
      trackId: params.trackId,
      recordingUrl: track.recording_url,
      vttContent: body?.vtt_content ? String(body.vtt_content) : null,
      msToken: (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '') || null,
    });

    if (!transcript.entries.length) {
      const code = transcript.sharepointError;
      if (code === 'NO_ACCESS') {
        return NextResponse.json(
          { error: 'You do not have view access to this recording in SharePoint.', code },
          { status: 403 },
        );
      }
      if (code === 'VIDEO_NOT_FOUND') {
        return NextResponse.json(
          { error: 'That recording link could not be opened.', code },
          { status: 404 },
        );
      }
      // 200, not an error status. "No transcript yet" is an ordinary state for a
      // recording that was uploaded rather than recorded in Teams, and the
      // editor answers it by offering a .vtt upload rather than by apologising.
      return NextResponse.json({
        error: 'no_transcript',
        message:
          'No transcript found for this recording. Upload a .vtt file and try again.',
      });
    }

    const generated = await generateSectionsAndQuestions(transcript.entries, track.title, {
      targetSegmentSeconds: track.target_segment_seconds,
      poolPerSegment: track.question_pool_per_segment,
      durationSeconds: track.video_duration_seconds || 0,
    });

    return NextResponse.json({
      generated: { sections: generated.sections, transcript: transcript.entries },
      transcript_source: transcript.source,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to draft checkpoints';
    if (/GEMINI_API_KEY/i.test(message)) {
      return NextResponse.json({ error: 'The AI service is not configured.' }, { status: 503 });
    }
    if (/429|Too Many Requests|quota|RESOURCE_EXHAUSTED/i.test(message)) {
      return NextResponse.json(
        { error: 'The AI service is rate limited right now. Try again shortly.' },
        { status: 429 },
      );
    }
    return NextResponse.json({ error: message }, { status: message === 'Not authorized' ? 403 : 500 });
  }
}
