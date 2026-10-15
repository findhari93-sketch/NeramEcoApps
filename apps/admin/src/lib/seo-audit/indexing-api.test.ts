import { generateKeyPairSync } from 'crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { readSeoEnv } from './config';
import { clearGscTokenCache } from './gsc/auth';
import { INDEXING_SCOPE, IndexingApiError, indexingErrorHint, publishUrlUpdated, sendIndexingRequests } from './indexing-api';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const sa = { client_email: 'seo-audit@neramclasses-ab480.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() };
const FAR = Date.now() + 60_000;

afterEach(() => clearGscTokenCache());

describe('sendIndexingRequests', () => {
  it('sends every URL in order when Google accepts them', async () => {
    const seen: string[] = [];
    const r = await sendIndexingRequests(['a', 'b', 'c'], async (u) => void seen.push(u), FAR);
    expect(seen).toEqual(['a', 'b', 'c']);
    expect(r).toEqual({ sent: ['a', 'b', 'c'], errors: [], stopped: null });
  });

  it('stops at the first 403 or 429, since the rest would fail the same way', async () => {
    const perm = await sendIndexingRequests(['a', 'b', 'c'], async (u) => {
      if (u === 'b') throw new IndexingApiError('Indexing API 403: Permission denied. Failed to verify the URL ownership.', 403);
    }, FAR);
    expect(perm.sent).toEqual(['a']);
    expect(perm.stopped).toBe('permission');
    const quota = await sendIndexingRequests(['a', 'b'], async () => {
      throw new IndexingApiError('Indexing API 429: Quota exceeded', 429);
    }, FAR);
    expect(quota).toMatchObject({ sent: [], stopped: 'quota' });
    expect(quota.errors).toHaveLength(1);
  });

  it('keeps going past a one-off error, and stops at the deadline', async () => {
    const r = await sendIndexingRequests(['a', 'b'], async (u) => {
      if (u === 'a') throw new IndexingApiError('Indexing API 500', 500);
    }, FAR);
    expect(r).toMatchObject({ sent: ['b'], stopped: null });
    expect(r.errors[0]).toMatchObject({ url: 'a', status: 500 });
    expect(await sendIndexingRequests(['a'], async () => undefined, Date.now() - 1)).toEqual({ sent: [], errors: [], stopped: 'deadline' });
  });
});

describe('indexingErrorHint', () => {
  it('says which setup step is missing', () => {
    expect(indexingErrorHint(403, 'Web Search Indexing API has not been used in project 123 before or it is disabled')).toMatch(/Enable "Web Search Indexing API"/);
    expect(indexingErrorHint(403, 'Permission denied. Failed to verify the URL ownership.')).toMatch(/Owner of the property/);
    expect(indexingErrorHint(429, 'Quota exceeded')).toMatch(/quota/);
    expect(indexingErrorHint(500, 'Backend error')).toBe('');
  });
});

describe('publishUrlUpdated', () => {
  it('signs in with the indexing scope and posts URL_UPDATED', async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const fetchImpl = async (url: string, init?: RequestInit) => {
      calls.push({ url, body: String(init?.body ?? '') });
      if (url.includes('oauth2')) return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 });
      return new Response('{}', { status: 200 });
    };
    await publishUrlUpdated(sa, 'https://neramclasses.com/coaching/nata-coaching-in-assam', fetchImpl);
    const assertion = new URLSearchParams(calls[0].body).get('assertion') ?? '';
    expect(JSON.parse(Buffer.from(assertion.split('.')[1], 'base64url').toString()).scope).toBe(INDEXING_SCOPE);
    expect(calls[1].url).toBe('https://indexing.googleapis.com/v3/urlNotifications:publish');
    expect(JSON.parse(calls[1].body)).toEqual({ url: 'https://neramclasses.com/coaching/nata-coaching-in-assam', type: 'URL_UPDATED' });
  });

  it("turns Google's error into an IndexingApiError with the status", async () => {
    const fetchImpl = async (url: string) =>
      url.includes('oauth2')
        ? new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 })
        : new Response(JSON.stringify({ error: { message: 'Permission denied. Failed to verify the URL ownership.' } }), { status: 403 });
    await expect(publishUrlUpdated(sa, 'https://neramclasses.com/x', fetchImpl)).rejects.toMatchObject({ status: 403, message: expect.stringContaining('verify the URL ownership') });
  });
});

describe('SEO_INDEXING_API switch', () => {
  it('is off unless set to on, and caps the daily count at 200', () => {
    expect(readSeoEnv({}).env.indexingApi).toBe(false);
    expect(readSeoEnv({ SEO_INDEXING_API: 'off' }).env.indexingApi).toBe(false);
    expect(readSeoEnv({ SEO_INDEXING_API: 'On' }).env.indexingApi).toBe(true);
    expect(readSeoEnv({}).env.indexingDaily).toBe(50);
    expect(readSeoEnv({ SEO_INDEXING_DAILY: '500' }).env.indexingDaily).toBe(200);
  });
});
