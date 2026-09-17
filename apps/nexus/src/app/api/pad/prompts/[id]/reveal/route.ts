import { promptTransitionRoute } from '@/lib/pad/prompt-routes';

/**
 * POST /api/pad/prompts/:id/reveal  (session teacher)
 *
 * Grades every answer against the chosen key (or leaves them ungraded for a
 * poll) in the same transaction that marks the prompt REVEALED, so no student
 * can ever see REVEALED without their result. Refused with KEY_REQUIRED until
 * a key or Poll / Don't grade is set. REVEALED is final.
 */
export const POST = promptTransitionRoute('pad_reveal', 'everyone', 'reveal');
