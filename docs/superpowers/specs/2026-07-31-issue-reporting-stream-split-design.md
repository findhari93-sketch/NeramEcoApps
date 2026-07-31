# Issue Reporting Stream Split, Design

**Date:** 2026-07-31
**Status:** Implemented 2026-07-31. Not committed, not deployed, migration not yet applied.
**Touched:** `apps/app`, `apps/admin`, `packages/database`, one root migration
**Not touched:** `apps/nexus`, `apps/marketing`

> **Build cost note.** Adding columns to `support_tickets` forces a type regeneration in
> `packages/database`, and `createSupportTicket` lives there too. Touching a shared package rebuilds
> all four Vercel projects. This is unavoidable for a schema change and is called out here so the
> deploy cost is not a surprise.

## Problem

Ticket NXS-0110 ("For my cut which college suitable") appeared in the Nexus staff inbox at
`/teacher/issues`, attributed to `eswari muthusamy`, a user with no Nexus access. Staff could not
explain how a non-Nexus user filed a Nexus issue, and suspected an impersonation or a
"View as student" session had created it.

### Root cause

No impersonation occurred. The chain was:

1. On 2026-07-25 09:00 UTC she signed into `app.neramclasses.com` with Google.
   Her `users.last_login_at` is 09:02, the same session.
2. `apps/app/src/app/(protected)/layout.tsx:403` mounts `ReportProblemFab` on **every**
   authenticated page. Its only condition is a valid Firebase session
   (`ReportProblemFab.tsx:28` hides it on `/support` and nowhere else). Enrollment is never checked.
3. She was on `/tools/counseling/college-predictor`, tapped the floating bug button, and typed a
   counseling question.
4. `POST /api/error-reports` verified her Firebase token and resolved her by `firebase_uid`.
   That route has no enrollment check either.
5. It inserted into `nexus_foundation_issues` with `source_app='app'`, which is the shared staff
   inbox, so it surfaced in Nexus as NXS-0110.

Her prod record: `user_type='lead'`, `is_alumni=false`, `ms_oid=NULL`, `nexus_access_enabled=false`,
zero `nexus_enrollments`, `nexus_first_login_at=NULL`. She has never signed into Nexus and cannot,
because Nexus is Microsoft-only login and she has no Microsoft identity.

### Why the report looked like it came from Nexus

`apps/nexus/src/app/(teacher)/teacher/issues/page.tsx:765` renders the source chip
(`app: app` / `app: nexus`) **inside** the collapsed `Technical details` block. Staff never saw it.

### Scale of the exposure

| Population | Count |
|---|---|
| Users with a Firebase login and `user_type='lead'` | 1,606 |
| Users with an active student enrollment | 47 |

All 1,606 currently see the bug button. She is the first to press it, not the only one who could.

## Goals

1. Nexus `/teacher/issues` contains **only** reports filed inside Nexus.
2. Only students who are part of a class can file a bug report from the student app.
3. Reports from the student app still reach staff, in a queue built for them.
4. Leads keep a way to contact the company. They are prospective customers, not spam.

## Design

### Two streams that never cross

| Filed in | Writes to | Staff read it in |
|---|---|---|
| Nexus | `nexus_foundation_issues` | Nexus, `/teacher/issues` |
| Student app | `support_tickets` with `source_app='app'` | Admin, `/support-tickets` |

The app-to-Nexus bridge is retired outright. Nexus's inbox becomes nexus-only **by construction**,
not by a UI filter a future change could quietly undo.

### Eligibility rule

A user may file a bug report from the student app only if they hold a `nexus_enrollments` row with:

```
role      = 'student'
is_active = true
```

`participation_status` is deliberately **ignored**, matching the existing product rule that dormancy
drops a student from monitoring but never removes their access. Today that is 47 people: 45 active
plus 2 on break year. The 237 `is_active=false` student rows (graduated and removed) are excluded,
as are all leads.

Non-enrolled users keep the `Support` entry already present in both the sidebar and bottom nav
(`apps/app/src/lib/navigation-data.tsx:73` and `:87`), which writes `support_tickets` through the
existing `/support` flow.

