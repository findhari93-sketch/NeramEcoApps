'use client';

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState } from 'react';

/**
 * Who is offered the "Report a problem" reporter, and where it may sit.
 *
 * canReport is true for anyone signed in: enrolled students and leads alike
 * (the report is tagged with which one they are). Signed-out visitors see no
 * button. This is presentation only: `POST /api/error-reports` and its upload
 * route repeat the sign-in check server side, which is where the rule lives.
 *
 * Defaults to false so a consumer rendered outside the provider hides the
 * reporter rather than showing a button that would 401.
 *
 * The second half is the floating button's visibility. A screen with its own
 * fixed bottom bar (exam planner save bar, cutoff result strip, the question
 * bank's post button) calls `useHideReportFab()` so the two never stack on top
 * of each other. Outside the provider the hook does nothing.
 */

/** 'all' hides the button everywhere; 'sm' / 'md' hide it below that breakpoint only. */
export type ReportFabHideBelow = 'all' | 'sm' | 'md';

interface ReporterAccessValue {
  canReport: boolean;
  hidden: ReportFabHideBelow | null;
  hide: (id: string, below: ReportFabHideBelow) => void;
  show: (id: string) => void;
}

const noop = () => {};

const ReporterAccessContext = createContext<ReporterAccessValue>({
  canReport: false,
  hidden: null,
  hide: noop,
  show: noop,
});

const STRENGTH: Record<ReportFabHideBelow, number> = { sm: 1, md: 2, all: 3 };

/** The strongest hide request wins: 'all' over 'md' over 'sm'. Exported for tests. */
export function strongestHide(requests: ReportFabHideBelow[]): ReportFabHideBelow | null {
  let best: ReportFabHideBelow | null = null;
  for (const r of requests) {
    if (!best || STRENGTH[r] > STRENGTH[best]) best = r;
  }
  return best;
}

export function ReporterAccessProvider({
  canReport,
  children,
}: {
  canReport: boolean;
  children: React.ReactNode;
}) {
  const [requests, setRequests] = useState<Record<string, ReportFabHideBelow>>({});

  const hide = useCallback((id: string, below: ReportFabHideBelow) => {
    setRequests((prev) => (prev[id] === below ? prev : { ...prev, [id]: below }));
  }, []);

  const show = useCallback((id: string) => {
    setRequests((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const hidden = useMemo(() => strongestHide(Object.values(requests)), [requests]);

  const value = useMemo(() => ({ canReport, hidden, hide, show }), [canReport, hidden, hide, show]);

  return <ReporterAccessContext.Provider value={value}>{children}</ReporterAccessContext.Provider>;
}

export function useCanReportProblem(): boolean {
  return useContext(ReporterAccessContext).canReport;
}

/** For the floating button: is any screen asking it to step aside? */
export function useReportFabHidden(): ReportFabHideBelow | null {
  return useContext(ReporterAccessContext).hidden;
}

/**
 * Hide the floating "Report a problem" button while this component is mounted
 * and `active` is true. Use on screens with a fixed bottom bar or their own FAB.
 * Pass `below: 'md'` when that bar only shows on phones and small tablets.
 */
export function useHideReportFab(active = true, below: ReportFabHideBelow = 'all'): void {
  const id = useId();
  const { hide, show } = useContext(ReporterAccessContext);
  useEffect(() => {
    if (!active) {
      show(id);
      return;
    }
    hide(id, below);
    return () => show(id);
  }, [active, below, hide, show, id]);
}
