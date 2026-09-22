'use client';

import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
  type TransitionStartFunction,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LinearProgress, useMediaQuery } from '@neram/ui';

/**
 * One pending state for every navigation the app chrome starts (PERF-0029).
 *
 * The sidebar, the bottom bar and the More sheet used to be buttons calling
 * router.push. Nothing was prefetched, and until the next page's payload and code
 * arrived the old page just sat there, so a tap looked ignored, worst on a phone
 * and on the first visit after a deploy. Now:
 * - NavLink renders a real link, which Next prefetches and which opens in a new tab
 *   and reads as a link to a screen reader.
 * - A plain click on it, and any useNavigate() call, runs router.push inside this
 *   provider's transition. React keeps the current page up while the next one
 *   loads, and `pending` stays true for exactly that long.
 * - The bar mounts only after 150ms, so a prefetched page that swaps at once never
 *   flashes it, and a screen reader is not told about a load it never noticed.
 */

interface NavigationProgressValue {
  pending: boolean;
  startTransition: TransitionStartFunction | null;
}

const NavigationProgressContext = createContext<NavigationProgressValue>({ pending: false, startTransition: null });

export function NavigationProgressProvider({ children }: { children: ReactNode }) {
  const [pending, startTransition] = useTransition();
  const value = useMemo(() => ({ pending, startTransition }), [pending, startTransition]);
  return (
    <NavigationProgressContext.Provider value={value}>
      {children}
      {pending && <NavigationProgressBar />}
    </NavigationProgressContext.Provider>
  );
}

/** router.push, inside the shared transition when the provider is there. */
export function useNavigate(): (href: string) => void {
  const router = useRouter();
  const { startTransition } = useContext(NavigationProgressContext);
  return useCallback(
    (href: string) => {
      if (startTransition) startTransition(() => router.push(href));
      else router.push(href);
    },
    [router, startTransition],
  );
}

/** The clicks a browser answers with a new tab, window or download. Mirrors next/link. */
function isModifiedClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  const target = event.currentTarget.getAttribute('target');
  return (
    (!!target && target !== '_self') ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    event.button !== 0
  );
}

type NavLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string;
  prefetch?: boolean;
};

/**
 * A link for app navigation. Usable as an MUI `component`, which passes its
 * className, ref and handlers straight through.
 */
export const NavLink = forwardRef<HTMLAnchorElement, NavLinkProps>(function NavLink({ href, onClick, ...rest }, ref) {
  const navigate = useNavigate();
  return (
    <Link
      ref={ref}
      href={href}
      {...rest}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || isModifiedClick(event)) return;
        // Ours instead of next/link's own push, so the pending state covers it.
        event.preventDefault();
        navigate(href);
      }}
    />
  );
});

const SHOW_AFTER_MS = 150;

function NavigationProgressBar() {
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShown(true), SHOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);
  if (!shown) return null;
  return (
    <LinearProgress
      aria-label="Loading page"
      // A still, full bar says the same thing without the sliding motion.
      variant={reduceMotion ? 'determinate' : 'indeterminate'}
      value={reduceMotion ? 100 : undefined}
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        zIndex: (theme) => theme.zIndex.appBar + 2,
      }}
    />
  );
}
