/**
 * "New sign-up" alert for staff: the admin bell plus a phone push, sent once
 * per new account, the first time it has a verified phone (that is the moment
 * staff can call, and the Google Ads conversion).
 *
 * Called from /api/auth/register-user (phone-first sign-in: the account is born
 * verified) and /api/auth/verify-phone (Google first, phone OTP second). The
 * signup_alert_sent_at claim makes the two race-safe.
 *
 * Server only: import from '@neram/database/signup-alert'.
 */

import type { TypedSupabaseClient } from '../client';
import { channelLabel } from '../analytics/channel';
import { createAdminNotification } from '../queries/notifications';
import { formatSignupPlace, type SignupGeo } from '../utils/signup-geo';
import { sendStaffPush, type StaffPushResult } from './staff-push';

/** Accounts older than this never alert (an old account verifying its phone is not a new sign-up). */
const NEW_ACCOUNT_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

export interface SignupAlertUser {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  first_touch: Record<string, string> | null;
  signup_city: string | null;
  signup_state: string | null;
  signup_country: string | null;
}

export interface SignupAlert {
  title: string;
  body: string;
  message: string;
  channel: string | null;
  place: string | null;
  url: string;
}

/** +91 98765 43210 for Indian mobiles, the stored value otherwise. */
export function formatAlertPhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d+]/g, '');
  const m = digits.match(/^\+?91(\d{10})$/);
  if (m) return `+91 ${m[1].slice(0, 5)} ${m[1].slice(5)}`;
  return phone;
}

/** Pure: the alert text. Lines: phone, where they came from, where they are. */
export function buildSignupAlert(user: SignupAlertUser, fallbackPlace?: { city?: string | null; state?: string | null }): SignupAlert {
  const name = user.name && user.name.trim() && user.name !== 'User' ? user.name.trim() : null;
  const touch = user.first_touch ?? {};
  const channel = touch.channel ?? null;

  let from = channelLabel(channel);
  if (channel === 'google_ads' && touch.utm_campaign) from += ` (${touch.utm_campaign})`;
  if (channel === 'referral' && touch.referrer) {
    try {
      from += ` (${new URL(touch.referrer).hostname.replace(/^www\./, '')})`;
    } catch {
      // Unreadable referrer: the label alone.
    }
  }
  if (touch.landing_page) from += ` · ${touch.landing_page}`;

  const ipPlace = formatSignupPlace({ city: user.signup_city, state: user.signup_state, country: user.signup_country });
  const formPlace = fallbackPlace ? formatSignupPlace({ city: fallbackPlace.city, state: fallbackPlace.state }) : null;
  const place = formPlace ?? ipPlace;
  const placeLine = formPlace ? formPlace : ipPlace ? `${ipPlace} (approx.)` : 'Place not known';

  const lines = [
    formatAlertPhone(user.phone) ?? user.email ?? 'No phone',
    `From: ${from}`,
    placeLine,
  ];

  return {
    title: name ? `New sign-up: ${name}` : 'New sign-up',
    body: lines.join('\n'),
    message: lines.join(' · '),
    channel,
    place,
    url: `/crm/${user.id}`,
  };
}

/** Store where a new account signed up from. Never throws. */
export async function recordSignupGeo(client: TypedSupabaseClient, userId: string, geo: SignupGeo | null): Promise<void> {
  if (!geo) return;
  try {
    const { error } = await (client as any)
      .from('users')
      .update({ signup_city: geo.city, signup_state: geo.state, signup_country: geo.country })
      .eq('id', userId)
      .is('signup_country', null);
    if (error) console.warn('[signup-alert] place not recorded:', error.message);
  } catch (err) {
    console.warn('[signup-alert] place not recorded:', err);
  }
}

/**
 * Send the alert if this is a new lead with a verified phone that has not been
 * alerted yet. Never throws: a failed alert must not fail a sign-in.
 */
export async function alertNewSignup(
  client: TypedSupabaseClient,
  userId: string,
): Promise<{ sent: boolean; push?: StaffPushResult }> {
  try {
    const since = new Date(Date.now() - NEW_ACCOUNT_WINDOW_MS).toISOString();
    const { data, error } = await (client as any)
      .from('users')
      .update({ signup_alert_sent_at: new Date().toISOString() })
      .eq('id', userId)
      .eq('phone_verified', true)
      .eq('user_type', 'lead')
      .is('signup_alert_sent_at', null)
      .gte('created_at', since)
      .select('id, name, phone, email, first_touch, signup_city, signup_state, signup_country');
    if (error) {
      console.warn('[signup-alert] claim failed:', error.message);
      return { sent: false };
    }
    const user = (data ?? [])[0] as SignupAlertUser | undefined;
    if (!user) return { sent: false };

    // A filled application form knows the real city better than the IP does.
    let formPlace: { city: string | null; state: string | null } | undefined;
    const { data: lead } = await (client as any)
      .from('lead_profiles')
      .select('city, state')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .not('state', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lead?.state) formPlace = { city: lead.city ?? null, state: lead.state };

    const alert = buildSignupAlert(user, formPlace);

    await createAdminNotification(
      {
        event_type: 'new_signup',
        title: alert.title,
        message: alert.message,
        metadata: {
          user_id: user.id,
          phone: user.phone,
          channel: alert.channel,
          landing_page: user.first_touch?.landing_page ?? null,
          utm_campaign: user.first_touch?.utm_campaign ?? null,
          city: formPlace?.city ?? user.signup_city,
          state: formPlace?.state ?? user.signup_state,
          country: user.signup_country,
        },
      },
      client,
    ).catch((err) => console.warn('[signup-alert] bell row not written:', err?.message ?? err));

    const push = await sendStaffPush(client, {
      title: alert.title,
      body: alert.body,
      url: alert.url,
      tag: `signup-${user.id}`,
    });
    return { sent: true, push };
  } catch (err) {
    console.warn('[signup-alert] not sent:', err);
    return { sent: false };
  }
}
