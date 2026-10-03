import { NextRequest, NextResponse } from 'next/server';
import { baseUrlOf, resolveAssistantCaller } from '@/lib/assistant/caller';
import { NO_STORE, assistantErrorResponse, readPage } from '@/lib/assistant/http';
import { isUuid } from '@/lib/assistant/ids';
import { MAX_TEXT, runAssistantTurn } from '@/lib/assistant/turn';
import type { Attachment } from '@/lib/assistant/types';

export const dynamic = 'force-dynamic';

function readAttachment(raw: unknown): Attachment | null | 'bad' {
  if (raw === undefined || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.original_image_url !== 'string' || !/^https:\/\//.test(r.original_image_url)) return 'bad';
  const thumb = typeof r.thumbnail_url === 'string' && /^https:\/\//.test(r.thumbnail_url) ? r.thumbnail_url : null;
  return { original_image_url: r.original_image_url, thumbnail_url: thumb };
}

/**
 * POST /api/assistant/turn   (student)
 * body { threadId?, text, attachment?, pageContext? }
 */
export async function POST(request: NextRequest) {
  try {
    const { caller, supabase, features } = await resolveAssistantCaller(request.headers.get('Authorization'));
    const body = await request.json().catch(() => ({}));
    const text = typeof body?.text === 'string' ? body.text : '';
    const attachment = readAttachment(body?.attachment);
    if (attachment === 'bad') return NextResponse.json({ error: 'The attachment must be an https image URL.' }, { status: 400, headers: NO_STORE });
    if (!text.trim() && !attachment) return NextResponse.json({ error: 'Say something or attach a photo.' }, { status: 400, headers: NO_STORE });
    if (text.length > MAX_TEXT) return NextResponse.json({ error: `Keep it under ${MAX_TEXT} characters.` }, { status: 400, headers: NO_STORE });

    const envelope = await runAssistantTurn({
      supabase, caller, channel: 'nexus',
      // A threadId that is not a uuid is treated as absent: the turn starts a fresh thread (Ruling 26).
      threadId: isUuid(body?.threadId) ? body.threadId : null,
      text, attachment, pageContext: readPage(body?.pageContext), baseUrl: baseUrlOf(request), features,
    });
    return NextResponse.json(envelope, { headers: NO_STORE });
  } catch (err) {
    return assistantErrorResponse(err, 'turn');
  }
}
