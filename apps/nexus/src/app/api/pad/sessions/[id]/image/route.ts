import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';
import { rewriteStorageUrl } from '@neram/database';
import { assertPadStaff, resolvePadCaller } from '@/lib/pad/caller';
import { PadRefusal, padErrorResponse, padJson } from '@/lib/pad/rpc';
import { isUuid } from '@/lib/pad/session-binding';
import { loadSessionMeta, padDb } from '@/lib/pad/sessions';

export const dynamic = 'force-dynamic';
/** A phone screenshot can take a while to arrive on a slow connection. */
export const maxDuration = 30;

const BUCKET = 'uploads';
const MAX_BYTES = 10 * 1024 * 1024;
/** Plenty for one class; a runaway paste loop stops here. */
const MAX_PICTURES_PER_SESSION = 60;
const EXTENSIONS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

/**
 * POST /api/pad/sessions/:id/image  (session teacher, live session)
 *
 * Body: multipart form data with `file`: a PNG, JPEG or WebP up to 10 MB. The
 * console shrinks a pasted screenshot before sending it.
 *
 * Stores the picture of a question (usually a snip of the paper, Win+Shift+S
 * then Ctrl+V) under uploads/pad/<session id>/<random id>.<ext> and answers
 * { url }. The picture reaches students only once ASK or /prompts/:id/picture
 * attaches it, and the database accepts only this session's folder, so an
 * address from anywhere else can never be shown on a pad.
 *
 * 400 INVALID_INPUT (no file, wrong type, too large)   409 SESSION_NOT_LIVE
 * 429 RATE_LIMITED (60 pictures in this session already)
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const caller = await resolvePadCaller(request.headers.get('Authorization'));
    assertPadStaff(caller);
    if (!isUuid(params.id)) throw new PadRefusal('NOT_FOUND');
    const sessionId = params.id.toLowerCase();

    const meta = await loadSessionMeta(sessionId);
    if (!meta) throw new PadRefusal('NOT_FOUND');
    if (meta.teacher_id !== caller.user.id) throw new PadRefusal('NOT_SESSION_TEACHER');
    if (meta.status !== 'live') throw new PadRefusal('SESSION_NOT_LIVE');

    const form = await request.formData().catch(() => null);
    const file = form?.get('file');
    if (!file || typeof file === 'string') throw new PadRefusal('INVALID_INPUT', { field: 'file' });
    const ext = EXTENSIONS[file.type];
    if (!ext) throw new PadRefusal('INVALID_INPUT', { field: 'file', reason: 'type' });
    if (file.size <= 0 || file.size > MAX_BYTES) throw new PadRefusal('INVALID_INPUT', { field: 'file', reason: 'size' });

    const storage = padDb().storage.from(BUCKET);
    const folder = `pad/${sessionId}`;
    const { data: existing, error: listError } = await storage.list(folder, { limit: MAX_PICTURES_PER_SESSION + 1 });
    if (listError) throw listError;
    if ((existing?.length ?? 0) >= MAX_PICTURES_PER_SESSION) throw new PadRefusal('RATE_LIMITED');

    const path = `${folder}/${randomUUID()}.${ext}`;
    const { error: uploadError } = await storage.upload(path, new Uint8Array(await file.arrayBuffer()), {
      contentType: file.type,
      upsert: false,
      cacheControl: '31536000',
    });
    if (uploadError) throw uploadError;

    const publicUrl: string = storage.getPublicUrl(path).data.publicUrl;
    return padJson({ url: rewriteStorageUrl(publicUrl) || publicUrl });
  } catch (err) {
    return padErrorResponse(err, 'picture upload');
  }
}
