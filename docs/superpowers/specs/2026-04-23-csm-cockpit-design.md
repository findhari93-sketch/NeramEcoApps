# CSM Cockpit: Account Management for Paid Colleges

**Date**: 2026-04-23
**Status**: Draft, awaiting user review
**Owner**: Project Architect (root)
**Affects**: `apps/admin`, `packages/database` (3 new tables, 2 new columns), Supabase RLS policies

## Summary

Build a Customer Success Manager (CSM) "cockpit" inside `apps/admin` so that 2 Neram CSMs can manage all paid colleges (currently scaling toward 100+) without information getting lost in WhatsApp scrollback. WhatsApp remains the chat channel with colleges; this dashboard is the system of record behind it.

Phase 1 ships: assignment of CSMs to colleges, a per-CSM "My Colleges" home ranked by health, a per-college detail view (touchpoints, issues, data), and a fast (<30s) touchpoint-logging modal. Health score is rule-based and computed from data we already have (last contact, profile completion, open issues, leads activity, payment status).

Phases 2 and 3 (cron-based health caching + email digests; WhatsApp Business API integration) are out of scope here but called out so we don't paint into a corner.

This is paid-tier-only. Free colleges continue to self-serve via the existing college-dashboard at `apps/marketing/src/app/college-dashboard/`.

## Background

### What exists today
- College admin dashboard at `apps/marketing/src/app/college-dashboard/` (Supabase email+password auth) lets each college edit their profile, view leads, submit partnership pages
- Admin app at `apps/admin/src/app/(dashboard)/college-hub/` already has account creation flows for college admins
- `colleges` table holds tier (`neram_tier`: free / silver / gold / platinum), profile fields, verification status
- `college_admins` table holds people on the college side (with role: super_admin / admin / admission_officer)
- `admin_notifications` table exists but is unused
- No system tracks Neram-side activity: who's the assigned CSM, when they last contacted the college, what issues are open, what's the relationship health

### The problem
- Neram team uses WhatsApp groups (one per paid college) to coordinate updates, content asks, and issue resolution
- With 2 CSMs handling all paid colleges (and growing toward 100+), things fall through cracks: issues lost in chat scrollback, no handover history, no "which college is at risk" signal, no data on patterns ("5 colleges asked the same question this week")
- WhatsApp is fine as the channel (zero friction, colleges already use it), but the team needs a system of record behind it

### Why now (vs. buying Wati/Interakt)
- At current scale (2 CSMs, ~30 paid colleges) a ₹2.5k–₹8k/month tool per agent is premature
- We have all the relevant data already in Supabase (payments, leads, profile completion, college metadata) so a build leverages existing data; a buy doesn't
- Hybrid path agreed with user: build the cockpit now, layer WhatsApp Business API on top later when scale justifies it (Phase 3, when CSMs ≥3 or paid colleges ≥50)

## Goals

- Each CSM sees only the colleges assigned to them, ranked by who needs attention (red → yellow → green)
- Per-college view shows everything in one place: tier, payment, last contact, profile completion, leads activity, open issues, touchpoint history
- Logging a touchpoint takes <30 seconds (so CSMs actually do it)
- Issue workflow: open → in_progress → blocked → resolved, with priority and due date
- "At risk" colleges surface automatically via a rule-based health score (no ML, no manual override needed in Phase 1)
- Super admin can see across all CSMs (cross-CSM visibility for handovers, vacation cover, performance review)
- RLS enforces: CSMs can only read/write touchpoints + issues for colleges they're assigned to

## Non-goals

