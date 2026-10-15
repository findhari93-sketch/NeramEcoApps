/**
 * SEO Health settings, all from env on the admin Vercel project.
 *
 *   GSC_SERVICE_ACCOUNT_KEY  the service account's JSON key, base64 encoded (or raw JSON)
 *   GSC_SITE_URL             Search Console property, default sc-domain:neramclasses.com
 *                            (a Domain property covers app.neramclasses.com too)
 *   SEO_AUDIT_ORIGINS        sites whose sitemaps we audit, comma separated
 *   SEO_DIGEST_TO            weekly email recipients, comma separated; unset sends nothing
 *   GSC_ACCOUNT_EMAIL        optional: the Google account that can use Search Console. Added to
 *                            the "Open in Search Console" links as authuser, so a browser signed
 *                            in to several Google accounts opens the right one
 *   SEO_INDEXING_API         'on' sends the ask-Google pages to Google's Indexing API each
 *                            morning (indexing-api.ts). Anything else, or unset, is off
 *   SEO_INDEXING_DAILY       how many a day, default 50 (Google's quota is 200)
 *
 * Setup steps: docs/seo-audit/README.md.
 */

export interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export interface SeoAuditEnv {
  serviceAccount: ServiceAccount | null;
  siteUrl: string;
  origins: string[];
  digestTo: string[];
  accountEmail: string | null;
  indexingApi: boolean;
  indexingDaily: number;
}

export const DEFAULT_SITE_URL = 'sc-domain:neramclasses.com';
export const DEFAULT_ORIGINS = ['https://neramclasses.com', 'https://app.neramclasses.com'];

/** URL Inspection allows 2,000 a day per property; keep headroom for people using the UI. */
export const INSPECT_DAILY_BUDGET = 400;
export const INSPECT_HARD_DAILY_CAP = 1800;

const list = (v: string | undefined) =>
  (v || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

/** Accepts the key as base64 or as raw JSON; returns null when it is unset or unreadable. */
export function parseServiceAccount(raw: string | undefined): ServiceAccount | null {
  if (!raw || !raw.trim()) return null;
  const text = raw.trim().startsWith('{') ? raw.trim() : Buffer.from(raw.trim(), 'base64').toString('utf8');
  try {
    const json = JSON.parse(text);
    if (typeof json?.client_email !== 'string' || typeof json?.private_key !== 'string') return null;
    return { client_email: json.client_email, private_key: json.private_key, token_uri: json.token_uri };
  } catch {
    return null;
  }
}

export function readSeoEnv(env: Record<string, string | undefined> = process.env): { env: SeoAuditEnv; missing: string[] } {
  const serviceAccount = parseServiceAccount(env.GSC_SERVICE_ACCOUNT_KEY);
  const origins = list(env.SEO_AUDIT_ORIGINS).map((o) => o.replace(/\/+$/, ''));
  const missing: string[] = [];
  if (!serviceAccount) missing.push(env.GSC_SERVICE_ACCOUNT_KEY ? 'GSC_SERVICE_ACCOUNT_KEY (unreadable)' : 'GSC_SERVICE_ACCOUNT_KEY');
  return {
    env: {
      serviceAccount,
      siteUrl: env.GSC_SITE_URL?.trim() || DEFAULT_SITE_URL,
      origins: origins.length ? origins : DEFAULT_ORIGINS,
      digestTo: list(env.SEO_DIGEST_TO),
      accountEmail: env.GSC_ACCOUNT_EMAIL?.trim() || null,
      indexingApi: ['on', 'true', '1'].includes((env.SEO_INDEXING_API || '').trim().toLowerCase()),
      indexingDaily: Math.min(200, Math.max(1, Number(env.SEO_INDEXING_DAILY) || 50)),
    },
    missing,
  };
}
