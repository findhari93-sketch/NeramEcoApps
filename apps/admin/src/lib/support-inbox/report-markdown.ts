/**
 * Turn a support ticket into ONE block of text to paste into Claude Code:
 * what the requester said, where it happened, which file probably owns that
 * route, what device they were on, every console and network error the
 * reporter caught, follow-ups, and "still happening" snapshots.
 *
 * Ported from apps/nexus/src/lib/issue-report-bundle.ts for the Admin inbox.
 * No email address or phone number goes in (the requester's own words are
 * redacted too), and anything that looks like a credential is scrubbed.
 * Screenshots travel on the clipboard separately (screenshot-clipboard.ts);
 * their absolute URLs are listed here as well.
 *
 * Pure: every input comes in through the arguments, so it is unit tested.
 */

import type { SupportTicketDetail, SupportTicketReopenSnapshot } from '@neram/database';
import {
  TICKET_CATEGORY_LABEL,
  TICKET_OUTCOME_LABEL,
  TICKET_SOURCE_LABEL,
  ticketStatusMeta,
} from '@neram/database/support-ticket-status';
import { normalizeScreenshotUrl, screenshotUrlsOf } from './screenshots';

// ---------------------------------------------------------------------------
// Scrubbing
// ---------------------------------------------------------------------------

/**
 * The console buffer records failed-response BODIES, so a token really can
 * end up in there. Same patterns as Nexus.
 */
const SECRET_PATTERNS: [RegExp, string][] = [
  [/\bBearer\s+[\w-]+\.[\w-]+\.[\w-]+/gi, 'Bearer [redacted]'],
  [/\bBearer\s+[A-Za-z0-9_\-.=]{16,}/gi, 'Bearer [redacted]'],
  [/\beyJ[\w-]{10,}\.[\w-]+\.[\w-]+/g, '[jwt-redacted]'],
  [/\b(access_token|id_token|refresh_token|api_?key|apikey|password|token|secret)=[^&\s"']+/gi, '$1=[redacted]'],
  [/"(access_token|id_token|refresh_token|api_?key|apikey|password|token|secret)"\s*:\s*"[^"]*"/gi, '"$1":"[redacted]"'],
];

export function scrubSecrets(text: string): string {
  return SECRET_PATTERNS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), text);
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Indian mobile numbers, with or without +91 / 0 and the usual separators.
const PHONE = /(?<![\d\w])(?:\+?91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}(?!\d)/g;

/** Secrets, email addresses and phone numbers out. */
export function scrubText(text: string): string {
  return scrubSecrets(text).replace(EMAIL, '[email]').replace(PHONE, '[phone]');
}

// ---------------------------------------------------------------------------
// Console entries
// ---------------------------------------------------------------------------

export interface ConsoleEntry {
  level: 'error' | 'warn' | 'log';
  message: string;
  stack: string | null;
  url: string | null;
  status: number | null;
  at: string | null;
}

/** console_logs is free-form jsonb. Read it defensively into one shape, scrubbed. */
export function normalizeConsoleEntries(raw: unknown): ConsoleEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
    .map((e) => {
      const level = e.level === 'warn' || e.level === 'log' ? e.level : 'error';
      const message = typeof e.message === 'string' ? e.message : JSON.stringify(e.message ?? e);
      const status = typeof e.status === 'number' ? e.status : null;
      return {
        level,
        message: scrubText(message),
        stack: typeof e.stack === 'string' && e.stack ? scrubText(e.stack) : null,
        url: typeof e.url === 'string' && e.url ? scrubSecrets(e.url) : null,
        status,
        at: typeof e.at === 'string' ? e.at : null,
      };
    });
}

// ---------------------------------------------------------------------------
// Where in the code
// ---------------------------------------------------------------------------

/**
 * Tools App URL prefix to the route group(s) that own it, under
 * apps/app/src/app. The longest matching prefix wins. Two groups means both
 * folders exist and either may own the page: the bundle lists both.
 * An empty list means the folder sits at the root, outside any group.
 *
 * report-markdown.test.ts checks every entry against the real folders.
 */