- No WhatsApp Business API integration (Phase 3, after scale demands it)
- No automated email/Slack digests (Phase 2)
- No ML-based churn prediction (rule-based score is enough for now)
- No college-side view of issues or touchpoints (the relationship is owned by the CSM; colleges raise concerns via WhatsApp; CSM logs them)
- No multi-region or regional-manager hierarchy (2 CSMs reporting to one super admin is the org)
- No changes to the existing college-dashboard at `apps/marketing/`
- No new tier/pricing logic; consume the existing `colleges.neram_tier` field as-is
- No free-tier rows in any of the new tables; this is paid-only

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  apps/admin (Microsoft Entra ID auth, internal staff only)   │
│                                                               │
│  /college-hub/account-management                              │
│    ├── page.tsx              "My Colleges" home               │
│    ├── [collegeId]/                                           │
│    │   ├── page.tsx          Overview tab                     │
│    │   ├── touchpoints/page.tsx                               │
│    │   ├── issues/page.tsx                                    │
│    │   └── data/page.tsx     Read-only mirror of college view │
│    ├── all-issues/page.tsx   Super admin only                 │
│    └── all-touchpoints/page.tsx  Super admin only             │
│                                                               │
│  Components:                                                  │
│    src/components/account-management/                         │
│      ├── CollegeHealthCard.tsx                                │
│      ├── TouchpointModal.tsx       (the <30s modal)           │
│      ├── IssueModal.tsx                                       │
│      ├── HealthGauge.tsx                                      │
│      └── TouchpointTimeline.tsx                               │
│                                                               │
│  API routes:                                                  │
│    src/app/api/account-management/                            │
│      ├── colleges/route.ts          GET my colleges + health  │
│      ├── touchpoints/route.ts       POST + GET                │
│      └── issues/route.ts            POST + PATCH + GET        │
└────────────────────┬──────────────────────────────────────────┘
                     │
                     ▼
        ┌────────────────────────────────────┐
        │  Supabase                          │
        │   - csm_assignments                │
        │   - csm_touchpoints                │
        │   - csm_issues                     │
        │   - colleges (+last_csm_contact_at,│
        │              health_score)         │
        │   - RLS: scoped to assigned        │
        │     colleges per CSM               │
        │                                    │
        │   - SQL function:                  │
        │     compute_college_health(uuid)   │
        │     → integer 0–100                │
        └────────────────────────────────────┘
