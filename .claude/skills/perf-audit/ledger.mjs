#!/usr/bin/env node
// CLI for the change-aware performance audit ledger. See SKILL.md for the protocol.
//
//   node .claude/skills/perf-audit/ledger.mjs status   [--area <a>] [--all] [--json]
//   node .claude/skills/perf-audit/ledger.mjs plan     [--focus <unit id | file name>]... [--budget N] [--expand] [--json]
//   node .claude/skills/perf-audit/ledger.mjs explain  <unit-id>
//   node .claude/skills/perf-audit/ledger.mjs units    [--area <a>] [--kind <k>]
//   node .claude/skills/perf-audit/ledger.mjs record   <unit-id>... --checks all|FAM|ID[,..] [--findings PERF-0001,..] [--note "..."] [--ack-problems]
//   node .claude/skills/perf-audit/ledger.mjs finding  add --from <file.json> | set <PERF-id> --status <s> [--commit <sha>] [--note "..."] | list [--open]
//   node .claude/skills/perf-audit/ledger.mjs verify   [--deep]
//   node .claude/skills/perf-audit/ledger.mjs compact
//
// Global: --app <name> (default nexus), --repo <dir> (defaults to this repo).

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  analyzeApp,
  buildPlan,
  buildRecord,
  expandChecks,
  FINDING_STATUSES,
  nextFindingId,
  parseChecklist,
  readFindings,
  readLedger,
  readText,
  serializeJsonl,
  snapshotOf,
  statusAll,
  toPosix,
  verifyLedger,
  withLock,
  writeAtomic,
} from './ledger-lib.mjs';

const SKILL_DIR = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const pos = [];
  const flags = { focus: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      pos.push(a);
      continue;
    }
    const key = a.slice(2);
    const next = argv[i + 1];
    const isBool = next === undefined || next.startsWith('--');
    const val = isBool ? true : argv[++i];
    if (key === 'focus') flags.focus.push(val);
    else flags[key] = val;
  }
  return { pos, flags };
}

const { pos, flags } = parseArgs(process.argv.slice(2));
const cmd = pos.shift();
const repoRoot = path.resolve(flags.repo || path.join(SKILL_DIR, '../../..'));
const app = flags.app || 'nexus';
const appDir = path.join(repoRoot, 'apps', app);
const auditDir = path.join(repoRoot, 'docs', 'audits', 'perf', app);
const LEDGER = path.join(auditDir, 'ledger.jsonl');
const FINDINGS = path.join(auditDir, 'findings.jsonl');
const SNAPSHOT = path.join(auditDir, '.snapshot.json');
const appRel = toPosix(path.relative(repoRoot, appDir));

// Throw rather than exit, so a failure inside withLock still releases the lock.
class UsageError extends Error {}
const die = (msg) => {
  throw new UsageError(msg);
};

function loadChecklist() {
  const { checks, errors } = parseChecklist(readText(path.join(SKILL_DIR, 'checklist.md')));
  if (errors.length) die(`checklist.md has errors:\n  ${errors.join('\n  ')}`);
  return checks;
}

function loadState() {
  const ledger = readLedger(readText(LEDGER));
  const findings = readFindings(readText(FINDINGS));
  const checks = loadChecklist();
  const prevShared = new Set(
    [...ledger.values()].filter((r) => r.kind === 'shared').map((r) => `${appRel}/${r.id.slice('shared:'.length)}`),
  );
  const analysis = analyzeApp({ repoRoot, appDir, prevShared });
  const statuses = statusAll(analysis.units, ledger, checks);
  return { ledger, findings, checks, analysis, statuses };
}

const gitHead = () => {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
};

