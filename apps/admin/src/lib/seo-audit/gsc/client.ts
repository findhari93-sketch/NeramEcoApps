/**
 * The Search Console calls the audit makes: Search Analytics (clicks,
 * impressions, position), URL Inspection (is this URL indexed, and why not),
 * and the sitemap list. Everything reads with webmasters.readonly except
 * submitSitemap, the one write, which asks Google to download a sitemap again.
 */
import type { SeoAuditEnv, ServiceAccount } from '../config';
import { GSC_WRITE_SCOPE, getGscAccessToken } from './auth';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const API = 'https://searchconsole.googleapis.com';
export const SEARCH_ROW_LIMIT = 25_000;

export class GscApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'GscApiError';
    this.status = status;
  }
}

export interface SearchAnalyticsRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SearchAnalyticsRequest {
  startDate: string;
  endDate: string;
  dimensions: Array<'date' | 'page' | 'query' | 'device' | 'country'>;
}

/** The index status part of a URL Inspection result, as Google returns it. */
export interface IndexStatusResult {
  verdict?: string;
  coverageState?: string;
  robotsTxtState?: string;
  indexingState?: string;
  lastCrawlTime?: string;
  pageFetchState?: string;
  googleCanonical?: string;
  userCanonical?: string;
}

/** A sitemap as Search Console knows it. */
export interface GscSitemap {
  path: string;
  lastSubmitted?: string;
  lastDownloaded?: string;
  isPending?: boolean;
  errors?: string;
  warnings?: string;
}

export interface GscClient {
  searchAnalytics(req: SearchAnalyticsRequest): Promise<SearchAnalyticsRow[]>;
  inspectUrl(url: string): Promise<IndexStatusResult>;
  listSitemaps(): Promise<GscSitemap[]>;
  /** Tells Google to download the sitemap again. The one write the audit makes. */
  submitSitemap(url: string): Promise<void>;
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as any;
    return body?.error?.message || body?.error?.status || '';
  } catch {
    return '';
  }
}

export function createGscClient(env: Pick<SeoAuditEnv, 'siteUrl'> & { serviceAccount: ServiceAccount }, fetchImpl: FetchLike = fetch): GscClient {
  const call = async (path: string, body?: unknown, opts: { method?: string; write?: boolean } = {}) => {
    const token = await getGscAccessToken(env.serviceAccount, fetchImpl, opts.write ? GSC_WRITE_SCOPE : undefined);
    const res = await fetchImpl(`${API}${path}`, {
      method: opts.method ?? 'POST',
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) {
      const reason = await readError(res);
      // 403 almost always means the service account was not added as a user on the property.
      throw new GscApiError(`Search Console ${res.status}${reason ? `: ${reason}` : ''}`, res.status);
    }
    // sitemaps.submit answers 204 with no body.
    const text = await res.text();
    return (text ? JSON.parse(text) : {}) as any;
  };
  const site = `/webmasters/v3/sites/${encodeURIComponent(env.siteUrl)}`;

  return {
    async searchAnalytics(req) {
      const rows: SearchAnalyticsRow[] = [];
      for (let startRow = 0; ; startRow += SEARCH_ROW_LIMIT) {
        const body = await call(`${site}/searchAnalytics/query`, {
          startDate: req.startDate,
          endDate: req.endDate,
          dimensions: req.dimensions,
          type: 'web',
          dataState: 'final',
          rowLimit: SEARCH_ROW_LIMIT,
          startRow,
        });
        const page: SearchAnalyticsRow[] = body?.rows ?? [];
        rows.push(...page);
        if (page.length < SEARCH_ROW_LIMIT) break;
      }
      return rows;
    },

    async inspectUrl(url) {
      const body = await call('/v1/urlInspection/index:inspect', { inspectionUrl: url, siteUrl: env.siteUrl, languageCode: 'en-US' });
      return (body?.inspectionResult?.indexStatusResult ?? {}) as IndexStatusResult;
    },

    async listSitemaps() {
      const body = await call(`${site}/sitemaps`, undefined, { method: 'GET' });
      return (body?.sitemap ?? []) as GscSitemap[];
    },

    async submitSitemap(url) {
      await call(`${site}/sitemaps/${encodeURIComponent(url)}`, undefined, { method: 'PUT', write: true });
    },
  };
}
