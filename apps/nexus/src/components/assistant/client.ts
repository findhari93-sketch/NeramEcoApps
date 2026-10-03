/**
 * Browser-side calls to /api/assistant. Never imported on the server.
 * The Envelope type is shared with the brain so the panel renders exactly what
 * the server produced.
 */
import type { ActionProposal, Attachment, Envelope, PageContext, Suggestion, ToolLink } from '@/lib/assistant/types';
import { compressImage } from '@/utils/imageCompression';

export type { ActionProposal, Attachment, Envelope, PageContext, Suggestion, ToolLink };
export { ASSISTANT_FLAG } from '@/lib/assistant/flag';

export type GetToken = () => Promise<string | null>;

export class AssistantHttpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'AssistantHttpError';
    this.status = status;
  }
}

async function authed<T>(getToken: GetToken, url: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken();
  if (!token) throw new AssistantHttpError('Your session has ended. Sign in again.', 401);
  const res = await fetch(url, {
    ...init,
    cache: 'no-store',
    headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new AssistantHttpError(typeof body?.error === 'string' ? body.error : 'The assistant could not answer', res.status);
  return body as T;
}

export function postTurn(
  getToken: GetToken,
  body: { threadId: string | null; text: string; attachment?: Attachment | null; pageContext?: PageContext | null },
): Promise<Envelope> {
  return authed<Envelope>(getToken, '/api/assistant/turn', { method: 'POST', body: JSON.stringify(body) });
}

export interface ActionOutcome { ok: true; reply: string; links: ToolLink[]; threadId: string | null }

export function confirmActionRequest(getToken: GetToken, id: string, token: string): Promise<ActionOutcome> {
  return authed<ActionOutcome>(getToken, `/api/assistant/actions/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify({ token }) });
}

export function cancelActionRequest(getToken: GetToken, id: string): Promise<ActionOutcome> {
  return authed<ActionOutcome>(getToken, `/api/assistant/actions/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function newThread(getToken: GetToken, pageContext: PageContext | null): Promise<string> {
  const out = await authed<{ threadId: string }>(getToken, '/api/assistant/threads', { method: 'POST', body: JSON.stringify({ pageContext }) });
  return out.threadId;
}

/** Same path the sketchbook uses: downscale, upload, thumbnail, upload. */
export async function uploadImage(getToken: GetToken, file: File): Promise<Attachment> {
  const token = await getToken();
  if (!token) throw new AssistantHttpError('Your session has ended. Sign in again.', 401);
  const send = async (blob: File) => {
    const form = new FormData();
    form.append('file', blob);
    form.append('bucket', 'drawing-uploads');
    const res = await fetch('/api/drawing/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
    if (!res.ok) throw new AssistantHttpError(res.status === 413 ? 'That image is too large to upload. Try a smaller photo.' : 'Upload failed. Check your connection and try again.', res.status);
    return (await res.json()).url as string;
  };
  let main: File;
  try {
    main = await compressImage(file, 2400, 0.85, 'sketch.jpg');
  } catch {
    main = file;
  }
  const original_image_url = await send(main);
  let thumbnail_url: string | null = null;
  try {
    thumbnail_url = await send(await compressImage(main, 400, 0.8, 'thumb.jpg'));
  } catch {
    thumbnail_url = null;
  }
  return { original_image_url, thumbnail_url };
}
