// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { SupportTicketDetail } from '@neram/database';
import {
  APP_ROUTE_GROUPS,
  buildSupportTicketMarkdown,
  guessSourceFiles,
  normalizeConsoleEntries,
  pagePathOf,
  scrubSecrets,
  scrubText,
} from './report-markdown';
import { normalizeScreenshotUrl } from './screenshots';

const SB = 'https://db.example.co';
const OPTS = { supabaseUrl: SB, adminUrl: 'https://admin.example.com' };

function ticket(over: Partial<SupportTicketDetail> = {}): SupportTicketDetail {
  return {
    id: '11111111-2222-4333-8444-555555555555',
    ticket_number: 'NERAM-TKT-00001',
    user_id: 'u-1',
    user_name: 'Priya Raman',
    user_email: 'priya@example.com',
    user_phone: '+919876543210',
    category: 'technical_issue',
    subject: 'Question bank will not load',
    description: 'I opened the question bank and it spins forever.',
    page_url: '/tools/nata/question-bank',
    source_app: 'app',
    enrollment_link_id: null,
    screenshot_urls: [],
    console_logs: null,
    device_info: null,
    status: 'in_progress',
    priority: 'high',
    assigned_to: null,
    assigned_at: null,
    resolution_notes: null,
    resolved_by: null,
    resolved_at: null,
    resolution_code: null,
    duplicate_of: null,
    auto_close_at: null,
    closed_at: null,
    assigned_by: null,
    first_response_at: null,
    last_reply_at: null,
    last_reply_by: null,
    staff_seen_at: null,
    student_seen_at: null,
    reopen_count: 0,
    context: {},
    requester_segment: 'enrolled',
    created_at: '2026-10-16T04:30:00.000Z',
    updated_at: '2026-10-16T04:30:00.000Z',
    assignee_name: null,
    resolver_name: null,
    duplicate_of_number: null,
    comments: [],
    activity: [],
    ...over,
  } as SupportTicketDetail;
}

