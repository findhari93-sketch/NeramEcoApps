/**
 * Server-side paging, sorting, filtering and search for the /students hub grid.
 *
 * The grid used to receive the whole cohort and filter it in the browser. Now
 * /api/students builds the cohort, applies these rules and sends back one page of
 * 50 plus the total, so the browser downloads a page instead of every row. The
 * column values the grid displays (Application, Asked, Join method, Access,
 * Opened Nexus) are derived, so the labels live here and both the grid and the
 * route import them: a filter value the grid offers is exactly what this module
 * compares against.
 *
 * Pure: no React, no database.
 */

export type ApplicationState = 'complete' | 'partial' | 'missing';
export type AskProgress = 'not_asked' | 'asked' | 'opened' | 'answered';

export const APPLICATION_STATE_LABEL: Record<ApplicationState, string> = {
  complete: 'Complete',
  partial: 'Partly filled',
  missing: 'Not started',
};

export const ASKED_LABEL: Record<AskProgress, string> = {
  not_asked: 'Not asked',
  asked: 'Link sent',
  opened: 'Opened',
  answered: 'Answered',
};

/** How each record arrived (lead_profiles.source), as the label the grid shows and filters on. */
export const JOIN_METHOD_LABEL: Record<string, string> = {
  direct_link: 'Direct',
  website_form: 'Application',
  app: 'Application',
  student_link: 'Student link',
  manual: 'Added by staff',
  referral: 'Referral',
  __default: 'Application',
};

/** The fields of a hub row this module reads. */
export interface HubRowLike {
  id: string;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  classroom_email?: string | null;
  personal_email?: string | null;
  phone?: string | null;
  student_id?: string | null;
  application_number?: string | null;
  interest_course?: string | null;
  payment_status?: string | null;
  academic_year?: string | null;
  source?: string | null;
  fee_paid?: number | null;
  fee_due?: number | null;
  enrollment_date?: string | null;
  is_alumni?: boolean;
  past_batch?: boolean;
  has_nexus_access?: boolean;
  ms_oid?: string | null;
  nexus_first_login_at?: string | null;
  application_state?: ApplicationState;
  application_complete?: boolean;
  application_missing?: 'no_application' | 'incomplete' | null;
  detail_request_progress?: AskProgress;
}

/** The row's three-state answer, falling back to the old boolean pair. */
export function stateOf(row: HubRowLike): ApplicationState {
  if (row.application_state) return row.application_state;
  if (row.application_complete) return 'complete';
  return row.application_missing === 'no_application' ? 'missing' : 'partial';
}

