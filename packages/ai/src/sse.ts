/**
 * A minimal Server-Sent Events reader for the streaming model APIs.
 *
 * Gemini's streamGenerateContent?alt=sse and the OpenAI-style chat APIs (Groq,
 * OpenRouter) all send `data: <json>` events separated by a blank line. That is
 * the whole of the format we need: comments (`: keep-alive`, which OpenRouter
 * sends while a model is queued) and `event:` / `id:` fields are skipped.
 *
 * Calls onData once per event with the joined data lines. Resolves when the
 * body ends; throws if the connection drops, so the caller can tell a finished
 * answer from a cut one.
 */
export async function readSse(res: Response, onData: (data: string) => void): Promise<void> {
  if (!res.body) {
    // No stream to read (some test doubles, some proxies): treat the whole body
    // as one block of events.
    flush(await res.text(), onData);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Events end at a blank line. Keep the unfinished tail for the next read.
    let boundary = nextBoundary(buffer);
    while (boundary) {
      emit(buffer.slice(0, boundary.index), onData);
      buffer = buffer.slice(boundary.index + boundary.length);
      boundary = nextBoundary(buffer);
    }
  }

  buffer += decoder.decode();
  flush(buffer, onData);
}

function nextBoundary(buffer: string): { index: number; length: number } | null {
  const match = /\r?\n\r?\n/.exec(buffer);
  return match ? { index: match.index, length: match[0].length } : null;
}

function flush(text: string, onData: (data: string) => void): void {
  for (const block of text.split(/\r?\n\r?\n/)) emit(block, onData);
}

function emit(block: string, onData: (data: string) => void): void {
  const data = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).replace(/^ /, ''))
    .join('\n');
  if (data) onData(data);
}
