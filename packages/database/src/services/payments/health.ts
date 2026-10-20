/**
 * Watcher health. Instant UPI is offered only while a watcher (the office
 * phone, the Gmail script) was heard from recently; a silence rings the staff
 * bell once, and again only after the watcher came back.
 */
import { createAdminNotification } from '../../queries/notifications';

export async function recordHeartbeat(
  supabase: any,
  input: { source: string; appVersion?: string | null; meta?: Record<string, unknown> | null; now?: Date; event?: boolean },
): Promise<void> {
  const nowIso = (input.now || new Date()).toISOString();
  const { data: existing, error } = await supabase.from('watcher_heartbeats').select('*').eq('source', input.source).maybeSingle();
  if (error) throw error;
  const patch: Record<string, unknown> = { last_seen_at: nowIso, silent_notified_at: null };
  if (input.appVersion) patch.app_version = input.appVersion;
  if (input.event) patch.last_event_at = nowIso;
  if (input.meta) patch.meta = input.meta;
  if (existing) {
    const { error: upErr } = await supabase.from('watcher_heartbeats').update(patch).eq('source', input.source);
    if (upErr) throw upErr;
  } else {
    const { error: insErr } = await supabase.from('watcher_heartbeats').insert({
      source: input.source,
      last_seen_at: nowIso,
      last_event_at: input.event ? nowIso : null,
      app_version: input.appVersion || null,
      meta: input.meta || {},
      silent_notified_at: null,
    });
    if (insErr) throw insErr;
  }
}

export interface WatcherHealth {
  /** Some watcher was heard from inside the window. */
  healthy: boolean;
  /** The phone (sms:*) was: UPI credits arrive only there, so this gates Instant UPI. */
  smsHealthy: boolean;
  sources: { source: string; lastSeenAt: string; minutesAgo: number }[];
}

const minutesBetween = (later: Date, earlierIso: string) => Math.round((later.getTime() - new Date(earlierIso).getTime()) / 60000);

/** healthy when ANY source was seen within the window; smsHealthy when the phone was. */
export async function watcherHealth(supabase: any, silentAfterMinutes: number, now: Date = new Date()): Promise<WatcherHealth> {
  const { data, error } = await supabase.from('watcher_heartbeats').select('*');
  if (error) throw error;
  const sources = (data || []).map((r: any) => ({ source: r.source, lastSeenAt: r.last_seen_at, minutesAgo: minutesBetween(now, r.last_seen_at) }));
  const fresh = (s: { source: string; minutesAgo: number }) => s.minutesAgo <= silentAfterMinutes;
  return { healthy: sources.some(fresh), smsHealthy: sources.some((s: { source: string; minutesAgo: number }) => s.source.startsWith('sms:') && fresh(s)), sources };
}

/** Ring once per silence. Returns the sources rung this time. */
export async function notifySilence(supabase: any, input: { silentAfterMinutes: number; now?: Date }): Promise<string[]> {
  const now = input.now || new Date();
  const { data, error } = await supabase.from('watcher_heartbeats').select('*');
  if (error) throw error;
  const rung: string[] = [];
  for (const r of data || []) {
    const mins = minutesBetween(now, r.last_seen_at);
    if (mins <= input.silentAfterMinutes || r.silent_notified_at) continue;
    await createAdminNotification(
      {
        event_type: 'payment_to_verify',
        title: `Payment watcher silent: ${r.source}`,
        message: `No heartbeat from ${r.source} for ${mins} minutes. Students see the QR and bank options meanwhile. Check the office phone (charge, data, the forwarder app) or the Gmail script trigger.`,
        metadata: { kind: 'watcher_silent', source: r.source, minutes: mins, url: '/collections?tab=credits' },
      } as any,
      supabase,
    ).catch((e: any) => console.error('[watcher-health] bell failed:', e?.message));
    const { error: upErr } = await supabase.from('watcher_heartbeats').update({ silent_notified_at: now.toISOString() }).eq('source', r.source);
    if (upErr) throw upErr;
    rung.push(r.source);
  }
  return rung;
}
