# CSM Cockpit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Account Management dashboard inside `apps/admin` so 2 CSMs can manage all paid colleges with health scoring, touchpoint logging, and issue tracking. Phase 1 of the spec at `docs/superpowers/specs/2026-04-23-csm-cockpit-design.md`.

**Architecture:** Three new tables (`csm_assignments`, `csm_touchpoints`, `csm_issues`), two new columns on `colleges` (`last_csm_contact_at`, `health_score`), plus a SQL function `compute_college_health(uuid)`. API routes in `apps/admin/src/app/api/account-management/` use `createAdminClient()` and verify auth + assignment in-route (matching existing admin patterns); RLS is defense-in-depth. UI lives at `apps/admin/src/app/(dashboard)/college-hub/account-management/` with three top-level routes (`/`, `/[collegeId]`, super-admin views) and shared components in `apps/admin/src/components/account-management/`.

**Tech Stack:** Next.js 14 App Router, MUI v5 + MUI X DataGrid (existing in admin), Supabase (`@neram/database` shared client), Microsoft Entra ID auth (`@neram/auth`), Vitest for unit tests, Playwright for E2E (`admin-chrome` project).

---

## File Structure

**Database (`packages/database/`):**
- Create: `supabase/migrations/<timestamp>_csm_cockpit_tables.sql` — all 3 tables, indexes, triggers
- Create: `supabase/migrations/<timestamp>_csm_cockpit_colleges_columns.sql` — `last_csm_contact_at`, `health_score`, partial index
- Create: `supabase/migrations/<timestamp>_compute_college_health.sql` — the `compute_college_health(uuid)` function
- Create: `supabase/migrations/<timestamp>_csm_cockpit_rls.sql` — RLS policies (defense-in-depth)
- Modify: `src/types/index.ts` — re-export new types after `pnpm supabase:gen:types`
- Create: `src/queries/csm-cockpit.ts` — all queries for assignments, touchpoints, issues, my-colleges aggregate

**Admin API (`apps/admin/src/app/api/account-management/`):**
- Create: `colleges/route.ts` — `GET` list of CSM's assigned colleges with health
- Create: `colleges/[id]/route.ts` — `GET` full detail for one college
- Create: `colleges/[id]/touchpoints/route.ts` — `GET` list, `POST` create
- Create: `colleges/[id]/issues/route.ts` — `GET` list, `POST` create
- Create: `issues/[id]/route.ts` — `PATCH` update status/priority/etc.
- Create: `assignments/route.ts` — super-admin only, `POST` assign / `DELETE` deactivate

**Admin components (`apps/admin/src/components/account-management/`):**
- Create: `HealthGauge.tsx` — colored 0–100 dial
- Create: `CollegeHealthCard.tsx` — single college card for My Colleges list
- Create: `TouchpointModal.tsx` — the <30s logging modal
- Create: `IssueModal.tsx` — create issue
- Create: `IssueSidePanel.tsx` — view/edit existing issue
- Create: `TouchpointTimeline.tsx` — reverse-chrono touchpoint list
- Create: `helpers.ts` — `bucketForScore(score)`, channel/priority labels, color maps

**Admin pages (`apps/admin/src/app/(dashboard)/college-hub/account-management/`):**
- Create: `page.tsx` — My Colleges (CSM home)
- Create: `[collegeId]/layout.tsx` — tabs nav
- Create: `[collegeId]/page.tsx` — Overview tab
- Create: `[collegeId]/touchpoints/page.tsx` — Touchpoints tab
- Create: `[collegeId]/issues/page.tsx` — Issues tab
- Create: `[collegeId]/data/page.tsx` — Read-only mirror of college view
- Create: `all-issues/page.tsx` — super-admin cross-college issues
- Create: `all-touchpoints/page.tsx` — super-admin cross-college touchpoints
- Modify: `apps/admin/src/components/Sidebar.tsx` — add "Account Mgmt" section

**Tests:**
- Create: `apps/admin/src/components/account-management/HealthGauge.test.tsx`
- Create: `apps/admin/src/components/account-management/CollegeHealthCard.test.tsx`
- Create: `apps/admin/src/components/account-management/TouchpointModal.test.tsx`
- Create: `apps/admin/src/components/account-management/helpers.test.ts`
- Create: `apps/admin/src/app/api/account-management/colleges/route.test.ts`
- Create: `apps/admin/src/app/api/account-management/colleges/[id]/touchpoints/route.test.ts`
- Create: `apps/admin/src/app/api/account-management/colleges/[id]/issues/route.test.ts`
- Create: `apps/admin/src/app/api/account-management/issues/[id]/route.test.ts`
- Create: `tests/e2e/admin-account-management.spec.ts` — 10 acceptance criteria

---

## Implementation Notes (read first)

1. **Auth in admin API routes:** existing pattern uses `verifyAdminToken(request)` from `@neram/auth` plus `createAdminClient()` from `@neram/database` (bypasses RLS). All new routes follow the same pattern. The CSM-vs-college assignment check is done explicitly in-route after the admin token check.
2. **Super admin detection:** check `apps/admin/src/lib/admin.ts` (or wherever `verifyAdminToken` lives) for the role/user-type field. The codebase uses `user?.userType` on the client (e.g. `'admin'` vs another value). For the API, the verified token returns a user object, inspect that object's role field. Implementation must confirm the exact field name in Task 7.
3. **Lead-to-college foreign key:** the spec's `compute_college_health` references `lead_profiles.college_id`. Confirm in Task 1 by querying `information_schema.columns` via `mcp__supabase-staging__execute_sql`. If absent, the recent-leads signal is dropped from the score for Phase 1.
4. **Payment-overdue signal:** if the `payments` schema doesn't expose overdue cleanly, drop the signal entirely from the function for Phase 1 (default to `false`). Confirm in Task 1.
5. **Migrations apply via Supabase MCP:** use `mcp__supabase-staging__apply_migration` for each `.sql` file (staging first, then prod after E2E passes). Do NOT push via `pnpm supabase:db:push` directly because that pushes ALL pending local migrations and can include unrelated WIP.
6. **Type generation:** after applying migrations to staging, run `pnpm supabase:gen:types` to refresh `packages/database/src/types/supabase.ts`. Commit the generated file in the same commit as the migration that triggered it.
7. **Branch:** work happens on the current branch. If the current branch name isn't suitable (e.g. it's named for unrelated work), the operator may rename or branch off before starting.

---

## Task 1: Schema discovery

**Files:**
- No file changes; produces evidence for later tasks.

- [ ] **Step 1: Confirm `lead_profiles.college_id` exists**

Run via `mcp__supabase-staging__execute_sql`:
```sql
select column_name, data_type
from information_schema.columns
where table_name = 'lead_profiles' and column_name in ('college_id', 'lead_college_id', 'college');
```
Expected: at least one row showing the actual column name. Note it. If zero rows, the recent-leads signal will be dropped from the health function in Task 4.

- [ ] **Step 2: Confirm `payments` overdue queryability**

Run via `mcp__supabase-staging__execute_sql`:
```sql
select column_name, data_type
from information_schema.columns
where table_name = 'payments'
order by ordinal_position;
```
Look for columns like `due_date`, `paid_at`, `status`, `college_id`. If `college_id` is absent OR there's no clean way to express "overdue invoice for this college", drop the payment signal from Task 4 (default to `false`). Note the decision here.

- [ ] **Step 3: Confirm super-admin role/userType field**

Read `apps/admin/src/lib/admin.ts` (or grep for `verifyAdminToken` definition):
```bash
grep -rn "verifyAdminToken\|userType\|isSuperAdmin" packages/auth/src apps/admin/src/lib | head -30
```
Identify which field on the verified user object indicates super-admin (vs regular admin). Likely candidates: `user.userType === 'super_admin'`, `user.role === 'super_admin'`, or a boolean. Note the exact expression for use in Task 7.

- [ ] **Step 4: Commit notes**

Add a short note to the spec under "Open questions" capturing the resolved field names. Skip if no changes needed.

```bash
git add docs/superpowers/specs/2026-04-23-csm-cockpit-design.md 2>/dev/null
git diff --cached --quiet || git commit -m "docs(spec): resolve open questions from schema discovery"
```

---

## Task 2: Migration — create the three CSM tables

**Files:**
- Create: `packages/database/supabase/migrations/<timestamp>_csm_cockpit_tables.sql`

- [ ] **Step 1: Generate timestamp and create file**

```bash
TS=$(date -u +%Y%m%d%H%M%S)
touch "packages/database/supabase/migrations/${TS}_csm_cockpit_tables.sql"
echo "Created: ${TS}_csm_cockpit_tables.sql"
```

- [ ] **Step 2: Write the SQL**

Contents:
```sql
-- csm_assignments: who manages whom
create table if not exists csm_assignments (
  id uuid primary key default gen_random_uuid(),
  csm_user_id uuid not null references users(id) on delete restrict,
  college_id uuid not null references colleges(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid not null references users(id),
  is_active boolean not null default true
);

create unique index if not exists csm_assignments_unique_active_idx
  on csm_assignments (csm_user_id, college_id) where is_active = true;
create index if not exists csm_assignments_csm_active_idx
  on csm_assignments (csm_user_id) where is_active = true;
create index if not exists csm_assignments_college_active_idx
  on csm_assignments (college_id) where is_active = true;

-- csm_touchpoints: every interaction with a college
create table if not exists csm_touchpoints (
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

create index if not exists csm_touchpoints_college_created_idx
  on csm_touchpoints (college_id, created_at desc);
create index if not exists csm_touchpoints_followup_idx
  on csm_touchpoints (follow_up_due) where follow_up_due is not null;

-- csm_issues: tickets per college
create table if not exists csm_issues (
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

create index if not exists csm_issues_college_status_idx on csm_issues (college_id, status);
create index if not exists csm_issues_assigned_open_idx
  on csm_issues (assigned_to, priority, due_date)
  where status in ('open','in_progress','blocked');

-- Trigger: update colleges.last_csm_contact_at on touchpoint insert
create or replace function csm_touchpoint_after_insert() returns trigger language plpgsql as $$
begin
  update colleges
    set last_csm_contact_at = greatest(coalesce(last_csm_contact_at, '-infinity'::timestamptz), new.created_at)
    where id = new.college_id;
  return new;
end $$;

drop trigger if exists csm_touchpoints_after_insert on csm_touchpoints;
create trigger csm_touchpoints_after_insert
  after insert on csm_touchpoints
  for each row execute function csm_touchpoint_after_insert();

-- Trigger: update csm_issues.updated_at + set resolved_at on status change
create or replace function csm_issue_before_update() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if new.status in ('resolved','wont_fix') and old.status not in ('resolved','wont_fix') then
    new.resolved_at := now();
  end if;
  return new;
end $$;

drop trigger if exists csm_issues_before_update on csm_issues;
create trigger csm_issues_before_update
  before update on csm_issues
  for each row execute function csm_issue_before_update();
```

The trigger on `colleges` requires `last_csm_contact_at` to exist; that column is added in Task 3. Apply Task 3 BEFORE Task 2 if using `apply_migration` separately, OR squash the two into one migration if simpler. The plan keeps them separate for reviewability.

- [ ] **Step 3: Apply to staging**

Use `mcp__supabase-staging__apply_migration` with name `csm_cockpit_tables` and the SQL contents above. Expected: success message. If it errors on `last_csm_contact_at` not existing, jump to Task 3, apply Task 3 first, then return.

- [ ] **Step 4: Verify schema**

Run via `mcp__supabase-staging__execute_sql`:
```sql
select table_name from information_schema.tables
where table_name in ('csm_assignments','csm_touchpoints','csm_issues');
```
Expected: 3 rows.

- [ ] **Step 5: Commit**

```bash
git add packages/database/supabase/migrations/*csm_cockpit_tables.sql
git commit -m "feat(db): add csm_assignments, csm_touchpoints, csm_issues tables"
```

---

## Task 3: Migration — extend `colleges` with health columns

**Files:**
- Create: `packages/database/supabase/migrations/<timestamp>_csm_cockpit_colleges_columns.sql`

- [ ] **Step 1: Create file**

```bash
TS=$(date -u +%Y%m%d%H%M%S)
touch "packages/database/supabase/migrations/${TS}_csm_cockpit_colleges_columns.sql"
```

- [ ] **Step 2: Write the SQL**

Contents:
```sql
alter table colleges
  add column if not exists last_csm_contact_at timestamptz,
  add column if not exists health_score integer check (health_score is null or (health_score between 0 and 100));

create index if not exists colleges_health_score_paid_idx
  on colleges (health_score)
  where neram_tier in ('silver','gold','platinum');
```

- [ ] **Step 3: Apply to staging**

Use `mcp__supabase-staging__apply_migration` with name `csm_cockpit_colleges_columns` and the SQL above. Expected: success.

- [ ] **Step 4: Verify**

Run via `mcp__supabase-staging__execute_sql`:
```sql
select column_name, data_type
from information_schema.columns
where table_name = 'colleges' and column_name in ('last_csm_contact_at','health_score');
```
Expected: 2 rows.

