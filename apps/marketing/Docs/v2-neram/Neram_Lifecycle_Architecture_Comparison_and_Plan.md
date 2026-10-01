# Plan: User lifecycle, analytics and feedback architecture (spec versus code, and what to build)

> Repo copy of the approved plan (2026-09-25). Security specifics are redacted here; the full version is the private plan file `~/.claude/plans/apps-marketing-docs-v2-neram-neram-user-gentle-avalanche.md`.

Source spec: `apps/marketing/Docs/v2-neram/Neram_User_Lifecycle_Analytics_Feedback_Architecture.md` (v1.0, 2026-09-25, written outside the repo).
Comparison basis (2026-09-25): three read-only sweeps of the schema (both migration folders), the sign-in and access code in all four apps, and the admin, Nexus and marketing screens, plus a code-level stress test of the milestones with read-only SQL against prod. `ROOT` = the repo root.

## Context

The spec proposes moving from a plain `users` table to a unified identity, lifecycle, enrollment, entitlement, CRM, analytics and feedback platform with a User 360 for staff and a review-to-SEO flywheel. It was written without reading the code, so it does not know what already exists (a working merge RPC, a funnel-events pipeline, an archive and cohort model, a Nexus participation model, review campaigns, testimonials and results tables) or what is broken (three sign-in resolvers with different matching rules, seven overlapping status flags, a hardcoded admin dashboard, a tool-usage log that has recorded nothing for 30 days, one admin API route out of 225 that verifies its caller).

This plan maps every spec concept to what runs today, states what to adopt, adapt or defer, and sequences the work into milestones that fit this monorepo (migration ledger drift, four-app rebuild on any `packages/` change, Vercel cost rules, no Microsoft login in E2E, minors in the user base, no automatic deploys).

## Decisions already taken (your answers, 2026-09-25)

