/**
 * Real lastmod dates for college URLs in the sitemap. The IndexNow cron only
 * resubmits URLs whose lastmod is recent, so a hardcoded date meant a college
 * was never resubmitted after its data, photo or FAQs changed.
 */

/** Used only when a row has no usable timestamp at all. */
export const COLLEGE_LASTMOD_FALLBACK = new Date('2026-04-12T00:00:00.000Z');

export interface LastmodFields {
  updated_at?: string | null;
  last_data_update?: string | null;
  faqs_generated_at?: string | null;
}

/** Newest of updated_at, last_data_update and faqs_generated_at. */
export function collegeLastModified(row: LastmodFields, fallback: Date = COLLEGE_LASTMOD_FALLBACK): Date {
  let best: number | null = null;
  for (const v of [row.updated_at, row.last_data_update, row.faqs_generated_at]) {
    if (!v) continue;
    const t = Date.parse(v);
    if (!Number.isNaN(t) && (best === null || t > best)) best = t;
  }
  return best === null ? fallback : new Date(best);
}

/** Per state slug, the newest lastmod of its colleges. */
export function stateLastModified<T extends LastmodFields & { state_slug: string | null }>(
  rows: T[],
  fallback: Date = COLLEGE_LASTMOD_FALLBACK,
): Map<string, Date> {
  const out = new Map<string, Date>();
  for (const r of rows) {
    if (!r.state_slug) continue;
    const d = collegeLastModified(r, fallback);
    const prev = out.get(r.state_slug);
    if (!prev || d > prev) out.set(r.state_slug, d);
  }
  return out;
}
