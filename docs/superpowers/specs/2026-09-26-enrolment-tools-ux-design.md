> Repo copy of the approved plan (2026-09-26). Private plan file: ~/.claude/plans/apps-marketing-docs-v2-neram-neram-ecos-gentle-newt.md

# Plan: Enrolment and Tools UX architecture (spec versus code, and Phase 1 build)

Source spec: `apps/marketing/Docs/v2-neram/Neram_Ecosystem_Enrollment_and_Tools_UX_Architecture.md` (written outside the repo, 2026-09-26).
Comparison basis: three read-only sweeps (apply flow, payments and provisioning, tools and identity), one implementation-design pass over the working tree, and the approved lifecycle plan in `apps/marketing/Docs/v2-neram/Neram_Lifecycle_Architecture_Comparison_and_Plan.md`. Line numbers are from the working tree (several of these files are already uncommitted).

## Context

The spec asks for a self-service enrolment: a focused application shell, Nera as a voice copilot, optional document autofill, a standard fee shown before payment, payment verified server-side, enrolment created by payment, then automatic Microsoft, Teams and Nexus provisioning with admin reduced to exception handling. It also positions Neram Tools as a separate public product with subscriptions and entitlements, and asks for a Tools Admin.

Today a student applies, waits for an admin to approve and type a fee, pays through a browser callback with no webhook, gets a student profile, and then waits for staff to create a Microsoft account by hand, publish a plaintext password, grant Nexus and add them to Teams, one button each. The spec's diagnosis is right. Most of the parts it needs already exist as building blocks: an idempotent payment claim, a six-step Entra account routine in Nexus, Graph helpers for licences and Teams, a Web Speech hook in five languages, Gemini vision through `@neram/ai`, and Nexus access that is just a row in `nexus_enrollments`.

### Decisions taken (founder, 2026-09-26)

| Decision | Choice |
|---|---|
| Scope | Phase 1 (Classes enrolment) in detail. Tools, subscriptions and entitlements: roadmap and data-model sketch only, own spec later. |
| Provisioning | Fully automatic after verified payment, with retries. Admin handles failures in one exception queue. |
| Tools home | Neram Tools stays `apps/app`. Tools Admin becomes a section of `apps/admin`. Question bank authoring stays in Nexus; content gets an access level. No fifth app. |
| Standard fee | Any applicant pays the `fee_structures` price immediately, no approval. An admin-set fee on `lead_profiles` still wins when present. Coupons stay, server-validated. |

### Decisions taken in this plan (my calls, stated so they can be overridden)

