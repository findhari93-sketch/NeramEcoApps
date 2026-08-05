/**
 * Identifying one anonymous visitor without keeping their address.
 *
 * The public chatbots have no login, so the usual actor_id is always NULL for
 * them and there is nothing to rate limit against. Something has to stand in,
 * and the honest options are the session id the widget already sends and the
 * request IP.
 *
 * Both are used, hashed together with a salt. The reasoning:
 *
 *  - Session id alone is trivially defeated: clearing it is one line of script,
 *    and a script is exactly what the limit is for.
 *  - IP alone punishes shared connections. A school computer lab or a college
 *    on one NAT would look like a single very chatty visitor.
 *  - Together, a script that rotates its session still needs a new IP, and two
 *    students behind the same NAT still get their own budget.
 *
 * Hashed rather than stored raw because this lands in a database row that has
 * no business holding an IP address. The only question it has to answer is
 * "same visitor as a minute ago", and a hash answers that exactly as well.
 *
 * The salt is CLIENT_KEY_SALT when set. Without it the hash is still not
 * reversible in any useful way, but a fixed salt stops the same visitor being
 * recognisable across environments, so set it in production.
 */

import { createHash } from 'crypto';

/**
 * Stable, non-reversible id for one visitor.
 *
 * Pass whatever the caller knows: session id, IP, anything stable per visitor.
 * Empty and undefined parts are dropped, so a missing IP simply makes the key
 * weaker rather than making every visitor collide on the same empty string.
 */
export function hashClientKey(...parts: Array<string | null | undefined>): string | null {
  const usable = parts.map((p) => (p || '').trim()).filter(Boolean);
  if (usable.length === 0) return null;

  const salt = process.env.CLIENT_KEY_SALT || 'neram-ai-usage';
  return createHash('sha256').update(`${salt}|${usable.join('|')}`).digest('hex').slice(0, 32);
}

/**
 * The visitor's IP as the platform reports it.
 *
 * Vercel sits behind Cloudflare here, so x-forwarded-for is a list and the
 * FIRST entry is the client; the rest are proxies. Taking the last entry, which
 * is a common mistake, would give the same proxy address for every visitor and
 * turn a per-visitor limit into a global one.
 */
export function ipFromHeaders(headers: {
  get(name: string): string | null;
}): string | null {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('cf-connecting-ip') || headers.get('x-real-ip') || null;
}
