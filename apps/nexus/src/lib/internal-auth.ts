import { timingSafeEqual } from 'crypto';

/**
 * Server-to-server routes under /api/internal/* (the recording-trim worker,
 * Admin asking Nexus to message a student) are authorised by one shared secret
 * in an env var, sent as `Authorization: Bearer <secret>`.
 *
 * Compared in constant time, and a missing or empty secret refuses everything,
 * so an env var forgotten on a deployment closes the door instead of opening it.
 */
export function authorisedBearer(
  request: { headers: { get(name: string): string | null } },
  envName: string,
): boolean {
  const secret = process.env[envName];
  const header = request.headers.get('Authorization') || '';
  if (!secret || !header.startsWith('Bearer ')) return false;
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