| Decision | Choice |
|---|---|
| Where User 360 lives | One shared read model in `packages/database`, two views: Admin `/crm/[id]` (desktop, full CRM and finance) and Nexus `teacher/students/[id]` (mobile-first, enrolled students). No screen retired. |
| Identity model | Keep `users` as the canonical row. One `resolveIdentity()` on every sign-in path, a small provider-id lookup table, a duplicate-candidates queue and a merge log. No restructure, no repointing of the ~200 user-id columns. The lookup table is named `user_identities` (the spec's name, minus the restructure) so nothing needs renaming later. |
| Analytics tooling | First-party only. Generalise `user_funnel_events` into the spec's `analytics_events`. Revisit PostHog or GA4 after a privacy review once the taxonomy is stable. |
| Plan depth | Roadmap for all milestones; concrete files, migrations and tests for M0, M1a, M3a and M2. |

## Prod baseline (read-only SQL, 2026-09-25)

| Measure | Value |
|---|---|
| `users` rows | 1,940 |
| Firebase only / Microsoft only / both / neither | 1,743 / 115 / 71 / 10 |
| Rows still named "User" (phone-first apply form) | 265 |
| Active student enrollments (role student, active, live classroom, dormant included) | 62 |
| `lower(email)` collisions | 2 groups, 4 rows |
| Same 10-digit phone stored in different formats | 14 groups |
| `user_funnel_events` rows (last 30 days) | 52,891 (2,230) |
| `tool_usage_logs` rows in last 30 days | 0 |
| `nexus_access_enabled = true` | 0 rows (dead column, still written and read) |
| `users.status` not `active` | 10 rows (legacy column, still filtered in 4 places) |
| pg_cron jobs (scheduled by hand, not in migrations) | 2 (`auto-first-touch`, `sync-teams-meetings`) |
| Vercel crons: nexus / marketing / admin / app | 24 entries / 2 / 1 / 0 |

---

## Part A. Comparison: the spec versus what runs today

### A1. Applications

| Spec app | Real app | Auth | What it does today |
|---|---|---|---|
| Marketing App | `apps/marketing` | Firebase, optional | SEO pages, apply form, demo classes, callbacks, chatbots, testimonials, achievements, alumni page |
| AiArchitect Tools App + Student App | `apps/app` | Firebase, required | NATA calculator, college and rank predictors, counselling tools, application form, YouTube rewards, support, feedback form |
| Nexus Admin | Split in two: `apps/admin` (staff CRM, finance, marketing content, desktop-first) and `apps/nexus` (LMS for enrolled students and teachers, mobile-first) | Microsoft | Admin: leads, students hub, payments, testimonials, results, support. Nexus: roster, catch-up, tests, drawings, review campaigns, feature flags |

The spec's "Recommended Nexus Navigation" (section 43) describes the Admin app's job. This plan keeps the split and does not move CRM into Nexus.

### A2. Domain by domain

Verdict legend: **Adopt** (build as specified), **Adapt** (the idea, on top of what exists), **Have** (exists, wire it in), **Defer** (reason in Part D).

| Spec concept (section) | What exists today | Gap | Verdict |
|---|---|---|---|
| Canonical `users` + `user_identities` (11) | `users` carries `firebase_uid`, `ms_oid`, `google_id` (the Google account id from the YouTube OAuth reward flow, not a Firebase uid: `apps/app/src/app/api/youtube/oauth-callback/route.ts:116-130`), `email` (unique, case-sensitive), `phone` (unique, exact string), `personal_email`, `linked_classroom_email`. One row already carries Google, Microsoft and phone. | Three resolvers disagree: `getOrCreateUserFromFirebase` (`packages/database/src/queries/users.ts:235-331`: uid, then phone claim, then email, then insert; lines 279 and 289 overwrite `firebase_uid`, so a phone-only uid and a Google uid flip-flop), `reconcileMsIdentity` (`packages/database/src/queries/ms-identity.ts:85-172`, `ilike` email), admin `/api/auth/me` (`ms_oid`, then `ilike` email, never creates). `getUserByEmail` (`users.ts:44-62`) is case-sensitive while every Microsoft path is not. The Nexus enrollment route already goes through `resolveDirectoryUser` and the reconciler (`apps/nexus/src/app/api/classrooms/[id]/enrollments/route.ts:122-147`). RLS policies compare `auth.uid()` to `users.firebase_uid` (`supabase/migrations/20260304_exam_profile_onboarding.sql:57-73`), so that column must stay. | **Adapt**: one resolver core, `user_identities` lookup, keep the columns |
| Duplicate states + controlled merge (12) | `merge_user_records` and `preview_user_merge` (`packages/database/supabase/migrations/20260628141000`, fixed by root `20260910110000`), admin `MergeDuplicatePanel`, Nexus application-form link merge, `nexus_application_form_dismissals`. Detection in three modules (`apps/admin/src/lib/user-merge-detect.ts`, `apps/nexus/src/lib/identity-candidates.ts`, `apps/nexus/src/lib/application-form-match.ts`). | No candidates table; no merge log (only `users.metadata.merged_from`); detection only catches an @neram row paired with a personal row. | **Adapt**: candidates queue, merge log, one sweep |
| Account status, learner lifecycle, engagement, CRM stage as separate dimensions (5 to 7) | Seven overlapping flags (`supabase/migrations/20260802090000:19-33`): `status` (legacy), `lifecycle_status`, `is_alumni`, `is_disabled`, `nexus_access_enabled` (dead), `exam_status`, `nexus_enrollments.is_active`; plus `participation_status` + `dormant_source`, `user_type`, `student_program`, `academic_year`. CRM `pipeline_stage` is derived in `user_journey_view` (`supabase/migrations/20260622000000:29-136`), which deliberately excludes Microsoft-only rows (`20260315_crm_view_firebase_only.sql`). All consumers are in `packages/database/src/queries/crm.ts` (`listUserJourneys` 54-218, `getPipelineStageCounts` 227-328, `getLeadPipelineStageCounts` 333, `computePipelineStage` 614-645). | Dimensions exist but are scattered; no engagement state; nothing covers all users. | **Adapt**: derive in one view over all users, keep the old view as a filtered alias |
| Learner profile, preparation goal, target exams, target year, completeness (8 to 10, 23) | `lead_profiles` (class, school, city, `interest_course` nata / jee_paper2 / both, `target_exam_year`), `user_exam_profiles` (NATA only: status, attempt count, planning year), `users.exam_status`, `users.academic_year` (cohort), `student_program` (= preparation goal), `nexus_enrollments.current_standard` (class). `computeAccountTier` (`packages/database/src/queries/account-tier.ts:11-19`) is the only completeness signal. | Target exams must be derived from three sources; no percentage completeness. | **Adapt**: learner block in the read model, derived; no new table |
| Program-centric enrollment (13) | `nexus_enrollments` (one classroom per academic year) is the enrollment; `student_profiles` holds fees; `academic_batches` is the exam-year cohort. | None material. | **Have** |
| Entitlements table (14) | `apps/app`: every Firebase user gets every tool; `isEnrolledStudent` gates only the bug reporter. Nexus: active enrollment in a live classroom, not alumni, photo gate; feature flags in `nexus_settings`; per-resource grant tables. | No paid tier exists. | **Defer**; expose an `access` block in the read model |
| Anonymous id linked at signup (15) | App tracker uses a SHA-256 device fingerprint as `anonymous_id` (`apps/app/src/lib/funnel-tracker.ts:62-69`, from `device-fingerprint.ts:27-60`); marketing sends null (`apps/marketing/src/lib/funnel-tracker.ts:71`); `linkAnonymousEvents` runs only in the app ingest route; `register-user` imports it and never calls it. `neram_attribution` cookie (90 days, root domain) lands on `lead_profiles` and request tables, never on `users`. | A stable hardware hash of a minor's device is the wrong anonymous id; no first touch on the person. | **Adopt**: random first-party cookie, `users.anonymous_id` + `first_touch` |
| `analytics_events` + object_action taxonomy (16, 51, 52) | `user_funnel_events` (`supabase/migrations/20260509_user_funnel_events.sql`): the spec's columns already exist; `chk_funnel` limits `funnel` to auth, onboarding, application; INSERT policy is `WITH CHECK (true)` for any role (writes go through the admin client, so latent); `auth_funnel_summary` view; `get_user_last_auth_step()`; admin `AuthFunnelChart` + `LeadDiagnosticsDrawer`. `tool_usage_logs` is dead: the tool routes pass the Firebase uid into a uuid FK and use the anon browser client that has no INSERT policy (`apps/app/src/app/api/tools/college-predictor/route.ts:71,90,96` and siblings). Only Google Ads gtag on the client. | Funnel scope and names; the dead tool log. | **Adapt**: extend the table, do not add a second one |
| Auth funnel (17) | Built. | Dashboard numbers elsewhere are literals. | **Have** |
| `last_meaningful_activity_at` (18) | `last_login_at`, `nexus_first/last_login_at`, `nexus_sign_in_events`, device heartbeats, watch sessions, attendance, submissions; `apps/nexus/src/lib/inactivity-score.ts` combines some on request. | Not stored, not shared, not defined once. | **Adopt**: stored column filled by a pg_cron rollup |
| Dormancy to deactivation policy (19, 20) | Nexus Not started (trigger) and Paused (staff), join-reminder cron (flag OFF), 14-day decision point; CRM archive candidates (manual), graduation (manual, offboards Microsoft), `is_disabled` kill switch. Rules are code constants. Recorded: dormancy never removes access; archive never disables login; graduation blocks Nexus. | No suggestion queue; rollover does not graduate; 25 removed students still hold enabled Entra accounts; admin `/settings` is a stub. | **Adapt**: sweep that suggests, never auto-deactivates |
| User 360 + timeline (21, 22, 46) | Admin `/crm/[id]` (profile, application, payments, auto messages, demo, callbacks, notes, `HistoryTimeline` over `user_profile_history`); Nexus `students/[id]` (`TimelineSection`, `lib/student-profile.ts:498-605`); admin `StudentDetailDrawer`; admin `/leads/[id]` is a mock page. | Three partial views; none shows sign-ins, tool use, messages sent and CRM notes together. | **Adapt**: one `getUser360`, two views |
| CRM lead, interaction, task (24) | `lead_profiles` (status, `contacted_status`), `callback_requests` (assigned_to, scheduled time) + `callback_attempts` + `/api/cron/callback-reminders`, `admin_user_notes`, `auto_messages`, demo registrations. `LeadReviewForm.tsx` unused. | No owner on the person; no due-today queue; dead lead, irrelevant, disable, delete not audited; `/crm` column filters never reach the server (`components/crm/UsersTable.tsx:901,917`). | **Adapt**: owner column, due queue over callbacks, audit gaps; no tasks table |
| Engagement signals, next best action (25, 26) | Nexus inactivity score, catch-up cards, Needs attention, CRM Candidates. | Nothing for leads and tool users. | **Adapt** as transparent rules over the read model (M2, M7) |
| Feedback, private vs public, moderation, consent (27 to 32) | `app_feedback` (rating, category, status; admin `/feedback`), `nexus_class_reviews`, `demo_class_surveys` (NPS), `college_reviews` (moderated), `testimonials` (admin-entered, not linked to users, no consent), `social_proofs`, `review_campaigns` (Google / Sulekha / JustDial asks, self-reported). | No learner-submitted testimonial with consent; no publication state; no topics. | **Adapt**: extend `testimonials` and `app_feedback` |
| Learner outcomes, stories (33, 34) | `student_results` (admin-entered, `/achievements`), `alumni_profiles` exam fields + Hall of Fame, `nexus_exam_results`; `/alumni` stories hardcoded (`AlumniPageContent.tsx:17`). | Not linked to `users`; no verification state on self-reported results. | **Adapt**: link and add a view |
| SEO review pages (35, 36) | `/testimonials`, `/achievements`, `/alumni`; `AggregateRating` hardcoded as 4.8/2500, 4.9/90 and 4.9/50 (`apps/marketing/src/lib/seo/schemas.ts:92,657,920` and pages); `generateReviewSchema` unused. | No `/reviews`; ratings are not data. | **Adopt** in M8, after M6 supplies real data |
| Minors and privacy (38) | Opt-out booleans only; `users.date_of_birth` exists. | Consent must record who consented (self or guardian) and the display identity. | **Adopt** as columns in M6 |
| API / domain layer (42) | `packages/database/src/queries/*` is the shared layer; rules also sit in app routes. | No named operations. | **Adapt**: name them, keep them in `packages/database` |
| Audit logs (53) | `user_profile_history` via `recordUserHistory` (`crm.ts:1142`); domain logs; `nexus_impersonation_sessions` (no UI). | Not written for dead lead, irrelevant, disable, delete, merge; no global screen. | **Adapt**: close gaps, one screen; no new generic table |
| Users table and filters (44, 45) | Admin `/crm`, `/students`, Nexus `teacher/students`. | Admin filters not server-side; three tables. | **Adapt**: all fed by the read model |

### A3. Constraints the spec does not know about

- Two migration folders. Root `supabase/migrations/` is what CI pushes; `packages/database/supabase/migrations/` (merge RPC, alumni, `student_results`, `personal_email`) is never pushed. The prod ledger has ~430 rows for 382 root files, with PM files recorded under MCP-generated versions and some files present twice. The fix is `supabase migration repair --status applied <version>` per file, not a migration.
- CI hides migration failures: `.github/workflows/deploy.yml:116,154` set `continue-on-error: true` on `supabase db push`.
- The latest root migration is future-dated `20261008090100`; new files must sort after it or `db push` refuses them.
- `packages/database/src/types/database.generated.ts` is stale and partly hand-edited; `types/index.ts` diverges from it.
- Any change under `packages/` rebuilds all four Vercel projects; batch shared changes.
- Vercel cost rules: server components and ISR first; API routes for mutations or per-user reads; batch inserts; pg_cron for scheduled SQL (already installed: pg_cron 1.6.4, pg_net 0.19.5).
- E2E cannot sign in with Microsoft. Nexus has a `test_` token branch (`apps/nexus/src/lib/ms-verify.ts`); admin does not, and admin E2E specs call admin APIs with no Authorization header today.
- Recorded product rules: dormancy is never access control; archive never disables login; graduation blocks Nexus and offboards Microsoft; every student message goes through `sendNudge`; Admin desktop-first, the rest mobile-first; nothing deploys without an explicit instruction.
- Users include school-age learners: minimum data, explicit consent for anything public.

### A4. Live problems found during the comparison

1. **Admin API mutation routes must verify the caller.** Most routes under `apps/admin/src/app/api` take the acting admin from the request body instead of a verified Microsoft token, and there is no admin middleware. The exact routes are listed in the private plan file, not here. Fixed in M0 for every mutation route.
2. **Migration failures are invisible in CI** (`deploy.yml:116,154`). Fixed in M0.
3. **`tool_usage_logs` has never recorded the current tools** (wrong id type plus anon client). Fixed in M3a.
4. **Admin dashboard shows literals** (`components/DashboardStats.tsx:84-114`); `/api/stats` exists and works but counts by `users.status = 'active'`. Fixed in M0 (wire) and M2 (source).
5. **`/crm` column filters never reach the server**; `/leads/[id]` runs on mock data. Fixed in M4.
6. **CRM cannot see Microsoft-only students** (`user_journey_view` filter). Fixed in M2 without changing the Leads list.
7. **Three inconsistent hardcoded `AggregateRating` values.** Replaced in M6 and M8; until then pick one value and one source.
8. Recorded separately, still open, not in this plan: `direct_enrollment_links` readable with the anon key; public `documents` bucket.

---

## Part B. Target architecture (adapted)

Principles kept from the spec: one person = one `users.id`; sign-in methods belong to the person; NATA and JEE are learner context, not products; separate account status, lifecycle, engagement and CRM stage; track meaningful activity, not logins; deactivation is not deletion; first-party events are the source of truth; private feedback and public reviews are different objects; consent and moderation before publication; business rules in `packages/database`, not React.

### B1. The dimensions, mapped to existing columns

| Dimension | Values | Derived from |
|---|---|---|
| `account_status` | active, deactivated | `users.is_disabled` (legacy `status` retired from code) |
| `lifecycle_stage` | prospect (Firebase only, no form), lead (form or phone verified, no enrollment), applicant (application submitted or under review), enrolled (active enrollment, not yet entered Nexus), active_student (entered), paused (staff dormant), alumni, archived | `user_type`, `lead_profiles.status`, `nexus_enrollments` (`is_active`, `participation_status`, `dormant_source`), `users.nexus_entered_at`, `is_alumni`, `lifecycle_status` |
| `engagement` | new, engaged, low, inactive, dormant | `users.last_meaningful_activity_at` (new, M2) and `created_at` |
| `crm_stage` | the eight existing `pipeline_stage` values; `contacted_status` as disposition | the existing CASE, moved into the new view |
| learner block | preparation goal = `student_program`; target exams from `lead_profiles.interest_course` + `user_exam_profiles` + `exam_status`; year = `academic_year` and `target_exam_year`; class = `current_standard`; completeness = missing-fields list | derived |
| access block | app: full; nexus: enrolled, not_started, alumni, none (with reason); admin: `staff_role` | derived |
| identity block | has_firebase, has_microsoft, phone_verified, email_verified, identities list | `user_identities` (M1a) |

Engagement and dormancy fields are read-only signals. They never feed `is_disabled` or `is_active`.

### B2. The domain layer (spec section 42) as functions in `packages/database`

| Spec operation | Function | Milestone |
|---|---|---|
| resolveIdentity() | `resolveIdentity(client, input)` in `src/queries/identity.ts` | M1a |
| mergeUsers() | `mergeUserRecords` (exists) + `user_merge_log` written inside the RPC | M1a |
| recordEvent() | `insertFunnelEvent` / `insertFunnelEventsBatch` (exist), wider taxonomy | M3a |
| calculateEngagement() | `refresh_user_meaningful_activity()` (SQL, pg_cron) + `deriveEngagement` (pure) | M2 |
| updateLifecycle() | derived by `user_lifecycle_view` | M2 |
| updateLearnerProfile() | `adminUpdateLeadProfile` (exists) | have |
| createEnrollment() | `nexus-enroll` route + `reconcileMsIdentity` (exist) | have |
| grantEntitlement() | deferred | Part D |
| requestFeedback() | `review_campaigns` (exists) + testimonial request | M6 |
| publishReview() | `publishTestimonial` with consent check | M6 |
| deactivateUser() / reactivateUser() | `disableUser` + `offboardMicrosoft` (exist) behind one function | M7 |
| User 360 | `getUser360(userId)` | M4 |

---

## Part C. Roadmap and sequence

Sizes: S (a day), M (two to four days), L (a week). "packages/" = four-app rebuild.

| Order | Milestone | Size | packages/ | Deploy batch | Outcome |
|---|---|---|---|---|---|
| 1 | M0 Ground truth and quick fixes | S/M | no (types regen only) | A: admin + CI | Ledger repaired, CI fails on bad migrations, admin mutations authenticated, dashboard reads data, baseline recorded |
| 2 | M1a Identity foundation (no UI) | L | yes | B | Resolver core, `user_identities`, case-insensitive email, merge log |
| 3 | M3a Analytics substrate | M | yes | B (with M1a) | Generalised event table, anonymous cookie, first touch on users, tool log fixed |
| 4 | M2 Lifecycle and activity read model | M | yes | C | `user_lifecycle_view` over all users, `last_meaningful_activity_at` rollup, legacy flags out of code |
| 5 | M1b Duplicate sweep + Duplicates queue | M | no (admin) | C or D | Nightly candidates, one review screen |
| 6 | M3b Instrumentation + dashboard | M | no | D | Top journeys instrumented, conversion rates |
| 7 | M4 User 360 | M | yes | C (ride with M2) or E | `getUser360` + timeline, two views, mock page deleted, server-side filters |
| 8 | M5 CRM | S/M | small | E | Owner, due-today follow-ups, audit gaps closed |
| 9 | M7 Lifecycle automation | M | no | F | Rules in `site_settings` with a real admin Settings page, daily suggestions, rollover graduates, one deactivate door |
| 10 | M6 Feedback and outcomes | L | yes | E or G | Testimonials and results linked to users, consent (self or guardian), publication state, learner form, topics, outcomes view, moderation queue, data-driven rating |
| 11 | M8 SEO review content | M | no (marketing) | H | `/reviews` family and `/learner-stories` from published data, real Review JSON-LD, `noindex` until enough consented reviews |

Three shared-package deploys in total (B, C, E) if M4 rides C and M5 and M6 share E.

Spec phase mapping: spec 1 = M1a + M1b; spec 2 = M2 (learner) + deferred entitlements; spec 3 = M3a + M3b; spec 4 = M4; spec 5 = M5; spec 6 = M6; spec 7 = M7; spec 8 = M8.

M4 screen rules (ui-ux-pro-max, recorded now so both views are built the same way): one `getUser360` payload, two renderers. Admin (desktop-first): sticky header (name, lifecycle chip, engagement, last active, Message / Assign / Edit) above tabs Overview, Activity, Journey, Enrollment, Access, CRM, Feedback, Audit; each tab is its own lazy fetch with skeletons; Activity is one vertical list with a source icon per row. Nexus (mobile-first, 375 px): header collapses to two lines, tabs become a horizontally scrollable segmented control, Activity is the default tab, sections open as bottom sheets, Back returns to the Students list with segment and filters kept. Both: text plus icon for every status, 44 px targets, visible focus rings, `prefers-reduced-motion`, no horizontal page scroll, MUI theme from `@neram/ui`.

---

## Part D. Deferred from the spec, with reasons

| Spec item | Why deferred | Revisit when |
|---|---|---|
| Full `user_identities` restructure | ~200 columns reference `users.id` without FKs; RLS policies read `users.firebase_uid`; the duplicate problem is resolver logic, not table shape | A third provider beyond Firebase and Microsoft |
| `user_entitlements` | One access level in `apps/app`; Nexus access is classroom membership by decision | A paid tool tier or per-course access |
| `crm_tasks` | `callback_requests` already carries owner, due time and outcome | Non-call tasks are needed |
| `communication_preferences`, `communication_log` tables | `email_opt_out` is the only preference; a view over `auto_messages`, `nexus_notification_deliveries`, `callback_attempts` covers the timeline | WhatsApp or Teams opt-outs |
| `consents` table | One consent type fits as columns on `testimonials` | A second consent type (photo, outcome, story) |
| `learner_stories` table | A published testimonial joined to an outcome is a story | Editorial fields beyond quote and outcome |
| `analytics_sessions`, `analytics_funnels` | `session_id` on events; funnels are SQL views | Staff-editable funnel definitions |
| `programs` table | `courses` + `academic_batches` + one common classroom per year express the single program | A second program with different access or pricing |
| Nexus navigation restructure (43) | Admin owns CRM by decision | Never, unless the app split changes |
| Third-party analytics | First-party first; minors need a privacy review | After M3 has three months of data |

---

## Part E. Detailed milestones

New migrations go in root `supabase/migrations/` numbered after `20261008090100`. Each is applied to staging first with `mcp__supabase-staging__apply_migration`, then prod in the same window as the deploy, and the ledger row stamped with the filename version.

### E0. Ground truth and quick fixes (S/M; admin + CI; batch A)

1. **CI stops hiding migration failures.** `.github/workflows/deploy.yml:116,154`: remove `continue-on-error: true` from both `supabase db push` steps (or add a following step that fails the job when the push output contains an error).
2. **Ledger repair.** New `scripts/db/ledger-diff.mjs` (same Management API pattern as `scripts/apply-specific-migrations.mjs:22-53`): lists root migration versions absent from `supabase_migrations.schema_migrations` and prints the `supabase migration repair --status applied <version>` commands; run per environment by hand. New `packages/database/supabase/migrations/README.md`: this folder is an archive; never add files here.
3. **Types.** `pnpm supabase:gen:types` against staging; diff prod columns with `mcp__supabase-prod__list_tables` for `users`, `nexus_enrollments`, `lead_profiles`, `user_funnel_events`, `testimonials`, `student_results`; record drift here before M1a.
4. **Baseline** saved to `docs/audits/lifecycle/2026-09-baseline.md` (the table above plus the two `lower(email)` pairs and the 14 phone groups by id).
5. **Admin request auth.** New `apps/admin/src/lib/require-admin.ts`: `requireAdmin(request)` = `verifyMsToken`, then the `users` row by `ms_oid` with the `ilike` email fallback exactly as `auth/me/route.ts:64-86`, then `user_type in ('admin','teacher')`; accepts `test_` tokens when `NODE_ENV !== 'production'` the way `apps/nexus/src/lib/ms-verify.ts` does. Apply first to `crm/alumni/[id]/{merge,duplicate,personal}`, `crm/users/[id]/disable`, delete, graduate and set-program routes; use the returned id instead of body `adminId`. Then extend to every mutation route under `apps/admin/src/app/api` in one sweep.
6. **Admin E2E** (`tests/e2e/*admin*.spec.ts`): send `Authorization: Bearer <test token>` from the nexus test-login response on admin API calls.
7. **Dashboard.** `apps/admin/src/components/DashboardStats.tsx:84-114` fetches `/api/stats` (`apps/admin/src/app/api/stats/route.ts`) with a skeleton; the four literals go.

Tests: Vitest `require-admin.test.ts` (401 without header, 403 for a student, test token accepted off-prod); merge POST route test mocking `@neram/database` like `apps/nexus/src/app/api/auth/me/route.test.ts:31-40`; `DashboardStats.test.tsx` with `fetch` mocked; Playwright `admin-chrome --no-deps` smoke that `/` renders numbers from `/api/stats`.

### E1a. Identity foundation, no UI (L; packages/; batch B)

Goal: a sign-in with Google, phone or Microsoft always lands on the existing person when one exists, never overwrites another provider's id, and every provider id is recorded once.

Manual pre-step (MCP, prod then staging): merge the two `lower(email)` pairs through the existing admin merge flow (they are the pairs named in `packages/database/scripts/merge-orphans-2026.md:72-77`).

Migrations:
1. `20261009090000_user_identities.sql`: `user_identities(id, user_id FK cascade, provider CHECK IN ('firebase','microsoft'), provider_uid text, email text, phone text, created_at, last_used_at, UNIQUE(provider, provider_uid))`, index on `user_id`, RLS on with service-role only; backfill from `users.firebase_uid` and `users.ms_oid` (skip `ms_oid LIKE 'parent:%'`); `NOTIFY pgrst`.
2. `20261009090100_users_email_lower_unique.sql`: a `DO` block that raises with the offending addresses if `lower(email)` collisions remain (fail loudly, like the self-test in `20260910110000:143-217`), then `CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email))` (1,940 rows, plain index, no `CONCURRENTLY` because `db push` wraps files in a transaction).
3. `20261009090200_user_merge_log.sql`: `user_merge_log(id, winner_id, loser_id, loser_snapshot jsonb, repointed jsonb, merged_by, merged_at, source)`; `CREATE OR REPLACE FUNCTION merge_user_records` copied from `packages/database/supabase/migrations/20260628141000:152-269` with the INSERT placed before the `DELETE FROM users` at line 229; also mark any `user_duplicate_candidates` row for the pair `merged` once M1b adds that table (guard with `to_regclass`).

Code:
- New `packages/database/src/queries/identity.ts`: `resolveIdentity(client, { provider, providerUid, email?, phone?, phoneVerified?, name?, hints?, allowCreate?, dryRun? })` returning `{ user, matchedBy, created, linkedAlias }`. Order: `user_identities(provider, provider_uid)`; `users.firebase_uid` or `ms_oid` (legacy); verified phone via `getUserByPhone` (`users.ts:81`, already tries three formats); `lower(email)` across `email`, `personal_email`, `linked_classroom_email` with `escapeIlike` (`ms-identity.ts:76-78`); Microsoft branch keeps the Graph hint steps of `reconcileMsIdentity`; otherwise create when `allowCreate`. On a match by phone or email: insert the alias; set `users.firebase_uid` or `ms_oid` only when null, never overwrite. A match whose column already holds a different uid for the same provider creates the new row and records the pair for M1b (until then, writes `metadata.possible_duplicate_of`).
- `packages/database/src/queries/users.ts:235-331`: `getOrCreateUserFromFirebase` becomes an adapter returning the same `{ user, isNewUser }` (callers: app `register-user/route.ts:68-74` uses `isNewUser` to gate first-touch and drip; `verify-phone/route.ts:63-69`; `exchange-token/route.ts:41-47`; marketing `verify-phone/route.ts:72-78`). `getUserByEmail` (44-62) switches to `ilike`.
- `packages/database/src/queries/ms-identity.ts:85-172`: adapter mapping `matchedBy` to the existing `MsReconcileAction` strings and `linked` (callers: nexus `auth/me/route.ts:93-101`, admin `sync-entra/route.ts:190-205,345-360` which builds labels from `action`, `apps/nexus/src/lib/directory-enrollment-store.ts:85-98`).
- Admin `auth/me/route.ts:45-86`: call `resolveIdentity` with `allowCreate: false` for the Microsoft branch (keeps "never creates").
- `packages/database/src/queries/index.ts`: export `identity`.

Tests: Vitest `identity.test.ts` with a chainable fake client (pattern `me/route.test.ts:21-29`): phone-only Firebase uid then Google uid resolve to one user with two aliases and `firebase_uid` untouched; case-variant email matches; `allowCreate: false` returns null; `dryRun` writes nothing; the four false positives recorded on 2026-07-12 are never matched. Adapter snapshot tests: both return shapes and `MsReconcileAction` strings unchanged. Route tests: app `register-user` (`isNewUser` true only on create; first touch and drip scheduled once), nexus `/api/auth/me` (first-login link). Playwright: `app-chrome` Firebase sign-in then `register-user` 200; `nexus-chrome` test-login then `/api/auth/me` 200; `admin-chrome` `/api/crm/alumni/[id]/duplicate` preview.

### E3a. Analytics substrate (M; packages/ + app + marketing; batch B with M1a)

Migrations:
1. `20261009090300_funnel_events_generalize.sql`: `ALTER TABLE user_funnel_events DROP CONSTRAINT chk_funnel; ADD CONSTRAINT chk_funnel CHECK (funnel IN ('auth','onboarding','application','tool','marketing','enrollment','feedback','engagement'))`; `ADD COLUMN session_id text`; index `(event, created_at DESC)`; `CREATE VIEW analytics_events AS SELECT id, user_id, anonymous_id, session_id, source_app AS app_id, event AS event_name, created_at AS event_timestamp, page_url AS page, device_type, browser, os, metadata FROM user_funnel_events`; replace the `WITH CHECK (true)` INSERT policy with service role only. `auth_funnel_summary` and `get_user_last_auth_step` untouched.
2. `20261009090400_users_anonymous_first_touch.sql`: `users.anonymous_id text`, `first_touch jsonb`, `first_touch_at timestamptz`, partial index on `anonymous_id`.

Code:
- `packages/database/src/queries/funnel-events.ts`: widen the `funnel` union, add `session_id`, add `EVENT_LABELS` for the new `object_action` names (`tool_opened`, `tool_completed`, `tool_failed`, `course_page_viewed`, `demo_requested`, `application_started`, `application_completed`, `payment_started`, `payment_completed`, `enrollment_completed`, `feedback_submitted`, `review_consent_given`, `nexus_signed_in`); existing auth names stay. Types in `packages/database/src/types/index.ts`.
- `packages/database/src/queries/tools.ts:291-315`: `logToolUsage` takes a Supabase uuid; new `logToolUsageForFirebaseUid(uid, ...)` resolves via `getUserByFirebaseUid` and always uses the admin client. Switch `apps/app/src/app/api/tools/{college-predictor,rank-predictor,josaa-predictor,exam-centers,college-predictor/counseling}/route.ts` to it and emit `tool_completed` (funnel `tool`).
- Anonymous id: new `apps/marketing/src/lib/anon-id.ts` (random uuid cookie `neram_anon_id`, one year, root domain via `attributionCookieDomain` from `attribution.ts:58-62`, SameSite Lax); wrap `apps/marketing/src/middleware.ts` (next-intl `createMiddleware`, lines 4-13) to set it only when absent; mirror the client helper in `apps/app/src/lib/anon-id.ts` (app has no middleware; set at tracker init). Both trackers (`apps/app/src/lib/funnel-tracker.ts:62-69`, `apps/marketing/src/lib/funnel-tracker.ts:71`) send the cookie id and a sessionStorage `session_id`; the device fingerprint stays only for `user_device_sessions`.
- Ingest: `apps/app/src/app/api/funnel-events/route.ts:57-73` and the marketing equivalent pass `session_id` through; keep the 50-event cap.
- First touch: `apps/app/src/app/api/auth/register-user/route.ts` accepts `anonymous_id` and `attribution` in the body (the client already holds the `neram_attribution` cookie); on `isNewUser` writes `anonymous_id`, `first_touch`, `first_touch_at` and calls the already-imported `linkAnonymousEvents` (line 12). The caller in `apps/app/src/app/(protected)/layout.tsx` sends both cookie values.

Tests: Vitest for `anon-id` (creates once, reuses), tracker (cookie id, session id, batching), funnel-events route (accepts `tool`, rejects an unknown funnel), tools route (helper called with a uuid and the admin client), register-user (first touch written once). Playwright `marketing-chrome`: first visit sets `neram_anon_id`; a course page view posts to `/api/funnel-events` (route intercept). `app-chrome`: run a tool, assert a `tool_usage_logs` row via the service key.

### E2. Lifecycle and activity read model (M; packages/; batch C)

Goal: one query answers "who is this person and where are they" for every user, including Microsoft-only students, while the Leads list keeps showing exactly what it shows today.

Migrations:
1. `20261010090000_user_lifecycle_view.sql`: `CREATE VIEW user_lifecycle_view` (security invoker) over all non-staff `users` with no `firebase_uid` filter, reusing the LATERALs from `20260622000000:102-133` plus the active enrollment in a non-archived classroom (`participation_status`, `dormant_source`, `current_standard`), `user_exam_profiles`, and the derived `account_status`, `lifecycle_stage`, `crm_stage` (the existing CASE from lines 92-101), `engagement`, `has_firebase`, `has_microsoft`, `nexus_access`, learner columns. Then, if `get_pipeline_stage_counts` exists (`pg_proc`), drop it (`crm.ts:269-302` falls back to counting rows). `DROP VIEW user_journey_view; CREATE VIEW user_journey_view AS SELECT * FROM user_lifecycle_view WHERE has_firebase;` re-GRANT to anon, authenticated, service_role; `NOTIFY pgrst`. Self-test in a `DO` block: a synthetic Microsoft-only user appears in the new view and not in the old one, then rolled back.
2. `20261010090100_users_last_meaningful_activity.sql`: `users.last_meaningful_activity_at timestamptz`, `last_meaningful_activity_source text`, partial index; `CREATE FUNCTION refresh_user_meaningful_activity()` as one `UPDATE ... FROM` over a UNION of `last_login_at`, `nexus_last_login_at`, `nexus_sign_in_events`, `user_funnel_events` (status completed), `drawing_submissions`, `payments`, `user_profile_history` (change_source user), `tool_usage_logs`, `nexus_attendance`, `callback_attempts` (talked); one backfill call; `cron.schedule('refresh-user-activity', '15 21 * * *', ...)` inside `DO $$ IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')` so local Supabase does not fail. No Vercel invocation.

Code:
- `packages/database/src/queries/crm.ts:54-218`: `listUserJourneys` reads `user_lifecycle_view`, gains filters `lifecycle_stage`, `engagement`, `identity` (has_firebase / has_microsoft); remove the redundant `is_disabled` re-fetch at 193-212. `getPipelineStageCounts` and `getLeadPipelineStageCounts` unchanged apart from the source. `apps/admin/src/app/api/crm/leads/route.ts:51` defaults `has_firebase = true` so the Leads list is unchanged.
- New `packages/database/src/utils/lifecycle-rules.ts`: pure `deriveAccountStatus`, `deriveLifecycleStage`, `deriveEngagement(lastActivityAt, createdAt, today)`; the SQL and the TypeScript must agree (same pattern as `computePipelineStage`, `crm.ts:614-645`).
- `packages/database/src/types/index.ts`: `UserJourney` gains the new columns; add `LifecycleStage`, `EngagementState`.
- Retire legacy flags from code: `apps/admin/src/app/api/stats/route.ts:31,80`, `apps/nexus/src/app/api/users/search/route.ts:48`, `packages/database/src/queries/auto-messages.ts:233`, `packages/database/src/queries/device-registration.ts:302,359` (replace `.eq('status','active')` with `is_disabled = false`); `crm.ts:2002` and `apps/nexus/src/app/api/students/route.ts:370,409` (drop `nexus_access_enabled`).

Tests: Vitest table-driven tests for `lifecycle-rules.ts` with `today` injected (as `apps/nexus/src/lib/inactivity-score.ts:39-66` does) covering archived student, alumni with an active enrollment, disabled lead, Not started, Paused; the migration self-test; route test that `/api/crm/users` response shape is unchanged; Playwright `admin-chrome`: `/crm` lists the same first page, `/crm?identity=microsoft` shows a Microsoft-only student.

### E1b. Duplicate sweep and Duplicates queue (M; admin only; batch C or D)

- Migration `20261011090000_user_duplicate_candidates.sql`: `user_duplicate_candidates(id, user_a, user_b` ordered a<b with UNIQUE pair, `reason` (same_phone | same_email | entra_upn | entra_other_mail | name_phonetic | application_form | signin), `confidence` (strong | likely), `status` (open | merged | dismissed), `detected_by`, `detected_at`, `resolved_by`, `resolved_at`, `note)`; seed `dismissed` rows from `nexus_application_form_dismissals`; keep that table until M4 reads candidates instead.
- Sweep: `apps/admin/src/app/api/cron/identity-sweep/route.ts` (daily; admin has one Vercel cron today; reuse the check at `auto-first-touch/route.ts:33-39`). Cheap SQL pass first (`lower(email)`, 10-digit phone core, `personal_email`, `linked_classroom_email`), then Graph only for `@neramclasses.com` rows with `ms_oid IS NULL` via `findUserOidByEmail` (`user-merge-detect.ts:104`). Detectors move to `packages/database/src/queries/duplicate-detection.ts` as pure functions with the Graph calls injected (small packages change; ride batch C).
- Screen: Admin `/duplicates`. Rules (ui-ux-pro-max, reviewed at 375 and 1280 px): a list of pair cards, not a wide table (reason chip, confidence as text plus icon, two names, detected date); Review opens the side-by-side KEEP / DELETE / AFTER preview that `MergeDuplicatePanel` already draws with `preview_user_merge`; Merge is destructive, so it shows the reference counts, asks for a typed confirmation, disables the button with a spinner while the RPC runs, and ends with a success row linking the survivor; Dismiss asks for a one-line reason; skeleton rows while loading; 44 px targets with visible focus rings; `@neram/ui` theme only; Back returns to the list with the filter kept. Nexus Needs attention "may have two records" links to the same candidate ids.
- Tests: Vitest for the detectors (the 2026-07-12 false positives must not be proposed; format-variant phones must be); sweep route test; Playwright `admin-chrome --no-deps` read-only render of `/duplicates`.

### M3b, M4, M5, M7, M6, M8 (scope only; each gets its own detailed plan when picked up)

- **M3b**: instrument marketing course pages (beacon), demo and callback forms, `payment/create-order` and `payment/verify`, `nexus-enroll`, `app_feedback`; `tool_usage_summary` view; stage-to-stage conversion in `auth_funnel_summary`; dashboard cards read both server-side.
- **M4**: `getUser360(userId)` in `packages/database` plus a `user_timeline` union view (`user_profile_history`, `callback_attempts`, `auto_messages`, `nexus_notification_deliveries`, `nexus_enrollment_history`, `nexus_enrollment_classification_events`, `user_funnel_events`, `payments`, `nexus_sign_in_events`, `user_merge_log`); render in admin `/crm/[id]` and Nexus `students/[id]` per the screen rules above; delete `/leads/[id]`; wire `UsersTable` column filters to `listUserJourneys`.
- **M5**: `users.crm_owner_id`; due-today follow-ups view over `callback_requests`; `recordUserHistory` for dead lead, irrelevant, disable, enable, delete; conversion metrics.
- **M7**: `site_settings` key `lifecycle_rules` (join reminder days, not-started decision days, inactive days, dormancy suggestion days, deactivation grace) with a real admin `/settings` page; daily pg_cron sweep writing a suggestions table (dormant, archive, deactivation, alumni transition), never acting; rollover graduates the finished batch; one `deactivateUser` door = `is_disabled` + existing `offboardMicrosoft`, audited.
- **M6**: `testimonials.user_id`, `student_results.user_id` (nullable); `testimonials.publication_status` (private | pending_moderation | approved | published | rejected | withdrawn), `consent_given_at`, `consent_by` (self | guardian), `consent_display_name`; learner testimonial form in app and Nexus; `app_feedback.topics text[]`; `learner_outcomes_view` (alumni exam fields, `student_results`, `nexus_exam_results` with a verification state); moderation queue in admin `/testimonials`; one cached `getAggregateRating()` replacing the three literals.
- **M8**: `/reviews`, `/reviews/{nata,jee,tools,classes}`, `/learner-stories` as ISR pages over published rows; Review and AggregateRating JSON-LD from data; `noindex` until the consented volume is honest; `/alumni` stories from the database; location pages only where real reviews exist.

---

## Part F. Definition of done for version 1 (spec section 58, mapped)

From Admin `/crm/[id]` or Nexus `students/[id]` an admin can:
- find any user, including Microsoft-only students (M2)
- see how they registered and which identities are verified (M1a)
- see learner profile, target exams and year without exams being products (M2)
- see lifecycle stage, engagement, enrollment and access (M2, M4)
- see recent meaningful activity and one merged timeline (M2, M4)
- see CRM stage, owner and follow-ups (M5)
- see feedback, outcome and review consent (M6)
- see audit history including merges (M1a, M5)
- identify incomplete profiles, duplicate accounts, signup and OTP failures, dormant users and users approaching deactivation (M1b, M2, M3, M7)

Each milestone ends with: type-check and lint for the touched apps (with `--force`, no pipes), `pnpm test:run` green, the relevant Playwright project, a ui-ux-pro-max review of any new screen at 375 and 1280 px, migrations applied to staging then prod by MCP with the ledger stamped, and no deploy until asked.

## Not verified (carry into M0)

- Vercel Pro cron limit per project and any edge protection in front of `admin.neramclasses.com`.
- The staging ledger and extensions (only prod was queried).
- Whether the anon key can read a `security_invoker` view over `users` under current RLS (matters if any client-side code reads the view).
- Firebase-side count of phone-only uids (needs a Firebase export).
- Whether the zero rows in `tool_usage_logs` come from the uid type or the anon-client policy; both are fixed in M3a.
