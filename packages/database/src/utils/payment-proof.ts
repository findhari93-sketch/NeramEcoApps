/**
 * Payment screenshots live in the PRIVATE 'payment-proofs' bucket. Older rows
 * stored a public URL, newer ones a signed URL or a bare object path; every
 * reader turns whatever is stored into the object path and signs it fresh
 * (short-lived, staff only). Nothing renders a stored URL directly.
 */
export const PAYMENT_PROOFS_BUCKET = 'payment-proofs';

/** The object path inside the bucket, from a public URL, a signed URL or a bare path. Null when it is not ours. */
export function proofObjectPath(stored: string | null | undefined): string | null {
  if (!stored || typeof stored !== 'string') return null;
  const s = stored.trim();
  if (!s) return null;
  const marker = `/${PAYMENT_PROOFS_BUCKET}/`;
  const at = s.indexOf(marker);
  let path: string;
  if (at >= 0) {
    path = s.slice(at + marker.length).split('?')[0];
  } else if (/^[a-z]+:\/\//i.test(s)) {
    return null;
  } else {
    path = s.split('?')[0];
  }
  try {
    path = decodeURIComponent(path);
  } catch {
    return null;
  }
  if (!path || path.startsWith('/') || path.split('/').some((seg) => seg === '..' || seg === '')) return null;
  return path;
}

/** A staff-only, short-lived link to the screenshot. Null when there is none or it cannot be signed. */
export async function signedProofUrl(client: any, stored: string | null | undefined, expiresInSeconds = 600): Promise<string | null> {
  const path = proofObjectPath(stored);
  if (!path) return null;
  const { data, error } = await client.storage.from(PAYMENT_PROOFS_BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error) {
    console.warn('[payment-proof] not signed:', error.message);
    return null;
  }
  return data?.signedUrl || null;
}
