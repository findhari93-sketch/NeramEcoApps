// Runs in the default jsdom environment: the global setupFile (tests/setup.ts)
// touches `window`, so this cannot opt into the node environment. Node's fs,
// os, path and child_process are available either way.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as lib from '../../.claude/skills/perf-audit/ledger-lib.mjs';

/**
 * Guardrail for the performance-audit ledger (`/perf-audit`).
 *
 * The ledger lets an audit skip code that has not changed since it was last
 * audited. That is only safe if the fingerprints are right. A unit wrongly
 * reported `fresh` hides changed code from every later audit, silently, for
 * ever, which is much worse than an unnecessary re-read. So these tests pin the
 * ways a fingerprint could miss a change:
 *
 *   - workspace packages reached through pnpm's node_modules links
 *     (TypeScript flags them as external libraries; following that flag would
 *     drop every `@neram/*` file from every closure);
 *   - `export * as ns from`, which `ts.preProcessFile` does not report;
 *   - `dynamic(() => import(...))` and css imports;
 *   - an import the tool cannot resolve, which must read `unknown`, never `fresh`;
 *   - Windows CRLF checkouts, which must hash like Linux LF checkouts;
 *   - an edit made while an audit is in progress, which must read stale.
 *
 * The fixture is a miniature App Router app under tests/fixtures/perf-audit/repo,
 * copied to a temp folder per test so tests can edit it.
 */

const FIXTURE = path.resolve(__dirname, '../fixtures/perf-audit/repo');
const REPO_ROOT = path.resolve(__dirname, '../..');
const SKILL_DIR = path.join(REPO_ROOT, '.claude/skills/perf-audit');

const CHECKLIST = `
### HYD-1 Browser-only state in first render
\`applies=page,layout,shared evidence=static v=1\`
Look for window.
### API-1 Handler timing
\`applies=route evidence=static v=1\`
Look for sequential awaits.
### API-2 Measured latency
\`applies=route evidence=runtime ttl=30 v=1\`
Get p95.
`;

let repo: string;
const appDir = () => path.join(repo, 'apps/web');
const appFile = (rel: string) => path.join(appDir(), rel);
const checks = () => lib.parseChecklist(CHECKLIST).checks;

const analyze = (prevShared: Set<string> = new Set()) =>
  lib.analyzeApp({ repoRoot: repo, appDir: appDir(), prevShared, promote: 3, demote: 2 });

/** A ledger recording every current unit as fully audited `at`. */
const recordAll = (units: Map<string, any>, at = new Date()) => {
  const ledger = new Map();
  for (const u of units.values()) {
    const run = checks().filter((c) => c.applies.includes(u.kind));
    ledger.set(u.id, lib.buildRecord(lib.snapshotOf(u), undefined, run, { now: at, ackProblems: true }));
  }
  return ledger;
};

beforeEach(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'perf-audit-'));
  fs.cpSync(FIXTURE, repo, { recursive: true });
  // pnpm links workspace packages into node_modules; mirror that with a junction
  // (no admin rights needed on Windows, a plain symlink elsewhere).
  const scope = path.join(repo, 'apps/web/node_modules/@fx');
  fs.mkdirSync(scope, { recursive: true });
  fs.symlinkSync(path.join(repo, 'packages/fxui'), path.join(scope, 'ui'), 'junction');
});

afterEach(() => {
  fs.rmSync(repo, { recursive: true, force: true });
});

