/**
 * Server helpers for Demo Class v2 on marketing: settings, and the slice of a
 * request a student may see about themselves.
 */

import {
  getSupabaseAdminClient,
  resolveDemoSettings,
  demoTutorName,
  type DemoRequest,
  type DemoSettings,
} from '@neram/database';

export async function loadDemoSettings(): Promise<DemoSettings> {
  const supabase = getSupabaseAdminClient() as any;
  const { data } = await supabase.from('site_settings').select('value').eq('key', 'demo_class').maybeSingle();
  return resolveDemoSettings(data?.value);
}

/** What /demo-class/my and the booking card show. No staff notes, no host mailbox. */
export interface PublicDemoRequest {
  ref: string;
  token: string;
  status: DemoRequest['status'];
  name: string;
  preferredDate: string | null;
  preferredWindow: DemoRequest['preferred_window'];
  parentJoining: boolean;
  scheduledStart: string | null;
  minutes: number;
  hostName: string | null;
  /** Only once confirmed. */
  joinUrl: string | null;
  scheduleNote: string | null;
  drawingReceived: boolean;
  createdAt: string;
}

export function toPublicDemoRequest(r: DemoRequest, settings: DemoSettings): PublicDemoRequest {
  const confirmed = r.status === 'approved';
  return {
    ref: r.ref_code || '',
    token: r.join_token || '',
    status: r.status,
    name: r.name,
    preferredDate: r.preferred_date,
    preferredWindow: r.preferred_window,
    parentJoining: r.parent_joining,
    scheduledStart: r.scheduled_start,
    minutes: r.scheduled_minutes,
    hostName: demoTutorName(settings, r),
    joinUrl: confirmed ? r.teams_join_url : null,
    scheduleNote: confirmed ? r.schedule_change_reason : r.status === 'cancelled' ? r.cancel_reason : null,
    drawingReceived: !!r.drawing_received_at,
    createdAt: r.created_at,
  };
}
