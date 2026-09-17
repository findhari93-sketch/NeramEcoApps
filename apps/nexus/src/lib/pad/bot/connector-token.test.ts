// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { ConnectorTokenError, __resetConnectorToken, connectorToken, type ConnectorCredentials } from './connector-token';

const CREDENTIALS: ConnectorCredentials = { appId: 'bot-app-id', secret: 's3cret value', tenant: 'tenant-1' };

let fetchSpy: Mock;

const tokenResponse = (token: string, expiresIn: unknown = 3600) =>
  new Response(JSON.stringify({ token_type: 'Bearer', expires_in: expiresIn, access_token: token }), { status: 200 });

beforeEach(() => {
  __resetConnectorToken();
  fetchSpy = vi.fn(async () => tokenResponse('token-1'));
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('connectorToken', () => {
  it("asks the bot's own tenant for a connector-scoped token with client credentials", async () => {
    await expect(connectorToken(CREDENTIALS)).resolves.toBe('token-1');

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://login.microsoftonline.com/tenant-1/oauth2/v2.0/token');
    expect(init.method).toBe('POST');
    expect(Object.fromEntries(new URLSearchParams(String(init.body)))).toEqual({
      grant_type: 'client_credentials',
      client_id: 'bot-app-id',
      client_secret: 's3cret value',
      scope: 'https://api.botframework.com/.default',
    });
  });

  it('reuses the token, and shares one request between callers', async () => {
    const [a, b] = await Promise.all([connectorToken(CREDENTIALS), connectorToken(CREDENTIALS)]);
    expect([a, b, await connectorToken(CREDENTIALS)]).toEqual(['token-1', 'token-1', 'token-1']);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('asks again five minutes before the token expires', async () => {
    await connectorToken(CREDENTIALS);
    fetchSpy.mockResolvedValueOnce(tokenResponse('token-2'));

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 54 * 60 * 1000);
    expect(await connectorToken(CREDENTIALS)).toBe('token-1');
    vi.setSystemTime(Date.now() + 2 * 60 * 1000);
    expect(await connectorToken(CREDENTIALS)).toBe('token-2');
  });

  it('never caches a refusal, and never puts the secret in the error', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{"error":"invalid_client"}', { status: 401 }));
    const failure = await connectorToken(CREDENTIALS).catch((err) => err);
    expect(failure).toBeInstanceOf(ConnectorTokenError);
    expect(failure.message).toBe('Connector token refused: 401');
    expect(failure.message).not.toContain('s3cret');

    await expect(connectorToken(CREDENTIALS)).resolves.toBe('token-1');
  });

  it('refuses without credentials, and when the answer carries no token', async () => {
    await expect(connectorToken(null)).rejects.toThrow('Bot credentials are not configured');
    fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    await expect(connectorToken(CREDENTIALS)).rejects.toThrow('Connector token missing');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
