import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { sendTeamsChatMessage } from './teams-messaging';

function reply(ok: boolean, body: unknown = {}) {
  return {
    ok,
    status: ok ? 201 : 400,
    headers: new Headers(),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const card = {
  id: 'drawing-review-card',
  contentType: 'application/vnd.microsoft.card.adaptive',
  content: '{"type":"AdaptiveCard"}',
};

describe('sendTeamsChatMessage with a card attachment', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('posts the card as an attachment beside the html body', async () => {
    const posts: any[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: any) => {
        if (url.endsWith('/chats')) return reply(true, { id: 'chat-1' });
        posts.push(JSON.parse(init.body));
        return reply(true);
      }),
    );

    const result = await sendTeamsChatMessage(
      'token',
      'student@neramclasses.com',
      '<attachment id="drawing-review-card"></attachment>',
      { attachments: [card], fallbackHtml: '<p>fallback</p>' },
    );

    expect(result.ok).toBe(true);
    expect(posts).toHaveLength(1);
    expect(posts[0].attachments).toEqual([card]);
    expect(posts[0].body.content).toBe('<attachment id="drawing-review-card"></attachment>');
  });

  it('retries once as plain html when Graph refuses the card', async () => {
    const posts: any[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: any) => {
        if (url.endsWith('/chats')) return reply(true, { id: 'chat-1' });
        const body = JSON.parse(init.body);
        posts.push(body);
        return reply(!body.attachments);
      }),
    );

    const result = await sendTeamsChatMessage(
      'token',
      'student@neramclasses.com',
      '<attachment id="drawing-review-card"></attachment>',
      { attachments: [card], fallbackHtml: '<p>fallback</p>' },
    );

    expect(result.ok).toBe(true);
    expect(posts).toHaveLength(2);
    expect(posts[1].attachments).toBeUndefined();
    expect(posts[1].body.content).toBe('<p>fallback</p>');
  });

  it('does not retry a plain message that failed', async () => {
    const posts: any[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: any) => {
        if (url.endsWith('/chats')) return reply(true, { id: 'chat-1' });
        posts.push(JSON.parse(init.body));
        return reply(false);
      }),
    );

    const result = await sendTeamsChatMessage('token', 'student@neramclasses.com', '<p>hello</p>');

    expect(result.ok).toBe(false);
    expect(posts).toHaveLength(1);
  });
});
