/**
 * The wire format between /api/ask and the chat: Server-Sent Events, one
 * `data: <json>` line per event. Shared by the route and the reader so a field
 * name can never drift. Same shape as Aintra's (apps/marketing/src/lib/aintra/
 * chat-stream.ts), plus cards and remembered details as their own events.
 *
 *   meta    the thread id, and the guest's free answers left after this one
 *   status  a tool is running ("Checking TNEA 2025 allotments...")
 *   delta   the next piece of the answer text
 *   reset   drop the text so far: that round ended in a tool call
 *   card    a result card built from a tool, shown with the answer
 *   facts   the remembered details changed
 *   done    the answer is complete, with follow-up suggestions
 *   error   no answer; `code` SIGNUP_REQUIRED means show the sign-in card
 */
import { SSE_CONTENT_TYPE, encodeSseEvent, readSseStream } from '@neram/ui/chat-stream';
import type { AskCard } from './cards';
import type { AskFacts } from './memory';

export type AskStreamEvent =
  | { t: 'meta'; threadId: string; guestRemaining?: number | null }
  | { t: 'status'; text: string }
  | { t: 'delta'; text: string }
  | { t: 'reset' }
  | { t: 'card'; card: AskCard }
  | { t: 'facts'; facts: AskFacts }
  | { t: 'done'; suggestions: string[] }
  | { t: 'error'; error: string; code?: string };

export const ASK_STREAM_CONTENT_TYPE = SSE_CONTENT_TYPE;
export const SIGNUP_REQUIRED = 'SIGNUP_REQUIRED';

export function encodeAskEvent(event: AskStreamEvent): string {
  return encodeSseEvent(event);
}

/** Calls onEvent for each event, in order, until the stream ends. Garbled lines are skipped. */
export function readAskStream(res: Response, onEvent: (event: AskStreamEvent) => void): Promise<void> {
  return readSseStream<AskStreamEvent>(res, onEvent);
}

/**
 * Pulls the follow-up suggestions out of an answer. The model ends with
 * `[[suggest: A | B | C]]`; the chat shows them as chips, not text. While an
 * answer is still streaming, a half-written token is hidden too.
 */
export function splitSuggestions(text: string): { body: string; suggestions: string[] } {
  // The label is sometimes dropped (the backup models write [[A | B | C]]),
  // so a bracketed list with at least one pipe counts too.
  const match = text.match(/\[\[\s*suggest\s*:([^\]]*)\]\]/i) ?? text.match(/\[\[([^\]]*\|[^\]]*)\]\]/);
  let body = text;
  let suggestions: string[] = [];
  if (match) {
    suggestions = match[1]
      .split('|')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.length <= 90)
      .slice(0, 3);
    body = text.replace(match[0], '');
  }
  // Streaming: an unfinished "[[sugg..." at the end is not shown.
  body = body.replace(/\[\[[^\]]*$/, '');
  return { body: body.trimEnd(), suggestions };
}
