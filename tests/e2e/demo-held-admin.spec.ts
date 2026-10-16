import { test, expect } from '@playwright/test';
import { APP_URLS } from '../utils/credentials';

/**
 * Demo desk: recording a demo held outside the desk (admin API, local admin on
 * the staging DB). Run with: pnpm test:e2e tests/e2e/demo-held-admin.spec.ts --project=admin-chrome --no-deps
 *
 * Creates "E2E Held" people and demo rows on staging. Clean up with:
 *   delete from callback_requests where name like 'E2E Held%';
 *   delete from demo_class_registrations where name like 'E2E Held%';
 *   delete from users where name like 'E2E Held%';
 */

const ADMIN = APP_URLS.admin;
const stamp = Date.now().toString().slice(-8);
const phone = (n: number) => `9${stamp}${n}`.slice(0, 10);

function istInPast(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}
function inDays(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60_000).toISOString();
}

test.describe('Demo desk: demo already held', () => {
  test('Add demo, held: a walk-in becomes a Done demo with the tutor and a follow-up', async ({ request }) => {
    const res = await request.post(`${ADMIN}/api/demo-requests`, {
      data: {
        mode: 'held',
        name: `E2E Held Walkin ${stamp}`,
        phone: phone(1),
        channel: 'direct',
        heldAt: istInPast(60),
        platform: 'google_meet',
        outcome: 'attended',
        interest: 'warm',
        nextFollowUpAt: inDays(2),
        note: 'E2E',
      },
    });
    expect(res.status(), await res.text()).toBe(200);
    const { id, createdPerson } = await res.json();
    expect(createdPerson).toBe(true);

    const detail = await (await request.get(`${ADMIN}/api/demo-requests/${id}`)).json();
    expect(detail.request.status).toBe('attended');
    expect(detail.request.tutor_upn).toBe('haribabu@neramclasses.com');
    expect(detail.followUp).toBeTruthy();
    expect(detail.followUp.interest_level).toBe('warm');

    // A desk-created person (no sign-in) is found by the demo people search.
    const search = await (await request.get(`${ADMIN}/api/demo-requests/people?q=${encodeURIComponent(`E2E Held Walkin ${stamp}`)}`)).json();
    expect(search.people.some((p: { name: string }) => p.name === `E2E Held Walkin ${stamp}`)).toBe(true);
  });

  test('an open request is recorded as held from the panel, then refuses a second time', async ({ request }) => {
    const add = await request.post(`${ADMIN}/api/demo-requests`, {
      data: { mode: 'agreed', name: `E2E Held Open ${stamp}`, phone: phone(2), channel: 'whatsapp' },
    });
    expect(add.status(), await add.text()).toBe(200);
    const { id } = await add.json();

    const held = await request.post(`${ADMIN}/api/demo-requests/${id}`, {
      data: { action: 'held', heldAt: istInPast(30), platform: 'phone', outcome: 'no_show', note: 'E2E' },
    });
    expect(held.status(), await held.text()).toBe(200);
    const d = await held.json();
    expect(d.request.status).toBe('no_show');
    expect(d.followUp?.query_type).toBe('demo_rebook');

    const again = await request.post(`${ADMIN}/api/demo-requests/${id}`, {
      data: { action: 'held', heldAt: istInPast(30), platform: 'phone', outcome: 'no_show' },
    });
    expect(again.status()).toBe(400);
  });

  test('held validation: a future time and a tutor outside the team are refused', async ({ request }) => {
    const base = { mode: 'held', name: `E2E Held Bad ${stamp}`, phone: phone(3), channel: 'direct', platform: 'zoom', outcome: 'no_show' };
    const future = await request.post(`${ADMIN}/api/demo-requests`, { data: { ...base, heldAt: inDays(1) } });
    expect(future.status()).toBe(400);
    const tutor = await request.post(`${ADMIN}/api/demo-requests`, { data: { ...base, heldAt: istInPast(10), tutorUpn: 'nobody@example.com' } });
    expect(tutor.status()).toBe(400);
  });

  test('Add demo, planned with link later: scheduled, then the link is added', async ({ request }) => {
    const res = await request.post(`${ADMIN}/api/demo-requests`, {
      data: { mode: 'planned', name: `E2E Held Planned ${stamp}`, phone: phone(4), channel: 'whatsapp', start: inDays(1), meeting: 'later' },
    });
    expect(res.status(), await res.text()).toBe(200);
    const body = await res.json();
    expect(body.confirmError).toBeUndefined();

    const detail = await (await request.get(`${ADMIN}/api/demo-requests/${body.id}`)).json();
    expect(detail.request.status).toBe('approved');
    expect(detail.request.meeting_kind).toBe('later');
    expect(detail.request.teams_join_url).toBeNull();
    expect(detail.request.tutor_upn).toBe('haribabu@neramclasses.com');

    const bad = await request.post(`${ADMIN}/api/demo-requests/${body.id}`, { data: { action: 'set_link', joinUrl: 'meet.google.com/x' } });
    expect(bad.status()).toBe(400);
    const ok = await request.post(`${ADMIN}/api/demo-requests/${body.id}`, {
      data: { action: 'set_link', joinUrl: 'https://meet.google.com/abc-defg-hij' },
    });
    expect(ok.status(), await ok.text()).toBe(200);
    const after = await ok.json();
    expect(after.request.meeting_kind).toBe('own_link');
    expect(after.request.teams_join_url).toContain('meet.google.com');
  });

  test('a planned demo in the past is refused', async ({ request }) => {
    const res = await request.post(`${ADMIN}/api/demo-requests`, {
      data: { mode: 'planned', name: `E2E Held Past ${stamp}`, phone: phone(5), channel: 'whatsapp', start: istInPast(60), meeting: 'in_person' },
    });
    expect(res.status()).toBe(400);
  });

  test('stopping the after-demo follow-up closes it with the reason', async ({ request }) => {
    const add = await request.post(`${ADMIN}/api/demo-requests`, {
      data: {
        mode: 'held',
        name: `E2E Held Stop ${stamp}`,
        phone: phone(6),
        channel: 'direct',
        heldAt: istInPast(90),
        platform: 'in_person',
        outcome: 'attended',
        interest: 'cold',
        nextFollowUpAt: inDays(2),
      },
    });
    expect(add.status(), await add.text()).toBe(200);
    const { id } = await add.json();
    const before = await (await request.get(`${ADMIN}/api/demo-requests/${id}`)).json();
    expect(before.followUp?.id).toBeTruthy();

    const stop = await request.post(`${ADMIN}/api/crm/follow-ups/${before.followUp.id}/outcome`, {
      data: { outcome: 'not_interested', reason: 'Fees' },
    });
    expect(stop.status(), await stop.text()).toBe(200);

    const after = await (await request.get(`${ADMIN}/api/demo-requests/${id}`)).json();
    expect(after.followUp).toBeNull();
    expect(after.lastFollowUp.status).toBe('completed');
    expect(after.lastFollowUp.call_notes).toContain('Fees');
  });

  test('"Call back later" on a request saves the call-back time', async ({ request }) => {
    const add = await request.post(`${ADMIN}/api/demo-requests`, {
      data: { mode: 'request', name: `E2E Held Callback ${stamp}`, phone: phone(7), channel: 'whatsapp', window: 'anytime', sendAck: false },
    });
    expect(add.status(), await add.text()).toBe(200);
    const { id } = await add.json();
    const res = await request.post(`${ADMIN}/api/demo-requests/${id}`, {
      data: { action: 'log_call', outcome: 'call_back', nextContactAt: inDays(1) },
    });
    expect(res.status(), await res.text()).toBe(200);
    const d = await res.json();
    expect(d.request.status).toBe('contacted');
    expect(d.request.next_contact_at).toBeTruthy();
  });

  test('people search ignores a one-letter query', async ({ request }) => {
    const res = await request.get(`${ADMIN}/api/demo-requests/people?q=a`);
    expect(res.status()).toBe(200);
    expect((await res.json()).people).toEqual([]);
  });
});