```

**Auth**: Existing Microsoft Entra ID auth in admin app. CSM identity = `users.id` of the staff member. No new auth.

**Where computed values live**: `colleges.health_score` and `colleges.last_csm_contact_at` are denormalized for fast sorting on the home page. They are kept fresh by:
- `last_csm_contact_at`: trigger on `csm_touchpoints` insert
- `health_score`: computed on read in Phase 1 (a SQL function called by the API), with the column existing but unused in Phase 1; in Phase 2 a nightly Supabase cron writes the cached value

## Data Model

All migrations live in `packages/database/supabase/migrations/`. All additive, safe on prod.

### New: `csm_assignments`

```sql
create table csm_assignments (
  id uuid primary key default gen_random_uuid(),
  csm_user_id uuid not null references users(id) on delete restrict,
  college_id uuid not null references colleges(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid not null references users(id),
  is_active boolean not null default true,
  -- Only one active assignment per (CSM, college) pair
  constraint csm_assignments_unique_active
    unique nulls not distinct (csm_user_id, college_id, is_active)
    deferrable initially deferred
);

create index csm_assignments_csm_active_idx
  on csm_assignments (csm_user_id) where is_active = true;
create index csm_assignments_college_active_idx
  on csm_assignments (college_id) where is_active = true;
```

A college can have at most one active CSM at a time. To reassign, set old row `is_active=false` and insert a new active row (audit trail preserved). The `unique nulls not distinct` clause + `is_active` boolean is the standard Postgres way to enforce "one active row per pair" without losing history. If implementation reveals this exact constraint syntax fails on the target Postgres version, use a partial unique index `unique (csm_user_id, college_id) where is_active = true` instead.

### New: `csm_touchpoints`

```sql
create table csm_touchpoints (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null references colleges(id) on delete cascade,
  csm_user_id uuid not null references users(id),
  channel text not null check (channel in ('whatsapp','call','email','meeting','in_person','other')),
  direction text not null check (direction in ('inbound','outbound')),
  summary text not null check (length(summary) between 1 and 280),
  details text,
  follow_up_due date,
  created_at timestamptz not null default now()
);

create index csm_touchpoints_college_created_idx
  on csm_touchpoints (college_id, created_at desc);
create index csm_touchpoints_followup_idx
  on csm_touchpoints (follow_up_due) where follow_up_due is not null;
```

Trigger: on insert, update `colleges.last_csm_contact_at = greatest(coalesce(last_csm_contact_at, '-infinity'::timestamptz), new.created_at)`.

### New: `csm_issues`

```sql
create table csm_issues (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null references colleges(id) on delete cascade,
  opened_by uuid not null references users(id),
  assigned_to uuid not null references users(id),
  title text not null check (length(title) between 1 and 200),
  description text,
  category text not null check (category in ('content_update','technical','billing','partnership','support','other')),
  priority text not null default 'medium' check (priority in ('low','medium','high','urgent')),
  status text not null default 'open' check (status in ('open','in_progress','blocked','resolved','wont_fix')),
  due_date date,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index csm_issues_college_status_idx
  on csm_issues (college_id, status);
create index csm_issues_assigned_open_idx
  on csm_issues (assigned_to, priority, due_date)
  where status in ('open','in_progress','blocked');
```

Trigger: on update of `status` to `'resolved'` or `'wont_fix'`, set `resolved_at = now()`. On any update, set `updated_at = now()`.

### Altered: `colleges`

```sql
alter table colleges
  add column if not exists last_csm_contact_at timestamptz,
  add column if not exists health_score integer check (health_score between 0 and 100);

create index colleges_health_score_idx
  on colleges (health_score) where neram_tier in ('silver','gold','platinum');
```

### Health score function

```sql
create or replace function compute_college_health(p_college_id uuid)
returns integer language plpgsql stable as $$
declare
  v_score integer := 100;
  v_last_contact timestamptz;
  v_profile_pct integer;
  v_high_open integer;
  v_urgent_overdue integer;
  v_recent_leads integer;
  v_payment_overdue boolean;
begin
  select last_csm_contact_at into v_last_contact from colleges where id = p_college_id;
  -- profile_pct: derive from existing fields the dashboard already uses
  -- (about, phone, email, admissions_phone, admissions_email, website, youtube, instagram = 8 fields)
  select (
    (case when about is not null and length(about) > 20 then 1 else 0 end) +
    (case when phone is not null then 1 else 0 end) +
    (case when email is not null then 1 else 0 end) +
    (case when admissions_phone is not null then 1 else 0 end) +
    (case when admissions_email is not null then 1 else 0 end) +
    (case when website is not null then 1 else 0 end) +
    (case when youtube_channel_url is not null then 1 else 0 end) +
    (case when instagram_handle is not null then 1 else 0 end)
  ) * 100 / 8 into v_profile_pct
  from colleges where id = p_college_id;

  select count(*) into v_high_open from csm_issues
    where college_id = p_college_id and status in ('open','in_progress','blocked') and priority = 'high';
  select count(*) into v_urgent_overdue from csm_issues
    where college_id = p_college_id and status in ('open','in_progress','blocked')
      and priority = 'urgent' and due_date < current_date;
  -- recent leads: count rows in lead_profiles or equivalent for this college in last 30 days
  -- Implementation note: confirm the lead-to-college link column name during implementation
  -- (likely lead_profiles.college_id or college_leads.college_id) and adjust this CTE
  select count(*) into v_recent_leads from lead_profiles
    where college_id = p_college_id and created_at > now() - interval '30 days';
  -- payment_overdue: derive from payments table; placeholder logic below, adjust to actual schema
  v_payment_overdue := false;  -- TODO during implementation: query payments for paid college tier overdue invoice

  if v_last_contact is null or v_last_contact < now() - interval '30 days' then v_score := v_score - 20;
  elsif v_last_contact < now() - interval '14 days' then v_score := v_score - 10;
  end if;

  if v_profile_pct < 50 then v_score := v_score - 15;
  elsif v_profile_pct < 75 then v_score := v_score - 10;
  end if;

  v_score := v_score - (v_high_open * 10);
  v_score := v_score - (v_urgent_overdue * 20);
  if v_recent_leads = 0 then v_score := v_score - 15; end if;
  if v_payment_overdue then v_score := v_score - 25; end if;

  return greatest(0, least(100, v_score));
end $$;
```

The function is `stable` and called from the API on read in Phase 1. Implementation must verify the `lead_profiles.college_id` column name (or substitute the correct join). The payment-overdue check is left as a TODO with a default of `false`; implementation should wire it to the actual payments schema during build (and if the schema doesn't expose overdue cleanly, drop that signal from the score for Phase 1 rather than block the spec).

### RLS policies

```sql
alter table csm_assignments enable row level security;
alter table csm_touchpoints enable row level security;
alter table csm_issues enable row level security;

-- CSM can read their own assignments; super admin can read all
create policy csm_assignments_read on csm_assignments for select
  using (
    csm_user_id = auth.uid()
    or exists (select 1 from users where id = auth.uid() and role = 'super_admin')
  );

-- Only super admin can insert/update assignments
create policy csm_assignments_write on csm_assignments for all
  using (exists (select 1 from users where id = auth.uid() and role = 'super_admin'));

-- CSM can read/write touchpoints for their assigned colleges; super admin sees all
create policy csm_touchpoints_rw on csm_touchpoints for all
  using (
    exists (
      select 1 from csm_assignments
      where college_id = csm_touchpoints.college_id
        and csm_user_id = auth.uid()
        and is_active = true
    )
    or exists (select 1 from users where id = auth.uid() and role = 'super_admin')
  );

-- Same shape for issues
create policy csm_issues_rw on csm_issues for all
  using (
    exists (
      select 1 from csm_assignments
      where college_id = csm_issues.college_id
        and csm_user_id = auth.uid()
        and is_active = true
    )
    or exists (select 1 from users where id = auth.uid() and role = 'super_admin')
  );
```

Implementation note: confirm the `users.role` column matches what the admin app already checks for super-admin gating; if admin uses a different role-source (e.g. a dedicated table or a JWT claim), align RLS with that source rather than introducing a parallel check.

## Screens

Routes live under `apps/admin/src/app/(dashboard)/college-hub/account-management/`.

### Screen 1: My Colleges (CSM home)

Route: `/college-hub/account-management`

Layout: grouped by health bucket (Needs Attention / Watch / Healthy), red first. Each card shows:
- College name, neram_tier badge, current health score with color
- Days since last contact
- Top 1–2 problem signals as one-line text ("2 open issues", "profile 63%", "no leads in 32 days", "payment due 2026-05-01")
- Inline actions: `[Open]` (go to detail), `[+ Touchpoint]` (open modal)

Header controls: search by college name, filter by tier / health bucket / "has overdue follow-ups".

For super admin: a CSM filter dropdown switches the view to that CSM's colleges, plus an "All" option.

### Screen 2: College Detail

Route: `/college-hub/account-management/[collegeId]`

Tabs: **Overview** | **Touchpoints** | **Issues** | **Data**

**Overview tab:**
- Top: college name, tier badge, big health gauge (0–100), assigned CSM
- Key stats grid: payment status, profile completion %, leads this month, page views (30d), total touchpoints, open issues count
- Recent 3 touchpoints (with "see all" linking to Touchpoints tab)
- Top 3 open issues sorted by priority then due date (with "see all" linking to Issues tab)
- Quick action buttons: `+ Touchpoint`, `+ Issue`

**Touchpoints tab:**
- Reverse-chronological list. Each row: date/time, channel icon, direction arrow, summary (clickable to expand details), CSM name
- Filters: channel multi-select, date range, "has follow-up due"
- Add new touchpoint button (opens modal)

**Issues tab:**
- Default view: simple table grouped by status (Open, In Progress, Blocked, Resolved). Columns: title, priority, category, due date, assigned to
- Click an issue to open a side panel with full description, status changer, and resolution note field (no comments thread in Phase 1; resolution_note is the only narrative field)
- Add new issue button (opens modal with title, category, priority, description, due date, assignee defaulting to current CSM)

**Data tab:**
- Read-only mirror of what the college sees in their own dashboard (the editable fields from `apps/marketing/src/app/college-dashboard/page.tsx`): about, phone, email, admissions phone/email, website, YouTube, Instagram
- This avoids forcing the CSM to switch apps to verify "what did they fill in?"

### Screen 3: Quick Touchpoint Modal

Triggered from anywhere in the admin app via the "+ Touchpoint" button (always reachable from the My Colleges page and from any college detail page).

Fields, in order:
- College: auto-filled if launched from a college context, otherwise an autocomplete dropdown of the CSM's assigned colleges
- Channel: WhatsApp pre-selected (dominant channel)
- Direction: Outbound pre-selected
- Summary: single-line text, required, max 280 chars
- Details: textarea, collapsed behind "Add details" link, optional
- Follow-up date: date picker, optional, with quick-pick chips ("In 3 days", "In 1 week", "In 2 weeks")
- Buttons: `[Save]` and `[Save & Open Issue]`. The second creates a linked issue with the touchpoint's summary as title and category=`other`, priority=`medium`, opens the issue modal pre-filled for refinement.

### Navigation

New top-level item in the admin sidebar: **Account Mgmt** (icon: people-group). Sub-items:
- My Colleges (default)
- All Issues (super admin only)
- All Touchpoints (super admin only)

Add link to existing College Hub section header to make the relationship clear.

## API routes

`apps/admin/src/app/api/account-management/`

- `GET /colleges` — list assigned colleges with health scores; query params: `?bucket=red|yellow|green`, `?tier=silver|gold|platinum`, `?q=<search>`. Super admin gets `?csm=<userId>` or omit for all.
- `GET /colleges/[id]` — full college data: profile fields, payment status, lead counts, page views, touchpoint count, open issue count, health score, assigned CSM.
- `GET /colleges/[id]/touchpoints` — paginated list, filterable.
- `POST /colleges/[id]/touchpoints` — create. Body: `{ channel, direction, summary, details?, follow_up_due? }`.
- `GET /colleges/[id]/issues?status=open|in_progress|blocked|resolved|all`
- `POST /colleges/[id]/issues` — create.
- `PATCH /issues/[id]` — update status, priority, due_date, resolution_note.

All routes verify the caller is either assigned to the college (via `csm_assignments`) or is super admin. RLS provides defense in depth; API does the explicit check too for clearer error messages.

Use Server Components for read-only pages where possible (per the Vercel cost rules in CLAUDE.md), reserving API routes for mutations and for data that genuinely needs to be uncacheable per-CSM. The `/colleges` list can be cached per-CSM for ~60 seconds.

## Seed data and rollout

After migrations apply, a one-time SQL seed assigns currently-paid colleges to the 2 CSMs:
- Identify the 2 CSM `users.id` values (run an `execute_sql` query via the Supabase staging MCP first to confirm)
- Identify all colleges where `neram_tier in ('silver','gold','platinum')`
- Round-robin assign them across the 2 CSMs (or split manually based on user input during implementation)
- This is a one-shot manual SQL script, not a migration

## Testing

### Unit tests (Vitest)

- `compute_college_health` SQL function: write a Supabase test (or a Vitest integration test that runs against a local Supabase) covering each scoring rule in isolation: no contact, low profile %, high-priority open issues, urgent overdue, no recent leads, payment overdue, all-good baseline.
- API route handlers: mock Supabase client, verify auth checks reject non-assigned CSMs, verify RLS-violating writes return 403.
- TouchpointModal component: form validation (summary required, length constraints), channel/direction defaults, "Save & Open Issue" creates two records.
- Health bucket grouping logic: 80+ green, 50–79 yellow, <50 red.

### E2E tests (Playwright, `tests/e2e/admin-account-management.spec.ts`)

Project: `admin-chrome --no-deps`. Use TEACHER_ACCOUNT (which has admin access in this codebase, per `tests/utils/credentials.ts`).

- **AC1 access control**: A CSM logs in, visits My Colleges, sees only their assigned colleges (seed test data with one assigned + one not-assigned college, verify the second is absent).
- **AC2 health bucket sort**: Seed 3 colleges with scores 30/65/90, verify they appear in red/yellow/green sections in that order.
- **AC3 add touchpoint**: From My Colleges, click `+ Touchpoint` on a college card, fill modal, save; verify the touchpoint appears in the college's Touchpoints tab and `last_csm_contact_at` updates.
- **AC4 add issue**: From college detail, create an issue with priority=urgent and a past due date; verify the college's health score drops by 20 on next page load.
- **AC5 issue lifecycle**: Open an issue, mark in_progress, add a resolution note, mark resolved; verify `resolved_at` is set and the issue moves to the Resolved column.
- **AC6 super admin scope**: Log in as super admin, verify the CSM filter dropdown appears and selecting another CSM shows their colleges.
- **AC7 RLS enforcement**: API test, attempt to POST a touchpoint for a college not assigned to the caller, verify 403.
- **AC8 mobile**: At 375x812, the My Colleges page is readable, no horizontal overflow, touch targets ≥44px on the action buttons.
- **AC9 touchpoint follow-up**: Create a touchpoint with `follow_up_due = today`, verify it surfaces as a problem signal on the college card.
- **AC10 quick touchpoint <30s**: Instrumented test, time the flow from clicking `+ Touchpoint` to the modal closing after save; assert <30s with all fields filled.

## Observability

- Standard Next.js / Vercel logs for API routes
- Daily count of touchpoints per CSM, easy SQL query, no dashboard in Phase 1
- Daily count of open / resolved issues by category, same
- Future Phase 2: surface these as a tiny "this week" panel on the My Colleges page

## Risks

- **CSM doesn't log touchpoints**, defeating the system. Mitigation: the modal is one-screen, ≤30s, and is the same button they need anyway to mark an issue as actioned. If adoption fails, Phase 3's WhatsApp Business API integration removes the manual step entirely.
- **Health score gives false positives** (college that's healthy but quiet gets flagged red). Mitigation: rule-based score is intentionally simple in Phase 1; we observe for 2 weeks and tune weights based on CSM feedback before Phase 2 caches the values.
- **Payment overdue signal is hard to wire correctly** if the payments schema doesn't expose overdue state cleanly. Mitigation: implementation should drop that signal entirely from the score if it can't be queried in <50ms; the rest of the score still works.
- **RLS misconfiguration could expose cross-CSM data** in production. Mitigation: explicit API-level checks duplicate the RLS, plus AC1 and AC7 E2E tests verify both layers. Also test with the staging Supabase MCP before promoting.
- **Two CSMs handing colleges back and forth** without history. Mitigation: `csm_assignments.is_active` boolean preserves history; reassignment is "deactivate old + insert new", never UPDATE.
- **Lead activity signal misses colleges with no public listing** (e.g., colleges still being onboarded). Mitigation: implementation should suppress the "no leads in 30 days" penalty for colleges flagged as not-yet-published or inactive; verify the `colleges.verified` or equivalent flag during build.

## Open questions

None blocking. The following are minor implementation decisions to resolve during build, not now:
- Exact name of the lead-to-college foreign key (likely `lead_profiles.college_id`, confirm in implementation)
- Payment-overdue query against the existing `payments` schema (or drop the signal in Phase 1 if not cleanly queryable)
- Exact `users.role` source for super-admin RLS check (align with whatever admin app already uses)

## Out of scope (future work)

**Phase 2 (after Phase 1 is in production for ~2 weeks):**
- Nightly Supabase cron writes the cached `health_score` instead of computing on read
- Daily email digest to each CSM with their red/yellow colleges and overdue follow-ups
- Slack or email alert on new urgent issues
- "All Issues" cross-college view for super admin (currently in Phase 1 nav, but with a basic implementation; Phase 2 adds filters and bulk actions)

**Phase 3 (when CSMs ≥3 OR paid colleges ≥50):**
- WhatsApp Business API integration via Wati / Interakt / AiSensy
- Inbound WhatsApp messages auto-create draft touchpoints (CSM confirms or edits before save)
- Outbound from dashboard sends via WhatsApp API
- Templated broadcasts (e.g., "TNEA round 2 reminder to all paid colleges")
- Per-template send analytics

**Forever-out-of-scope (until proven needed):**
- ML-based churn prediction
- College-side view of issues (relationship is owned by the CSM)
- Multi-tenant / regional manager hierarchy
- Free-tier inclusion in this system (free colleges self-serve)