export function displayName(row: HubRowLike): string {
  return row.name || [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Unnamed';
}

export function joinMethodLabel(source: string | null | undefined): string {
  return JOIN_METHOD_LABEL[source || ''] ?? JOIN_METHOD_LABEL.__default;
}

/** The value a grid column shows, keyed by the grid's column id. */
export function columnValue(row: HubRowLike, columnId: string): string | number | null {
  switch (columnId) {
    case 'name':
      return displayName(row);
    case 'application':
      return APPLICATION_STATE_LABEL[stateOf(row)];
    case 'asked':
      return ASKED_LABEL[row.detail_request_progress || 'not_asked'];
    case 'join_method':
      return joinMethodLabel(row.source);
    case 'nexus_access':
      return row.has_nexus_access ? 'In' : 'Out';
    case 'nexus_opened':
      return row.nexus_first_login_at ? 'Opened' : 'Not yet';
    case 'fee_paid':
      return Number(row.fee_paid) || 0;
    case 'fee_due':
      return Number(row.fee_due) || 0;
    case 'classroom_email':
    case 'phone':
    case 'interest_course':
    case 'payment_status':
    case 'academic_year':
    case 'personal_email':
    case 'enrollment_date':
      return (row as any)[columnId] ?? null;
    default:
      return null;
  }
}

/** Columns whose filter is an exact pick from a list (the rest are text "contains" or a range). */
const SELECT_COLUMNS = new Set([
  'interest_course',
  'application',
  'asked',
  'join_method',
  'payment_status',
  'academic_year',
  'nexus_access',
  'nexus_opened',
]);
const RANGE_COLUMNS = new Set(['fee_paid', 'fee_due']);
const TEXT_COLUMNS = new Set(['name', 'classroom_email', 'phone', 'personal_email']);
export const SORTABLE_COLUMNS = new Set([
  ...SELECT_COLUMNS,
  ...RANGE_COLUMNS,
  ...TEXT_COLUMNS,
  'enrollment_date',
]);

export const STUDENT_HUB_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

export interface StudentHubQuery {
  pageIndex: number;
  /** null = every matching row (used by "Ask them all"). */
  pageSize: number | null;
  sorting: Array<{ id: string; desc: boolean }>;
  globalFilter: string;
  columnFilters: Array<{ id: string; value: unknown }>;
  pastBatch: boolean;
  personalOnly: boolean;
  noForm: boolean;
}

function safeJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Read the grid state from the query string. Absent paging params return every
 * row, so existing callers of /api/students keep their old full-list behaviour.
 */
export function parseStudentHubQuery(params: URLSearchParams): StudentHubQuery {
  const all = params.get('all') === '1';
  const hasPaging = params.has('page') || params.has('pageSize');
  const rawSize = Number(params.get('pageSize'));
  const pageSize =
    all || !hasPaging
      ? null
      : Math.min(MAX_PAGE_SIZE, Math.max(1, Number.isFinite(rawSize) && rawSize > 0 ? Math.floor(rawSize) : STUDENT_HUB_PAGE_SIZE));
  const rawPage = Number(params.get('page'));
  const sorting = safeJson<unknown>(params.get('sorting'), []);
  const filters = safeJson<unknown>(params.get('filters'), []);
  return {
    pageIndex: pageSize === null ? 0 : Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 0,
    pageSize,
    sorting: Array.isArray(sorting)
      ? sorting
          .filter((s: any) => s && typeof s.id === 'string' && SORTABLE_COLUMNS.has(s.id))
          .map((s: any) => ({ id: s.id, desc: !!s.desc }))
      : [],
    globalFilter: (params.get('q') || '').trim().slice(0, 200),
    columnFilters: Array.isArray(filters)
      ? filters.filter((f: any) => f && typeof f.id === 'string' && f.value !== undefined && f.value !== null && f.value !== '')
      : [],
    pastBatch: params.get('pastBatch') === '1',
    personalOnly: params.get('personalOnly') === '1',
    noForm: params.get('noForm') === '1',
  };
}

const norm = (v: unknown) => String(v ?? '').toLowerCase();

function matchesFilter(row: HubRowLike, filter: { id: string; value: unknown }): boolean {
  const { id, value } = filter;
  const cell = columnValue(row, id);
  if (RANGE_COLUMNS.has(id)) {
    const [minRaw, maxRaw] = Array.isArray(value) ? value : [value, undefined];
    const n = Number(cell) || 0;
    const min = minRaw === '' || minRaw === null || minRaw === undefined ? null : Number(minRaw);
    const max = maxRaw === '' || maxRaw === null || maxRaw === undefined ? null : Number(maxRaw);
    if (min !== null && Number.isFinite(min) && n < min) return false;
    if (max !== null && Number.isFinite(max) && n > max) return false;
    return true;
  }
  if (SELECT_COLUMNS.has(id)) {
    const wanted = Array.isArray(value) ? value.map(String) : [String(value)];
    return wanted.length === 0 || wanted.includes(String(cell ?? ''));
  }
  if (TEXT_COLUMNS.has(id)) {
    const needle = norm(value).trim();
    if (!needle) return true;
    if (id === 'phone') {
      // Digits-only match too, so "98765 43210" finds "+919876543210".
      const digits = needle.replace(/\D/g, '');
      if (digits && String(cell ?? '').replace(/\D/g, '').includes(digits)) return true;
    }
    return norm(cell).includes(needle);
  }
  // Unknown column: ignore rather than empty the grid.
  return true;
}

function matchesSearch(row: HubRowLike, q: string): boolean {
  const needle = q.toLowerCase();
  const digits = needle.replace(/\D/g, '');
  const hay = [
    displayName(row),
    row.email,
    row.classroom_email,
    row.personal_email,
    row.phone,
    row.student_id,
    row.application_number,
  ];
  if (hay.some((v) => norm(v).includes(needle))) return true;
  return digits.length >= 4 && norm(row.phone).replace(/\D/g, '').includes(digits);
}

function compare(a: string | number | null, b: string | number | null): number {
  // Empty values always last, whichever direction.
  const ae = a === null || a === '';
  const be = b === null || b === '';
  if (ae && be) return 0;
  if (ae) return 1;
  if (be) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'en', { numeric: true, sensitivity: 'base' });
}

/** Apply the banner flags, column filters, search and sort, then cut the page. */
export function applyStudentHubQuery<T extends HubRowLike>(
  rows: T[],
  q: StudentHubQuery,
): { rows: T[]; total: number } {
  let out = rows;
  if (q.pastBatch) out = out.filter((s) => s.past_batch);
  if (q.personalOnly) out = out.filter((s) => !s.ms_oid);
  if (q.noForm) out = out.filter((s) => stateOf(s) === 'missing' && !s.is_alumni);
  for (const f of q.columnFilters) out = out.filter((s) => matchesFilter(s, f));
  if (q.globalFilter) out = out.filter((s) => matchesSearch(s, q.globalFilter));

  const sorting = q.sorting.length ? q.sorting : [{ id: 'name', desc: false }];
  out = [...out].sort((a, b) => {
    for (const { id, desc } of sorting) {
      const av = columnValue(a, id);
      const bv = columnValue(b, id);
      const empty = (v: unknown) => v === null || v === '';
      // Keep empties last in both directions; only real values flip.
      if (empty(av) || empty(bv)) {
        const c = compare(av, bv);
        if (c) return c;
        continue;
      }
      const c = compare(av, bv);
      if (c) return desc ? -c : c;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const total = out.length;
  if (q.pageSize === null) return { rows: out, total };
  const start = q.pageIndex * q.pageSize;
  return { rows: out.slice(start, start + q.pageSize), total };
}

/** Year filter options from the whole cohort (not just the visible page), newest first. */
export function yearOptionsOf(rows: HubRowLike[]): string[] {
  const set = new Set<string>();
  for (const s of rows) if (s.academic_year) set.add(s.academic_year);
  return [...set].sort((a, b) => b.localeCompare(a));
}
