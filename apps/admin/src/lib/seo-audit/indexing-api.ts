/**
 * "Ask Google" done automatically: sends today's ask-Google pages to Google's
 * Indexing API (urlNotifications:publish, URL_UPDATED), then marks them asked
 * like the Mark asked button does.
 *
 * Google documents this API for job-posting and livestream pages only. The
 * owner chose to use it for our pages anyway (2026-10-15), knowing Google may
 * ignore the requests or withdraw API access. It is off unless
 * SEO_INDEXING_API=on, so one env change stops it.
 *
 * Setup: enable "Web Search Indexing API" in Google Cloud project
 * neramclasses-ab480, and make the service account an Owner of the Search
 * Console property (Request indexing needs ownership). Default quota: 200 a day.
 */
import type { ServiceAccount } from './config';
import { getGscAccessToken } from './gsc/auth';
import { pickAskGoogle } from './rules';
import { db, latestSearchDate, loadUrlStatus, pageWindow, shiftDate } from './store';

export const INDEXING_SCOPE = 'https://www.googleapis.com/auth/indexing';
const PUBLISH_URL = 'https://indexing.googleapis.com/v3/urlNotifications:publish';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class IndexingApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'IndexingApiError';
    this.status = status;
  }
}

/** What to do about a failed request, in plain words, for the Runs tab and the toast. */
export function indexingErrorHint(status: number, message: string): string {
  const m = message.toLowerCase();
  if (status === 403 && (m.includes('has not been used') || m.includes('disabled'))) return 'Enable "Web Search Indexing API" in Google Cloud project neramclasses-ab480.';
  if (status === 403) return 'Make the service account an Owner of the property in Search Console > Settings > Users and permissions.';
  if (status === 429) return "Google's daily Indexing API quota is used up; the rest go tomorrow.";
  return '';
}

/** Tells Google one URL changed and should be crawled. */
export async function publishUrlUpdated(sa: ServiceAccount, url: string, fetchImpl: FetchLike = fetch): Promise<void> {
  const token = await getGscAccessToken(sa, fetchImpl, INDEXING_SCOPE);
  const res = await fetchImpl(PUBLISH_URL, {
    method: 'POST',
    cache: 'no-store',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, type: 'URL_UPDATED' }),
  });
  if (!res.ok) {
    let reason = '';
    try {
      reason = ((await res.json()) as any)?.error?.message || '';
    } catch {
      /* ignore */
    }
    throw new IndexingApiError(`Indexing API ${res.status}${reason ? `: ${reason}` : ''}`, res.status);
  }
}

/**
 * Sends URLs one at a time, stopping on the first 403 or 429 (every later one
 * would fail the same way) or at the deadline. Pure apart from `publish`.
 */
export async function sendIndexingRequests(urls: string[], publish: (url: string) => Promise<void>, deadline: number) {
  const sent: string[] = [];
  const errors: Array<{ url: string; error: string; status: number }> = [];
  let stopped: string | null = null;
  for (const url of urls) {
    if (Date.now() > deadline) {
      stopped = 'deadline';
      break;
    }
    try {
      await publish(url);
      sent.push(url);
    } catch (e) {
      const status = e instanceof IndexingApiError ? e.status : 0;
      errors.push({ url, error: e instanceof Error ? e.message.slice(0, 300) : 'failed', status });
      if (status === 403 || status === 429) {
        stopped = status === 429 ? 'quota' : 'permission';
        break;
      }
    }
  }
  return { sent, errors, stopped };
}

export async function runIndexingRequests(opts: { serviceAccount: ServiceAccount; limit: number; deadline: number; client?: any; now?: Date; fetchImpl?: FetchLike }) {
  const client = opts.client ?? db();
  const now = opts.now ?? new Date();
  const urls = await loadUrlStatus(client);
  const end = await latestSearchDate(client);
  const pages28 = end ? await pageWindow(client, shiftDate(end, -27), end) : [];
  const todo = pickAskGoogle(urls, pages28, now, opts.limit).map((r) => r.url);

  const { sent, errors, stopped } = await sendIndexingRequests(todo, (u) => publishUrlUpdated(opts.serviceAccount, u, opts.fetchImpl), opts.deadline);

  // Same as Mark asked: off the list for 14 days, re-inspected first next time.
  if (sent.length) {
    const { error } = await client.from('seo_url_status').update({ index_requested_at: now.toISOString(), priority_inspect: true }).in('url', sent);
    if (error) throw new Error(error.message);
  }
  const first = errors[0];
  return {
    requested: sent.length,
    errors: errors.length,
    queued: todo.length,
    // Not sent because of a stop (quota, permission, deadline): makes the run "partial".
    remaining: todo.length - sent.length - errors.length,
    stopped,
    firstError: first ? first.error : null,
    hint: first ? indexingErrorHint(first.status, first.error) : null,
  };
}
