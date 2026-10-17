// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { callNexusInternal, NEXUS_RETRY_MESSAGE, NEXUS_STALE_MESSAGE, RESOLUTION_RETRY_MESSAGE } from './record-check-delivery';

function fakeFetch(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch;
}

const ORIGIN = 'http://localhost:3012/';

describe('callNexusInternal', () => {
  it('posts to the internal route with the bearer token and returns the staff sentence', async () => {
    const f = fakeFetch(200, { ok: true, channel: 'teams', summary: 'Sent in Teams.' });
    const out = await callNexusInternal({ action: 'send', checkId: 'c1' }, { origin: ORIGIN, token: 'tok', fetchImpl: f });
    expect(out).toEqual({ delivered: true, stale: false, channel: 'teams', message: 'Sent in Teams.' });
    const [url, init] = (f as any).mock.calls[0];
    expect(url).toBe('http://localhost:3012/api/internal/student-record-check');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body)).toEqual({ action: 'send', checkId: 'c1' });
  });

  it('without a token, does not call and tells staff it will retry', async () => {
    const f = fakeFetch(200, {});
    const out = await callNexusInternal({ action: 'send', checkId: 'c1' }, { origin: ORIGIN, token: '', fetchImpl: f });
    expect(f).not.toHaveBeenCalled();
    expect(out.delivered).toBe(false);
    expect(out.message).toBe(NEXUS_RETRY_MESSAGE);
  });

  it('a 5xx, a 401 or a network error leaves it for the daily retry', async () => {
    for (const f of [fakeFetch(500, {}), fakeFetch(401, { error: 'no' })]) {
      const out = await callNexusInternal({ action: 'send', checkId: 'c1' }, { origin: ORIGIN, token: 't', fetchImpl: f });
      expect(out).toMatchObject({ delivered: false, stale: false, message: NEXUS_RETRY_MESSAGE });
    }
    const broken = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const out = await callNexusInternal({ action: 'send', checkId: 'c1' }, { origin: ORIGIN, token: 't', fetchImpl: broken });
    expect(out.message).toBe(NEXUS_RETRY_MESSAGE);
  });

  it('409 means the check is no longer queued', async () => {
    const out = await callNexusInternal({ action: 'send', checkId: 'c1' }, { origin: ORIGIN, token: 't', fetchImpl: fakeFetch(409, {}) });
    expect(out).toMatchObject({ delivered: false, stale: true, message: NEXUS_STALE_MESSAGE });
  });

  it('a "failed" channel counts as not delivered', async () => {
    const out = await callNexusInternal(
      { action: 'send', checkId: 'c1' },
      { origin: ORIGIN, token: 't', fetchImpl: fakeFetch(200, { ok: true, channel: 'failed', summary: 'Could not reach them.' }) },
    );
    expect(out).toMatchObject({ delivered: false, channel: 'failed', message: NEXUS_RETRY_MESSAGE });
  });

  it('a resolution that fails gets its own message', async () => {
    const out = await callNexusInternal({ action: 'resolution', reportId: 'r1' }, { origin: ORIGIN, token: 't', fetchImpl: fakeFetch(502, {}) });
    expect(out.message).toBe(RESOLUTION_RETRY_MESSAGE);
  });

  it('staff copy has no dashes', () => {
    for (const m of [NEXUS_RETRY_MESSAGE, NEXUS_STALE_MESSAGE, RESOLUTION_RETRY_MESSAGE]) expect(m).not.toMatch(/—|--/);
  });
});
