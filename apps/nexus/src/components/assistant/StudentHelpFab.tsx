'use client';

import ReportIssueFab from '@/components/ReportIssueFab';
import { useAssistantOptional } from './AssistantProvider';
import AssistantLauncher from './AssistantLauncher';
import AssistantSheet from './AssistantSheet';

/**
 * The student's corner button. With the assistant flag on, the launcher and
 * panel own the corner (Report a problem lives inside the assistant). With it
 * off, or outside the provider, the original Report a problem button stays.
 */
export default function StudentHelpFab() {
  const assistant = useAssistantOptional();
  if (assistant && assistant.enabled) {
    return (
      <>
        <AssistantLauncher />
        <AssistantSheet />
      </>
    );
  }
  return <ReportIssueFab />;
}
