import { NextRequest, NextResponse } from 'next/server';
import { verifyTeacher } from '@/lib/verify-teacher';
import { extractBearerToken } from '@/lib/ms-verify';
import { getRecapById, getSupabaseAdminClient } from '@neram/database';
import { generateSectionsAndQuestions } from '@/lib/ai-generate';
import { resolveTranscript } from '@/lib/transcript-resolver';

/**
 * POST /api/class-recaps/[recapId]/generate
 * Build checkpoint sections + quizzes from the class transcript via Gemini.
 * Returns a preview (NOT saved); the teacher reviews then PUTs to /sections.
 *
 * The transcript ladder lives in lib/transcript-resolver, shared with the class
 * summarizer.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ recapId: string }> },
) {
  try {
    await verifyTeacher(request.headers.get('Authorization'));
    const { recapId } = await params;
    const msToken = extractBearerToken(request.headers.get('Authorization'));

    const recap = await getRecapById(recapId);
    if (!recap) return NextResponse.json({ error: 'Recap not found' }, { status: 404 });

    const body = await request.json().catch(() => ({}));

    // The shared ladder. This route used to carry its own three-step copy that
    // lacked the live-Graph lookup the summarize route had, so a class whose
    // transcript was ready but unsynced could be generated from there and not
    // from here. One ladder, one answer.
    const { entries: transcript, sharepointError } = await resolveTranscript({
      cls: {
        id: recap.scheduled_class_id || recap.id,
        transcript_url: recap.transcript_url,
        recording_url: recap.recording_url,
        teams_meeting_id: null,
      },
      msToken,
      vttContent: body.vtt_content,
      // Only cache back when there is a real class row to cache onto: an ad-hoc
      // recap has no scheduled class, and writing its id would target the wrong row.
      supabase: recap.scheduled_class_id ? getSupabaseAdminClient() : undefined,
    });

    if (transcript.length === 0 && sharepointError === 'NO_ACCESS') {
      return NextResponse.json(
        { error: 'You do not have view access to this recording in SharePoint.' },
        { status: 403 },
      );
    }
    if (transcript.length === 0 && sharepointError === 'VIDEO_NOT_FOUND') {
      return NextResponse.json(
        { error: 'Recording not found in SharePoint. The link may have moved.' },
        { status: 404 },
      );
    }
    if (transcript.length === 0 && sharepointError === 'NO_TRANSCRIPT') {
      return NextResponse.json(
        {
          error: 'no_transcript',
          message:
            'Could not fetch the transcript automatically. Download the .vtt from Teams/SharePoint and upload it here.',
        },
        { status: 200 },
      );
    }

    if (transcript.length === 0) {
      return NextResponse.json(
        {
          error: 'no_transcript',
          message:
            'No transcript available yet. Once the class recording and transcript are ready, or upload a .vtt file to generate the quiz.',
        },
        { status: 200 },
      );
    }

    const generated = await generateSectionsAndQuestions(transcript, recap.title);
    return NextResponse.json({ generated: { sections: generated.sections, transcript } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate recap quiz';
    console.error('Class recap generate error:', message);
    if (message === 'Not authorized') return NextResponse.json({ error: message }, { status: 403 });
    if (message.includes('GEMINI_API_KEY')) {
      return NextResponse.json({ error: 'AI service not configured' }, { status: 503 });
    }
    if (
      message.includes('429') ||
      message.includes('Too Many Requests') ||
      message.includes('quota') ||
      message.includes('RESOURCE_EXHAUSTED')
    ) {
      return NextResponse.json(
        { error: 'AI rate limit reached. Please wait 30 seconds and try again.' },
        { status: 429 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
