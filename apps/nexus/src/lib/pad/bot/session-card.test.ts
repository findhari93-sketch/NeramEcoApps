// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { answerPadPanelLink, postToConversation, sessionCardActivity } from './session-card';

const CHAT = '19:meeting_NjY3ZTk0YmItZDc4@thread.v2';

describe('answerPadPanelLink', () => {
  it("is Teams' documented side panel deep link, with every part encoded", () => {
    const link = answerPadPanelLink({
      teamsAppId: 'df4f6b2d-ea18-46d1-8934-f508ac248e6c',
      entityId: 'answer-pad',
      chatId: CHAT,
      websiteUrl: 'https://nexus.neramclasses.com/pad',
      label: 'Answer Pad',
    });
    const url = new URL(link);
    expect(`${url.origin}${url.pathname}`).toBe('https://teams.microsoft.com/l/entity/df4f6b2d-ea18-46d1-8934-f508ac248e6c/answer-pad');
    expect(url.searchParams.get('webUrl')).toBe('https://nexus.neramclasses.com/pad');
    expect(url.searchParams.get('label')).toBe('Answer Pad');
    expect(JSON.parse(url.searchParams.get('context') ?? '')).toEqual({ chatId: CHAT, contextType: 'chat' });
    expect(link).not.toContain('{');
  });
});

describe('sessionCardActivity', () => {
  const card = (panelLink: string | null) =>
    sessionCardActivity({ roomCode: '999071', browserUrl: 'https://nexus.neramclasses.com/pad/r/999071', panelLink });

  it('says the pad is on, spaces the room code for reading aloud, and offers both ways in', () => {
    const activity = card('https://teams.microsoft.com/l/entity/x/answer-pad');
    const [attachment] = activity.attachments;

    expect(activity.type).toBe('message');
    expect(attachment.contentType).toBe('application/vnd.microsoft.card.adaptive');
    expect(attachment.content.version).toBe('1.4');
    expect(attachment.content.body.map((block) => block.text)).toEqual([
      'Answer Pad is on for this class',
      'Questions pop up on your screen. Closed one? Open the pad here.',
      'Room code',
      '999 071',
    ]);
    expect(attachment.content.actions).toEqual([
      { type: 'Action.OpenUrl', title: 'Open Answer Pad', url: 'https://teams.microsoft.com/l/entity/x/answer-pad', style: 'positive' },
      { type: 'Action.OpenUrl', title: 'Answer in browser', url: 'https://nexus.neramclasses.com/pad/r/999071' },
    ]);
    expect(JSON.stringify(activity)).not.toMatch(/[–—]/);
  });

  it('offers only the browser when the Teams app id is not configured', () => {
    expect(card(null).attachments[0].content.actions.map((action) => action.title)).toEqual(['Answer in browser']);
  });
});

describe('postToConversation', () => {
  const target = { serviceUrl: 'https://smba.trafficmanager.net/in/', conversationId: CHAT };
  const token = async () => 'connector-token';

  it('posts the activity into the conversation with the bot token', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"id":"1"}', { status: 201 }));
    expect(await postToConversation(target, { type: 'message' }, { token, fetchImpl })).toBe(201);

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://smba.trafficmanager.net/in/v3/conversations/${encodeURIComponent(CHAT)}/activities`);
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer connector-token', 'Content-Type': 'application/json' });
    expect(JSON.parse(String(init.body))).toEqual({ type: 'message' });
  });

  it('sends nothing to a service URL that is not https, and never throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetchImpl = vi.fn(async () => new Response(null, { status: 201 }));

    expect(await postToConversation({ ...target, serviceUrl: 'http://attacker.example/' }, {}, { token, fetchImpl })).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();

    const noToken = async (): Promise<string> => {
      throw new Error('Bot credentials are not configured');
    };
    expect(await postToConversation(target, {}, { token: noToken, fetchImpl })).toBe(0);

    const dropped = vi.fn(async (): Promise<Response> => {
      throw new TypeError('fetch failed');
    });
    expect(await postToConversation(target, {}, { token, fetchImpl: dropped })).toBe(0);
  });
});