const pad = (s, n) => String(s).padEnd(n);
const short = (f) => f.replace(`${appRel}/`, '');
const reasonOf = (s) => {
  if (s.status === 'unknown') return s.problems.slice(0, 2).join('; ');
  if (s.status === 'stale:code') {
    const d = s.diff;
    const files = [...d.changed, ...d.added.map((f) => `+${f}`), ...d.removed.map((f) => `-${f}`)].map(short);
    return `${files.slice(0, 3).join(', ')}${files.length > 3 ? ` (+${files.length - 3} more)` : ''}`;
  }
  if (s.status === 'stale:checks') return `checks not yet run at their current version: ${s.missingChecks.join(', ')}`;
  if (s.status === 'stale:ttl') return `runtime checks older than their ttl: ${s.expiredChecks.join(', ')}`;
  if (s.status === 'stale:deps') return 'a shared file or package under it changed (audited as its own unit)';
  if (s.status === 'moved') return `looks like ${s.movedFrom}, renamed`;
  if (s.status === 'gone') return s.movedTo ? `moved to ${s.movedTo}` : 'entry file deleted';
  return '';
};

function cmdStatus() {
  const { findings, checks, analysis, statuses } = loadState();
  const all = [...statuses.values()].filter((s) => !flags.area || (s.unit?.area || '').startsWith(flags.area));
  const counts = {};
  for (const s of all) counts[s.status] = (counts[s.status] || 0) + 1;
  const open = [...findings.values()].filter((f) => f.status === 'open' || f.status === 'fixed');
  if (flags.json) {
    const units = all.map((s) => ({ id: s.id, area: s.unit?.area, status: s.status, auditedAt: s.rec?.at ?? null, reason: reasonOf(s) }));
    console.log(JSON.stringify({ counts, units, open }, null, 1));
    return;
  }
  console.log(`perf-audit status: ${app}  (${analysis.fileCount} files analysed in ${(analysis.ms / 1000).toFixed(1)}s, ${checks.length} checks)`);
  console.log(`Units ${all.length}: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(' | ')}`);

  const areas = new Map();
  for (const s of all) {
    if (!s.unit) continue;
    const a = areas.get(s.unit.area) || { units: 0, fresh: 0, stale: 0, never: 0, unknown: 0 };
    a.units += 1;
    if (s.status === 'fresh' || s.status === 'stale:deps') a.fresh += 1;
    else if (s.status === 'never' || s.status === 'moved') a.never += 1;
    else if (s.status === 'unknown') a.unknown += 1;
    else a.stale += 1;
    areas.set(s.unit.area, a);
  }
  const rows = [...areas.entries()].sort((x, y) => y[1].stale - x[1].stale || y[1].units - x[1].units);
  const limit = flags.all ? rows.length : 25;
  console.log(`\n${pad('area', 34)}${pad('units', 7)}${pad('fresh', 7)}${pad('stale', 7)}${pad('never', 7)}unknown`);
  for (const [area, a] of rows.slice(0, limit)) {
    console.log(`${pad(area, 34)}${pad(a.units, 7)}${pad(a.fresh, 7)}${pad(a.stale, 7)}${pad(a.never, 7)}${a.unknown}`);
  }
  if (rows.length > limit) console.log(`... ${rows.length - limit} more areas (--all to list)`);

  const attention = all.filter((s) => !['fresh', 'never', 'stale:deps'].includes(s.status));
  if (attention.length) {
    console.log(`\nNeeds attention (${attention.length}):`);
    for (const s of attention.slice(0, flags.all ? attention.length : 40)) {
      console.log(`  ${pad(s.status, 13)}${pad(s.id, 60)}${reasonOf(s)}`);
    }
  }
  console.log(`\nOpen findings: ${open.length}`);
  for (const f of open) console.log(`  ${f.id} ${pad(f.severity, 9)}${pad(f.status, 7)}${f.redacted ? '(redacted) ' : ''}${f.title}`);
}

