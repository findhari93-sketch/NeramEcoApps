import { describe, it, expect } from 'vitest';
import { encodeChatEvent, readChatStream, toolStatusText, type ChatStreamEvent } from './chat-stream';

function streamOf(pieces: string[]): Response {
  const encoder = new TextEncoder();
  let i = 0;
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        if (i < pieces.length) controller.enqueue(encoder.encode(pieces[i++]));
        else controller.close();
      },
    }),
  );
}

describe('readChatStream', () => {
  it('reads events in order, even when a line is split across reads', async () => {
    const wire =
      encodeChatEvent({ t: 'status', text: 'Searching colleges...' }) +
      encodeChatEvent({ t: 'delta', text: 'Hello ' }) +
      encodeChatEvent({ t: 'delta', text: 'world' }) +
      encodeChatEvent({ t: 'done', model: 'm', finishReason: 'STOP' });
    const pieces = [wire.slice(0, 10), wire.slice(10, 47), wire.slice(47)];
    const events: ChatStreamEvent[] = [];

    await readChatStream(streamOf(pieces), (e) => events.push(e));

    expect(events).toEqual([
      { t: 'status', text: 'Searching colleges...' },
      { t: 'delta', text: 'Hello ' },
      { t: 'delta', text: 'world' },
      { t: 'done', model: 'm', finishReason: 'STOP' },
    ]);
  });

  it('keeps multi-byte characters (₹) intact across a split', async () => {
    const wire = encodeChatEvent({ t: 'delta', text: '₹25,000' });
    const bytes = new TextEncoder().encode(wire);
    const res = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes.slice(0, 14)); // cuts the ₹ in half
          controller.enqueue(bytes.slice(14));
          controller.close();
        },
      }),
    );
    const events: ChatStreamEvent[] = [];
    await readChatStream(res, (e) => events.push(e));
    expect(events).toEqual([{ t: 'delta', text: '₹25,000' }]);
  });

  it('writes SSE and still reads bare JSON lines and keep-alive comments', async () => {
    expect(encodeChatEvent({ t: 'reset' })).toBe('data: {"t":"reset"}\n\n');
    const events: ChatStreamEvent[] = [];
    await readChatStream(streamOf([': keep-alive\n\n', '{"t":"delta","text":"a"}\n', 'data: {"t":"done"}\n\n']), (e) =>
      events.push(e),
    );
    expect(events).toEqual([{ t: 'delta', text: 'a' }, { t: 'done' }]);
  });

  it('skips a garbled line and reads a last line with no newline', async () => {
    const events: ChatStreamEvent[] = [];
    await readChatStream(streamOf(['{oops\n', '{"t":"done"}']), (e) => events.push(e));
    expect(events).toEqual([{ t: 'done' }]);
  });
});

describe('toolStatusText', () => {
  it('names the first known tool, with a fallback', () => {
    expect(toolStatusText(['compare_colleges'])).toBe('Comparing colleges...');
    expect(toolStatusText(['mystery'])).toBe('Looking that up...');
  });
});
