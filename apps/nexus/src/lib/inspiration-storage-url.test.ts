import { describe, expect, it, vi } from 'vitest';
import { isProjectStorageUrl } from './inspiration-storage-url';

const PATH = '/storage/v1/object/public/drawing-references/x.png';
const STAGING = 'https://db-staging.neramclasses.com';
/** No configured Supabase URL (an explicit undefined would fall back to the env). */
const NONE = '';

describe('isProjectStorageUrl', () => {
  it('accepts public objects on the production proxy', () => {
    expect(isProjectStorageUrl(`https://db.neramclasses.com${PATH}`, NONE)).toBe(true);
    expect(isProjectStorageUrl(`https://db.neramclasses.com${PATH}?v=2`, NONE)).toBe(true);
  });

  it("accepts the configured Supabase URL's origin, and falls back to the env", () => {
    expect(isProjectStorageUrl(`${STAGING}${PATH}`, STAGING)).toBe(true);
    expect(isProjectStorageUrl(`${STAGING}${PATH}`, `${STAGING}/`)).toBe(true);
    expect(isProjectStorageUrl(`${STAGING}${PATH}`, NONE)).toBe(false);

    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', STAGING);
    try {
      expect(isProjectStorageUrl(`${STAGING}${PATH}`)).toBe(true);
      expect(isProjectStorageUrl(`https://db-staging.neramclasses.com.evil.io${PATH}`)).toBe(false);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('accepts a project ref on supabase.co', () => {
    expect(isProjectStorageUrl(`https://hgxjavrsrvpihqrpezdh.supabase.co${PATH}`, NONE)).toBe(true);
    expect(isProjectStorageUrl(`https://HGXJAVRSRVPIHQRPEZDH.supabase.co${PATH}`, NONE)).toBe(true);
  });

  it('rejects http and non-URLs', () => {
    expect(isProjectStorageUrl(`http://db.neramclasses.com${PATH}`, NONE)).toBe(false);
    expect(isProjectStorageUrl('not a url', NONE)).toBe(false);
    expect(isProjectStorageUrl('', NONE)).toBe(false);
    expect(isProjectStorageUrl(` https://db.neramclasses.com${PATH}`, NONE)).toBe(false);
  });

  it('rejects a configured origin that is not https', () => {
    expect(isProjectStorageUrl(`http://localhost:54321${PATH}`, 'http://localhost:54321')).toBe(false);
  });

  it('rejects credentials in the URL', () => {
    expect(isProjectStorageUrl(`https://user:pass@db.neramclasses.com${PATH}`, NONE)).toBe(false);
    expect(isProjectStorageUrl(`https://db.neramclasses.com@evil.io${PATH}`, NONE)).toBe(false);
  });

  it('rejects other hosts and lookalikes', () => {
    expect(isProjectStorageUrl(`https://example.com${PATH}`, NONE)).toBe(false);
    expect(isProjectStorageUrl(`https://placehold.co/600x800.png`, NONE)).toBe(false);
    expect(isProjectStorageUrl(`https://db.neramclasses.com.evil.io${PATH}`, NONE)).toBe(false);
    expect(isProjectStorageUrl(`https://evildb.neramclasses.com${PATH}`, NONE)).toBe(false);
    expect(isProjectStorageUrl(`https://abc.supabase.co.evil.io${PATH}`, NONE)).toBe(false);
    expect(isProjectStorageUrl(`https://a.b.supabase.co${PATH}`, NONE)).toBe(false);
    expect(isProjectStorageUrl(`https://abc-def.supabase.co${PATH}`, NONE)).toBe(false);
    expect(isProjectStorageUrl(`https://db.neramclasses.com:8443${PATH}`, NONE)).toBe(false);
    expect(isProjectStorageUrl(`https://abc.supabase.co:8443${PATH}`, NONE)).toBe(false);
    expect(isProjectStorageUrl(`https://evil.io\\@db.neramclasses.com${PATH}`, NONE)).toBe(false);
  });

  it('rejects paths outside public storage objects', () => {
    expect(isProjectStorageUrl('https://db.neramclasses.com/rest/v1/users', NONE)).toBe(false);
    expect(isProjectStorageUrl('https://db.neramclasses.com/storage/v1/object/sign/drawing-references/x.png', NONE)).toBe(false);
    expect(isProjectStorageUrl('https://db.neramclasses.com/storage/v1/object/public/../../../rest/v1/users', NONE)).toBe(false);
    expect(isProjectStorageUrl('https://db.neramclasses.com/storage/v1/object/public/%2e%2e/%2e%2e/%2e%2e/rest/v1/users', NONE)).toBe(false);
    expect(isProjectStorageUrl('https://db.neramclasses.com/x/storage/v1/object/public/a.png', NONE)).toBe(false);
  });
});
