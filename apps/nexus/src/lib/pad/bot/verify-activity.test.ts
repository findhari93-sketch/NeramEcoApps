// @vitest-environment node
import { generateKeyPairSync, sign, type KeyObject } from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  BOT_CONNECTOR_ISSUER,
  BOT_CONNECTOR_KEYS_URL,
  BotAuthError,
  __resetBotConnectorKeys,
  verifyBotRequest,
} from './verify-activity';

/**
 * Every rule Microsoft lists for requests from the Bot Connector, each with a
 * token built to break exactly that rule. Keys are generated here; nothing
 * leaves the machine.
 */

const APP_ID = '5b3d9a7e-1c2f-4d6a-9e8b-0a1b2c3d4e5f';
const SERVICE_URL = 'https://smba.trafficmanager.net/in/';

const connector = generateKeyPairSync('rsa', { modulusLength: 2048 });
const stranger = generateKeyPairSync('rsa', { modulusLength: 2048 });

function publishedKey(publicKey: KeyObject, kid: string, endorsements: string[] = ['msteams', 'webchat']) {
  return { ...publicKey.export({ format: 'jwk' }), kid, use: 'sig', endorsements };
}

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

function token(claims: Record<string, unknown> = {}, options: { kid?: string; alg?: string; key?: KeyObject } = {}): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { typ: 'JWT', alg: options.alg ?? 'RS256', kid: options.kid ?? 'connector-1' };
  const payload = { iss: BOT_CONNECTOR_ISSUER, aud: APP_ID, serviceurl: SERVICE_URL, nbf: now - 60, exp: now + 3600, ...claims };
  const input = `${encode(header)}.${encode(payload)}`;
  return `${input}.${sign('RSA-SHA256', Buffer.from(input), options.key ?? connector.privateKey).toString('base64url')}`;
}

const activity = (overrides: Record<string, unknown> = {}) => ({ type: 'event', channelId: 'msteams', serviceUrl: SERVICE_URL, ...overrides });

async function refusal(promise: Promise<unknown>): Promise<BotAuthError> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(BotAuthError);
    return err as BotAuthError;
  }
  throw new Error('expected the request to be refused');
}

let keys: unknown[];
let fetchSpy: Mock;

