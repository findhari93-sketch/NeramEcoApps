# Lifecycle architecture: production rollout

Everything below is applied on **staging** (2026-09-25/26) except where marked. Production gets it in one window, in this order, together with the deploy. Nothing here has been deployed.

## 0. Already on production

| Migration | Why it went early |
|---|---|
| `20261009080000_lock_down_user_admin_functions` | `merge_user_records`, `preview_user_merge`, `_merge_dedupe_unique` and both `admin_bulk_delete_users` were SECURITY DEFINER and executable by the public anon key, so anyone could merge or delete users. Revoked from anon and authenticated; every caller uses the service role. Reversible with a GRANT. |
| `20261016100000_lock_down_definer_writes` | `set_current_avatar`, `record_profile_change`, `create_lead_profile`, `initialize_student_onboarding` and `record_ai_usage_daily` were SECURITY DEFINER writes executable by the anon key. Revoked 2026-09-26 on staging and production, ledger stamped. `check_username_available` and `suggest_usernames` stay open: the app username check calls them with the anon client. |

## 1. Before the window

1. **Done 2026-09-26: the two case-variant email pairs on production are merged.** Jyothi and Vaishnavi each had a Microsoft row and a phone or Google row; the Microsoft row survived and every reference moved to it. Vaishnavi's empty manual application was soft-deleted (`deleted_at` set) so only NRM-2605-00083 stays live, and her duplicate active phone registration was dropped by the merge. Recheck just before the window (rows with no email are fine):
   ```sql
   SELECT lower(email), array_agg(id ORDER BY created_at) FROM users WHERE email IS NOT NULL GROUP BY 1 HAVING count(*) > 1;
   ```
2. **Admin `CRON_SECRET`:** the admin Vercel project has no `CRON_SECRET` in any environment (checked with `vercel env ls` on 2026-09-26; the earlier note that it existed was wrong). So every admin `/api/cron/*` route is open, and `/api/cron/identity-sweep` refuses to run. The pg_cron job `auto-first-touch` was changed on 2026-09-26 (production and staging) to send `Authorization: Bearer <vault secret admin_cron_secret>`, and to send no Authorization header while that Vault secret is missing, so it behaves exactly as before until the secret is added. To finish, with two different random values (`openssl rand -hex 32`):
   - Production: `cd apps/admin && vercel env add CRON_SECRET production --sensitive`, then on the production database `select vault.create_secret('<same value>', 'admin_cron_secret');`
   - Preview and staging: `vercel env add CRON_SECRET preview --sensitive`, then the same `vault.create_secret` on the staging database with the preview value.
   - The Vercel value only takes effect at the next deploy, and the Vault value takes effect at once. The live admin ignores the header until then, so the order does not matter.
   - After the deploy, check that `select status_code from net._http_response order by created desc limit 3` shows 200, not 401.
3. **pg_cron `sync-teams-meetings` removed** (production and staging, 2026-09-26). It POSTed to a GET-only route and got 405 every 10 minutes, so it never ran. The Vercel cron in `apps/nexus/vercel.json` (daily 15:45 UTC) is the only schedule now.
4. Optional: `ADMIN_API_AUTH_MODE=report` on the admin project for the first day if you want refusals logged but not enforced. Remove it once the logs are quiet.

## 2. Migrations, in order (apply to production by MCP, stamp the ledger with the filename version)

| Order | File | Notes |
|---|---|---|
| 1 | `20261009090000_user_identities` | Backfills from `users.firebase_uid` and `ms_oid`. |
| 2 | `20261009090100_users_email_lower_unique` | Fails loudly until step 1.1 is done. |
| 3 | `20261009090200_user_merge_log` | Replaces `merge_user_records` (live body + merge log). Signature unchanged. |
| 4 | `20261009090300_funnel_events_generalize` | Widens `chk_funnel`, adds `session_id`, `analytics_events` view, drops the open INSERT policy. |
| 5 | `20261009090400_users_anonymous_first_touch` | |
| 6 | `20261010090000_users_last_meaningful_activity` | First fill runs inside the migration; schedules pg_cron `refresh-user-activity`. |
| 7 | `20261010090100_user_lifecycle_view` | Drops and recreates `user_journey_view` as `user_lifecycle_view WHERE has_firebase`. Same rows as before (verified on staging by id hash). |
| 8 | `20261011090000_user_duplicate_candidates` | Seeds dismissed pairs from `nexus_application_form_dismissals`; first detection on production proposes about 23 pairs (14 strong). Schedules `detect-user-duplicates`. |
| 9 | `20261012090000_user_timeline` | Function only. |
| 10 | `20261013090000_crm_owner_follow_ups` | `crm_owner_id`, `crm_follow_ups`, `crm_conversion_monthly`, `user_deletion_log`. |
| 11 | `20261014090000_feedback_consent_outcomes` | Testimonials consent and moderation. Existing active testimonials become `published` with `consent_by = 'staff_recorded'`. |
| 12 | `20261015090000_lifecycle_rules_suggestions` | Rules in `site_settings`, `lifecycle_suggestions`, schedules `lifecycle-suggestions`. |

Order matters: 7 reads columns from 5 and 6; 10 and 12 read the view from 7; 3 closes candidates created by 8 (guarded, so 3 before 8 is fine).

## 3. Deploy

`packages/` changed, so all four apps rebuild. Deploy after the migrations (the code degrades safely without them, but the new screens need them).

## 4. After the deploy

- Check the pg_cron jobs exist: `SELECT jobname, schedule FROM cron.job;` expects `refresh-user-activity`, `detect-user-duplicates`, `lifecycle-suggestions` beside the existing two.
- Open Admin, Duplicates and review the queue; nothing merges on its own.
- Open Admin, Lifecycle: suggestions only, nothing acts on its own.
- Open Admin, Testimonials, "Needs confirmation". The nine testimonials that predate the workflow were all entered on 2026-03-05 and nobody has vouched for them. They stay on the legacy /testimonials page, but /reviews, the Review markup and every computed star rating ignore them until a person confirms each genuine one ("Confirm as genuine"). Delete any that are placeholders. Until at least five confirmed ratings exist, the review pages stay noindex and no page claims a rating.
- Page copy still states "4.9/5 Student Rating" or "4.9 Google Rating" on best-nata-coaching-chennai, the Chennai neighbourhood pages and nata-coaching-center-in-tamil-nadu. These are visible text, not structured data, and were left for a person to verify against the Google Business Profile.
- Regenerate `packages/database/src/types/database.generated.ts` once both environments carry the same schema (it is hand-maintained today and lags production by 15 `users` columns and 9 `nexus_enrollments` columns).
- When `scripts/db/ledger-diff.mjs` reports nothing to repair on both environments, set the repo variable `DB_PUSH_STRICT=true`.
