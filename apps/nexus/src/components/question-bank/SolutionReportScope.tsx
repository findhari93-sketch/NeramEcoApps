'use client';

/**
 * One report-status request for everything inside it: a question being
 * practised, or every question of a test review.
 *
 * Lazy on purpose. The request fires only once a "Report a mistake" link has
 * actually rendered (after the student submitted, or when a review opens), so
 * opening a question to read it costs nothing extra.
 */
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useSolutionReportStatus } from '@/hooks/useSolutionReportStatus';

type ScopeValue = ReturnType<typeof useSolutionReportStatus> & { activate: () => void };

const ScopeContext = createContext<ScopeValue | null>(null);

export function SolutionReportScope({ questionIds, children }: { questionIds: string[]; children: React.ReactNode }) {
  const [active, setActive] = useState(false);
  const status = useSolutionReportStatus(questionIds, active);
  const activate = useCallback(() => setActive(true), []);
  const value = useMemo(() => ({ ...status, activate }), [status, activate]);
  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

/** The surrounding scope, or null when reports are not offered here. */
export function useSolutionReportScope(): ScopeValue | null {
  return useContext(ScopeContext);
}
