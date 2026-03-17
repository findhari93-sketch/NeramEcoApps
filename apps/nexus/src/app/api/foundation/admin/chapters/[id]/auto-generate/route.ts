import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken, extractBearerToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getChapterTranscript } from '@neram/database/queries/nexus';
import { parseVTT } from '@/lib/vtt-parser';
import { generateSectionsAndQuestions } from '@/lib/ai-generate';
import type { TranscriptEntry } from '@neram/database';

async function verifyTeacher(request: NextRequest) {
  const msUser = await verifyMsToken(request.headers.get('Authorization'));
  const supabase = getSupabaseAdminClient() as any;
  const { data: user } = await supabase
    .from('users')
    .select('id, user_type')
    .eq('ms_oid', msUser.oid)
    .single();
  if (!user || (user.user_type !== 'teacher' && user.user_type !== 'admin')) {
    throw new Error('Not authorized');
  }
  return user;
}

function encodeSharingUrl(url: string): string {
  const base64 = Buffer.from(url, 'utf-8').toString('base64');
  const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `u!${base64url}`;
}

async function fetchTranscriptFromSharePoint(
  sharepointUrl: string,
  msToken: string
): Promise<string> {
  const headers = { Authorization: `Bearer ${msToken}` };

  const shareId = encodeSharingUrl(sharepointUrl);
  const driveItemRes = await fetch(
    `https://graph.microsoft.com/v1.0/shares/${shareId}/driveItem`,
    { headers }
  );

  if (!driveItemRes.ok) {
    const status = driveItemRes.status;
    if (status === 403) throw new Error('NO_ACCESS');
    if (status === 404) throw new Error('VIDEO_NOT_FOUND');
    throw new Error(`Graph API error resolving share: ${status}`);
  }

  const driveItem = await driveItemRes.json();
  const { id: itemId, parentReference } = driveItem;
  const driveId = parentReference?.driveId;
  const siteId = parentReference?.siteId;

  if (!driveId || !itemId) {
    throw new Error('Could not resolve drive item from sharing URL');
  }

  try {
    const transcriptsUrl = siteId
      ? `https://graph.microsoft.com/beta/sites/${siteId}/drives/${driveId}/items/${itemId}/media/transcripts`
      : `https://graph.microsoft.com/beta/drives/${driveId}/items/${itemId}/media/transcripts`;

    const transcriptsRes = await fetch(transcriptsUrl, { headers });

    if (transcriptsRes.ok) {
      const transcriptsData = await transcriptsRes.json();
      const transcripts = transcriptsData.value;

      if (transcripts && transcripts.length > 0) {
        const transcriptId = transcripts[0].id;
        const contentUrl = siteId
          ? `https://graph.microsoft.com/beta/sites/${siteId}/drives/${driveId}/items/${itemId}/media/transcripts/${transcriptId}/content`
          : `https://graph.microsoft.com/beta/drives/${driveId}/items/${itemId}/media/transcripts/${transcriptId}/content`;

        const contentRes = await fetch(contentUrl, { headers });
        if (contentRes.ok) {
          return await contentRes.text();
        }
      }
    }
  } catch {
    // Fall through to fallback
  }

  try {
    const parentId = parentReference?.id;
    if (parentId) {
      const childrenUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${parentId}/children`;
      const childrenRes = await fetch(childrenUrl, { headers });

      if (childrenRes.ok) {
        const childrenData = await childrenRes.json();
        const vttFile = childrenData.value?.find(
          (f: any) => f.name?.toLowerCase().endsWith('.vtt')
        );

        if (vttFile) {
          const downloadUrl =
            vttFile['@microsoft.graph.downloadUrl'] ||
            `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${vttFile.id}/content`;

          const vttRes = await fetch(downloadUrl, { headers });
          if (vttRes.ok) {
            return await vttRes.text();
          }
        }
      }
    }
  } catch {
    // Fall through
  }

  throw new Error('NO_TRANSCRIPT');
}

/**
 * POST /api/foundation/admin/chapters/[id]/auto-generate
 * Generate sections + questions from transcript via AI.
 * Tries DB transcript first, then falls back to SharePoint Graph API.
 * Returns preview data (not saved to DB).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await verifyTeacher(request);
    const { id: chapterId } = await params;
    const msToken = extractBearerToken(request.headers.get('Authorization'));

    if (!msToken) {
      return NextResponse.json({ error: 'Missing authorization token' }, { status: 401 });
    }

    let body: any = {};
    try {
      body = await request.json();
    } catch {
      // No body — will fall back to DB lookup
    }

    const supabase = getSupabaseAdminClient() as any;
    const { data: chapter, error: chapterError } = await supabase
      .from('nexus_foundation_chapters')
      .select('id, title, sharepoint_video_url, video_source')
      .eq('id', chapterId)
      .single();

    if (chapterError || !chapter) {
      return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
    }

    const chapterTitle = body.title || chapter.title;
    let transcript: TranscriptEntry[] = [];

    // Step 0: If client provided VTT content directly (file upload), use it
    if (body.vtt_content && typeof body.vtt_content === 'string') {
      transcript = parseVTT(body.vtt_content);
      if (transcript.length === 0) {
        return NextResponse.json(
          { error: 'no_transcript', message: 'Uploaded VTT file was empty or could not be parsed.' },
          { status: 200 }
        );
      }
    }

    // Step 1: Try to get transcript from DB
    if (transcript.length === 0) {
      try {
        const dbTranscript = await getChapterTranscript(chapterId, 'en');
        if (dbTranscript && dbTranscript.entries && dbTranscript.entries.length > 0) {
          transcript = dbTranscript.entries;
        }
      } catch {
        // DB transcript not available, will try SharePoint
      }
    }

    // Step 2: If no DB transcript, try SharePoint Graph API
    if (transcript.length === 0) {
      const sharepointUrl = body.sharepoint_video_url || chapter.sharepoint_video_url;

      if (!sharepointUrl) {
        return NextResponse.json(
          { error: 'no_transcript', message: 'No transcript found. Upload a .vtt file or ensure the video has captions in SharePoint.' },
          { status: 200 }
        );
      }

      let vttText: string;
      try {
        vttText = await fetchTranscriptFromSharePoint(sharepointUrl, msToken);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        if (message === 'NO_ACCESS') {
          return NextResponse.json(
            { error: 'You do not have access to this video in SharePoint. Please ensure you have view permissions.' },
            { status: 403 }
          );
        }
        if (message === 'VIDEO_NOT_FOUND') {
          return NextResponse.json(
            { error: 'Video not found in SharePoint. The link may have expired or been moved.' },
            { status: 404 }
          );
        }
        if (message === 'NO_TRANSCRIPT') {
          return NextResponse.json(
            { error: 'no_transcript', message: 'Could not fetch transcript automatically. Download the .vtt file from SharePoint and upload it using the upload button.' },
            { status: 200 }
          );
        }
        throw err;
      }

      transcript = parseVTT(vttText);

      if (transcript.length === 0) {
        return NextResponse.json(
          { error: 'no_transcript', message: 'Transcript file was empty or could not be parsed.' },
          { status: 200 }
        );
      }
    }

    // Generate sections and questions via AI
    const generated = await generateSectionsAndQuestions(transcript, chapterTitle);

    return NextResponse.json({
      generated: {
        sections: generated.sections,
        transcript,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to auto-generate content';
    console.error('Auto-generate error:', message);

    if (message.includes('GEMINI_API_KEY')) {
      return NextResponse.json({ error: 'AI service not configured' }, { status: 503 });
    }

    if (message.includes('429') || message.includes('Too Many Requests') || message.includes('quota') || message.includes('RESOURCE_EXHAUSTED')) {
      return NextResponse.json(
        { error: 'AI rate limit reached. Please wait 30 seconds and try again, or upload a JSON file with sections instead.' },
        { status: 429 }
      );
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