function cmdPlan() {
  const { findings, analysis, statuses } = loadState();
  const budget = flags.budget === undefined ? 25 : Number(flags.budget);
  const plan = buildPlan(statuses, analysis.units, findings, { focus: flags.focus, budget, expand: Boolean(flags.expand) });
  if (flags.focus.length && !plan.units.length && !plan.skipped.length) die(`no unit matches --focus ${flags.focus.join(', ')}`);

  withLock(auditDir, () => {
    const snap = fs.existsSync(SNAPSHOT) ? JSON.parse(readText(SNAPSHOT)) : { units: {} };
    for (const p of plan.units) snap.units[p.id] = { ...snapshotOf(p.unit), plannedAt: new Date().toISOString() };
    writeAtomic(SNAPSHOT, `${JSON.stringify(snap, null, 1)}\n`);
  });

  if (flags.json) {
    console.log(JSON.stringify({ units: plan.units.map((p) => ({ id: p.id, status: p.status, why: p.why, reason: reasonOf(p), files: p.unit.files })), skipped: plan.skipped }, null, 1));
    return;
  }
  console.log(`Plan: ${plan.units.length} units (budget ${budget}); fingerprints snapshotted for record.\n`);
  plan.units.forEach((p, i) => {
    console.log(`${pad(i + 1, 4)}${pad(p.status, 13)}${pad(p.id, 62)}${p.why}`);
    const r = reasonOf(p);
    if (r) console.log(`${' '.repeat(17)}${r}`);
  });
  if (plan.skipped.length) {
    console.log(`\nSkipped, already audited and unchanged (${plan.skipped.length}):`);
    for (const s of plan.skipped) console.log(`  ${pad(s.status, 12)}${s.id}`);
  }
  if (plan.reachedNotPlanned.length) {
    const top = plan.reachedNotPlanned.slice(0, 12).map((id) => `${id.replace('shared:', '')} (${analysis.units.get(id)?.fanIn})`);
    console.log(`\nShared files the focus reaches, not planned (${plan.reachedNotPlanned.length}; add one with --focus, or all with --expand). Highest fan-in first:`);
    console.log(`  ${top.join(', ')}${plan.reachedNotPlanned.length > 12 ? ', ...' : ''}`);
  }
}

function cmdExplain() {
  const id = pos[0] || die('explain needs a unit id');
  const { findings, analysis, statuses } = loadState();
  const s = statuses.get(id) || die(`unknown unit ${id} (try: units --area <a>)`);
  const u = s.unit;
  console.log(`${id}\n  status: ${s.status}${reasonOf(s) ? `  (${reasonOf(s)})` : ''}`);
  if (s.rec) console.log(`  last audited: ${s.rec.at} at ${s.rec.commit || '?'}, ${Object.keys(s.rec.checks || {}).length} checks`);
  if (!u) return;
  console.log(`  kind: ${u.kind}, area: ${u.area}${u.fanIn ? `, reached by ${u.fanIn} units` : ''}`);
  const d = s.diff || { changed: [], added: [], removed: [] };
  const mark = (f) => (d.changed.includes(f) ? ' [changed]' : d.added.includes(f) ? ' [added]' : '');
  console.log(`  own files (${u.files.length}):`);
  for (const f of u.files) console.log(`    ${f}${mark(f)}`);
  for (const f of d.removed) console.log(`    ${f} [removed]`);
  const touched = [...d.changed, ...d.removed];
  if (touched.length && s.rec?.commit) {
    // Approximate when the audit ran on a dirty tree: uncommitted work at audit time shows up too.
    console.log(`  diff since the audit: git diff ${s.rec.commit} -- ${touched.map((f) => `"${f}"`).join(' ')}`);
  }
  if (u.problems.length) console.log(`  problems:\n    ${u.problems.join('\n    ')}`);
  if (u.kind === 'page') {
    const layouts = [...analysis.units.values()].filter((x) => x.kind === 'layout' && (x.dir === '.' || u.dir === x.dir || u.dir.startsWith(`${x.dir}/`)));
    console.log(`  layouts above: ${layouts.map((x) => x.id).join(', ')}`);
  }
  console.log(`  shared units reached (${u.reachShared.length}): ${u.reachShared.slice(0, 25).join(', ')}${u.reachShared.length > 25 ? ', ...' : ''}`);
  console.log(`  packages reached: ${u.reachPkg.join(', ') || 'none'}`);
  if (u.kind === 'shared' || u.kind === 'pkg') {
    const callers = [...analysis.units.values()].filter((x) => x.reachShared.includes(id) || x.reachPkg.includes(id));
    console.log(`  reached by (${callers.length}): ${callers.slice(0, 20).map((x) => x.id).join(', ')}${callers.length > 20 ? ', ...' : ''}`);
  }
  const fs_ = [...findings.values()].filter((f) => (f.units || []).includes(id));
  if (fs_.length) console.log(`  findings: ${fs_.map((f) => `${f.id} ${f.severity} ${f.status}`).join('; ')}`);
}

