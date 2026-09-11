import { describe, it, expect } from 'vitest';
import { isGuardedNavigation } from './leave-guard';

/**
 * Which clicks would take a teacher away from unsaved checkpoints.
 *
 * The old editor had no guard at all, so its Back button, the sidebar and the
 * bottom navigation all threw away edits without a word. Only a click that would
 * really replace this page in this tab is stopped; a new tab, another site or a
 * jump within the page is left alone.
 */

const here = {
  origin: 'https://nexus.neramclasses.com',
  pathname: '/teacher/study-materials/f1/recordings/t1/checkpoints',
  search: '',
  hash: '',
};

const click = (over: Partial<Parameters<typeof isGuardedNavigation>[1]> = {}) => ({
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  defaultPrevented: false,
  ...over,
});

describe('isGuardedNavigation', () => {
  it('guards a plain click to another page of the app', () => {
    expect(isGuardedNavigation({ href: '/teacher/study-materials' }, click(), here)).toBe(true);
    expect(isGuardedNavigation({ href: 'https://nexus.neramclasses.com/teacher/dashboard' }, click(), here)).toBe(true);
  });

  it('lets through a click that opens a new tab', () => {
    expect(isGuardedNavigation({ href: '/teacher/x', target: '_blank' }, click(), here)).toBe(false);
    expect(isGuardedNavigation({ href: '/teacher/x' }, click({ ctrlKey: true }), here)).toBe(false);
    expect(isGuardedNavigation({ href: '/teacher/x' }, click({ metaKey: true }), here)).toBe(false);
    expect(isGuardedNavigation({ href: '/teacher/x' }, click({ shiftKey: true }), here)).toBe(false);
    expect(isGuardedNavigation({ href: '/teacher/x' }, click({ button: 1 }), here)).toBe(false);
  });

  it('leaves a link to another site to the browser, which asks on its own', () => {
    expect(
      isGuardedNavigation({ href: 'https://nerasmclasses.sharepoint.com/sites/NeramStorage/x.mp4' }, click(), here),
    ).toBe(false);
  });

  it('ignores a jump within this page', () => {
    expect(isGuardedNavigation({ href: '#checkpoint-2' }, click(), here)).toBe(false);
  });

  it('ignores a download, and a click something else already handled', () => {
    expect(isGuardedNavigation({ href: '/api/file', download: true }, click(), here)).toBe(false);
    expect(isGuardedNavigation({ href: '/teacher/x' }, click({ defaultPrevented: true }), here)).toBe(false);
  });

  it('ignores a link with no usable address', () => {
    expect(isGuardedNavigation({ href: 'javascript:void(0)' }, click(), here)).toBe(false);
    expect(isGuardedNavigation({ href: 'mailto:someone@neramclasses.com' }, click(), here)).toBe(false);
  });
});
