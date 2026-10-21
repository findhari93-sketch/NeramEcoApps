/**
 * The wire format every Neram chat streams in: Server-Sent Events, one
 * `data: <json>` line per event. Shared by Aintra (apps/marketing) and Ask
 * aiArchitek (apps/app); each app defines its own event union and passes it as
 * the type parameter, so the codec stays generic.
 *
 * SSE rather than plain NDJSON because Cloudflare and other proxies pass
 * text/event-stream through as it arrives, where they may hold back and
 * compress other types and turn a streamed answer back into one that lands all
 * at once. The reader also accepts bare JSON lines, which E2E fixtures use.
 *
 * Pure, with no React or MUI: import it from `@neram/ui/chat-stream` in API
 * routes as well as in the browser.
 */

export const SSE_CONTENT_TYPE = 'text/event-stream; charset=utf-8';

export function encodeSseEvent(event: unknown): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * Reads the stream and calls onEvent for each event, in order. Resolves when
 * the stream ends. A line that is not valid JSON is skipped rather than
 * failing the whole answer.
 */
export async function readSseStream<T>(res: Response, onEvent: (event: T) => void): Promise<void> {
  const handleLine = (line: string) => {
    const trimmed = line.trim().replace(/^data:\s?/, '');
    // Blank separators and SSE comments (": keep-alive") carry no event.
    if (!trimmed || trimmed.startsWith(':')) return;
    try {
      onEvent(JSON.parse(trimmed) as T);
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