| Topic | Choice | Why |
|---|---|---|
| Application shell | A pathname-gated `SiteChrome` client component inside `[locale]/layout.tsx`, not route groups | Route groups would move 200+ pages in a working tree other sessions share, with 209 files already uncommitted. Same visual result, zero file moves. |
| Nera engine | Browser Web Speech API (`useSpeechToText`, exists) for voice, typed text as an equal path, one Gemini structured-extraction route through `@neram/ai` for both | Free, client-side, five Indian languages, already shipped for Aintra. Most iOS Safari has no Web Speech, so typing and document upload are first-class, not fallbacks. |
| Scripted Nera bot | Retired on marketing (`ChatAssistant.tsx`); `packages/ui` ChatWidget stays because the app's duplicate apply page still mounts it | Its skip logic reads the wrong data shape; the extraction sheet replaces it with one path. Leaving `packages/ui` alone avoids a rebuild. |
| Document autofill | Multipart upload to a marketing route, validated by magic bytes, sent to Gemini vision in memory, never written to any bucket | Lets the privacy copy be literally true: read once, not stored. |
| Steps | 1 About you, 2 Your course, 3 Review, 4 Pay and enrol | Matches the spec. The academic block becomes a compact "Your studies" group inside step 2, next to the programme picker it informs. |
| Programme picker | Step 2 lists the active `fee_structures` rows for the chosen course as cards (name, duration, fee) | `program_type` (year_long, crash_course) is what prices a course and the form never asks it today. This is the "exact course, exact duration, exact fee" the spec wants. |
| Fee quote | A server `quote` route computes what is payable; the client never does fee maths | One source of truth for step 4, the returning-user dialog and the public `/pay` page. |
| Provisioning worker | A `packages/database` state-machine runner with injected ports, driven by an admin Vercel cron every 5 minutes plus an immediate kick after payment | Admin already holds the Graph app-only secret, `CRON_SECRET`, two crons and an exempt `/api/cron/*` path in its new middleware. Marketing stays free of Graph. |
| Entra code | `apps/nexus/src/lib/entra-accounts.ts` and the pure parts of `student-account-rules.ts` move to `packages/auth`; Nexus keeps one-line re-exports | Admin and the worker need them; the "Nexus-local on purpose" note predates a second caller. |
| Temporary password | Sealed at rest (AES-256-GCM, server key) in the existing `student_credentials`, revealed only in the student app onboarding card behind the student's own sign-in, 24-hour destroy clock from first view, 7-day unread ceiling, forced change at first Microsoft sign-in | Never in email, WhatsApp, logs, job events or Telegram. Messages carry the login ID and a link. If support load shows students cannot find it, a settings toggle can add the password to the WhatsApp text later. |
| Identity ring | Student ID stays `student_profiles.student_id` (NRM-YYMM-#####); application number stays `lead_profiles.application_number` | Both exist with triggers. The spec's NC26-001284 is a format, not a requirement. |
| Rollback lever | `site_settings` key `self_service_payment` `{ enabled }` read by the quote route and step 4 | Turns the standard-fee path off without a deploy; the admin-fee path keeps working. |
| i18n | New apply components take next-intl keys from day one; English and Tamil written now, Hindi, Kannada and Malayalam carry English until translated | The current wizard is hard-coded English and its keys are unused. |

### Constraint the spec does not know

`git status` shows 209 uncommitted files from the lifecycle work (M0 to M8) with 12 migrations on staging only. This plan depends on parts of it: `resolveIdentity`, the analytics taxonomy with `payment_*` and `enrollment_completed`, the admin API middleware, User 360. **Commit the lifecycle work as its own commit before sub-project A starts**, so the two efforts stay separable. Several files this plan edits are already dirty (`[locale]/layout.tsx`, both payment routes, `ChatAssistant.tsx`, `AuthProvider.tsx`, all five `messages/*.json`); edit them in place, never checkout or stash. New migrations sort after `20261015090000`.

---

## Part A. Correlation: spec section by section

Verdict legend: **Have** (exists, wire it), **Adapt** (the idea, on top of what exists), **Adopt** (build as specified), **Defer** (Phase 2 or later).

| Spec section | What runs today | Gap | Verdict |
|---|---|---|---|
| 5, 12, 13, 14 Application shell, three or four steps, no marketing chrome | `[locale]/apply` renders inside the full layout (`[locale]/layout.tsx:169-178`): banners, 1169-line Header, Footer, sticky widget, comparison tray, Aintra chatbot. Three floating buttons at once on `/apply`. Wizard: Personal, Academic, Course, Review (`components/apply/types.ts:209-214`). | No shell; steps named after database sections. | **Adopt** (A) |
| 6 Existing user recognised, prefilled; new user not forced to sign in first | Prefill from the app's `/api/profile`, `/api/onboarding/prefill`, a Google displayName split, GET `/api/application` (`FormContext.tsx:506-764`); `ApplicationDashboard` "Welcome back, {name}!" | The banner asks for login up front; the displayName split guesses a father's name. | **Adapt** (A) |
| 7 Nera as an application copilot with voice | `ChatWidget` + `applicationFlow.ts`: scripted, no AI, no voice, skip conditions read nested data while receiving flattened data. `useSpeechToText` (en, ta, hi, kn, ml) exists for Aintra only. | Extraction and voice. | **Adopt** (B) |
| 8 Document autofill, optional, honest privacy copy | None anywhere. Precedent: `apps/nexus/src/lib/exam-recall-ai.ts` (Gemini vision); `ImageUploadField` in `@neram/ui`. | Whole feature. | **Adopt** (B) |
| 9 Father's name required | Field exists, required. | None. | **Have** |
| 10 Stable IDs | `student_profiles.student_id`, `lead_profiles.application_number`, receipt number, all by trigger. | Format only. | **Have** |
| 11 PIN lookup editable, location detection secondary | `/api/pincode/[code]` with a 30-day cache; City and State lock with a pencil. Geolocation runs on mount (`PersonalInfoStep.tsx:54-133`). | Geolocation is primary today. | **Adapt** (A) |
| 15, 16 Standard pricing from configuration; discounts as exceptions | `fee_structures` (course_type, program_type, fee_amount, single_payment_discount, installment amounts, combo_extra_fee) shown on `/fees` only. Payment needs `lead_profiles.final_fee` typed by an admin (`crm/users/[id]/status/route.ts:92-139`). `coupons` + `resolveCouponDiscount`; `incrementCouponUsage` never called. | Approval gate; no programme choice in the form. | **Adapt** (C) |
| 17 Payment trust summary, Pay and Enrol | `PaymentDialog` shows the fee and Razorpay; static "What's next". | Copy and structure. | **Adopt** (A, C) |
| 18, 19 Payment creates enrolment; webhook verified | `verify/route.ts`: constant-time HMAC, `claimPendingPayment` (replay-safe), lead to enrolled, `student_profiles` insert, notifications. No webhook (PERF-0005 critical). Never sets `user_type`, never `nexus_enrollments`. `payments.razorpay_order_id` has no unique index. | Webhook; one pipeline; enrolment side effects. | **Adapt** (C) |
| 20, 21 Provisioning state machine, retries, Microsoft, licence, Teams, Nexus | No job table. `createStudentAccount` (Nexus, six ordered steps, synchronous, staff-triggered); `createEntraUser` with forced password change; `assignLicense` with 404 retry; `addStudentToClassroomTeams`; `enrollUserInDefaultClassroom`. Admin `nexus-enroll` blocks unless `ms_teams_email`. Temp password plaintext in `student_credentials` with RLS `USING (true)`. | Persistence, retries, trigger, queue, encryption. | **Adopt** (D) |
| 22, 23 Post-payment "You're enrolled" and "You're all set" | `PaymentDialog` success (static), app `/welcome` (static), app `/onboarding` (`CredentialCard`, steps, `NexusStatusPoller`), marketing `/my-enrollment`. | No live status; four half-pages. | **Adapt** (E) |
| 24 Admin as exception management | Buttons per step on Students hub and CRM. | Queue screen. | **Adopt** (D) |
| 25 to 34, 37 Tools product, subscriptions, entitlements, cross-sell | `apps/app` is the tools product (Firebase, every tool free; `AccountTier` computed for the avatar ring only). No plan, subscription or entitlement tables. Nexus QB (`nexus_qb_*`) has a status workflow and paper-level `is_student_visible`, reachable only with a Microsoft token and an enrolment. The app's "question bank" is community Q&A (`question_posts`). | Everything commercial. | **Defer** to Phase 2 (Part G) |
| 35 Marketing `/tools/*` SEO pages | `/tools` hub + 13 landing pages on `ToolLandingPage`. | Paper and question-bank pages. | **Defer** (Phase 2, lazy ISR only) |
| 36 Recovery path to Tools | None. | Small. | **Adopt** (A) |
| 38 `apps/tools`, `apps/tools-admin` | A fifth app costs a Vercel project, a deploy job, a CI matrix entry and script edits. | | **Defer** by decision |
| 41 State models | `application_status`: draft, pending_verification, submitted, under_review, approved, rejected, deleted, enrolled, partial_payment. No provisioning states. | Provisioning states only; `submitted` already means "ready for payment". | **Adapt** (D) |
| 42 Analytics events | Taxonomy in `packages/database/src/analytics/index.ts:35-62` already has `application_started`, `application_completed`, `payment_*`, `enrollment_completed`. Marketing apply fires none; payment events are recorded server-side (uncommitted M3b). | Fire them; add autofill, voice, document and provisioning names. | **Adapt** |
| 44, 45 UX writing and trust | Hard-coded English; "Batch allocation within 2 business days". | Copy table in Part B. | **Adopt** |
| 46 Security | Public `documents` bucket still open (audit item 2); `direct_enrollment_links` anon-readable; credentials plaintext. | Never touch the bucket; encrypt credentials; tighten credentials RLS. | **Adapt** (B, D) |

### Live defects found during the comparison (fixed inside Phase 1)

1. The form collects email, phone, date of birth, gender and parent phone but never sends them (`ApplyFormWizard.tsx:277-318`), and even if it did, the `create_lead_profile` RPC has an explicit column list that drops `first_name`, `date_of_birth`, `gender`, `parent_phone`, `gclid`, `wbraid`, `form_step_completed` and `detected_location` on INSERT (`supabase/migrations/20260217115613_create_application_rpc.sql:13-75`). `lead_profiles` has no `email` or `phone` column. Fixed in A with a migration that replaces the RPC.
2. Public and link payments send confirmations to `auth?.phone || ''`, so an unauthenticated payer's WhatsApp and email are skipped (`verify/route.ts:249-250`). Fixed in C: contact comes from the `users` row.
3. `incrementCouponUsage` is never called. Fixed in C.
4. No webhook. Fixed in C.
5. Temp passwords plaintext with an open RLS policy. Fixed in D.
6. Marketing apply fires no funnel events. Fixed in A.
7. `payments.razorpay_order_id` and `student_profiles.user_id` have no unique index; a second insert would not be refused. Fixed in C (after duplicate checks on prod).

---

## Part B. Target experience

Design rules applied throughout (ui-ux-pro-max run 2026-09-26; its generated palette and fonts are discarded, the `@neram/ui` MUI theme stays the source of truth): 375 px first; touch targets 48 px with 8 px gaps; visible focus rings; 4.5:1 text contrast; `prefers-reduced-motion`; SVG icons only; skeletons for async content; errors announced with `role="alert"` under the field; validate on blur; one primary action per screen; no horizontal scroll at 375, 768, 1024, 1440; every Back and Done has an explicit destination.

### B1. Application shell

- `SiteChrome` (client) reads `usePathname()`; focused routes are `/apply`, `/pay`, `/enroll` under any locale prefix. Focused routes render `ApplicationShell`; everything else renders the existing chrome unchanged. `GoogleAdsTag`, `AttributionCapture` and `PageViewBeacon` stay in the layout on every route (conversions fire on apply).
- `ApplicationShell`: a 56 px top bar with the Neram wordmark (link to `/`), the step title and "Step 1 of 4", the locale switcher, and one "Help" button that opens the Nera sheet with a "Call us" secondary action. Under it a 4 px progress bar. On phones a sticky bottom action bar holds Back and the primary button. No footer; a one-line legal strip (Terms, Privacy, Refund policy). Nothing floats: Aintra, the sticky achievement widget, the comparison tray and the fee FAB are not mounted on focused routes.
- Journey: entered from `/apply` links (header CTA, course pages, `/fees`), from `/my-enrollment` (Pay), from a WhatsApp or email link (`/pay?app=`). Back on step 1 returns to the referrer when it is a neramclasses.com page, otherwise `/`. Done (after payment) is the enrolment status view.
- Desktop (1200 px and up): the form column is 640 px max, centred; the Nera panel docks on the right at 400 px when open. Mobile: Nera is a bottom sheet.

### B2. Step 1, About you

Header: "About you". Sub-line: "Takes about 2 to 3 minutes."

Entry choices for a new user (three cards, 48 px targets, SVG icons):
- **Talk to Nera**: "Say your details in your language. Nera fills the form. You check everything before it is saved."
- **Upload a document**: "A marksheet, school ID or Aadhaar. Read once to fill the form, never stored."
- **Type it myself**.
Below: "Already have a Neram account? Sign in" (the shared `LoginModal`).

Returning user (signed in, profile known): the cards collapse to one line; the form opens prefilled with "Pre-filled" chips (exists) and the header reads "Welcome back, {first name}. We filled in what we already know. Check it and continue." If a submitted application exists, the existing `ApplicationDashboard` cards show first (Continue to payment, Edit, Add another course).

Fields, one per row on mobile:
- Student name. Helper: "As it should appear on your Neram records."
- Father's name. Helper: "Used to tell apart students with the same name, and on your records." Required.
- Date of birth (native date input, 16 px).
- Gender (segmented control, optional).
- PIN code (numeric keyboard). On six digits: "Pudukkottai, Tamil Nadu" appears under the field; City and State fill and stay editable via the pencil. Secondary text button "Use my current location" (never on mount). Failure copy: "We couldn't access your location. Enter your PIN code instead."
- Mobile number with country prefix and Verify. Helper: "We'll text you a code. This also creates your Neram account, so you can come back to this application."
- Parent or guardian mobile (optional).
- Email (optional; prefilled from Google).

Primary button: "Continue". Phone verification is required before Continue enables; the reason is in the helper, not an error.

Recovery footer on every step: "Not ready for coaching? Start with Neram Tools and prepare on your own." Link to `/tools`.

### B3. Nera sheet (voice and text)

Bottom sheet on mobile, right panel on desktop. Title "Talk to Nera". Sub-line: "Speak naturally. Nera fills the form for you."
- Language chips: English, தமிழ், हिन्दी, ಕನ್ನಡ, മലയാളം (from `SPEECH_LANGS`), default from the locale.
- A 72 px mic button labelled "Start speaking". While active: "Listening…" with a live transcript; the button reads "Stop".
- Text field: "Or type here". The mic hides when `isSupported` is false.
- Example line: "For example: My name is Arun Kumar, my father is Rajendran, I'm from Madurai 625001, born 12 March 2007."
- "Done" sends the text for extraction, shows a skeleton card, then the review card (B4).
- Denied microphone: "Microphone access is off for this site. You can still type your details."

### B4. Review card ("We found these details")

Same component for voice, text and document.
- Title: "We found these details. Check them before continuing."
- Each field is an editable row with a per-row include checkbox: label, current value, proposed value, and a "Not sure" badge when confidence is low. Missing fields listed once: "Not found: date of birth, PIN code. You can add them on the form."
- Buttons: "Use these details" (primary), "Discard".
- Nothing is written anywhere until "Use these details", and then only into the client form state; saving still goes through the normal draft and submit calls. Applied fields get a "Filled by Nera" or "From your document" chip.
- Document variant: the privacy line sits under the uploader, before upload: "Your document is read once to fill in the form. It is not saved anywhere, and nothing is added to your application until you confirm." Aadhaar hint: "We read only the name, date of birth and address. You can cover the Aadhaar number."

### B5. Step 2, Your course

Header: "Your course".
- Course: NATA, JEE Paper 2, Both, Not sure yet. Each card: one line on who it is for.
- Programme: cards from `fee_structures` for the chosen course (name, duration, "Standard fee ₹X", schedule summary). "Both" shows the combo line when `combo_extra_fee` applies. "Not sure yet" shows: "Choose a course to see the fee, or ask us to call you." with the existing callback dialog. Payment cannot open without a programme.
- Learning mode: Hybrid (centre + online) or Online only; the centre picker appears for Hybrid (exists).
- Your studies (compact): "Which best describes you" (four options), then the two or three fields that category needs (class and board for school students, and so on); caste category and school type move under a "More details" disclosure. Exam year picker.
- Inline fee card (not floating): "Standard fee ₹X. Installments available. Coupons at payment." Government-school applicants see "Your fee will be confirmed after scholarship review" (the admin path stays for scholarships).

### B6. Step 3, Review

Three groups (About you, Your course, Contact) with an Edit link per group that returns to that step and back. Terms checkbox: "I agree to the Terms and the Refund policy." Primary button: "Continue to payment". Continuing writes the application (`status: submitted`); the application number appears at the top of step 4. The submit button is disabled while a draft save is in flight.

### B7. Step 4, Pay and enrol

Header: "Pay and enrol". Application number under it.
- "Your enrolment" card: course, programme, duration, mode, included services (Nexus, Microsoft Teams, study materials).
- Fee table from the quote route: Course fee, Discount lines (full-payment, coupon, YouTube), Payable. Scheme toggle: "Pay in full (save ₹X)" or "Two installments (₹A now, ₹B by {date})" when the programme allows. "Have a coupon code?" disclosure; "Ask about a discount" opens the callback dialog and never blocks.
- "What happens after payment": Enrolment is confirmed after payment verification. Your student account is created. Nexus and Microsoft Teams access are set up automatically. Your Student ID and next steps appear here.
- Payer: name and relationship (exists).
- Button: "Pay and enrol ₹X". Disabled with a spinner while the order is created; Razorpay opens; on return the page shows the status view. When `self_service_payment` is off and no admin fee exists: "Our team will confirm your fee and message you."

### B8. After payment: "You're enrolled" and the status tracker

One presentational component, `EnrollmentStatus`, in `@neram/ui`, fed by a student-safe status projection and rendered in three places: the step 4 success state, `/my-enrollment`, and the student app `/onboarding` (and `/welcome`, which now redirects there).
- Title: "You're enrolled". Sub-line: "Welcome to Neram Classes, {first name}."
- Enrolment: course and programme. Student ID (copyable). Receipt number and download.
- Account setup list with text plus icon per row: Payment confirmed; Student enrolment created; Neram account ready; Microsoft account; Teams access; Nexus access; each with a one-line meaning.
- Provisioning is asynchronous: polls every 5 seconds for 2 minutes, then every 30 seconds, stops at ready. Copy never promises a time: "Usually ready in a few minutes, sometimes up to a day. We'll message you on WhatsApp when it's ready. You can close this page."
- A job that needs staff attention renders as "Our team is finishing your setup" and never shows the internal error text.
- When ready: "You're all set." Buttons: "Open Nexus", "Open Microsoft Teams", "Get your login details" (the app onboarding card). First steps: sign in with the login ID, choose a new password, install Microsoft Authenticator when asked, install Teams, your first class date when known, support contact.
- Installment #1: the same view with "Next installment ₹B due {date}".

### B9. Admin: Enrolment queue (desktop-first)

`/provisioning` under People and CRM, labelled "Enrolment queue", with a needs-attention badge. Tabs: Needs attention (default), Waiting, Running, Done. Table: Student (name, Student ID, link to User 360) | Application | Paid (amount, date) | Current step | Reason | Age. Row opens a drawer with the step timeline (events) and actions: Retry, Retry this step, Skip step (reason required), Link existing Microsoft account (UPN), Reset password and resend, Mark done (note required), Cancel. Every destructive action confirms. The same steps appear as a compact card in User 360's Enrollment tab.

### B10. UX copy (prefer the left)

| Use | Instead of |
|---|---|
| About you | Personal Information |
| Your course | Course Selection |
| Pay and enrol ₹24,000 | Submit Application / Pay Now |
| Talk to Nera | AI Assistant |
| We found these details. Check them before continuing. | AI successfully extracted your information |
| Takes about 2 to 3 minutes. | Fill in your details to apply for our courses. It only takes a few minutes. |
| Your document is read once to fill in the form. It is not saved anywhere. | Your document will never be stored |
| Enrolment is confirmed after payment verification. | Batch allocation within 2 business days |
| We couldn't access your location. Enter your PIN code instead. | Location error |
| Not ready for coaching? Start with Neram Tools. | (dead end) |

No em dashes anywhere in user-visible text (project rule).

---

## Part C. Architecture

### C1. Data model changes (all migrations sort after `20261015090000`)

| File | Change |
|---|---|
| `20261016090000_lead_profiles_applicant_fields_and_fee.sql` | `lead_profiles` gains `email text`, `phone text`, `fee_structure_id uuid references fee_structures(id)`, `fee_source text check (fee_source in ('standard','admin','link'))`; backfill `fee_source = 'link'` where `source = 'direct_link'`, `'admin'` where `final_fee is not null`. `CREATE OR REPLACE FUNCTION create_lead_profile(payload jsonb)` with the same signature, grants and `SECURITY DEFINER`, adding `first_name, email, phone, parent_phone, date_of_birth, gender, gclid, wbraid, form_step_completed, detected_location, fee_structure_id, fee_source` to the column list and VALUES. `NOTIFY pgrst, 'reload schema'`. |
| `20261016090100_payments_fee_snapshot_and_order_index.sql` | `payments` gains `fee_structure_id`, `fee_snapshot jsonb`, `coupon_id uuid references coupons(id)`, `verified_via text check (in ('browser','webhook','admin'))`, `razorpay_event_id text`, `provisioning_job_id uuid`. `CREATE UNIQUE INDEX uniq_payments_razorpay_order ON payments(razorpay_order_id) WHERE razorpay_order_id IS NOT NULL` (guarded by a `DO` block that raises with the duplicates if any exist). |
| `20261016090200_razorpay_webhook_events.sql` | `razorpay_webhook_events(event_id text primary key, event text, razorpay_order_id text, razorpay_payment_id text, payload jsonb, received_at, processed_at, status text check (in ('received','processed','ignored','failed')), error text)`; index on `razorpay_order_id`; RLS on, service role only. |
| `20261016090300_provisioning_jobs.sql` | `provisioning_jobs(id, user_id, lead_profile_id unique, payment_id, student_profile_id, status text check (in ('queued','running','waiting','needs_attention','done','cancelled')), current_step text, steps jsonb default '{}', attempts int, max_attempts int default 8, next_run_at, locked_at, locked_by text, attention_code text, attention_message text, resolved_by, resolved_at, created_at, updated_at, completed_at)`; index `(status, next_run_at)`. `provisioning_job_events(id bigserial, job_id references ... on delete cascade, step text, level text check (in ('info','warn','error')), message text, details jsonb, actor_id uuid, created_at)`; index `(job_id, created_at)`. Function `claim_provisioning_jobs(p_worker text, p_limit int, p_job_id uuid default null) returns setof provisioning_jobs` using `FOR UPDATE SKIP LOCKED` over `status in ('queued','waiting') and next_run_at <= now() and (locked_at is null or locked_at < now() - interval '10 minutes')`, setting running, `locked_at`, `locked_by`, `attempts + 1`; `SECURITY DEFINER`, execute granted to service_role only. RLS on both tables, service role only. |
| `20261016090400_student_credentials_encrypted.sql` | `student_credentials`: `password` drops NOT NULL; add `password_ciphertext text`, `password_iv text`, `password_tag text`, `key_version smallint`, `source text check (in ('admin','provisioning')) default 'admin'`, `delivered jsonb default '{}'`. Drop policy "Admin full access to student_credentials" (`USING (true)`), add a service-role-only policy (every reader already uses the admin client). Expire legacy plaintext rows that are past `auto_destroy_at` or unviewed for 7 days (`is_active = false`, `destroyed_at = now()`, `password = null`). |
| `20261016090500_notification_event_types_provisioning.sql` | Alone in its file, per the existing rule: `ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'enrolment_provisioned'`, `'provisioning_failed'`; `NOTIFY pgrst`. |
| `20261016090600_student_profiles_user_unique.sql` | `CREATE UNIQUE INDEX uniq_student_profiles_user ON student_profiles(user_id)`, guarded by a `DO` block that raises with the offending ids. Run the duplicate query on prod first (Part I). |

No new lead statuses: `submitted` means ready for payment. `user_funnel_events` needs no schema change.

### C2. Fee resolution and quote (C)

`packages/database/src/utils/applicant-fee.ts` (pure, unit tested):
- `resolveApplicantFee(lead, feeStructure)` → `{ source: 'admin' | 'standard' | 'none', baseFee, fullPaymentDiscount, installment1, installment2, allowedModes, feeStructureId, label }`. `final_fee` present (admin or link) wins; else `fee_structure_id` gives `fee_amount`, `single_payment_discount`, installments (allowed only when both amounts are set), plus `combo_extra_fee` for `course_type = 'both'` once its meaning is confirmed (Part I); else `none`.
- `quotePayable(plan, { scheme, couponDiscount, youtubeDiscount })` → `{ payable, base, discounts[], secondInstallment }`, minimum ₹1.

`POST /api/payment/quote` (marketing) runs both with `resolveCouponDiscount` and returns the quote plus `selfServiceEnabled` from `site_settings.self_service_payment`. `create-order` uses the same functions, snapshots the plan onto the lead (`assigned_fee`, `final_fee`, `full_payment_discount`, `installment_*`, `fee_source = 'standard'`) and onto the payment (`fee_structure_id`, `fee_snapshot`, `coupon_id`), and puts `payment_id` in the Razorpay order notes (insert the row first, then create the order, then set `razorpay_order_id`). The 400 "wait for admin approval" message goes; `source: 'none'` returns `code: 'fee_unavailable'` and the step shows the "team will confirm" copy. Admin approval keeps working as the exception path (it sets `fee_source = 'admin'`).

### C3. Payment: two doors, one pipeline (C)

- Browser: `POST /api/payment/verify` (exists) checks the checkout signature, then calls `completePaidPayment({ verifiedVia: 'browser' })`.
- Webhook: `POST /api/webhooks/razorpay` (new, marketing; a future Razorpay Subscriptions webhook for Tools shares it): raw body via `request.text()`, `isValidRazorpayWebhookSignature(raw, header, RAZORPAY_WEBHOOK_SECRET)` (HMAC-SHA256, constant time) else 400; `recordWebhookEvent` keyed on `x-razorpay-event-id` (duplicate → 200 no-op); `payment.captured` and `order.paid` → find the row by `razorpay_order_id` (fallback `notes.payment_id`) → `completePaidPayment({ verifiedVia: 'webhook', amountPaise })`; `payment.failed` → `payment_failed` event and `failure_code` on the still-pending row (never flipped to failed, a later capture can arrive); unknown events → `ignored`, 200. Internal error → event marked `failed`, 500 so Razorpay retries. `maxDuration = 30`.
- `completePaidPayment(client, input)` in `packages/database/src/services/enrolment-pipeline.ts` (`claimPendingPayment` moves next to it in `queries/payments.ts`; marketing re-exports it). Result kinds: `completed`, `already_paid`, `not_found`, `amount_mismatch`, `error`. On `claimed`, in order: amount check when known (mismatch keeps the money, creates the job in `needs_attention: amount_mismatch`); `verified_via`, `razorpay_event_id`; lead status `enrolled` or `partial_payment`; installment #2 row only if none exists (`installment_2_due_days` or 30); `student_profiles` upsert on `user_id`; `users` `{ user_type: 'student', status: 'active', onboarding_completed: true }` plus name and phone fill (the direct-enrol pattern); `incrementCouponUsage(coupon_id)` once; `initializeStudentOnboarding(..., 'regular')`; `enqueueProvisioningJob` (returns the existing job for installment #2); `enrollment_created` event; notifications with contact from the `users` row; then a fire-and-forget kick to the admin worker (`POST /api/cron/provisioning { jobId }` with `CRON_SECRET`, 1.5 s abort, `.catch` logged). Every side effect after the claim is wrapped so a failure lands on the job's events rather than throwing.
- Whichever door claims the pending row runs the side effects exactly once; the other gets `already_paid` and returns the receipt.

### C4. Provisioning state machine (D)

Runner: `runProvisioningJob(client, job, ports, { worker, deadline, accountDefaults })` in `packages/database/src/services/provisioning-runner.ts`, pure over injected ports (`graph`, `teams`, `notify`, `seal`, `randomInt`, `now`) in the style of `createStudentAccount`, so the ordering is unit-tested without Graph or a database. Each step is skipped when already `done`:

1. **student_record**: `users.user_type = 'student'`, fill blanks (`first_name`, `date_of_birth`, `gender`, `phone`, `email`) from the lead; `post_enrollment_details` upsert; onboarding rows if missing. Duplicate guard: another `users` row with the same verified phone that already holds `ms_oid` → `needs_attention: possible_duplicate` (the Afrin case), never a second account.
2. **nexus_enrollment**: `enrollUserInDefaultClassroom` (idempotent, builds the catch-up journey), `nexus_student_onboarding` approved, classify (`academic_year` from the exam year, `current_standard` from the academic data). No current-year classroom → `needs_attention: no_current_classroom` with "Run the year rollover, then Retry" (also re-tried every 6 hours).
3. **entra_account**: `users.ms_oid` present → adopt, done. Else write-ahead: record the UPN in `steps.entra_account.attempted_upns` before every Graph call; on retry, `findUserOidByUpn` on each attempted UPN adopts an account created just before a crash. Username `suggestUsername(firstName, lastName || first word of fatherName)` (First_Last, the hand-made convention), `usernameWithSuffix` for 5 tries via `isUpnAvailable`; `generateTempPassword(randomInt)`; `createEntraUser` with `forceChangePasswordNextSignIn: true`, `mobilePhone`, `usageLocation`; on success `users.ms_oid`, `student_profiles.ms_teams_email`, a `user_identities` row, `setOtherMails` best effort; the sealed temp password sits in the step state only until step 6 publishes it, then is removed.
4. **license**: defaults from the `nexus_settings` row Nexus already uses (`getStudentAccountDefaults`); no SKU → `needs_attention: no_license_configured`; `assignLicense` or `addUserToGroup`; "no available licenses" → `needs_attention: license_unavailable` (re-checked every 6 hours for 3 days, plus Retry); 429 → waiting for `Retry-After`.
5. **teams**: `addStudentToClassroomTeams` with the UPN; a fresh mailbox can be invisible for minutes, so a failed add waits 1, 5, 15, 60, 360 minutes (5 tries) then `needs_attention: teams_add_failed`; on success `markTeamsJoinComplete` (the block from `admin/.../nexus-enroll/route.ts:191-233` moves to `packages/database`); the group-chat invite link is kept in the step for the status view.
6. **credentials**: `publishStudentCredential({ source: 'provisioning' })` once; adopted accounts skip with `existing_account`.
7. **notify**: `accountReady` (WhatsApp plain text now, template `student_account_ready` once Meta approves; Resend `student-account-ready`; student bell `enrolment_provisioned`): login ID, link to the app onboarding page, the three first-sign-in screens including Authenticator. Never the password. `enrollment_completed` and `onboarding_started` events. Job done.

Generic rules: a thrown error waits `min(2^n minutes, 6 h)`; Graph 429 waits `Retry-After` without counting an attempt; after `max_attempts` or a terminal code the job is `needs_attention` and `notify.failed` posts to Telegram and the admin bell (`provisioning_failed`); the 50-second deadline stops between steps and reschedules with `next_run_at = now()` so the next tick continues. Retry from the queue resets the step to pending and `attempts` to 0; done steps never rerun.

Worker: `apps/admin/src/app/api/cron/provisioning/route.ts` (template: `identity-sweep`, fails closed on a missing `CRON_SECRET`, `maxDuration = 60`, `force-dynamic`). `GET` from the Vercel cron `*/5 * * * *` claims up to 5 jobs; `POST { jobId }` is the kick from marketing. Claims go through `claim_provisioning_jobs` (`SKIP LOCKED`, 10-minute lock expiry), so a kick and a tick cannot run one job twice and a crashed run is picked up after its lock expires. Cost: 288 cron invocations a day, most returning in under 200 ms with no jobs. Why not elsewhere: pg_cron + pg_net would put a secret in the database with no precedent here; an Edge Function would split the Graph code from `@neram/auth`; a marketing-hosted worker would put Graph secrets on the public site.

The MFA wall: the tenant forces Authenticator registration and blocks ROPC, so no service can test-sign-in as the student; "done" means the account, licence and Teams membership exist. The copy says exactly what the first sign-in asks. Temporary Access Pass is a possible later replacement for the password (needs the TAP policy and `UserAuthenticationMethod.ReadWrite.All`); out of scope.

### C5. Notifications

Before Nexus: `dispatchNotification` (Telegram, admin bell, student bell, Teams card, WhatsApp) and Resend, with contact from `users`. New: `notifyEnrolmentProvisioned`, `notifyProvisioningFailed`, email template `student-account-ready`, WhatsApp template `student_account_ready` (submit to Meta early; plain text until approved). Inside Nexus: nothing new.

### C6. Analytics (first-party, existing pipeline)

Client (`trackTaxonomyEvent`): `application_started` (once, on the first field change), `autofill_selected {method}`, `voice_started`, `voice_completed`, `document_upload_started`, `document_processed {fields_found}`, `manual_entry_started`, `application_step_completed {step}`, `course_selected`, `application_reviewed`, `application_completed`, `onboarding_viewed`. Server (`recordServerEvent` and `insertFunnelEvent`): `payment_started`, `payment_completed`, `payment_failed` (exist), `enrollment_created`, `provisioning_step {step, status}`, `enrollment_completed`, `onboarding_started`. New names go into `EVENT_TAXONOMY` (`packages/database/src/analytics/index.ts`).

### C7. Security and privacy

- Document route: magic-byte sniff (JPEG, PNG, WebP, PDF; the declared type is ignored), 10 MB cap, no logging of bytes or output, `allowFreeKey: false`, per-client hourly cap in the `@neram/ai` registry (the budget guard is the rate limit), no storage client imported in the file.
- Extraction route: text capped at 2,000 characters; JSON-only prompt with a response schema; output validated before it reaches the browser; error responses never echo the input.
- Webhook: raw-body HMAC, event dedupe, 200 after store.
- Credentials: `sealSecret` / `openSecret` (AES-256-GCM, `CREDENTIAL_ENCRYPTION_KEY`, versioned) in `packages/database/src/utils/secret-box.ts`; decrypt only in the app `/api/credentials` reveal for the signed-in owner (the route already expires rows lazily and starts a 24-hour clock at first view, `apps/app/src/app/api/credentials/route.ts:62-77`); legacy plaintext rows are read until viewed or expired. No cron sweep exists and none is added.
- Minors: the form asks for date of birth, gender, one guardian phone and one email at most; caste only inside "More details"; Nera prompts never ask for or infer anything else; the Aadhaar hint invites covering the number.

---

## Part D. Sub-projects

Sizes: S (a day), M (two to four days), L (a week).

### D-A. Application shell and form restructure (marketing + one migration; L)

Goal: `/apply` in all five locales becomes a focused four-step task in its own shell, prefilled for returning users, saving every field it collects, geolocation on demand only, funnel events firing.

Migration: `20261016090000_lead_profiles_applicant_fields_and_fee.sql` (C1). It must be applied before the marketing deploy or the new keys are dropped again.

Create:
- `apps/marketing/src/lib/focused-routes.ts`: `isFocusedRoute(pathname)` (matches `^/(en|ta|hi|kn|ml)?/?(apply|pay|enroll)(/|$)`; `/apply-now` is false, `/pay/link/abc` is true).
- `apps/marketing/src/components/SiteChrome.tsx` (client) and `apps/marketing/src/components/apply/shell/ApplicationShell.tsx` (top bar, progress, Help, locale switcher, sticky bottom bar on phones, legal strip).
- `apps/marketing/src/components/apply/ApplyFlow.tsx` (replaces `ApplyFormWizard.tsx`: step routing, the returning-user branch, analytics), `StepShell.tsx`, `steps/AboutYouStep.tsx` (from `PersonalInfoStep.tsx`; the mount effect at L54-59 goes, `requestGeolocation` moves behind the "Use my current location" button), `steps/YourCourseStep.tsx` (from `CourseSelectionStep.tsx` plus `YourStudiesBlock.tsx` extracted from `AcademicDetailsStep.tsx`), `steps/PayAndEnrolStep.tsx`, `usePayAndEnrol.ts` (the Razorpay open and verify logic lifted from `PaymentDialog.tsx:359-460`, shared with the dialog; states idle, ordering, checkout, verifying, success, error), `EntryChoices.tsx`, `ProgrammePicker.tsx` (reads `/api/fee-structures`), `FeeSummaryCard.tsx` (inline; the `QuickInfoPanel` FAB is no longer mounted on apply), `RecoveryFooter.tsx`.

Modify:
- `apps/marketing/src/app/[locale]/layout.tsx:169-178` (dirty): wrap in `<SiteChrome locale={locale}>`.
- `apps/marketing/src/components/ApplyPageContent.tsx`: drop the hero and the `ChatAssistant` panel; single 640 px column; render `ApplyFlow`.
- `apps/marketing/src/components/apply/types.ts`: `STEP_LABELS` become i18n keys; `CourseSelectionData.feeStructureId`.
- `apps/marketing/src/components/apply/FormContext.tsx`: validators per new step (`validateAboutYou`, `validateYourCourse` requiring `feeStructureId`, `validateReview`); `buildDraftPayload` (L62-121) and the submit payload carry `email`, `phone`, `parent_phone`, `date_of_birth`, `gender`, `fee_structure_id`; the localStorage restore remaps old four-step `activeStep` values; the Google displayName father-name guess (L649-668) goes; `application_started` fired once (ref + sessionStorage guard).
- Submit runs on leaving Review: POST or PATCH `/api/application` with the new keys, `application_completed`, the Google Ads signup conversion (existing L337-351), then advance to step 4 instead of `router.push('/thank-you')`. Submit disabled while `isSavingDraft || isSubmitting`.
- `apps/marketing/src/app/api/application/route.ts`: pass the new keys through on POST, whitelist them on PATCH, mirror `date_of_birth`, `gender`, and `email` or `phone` only when null onto `users`.
- `apps/marketing/src/components/apply/ApplicationDashboard.tsx` and `PaymentDialog.tsx`: use `usePayAndEnrol` and the quote route (from D-C); the success state uses `EnrollmentStatus` (from D-E).
- `apps/marketing/messages/{en,ta,hi,kn,ml}.json` (dirty): `apply.shell.*`, `apply.steps.*`, `apply.aboutYou.*`, `apply.yourCourse.*`, `apply.review.*`, `apply.pay.*`, `apply.recovery.*`; Tamil translated, the others carry English so every key exists.
- Delete `apps/marketing/src/components/apply/ChatAssistant.tsx` and the `apply.chatAssistant.*` keys in the same change as D-B. `Header.tsx` and `GeneralChatbot.tsx` are left alone; their apply special cases become unreachable.
- `packages/database/src/queries/applications.ts:27-69` and `types/index.ts`: `CreateApplicationInput` and `LeadProfile` gain the new columns (types only; ride the packages batch).

Tests: Vitest `focused-routes.test.ts`; `FormContext.test.tsx` (validators, old-draft step remap, submit payload carries the five fields and `fee_structure_id`); `ProgrammePicker.test.tsx` ("both" combo line, "not sure" callback prompt); `EntryChoices.test.tsx`. Playwright `tests/e2e/apply-shell-marketing.spec.ts` (`marketing-chrome`, `mobile-chrome`): no Header, Footer, chatbot or sticky widgets on `/apply` and `/ta/apply` while present on `/`; one primary button per step; `assertNoHorizontalOverflow` at 375; `assertTouchTargetSize`; `/pay?app=` renders in the shell. `tests/e2e/apply-wizard-marketing.spec.ts`: `getCurrentPosition` stubbed by `addInitScript`, zero calls on load and one after the button; `/api/pincode/*` mocked fills City and State; Continue blocked until the phone is verified; `/api/funnel-events` receives `application_started`; the recovery link points to `/tools`. Update `tests/e2e/application-marketing.spec.ts` selectors.

**Status (D-A):** built 2026-09-26, migration 20261016090000 applied to staging (ledger stamped), unit 238/238, Playwright 32/32, staged in the shared tree, not committed, not deployed. Programme picker offers programmes priced for both exams to either course (production prices every programme that way).

### D-B. Nera assistant: voice and text extraction, document autofill (marketing + packages/ai; M)

Goal: the three entry choices work; extracted details are reviewed before they touch the form; the document never touches storage.

Create:
- `apps/marketing/src/lib/nera/schema.ts`: `ExtractedApplication` (firstName, fatherName, dateOfBirth, gender, phone, parentPhone, email, pincode, city, state, district, applicantCategory, currentClass, schoolName, board, collegeName, department, targetExamYear, interestCourse, learningMode, preferredCentreName; every field nullable), `RESPONSE_SCHEMA` (Gemini JSON schema), `normalizeExtraction(raw)` → `{ fields, unresolved }` (Indian date forms, 10-digit phone, 6-digit PIN, enum coercion, S/O and D/O conventions), `buildNeraPrompt(locale, currentFields)`.
- `apps/marketing/src/lib/nera/sniff-mime.ts`: `sniffMime(bytes)`.
- `apps/marketing/src/lib/nera/apply-extraction.ts`: pure `applyExtraction(formData, fields, selectedKeys)` mapping into `personal`, `location`, `academic`, `course`.
- `apps/marketing/src/app/api/apply/nera/extract/route.ts`: `POST { text (≤2000), locale, current? }` → `200 { fields, unresolved }`; optional Firebase auth for `actorId`; `clientKey` from the hashed IP; `generateGeminiText({ feature: 'marketing.nera-extract', responseSchema, temperature: 0.1 })`; `AiBlockedError` → 409 `{ reason }` (`client_cap` surfaces as 429).
- `apps/marketing/src/app/api/apply/nera/document/route.ts`: `POST multipart/form-data` (`file`) → same shape; `413` over 10 MB; `415` when the sniffed type is not image or PDF; base64 in memory → `generateGemini` with `inline_data`, `feature: 'marketing.nera-document'`; `maxDuration = 30`.
- `apps/marketing/src/components/apply/nera/NeraSheet.tsx` (`SwipeableDrawer` bottom on xs, right `Drawer` 400 px on md+), `NeraComposer.tsx` (multiline field + the existing `VoiceInputButton` with the locale's language), `NeraDocumentUpload.tsx` (`ImageUploadField` from `@neram/ui`, `accept="image/*,.pdf"`, camera, `maxSizeMB={10}`, injected `upload(file)` that posts to the document route and returns an object URL for the preview only), `NeraReviewCard.tsx`, `useNeraExtraction.ts`.

Modify: `packages/ai/src/features.ts` adds `marketing.nera-extract` (standard tier, public, `allowFreeKey: false`, `dailyCallCap: 600`, `perClientHourlyCap: 20`) and `marketing.nera-document` (document tier, public, `allowFreeKey: false`, `dailyCallCap: 200`, `perClientHourlyCap: 5`); `packages/ai/src/features.test.ts` asserts both never use the free key. `FormContext.tsx` gains `applyExtractedFields(fields, selectedKeys)` that fills and tags fields. `ApplyPageContent.tsx` mounts the sheet; `EntryChoices` and the shell Help button open it. Analytics events from C6.

Tests: Vitest `schema.test.ts` ("05/03/2009", "5 March 2009", "2009-03-05"; "+91 98765 43210"; PIN; enum coercion; unknown keys dropped), `sniff-mime.test.ts`, `apply-extraction.test.ts`, both route tests (`@vitest-environment node`, `@neram/ai` mocked: 12 MB refused, `.txt` disguised as JPEG gets 415, output validated, no `console.log` of the input, an error never echoes the text), `NeraSheet.test.tsx` (mic hidden when unsupported, typed path submits, denied-mic copy). Playwright `tests/e2e/nera-apply-marketing.spec.ts`: fake `SpeechRecognition` (as in `aintra-voice-marketing.spec.ts`), `/api/apply/nera/extract` mocked, review card, apply, form inputs asserted; document path with `setInputFiles` and a small PNG fixture; 375 and 1280.

### D-C. Standard fee, quote, webhook, one pipeline (marketing + packages/database; L)

Goal: a submitted application pays its programme's standard fee at once; a captured payment enrols the student whether or not the browser survives; every side effect runs once.

Migrations: `20261016090100`, `20261016090200`, `20261016090600` (C1).

packages/database:
- `utils/applicant-fee.ts` (C2).
- `queries/payments.ts`: `claimPendingPayment` moved here unchanged; `findPendingOrPaidByOrder`, `recordWebhookEvent` (insert on conflict do nothing → `'new' | 'duplicate'`), `markWebhookEvent`.
- `services/enrolment-pipeline.ts`: `completePaidPayment` (C3); a pure `planEnrolmentEffects(payment, lead, existing)` returns the ordered effects so the sequence is unit-tested.
- `queries/provisioning.ts` (first slice): `enqueueProvisioningJob`, `getProvisioningJobForUser`.
- `queries/settings.ts`: `getSiteSetting('self_service_payment')`.
- `analytics/index.ts`: the new event names.

marketing:
- `api/payment/quote/route.ts` (new).
- `api/payment/create-order/route.ts:64-82` (dirty): the resolver replaces the `final_fee` gate; snapshots; `payment_id` in the order notes.
- `api/payment/verify/route.ts:53-302` (dirty): signature check and `payment_failed` events stay; the rest becomes `completePaidPayment`; response shape unchanged plus `jobId`.
- `api/webhooks/razorpay/route.ts` (new, C3). `lib/payments/razorpay-verify.ts`: `isValidRazorpayWebhookSignature` added, `claimPendingPayment` re-exported. `lib/payments/provisioning-kick.ts`: `kickProvisioning(jobId)`.
- `components/apply/steps/PayAndEnrolStep.tsx`, `PaymentDialog.tsx`, `components/pay/PaymentPage.tsx`: read the quote route; no client-side fee maths.

Idempotency and failure design: the single conditional UPDATE in `claimPendingPayment` means exactly one caller of the two doors gets `claimed`; a true race serialises on the row lock. Webhook redelivery is a primary-key no-op. A browser that drops after capture is completed by the webhook and the student sees the result on the status view. Amount is fixed server-side at order creation and compared against the webhook payload. Installment #1 runs the whole pipeline (access on installment #1, as today); installment #2 updates fees and reuses the done job. Coupon usage increments once inside the claimed branch. Scholarship applicants (`school_type = 'government_school'` with a pending scholarship) keep the admin path: `source: 'none'` and the "confirmed after scholarship review" copy.

Config: `RAZORPAY_WEBHOOK_SECRET` (marketing, production and preview, plus `turbo.json` `globalEnv` and `.env.example`); `ADMIN_APP_URL` and `PROVISIONING_KICK_SECRET` (marketing; the same value as admin `CRON_SECRET`); Razorpay dashboard webhook per environment (`/api/webhooks/razorpay`; events `payment.captured`, `order.paid`, `payment.failed`); `site_settings.self_service_payment = { "enabled": true }` on staging first.

Tests: Vitest `applicant-fee.test.ts` (admin wins; standard; none; installments only with both amounts; ₹1 floor), `enrolment-pipeline.test.ts` with a chainable fake client (claimed vs already_paid; full: lead enrolled, profile, `user_type`, Nexus row, job; installment 1: partial, installment row, job; installment 2: fee update, no second job; replay: nothing duplicated; no current classroom: recorded, not thrown; coupon once), `razorpay-verify.test.ts` extended for the webhook HMAC, `webhooks/razorpay/route.test.ts` (bad signature 400, duplicate 200, captured reaches the pipeline, unknown ignored), `create-order` route test (standard snapshot written once, admin fee untouched, `fee_unavailable`). Playwright `tests/e2e/payment-webhook-marketing.spec.ts` (API level): seed a pending payment with the service key, POST a signed `payment.captured`, assert paid plus job, POST again → duplicate, then `/api/payment/verify` → `already_paid` (needs `RAZORPAY_WEBHOOK_SECRET` in `.env.test`). `apply-pay-marketing.spec.ts`: step 4 renders the quote from a seeded fee row; the order is created; Razorpay opens; with `RAZORPAY_TEST_MODE` the test card completes and the status view appears.

### D-D. Provisioning state machine, worker, admin queue (packages/auth + packages/database + admin + app + Nexus shims; L)

Goal: a captured payment ends with a Microsoft account, a licence, Teams and Nexus access without a human; every failure lands in one queue with a plain-words reason and a Retry.

Migrations: `20261016090300`, `20261016090400`, `20261016090500` (C1).

packages/auth: `src/entra.ts` (moved verbatim from `apps/nexus/src/lib/entra-accounts.ts`, plus `retryAfterMs` parsed on 429 and 503) and `src/entra-rules.ts` (the pure helpers from `student-account-rules.ts`: username rules, `generateTempPassword`, `normalizeIndianMobile`, `decodeTokenRoles`, `describeLicenseFailure`, `normalizeAccountDefaults`); exported from the barrel and as `./entra`, `./entra-rules`; `findUserOidByUpn` added to `graph.ts` if `findUserOidByEmail` filters on `mail` only (Part I). Nexus: `entra-accounts.ts` becomes `export * from '@neram/auth/entra'`; `student-account-rules.ts` keeps its Nexus-only parts (`buildLoginMessage`, `whatsAppShareUrl`, `ABILITY_ROLES`, `readinessFromRoles`, `pickMostCommonLicense`, `skuDisplayName`, `freeSeats`) and re-exports the rest, so `student-account-provisioning.ts`, `student-account-store.ts`, the accounts route and the rules test compile unchanged.

packages/database: `utils/secret-box.ts`; `queries/credentials.ts` (`publishStudentCredential`, `revealStudentCredential` with the legacy fallback); `queries/provisioning.ts` (the rest: `claimProvisioningJobs` via the RPC, `getProvisioningJob`, `listProvisioningJobs`, `countProvisioningJobsByStatus`, `updateProvisioningStep`, `rescheduleProvisioningJob`, `markNeedsAttention`, `finishProvisioningJob`, `appendProvisioningEvent`, `requeueProvisioningJob`); `queries/settings.ts` `getStudentAccountDefaults`; `queries/post-enrollment-onboarding.ts` `markTeamsJoinComplete`; `services/provisioning-runner.ts` (C4); `services/notifications.ts` and `email.ts` additions (C5); types.

admin: `lib/provisioning-ports.ts` (real ports; an in-memory fake when `PROVISIONING_GRAPH_MODE=fake` and not production); `api/cron/provisioning/route.ts`; `vercel.json` cron `*/5 * * * *`; `api/provisioning/jobs/route.ts` (`GET ?status=&q=&limit=` → `{ jobs, counts }`), `api/provisioning/jobs/[id]/route.ts` (`GET` → job, events, user, lead, payment), `api/provisioning/jobs/[id]/actions/route.ts` (`POST { action: retry | retry_step | skip_step | link_ms_account | reset_password | resend_credentials | mark_done | cancel, step?, upn?, reason? }`, actor from `getRequestAdminId`, retries run inline with `maxDuration = 60`); `(dashboard)/provisioning/page.tsx` with `components/provisioning/ProvisioningTable.tsx` and `ProvisioningDrawer.tsx` (reuse `OpsPageHeader`, `StatusChip`, `EmptyState` from `components/ops/OpsUi.tsx`); `Sidebar.tsx` "Enrolment queue" under People and CRM with badge `provisioning` (wire into the endpoint that fills `badgeCounts`, to locate); User 360 Enrollment tab `ProvisioningCard`; `api/students/[id]/credentials/route.ts` writes sealed values.

app: `api/credentials/route.ts` reveal via `revealStudentCredential`.

Config: `CREDENTIAL_ENCRYPTION_KEY` (admin and app, same value, base64 32 bytes; `globalEnv`); `CRON_SECRET` on admin (already required by the identity sweep); the app registration behind `getAppOnlyToken` needs `User.Create` (or `User.ReadWrite.All`), `LicenseAssignment.ReadWrite.All` or `GroupMember.ReadWrite.All`, `User-Mail.ReadWrite.All`, `User-PasswordProfile.ReadWrite.All`, `TeamMember.ReadWrite.All`; run `readAppRoles()` from admin on staging before go-live; a missing permission becomes a `needs_attention` row naming it.

Tests: Vitest `secret-box.test.ts` (round trip, tamper, wrong key, missing key error); `provisioning.test.ts` (query builders); `provisioning-runner.test.ts` with fake ports (happy path; crash after `createUser` then adopt via `attempted_upns`; UPN taken twice → suffix 3; 429 → waiting with `retryAfterMs`; licence unavailable; no classroom; Teams backoff sequence; deadline stop resumes; notify never twice; adopted account skips credentials; the password never appears in `steps`, events or audit; duplicate-phone guard); `entra-rules.test.ts` moved unchanged; admin `cron/provisioning/route.test.ts` (401 without secret; lock prevents a second claim; POST kick), `actions/route.test.ts` (middleware 401/403; retry resets; skip and mark done require a reason); `ProvisioningTable.test.tsx` (text plus icon per status). Playwright `tests/e2e/provisioning-queue-admin.spec.ts` (`admin-chrome`, `test_` token, `PROVISIONING_GRAPH_MODE=fake`): a seeded `needs_attention` job lists under the default tab; the drawer shows events; Retry completes with the fake Graph; the badge updates. Local admin points at a real database, so the spec seeds and cleans its own rows and never runs a real Graph call.

### D-E. Post-payment onboarding and enrolment status (packages/ui + packages/database + marketing + app; M)

Goal: after paying, the student sees one live tracker on marketing and in the student app, and receives the login ID and a link, never a password, once the account is ready.

- `packages/database/src/queries/provisioning.ts`: `getStudentEnrolmentStatus(client, userId)` → `{ stage: paid | setting_up | ready | attention, steps: [{ key: nexus_access | microsoft_account | licence | teams | credentials, state: done | pending | delayed }], credentialsAvailable, teamsInviteLink, nexusUrl, receipt: { receiptNumber, amount, scheme, nextInstallmentDue }, updatedAt }`; never exposes `attention_message`; `delayed` when waiting with `next_run_at` more than 10 minutes away.
- `packages/ui/src/components/EnrollmentStatus/EnrollmentStatus.tsx` (presentational; takes the projection and link handlers; text plus icon; skeleton; reduced motion), exported from `@neram/ui`.
- marketing: `api/apply/enrolment-status/route.ts` (`GET`, Firebase bearer, `Cache-Control: no-store`, `404 { code: 'NOT_ENROLLED' }`); `hooks/useEnrolmentStatus.ts` (5 s for 2 minutes, then 30 s, stops at ready, pauses on `visibilitychange`); used by `PayAndEnrolStep` success, `PaymentDialog` success (replaces L455-575), and `[locale]/my-enrollment/page.tsx`. The Google Ads purchase conversion moves here from `/thank-you`, and `invalidateApplicationStatus()` flips the header CTA. `/thank-you` stays for old links.
- app: `api/enrolment-status/route.ts` (same projection, the app's `verifyToken` pattern); `components/onboarding/ProvisioningStatusCard.tsx` at the top of `(protected)/onboarding/page.tsx` (the existing `CredentialCard` fetch runs when `credentialsAvailable`); `(protected)/welcome/page.tsx` shows the card and one "Continue setup" button to `/onboarding`. The `(protected)` layout's onboarding quiz is skipped because the pipeline sets `onboarding_completed = true`.

Tests: Vitest for the projection (attention never leaks the message; delayed rule), `EnrollmentStatus` (all states, installment line, attention copy, reduced motion), the polling hook (cadence, stops at ready, pauses when hidden). Playwright `tests/e2e/enrolment-status-app.spec.ts` (`app-chrome`, `user.json`): seed a `waiting` job for the E2E student, `/onboarding` shows pending steps; flip to done via the service key, all done and the credential card appears. `tests/e2e/apply-enrolled-marketing.spec.ts`: mock the status route through setting_up then ready at 375 and 1280.

---

## Part E. Build order, dependencies, deploy batches

Development order (so screens are testable locally early): **D-A → D-C → D-B → D-D → D-E**. D-C's step 4 needs D-A's programme picker (older leads fall back to `year_long`); D-B targets D-A's layout; D-D consumes D-C's job insert; D-E reads D-D's status query.

Deploy: nothing deploys without an explicit instruction. Every `packages/` change (database, auth, ai, ui) rebuilds all four apps, so Phase 1 ships as **one packages batch** after all five sub-projects pass their gates, in this order: migrations `20261016090000` to `20261016090600` on staging by MCP with the ledger stamped → staging deploy of all four apps → the end-to-end run in Part F → production migrations in the deploy window → production deploy. `self_service_payment` stays off on production until the staging run passes, so the only behaviour change at deploy time is the webhook and the queue. Optional earlier marketing-only deploy: D-A's shell and form alone, provided its type-only packages change is deferred (the route passes the keys through untyped) and the `20261016090000` migration is applied first.

Repo copy: after approval, this plan is saved (without secrets, of which it holds none) to `docs/superpowers/specs/2026-09-26-enrolment-tools-ux-design.md` beside the lifecycle plan, and the implementation follows the writing-plans workflow per sub-project.

Sizes: D-A L, D-B M, D-C L, D-D L, D-E M.

## Part F. Verification

Per sub-project, before calling it done:
1. `pnpm --filter <app> type-check` and `pnpm --filter <app> lint` with `--force`, never piped.
2. `pnpm test:run` from the root.
3. The relevant Playwright project: `marketing-chrome` and `mobile-chrome` for D-A, D-B, D-C, D-E; `admin-chrome --no-deps` for D-D; `app-chrome` for D-E.
4. A ui-ux-pro-max review of every new screen at 375 and 1280 px against the rule set in Part B (admin at 1280).
5. Never `next build` while a dev server runs; verify the Nexus shims in an isolated copy.

End to end on staging after the batch: apply as a new user with Nera, pay with the Razorpay test card, confirm the webhook delivery in the Razorpay dashboard, watch the job reach done in the Enrolment queue, confirm the Entra account and licence in the Microsoft 365 admin centre, sign in to Nexus with the login ID from the app onboarding card, change the password, register Authenticator, open the class Team. Then: a returning Nexus student paying for a new year (account step adopts); the SKU cleared (`no_license_configured` in the queue, Retry after setting it); a webhook replay (duplicate no-op); a browser-only verify with the webhook secret wrong (browser path still enrols).

## Part H. Definition of done (spec section 50, Classes part)

- A new student completes enrolment with no admin approval (D-A, D-C).
- A returning user is recognised and prefilled (D-A).
- Nera collects details by voice and text; the manual form always works; document autofill is optional with true privacy copy (D-B).
- Father's name stays; PIN lookup stays editable (D-A).
- The student sees the exact course, programme and fee before paying (D-A, D-C).
- Payment is verified server-side by signature and by webhook; a captured payment creates the enrolment once (D-C).
- Microsoft account, licence, Teams and Nexus access are provisioned automatically with retries (D-D).
- The student gets one onboarding tracker with Student ID, status and next steps (D-E).
- Admin handles only exceptions, from one queue (D-D).

## Part I. Risks and things to verify before implementing

- Whether admin and Nexus share one Entra app registration (`NEXT_PUBLIC_AZURE_AD_CLIENT_ID`) and which Graph application permissions it holds; run `readAppRoles()` from admin on staging.
- Prod duplicates in `student_profiles.user_id` and `payments.razorpay_order_id` (both unique indexes fail loudly if any exist; merge or repair first).
- Whether a Vercel Node function keeps running after the caller aborts at 1.5 seconds (the kick). If not, the cron still completes every job within 5 minutes; confirm on staging before the copy relies on the fast path.
- The endpoint that fills `badgeCounts` in `Sidebar.tsx` for the new badge.
- `fee_structures.combo_extra_fee` semantics (assumed to apply to `course_type = 'both'`).
- The exact Razorpay payload shapes for `order.paid` versus `payment.captured` on the current API version.
- Whether `findUserOidByEmail` resolves a UPN; if it filters on `mail` only, add `findUserOidByUpn`.
- Licence seats: a full tenant stops every new job at the licence step with "no free student licenses"; Retry works after seats are bought.
- The MFA wall: E2E cannot exercise Microsoft, so D-D is proven by unit tests with fake ports and one manual staging run.
- Meta template approval takes days; submit `student_account_ready` early; plain text ships first.
- `database.generated.ts` is stale and hand-edited; new tables are typed by hand in `types/index.ts` with the existing `as any` client pattern.
- `apps/app` keeps a duplicate apply wizard and duplicate payment routes with a weaker signature check; follow-up: point the app at the marketing routes or delete them.
- No new marketing static fan-out (apply is one route), so the 15k-file cap is untouched. Admin runs three Vercel crons after this.
- Founder decisions still open, defaults chosen here: email optional on step 1; caste category optional under "More details"; UPN convention `First_Fathername` when the applicant has no surname; Hindi, Kannada and Malayalam copy in English until translated.

## Part G. Tools roadmap (Phase 2, own spec when picked up)

Sketch only, to keep Phase 1 compatible:

- **Content access**: `nexus_qb_original_papers.access_level text default 'classes'` (classes | free | premium) with per-question overrides. Authoring stays in Nexus; a "Publish to Tools" control sets the level.
- **Plans and entitlements**: `subscription_plans` (code FREE, STUDY_PREMIUM, EXAM_PASS; price, period, `entitlements text[]`), `subscriptions` (user, plan, status trial | active | past_due | cancelled | expired | refunded, starts, expires, Razorpay ids), `entitlements` (user, key PYQ | SOLUTIONS | QUESTION_BANK | MOCK_TESTS | AI_EXPLANATIONS | STUDY_MATERIALS, `source` subscription | enrollment | manual, `source_id`, valid range). One `hasEntitlement(userId, key)` in `packages/database`. The Phase 1 runner's `nexus_enrollment` step is the hook that later grants `source = 'enrollment'` entitlements.
- **Tools app**: `/practice/*` in `apps/app` over a published read model of the Nexus bank (no Microsoft token); paywall component; Razorpay Subscriptions through the same `/api/webhooks/razorpay`; account page with plan and receipts.
- **Admin**: a Tools section (Plans, Subscriptions, Entitlements, Content access; Coupons reused) in `apps/admin`.
- **Marketing**: `/tools/nata-previous-year-papers`, `/tools/nata-question-bank` as lazy ISR pages (no `generateStaticParams`).
- **Cross-sell**: "Your Tools Premium is included" card on the enrolment status view; "Want teacher-led preparation?" card in Tools.