describe('buildSupportTicketMarkdown', () => {
  it('builds a full ticket into one paste-ready prompt', () => {
    const md = buildSupportTicketMarkdown(
      ticket({
        device_info: { device_type: 'mobile', browser: 'Chrome', browser_version: '129', os: 'Android', os_version: '14', screen_width: 412, screen_height: 915, is_pwa: true, build_id: 'abc123' },
        console_logs: [
          { level: 'error', message: 'HTTP 500 /api/questions', status: 500, at: '2026-10-16T04:29:00Z' },
          { level: 'warn', message: 'Slow render', stack: 'Error: x\n    at Foo (foo.tsx:1:1)', at: '2026-10-16T04:29:01Z' },
        ],
        screenshot_urls: ['u-1/1760000000000.png', `${SB}/storage/v1/object/public/support-ticket-attachments/u-1/1_a.png`],
        comments: [
          { id: 'c1', ticket_id: 't', user_id: 'u-1', user_name: 'Priya', is_admin: false, is_internal: false, content: 'Still spinning today', created_at: '2026-10-16T06:00:00Z' },
          { id: 'c2', ticket_id: 't', user_id: 's', user_name: 'Hari', is_admin: true, is_internal: true, content: 'Secret staff note', created_at: '2026-10-16T06:10:00Z' },
          { id: 'c3', ticket_id: 't', user_id: 's', user_name: 'Hari', is_admin: true, is_internal: false, content: 'Staff public reply', created_at: '2026-10-16T06:20:00Z' },
        ],
        reopen_count: 1,
        context: {
          reopens: [
            { at: '2026-10-17T05:00:00Z', reason: 'Broke again', page_url: '/dashboard', console_logs: [{ level: 'error', message: 'TypeError: x is undefined' }], device_info: null, screenshot_urls: [] },
          ],
        },
      }),
      OPTS
    );

    expect(md.startsWith('Debug and fix this user-reported issue in apps/app.')).toBe(true);
    expect(md).toContain('## NERAM-TKT-00001 · Technical · In progress · high priority');
    expect(md).toContain('**They say:** Question bank will not load');
    expect(md).toContain('> I opened the question bank and it spins forever.');
    expect(md).toContain('**Where:** /tools/nata/question-bank');
    expect(md).toContain('apps/app/src/app/(tools)/tools/nata/question-bank/page.tsx or apps/app/src/app/(protected)/tools/nata/question-bank/page.tsx');
    expect(md).toContain('**Device:** mobile · Chrome 129 · Android 14 · screen 412×915 · PWA · build abc123');
    expect(md).toMatch(/\*\*Reported:\*\* 16 Oct 2026, 10:00 (am|AM) IST by an enrolled student/);
    expect(md).toContain('### Console (2)');
    expect(md).toContain('- [error] HTTP 500 /api/questions');
    expect(md).toContain('    at Foo (foo.tsx:1:1)');
    expect(md).toContain('### Follow-up messages from them (1)');
    expect(md).toContain('> Still spinning today');
    expect(md).not.toContain('Secret staff note');
    expect(md).not.toContain('Staff public reply');
    expect(md).toContain('## Reopened');
    expect(md).toContain('**They say:** Broke again');
    expect(md).toContain('apps/app/src/app/(protected)/dashboard/page.tsx');
    expect(md).toContain('TypeError: x is undefined');
    expect(md).toContain(`- ${SB}/storage/v1/object/public/issue-screenshots/u-1/1760000000000.png`);
    expect(md).toContain(`- ${SB}/storage/v1/object/public/support-ticket-attachments/u-1/1_a.png`);
    expect(md).toContain('**Ticket in Admin:** https://admin.example.com/support-tickets?ticket=NERAM-TKT-00001');
  });

  it('keeps a minimal ticket short, with no empty sections', () => {
    const md = buildSupportTicketMarkdown(
      ticket({ description: 'Question bank will not load', page_url: null, requester_segment: null, user_id: null, source_app: 'marketing' }),
      OPTS
    );
    expect(md).toContain('in apps/marketing.');
    expect(md).not.toContain('###');
    expect(md).not.toContain('**Where:**');
    expect(md).not.toContain('> ');
    expect(md).toContain('by a signed-out visitor');
    expect(md.endsWith('\n')).toBe(true);
    expect(md).not.toMatch(/\n{3,}/);
  });

  it('never includes the email address or phone number, even typed in the text', () => {
    const md = buildSupportTicketMarkdown(
      ticket({
        description: 'Call me on 98765 43210 or mail priya@example.com',
        console_logs: [{ level: 'error', message: 'user +91 9876543210 failed, contact priya@example.com' }],
      }),
      OPTS
    );
    expect(md).not.toContain('priya@example.com');
    expect(md).not.toContain('9876543210');
    expect(md).not.toContain('98765 43210');
    expect(md).toContain('[email]');
    expect(md).toContain('[phone]');
  });

  it('scrubs tokens from logs, stacks and the page URL', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.abcDEF123_-xyz';
    const md = buildSupportTicketMarkdown(
      ticket({
        page_url: '/dashboard?access_token=supersecretvalue123',
        console_logs: [
          { level: 'error', message: `Authorization: Bearer ${jwt}`, stack: `at x {"refresh_token":"abc123456"}` },
          { level: 'error', message: 'GET /x?apikey=AKIA1234567890' },
        ],
      }),
      OPTS
    );
    expect(md).not.toContain(jwt);
    expect(md).not.toContain('supersecretvalue123');
    expect(md).not.toContain('abc123456');
    expect(md).not.toContain('AKIA1234567890');
    expect(md).toContain('Bearer [redacted]');
    expect(md).toContain('access_token=[redacted]');
  });

  it('uses no em dashes or double dashes', () => {
    const md = buildSupportTicketMarkdown(ticket({ console_logs: [{ level: 'error', message: 'x' }], screenshot_urls: ['a/1.png'] }), OPTS);
    expect(md).not.toContain('—');
    expect(md).not.toContain('--');
  });
});

describe('scrubbing helpers', () => {
  it('scrubSecrets leaves ordinary text alone', () => {
    expect(scrubSecrets('Cannot read properties of undefined')).toBe('Cannot read properties of undefined');
  });
  it('scrubText does not eat version numbers or timestamps', () => {
    expect(scrubText('react-dom@18.2.0 at 1760000000000')).toBe('react-dom@18.2.0 at 1760000000000');
  });
  it('normalizeConsoleEntries reads odd shapes safely', () => {
    expect(normalizeConsoleEntries(null)).toEqual([]);
    expect(normalizeConsoleEntries([{ message: 'a' }, 'junk', { level: 'warn', message: 'b', status: 404 }])).toEqual([
      { level: 'error', message: 'a', stack: null, url: null, status: null, at: null },
      { level: 'warn', message: 'b', stack: null, url: null, status: 404, at: null },
    ]);
  });
});

