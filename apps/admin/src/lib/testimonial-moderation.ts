/**
 * Pure helpers for the testimonial moderation queue (/testimonials).
 * Tested in testimonial-moderation.test.ts.
 */

export type PublicationStatusKey = 'private' | 'pending_moderation' | 'approved' | 'published' | 'rejected' | 'withdrawn';
export type ModerationActionKey = 'approve' | 'publish' | 'reject' | 'withdraw' | 'confirm';

/** The API action each button sends. Confirm re-publishes, which stamps moderated_by and moderated_at. */
export const API_ACTION: Record<ModerationActionKey, 'approve' | 'publish' | 'reject' | 'withdraw'> = {
  approve: 'approve',
  publish: 'publish',
  reject: 'reject',
  withdraw: 'withdraw',
  confirm: 'publish',
};

export const MODERATION_TABS = ['waiting', 'confirm', 'public', 'not_public', 'all'] as const;
export type ModerationTab = (typeof MODERATION_TABS)[number];

export const MODERATION_TAB_LABELS: Record<ModerationTab, string> = {
  waiting: 'Waiting for review',
  confirm: 'Needs confirmation',
  public: 'Public',
  not_public: 'Not public',
  all: 'All',
};

export const NOT_PUBLIC_STATUSES: PublicationStatusKey[] = ['private', 'approved', 'rejected', 'withdrawn'];

export function resolveModerationTab(value: string | null | undefined): ModerationTab {
  return value && (MODERATION_TABS as readonly string[]).includes(value) ? (value as ModerationTab) : 'waiting';
}

export type SourceFilter = 'all' | 'learner' | 'staff';

export function resolveSourceFilter(value: string | null | undefined): SourceFilter {
  return value === 'learner' || value === 'staff' ? value : 'all';
}

/** The status the list API is asked for; "Not public" asks for all and filters here. */
export function apiStatusForTab(tab: ModerationTab): string {
  if (tab === 'waiting') return 'pending_moderation';
  if (tab === 'public' || tab === 'confirm') return 'published';
  return 'all';
}

export function rowMatchesTab(
  status: string | null | undefined,
  tab: ModerationTab,
  moderatedAt?: string | null,
): boolean {
  switch (tab) {
    case 'confirm':
      return needsConfirmation({ publication_status: status, moderated_at: moderatedAt });
    case 'waiting':
      return status === 'pending_moderation';
    case 'public':
      return status === 'published';
    case 'not_public':
      return NOT_PUBLIC_STATUSES.includes(status as PublicationStatusKey);
    default:
      return true;
  }
}

export interface ModerationRow {
  source?: string | null;
  publication_status?: string | null;
  moderated_at?: string | null;
  consent_given_at?: string | null;
  consent_by?: string | null;
  consent_display_name?: string | null;
}

export interface ConsentSummary {
  state: 'self' | 'guardian' | 'staff_recorded' | 'none';
  /** Headline, always shown with an icon. */
  label: string;
  /** Second line: display name and date, or what the missing consent means. */
  detail: string;
  canPublish: boolean;
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

export function consentSummary(row: ModerationRow): ConsentSummary {
  const isLearner = row.source === 'learner';
  const name = (row.consent_display_name || '').trim();
  const when = row.consent_given_at ? shortDate(row.consent_given_at) : '';
  const shownAs = name ? `Shown as "${name}"` : 'No display name given';

  if (row.consent_given_at && row.consent_by === 'guardian') {
    return {
      state: 'guardian',
      label: 'Parent or guardian agreed to publish',
      detail: [shownAs, when && `agreed ${when}`].filter(Boolean).join(', '),
      canPublish: true,
    };
  }
  if (row.consent_given_at && row.consent_by !== 'staff_recorded') {
    return {
      state: 'self',
      label: 'Learner agreed to publish',
      detail: [shownAs, when && `agreed ${when}`].filter(Boolean).join(', '),
      canPublish: true,
    };
  }
  if (!isLearner) {
    return {
      state: 'staff_recorded',
      label: 'Entered by staff',
      detail: 'Consent is not recorded in the app.',
      canPublish: true,
    };
  }
  return {
    state: 'none',
    label: 'No consent to publish',
    detail: 'Can stay private only.',
    canPublish: false,
  };
}

/**
 * Public but never confirmed by a person (the testimonials entered before
 * moderation existed). They stay on the legacy page but do not count towards
 * /reviews, the Review JSON-LD or the computed rating until someone confirms.
 */
export function needsConfirmation(row: Pick<ModerationRow, 'publication_status' | 'moderated_at'>): boolean {
  return row.publication_status === 'published' && !row.moderated_at;
}

/** Status words for a row: an unconfirmed public row says so. */
export function publicationLabel(row: Pick<ModerationRow, 'publication_status' | 'moderated_at'>, labels: Record<string, string>): string {
  if (needsConfirmation(row)) return 'Public, not yet confirmed';
  const s = row.publication_status || '';
  return labels[s] || s.replace(/_/g, ' ');
}

/** Buttons for one row: an unconfirmed public row gets Confirm as genuine first. */
export function actionsForRow(row: Pick<ModerationRow, 'publication_status' | 'moderated_at'>): ModerationActionKey[] {
  if (needsConfirmation(row)) return ['confirm', 'withdraw'];
  return actionsForStatus(row.publication_status);
}

/** Which moderation buttons make sense from a status. */
export function actionsForStatus(status: string | null | undefined): ModerationActionKey[] {
  switch (status) {
    case 'pending_moderation':
      return ['approve', 'publish', 'reject'];
    case 'approved':
      return ['publish', 'reject'];
    case 'published':
      return ['withdraw'];
    case 'rejected':
      return ['approve', 'publish'];
    case 'withdrawn':
      return ['publish'];
    case 'private':
      return ['approve', 'publish'];
    default:
      return [];
  }
}

export const ACTION_LABELS: Record<ModerationActionKey, string> = {
  approve: 'Approve',
  publish: 'Publish',
  reject: 'Not publish',
  withdraw: 'Take down',
  confirm: 'Confirm as genuine',
};

/** Text of a testimonial: content is jsonb { en: text } on new rows, a plain string on some old ones. */
export function testimonialText(content: unknown): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (typeof content === 'object') {
    const c = content as Record<string, unknown>;
    if (typeof c.en === 'string') return c.en;
    const first = Object.values(c).find((v) => typeof v === 'string');
    return (first as string) || '';
  }
  return '';
}

export const EXAM_LABELS: Record<string, string> = {
  NATA: 'NATA',
  JEE_PAPER_2: 'JEE Paper 2',
  BOTH: 'NATA and JEE Paper 2',
};
