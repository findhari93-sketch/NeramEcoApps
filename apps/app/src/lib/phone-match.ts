/**
 * True when two numbers are the same phone. Indian mobiles are compared on their
 * last 10 digits, so "+91 99494 14949", "09949414949" and "9949414949" match.
 * Used to check that the number a client asks us to mark verified is the one
 * Firebase verified (the ID token's `phone_number` claim).
 */
export function isSamePhone(a: unknown, b: unknown): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const da = a.replace(/\D/g, '');
  const db = b.replace(/\D/g, '');
  if (da.length < 10 || db.length < 10) return false;
  return da.slice(-10) === db.slice(-10);
}
