'use client';

/**
 * One compare list for the whole site: the directory checkboxes, the compare
 * tray and /colleges/compare all read and write it.
 *
 * Stored in localStorage under the original key. Entries used to be bare slugs
 * (and the tray made names up from them); they are now { slug, name, shortName }.
 * Old string entries are read as slugs with a name derived from the slug until
 * the college is added again.
 */
import { useCallback, useEffect, useState } from 'react';
import { COMPARE_MAX } from './constants';

export const COMPARE_STORAGE_KEY = 'neram_compare_colleges';
export const COMPARE_EVENT = 'compare-updated';
export const COMPARE_LIMIT_EVENT = 'compare-limit';

export interface CompareEntry {
  slug: string;
  name: string;
  shortName: string;
  stateSlug?: string | null;
}

function nameFromSlug(slug: string): string {
  return slug
    .replace(/-architecture$/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Parses whatever is stored (old string[] or new entries), dropping junk. */
export function parseCompareList(raw: string | null): CompareEntry[] {
  if (!raw) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  const out: CompareEntry[] = [];
  for (const item of value) {
    if (typeof item === 'string' && item) {
      const name = nameFromSlug(item);
      out.push({ slug: item, name, shortName: name });
    } else if (item && typeof item === 'object' && typeof (item as CompareEntry).slug === 'string') {
      const e = item as CompareEntry;
      const name = e.name || nameFromSlug(e.slug);
      out.push({ slug: e.slug, name, shortName: e.shortName || name, stateSlug: e.stateSlug ?? null });
    }
    if (out.length >= COMPARE_MAX) break;
  }
  // Drop duplicates, keep first.
  return out.filter((e, i) => out.findIndex((x) => x.slug === e.slug) === i);
}

export function readCompareList(): CompareEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    return parseCompareList(window.localStorage.getItem(COMPARE_STORAGE_KEY));
  } catch {
    return [];
  }
}

function write(list: CompareEntry[]) {
  try {
    window.localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(list.slice(0, COMPARE_MAX)));
  } catch {
    // Storage blocked (private mode): the list lives for this page only.
  }
  window.dispatchEvent(new Event(COMPARE_EVENT));
}

export type AddResult = 'added' | 'exists' | 'full';

export function addToCompareList(entry: CompareEntry): AddResult {
  const list = readCompareList();
  if (list.some((e) => e.slug === entry.slug)) {
    // Refresh a slug-only legacy entry with the real name.
    write(list.map((e) => (e.slug === entry.slug ? { ...e, ...entry } : e)));
    return 'exists';
  }
  if (list.length >= COMPARE_MAX) return 'full';
  write([...list, entry]);
  return 'added';
}

export function removeFromCompareList(slug: string) {
  write(readCompareList().filter((e) => e.slug !== slug));
}

export function clearCompareList() {
  write([]);
}

export function compareHref(list: readonly { slug: string }[]): string {
  return `/colleges/compare?slugs=${list.map((e) => encodeURIComponent(e.slug)).join(',')}`;
}

/**
 * React view of the compare list. `toggle` returns 'full' when the list is at
 * the limit so the caller can say "You can compare up to 4 colleges".
 */
export function useCompareList() {
  const [list, setList] = useState<CompareEntry[]>([]);

  useEffect(() => {
    const refresh = () => setList(readCompareList());
    refresh();
    window.addEventListener(COMPARE_EVENT, refresh);
    // Another tab changed the list.
    const onStorage = (e: StorageEvent) => {
      if (e.key === COMPARE_STORAGE_KEY) refresh();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(COMPARE_EVENT, refresh);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const has = useCallback((slug: string) => list.some((e) => e.slug === slug), [list]);

  const toggle = useCallback((entry: CompareEntry): AddResult | 'removed' => {
    if (readCompareList().some((e) => e.slug === entry.slug)) {
      removeFromCompareList(entry.slug);
      return 'removed';
    }
    const result = addToCompareList(entry);
    if (result === 'full') {
      // The tray shows "You can compare up to 4 colleges".
      window.dispatchEvent(new CustomEvent(COMPARE_LIMIT_EVENT, { detail: { name: entry.shortName } }));
    }
    return result;
  }, []);

  return {
    list,
    count: list.length,
    isFull: list.length >= COMPARE_MAX,
    has,
    toggle,
    remove: removeFromCompareList,
    clear: clearCompareList,
  };
}
