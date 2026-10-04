/**
 * Server side of first/last-touch attribution (see touchAttribution() in
 * lib/attribution.ts). Lead routes call saveLeadTouch after their insert: the
 * insert itself goes through @neram/database and must never fail because of
 * attribution, so this is a separate, best-effort update.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Channel, Touch } from './attribution';

const CHANNELS: readonly Channel[] = [
  'google_organic', 'bing_organic', 'ai_chatgpt', 'ai_perplexity', 'ai_claude', 'ai_gemini', 'ai_copilot',
  'youtube', 'google_ads', 'meta_ads', 'whatsapp', 'direct', 'referral', 'other',
];

export type LeadTable = 'demo_class_registrations' | 'callback_requests' | 'nata_assistance_requests' | 'center_visit_bookings';

const str = (v: unknown, max = 200): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

function cleanTouch(v: unknown): Touch | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const t = v as Record<string, unknown>;
  const channel = CHANNELS.includes(t.channel as Channel) ? (t.channel as Channel) : 'other';
  const landing = str(t.landing_page, 300);
  if (!landing || !landing.startsWith('/')) return null;
  return {
    source: str(t.source, 100),
    medium: str(t.medium, 100),
    campaign: str(t.campaign, 100),
    landing_page: landing,
    referrer: str(t.referrer, 200),
    channel,
    ts: str(t.ts, 40) ?? new Date().toISOString(),
  };
}

export interface LeadTouchFields {
  first_touch: Touch | null;
  last_touch: Touch | null;
  channel: Channel | null;
  landing_page: string | null;
  page_code: string | null;
}

/** Pure: pick and validate the touch fields from a request body. */
export function leadTouchFields(body: Record<string, unknown> | null | undefined): LeadTouchFields {
  const b = body ?? {};
  const channel = CHANNELS.includes(b.channel as Channel) ? (b.channel as Channel) : null;
  const pageCode = typeof b.page_code === 'string' && /^[A-Z]{2}-[A-Z]{3}$/.test(b.page_code) ? b.page_code : null;
  const landing = str(b.landing_page, 300);
  return {
    first_touch: cleanTouch(b.first_touch),
    last_touch: cleanTouch(b.last_touch),
    channel,
    landing_page: landing && landing.startsWith('/') ? landing : null,
    page_code: pageCode,
  };
}

export async function saveLeadTouch(
  supabase: SupabaseClient,
  table: LeadTable,
  id: string | null | undefined,
  body: Record<string, unknown> | null | undefined,
  extra: Record<string, string | null> = {},
): Promise<void> {
  if (!id) return;
  const fields = leadTouchFields(body);
  const update = Object.fromEntries(Object.entries({ ...fields, ...extra }).filter(([, v]) => v !== null));
  if (Object.keys(update).length === 0) return;
  try {
    const { error } = await supabase.from(table).update(update).eq('id', id);
    if (error) console.error(`[lead-touch] ${table} update failed:`, error.message);
  } catch (err) {
    console.error(`[lead-touch] ${table} update threw:`, err);
  }
}
