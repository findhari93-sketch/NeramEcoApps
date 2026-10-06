'use client';

import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { ASSISTANT_FLAG, QUESTION_BANK_FLAG, TUTOR_FLAG } from '@/lib/assistant/flag';

/**
 * The AI Tutor's client gate, read the way the Assistant reads its own
 * (AssistantProvider): a signed-in student, not a parent session, with the
 * tutor, the Assistant and the question bank all switched on. /api/auth/me
 * folds the Assistant's pilot list into its flag, so a student outside the
 * pilot reads it as off here, as the server refuses them.
 *
 * This only hides doors. The turn route checks all of it again.
 */
export function useTutorGate(): boolean {
  const { isStudent, tokenReady, parentSession, isFeatureEnabled } = useNexusAuthContext();
  return (
    isStudent &&
    tokenReady &&
    !parentSession.active &&
    isFeatureEnabled(TUTOR_FLAG) &&
    isFeatureEnabled(ASSISTANT_FLAG) &&
    isFeatureEnabled(QUESTION_BANK_FLAG)
  );
}
