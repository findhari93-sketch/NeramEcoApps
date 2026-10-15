# Ads ROI page (Marketing Intelligence)

Date: 2026-10-14. Status: design approved in chat, spec awaiting review.

## Why

The owner pays for Google Ads (₹5,000, then ₹10,000 in October 2026) and wants to see what the money returns. Clicks and Google's conversion count are not the business. The returns are sign-ups, demos, students who join and fees paid. The Ads API is not connected yet (Explorer access pending), so the page must work without it.

## Decisions (owner, 2026-10-14)

1. **A student counts as ad-sourced in two ways, shown side by side and never summed:**
   - **Confirmed:** `users.first_touch` carries a Google Ads click (the existing `isGoogleAdsTouch` in `apps/admin/src/lib/marketing-ai/funnel.ts`).
   - **Said Google ad:** no ad click, but the student's answer to the onboarding question `referral_source` is the new `google_ad`.
   - **Plain `google` answers are not credited.** They are shown per month as an uncredited count, "also said Google search". The owner changed this on 2026-10-15 after prod showed 55 to 60% of new users answer `google` every month, including July to September when no ads ran (74 answers). So `google` mostly means free search results.
2. **Credit goes to the month of ad spend (a cohort).** A student belongs to the month of their first ad click. For "Said Google ad" students it is their sign-up month. Later demos, enrolment and fees roll back to that month, so older months keep growing.
3. **Spend is typed in by hand each month** until the API is connected. Live API spend then replaces it automatically and is marked as coming from Google.

## Data sources (prod, checked 2026-10-14)

| Stage | Source | Link to the student |
|---|---|---|
| Sign-up | `users` that are phone verified (a `user_funnel_events` `otp_verified` row, or `users.phone_verified`) | the user itself |
| Said Google ad | `onboarding_responses` (user_id, question_id, response) joined to `onboarding_questions.question_key = 'referral_source'`; 763 answers so far | user_id |
| Demo booked / attended | `demo_class_registrations` (user_id, phone, status, attended) | user_id, else the last 10 digits of the phone |
| Joined | `student_profiles` (user_id, enrollment_date) | user_id, else the user's phone |
| Fees | `payments` where `status = 'paid'` (amount, paid_at, user_id, student_profile_id) | user_id, or via `student_profile_id` to the user |

- **Only `payments` counts as fees.** Direct-enrolment links already write their payments there (58 of them overlap), so `direct_enrollment_links.amount_paid` and `student_profiles.fee_paid` are not summed, which avoids double counting.
- **Phone matching** catches the same person under a second user row, for example someone who signed up with Google and was later enrolled by staff with a phone-only account.
- **Phone normalisation:** keep the last 10 digits.

## Computation

New module `apps/admin/src/lib/marketing-ai/roi.ts`:
- **Pure core:** `buildRoi(people, spendByMonth)` returns `RoiMonth[]` plus a total. `people` is a list of `{ userId, phone10, tier: 'confirmed' | 'said_google_ad', cohortMonth, demoBooked, demoAttended, joined, feesPaid }`.
- **Loader:** `loadRoiPeople(db, fromMonth)` does the joins in batches of 100 ids (the PostgREST `.in()` length gotcha) and returns `people`.
- **One person, one tier.** Confirmed wins when both apply.
- **Fees:** all paid payments in any month credit the person's cohort month.
- **Return per ₹1** = fees ÷ spend, shown only when spend > 0.
- **Window:** 1 Jan 2026 to today. Earlier months have no click ids, so they would show 0 Confirmed and that would mislead.

**Spend:**
- **Typed values:** settings key `spend_manual` = `{ "2026-10": 6480, ... }` in `marketing_ai_settings`, through the existing `loadSettings` and `saveSettings`. Keys are free-form, so no migration is needed.
- **Live API:** when `GOOGLE_ADS_MODE=live` and `ads_entity_daily` has campaign-level rows for the live customer in a month, their summed cost replaces the typed value. Sample-account rows (customer `1234567890`) never count. The source is then `google`, otherwise `manual`.

## API

`GET /api/marketing-ai/roi`:
- Admin only, via `requireAdminRole`.
- Returns `{ months: RoiMonth[], total, generatedAt }`.
- Each month carries its people list (name, phone masked to the last 4 digits, tier and furthest stage) for the drill-down.
- Cache it per request; it is low traffic.

`PUT /api/marketing-ai/roi/spend` with `{ month: 'YYYY-MM', amount: number | null }`:
- Admin only.
- Validates the month (not in the future, not before 2026-01) and the amount (0 to 10,00,000).
- `null` clears the month.
- Writes to `marketing_ai_audit_log` with event `spend_manual_set`.

## UI

New page `apps/admin/src/app/(dashboard)/marketing-ai/roi/page.tsx`, with a sidebar entry "Ads ROI" after "Ads Overview". Desktop-first, using the `@neram/ui` theme and the OpsUi parts (`OpsPageHeader`, `EmptyState`, `OpsSkeleton`).
- **Month table:**
  - Columns: Month, Spent (with a "typed" or "from Google" chip), Sign-ups, Demos booked, Demos attended, Joined, Fees collected, Return per ₹1.
  - Each count cell shows Confirmed and Said Google ad as two numbers ("2 + 5"), with a legend above the table.
  - A total row closes the table.
- **Drill-down:** clicking a cell opens a side drawer listing the people behind it.
- **Monthly ad spend:** a small form (month picker and amount) with a list of typed months, each editable.
- **Explanatory note:**
  - fees credit the month of the first ad click, so recent months grow over time
  - "Said Google ad" is the student's own answer, and plain Google search answers are shown but not credited
- `/ui-ux-pro-max` runs before the build and reviews the finished page.

## Onboarding option

A migration appends `{"value":"google_ad","label":"Google ad (Sponsored result)","label_ta":"கூகுள் விளம்பரம்","icon":"campaign"}` to `onboarding_questions.options` where `question_key = 'referral_source'`, placed after the `google` entry. Existing answers are untouched. The app renders options from the table, so no app code changes.

## Testing

- **`roi.test.ts`:**
  - cohort month assignment
  - Confirmed beats Said Google ad; a plain google answer is counted in alsoSaidGoogle, never in a tier
  - phone matching across two user rows
  - fees in a later month credit the cohort
  - no double count across payment rows
  - return per ₹1 is hidden at zero spend
  - live spend overrides typed spend
- **Route tests:**
  - non-admin gets 403
  - spend validation for a future month and a negative amount
  - the audit log row is written
- **Manual:** run `/api/marketing-ai/roi` against prod data. October should show 2 Confirmed sign-ups and 1 Confirmed demo, matching the checks above.

## Out of scope

- Sending fee values to Google Ads (offline conversion values for value-based bidding). This waits for dozens of paid students from ads.
- Staff tagging the source on enrolment links.
- ROI for channels other than Google Ads.