beforeEach(() => {
  __resetBotConnectorKeys();
  keys = [publishedKey(connector.publicKey, 'connector-1')];
  fetchSpy = vi.fn(async () => new Response(JSON.stringify({ keys }), { status: 200 }));
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('verifyBotRequest', () => {
  it('accepts a connector token for this bot and this activity', async () => {
    await expect(verifyBotRequest(`Bearer ${token()}`, activity(), APP_ID)).resolves.toEqual({
      appId: APP_ID,
      serviceUrl: SERVICE_URL,
      channelId: 'msteams',
    });
    expect(fetchSpy).toHaveBeenCalledWith(BOT_CONNECTOR_KEYS_URL);
  });

  it('requires a Bearer token', async () => {
    for (const header of [null, '', token(), `Basic ${token()}`, `Bearer ${token()} extra`]) {
      const err = await refusal(verifyBotRequest(header, activity(), APP_ID));
      expect([err.status, err.message]).toEqual([401, 'Missing bearer token']);
    }
  });

  it('refuses anything but RS256, and does so before fetching keys', async () => {
    const payload = token().split('.')[1];
    const unsigned = `${encode({ alg: 'none', kid: 'connector-1' })}.${payload}.`;
    expect((await refusal(verifyBotRequest(`Bearer ${unsigned}`, activity(), APP_ID))).message).toBe('Malformed token');
    expect((await refusal(verifyBotRequest(`Bearer ${token({}, { alg: 'HS256' })}`, activity(), APP_ID))).message).toBe(
      'Unsupported token algorithm',
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refuses a token signed by any other key', async () => {
    const err = await refusal(verifyBotRequest(`Bearer ${token({}, { key: stranger.privateKey })}`, activity(), APP_ID));
    expect([err.status, err.message]).toEqual([401, 'Token signature invalid']);
  });

  it('refuses a token from any other issuer, even a Microsoft one', async () => {
    const err = await refusal(
      verifyBotRequest(`Bearer ${token({ iss: 'https://sts.windows.net/d6d49420-f39b-4df7-a1dc-d59a935871db/' })}`, activity(), APP_ID),
    );
    expect(err.message).toBe('Token issuer mismatch');
  });

  it('refuses a token issued for another bot', async () => {
    const err = await refusal(verifyBotRequest(`Bearer ${token({ aud: '11111111-2222-4333-8444-555555555555' })}`, activity(), APP_ID));
    expect(err.message).toBe('Token audience mismatch');
  });

  it('allows five minutes of clock skew and no more', async () => {
    const now = Math.floor(Date.now() / 1000);
    await expect(verifyBotRequest(`Bearer ${token({ exp: now - 240 })}`, activity(), APP_ID)).resolves.toBeTruthy();
    expect((await refusal(verifyBotRequest(`Bearer ${token({ exp: now - 360 })}`, activity(), APP_ID))).message).toBe('Token expired');
    expect((await refusal(verifyBotRequest(`Bearer ${token({ exp: undefined })}`, activity(), APP_ID))).message).toBe('Token expired');
    expect((await refusal(verifyBotRequest(`Bearer ${token({ nbf: now + 360 })}`, activity(), APP_ID))).message).toBe('Token not yet valid');
  });

  it('refuses a genuine token attached to an activity with another service URL', async () => {
    const replayed = await refusal(verifyBotRequest(`Bearer ${token()}`, activity({ serviceUrl: 'https://attacker.example/' }), APP_ID));
    expect([replayed.status, replayed.message]).toEqual([401, 'Service URL mismatch']);
    const unclaimed = await refusal(verifyBotRequest(`Bearer ${token({ serviceurl: undefined })}`, activity(), APP_ID));
    expect(unclaimed.message).toBe('Service URL mismatch');
  });

  it('answers 403 when the key is not endorsed for Teams, or the activity comes from another channel', async () => {
    const otherChannel = await refusal(verifyBotRequest(`Bearer ${token()}`, activity({ channelId: 'webchat' }), APP_ID));
    expect([otherChannel.status, otherChannel.message]).toEqual([403, 'Channel not endorsed']);

    __resetBotConnectorKeys();
    keys = [publishedKey(connector.publicKey, 'connector-1', ['webchat'])];
    const unendorsed = await refusal(verifyBotRequest(`Bearer ${token()}`, activity(), APP_ID));
    expect(unendorsed.status).toBe(403);
  });

  it('refetches keys for an unknown key id, but at most once every five minutes', async () => {
    await verifyBotRequest(`Bearer ${token()}`, activity(), APP_ID);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Microsoft starts signing with a new key.
    keys = [publishedKey(connector.publicKey, 'connector-1'), publishedKey(stranger.publicKey, 'connector-2')];
    const rotated = () => `Bearer ${token({}, { kid: 'connector-2', key: stranger.privateKey })}`;
    expect((await refusal(verifyBotRequest(rotated(), activity(), APP_ID))).message).toBe('Token signature invalid');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 6 * 60 * 1000);
    await expect(verifyBotRequest(rotated(), activity(), APP_ID)).resolves.toBeTruthy();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('does not remember a failed key fetch', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('unavailable', { status: 503 }));
    expect((await refusal(verifyBotRequest(`Bearer ${token()}`, activity(), APP_ID))).message).toBe('Connector keys unavailable: 503');
    await expect(verifyBotRequest(`Bearer ${token()}`, activity(), APP_ID)).resolves.toBeTruthy();
  });

  it('refuses everything while the bot has no app id', async () => {
    expect((await refusal(verifyBotRequest(`Bearer ${token()}`, activity(), null))).message).toBe('Bot is not configured');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
