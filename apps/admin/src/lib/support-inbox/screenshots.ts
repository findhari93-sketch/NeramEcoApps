/**
 * Screenshot references on a support ticket, made absolute.
 *
 * screenshot_urls holds a mix: full public URLs (error-reports absolutises,
 * the /support uploader returns one) and, on older rows, bare storage paths.
 * The two Tools App uploaders write different path shapes:
 *
 *   issue-screenshots            <userId>/<ms>.<ext>
 *   support-ticket-attachments   <userId>/<ms>_<file name>
 *
 * A path that already names its bucket keeps it. Pure, so it is unit tested.
 */

export const SCREENSHOT_BUCKETS = ['issue-screenshots', 'support-ticket-attachments'] as const;

const ISSUE_SHOT_PATH = /^[^/]+\/\d+\.[a-z0-9]+$/i;

function supabaseBase(supabaseUrl?: string): string {
  return (supabaseUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
}

export function normalizeScreenshotUrl(value: string, supabaseUrl?: string): string {
  const raw = (value || '').trim();
  if (!raw) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  const path = raw.replace(/^\/+/, '');
  const base = supabaseBase(supabaseUrl);
  if (path.startsWith('storage/v1/object/public/')) return `${base}/${path}`;
  const named = SCREENSHOT_BUCKETS.find((b) => path.startsWith(`${b}/`));
  if (named) return `${base}/storage/v1/object/public/${path}`;
  const bucket = ISSUE_SHOT_PATH.test(path) ? 'issue-screenshots' : 'support-ticket-attachments';
  return `${base}/storage/v1/object/public/${bucket}/${path}`;
}

export function screenshotUrlsOf(ticket: { screenshot_urls?: string[] | null }, supabaseUrl?: string): string[] {
  return (ticket.screenshot_urls || []).filter((u) => typeof u === 'string' && u.trim()).map((u) => normalizeScreenshotUrl(u, supabaseUrl));
}
