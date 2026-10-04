// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  applyStudentHubQuery,
  parseStudentHubQuery,
  columnValue,
  yearOptionsOf,
  STUDENT_HUB_PAGE_SIZE,
  type HubRowLike,
} from './student-hub-query';

const row = (over: Partial<HubRowLike> & { id: string }): HubRowLike => ({
  name: null,
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  fee_paid: 0,
  fee_due: 0,
  is_alumni: false,
  ms_oid: 'oid',
  application_state: 'complete',
  detail_request_progress: 'not_asked',
  ...over,
});

const rows: HubRowLike[] = [
  row({ id: 'a', name: 'Arun', phone: '+919876543210', academic_year: '2026-27', fee_paid: 30000, fee_due: 0, payment_status: 'paid', has_nexus_access: true, nexus_first_login_at: '2026-09-01', source: 'direct_link' }),
  row({ id: 'b', name: 'bala', academic_year: '2025-26', past_batch: true, fee_paid: 10000, fee_due: 20000, payment_status: 'pending', application_state: 'partial', source: 'student_link', detail_request_progress: 'asked' }),
  row({ id: 'c', name: 'Chitra', academic_year: null, ms_oid: null, application_state: 'missing', classroom_email: 'chitra@neramclasses.com' }),
  row({ id: 'd', name: 'Divya', academic_year: '2026-27', application_state: 'missing', is_alumni: true }),
];

describe('parseStudentHubQuery', () => {
  it('returns every row when no paging params are sent (old callers keep working)', () => {
    const q = parseStudentHubQuery(new URLSearchParams('year=current'));
    expect(q.pageSize).toBeNull();
    expect(q.pageIndex).toBe(0);
  });

  it('reads page, size, sort, filters, search and banner flags', () => {
    const p = new URLSearchParams({
      page: '2',
      pageSize: '50',
      sorting: JSON.stringify([{ id: 'fee_due', desc: true }, { id: 'hack', desc: false }]),
      filters: JSON.stringify([{ id: 'application', value: 'Not started' }, { id: 'phone', value: '' }]),
      q: '  arun ',
      pastBatch: '1',
      noForm: '1',
    });
    const q = parseStudentHubQuery(p);
    expect(q.pageIndex).toBe(2);
    expect(q.pageSize).toBe(STUDENT_HUB_PAGE_SIZE);
    expect(q.sorting).toEqual([{ id: 'fee_due', desc: true }]); // unknown column dropped
    expect(q.columnFilters).toEqual([{ id: 'application', value: 'Not started' }]); // empty filter dropped
    expect(q.globalFilter).toBe('arun');
    expect(q.pastBatch).toBe(true);
    expect(q.personalOnly).toBe(false);
    expect(q.noForm).toBe(true);
  });

  it('caps the page size, survives bad JSON, and all=1 returns everything', () => {
    expect(parseStudentHubQuery(new URLSearchParams('page=0&pageSize=99999')).pageSize).toBe(200);
    const bad = parseStudentHubQuery(new URLSearchParams('page=0&sorting={oops&filters=nope'));
    expect(bad.sorting).toEqual([]);
    expect(bad.columnFilters).toEqual([]);
    expect(parseStudentHubQuery(new URLSearchParams('page=3&pageSize=50&all=1')).pageSize).toBeNull();
  });
});

