import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openCopyOperation, sealCopyOperation } from './library-copy-token';

/**
 * The handle the recordings page holds for a running copy.
 *
 * Graph's progress address for a copy carries a `tempauth` token in its query
 * string, and the one this tenant returned on 2026-09-11 listed allfiles.write
 * among its scopes. So the address stays on the server: the page gets it sealed
 * (AES-256-GCM, keyed from the app secret) and hands it back to be opened.
 */

const MONITOR =
  'https://nerasmclasses-my.sharepoint.com/personal/haribabu_neramclasses_com/_api/v2.1/drives/b!onedrive/operations/26502aed-8d81-47ab-835f-efbc88dfc570?c=abc&v=2.0&tempauth=v1.secret';

const savedSecret = process.env.AZ_CLIENT_SECRET;

beforeEach(() => {
  process.env.AZ_CLIENT_SECRET = 'test-client-secret';
});

afterEach(() => {
  if (savedSecret === undefined) delete process.env.AZ_CLIENT_SECRET;
  else process.env.AZ_CLIENT_SECRET = savedSecret;
});

describe('copy operation token', () => {
  it('opens what it sealed, giving back the progress address and the library drive', () => {
    const token = sealCopyOperation({ monitor: MONITOR, destDriveId: 'b!library' });
    expect(openCopyOperation(token)).toEqual({ monitor: MONITOR, destDriveId: 'b!library' });
  });

  it('never shows the progress address, whose tempauth works like a password, to the browser', () => {
    const token = sealCopyOperation({ monitor: MONITOR, destDriveId: 'b!library' });
    expect(token).not.toContain('tempauth');
    expect(token).not.toContain('sharepoint');
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('refuses a token that was changed', () => {
    const token = sealCopyOperation({ monitor: MONITOR, destDriveId: 'b!library' });
    const flipped = `${token.slice(0, 20)}${token[20] === 'A' ? 'B' : 'A'}${token.slice(21)}`;
    expect(openCopyOperation(flipped)).toBeNull();
  });

  it('refuses a token sealed under another app secret', () => {
    const token = sealCopyOperation({ monitor: MONITOR, destDriveId: 'b!library' });
    process.env.AZ_CLIENT_SECRET = 'rotated-secret';
    expect(openCopyOperation(token)).toBeNull();
  });

  it('refuses a token more than a day old', () => {
    const now = Date.UTC(2026, 8, 11, 12);
    const token = sealCopyOperation({ monitor: MONITOR, destDriveId: 'b!library' }, now);
    expect(openCopyOperation(token, now + 23 * 3_600_000)).not.toBeNull();
    expect(openCopyOperation(token, now + 25 * 3_600_000)).toBeNull();
  });

  it('refuses to seal an address that is not a copy progress address', () => {
    expect(() => sealCopyOperation({ monitor: 'https://evil.example/operations/x', destDriveId: 'b!library' })).toThrow();
  });

  it('refuses a raw address or garbage in place of a token', () => {
    const refused: unknown[] = [MONITOR, 'not-a-token', '', null, undefined, 'A'.repeat(5000)];
    for (const bad of refused) expect(openCopyOperation(bad as string)).toBeNull();
  });

  it('will not seal without the app secret, rather than sealing under an empty key', () => {
    delete process.env.AZ_CLIENT_SECRET;
    expect(() => sealCopyOperation({ monitor: MONITOR, destDriveId: 'b!library' })).toThrow();
    expect(openCopyOperation('anything')).toBeNull();
  });
});
