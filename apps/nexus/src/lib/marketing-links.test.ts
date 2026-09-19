import { describe, it, expect } from 'vitest';
import {
  PROD_MARKETING_ORIGIN,
  marketingOriginFor,
  studentDetailUrl,
} from './marketing-links';

/**
 * A wrong origin here means a member of staff pastes a dead link into WhatsApp and
 * finds out days later, so every host shape the apps actually run on is pinned.
 */

describe('marketingOriginFor', () => {
  it('prefers an explicit setting over anything derived', () => {
    expect(marketingOriginFor('https://nexus.neramclasses.com', 'https://example.com')).toBe(
      'https://example.com',
    );
  });

  it('strips a trailing slash from the explicit setting', () => {
    expect(marketingOriginFor('https://nexus.neramclasses.com', 'https://example.com/')).toBe(
      'https://example.com',
    );
  });

  it('ignores an empty or whitespace setting', () => {
    expect(marketingOriginFor('https://nexus.neramclasses.com', '   ')).toBe(
      'https://neramclasses.com',
    );
  });

  it('drops the nexus prefix in production', () => {
    expect(marketingOriginFor('https://nexus.neramclasses.com')).toBe('https://neramclasses.com');
  });

  it('maps staging-nexus to staging', () => {
    expect(marketingOriginFor('https://staging-nexus.neramclasses.com')).toBe(
      'https://staging.neramclasses.com',
    );
  });

  it('maps a laptop to the marketing dev port', () => {
    expect(marketingOriginFor('http://localhost:3012')).toBe('http://localhost:3010');
    expect(marketingOriginFor('http://127.0.0.1:3012')).toBe('http://127.0.0.1:3010');
  });

  it('falls back to production for a preview deployment, which has no twin', () => {
    expect(marketingOriginFor('https://neram-nexus-new-abc123.vercel.app')).toBe(
      PROD_MARKETING_ORIGIN,
    );
  });

  it('falls back to production for a missing or unparseable origin', () => {
    expect(marketingOriginFor(null)).toBe(PROD_MARKETING_ORIGIN);
    expect(marketingOriginFor(undefined)).toBe(PROD_MARKETING_ORIGIN);
    expect(marketingOriginFor('')).toBe(PROD_MARKETING_ORIGIN);
    expect(marketingOriginFor('not a url')).toBe(PROD_MARKETING_ORIGIN);
  });
});

describe('studentDetailUrl', () => {
  it('builds the short link a student is sent', () => {
    expect(studentDetailUrl('abc123', { nexusOrigin: 'https://nexus.neramclasses.com' })).toBe(
      'https://neramclasses.com/s/abc123',
    );
  });

  it('escapes a token so it cannot break out of the path', () => {
    expect(studentDetailUrl('a/b?c', { nexusOrigin: 'https://nexus.neramclasses.com' })).toBe(
      'https://neramclasses.com/s/a%2Fb%3Fc',
    );
  });

  it('leaves base64url tokens untouched, which is what we actually mint', () => {
    const token = 'Ab9_-xYz';
    expect(studentDetailUrl(token, { nexusOrigin: 'https://nexus.neramclasses.com' })).toBe(
      `https://neramclasses.com/s/${token}`,
    );
  });
});