describe('perf-audit ledger: deriving units', () => {
  it('finds route files by exact name, attaches boundaries, and ignores temp files', () => {
    const { units } = analyze();
    const ids = [...units.keys()];
    expect(ids).toEqual(
      expect.arrayContaining([
        'page:(staff)/staff/papers/[id]',
        'page:(staff)/staff/list',
        'page:broken',
        'layout:.',
        'layout:(staff)',
        'route:api/things',
        'route:a/[code]',
        'config:web',
        'pkg:@fx/ui',
      ]),
    );
    expect(ids.some((id) => id.includes('.tmp'))).toBe(false);
    expect(units.get('page:(staff)/staff/papers/[id]').files).toContain(
      'apps/web/src/app/(staff)/staff/papers/[id]/loading.tsx',
    );
    // error.tsx sits in a folder with a layout and no page, so the layout owns it.
    expect(units.get('layout:(staff)').files).toContain('apps/web/src/app/(staff)/error.tsx');
  });

  it('follows workspace packages through the node_modules link, including export * as', () => {
    const { units } = analyze();
    expect(units.get('pkg:@fx/ui').files).toEqual([
      'packages/fxui/package.json',
      'packages/fxui/src/button.tsx',
      'packages/fxui/src/icons.ts',
      'packages/fxui/src/index.ts',
    ]);
    expect(units.get('page:(staff)/staff/papers/[id]').reachPkg).toEqual(['pkg:@fx/ui']);
  });

  it('follows dynamic import() targets and css imports', () => {
    const { units } = analyze();
    expect(units.get('page:(staff)/staff/papers/[id]').files).toContain('apps/web/src/components/Heavy.tsx');
    expect(units.get('layout:.').files).toContain('apps/web/src/app/globals.css');
  });

  it('uses POSIX paths for every id and stored file', () => {
    const { units } = analyze();
    for (const u of units.values()) {
      expect(u.id).not.toMatch(/\\/);
      for (const f of u.files) expect(f).not.toMatch(/\\/);
    }
  });

  it('makes a file shared at the promote line, keeps it until the demote line, and shares what it imports', () => {
    const cold = analyze();
    expect(cold.units.has('shared:src/lib/common.ts')).toBe(true); // 4 units reach it
    expect(cold.units.has('shared:src/lib/common-helper.ts')).toBe(true); // imported by a shared file
    expect(cold.units.has('shared:src/lib/boundary.ts')).toBe(false); // 2 units: below promote

    const warm = analyze(new Set(['apps/web/src/lib/boundary.ts']));
    expect(warm.units.has('shared:src/lib/boundary.ts')).toBe(true); // was shared, still at demote
    // A page's own files exclude shared files: they are audited as their own units.
    expect(warm.units.get('page:(staff)/staff/list').files).toEqual(['apps/web/src/app/(staff)/staff/list/page.tsx']);
  });
});

describe('perf-audit ledger: hashing', () => {
  it('hashes CRLF, BOM and LF text identically, so Windows and Linux checkouts agree', () => {
    const lf = lib.hashFile(Buffer.from('a\nb\n'), 'x.ts');
    expect(lib.hashFile(Buffer.from('a\r\nb\r\n'), 'x.ts')).toBe(lf);
    expect(lib.hashFile(Buffer.from('﻿a\nb\n'), 'x.ts')).toBe(lf);

    const before = analyze().units.get('shared:src/lib/common.ts').fp;
    const file = appFile('src/lib/common.ts');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/\n/g, '\r\n'));
    expect(analyze().units.get('shared:src/lib/common.ts').fp).toBe(before);
  });
});

