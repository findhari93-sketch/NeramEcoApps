/**
 * Browser-side calls to /api/assistant. Never imported on the server.
 * The Envelope type is shared with the brain so the panel renders exactly what
 * the server produced.
 */
import type { ActionProposal, Attachment, Envelope, PageContext, Suggestion, ToolLink } from '@/lib/assistant/types';
import { compressImage } from '@/utils/imageCompression';

export type { ActionProposal, Attachment, Envelope, PageContext, Suggestion, ToolLink };
export { ASSISTANT_FLAG, ATTENDANCE_FLAG, SKETCHBOOK_FLAG } from '@/lib/assistant/flag';

export type GetToken = () => Promise<string | null>;

/** The brief card's SWR key, also revalidated after a confirmed action changes the day. */
export const BRIEF_KEY = '/api/assistant/brief';

/** A fetch that never reached the server (TypeError, no status). Status 0 on AssistantHttpError. */
export const OFFLINE = 'You seem to be offline. Check your connection and try again.';

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
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers || {}) },
    });
  } catch {
    // No response at all: the browser's "Failed to fetch" means nothing to a student.
    throw new AssistantHttpError(OFFLINE, 0);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new AssistantHttpError(typeof body?.error === 'string' ? body.error : 'The assistant could not answer', res.status);
  return body as T;
}

/** A v4 uuid for one outgoing message; Try again reuses it so the server answers a resend from the store. */
export function newMessageId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const b = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Worth a Try again: the request never got an answer, or the server faulted. A 4xx would answer the same way twice. */
export function isRetryable(err: unknown): boolean {
  if (err instanceof AssistantHttpError) return err.status === 0 || err.status >= 500;
  return err instanceof TypeError;
}

export function postTurn(
  getToken: GetToken,
  body: { threadId: string | null; text: string; attachment?: Attachment | null; pageContext?: PageContext | null; clientMessageId: string },
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

export interface HistoryMessage { id: string; role: 'user' | 'assistant'; text: string; envelope: Envelope | null }

/** The kept thread's latest messages, oldest first, so a reload shows where the chat was. */
export async function loadThread(getToken: GetToken, id: string): Promise<HistoryMessage[]> {
  const out = await authed<{ messages: HistoryMessage[] }>(getToken, `/api/assistant/threads/${encodeURIComponent(id)}`);
  return (out.messages || []).filter((m) => m.role === 'user' || m.role === 'assistant');
}

/** Same path the sketchbook uses: downscale, upload, thumbnail, upload. */
export async function uploadImage(getToken: GetToken, file: File): Promise<Attachment> {
  const token = await getToken();
  if (!token) throw new AssistantHttpError('Your session has ended. Sign in again.', 401);
  const send = async (blob: File) => {
    const form = new FormData();
    form.append('file', blob);
    form.append('bucket', 'drawing-uploads');
    const res = await fetch('/api/drawing/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form }).catch(() => {
      throw new AssistantHttpError('Upload failed. Check your connection and try again.', 0);
    });
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
