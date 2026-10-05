'use client';

/**
 * The Answer Pad report for one class, in Nexus. The report itself is
 * SessionReportView, which the Answer Pad in Teams shows too (/pad/teams/report).
 */

import { useParams } from 'next/navigation';
import SessionReportView from '@/components/answer-pad/SessionReportView';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

export default function AnswerPadReportPage() {
  const { id } = useParams<{ id: string }>();
  const { getToken, tokenReady } = useNexusAuthContext();
  return <SessionReportView sessionId={id} getToken={getToken} tokenReady={tokenReady} />;
}