describe('applyStudentHubQuery', () => {
  const base = parseStudentHubQuery(new URLSearchParams('page=0&pageSize=50'));

  it('sorts by name by default, case-insensitively', () => {
    expect(applyStudentHubQuery(rows, base).rows.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('pages and reports the filtered total', () => {
    const q = { ...base, pageSize: 2, pageIndex: 1 };
    const res = applyStudentHubQuery(rows, q);
    expect(res.total).toBe(4);
    expect(res.rows.map((r) => r.id)).toEqual(['c', 'd']);
  });

  it('applies the banner flags like the old client filters', () => {
    expect(applyStudentHubQuery(rows, { ...base, pastBatch: true }).rows.map((r) => r.id)).toEqual(['b']);
    expect(applyStudentHubQuery(rows, { ...base, personalOnly: true }).rows.map((r) => r.id)).toEqual(['c']);
    // No form at all, alumni excluded.
    expect(applyStudentHubQuery(rows, { ...base, noForm: true }).rows.map((r) => r.id)).toEqual(['c']);
  });

  it('filters select columns on the label the grid shows', () => {
    const f = (id: string, value: unknown) => applyStudentHubQuery(rows, { ...base, columnFilters: [{ id, value }] }).rows.map((r) => r.id);
    expect(f('application', 'Not started')).toEqual(['c', 'd']);
    expect(f('asked', 'Link sent')).toEqual(['b']);
    expect(f('join_method', 'Direct')).toEqual(['a']);
    expect(f('join_method', 'Application')).toEqual(['c', 'd']); // no source falls back to Application
    expect(f('nexus_access', 'In')).toEqual(['a']);
    expect(f('nexus_opened', 'Not yet')).toEqual(['b', 'c', 'd']);
    expect(f('academic_year', '2026-27')).toEqual(['a', 'd']);
    expect(f('payment_status', 'pending')).toEqual(['b']);
  });

  it('filters money on an inclusive range and ignores an open end', () => {
    const f = (value: unknown) => applyStudentHubQuery(rows, { ...base, columnFilters: [{ id: 'fee_due', value }] }).rows.map((r) => r.id);
    expect(f([1, ''])).toEqual(['b']);
    expect(f(['', 0])).toEqual(['a', 'c', 'd']);
    expect(f([20000, 20000])).toEqual(['b']);
  });

  it('text filters and search are case-insensitive contains; phone also matches on digits', () => {
    const f = (id: string, value: string) => applyStudentHubQuery(rows, { ...base, columnFilters: [{ id, value }] }).rows.map((r) => r.id);
    expect(f('name', 'CHI')).toEqual(['c']);
    expect(f('phone', '98765 43210')).toEqual(['a']);
    expect(applyStudentHubQuery(rows, { ...base, globalFilter: 'neramclasses' }).rows.map((r) => r.id)).toEqual(['c']);
    expect(applyStudentHubQuery(rows, { ...base, globalFilter: '9876 5432' }).rows.map((r) => r.id)).toEqual(['a']);
  });

  it('sorts numbers numerically and keeps empty values last in both directions', () => {
    const byDue = (desc: boolean) => applyStudentHubQuery(rows, { ...base, sorting: [{ id: 'fee_due', desc }] }).rows.map((r) => r.id);
    expect(byDue(true)[0]).toBe('b');
    const byYear = (desc: boolean) => applyStudentHubQuery(rows, { ...base, sorting: [{ id: 'academic_year', desc }] }).rows.map((r) => r.id);
    expect(byYear(false)).toEqual(['b', 'a', 'd', 'c']);
    expect(byYear(true)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('handles an empty cohort', () => {
    expect(applyStudentHubQuery([], base)).toEqual({ rows: [], total: 0 });
  });

  it('handles 120 rows across pages without losing or repeating any', () => {
    const many = Array.from({ length: 120 }, (_, i) => row({ id: `s${String(i).padStart(3, '0')}`, name: `Student ${i % 7}` }));
    const seen = new Set<string>();
    for (let page = 0; page < 3; page++) {
      for (const r of applyStudentHubQuery(many, { ...base, pageIndex: page }).rows) seen.add(r.id);
    }
    expect(seen.size).toBe(120);
  });
});

describe('columnValue / yearOptionsOf', () => {
  it('derives display values', () => {
    expect(columnValue(row({ id: 'x', first_name: 'Kavi', last_name: 'R' }), 'name')).toBe('Kavi R');
    expect(columnValue(row({ id: 'x', application_state: undefined, application_missing: 'no_application' }), 'application')).toBe('Not started');
  });

  it('lists years newest first from the whole cohort', () => {
    expect(yearOptionsOf(rows)).toEqual(['2026-27', '2025-26']);
  });
});
