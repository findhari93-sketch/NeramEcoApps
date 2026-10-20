import { describe, it, expect } from 'vitest';
import { proofObjectPath, PAYMENT_PROOFS_BUCKET } from './payment-proof';

/**
 * Payment screenshots live in the private 'payment-proofs' bucket. Older rows
 * stored a public URL, newer ones a signed URL or a bare object path; every
 * reader turns whatever is stored into the object path and signs it fresh.
 */
describe('proofObjectPath', () => {
  const base = 'https://zdnypksjqnhtiblwdaic.supabase.co/storage/v1/object';

  it('reads the path out of a public URL', () => {
    expect(proofObjectPath(`${base}/public/payment-proofs/user-1/abcd1234/1760000000000.jpg`)).toBe('user-1/abcd1234/1760000000000.jpg');
  });

  it('reads the path out of a signed URL and drops the token', () => {
    expect(proofObjectPath(`${base}/sign/payment-proofs/user-1/abcd1234/1.png?token=eyJhbGci.xyz`)).toBe('user-1/abcd1234/1.png');
  });

  it('accepts a bare object path as it is', () => {
    expect(proofObjectPath('attempts/int-1/9f8e.jpg')).toBe('attempts/int-1/9f8e.jpg');
  });

  it('decodes percent-encoded names', () => {
    expect(proofObjectPath(`${base}/public/payment-proofs/u/my%20proof.pdf`)).toBe('u/my proof.pdf');
  });

  it('refuses other buckets, blanks and anything that tries to climb out', () => {
    expect(proofObjectPath(`${base}/public/application-documents/u/x.jpg`)).toBeNull();
    expect(proofObjectPath('')).toBeNull();
    expect(proofObjectPath(null)).toBeNull();
    expect(proofObjectPath(undefined)).toBeNull();
    expect(proofObjectPath('../other/x.jpg')).toBeNull();
    expect(proofObjectPath('https://evil.example/payment-proofs/x.jpg')).toBe('x.jpg');
  });

  it('names the bucket once', () => {
    expect(PAYMENT_PROOFS_BUCKET).toBe('payment-proofs');
  });
});
