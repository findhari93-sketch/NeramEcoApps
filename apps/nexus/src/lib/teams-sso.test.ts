// @vitest-environment node
/**
 * Teams SSO token validation. Tokens are signed with RSA keys generated here and
 * the tenant's key endpoint is a stubbed fetch, so every attack is a real token.
 */
import { createHmac, generateKeyPairSync, randomUUID, sign as signBytes, type KeyObject } from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  TEAMS_CLIENT_IDS,
  TeamsSsoError,
  __resetTeamsSsoKeys,
  isTeamsSsoToken,
  teamsSsoConfig,
  verifyTeamsSsoToken,
  type TeamsSsoConfig,
} from './teams-sso';

const CLIENT_ID = 'aa039c70-50d2-4c91-bd0e-5675df5e50ff';
const TENANT_ID = '11111111-2222-4333-8444-555555555555';
const OTHER_TENANT = '99999999-8888-4777-8666-555555555555';
const USER_OID = '0f0e0d0c-0b0a-4908-8706-050403020100';
const AZURE_CLI = '04b07795-8ddb-461a-bbee-02f9e1bf7b46';
const [TEAMS_DESKTOP, TEAMS_WEB] = TEAMS_CLIENT_IDS;

const config: TeamsSsoConfig = { clientId: CLIENT_ID, tenantId: TENANT_ID, resourceHosts: ['nexus.neramclasses.com'] };

interface SigningKey {
  kid: string;
  privateKey: KeyObject;
  jwk: Record<string, unknown>;
}

function makeKey(kid: string): SigningKey {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return { kid, privateKey, jwk: { ...publicKey.export({ format: 'jwk' }), kid, use: 'sig', alg: 'RS256' } };
}

const primary = makeKey('key-primary');
const rotated = makeKey('key-rotated');
/** Different key material that claims the published key id. */
const impostor = makeKey('key-primary');

const encode = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');

function signToken(key: SigningKey, claims: Record<string, unknown>): string {
  const input = `${encode({ alg: 'RS256', typ: 'JWT', kid: key.kid })}.${encode(claims)}`;
  return `${input}.${signBytes('RSA-SHA256', Buffer.from(input), key.privateKey).toString('base64url')}`;
}

function v2Claims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  return {
    aud: CLIENT_ID,
    iss: `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
    tid: TENANT_ID,
    oid: USER_OID,
    azp: TEAMS_DESKTOP,
    scp: 'access_as_user',
    preferred_username: 'student@neramclasses.com',
    name: 'A Student',
    iat: now - 60,
    nbf: now - 60,
    exp: now + 3600,
    ver: '2.0',
    ...overrides,
  };
}

function v1Claims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  return {
    aud: `api://nexus.neramclasses.com/${CLIENT_ID}`,
    iss: `https://sts.windows.net/${TENANT_ID}/`,
    tid: TENANT_ID,
    oid: USER_OID,
    appid: TEAMS_WEB,
    scp: 'access_as_user',
    upn: 'teacher@neramclasses.com',
    name: 'A Teacher',
    iat: now - 60,
    nbf: now - 60,
    exp: now + 3600,
    ver: '1.0',
    ...overrides,
  };
}

let publishedKeys: Array<Record<string, unknown>>;
let fetchSpy: Mock;

beforeEach(() => {
  __resetTeamsSsoKeys();
  publishedKeys = [primary.jwk];
  fetchSpy = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ keys: publishedKeys }) }));
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('verifyTeamsSsoToken: valid tokens', () => {
  it('accepts a v2 token from Teams desktop and returns the Entra identity', async () => {
    await expect(verifyTeamsSsoToken(signToken(primary, v2Claims()), config)).resolves.toEqual({
      oid: USER_OID,
      tid: TENANT_ID,
      email: 'student@neramclasses.com',
      name: 'A Student',
    });
    expect(fetchSpy).toHaveBeenCalledWith(`https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`);
  });

  it('accepts a v1 token from Teams web addressed to the api:// resource', async () => {
    await expect(verifyTeamsSsoToken(signToken(primary, v1Claims()), config)).resolves.toEqual({
      oid: USER_OID,
      tid: TENANT_ID,
      email: 'teacher@neramclasses.com',
      name: 'A Teacher',
    });
  });

  it('lowercases the object id so it matches users.ms_oid', async () => {
    const identity = await verifyTeamsSsoToken(signToken(primary, v2Claims({ oid: USER_OID.toUpperCase() })), config);
    expect(identity.oid).toBe(USER_OID);
  });

  it('tolerates five minutes of clock skew and no more', async () => {
    const now = Math.floor(Date.now() / 1000);
    await expect(verifyTeamsSsoToken(signToken(primary, v2Claims({ exp: now - 240 })), config)).resolves.toMatchObject({ oid: USER_OID });
    await expect(verifyTeamsSsoToken(signToken(primary, v2Claims({ exp: now - 360 })), config)).rejects.toThrow(/expired/);
    await expect(verifyTeamsSsoToken(signToken(primary, v2Claims({ nbf: now + 240 })), config)).resolves.toMatchObject({ oid: USER_OID });
    await expect(verifyTeamsSsoToken(signToken(primary, v2Claims({ nbf: now + 600 })), config)).rejects.toThrow(/not yet valid/);
  });
});

