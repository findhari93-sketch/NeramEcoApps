import { describe, expect, it, vi } from 'vitest';
import { applyMeetingOptions, buildPresenterParticipants, findOnlineMeetingId, readAllowedPresenters } from './meeting-options';

function reply(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('meeting options', () => {
  it('looks a meeting up by its join link, on the right owner', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => reply(200, { value: [{ id: 'MSo1' }] }));
    const id = await findOnlineMeetingId('t', { kind: 'user', oid: 'oid-1' }, "https://x/it's", fetchImpl as never);
    expect(id).toBe('MSo1');
    const url = decodeURIComponent(String(fetchImpl.mock.calls[0][0]));
    expect(url).toContain('/users/oid-1/onlineMeetings?');
    expect(url).toContain("JoinWebUrl eq 'https://x/it''s'");
  });

  it('returns null when Graph has no meeting for that link', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => reply(200, { value: [] }));
    expect(await findOnlineMeetingId('t', { kind: 'me' }, 'https://x', fetchImpl as never)).toBeNull();
  });

  it('reads who may present', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => reply(200, { allowedPresenters: 'everyone' }));
    const read = await readAllowedPresenters('t', { kind: 'me' }, 'MSo1', fetchImpl as never);
    expect(read).toEqual({ status: 200, allowedPresenters: 'everyone' });
    expect(String(fetchImpl.mock.calls[0][0])).toContain('/me/onlineMeetings/MSo1?$select=allowedPresenters');
  });

  it('sets presenters and auto-record in one PATCH when allowed', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => reply(200));
    const out = await applyMeetingOptions('t', { kind: 'me' }, 'MSo1', { allowedPresenters: 'organizer', recordAutomatically: true }, fetchImpl as never);
    expect(out).toEqual({ presenters: true, record: true, status: 200 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))).toEqual({ allowedPresenters: 'organizer', recordAutomatically: true });
  });

  it('keeps presenters locked when a policy refuses auto-record', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      return reply(body.recordAutomatically ? 403 : 200);
    });
    const out = await applyMeetingOptions('t', { kind: 'me' }, 'MSo1', { allowedPresenters: 'organizer', recordAutomatically: true }, fetchImpl as never);
    expect(out).toEqual({ presenters: true, record: false, status: 200 });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('does nothing when nothing was asked for', async () => {
    const fetchImpl = vi.fn();
    expect(await applyMeetingOptions('t', { kind: 'me' }, 'MSo1', {}, fetchImpl as never)).toEqual({ presenters: false, record: false, status: 0 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('staff presenters', () => {
  const HARI = { upn: 'Haribabu@neramclasses.com', oid: 'oid-hari' };
  const TAMIL = { upn: 'TamilSelvan@neramclasses.com', oid: 'oid-tamil' };

  it('keeps students as attendees, promotes listed staff and adds missing staff', () => {
    const out = buildPresenterParticipants(
      [
        { upn: 'student@neramclasses.com', role: 'attendee', identity: { user: { id: 'oid-s1' } } },
        // Listed under a different UPN casing: still the same person.
        { upn: 'haribabu@neramclasses.com', role: 'attendee', identity: { user: { id: 'oid-hari' } } },
      ],
      [HARI, TAMIL],
    );
    expect(out).toEqual([
      { upn: 'student@neramclasses.com', role: 'attendee', identity: { user: { id: 'oid-s1' } } },
      { upn: 'haribabu@neramclasses.com', role: 'presenter', identity: { user: { id: 'oid-hari' } } },
      { upn: 'TamilSelvan@neramclasses.com', role: 'presenter', identity: { user: { id: 'oid-tamil' } } },
    ]);
  });

  it('matches staff on UPN when Graph returns no identity', () => {
    const out = buildPresenterParticipants([{ upn: 'TAMILSELVAN@neramclasses.com', role: 'attendee' }], [TAMIL]);
    expect(out).toEqual([{ upn: 'TAMILSELVAN@neramclasses.com', role: 'presenter' }]);
  });

  it('leaves the organizer off the attendee list', () => {
    const out = buildPresenterParticipants([], [HARI, TAMIL], { upn: 'tamilselvan@neramclasses.com', identity: { user: { id: 'OID-TAMIL' } } });
    expect(out).toEqual([{ upn: 'Haribabu@neramclasses.com', role: 'presenter', identity: { user: { id: 'oid-hari' } } }]);
  });

  it('reads the list, then sets Specific people with staff as presenters', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (!init?.method) return reply(200, { participants: { attendees: [{ upn: 's@x', role: 'attendee', identity: { user: { id: 'oid-s' } } }] } });
      return reply(200);
    });
    const out = await applyMeetingOptions('t', { kind: 'me' }, 'MSo1', { allowedPresenters: 'roleIsPresenter', recordAutomatically: true, presenters: [HARI] }, fetchImpl as never);
    expect(out).toEqual({ presenters: true, record: true, status: 200 });
    expect(String(fetchImpl.mock.calls[1][0])).toContain('/me/onlineMeetings/MSo1?$select=participants');
    const sent = JSON.parse(String(fetchImpl.mock.calls[2][1]?.body));
    expect(sent.allowedPresenters).toBe('roleIsPresenter');
    expect(sent.participants.attendees).toEqual([
      { upn: 's@x', role: 'attendee', identity: { user: { id: 'oid-s' } } },
      { upn: 'Haribabu@neramclasses.com', role: 'presenter', identity: { user: { id: 'oid-hari' } } },
    ]);
  });

  it('falls back to organizer-only, never organization, when Graph refuses the list', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init?.method) return reply(200, { participants: { attendees: [] } });
      const body = JSON.parse(String(init.body));
      bodies.push(body);
      return reply(body.participants ? 400 : 200);
    });
    const out = await applyMeetingOptions('t', { kind: 'me' }, 'MSo1', { allowedPresenters: 'roleIsPresenter', recordAutomatically: true, presenters: [HARI] }, fetchImpl as never);
    expect(out).toEqual({ presenters: false, record: true, status: 400, presentersFallback: true });
    expect(bodies[bodies.length - 1]).toEqual({ allowedPresenters: 'organizer' });
    expect(bodies.some((b) => b.allowedPresenters === 'organization' || b.allowedPresenters === 'everyone')).toBe(false);
  });

  it('does not PATCH the list when the current one cannot be read', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => reply(init?.method ? 200 : 403));
    const out = await applyMeetingOptions('t', { kind: 'me' }, 'MSo1', { allowedPresenters: 'roleIsPresenter', presenters: [HARI] }, fetchImpl as never);
    expect(out.presenters).toBe(false);
    expect(out.presentersFallback).toBe(true);
    const patched = fetchImpl.mock.calls.filter((c) => c[1]?.method === 'PATCH').map((c) => JSON.parse(String(c[1]?.body)));
    expect(patched).toEqual([{ allowedPresenters: 'organizer' }]);
  });
});
