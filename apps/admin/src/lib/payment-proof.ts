const BUCKET = 'payment-proofs';

/**
 * Payment screenshots live in the private 'payment-proofs' bucket, saved as a
 * (non-working) public URL. Staff get a 10-minute signed link instead.
 */
export async function signedProofUrl(supabase: any, stored: string | null | undefined): Promise<string | null> {
  if (!stored) return null;
  const at = stored.indexOf(`/${BUCKET}/`);
  if (at < 0) return null;
  const path = decodeURIComponent(stored.slice(at + BUCKET.length + 2).split('?')[0]);
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600);
  if (error) {
    console.warn('[payment-proof] not signed:', error.message);
    return null;
  }
  return data?.signedUrl || null;
}
