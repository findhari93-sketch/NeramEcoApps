import { promptTransitionRoute } from '@/lib/pad/prompt-routes';

/**
 * POST /api/pad/prompts/:id/close  (session teacher)
 *
 * Stops answering. An answer committed before this commits stands; one
 * arriving after is refused with PROMPT_NOT_OPEN. Closing again is a no-op.
 */
export const POST = promptTransitionRoute('pad_close', 'everyone', 'close');
