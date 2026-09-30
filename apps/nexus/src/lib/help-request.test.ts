import { describe, expect, it, vi } from 'vitest';
import {
  HELP_REQUEST_LIMIT,
  handleHelpRequest,
  parseHelpRequest,
  phoneVariants,
  requesterKey,
  type HelpRequestDeps,
} from './help-request';

const VALID = {
  name: 'Santhosh V',
  phone: '98765 43210',
  problem: 'cant_open',
  details: 'It says cannot connect to the site',
  device: 'Android 14 phone, Chrome 129, installed app',
  appVersion: 'abc123',
  online: true,
  pageUrl: '/student/dashboard',
};

interface Fake {
  recentCount: number;
  phoneMatch: { id: string; name: string; email: string } | null;
  inserted: Record<string, unknown>[];
  insertError: { code: string } | null;
}

function fakeSupabase(fake: Fake) {
  return {
    from(table: string) {
      if (table === 'support_tickets') {
        return {
          select: () => ({ eq: () => ({ gte: async () => ({ count: fake.recentCount }) }) }),
          insert: (row: Record<string, unknown>) => {
            fake.inserted.push(row);
            return {
              select: () => ({
                single: async () =>
                  fake.insertError
                    ? { data: null, error: fake.insertError }
                    : { data: { id: 't1', ticket_number: 'NERAM-TKT-00123' }, error: null },
              }),
            };
          },
        };
      }
      if (table === 'users') {
        return {
          select: () => ({
            in: () => ({ limit: async () => ({ data: fake.phoneMatch ? [fake.phoneMatch] : [] }) }),
            ilike: () => ({ limit: async () => ({ data: [] }) }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

function setup(overrides: Partial<Fake> = {}, depOverrides: Partial<HelpRequestDeps> = {}) {
  const fake: Fake = { recentCount: 0, phoneMatch: null, inserted: [], insertError: null, ...overrides };
  const deps: HelpRequestDeps = {
    supabase: fakeSupabase(fake),
    signedInUser: vi.fn().mockResolvedValue(null),
    postCard: vi.fn().mockResolvedValue('posted'),
    notifyAdmins: vi.fn().mockResolvedValue(undefined),
    ticketUrl: (id) => `https://admin.example/support-tickets?highlight=${id}`,
    publicUrl: (path) => `https://db.example/public/${path}`,
    now: () => new Date('2026-09-30T13:26:00Z'),
    ...depOverrides,
  };
  return { fake, deps };
}

describe('parseHelpRequest', () => {
  it('accepts a normal request and tidies the phone', () => {
    const parsed = parseHelpRequest(VALID);
    expect(parsed.kind).toBe('ok');
    if (parsed.kind === 'ok') expect(parsed.value.phone).toBe('+919876543210');
  });

  it('treats a filled honeypot as a bot', () => {
    expect(parseHelpRequest({ ...VALID, website: 'http://spam' }).kind).toBe('bot');
  });

  it.each([
    ['name', { name: 'a' }],
    ['phone', { phone: '123' }],
    ['email', { email: 'not-an-email' }],
    ['problem', { problem: 'hack' }],
    ['screenshot', { screenshotPath: 'https://evil.example/x.png' }],
    ['screenshot', { screenshotPath: 'other-folder/abcdefgh/x.png' }],
  ])('names the %s field when it is wrong', (field, patch) => {
    const parsed = parseHelpRequest({ ...VALID, ...patch });
    expect(parsed).toMatchObject({ kind: 'invalid', field });
  });

  it('accepts a screenshot uploaded to our own folder', () => {
    const parsed = parseHelpRequest({ ...VALID, screenshotPath: 'nexus-help/abcdefgh12345678/1727700000000_ab12cd34.jpg' });
    expect(parsed.kind).toBe('ok');
  });

  it('drops a page that is not a path inside Nexus', () => {
    const parsed = parseHelpRequest({ ...VALID, pageUrl: 'https://evil.example' });
    expect(parsed.kind === 'ok' && parsed.value.pageUrl).toBeNull();
  });

  it('strips tokens out of captured console logs', () => {
    const parsed = parseHelpRequest({
      ...VALID,
      consoleLogs: [{ message: 'failed with Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc' }],
    });
    expect(parsed.kind === 'ok' && JSON.stringify(parsed.value.consoleLogs)).not.toContain('eyJhbGci');
  });
});

describe('phoneVariants', () => {
  it('covers the three ways users.phone stores an Indian number', () => {
    expect(phoneVariants('+919876543210')).toEqual(['9876543210', '919876543210', '+919876543210']);
  });
});

describe('requesterKey', () => {
  it('is stable for one IP, differs across IPs and secrets, and never contains the IP', () => {
    const a = requesterKey('203.0.113.7', 's1');
    expect(a).toBe(requesterKey('203.0.113.7', 's1'));
    expect(a).not.toBe(requesterKey('203.0.113.8', 's1'));
    expect(a).not.toBe(requesterKey('203.0.113.7', 's2'));
    expect(a).not.toContain('203');
    expect(requesterKey(null, 's1')).toBeNull();
  });
});

describe('handleHelpRequest', () => {
  it('saves the ticket, posts to Teams and tells the student the ticket number', async () => {
    const { fake, deps } = setup({ phoneMatch: { id: 'u1', name: 'Santhosh Vadivel', email: 's@neramclasses.com' } });
    const result = await handleHelpRequest(
      { ...VALID, screenshotPath: 'nexus-help/abcdefgh12345678/1_ab.jpg' },
      'key-1',
      deps,
    );

    expect(result).toEqual({ status: 200, body: { ok: true, ticketNumber: 'NERAM-TKT-00123', teams: 'posted' } });
    expect(fake.inserted[0]).toMatchObject({
      user_id: null,
      user_name: 'Santhosh V',
      user_phone: '+919876543210',
      category: 'technical',
      subject: "Nexus: Can't open the app",
      source_app: 'nexus',
      requester_ip_hash: 'key-1',
      screenshot_urls: ['https://db.example/public/nexus-help/abcdefgh12345678/1_ab.jpg'],
    });
    const card = (deps.postCard as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(card.matchedAccount).toBe('Matches Santhosh Vadivel (s@neramclasses.com)');
    expect(card.ticketUrl).toBe('https://admin.example/support-tickets?highlight=t1');
    expect(deps.notifyAdmins).toHaveBeenCalled();
  });

  it('files a sign-in problem under account', async () => {
    const { fake, deps } = setup();
    await handleHelpRequest({ ...VALID, problem: 'cant_sign_in' }, 'k', deps);
    expect(fake.inserted[0].category).toBe('account');
  });

  it('ties the ticket to the signed-in account when there is one', async () => {
    const { fake, deps } = setup({}, {
      signedInUser: vi.fn().mockResolvedValue({ id: 'u9', name: 'Priya', email: 'priya@neramclasses.com' }),
    });
    await handleHelpRequest(VALID, 'k', deps);
    expect(fake.inserted[0]).toMatchObject({ user_id: 'u9', user_email: 'priya@neramclasses.com' });
  });

  it('ignores a bad token instead of refusing the request', async () => {
    const { fake, deps } = setup({}, { signedInUser: vi.fn().mockRejectedValue(new Error('expired')) });
    const result = await handleHelpRequest(VALID, 'k', deps);
    expect(result.status).toBe(200);
    expect(fake.inserted[0].user_id).toBeNull();
  });

  it(`refuses the ${HELP_REQUEST_LIMIT + 1}th request in an hour from one network`, async () => {
    const { fake, deps } = setup({ recentCount: HELP_REQUEST_LIMIT });
    const result = await handleHelpRequest(VALID, 'k', deps);
    expect(result.status).toBe(429);
    expect(fake.inserted).toHaveLength(0);
  });

  it('still saves and answers 200 when Teams fails or is not set up', async () => {
    for (const postCard of [vi.fn().mockResolvedValue('failed'), vi.fn().mockRejectedValue(new Error('down')), vi.fn().mockResolvedValue('not-configured')]) {
      const { fake, deps } = setup({}, { postCard, notifyAdmins: vi.fn().mockRejectedValue(new Error('db')) });
      const result = await handleHelpRequest(VALID, 'k', deps);
      expect(result.status).toBe(200);
      expect(fake.inserted).toHaveLength(1);
    }
  });

  it('answers a bot like a person but saves nothing', async () => {
    const { fake, deps } = setup();
    const result = await handleHelpRequest({ ...VALID, website: 'x' }, 'k', deps);
    expect(result.status).toBe(200);
    expect(fake.inserted).toHaveLength(0);
    expect(deps.postCard).not.toHaveBeenCalled();
  });

  it('returns 400 with the field for a bad request, and 500 when the save fails', async () => {
    const bad = await handleHelpRequest({ ...VALID, phone: '' }, 'k', setup().deps);
    expect(bad).toMatchObject({ status: 400, body: { field: 'phone' } });

    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failed = await handleHelpRequest(VALID, 'k', setup({ insertError: { code: '42703' } }).deps);
    quiet.mockRestore();
    expect(failed.status).toBe(500);
  });
});
