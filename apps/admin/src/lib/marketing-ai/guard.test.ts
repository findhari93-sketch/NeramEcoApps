// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { effectiveTargets, missingLiveEnv, resolveSettings, readAdsEnv } from './config';
import { buildDigest } from './digest';
import { cronIdleReason, isAuthorizedCron, requireAdminRole } from './guard';

const req = (headers: Record<string, string>) => new Request('http://x/api/marketing-ai/overview', { headers });

describe('requireAdminRole', () => {
  it('lets an admin through', () => {
    expect(requireAdminRole(req({ 'x-neram-admin-id': 'a1', 'x-neram-admin-type': 'admin' }))).toEqual({ ok: true, adminId: 'a1' });
  });
  it('refuses a teacher, and anyone the middleware did not verify', async () => {
    const cases: Record<string, string>[] = [{ 'x-neram-admin-id': 't1', 'x-neram-admin-type': 'teacher' }, { 'x-neram-admin-type': 'admin' }, {}];
    for (const h of cases) {
      const r = requireAdminRole(req(h));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.response.status).toBe(403);
    }
  });
});

describe('isAuthorizedCron', () => {
  const saved = process.env.CRON_SECRET;
  afterEach(() => {
    process.env.CRON_SECRET = saved;
  });
  it('fails closed when CRON_SECRET is unset', () => {
    delete process.env.CRON_SECRET;
    expect(isAuthorizedCron(req({ authorization: 'Bearer undefined' }))).toBe(false);
  });
  it('accepts only the exact bearer secret', () => {
    process.env.CRON_SECRET = 's3';
    expect(isAuthorizedCron(req({ authorization: 'Bearer s3' }))).toBe(true);
    expect(isAuthorizedCron(req({ authorization: 'Bearer s4' }))).toBe(false);
  });
});

describe('cronIdleReason', () => {
  it('keeps production crons quiet until the real account is live', () => {
    expect(cronIdleReason({ VERCEL_ENV: 'production' })).toMatch(/not live/);
    expect(cronIdleReason({ VERCEL_ENV: 'production', GOOGLE_ADS_MODE: 'mock' })).toMatch(/not live/);
    expect(cronIdleReason({ VERCEL_ENV: 'production', GOOGLE_ADS_MODE: 'live' })).toBeNull();
  });
  it('never idles outside production', () => {
    expect(cronIdleReason({ VERCEL_ENV: 'preview' })).toBeNull();
    expect(cronIdleReason({})).toBeNull();
  });
});

describe('config', () => {
  it('defaults to mock mode and never allows mutations unless told to', () => {
    const env = readAdsEnv({});
    expect(env).toMatchObject({ mode: 'mock', allowMutations: false });
    expect(readAdsEnv({ MARKETING_AI_ALLOW_MUTATIONS: 'yes' }).allowMutations).toBe(false);
  });
  it('does not need a developer token any more (Google retired them on 2026-09-09)', () => {
    const env = readAdsEnv({ GOOGLE_ADS_MODE: 'live', GOOGLE_ADS_CLIENT_ID: 'a', GOOGLE_ADS_CLIENT_SECRET: 'b', GOOGLE_ADS_REFRESH_TOKEN: 'c', GOOGLE_ADS_CUSTOMER_ID: '1' });
    expect(missingLiveEnv(env)).toEqual([]);
  });
  it('switches targets with the season', () => {
    const s = resolveSettings({});
    expect(effectiveTargets(s, '2026-10-06')).toEqual({ target_cpa_inr: 650, monthly_spend_cap_inr: 7000, in_season: false });
    expect(effectiveTargets(s, '2027-03-01')).toEqual({ target_cpa_inr: 650, monthly_spend_cap_inr: 40000, in_season: true });
    expect(effectiveTargets(resolveSettings({ targets: { season: { months: [2, 13, 'x', 2] } } }), '2027-02-10').in_season).toBe(true);
  });
  it('cleans the account profile and keeps the defaults for junk', () => {
    const s = resolveSettings({
      profile: { competitors: ['  IArch ', 'iarch', 7, ''], protected_keywords: 'nata', landing_pages: { coaching: 'http://evil.example', resources: 'https://neramclasses.com/free-resources' }, target_area: '  ' },
      targets: { proxy_history_since: null },
      guardrails: { max_cpc_ceiling_inr: 5000 },
    });
    expect(s.profile.competitors).toEqual(['iarch']);
    expect(s.profile.protected_keywords).toEqual(['nata coaching']);
    expect(s.profile.landing_pages.coaching).toBe('https://neramclasses.com/nata-coaching/tamil-nadu');
    expect(s.profile.target_area).toBe('Tamil Nadu');
    expect(s.targets.proxy_history_since).toBeNull(); // an explicit null turns last season off
    expect(resolveSettings({}).targets.proxy_history_since).toBe('2026-01-01');
    expect(s.guardrails.max_cpc_ceiling_inr).toBe(200);
  });

  it('clamps settings to the hard limits and ignores junk', () => {
    const s = resolveSettings({ autonomy: { level: 9, categories: { add_negative: 'yolo' } }, guardrails: { max_budget_change_pct: 80, max_auto_actions_per_day: 1000, auto_min_confidence: 0.1 } });
    // Junk falls back to the defaults: level 2 with the safe categories automatic.
    expect(s.autonomy).toMatchObject({ level: 2, categories: { add_negative: 'auto', new_ad: 'approve' } });
    expect(s.guardrails).toMatchObject({ max_budget_change_pct: 30, max_auto_actions_per_day: 25, auto_min_confidence: 0.7 });
  });
});

describe('buildDigest', () => {
  it('sends nothing on a quiet night', () => {
    expect(buildDigest([], 'https://a')).toBeNull();
  });
  it('leads with urgent issues and escapes text', () => {
    const d = buildDigest(
      [
        { title: 'Conversions stopped <script>', priority: 'critical', status: 'pending_approval', decided_by: null },
        { title: 'Block "jobs"', priority: 'medium', status: 'executed', decided_by: 'autopilot' },
      ],
      'https://admin.example',
    )!;
    expect(d.subject).toBe('Google Ads: 1 urgent issue');
    expect(d.html).toContain('&lt;script&gt;');
    expect(d.html).toContain('Changed automatically');
    expect(d.html).not.toMatch(/—/);
  });
});
