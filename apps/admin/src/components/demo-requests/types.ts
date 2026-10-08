import type {
  DemoRequest,
  DemoRequestEvent,
  DemoRequestMessage,
  DemoHost,
  DemoScheduleSettings,
} from '@neram/database';

export type { DemoRequest, DemoRequestEvent, DemoRequestMessage, DemoHost, DemoScheduleSettings };

export interface DeskKpis {
  newRequests: number;
  today: number;
  confirmedNext7: number;
  attendanceRate30: number | null;
  enrolled30: number;
  requests30: number;
}

export interface DeskSettings {
  /** The demo team. */
  hosts: DemoHost[];
  defaultTutorUpn: string | null;
  schedule: DemoScheduleSettings;
  drawingWhatsApp: string;
}

export interface DeskList {
  requests: DemoRequest[];
  kpis: DeskKpis;
  settings: DeskSettings;
}

export interface DeskDetail {
  request: DemoRequest;
  events: DemoRequestEvent[];
  messages: DemoRequestMessage[];
  actors: Record<string, string>;
}

export type DeskTab = 'new' | 'followup' | 'upcoming' | 'done' | 'closed';

export const DESK_TABS: Array<{ id: DeskTab; label: string; hint: string }> = [
  { id: 'new', label: 'New', hint: 'Not called yet' },
  { id: 'followup', label: 'Follow-up', hint: 'Called, time not fixed' },
  { id: 'upcoming', label: 'Upcoming', hint: 'Confirmed demos' },
  { id: 'done', label: 'Done', hint: 'Attended or no-show' },
  { id: 'closed', label: 'Closed', hint: 'Not interested or cancelled' },
];

export function tabOf(r: Pick<DemoRequest, 'status'>): DeskTab {
  switch (r.status) {
    case 'pending':
      return 'new';
    case 'contacted':
      return 'followup';
    case 'approved':
      return 'upcoming';
    case 'attended':
    case 'no_show':
      return 'done';
    default:
      return 'closed';
  }
}

/** Order within a tab: what needs a human first. */
export function sortForTab(tab: DeskTab, rows: DemoRequest[]): DemoRequest[] {
  const t = (s: string | null) => (s ? new Date(s).getTime() : Number.MAX_SAFE_INTEGER);
  const copy = [...rows];
  if (tab === 'new') return copy.sort((a, b) => t(a.created_at) - t(b.created_at)); // oldest waiting first
  if (tab === 'followup') return copy.sort((a, b) => t(a.next_contact_at) - t(b.next_contact_at) || t(a.created_at) - t(b.created_at));
  if (tab === 'upcoming') return copy.sort((a, b) => t(a.scheduled_start) - t(b.scheduled_start));
  return copy.sort((a, b) => t(b.scheduled_start ?? b.updated_at) - t(a.scheduled_start ?? a.updated_at));
}
