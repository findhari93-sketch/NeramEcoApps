import { describe, it, expect } from 'vitest';
import type { NexusFoundationIssueWithDetails } from '@neram/database/types';
import { buildIssueMarkdown, guessSourceFile, scrubSecrets } from './issue-report-bundle';

/** NXS-0112, the real ticket this feature was built for. */
const ticket = (overrides: Partial<NexusFoundationIssueWithDetails> = {}): NexusFoundationIssueWithDetails =>
  ({
    id: 'd76de10c-56f4-4cd2-905e-1432c5cac452',
    student_id: 'd59566e0-f6db-425e-9928-a6a407101567',
    chapter_id: null,
    section_id: null,
    title: 'Am getting error classroom ID is missing',
    description: 'When i try to attend the test am getting this error',
    status: 'open',
    priority: 'medium',
    assigned_to: null,
    assigned_by: null,
    assigned_at: null,
    resolved_by: null,
    resolved_at: null,
    resolution_note: null,
    ticket_number: 'NXS-0112',
    category: 'bug',
    screenshot_urls: ['d59566e0/1785678599496.jpg'],
    page_url: '/student/tests/new',
    auto_close_at: null,
    console_logs: [
      {
        level: 'warn',
        message: '[MSAL] handleRedirectPromise timed out after 10s, clearing stale state',
        stack: null,
        url: null,
        status: null,
        at: '2026-08-02T13:50:00.000Z',
      },
      {
        level: 'error',
        message: 'HTTP 400 /api/question-bank/tags — {"error":"classroom_id is required"}',
        stack: null,
        url: '/api/question-bank/tags',
        status: 400,
        at: '2026-08-02T13:50:10.000Z',
      },
    ],
    device_info: {
      device_type: 'desktop',
      browser: 'Chrome',
      browser_version: '139.0.0.0',
      os: 'Windows',
      os_version: '10.0',
      screen_width: 1280,
      screen_height: 800,
      connection_type: '4g',
      is_pwa: false,
    },
    source_app: 'nexus',
    created_at: '2026-08-02T13:50:46.464Z',
    updated_at: '2026-08-02T13:50:46.464Z',
    student_name: 'Hari Heera',
    student_avatar: null,
    chapter_title: '',
    chapter_number: 0,
    section_title: null,
    resolved_by_name: null,
    assigned_to_name: null,
    assigned_by_name: null,
    ...overrides,
  }) as NexusFoundationIssueWithDetails;