export const APP_ROUTE_GROUPS: Record<string, string[]> = {
  login: ['(auth)'],
  apply: ['(protected)'],
  dashboard: ['(protected)'],
  'my-applications': ['(protected)'],
  onboarding: ['(protected)'],
  payment: ['(protected)'],
  profile: ['(protected)'],
  review: ['(protected)'],
  'saved-colleges': ['(protected)'],
  support: ['(protected)'],
  welcome: ['(protected)'],
  tools: ['(tools)', '(protected)'],
  'tools/all': ['(protected)'],
  'tools/help': ['(protected)'],
  'tools/jee': ['(protected)'],
  'tools/counseling': ['(tools)'],
  'tools/nata': ['(tools)', '(protected)'],
  'tools/nata/question-bank': ['(tools)', '(protected)'],
  'tools/nata/seat-matrix': ['(protected)'],
  'tools/nata/college-reviews': ['(protected)'],
  'tools/nata/cost-calculator': ['(tools)'],
  'tools/nata/cutoff-calculator': ['(tools)'],
  'tools/nata/eligibility-checker': ['(tools)'],
  'tools/nata/exam-centers': ['(tools)'],
  'tools/nata/exam-planner': ['(tools)'],
  'tools/nata/image-crop': ['(tools)'],
  auth: [],
  'delete-account': [],
  feedback: [],
  'privacy-policy': [],
  unsubscribed: [],
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCALES = new Set(['en', 'ta', 'hi', 'kn', 'ml', 'te']);

/** The path part of a page URL, absolute or relative, without query or hash. */
export function pagePathOf(pageUrl: string | null | undefined): string | null {
  if (!pageUrl) return null;
  let path = pageUrl.trim();
  if (/^https?:\/\//i.test(path)) {
    try {
      path = new URL(path).pathname;
    } catch {
      return null;
    }
  }
  if (!path.startsWith('/')) return null;
  return path.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
}

/**
 * Best guesses at the route file behind a reported page. A hint to start
 * reading from, not a lookup: ids are collapsed to `[id]`, and the real
 * dynamic folder may be named differently.
 */
export function guessSourceFiles(sourceApp: string | null | undefined, pageUrl: string | null | undefined): string[] {
  const path = pagePathOf(pageUrl);
  if (!path) return [];
  const segments = path === '/' ? [] : path.slice(1).split('/').map((s) => (UUID.test(s) || /^\d+$/.test(s) ? '[id]' : s));

  if (sourceApp === 'nexus') {
    const group = segments[0] === 'student' ? '(student)' : segments[0] === 'teacher' ? '(teacher)' : null;
    const rest = segments.join('/');
    return [`apps/nexus/src/app/${group ? `${group}/` : ''}${rest ? `${rest}/` : ''}page.tsx`];
  }

  if (sourceApp === 'marketing') {
    const rest = (LOCALES.has(segments[0]) ? segments.slice(1) : segments).join('/');
    return [`apps/marketing/src/app/[locale]/${rest ? `${rest}/` : ''}page.tsx`];
  }

  // Tools App (the default: most tickets come from there).
  if (segments.length === 0) return ['apps/app/src/app/page.tsx'];
  let groups: string[] | undefined;
  for (let n = segments.length; n > 0 && !groups; n -= 1) {
    groups = APP_ROUTE_GROUPS[segments.slice(0, n).join('/')];
  }
  const rest = segments.join('/');
  if (!groups || groups.length === 0) return [`apps/app/src/app/${rest}/page.tsx`];
  return groups.map((g) => `apps/app/src/app/${g}/${rest}/page.tsx`);
}

// ---------------------------------------------------------------------------
// Device and time
// ---------------------------------------------------------------------------

export function deviceLine(deviceInfo: Record<string, unknown> | null | undefined): string | null {
  if (!deviceInfo || typeof deviceInfo !== 'object') return null;
  const str = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v));
  const pair = (a: unknown, b: unknown) => (a && b ? `${a}×${b}` : null);
  const online = deviceInfo.online ?? deviceInfo.is_online;
  const bits = [
    str(deviceInfo.device_type),
    [str(deviceInfo.browser), str(deviceInfo.browser_version)].filter(Boolean).join(' ') || null,
    [str(deviceInfo.os), str(deviceInfo.os_version)].filter(Boolean).join(' ') || null,
    pair(deviceInfo.screen_width, deviceInfo.screen_height) ? `screen ${pair(deviceInfo.screen_width, deviceInfo.screen_height)}` : null,
    pair(deviceInfo.viewport_width, deviceInfo.viewport_height) ? `viewport ${pair(deviceInfo.viewport_width, deviceInfo.viewport_height)}` : null,
    str(deviceInfo.connection_type),
    online === false ? 'offline' : null,
    deviceInfo.is_pwa ? 'PWA' : null,
    str(deviceInfo.build_id) ? `build ${str(deviceInfo.build_id)}` : null,
  ].filter(Boolean);
  return bits.length > 0 ? bits.join(' · ') : null;
}

