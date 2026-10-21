/**
 * The wire format between /api/chat and the Aintra widget: Server-Sent Events,
 * one `data: <json>` line per event. Shared by the route, which writes it, and
 * the widget, which reads it, so the two cannot disagree about a field name.
 *
 * SSE rather than plain NDJSON because of what sits in between: Cloudflare (in
 * front of neramclasses.com) and other proxies pass text/event-stream through
 * as it arrives, where they may hold back and compress other types, which would
 * turn a streamed answer back into one that lands all at once. The reader also
 * accepts bare JSON lines, which the E2E fixtures use.
 *
 *   status  a tool is running ("Checking college data...")
 *   delta   the next piece of the answer
 *   reset   drop the text streamed so far: that round ended in a tool call,
 *           and the real answer follows
 *   done    the answer is complete
 *   error   no answer; show the message and the human-help options
 */

import { SSE_CONTENT_TYPE, encodeSseEvent, readSseStream } from '@neram/ui/chat-stream';

export type ChatStreamEvent =
  | { t: 'status'; text: string }
  | { t: 'delta'; text: string }
  | { t: 'reset' }
  | { t: 'done'; model?: string; finishReason?: string }
  | { t: 'error'; error: string; code?: string; humanHelp?: boolean };

// The codec is shared with Aintra (Tools app) (packages/ui/src/chat/stream.ts).
export const CHAT_STREAM_CONTENT_TYPE = SSE_CONTENT_TYPE;

export function encodeChatEvent(event: ChatStreamEvent): string {
  return encodeSseEvent(event);
}

/**
 * Reads the stream and calls onEvent for each event, in order. Resolves when
 * the stream ends. A line that is not valid JSON is skipped rather than
 * failing the whole answer.
 */
export function readChatStream(res: Response, onEvent: (event: ChatStreamEvent) => void): Promise<void> {
  return readSseStream<ChatStreamEvent>(res, onEvent);
}

/** What the visitor sees while a tool runs, by tool name. */
export const TOOL_STATUS: Record<string, string> = {
  get_college: 'Checking college details',
  search_colleges: 'Searching colleges',
  compare_colleges: 'Comparing colleges',
  prepare_demo_booking: 'Setting up your demo class',
  prepare_demo_cancel: 'Finding your demo class',
  prepare_callback: 'Setting up your callback',
  get_my_status: 'Checking your bookings',
  save_application_details: 'Saving your application',
  prepare_application_submit: 'Getting your application ready',
  prepare_centre_visit: 'Setting up your centre visit',
  prepare_college_enquiry: 'Preparing your enquiry',
  prepare_message: 'Writing your message',
  prepare_ticket: 'Writing up your ticket',
  prepare_save_college: 'Getting the college',
  get_payment_status: 'Checking your fees',
};

export function toolStatusText(names: string[]): string {
  const first = names.map((n) => TOOL_STATUS[n]).find(Boolean);
  return `${first ?? 'Looking that up'}...`;
}
