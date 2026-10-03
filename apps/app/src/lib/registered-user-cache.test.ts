import { describe, it, expect } from 'vitest';
import { parseRegisteredUser } from './registered-user-cache';

const now = 1_000_000_000_000;

describe('parseRegisteredUser', () => {
  it('returns the cached profile when fresh', () => {
    const raw = JSON.stringify({ savedAt: now - 60_000, user: { id: 'u1', phone_verified: true } });
    expect(parseRegisteredUser(raw, now)).toEqual({ id: 'u1', phone_verified: true });
  });

  it('ignores entries older than 12 hours', () => {
    const raw = JSON.stringify({ savedAt: now - 13 * 60 * 60 * 1000, user: { id: 'u1' } });
    expect(parseRegisteredUser(raw, now)).toBeNull();
  });

  it('ignores missing, malformed and empty entries', () => {
    expect(parseRegisteredUser(null, now)).toBeNull();
    expect(parseRegisteredUser('not json', now)).toBeNull();
    expect(parseRegisteredUser(JSON.stringify({ savedAt: now }), now)).toBeNull();
    expect(parseRegisteredUser(JSON.stringify({ user: { id: 'u1' } }), now)).toBeNull();
  });
});
