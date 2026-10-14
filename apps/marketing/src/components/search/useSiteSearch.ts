'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { searchPages, type SearchEntry, type GroupedResults, type SearchCategory } from '@/lib/search-index';

// ─── Recent searches helpers ──────────────────────────────────────

const RECENT_KEY = 'neram_recent_searches';
const SESSION_KEY = 'neram_search_session';
const MAX_RECENT = 5;

function getSessionId(): string {
  try {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return '';
  }
}

function getRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(query: string): void {
  try {
    const trimmed = query.trim();
    if (!trimmed) return;
    const existing = getRecentSearches().filter((q) => q !== trimmed);
    localStorage.setItem(RECENT_KEY, JSON.stringify([trimmed, ...existing].slice(0, MAX_RECENT)));
  } catch {
    // ignore
  }
}

// ─── Analytics ───────────────────────────────────────────────────

/** Matches the body /api/analytics/search validates (event_type, query, result_*). */
function trackSearchEvent(
  eventType: 'query' | 'click' | 'no_results',
  data: { query: string; result_path?: string; result_position?: number; result_count?: number },
): void {
  try {
    if (typeof navigator === 'undefined' || !navigator.sendBeacon) return;
    const payload = JSON.stringify({ event_type: eventType, session_id: getSessionId(), ...data });
    navigator.sendBeacon('/api/analytics/search', new Blob([payload], { type: 'application/json' }));
  } catch {
    // never throw
  }
}

// Each search category's listing page; categories without one get no "+N more" link.
export const CATEGORY_LISTING_PATH: Partial<Record<SearchCategory, string>> = {
  college: '/colleges',
  course: '/courses',
  tool: '/tools',
  nata: '/nata-2026',
  coaching: '/coaching',
  counseling: '/counseling',
  blog: '/blog',
};

/**
 * Site search state shared by the phone dialog and the inline header search:
 * query, grouped results, keyboard selection, recent searches and navigation.
 * `onNavigate` runs before every route change so the caller can close itself.
 */
export function useSiteSearch(onNavigate: () => void) {
  const [query, setQuery] = useState('');
  const [groupedResults, setGroupedResults] = useState<GroupedResults[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flatResults = useMemo<SearchEntry[]>(() => groupedResults.flatMap((g) => g.results), [groupedResults]);

  const reset = useCallback(() => {
    setQuery('');
    setGroupedResults([]);
    setSelectedIndex(0);
    setRecentSearches(getRecentSearches());
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setGroupedResults([]);
      setSelectedIndex(0);
      return;
    }
    const results = searchPages(trimmed);
    setGroupedResults(results);
    setSelectedIndex(0);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const total = results.reduce((sum, g) => sum + g.results.length, 0);
      trackSearchEvent(total === 0 ? 'no_results' : 'query', { query: trimmed, result_count: total });
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const navigateTo = useCallback(
    (path: string, entry?: SearchEntry) => {
      const trimmed = query.trim();
      if (trimmed) saveRecentSearch(trimmed);
      if (entry && trimmed) {
        trackSearchEvent('click', { query: trimmed, result_path: path, result_position: flatResults.indexOf(entry) + 1 });
      }
      onNavigate();
      router.push(path);
    },
    [onNavigate, router, query, flatResults],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!flatResults.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, flatResults.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && flatResults[selectedIndex]) {
        e.preventDefault();
        navigateTo(flatResults[selectedIndex].path, flatResults[selectedIndex]);
      }
    },
    [flatResults, selectedIndex, navigateTo],
  );

  const openCategory = useCallback(
    (category: SearchCategory) => {
      if (category === 'college') {
        onNavigate();
        router.push(`/colleges?q=${encodeURIComponent(query)}#browse`);
        // Force the scroll even when already on /colleges?q=<same> (router.push is a no-op then).
        window.setTimeout(() => {
          document.getElementById('browse')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 120);
        return;
      }
      const path = CATEGORY_LISTING_PATH[category];
      if (!path) return;
      onNavigate();
      router.push(path);
    },
    [onNavigate, router, query],
  );

  const clearRecent = useCallback(() => {
    try {
      localStorage.removeItem(RECENT_KEY);
    } catch {
      // ignore
    }
    setRecentSearches([]);
  }, []);

  return {
    query,
    setQuery,
    groupedResults,
    flatResults,
    selectedIndex,
    recentSearches,
    clearRecent,
    reset,
    navigateTo,
    handleKeyDown,
    openCategory,
  };
}

export type SiteSearch = ReturnType<typeof useSiteSearch>;
