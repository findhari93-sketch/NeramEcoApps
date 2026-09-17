import { promptTransitionRoute } from '@/lib/pad/prompt-routes';

/**
 * POST /api/pad/prompts/:id/reopen  (session teacher)
 *
 * "Closed too early". Students who answered stay locked, the rest can answer
 * again, and any key already chosen is cleared: no correct answer exists while
 * a prompt is open.
 */
export const POST = promptTransitionRoute('pad_reopen', 'everyone', 'reopen');