describe('screenshot URLs', () => {
  it('keeps absolute URLs', () => {
    expect(normalizeScreenshotUrl('https://x.test/a.png', SB)).toBe('https://x.test/a.png');
  });
  it('maps bare issue-screenshot paths to their bucket', () => {
    expect(normalizeScreenshotUrl('u-1/1760000000000.webp', SB)).toBe(`${SB}/storage/v1/object/public/issue-screenshots/u-1/1760000000000.webp`);
  });
  it('maps bare support attachment paths to their bucket', () => {
    expect(normalizeScreenshotUrl('u-1/1760000000000_my_shot.png', SB)).toBe(`${SB}/storage/v1/object/public/support-ticket-attachments/u-1/1760000000000_my_shot.png`);
  });
  it('keeps a bucket named in the path', () => {
    expect(normalizeScreenshotUrl('issue-screenshots/u/1.png', SB)).toBe(`${SB}/storage/v1/object/public/issue-screenshots/u/1.png`);
    expect(normalizeScreenshotUrl('/storage/v1/object/public/support-ticket-attachments/u/x.png', `${SB}/`)).toBe(`${SB}/storage/v1/object/public/support-ticket-attachments/u/x.png`);
  });
});

describe('guessSourceFiles', () => {
  it('handles absolute URLs, ids and the root', () => {
    expect(pagePathOf('https://app.neramclasses.com/support/11111111-2222-4333-8444-555555555555?x=1#y')).toBe('/support/11111111-2222-4333-8444-555555555555');
    expect(guessSourceFiles('app', 'https://app.neramclasses.com/support/11111111-2222-4333-8444-555555555555')).toEqual([
      'apps/app/src/app/(protected)/support/[id]/page.tsx',
    ]);
    expect(guessSourceFiles('app', '/')).toEqual(['apps/app/src/app/page.tsx']);
    expect(guessSourceFiles('app', '/login')).toEqual(['apps/app/src/app/(auth)/login/page.tsx']);
    expect(guessSourceFiles('app', '/privacy-policy')).toEqual(['apps/app/src/app/privacy-policy/page.tsx']);
    expect(guessSourceFiles('app', null)).toEqual([]);
  });
  it('lists both groups when a path is ambiguous', () => {
    expect(guessSourceFiles('app', '/tools/nata/question-bank/42')).toHaveLength(2);
    expect(guessSourceFiles('app', '/tools/counseling/college-predictor')).toEqual(['apps/app/src/app/(tools)/tools/counseling/college-predictor/page.tsx']);
    expect(guessSourceFiles('app', '/tools/jee/rank-predictor')).toEqual(['apps/app/src/app/(protected)/tools/jee/rank-predictor/page.tsx']);
  });
  it('knows Nexus and the website', () => {
    expect(guessSourceFiles('nexus', '/student/classes')).toEqual(['apps/nexus/src/app/(student)/student/classes/page.tsx']);
    expect(guessSourceFiles('marketing', '/ta/apply')).toEqual(['apps/marketing/src/app/[locale]/apply/page.tsx']);
  });
});

describe('APP_ROUTE_GROUPS matches the real apps/app folders', () => {
  const appRoot = resolve(__dirname, '../../../../app/src/app');
  const isDir = (p: string) => existsSync(p) && statSync(p).isDirectory();

  it('every entry points at folders that exist', () => {
    for (const [prefix, groups] of Object.entries(APP_ROUTE_GROUPS)) {
      if (groups.length === 0) {
        expect(isDir(join(appRoot, prefix)), `apps/app/src/app/${prefix}`).toBe(true);
      }
      for (const g of groups) {
        expect(isDir(join(appRoot, g, prefix)), `apps/app/src/app/${g}/${prefix}`).toBe(true);
      }
    }
  });

  it('every top-level page folder in a route group is covered', () => {
    for (const group of readdirSync(appRoot).filter((n) => n.startsWith('(') && isDir(join(appRoot, n)))) {
      for (const folder of readdirSync(join(appRoot, group)).filter((n) => isDir(join(appRoot, group, n)))) {
        expect(APP_ROUTE_GROUPS[folder], `${group}/${folder} has no APP_ROUTE_GROUPS entry`).toBeDefined();
        expect(APP_ROUTE_GROUPS[folder]).toContain(group);
      }
    }
  });

  it('a prefix in two groups really exists in both', () => {
    const both = Object.entries(APP_ROUTE_GROUPS).filter(([, g]) => g.length > 1);
    expect(both.length).toBeGreaterThan(0);
    for (const [prefix, groups] of both) for (const g of groups) expect(isDir(join(appRoot, g, prefix))).toBe(true);
  });
});
