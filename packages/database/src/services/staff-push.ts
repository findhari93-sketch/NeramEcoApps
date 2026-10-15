/**
 * Phone alerts for staff: Web Push to the devices that turned them on in
 * Admin > Settings > Notifications (admin_push_subscriptions).
 *
 * Server only (Node: web-push signs with the VAPID key and encrypts the
 * payload). Import from '@neram/database/staff-push', never from the barrel,
 * so no browser bundle pulls in web-push.
 *
 * Env (app, marketing and admin, Production + Preview):
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY   npx web-push generate-vapid-keys
 *   VAPID_SUBJECT                         optional, mailto: contact
 */

import webpush from 'web-push';
import type { TypedSupabaseClient } from '../client';

export interface StaffPushPayload {
  title: string;
  body: string;
  /** Admin path the tap opens, e.g. /crm/<user id>. */
  url: string;
  /** Same tag replaces an earlier alert on the device instead of stacking. */
  tag?: string;
}

export interface StaffPushResult {
  configured: boolean;
  devices: number;
  sent: number;
  failed: number;
  removed: number;
}

interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  failure_count: number;
}

let configuredWith: string | null = null;

export function webPushPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

function configure(): boolean {
  const publicKey = webPushPublicKey();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return false;
  if (configuredWith === publicKey) return true;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT?.trim() || 'mailto:info@neramclasses.com', publicKey, privateKey);
  configuredWith = publicKey;
  return true;
}

/**
 * Push one alert to every subscribed staff device (or only `userIds`' devices).
 * Never throws. Subscriptions the push service reports gone (404/410) are
 * deleted; other failures are counted on the row.
 */
export async function sendStaffPush(
  client: TypedSupabaseClient,
  payload: StaffPushPayload,
  options: { userIds?: string[] } = {},
): Promise<StaffPushResult> {
  const result: StaffPushResult = { configured: false, devices: 0, sent: 0, failed: 0, removed: 0 };
  try {
    if (!configure()) return result;
    result.configured = true;

    let query = (client as any)
      .from('admin_push_subscriptions')
      .select('id, endpoint, p256dh, auth, failure_count');
    if (options.userIds) {
      if (options.userIds.length === 0) return result;
      query = query.in('user_id', options.userIds);
    }
    const { data, error } = await query;
    if (error) {
      console.warn('[staff-push] subscriptions not read:', error.message);
      return result;
    }
    const rows = (data ?? []) as SubscriptionRow[];
    result.devices = rows.length;
    const body = JSON.stringify(payload);
    const now = new Date().toISOString();

    await Promise.all(
      rows.map(async (row) => {
        try {
          await webpush.sendNotification(
            { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
            body,
            { TTL: 6 * 60 * 60, urgency: 'high', timeout: 5000 },
          );
          result.sent += 1;
          await (client as any)
            .from('admin_push_subscriptions')
            .update({ last_success_at: now, failure_count: 0 })
            .eq('id', row.id);
        } catch (err: any) {
          const status = Number(err?.statusCode);
          if (status === 404 || status === 410) {
            result.removed += 1;
            await (client as any).from('admin_push_subscriptions').delete().eq('id', row.id);
            return;
          }
          result.failed += 1;
          console.warn('[staff-push] send failed:', status || '', err?.body || err?.message || err);
          await (client as any)
            .from('admin_push_subscriptions')
            .update({ last_failure_at: now, failure_count: (row.failure_count ?? 0) + 1 })
            .eq('id', row.id);
        }
      }),
    );
  } catch (err) {
    console.warn('[staff-push] not sent:', err);
  }
  return result;
}
