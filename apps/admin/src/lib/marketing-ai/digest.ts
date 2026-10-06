/**
 * The morning email: what the agent found, and what it changed by itself.
 *
 * Sent after the nightly analyze, to MARKETING_AI_DIGEST_TO (comma separated).
 * Unset means no email; the Overview page shows the same information. Sent
 * only when there is something to say: a quiet night sends nothing.
 */

import { sendEmail } from '@neram/database';

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export interface DigestItem {
  title: string;
  priority: string;
  status: string;
  decided_by: string | null;
}

/** Pure: subject and HTML, or null when there is nothing worth an email. */
export function buildDigest(items: DigestItem[], baseUrl: string): { subject: string; html: string } | null {
  const auto = items.filter((i) => i.decided_by === 'autopilot' && ['executed', 'failed'].includes(i.status));
  const pending = items.filter((i) => i.status === 'pending_approval');
  const critical = pending.filter((i) => i.priority === 'critical');
  if (!auto.length && !pending.length) return null;

  const list = (rows: DigestItem[]) => `<ul>${rows.map((r) => `<li><strong>${esc(r.priority)}</strong>: ${esc(r.title)}${r.status === 'failed' ? ' (failed)' : ''}</li>`).join('')}</ul>`;
  const parts = [`<p>Good morning. Here is what the Google Ads agent found overnight.</p>`];
  if (critical.length) parts.push(`<h3>Needs attention now</h3>${list(critical)}`);
  if (auto.length) parts.push(`<h3>Changed automatically</h3>${list(auto)}<p>Each change can be undone from the recommendation in Admin.</p>`);
  const rest = pending.filter((i) => i.priority !== 'critical');
  if (rest.length) parts.push(`<h3>Waiting for your approval</h3>${list(rest.slice(0, 10))}${rest.length > 10 ? `<p>And ${rest.length - 10} more.</p>` : ''}`);
  parts.push(`<p><a href="${esc(baseUrl)}/marketing-ai/recommendations">Open Marketing Intelligence</a></p>`);

  const subject = critical.length
    ? `Google Ads: ${critical.length} urgent issue${critical.length > 1 ? 's' : ''}`
    : `Google Ads: ${pending.length} to review${auto.length ? `, ${auto.length} changed automatically` : ''}`;
  return { subject, html: parts.join('\n') };
}

export async function sendDigest(db: any, runId: string | null, _stats: unknown) {
  const to = (process.env.MARKETING_AI_DIGEST_TO || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!to.length) return { sent: false, reason: 'MARKETING_AI_DIGEST_TO not set' };

  const since = new Date(Date.now() - 26 * 3600_000).toISOString();
  const { data, error } = await db
    .from('marketing_ai_recommendations')
    .select('title, priority, status, decided_by, run_id, updated_at')
    .gte('updated_at', since)
    .limit(200);
  if (error) return { sent: false, reason: error.message };

  const items = ((data ?? []) as Array<DigestItem & { run_id: string | null }>).filter((r) => r.run_id === runId || r.decided_by === 'autopilot');
  const digest = buildDigest(items, process.env.NEXT_PUBLIC_ADMIN_URL || 'https://admin.neramclasses.com');
  if (!digest) return { sent: false, reason: 'nothing to report' };

  const results = await Promise.all(to.map((addr) => sendEmail({ to: addr, subject: digest.subject, html: digest.html })));
  return { sent: results.some((r) => r.success), recipients: to.length };
}
