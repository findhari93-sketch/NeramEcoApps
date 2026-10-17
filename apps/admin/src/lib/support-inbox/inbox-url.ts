/**
 * The support inbox view lives in the URL, so Back, a refresh and a shared
 * link all land in the same place:
 *
 *   ?queue=new|in_progress|waiting|to_confirm|closed|all   (default new)
 *   ?ticket=NERAM-TKT-00001 (or a UUID)  ?q  ?assignee=me|unassigned
 *   ?source  ?category  ?priority
 *
 * The bell's older links used ?highlight=<uuid>; that still opens the ticket.
 * Unknown values fall back to the default rather than erroring. Pure.
 */
import type { SupportTicketQueue } from '@neram/database';
import { TICKET_CATEGORY_LABEL, TICKET_SOURCE_LABEL } from '@neram/database/support-ticket-status';

export const INBOX_QUEUES: SupportTicketQueue[] = ['new', 'in_progress', 'waiting', 'to_confirm', 'closed', 'all'];

export const QUEUE_LABEL: Record<SupportTicketQueue, string> = {
  new: 'New',
  in_progress: 'In progress',
  waiting: 'Waiting',
  to_confirm: 'To confirm',
  closed: 'Closed',
  all: 'All',
};

export type AssigneeFilter = '' | 'me' | 'unassigned';

export interface InboxUrlState {
  queue: SupportTicketQueue;
  ticket: string | null;
  q: string;
  assignee: AssigneeFilter;
  source: string;
  category: string;
  priority: string;
}

export const DEFAULT_INBOX_STATE: InboxUrlState = {
  queue: 'new',
  ticket: null,
  q: '',
  assignee: '',
  source: '',
  category: '',
  priority: '',
};

const TICKET_REF = /^(NERAM-TKT-\d{3,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const PRIORITIES = ['low', 'medium', 'high'];

function oneOf(value: string | null, allowed: readonly string[]): string {
  return value && allowed.includes(value) ? value : '';
}

/** A ticket reference worth asking the API about, normalised, or null. */
export function cleanTicketRef(value: string | null | undefined): string | null {
  const v = (value || '').trim();
  if (!TICKET_REF.test(v)) return null;
  return /^neram-tkt-/i.test(v) ? v.toUpperCase() : v.toLowerCase();
}

export function parseInboxUrl(search: string): InboxUrlState {
  const p = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const queue = p.get('queue');
  return {
    queue: queue && (INBOX_QUEUES as string[]).includes(queue) ? (queue as SupportTicketQueue) : 'new',
    ticket: cleanTicketRef(p.get('ticket')) ?? cleanTicketRef(p.get('highlight')),
    q: (p.get('q') || '').slice(0, 80),
    assignee: oneOf(p.get('assignee'), ['me', 'unassigned']) as AssigneeFilter,
    source: oneOf(p.get('source'), Object.keys(TICKET_SOURCE_LABEL)),
    category: oneOf(p.get('category'), Object.keys(TICKET_CATEGORY_LABEL)),
    priority: oneOf(p.get('priority'), PRIORITIES),
  };
}

/** The query string for a view, defaults left out. Starts with '?' or is empty. */
export function inboxSearch(state: InboxUrlState): string {
  const p = new URLSearchParams();
  if (state.queue !== 'new') p.set('queue', state.queue);
  if (state.ticket) p.set('ticket', state.ticket);
  if (state.q.trim()) p.set('q', state.q.trim());
  if (state.assignee) p.set('assignee', state.assignee);
  if (state.source) p.set('source', state.source);
  if (state.category) p.set('category', state.category);
  if (state.priority) p.set('priority', state.priority);
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** The list API query for a view and page. */
export function listApiQuery(state: InboxUrlState, page: number, withCounts: boolean): string {
  const p = new URLSearchParams();
  p.set('queue', state.queue);
  p.set('page', String(page));
  p.set('limit', '30');
  if (state.q.trim()) p.set('q', state.q.trim());
  if (state.assignee) p.set('assignee', state.assignee);
  if (state.source) p.set('source', state.source);
  if (state.category) p.set('category', state.category);
  if (state.priority) p.set('priority', state.priority);
  if (withCounts) p.set('counts', '1');
  return p.toString();
}
