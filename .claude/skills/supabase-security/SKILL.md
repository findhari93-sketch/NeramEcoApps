---
name: supabase-security
description: Use when the Supabase "security vulnerabilities detected" email arrives, when the weekly "Supabase security advisors" GitHub issue opens, or when asked to check, triage or fix Supabase security advisor findings (RLS disabled, SECURITY DEFINER views or functions, mutable search_path) on prod or staging.
---

# Supabase security advisors: collect, triage, fix

The Supabase security advisor runs on both projects: prod `zdnypksjqnhtiblwdaic` and staging `hgxjavrsrvpihqrpezdh`. `accepted.json` holds the findings we keep on purpose. Everything else is NEW and gets fixed through one migration, with a recipe from `recipes.md`.

The weekly GitHub workflow `.github/workflows/supabase-advisors.yml` runs the same triage. It opens one issue labelled `supabase-security` with counts only, so seeing that issue is a cue to run this skill.

## Protocol

1. **Collect.** Call `mcp__supabase-prod__get_advisors` and `mcp__supabase-staging__get_advisors` with `type: "security"`. The results are too large to read inline, and the harness saves each one to a tool-results file. Pass those paths on, and do not read them into context.
2. **Triage.** Run `node .claude/skills/supabase-security/triage.mjs prod=<prod file> staging=<staging file>`. It prints counts by env and rule (new vs accepted), then every NEW finding with its recipe id. Use `--json` when you need the detail text.
3. **Check callers.** For each NEW object, Grep the repo for it and work out which client reaches it (the table at the top of `recipes.md`).
   - If every caller uses the service role, the fix is safe.
   - If any caller uses the anon client, either move that caller to the admin client (an app code change) or propose an `accepted.json` entry. An accepted entry needs the user's agreement.
   - Check that a function returning `trigger` is actually attached (`grep -n "create trigger"`).
4. **Write the migration.** Create `supabase/migrations/<YYYYMMDDHHMMSS>_security_advisor_fixes.sql`, timestamped after the newest file in that folder (the repo uses future-dated stamps, so check with `ls`).
   - The header comment lists each object, its callers, and why the change is safe (see `20261120090000_security_advisor_fixes.sql`).
   - Use `IF EXISTS` and catalog loops so one file fits both envs.
5. **Staging first.** Apply with `mcp__supabase-staging__apply_migration`. Then re-run the staging advisors and triage again. Then smoke-test what you changed:
   - Query a view through `execute_sql` with `set local role service_role`.
   - Fire a trigger inside `begin ... rollback`.
   - Hit an affected route on a local dev server.
6. **Prod after approval.** Show the BEFORE/AFTER for staging, then ask. Once the user says yes, apply with `mcp__supabase-prod__apply_migration` and re-run the prod advisors.
7. **Report.**
   - Give the user a BEFORE/AFTER table per env and rule, plus the dashboard-only items (recipe D1) with click paths.
   - The repo is public. Any report that names still-open objects goes to `docs/audits/security/reports/YYYY-MM-DD.md`, which is gitignored, never to a committed file or a GitHub issue.

## Rules
- Never deploy, push or commit unless the user asks (CLAUDE.md). Never `git stash`.
- `apply_migration` stamps its own version, not the file's timestamp, which adds ledger drift. Right after each apply, run this through `execute_sql`:
  ```sql
  UPDATE supabase_migrations.schema_migrations
  SET version = '<file ts>'
  WHERE version = '<auto ts>' AND name = '<name>';
  ```
  Then `NOTIFY pgrst, 'reload schema'`. Pass the file name without its timestamp and `.sql` as the MCP `name`.
- Write migrations so that applying them twice is harmless, because the GHA `db push` job is unreliable here.
- Do not create policies or move callers to another client without the user's approval. Both change how the apps behave.
- Do not touch `packages/database` just to silence an advisor. Every change there rebuilds and deploys all 4 apps.
