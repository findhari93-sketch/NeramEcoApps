import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api-errors';
import { baseUrlOf, resolveAssistantCaller } from '@/lib/assistant/caller';
import { MAX_TEXT, runAssistantTurn } from '@/lib/assistant/turn';
import type { Attachment, PageContext } from '@/lib/assistant/types';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };

function readAttachment(raw: unknown): Attachment | null | 'bad' {
  if (raw === undefined || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.original_image_url !== 'string' || !/^https:\/\//.test(r.original_image_url)) return 'bad';
  const thumb = typeof r.thumbnail_url === 'string' && /^https:\/\//.test(r.thumbnail_url) ? r.thumbnail_url : null;
  return { original_image_url: r.original_image_url, thumbnail_url: thumb };
}

function readPage(raw: unknown): PageContext | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r.path !== 'string') return null;
  const page: PageContext = { path: r.path.slice(0, 200) };
  if (typeof r.classroomId === 'string') page.classroomId = r.classroomId;
  if (typeof r.classId === 'string') page.classId = r.classId;
  return page;
}

/**
 * POST /api/assistant/turn   (student)
 * body { threadId?, text, attachment?, pageContext? }
 */
export async function POST(request: NextRequest) {
  try {
    const { caller, supabase } = await resolveAssistantCaller(request.headers.get('Authorization'));
    const body = await request.json().catch(() => ({}));
    const text = typeof body?.text === 'string' ? body.text : '';
    const attachment = readAttachment(body?.attachment);
    if (attachment === 'bad') return NextResponse.json({ error: 'The attachment must be an https image URL.' }, { status: 400, headers: NO_STORE });
    if (!text.trim() && !attachment) return NextResponse.json({ error: 'Say something or attach a photo.' }, { status: 400, headers: NO_STORE });
    if (text.length > MAX_TEXT) return NextResponse.json({ error: `Keep it under ${MAX_TEXT} characters.` }, { status: 400, headers: NO_STORE });

    const envelope = await runAssistantTurn({
      supabase, caller, channel: 'nexus',
      threadId: typeof body?.threadId === 'string' ? body.threadId : null,
      text, attachment, pageContext: readPage(body?.pageContext), baseUrl: baseUrlOf(request),
    });
    return NextResponse.json(envelope, { headers: NO_STORE });
  } catch (err) {
    return errorResponse(err, 'The assistant could not answer');
  }
}
