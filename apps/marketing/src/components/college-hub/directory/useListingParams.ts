'use client';

import { useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { ViewMode } from '../view-mode';
import { draftToQuery, type FilterDraft } from './filter-model';

type Params = { get(key: string): string | null };

/**
 * URL navigation for the directory. It takes the params object instead of
 * calling useSearchParams so the server-rendered fallback (no params) can use
 * it too. Every change pushes a history entry, so Back walks through filter
 * changes; scroll stays put.
 */
export function useDirectoryNav(params: Params) {
  const router = useRouter();
  const pathname = usePathname();

  const go = useCallback(
    (query: URLSearchParams, hash?: string) => {
      const qs = query.toString();
      router.push(`${pathname}${qs ? `?${qs}` : ''}${hash ?? ''}`, { scroll: false });
    },
    [router, pathname]
  );

  /** Applies a whole filter draft; keeps the view, resets the page. */
  const applyDraft = useCallback(
    (draft: FilterDraft) => {
      const q = draftToQuery(draft);
      const view = params.get('view');
      if (view) q.set('view', view);
      go(q);
    },
    [params, go]
  );

  /** URL of the same results in another view (a real link, so it works before hydration). */
  const viewHref = useCallback(
    (view: ViewMode) => {
      const q = new URLSearchParams(params instanceof URLSearchParams ? params.toString() : '');
      if (view === 'list') q.delete('view');
      else q.set('view', view);
      const qs = q.toString();
      return `${pathname}${qs ? `?${qs}` : ''}`;
    },
    [params, pathname]
  );

  const setView = useCallback(
    (view: ViewMode) => {
      router.push(viewHref(view), { scroll: false });
    },
    [router, viewHref]
  );

  const clearAll = useCallback(() => {
    const view = params.get('view');
    go(new URLSearchParams(view ? { view } : {}));
  }, [params, go]);

  return { applyDraft, setView, viewHref, clearAll };
}
