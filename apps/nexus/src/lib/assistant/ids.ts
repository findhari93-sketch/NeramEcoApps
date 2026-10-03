/**
 * Ids that reach the assistant from a request. Every assistant table keys on a
 * Postgres uuid, so anything else would come back as a cast error (22P02) and
 * read like a server fault. Callers treat a malformed id as "not found" or
 * "absent" instead (Ruling 26).
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}
