import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken, extractBearerToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { parseVTT } from '@/lib/vtt-parser';
import { generateSectionsAndQuestions } from '@/lib/ai-generate';

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

/**
 * Encode a sharing URL for the Microsoft Graph /shares/ endpoint.
 * See: https://learn.microsoft.com/en-us/graph/api/shares-get
 */
function encodeSharingUrl(url: string): string {
  const base64 = Buffer.from(url, 'utf-8').toString('base64');
  // Convert to base64url and prepend "u!"
  const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `u!${base64url}`;
}

/**
 * Fetch transcript from SharePoint via Microsoft Graph API.
 * Tries multiple approaches:
 * 1. Resolve sharing link → DriveItem → media/transcripts
 * 2. Fallback: look for .vtt sibling file in the same folder
 */
async function fetchTranscript(
  sharepointUrl: string,
  msToken: string
): Promise<string> {
  const headers = { Authorization: `Bearer ${msToken}` };

  // Step 1: Resolve sharing URL to DriveItem
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

  // Step 2: Try fetching transcript via media/transcripts endpoint (beta)
  try {
    const transcriptsUrl = siteId
      ? `https://graph.microsoft.com/beta/sites/${siteId}/drives/${driveId}/items/${itemId}/media/transcripts`
      : `https://graph.microsoft.com/beta/drives/${driveId}/items/${itemId}/media/transcripts`;

    const transcriptsRes = await fetch(transcriptsUrl, { headers });

    if (transcriptsRes.ok) {
      const transcriptsData = await transcriptsRes.json();
      const transcripts = transcriptsData.value;

      if (transcripts && transcripts.length > 0) {
        // Get the first transcript's content
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

  // Step 3: Fallback — look for .vtt file in the same folder
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
 * POST /api/modules/[id]/items/[itemId]/auto-generate
 * Fetch SharePoint video transcript and generate sections + questions via AI.
 * Returns preview data (not saved to DB).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    await verifyTeacher(request);
    const { itemId } = await params;
    const msToken = extractBearerToken(request.headers.get('Authorization'));

    if (!msToken) {
      return NextResponse.json({ error: 'Missing authorization token' }, { status: 401 });
    }

    // Parse body for client-provided URL (works even if item not yet saved)
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      // No body — will fall back to DB lookup
    }

    // Get the module item from DB
    const supabase = getSupabaseAdminClient() as any;
    const { data: item, error: itemError } = await supabase
      .from('nexus_module_items')
      .select('id, title, sharepoint_video_url, video_source')
      .eq('id', itemId)
      .single();

    if (itemError || !item) {
      return NextResponse.json({ error: 'Module item not found' }, { status: 404 });
    }

    // Use client-provided URL first (handles unsaved form state), then DB
    const sharepointUrl = body.sharepoint_video_url || item.sharepoint_video_url;
    const itemTitle = body.title || item.title;

    let transcript: { start: number; end: number; text: string }[] = [];

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

    // Step 1: If no VTT upload, try SharePoint
    if (transcript.length === 0) {
      if (!sharepointUrl) {
        return NextResponse.json(
          { error: 'no_transcript', message: 'No transcript found. Upload a .vtt file or ensure the video has captions in SharePoint.' },
          { status: 200 }
        );
      }

      let vttText: string;
      try {
        vttText = await fetchTranscript(sharepointUrl, msToken);
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
    const generated = await generateSectionsAndQuestions(transcript, itemTitle);

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
