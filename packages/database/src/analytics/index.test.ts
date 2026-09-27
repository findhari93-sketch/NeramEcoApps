// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  ANON_ID_COOKIE,
  EVENT_TAXONOMY,
  FUNNELS,
  anonIdCookie,
  isValidAnonymousId,
  isValidEventName,
  newAnonymousId,
  normalizeFunnelEvents,
  readCookie,
  readFirstTouchCookie,
  sanitizeFirstTouch,
  sharedCookieDomain,
} from './index';

const ctx = { userId: 'u1', ip: '1.2.3.4', sourceApp: 'app' as const };

describe('taxonomy', () => {
  it('every taxonomy event is object_action and maps to a real funnel', () => {
    for (const [name, funnel] of Object.entries(EVENT_TAXONOMY)) {
      expect(isValidEventName(name), name).toBe(true);
      expect(FUNNELS).toContain(funnel);
    }
  });

  it('rejects the inconsistent names the spec warns about', () => {
    for (const bad of ['clickedTool', 'toolClick', 'Tool_Opened', 'tool', 'tool opened', '', 'x'.repeat(65)]) {
      expect(isValidEventName(bad), bad).toBe(false);
    }
    expect(isValidEventName('google_auth_started')).toBe(true);
  });
});

describe('normalizeFunnelEvents', () => {
  it('drops invalid events one by one instead of losing the batch', () => {
    const { rows, dropped } = normalizeFunnelEvents(
      [
        { funnel: 'tool', event: 'tool_completed', status: 'completed' },
        { funnel: 'bogus', event: 'tool_completed' },
        { funnel: 'auth', event: 'NotObjectAction' },
        null,
        { funnel: 'auth', event: 'otp_verified', status: 'weird' },
      ],
      ctx,
    );
    expect(dropped).toBe(3);
    expect(rows.map((r) => [r.funnel, r.event, r.status])).toEqual([
      ['tool', 'tool_completed', 'completed'],
      ['auth', 'otp_verified', 'started'],
    ]);
  });

  it('keeps only our anonymous ids (and the legacy fingerprint), never arbitrary text', () => {
    const id = newAnonymousId();
    const fp = 'a'.repeat(64);
    const { rows } = normalizeFunnelEvents(
      [
        { funnel: 'marketing', event: 'course_page_viewed', anonymous_id: id },
        { funnel: 'marketing', event: 'course_page_viewed', anonymous_id: fp },
        { funnel: 'marketing', event: 'course_page_viewed', anonymous_id: "x'; drop table users;--" },
      ],
      ctx,
    );
    expect(rows.map((r) => r.anonymous_id)).toEqual([id, fp, null]);
  });

  it('stamps the server-side user, ip and source app, and clips long text', () => {
    const { rows } = normalizeFunnelEvents(
      [{ funnel: 'tool', event: 'tool_failed', source_app: 'admin', error_message: 'e'.repeat(2000), metadata: [1, 2] }],
      ctx,
    );
    expect(rows[0]).toMatchObject({ user_id: 'u1', ip_address: '1.2.3.4', source_app: 'app', metadata: {} });
    expect(rows[0].error_message).toHaveLength(500);
  });
});

describe('anonymous id cookie', () => {
  it('generates ids in the expected shape from a CSPRNG', () => {
    const a = newAnonymousId();
    const b = newAnonymousId();
    expect(isValidAnonymousId(a)).toBe(true);
    expect(a).not.toBe(b);
    expect(newAnonymousId(() => new Uint8Array(16).fill(255))).toBe(`anon_${'ff'.repeat(16)}`);
  });

  it('shares the cookie across neramclasses.com subdomains only', () => {
    expect(sharedCookieDomain('app.neramclasses.com')).toBe('.neramclasses.com');
    expect(sharedCookieDomain('neramclasses.com')).toBe('.neramclasses.com');
    expect(sharedCookieDomain('localhost')).toBeNull();
    expect(sharedCookieDomain('neramclasses.com.evil.test')).toBeNull();
    expect(anonIdCookie('anon_x', 'app.neramclasses.com')).toContain('Domain=.neramclasses.com');
    expect(anonIdCookie('anon_x', 'localhost', false)).not.toMatch(/Domain|Secure/);
  });

  it('reads a cookie by exact name', () => {
    const header = `a=1; ${ANON_ID_COOKIE}=anon_abc; ${ANON_ID_COOKIE}x=nope`;
    expect(readCookie(header, ANON_ID_COOKIE)).toBe('anon_abc');
    expect(readCookie(null, ANON_ID_COOKIE)).toBeNull();
  });
});

describe('first touch', () => {
  it('keeps only known attribution keys, trimmed and capped', () => {
    expect(
      sanitizeFirstTouch({ utm_source: ' google ', gclid: 'abc', email: 'x@y.z', landing_page: '/nata', junk: 1 }),
    ).toEqual({ utm_source: 'google', gclid: 'abc', landing_page: '/nata' });
    expect(sanitizeFirstTouch({})).toBeNull();
    expect(sanitizeFirstTouch('nope')).toBeNull();
  });

  it('reads the marketing attribution cookie', () => {
    const value = encodeURIComponent(JSON.stringify({ utm_source: 'instagram', captured_at: 'x' }));
    expect(readFirstTouchCookie(`neram_attribution=${value}`)).toEqual({ utm_source: 'instagram' });
    expect(readFirstTouchCookie('neram_attribution=%7Bbroken')).toBeNull();
  });
});

describe('EVENT_TAXONOMY: enrolment redesign names', () => {
  it('files the application step events under the application funnel', () => {
    for (const name of [
      'application_step_completed',
      'course_selected',
      'application_reviewed',
      'autofill_selected',
      'voice_started',
      'voice_completed',
      'document_upload_started',
      'document_processed',
      'manual_entry_started',
    ] as const) {
      expect((EVENT_TAXONOMY as Record<string, string>)[name]).toBe('application');
    }
  });

  it('files the provisioning events under the enrollment funnel', () => {
    for (const name of ['enrollment_created', 'provisioning_step', 'onboarding_started', 'onboarding_viewed'] as const) {
      expect((EVENT_TAXONOMY as Record<string, string>)[name]).toBe('enrollment');
    }
  });
});
