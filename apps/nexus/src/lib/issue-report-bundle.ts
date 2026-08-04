/**
 * Turn a reported issue into ONE block of text a developer (or Claude) can act
 * on from a single paste: what the student said, where it happened, which file
 * probably owns that route, what device they were on, and every console/network
 * error the client captured at the time.
 *
 * Pure and framework-free so it can be unit tested. Screenshots travel on the
 * clipboard separately, see screenshot-clipboard.ts.
 */

import type { NexusFoundationIssueWithDetails } from '@neram/database/types';

const CATEGORY_LABELS: Record<string, string> = {
  bug: 'Bug',
  content_issue: 'Content',
  ui_ux: 'UI/UX',
  feature_request: 'Feature',
  class_schedule: 'Class/Schedule',
  other: 'Other',
};

/**
 * Anything that looks like a credential is stripped before the text leaves the
 * page. The console buffer records failed-response BODIES, so a token really can
 * end up in there.
 */
const SECRET_PATTERNS: [RegExp, string][] = [
  [/\bBearer\s+[\w-]+\.[\w-]+\.[\w-]+/gi, 'Bearer [redacted]'],
  [/\bBearer\s+[A-Za-z0-9_\-.=]{16,}/gi, 'Bearer [redacted]'],
  [/\beyJ[\w-]{10,}\.[\w-]+\.[\w-]+/g, '[jwt-redacted]'],
  [/\b(access_token|id_token|refresh_token|api_?key|apikey|password)=[^&\s"']+/gi, '$1=[redacted]'],
  [/"(access_token|id_token|refresh_token|api_?key|apikey|password)"\s*:\s*"[^"]*"/gi, '"$1":"[redacted]"'],
];

export function scrubSecrets(text: string): string {
  return SECRET_PATTERNS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), text);
}

/** Public URLs for an issue's stored screenshots. */
export function screenshotPublicUrls(issue: Pick<NexusFoundationIssueWithDetails, 'screenshot_urls'>): string[] {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  return (issue.screenshot_urls || []).map(
    (path) => `${base}/storage/v1/object/public/issue-screenshots/${path}`,
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Best guess at the route file behind a reported page URL. A hint to start
 * reading from, not a lookup: dynamic segments are collapsed to `[id]` and the
 * real folder may be named differently.
 */
export function guessSourceFile(sourceApp: string | null | undefined, pageUrl: string | null): string | null {
  if (!pageUrl || !pageUrl.startsWith('/')) return null;

  const clean = pageUrl.split('?')[0].split('#')[0].replace(/\/+$/, '');
  if (!clean) return null;

  const segments = clean
    .slice(1)
    .split('/')
    .map((segment) => (UUID.test(segment) || /^\d+$/.test(segment) ? '[id]' : segment));

  if (sourceApp === 'app') {
    return `apps/app/src/app/${segments.join('/')}/page.tsx`;
  }

  // Nexus splits its routes into (student) and (teacher) route groups.
  const group = segments[0] === 'student' ? '(student)' : segments[0] === 'teacher' ? '(teacher)' : null;
  const path = segments.join('/');
  return group
    ? `apps/nexus/src/app/${group}/${path}/page.tsx`
    : `apps/nexus/src/app/${path}/page.tsx`;
}

function deviceLine(deviceInfo: Record<string, unknown> | null): string | null {
  if (!deviceInfo) return null;
  const str = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v));
  const bits = [
    str(deviceInfo.device_type),
    [str(deviceInfo.browser), str(deviceInfo.browser_version)].filter(Boolean).join(' ') || null,
    [str(deviceInfo.os), str(deviceInfo.os_version)].filter(Boolean).join(' ') || null,
    deviceInfo.screen_width && deviceInfo.screen_height
      ? `${deviceInfo.screen_width}×${deviceInfo.screen_height}`
      : null,
    str(deviceInfo.connection_type),
    deviceInfo.is_pwa ? 'PWA' : null,
  ].filter(Boolean);
  return bits.length > 0 ? bits.join(' · ') : null;
}

function formatReportedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

/**
 * The whole ticket as one markdown block, ready to paste into Claude Code.
 * Sections with nothing in them are omitted rather than left as empty headings.
 */
export function buildIssueMarkdown(issue: NexusFoundationIssueWithDetails): string {
  const app = issue.source_app === 'app' ? 'apps/app' : 'apps/nexus';
  const lines: string[] = [];

  lines.push(`Debug and fix this student-reported issue in ${app}.`);
  lines.push('');

  const category = CATEGORY_LABELS[issue.category] || issue.category;
  lines.push(`## ${issue.ticket_number} · ${category} · ${issue.status} · ${issue.priority}`);
  lines.push(`**Student says:** ${scrubSecrets(issue.title)}`);
  if (issue.description?.trim()) {
    const quoted = scrubSecrets(issue.description.trim())
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');
    lines.push('');
    lines.push(quoted);
  }
  lines.push('');

  if (issue.page_url) {
    lines.push(`**Where:** ${issue.page_url}`);
    const file = guessSourceFile(issue.source_app, issue.page_url);
    if (file) lines.push(`**Likely file:** ${file} (a hint, verify it)`);
  }

  if (issue.chapter_title) {
    const chapter = `Ch ${issue.chapter_number}: ${issue.chapter_title}`;
    lines.push(`**Chapter:** ${chapter}${issue.section_title ? ` · Section: ${issue.section_title}` : ''}`);
  }

  const device = deviceLine(issue.device_info);
  if (device) lines.push(`**Device:** ${device}`);

  lines.push(`**Reported:** ${formatReportedAt(issue.created_at)} IST by ${issue.student_name}`);

  const logs = issue.console_logs || [];
  if (logs.length > 0) {
    lines.push('');
    lines.push(`### Console (${logs.length})`);
    for (const log of logs) {
      const message = scrubSecrets(log.message);
      // The captured fetch messages already open with "HTTP 400 /url", so only
      // add the status when the message does not carry it.
      const status = log.status && !message.startsWith(`HTTP ${log.status}`) ? ` [HTTP ${log.status}]` : '';
      lines.push(`- [${log.level}]${status} ${message}`);
      if (log.stack) {
        lines.push('  ```');
        for (const stackLine of scrubSecrets(log.stack).split('\n')) {
          lines.push(`  ${stackLine}`);
        }
        lines.push('  ```');
      }
    }
  }

  const shots = issue.screenshot_urls?.length || 0;
  if (shots > 0) {
    lines.push('');
    lines.push('### Screenshots');
    lines.push(
      shots === 1
        ? '1 image is on the clipboard, paste it separately.'
        : `${shots} images are on the clipboard as one stacked picture, paste it separately.`,
    );
  }

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}