**Net effect, stated plainly so it is not misread later.** A lead can still create a `support_tickets`
row by using `/support`, and that was the deliberate choice: they are prospective customers and
should not be silenced. What the gate removes is the one-tap bug FAB with its automatic screenshot,
console logs and device capture. Combined with the stream split, the guarantee staff actually get is:
**no non-enrolled user can put anything into the Nexus teacher inbox, ever.**

### Enforcement layers

The server gate is the security boundary. The client gate exists only so nobody is shown a button
that will fail. Hiding the button alone would not be a fix, because the endpoint is callable directly.

## Changes

### 1. Database, one migration in root `supabase/migrations/`

Add to `support_tickets`:

- `console_logs jsonb`
- `device_info jsonb`

Without these, moving the app's reports to `support_tickets` would silently drop the auto-captured
diagnostics that make a bug report actionable. `screenshot_urls` and `page_url` already exist.

### 1b. `packages/database`

- Regenerate types so `database.generated.ts` carries the two new columns. Note that
  `database.generated.ts` is the real `Database` type, not `supabase.ts`.
- Extend `createSupportTicket` and its input type in `src/queries/support-tickets.ts` to accept
  `console_logs` and `device_info`. Both optional, so no existing caller changes.

### Category handling, decided

`nexus_foundation_issues` and `support_tickets` use **different** category enums:

| Bug FAB today (`FoundationIssueCategory`) | `support_tickets` (`SupportTicketCategory`) |
|---|---|
| bug, content_issue, ui_ux, feature_request, class_schedule, other | enrollment_issue, payment_issue, technical_issue, account_issue, course_question, other |

**Decision: change the bug dialog to offer the `support_tickets` categories directly**, rather than
writing a lossy mapping between the two. A mapping would collapse distinct options onto the same
target (`bug` and `ui_ux` both land on `technical_issue`) and would leave Admin's existing category
filters showing values the reporter never picked. Changing the options at source keeps one enum end
to end and makes Admin's filters correct with no extra work.

This is the one user-visible wording change in this spec: students filing a bug will see the six
support categories instead of the six foundation categories.

### 2. `apps/app`

**New: `src/lib/enrollment.ts`**

```
isEnrolledStudent(userId: string, adminClient): Promise<boolean>
```

Single source of truth for the eligibility rule above. Kept local to `apps/app` rather than placed in
`packages/database` on purpose: only this app needs it, and touching a shared package triggers a
rebuild of all four Vercel projects.

**`src/app/api/error-reports/route.ts`**

- After resolving `dbUser`, call `isEnrolledStudent`. If false, return `403 { error: 'not_enrolled' }`
  and insert nothing.
- Replace the `createFoundationIssue` call with `createSupportTicket` from `@neram/database`, the
  same helper `/api/support-tickets` already uses. It generates `ticket_number` itself. Pass
  `subject` from `title`, plus `description`, `category`, `page_url`, `screenshot_urls`,
  `console_logs`, `device_info`, `user_id`, `user_name`, `user_email`, `user_phone`,
  `source_app='app'`.
- Switch the staff notification from `foundation_issue_reported` to `ticket_created`, which is what
  `apps/app/src/app/api/support-tickets/route.ts:100` emits and what the Admin sidebar badge counts.
- Mirror the rest of that existing route's behaviour so a bug report is confirmed the same way a
  support ticket is: the non-blocking `sendTemplateEmail(..., 'ticket-confirmation', ...)` and the
  WhatsApp confirmation guarded by `isWhatsAppConfigured()`. Both already fail soft.

**`src/app/api/error-reports/upload/route.ts`**

- Same enrollment gate. Without it a lead could still push files into the shared bucket even with the
  button hidden.

**`src/app/api/auth/register-user/route.ts`**

- Return `is_enrolled_student` on the user payload.

**`src/app/(protected)/layout.tsx`**

- The layout already fetches this user and holds it in `supabaseUser`, so this adds **no** new
  per-page request. Expose `is_enrolled_student` through a small context provider.

**`src/components/ReportProblemFab.tsx`**

- Return `null` when the user is not an enrolled student.

**`src/components/ReportProblemDialog.tsx`**

- Swap the category options to `SupportTicketCategory` per the decision above.

**`src/app/(protected)/error.tsx`**

- Line 80 renders its own `ReportProblemDialog` on a crash. Gate it identically and show a
  "Contact support" link to `/support` instead.

