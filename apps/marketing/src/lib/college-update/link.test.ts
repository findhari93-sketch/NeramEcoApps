// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createHash, randomBytes } from 'crypto';
import { hashToken, linkProblem, linkSections, loadLink } from './link';

describe('hashToken', () => {
  it('matches sha256 hex of the token, as Admin stores it', () => {
    const token = randomBytes(32).toString('base64url');
    expect(hashToken(token)).toBe(createHash('sha256').update(token).digest('hex'));
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe('linkProblem', () => {
  const now = new Date('2026-10-15T10:00:00Z');
  it('accepts a live link', () => {
    expect(linkProblem({ expires_at: '2026-10-29T10:00:00Z', revoked_at: null }, now)).toBeNull();
  });
  it('flags missing, cancelled and expired links', () => {
    expect(linkProblem(null, now)).toBe('invalid');
    expect(linkProblem({ expires_at: '2026-10-29T10:00:00Z', revoked_at: '2026-10-14T00:00:00Z' }, now)).toBe('cancelled');
    expect(linkProblem({ expires_at: '2026-10-15T09:59:00Z', revoked_at: null }, now)).toBe('expired');
  });
});

describe('linkSections', () => {
  it('keeps the dashboard order and drops unknown keys', () => {
    expect(linkSections({ sections: ['photos', 'fees', 'tier', 'profile'] })).toEqual(['profile', 'fees', 'photos']);
  });
  it('falls back to the default five', () => {
    expect(linkSections({ sections: [] })).toEqual(['profile', 'fees', 'admissions', 'location', 'photos']);
  });
});

describe('loadLink', () => {
  it('rejects a malformed token without querying', async () => {
    const db = { from: () => { throw new Error('should not query'); } };
    expect(await loadLink(db, 'short')).toEqual({ link: null, problem: 'invalid' });
    expect(await loadLink(db, '../../etc/passwd-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toEqual({ link: null, problem: 'invalid' });
  });
});
