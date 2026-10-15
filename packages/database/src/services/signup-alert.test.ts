// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const sendNotification = vi.fn();
vi.mock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification: (...a: unknown[]) => sendNotification(...a) } }));

import { alertNewSignup, buildSignupAlert, formatAlertPhone, type SignupAlertUser } from './signup-alert';
import { sendStaffPush } from './staff-push';

const user: SignupAlertUser = {
  id: 'u-1',
  name: 'Aswathi Raj',
  phone: '+919567350381',
  email: 'a@example.com',
  first_touch: { gclid: 'g', utm_campaign: 'TN Local NATA 2027', landing_page: '/nata-online-coaching', channel: 'google_ads' },
  signup_city: 'Kochi',
  signup_state: 'Kerala',
  signup_country: 'IN',
};

describe('buildSignupAlert', () => {
  it('shows phone, source with campaign and landing page, and the approximate place', () => {
    const a = buildSignupAlert(user);
    expect(a.title).toBe('New sign-up: Aswathi Raj');
    expect(a.body.split('\n')).toEqual([
      '+91 95673 50381',
      'From: Google Ads (TN Local NATA 2027) · /nata-online-coaching',
      'Kochi, Kerala (approx.)',
    ]);
    expect(a.url).toBe('/crm/u-1');
  });

  it('prefers the application form place and says when nothing is known', () => {
    expect(buildSignupAlert(user, { city: 'Thrissur', state: 'Kerala' }).body).toContain('\nThrissur, Kerala');
    const bare = buildSignupAlert({ ...user, name: 'User', first_touch: null, signup_city: null, signup_state: null, signup_country: null });
    expect(bare.title).toBe('New sign-up');
    expect(bare.body).toContain('From: Not recorded');
    expect(bare.body).toContain('Place not known');
  });

  it('names the website for referral visits', () => {
    const a = buildSignupAlert({ ...user, first_touch: { channel: 'referral', referrer: 'https://www.example.org', landing_page: '/' } });
    expect(a.body).toContain('From: Other websites (example.org) · /');
  });

  it('never uses an em dash', () => {
    expect(buildSignupAlert(user).body).not.toMatch(/\u2014|--/);
  });
});

describe('formatAlertPhone', () => {
  it('groups Indian mobiles and keeps others', () => {
    expect(formatAlertPhone('+919876543210')).toBe('+91 98765 43210');
    expect(formatAlertPhone('+971501234567')).toBe('+971501234567');
    expect(formatAlertPhone(null)).toBeNull();
  });
});

/** A tiny Supabase stand-in: every chain resolves to the queued result for its table. */
function fakeClient(results: Record<string, unknown>) {
  const calls: Array<{ table: string; op: string; args: unknown[] }> = [];
  const client = {
    calls,
    from(table: string) {
      const chain: any = {};
      for (const op of ['select', 'update', 'insert', 'delete', 'eq', 'is', 'gte', 'in', 'not', 'order', 'limit']) {
        chain[op] = (...args: unknown[]) => {
          calls.push({ table, op, args });
          return chain;
        };
      }
      chain.maybeSingle = () => Promise.resolve(results[`${table}:maybeSingle`] ?? { data: null, error: null });
      chain.single = () => Promise.resolve(results[`${table}:single`] ?? { data: {}, error: null });
      chain.then = (resolve: (v: unknown) => unknown) => resolve(results[table] ?? { data: [], error: null });
      return chain;
    },
  };
  return client;
}

describe('alertNewSignup', () => {
  beforeEach(() => {
    sendNotification.mockReset();
    process.env.VAPID_PUBLIC_KEY = 'pub';
    process.env.VAPID_PRIVATE_KEY = 'priv';
  });
  afterEach(() => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
  });

  it('does nothing when the claim matches no row (already alerted, old account, staff, no phone)', async () => {
    const client = fakeClient({ users: { data: [], error: null } });
    expect(await alertNewSignup(client as any, 'u-1')).toEqual({ sent: false });
    expect(client.calls.some((c) => c.table === 'admin_notifications')).toBe(false);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('claims only new verified leads, writes the bell row and pushes to staff', async () => {
    const client = fakeClient({
      users: { data: [user], error: null },
      admin_push_subscriptions: { data: [{ id: 's1', endpoint: 'https://push/1', p256dh: 'k', auth: 'a', failure_count: 0 }], error: null },
    });
    sendNotification.mockResolvedValue({ statusCode: 201 });
    const result = await alertNewSignup(client as any, 'u-1');
    expect(result.sent).toBe(true);
    expect(result.push).toMatchObject({ configured: true, devices: 1, sent: 1 });

    const claim = client.calls.filter((c) => c.table === 'users');
    expect(claim).toContainEqual({ table: 'users', op: 'eq', args: ['phone_verified', true] });
    expect(claim).toContainEqual({ table: 'users', op: 'eq', args: ['user_type', 'lead'] });
    expect(claim).toContainEqual({ table: 'users', op: 'is', args: ['signup_alert_sent_at', null] });

    const bell = client.calls.find((c) => c.table === 'admin_notifications' && c.op === 'insert');
    expect((bell?.args[0] as any).event_type).toBe('new_signup');
    const payload = JSON.parse(sendNotification.mock.calls[0][1]);
    expect(payload).toMatchObject({ title: 'New sign-up: Aswathi Raj', url: '/crm/u-1', tag: 'signup-u-1' });
  });
});

describe('sendStaffPush', () => {
  afterEach(() => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
  });

  it('reports not configured without VAPID keys', async () => {
    const client = fakeClient({});
    expect(await sendStaffPush(client as any, { title: 't', body: 'b', url: '/' })).toMatchObject({ configured: false, sent: 0 });
  });

  it('deletes a subscription the push service says is gone', async () => {
    process.env.VAPID_PUBLIC_KEY = 'pub2';
    process.env.VAPID_PRIVATE_KEY = 'priv';
    sendNotification.mockRejectedValue(Object.assign(new Error('gone'), { statusCode: 410 }));
    const client = fakeClient({
      admin_push_subscriptions: { data: [{ id: 's9', endpoint: 'https://push/9', p256dh: 'k', auth: 'a', failure_count: 0 }], error: null },
    });
    const result = await sendStaffPush(client as any, { title: 't', body: 'b', url: '/' });
    expect(result).toMatchObject({ removed: 1, sent: 0, failed: 0 });
    expect(client.calls).toContainEqual({ table: 'admin_push_subscriptions', op: 'delete', args: [] });
  });
});
