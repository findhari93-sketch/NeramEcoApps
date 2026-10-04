import { describe, it, expect } from 'vitest';
import { pushRecent } from './recent-tools';
import { TOOL_CATALOG, findToolByPath, trackFromPath, isNavActive } from './navigation-data';

describe('pushRecent', () => {
  it('puts the newest id first', () => {
    expect(pushRecent(['a', 'b'], 'c')).toEqual(['c', 'a', 'b']);
  });

  it('moves an existing id to the front instead of duplicating it', () => {
    expect(pushRecent(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c']);
  });

  it('caps the list', () => {
    expect(pushRecent(['a', 'b', 'c'], 'd', 3)).toEqual(['d', 'a', 'b']);
  });

  it('handles an empty list', () => {
    expect(pushRecent([], 'a')).toEqual(['a']);
  });
});

describe('tool catalog', () => {
  it('has unique ids and hrefs', () => {
    const ids = TOOL_CATALOG.map((t) => t.id);
    const hrefs = TOOL_CATALOG.map((t) => t.href);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('never uses em dashes or double dashes in visible copy', () => {
    for (const t of TOOL_CATALOG) {
      for (const text of [t.title, t.shortTitle ?? '', t.description]) {
        expect(text).not.toMatch(/—|--/);
      }
    }
  });

  it('finds the tool for nested routes', () => {
    expect(findToolByPath('/tools/nata/question-bank/123')?.id).toBe('nata-question-bank');
    expect(findToolByPath('/tools/nata/cutoff-calculator')?.id).toBe('nata-cutoff-calculator');
    expect(findToolByPath('/tools/all')).toBeUndefined();
  });

  it('maps a path to its track', () => {
    expect(trackFromPath('/tools/counseling/insights')).toBe('counseling');
    expect(trackFromPath('/tools/jee/seat-matrix')).toBe('jee');
    expect(trackFromPath('/tools/nata/exam-planner')).toBe('nata');
    expect(trackFromPath('/dashboard')).toBeNull();
  });
});

describe('isNavActive', () => {
  it('lights the Tools tab for every tools route', () => {
    expect(isNavActive('/tools/all', '/tools/all', '/tools')).toBe(true);
    expect(isNavActive('/tools/nata/cutoff-calculator', '/tools/all', '/tools')).toBe(true);
    expect(isNavActive('/toolsx', '/tools/all', '/tools')).toBe(false);
  });

  it('matches Home only on the dashboard itself', () => {
    expect(isNavActive('/dashboard', '/dashboard')).toBe(true);
    expect(isNavActive('/dashboard/x', '/dashboard')).toBe(false);
  });

  it('matches nested account pages', () => {
    expect(isNavActive('/support/abc', '/support')).toBe(true);
    expect(isNavActive('/profile', '/support')).toBe(false);
  });
});