### 3. `apps/admin`

**`src/app/(dashboard)/support-tickets/page.tsx`**

- Add a source chip (app / nexus / marketing) to each ticket.
- Add a Technical details section rendering `device_info` and `console_logs`.
  Screenshots already render at line 503.

### 4. `apps/nexus`

**No changes.** Verified both Nexus reads of `support_tickets` are already scoped and cannot surface
an app ticket:

- `src/app/api/dashboard/teacher/route.ts:60-65` counts only `assigned_to = user.id`.
- `src/app/api/tickets/route.ts:43-49` filters teachers by classroom, students by own `user_id`.

The previously discussed change to surface the source badge in the Nexus ticket header was
**dropped**. Once app reports stop reaching `nexus_foundation_issues`, every row there is `nexus`
apart from the single historical NXS-0110, so the badge would carry no information. Leaving
`apps/nexus` untouched also keeps the deploy to two apps.

## Testing, as built

The student app authenticates with Firebase and has **no test-login route**, unlike Nexus. A
Playwright run therefore cannot mint a token for an enrolled student, so the gate is proven at the
route level instead of through a browser. Coverage landed in three places, 22 tests.

**`apps/app/src/lib/enrollment.test.ts`, 8 tests.** The rule itself, against a fake client that holds
real rows and applies the filters, so an implementation that started filtering
`participation_status` would turn the break-year test red: active student true, dormant student
true, `is_active=false` false, teacher false, no rows false, different user false, query error false
(fails closed), reads `nexus_enrollments`.

**`apps/app/src/app/api/error-reports/route.test.ts`, 9 tests.** The route with the real enrollment
rule wired in: 403 with no enrollment, 403 for an inactive enrollment, 201 for an enrolled student
writing `source_app='app'`, **never touches `nexus_foundation_issues`**, absolutises screenshot
paths, falls back to subject when details are blank, coerces an unknown category, 401 without an
Authorization header, 400 without a title.

Both suites were written after the implementation, so each was verified by mutation rather than by
being watched fail first: disabling the enrollment gate turns exactly the 2 enrollment tests red,
and adding a `nexus_foundation_issues` read to the route turns the inbox test red. Both mutations
were reverted and the suite is green.

**`tests/e2e/error-reporting-app.spec.ts`, 5 tests.** What is meaningful against a running server:
both write endpoints reject an anonymous caller and an invalid bearer token with 401, never 201.

**`tests/setup.ts`** now guards its `window` shims behind `typeof window !== 'undefined'` so a test
file can opt into `// @vitest-environment node`, which an API route test needs.

## Discovered during implementation

**Screenshot paths vs URLs.** The uploader returns a storage *path*, and the Nexus issue view
prefixed the bucket URL when rendering. The Admin support view renders `src={url}` directly, so
forwarding paths unchanged would have shown a broken image on every app report. The route now
absolutises them before storing, leaving already-absolute URLs alone.

**`GlobalErrorLogger` is unaffected.** It posts to `/api/diagnostics`, not the reporter, so the new
gate produces no 403 spam for non-enrolled users.

**Admin list column.** Beyond the drawer chip in the spec, the ticket table also gained a `Source`
column, since scanning the list is where the original confusion happened.

## Out of scope

- **NXS-0110 is left open.** Staff will close it manually with a resolution note. No prod data is
  written as part of this work.
- `apps/nexus/src/app/api/tickets/route.ts:45` filters on `context->classroom_id`, but
  `support_tickets` has no `context` column, so that query likely errors into the route's 401 catch.
  Pre-existing and unrelated. Noted here only so it is not mistaken for fallout from this change.
- No deployment. Code changes only, per the standing rule that deploys happen on explicit request.

## Decisions on record

| Question | Decision |
|---|---|
| What do non-enrolled users get instead? | Keep `/support`, lose the bug FAB |
| Who counts as "part of a class"? | All 47 active student enrollments, including the 2 on break year |
| Where do student-app reports land? | Admin Support Tickets, `support_tickets` with `source_app='app'` |
| Keep the enrollment gate after the split? | Yes, enrolled students only |
| Surface the source badge in the Nexus header? | Dropped as moot after the split |
| Two enums, map or switch? | Switch the bug dialog to `SupportTicketCategory`, no lossy mapping |
