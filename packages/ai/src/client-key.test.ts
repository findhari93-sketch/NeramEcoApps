import { describe, it, expect, beforeEach } from 'vitest';
import { hashClientKey, ipFromHeaders } from './client-key';

beforeEach(() => {
  process.env.CLIENT_KEY_SALT = 'test-salt';
});

const headers = (map: Record<string, string>) => ({
  get: (name: string) => map[name.toLowerCase()] ?? null,
});

describe('hashClientKey', () => {
  it('gives the same visitor the same key', () => {
    expect(hashClientKey('sess-1', '1.2.3.4')).toBe(hashClientKey('sess-1', '1.2.3.4'));
  });

  it('separates two visitors on the same connection', () => {
    // A school lab behind one NAT must not read as a single chatty visitor.
    expect(hashClientKey('sess-1', '1.2.3.4')).not.toBe(hashClientKey('sess-2', '1.2.3.4'));
  });

  it('separates the same session id coming from a different address', () => {
    // Clearing a session id is one line of script, which is what the limit is
    // for, so the address has to be part of the key.
    expect(hashClientKey('sess-1', '1.2.3.4')).not.toBe(hashClientKey('sess-1', '9.9.9.9'));
  });

  it('never stores the address it was given', () => {
    const key = hashClientKey('sess-1', '203.0.113.7');
    expect(key).not.toContain('203.0.113.7');
    expect(key).toMatch(/^[0-9a-f]{32}$/);
  });

  it('returns null when it knows nothing, rather than one shared key', () => {
    // A constant fallback would put every anonymous visitor in one bucket and
    // the first of them would rate limit the rest.
    expect(hashClientKey(null, undefined, '')).toBeNull();
  });

  it('still works from one part when the other is missing', () => {
    expect(hashClientKey(null, '1.2.3.4')).toBeTruthy();
    expect(hashClientKey('sess-1', null)).toBeTruthy();
  });
});

describe('ipFromHeaders', () => {
  it('takes the FIRST x-forwarded-for entry, which is the client', () => {
    // Taking the last would return the same proxy for every visitor and quietly
    // turn a per-visitor limit into a global one.
    expect(ipFromHeaders(headers({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1, 10.0.0.2' }))).toBe(
      '1.2.3.4'
    );
  });

  it('falls back to the Cloudflare header', () => {
    expect(ipFromHeaders(headers({ 'cf-connecting-ip': '5.6.7.8' }))).toBe('5.6.7.8');
  });

  it('returns null when no header carries an address', () => {
    expect(ipFromHeaders(headers({}))).toBeNull();
  });
});
