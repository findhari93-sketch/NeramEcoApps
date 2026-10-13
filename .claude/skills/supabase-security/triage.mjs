#!/usr/bin/env node
// Triage Supabase security advisor output against the accepted baseline.
//
//   node .claude/skills/supabase-security/triage.mjs prod=<file> staging=<file> [--json] [--ci]
//
// <file> is either the saved result of mcp__supabase-*__get_advisors
// ({"result":{"lints":[...]}}) or the Management API response
// (GET /v1/projects/{ref}/advisors/security, {"lints":[...]}).
//
// Default output lists every NEW finding (not in accepted.json) with its recipe.
// --ci prints a Markdown summary with counts only, never object names (the repo
// is public), and writes new_count to $GITHUB_OUTPUT when it is set.
// --json prints the full triage as JSON.

import { readFileSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// Rule name -> heading in recipes.md
const RECIPES = {
  rls_disabled_in_public: 'R1',
  security_definer_view: 'R2',
  anon_security_definer_function_executable: 'R3',
  authenticated_security_definer_function_executable: 'R3',
  function_search_path_mutable: 'R4',
  materialized_view_in_api: 'R5',
  rls_enabled_no_policy: 'R6',
  policy_exists_rls_disabled: 'R1',
  rls_references_user_metadata: 'R7',
  auth_users_exposed: 'R7',
  extension_in_public: 'R8',
  auth_leaked_password_protection: 'D1',
  vulnerable_postgres_version: 'D1',
  auth_otp_long_expiry: 'D1',
  auth_insufficient_mfa_options: 'D1',
};

const LEVEL_ORDER = { ERROR: 0, WARN: 1, INFO: 2 };

function parseLints(path) {
  const data = JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, '').trim());
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.lints)) return data.lints;
  if (data.result && Array.isArray(data.result.lints)) return data.result.lints;
  throw new Error(`${path}: no "lints" array found`);
}

function objectKey(lint) {
  const m = lint.metadata || {};
  if (m.name) return m.schema ? `${m.schema}.${m.name}` : m.name;
  if (m.entity) return m.entity;
  return '*';
}

function isAccepted(accepted, env, lint) {
  const key = objectKey(lint);
  return accepted.find(
    (a) =>
      a.rule === lint.name &&
      (!a.env || a.env === env) &&
      (a.object === '*' || a.object === key),
  );
}

function main() {
  const args = process.argv.slice(2);
  const ci = args.includes('--ci');
  const asJson = args.includes('--json');
  const inputs = args
    .filter((a) => !a.startsWith('--'))
    .map((a) => {
      const i = a.indexOf('=');
      if (i < 1) throw new Error(`Expected env=<file>, got "${a}"`);
      return { env: a.slice(0, i), path: a.slice(i + 1) };
    });
  if (!inputs.length) {
    console.error('Usage: triage.mjs prod=<file> staging=<file> [--json] [--ci]');
    process.exit(2);
  }

  const accepted = JSON.parse(readFileSync(join(here, 'accepted.json'), 'utf8')).accepted;
  const findings = [];
  for (const { env, path } of inputs) {
    for (const lint of parseLints(path)) {
      if (!(lint.categories || ['SECURITY']).includes('SECURITY')) continue;
      const hit = isAccepted(accepted, env, lint);
      findings.push({
        env,
        rule: lint.name,
        level: lint.level,
        object: objectKey(lint),
        detail: lint.detail,
        recipe: RECIPES[lint.name] || '?',
        remediation: lint.remediation,
        accepted: Boolean(hit),
        acceptedReason: hit ? hit.reason : undefined,
      });
    }
  }

  // Per env + rule counts
  const summary = {};
  for (const f of findings) {
    const k = `${f.env}|${f.level}|${f.rule}`;
    summary[k] ??= { env: f.env, level: f.level, rule: f.rule, recipe: f.recipe, total: 0, accepted: 0, new: 0 };
    summary[k].total++;
    f.accepted ? summary[k].accepted++ : summary[k].new++;
  }
  const rows = Object.values(summary).sort(
    (a, b) => a.env.localeCompare(b.env) || LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.rule.localeCompare(b.rule),
  );
  const newFindings = findings.filter((f) => !f.accepted);
  const newCount = newFindings.length;
  const newErrors = newFindings.filter((f) => f.level === 'ERROR').length;

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `new_count=${newCount}\nnew_errors=${newErrors}\n`);
  }

  if (asJson) {
    console.log(JSON.stringify({ newCount, newErrors, rows, findings }, null, 2));
    return;
  }

  if (ci) {
    const lines = [
      `Supabase security advisors found **${newCount} new finding(s)** (${newErrors} ERROR) that are not in the accepted baseline.`,
      '',
      '| Env | Level | Rule | New | Accepted |',
      '|---|---|---|---:|---:|',
      ...rows.filter((r) => r.new > 0).map((r) => `| ${r.env} | ${r.level} | \`${r.rule}\` | ${r.new} | ${r.accepted} |`),
      '',
      'Object names are left out on purpose because this repo is public.',
      '',
      'To fix: open Claude Code at the repo root and run `/supabase-security`.',
    ];
    console.log(lines.join('\n'));
    return;
  }

  console.log('Env      Level  New  Acc  Recipe  Rule');
  for (const r of rows) {
    console.log(
      `${r.env.padEnd(8)} ${r.level.padEnd(6)} ${String(r.new).padStart(3)}  ${String(r.accepted).padStart(3)}  ${r.recipe.padEnd(6)}  ${r.rule}`,
    );
  }
  console.log(`\nNEW: ${newCount} (${newErrors} ERROR)`);
  if (newCount) {
    console.log('');
    const sorted = [...newFindings].sort(
      (a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.rule.localeCompare(b.rule) || a.object.localeCompare(b.object),
    );
    for (const f of sorted) console.log(`[${f.env}] ${f.level} ${f.recipe} ${f.rule}  ${f.object}`);
  }
}

main();
