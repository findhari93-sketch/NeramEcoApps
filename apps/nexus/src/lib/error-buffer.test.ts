import { describe, it, expect, beforeAll } from 'vitest';
import { installErrorCapture, getRecentErrors, recordError } from './error-buffer';

describe('error-buffer', () => {
  beforeAll(() => {
    // Provide a controllable fetch BEFORE install so the wrapper wraps it.
    (window as unknown as { fetch: typeof fetch }).fetch = (async (input: unknown) => {
      if (String(input).includes('/fail')) {
        return { ok: false, status: 503, clone: () => ({ text: async () => 'boom-body' }) };
      }
      return { ok: true, status: 200, clone: () => ({ text: async () => '' }) };
    }) as unknown as typeof fetch;
    installErrorCapture();
  });

  it('records explicit errors newest-first', () => {
    recordError({ message: 'first' });
    recordError({ message: 'second' });
    const recent = getRecentErrors();
    expect(recent[0].message).toBe('second');
    expect(recent[1].message).toBe('first');
  });

  it('captures console.error output', () => {
    console.error('boom-console', { a: 1 });
    expect(getRecentErrors()[0].message).toContain('boom-console');
    expect(getRecentErrors()[0].level).toBe('error');
  });

  it('captures window error events', () => {
    window.dispatchEvent(new ErrorEvent('error', { message: 'window-oops' }));
    expect(getRecentErrors()[0].message).toContain('window-oops');
  });

  it('captures failed fetch responses with status + url', async () => {
    await window.fetch('/api/fail');
    const top = getRecentErrors()[0];
    expect(top.status).toBe(503);
    expect(top.message).toContain('/api/fail');
    expect(top.message).toContain('boom-body');
  });

  it('does not record successful fetches', async () => {
    const before = getRecentErrors()[0]?.message;
    await window.fetch('/api/ok');
    expect(getRecentErrors()[0]?.message).toBe(before);
  });

  it('caps the buffer at 50 entries (newest kept)', () => {
    for (let i = 0; i < 60; i++) recordError({ message: `bulk-${i}` });
    const recent = getRecentErrors();
    expect(recent.length).toBeLessThanOrEqual(50);
    expect(recent[0].message).toBe('bulk-59');
  });
});