export function formatIst(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
}

const SEGMENT_WORDS: Record<string, string> = {
  enrolled: 'an enrolled student',
  lead: 'a lead (not enrolled)',
  guest: 'a signed-out visitor',
  staff: 'a staff member',
};

/** The "still happening" snapshots, oldest first. context is free-form jsonb. */
export function reopenSnapshotsOf(ticket: { context?: unknown }): SupportTicketReopenSnapshot[] {
  const list = (ticket.context as Record<string, unknown> | null | undefined)?.reopens;
  if (!Array.isArray(list)) return [];
  return list.filter(
    (r): r is SupportTicketReopenSnapshot => !!r && typeof r === 'object' && typeof (r as { at?: unknown }).at === 'string'
  );
}

// ---------------------------------------------------------------------------
// The bundle
// ---------------------------------------------------------------------------

function pushLogs(lines: string[], heading: string, raw: unknown): void {
  const logs = normalizeConsoleEntries(raw);
  if (logs.length === 0) return;
  lines.push('', heading);
  for (const log of logs) {
    // Captured fetch messages already open with "HTTP 400 /url".
    const status = log.status && !log.message.startsWith(`HTTP ${log.status}`) ? ` [HTTP ${log.status}]` : '';
    lines.push(`- [${log.level}]${status} ${log.message}`);
    if (log.url && !log.message.includes(log.url)) lines.push(`  at ${log.url}`);
    if (log.stack) {
      lines.push('  ```');
      for (const stackLine of log.stack.split('\n')) lines.push(`  ${stackLine}`);
      lines.push('  ```');
    }
  }
}

function quote(text: string): string {
  return scrubText(text.trim())
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
}

export interface MarkdownOptions {
  /** Supabase project URL, for screenshots stored as bare paths. */
  supabaseUrl?: string;
  /** Admin origin, for the deep link back to this ticket. */
  adminUrl?: string;
}

/**
 * The whole ticket as one markdown block. Sections with nothing in them are
 * left out rather than shown as empty headings.
 */
