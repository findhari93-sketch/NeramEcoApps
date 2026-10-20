/**
 * Payment screenshots live in the private 'payment-proofs' bucket. Staff get a
 * 10-minute signed link; the helper lives in @neram/database so Marketing can
 * sign too. Kept here so existing imports keep working. In the UI, use
 * components/payments/ProofLink, which signs on click.
 */
export { signedProofUrl, proofObjectPath, PAYMENT_PROOFS_BUCKET } from '@neram/database/payment-proof';