describe('perf-audit ledger: status', () => {
  it('reads fresh when nothing changed', () => {
    const { units } = analyze();
    const statuses = lib.statusAll(units, recordAll(units), checks());
    const notFresh = [...statuses.values()].filter((s) => s.status !== 'fresh').map((s) => `${s.id}:${s.status}`);
    expect(notFresh).toEqual([]);
  });

  it('never reads fresh for a unit with an unresolvable import until the problem is acknowledged', () => {
    const { units } = analyze();
    const broken = units.get('page:broken');
    expect(broken.problems).toEqual(["apps/web/src/app/broken/page.tsx: cannot resolve '@/lib/missing'"]);
    const unacked = lib.buildRecord(lib.snapshotOf(broken), undefined, checks().filter((c) => c.applies.includes('page')));
    expect(lib.unitStatus(broken, unacked, checks()).status).toBe('unknown');
    expect(lib.unitStatus(broken, undefined, checks()).status).toBe('unknown');
    const acked = lib.buildRecord(lib.snapshotOf(broken), undefined, checks().filter((c) => c.applies.includes('page')), { ackProblems: true });
    expect(lib.unitStatus(broken, acked, checks()).status).toBe('fresh');
  });

  it('marks an edited shared file stale:code and the pages above it only stale:deps', () => {
    const first = analyze();
    const ledger = recordAll(first.units);
    fs.appendFileSync(appFile('src/lib/common.ts'), 'export const extra = 1;\n');
    const statuses = lib.statusAll(analyze(new Set(['apps/web/src/lib/common.ts'])).units, ledger, checks());

    const shared = statuses.get('shared:src/lib/common.ts');
    expect(shared.status).toBe('stale:code');
    expect(shared.diff.changed).toEqual(['apps/web/src/lib/common.ts']);
    expect(statuses.get('page:(staff)/staff/papers/[id]').status).toBe('stale:deps');
    expect(statuses.get('route:a/[code]').status).toBe('fresh'); // does not import it
  });

  it('marks an edited page stale:code with exactly the changed file', () => {
    const first = analyze();
    const ledger = recordAll(first.units);
    fs.appendFileSync(appFile('src/components/Heavy.tsx'), '// changed\n');
    const s = lib.statusAll(analyze().units, ledger, checks()).get('page:(staff)/staff/papers/[id]');
    expect(s.status).toBe('stale:code');
    expect(s.diff).toEqual({ changed: ['apps/web/src/components/Heavy.tsx'], added: [], removed: [] });
  });

  it('keeps a unit stale when its code changed after the audit was planned', () => {
    const planned = analyze().units.get('page:(staff)/staff/list');
    const snap = lib.snapshotOf(planned); // taken by `plan`, before the audit reads the code
    fs.appendFileSync(appFile('src/app/(staff)/staff/list/page.tsx'), '// edited mid-audit by another session\n');
    const rec = lib.buildRecord(snap, undefined, checks().filter((c) => c.applies.includes('page')));
    const now = analyze().units.get('page:(staff)/staff/list');
    expect(lib.unitStatus(now, rec, checks()).status).toBe('stale:code');
  });

  it('reruns only a bumped check, on only the unit kinds it applies to', () => {
    const { units } = analyze();
    const ledger = recordAll(units);
    const bumped = lib.parseChecklist(CHECKLIST.replace('`applies=route evidence=static v=1`', '`applies=route evidence=static v=2`')).checks;
    const statuses = lib.statusAll(units, ledger, bumped);
    expect(statuses.get('route:api/things')).toMatchObject({ status: 'stale:checks', missingChecks: ['API-1'] });
    expect(statuses.get('page:(staff)/staff/list').status).toBe('fresh');
  });

  it('warns when a check is reworded without a version bump', () => {
    const { units } = analyze();
    const ledger = recordAll(units);
    const reworded = lib.parseChecklist(CHECKLIST.replace('Look for sequential awaits.', 'Look for sequential awaits and N+1 loops.')).checks;
    const { errors, warnings } = lib.verifyLedger({ ledger, findings: new Map(), checks: reworded });
    expect(errors).toEqual([]);
    expect(warnings.filter((w) => w.startsWith('API-1:'))).toHaveLength(1);
  });

  it('expires runtime checks after their ttl while static checks never expire', () => {
    const { units } = analyze();
    const ledger = recordAll(units, new Date(Date.now() - 31 * 86_400_000));
    const statuses = lib.statusAll(units, ledger, checks());
    expect(statuses.get('route:api/things')).toMatchObject({ status: 'stale:ttl', expiredChecks: ['API-2'] });
    expect(statuses.get('page:(staff)/staff/list').status).toBe('fresh');
  });

  it('reports a renamed page as moved from its old id', () => {
    const { units } = analyze();
    const ledger = recordAll(units);
    fs.renameSync(appFile('src/app/(staff)/staff/reports'), appFile('src/app/(staff)/staff/summaries'));
    const statuses = lib.statusAll(analyze().units, ledger, checks());
    expect(statuses.get('page:(staff)/staff/summaries')).toMatchObject({ status: 'moved', movedFrom: 'page:(staff)/staff/reports' });
    expect(statuses.get('page:(staff)/staff/reports')).toMatchObject({ status: 'gone', movedTo: 'page:(staff)/staff/summaries' });
  });
});

describe('perf-audit ledger: planning', () => {
  it('expands a focus to its layouts, packages and config, lists reached shared files, and skips fresh units', () => {
    const { units } = analyze();
    const ledger = new Map([['layout:.', lib.buildRecord(lib.snapshotOf(units.get('layout:.')), undefined, checks())]]);
    const statuses = lib.statusAll(units, ledger, checks());
    const plan = lib.buildPlan(statuses, units, new Map(), { focus: ['papers'], budget: 0 });
    expect(plan.units.map((p: any) => p.id).sort()).toEqual(
      ['config:web', 'layout:(staff)', 'page:(staff)/staff/papers/[id]', 'pkg:@fx/ui'].sort(),
    );
    expect(plan.reachedNotPlanned.sort()).toEqual(['shared:src/lib/common-helper.ts', 'shared:src/lib/common.ts']);
    expect(plan.skipped).toEqual([expect.objectContaining({ id: 'layout:.', status: 'fresh' })]);

    const expanded = lib.buildPlan(statuses, units, new Map(), { focus: ['papers'], budget: 0, expand: true });
    expect(expanded.units.map((p: any) => p.id)).toEqual(expect.arrayContaining(['shared:src/lib/common.ts']));
  });

  it('puts the app shell (config, then layouts from the root down) ahead of shared files when nothing is focused', () => {
    // Nexus has ~240 shared files and 7 layouts. Ranked by fan-in alone the
    // layouts (fan-in 0) never made a 25-unit budget, so every page's shell went
    // unaudited however many sessions ran.
    const { units } = analyze();
    const statuses = lib.statusAll(units, new Map(), checks());
    const plan = lib.buildPlan(statuses, units, new Map(), { budget: 3 });
    expect(plan.units.map((p: any) => p.id)).toEqual(['config:web', 'layout:.', 'layout:(staff)']);
  });

  it('matches a focus to file names exactly, never as a substring of a longer name', () => {
    const { units } = analyze();
    const statuses = lib.statusAll(units, new Map(), checks());
    const byName = lib.buildPlan(statuses, units, new Map(), { focus: ['Heavy'], budget: 0 });
    expect(byName.units.map((p: any) => p.id)).toContain('page:(staff)/staff/papers/[id]');
    const partial = lib.buildPlan(statuses, units, new Map(), { focus: ['Heav'], budget: 0 });
    expect(partial.units).toEqual([]);
  });
});

