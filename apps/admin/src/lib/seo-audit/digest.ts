/**
 * The Monday email: what is new, what got fixed, how search traffic moved and
 * where the easy wins are. Sent to SEO_DIGEST_TO; unset sends nothing (the
 * SEO Health page shows the same).
 */
import { sendEmail } from '@neram/database';
import { db, shiftDate, latestSearchDate, lastFinalDate, selectAll } from './store';

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export interface DigestData {
  newUrgent: Array<{ title: string; url: string | null; severity: string }>;
  fixed: number;
  clicks: { last7: number; prev7: number };
  impressions: { last7: number; prev7: number };
  striking: Array<{ url: string | null; impressions: number }>;
  indexed: { indexed: number; inspected: number; expected: number };
}

const change = (now: number, prev: number) => (prev > 0 ? `${now >= prev ? '+' : ''}${Math.round(((now - prev) / prev) * 100)}%` : 'new');
const short = (u: string | null) => (u ? u.replace(/^https?:\/\//, '') : 'site-wide');

/** Pure: subject and HTML. */
export function buildSeoDigest(d: DigestData, baseUrl: string): { subject: string; html: string } {
  const parts = [`<p>Here is this week's SEO Health report for neramclasses.com.</p>`];
  parts.push(
    `<h3>Search traffic, last 7 days</h3><p>${d.clicks.last7.toLocaleString('en-IN')} clicks (${change(d.clicks.last7, d.clicks.prev7)} on the week before), ${d.impressions.last7.toLocaleString('en-IN')} impressions (${change(d.impressions.last7, d.impressions.prev7)}).</p>`,
  );
  parts.push(`<h3>Index coverage</h3><p>${d.indexed.indexed} of ${d.indexed.inspected} inspected sitemap pages are indexed (${d.indexed.expected} pages in our sitemaps).</p>`);
  if (d.newUrgent.length) {
    parts.push(`<h3>New issues to fix</h3><ul>${d.newUrgent.slice(0, 15).map((f) => `<li><strong>${esc(f.severity)}</strong>: ${esc(f.title)} (${esc(short(f.url))})</li>`).join('')}</ul>${d.newUrgent.length > 15 ? `<p>And ${d.newUrgent.length - 15} more.</p>` : ''}`);
  } else {
    parts.push(`<h3>New issues to fix</h3><p>None this week.</p>`);
  }
  if (d.fixed) parts.push(`<p>${d.fixed} ${d.fixed === 1 ? 'issue was' : 'issues were'} fixed this week.</p>`);
  if (d.striking.length) {
    parts.push(`<h3>Closest to the top</h3><p>Pages ranking 5 to 20 for searches with real demand. A sharper title or a better answer section can lift them.</p><ul>${d.striking.map((s) => `<li>${esc(short(s.url))}: ${s.impressions.toLocaleString('en-IN')} impressions in 28 days</li>`).join('')}</ul>`);
  }
  parts.push(`<p><a href="${esc(baseUrl)}/seo">Open SEO Health</a></p>`);

  const subject = d.newUrgent.length
    ? `SEO Health: ${d.newUrgent.length} new ${d.newUrgent.length === 1 ? 'issue' : 'issues'}, clicks ${change(d.clicks.last7, d.clicks.prev7)}`
    : `SEO Health: clicks ${change(d.clicks.last7, d.clicks.prev7)} this week`;
  return { subject, html: parts.join('\n') };
}

export async function loadDigestData(client: any, now: Date = new Date()): Promise<DigestData> {
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const end = (await latestSearchDate(client)) ?? lastFinalDate(now);

  const [{ data: urgent }, { count: fixed }, { data: totals }, { data: striking }, urls] = await Promise.all([
    client.from('seo_findings').select('title, url, severity').eq('status', 'open').in('severity', ['critical', 'high']).gte('first_seen', weekAgo).order('severity').limit(100),
    client.from('seo_findings').select('id', { count: 'exact', head: true }).eq('status', 'fixed').gte('resolved_at', weekAgo),
    client.rpc('seo_daily_totals', { p_from: shiftDate(end, -13), p_to: end }),
    client.from('seo_findings').select('url, detail').eq('status', 'open').eq('rule_id', 'P1').limit(200),
    selectAll<any>((a: number, b: number) => client.from('seo_url_status').select('verdict, inspected_at').eq('expected_index', true).range(a, b)),
  ]);

  const cutoff = shiftDate(end, -6);
  const sum = (rows: any[], key: 'clicks' | 'impressions', last: boolean) => rows.filter((r) => (r.date >= cutoff) === last).reduce((s, r) => s + Number(r[key]), 0);
  const t = totals ?? [];
  return {
    newUrgent: urgent ?? [],
    fixed: fixed ?? 0,
    clicks: { last7: sum(t, 'clicks', true), prev7: sum(t, 'clicks', false) },
    impressions: { last7: sum(t, 'impressions', true), prev7: sum(t, 'impressions', false) },
    striking: (striking ?? [])
      .map((s: any) => ({ url: s.url, impressions: Number(s.detail?.impressions28) || 0 }))
      .sort((a: any, b: any) => b.impressions - a.impressions)
      .slice(0, 5),
    indexed: {
      indexed: urls.filter((u: any) => u.verdict === 'PASS').length,
      inspected: urls.filter((u: any) => u.inspected_at).length,
      expected: urls.length,
    },
  };
}

export async function sendSeoDigest(opts: { to: string[]; client?: any; now?: Date }) {
  if (!opts.to.length) return { sent: false, reason: 'SEO_DIGEST_TO not set' };
  const client = opts.client ?? db();
  const digest = buildSeoDigest(await loadDigestData(client, opts.now), process.env.NEXT_PUBLIC_ADMIN_URL || 'https://admin.neramclasses.com');
  const results = await Promise.all(opts.to.map((addr) => sendEmail({ to: addr, subject: digest.subject, html: digest.html })));
  return { sent: results.some((r: any) => r.success), recipients: opts.to.length };
}
