import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  isSafeInternalPath,
  rememberReturnPath,
  takeReturnPath,
  loginUrlWithReturn,
} from './return-path';

describe('isSafeInternalPath', () => {
  it('accepts an ordinary site-relative path', () => {
    expect(isSafeInternalPath('/student/assignments/126332cf')).toBe(true);
  });

  it('accepts a query string and a fragment, which shared links carry', () => {
    expect(isSafeInternalPath('/student/assignments/x?tab=brief#top')).toBe(true);
  });

  // The whole reason this function exists: the value arrives from a query
  // parameter on a URL anyone can paste into a chat.
  it('rejects a protocol-relative URL, which navigates off-origin', () => {
    expect(isSafeInternalPath('//evil.com')).toBe(false);
    expect(isSafeInternalPath('//evil.com/student/assignments/x')).toBe(false);
  });

  it('rejects an absolute URL', () => {
    expect(isSafeInternalPath('https://evil.com')).toBe(false);
    expect(isSafeInternalPath('http://nexus.neramclasses.com/student')).toBe(false);
  });

  it('rejects a javascript: or data: scheme', () => {
    expect(isSafeInternalPath('javascript:alert(1)')).toBe(false);
    expect(isSafeInternalPath('data:text/html,<script>')).toBe(false);
  });

  it('rejects a backslash, which some browsers normalise into a slash', () => {
    expect(isSafeInternalPath('/\\evil.com')).toBe(false);
    expect(isSafeInternalPath('\\\\evil.com')).toBe(false);
  });

  it('rejects control characters used to smuggle a scheme past a naive check', () => {
    expect(isSafeInternalPath('/\njavascript:alert(1)')).toBe(false);
    expect(isSafeInternalPath('/\tfoo')).toBe(false);
  });

  it('rejects a bare word, an empty string and a non-string', () => {
    expect(isSafeInternalPath('evil')).toBe(false);
    expect(isSafeInternalPath('')).toBe(false);
    expect(isSafeInternalPath('   ')).toBe(false);
    expect(isSafeInternalPath(null)).toBe(false);
    expect(isSafeInternalPath(undefined)).toBe(false);
    expect(isSafeInternalPath(42)).toBe(false);
  });
});

describe('rememberReturnPath / takeReturnPath', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the remembered path', () => {
    rememberReturnPath('/student/assignments/abc');
    expect(takeReturnPath()).toBe('/student/assignments/abc');
  });

  it('is single use, so a later visit to the root does not bounce again', () => {
    rememberReturnPath('/student/assignments/abc');
    expect(takeReturnPath()).toBe('/student/assignments/abc');
    expect(takeReturnPath()).toBeNull();
  });

  it('returns null when nothing was remembered', () => {
    expect(takeReturnPath()).toBeNull();
  });

  it('never remembers an unsafe path', () => {
    rememberReturnPath('//evil.com');
    expect(takeReturnPath()).toBeNull();
  });

  // Remembering /login turns a bounced sign-in into a loop back to /login.
  it('never remembers the login screens or the root', () => {
    rememberReturnPath('/login');
    expect(takeReturnPath()).toBeNull();
    rememberReturnPath('/parent/login');
    expect(takeReturnPath()).toBeNull();
    rememberReturnPath('/');
    expect(takeReturnPath()).toBeNull();
  });

  it('expires, so yesterday abandoned link cannot hijack today login', () => {
    rememberReturnPath('/student/assignments/abc');
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 11 * 60 * 1000);
    expect(takeReturnPath()).toBeNull();
  });

  it('treats an unparseable stash as absent rather than trusting it', () => {
    window.sessionStorage.setItem('nexus_return_path', 'not json');
    expect(takeReturnPath()).toBeNull();
  });

  // A stash written by an older build, or tampered with by hand, must still go
  // through the same validation as a fresh query parameter.
  it('re-validates the stored path on the way out', () => {
    window.sessionStorage.setItem(
      'nexus_return_path',
      JSON.stringify({ path: 'https://evil.com', at: Date.now() }),
    );
    expect(takeReturnPath()).toBeNull();
  });
});

describe('loginUrlWithReturn', () => {
  beforeEach(() => window.sessionStorage.clear());

  it('carries the destination in the query AND the stash, one per sign-in flow', () => {
    const url = loginUrlWithReturn('/login', '/student/assignments/abc');
    expect(url).toBe('/login?next=%2Fstudent%2Fassignments%2Fabc');
    expect(takeReturnPath()).toBe('/student/assignments/abc');
  });

  it('encodes a path with a query string so the outer parameter survives', () => {
    const url = loginUrlWithReturn('/login', '/student/assignments/abc?tab=brief');
    expect(url).toBe('/login?next=%2Fstudent%2Fassignments%2Fabc%3Ftab%3Dbrief');
    expect(new URL(url, 'https://x.test').searchParams.get('next')).toBe(
      '/student/assignments/abc?tab=brief',
    );
  });

  it('falls back to the bare login path when the destination is unsafe', () => {
    expect(loginUrlWithReturn('/login', '//evil.com')).toBe('/login');
    expect(loginUrlWithReturn('/parent/login', null)).toBe('/parent/login');
  });
});
