import { describe, expect, it } from 'vitest';
import { reconcile } from './analyze';
import type { Finding, FindingRow } from './types';

const NOW = '2026-10-13T00:00:00.000Z';
const EARLIER = '2026-10-01T00:00:00.000Z';

const fresh = (fp: string, substance = 'x'): Finding => ({
  fingerprint: fp,
  rule_id: fp.split('|')[0],
  category: 'indexing',
  severity: 'high',
  url: 'https://neramclasses.com/a',
  title: 'T',
  detail: {},
  substance,
});

// sha1('x').slice(0, 16), matching analyze.ts
const HASH_X = '11f6ad8ec52a2984';

const stored = (fp: string, status: FindingRow['status'], detail_hash = HASH_X): FindingRow => ({
  id: fp,
  fingerprint: fp,
  rule_id: fp.split('|')[0],
  category: 'indexing',
  severity: 'high',
  url: 'https://neramclasses.com/a',
  title: 'T',
  detail: {},
  detail_hash,
  status,
  first_seen: EARLIER,
  last_seen: EARLIER,
  resolved_at: null,
  ignored_by: status === 'ignored' ? 'admin-1' : null,
  ignore_note: status === 'ignored' ? 'intended' : null,
});

const byFp = (rows: Record<string, unknown>[]) => Object.fromEntries(rows.map((r) => [r.fingerprint as string, r]));

describe('reconcile', () => {
  it('opens new findings', () => {
    const r = reconcile([], [fresh('I3|a')], NOW);
    expect(r.created).toBe(1);
    expect(byFp(r.rows)['I3|a']).toMatchObject({ status: 'open', first_seen: NOW, last_seen: NOW });
  });

  it('keeps first_seen on a finding that still fires', () => {
    const r = reconcile([stored('I3|a', 'open')], [fresh('I3|a')], NOW);
    expect(byFp(r.rows)['I3|a']).toMatchObject({ status: 'open', first_seen: EARLIER, last_seen: NOW });
  });

  it('resolves open findings that stopped firing', () => {
    const r = reconcile([stored('I3|a', 'open')], [], NOW);
    expect(r.resolved).toBe(1);
    expect(byFp(r.rows)['I3|a']).toMatchObject({ status: 'fixed', resolved_at: NOW });
  });

  it('never resolves when the inputs were empty', () => {
    const r = reconcile([stored('I3|a', 'open')], [], NOW, false);
    expect(r.rows).toEqual([]);
  });

  it('keeps an ignored finding ignored while its substance is unchanged', () => {
    const r = reconcile([stored('I3|a', 'ignored')], [fresh('I3|a', 'x')], NOW);
    expect(byFp(r.rows)['I3|a']).toMatchObject({ status: 'ignored', ignored_by: 'admin-1', ignore_note: 'intended' });
    expect(r.stillIgnored).toBe(1);
  });

  it('reopens an ignored finding when its substance changes', () => {
    const r = reconcile([stored('I3|a', 'ignored')], [fresh('I3|a', 'y')], NOW);
    expect(byFp(r.rows)['I3|a']).toMatchObject({ status: 'open', ignored_by: null });
    expect(r.reopened).toBe(1);
  });

  it('reopens a fixed finding that fires again, and leaves other fixed ones alone', () => {
    const r = reconcile([stored('I3|a', 'fixed'), stored('I1|b', 'fixed')], [fresh('I3|a')], NOW);
    expect(r.reopened).toBe(1);
    expect(r.rows.map((x) => x.fingerprint)).toEqual(['I3|a']);
  });

  it('gives every row the same keys (PostgREST nulls missing ones in a batch upsert)', () => {
    const r = reconcile([stored('I1|b', 'open')], [fresh('I3|a')], NOW);
    const keys = r.rows.map((x) => Object.keys(x).sort().join(','));
    expect(new Set(keys).size).toBe(1);
  });
});
