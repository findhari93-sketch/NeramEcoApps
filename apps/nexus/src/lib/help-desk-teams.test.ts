import { describe, expect, it, vi } from 'vitest';

// session-card pulls in the connector token helpers; the card and the post are
// all that is under test here.
vi.mock('@/lib/pad/bot/session-card', () => ({ postToConversation: vi.fn() }));

import { helpDeskCardActivity, postHelpDeskCard, readHelpDeskChat, type HelpDeskCardInput } from './help-desk-teams';

const INPUT: HelpDeskCardInput = {
  ticketNumber: 'NERAM-TKT-00123',
  problemLabel: "Can't open the app",
  name: 'Santhosh V',
  phone: '+919876543210',
  email: null,
  details: 'It says cannot connect to the site',
  matchedAccount: 'Matches Nexus student: Santhosh Vadivel',
  device: 'Android 14 phone, Chrome 129, installed app',
  appVersion: 'abc123',
  pageUrl: '/student/dashboard',
  online: true,
  screenshotUrl: 'https://db.example/storage/v1/object/public/support-ticket-attachments/nexus-help/1.jpg',
  ticketUrl: 'https://admin.neramclasses.com/support-tickets?highlight=t1',
};

function settingsClient(value: unknown) {
  return {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: value === undefined ? null : { value } }) }) }),
    }),
  };
}

function card(input: HelpDeskCardInput) {
  return helpDeskCardActivity(input).attachments[0].content as { body: any[]; actions: any[] };
}

describe('helpDeskCardActivity', () => {
  it('leads with the ticket and the problem, and shows the screenshot', () => {
    const { body } = card(INPUT);
    expect(body[0].text).toBe('Help request NERAM-TKT-00123');
    expect(body[1].text).toBe("Can't open the app");
    const image = body.find((b) => b.type === 'Image');
    expect(image?.url).toBe(INPUT.screenshotUrl);
  });

  it('gives staff one tap to WhatsApp, call, or open the ticket', () => {
    const { actions } = card(INPUT);
    expect(actions.map((a) => a.title)).toEqual(['WhatsApp', 'Call', 'Open ticket']);
    expect(actions[0].url).toBe('https://wa.me/919876543210');
    expect(actions[1].url).toBe('tel:+919876543210');
    expect(actions[2].url).toBe(INPUT.ticketUrl);
  });

  it('says so when nobody matched, and flags an offline phone', () => {
    const { body } = card({ ...INPUT, matchedAccount: null, online: false, screenshotUrl: null });
    const facts = body.find((b) => b.type === 'FactSet').facts;
    expect(facts).toContainEqual({ title: 'Account', value: 'No matching Nexus account' });
    expect(facts.some((f: { title: string }) => f.title === 'Network')).toBe(true);
    expect(body.some((b) => b.type === 'Image')).toBe(false);
  });
});

describe('readHelpDeskChat', () => {
  it('reads the chat once it is set up', async () => {
    const target = await readHelpDeskChat(settingsClient({ conversation_id: '19:abc@thread.v2', service_url: 'https://smba.trafficmanager.net/in/' }));
    expect(target).toEqual({ conversationId: '19:abc@thread.v2', serviceUrl: 'https://smba.trafficmanager.net/in/' });
  });

  it('is null before setup or when the row is malformed', async () => {
    expect(await readHelpDeskChat(settingsClient(undefined))).toBeNull();
    expect(await readHelpDeskChat(settingsClient(null))).toBeNull();
    expect(await readHelpDeskChat(settingsClient({ conversation_id: '' , service_url: 'x' }))).toBeNull();
  });
});

describe('postHelpDeskCard', () => {
  const configured = settingsClient({ conversation_id: '19:abc@thread.v2', service_url: 'https://smba.trafficmanager.net/in/' });

  it('skips cleanly when the chat is not set up', async () => {
    const post = vi.fn();
    expect(await postHelpDeskCard(settingsClient(undefined), INPUT, { post })).toBe('not-configured');
    expect(post).not.toHaveBeenCalled();
  });

  it('reports posted on a 2xx', async () => {
    const post = vi.fn().mockResolvedValue(201);
    expect(await postHelpDeskCard(configured, INPUT, { post })).toBe('posted');
    expect(post.mock.calls[0][0]).toEqual({ conversationId: '19:abc@thread.v2', serviceUrl: 'https://smba.trafficmanager.net/in/' });
  });

  it('reports failed, without throwing, when Teams refuses or the post throws', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await postHelpDeskCard(configured, INPUT, { post: vi.fn().mockResolvedValue(403) })).toBe('failed');
    expect(await postHelpDeskCard(configured, INPUT, { post: vi.fn().mockRejectedValue(new Error('boom')) })).toBe('failed');
    quiet.mockRestore();
  });
});
