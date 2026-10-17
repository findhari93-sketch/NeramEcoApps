/**
 * One timeline for the ticket detail pane: messages and activity merged by
 * time, each activity row turned into a short sentence. Pure.
 *
 * A move made from the composer ("Send and resolve") writes both a message
 * and an activity row carrying the same text as its reason. The reason is
 * dropped from the activity line then, so the words show once.
 */
import type { SupportTicketActivity, SupportTicketComment } from '@neram/database';
import { TICKET_CATEGORY_LABEL, TICKET_OUTCOME_LABEL } from '@neram/database/support-ticket-status';

export type TimelineItem =
  | {
      kind: 'message';
      id: string;
      at: string;
      author: string;
      side: 'staff' | 'requester';
      internal: boolean;
      content: string;
    }
  | {
      kind: 'event';
      id: string;
      at: string;
      action: SupportTicketActivity['action'];
      text: string;
      reason: string | null;
      tone: 'neutral' | 'info' | 'success' | 'warning' | 'error';
      /** Hidden from the requester (assignments, priority, category). */
      staffOnly: boolean;
    };

const SAME_MOVE_MS = 15_000;

function name(a: SupportTicketActivity): string {
  return a.actor_name?.trim() || (a.actor_id ? 'Staff' : 'Neram Support');
}

function outcomeOf(a: SupportTicketActivity): string | null {
  const code = (a.metadata as Record<string, unknown> | null)?.resolution_code;
  return typeof code === 'string' ? TICKET_OUTCOME_LABEL[code as keyof typeof TICKET_OUTCOME_LABEL] ?? code : null;
}

const PRIORITY_WORD: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High' };

/** The sentence for one activity row. */
export function activityText(a: SupportTicketActivity, requesterName = 'The requester'): { text: string; tone: Extract<TimelineItem, { kind: 'event' }>['tone'] } {
  const meta = (a.metadata || {}) as Record<string, unknown>;
  const who = name(a);
  switch (a.action) {
    case 'created':
      return { text: `${requesterName} raised this ticket`, tone: 'neutral' };
    case 'started':
      return { text: `${who} started work`, tone: 'info' };
    case 'assigned':
      return {
        text:
          typeof meta.assignee_name === 'string' && meta.assignee_name
            ? meta.assignee_id === a.actor_id
              ? `${who} took this ticket`
              : `${who} assigned this to ${meta.assignee_name}`
            : `${who} assigned this ticket`,
        tone: 'neutral',
      };
    case 'unassigned':
      return { text: `${who} unassigned this ticket`, tone: 'neutral' };
    case 'info_requested':
      return { text: `${who} asked the requester for more`, tone: 'warning' };
    case 'student_replied':
      return { text: `${requesterName} replied, back to work`, tone: 'info' };
    case 'resumed':
      return { text: `${who} resumed work`, tone: 'info' };
    case 'resolved': {
      const outcome = outcomeOf(a);
      return { text: `${who} resolved this${outcome ? ` as ${outcome}` : ''}, waiting for confirmation`, tone: 'success' };
    }
    case 'confirmed':
      return { text: a.actor_id ? `${who} confirmed it is fixed` : 'Confirmed as fixed', tone: 'success' };
    case 'reopened':
      return { text: `${who} reopened this ticket`, tone: 'error' };
    case 'closed': {
      const outcome = outcomeOf(a);
      return { text: `${who} closed this${outcome ? ` as ${outcome}` : ''}`, tone: 'neutral' };
    }
    case 'auto_closed': {
      const outcome = outcomeOf(a);
      return {
        text: outcome === TICKET_OUTCOME_LABEL.no_response ? 'Closed on its own: no reply in time' : `Closed on its own${outcome ? ` as ${outcome}` : ''}`,
        tone: 'neutral',
      };
    }
    case 'priority_changed':
      return {
        text: `${who} changed priority from ${PRIORITY_WORD[String(meta.from)] ?? meta.from ?? 'unset'} to ${PRIORITY_WORD[String(meta.to)] ?? meta.to}`,
        tone: 'neutral',
      };
    case 'category_changed':
      return {
        text: `${who} changed category from ${TICKET_CATEGORY_LABEL[String(meta.from)] ?? meta.from ?? 'unset'} to ${TICKET_CATEGORY_LABEL[String(meta.to)] ?? meta.to}`,
        tone: 'neutral',
      };
    default:
      return { text: `${who}: ${String(a.action).replace(/_/g, ' ')}`, tone: 'neutral' };
  }
}

export function buildTimeline(
  comments: SupportTicketComment[],
  activity: SupportTicketActivity[],
  requesterName = 'The requester'
): TimelineItem[] {
  const staffMessages = comments.filter((c) => c.is_admin);
  const echoes = (a: SupportTicketActivity) =>
    !!a.reason &&
    staffMessages.some(
      (c) => c.content.trim() === a.reason!.trim() && Math.abs(Date.parse(c.created_at) - Date.parse(a.created_at)) <= SAME_MOVE_MS
    );

  const items: TimelineItem[] = [
    ...comments.map(
      (c): TimelineItem => ({
        kind: 'message',
        id: `c-${c.id}`,
        at: c.created_at,
        author: c.user_name || (c.is_admin ? 'Staff' : requesterName),
        side: c.is_admin ? 'staff' : 'requester',
        internal: !!c.is_internal,
        content: c.content,
      })
    ),
    ...activity.map((a): TimelineItem => {
      const { text, tone } = activityText(a, requesterName);
      return {
        kind: 'event',
        id: `a-${a.id}`,
        at: a.created_at,
        action: a.action,
        text,
        reason: a.reason && !echoes(a) ? a.reason : null,
        tone,
        staffOnly: a.visible_to_student === false,
      };
    }),
  ];

  // Oldest first. At the same instant an event comes before the message it caused.
  return items.sort((x, y) => {
    const d = Date.parse(x.at) - Date.parse(y.at);
    if (d !== 0) return d;
    return x.kind === y.kind ? 0 : x.kind === 'event' ? -1 : 1;
  });
}

/** "5 min ago", "3 h ago", "2 d ago", then a date. */
export function timeAgo(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const min = Math.floor((now - t) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} d ago`;
  return new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}
