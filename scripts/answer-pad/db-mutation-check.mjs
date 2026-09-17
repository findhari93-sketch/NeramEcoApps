#!/usr/bin/env node
/**
 * Mutation check for the Answer Pad database suite.
 *
 * Applies one deliberate defect at a time to a copy of the migration, runs the
 * PGlite suite against that copy (PAD_MIGRATION_SQL_FILE) and expects at least
 * one test to fail. A mutant that survives is a rule the tests do not really
 * check. Nothing here touches a real database.
 *
 * From the repo root, on Node 20:
 *   node scripts/answer-pad/db-mutation-check.mjs          every mutant
 *   node scripts/answer-pad/db-mutation-check.mjs M07 M12  selected mutants
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = process.cwd();
const MIGRATIONS = path.join(ROOT, 'supabase', 'migrations');
const SUITE = 'apps/nexus/src/lib/pad/db';
const VITEST = path.join(ROOT, 'node_modules', 'vitest', 'vitest.mjs');

/** Each mutant breaks exactly one rule. `find` must occur once unless `nth` picks an occurrence. */
const MUTANTS = [
  { id: 'M01', rule: 'Grading compares the normalised answer with the key',
    find: 'set is_correct = (r.norm_answer = any (v_p.correct_keys))', replace: 'set is_correct = true' },
  { id: 'M02', rule: 'Answers are accepted only while the prompt is OPEN',
    find: "return pad_reject(v_s.id, v_p.id, p_actor, 'submit', 'PROMPT_NOT_OPEN', jsonb_build_object('state', v_p.state));", replace: 'null;' },
  { id: 'M03', rule: 'Only an active enrollment may answer',
    find: 'and coalesce(e.is_active, false)', replace: 'and true' },
  { id: 'M04', rule: 'REOPEN clears any key already chosen',
    find: "set state = 'open', closed_at = null, correct_keys = null, ungraded = false, version = version + 1",
    replace: "set state = 'open', closed_at = null, version = version + 1" },
  { id: 'M05', rule: 'Ending with an unrevealed prompt needs confirmation',
    find: 'if v_seq is not null and not coalesce(p_confirm_unrevealed, false) then', replace: 'if false then' },
  { id: 'M06', rule: 'The prompt guard protects closed_at',
    find: 'or new.closed_at is distinct from old.closed_at', replace: 'or false' },
  { id: 'M07', rule: 'Client roles get no EXECUTE through PUBLIC',
    find: 'revoke all on function %s from public, anon, authenticated', replace: 'revoke all on function %s from anon, authenticated' },
  { id: 'M08', rule: 'Students never see the key before Reveal',
    find: "'correct_keys', case when v_p.state = 'revealed' then to_jsonb(v_p.correct_keys) else null end",
    replace: "'correct_keys', to_jsonb(v_p.correct_keys)" },
  { id: 'M09', rule: 'Numeric answers drop trailing fractional zeros',
    find: "v_frac := rtrim(split_part(v, '.', 2), '0');", replace: "v_frac := split_part(v, '.', 2);" },
  { id: 'M10', rule: 'Room-code entry is rate limited at 8 failures per user',
    find: 'if v_user_fails >= 8 or v_ip_fails >= 40 then', replace: 'if v_user_fails >= 9 or v_ip_fails >= 40 then' },
  { id: 'M11', rule: 'App presence lasts 90 seconds after the last heartbeat',
    find: "and ap.last_seen_at + interval '90 seconds' >= p_from", replace: "and ap.last_seen_at + interval '120 seconds' >= p_from" },
  { id: 'M12', rule: 'A bot interval with no leave counts for 12 hours at most',
    find: "and coalesce(mp.left_at, mp.joined_at + interval '12 hours') >= p_from",
    replace: "and coalesce(mp.left_at, mp.joined_at + interval '24 hours') >= p_from" },
  { id: 'M13', rule: 'An attendance interval with no readable leave counts for 12 hours at most',
    find: "pad_try_timestamptz(iv ->> 'joinDateTime') + interval '12 hours') >= p_from", replace: "'infinity'::timestamptz) >= p_from" },
  { id: 'M14', rule: 'Attendance timestamps must be ISO 8601',
    find: "if p_value is null or p_value !~ '^\\d{4}-\\d{2}-\\d{2}[T ]\\d{2}:\\d{2}' then", replace: "if p_value is null or p_value = '' then" },
  { id: 'M15', rule: 'Joined mid-prompt means first seen inside the open window',
    find: 'coalesce(fs.first_seen > p.opened_at and fs.first_seen <= coalesce(p.closed_at, now()), false)',
    replace: 'coalesce(fs.first_seen > p.opened_at, false)' },
  { id: 'M16', rule: 'No names while the prompt is OPEN',
    find: "if v_state = 'open' then", replace: 'if false then' },
  { id: 'M17', rule: 'No answer distribution while the prompt is OPEN',
    pattern: /(-- Distribution only once answering has stopped[^\n]*\n\s*)if v_p\.state <> 'open' then/, replace: '$1if true then' },
  { id: 'M18', rule: 'Absent never counts toward total_graded',
    find: "'total_graded', count(*) filter (where c <> 'absent')", replace: "'total_graded', count(*)" },
  { id: 'M19', rule: 'Skipped requires presence during the prompt',
    find: "when pad_was_present(sid, meeting_id, scheduled_class_id, p_student, opened_at, closed_at) then 'skipped'",
    replace: "when true then 'skipped'" },
  { id: 'M20', rule: 'Only revealed prompts are scored',
    find: "where p.session_id = p_session and p.state = 'revealed' and not p.ungraded",
    replace: "where p.session_id = p_session and p.state <> 'open' and not p.ungraded" },
  { id: 'M21', rule: 'Polls are never scored',
    find: "where p.session_id = p_session and p.state = 'revealed' and not p.ungraded",
    replace: "where p.session_id = p_session and p.state = 'revealed'" },
  { id: 'M22', rule: 'The report judges an off-roster student over every prompt',
    find: 'cross join lateral pad_participation_rows(p.id, v_people) pr', replace: 'cross join lateral pad_participation_rows(p.id, v_roster) pr' },
  { id: 'M23', rule: 'The report leaves OPEN prompts out',
    find: "where p.session_id = p_session and p.state <> 'open'", replace: 'where p.session_id = p_session' },
  { id: 'M24', rule: 'The report is for the session teacher only',
    find: "return jsonb_build_object('ok', false, 'code', 'NOT_SESSION_TEACHER');", nth: 3, replace: 'null;' },
  { id: 'M25', rule: 'A repeated bot join opens no second interval',
    find: 'and joined_at <= v_at and (left_at is null or left_at >= v_at)', replace: 'and false' },
  { id: 'M26', rule: 'A join arriving after its leave closes against it',
    find: 'values (p_meeting_id, v_user, v_at, v_next);', replace: 'values (p_meeting_id, v_user, v_at, null);' },
  { id: 'M27', rule: 'A bot event must be join or leave',
    find: "or p_event is null or p_event not in ('join', 'leave')", replace: "or p_event not in ('join', 'leave')" },
  { id: 'M28', rule: 'Students connected to the pad are not notified',
    find: "and ap.last_seen_at >= now() - interval '90 seconds')", replace: 'and false)' },
  { id: 'M29', rule: 'Once the bot sees the meeting, only students in it are notified',
    find: 'and (not v_has_meet or exists (', replace: 'and (true or exists (' },
  { id: 'M30', rule: 'A repeated ASK returns the prompt already open',
    pattern: /(\n\s*)if v_p\.state = 'open' then(\s*\n\s*-- A repeated ASK)/, replace: '$1if false then$2' },
  { id: 'M31', rule: 'Responses are immutable, even during Reveal',
    find: 'or new.raw_answer is distinct from old.raw_answer', replace: 'or false' },
  { id: 'M32', rule: 'Client roles hold no privilege on pad tables',
    find: "execute format('revoke all on table %I from anon, authenticated', t);", replace: 'null;' },
  { id: 'M33', rule: 'Client roles hold no privilege on pad sequences',
    find: "execute format('revoke all on sequence %s from anon, authenticated', r.seq);", replace: 'null;' },
  { id: 'M34', rule: 'Row level security is enabled on every pad table',
    find: "execute format('alter table %I enable row level security', t);", replace: 'null;' },
  { id: 'M35', rule: 'A bot event matches an upper-case object id',
    find: 'where u.ms_oid in (p_aad_object_id, lower(p_aad_object_id))', replace: 'where u.ms_oid = p_aad_object_id' },
  { id: 'M36', rule: 'A meeting series recalls its newest session, not its oldest',
    find: 'where meeting_thread_id = p_thread\n  order by created_at desc', replace: 'where meeting_thread_id = p_thread\n  order by created_at asc' },
  { id: 'M37', rule: 'Only staff may recall which classroom a meeting belongs to',
    find: 'if p_actor is null or not pad_is_staff(p_actor) then', nth: 2, replace: 'if false then' },
];

