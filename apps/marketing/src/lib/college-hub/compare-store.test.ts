import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COMPARE_EVENT,
  COMPARE_STORAGE_KEY,
  addToCompareList,
  clearCompareList,
  compareHref,
  parseCompareList,
  readCompareList,
  removeFromCompareList,
} from './compare-store';

const entry = (slug: string) => ({ slug, name: `${slug} College`, shortName: slug.toUpperCase() });

describe('compare store', () => {
  beforeEach(() => window.localStorage.clear());

  it('reads the old slug-only format with names from the slug', () => {
    const list = parseCompareList(JSON.stringify(['sir-jj-college-architecture', 'msec']));
    expect(list.map((e) => e.slug)).toEqual(['sir-jj-college-architecture', 'msec']);
    expect(list[0].name).toBe('Sir Jj College');
  });

  it('drops junk and duplicates', () => {
    expect(parseCompareList('not json')).toEqual([]);
    expect(parseCompareList('{"a":1}')).toEqual([]);
    expect(parseCompareList(JSON.stringify(['a', 'a', 7, null])).map((e) => e.slug)).toEqual(['a']);
  });

  it('adds up to 4 and reports a full list', () => {
    for (const s of ['a', 'b', 'c', 'd']) expect(addToCompareList(entry(s))).toBe('added');
    expect(addToCompareList(entry('e'))).toBe('full');
    expect(readCompareList()).toHaveLength(4);
  });

  it('refreshes a legacy entry with the real name instead of adding twice', () => {
    window.localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(['msec']));
    expect(addToCompareList({ slug: 'msec', name: 'Mohamed Sathak Engineering College', shortName: 'MSEC' })).toBe('exists');
    expect(readCompareList()).toEqual([{ slug: 'msec', name: 'Mohamed Sathak Engineering College', shortName: 'MSEC', stateSlug: null }]);
  });

  it('removes, clears and notifies listeners', () => {
    const spy = vi.fn();
    window.addEventListener(COMPARE_EVENT, spy);
    addToCompareList(entry('a'));
    addToCompareList(entry('b'));
    removeFromCompareList('a');
    expect(readCompareList().map((e) => e.slug)).toEqual(['b']);
    clearCompareList();
    expect(readCompareList()).toEqual([]);
    expect(spy).toHaveBeenCalledTimes(4);
    window.removeEventListener(COMPARE_EVENT, spy);
  });

  it('builds the compare page link', () => {
    expect(compareHref([{ slug: 'a' }, { slug: 'b c' }])).toBe('/colleges/compare?slugs=a,b%20c');
  });
});