function cmdUnits() {
  const { analysis } = loadState();
  for (const u of analysis.units.values()) {
    if (flags.area && !u.area.startsWith(flags.area)) continue;
    if (flags.kind && u.kind !== flags.kind) continue;
    console.log(`${pad(u.id, 70)}${pad(u.area, 28)}${u.files.length} files`);
  }
}

function cmdRecord() {
  if (!pos.length) die('record needs at least one unit id');
  if (!flags.checks) die('record needs --checks (all, a family like HYD, or ids like HYD-1)');
  const { checks, analysis } = loadState();
  const findingIds = flags.findings ? String(flags.findings).split(',').map((x) => x.trim()) : [];
  const commit = gitHead();
  const results = [];
  withLock(auditDir, () => {
    const snap = fs.existsSync(SNAPSHOT) ? JSON.parse(readText(SNAPSHOT)) : { units: {} };
    const ledger = readLedger(readText(LEDGER));
    const findings = readFindings(readText(FINDINGS));
    for (const fid of findingIds) if (!findings.has(fid)) die(`finding ${fid} does not exist (add it first with: finding add --from <file.json>)`);
    for (const id of pos) {
      const s = snap.units[id];
      if (!s) die(`${id} was not planned. Run: plan --focus "${id}" before reading it, so the record matches the code you audited.`);
      if (s.problems?.length && !flags['ack-problems']) {
        die(`${id} has imports the tool cannot see (${s.problems.join('; ')}). Audit what they load, then pass --ack-problems.`);
      }
      const { checks: run, unknown, notApplicable } = expandChecks(flags.checks, checks, s.kind);
      if (unknown.length) die(`unknown check ids: ${unknown.join(', ')}`);
      if (!run.length) die(`--checks ${flags.checks} matches no check that applies to a ${s.kind} unit`);
      const rec = buildRecord(s, ledger.get(id), run, {
        commit,
        findings: findingIds.filter((f) => (findings.get(f).units || []).includes(id)),
        note: typeof flags.note === 'string' ? flags.note : undefined,
        ackProblems: Boolean(flags['ack-problems']),
      });
      ledger.set(id, rec);
      delete snap.units[id];
      const now = analysis.units.get(id);
      results.push({ id, checks: run.length, notApplicable, changedSincePlan: now && now.fp !== s.fp });
    }
    writeAtomic(LEDGER, serializeJsonl(ledger));
    writeAtomic(SNAPSHOT, `${JSON.stringify(snap, null, 1)}\n`);
  });
  for (const r of results) {
    console.log(`recorded ${r.id} (${r.checks} checks)${r.notApplicable.length ? `; not applicable to it: ${r.notApplicable.join(', ')}` : ''}`);
    if (r.changedSincePlan) {
      console.log(`  note: its code changed after it was planned. The plan-time code was recorded, so it will read stale:code; re-plan it and review the diff if the change is yours.`);
    }
  }
}