function migrationPath() {
  const file = readdirSync(MIGRATIONS).find((name) => /_answer_pad\.sql$/.test(name));
  if (!file) throw new Error(`answer pad migration not found in ${MIGRATIONS}`);
  return path.join(MIGRATIONS, file);
}

function applyMutant(sql, mutant) {
  if (mutant.pattern) {
    const global = new RegExp(mutant.pattern.source, `${mutant.pattern.flags}g`);
    const count = (sql.match(global) ?? []).length;
    if (count !== 1) throw new Error(`${mutant.id}: pattern matched ${count} times, expected 1`);
    return sql.replace(mutant.pattern, mutant.replace);
  }
  const parts = sql.split(mutant.find);
  const count = parts.length - 1;
  const nth = mutant.nth ?? 1;
  if (count === 0 || nth > count || (mutant.nth === undefined && count !== 1)) {
    throw new Error(`${mutant.id}: target found ${count} times`);
  }
  return parts.slice(0, nth).join(mutant.find) + mutant.replace + parts.slice(nth).join(mutant.find);
}

function runSuite(sqlFile, jsonFile) {
  const env = { ...process.env };
  if (sqlFile) env.PAD_MIGRATION_SQL_FILE = sqlFile;
  else delete env.PAD_MIGRATION_SQL_FILE;

  spawnSync(process.execPath, [VITEST, 'run', SUITE, '--reporter=json', `--outputFile=${jsonFile}`], {
    cwd: ROOT,
    env,
    encoding: 'utf-8',
    timeout: 300_000,
  });

  const report = JSON.parse(readFileSync(jsonFile, 'utf-8'));
  const failures = report.testResults.flatMap((file) =>
    file.assertionResults.filter((a) => a.status === 'failed').map((a) => ({ title: a.fullName ?? a.title, message: (a.failureMessages ?? []).join('\n') })),
  );
  const loadErrors = report.testResults.filter((file) => file.status === 'failed' && file.message).map((file) => file.message);
  return { total: report.numTotalTests, failed: report.numFailedTests, failures, loadErrors };
}

