/**
 * "Send to student to check", shared by the record-check route and the
 * Application and fees form's "Save and send" (one code path).
 */
import {
  createRecordCheck,
  markRecordCheckAttemptFailed,
  feeSignature,
  loadStudentFeeState,
  type FeeView,
  type RecordCheckRow,
} from '@neram/database';
import { nexusOriginFor } from './nexus-links';
import { callNexusInternal, type NexusAction, type NexusDelivery } from './record-check-delivery';

export const FEE_FIRST_MESSAGE = 'Fill in the fee first.';

/** Where Nexus is, from the Admin request. */
export function nexusOriginFromRequest(request: Request): string {
  let origin: string | null = process.env.NEXT_PUBLIC_ADMIN_URL || null;
  if (!origin) {
    try {
      origin = new URL(request.url).origin;
    } catch {
      origin = null;
    }
  }
  return nexusOriginFor(origin, process.env.NEXT_PUBLIC_NEXUS_URL);
}

export function askNexus(request: Request, body: NexusAction): Promise<NexusDelivery> {
  return callNexusInternal(body, { origin: nexusOriginFromRequest(request), token: process.env.NEXUS_INTERNAL_TOKEN });
}

export interface SendRecordCheckResult {
  check: RecordCheckRow | null;
  delivered: boolean;
  channel: string | null;
  message: string;
  /** No fee on record: nothing was created. */
  needsFee?: boolean;
}

/**
 * Supersede any live check, write a queued one, ask Nexus to send it. When Nexus
 * cannot be reached the row stays queued (Nexus retries daily) and the attempt is
 * counted.
 */
export async function sendRecordCheck(
  sb: any,
  request: Request,
  input: { userId: string; adminId: string | null; view?: FeeView; leadProfileId?: string | null },
): Promise<SendRecordCheckResult> {
  let view = input.view;
  let leadProfileId = input.leadProfileId ?? null;
  if (!view) {
    const state = await loadStudentFeeState(sb, input.userId);
    view = state.view;
    leadProfileId = state.lead?.id ?? null;
  }
  if (view.agreed === null) {
    return { check: null, delivered: false, channel: null, message: FEE_FIRST_MESSAGE, needsFee: true };
  }
  const check = await createRecordCheck(sb, {
    userId: input.userId,
    leadProfileId,
    sentBy: input.adminId,
    feeSignature: feeSignature(view),
  });
  const delivery = await askNexus(request, { action: 'send', checkId: check.id });
  if (!delivery.delivered && !delivery.stale) {
    try {
      await markRecordCheckAttemptFailed(sb, check, delivery.channel || 'failed');
    } catch (e: any) {
      console.error('[record-check] could not count the failed attempt:', e?.message);
    }
  }
  return { check, delivered: delivery.delivered, channel: delivery.channel, message: delivery.message };
}
