import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEnrollmentDraftSync, DRAFT_SYNC_DEBOUNCE_MS } from './useEnrollmentDraftSync';

/**
 * Checkpoints the wizard to the link: at once when the step changes, a few
 * seconds after the last edit otherwise, and when the tab goes away. Never
 * twice for the same state, never once the link has closed.
 */

const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, data: { savedAt: '2026-10-20T18:00:00.000Z' } }), { status: 200 }));
const getIdToken = vi.fn(async () => 'id-token');
const form = (firstName: string) => ({ personal: { firstName }, location: {}, academic: {}, payment: {}, course: { x: 1 } });

type Sent = { method: string; url: string; body: any; keepalive?: boolean; auth?: string | null };
function sent(): Sent[] {
  return (fetchMock.mock.calls as unknown as Array<[string, RequestInit]>).map(([url, init]) => ({
    method: String(init.method),
    url,
    body: init.body ? JSON.parse(String(init.body)) : null,
    keepalive: init.keepalive,
    auth: (init.headers as Record<string, string>)?.Authorization || null,
  }));
}

function setup(initial: { enabled?: boolean; step?: number; formData?: Record<string, unknown> } = {}) {
  return renderHook((props: { enabled: boolean; step: number; formData: Record<string, unknown> }) => useEnrollmentDraftSync({ token: 'tok', getIdToken, ...props }), {
    initialProps: { enabled: initial.enabled ?? true, step: initial.step ?? 0, formData: initial.formData ?? form('') },
  });
}

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockClear();
  getIdToken.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useEnrollmentDraftSync', () => {
  it('does not send the state it was enabled with', async () => {
    setup({ step: 1, formData: form('Radhika') });
    await act(async () => {
      vi.advanceTimersByTime(DRAFT_SYNC_DEBOUNCE_MS * 2);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends at once when the step changes, with the sign-in and only the wizard sections', async () => {
    const h = setup({ step: 0, formData: form('Radhika') });
    h.rerender({ enabled: true, step: 1, formData: form('Radhika') });
    await flush();
    const [put] = sent();
    expect(put.method).toBe('PUT');
    expect(put.url).toBe('/api/enroll/draft');
    expect(put.auth).toBe('Bearer id-token');
    expect(put.body).toEqual({ token: 'tok', step: 1, formData: { personal: { firstName: 'Radhika' }, location: {}, academic: {}, payment: {} } });
    expect(h.result.current.status).toBe('saved');
    expect(h.result.current.savedAt).toBe('2026-10-20T18:00:00.000Z');
  });

  it('waits after an edit, then sends once for a burst of edits', async () => {
    const h = setup({ step: 1, formData: form('R') });
    h.rerender({ enabled: true, step: 1, formData: form('Ra') });
    h.rerender({ enabled: true, step: 1, formData: form('Rad') });
    await act(async () => {
      vi.advanceTimersByTime(DRAFT_SYNC_DEBOUNCE_MS - 50);
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(h.result.current.status).toBe('pending');
    await act(async () => {
      vi.advanceTimersByTime(60);
    });
    await flush();
    expect(sent()).toHaveLength(1);
    expect(sent()[0].body.formData.personal.firstName).toBe('Rad');
  });

  it('flushes a pending edit when the page is hidden, with keepalive', async () => {
    const h = setup({ step: 0, formData: form('R') });
    h.rerender({ enabled: true, step: 1, formData: form('R') });
    await flush();
    h.rerender({ enabled: true, step: 1, formData: form('Radhika') });
    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
    });
    await flush();
    expect(sent()).toHaveLength(2);
    expect(sent()[1].keepalive).toBe(true);
    expect(sent()[1].body.formData.personal.firstName).toBe('Radhika');
  });

  it('sends nothing while disabled', async () => {
    const h = setup({ enabled: false, step: 0 });
    h.rerender({ enabled: false, step: 2, formData: form('X') });
    await act(async () => {
      vi.advanceTimersByTime(DRAFT_SYNC_DEBOUNCE_MS * 2);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stops for good once the link answers NOT_ACTIVE', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'closed', code: 'NOT_ACTIVE' }), { status: 409 }));
    const h = setup({ step: 0 });
    h.rerender({ enabled: true, step: 1, formData: form('') });
    await flush();
    h.rerender({ enabled: true, step: 2, formData: form('') });
    await flush();
    expect(sent()).toHaveLength(1);
    expect(h.result.current.status).toBe('idle');
  });

  it('reports an error and tries again on the next change', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    const h = setup({ step: 0 });
    h.rerender({ enabled: true, step: 1, formData: form('') });
    await flush();
    expect(h.result.current.status).toBe('error');
    h.rerender({ enabled: true, step: 2, formData: form('') });
    await flush();
    expect(sent()).toHaveLength(2);
    expect(h.result.current.status).toBe('saved');
  });

  it('clear() deletes the draft on the link', async () => {
    const h = setup({ step: 0 });
    await act(async () => {
      await h.result.current.clear();
    });
    const [del] = sent();
    expect(del.method).toBe('DELETE');
    expect(del.url).toBe('/api/enroll/draft?token=tok');
    expect(del.auth).toBe('Bearer id-token');
  });
});