const selected = process.argv.slice(2);
const mutants = selected.length ? MUTANTS.filter((m) => selected.includes(m.id)) : MUTANTS;
const original = readFileSync(migrationPath(), 'utf-8');
const work = mkdtempSync(path.join(tmpdir(), 'pad-mutants-'));

try {
  const baseline = runSuite(null, path.join(work, 'baseline.json'));
  if (baseline.failed > 0 || baseline.loadErrors.length > 0 || baseline.total === 0) {
    console.error(`Baseline is not green (${baseline.failed} of ${baseline.total} failing). Fix the suite first.`);
    process.exit(2);
  }
  console.log(`Baseline green: ${baseline.total} tests. Checking ${mutants.length} mutants.\n`);

  const results = [];
  for (const mutant of mutants) {
    const sqlFile = path.join(work, `${mutant.id}.sql`);
    writeFileSync(sqlFile, applyMutant(original, mutant));
    const run = runSuite(sqlFile, path.join(work, `${mutant.id}.json`));

    // A migration that no longer loads fails everything for the wrong reason.
    const broken = run.loadErrors.some((m) => /syntax error|does not exist/i.test(m)) || (run.failed === run.total && run.total > 0);
    const status = broken ? 'INVALID' : run.failed > 0 ? 'KILLED' : 'SURVIVED';
    results.push({ ...mutant, status, run });

    console.log(`${mutant.id}  ${status.padEnd(8)}  ${String(run.failed).padStart(3)} failing  ${mutant.rule}`);
    if (status !== 'KILLED') {
      for (const f of run.failures.slice(0, 3)) console.log(`        - ${f.title}`);
      for (const m of run.loadErrors.slice(0, 1)) console.log(`        ! ${m.split('\n')[0]}`);
    }
  }

  const killed = results.filter((r) => r.status === 'KILLED').length;
  console.log(`\n${killed} of ${results.length} mutants killed.`);
  const bad = results.filter((r) => r.status !== 'KILLED');
  if (bad.length) {
    console.log(`Not killed: ${bad.map((r) => `${r.id} (${r.status})`).join(', ')}`);
    process.exitCode = 1;
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