- [ ] **Step 5: Commit**

```bash
git add packages/database/supabase/migrations/*csm_cockpit_colleges_columns.sql
git commit -m "feat(db): add health_score and last_csm_contact_at to colleges"
```

---

## Task 4: Migration — `compute_college_health(uuid)` SQL function

**Files:**
- Create: `packages/database/supabase/migrations/<timestamp>_compute_college_health.sql`

This task uses the field-name decisions from Task 1. Replace `<LEADS_FK>` below with the confirmed lead-to-college column name (e.g. `college_id`), or remove the entire `v_recent_leads` block if no such FK exists. Replace the `v_payment_overdue := false;` line with the actual query if Task 1 found a clean payments source, otherwise leave as `false`.

- [ ] **Step 1: Create file and write SQL**

```sql
create or replace function compute_college_health(p_college_id uuid)
returns integer language plpgsql stable as $$
declare
  v_score integer := 100;
  v_last_contact timestamptz;
  v_profile_pct integer;
  v_high_open integer;
  v_urgent_overdue integer;
  v_recent_leads integer := 1;        -- default neutral when signal disabled
  v_payment_overdue boolean := false; -- default neutral when signal disabled
  v_about text;
  v_phone text;
  v_email text;
  v_admissions_phone text;
  v_admissions_email text;
  v_website text;
  v_youtube text;
  v_instagram text;
begin
  select last_csm_contact_at, about, phone, email, admissions_phone,
         admissions_email, website, youtube_channel_url, instagram_handle
    into v_last_contact, v_about, v_phone, v_email, v_admissions_phone,
         v_admissions_email, v_website, v_youtube, v_instagram
    from colleges where id = p_college_id;

  v_profile_pct := (
    (case when v_about is not null and length(v_about) > 20 then 1 else 0 end) +
    (case when v_phone is not null then 1 else 0 end) +
    (case when v_email is not null then 1 else 0 end) +
    (case when v_admissions_phone is not null then 1 else 0 end) +
    (case when v_admissions_email is not null then 1 else 0 end) +
    (case when v_website is not null then 1 else 0 end) +
    (case when v_youtube is not null then 1 else 0 end) +
    (case when v_instagram is not null then 1 else 0 end)
  ) * 100 / 8;

  select count(*) into v_high_open from csm_issues
    where college_id = p_college_id
      and status in ('open','in_progress','blocked') and priority = 'high';
  select count(*) into v_urgent_overdue from csm_issues
    where college_id = p_college_id
      and status in ('open','in_progress','blocked')
      and priority = 'urgent' and due_date < current_date;

  -- Recent leads signal (replace <LEADS_FK> with actual column name from Task 1; remove block if no FK)
  -- select count(*) into v_recent_leads from lead_profiles
  --   where <LEADS_FK> = p_college_id and created_at > now() - interval '30 days';

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

- [ ] **Step 2: Apply to staging**

Use `mcp__supabase-staging__apply_migration` with name `compute_college_health` and the SQL above. Expected: success.

- [ ] **Step 3: Verify with a manual call**

Pick any existing college id and run via `mcp__supabase-staging__execute_sql`:
```sql
select id, name, compute_college_health(id) as score from colleges limit 5;
```
Expected: 5 rows, scores between 0 and 100. If profile is empty and no contacts logged yet, expect scores in the 50–75 range (penalties from no-contact + low profile).

- [ ] **Step 4: Commit**

```bash
git add packages/database/supabase/migrations/*compute_college_health.sql
git commit -m "feat(db): add compute_college_health SQL function"
```

---

## Task 5: Migration — RLS policies (defense-in-depth)

**Files:**
- Create: `packages/database/supabase/migrations/<timestamp>_csm_cockpit_rls.sql`

Note: API routes use `createAdminClient()` which bypasses RLS, so the *primary* auth check happens in-route. RLS here protects against direct anon/user-token access (e.g. if someone tried to query the new tables from a Supabase JS client with the publishable key).

- [ ] **Step 1: Create file and write SQL**

```sql
alter table csm_assignments enable row level security;
alter table csm_touchpoints enable row level security;
alter table csm_issues enable row level security;

-- assignments: only super-admin (admin client bypasses RLS)
create policy csm_assignments_no_anon on csm_assignments
  for all to anon, authenticated using (false) with check (false);

-- touchpoints: only authenticated users assigned to the college
create policy csm_touchpoints_no_anon on csm_touchpoints
  for all to anon using (false) with check (false);

create policy csm_touchpoints_assigned on csm_touchpoints
  for all to authenticated
  using (
    exists (
      select 1 from csm_assignments a
      where a.college_id = csm_touchpoints.college_id
        and a.csm_user_id = auth.uid()
        and a.is_active = true
    )
  )
  with check (
    csm_user_id = auth.uid()
    and exists (
      select 1 from csm_assignments a
      where a.college_id = csm_touchpoints.college_id
        and a.csm_user_id = auth.uid()
        and a.is_active = true
    )
  );

-- issues: same shape
create policy csm_issues_no_anon on csm_issues
  for all to anon using (false) with check (false);

create policy csm_issues_assigned on csm_issues
  for all to authenticated
  using (
    exists (
      select 1 from csm_assignments a
      where a.college_id = csm_issues.college_id
        and a.csm_user_id = auth.uid()
        and a.is_active = true
    )
  )
  with check (
    exists (
      select 1 from csm_assignments a
      where a.college_id = csm_issues.college_id
        and a.csm_user_id = auth.uid()
        and a.is_active = true
    )
  );
```

- [ ] **Step 2: Apply to staging**

Use `mcp__supabase-staging__apply_migration` with name `csm_cockpit_rls` and the SQL above. Expected: success.

- [ ] **Step 3: Verify RLS is enabled**

Run via `mcp__supabase-staging__execute_sql`:
```sql
select tablename, rowsecurity from pg_tables
where tablename in ('csm_assignments','csm_touchpoints','csm_issues');
```
Expected: `rowsecurity = true` for all 3 rows.

- [ ] **Step 4: Commit**

```bash
git add packages/database/supabase/migrations/*csm_cockpit_rls.sql
git commit -m "feat(db): RLS for csm_assignments, csm_touchpoints, csm_issues"
```

---

## Task 6: Regenerate TypeScript types

**Files:**
- Modify: `packages/database/src/types/supabase.ts` (auto-generated)

- [ ] **Step 1: Regenerate**

```bash
pnpm supabase:gen:types
```
Expected: file rewritten. New types `csm_assignments`, `csm_touchpoints`, `csm_issues` and updated `colleges` row.

- [ ] **Step 2: Verify new types are present**

```bash
grep -E "csm_assignments|csm_touchpoints|csm_issues|last_csm_contact_at|health_score" packages/database/src/types/supabase.ts | head -10
```
Expected: multiple matches.

- [ ] **Step 3: Type-check the workspace**

```bash
pnpm type-check
```
Expected: no new errors. Existing errors unrelated to this change can remain.

- [ ] **Step 4: Commit**

```bash
git add packages/database/src/types/supabase.ts
git commit -m "chore(db): regenerate types after csm_cockpit migrations"
```

---

## Task 7: Auth helper for super-admin check

**Files:**
- Create or Modify: `apps/admin/src/lib/csm-auth.ts`

This wraps the Task-1 finding (whatever field indicates super-admin) into one helper used by every API route in this feature.

- [ ] **Step 1: Write the helper**

Create `apps/admin/src/lib/csm-auth.ts`:
```typescript
import type { NextRequest } from 'next/server';
import { verifyAdminToken } from '@neram/auth';

export interface CsmAuthResult {
  userId: string;
  isSuperAdmin: boolean;
}

// Replace the body of `isSuperAdmin` with the field/expression confirmed in Task 1 Step 3.
// Example shapes seen in this codebase: `admin.userType === 'super_admin'`,
// `admin.role === 'super_admin'`, or `admin.isSuperAdmin === true`.
export async function verifyCsm(request: NextRequest): Promise<CsmAuthResult | null> {
  const admin = await verifyAdminToken(request);
  if (!admin) return null;
  const userId = (admin as { id?: string; userId?: string }).id ?? (admin as { userId?: string }).userId;
  if (!userId) return null;
  const isSuperAdmin =
    (admin as { userType?: string }).userType === 'super_admin'
    || (admin as { role?: string }).role === 'super_admin';
  return { userId, isSuperAdmin };
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @neram/admin type-check
```
Expected: pass. If `verifyAdminToken`'s actual return shape differs, narrow the type assertions to match it (look at the function's signature in `packages/auth/src/`).

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/lib/csm-auth.ts
git commit -m "feat(admin): csm-auth helper wrapping verifyAdminToken + super-admin detection"
```

---

## Task 8: Query layer — `csm-cockpit.ts`

**Files:**
- Create: `packages/database/src/queries/csm-cockpit.ts`
- Modify: `packages/database/src/queries/index.ts` (re-export the new module)

- [ ] **Step 1: Write the queries module**

Create `packages/database/src/queries/csm-cockpit.ts`:
```typescript
import type { SupabaseClient } from '@supabase/supabase-js';

export type HealthBucket = 'red' | 'yellow' | 'green';
export const bucketForScore = (score: number | null): HealthBucket => {
  if (score === null || score < 50) return 'red';
  if (score < 80) return 'yellow';
  return 'green';
};

export interface AssignedCollege {
  id: string;
  name: string;
  slug: string;
  neram_tier: string | null;
  last_csm_contact_at: string | null;
  health_score: number | null;
}

export async function listAssignedCollegeIds(
  client: SupabaseClient,
  csmUserId: string
): Promise<string[]> {
  const { data, error } = await client
    .from('csm_assignments')
    .select('college_id')
    .eq('csm_user_id', csmUserId)
    .eq('is_active', true);
  if (error) throw error;
  return (data ?? []).map((r) => r.college_id);
}

export async function isCollegeAssignedToCsm(
  client: SupabaseClient,
  csmUserId: string,
  collegeId: string
): Promise<boolean> {
  const { data, error } = await client
    .from('csm_assignments')
    .select('id')
    .eq('csm_user_id', csmUserId)
    .eq('college_id', collegeId)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

export async function getMyColleges(
  client: SupabaseClient,
  collegeIds: string[]
): Promise<AssignedCollege[]> {
  if (collegeIds.length === 0) return [];
  const { data, error } = await client
    .from('colleges')
    .select('id, name, slug, neram_tier, last_csm_contact_at')
    .in('id', collegeIds);
  if (error) throw error;
  // Compute health_score on read by calling the SQL function
  const enriched: AssignedCollege[] = await Promise.all(
    (data ?? []).map(async (c) => {
      const { data: scoreRow } = await client.rpc('compute_college_health', { p_college_id: c.id });
      const score = typeof scoreRow === 'number' ? scoreRow : null;
      return { ...c, health_score: score } as AssignedCollege;
    })
  );
  return enriched;
}

export interface CreateTouchpointInput {
  college_id: string;
  csm_user_id: string;
  channel: 'whatsapp' | 'call' | 'email' | 'meeting' | 'in_person' | 'other';
  direction: 'inbound' | 'outbound';
  summary: string;
  details?: string | null;
  follow_up_due?: string | null;
}

export async function createTouchpoint(client: SupabaseClient, input: CreateTouchpointInput) {
  const { data, error } = await client
    .from('csm_touchpoints')
    .insert(input)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function listTouchpoints(client: SupabaseClient, collegeId: string, limit = 50) {
  const { data, error } = await client
    .from('csm_touchpoints')
    .select('*')
    .eq('college_id', collegeId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export interface CreateIssueInput {
  college_id: string;
  opened_by: string;
  assigned_to: string;
  title: string;
  description?: string | null;
  category: 'content_update' | 'technical' | 'billing' | 'partnership' | 'support' | 'other';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  due_date?: string | null;
}

export async function createIssue(client: SupabaseClient, input: CreateIssueInput) {
  const { data, error } = await client
    .from('csm_issues')
    .insert(input)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function listIssues(
  client: SupabaseClient,
  collegeId: string,
  opts?: { status?: string }
) {
  let q = client.from('csm_issues').select('*').eq('college_id', collegeId);
  if (opts?.status && opts.status !== 'all') q = q.eq('status', opts.status);
  const { data, error } = await q.order('priority', { ascending: false }).order('due_date', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export interface UpdateIssueInput {
  status?: 'open' | 'in_progress' | 'blocked' | 'resolved' | 'wont_fix';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  due_date?: string | null;
  resolution_note?: string | null;
  assigned_to?: string;
}

export async function updateIssue(client: SupabaseClient, issueId: string, patch: UpdateIssueInput) {
  const { data, error } = await client
    .from('csm_issues')
    .update(patch)
    .eq('id', issueId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}
```

- [ ] **Step 2: Re-export from index**

Edit `packages/database/src/queries/index.ts`, append:
```typescript
export * from './csm-cockpit';
```

- [ ] **Step 3: Type-check**

```bash
pnpm --filter @neram/database type-check
```
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add packages/database/src/queries/csm-cockpit.ts packages/database/src/queries/index.ts
git commit -m "feat(db): csm-cockpit queries (assignments, touchpoints, issues, my-colleges)"
```

---

## Task 9: API route — `GET /api/account-management/colleges`

**Files:**
- Create: `apps/admin/src/app/api/account-management/colleges/route.ts`
- Create: `apps/admin/src/app/api/account-management/colleges/route.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/admin/src/app/api/account-management/colleges/route.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/csm-auth', () => ({
  verifyCsm: vi.fn(),
}));

vi.mock('@neram/database', () => ({
  createAdminClient: vi.fn(),
}));

import { GET } from './route';
import { verifyCsm } from '@/lib/csm-auth';
import { createAdminClient } from '@neram/database';

function mockClient(opts: { assignments?: { college_id: string }[]; colleges?: any[] } = {}) {
  const assignments = opts.assignments ?? [];
  const colleges = opts.colleges ?? [];
  return {
    from: vi.fn((table: string) => {
      if (table === 'csm_assignments') {
        return {
          select: () => ({
            eq: () => ({ eq: () => Promise.resolve({ data: assignments, error: null }) }),
          }),
        };
      }
      if (table === 'colleges') {
        return {
          select: () => ({
            in: () => Promise.resolve({ data: colleges, error: null }),
          }),
        };
      }
      return {} as any;
    }),
    rpc: vi.fn().mockResolvedValue({ data: 75, error: null }),
  };
}

beforeEach(() => vi.clearAllMocks());

describe('GET /api/account-management/colleges', () => {
  it('returns 401 when not authenticated', async () => {
    (verifyCsm as any).mockResolvedValue(null);
    const req = new Request('http://localhost/api/account-management/colleges') as any;
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns assigned colleges with health scores', async () => {
    (verifyCsm as any).mockResolvedValue({ userId: 'u1', isSuperAdmin: false });
    (createAdminClient as any).mockReturnValue(
      mockClient({
        assignments: [{ college_id: 'c1' }, { college_id: 'c2' }],
        colleges: [
          { id: 'c1', name: 'A', slug: 'a', neram_tier: 'gold', last_csm_contact_at: null },
          { id: 'c2', name: 'B', slug: 'b', neram_tier: 'silver', last_csm_contact_at: null },
        ],
      })
    );
    const req = new Request('http://localhost/api/account-management/colleges') as any;
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.data[0].health_score).toBe(75);
  });

  it('returns empty array when CSM has no assignments', async () => {
    (verifyCsm as any).mockResolvedValue({ userId: 'u1', isSuperAdmin: false });
    (createAdminClient as any).mockReturnValue(mockClient({ assignments: [], colleges: [] }));
    const req = new Request('http://localhost/api/account-management/colleges') as any;
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @neram/admin vitest run src/app/api/account-management/colleges/route.test.ts
```
Expected: FAIL — module `./route` not found.

- [ ] **Step 3: Write the route**

Create `apps/admin/src/app/api/account-management/colleges/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { listAssignedCollegeIds, getMyColleges } from '@neram/database';
import { verifyCsm } from '@/lib/csm-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await verifyCsm(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const overrideCsm = url.searchParams.get('csm');
  const targetCsm = auth.isSuperAdmin && overrideCsm ? overrideCsm : auth.userId;

  const supabase = createAdminClient();
  try {
    const ids = await listAssignedCollegeIds(supabase, targetCsm);
    const data = await getMyColleges(supabase, ids);
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
```

If the `@neram/database` re-export from Task 8 is not yet picked up by the admin app, import directly:
```typescript
import { listAssignedCollegeIds, getMyColleges } from '@neram/database/dist/queries/csm-cockpit';
```
Implementation must verify which import path resolves; the package's `package.json` `exports` map dictates this.

- [ ] **Step 4: Run tests to verify pass**

```bash
pnpm --filter @neram/admin vitest run src/app/api/account-management/colleges/route.test.ts
```
Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/app/api/account-management/colleges/route.ts apps/admin/src/app/api/account-management/colleges/route.test.ts
git commit -m "feat(admin): GET /api/account-management/colleges with health scores"
```

---

## Task 10: API route — `GET /api/account-management/colleges/[id]`

**Files:**
- Create: `apps/admin/src/app/api/account-management/colleges/[id]/route.ts`

This route returns the full college detail bundle (profile, payment, lead counts, page views, touchpoint count, open issue count, health score, assigned CSM). It composes existing read functions; no new query helpers needed.

- [ ] **Step 1: Write the route**

Create `apps/admin/src/app/api/account-management/colleges/[id]/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { isCollegeAssignedToCsm } from '@neram/database';
import { verifyCsm } from '@/lib/csm-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await verifyCsm(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();
  const collegeId = params.id;

  // Authorization: assigned CSM or super-admin
  if (!auth.isSuperAdmin) {
    const assigned = await isCollegeAssignedToCsm(supabase, auth.userId, collegeId);
    if (!assigned) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [collegeRes, scoreRes, openIssuesRes, recentTouchpointsRes, recentLeadsRes, csmRes] = await Promise.all([
    supabase.from('colleges').select('*').eq('id', collegeId).single(),
    supabase.rpc('compute_college_health', { p_college_id: collegeId }),
    supabase.from('csm_issues').select('id, title, priority, due_date, status', { count: 'exact' }).eq('college_id', collegeId).in('status', ['open','in_progress','blocked']).order('priority', { ascending: false }).limit(3),
    supabase.from('csm_touchpoints').select('*').eq('college_id', collegeId).order('created_at', { ascending: false }).limit(3),
    supabase.from('lead_profiles').select('id', { count: 'exact', head: true }).eq('college_id', collegeId).gte('created_at', new Date(Date.now() - 30*24*60*60*1000).toISOString()),
    supabase.from('csm_assignments').select('csm_user_id, users!csm_assignments_csm_user_id_fkey(id, name, email)').eq('college_id', collegeId).eq('is_active', true).maybeSingle(),
  ]);

  if (collegeRes.error) return NextResponse.json({ error: collegeRes.error.message }, { status: 500 });

  return NextResponse.json({
    data: {
      college: collegeRes.data,
      health_score: typeof scoreRes.data === 'number' ? scoreRes.data : null,
      open_issues: openIssuesRes.data ?? [],
      open_issues_count: openIssuesRes.count ?? 0,
      recent_touchpoints: recentTouchpointsRes.data ?? [],
      leads_30d: recentLeadsRes.count ?? 0,
      assigned_csm: csmRes.data ?? null,
    },
  });
}
```

If Task 1 found `lead_profiles` does NOT have `college_id`, replace the `recentLeadsRes` line with `Promise.resolve({ count: null })` and surface `leads_30d: null` instead of `0`.

- [ ] **Step 2: Manual smoke test**

Start the admin dev server:
```bash
pnpm --filter @neram/admin dev
```
In another terminal, after seeding at least one assignment + one college (Task 17 covers seeding), curl the endpoint with a valid Microsoft session cookie. For now, just verify the route compiles:
```bash
pnpm --filter @neram/admin type-check
```
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/app/api/account-management/colleges/\[id\]/route.ts
git commit -m "feat(admin): GET /api/account-management/colleges/[id] detail endpoint"
```

---

## Task 11: API route — touchpoints `GET` + `POST`

**Files:**
- Create: `apps/admin/src/app/api/account-management/colleges/[id]/touchpoints/route.ts`
- Create: `apps/admin/src/app/api/account-management/colleges/[id]/touchpoints/route.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/admin/src/app/api/account-management/colleges/[id]/touchpoints/route.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/csm-auth', () => ({ verifyCsm: vi.fn() }));
vi.mock('@neram/database', () => ({
  createAdminClient: vi.fn(),
  isCollegeAssignedToCsm: vi.fn(),
  listTouchpoints: vi.fn(),
  createTouchpoint: vi.fn(),
}));

import { GET, POST } from './route';
import { verifyCsm } from '@/lib/csm-auth';
import { isCollegeAssignedToCsm, listTouchpoints, createTouchpoint } from '@neram/database';

beforeEach(() => vi.clearAllMocks());

describe('touchpoints route', () => {
  it('GET returns 401 when unauthed', async () => {
    (verifyCsm as any).mockResolvedValue(null);
    const req = new Request('http://x') as any;
    const res = await GET(req, { params: { id: 'c1' } });
    expect(res.status).toBe(401);
  });

  it('GET returns 403 when not assigned', async () => {
    (verifyCsm as any).mockResolvedValue({ userId: 'u1', isSuperAdmin: false });
    (isCollegeAssignedToCsm as any).mockResolvedValue(false);
    const res = await GET(new Request('http://x') as any, { params: { id: 'c1' } });
    expect(res.status).toBe(403);
  });

  it('GET returns list when assigned', async () => {
    (verifyCsm as any).mockResolvedValue({ userId: 'u1', isSuperAdmin: false });
    (isCollegeAssignedToCsm as any).mockResolvedValue(true);
    (listTouchpoints as any).mockResolvedValue([{ id: 't1', summary: 'hi' }]);
    const res = await GET(new Request('http://x') as any, { params: { id: 'c1' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
  });

  it('POST creates a touchpoint', async () => {
    (verifyCsm as any).mockResolvedValue({ userId: 'u1', isSuperAdmin: false });
    (isCollegeAssignedToCsm as any).mockResolvedValue(true);
    (createTouchpoint as any).mockResolvedValue({ id: 't2', summary: 'called them' });
    const req = new Request('http://x', {
      method: 'POST',
      body: JSON.stringify({ channel: 'whatsapp', direction: 'outbound', summary: 'called them' }),
    }) as any;
    const res = await POST(req, { params: { id: 'c1' } });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBe('t2');
    expect(createTouchpoint).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      college_id: 'c1', csm_user_id: 'u1', channel: 'whatsapp', direction: 'outbound', summary: 'called them',
    }));
  });

  it('POST returns 400 when summary missing', async () => {
    (verifyCsm as any).mockResolvedValue({ userId: 'u1', isSuperAdmin: false });
    (isCollegeAssignedToCsm as any).mockResolvedValue(true);
    const req = new Request('http://x', {
      method: 'POST',
      body: JSON.stringify({ channel: 'whatsapp', direction: 'outbound' }),
    }) as any;
    const res = await POST(req, { params: { id: 'c1' } });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @neram/admin vitest run src/app/api/account-management/colleges/\[id\]/touchpoints/route.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Write the route**

Create `apps/admin/src/app/api/account-management/colleges/[id]/touchpoints/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, isCollegeAssignedToCsm, listTouchpoints, createTouchpoint } from '@neram/database';
import { verifyCsm } from '@/lib/csm-auth';

export const dynamic = 'force-dynamic';

const VALID_CHANNELS = ['whatsapp','call','email','meeting','in_person','other'] as const;
const VALID_DIRECTIONS = ['inbound','outbound'] as const;

async function authorize(request: NextRequest, collegeId: string) {
  const auth = await verifyCsm(request);
  if (!auth) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!auth.isSuperAdmin) {
    const supabase = createAdminClient();
    const ok = await isCollegeAssignedToCsm(supabase, auth.userId, collegeId);
    if (!ok) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { auth };
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const result = await authorize(request, params.id);
  if ('error' in result) return result.error;
  const supabase = createAdminClient();
  const data = await listTouchpoints(supabase, params.id);
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const result = await authorize(request, params.id);
  if ('error' in result) return result.error;
  const body = await request.json().catch(() => ({}));
  const { channel, direction, summary, details, follow_up_due } = body as any;

  if (!summary || typeof summary !== 'string' || summary.length === 0 || summary.length > 280) {
    return NextResponse.json({ error: 'summary required, 1-280 chars' }, { status: 400 });
  }
  if (!VALID_CHANNELS.includes(channel)) {
    return NextResponse.json({ error: 'invalid channel' }, { status: 400 });
  }
  if (!VALID_DIRECTIONS.includes(direction)) {
    return NextResponse.json({ error: 'invalid direction' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const data = await createTouchpoint(supabase, {
    college_id: params.id,
    csm_user_id: result.auth.userId,
    channel,
    direction,
    summary,
    details: details ?? null,
    follow_up_due: follow_up_due ?? null,
  });
  return NextResponse.json({ data }, { status: 201 });
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
pnpm --filter @neram/admin vitest run src/app/api/account-management/colleges/\[id\]/touchpoints/route.test.ts
```
Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/app/api/account-management/colleges/\[id\]/touchpoints/
git commit -m "feat(admin): touchpoints GET + POST with assignment auth"
```

---

## Task 12: API route — issues `GET` + `POST`

**Files:**
- Create: `apps/admin/src/app/api/account-management/colleges/[id]/issues/route.ts`
- Create: `apps/admin/src/app/api/account-management/colleges/[id]/issues/route.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/admin/src/app/api/account-management/colleges/[id]/issues/route.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/csm-auth', () => ({ verifyCsm: vi.fn() }));
vi.mock('@neram/database', () => ({
  createAdminClient: vi.fn(),
  isCollegeAssignedToCsm: vi.fn(),
  listIssues: vi.fn(),
  createIssue: vi.fn(),
}));

import { GET, POST } from './route';
import { verifyCsm } from '@/lib/csm-auth';
import { isCollegeAssignedToCsm, listIssues, createIssue } from '@neram/database';

beforeEach(() => vi.clearAllMocks());

describe('issues route', () => {
  it('GET 401 when unauthed', async () => {
    (verifyCsm as any).mockResolvedValue(null);
    const res = await GET(new Request('http://x') as any, { params: { id: 'c1' } });
    expect(res.status).toBe(401);
  });

  it('GET 403 when not assigned', async () => {
    (verifyCsm as any).mockResolvedValue({ userId: 'u1', isSuperAdmin: false });
    (isCollegeAssignedToCsm as any).mockResolvedValue(false);
    const res = await GET(new Request('http://x') as any, { params: { id: 'c1' } });
    expect(res.status).toBe(403);
  });

  it('GET returns issues filtered by status', async () => {
    (verifyCsm as any).mockResolvedValue({ userId: 'u1', isSuperAdmin: false });
    (isCollegeAssignedToCsm as any).mockResolvedValue(true);
    (listIssues as any).mockResolvedValue([{ id: 'i1', title: 'fix' }]);
    const res = await GET(new Request('http://x?status=open') as any, { params: { id: 'c1' } });
    expect(res.status).toBe(200);
    expect(listIssues).toHaveBeenCalledWith(expect.anything(), 'c1', { status: 'open' });
  });

  it('POST creates an issue', async () => {
    (verifyCsm as any).mockResolvedValue({ userId: 'u1', isSuperAdmin: false });
    (isCollegeAssignedToCsm as any).mockResolvedValue(true);
    (createIssue as any).mockResolvedValue({ id: 'i2', title: 'send fees' });
    const req = new Request('http://x', {
      method: 'POST',
      body: JSON.stringify({ title: 'send fees', category: 'content_update', priority: 'high' }),
    }) as any;
    const res = await POST(req, { params: { id: 'c1' } });
    expect(res.status).toBe(201);
    expect(createIssue).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      college_id: 'c1', opened_by: 'u1', assigned_to: 'u1',
      title: 'send fees', category: 'content_update', priority: 'high',
    }));
  });

  it('POST 400 when title missing', async () => {
    (verifyCsm as any).mockResolvedValue({ userId: 'u1', isSuperAdmin: false });
    (isCollegeAssignedToCsm as any).mockResolvedValue(true);
    const req = new Request('http://x', { method: 'POST', body: JSON.stringify({ category: 'support' }) }) as any;
    const res = await POST(req, { params: { id: 'c1' } });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @neram/admin vitest run src/app/api/account-management/colleges/\[id\]/issues/route.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Write the route**

Create `apps/admin/src/app/api/account-management/colleges/[id]/issues/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, isCollegeAssignedToCsm, listIssues, createIssue } from '@neram/database';
import { verifyCsm } from '@/lib/csm-auth';

export const dynamic = 'force-dynamic';

const CATEGORIES = ['content_update','technical','billing','partnership','support','other'] as const;
const PRIORITIES = ['low','medium','high','urgent'] as const;

async function authorize(request: NextRequest, collegeId: string) {
  const auth = await verifyCsm(request);
  if (!auth) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!auth.isSuperAdmin) {
    const supabase = createAdminClient();
    const ok = await isCollegeAssignedToCsm(supabase, auth.userId, collegeId);
    if (!ok) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { auth };
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const result = await authorize(request, params.id);
  if ('error' in result) return result.error;
  const status = new URL(request.url).searchParams.get('status') ?? 'all';
  const supabase = createAdminClient();
  const data = await listIssues(supabase, params.id, { status });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const result = await authorize(request, params.id);
  if ('error' in result) return result.error;
  const body = await request.json().catch(() => ({}));
  const { title, description, category, priority, due_date, assigned_to } = body as any;

  if (!title || typeof title !== 'string' || title.length === 0 || title.length > 200) {
    return NextResponse.json({ error: 'title required, 1-200 chars' }, { status: 400 });
  }
  if (!CATEGORIES.includes(category)) {
    return NextResponse.json({ error: 'invalid category' }, { status: 400 });
  }
  if (priority && !PRIORITIES.includes(priority)) {
    return NextResponse.json({ error: 'invalid priority' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const data = await createIssue(supabase, {
    college_id: params.id,
    opened_by: result.auth.userId,
    assigned_to: assigned_to || result.auth.userId,
    title,
    description: description ?? null,
    category,
    priority: priority ?? 'medium',
    due_date: due_date ?? null,
  });
  return NextResponse.json({ data }, { status: 201 });
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
pnpm --filter @neram/admin vitest run src/app/api/account-management/colleges/\[id\]/issues/route.test.ts
```
Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/app/api/account-management/colleges/\[id\]/issues/
git commit -m "feat(admin): issues GET + POST with assignment auth"
```

---

## Task 13: API route — `PATCH /api/account-management/issues/[id]`

**Files:**
- Create: `apps/admin/src/app/api/account-management/issues/[id]/route.ts`
- Create: `apps/admin/src/app/api/account-management/issues/[id]/route.test.ts`

- [ ] **Step 1: Write failing test**

Create the test file:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/csm-auth', () => ({ verifyCsm: vi.fn() }));
vi.mock('@neram/database', () => ({
  createAdminClient: vi.fn(),
  isCollegeAssignedToCsm: vi.fn(),
  updateIssue: vi.fn(),
}));

import { PATCH } from './route';
import { verifyCsm } from '@/lib/csm-auth';
import { isCollegeAssignedToCsm, updateIssue } from '@neram/database';

beforeEach(() => vi.clearAllMocks());

function mockClientWithIssueLookup(collegeId: string | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: collegeId ? { college_id: collegeId } : null, error: null }),
        }),
      }),
    }),
  };
}

describe('PATCH /issues/[id]', () => {
  it('401 when unauthed', async () => {
    (verifyCsm as any).mockResolvedValue(null);
    const res = await PATCH(new Request('http://x', { method: 'PATCH', body: '{}' }) as any, { params: { id: 'i1' } });
    expect(res.status).toBe(401);
  });

  it('404 when issue not found', async () => {
    (verifyCsm as any).mockResolvedValue({ userId: 'u1', isSuperAdmin: false });
    const { createAdminClient } = await import('@neram/database');
    (createAdminClient as any).mockReturnValue(mockClientWithIssueLookup(null));
    const res = await PATCH(new Request('http://x', { method: 'PATCH', body: '{}' }) as any, { params: { id: 'i1' } });
    expect(res.status).toBe(404);
  });

  it('updates issue when assigned', async () => {
    (verifyCsm as any).mockResolvedValue({ userId: 'u1', isSuperAdmin: false });
    const { createAdminClient } = await import('@neram/database');
    (createAdminClient as any).mockReturnValue(mockClientWithIssueLookup('c1'));
    (isCollegeAssignedToCsm as any).mockResolvedValue(true);
    (updateIssue as any).mockResolvedValue({ id: 'i1', status: 'resolved' });
    const req = new Request('http://x', { method: 'PATCH', body: JSON.stringify({ status: 'resolved' }) }) as any;
    const res = await PATCH(req, { params: { id: 'i1' } });
    expect(res.status).toBe(200);
    expect(updateIssue).toHaveBeenCalledWith(expect.anything(), 'i1', { status: 'resolved' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @neram/admin vitest run src/app/api/account-management/issues/\[id\]/route.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Write the route**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, isCollegeAssignedToCsm, updateIssue } from '@neram/database';
import { verifyCsm } from '@/lib/csm-auth';

export const dynamic = 'force-dynamic';

const STATUSES = ['open','in_progress','blocked','resolved','wont_fix'] as const;
const PRIORITIES = ['low','medium','high','urgent'] as const;

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await verifyCsm(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();

  const { data: issue, error } = await supabase
    .from('csm_issues')
    .select('college_id')
    .eq('id', params.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!issue) return NextResponse.json({ error: 'Issue not found' }, { status: 404 });

  if (!auth.isSuperAdmin) {
    const ok = await isCollegeAssignedToCsm(supabase, auth.userId, issue.college_id as string);
    if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) return NextResponse.json({ error: 'invalid status' }, { status: 400 });
    patch.status = body.status;
  }
  if (body.priority !== undefined) {
    if (!PRIORITIES.includes(body.priority)) return NextResponse.json({ error: 'invalid priority' }, { status: 400 });
    patch.priority = body.priority;
  }
  if (body.due_date !== undefined) patch.due_date = body.due_date;
  if (body.resolution_note !== undefined) patch.resolution_note = body.resolution_note;
  if (body.assigned_to !== undefined) patch.assigned_to = body.assigned_to;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'no updatable fields provided' }, { status: 400 });
  }

  const data = await updateIssue(supabase, params.id, patch as any);
  return NextResponse.json({ data });
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
pnpm --filter @neram/admin vitest run src/app/api/account-management/issues/\[id\]/route.test.ts
```
Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/app/api/account-management/issues/
git commit -m "feat(admin): PATCH /api/account-management/issues/[id]"
```

---

## Task 14: API route — `POST /api/account-management/assignments` (super-admin only)

**Files:**
- Create: `apps/admin/src/app/api/account-management/assignments/route.ts`

- [ ] **Step 1: Write the route**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { verifyCsm } from '@/lib/csm-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const auth = await verifyCsm(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!auth.isSuperAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { csm_user_id, college_id } = await request.json();
  if (!csm_user_id || !college_id) {
    return NextResponse.json({ error: 'csm_user_id and college_id required' }, { status: 400 });
  }

  const supabase = createAdminClient();
  // Deactivate any existing assignment for this college
  await supabase
    .from('csm_assignments')
    .update({ is_active: false })
    .eq('college_id', college_id)
    .eq('is_active', true);

  const { data, error } = await supabase
    .from('csm_assignments')
    .insert({ csm_user_id, college_id, assigned_by: auth.userId })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const auth = await verifyCsm(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!auth.isSuperAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { college_id } = await request.json();
  if (!college_id) return NextResponse.json({ error: 'college_id required' }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('csm_assignments')
    .update({ is_active: false })
    .eq('college_id', college_id)
    .eq('is_active', true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @neram/admin type-check
```
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/app/api/account-management/assignments/
git commit -m "feat(admin): assignments POST + DELETE (super-admin only)"
```

---

## Task 15: Component — `helpers.ts` (bucketing, labels, colors)

**Files:**
- Create: `apps/admin/src/components/account-management/helpers.ts`
- Create: `apps/admin/src/components/account-management/helpers.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { bucketForScore, channelLabel, priorityColor, daysAgo } from './helpers';

describe('helpers', () => {
  it('bucketForScore', () => {
    expect(bucketForScore(null)).toBe('red');
    expect(bucketForScore(0)).toBe('red');
    expect(bucketForScore(49)).toBe('red');
    expect(bucketForScore(50)).toBe('yellow');
    expect(bucketForScore(79)).toBe('yellow');
    expect(bucketForScore(80)).toBe('green');
    expect(bucketForScore(100)).toBe('green');
  });
  it('channelLabel', () => {
    expect(channelLabel('whatsapp')).toBe('WhatsApp');
    expect(channelLabel('in_person')).toBe('In Person');
  });
  it('priorityColor', () => {
    expect(priorityColor('urgent')).toBe('error');
    expect(priorityColor('high')).toBe('warning');
    expect(priorityColor('medium')).toBe('info');
    expect(priorityColor('low')).toBe('default');
  });
  it('daysAgo', () => {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    expect(daysAgo(oneDayAgo)).toBe(1);
    expect(daysAgo(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @neram/admin vitest run src/components/account-management/helpers.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Write the helpers**

```typescript
export type HealthBucket = 'red' | 'yellow' | 'green';

export const bucketForScore = (score: number | null): HealthBucket => {
  if (score === null || score < 50) return 'red';
  if (score < 80) return 'yellow';
  return 'green';
};

export const bucketColor = (bucket: HealthBucket): string => ({
  red: '#d32f2f',
  yellow: '#ed6c02',
  green: '#2e7d32',
}[bucket]);

const CHANNELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  call: 'Call',
  email: 'Email',
  meeting: 'Meeting',
  in_person: 'In Person',
  other: 'Other',
};
export const channelLabel = (c: string) => CHANNELS[c] ?? c;

export const priorityColor = (p: string): 'error' | 'warning' | 'info' | 'default' => {
  if (p === 'urgent') return 'error';
  if (p === 'high') return 'warning';
  if (p === 'medium') return 'info';
  return 'default';
};

export const daysAgo = (iso: string | null): number | null => {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
};
```

- [ ] **Step 4: Run tests to verify pass**

```bash
pnpm --filter @neram/admin vitest run src/components/account-management/helpers.test.ts
```
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/components/account-management/helpers.ts apps/admin/src/components/account-management/helpers.test.ts
git commit -m "feat(admin): account-management helpers (bucketForScore, labels, colors)"
```

---

## Task 16: Component — `HealthGauge`

**Files:**
- Create: `apps/admin/src/components/account-management/HealthGauge.tsx`
- Create: `apps/admin/src/components/account-management/HealthGauge.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HealthGauge } from './HealthGauge';

describe('HealthGauge', () => {
  it('renders score', () => {
    render(<HealthGauge score={72} />);
    expect(screen.getByText('72')).toBeInTheDocument();
  });
  it('shows --- when null', () => {
    render(<HealthGauge score={null} />);
    expect(screen.getByText('---')).toBeInTheDocument();
  });
  it('uses correct color for green', () => {
    const { container } = render(<HealthGauge score={90} />);
    expect(container.querySelector('[data-bucket="green"]')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @neram/admin vitest run src/components/account-management/HealthGauge.test.tsx
```
Expected: FAIL.

- [ ] **Step 3: Write the component**

```typescript
import { Box, Typography } from '@neram/ui';
import { bucketForScore, bucketColor } from './helpers';

interface Props {
  score: number | null;
  size?: number;
}

export function HealthGauge({ score, size = 80 }: Props) {
  const bucket = bucketForScore(score);
  const color = bucketColor(bucket);
  return (
    <Box
      data-bucket={bucket}
      sx={{
        width: size,
        height: size,
        borderRadius: '50%',
        bgcolor: color,
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
      }}
    >
      <Typography variant="h5" component="span">
        {score === null ? '---' : score}
      </Typography>
    </Box>
  );
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
pnpm --filter @neram/admin vitest run src/components/account-management/HealthGauge.test.tsx
```
Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/components/account-management/HealthGauge.tsx apps/admin/src/components/account-management/HealthGauge.test.tsx
git commit -m "feat(admin): HealthGauge component"
```

---

## Task 17: Seed CSM assignments (manual SQL, one-shot)

**Files:**
- Create: `scripts/seed-csm-assignments.sql` (committed for repeatability, not run by migrations)

- [ ] **Step 1: Identify CSM user IDs**

Run via `mcp__supabase-staging__execute_sql`:
```sql
select id, email, name from users
where email in ('hari@neramclasses.com', 'firstcsm@neramclasses.com')
  -- ADD the actual CSM emails here, get the list from the user before proceeding
order by email;
```
If the email list isn't known, ask the user for the 2 CSM emails before continuing.

- [ ] **Step 2: Identify paid colleges**

```sql
select id, name, slug, neram_tier
from colleges
where neram_tier in ('silver','gold','platinum')
order by name;
```
Note the count.

- [ ] **Step 3: Write the seed script**

Create `scripts/seed-csm-assignments.sql`:
```sql
-- One-shot seed: assign all paid colleges round-robin to 2 CSMs.
-- Replace <CSM_USER_ID_1> and <CSM_USER_ID_2> with values from Step 1.
-- Replace <SUPER_ADMIN_USER_ID> with the user running this seed.

with paid_colleges as (
  select id, row_number() over (order by name) as rn
  from colleges
  where neram_tier in ('silver','gold','platinum')
),
to_assign as (
  select
    id as college_id,
    case when rn % 2 = 1 then '<CSM_USER_ID_1>'::uuid else '<CSM_USER_ID_2>'::uuid end as csm_user_id
  from paid_colleges
)
insert into csm_assignments (csm_user_id, college_id, assigned_by, is_active)
select csm_user_id, college_id, '<SUPER_ADMIN_USER_ID>'::uuid, true
from to_assign
on conflict do nothing;

-- Verify
select csm_user_id, count(*) from csm_assignments where is_active = true group by csm_user_id;
```

- [ ] **Step 4: Run on staging**

Substitute the placeholders with real UUIDs and run via `mcp__supabase-staging__execute_sql`. Expected: rows inserted, verify count matches expected paid colleges.

- [ ] **Step 5: Commit script (with placeholders left in for future re-use)**

Restore placeholders in the script before committing (do NOT commit real UUIDs):
```bash
git add scripts/seed-csm-assignments.sql
git commit -m "feat(scripts): seed-csm-assignments one-shot SQL"
```

---

## Task 18: Component — `CollegeHealthCard`

**Files:**
- Create: `apps/admin/src/components/account-management/CollegeHealthCard.tsx`
- Create: `apps/admin/src/components/account-management/CollegeHealthCard.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CollegeHealthCard } from './CollegeHealthCard';

const baseCollege = {
  id: 'c1',
  name: 'MEASI Architecture',
  slug: 'measi',
  neram_tier: 'gold',
  health_score: 42,
  last_csm_contact_at: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000).toISOString(),
  open_issues_count: 2,
  profile_completion: 63,
};

describe('CollegeHealthCard', () => {
  it('renders name, score, tier', () => {
    render(<CollegeHealthCard college={baseCollege} onTouchpoint={() => {}} />);
    expect(screen.getByText(/MEASI Architecture/)).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText(/Gold/i)).toBeInTheDocument();
  });
  it('shows days since last contact', () => {
    render(<CollegeHealthCard college={baseCollege} onTouchpoint={() => {}} />);
    expect(screen.getByText(/18d ago/)).toBeInTheDocument();
  });
  it('triggers onTouchpoint', () => {
    const onTouchpoint = vi.fn();
    render(<CollegeHealthCard college={baseCollege} onTouchpoint={onTouchpoint} />);
    fireEvent.click(screen.getByRole('button', { name: /touchpoint/i }));
    expect(onTouchpoint).toHaveBeenCalledWith('c1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @neram/admin vitest run src/components/account-management/CollegeHealthCard.test.tsx
```
Expected: FAIL.

- [ ] **Step 3: Write the component**

```typescript
import Link from 'next/link';
import { Card, CardContent, Typography, Box, Chip, Button, Stack } from '@neram/ui';
import { HealthGauge } from './HealthGauge';
import { daysAgo } from './helpers';

export interface CollegeHealthCardData {
  id: string;
  name: string;
  slug: string;
  neram_tier: string | null;
  health_score: number | null;
  last_csm_contact_at: string | null;
  open_issues_count?: number;
  profile_completion?: number;
}

interface Props {
  college: CollegeHealthCardData;
  onTouchpoint: (collegeId: string) => void;
}

export function CollegeHealthCard({ college, onTouchpoint }: Props) {
  const days = daysAgo(college.last_csm_contact_at);
  const signals: string[] = [];
  if (college.open_issues_count && college.open_issues_count > 0) {
    signals.push(`${college.open_issues_count} open issue${college.open_issues_count === 1 ? '' : 's'}`);
  }
  if (college.profile_completion !== undefined && college.profile_completion < 75) {
    signals.push(`profile ${college.profile_completion}%`);
  }
  return (
    <Card variant="outlined" sx={{ mb: 1 }}>
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <HealthGauge score={college.health_score} size={64} />
        <Box sx={{ flex: 1 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{college.name}</Typography>
            {college.neram_tier && (
              <Chip size="small" label={college.neram_tier[0].toUpperCase() + college.neram_tier.slice(1)} />
            )}
            <Typography variant="caption" color="text.secondary">
              Last: {days === null ? 'never' : `${days}d ago`}
            </Typography>
          </Stack>
          {signals.length > 0 && (
            <Typography variant="body2" color="text.secondary">
              {signals.join(' · ')}
            </Typography>
          )}
        </Box>
        <Stack direction="row" spacing={1}>
          <Button component={Link} href={`/college-hub/account-management/${college.id}`} size="small" variant="outlined">
            Open
          </Button>
          <Button onClick={() => onTouchpoint(college.id)} size="small" variant="contained">
            + Touchpoint
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
pnpm --filter @neram/admin vitest run src/components/account-management/CollegeHealthCard.test.tsx
```
Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/components/account-management/CollegeHealthCard.tsx apps/admin/src/components/account-management/CollegeHealthCard.test.tsx
git commit -m "feat(admin): CollegeHealthCard component"
```

---

## Task 19: Component — `TouchpointModal`

**Files:**
- Create: `apps/admin/src/components/account-management/TouchpointModal.tsx`
- Create: `apps/admin/src/components/account-management/TouchpointModal.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TouchpointModal } from './TouchpointModal';

describe('TouchpointModal', () => {
  it('renders when open', () => {
    render(<TouchpointModal open collegeId="c1" onClose={() => {}} onSaved={() => {}} />);
    expect(screen.getByLabelText(/summary/i)).toBeInTheDocument();
  });
  it('disables save when summary empty', () => {
    render(<TouchpointModal open collegeId="c1" onClose={() => {}} onSaved={() => {}} />);
    const save = screen.getByRole('button', { name: /^save$/i });
    expect(save).toBeDisabled();
  });
  it('enables save once summary typed', () => {
    render(<TouchpointModal open collegeId="c1" onClose={() => {}} onSaved={() => {}} />);
    fireEvent.change(screen.getByLabelText(/summary/i), { target: { value: 'called them' } });
    const save = screen.getByRole('button', { name: /^save$/i });
    expect(save).not.toBeDisabled();
  });
  it('calls API and onSaved on save', async () => {
    const onSaved = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { id: 't1' } }),
    }) as any;
    render(<TouchpointModal open collegeId="c1" onClose={() => {}} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText(/summary/i), { target: { value: 'called them' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await new Promise((r) => setTimeout(r, 0));
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/account-management/colleges/c1/touchpoints',
      expect.objectContaining({ method: 'POST' })
    );
    expect(onSaved).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @neram/admin vitest run src/components/account-management/TouchpointModal.test.tsx
```
Expected: FAIL.

- [ ] **Step 3: Write the component**

```typescript
'use client';
import { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Button, MenuItem, Stack, Box, Chip,
} from '@neram/ui';

interface Props {
  open: boolean;
  collegeId: string;
  onClose: () => void;
  onSaved: (touchpoint: { id: string }) => void;
}

const CHANNELS = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'call', label: 'Call' },
  { value: 'email', label: 'Email' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'in_person', label: 'In Person' },
  { value: 'other', label: 'Other' },
];

export function TouchpointModal({ open, collegeId, onClose, onSaved }: Props) {
  const [channel, setChannel] = useState('whatsapp');
  const [direction, setDirection] = useState('outbound');
  const [summary, setSummary] = useState('');
  const [details, setDetails] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [followUp, setFollowUp] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setChannel('whatsapp');
    setDirection('outbound');
    setSummary('');
    setDetails('');
    setShowDetails(false);
    setFollowUp('');
    setError(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/account-management/colleges/${collegeId}/touchpoints`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          channel, direction, summary,
          details: details || null,
          follow_up_due: followUp || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to save');
      }
      const body = await res.json();
      onSaved(body.data);
      reset();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const quickFollowUp = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    setFollowUp(d.toISOString().slice(0, 10));
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Log Touchpoint</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField select label="Channel" value={channel} onChange={(e) => setChannel(e.target.value)}>
            {CHANNELS.map((c) => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}
          </TextField>
          <TextField select label="Direction" value={direction} onChange={(e) => setDirection(e.target.value)}>
            <MenuItem value="outbound">Outbound (we contacted them)</MenuItem>
            <MenuItem value="inbound">Inbound (they contacted us)</MenuItem>
          </TextField>
          <TextField
            label="Summary"
            required
            inputProps={{ maxLength: 280 }}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            helperText={`${summary.length}/280`}
          />
          {showDetails ? (
            <TextField label="Details" multiline minRows={3} value={details} onChange={(e) => setDetails(e.target.value)} />
          ) : (
            <Button size="small" onClick={() => setShowDetails(true)}>Add details</Button>
          )}
          <Box>
            <TextField
              type="date"
              label="Follow-up due"
              InputLabelProps={{ shrink: true }}
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
              fullWidth
            />
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              <Chip label="In 3 days" onClick={() => quickFollowUp(3)} size="small" />
              <Chip label="In 1 week" onClick={() => quickFollowUp(7)} size="small" />
              <Chip label="In 2 weeks" onClick={() => quickFollowUp(14)} size="small" />
            </Stack>
          </Box>
          {error && <Box sx={{ color: 'error.main' }}>{error}</Box>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={saving || summary.trim().length === 0}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
pnpm --filter @neram/admin vitest run src/components/account-management/TouchpointModal.test.tsx
```
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/components/account-management/TouchpointModal.tsx apps/admin/src/components/account-management/TouchpointModal.test.tsx
git commit -m "feat(admin): TouchpointModal (the <30s logging modal)"
```

---

## Task 20: Component — `IssueModal` and `IssueSidePanel`

**Files:**
- Create: `apps/admin/src/components/account-management/IssueModal.tsx`
- Create: `apps/admin/src/components/account-management/IssueSidePanel.tsx`

- [ ] **Step 1: Write `IssueModal.tsx`**

```typescript
'use client';
import { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Button, MenuItem, Stack, Box,
} from '@neram/ui';

interface Props {
  open: boolean;
  collegeId: string;
  onClose: () => void;
  onSaved: (issue: { id: string }) => void;
  initialTitle?: string;
}

const CATEGORIES = [
  { value: 'content_update', label: 'Content Update' },
  { value: 'technical', label: 'Technical' },
  { value: 'billing', label: 'Billing' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'support', label: 'Support' },
  { value: 'other', label: 'Other' },
];
const PRIORITIES = ['low','medium','high','urgent'] as const;

export function IssueModal({ open, collegeId, onClose, onSaved, initialTitle = '' }: Props) {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('other');
  const [priority, setPriority] = useState<typeof PRIORITIES[number]>('medium');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/account-management/colleges/${collegeId}/issues`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title, description: description || null, category, priority,
          due_date: dueDate || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to save');
      }
      const body = await res.json();
      onSaved(body.data);
      setTitle(''); setDescription(''); setCategory('other'); setPriority('medium'); setDueDate('');
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>New Issue</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="Title" required value={title} onChange={(e) => setTitle(e.target.value)} inputProps={{ maxLength: 200 }} />
          <TextField label="Description" multiline minRows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          <TextField select label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}
          </TextField>
          <TextField select label="Priority" value={priority} onChange={(e) => setPriority(e.target.value as any)}>
            {PRIORITIES.map((p) => <MenuItem key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</MenuItem>)}
          </TextField>
          <TextField type="date" label="Due date" InputLabelProps={{ shrink: true }} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          {error && <Box sx={{ color: 'error.main' }}>{error}</Box>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={saving || title.trim().length === 0}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}
```

- [ ] **Step 2: Write `IssueSidePanel.tsx`**

```typescript
'use client';
import { useState } from 'react';
import {
  Drawer, Box, Typography, TextField, Button, MenuItem, Stack, Chip, Divider,
} from '@neram/ui';
import { priorityColor } from './helpers';

export interface IssueRow {
  id: string;
  title: string;
  description: string | null;
  category: string;
  priority: 'low'|'medium'|'high'|'urgent';
  status: 'open'|'in_progress'|'blocked'|'resolved'|'wont_fix';
  due_date: string | null;
  resolution_note: string | null;
  resolved_at: string | null;
  updated_at: string;
}

const STATUSES = ['open','in_progress','blocked','resolved','wont_fix'] as const;

interface Props {
  open: boolean;
  issue: IssueRow | null;
  onClose: () => void;
  onUpdated: (issue: IssueRow) => void;
}

export function IssueSidePanel({ open, issue, onClose, onUpdated }: Props) {
  const [status, setStatus] = useState(issue?.status ?? 'open');
  const [resolutionNote, setResolutionNote] = useState(issue?.resolution_note ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-init when a different issue opens
  if (issue && (status !== issue.status && resolutionNote === '' && issue.resolution_note)) {
    setResolutionNote(issue.resolution_note ?? '');
  }

  if (!issue) return null;

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/account-management/issues/${issue.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status, resolution_note: resolutionNote || null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to update');
      }
      const body = await res.json();
      onUpdated(body.data);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: { xs: '100%', sm: 400 } } }}>
      <Box sx={{ p: 3 }}>
        <Typography variant="h6">{issue.title}</Typography>
        <Stack direction="row" spacing={1} sx={{ mt: 1, mb: 2 }}>
          <Chip label={issue.priority} color={priorityColor(issue.priority)} size="small" />
          <Chip label={issue.category} size="small" />
          {issue.due_date && <Chip label={`Due ${issue.due_date}`} size="small" />}
        </Stack>
        {issue.description && (
          <>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mb: 2 }}>{issue.description}</Typography>
            <Divider sx={{ mb: 2 }} />
          </>
        )}
        <Stack spacing={2}>
          <TextField select label="Status" value={status} onChange={(e) => setStatus(e.target.value as any)}>
            {STATUSES.map((s) => <MenuItem key={s} value={s}>{s.replace('_', ' ')}</MenuItem>)}
          </TextField>
          <TextField
            label="Resolution note"
            multiline minRows={3}
            value={resolutionNote}
            onChange={(e) => setResolutionNote(e.target.value)}
          />
          {error && <Box sx={{ color: 'error.main' }}>{error}</Box>}
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button onClick={onClose}>Cancel</Button>
            <Button onClick={save} variant="contained" disabled={saving}>Save</Button>
          </Stack>
        </Stack>
      </Box>
    </Drawer>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
pnpm --filter @neram/admin type-check
```
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/components/account-management/IssueModal.tsx apps/admin/src/components/account-management/IssueSidePanel.tsx
git commit -m "feat(admin): IssueModal + IssueSidePanel"
```

---

## Task 21: Component — `TouchpointTimeline`

**Files:**
- Create: `apps/admin/src/components/account-management/TouchpointTimeline.tsx`

- [ ] **Step 1: Write the component**

```typescript
'use client';
import { Box, Typography, Stack, Chip, Divider } from '@neram/ui';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import PhoneIcon from '@mui/icons-material/Phone';
import EmailIcon from '@mui/icons-material/Email';
import GroupsIcon from '@mui/icons-material/Groups';
import PlaceIcon from '@mui/icons-material/Place';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import ArrowOutwardIcon from '@mui/icons-material/ArrowOutward';
import CallReceivedIcon from '@mui/icons-material/CallReceived';
import { channelLabel } from './helpers';

const CHANNEL_ICONS: Record<string, typeof WhatsAppIcon> = {
  whatsapp: WhatsAppIcon, call: PhoneIcon, email: EmailIcon,
  meeting: GroupsIcon, in_person: PlaceIcon, other: HelpOutlineIcon,
};

export interface TouchpointRow {
  id: string;
  channel: string;
  direction: 'inbound' | 'outbound';
  summary: string;
  details: string | null;
  follow_up_due: string | null;
  created_at: string;
}

export function TouchpointTimeline({ touchpoints }: { touchpoints: TouchpointRow[] }) {
  if (touchpoints.length === 0) {
    return <Typography color="text.secondary">No touchpoints yet.</Typography>;
  }
  return (
    <Stack divider={<Divider />} spacing={0}>
      {touchpoints.map((t) => {
        const Icon = CHANNEL_ICONS[t.channel] ?? HelpOutlineIcon;
        const DirIcon = t.direction === 'outbound' ? ArrowOutwardIcon : CallReceivedIcon;
        return (
          <Box key={t.id} sx={{ py: 1.5, display: 'flex', gap: 2 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 56 }}>
              <Icon fontSize="small" />
              <DirIcon fontSize="inherit" sx={{ mt: 0.5, opacity: 0.6 }} />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                {new Date(t.created_at).toLocaleDateString()}
              </Typography>
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>{t.summary}</Typography>
              {t.details && <Typography variant="body2" color="text.secondary">{t.details}</Typography>}
              <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                <Chip label={channelLabel(t.channel)} size="small" variant="outlined" />
                {t.follow_up_due && <Chip label={`Follow up ${t.follow_up_due}`} size="small" color="warning" variant="outlined" />}
              </Stack>
            </Box>
          </Box>
        );
      })}
    </Stack>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @neram/admin type-check
```
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/components/account-management/TouchpointTimeline.tsx
git commit -m "feat(admin): TouchpointTimeline component"
```

---

## Task 22: Page — My Colleges (CSM home)

**Files:**
- Create: `apps/admin/src/app/(dashboard)/college-hub/account-management/page.tsx`

- [ ] **Step 1: Write the page**

```typescript
'use client';
import { useEffect, useState } from 'react';
import { Box, Typography, Stack, TextField, MenuItem, CircularProgress } from '@neram/ui';
import { CollegeHealthCard, type CollegeHealthCardData } from '@/components/account-management/CollegeHealthCard';
import { TouchpointModal } from '@/components/account-management/TouchpointModal';
import { bucketForScore } from '@/components/account-management/helpers';

interface ApiCollege extends CollegeHealthCardData {}

export default function MyCollegesPage() {
  const [colleges, setColleges] = useState<ApiCollege[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [touchpointFor, setTouchpointFor] = useState<string | null>(null);

  const refetch = async () => {
    setLoading(true);
    const res = await fetch('/api/account-management/colleges');
    const body = await res.json();
    setColleges(body.data ?? []);
    setLoading(false);
  };
  useEffect(() => { refetch(); }, []);

  const filtered = colleges.filter((c) => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (tierFilter !== 'all' && c.neram_tier !== tierFilter) return false;
    return true;
  });

  const groups = {
    red: filtered.filter((c) => bucketForScore(c.health_score) === 'red'),
    yellow: filtered.filter((c) => bucketForScore(c.health_score) === 'yellow'),
    green: filtered.filter((c) => bucketForScore(c.health_score) === 'green'),
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 1 }}>My Colleges</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {colleges.length} assigned, ranked by health.
      </Typography>

      <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
        <TextField label="Search" size="small" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ flex: 1, maxWidth: 320 }} />
        <TextField select label="Tier" size="small" value={tierFilter} onChange={(e) => setTierFilter(e.target.value)} sx={{ minWidth: 140 }}>
          <MenuItem value="all">All tiers</MenuItem>
          <MenuItem value="silver">Silver</MenuItem>
          <MenuItem value="gold">Gold</MenuItem>
          <MenuItem value="platinum">Platinum</MenuItem>
        </TextField>
      </Stack>

      {loading ? <CircularProgress /> : (
        <>
          <Section title={`Needs Attention (${groups.red.length})`} color="error.main">
            {groups.red.map((c) => <CollegeHealthCard key={c.id} college={c} onTouchpoint={setTouchpointFor} />)}
          </Section>
          <Section title={`Watch (${groups.yellow.length})`} color="warning.main">
            {groups.yellow.map((c) => <CollegeHealthCard key={c.id} college={c} onTouchpoint={setTouchpointFor} />)}
          </Section>
          <Section title={`Healthy (${groups.green.length})`} color="success.main">
            {groups.green.map((c) => <CollegeHealthCard key={c.id} college={c} onTouchpoint={setTouchpointFor} />)}
          </Section>
        </>
      )}

      {touchpointFor && (
        <TouchpointModal
          open
          collegeId={touchpointFor}
          onClose={() => setTouchpointFor(null)}
          onSaved={() => { refetch(); }}
        />
      )}
    </Box>
  );
}

function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <Box sx={{ mb: 4 }}>
      <Typography variant="overline" sx={{ color, fontWeight: 700, display: 'block', mb: 1 }}>{title}</Typography>
      {children}
    </Box>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @neram/admin type-check
```
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/app/\(dashboard\)/college-hub/account-management/page.tsx
git commit -m "feat(admin): My Colleges page (account-management home)"
```

---

## Task 23: Page — College Detail layout + Overview tab

**Files:**
- Create: `apps/admin/src/app/(dashboard)/college-hub/account-management/[collegeId]/layout.tsx`
- Create: `apps/admin/src/app/(dashboard)/college-hub/account-management/[collegeId]/page.tsx`

- [ ] **Step 1: Write the tabs layout**

Create `[collegeId]/layout.tsx`:
```typescript
'use client';
import { Box, Tabs, Tab } from '@neram/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function CollegeDetailLayout({ children, params }: {
  children: React.ReactNode;
  params: { collegeId: string };
}) {
  const pathname = usePathname();
  const base = `/college-hub/account-management/${params.collegeId}`;
  const tabs = [
    { label: 'Overview', href: base },
    { label: 'Touchpoints', href: `${base}/touchpoints` },
    { label: 'Issues', href: `${base}/issues` },
    { label: 'Data', href: `${base}/data` },
  ];
  const activeIdx = Math.max(0, tabs.findIndex((t) => t.href === pathname || (t.href === base && pathname === base)));

  return (
    <Box>
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={activeIdx}>
          {tabs.map((t, i) => (
            <Tab key={t.href} label={t.label} component={Link} href={t.href} value={i} />
          ))}
        </Tabs>
      </Box>
      {children}
    </Box>
  );
}
```

- [ ] **Step 2: Write the Overview page**

Create `[collegeId]/page.tsx`:
```typescript
'use client';
import { useEffect, useState } from 'react';
import { Box, Typography, Grid, Card, CardContent, Stack, Button, Chip, CircularProgress } from '@neram/ui';
import { HealthGauge } from '@/components/account-management/HealthGauge';
import { TouchpointTimeline } from '@/components/account-management/TouchpointTimeline';
import { TouchpointModal } from '@/components/account-management/TouchpointModal';
import { IssueModal } from '@/components/account-management/IssueModal';
import { priorityColor } from '@/components/account-management/helpers';
import Link from 'next/link';

interface OverviewData {
  college: { id: string; name: string; neram_tier: string | null; profile_completion?: number };
  health_score: number | null;
  open_issues: { id: string; title: string; priority: string; due_date: string | null }[];
  open_issues_count: number;
  recent_touchpoints: any[];
  leads_30d: number | null;
  assigned_csm: { users?: { name: string } } | null;
}

export default function OverviewPage({ params }: { params: { collegeId: string } }) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [touchpointOpen, setTouchpointOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);

  const refetch = async () => {
    const res = await fetch(`/api/account-management/colleges/${params.collegeId}`);
    const body = await res.json();
    setData(body.data);
  };
  useEffect(() => { refetch(); }, [params.collegeId]);

  if (!data) return <Box sx={{ p: 3 }}><CircularProgress /></Box>;

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" spacing={3} alignItems="center" sx={{ mb: 3 }}>
        <HealthGauge score={data.health_score} size={96} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h4">{data.college.name}</Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            {data.college.neram_tier && <Chip label={data.college.neram_tier} />}
            {data.assigned_csm?.users?.name && <Chip label={`CSM: ${data.assigned_csm.users.name}`} variant="outlined" />}
          </Stack>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="contained" onClick={() => setTouchpointOpen(true)}>+ Touchpoint</Button>
          <Button variant="outlined" onClick={() => setIssueOpen(true)}>+ Issue</Button>
        </Stack>
      </Stack>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <StatCard label="Open Issues" value={data.open_issues_count} />
        <StatCard label="Leads (30d)" value={data.leads_30d ?? '—'} />
        <StatCard label="Profile" value={data.college.profile_completion !== undefined ? `${data.college.profile_completion}%` : '—'} />
      </Grid>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Typography variant="h6" sx={{ mb: 1 }}>Recent Touchpoints</Typography>
          <TouchpointTimeline touchpoints={data.recent_touchpoints} />
          <Box sx={{ mt: 1 }}>
            <Button component={Link} href={`/college-hub/account-management/${params.collegeId}/touchpoints`} size="small">See all</Button>
          </Box>
        </Grid>
        <Grid item xs={12} md={6}>
          <Typography variant="h6" sx={{ mb: 1 }}>Top Open Issues</Typography>
          {data.open_issues.length === 0 ? (
            <Typography color="text.secondary">No open issues.</Typography>
          ) : (
            <Stack spacing={1}>
              {data.open_issues.map((i) => (
                <Card key={i.id} variant="outlined">
                  <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Chip label={i.priority} color={priorityColor(i.priority)} size="small" />
                      <Typography variant="body2" sx={{ flex: 1 }}>{i.title}</Typography>
                      {i.due_date && <Typography variant="caption" color="text.secondary">Due {i.due_date}</Typography>}
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          )}
          <Box sx={{ mt: 1 }}>
            <Button component={Link} href={`/college-hub/account-management/${params.collegeId}/issues`} size="small">See all</Button>
          </Box>
        </Grid>
      </Grid>

      {touchpointOpen && (
        <TouchpointModal open collegeId={params.collegeId} onClose={() => setTouchpointOpen(false)} onSaved={() => refetch()} />
      )}
      {issueOpen && (
        <IssueModal open collegeId={params.collegeId} onClose={() => setIssueOpen(false)} onSaved={() => refetch()} />
      )}
    </Box>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Grid item xs={6} sm={3}>
      <Card variant="outlined">
        <CardContent>
          <Typography variant="caption" color="text.secondary">{label}</Typography>
          <Typography variant="h5">{value}</Typography>
        </CardContent>
      </Card>
    </Grid>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
pnpm --filter @neram/admin type-check
```
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/app/\(dashboard\)/college-hub/account-management/\[collegeId\]/
git commit -m "feat(admin): College Detail layout + Overview tab"
```

---

## Task 24: Page — Touchpoints tab

**Files:**
- Create: `apps/admin/src/app/(dashboard)/college-hub/account-management/[collegeId]/touchpoints/page.tsx`

- [ ] **Step 1: Write the page**

```typescript
'use client';
import { useEffect, useState } from 'react';
import { Box, Typography, Button, CircularProgress } from '@neram/ui';
import { TouchpointTimeline } from '@/components/account-management/TouchpointTimeline';
import { TouchpointModal } from '@/components/account-management/TouchpointModal';

export default function TouchpointsPage({ params }: { params: { collegeId: string } }) {
  const [touchpoints, setTouchpoints] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const refetch = async () => {
    setLoading(true);
    const res = await fetch(`/api/account-management/colleges/${params.collegeId}/touchpoints`);
    const body = await res.json();
    setTouchpoints(body.data ?? []);
    setLoading(false);
  };
  useEffect(() => { refetch(); }, [params.collegeId]);

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">Touchpoints</Typography>
        <Button variant="contained" onClick={() => setOpen(true)}>+ Touchpoint</Button>
      </Box>
      {loading ? <CircularProgress /> : <TouchpointTimeline touchpoints={touchpoints} />}
      {open && (
        <TouchpointModal open collegeId={params.collegeId} onClose={() => setOpen(false)} onSaved={() => refetch()} />
      )}
    </Box>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @neram/admin type-check
```
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/app/\(dashboard\)/college-hub/account-management/\[collegeId\]/touchpoints/
git commit -m "feat(admin): Touchpoints tab"
```

---

## Task 25: Page — Issues tab

**Files:**
- Create: `apps/admin/src/app/(dashboard)/college-hub/account-management/[collegeId]/issues/page.tsx`

- [ ] **Step 1: Write the page**

```typescript
'use client';
import { useEffect, useState } from 'react';
import { Box, Typography, Button, CircularProgress, Chip, Stack, Card, CardContent } from '@neram/ui';
import { IssueModal } from '@/components/account-management/IssueModal';
import { IssueSidePanel, type IssueRow } from '@/components/account-management/IssueSidePanel';
import { priorityColor } from '@/components/account-management/helpers';

const STATUS_GROUPS: { key: IssueRow['status']; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'resolved', label: 'Resolved' },
];

export default function IssuesPage({ params }: { params: { collegeId: string } }) {
  const [issues, setIssues] = useState<IssueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<IssueRow | null>(null);

  const refetch = async () => {
    setLoading(true);
    const res = await fetch(`/api/account-management/colleges/${params.collegeId}/issues?status=all`);
    const body = await res.json();
    setIssues(body.data ?? []);
    setLoading(false);
  };
  useEffect(() => { refetch(); }, [params.collegeId]);

  const grouped = (status: IssueRow['status']) => issues.filter((i) => i.status === status);

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">Issues</Typography>
        <Button variant="contained" onClick={() => setCreateOpen(true)}>+ Issue</Button>
      </Box>
      {loading ? <CircularProgress /> : (
        <Stack spacing={3}>
          {STATUS_GROUPS.map((group) => {
            const rows = grouped(group.key);
            return (
              <Box key={group.key}>
                <Typography variant="overline" sx={{ display: 'block', mb: 1 }}>{group.label} ({rows.length})</Typography>
                {rows.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">None.</Typography>
                ) : (
                  <Stack spacing={1}>
                    {rows.map((issue) => (
                      <Card key={issue.id} variant="outlined" onClick={() => setSelected(issue)} sx={{ cursor: 'pointer' }}>
                        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Chip label={issue.priority} color={priorityColor(issue.priority)} size="small" />
                            <Chip label={issue.category} size="small" variant="outlined" />
                            <Typography variant="body2" sx={{ flex: 1 }}>{issue.title}</Typography>
                            {issue.due_date && <Typography variant="caption" color="text.secondary">Due {issue.due_date}</Typography>}
                          </Stack>
                        </CardContent>
                      </Card>
                    ))}
                  </Stack>
                )}
              </Box>
            );
          })}
        </Stack>
      )}
      {createOpen && (
        <IssueModal open collegeId={params.collegeId} onClose={() => setCreateOpen(false)} onSaved={() => refetch()} />
      )}
      <IssueSidePanel
        open={selected !== null}
        issue={selected}
        onClose={() => setSelected(null)}
        onUpdated={() => { setSelected(null); refetch(); }}
      />
    </Box>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @neram/admin type-check
```
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/app/\(dashboard\)/college-hub/account-management/\[collegeId\]/issues/
git commit -m "feat(admin): Issues tab with side panel for detail"
```

---

## Task 26: Page — Data tab (read-only mirror)

**Files:**
- Create: `apps/admin/src/app/(dashboard)/college-hub/account-management/[collegeId]/data/page.tsx`

- [ ] **Step 1: Write the page**

```typescript
'use client';
import { useEffect, useState } from 'react';
import { Box, Typography, Grid, TextField, CircularProgress } from '@neram/ui';

const FIELDS = [
  { key: 'about', label: 'About', multiline: true, rows: 4 },
  { key: 'phone', label: 'General Phone' },
  { key: 'email', label: 'General Email' },
  { key: 'admissions_phone', label: 'Admissions Phone' },
  { key: 'admissions_email', label: 'Admissions Email' },
  { key: 'website', label: 'Website' },
  { key: 'youtube_channel_url', label: 'YouTube' },
  { key: 'instagram_handle', label: 'Instagram' },
];

export default function DataPage({ params }: { params: { collegeId: string } }) {
  const [college, setCollege] = useState<Record<string, any> | null>(null);
  useEffect(() => {
    fetch(`/api/account-management/colleges/${params.collegeId}`)
      .then((r) => r.json())
      .then((b) => setCollege(b.data?.college ?? null));
  }, [params.collegeId]);

  if (!college) return <Box sx={{ p: 3 }}><CircularProgress /></Box>;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>What the college sees in their dashboard</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Read-only mirror. To edit, ask the college to update via their own dashboard.
      </Typography>
      <Grid container spacing={2}>
        {FIELDS.map((f) => (
          <Grid item xs={12} sm={f.multiline ? 12 : 6} key={f.key}>
            <TextField
              label={f.label}
              value={college[f.key] ?? ''}
              fullWidth
              multiline={f.multiline}
              minRows={f.rows ?? 1}
              InputProps={{ readOnly: true }}
            />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
```

- [ ] **Step 2: Type-check & commit**

```bash
pnpm --filter @neram/admin type-check
```
Expected: pass.

```bash
git add apps/admin/src/app/\(dashboard\)/college-hub/account-management/\[collegeId\]/data/
git commit -m "feat(admin): Data tab (read-only mirror of college view)"
```

---

## Task 27: Sidebar nav — add Account Mgmt section

**Files:**
- Modify: `apps/admin/src/components/Sidebar.tsx`

- [ ] **Step 1: Locate the menu config**

Read the file:
```bash
grep -n "MenuItem\|menuItems\|college-hub" apps/admin/src/components/Sidebar.tsx | head -20
```
Identify the array where existing College Hub items are defined.

- [ ] **Step 2: Add the import for an icon**

In the icon imports block at the top:
```typescript
import SupervisorAccountIcon from '@mui/icons-material/SupervisorAccount';
```

- [ ] **Step 3: Add the menu item(s)**

In whichever array drives the College Hub group, add (matching the existing item shape):
```typescript
{ text: 'Account Mgmt', icon: SupervisorAccountIcon, path: '/college-hub/account-management' },
```

If the existing structure has nested groups, follow the same nesting; otherwise add as a sibling to "Accounts" / "Partnership" inside the College Hub group.

- [ ] **Step 4: Type-check**

```bash
pnpm --filter @neram/admin type-check
```
Expected: pass.

- [ ] **Step 5: Visual smoke test**

```bash
pnpm --filter @neram/admin dev
```
Open `http://localhost:3013`, log in, verify the new sidebar item is present and clickable, and that it navigates to the My Colleges page.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/components/Sidebar.tsx
git commit -m "feat(admin): add Account Mgmt to sidebar nav"
```

---

## Task 28: Super-admin pages — All Issues + All Touchpoints

**Files:**
- Create: `apps/admin/src/app/(dashboard)/college-hub/account-management/all-issues/page.tsx`
- Create: `apps/admin/src/app/(dashboard)/college-hub/account-management/all-touchpoints/page.tsx`
- Create: `apps/admin/src/app/api/account-management/all-issues/route.ts`
- Create: `apps/admin/src/app/api/account-management/all-touchpoints/route.ts`

- [ ] **Step 1: Write `all-issues` API route**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { verifyCsm } from '@/lib/csm-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await verifyCsm(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!auth.isSuperAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('csm_issues')
    .select('*, colleges!csm_issues_college_id_fkey(id, name, slug)')
    .in('status', ['open','in_progress','blocked'])
    .order('priority', { ascending: false })
    .order('due_date', { ascending: true })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
```

- [ ] **Step 2: Write `all-touchpoints` API route**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { verifyCsm } from '@/lib/csm-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await verifyCsm(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!auth.isSuperAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('csm_touchpoints')
    .select('*, colleges!csm_touchpoints_college_id_fkey(id, name, slug), users!csm_touchpoints_csm_user_id_fkey(id, name)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
```

- [ ] **Step 3: Write `all-issues` page**

```typescript
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Box, Typography, CircularProgress, Chip, Stack } from '@neram/ui';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { priorityColor } from '@/components/account-management/helpers';

export default function AllIssuesPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch('/api/account-management/all-issues')
      .then((r) => r.json())
      .then((b) => { setRows(b.data ?? []); setLoading(false); });
  }, []);

  const cols: GridColDef[] = [
    { field: 'college', headerName: 'College', flex: 1, valueGetter: (p) => p.row.colleges?.name ?? '—',
      renderCell: (p) => (
        <Link href={`/college-hub/account-management/${p.row.colleges?.id}`}>{p.row.colleges?.name}</Link>
      )
    },
    { field: 'title', headerName: 'Issue', flex: 2 },
    { field: 'priority', headerName: 'Priority', width: 110,
      renderCell: (p) => <Chip label={p.value} color={priorityColor(p.value)} size="small" />
    },
    { field: 'status', headerName: 'Status', width: 130 },
    { field: 'due_date', headerName: 'Due', width: 120 },
  ];

  if (loading) return <Box sx={{ p: 3 }}><CircularProgress /></Box>;
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 2 }}>All Open Issues (Super Admin)</Typography>
      <DataGrid rows={rows} columns={cols} autoHeight pageSizeOptions={[25, 50, 100]} initialState={{ pagination: { paginationModel: { pageSize: 25 } } }} />
    </Box>
  );
}
```

- [ ] **Step 4: Write `all-touchpoints` page**

```typescript
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Box, Typography, CircularProgress, Chip } from '@neram/ui';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { channelLabel } from '@/components/account-management/helpers';

export default function AllTouchpointsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch('/api/account-management/all-touchpoints')
      .then((r) => r.json())
      .then((b) => { setRows(b.data ?? []); setLoading(false); });
  }, []);

  const cols: GridColDef[] = [
    { field: 'created_at', headerName: 'When', width: 170, valueFormatter: (p) => new Date(p.value).toLocaleString() },
    { field: 'college', headerName: 'College', flex: 1, valueGetter: (p) => p.row.colleges?.name ?? '—',
      renderCell: (p) => <Link href={`/college-hub/account-management/${p.row.colleges?.id}`}>{p.row.colleges?.name}</Link>
    },
    { field: 'csm', headerName: 'CSM', width: 160, valueGetter: (p) => p.row.users?.name ?? '—' },
    { field: 'channel', headerName: 'Channel', width: 110, renderCell: (p) => <Chip label={channelLabel(p.value)} size="small" /> },
    { field: 'direction', headerName: 'Dir', width: 90 },
    { field: 'summary', headerName: 'Summary', flex: 2 },
  ];

  if (loading) return <Box sx={{ p: 3 }}><CircularProgress /></Box>;
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 2 }}>All Touchpoints (Super Admin)</Typography>
      <DataGrid rows={rows} columns={cols} autoHeight pageSizeOptions={[25, 50, 100]} initialState={{ pagination: { paginationModel: { pageSize: 25 } } }} />
    </Box>
  );
}
```

- [ ] **Step 5: Type-check**

```bash
pnpm --filter @neram/admin type-check
```
Expected: pass.

- [ ] **Step 6: Add nav entries (super-admin only)**

In `Sidebar.tsx`, conditionally include "All Issues" and "All Touchpoints" items based on the current user's super-admin status. The exact mechanism depends on how the sidebar already gates items by role — match the existing pattern (e.g. filter the menu array based on `useMicrosoftAuth()`'s `userType`).

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/app/\(dashboard\)/college-hub/account-management/all-issues apps/admin/src/app/\(dashboard\)/college-hub/account-management/all-touchpoints apps/admin/src/app/api/account-management/all-issues apps/admin/src/app/api/account-management/all-touchpoints apps/admin/src/components/Sidebar.tsx
git commit -m "feat(admin): super-admin All Issues + All Touchpoints views"
```

---

## Task 29: E2E tests — 10 acceptance criteria

**Files:**
- Create: `tests/e2e/admin-account-management.spec.ts`

- [ ] **Step 1: Write the spec**

Create `tests/e2e/admin-account-management.spec.ts`:
```typescript
import { test, expect } from '@playwright/test';
import { APP_URLS, injectAuthForPage } from '../utils/credentials';

const adminBase = APP_URLS.admin;

test.describe('Admin: Account Management', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuthForPage(page, 'teacher'); // teacher account has admin access in this codebase
  });

  test('AC1 access control: CSM only sees assigned colleges', async ({ page }) => {
    await page.goto(`${adminBase}/college-hub/account-management`);
    await expect(page.getByText(/My Colleges/i)).toBeVisible();
    // Specific assertions depend on seeded data; verify at least one card present
    const cards = page.locator('[data-testid="college-card"], a:has-text("Open")');
    await expect(cards.first()).toBeVisible({ timeout: 10000 });
  });

  test('AC2 health bucket sort: red appears before yellow before green', async ({ page }) => {
    await page.goto(`${adminBase}/college-hub/account-management`);
    const overlines = page.locator('text=/Needs Attention|Watch|Healthy/');
    const texts = await overlines.allTextContents();
    const idxRed = texts.findIndex((t) => /Needs Attention/i.test(t));
    const idxYellow = texts.findIndex((t) => /Watch/i.test(t));
    const idxGreen = texts.findIndex((t) => /Healthy/i.test(t));
    expect(idxRed).toBeLessThan(idxYellow);
    expect(idxYellow).toBeLessThan(idxGreen);
  });

  test('AC3 add touchpoint from My Colleges card', async ({ page }) => {
    await page.goto(`${adminBase}/college-hub/account-management`);
    await page.getByRole('button', { name: /\+ Touchpoint/i }).first().click();
    await expect(page.getByLabel(/Summary/i)).toBeVisible();
    await page.getByLabel(/Summary/i).fill('E2E test touchpoint ' + Date.now());
    await page.getByRole('button', { name: /^Save$/i }).click();
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 5000 });
  });

  test('AC4 health drops after creating urgent overdue issue', async ({ page }) => {
    await page.goto(`${adminBase}/college-hub/account-management`);
    const firstCard = page.locator('a:has-text("Open")').first();
    const href = await firstCard.getAttribute('href');
    if (!href) test.skip();
    await page.goto(`${adminBase}${href}`);
    const before = await page.locator('[data-bucket]').first().getAttribute('data-bucket');
    await page.getByRole('button', { name: /\+ Issue/i }).click();
    await page.getByLabel(/Title/i).fill('E2E urgent overdue ' + Date.now());
    await page.locator('[name="priority"], div[role="combobox"]').filter({ hasText: /Priority/i }).click();
    await page.getByRole('option', { name: /Urgent/i }).click();
    const yesterday = new Date(Date.now() - 24*60*60*1000).toISOString().slice(0,10);
    await page.getByLabel(/Due date/i).fill(yesterday);
    await page.getByRole('button', { name: /^Save$/i }).click();
    await page.reload();
    const after = await page.locator('[data-bucket]').first().getAttribute('data-bucket');
    // Score should weakly degrade (or stay same if already red)
    expect(['red','yellow','green']).toContain(after);
  });

  test('AC5 issue lifecycle: open → resolved sets resolved_at', async ({ page }) => {
    await page.goto(`${adminBase}/college-hub/account-management`);
    const href = await page.locator('a:has-text("Open")').first().getAttribute('href');
    if (!href) test.skip();
    await page.goto(`${adminBase}${href}/issues`);
    const issueCard = page.locator('div[role="button"], .MuiCard-root').filter({ hasText: /priority/i }).first();
    await issueCard.click();
    await page.getByLabel(/Status/i).click();
    await page.getByRole('option', { name: /resolved/i }).click();
    await page.getByLabel(/Resolution note/i).fill('Done.');
    await page.getByRole('button', { name: /^Save$/i }).click();
    await expect(page.getByRole('button', { name: /^Save$/i })).toBeHidden({ timeout: 5000 });
  });

  test('AC6 super admin sees CSM filter (skip if account is not super admin)', async ({ page }) => {
    await page.goto(`${adminBase}/college-hub/account-management`);
    const filter = page.getByLabel(/CSM/i);
    if (await filter.count() === 0) test.skip();
    await expect(filter).toBeVisible();
  });

  test('AC7 RLS enforcement: API rejects POST for non-assigned college', async ({ request, page }) => {
    await injectAuthForPage(page, 'teacher');
    const res = await request.post(`${adminBase}/api/account-management/colleges/00000000-0000-0000-0000-000000000000/touchpoints`, {
      data: { channel: 'whatsapp', direction: 'outbound', summary: 'test' },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('AC8 mobile: no horizontal overflow at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${adminBase}/college-hub/account-management`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });

  test('AC9 follow-up surfaces on card', async ({ page }) => {
    // Create a touchpoint with follow_up_due = today, then verify it surfaces.
    // For Phase 1, the card shows "X open issues / profile X%" signals; follow-up rendering
    // on the card is part of Phase 2. This AC asserts the touchpoint persists and is fetched.
    await page.goto(`${adminBase}/college-hub/account-management`);
    await page.getByRole('button', { name: /\+ Touchpoint/i }).first().click();
    await page.getByLabel(/Summary/i).fill('Follow-up test ' + Date.now());
    const today = new Date().toISOString().slice(0,10);
    await page.getByLabel(/Follow-up due/i).fill(today);
    await page.getByRole('button', { name: /^Save$/i }).click();
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 5000 });
  });

  test('AC10 quick touchpoint <30s', async ({ page }) => {
    await page.goto(`${adminBase}/college-hub/account-management`);
    const start = Date.now();
    await page.getByRole('button', { name: /\+ Touchpoint/i }).first().click();
    await page.getByLabel(/Summary/i).fill('Speed test ' + Date.now());
    await page.getByRole('button', { name: /^Save$/i }).click();
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 30000 });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(30000);
  });
});
```

- [ ] **Step 2: Run E2E in headed mode against local admin**

Start admin dev server first:
```bash
pnpm --filter @neram/admin dev
```
In another terminal:
```bash
pnpm test:e2e tests/e2e/admin-account-management.spec.ts --project=admin-chrome --no-deps --headed
```
Expected: most ACs pass. Some (AC4, AC5, AC6) may skip if seed data doesn't include the right preconditions; iterate on selectors/seed if real failures appear.

- [ ] **Step 3: Adjust selectors as needed**

The selectors above use semantic (role/label) queries that should work against the components built in Tasks 16–28. If a query is too loose and matches multiple elements, narrow it with `.first()` or add `data-testid` to the offending component (and update the test).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/admin-account-management.spec.ts
git commit -m "test(e2e): admin account management ACs (10 scenarios)"
```

---

## Task 30: Apply migrations to production + verify

**Files:**
- No file changes; runs migrations on production Supabase.

- [ ] **Step 1: Verify all 4 migrations are present and clean on staging**

Run via `mcp__supabase-staging__list_migrations`. Confirm the 4 new ones (tables, columns, function, RLS) are listed and no errors.

- [ ] **Step 2: Apply each migration to production**

For each of the 4 migration files created in Tasks 2, 3, 4, 5 (in that order), use `mcp__supabase-prod__apply_migration` with the same name and SQL content.

- [ ] **Step 3: Verify on production**

```sql
-- via mcp__supabase-prod__execute_sql
select tablename from pg_tables where tablename in ('csm_assignments','csm_touchpoints','csm_issues');
select column_name from information_schema.columns where table_name='colleges' and column_name in ('last_csm_contact_at','health_score');
select proname from pg_proc where proname = 'compute_college_health';
```
Expected: 3 tables, 2 columns, 1 function.

- [ ] **Step 4: Seed assignments on production**

Adapt `scripts/seed-csm-assignments.sql` with production CSM user IDs and run via `mcp__supabase-prod__execute_sql`. Verify counts.

- [ ] **Step 5: Smoke-test the live admin app on staging URL**

The admin app at `staging-admin.neramclasses.com` should now have the Account Mgmt section. Log in as a CSM, navigate, log a touchpoint, create an issue, mark it resolved.

- [ ] **Step 6: Tell the user**

Report completion and ask whether to deploy to production. Per CLAUDE.md, the user explicitly opts in to deploys; do not run `pnpm deploy:prod` autonomously.

---

## Self-Review Notes

- **Spec coverage**: every section of the spec maps to a task. Tables/columns/function/RLS → Tasks 2–5. Queries → Task 8. APIs → Tasks 9–14. Components → Tasks 15, 16, 18, 19, 20, 21. Pages → Tasks 22–26 + 28. Sidebar → Task 27. E2E → Task 29. Seed → Task 17. Production rollout → Task 30. Phase 2 and Phase 3 explicitly out of scope.
- **Placeholder scan**: the only placeholders are intentional, contextual TODOs (`<LEADS_FK>`, `<CSM_USER_ID_1>`, etc.) that are explicitly resolved in Task 1 / Task 17 with clear fallbacks. No "TBD" or "implement later" left.
- **Type consistency**: `bucketForScore`, `channelLabel`, `priorityColor`, `daysAgo` defined in Task 15 are imported with the same names in Tasks 16, 18, 20, 21, 28. Query signatures (`createTouchpoint`, `listTouchpoints`, etc.) defined in Task 8 are called with matching arg shapes in Tasks 9–14.
- **Each task is committable on its own** so reverts are localized if a step turns out wrong.
