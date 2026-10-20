// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { verifyWatcherRequest, signWatcherRequest, inboxEventId, dkimPassFromAuthResults } from './watcher-auth';

/**
 * Bank alerts move money, so a watcher must prove who it is: an HMAC over
 * timestamp.nonce.body with a per-device secret (the Apps Script, the observer
 * APK), or a per-device static token over TLS (SMS forwarder apps that cannot
 * sign). Pinned: unknown devices, stale timestamps, bad signatures and bad
 * tokens are all refused, and the reason says why.
 */
const secrets = { 'office-phone': 'phone-secret-1', gmail: 'mail-secret-2' };
const NOW = new Date('2026-10-21T04:00:00.000Z');
const body = JSON.stringify({ sender: 'JD-KVBUPI-S', body: 'Your a/c ... credited' });

describe('HMAC', () => {
  it('accepts a fresh, correctly signed request', () => {
    const ts = String(NOW.getTime());
    const sig = signWatcherRequest(secrets.gmail, ts, 'n-1', body);
    expect(verifyWatcherRequest({ deviceId: 'gmail', signature: sig, token: null, timestamp: ts, nonce: 'n-1', rawBody: body, secrets, now: NOW })).toEqual({ ok: true, deviceId: 'gmail', via: 'hmac' });
  });

  it('refuses a stale timestamp (more than 5 minutes)', () => {
    const ts = String(NOW.getTime() - 6 * 60 * 1000);
    const sig = signWatcherRequest(secrets.gmail, ts, 'n-1', body);
    const r = verifyWatcherRequest({ deviceId: 'gmail', signature: sig, token: null, timestamp: ts, nonce: 'n-1', rawBody: body, secrets, now: NOW });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toMatch(/timestamp/i);
  });

  it('refuses a signature made with another device secret or over a different body', () => {
    const ts = String(NOW.getTime());
    const wrongKey = signWatcherRequest(secrets['office-phone'], ts, 'n-1', body);
    expect(verifyWatcherRequest({ deviceId: 'gmail', signature: wrongKey, token: null, timestamp: ts, nonce: 'n-1', rawBody: body, secrets, now: NOW }).ok).toBe(false);
    const sig = signWatcherRequest(secrets.gmail, ts, 'n-1', body);
    expect(verifyWatcherRequest({ deviceId: 'gmail', signature: sig, token: null, timestamp: ts, nonce: 'n-1', rawBody: body + ' ', secrets, now: NOW }).ok).toBe(false);
  });

  it('needs a nonce', () => {
    const ts = String(NOW.getTime());
    const sig = signWatcherRequest(secrets.gmail, ts, '', body);
    expect(verifyWatcherRequest({ deviceId: 'gmail', signature: sig, token: null, timestamp: ts, nonce: '', rawBody: body, secrets, now: NOW }).ok).toBe(false);
  });
});

describe('static token', () => {
  it('accepts the device token', () => {
    expect(verifyWatcherRequest({ deviceId: 'office-phone', signature: null, token: 'phone-secret-1', timestamp: null, nonce: null, rawBody: body, secrets, now: NOW })).toEqual({ ok: true, deviceId: 'office-phone', via: 'token' });
  });
  it('refuses a wrong token, another device token, or a token of a different length', () => {
    expect(verifyWatcherRequest({ deviceId: 'office-phone', signature: null, token: 'mail-secret-2', timestamp: null, nonce: null, rawBody: body, secrets, now: NOW }).ok).toBe(false);
    expect(verifyWatcherRequest({ deviceId: 'office-phone', signature: null, token: 'phone', timestamp: null, nonce: null, rawBody: body, secrets, now: NOW }).ok).toBe(false);
  });
});

describe('device and credentials', () => {
  it('refuses an unknown device and a request with nothing to check', () => {
    expect(verifyWatcherRequest({ deviceId: 'nope', signature: null, token: 'phone-secret-1', timestamp: null, nonce: null, rawBody: body, secrets, now: NOW })).toMatchObject({ ok: false, reason: expect.stringMatching(/unknown device/i) });
    expect(verifyWatcherRequest({ deviceId: 'gmail', signature: null, token: null, timestamp: null, nonce: null, rawBody: body, secrets, now: NOW })).toMatchObject({ ok: false, reason: expect.stringMatching(/credential/i) });
  });
});

describe('inbox event ids and DKIM results', () => {
  it('an unauthenticated post never gets to name its event id', () => {
    const a = inboxEventId({ ok: false, reason: 'bad token' }, 'office-phone', 'sms-17', 'fallback');
    const b = inboxEventId({ ok: false, reason: 'bad token' }, 'office-phone', 'sms-17', 'fallback');
    expect(a).toMatch(/^unauth:/);
    expect(a).not.toBe(b);
    expect(inboxEventId({ ok: true, deviceId: 'office-phone', via: 'token' }, 'office-phone', 'sms-17', 'fallback')).toBe('office-phone:sms-17');
    expect(inboxEventId({ ok: true, deviceId: 'office-phone', via: 'token' }, 'office-phone', null, 'fallback')).toBe('office-phone:fallback');
  });

  it("dkimPassFromAuthResults trusts only Gmail's own verdict, for the exact bank domain, with no DMARC failure", () => {
    const ok = 'mx.google.com; dkim=pass header.i=@kvb.bank.in header.s=sel header.b=abc; spf=pass smtp.mailfrom=kvb.bank.in; dmarc=pass (p=REJECT) header.from=kvb.bank.in';
    expect(dkimPassFromAuthResults(ok, ['kvb.bank.in'])).toBe(true);
    expect(dkimPassFromAuthResults('mx.google.com; dkim=pass header.d=alerts.kvb.bank.in', ['kvb.bank.in'])).toBe(true);
    expect(dkimPassFromAuthResults('mx.google.com; dkim=pass header.d=kvb.bank.in.evil.com', ['kvb.bank.in'])).toBe(false);
    expect(dkimPassFromAuthResults('mx.google.com; dkim=fail header.d=kvb.bank.in; dkim=pass header.d=evil.com', ['kvb.bank.in'])).toBe(false);
    expect(dkimPassFromAuthResults('evil.example; dkim=pass header.d=kvb.bank.in', ['kvb.bank.in'])).toBe(false);
    expect(dkimPassFromAuthResults('mx.google.com; dkim=pass header.d=kvb.bank.in; dmarc=fail header.from=kvb.bank.in', ['kvb.bank.in'])).toBe(false);
    expect(dkimPassFromAuthResults(null, ['kvb.bank.in'])).toBe(false);
  });
});
