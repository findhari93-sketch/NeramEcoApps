// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clientIp, hashIp, normalizeRoomCode, padIpHashSecret } from './room-code';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('normalizeRoomCode', () => {
  it.each([
    ['482913', '482913'],
    [' 482 913 ', '482913'],
    ['482-913', '482913'],
    ['012345', '012345'],
  ])('accepts %j as %j', (input, expected) => {
    expect(normalizeRoomCode(input)).toBe(expected);
  });

  it.each(['', '48291', '4829134', 'abcdef', '48a913', '48.913', '４８２９１３', null, undefined, 482913])('refuses %j', (input) => {
    expect(normalizeRoomCode(input as unknown)).toBeNull();
  });
});

describe('clientIp', () => {
  it('prefers the address the platform sets over the one the client claims', () => {
    expect(clientIp(new Headers({ 'x-real-ip': '203.0.113.7', 'x-forwarded-for': '198.51.100.1, 10.0.0.1' }))).toBe('203.0.113.7');
  });

  it('falls back to the first forwarded address', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': ' 198.51.100.1 , 10.0.0.1' }))).toBe('198.51.100.1');
  });

  it('returns null when neither header is present', () => {
    expect(clientIp(new Headers())).toBeNull();
    expect(clientIp(new Headers({ 'x-forwarded-for': ' , ' }))).toBeNull();
  });
});

describe('hashIp', () => {
  it('is stable for one secret, differs across secrets and addresses, and never contains the address', () => {
    const hash = hashIp('203.0.113.7', 'secret-one');
    expect(hash).toBe(hashIp('203.0.113.7', 'secret-one'));
    expect(hash).not.toBe(hashIp('203.0.113.7', 'secret-two'));
    expect(hash).not.toBe(hashIp('203.0.113.8', 'secret-one'));
    expect(hash).not.toContain('203.0.113.7');
    expect(hash).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it('turns only the IP limit off, rather than guessing, when the address or secret is missing', () => {
    expect(hashIp(null, 'secret')).toBeNull();
    expect(hashIp('203.0.113.7', undefined)).toBeNull();
    expect(hashIp('203.0.113.7', '')).toBeNull();
  });
});

describe('padIpHashSecret', () => {
  it('uses the dedicated secret first, then the service role key', () => {
    vi.stubEnv('PAD_IP_HASH_SECRET', 'dedicated');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    expect(padIpHashSecret()).toBe('dedicated');

    vi.stubEnv('PAD_IP_HASH_SECRET', '');
    expect(padIpHashSecret()).toBe('service');

    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    expect(padIpHashSecret()).toBeUndefined();
  });
});
