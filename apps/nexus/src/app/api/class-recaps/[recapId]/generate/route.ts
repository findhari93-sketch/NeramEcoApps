import { NextRequest, NextResponse } from 'next/server';
import { verifyTeacher } from '@/lib/verify-teacher';
import { extractBearerToken } from '@/lib/ms-verify';
import { getRecapById } from '@neram/database';
import { parseVTT } from '@/lib/vtt-parser';
import { generateSectionsAndQuestions } from '@/lib/ai-generate';
import { fetchTranscriptFromSharePoint } from '@/lib/sharepoint-transcript';

/**
 * POST /api/class-recaps/[recapId]/generate
 * Build checkpoint sections + quizzes from the class transcript via Gemini.
 * Returns a preview (NOT saved); the teacher reviews then PUTs to /sections.
 *
 * Transcript source, in priority order:
 *   1. body.vtt_content     — teacher pasted/uploaded a .vtt (works with no Graph)
 *   2. recap.transcript_url — a directly fetchable transcript content URL
 *   3. recap.recording_url  — SharePoint recording -> resolve its .vtt via Graph
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

    let transcript: { start: number; end: number; text: string }[] = [];

    // 1. Client-provided VTT (upload / paste).
    if (body.vtt_content && typeof body.vtt_content === 'string') {
      transcript = parseVTT(body.vtt_content);
    }

    // 2. A directly-fetchable transcript content URL.
    if (transcript.length === 0 && recap.transcript_url && msToken) {
      try {
        const res = await fetch(recap.transcript_url, {
          headers: { Authorization: `Bearer ${msToken}` },
        });
        if (res.ok) transcript = parseVTT(await res.text());
      } catch {
        // fall through to SharePoint resolution
      }
    }

    // 3. Resolve the transcript from the SharePoint recording.
    if (transcript.length === 0 && recap.recording_url && msToken) {
      try {
        const vtt = await fetchTranscriptFromSharePoint(recap.recording_url, msToken);
        transcript = parseVTT(vtt);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        if (message === 'NO_ACCESS') {
          return NextResponse.json(
            { error: 'You do not have view access to this recording in SharePoint.' },
            { status: 403 },
          );
        }
        if (message === 'VIDEO_NOT_FOUND') {
          return NextResponse.json(
            { error: 'Recording not found in SharePoint. The link may have moved.' },
            { status: 404 },
          );
        }
        if (message === 'NO_TRANSCRIPT') {
          return NextResponse.json(
            {
              error: 'no_transcript',
              message:
                'Could not fetch the transcript automatically. Download the .vtt from Teams/SharePoint and upload it here.',
            },
            { status: 200 },
          );
        }
        throw err;
      }
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
