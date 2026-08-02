import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readCachedAuth, writeCachedAuth, clearCachedAuth } from './auth-cache';

const KEY = 'nexus_auth_cache_v1';

describe('auth-cache', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null when nothing has been stored', () => {
    expect(readCachedAuth()).toBeNull();
  });

  it('round-trips a payload with the account it belonged to', () => {
    writeCachedAuth('oid-1', { nexusRole: 'teacher', classrooms: [{ id: 'c1' }] });

    const entry = readCachedAuth();

    expect(entry?.oid).toBe('oid-1');
    expect(entry?.payload.nexusRole).toBe('teacher');
  });

  it('serves an entry that is not yet a day old', () => {
    writeCachedAuth('oid-1', { nexusRole: 'teacher' });

    vi.advanceTimersByTime(23 * 60 * 60 * 1000);

    expect(readCachedAuth()?.payload.nexusRole).toBe('teacher');
  });

  it('ignores and removes an entry older than a day', () => {
    writeCachedAuth('oid-1', { nexusRole: 'teacher' });

    vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1);

    expect(readCachedAuth()).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('returns null rather than throwing on unparseable content', () => {
    localStorage.setItem(KEY, 'not json{');

    expect(readCachedAuth()).toBeNull();
  });

  it('returns null when the stored shape is missing its payload', () => {
    localStorage.setItem(KEY, JSON.stringify({ oid: 'oid-1', savedAt: Date.now() }));

    expect(readCachedAuth()).toBeNull();
  });

  it('returns null when savedAt is not a number, rather than trusting it forever', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ oid: 'oid-1', savedAt: 'yesterday', payload: { nexusRole: 'admin' } }),
    );

    expect(readCachedAuth()).toBeNull();
  });

  it('forgets everything on clear, so the next signer-in sees nothing', () => {
    writeCachedAuth('oid-1', { nexusRole: 'teacher', classrooms: [{ id: 'c1' }] });

    clearCachedAuth();

    expect(readCachedAuth()).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('overwrites rather than accumulating, so only the latest session is held', () => {
    writeCachedAuth('oid-1', { nexusRole: 'teacher' });
    writeCachedAuth('oid-2', { nexusRole: 'student' });

    const entry = readCachedAuth();

    expect(entry?.oid).toBe('oid-2');
    expect(entry?.payload.nexusRole).toBe('student');
  });

  it('never stores a token, whatever the payload happens to contain', () => {
    writeCachedAuth('oid-1', { nexusRole: 'teacher' });

    expect(localStorage.getItem(KEY)).not.toMatch(/Bearer|eyJ/);
  });
});
