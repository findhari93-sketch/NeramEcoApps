import { formatDemoDateTime, formatDemoPreference, type DemoScheduleSettings } from '@neram/database';
import { mobileE164, mobileParts } from '@neram/database/phone';
import type { DemoRequest } from './types';

export function ago(iso: string, now: Date): string {
  const mins = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.round(hrs / 24);
  return `${days} d ago`;
}

/** What the "When" column shows: the confirmed time, else what they asked for. */
export function whenLabel(r: DemoRequest, schedule: DemoScheduleSettings): { primary: string; secondary: string | null } {
  if (r.scheduled_start && ['approved', 'attended', 'no_show'].includes(r.status)) {
    return {
      primary: formatDemoDateTime(new Date(r.scheduled_start)),
      secondary: `Asked: ${formatDemoPreference(r.preferred_date, r.preferred_window, schedule)}`,
    };
  }
  return { primary: formatDemoPreference(r.preferred_date, r.preferred_window, schedule), secondary: null };
}

export const CLASS_LABELS: Record<string, string> = {
  '10th': 'Class 10',
  '11th': 'Class 11',
  '12th': 'Class 12',
  '12th-pass': 'Drop year',
  other: 'Other',
};

export function classLabel(v: string | null): string | null {
  return v ? CLASS_LABELS[v] || v : null;
}

/** +91 98765 43210, or a Gulf number with its own code: +971 551993240 */
export function prettyPhone(p: string | null): string {
  const { country, national } = mobileParts(p);
  if (country.code !== 'IN') return `${country.prefix} ${national}`;
  return national.length === 10 ? `+91 ${national.slice(0, 5)} ${national.slice(5)}` : p || '';
}

export function telHref(p: string): string {
  return `tel:${mobileE164(p)}`;
}

export function waHref(p: string, text?: string): string {
  return `https://wa.me/${mobileE164(p).slice(1)}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

/** New requests should get a call within 2 hours. */
export function isOverdueNew(r: DemoRequest, now: Date): boolean {
  return r.status === 'pending' && now.getTime() - new Date(r.created_at).getTime() > 2 * 60 * 60_000;
}

export function isCallbackDue(r: DemoRequest, now: Date): boolean {
  return r.status === 'contacted' && !!r.next_contact_at && new Date(r.next_contact_at).getTime() <= now.getTime();
}
