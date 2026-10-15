# Demo follow-up cycle and demo enrolment link (Part A)

Date: 2026-10-15. Status: design approved in chat section by section, spec awaiting review.

## Why

Students who attend a demo are the most likely to join, but today nothing follows them up after the demo:

- The admin Follow-ups queue (`crm_follow_ups` view over `callback_requests`) never receives demo attendees.
- The due-callback reminder cron (`apps/admin/src/app/api/cron/callback-reminders`) is not scheduled anywhere, so nobody is reminded. It also has a Telegram key bug (`userName` vs `user_name`).
- To enrol a demo student, staff send a Direct Enroll link that is not tied to any person. Demo students mostly have phone or staff-created accounts, while the link page offers Google sign-in only. The result is a second account, a stuck phone step (marketing `verify-phone` returns 409 for the student's own unverified demo row), and a second `lead_profiles` row. Nothing records that the student joined through a demo.
- Active `direct_enrollment_links` rows (name, phone, email, fees) are readable with the anon key (policy "Anyone can validate active links by token").

This is Part A of three. Part B (conversion and source report, extending `2026-10-14-ads-roi-design.md`) and Part C (demo recordings with silence trim) get their own specs.

## Decisions (owner, 2026-10-15)

1. Order: A (this spec), then B, then C.
2. A follow-up is owned by the person's CRM owner (`users.crm_owner_id`) when set and active. Otherwise the first active person in the follow-up owner order: Tamil Selvan, then Shanthi Manoharan. Hari teaches the demos and manages both, so he owns no follow-ups by default and instead gets a daily team summary (see Reminders). The order is a setting (`site_settings.demo_class.followUpOwnerUpns`, edited in Demo settings with the same staff picker), so it can change without code.
3. Reminders go to the admin bell, Neram Assistant in Teams, Telegram and email, as one morning digest per owner.
4. Five call outcomes: Thinking it over, Will join on a date, No answer, Not interested, Joined.
5. Marking a demo Attended asks for interest level (Hot, Warm, Cold), a note, and the first follow-up date (prefilled 2 days later, 11:00 IST).
6. Reuse the existing Follow-ups queue (`callback_requests` + `callback_attempts` + `crm_follow_ups`), not a new table.
7. Enrolment of a demo student goes through a Direct Enroll link tied to that student's existing account and demo. Completing it counts as joined through the demo.

## 1. Follow-up cycle

### Start

- Marking Attended (desk `attendance` action, or Add demo "Demo already held") requires interest, note and first follow-up date in the same request. It creates or updates the person's open after-demo follow-up: a `callback_requests` row with `query_type = 'post_demo'`, `status = 'scheduled'`, `scheduled_callback_at` = the chosen date, `demo_registration_id` = the demo, `interest_level` = the chosen level, `assigned_to` = the owner (decision 2).
- Marking No-show creates a `query_type = 'demo_rebook'` follow-up due the next day at 11:00 IST, no questions asked.
- One open post-demo follow-up per person: a second demo updates the open row (new demo id, new date) instead of inserting.

### Outcomes

Logged through the existing `recordCallbackAttempt` (`packages/database/src/queries/crm.ts:977`) into `callback_attempts`, extended with the new outcomes.

| Outcome | Next state |
|---|---|
| Thinking it over | next date required; stays scheduled |
| Will join on a date | that date becomes `scheduled_callback_at`; stays scheduled |
| No answer | `scheduled_callback_at` = now + 2 days; after 3 consecutive No answers the row is flagged `hard_to_reach` |
| Not interested | closes (`completed`), reason required |
| Joined | closes (`completed`) as converted; see "Joined by hand" below |

Interest level can be changed on any outcome and is stored on the row (latest value) and in the attempt comment (history).

### Automatic close on enrolment

When a person becomes enrolled (a `student_profiles` row appears, from any path: demo enrol link, normal application payment, staff), their open `post_demo` / `demo_rebook` follow-ups close as Joined with that date. Implemented in the shared enrolment completion code, plus a nightly safety sweep for paths that bypass it.

### Joined by hand

Staff may pick Joined before payment. If no `student_profiles` row exists 14 days later, the follow-up reopens flagged `payment_pending`.

### Reopen

A closed follow-up (Not interested) can be reopened from the person page or the desk; history is kept.

## 2. Enrolment link from a demo

### Sending

- "Send enrolment link" on the demo request panel, on each Follow-ups row, and on the person page (existing `JourneyTab` button).
- It opens the existing `GenerateLinkDialog` prefilled from the person (name, phone without a duplicated +91, email, class) and passes `userId` and `demoRegistrationId`. Staff still enter course, batch, fees and the payment already received, as today.
- `direct_enrollment_links` gains `user_id` and `demo_registration_id`.

### Student side (marketing `/[locale]/enroll`)

- A link with `user_id` shows "Sign in with the number you used for your demo" with phone OTP first (LoginModal full mode), Google second.
- On completion (`apps/marketing/src/app/api/enroll/complete/route.ts`):
  - Signed-in user = `link.user_id`: continue.
  - Signed-in user is a disposable shell (lead, under 24 h, no `lead_profiles`, no payments; the rule in `apps/app/src/lib/adopt-account.ts`): merge it into `link.user_id` with `mergeUserRecords` and continue as `link.user_id`.
  - Otherwise refuse with "Sign in with the number you used for your demo".
- The person's existing `lead_profiles` row is updated to enrolled instead of inserting a second one (insert only when none exists).
- The enrolment records `demo_registration_id` and copies `channel` and `first_touch` from the demo row onto the lead profile, for Part B.
- The open post-demo follow-up closes as Joined.

### Fixes in the same area

- Marketing `verify-phone` adopts the app's rule: only a verified owner blocks a phone (`findVerifiedPhoneOwner`).
- The LoginModal "Sign in with this number" fallback reaches working `adopt-account` and `register-user` routes from marketing (add the routes, or point `apiBaseUrl` at the app).
- Drop the anon SELECT policy on `direct_enrollment_links`; validation already uses the service role.

## 3. Screens

- **Demo classes desk:** Done tab shows interest chip, follow-up status, next date (red when overdue) and a Joined column. The request panel of an attended demo gets an "After the demo" block: interest, latest note, next date and owner, Log outcome, Send enrolment link, and a Watch recording placeholder for Part C.
- **Follow-ups page:** a Type filter (All, After demo, Callback requests). Rows show interest chip, last note, due date, owner and a "Demo on 12 Oct" link, with Call, WhatsApp, Log outcome and Send enrolment link inline. Logging removes the row from Today.
- **Person page:** CRM tab lists the demo and follow-up history. `get_user_timeline` adds "Attended demo" and "Joined through demo" events.
- **Demo settings:** a "Follow-up owners, in order" list (staff picker, up/down to reorder), prefilled Tamil Selvan, Shanthi; and a "Follow-up manager" picker, prefilled Hari.
- No new sidebar items.

All UI starts with the ui-ux-pro-max skill and ends with its review; admin stays desktop-first, the enrol page is checked at 375 px.

## 4. Reminders

- New admin cron, daily 09:00 IST: per owner, follow-ups due today or overdue. One bell item per student; one summary each to Neram Assistant (Teams), Telegram and email (Resend, @neramclasses.com). Teams falls back to the bell while the Assistant chat flag is off.
- Follow-ups with a specific time also get a 15-minute nudge (bell and Teams).
- Manager summary for the follow-up manager (Hari), same 09:00 run, same four channels: per owner, due today, overdue, and done yesterday; Hot students overdue are listed by name; links to Follow-ups with Everyone selected.
- Replaces the unscheduled `cron/callback-reminders`; website callback requests use the same digest. Fix the Telegram key names on the way.
- Leads by channel (`apps/admin/src/lib/lead-channels.ts`) excludes `post_demo` and `demo_rebook` rows from Callback lead counts.

## Data changes (one migration, idempotent)

- `callback_requests`: `demo_registration_id uuid references demo_class_registrations(id) on delete set null`, `interest_level text check (hot|warm|cold)`, `flags text[] default '{}'` (`hard_to_reach`, `payment_pending`); partial unique index: one open `post_demo` row per `user_id`.
- `callback_outcome` enum: add `thinking`, `will_join`, `joined`, `not_interested` (each `ADD VALUE IF NOT EXISTS`, in its own migration file so it can be used afterwards).
- `crm_follow_ups` view: add `demo_registration_id`, `interest_level`, `flags`.
- `direct_enrollment_links`: `user_id uuid references users(id)`, `demo_registration_id uuid references demo_class_registrations(id)`; drop the anon SELECT policy.
- `lead_profiles`: `demo_registration_id uuid` (joined through this demo).
- `get_user_timeline`: "Attended demo" and "Joined through demo" events.
- `site_settings.demo_class.followUpOwnerUpns` (ordered UPN list) and `followUpManagerUpn` (JSON settings, no schema change), resolved by a pure helper next to `pickDemoRoles` in `packages/database/src/utils/demo-schedule.ts`.

## Edge cases

- Two demos, one person: one open follow-up, updated.
- No CRM owner: the first active person in the follow-up owner order (Tamil Selvan, then Shanthi). If the order is empty, the follow-up manager (Hari).
- Enrolled without any link: still closes the follow-up as Joined; "joined through demo" only when an attended demo exists before the enrolment date.
- Staff member leaves (disabled): their open follow-ups move to the next active person in the owner order until reassigned.
- Link opened by another person: refused.

## Testing

- Vitest (pure): outcome to next state, the 3-no-answer flag, owner resolution (CRM owner, owner order, manager fallback, disabled staff skipped), link ownership and merge decision, digest grouping per owner, manager summary counts.
- Staging, via admin API with the test token and `DEMO_TEAMS_DRY_RUN=true`: attend creates a follow-up; outcomes move it; send link, enrol with the demo phone gives one account, follow-up closed, joined-through-demo recorded; a fresh Google shell is merged; a different person is refused.
- Playwright: enrol page at 375 px (no horizontal scroll, 44 px targets); Follow-ups Log outcome flow where admin auth allows.

## Rollout

Staging first; production migrations applied at the founder's deploy command. First real use: Aamna Khan (DEMO-W4X8): record her outcome, send her enrolment link from the demo. The digest starts the morning after deploy.
