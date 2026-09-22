---
name: perf-audit
description: Use when asked to run, continue or check a performance, reliability, loading or UX audit of a Neram app (Nexus first), or when production shows slow pages, stuck skeletons, pages that only work after a refresh, hydration errors (React #418, #423, #425), 524 or connection-closed API calls, or duplicate requests.
---

# Performance audit with a change-aware ledger

An audit here is incremental. The ledger remembers each audited unit (a page, a route handler, a layout, a widely shared file, a package, the app config) together with a fingerprint of the code it depends on. **Code that is unchanged since its audit is not audited again. Changed code is re-audited on the diff only.** The checklist (`checklist.md`) defines what an audit looks at. The app notes (`nexus-notes.md`) hold what is already known.

CLI: `node .claude/skills/perf-audit/ledger.mjs <command>` (add `--app <name>` for apps other than nexus). Each run analyses the app in about 10s.

## Protocol

1. **Status.** Run `ledger.mjs status`. It shows coverage by area, units needing attention with reasons, and open findings.
2. **Plan.** Run `ledger.mjs plan --focus "<unit id, or a file name like NavBadgeProvider>" --budget 25`. If the user named no route or symptom, leave out `--focus`; the priority order below then picks the scope.
   - `plan` expands focus to the ancestor layouts, the packages the unit reaches and the app config.
   - It lists the shared files the focus reaches, highest fan-in first. Add the ones on the symptom's path with another `--focus`, or all of them with `--expand`.
   - It then adds foundation units (the config and layouts first, then shared files and packages by fan-in), stale units with open severe findings, stale units, and never-audited units, up to the budget.
   - It **snapshots each planned unit's fingerprint**. `record` stores that snapshot, so the ledger describes the code you actually read.
   - Fresh units come back as skipped. Do not read them. List them in the report.
3. **Audit each planned unit by its status.**
   | Status | What to do |
   |---|---|
   | `never`, `moved` | Full pass. `explain <unit>` lists its files. Run every check that applies to its kind. |
   | `stale:code` | Diff-focused. `explain <unit>` marks the changed, added and removed files and prints the `git diff` command against the audited commit. Review those changes and how they interact with the rest of the unit. |
   | `stale:checks` | Run only the listed new or bumped checks. |
   | `stale:ttl` | Rerun only the listed runtime checks (latency, plans). |
   | `unknown` | The tool cannot see some imports (`problems`). Read what they load, then record with `--ack-problems`. |
   | `stale:deps` | Informational. A shared file or package under the unit changed, and that is audited as its own unit. |
4. **File findings.** Write a JSON file in the scratchpad and run `ledger.mjs finding add --from <file>`. It assigns `PERF-####`. Fields:
   `severity` (CRITICAL/HIGH/MEDIUM/LOW), `title`, `units` [ids], `check` (e.g. HYD-1), `evidenceType` (measured/inferred), `location`, `rootCause`, `evidence`, `impact`, `fix`, `risk`, `expected`.
   For anything exploitable (an auth gap, data exposure) set `redacted: true`, use a generic title and no detail fields, and write the details to a private memory file. The repo is public.
5. **Record.** Run `ledger.mjs record <unit>... --checks all --findings PERF-0001,...`.
   - `--checks` takes `all`, a family (`HYD`) or ids (`HYD-1`), and means *the checks you actually ran on that unit*.
   - When a diff-focused re-audit covered the changed files against every check, `--checks all` is correct.
6. **Fix.**
   - Safe local fixes: find the root cause first (superpowers:systematic-debugging), write a failing test first, and run `/ui-ux-pro-max` for any UI change.
   - Before changing them, present DB indexes, RLS, architecture and cross-app changes and get approval.
   - After fixing a unit you already recorded, run `plan --focus <unit>`, review your diff, and record again. Otherwise the fix shows as `stale:code` next session, which is also acceptable.
   - Close findings with `finding set PERF-0001 --status fixed` once tested, and `--status verified` once seen working. `accepted` and `wontfix` need the user's word.
7. **Report.** Write `docs/audits/perf/<app>/reports/YYYY-MM-DD.md` following `report-template.md`. Run `ledger.mjs verify`, which must show 0 errors. Tell the user the coverage numbers and the BEFORE/AFTER table.

## Rules specific to this repo
- Never deploy, push or commit unless the user asks (CLAUDE.md). Never `git stash`, because concurrent sessions share the tree.
- Before any `next build`, confirm nothing listens on ports 3010 to 3013. A build clobbers a running dev server.
- Type-check with `--force`. `ignoreBuildErrors` hides type errors in Nexus builds, and a Turbo cache hit hides them locally.
- `EXPLAIN ANALYZE` runs on staging only. Prod gets read-only queries and advisors.
- Never edit `ledger.jsonl` or `findings.jsonl` by hand. The CLI locks, merges and validates them.
- Improving the checklist: edit `checklist.md` and bump the check's `v`, or add a new id. Audited units then rerun only that check.

## Blind spots
- The fingerprints cover code that is reachable through imports, plus `config:<app>` (next.config, dependency versions, tsconfig, vercel.json, manifest).
- They do **not** cover new SQL migrations, data growth or transitive lockfile bumps. Runtime checks carry a TTL for that reason.
- When a migration touches a hot table, re-audit the routes that query it with DB checks, even if they read fresh.
