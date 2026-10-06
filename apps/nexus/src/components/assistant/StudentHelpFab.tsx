'use client';

import ReportIssueFab from '@/components/ReportIssueFab';
import { useAssistantOptional } from './AssistantProvider';
import AssistantLauncher from './AssistantLauncher';
import AssistantSheet from './AssistantSheet';
import { useTutorPresence } from '@/components/tutor/tutor-presence';

/**
 * The student's corner button. With the assistant flag on, the launcher and
 * panel own the corner (Report a problem lives inside the assistant). With it
 * off, or outside the provider, the original Report a problem button stays.
 *
 * While the AI Tutor is open the corner button steps aside: the tutor's chips
 * and composer sit in that corner, and one helper on screen is enough.
 */
export default function StudentHelpFab() {
  const assistant = useAssistantOptional();
  const tutorOpen = useTutorPresence();
  if (assistant && assistant.enabled) {
    return (
      <>
        {!tutorOpen && <AssistantLauncher />}
        <AssistantSheet />
      </>
    );
  }
  return tutorOpen ? null : <ReportIssueFab />;
}
