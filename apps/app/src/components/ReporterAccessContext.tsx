'use client';

import { createContext, useContext } from 'react';

/**
 * Who is offered the "Report a problem" reporter.
 *
 * True only for students who are part of a class. Everyone else, leads and
 * graduated students included, uses /support instead. This is presentation
 * only: `POST /api/error-reports` and its upload route repeat the check server
 * side, which is where the rule is actually enforced.
 *
 * Defaults to false so a consumer rendered outside the provider hides the
 * reporter rather than showing a button that would 403.
 */
const ReporterAccessContext = createContext(false);

export function ReporterAccessProvider({
  canReport,
  children,
}: {
  canReport: boolean;
  children: React.ReactNode;
}) {
  return (
    <ReporterAccessContext.Provider value={canReport}>{children}</ReporterAccessContext.Provider>
  );
}

export function useCanReportProblem(): boolean {
  return useContext(ReporterAccessContext);
}
