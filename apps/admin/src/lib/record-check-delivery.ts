/**
 * How Admin asks Nexus to send "Check your details" to a student, and what staff
 * are told afterwards. Pure: the fetch is injected, so the outcomes are tested.
 *
 * Contract (Nexus side: apps/nexus/src/app/api/internal/student-record-check):
 *   POST {origin}/api/internal/student-record-check
 *   Authorization: Bearer NEXUS_INTERNAL_TOKEN
 *   { action: 'send', checkId }        -> 200 { ok, channel, summary }, 409 when no longer queued
 *   { action: 'resolution', reportId } -> 200 { ok, channel, summary }
 */

export const NEXUS_RETRY_MESSAGE = 'Saved. The message will go out with the next daily run, or press Send again.';
export const NEXUS_STALE_MESSAGE = 'This check was already answered or replaced. Reload to see the latest.';
export const RESOLUTION_RETRY_MESSAGE = 'Saved. We could not tell the student just now; they will see the answer on their Check your details page.';

export type NexusAction = { action: 'send'; checkId: string } | { action: 'resolution'; reportId: string };

export interface NexusDelivery {
  delivered: boolean;
  /** Nexus answered 409: the check is no longer queued. */
  stale: boolean;
  channel: string | null;
  message: string;
}

const TIMEOUT_MS = 15_000;

export async function callNexusInternal(
  body: NexusAction,
  opts: { origin: string; token: string | undefined | null; fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<NexusDelivery> {
  const retry = body.action === 'send' ? NEXUS_RETRY_MESSAGE : RESOLUTION_RETRY_MESSAGE;
  const failed: NexusDelivery = { delivered: false, stale: false, channel: null, message: retry };
  if (!opts.token) return failed;
  const doFetch = opts.fetchImpl ?? fetch;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), opts.timeoutMs ?? TIMEOUT_MS) : null;
  try {
    const res = await doFetch(`${opts.origin.replace(/\/+$/, '')}/api/internal/student-record-check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.token}` },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: controller?.signal,
    });
    if (res.status === 409) return { delivered: false, stale: true, channel: null, message: NEXUS_STALE_MESSAGE };
    if (!res.ok) return failed;
    const data: any = await res.json().catch(() => null);
    if (!data?.ok) return failed;
    const channel = typeof data.channel === 'string' ? data.channel : null;
    if (channel === 'failed') return { ...failed, channel };
    const summary = typeof data.summary === 'string' && data.summary.trim() ? data.summary.trim() : 'Sent.';
    return { delivered: true, stale: false, channel, message: summary };
  } catch {
    return failed;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
