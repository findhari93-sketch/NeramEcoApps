import { describe, it, expect } from 'vitest';
import { isFocusedRoute } from './focused-routes';

describe('isFocusedRoute', () => {
  it.each([
    ['/apply', true],
    ['/apply/', true],
    ['/ta/apply', true],
    ['/hi/apply', true],
    ['/kn/apply', true],
    ['/ml/apply', true],
    ['/en/apply', true],
    ['/pay', true],
    ['/pay?app=NERAM-2609-00012', true],
    ['/pay/link/abc123', true],
    ['/ta/pay', true],
    ['/enroll', true],
    ['/enroll?token=xyz', true],
    ['/ta/enroll', true],
  ])('%s is focused', (path, expected) => {
    expect(isFocusedRoute(path)).toBe(expected);
  });

  it.each([
    ['/', false],
    ['/apply-now', false],
    ['/applying', false],
    ['/fees', false],
    ['/ta', false],
    ['/ta/fees', false],
    ['/payments', false],
    ['/enrollment-guide', false],
    ['/colleges/apply', false],
    [null, false],
    [undefined, false],
    ['', false],
  ])('%s is not focused', (path, expected) => {
    expect(isFocusedRoute(path as string)).toBe(expected);
  });
});