function cmdFinding() {
  const sub = pos.shift();
  if (sub === 'list') {
    const findings = readFindings(readText(FINDINGS));
    for (const f of findings.values()) {
      if (flags.open && !['open', 'fixed'].includes(f.status)) continue;
      console.log(`${f.id} ${pad(f.severity, 9)}${pad(f.status, 9)}${f.title}  [${(f.units || []).join(', ')}]`);
    }
    return;
  }
  const checks = loadChecklist();
  withLock(auditDir, () => {
    const findings = readFindings(readText(FINDINGS));
    const now = new Date().toISOString();
    if (sub === 'add') {
      if (!flags.from) die('finding add needs --from <file.json> (an object or an array of objects)');
      const raw = JSON.parse(readText(path.resolve(flags.from)));
      const added = [];
      for (const f of Array.isArray(raw) ? raw : [raw]) {
        const id = nextFindingId(findings);
        const rec = { ...f, id, status: 'open', openedAt: now, updatedAt: now, history: [{ at: now, status: 'open' }] };
        const { errors } = verifyLedger({ ledger: new Map(), findings: new Map([[id, rec]]), checks });
        if (f.check && !checks.some((c) => c.id === f.check)) errors.push(`check ${f.check} is not in the checklist`);
        if (errors.length) die(`finding "${f.title || '?'}" is invalid:\n  ${errors.join('\n  ')}`);
        findings.set(id, rec);
        added.push(`${id} ${rec.severity} ${rec.title}`);
      }
      writeAtomic(FINDINGS, serializeJsonl(findings));
      added.forEach((a) => console.log(`added ${a}`));
    } else if (sub === 'set') {
      const id = pos[0] || die('finding set needs an id');
      const f = findings.get(id) || die(`no finding ${id}`);
      if (!FINDING_STATUSES.includes(flags.status)) die(`--status must be one of ${FINDING_STATUSES.join(', ')}`);
      f.status = flags.status;
      f.updatedAt = now;
      if (typeof flags.commit === 'string') f.fixedIn = flags.commit;
      f.history = [...(f.history || []), { at: now, status: flags.status, ...(typeof flags.commit === 'string' ? { commit: flags.commit } : {}), ...(typeof flags.note === 'string' ? { note: flags.note } : {}) }];
      writeAtomic(FINDINGS, serializeJsonl(findings));
      console.log(`${id} is now ${f.status}`);
    } else die('finding needs add, set or list');
  });
}

function cmdVerify() {
  const checks = loadChecklist();
  const ledger = readLedger(readText(LEDGER));
  const findings = readFindings(readText(FINDINGS));
  const units = flags.deep ? loadState().analysis.units : null;
  const { errors, warnings } = verifyLedger({ ledger, findings, checks, units });
  warnings.forEach((w) => console.log(`warning: ${w}`));
  errors.forEach((e) => console.log(`error: ${e}`));
  console.log(`verify: ${ledger.size} audited units, ${findings.size} findings, ${checks.length} checks; ${errors.length} errors, ${warnings.length} warnings`);
  if (errors.length) process.exit(1);
}

function cmdCompact() {
  withLock(auditDir, () => {
    writeAtomic(LEDGER, serializeJsonl(readLedger(readText(LEDGER))));
    writeAtomic(FINDINGS, serializeJsonl(readFindings(readText(FINDINGS))));
  });
  console.log('compacted ledger.jsonl and findings.jsonl');
}

const commands = { status: cmdStatus, plan: cmdPlan, explain: cmdExplain, units: cmdUnits, record: cmdRecord, finding: cmdFinding, verify: cmdVerify, compact: cmdCompact };
if (!commands[cmd]) {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 13).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
  process.exit(cmd ? 1 : 0);
}
try {
  commands[cmd]();
} catch (e) {
  if (!(e instanceof UsageError)) throw e;
  console.error(`perf-audit: ${e.message}`);
  process.exit(1);
}
