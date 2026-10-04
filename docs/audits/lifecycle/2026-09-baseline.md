# Lifecycle architecture baseline, 2026-09-25

Measured before any change from the lifecycle plan (M0). Read-only SQL against production and staging. Counts only: this repository is public, so no emails, ids or names are recorded here.

Later milestones compare against these numbers.

## People

| Measure | Production |
|---|---|
| `users` rows | 1,940 |
| Firebase sign-in only | 1,743 |
| Microsoft sign-in only | 115 |
| Both | 71 |
| Neither | 10 |
| Rows still named "User" (phone-first apply form) | 265 |
| Active student enrolments (role student, active, live classroom, dormant included) | 62 |
| `lower(email)` collisions | 2 groups, 4 rows |
| Same 10-digit phone stored in different formats | 14 groups |
| `nexus_access_enabled = true` (dead column) | 0 |
| `users.status` not `active` (legacy column) | 10 |

## Events and activity

| Measure | Production |
|---|---|
| `user_funnel_events` rows | 52,891 |
| of which in the last 30 days | 2,230 |
| `tool_usage_logs` rows in the last 30 days | 0 (writes fail silently, fixed in M3a) |

## Admin dashboard numbers under the new definitions (`apps/admin/src/lib/dashboard-stats.ts`)

| Card | Production | Old card showed |
|---|---|---|
| Active students | 62 | 1,234 (hardcoded); the old route would have said 161, alumni included |
| New leads, last 7 days | 12 | 45 (hardcoded) |
| Applications to review | 125 | 0: the old route counted status `new`, which the enum does not have |
| Collected this month (India time) | ₹55,000 | ₹4.5L (hardcoded) |
| Payments pending | 20 | 23 (hardcoded) |

## Migration ledger

`supabase db push` compares the leading digits of each file in `supabase/migrations/` with `supabase_migrations.schema_migrations`.

| Measure | Production | Staging |
|---|---|---|
| Local files | 382 | 382 |
| Distinct local version prefixes | 333 | 333 |
| Version prefixes shared by more than one file | 31 | 31 |
| Ledger rows | 508 | 409 |
| Local versions found in the ledger | 210 | 91 |
| Local versions absent under their own version | 123 | 242 |
| Ledger rows with no local file | 298 | 318 |

Most "absent" files were applied by hand or through MCP and recorded under a different, generated version. That is why `db push` aborts, and why the deploy workflow now reports the failure instead of swallowing it (`.github/workflows/deploy.yml`, repo variable `DB_PUSH_STRICT`).

To repair, per environment, with a token that can read the ledger:

```
node scripts/db/ledger-diff.mjs --env staging
node scripts/db/ledger-diff.mjs --env production
```

The script only prints `supabase migration repair` commands; review each one before running it. Do not set `DB_PUSH_STRICT=true` until both environments report nothing in sections 1 and 2.

## The second migration folder is an archive

`packages/database/supabase/migrations/` is never pushed by CI. Its files (the user merge RPC, alumni, `student_results`, `personal_email`, student program, access gate) were applied by hand or through MCP. Add no new files there. To change one of those objects, write a new root migration that recreates it. (No README sits in that folder on purpose: any change under `packages/` rebuilds all four apps.)

## Generated types versus production columns

`packages/database/src/types/database.generated.ts` is the `Database` type the code compiles against. It is partly hand-maintained, so it was not regenerated in M0 (regeneration rides the M1a shared-package deploy).

| Table | Production columns missing from the type |
|---|---|
| `users` | 15: `is_disabled`, `disabled_at`, `disabled_by`, `lifecycle_status`, `archived_at`, `archived_by`, `archived_reason`, `academic_year`, `exam_status`, `alumni_removed_ms_licenses`, `personal_email`, `photo_review_method`, `photo_ai_check`, `sketchbook_feature_opt_out`, `share_drawings_opt_out` |
| `nexus_enrollments` | 9: `participation_status`, `dormant_since`, `dormant_reason`, `dormant_by`, `current_standard_set_at`, `current_standard_set_by`, `current_standard_source`, `dormant_source`, `join_reminders_sent` |
| `user_funnel_events`, `testimonials`, `student_results`, `lead_profiles` | none |