describe('verifyTeamsSsoToken: claims', () => {
  it.each<[string, Record<string, unknown>, RegExp]>([
    ['audience is Microsoft Graph', { aud: '00000003-0000-0000-c000-000000000000' }, /audience/],
    ['api:// audience is on another host', { aud: `api://evil.example.com/${CLIENT_ID}` }, /audience/],
    ['api:// audience names another app', { aud: `api://nexus.neramclasses.com/${randomUUID()}` }, /audience/],
    ['tenant is another organisation', { tid: OTHER_TENANT, iss: `https://login.microsoftonline.com/${OTHER_TENANT}/v2.0` }, /tenant/],
    ['issuer belongs to another tenant', { iss: `https://login.microsoftonline.com/${OTHER_TENANT}/v2.0` }, /issuer/],
    ['issuer is not Microsoft', { iss: `https://login.example.com/${TENANT_ID}/v2.0` }, /issuer/],
    ['scope is not access_as_user', { scp: 'User.Read' }, /scope/],
    ['scope is missing', { scp: undefined }, /scope/],
    ['client app is not Teams', { azp: AZURE_CLI }, /client/],
    ['client app is missing', { azp: undefined }, /client/],
    ['object id is missing', { oid: undefined }, /user/],
    ['object id is not a GUID', { oid: 'not-a-guid' }, /user/],
    ['expiry is missing', { exp: undefined }, /expired/],
    ['expiry is not a number', { exp: 'tomorrow' }, /expired/],
  ])('rejects a token whose %s', async (_label, overrides, message) => {
    await expect(verifyTeamsSsoToken(signToken(primary, v2Claims(overrides)), config)).rejects.toThrow(message);
  });

  it('refuses everything when sign-in is not configured', async () => {
    await expect(verifyTeamsSsoToken(signToken(primary, v2Claims()), null)).rejects.toThrow(/not configured/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('verifyTeamsSsoToken: signatures', () => {
  it('rejects a token whose payload was edited after signing', async () => {
    const [header, , signature] = signToken(primary, v2Claims()).split('.');
    const forged = `${header}.${encode(v2Claims({ oid: randomUUID() }))}.${signature}`;
    await expect(verifyTeamsSsoToken(forged, config)).rejects.toThrow(/signature/);
  });

  it('rejects a token signed by other key material that reuses a published key id', async () => {
    await expect(verifyTeamsSsoToken(signToken(impostor, v2Claims()), config)).rejects.toThrow(/signature/);
  });

  it('rejects an unsigned token, with or without a trailing signature segment', async () => {
    const input = `${encode({ alg: 'none', typ: 'JWT', kid: primary.kid })}.${encode(v2Claims())}`;
    await expect(verifyTeamsSsoToken(`${input}.`, config)).rejects.toThrow(/Malformed/);
    await expect(verifyTeamsSsoToken(`${input}.AAAA`, config)).rejects.toThrow(/algorithm/);
  });

  it('rejects HS256 signed with the public key as the secret (algorithm confusion)', async () => {
    const input = `${encode({ alg: 'HS256', typ: 'JWT', kid: primary.kid })}.${encode(v2Claims())}`;
    const signature = createHmac('sha256', JSON.stringify(primary.jwk)).update(input).digest('base64url');
    await expect(verifyTeamsSsoToken(`${input}.${signature}`, config)).rejects.toThrow(/algorithm/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects a token with no key id', async () => {
    const input = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode(v2Claims())}`;
    const signature = signBytes('RSA-SHA256', Buffer.from(input), primary.privateKey).toString('base64url');
    await expect(verifyTeamsSsoToken(`${input}.${signature}`, config)).rejects.toThrow(/algorithm/);
  });

  it.each(['', 'opaque', 'a.b', 'a.b.c', 'a.b.c.d', `${encode({ alg: 'RS256' })}.${encode([1, 2])}.sig`])(
    'rejects malformed input %j',
    async (token) => {
      await expect(verifyTeamsSsoToken(token, config)).rejects.toBeInstanceOf(TeamsSsoError);
    },
  );
});

describe('verifyTeamsSsoToken: signing keys', () => {
  it('fetches the signing keys once and reuses them', async () => {
    for (let i = 0; i < 3; i += 1) {
      await verifyTeamsSsoToken(signToken(primary, v2Claims()), config);
    }
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('refetches when Microsoft starts signing with a key it has not seen, then trusts it', async () => {
    vi.useFakeTimers();
    await verifyTeamsSsoToken(signToken(primary, v2Claims()), config);

    vi.setSystemTime(Date.now() + 10 * 60_000);
    publishedKeys = [primary.jwk, rotated.jwk];
    await expect(verifyTeamsSsoToken(signToken(rotated, v2Claims()), config)).resolves.toMatchObject({ oid: USER_OID });
    await verifyTeamsSsoToken(signToken(rotated, v2Claims()), config);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('lets unknown key ids trigger at most one refetch every five minutes', async () => {
    vi.useFakeTimers();
    await verifyTeamsSsoToken(signToken(primary, v2Claims()), config);
    for (let i = 0; i < 5; i += 1) {
      await expect(verifyTeamsSsoToken(signToken(rotated, v2Claims()), config)).rejects.toThrow(/signature/);
    }
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + 6 * 60_000);
    await expect(verifyTeamsSsoToken(signToken(rotated, v2Claims()), config)).rejects.toThrow(/signature/);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('refreshes the key set after a day, so a withdrawn key stops working', async () => {
    vi.useFakeTimers();
    await verifyTeamsSsoToken(signToken(primary, v2Claims()), config);

    vi.setSystemTime(Date.now() + 25 * 60 * 60_000);
    publishedKeys = [rotated.jwk];
    await expect(verifyTeamsSsoToken(signToken(primary, v2Claims()), config)).rejects.toThrow(/signature/);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('shares one fetch between concurrent first requests', async () => {
    await Promise.all([1, 2, 3].map(() => verifyTeamsSsoToken(signToken(primary, v2Claims()), config)));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failed key fetch', async () => {
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) });
    await expect(verifyTeamsSsoToken(signToken(primary, v2Claims()), config)).rejects.toThrow(/keys unavailable/);
    await expect(verifyTeamsSsoToken(signToken(primary, v2Claims()), config)).resolves.toMatchObject({ oid: USER_OID });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('ignores published keys that are not RSA signing keys', async () => {
    publishedKeys = [{ ...primary.jwk, use: 'enc' }, { kty: 'EC', kid: 'key-primary', crv: 'P-256' }, { kty: 'RSA', kid: 'broken', n: '', e: '' }];
    await expect(verifyTeamsSsoToken(signToken(primary, v2Claims()), config)).rejects.toThrow(/signature/);
  });
});

describe('isTeamsSsoToken', () => {
  it('picks out tokens addressed to this app without fetching keys or verifying anything', () => {
    expect(isTeamsSsoToken(signToken(primary, v2Claims()), config)).toBe(true);
    expect(isTeamsSsoToken(signToken(primary, v1Claims()), config)).toBe(true);
    expect(isTeamsSsoToken(signToken(impostor, v2Claims({ tid: OTHER_TENANT })), config)).toBe(true);
    expect(isTeamsSsoToken(signToken(primary, v2Claims({ aud: 'https://graph.microsoft.com' })), config)).toBe(false);
    expect(isTeamsSsoToken('opaque-graph-token', config)).toBe(false);
    expect(isTeamsSsoToken('test_c3R1ZGVudEBleGFtcGxlLmNvbQ==', config)).toBe(false);
    expect(isTeamsSsoToken(signToken(primary, v2Claims()), null)).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('teamsSsoConfig', () => {
  it('reads the app registration from the environment', () => {
    vi.stubEnv('AZ_CLIENT_ID', ` ${CLIENT_ID.toUpperCase()} `);
    vi.stubEnv('AZ_TENANT_ID', TENANT_ID);
    vi.stubEnv('TEAMS_SSO_RESOURCE_HOSTS', 'nexus.neramclasses.com, Abc123.devtunnels.ms ,');
    expect(teamsSsoConfig()).toEqual({
      clientId: CLIENT_ID,
      tenantId: TENANT_ID,
      resourceHosts: ['nexus.neramclasses.com', 'abc123.devtunnels.ms'],
    });
  });

  it('defaults the resource host to production and is off without an app registration', () => {
    vi.stubEnv('AZ_CLIENT_ID', CLIENT_ID);
    vi.stubEnv('AZ_TENANT_ID', TENANT_ID);
    vi.stubEnv('TEAMS_SSO_RESOURCE_HOSTS', '');
    expect(teamsSsoConfig()?.resourceHosts).toEqual(['nexus.neramclasses.com']);

    vi.stubEnv('AZ_TENANT_ID', '');
    expect(teamsSsoConfig()).toBeNull();
  });
});
