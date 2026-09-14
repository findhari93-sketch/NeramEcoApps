/**
 * Reading the body of `POST /api/question-bank/papers/bulk-publish`.
 *
 * Kept out of the route file because a Next.js route may export only its HTTP
 * handlers, and this is the part worth testing on its own.
 */

/** One exam holds a few dozen papers; anything past this is not a real press. */
export const MAX_BULK_PUBLISH_IDS = 200;

/**
 * The paper ids to publish, null when the caller sent no list (which means
 * "every ready paper"), or 'invalid' for a list the route should refuse.
 */
export function parsePaperIds(body: unknown): string[] | null | 'invalid' {
  if (!body || typeof body !== 'object' || !('paper_ids' in body)) return null;
  const raw = (body as { paper_ids: unknown }).paper_ids;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_BULK_PUBLISH_IDS) return 'invalid';
  if (!raw.every((id) => typeof id === 'string' && id.length > 0)) return 'invalid';
  return Array.from(new Set(raw as string[]));
}
