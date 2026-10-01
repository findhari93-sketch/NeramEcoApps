import { describe, expect, it, vi } from 'vitest';
import { applyMeetingOptions, findOnlineMeetingId, readAllowedPresenters } from './meeting-options';

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