describe('perf-audit ledger: files and validation', () => {
  it('keeps the newest line per id after a union merge, and writes sorted output', () => {
    const older = JSON.stringify({ id: 'page:b', kind: 'page', at: '2026-09-01T00:00:00.000Z' });
    const newer = JSON.stringify({ id: 'page:b', kind: 'page', at: '2026-09-20T00:00:00.000Z' });
    const other = JSON.stringify({ id: 'page:a', kind: 'page', at: '2026-09-05T00:00:00.000Z' });
    const merged = lib.readLedger([newer, other, older].join('\n'));
    expect(merged.get('page:b').at).toBe('2026-09-20T00:00:00.000Z');
    expect(lib.serializeJsonl(merged).split('\n').filter(Boolean).map((l: string) => JSON.parse(l).id)).toEqual(['page:a', 'page:b']);
  });

  it('expands --checks by all, family and id, for the unit kind only', () => {
    const c = checks();
    expect(lib.expandChecks('all', c, 'route').checks.map((x: any) => x.id)).toEqual(['API-1', 'API-2']);
    expect(lib.expandChecks('API', c, 'page').checks).toEqual([]);
    expect(lib.expandChecks('HYD-1,API-1', c, 'page')).toMatchObject({ unknown: [], notApplicable: ['API-1'] });
    expect(lib.expandChecks('NOPE-9', c, 'page').unknown).toEqual(['NOPE-9']);
  });

  it('rejects invalid findings and redacted findings that carry detail', () => {
    const findings = new Map([
      ['PERF-0001', { id: 'PERF-0001', severity: 'URGENT', status: 'open', title: 't', units: ['page:a'], evidenceType: 'measured' }],
      ['PERF-0002', { id: 'PERF-0002', severity: 'HIGH', status: 'open', title: 'Security-sensitive finding', units: ['route:x'], redacted: true, rootCause: 'anon can read the table' }],
    ]);
    const ledger = new Map([['page:a', { id: 'page:a', kind: 'page', at: 'x', fp: 'a', deepFp: 'b', cfp: 'c', files: {}, checks: {}, findings: ['PERF-0009'] }]]);
    const { errors } = lib.verifyLedger({ ledger, findings, checks: checks() });
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('PERF-0001: severity'),
        expect.stringContaining('PERF-0002: redacted finding must not carry rootCause'),
        expect.stringContaining('page:a: references unknown finding PERF-0009'),
      ]),
    );
  });

  it('parses the real checklist without errors, and the committed ledger verifies', () => {
    const { checks: real, errors } = lib.parseChecklist(fs.readFileSync(path.join(SKILL_DIR, 'checklist.md'), 'utf8'));
    expect(errors).toEqual([]);
    expect(real.length).toBeGreaterThan(30);
    const auditDir = path.join(REPO_ROOT, 'docs/audits/perf/nexus');
    const ledger = lib.readLedger(lib.readText(path.join(auditDir, 'ledger.jsonl')));
    const findings = lib.readFindings(lib.readText(path.join(auditDir, 'findings.jsonl')));
    expect(lib.verifyLedger({ ledger, findings, checks: real }).errors).toEqual([]);
  });
});

describe('perf-audit ledger: CLI round trip', () => {
  const cli = (...args: string[]) =>
    execFileSync(process.execPath, [path.join(SKILL_DIR, 'ledger.mjs'), ...args, '--repo', repo, '--app', 'web'], {
      encoding: 'utf8',
    });

  it('plans, refuses an unplanned record, records, then reports the unit fresh', () => {
    expect(cli('plan', '--focus', 'route:a/[code]', '--budget', '0')).toContain('route:a/[code]');
    expect(() => cli('record', 'route:api/things', '--checks', 'all')).toThrow(/was not planned/);
    expect(cli('record', 'route:a/[code]', '--checks', 'all')).toContain('recorded route:a/[code]');
    expect(cli('plan', '--focus', 'route:a/[code]', '--budget', '0')).toMatch(/Skipped, already audited[\s\S]*route:a\/\[code\]/);
    expect(cli('verify')).toContain('0 errors');
    // The lock is always released, even after the refused record.
    expect(fs.existsSync(path.join(repo, 'docs/audits/perf/web/.ledger.lock'))).toBe(false);
  }, 30_000);
});