describe('buildIssueMarkdown', () => {
  it('carries everything a developer needs in one block', () => {
    const md = buildIssueMarkdown(ticket());

    expect(md).toContain('Debug and fix this student-reported issue in apps/nexus.');
    expect(md).toContain('## NXS-0112 · Bug · open · medium');
    expect(md).toContain('**Student says:** Am getting error classroom ID is missing');
    expect(md).toContain('> When i try to attend the test am getting this error');
    expect(md).toContain('**Where:** /student/tests/new');
    expect(md).toContain('apps/nexus/src/app/(student)/student/tests/new/page.tsx');
    expect(md).toContain('**Device:** desktop · Chrome 139.0.0.0 · Windows 10.0 · 1280×800 · 4g');
    expect(md).toContain('by Hari Heera');
    expect(md).toContain('### Console (2)');
    // The status is not repeated when the captured message already opens with it.
    expect(md).toContain('- [error] HTTP 400 /api/question-bank/tags');
    expect(md).not.toContain('[HTTP 400] HTTP 400');
    expect(md).toContain('1 image is on the clipboard');
  });

  it('omits sections that have no content instead of leaving empty headings', () => {
    const md = buildIssueMarkdown(
      ticket({
        description: '',
        console_logs: null,
        device_info: null,
        screenshot_urls: null,
        page_url: null,
        chapter_title: '',
      }),
    );

    expect(md).not.toContain('### Console');
    expect(md).not.toContain('### Screenshots');
    expect(md).not.toContain('**Device:**');
    expect(md).not.toContain('**Where:**');
    expect(md).not.toContain('**Chapter:**');
    expect(md).toContain('## NXS-0112');
    expect(md).not.toMatch(/\n{3}/);
  });

  it('names the other app when the report came from the student PWA', () => {
    const md = buildIssueMarkdown(
      ticket({ source_app: 'app', page_url: '/tools/counseling/college-predictor' }),
    );

    expect(md).toContain('in apps/app.');
    expect(md).toContain('apps/app/src/app/tools/counseling/college-predictor/page.tsx');
  });

  it('describes multiple screenshots as one stacked picture', () => {
    const md = buildIssueMarkdown(ticket({ screenshot_urls: ['a.jpg', 'b.jpg', 'c.jpg'] }));
    expect(md).toContain('3 images are on the clipboard as one stacked picture');
  });

  it('includes a chapter when the report came from foundation content', () => {
    const md = buildIssueMarkdown(
      ticket({ chapter_title: 'Perspective Drawing', chapter_number: 3, section_title: 'Two point' }),
    );
    expect(md).toContain('**Chapter:** Ch 3: Perspective Drawing · Section: Two point');
  });

  it('redacts credentials that leaked into a captured response body', () => {
    const md = buildIssueMarkdown(
      ticket({
        console_logs: [
          {
            level: 'error',
            message: 'HTTP 401 /api/me — {"access_token":"abc123secret"} Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig',
            stack: null,
            url: '/api/me',
            status: 401,
            at: '2026-08-02T13:50:10.000Z',
          },
        ],
      }),
    );

    expect(md).not.toContain('abc123secret');
    expect(md).not.toContain('eyJhbGciOiJIUzI1NiJ9.payload.sig');
    expect(md).toContain('[redacted]');
  });
});

describe('guessSourceFile', () => {
  it('routes student pages through the (student) group', () => {
    expect(guessSourceFile('nexus', '/student/library')).toBe(
      'apps/nexus/src/app/(student)/student/library/page.tsx',
    );
  });

  it('routes teacher pages through the (teacher) group', () => {
    expect(guessSourceFile('nexus', '/teacher/issues')).toBe(
      'apps/nexus/src/app/(teacher)/teacher/issues/page.tsx',
    );
  });

  it('collapses uuid and numeric segments to [id]', () => {
    expect(guessSourceFile('nexus', '/student/assignments/57fef743-e08e-4395-b647-8eb3f50374fe')).toBe(
      'apps/nexus/src/app/(student)/student/assignments/[id]/page.tsx',
    );
    expect(guessSourceFile('nexus', '/student/tests/42')).toBe(
      'apps/nexus/src/app/(student)/student/tests/[id]/page.tsx',
    );
  });

  it('drops query strings and trailing slashes', () => {
    expect(guessSourceFile('nexus', '/student/library/?tab=2')).toBe(
      'apps/nexus/src/app/(student)/student/library/page.tsx',
    );
  });

  it('returns null when there is no usable page url', () => {
    expect(guessSourceFile('nexus', null)).toBeNull();
    expect(guessSourceFile('nexus', '')).toBeNull();
    expect(guessSourceFile('nexus', 'https://elsewhere.example/x')).toBeNull();
    expect(guessSourceFile('nexus', '/')).toBeNull();
  });
});

describe('scrubSecrets', () => {
  it('strips bearer tokens, jwts and token query params', () => {
    expect(scrubSecrets('Authorization: Bearer abcdefghijklmnop1234567890')).toContain('Bearer [redacted]');
    expect(scrubSecrets('/cb?access_token=xyz789&state=1')).toContain('access_token=[redacted]');
    expect(scrubSecrets('token eyJhbGciOiJIUzI1NiJ9.body.signature')).toContain('[jwt-redacted]');
  });

  it('leaves ordinary text alone', () => {
    const message = 'HTTP 400 /api/test-folders — {"error":"classroom_id is required"}';
    expect(scrubSecrets(message)).toBe(message);
  });
});
