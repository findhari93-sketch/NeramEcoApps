// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readAdsEnv } from '../config';
import { clearAdsTokenCache, createLiveAdsClient, describeAdsError, GoogleAdsApiError } from './client';
import { buildQuery } from './gaql';
import { mergeDuplicates, normalizeRow } from './normalize';

const env = readAdsEnv({
  GOOGLE_ADS_MODE: 'live',
  GOOGLE_ADS_DEVELOPER_TOKEN: 'dev-token-secret',
  GOOGLE_ADS_CLIENT_ID: 'cid',
  GOOGLE_ADS_CLIENT_SECRET: 'csecret',
  GOOGLE_ADS_REFRESH_TOKEN: 'refresh-secret',
  GOOGLE_ADS_CUSTOMER_ID: '123-456-7890',
  GOOGLE_ADS_LOGIN_CUSTOMER_ID: '111-222-3333',
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function fakeFetch(apiReply: (url: string, init: RequestInit) => Response) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith('https://oauth2.googleapis.com/token')) return json({ access_token: 'access-1', expires_in: 3600 });
    return apiReply(url, init!);
  });
}

beforeEach(() => clearAdsTokenCache());

describe('live client', () => {
  it('strips dashes from ids and sends the developer token and manager id', async () => {
    const f = fakeFetch(() => json([{ results: [{ a: 1 }] }, { results: [{ a: 2 }] }]));
    const rows = await createLiveAdsClient(env, f).search('SELECT campaign.id FROM campaign');
    expect(rows).toEqual([{ a: 1 }, { a: 2 }]);
    const [url, init] = f.mock.calls[1];
    expect(url).toBe('https://googleads.googleapis.com/v25/customers/1234567890/googleAds:searchStream');
    expect(init!.headers).toMatchObject({ Authorization: 'Bearer access-1', 'developer-token': 'dev-token-secret', 'login-customer-id': '1112223333' });
  });

  it('refreshes the access token once and reuses it', async () => {
    const f = fakeFetch(() => json([]));
    const c = createLiveAdsClient(env, f);
    await c.search('q');
    await c.search('q');
    expect(f.mock.calls.filter(([u]) => String(u).includes('oauth2')).length).toBe(1);
  });

  it("surfaces Google's error codes without echoing credentials", async () => {
    const body = { error: { code: 400, message: 'Request contains an invalid argument.', details: [{ errors: [{ errorCode: { queryError: 'BAD_FIELD_NAME' }, message: 'Unrecognized field' }] }] } };
    const f = fakeFetch(() => json(body, 400));
    const err = await createLiveAdsClient(env, f).search('q').catch((e) => e);
    expect(err).toBeInstanceOf(GoogleAdsApiError);
    expect(err.codes).toEqual(['queryError.BAD_FIELD_NAME']);
    expect(err.message).not.toMatch(/secret|access-1/);
  });

  it('reports a revoked refresh token clearly', async () => {
    const f = vi.fn(async () => json({ error: 'invalid_grant' }, 400));
    await expect(createLiveAdsClient(env, f as any).search('q')).rejects.toThrow(/invalid_grant/);
  });

  it('always passes validateOnly through on writes', async () => {
    const f = fakeFetch((_u, init) => json({ results: [{ resourceName: 'x' }], echo: JSON.parse(String(init.body)) }));
    await createLiveAdsClient(env, f).mutate('campaignCriteria', [{ create: {} }], { validateOnly: true });
    expect(JSON.parse(String(f.mock.calls[1][1]!.body))).toMatchObject({ validateOnly: true, partialFailure: false });
  });

  it('describeAdsError copes with an empty body', () => {
    expect(describeAdsError(null)).toEqual({ message: 'Google Ads API error', codes: [] });
  });
});

describe('gaql and normalize', () => {
  it('refuses malformed dates', () => {
    expect(() => buildQuery('campaign', "2026-10-01' OR '1'='1", '2026-10-02')).toThrow();
  });

  it('parses REST rows, int64 strings included', () => {
    const row = normalizeRow('keyword', '1', {
      campaign: { id: '111', name: 'C' },
      adGroup: { id: '1001', name: 'AG' },
      adGroupCriterion: { criterionId: '9', status: 'ENABLED', keyword: { text: 'nata', matchType: 'PHRASE' } },
      segments: { date: '2026-10-01' },
      metrics: { impressions: '100', clicks: '7', costMicros: '350000000', conversions: 1.5, conversionsValue: 0 },
    });
    expect(row).toMatchObject({ entity_key: '1001~9', clicks: 7, cost_micros: 350_000_000, conversions: 1.5, match_type: 'PHRASE' });
  });

  it('records why a campaign is limited', () => {
    const row = normalizeRow('campaign', '1', { campaign: { id: '1', status: 'ENABLED', primaryStatus: 'LIMITED', primaryStatusReasons: ['BUDGET_CONSTRAINED'] }, campaignBudget: { amountMicros: '3600000000' }, segments: { date: '2026-10-01' }, metrics: {} });
    expect(row).toMatchObject({ primary_status: 'LIMITED|BUDGET_CONSTRAINED', budget_micros: 3_600_000_000 });
  });

  it('merges a search term reported twice on one day', () => {
    const base = { campaign: { id: '1' }, adGroup: { id: '2' }, searchTermView: { searchTerm: 'Nata Jobs' }, segments: { date: '2026-10-01' } };
    const rows = [
      normalizeRow('search_term', '1', { ...base, metrics: { clicks: '2', costMicros: '100' } })!,
      normalizeRow('search_term', '1', { ...base, searchTermView: { searchTerm: 'nata jobs' }, metrics: { clicks: '3', costMicros: '50' } })!,
    ];
    expect(mergeDuplicates(rows)).toEqual([expect.objectContaining({ entity_key: '2~nata jobs', clicks: 5, cost_micros: 150 })]);
  });
});
