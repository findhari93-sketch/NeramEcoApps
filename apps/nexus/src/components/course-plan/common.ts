/**
 * Shared bits for the Course Plan v2 screens (Builder, Schedule, Class Day,
 * Health, Catch-up): DTO shapes, status metadata and small formatters.
 */
import type {
  NexusTeachingPlanDetail,
  NexusTeachingPlanEntryDetail,
  NexusPlanAuditLogDetail,
  NexusPlanDayItem,
  NexusAssignmentStatus,
  NexusAssignmentFormat,
} from '@neram/database';

export type Entry = NexusTeachingPlanEntryDetail;

export interface PlanData {
  plan: NexusTeachingPlanDetail;
  audit: NexusPlanAuditLogDetail[];
  teachers: { id: string; name: string | null }[];
  tests: { id: string; title: string }[];
}

export interface ClassDayAssignmentSummary {
  id: string;
  title: string;
  class_date: string;
  submission_format: NexusAssignmentFormat;
  max_marks: number;
  due_at: string | null;
  status: NexusAssignmentStatus;
  attachment_count: number;
  submitted_count: number;
  topic_id: string | null;
}

export interface ClassLinks {
  class_id: string;
  recording_url: string | null;
  youtube_url: string | null;
}

export interface ClassDayPayload {
  date: string;
  day: {
    date: string;
    entryId: string | null;
    sessionIndex: number;
    sessionCount: number;
    isTest: boolean;
  } | null;
  entry: Entry | null;
  items: NexusPlanDayItem[];
  class_day_index: number;
  total_class_days: number;
  assignments: ClassDayAssignmentSummary[];
  class_links: ClassLinks | null;
  recap: { id: string; status: string } | null;
}

export const ENTRY_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  planned: { label: 'Planned', color: '#5A6672', bg: 'rgba(139,149,161,0.14)' },
  scheduled: { label: 'Scheduled', color: '#1565C0', bg: 'rgba(21,101,192,0.12)' },
  done: { label: 'Done', color: '#1B5E20', bg: 'rgba(46,125,50,0.12)' },
  spillover: { label: 'Needs another session', color: '#B54700', bg: 'rgba(239,108,0,0.14)' },
  skipped: { label: 'Skipped', color: '#C62828', bg: 'rgba(198,40,40,0.1)' },
};

export const PLAN_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: 'Draft', color: '#8D5A00', bg: 'rgba(249,168,37,0.18)' },
  active: { label: 'Active', color: '#1B5E20', bg: 'rgba(46,125,50,0.12)' },
  completed: { label: 'Completed', color: '#1565C0', bg: 'rgba(21,101,192,0.1)' },
  archived: { label: 'Archived', color: '#5A6672', bg: 'rgba(139,149,161,0.15)' },
};

/** Design's priority wording (existing enum, display-only mapping). */
export const PRIORITY_DISPLAY: Record<string, string> = {
  mandatory: 'Mandatory',
  high: 'Important',
  medium: 'Standard',
  low: 'Optional',
};

export const TEST_COLOR = '#1565C0';
export const TASK_COLOR = '#B26A00';

export function entryTitle(e: Entry): string {
  return e.topic?.title || e.test?.title || e.label || (e.entry_type === 'task' ? 'Task' : 'Entry');
}

export function entryColor(e: Entry): string {
  if (e.entry_type === 'test') return TEST_COLOR;
  if (e.entry_type === 'task') return TASK_COLOR;
  return e.topic?.module?.color || '#7C3AED';
}

/** Resolved session span of an entry. */
export function entrySpan(e: Entry): number {
  return Math.max(1, e.session_span ?? e.topic?.estimated_sessions ?? 1);
}

export const fmtDow = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short' });
export const fmtShort = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
export const fmtShortDow = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
export const fmtTime = (t: string | null) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const hh = h % 12 || 12;
  return `${hh}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
