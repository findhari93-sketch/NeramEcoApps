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

export type ChatStreamEvent =
  | { t: 'status'; text: string }
  | { t: 'delta'; text: string }
  | { t: 'reset' }
  | { t: 'done'; model?: string; finishReason?: string }
  | { t: 'error'; error: string; code?: string; humanHelp?: boolean };

export const CHAT_STREAM_CONTENT_TYPE = 'text/event-stream; charset=utf-8';

export function encodeChatEvent(event: ChatStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * Reads the stream and calls onEvent for each event, in order. Resolves when
 * the stream ends. A line that is not valid JSON is skipped rather than
 * failing the whole answer.
 */
export async function readChatStream(res: Response, onEvent: (event: ChatStreamEvent) => void): Promise<void> {
  const handleLine = (line: string) => {
    const trimmed = line.trim().replace(/^data:\s?/, '');
    // Blank separators and SSE comments (": keep-alive") carry no event.
    if (!trimmed || trimmed.startsWith(':')) return;
    try {
      onEvent(JSON.parse(trimmed) as ChatStreamEvent);
    } catch {
      // A partial or garbled line: nothing useful to show.
    }
  };

  if (!res.body) {
    (await res.text()).split('\n').forEach(handleLine);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf('\n');
    while (newline !== -1) {
      handleLine(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf('\n');
    }
  }
  handleLine(buffer + decoder.decode());
}

/** What the visitor sees while a tool runs, by tool name. */
export const TOOL_STATUS: Record<string, string> = {
  get_college: 'Checking college details',
  search_colleges: 'Searching colleges',
  compare_colleges: 'Comparing colleges',
};

export function toolStatusText(names: string[]): string {
  const first = names.map((n) => TOOL_STATUS[n]).find(Boolean);
  return `${first ?? 'Looking that up'}...`;
}
