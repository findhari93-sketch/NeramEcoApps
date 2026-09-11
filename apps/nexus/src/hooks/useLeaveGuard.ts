'use client';

/**
 * Stop a teacher leaving unsaved work by accident.
 *
 * Three ways out are covered:
 *   - closing or refreshing the tab, through beforeunload, which the browser
 *     answers with its own prompt;
 *   - any in-app link: the page's back arrow, breadcrumbs, the sidebar and the
 *     bottom navigation are all next/link anchors, caught in the capture phase
 *     before Next can navigate;
 *   - the page's own buttons, which call `navigate`.
 *
 * The browser's Back button is not intercepted. The App Router gives no hook for
 * it, and the history tricks that fake one break Back itself. The editor keeps a
 * sessionStorage backup instead and offers it on the next visit.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { isGuardedNavigation } from '@/lib/leave-guard';

export function useLeaveGuard(dirty: boolean, onBlocked: (href: string) => void) {
  const router = useRouter();
  const dirtyRef = useRef(dirty);
  const blockedRef = useRef(onBlocked);
  const allowOnce = useRef(false);

  dirtyRef.current = dirty;
  blockedRef.current = onBlocked;

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!dirtyRef.current || allowOnce.current) return;
      const target = event.target as Element | null;
      const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      const guarded = isGuardedNavigation(
        {
          href: anchor.getAttribute('href') || '',
          target: anchor.getAttribute('target'),
          download: anchor.hasAttribute('download'),
        },
        event,
        window.location,
      );
      if (!guarded) return;
      event.preventDefault();
      event.stopPropagation();
      blockedRef.current(anchor.href);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  /** For the page's own buttons: asks first when there is unsaved work. */
  const navigate = useCallback(
    (href: string) => {
      if (dirtyRef.current) blockedRef.current(href);
      else router.push(href);
    },
    [router],
  );

  /** Go anyway, after the teacher chose to leave without saving. */
  const leave = useCallback(
    (href: string) => {
      allowOnce.current = true;
      router.push(href);
    },
    [router],
  );

  return { navigate, leave };
}
