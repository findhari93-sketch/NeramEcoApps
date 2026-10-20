/**
 * Who may see or act on an intent: the account it belongs to, or the sign-in
 * that created it (the enrolled account can be the merged demo account).
 */
import type { PaymentIntentRow } from '@neram/database/payments';

export function ownsIntent(intent: PaymentIntentRow, authUserId: string): boolean {
  if (!intent || !authUserId) return false;
  if (intent.user_id === authUserId) return true;
  return (intent.metadata as any)?.created_by_auth === authUserId;
}
