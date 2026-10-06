/**
 * Neram's own count of sign-ups from Google Ads, from the database rather than
 * from Google. A sign-up is an OTP-verified user (the business's conversion).
 * It counts as "from Google Ads" when users.first_touch carries an ad click id
 * or a paid Google utm. Google's own number (after matching the uploads) is
 * usually higher, because hashed phone and email also match people whose click
 * id was lost; showing both keeps the agent honest.
 */

import { isRealProspect, type UserForConversion } from './ads/conversions';

export function isGoogleAdsTouch(ft: Record<string, string> | null | undefined): boolean {
  if (!ft) return false;
  if (ft.gclid || ft.wbraid || ft.gbraid) return true;
  const source = (ft.utm_source || '').toLowerCase();
  const medium = (ft.utm_medium || '').toLowerCase();
  return source.includes('google') && /cpc|ppc|paid/.test(medium);
}

export interface SignupCounts {
  verified: number;
  from_google_ads: number;
}

/** OTP-verified sign-ups between two ISO timestamps, and how many came from a Google Ads click. */
export async function countSignups(db: any, fromIso: string, toIso: string): Promise<SignupCounts> {
  const ids = new Set<string>();
  const { data: events, error: e1 } = await db.from('user_funnel_events').select('user_id').eq('event', 'otp_verified').not('user_id', 'is', null).gte('created_at', fromIso).lt('created_at', toIso).limit(10000);
  if (e1) throw new Error(`user_funnel_events: ${e1.message}`);
  for (const r of events ?? []) ids.add(r.user_id);
  const { data: phoneFirst, error: e2 } = await db.from('users').select('id').eq('phone_verified', true).gte('created_at', fromIso).lt('created_at', toIso).limit(10000);
  if (e2) throw new Error(`users: ${e2.message}`);
  for (const r of phoneFirst ?? []) ids.add(r.id);

  const counts: SignupCounts = { verified: 0, from_google_ads: 0 };
  const list = [...ids];
  for (let i = 0; i < list.length; i += 100) {
    const { data, error } = await db.from('users').select('id, email, phone, phone_verified, user_type, first_touch, first_touch_at, created_at').in('id', list.slice(i, i + 100));
    if (error) throw new Error(`users: ${error.message}`);
    for (const u of (data ?? []) as UserForConversion[]) {
      if (!u.phone_verified || !isRealProspect(u)) continue;
      counts.verified++;
      if (isGoogleAdsTouch(u.first_touch)) counts.from_google_ads++;
    }
  }
  return counts;
}