export function buildSupportTicketMarkdown(ticket: SupportTicketDetail, opts: MarkdownOptions = {}): string {
  const source = ticket.source_app || 'app';
  const appDir = source === 'nexus' ? 'apps/nexus' : source === 'marketing' ? 'apps/marketing' : 'apps/app';
  const lines: string[] = [];

  lines.push(`Debug and fix this user-reported issue in ${appDir}.`);
  lines.push('');

  const category = TICKET_CATEGORY_LABEL[ticket.category] || ticket.category;
  const status = ticketStatusMeta(ticket.status).staffLabel;
  lines.push(`## ${ticket.ticket_number} · ${category} · ${status} · ${ticket.priority} priority`);
  lines.push(`**They say:** ${scrubText(ticket.subject || '')}`);
  if (ticket.description?.trim() && ticket.description.trim() !== ticket.subject?.trim()) {
    lines.push('', quote(ticket.description));
  }
  lines.push('');

  lines.push(`**App:** ${TICKET_SOURCE_LABEL[source] || source}`);
  if (ticket.page_url) {
    lines.push(`**Where:** ${scrubSecrets(ticket.page_url)}`);
    const files = guessSourceFiles(source, ticket.page_url);
    if (files.length === 1) lines.push(`**Likely file:** ${files[0]} (a hint, verify it)`);
    if (files.length > 1) lines.push(`**Likely file, one of:** ${files.join(' or ')} (a hint, verify it)`);
  }

  const device = deviceLine(ticket.device_info);
  if (device) lines.push(`**Device:** ${device}`);

  const who = SEGMENT_WORDS[ticket.requester_segment || ''] || (ticket.user_id ? 'a signed-in user' : 'a signed-out visitor');
  lines.push(`**Reported:** ${formatIst(ticket.created_at)} IST by ${who}`);
  if (ticket.reopen_count > 0) lines.push(`**Reopened:** ${ticket.reopen_count} time${ticket.reopen_count === 1 ? '' : 's'}`);
  if (ticket.resolution_code) {
    lines.push(`**Last outcome:** ${TICKET_OUTCOME_LABEL[ticket.resolution_code] || ticket.resolution_code}`);
  }

  const logs = Array.isArray(ticket.console_logs) ? ticket.console_logs : [];
  pushLogs(lines, `### Console (${logs.length})`, logs);

  const followUps = (ticket.comments || []).filter((c) => !c.is_admin && !c.is_internal && c.content?.trim());
  if (followUps.length > 0) {
    lines.push('', `### Follow-up messages from them (${followUps.length})`);
    for (const c of followUps) {
      lines.push(`${formatIst(c.created_at)} IST:`, quote(c.content), '');
    }
  }

  // Newest reopen first: after a fix, what the device saw on "still happening" matters most.
  for (const r of reopenSnapshotsOf(ticket).slice().reverse()) {
    lines.push('', `## Reopened ${formatIst(r.at)} IST`);
    if (r.reason?.trim()) lines.push(`**They say:** ${scrubText(r.reason.trim())}`);
    if (r.page_url) {
      lines.push(`**Sent from:** ${scrubSecrets(r.page_url)}`);
      const files = guessSourceFiles(source, r.page_url);
      if (files.length > 0) lines.push(`**Likely file:** ${files.join(' or ')}`);
    }
    const rDevice = deviceLine(r.device_info ?? null);
    if (rDevice) lines.push(`**Device:** ${rDevice}`);
    const rLogs = Array.isArray(r.console_logs) ? r.console_logs : [];
    if (rLogs.length === 0) lines.push('No errors were caught on the device before the reopen.');
    pushLogs(lines, `### Console at reopen (${rLogs.length})`, rLogs);
    const rShots = (r.screenshot_urls || []).map((u) => normalizeScreenshotUrl(u, opts.supabaseUrl)).filter(Boolean);
    if (rShots.length > 0) {
      lines.push('', '### Screenshots at reopen');
      for (const url of rShots) lines.push(`- ${url}`);
    }
  }

  const shots = screenshotUrlsOf(ticket, opts.supabaseUrl);
  if (shots.length > 0) {
    lines.push('', '### Screenshots');
    lines.push(
      shots.length === 1
        ? 'Copy images puts it on the clipboard to paste separately. URL:'
        : `Copy images puts all ${shots.length} on the clipboard as one stacked picture. URLs:`
    );
    for (const url of shots) lines.push(`- ${url}`);
  }

  const adminBase = (opts.adminUrl ?? process.env.NEXT_PUBLIC_ADMIN_URL ?? 'https://admin.neramclasses.com').replace(/\/+$/, '');
  lines.push('', `**Ticket in Admin:** ${adminBase}/support-tickets?ticket=${encodeURIComponent(ticket.ticket_number)}`);

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}
