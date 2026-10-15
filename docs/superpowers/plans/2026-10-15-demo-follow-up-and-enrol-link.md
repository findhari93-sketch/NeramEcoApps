# Demo Follow-up Cycle and Demo Enrolment Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every demo attendee enters a follow-up cycle (owner, outcomes, next dates, morning digests) and can be enrolled through a Direct Enroll link tied to their existing account and demo, counted as joined through the demo.

**Architecture:** Demo follow-ups are `callback_requests` rows (`query_type` `post_demo` / `demo_rebook`) so the existing Follow-ups queue, badge and timeline see them. Pure rules (outcomes, owner, digest text) live in `packages/database/src/utils/demo-follow-up.ts`; DB access in `packages/database/src/queries/demo-follow-ups.ts`. Direct-enrolment links gain `user_id` + `demo_registration_id`; the marketing enrol flow signs in by phone OTP and completes under that user. A daily admin cron builds digests (bell, Telegram, email) and queues Teams messages in `staff_digest_messages`, which the Nexus cron that already owns the Neram Assistant sends.

**Tech Stack:** Next.js 14 (admin, marketing, nexus), Supabase Postgres (MCP `mcp__supabase-staging__apply_migration`), MUI via `@neram/ui`, Vitest (run from repo root: `npx vitest run <path>`), Resend, Telegram.

**Spec:** `docs/superpowers/specs/2026-10-15-demo-follow-up-and-enrol-link-design.md`

## Global Constraints

- No em dashes or double dashes in any user-visible text (CLAUDE.md content rule).
- Every UI task starts by invoking the `ui-ux-pro-max` skill and ends with its review; admin is desktop-first (1024 and 1440 px), the marketing enrol page is mobile-first (375 px, no horizontal scroll, 44 px targets).
- `@neram/ui` theme is the source of truth; SVG icons from `@mui/icons-material`, never emoji.
- Migrations are idempotent (`IF NOT EXISTS`, `DROP ... IF EXISTS`), live in `supabase/migrations/`, are applied to STAGING only via `mcp__supabase-staging__apply_migration` during the build, then `NOTIFY pgrst, 'reload schema'`. Production is applied only at the founder's deploy command.
- A new enum value is added in its own migration file (it cannot be used in the transaction that adds it).
- Never commit, push or deploy unless the founder says so. Never `git stash`. Stage only files this plan touches.
- Times are India time: use `istDateKey` / `istDateTime` from `packages/database/src/utils/demo-schedule.ts`; never format a date without `timeZone: 'Asia/Kolkata'`.
- Owner order default: Tamil Selvan (`tamilselvan@neramclasses.com`), then Shanthi (`shanthimano@nerasmclasses.onmicrosoft.com`); manager Hari (`haribabu@neramclasses.com`).
- First follow-up default: 2 days after the demo at 11:00 IST. No-show rebook: next day 11:00 IST. No answer retry: +2 days. Hard to reach: 3 consecutive No answers. Joined by hand reopens after 14 days without a `student_profiles` row.
- Admin local API testing: `Authorization: Bearer test_<base64 of e2etestingteacher@neramclasses.com>` against `http://localhost:3013` (staging DB), with `DEMO_TEAMS_DRY_RUN=true` in `apps/admin/.env.local`.

## Review Focus

1. A student attends a second demo while an after-demo follow-up is open: expect the open row updated (new demo id and date), never a second open row. Pinned in Task 3 (unique index plus upsert test script) and Task 2 (`pickExistingOpenFollowUp`).
2. A demo student opens the enrol link signed in with Google that has a different, older account: expect "Sign in with the number you used for your demo", no enrolment written. Pinned in Task 2 (`decideEnrolUser` tests).
3. A follow-up's owner was disabled: expect the next active person in the order, then the manager. Pinned in Task 2 (`resolveFollowUpOwnerId` tests).
4. A user enrols through the normal application payment, not the link: expect their open demo follow-up closed as Joined. Pinned in Task 9 (sweep) with a staging check.
5. The staff-entered phone already carries +91: expect the link dialog to show ten digits and save one +91. Pinned in Task 7 (`tenDigitPhone` test).

---

### Task 1: Migrations (staging)

**Files:**
- Create: `supabase/migrations/20261129090000_callback_outcome_demo_values.sql`
- Create: `supabase/migrations/20261129090100_demo_follow_ups.sql`

**Interfaces:**
- Produces: `callback_requests.demo_registration_id uuid`, `.interest_level text`, `.flags text[]`; view `crm_follow_ups` with the same columns plus `demo_registration_id, interest_level, flags`; enum `callback_outcome` values `thinking, will_join, joined, not_interested`; `direct_enrollment_links.user_id`, `.demo_registration_id`; `lead_profiles.demo_registration_id`; table `staff_digest_messages`; `get_user_timeline` events "Attended a demo class" and "Joined through a demo class".

- [ ] **Step 1: Write the enum migration**

```sql
-- Demo follow-up outcomes (spec 2026-10-15). Own file: a new enum value cannot
-- be used in the transaction that adds it.
ALTER TYPE callback_outcome ADD VALUE IF NOT EXISTS 'thinking';
ALTER TYPE callback_outcome ADD VALUE IF NOT EXISTS 'will_join';
ALTER TYPE callback_outcome ADD VALUE IF NOT EXISTS 'joined';
ALTER TYPE callback_outcome ADD VALUE IF NOT EXISTS 'not_interested';
```

- [ ] **Step 2: Write the schema migration**

`20261129090100_demo_follow_ups.sql`. For the `get_user_timeline` part, copy the whole `CREATE OR REPLACE FUNCTION public.get_user_timeline ... $$;` statement from `supabase/migrations/20261012090000_user_timeline.sql` (lines 16 to 132 at the time of writing; first confirm prod and staging still match it with `select pg_get_functiondef('public.get_user_timeline(uuid,integer,timestamptz)'::regprocedure)` on staging), and in it replace the single demo branch

```sql
    SELECT d.created_at, 'demo', 'Booked a demo class',
           jsonb_strip_nulls(jsonb_build_object('status', d.status::text, 'attended', d.attended)), NULL, NULL
      FROM demo_class_registrations d WHERE d.user_id = p_user_id
```

with

```sql
    SELECT d.created_at, 'demo', 'Booked a demo class',
           jsonb_strip_nulls(jsonb_build_object('status', d.status::text, 'ref', d.ref_code)), NULL, NULL
      FROM demo_class_registrations d WHERE d.user_id = p_user_id
    UNION ALL
    SELECT COALESCE(d.scheduled_start, d.attendance_marked_at), 'demo', 'Attended a demo class',
           jsonb_strip_nulls(jsonb_build_object('ref', d.ref_code)), d.attendance_marked_by, 'admin'
      FROM demo_class_registrations d WHERE d.user_id = p_user_id AND d.attended IS TRUE
    UNION ALL
    SELECT COALESCE(lp.reviewed_at, lp.updated_at), 'enrollment', 'Joined through a demo class',
           jsonb_strip_nulls(jsonb_build_object('ref', dd.ref_code)), lp.reviewed_by, 'admin'
      FROM lead_profiles lp JOIN demo_class_registrations dd ON dd.id = lp.demo_registration_id
     WHERE lp.user_id = p_user_id
```

The rest of the file:

```sql
-- ============================================================================
-- Demo follow-up cycle + demo enrolment link (spec 2026-10-15, Part A).
-- Demo follow-ups are callback_requests rows (query_type post_demo / demo_rebook)
-- so the Follow-ups queue, badge and timeline see them without a new table.
-- ============================================================================

ALTER TABLE public.callback_requests
  ADD COLUMN IF NOT EXISTS demo_registration_id uuid REFERENCES public.demo_class_registrations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS interest_level text,
  ADD COLUMN IF NOT EXISTS flags text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.callback_requests DROP CONSTRAINT IF EXISTS callback_requests_interest_level_check;
ALTER TABLE public.callback_requests
  ADD CONSTRAINT callback_requests_interest_level_check CHECK (interest_level IS NULL OR interest_level IN ('hot', 'warm', 'cold'));

-- One open demo follow-up per person: a second demo updates it.
CREATE UNIQUE INDEX IF NOT EXISTS idx_callback_one_open_demo_follow_up
  ON public.callback_requests (user_id)
  WHERE user_id IS NOT NULL
    AND query_type IN ('post_demo', 'demo_rebook')
    AND status IN ('pending', 'scheduled', 'attempted');

CREATE INDEX IF NOT EXISTS idx_callback_requests_demo ON public.callback_requests (demo_registration_id)
  WHERE demo_registration_id IS NOT NULL;

-- Same columns as 20261013090000, three appended at the end (OR REPLACE allows appending).
CREATE OR REPLACE VIEW public.crm_follow_ups
WITH (security_invoker = true) AS
SELECT
  cr.id AS callback_id,
  cr.user_id,
  COALESCE(u.name, cr.name) AS person_name,
  COALESCE(u.phone, cr.phone) AS person_phone,
  cr.status,
  COALESCE(cr.scheduled_callback_at, cr.scheduled_at, cr.preferred_date::timestamptz, cr.created_at) AS due_at,
  cr.preferred_slot,
  cr.query_type,
  cr.notes,
  cr.attempt_count,
  cr.last_attempt_at,
  cr.assigned_to,
  assignee.name AS assigned_to_name,
  u.crm_owner_id,
  owner.name AS owner_name,
  lv.lifecycle_stage,
  lv.crm_stage,
  lv.contacted_status,
  cr.created_at,
  cr.demo_registration_id,
  cr.interest_level,
  cr.flags
FROM public.callback_requests cr
LEFT JOIN public.users u ON u.id = cr.user_id
LEFT JOIN public.users assignee ON assignee.id = cr.assigned_to
LEFT JOIN public.users owner ON owner.id = u.crm_owner_id
LEFT JOIN public.user_lifecycle_view lv ON lv.id = cr.user_id
WHERE cr.status IN ('pending', 'scheduled', 'attempted')
  AND COALESCE(cr.is_dead_lead, false) = false;

-- Direct Enroll links made from a demo: whose account and which demo.
ALTER TABLE public.direct_enrollment_links
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS demo_registration_id uuid REFERENCES public.demo_class_registrations(id) ON DELETE SET NULL;

-- Anyone with the anon key could read every active link (name, phone, email,
-- fees). Validation runs on the server with the service role.
DROP POLICY IF EXISTS "Anyone can validate active links by token" ON public.direct_enrollment_links;

-- The application that came from a demo.
ALTER TABLE public.lead_profiles
  ADD COLUMN IF NOT EXISTS demo_registration_id uuid REFERENCES public.demo_class_registrations(id) ON DELETE SET NULL;

-- Teams digests: built by the admin cron, sent by Nexus (it owns the Neram Assistant bot).
CREATE TABLE IF NOT EXISTS public.staff_digest_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('follow_up_digest', 'follow_up_manager', 'follow_up_soon')),
  dedupe_key text NOT NULL UNIQUE,
  subject text NOT NULL,
  plain text NOT NULL,
  link text NOT NULL,
  send_after timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  error_message text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_staff_digest_due ON public.staff_digest_messages (send_after) WHERE status = 'pending';
ALTER TABLE public.staff_digest_messages ENABLE ROW LEVEL SECURITY;

-- (get_user_timeline CREATE OR REPLACE from Step 2 goes here, followed by its REVOKE/GRANT lines.)

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 3: Apply to staging**

Run `mcp__supabase-staging__apply_migration` with name `callback_outcome_demo_values` and the Step 1 SQL, then name `demo_follow_ups` with the Step 2 SQL.

- [ ] **Step 4: Verify on staging**

Run with `mcp__supabase-staging__execute_sql`:

```sql
select
  (select count(*) from information_schema.columns where table_name='callback_requests' and column_name in ('demo_registration_id','interest_level','flags')) as cr_cols,
  (select count(*) from information_schema.columns where table_name='crm_follow_ups' and column_name in ('demo_registration_id','interest_level','flags')) as view_cols,
  (select count(*) from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='callback_outcome' and e.enumlabel in ('thinking','will_join','joined','not_interested')) as enum_vals,
  (select count(*) from pg_policies where tablename='direct_enrollment_links' and policyname='Anyone can validate active links by token') as anon_policy,
  (select count(*) from information_schema.tables where table_name='staff_digest_messages') as digest_table;
```

Expected: `3, 3, 4, 0, 1`. Also run `select count(*) from get_user_timeline((select id from users limit 1), 5, null);` and expect no error.

---

### Task 2: Pure follow-up rules

**Files:**
- Create: `packages/database/src/utils/demo-follow-up.ts`
- Create: `packages/database/src/utils/demo-follow-up.test.ts`
- Modify: `packages/database/src/utils/demo-schedule.ts` (settings fields)
- Modify: `packages/database/src/utils/demo-schedule.test.ts`
- Modify: `packages/database/src/index.ts` (export)
- Modify: `packages/database/package.json` (`"./demo-follow-up"` export for client components)

**Interfaces:**
- Produces (all exported from `@neram/database` and `@neram/database/demo-follow-up`):
  - `type InterestLevel = 'hot' | 'warm' | 'cold'`
  - `type FollowUpOutcome = 'thinking' | 'will_join' | 'no_answer' | 'not_interested' | 'joined'`
  - `type DemoFollowUpKind = 'post_demo' | 'demo_rebook'`
  - `INTEREST_LABELS: Record<InterestLevel, string>`, `FOLLOW_UP_OUTCOME_LABELS: Record<FollowUpOutcome, string>`
  - `firstFollowUpAt(now: Date): Date`, `rebookFollowUpAt(now: Date): Date`
  - `applyFollowUpOutcome(input: OutcomeInput): OutcomeResult`
  - `resolveFollowUpOwnerId(input: OwnerInput): string | null`
  - `decideEnrolUser(input: EnrolUserInput): EnrolUserDecision`
  - `buildOwnerDigest(...)`, `buildManagerSummary(...)`
  - In `demo-schedule.ts`: `DemoSettings.followUpOwnerUpns: string[]`, `DemoSettings.followUpManagerUpn: string | null`.

- [ ] **Step 1: Write the failing tests**

`packages/database/src/utils/demo-follow-up.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  applyFollowUpOutcome,
  firstFollowUpAt,
  rebookFollowUpAt,
  resolveFollowUpOwnerId,
  decideEnrolUser,
  buildOwnerDigest,
  buildManagerSummary,
  type DigestRow,
} from './demo-follow-up';

// 2026-10-15 10:00 IST
const NOW = new Date('2026-10-15T04:30:00Z');

describe('default dates', () => {
  it('first follow-up is 2 days later at 11:00 IST', () => {
    expect(firstFollowUpAt(NOW).toISOString()).toBe('2026-10-17T05:30:00.000Z');
  });
  it('rebook is next day at 11:00 IST', () => {
    expect(rebookFollowUpAt(NOW).toISOString()).toBe('2026-10-16T05:30:00.000Z');
  });
});

describe('applyFollowUpOutcome', () => {
  const next = '2026-10-20T12:30:00.000Z';
  it('thinking needs a next date and stays scheduled', () => {
    expect(applyFollowUpOutcome({ outcome: 'thinking', now: NOW, recent: [] })).toEqual({ error: 'Pick the next follow-up date.' });
    const r = applyFollowUpOutcome({ outcome: 'thinking', nextAt: next, now: NOW, recent: [] });
    expect(r).toMatchObject({ status: 'scheduled', scheduledAt: next, attemptOutcome: 'thinking', removeFlags: ['hard_to_reach'] });
  });
  it('will join uses the join date', () => {
    expect(applyFollowUpOutcome({ outcome: 'will_join', nextAt: next, now: NOW, recent: [] })).toMatchObject({ status: 'scheduled', scheduledAt: next });
  });
  it('no answer retries in 2 days and flags after 3 in a row', () => {
    const r1 = applyFollowUpOutcome({ outcome: 'no_answer', now: NOW, recent: [] });
    expect(r1).toMatchObject({ status: 'scheduled', scheduledAt: '2026-10-17T04:30:00.000Z', attemptOutcome: 'not_picked_up', addFlags: [] });
    const r3 = applyFollowUpOutcome({ outcome: 'no_answer', now: NOW, recent: ['not_picked_up', 'not_picked_up', 'thinking'] });
    expect(r3).toMatchObject({ addFlags: ['hard_to_reach'] });
    const r2 = applyFollowUpOutcome({ outcome: 'no_answer', now: NOW, recent: ['not_picked_up', 'thinking', 'not_picked_up'] });
    expect(r2).toMatchObject({ addFlags: [] });
  });
  it('not interested needs a reason and closes', () => {
    expect(applyFollowUpOutcome({ outcome: 'not_interested', now: NOW, recent: [] })).toEqual({ error: 'Add the reason so the team knows why.' });
    expect(applyFollowUpOutcome({ outcome: 'not_interested', reason: 'Fees', now: NOW, recent: [] })).toMatchObject({ status: 'completed', scheduledAt: null, attemptOutcome: 'not_interested' });
  });
  it('joined closes', () => {
    expect(applyFollowUpOutcome({ outcome: 'joined', now: NOW, recent: [] })).toMatchObject({ status: 'completed', attemptOutcome: 'joined', removeFlags: ['hard_to_reach', 'payment_pending'] });
  });
  it('rejects a next date in the past', () => {
    expect(applyFollowUpOutcome({ outcome: 'thinking', nextAt: '2026-10-14T05:00:00.000Z', now: NOW, recent: [] })).toEqual({ error: 'The next follow-up must be in the future.' });
  });
});

describe('resolveFollowUpOwnerId', () => {
  const staff = {
    'tamilselvan@neramclasses.com': { id: 't', active: true },
    'shanthimano@nerasmclasses.onmicrosoft.com': { id: 's', active: true },
    'haribabu@neramclasses.com': { id: 'h', active: true },
  };
  const order = ['tamilselvan@neramclasses.com', 'shanthimano@nerasmclasses.onmicrosoft.com'];
  it('CRM owner wins when active', () => {
    expect(resolveFollowUpOwnerId({ crmOwnerId: 'x', crmOwnerActive: true, ownerOrder: order, managerUpn: 'haribabu@neramclasses.com', staffByUpn: staff })).toBe('x');
  });
  it('falls to the order, skipping disabled staff, then the manager', () => {
    expect(resolveFollowUpOwnerId({ crmOwnerId: 'x', crmOwnerActive: false, ownerOrder: order, managerUpn: 'haribabu@neramclasses.com', staffByUpn: staff })).toBe('t');
    const tOff = { ...staff, 'tamilselvan@neramclasses.com': { id: 't', active: false } };
    expect(resolveFollowUpOwnerId({ crmOwnerId: null, crmOwnerActive: false, ownerOrder: order, managerUpn: 'haribabu@neramclasses.com', staffByUpn: tOff })).toBe('s');
    expect(resolveFollowUpOwnerId({ crmOwnerId: null, crmOwnerActive: false, ownerOrder: [], managerUpn: 'haribabu@neramclasses.com', staffByUpn: staff })).toBe('h');
    expect(resolveFollowUpOwnerId({ crmOwnerId: null, crmOwnerActive: false, ownerOrder: [], managerUpn: null, staffByUpn: staff })).toBeNull();
  });
});

describe('decideEnrolUser', () => {
  it('same user continues', () => {
    expect(decideEnrolUser({ linkUserId: 'u1', signedInUserId: 'u1', signedInIsDisposable: false })).toEqual({ action: 'continue', userId: 'u1' });
  });
  it('a link with no user keeps the old behaviour', () => {
    expect(decideEnrolUser({ linkUserId: null, signedInUserId: 'u9', signedInIsDisposable: false })).toEqual({ action: 'continue', userId: 'u9' });
  });
  it('a fresh shell is merged into the demo account', () => {
    expect(decideEnrolUser({ linkUserId: 'u1', signedInUserId: 'u2', signedInIsDisposable: true })).toEqual({ action: 'merge', userId: 'u1', mergeFrom: 'u2' });
  });
  it('another real account is refused', () => {
    expect(decideEnrolUser({ linkUserId: 'u1', signedInUserId: 'u2', signedInIsDisposable: false })).toEqual({
      action: 'refuse',
      message: 'Sign in with the number you used for your demo.',
    });
  });
});

describe('digests', () => {
  const rows: DigestRow[] = [
    { callback_id: 'c1', user_id: 'p1', person_name: 'Aamna Khan', person_phone: '+919967221751', due_at: '2026-10-14T05:30:00Z', interest_level: 'hot', owner_id: 't', query_type: 'post_demo', flags: [] },
    { callback_id: 'c2', user_id: 'p2', person_name: 'Priya', person_phone: '+919000000001', due_at: '2026-10-15T09:00:00Z', interest_level: 'warm', owner_id: 't', query_type: 'post_demo', flags: [] },
    { callback_id: 'c3', user_id: 'p3', person_name: 'Ravi', person_phone: null, due_at: '2026-10-15T11:00:00Z', interest_level: null, owner_id: 's', query_type: null, flags: [] },
  ];
  it('builds one digest per owner with overdue first', () => {
    const d = buildOwnerDigest(rows.filter((r) => r.owner_id === 't'), NOW, 'https://admin.neramclasses.com');
    expect(d.subject).toBe('2 follow-ups today (1 overdue, 1 Hot)');
    expect(d.plain.split('\n')[1]).toContain('Aamna Khan');
    expect(d.link).toBe('https://admin.neramclasses.com/follow-ups?range=today&mine=true');
    expect(d.plain).not.toMatch(/—|--/);
  });
  it('builds the manager summary per owner', () => {
    const s = buildManagerSummary(rows, { t: 3 }, { t: 'Tamil Selvan', s: 'Shanthi' }, NOW, 'https://admin.neramclasses.com');
    expect(s.plain).toContain('Tamil Selvan: 2 due (1 overdue), 3 done yesterday');
    expect(s.plain).toContain('Shanthi: 1 due (0 overdue), 0 done yesterday');
    expect(s.plain).toContain('Hot and overdue: Aamna Khan');
  });
});
```

Add to `demo-schedule.test.ts` inside `describe('demo team', ...)`:

```ts
  it('reads the follow-up owner order and manager, dropping junk', () => {
    const s = resolveDemoSettings({
      hosts: team.hosts,
      followUpOwnerUpns: [' TamilSelvan@neramclasses.com ', 'bad', 'shanthimano@nerasmclasses.onmicrosoft.com'],
      followUpManagerUpn: 'Haribabu@neramclasses.com',
    });
    expect(s.followUpOwnerUpns).toEqual(['tamilselvan@neramclasses.com', 'shanthimano@nerasmclasses.onmicrosoft.com']);
    expect(s.followUpManagerUpn).toBe('haribabu@neramclasses.com');
    expect(resolveDemoSettings({}).followUpOwnerUpns).toEqual([]);
    expect(publicDemoSettings(s)).not.toHaveProperty('followUpOwnerUpns');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/database/src/utils/demo-follow-up.test.ts packages/database/src/utils/demo-schedule.test.ts`
Expected: FAIL (module `./demo-follow-up` not found; `followUpOwnerUpns` undefined).

- [ ] **Step 3: Implement `demo-follow-up.ts`**

```ts
/**
 * Demo follow-up cycle (spec 2026-10-15): pure rules shared by admin routes,
 * the digest cron and tests. No database access here.
 */
import { istDateKey, istDateTime } from './demo-schedule';

export type InterestLevel = 'hot' | 'warm' | 'cold';
export type FollowUpOutcome = 'thinking' | 'will_join' | 'no_answer' | 'not_interested' | 'joined';
export type DemoFollowUpKind = 'post_demo' | 'demo_rebook';
/** callback_outcome enum values written to callback_attempts. */
export type AttemptOutcome = 'thinking' | 'will_join' | 'not_picked_up' | 'not_interested' | 'joined';

export const DEMO_FOLLOW_UP_KINDS: DemoFollowUpKind[] = ['post_demo', 'demo_rebook'];
export const INTEREST_LABELS: Record<InterestLevel, string> = { hot: 'Hot', warm: 'Warm', cold: 'Cold' };
export const FOLLOW_UP_OUTCOME_LABELS: Record<FollowUpOutcome, string> = {
  thinking: 'Thinking it over',
  will_join: 'Will join on a date',
  no_answer: 'No answer',
  not_interested: 'Not interested',
  joined: 'Joined',
};
export const NO_ANSWER_RETRY_DAYS = 2;
export const HARD_TO_REACH_AFTER = 3;
export const JOINED_PAYMENT_GRACE_DAYS = 14;

const DAY = 24 * 60 * 60 * 1000;

function istAt(now: Date, dayOffset: number, hhmm: string): Date {
  return istDateTime(istDateKey(new Date(now.getTime() + dayOffset * DAY)), hhmm);
}

/** Default first follow-up after an attended demo: 2 days later, 11:00 IST. */
export function firstFollowUpAt(now: Date): Date {
  return istAt(now, 2, '11:00');
}

/** Rebook call after a no-show: next day, 11:00 IST. */
export function rebookFollowUpAt(now: Date): Date {
  return istAt(now, 1, '11:00');
}

export interface OutcomeInput {
  outcome: FollowUpOutcome;
  nextAt?: string | null;
  reason?: string | null;
  now: Date;
  /** Earlier attempt outcomes on this follow-up, newest first. */
  recent: string[];
}

export type OutcomeResult =
  | {
      status: 'scheduled' | 'completed';
      scheduledAt: string | null;
      attemptOutcome: AttemptOutcome;
      addFlags: string[];
      removeFlags: string[];
    }
  | { error: string };

export function applyFollowUpOutcome(input: OutcomeInput): OutcomeResult {
  const { outcome, now } = input;
  const next = input.nextAt ? new Date(input.nextAt) : null;
  const needsDate = outcome === 'thinking' || outcome === 'will_join';
  if (needsDate) {
    if (!next || Number.isNaN(next.getTime())) return { error: 'Pick the next follow-up date.' };
    if (next.getTime() <= now.getTime()) return { error: 'The next follow-up must be in the future.' };
    return { status: 'scheduled', scheduledAt: next.toISOString(), attemptOutcome: outcome, addFlags: [], removeFlags: ['hard_to_reach'] };
  }
  if (outcome === 'no_answer') {
    let streak = 1;
    for (const o of input.recent) {
      if (o !== 'not_picked_up') break;
      streak++;
    }
    return {
      status: 'scheduled',
      scheduledAt: new Date(now.getTime() + NO_ANSWER_RETRY_DAYS * DAY).toISOString(),
      attemptOutcome: 'not_picked_up',
      addFlags: streak >= HARD_TO_REACH_AFTER ? ['hard_to_reach'] : [],
      removeFlags: [],
    };
  }
  if (outcome === 'not_interested') {
    if (!input.reason?.trim()) return { error: 'Add the reason so the team knows why.' };
    return { status: 'completed', scheduledAt: null, attemptOutcome: 'not_interested', addFlags: [], removeFlags: [] };
  }
  return { status: 'completed', scheduledAt: null, attemptOutcome: 'joined', addFlags: [], removeFlags: ['hard_to_reach', 'payment_pending'] };
}

export interface OwnerInput {
  crmOwnerId: string | null;
  crmOwnerActive: boolean;
  /** Settings followUpOwnerUpns, in order. */
  ownerOrder: string[];
  managerUpn: string | null;
  staffByUpn: Record<string, { id: string; active: boolean }>;
}

/** CRM owner, else the first active person in the order, else the manager. */
export function resolveFollowUpOwnerId(input: OwnerInput): string | null {
  if (input.crmOwnerId && input.crmOwnerActive) return input.crmOwnerId;
  for (const upn of input.ownerOrder) {
    const s = input.staffByUpn[upn.toLowerCase()];
    if (s?.active) return s.id;
  }
  const m = input.managerUpn ? input.staffByUpn[input.managerUpn.toLowerCase()] : null;
  return m?.active ? m.id : null;
}

export interface EnrolUserInput {
  linkUserId: string | null;
  signedInUserId: string;
  /** isDisposableAccount() of the signed-in row. */
  signedInIsDisposable: boolean;
}
export type EnrolUserDecision =
  | { action: 'continue'; userId: string }
  | { action: 'merge'; userId: string; mergeFrom: string }
  | { action: 'refuse'; message: string };

/** Whose account a Direct Enroll link completes under. */
export function decideEnrolUser(input: EnrolUserInput): EnrolUserDecision {
  if (!input.linkUserId || input.linkUserId === input.signedInUserId) {
    return { action: 'continue', userId: input.signedInUserId };
  }
  if (input.signedInIsDisposable) return { action: 'merge', userId: input.linkUserId, mergeFrom: input.signedInUserId };
  return { action: 'refuse', message: 'Sign in with the number you used for your demo.' };
}

export interface DigestRow {
  callback_id: string;
  user_id: string | null;
  person_name: string | null;
  person_phone: string | null;
  due_at: string;
  interest_level: InterestLevel | null;
  owner_id: string | null;
  query_type: string | null;
  flags: string[] | null;
}

function istStartOfDay(now: Date): Date {
  return istDateTime(istDateKey(now), '00:00');
}

function plural(n: number, one: string): string {
  return `${n} ${one}${n === 1 ? '' : 's'}`;
}

/** One owner's morning message: overdue first, then today, Hot marked. */
export function buildOwnerDigest(rows: DigestRow[], now: Date, adminOrigin: string): { subject: string; plain: string; link: string } {
  const start = istStartOfDay(now).getTime();
  const sorted = [...rows].sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());
  const overdue = sorted.filter((r) => new Date(r.due_at).getTime() < start).length;
  const hot = sorted.filter((r) => r.interest_level === 'hot').length;
  const extras = [overdue ? `${overdue} overdue` : null, hot ? `${hot} Hot` : null].filter(Boolean).join(', ');
  const subject = `${plural(sorted.length, 'follow-up')} today${extras ? ` (${extras})` : ''}`;
  const lines = sorted.map((r) => {
    const tag = [
      new Date(r.due_at).getTime() < start ? 'overdue' : null,
      r.interest_level ? INTEREST_LABELS[r.interest_level] : null,
      r.query_type === 'post_demo' ? 'after demo' : r.query_type === 'demo_rebook' ? 'rebook demo' : 'callback',
    ]
      .filter(Boolean)
      .join(', ');
    return `${r.person_name || r.person_phone || 'Unnamed'} (${tag})`;
  });
  return { subject, plain: [subject, ...lines].join('\n'), link: `${adminOrigin}/follow-ups?range=today&mine=true` };
}

/** The manager's view: per owner due, overdue and done yesterday; Hot overdue by name. */
export function buildManagerSummary(
  rows: DigestRow[],
  doneYesterday: Record<string, number>,
  ownerNames: Record<string, string>,
  now: Date,
  adminOrigin: string,
): { subject: string; plain: string; link: string } {
  const start = istStartOfDay(now).getTime();
  const owners = Array.from(new Set([...Object.keys(ownerNames), ...rows.map((r) => r.owner_id || 'none')]));
  const lines = owners
    .filter((o) => o !== 'none' || rows.some((r) => !r.owner_id))
    .map((o) => {
      const mine = rows.filter((r) => (r.owner_id || 'none') === o);
      const late = mine.filter((r) => new Date(r.due_at).getTime() < start).length;
      return `${ownerNames[o] || 'Nobody assigned'}: ${mine.length} due (${late} overdue), ${doneYesterday[o] || 0} done yesterday`;
    });
  const hotLate = rows.filter((r) => r.interest_level === 'hot' && new Date(r.due_at).getTime() < start).map((r) => r.person_name || r.person_phone || 'Unnamed');
  const subject = `Team follow-ups: ${rows.length} due today`;
  const plain = [subject, ...lines, ...(hotLate.length ? [`Hot and overdue: ${hotLate.join(', ')}`] : [])].join('\n');
  return { subject, plain, link: `${adminOrigin}/follow-ups?range=today` };
}
```

- [ ] **Step 4: Add settings fields in `demo-schedule.ts`**

In `interface DemoSettings` after `defaultOrganizerUpn`:

```ts
  /** Who owns demo follow-ups when the person has no CRM owner, in order. */
  followUpOwnerUpns: string[];
  /** Gets the daily team summary; owner of last resort. */
  followUpManagerUpn: string | null;
```

In `resolveDemoSettings`, before `return {`:

```ts
  const upn = (v: unknown) => (typeof v === 'string' && /^[^@\s]+@[^@\s]+$/.test(v.trim()) ? v.trim().toLowerCase() : null);
  const ownerOrder = Array.isArray(r.followUpOwnerUpns) ? (r.followUpOwnerUpns as unknown[]).map(upn).filter((u): u is string => !!u) : [];
```

and in the returned object after `defaultOrganizerUpn`:

```ts
    followUpOwnerUpns: Array.from(new Set(ownerOrder)),
    followUpManagerUpn: upn(r.followUpManagerUpn),
```

Change `publicDemoSettings` to omit both:

```ts
export function publicDemoSettings(
  s: DemoSettings,
): Omit<DemoSettings, 'hosts' | 'defaultTutorUpn' | 'defaultOrganizerUpn' | 'followUpOwnerUpns' | 'followUpManagerUpn'> {
  const { hosts: _h, defaultTutorUpn: _t, defaultOrganizerUpn: _o, followUpOwnerUpns: _f, followUpManagerUpn: _m, ...rest } = s;
  return rest;
}
```

Add to `packages/database/src/index.ts` next to the demo-schedule export:

```ts
export * from './utils/demo-follow-up';
```

Add to `packages/database/package.json` `exports`, after `"./demo-schedule"`:

```json
    "./demo-follow-up": "./src/utils/demo-follow-up.ts",
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run packages/database/src/utils/demo-follow-up.test.ts packages/database/src/utils/demo-schedule.test.ts`
Expected: all PASS.

---

### Task 3: Follow-up queries

**Files:**
- Create: `packages/database/src/queries/demo-follow-ups.ts`
- Modify: `packages/database/src/queries/index.ts` (add `export * from './demo-follow-ups';`)
- Create: `scripts/check-demo-follow-ups.ts` (staging check, deleted after Task 9 verification)

**Interfaces:**
- Consumes: Task 2 `applyFollowUpOutcome`, `resolveFollowUpOwnerId`, `DEMO_FOLLOW_UP_KINDS`, types; `resolveDemoSettings`.
- Produces:
  - `resolveDemoFollowUpOwner(userId: string, client?): Promise<string | null>`
  - `openDemoFollowUp(input: { userId: string; demoRegistrationId: string; kind: DemoFollowUpKind; dueAt: Date; interest?: InterestLevel | null; note?: string | null; actorId: string | null }, client?): Promise<{ id: string; created: boolean }>`
  - `getOpenDemoFollowUp(userId: string, client?): Promise<DemoFollowUpRow | null>`
  - `logDemoFollowUpOutcome(input: { callbackId: string; outcome: FollowUpOutcome; nextAt?: string | null; note?: string | null; reason?: string | null; interest?: InterestLevel | null; admin: { id: string; name: string } }, client?): Promise<{ error?: string }>`
  - `closeDemoFollowUpsOnEnrol(userId: string, client?): Promise<number>`
  - `sweepDemoFollowUps(now: Date, client?): Promise<{ closed: number; reopened: number }>`
  - `listDemoFollowUpsByDemo(demoIds: string[], client?): Promise<Record<string, DemoFollowUpRow>>`
  - `type DemoFollowUpRow = { id: string; user_id: string; status: string; query_type: string; scheduled_callback_at: string | null; interest_level: InterestLevel | null; flags: string[]; call_outcome: string | null; completed_at: string | null; assigned_to: string | null; demo_registration_id: string | null; notes: string | null }`

- [ ] **Step 1: Implement the module**

```ts
// @ts-nocheck - callback_requests demo columns are newer than the generated Database type
/**
 * Demo follow-ups (spec 2026-10-15): callback_requests rows with query_type
 * post_demo / demo_rebook, so the admin Follow-ups queue, badge and timeline
 * see them. Rules live in utils/demo-follow-up.ts.
 */
import { getSupabaseAdminClient, TypedSupabaseClient } from '../client';
import { resolveDemoSettings } from '../utils/demo-schedule';
import {
  applyFollowUpOutcome,
  resolveFollowUpOwnerId,
  DEMO_FOLLOW_UP_KINDS,
  JOINED_PAYMENT_GRACE_DAYS,
  FOLLOW_UP_OUTCOME_LABELS,
  type DemoFollowUpKind,
  type FollowUpOutcome,
  type InterestLevel,
} from '../utils/demo-follow-up';

export interface DemoFollowUpRow {
  id: string;
  user_id: string;
  status: string;
  query_type: string;
  scheduled_callback_at: string | null;
  interest_level: InterestLevel | null;
  flags: string[];
  call_outcome: string | null;
  completed_at: string | null;
  assigned_to: string | null;
  demo_registration_id: string | null;
  notes: string | null;
}

const OPEN = ['pending', 'scheduled', 'attempted'];
const COLS =
  'id, user_id, status, query_type, scheduled_callback_at, interest_level, flags, call_outcome, completed_at, assigned_to, demo_registration_id, notes';

export async function resolveDemoFollowUpOwner(userId: string, client?: TypedSupabaseClient): Promise<string | null> {
  const supabase = client || getSupabaseAdminClient();
  const [{ data: person }, { data: settingsRow }] = await Promise.all([
    supabase.from('users').select('crm_owner_id').eq('id', userId).maybeSingle(),
    supabase.from('site_settings').select('value').eq('key', 'demo_class').maybeSingle(),
  ]);
  const s = resolveDemoSettings(settingsRow?.value);
  const upns = [...s.followUpOwnerUpns, ...(s.followUpManagerUpn ? [s.followUpManagerUpn] : [])];
  const ids = person?.crm_owner_id ? [person.crm_owner_id] : [];
  // users.email keeps Microsoft's casing (TamilSelvan@...), settings are lowercase: ilike, never eq/in.
  const { data: staff } = await supabase
    .from('users')
    .select('id, email, is_disabled')
    .or([...upns.map((u) => `email.ilike.${u}`), ...(ids.length ? [`id.in.(${ids.join(',')})`] : [])].join(',') || 'id.is.null');
  const staffByUpn: Record<string, { id: string; active: boolean }> = {};
  let crmOwnerActive = false;
  for (const u of staff || []) {
    if (u.email) staffByUpn[u.email.toLowerCase()] = { id: u.id, active: !u.is_disabled };
    if (u.id === person?.crm_owner_id) crmOwnerActive = !u.is_disabled;
  }
  return resolveFollowUpOwnerId({
    crmOwnerId: person?.crm_owner_id ?? null,
    crmOwnerActive,
    ownerOrder: s.followUpOwnerUpns,
    managerUpn: s.followUpManagerUpn,
    staffByUpn,
  });
}

export async function getOpenDemoFollowUp(userId: string, client?: TypedSupabaseClient): Promise<DemoFollowUpRow | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('callback_requests')
    .select(COLS)
    .eq('user_id', userId)
    .in('query_type', DEMO_FOLLOW_UP_KINDS)
    .in('status', OPEN)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

/** Create the person's open demo follow-up, or move the one already open. */
export async function openDemoFollowUp(
  input: {
    userId: string;
    demoRegistrationId: string;
    kind: DemoFollowUpKind;
    dueAt: Date;
    interest?: InterestLevel | null;
    note?: string | null;
    actorId: string | null;
  },
  client?: TypedSupabaseClient,
): Promise<{ id: string; created: boolean }> {
  const supabase = client || getSupabaseAdminClient();
  const existing = await getOpenDemoFollowUp(input.userId, supabase);
  const base = {
    query_type: input.kind,
    demo_registration_id: input.demoRegistrationId,
    status: 'scheduled',
    scheduled_at: input.dueAt.toISOString(),
    scheduled_callback_at: input.dueAt.toISOString(),
    ...(input.interest ? { interest_level: input.interest } : {}),
    ...(input.note ? { notes: input.note } : {}),
  };
  if (existing) {
    const { error } = await supabase.from('callback_requests').update(base).eq('id', existing.id);
    if (error) throw error;
    return { id: existing.id, created: false };
  }
  const [{ data: person }, ownerId] = await Promise.all([
    supabase.from('users').select('name, phone, email').eq('id', input.userId).single(),
    resolveDemoFollowUpOwner(input.userId, supabase),
  ]);
  const { data, error } = await supabase
    .from('callback_requests')
    .insert({
      ...base,
      user_id: input.userId,
      name: person?.name || 'Unknown',
      phone: person?.phone || '',
      email: person?.email ?? null,
      assigned_to: ownerId,
      timezone: 'Asia/Kolkata',
    })
    .select('id')
    .single();
  if (error) throw error;
  return { id: data.id, created: true };
}

export async function logDemoFollowUpOutcome(
  input: {
    callbackId: string;
    outcome: FollowUpOutcome;
    nextAt?: string | null;
    note?: string | null;
    reason?: string | null;
    interest?: InterestLevel | null;
    admin: { id: string; name: string };
  },
  client?: TypedSupabaseClient,
): Promise<{ error?: string }> {
  const supabase = client || getSupabaseAdminClient();
  const { data: row } = await supabase.from('callback_requests').select(COLS + ', attempt_count').eq('id', input.callbackId).maybeSingle();
  if (!row) return { error: 'Follow-up not found.' };
  const { data: attempts } = await supabase
    .from('callback_attempts')
    .select('outcome')
    .eq('callback_request_id', row.id)
    .order('attempted_at', { ascending: false })
    .limit(5);
  const now = new Date();
  const result = applyFollowUpOutcome({
    outcome: input.outcome,
    nextAt: input.nextAt,
    reason: input.reason,
    now,
    recent: (attempts || []).map((a) => String(a.outcome)),
  });
  if ('error' in result) return { error: result.error };

  const comment = [input.reason ? `Reason: ${input.reason}` : null, input.note || null, input.interest ? `Interest: ${input.interest}` : null]
    .filter(Boolean)
    .join('. ');
  const { error: attemptErr } = await supabase.from('callback_attempts').insert({
    callback_request_id: row.id,
    user_id: row.user_id,
    admin_id: input.admin.id,
    admin_name: input.admin.name,
    outcome: result.attemptOutcome,
    comments: comment || null,
    rescheduled_to: result.scheduledAt,
  });
  if (attemptErr) throw attemptErr;

  const flags = new Set(row.flags || []);
  result.addFlags.forEach((f) => flags.add(f));
  result.removeFlags.forEach((f) => flags.delete(f));
  const { error } = await supabase
    .from('callback_requests')
    .update({
      status: result.status,
      scheduled_callback_at: result.scheduledAt ?? row.scheduled_callback_at,
      call_outcome: result.attemptOutcome,
      call_notes: comment || null,
      last_attempt_at: now.toISOString(),
      attempt_count: (row.attempt_count || 0) + 1,
      flags: Array.from(flags),
      ...(input.interest ? { interest_level: input.interest } : {}),
      ...(result.status === 'completed' ? { completed_at: now.toISOString() } : {}),
    })
    .eq('id', row.id);
  if (error) throw error;
  return {};
}

/** Enrolment happened: open demo follow-ups close as Joined. Returns how many. */
export async function closeDemoFollowUpsOnEnrol(userId: string, client?: TypedSupabaseClient): Promise<number> {
  const supabase = client || getSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('callback_requests')
    .update({ status: 'completed', call_outcome: 'joined', completed_at: now, flags: [] })
    .eq('user_id', userId)
    .in('query_type', DEMO_FOLLOW_UP_KINDS)
    .or(`status.in.(${OPEN.join(',')}),and(status.eq.completed,call_outcome.eq.joined)`)
    .select('id');
  if (error) throw error;
  return (data || []).length;
}

/**
 * Nightly: close open demo follow-ups of people who enrolled by any path, and
 * reopen "Joined" marked by hand 14+ days ago with no student profile.
 */
export async function sweepDemoFollowUps(now: Date, client?: TypedSupabaseClient): Promise<{ closed: number; reopened: number }> {
  const supabase = client || getSupabaseAdminClient();
  const { data: open } = await supabase
    .from('callback_requests')
    .select('id, user_id, status, call_outcome, completed_at, flags')
    .in('query_type', DEMO_FOLLOW_UP_KINDS)
    .or(`status.in.(${OPEN.join(',')}),and(status.eq.completed,call_outcome.eq.joined)`)
    .not('user_id', 'is', null)
    .limit(2000);
  const userIds = Array.from(new Set((open || []).map((r) => r.user_id)));
  const enrolled = new Set<string>();
  for (let i = 0; i < userIds.length; i += 200) {
    const { data } = await supabase.from('student_profiles').select('user_id').in('user_id', userIds.slice(i, i + 200));
    (data || []).forEach((d) => enrolled.add(d.user_id));
  }
  let closed = 0;
  let reopened = 0;
  const cutoff = now.getTime() - JOINED_PAYMENT_GRACE_DAYS * 24 * 60 * 60 * 1000;
  for (const r of open || []) {
    if (enrolled.has(r.user_id)) {
      if (r.status !== 'completed' || (r.flags || []).length) {
        closed += await closeDemoFollowUpsOnEnrol(r.user_id, supabase);
      }
    } else if (r.status === 'completed' && r.call_outcome === 'joined' && r.completed_at && new Date(r.completed_at).getTime() < cutoff) {
      await supabase
        .from('callback_requests')
        .update({ status: 'scheduled', scheduled_callback_at: now.toISOString(), flags: Array.from(new Set([...(r.flags || []), 'payment_pending'])) })
        .eq('id', r.id);
      reopened++;
    }
  }
  return { closed, reopened };
}

/** Latest demo follow-up per demo request, for the desk's Done tab. */
export async function listDemoFollowUpsByDemo(demoIds: string[], client?: TypedSupabaseClient): Promise<Record<string, DemoFollowUpRow>> {
  if (!demoIds.length) return {};
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('callback_requests')
    .select(COLS)
    .in('demo_registration_id', demoIds)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const out: Record<string, DemoFollowUpRow> = {};
  for (const r of data || []) if (r.demo_registration_id && !out[r.demo_registration_id]) out[r.demo_registration_id] = r;
  return out;
}

export { FOLLOW_UP_OUTCOME_LABELS };
```

Add to `packages/database/src/queries/index.ts`:

```ts
export * from './demo-follow-ups';
```

- [ ] **Step 2: Staging check script**

`scripts/check-demo-follow-ups.ts` (run with `node --env-file=apps/admin/.env.local scripts/check-demo-follow-ups.ts`; Node 24 strips types):

```ts
import { createClient } from '@supabase/supabase-js';
import { openDemoFollowUp, logDemoFollowUpOutcome, closeDemoFollowUpsOnEnrol, getOpenDemoFollowUp } from '../packages/database/src/queries/demo-follow-ups.ts';

const sb: any = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const { data: u } = await sb.from('users').insert({ name: 'FollowUp Check', phone: '+919000000099', user_type: 'lead', status: 'pending' }).select('id').single();
const { data: d } = await sb.from('demo_class_registrations').insert({ user_id: u.id, name: 'FollowUp Check', phone: '9000000099', ref_code: 'DEMO-ZZ99', join_token: 'zz99zz99zz99zz99zz99zz99', status: 'attended', attended: true, preferred_window: 'anytime' }).select('id').single();
try {
  const a = await openDemoFollowUp({ userId: u.id, demoRegistrationId: d.id, kind: 'post_demo', dueAt: new Date(Date.now() + 86400000), interest: 'warm', note: 'first', actorId: null }, sb);
  const b = await openDemoFollowUp({ userId: u.id, demoRegistrationId: d.id, kind: 'post_demo', dueAt: new Date(Date.now() + 2 * 86400000), actorId: null }, sb);
  console.log('upsert same row:', a.id === b.id, 'created first:', a.created, 'created second:', b.created);
  const admin = { id: u.id, name: 'Check' };
  for (let i = 0; i < 3; i++) await logDemoFollowUpOutcome({ callbackId: a.id, outcome: 'no_answer', admin }, sb);
  const row = await getOpenDemoFollowUp(u.id, sb);
  console.log('hard_to_reach after 3:', row.flags.includes('hard_to_reach'));
  console.log('closed on enrol:', await closeDemoFollowUpsOnEnrol(u.id, sb));
  console.log('open after close:', await getOpenDemoFollowUp(u.id, sb));
} finally {
  await sb.from('callback_requests').delete().eq('user_id', u.id);
  await sb.from('demo_class_registrations').delete().eq('id', d.id);
  await sb.from('users').delete().eq('id', u.id);
}
```

- [ ] **Step 3: Run it**

Run: `node --env-file=apps/admin/.env.local scripts/check-demo-follow-ups.ts`
Expected:
```
upsert same row: true created first: true created second: false
hard_to_reach after 3: true
closed on enrol: 1
open after close: null
```

---

### Task 4: Attended marks open a follow-up (desk + Add demo)

**Files:**
- Modify: `apps/admin/src/app/api/demo-requests/[id]/route.ts` (`attendance` action; `detail()` adds the follow-up)
- Modify: `apps/admin/src/app/api/demo-requests/route.ts` (POST `held` mode)
- Create: `apps/admin/src/components/demo-requests/AttendedFields.tsx`
- Create: `apps/admin/src/components/demo-requests/AttendedDialog.tsx`
- Modify: `apps/admin/src/components/demo-requests/RequestPanel.tsx` (Attended button opens the dialog)
- Modify: `apps/admin/src/components/demo-requests/AddDemoDialog.tsx` (held + attended shows `AttendedFields`)
- Modify: `apps/admin/src/components/demo-requests/types.ts` (`DeskDetail.followUp`)

**Interfaces:**
- Consumes: `openDemoFollowUp`, `getOpenDemoFollowUp`, `firstFollowUpAt`, `rebookFollowUpAt`, `INTEREST_LABELS`, `type InterestLevel` (Tasks 2, 3).
- Produces: POST `/api/demo-requests/[id]` `{ action: 'attendance', attended: true, interest: InterestLevel, note: string, nextFollowUpAt: ISO }` (400 when interest or date missing); POST `/api/demo-requests` `held` mode accepts the same three fields when `outcome === 'attended'`; `DeskDetail.followUp: DemoFollowUpRow | null`; `<AttendedFields value onChange />` with `type AttendedValue = { interest: InterestLevel | null; note: string; nextDate: string; nextTime: string }`.

- [ ] **Step 1: Invoke the `ui-ux-pro-max` skill** for "admin dialog: mark demo attended with interest level (3-way segmented), short note, next follow-up date + time".

- [ ] **Step 2: Server, attendance action.** In `apps/admin/src/app/api/demo-requests/[id]/route.ts` `case 'attendance'`, after `const attended = body.attended === true;` add validation, and after the existing `enqueueDemoMessages(...)` call add the follow-up:

```ts
        const interest = ['hot', 'warm', 'cold'].includes(String(body.interest)) ? (body.interest as InterestLevel) : null;
        const nextAt = typeof body.nextFollowUpAt === 'string' ? new Date(body.nextFollowUpAt) : null;
        if (attended && (!interest || !nextAt || Number.isNaN(nextAt.getTime()))) {
          throw new ActionError('Pick how interested they are and the first follow-up date.');
        }
```

```ts
        if (r.user_id) {
          await openDemoFollowUp(
            attended
              ? { userId: r.user_id, demoRegistrationId: r.id, kind: 'post_demo', dueAt: nextAt!, interest, note: text(body.note, 1000) || null, actorId }
              : { userId: r.user_id, demoRegistrationId: r.id, kind: 'demo_rebook', dueAt: rebookFollowUpAt(new Date()), actorId },
            supabase,
          );
        }
        await log('status', attended ? 'attended' : 'no_show', attended ? `Interest ${interest}. ${text(body.note, 1000)}`.trim() : null);
```

Remove the old `await log('status', attended ? 'attended' : 'no_show', null);` line. Import `openDemoFollowUp, getOpenDemoFollowUp, rebookFollowUpAt, type InterestLevel` from `@neram/database`. In `detail()` add the follow-up:

```ts
  const followUp = request.user_id ? await getOpenDemoFollowUp(request.user_id, supabase).catch(() => null) : null;
  return { request, events, messages, actors, followUp };
```

- [ ] **Step 3: Server, `held` mode.** In `apps/admin/src/app/api/demo-requests/route.ts` inside `if (mode === 'held')`, after the `logDemoRequestEvent(...)` call:

```ts
      const interest = ['hot', 'warm', 'cold'].includes(String(body.interest)) ? (body.interest as InterestLevel) : null;
      const nextAt = typeof body.nextFollowUpAt === 'string' ? new Date(body.nextFollowUpAt) : null;
      if (attended && (!interest || !nextAt || Number.isNaN(nextAt.getTime()))) {
        throw new AddError('Pick how interested they are and the first follow-up date.');
      }
      await openDemoFollowUp(
        attended
          ? { userId, demoRegistrationId: row.id, kind: 'post_demo', dueAt: nextAt!, interest, note: note || null, actorId }
          : { userId, demoRegistrationId: row.id, kind: 'demo_rebook', dueAt: rebookFollowUpAt(new Date()), actorId },
        supabase,
      );
```

Move the validation lines above the `getActiveDemoRequestForUser` call so nothing is written when they fail. Import `openDemoFollowUp, rebookFollowUpAt, type InterestLevel`.

- [ ] **Step 4: `AttendedFields.tsx`** (shared by the dialog and Add demo)

```tsx
'use client';

import { Box, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@neram/ui';
import { INTEREST_LABELS, firstFollowUpAt, type InterestLevel } from '@neram/database/demo-follow-up';
import { istDateKey } from '@neram/database/demo-schedule';

export interface AttendedValue {
  interest: InterestLevel | null;
  note: string;
  nextDate: string;
  nextTime: string;
}

export function defaultAttendedValue(now = new Date()): AttendedValue {
  return { interest: null, note: '', nextDate: istDateKey(firstFollowUpAt(now)), nextTime: '11:00' };
}

/** How the demo went and when to call next. */
export default function AttendedFields({ value, onChange }: { value: AttendedValue; onChange: (v: AttendedValue) => void }) {
  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <Box>
        <Typography variant="body2" id="interest-label" sx={{ mb: 1 }}>
          How interested are they?
        </Typography>
        <ToggleButtonGroup
          exclusive
          value={value.interest}
          onChange={(_, v) => v && onChange({ ...value, interest: v })}
          aria-labelledby="interest-label"
          sx={{ gap: 1, '& .MuiToggleButton-root': { minHeight: 44, px: 3, border: 1, borderColor: 'divider', borderRadius: '8px !important', textTransform: 'none' } }}
        >
          {(Object.keys(INTEREST_LABELS) as InterestLevel[]).map((k) => (
            <ToggleButton key={k} value={k}>
              {INTEREST_LABELS[k]}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>
      <TextField
        label="What they said"
        value={value.note}
        onChange={(e) => onChange({ ...value, note: e.target.value })}
        placeholder="e.g. Liked the class, discussing fees with parents"
        multiline
        minRows={2}
        inputProps={{ maxLength: 1000 }}
      />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
        <TextField
          label="First follow-up"
          type="date"
          value={value.nextDate}
          onChange={(e) => onChange({ ...value, nextDate: e.target.value })}
          InputLabelProps={{ shrink: true }}
          inputProps={{ min: istDateKey(new Date()) }}
          required
        />
        <TextField
          label="Time (India)"
          type="time"
          value={value.nextTime}
          onChange={(e) => onChange({ ...value, nextTime: e.target.value })}
          InputLabelProps={{ shrink: true }}
          required
        />
      </Box>
    </Box>
  );
}
```

- [ ] **Step 5: `AttendedDialog.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@neram/ui';
import { istDateTime } from '@neram/database/demo-schedule';
import AttendedFields, { defaultAttendedValue, type AttendedValue } from './AttendedFields';

export default function AttendedDialog({
  open,
  name,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  name: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (v: { interest: string; note: string; nextFollowUpAt: string }) => void;
}) {
  const [value, setValue] = useState<AttendedValue>(defaultAttendedValue());
  useEffect(() => {
    if (open) setValue(defaultAttendedValue());
  }, [open]);
  const next = value.nextDate && /^\d{2}:\d{2}$/.test(value.nextTime) ? istDateTime(value.nextDate, value.nextTime) : null;
  const ok = !!value.interest && !!next && next.getTime() > Date.now();
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="attended-title">
      <DialogTitle id="attended-title">{name} attended</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          This starts their follow-up. The owner is reminded on the date you pick.
        </Typography>
        <AttendedFields value={value} onChange={setValue} />
        {error && (
          <Alert severity="error" sx={{ mt: 2 }} role="alert">
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={busy} sx={{ minHeight: 44 }}>
          Back
        </Button>
        <Button
          variant="contained"
          color="success"
          disabled={!ok || busy}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
          onClick={() => next && onSubmit({ interest: value.interest!, note: value.note.trim(), nextFollowUpAt: next.toISOString() })}
          sx={{ minHeight: 44 }}
        >
          {busy ? 'Saving' : 'Save and start follow-up'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

- [ ] **Step 6: Wire into `RequestPanel.tsx`.** Add state `const [attendedOpen, setAttendedOpen] = useState(false);`. Change the Attended button `onClick` to `() => setAttendedOpen(true)`. Before the closing `</Paper>` of the component render:

```tsx
      <AttendedDialog
        open={attendedOpen}
        name={r.name}
        busy={busy === 'attendance'}
        error={attendedOpen ? error : null}
        onClose={() => setAttendedOpen(false)}
        onSubmit={async (v) => {
          const err = await run('attendance', { action: 'attendance', attended: true, ...v });
          if (!err) setAttendedOpen(false);
        }}
      />
```

- [ ] **Step 7: Wire into `AddDemoDialog.tsx`.** Add `const [attendedValue, setAttendedValue] = useState<AttendedValue>(defaultAttendedValue());` (reset in the `open` effect). In the `held` block, when `outcome === 'attended'`, render `<AttendedFields value={attendedValue} onChange={setAttendedValue} />` after the outcome toggle and hide the separate "Note" field (the fields carry the note). Extend `canSave` with `(mode !== 'held' || outcome !== 'attended' || (!!attendedValue.interest && !!attendedNext && attendedNext.getTime() > Date.now()))` where `const attendedNext = attendedValue.nextDate ? istDateTime(attendedValue.nextDate, attendedValue.nextTime) : null;`. In the POST body for `held` add `interest: attendedValue.interest, note: outcome === 'attended' ? attendedValue.note.trim() : note.trim(), nextFollowUpAt: attendedNext?.toISOString()`.

- [ ] **Step 8: `types.ts`.** Import `DemoFollowUpRow` from `@neram/database` and add `followUp: DemoFollowUpRow | null;` to `DeskDetail`.

- [ ] **Step 8b: Reopen a closed follow-up (spec: "Reopen").** Add a `follow_up` action to `apps/admin/src/app/api/demo-requests/[id]/route.ts`:

```ts
      case 'follow_up': {
        if (!r.user_id) throw new ActionError('This request has no person linked.');
        const at = typeof body.nextFollowUpAt === 'string' ? new Date(body.nextFollowUpAt) : null;
        if (!at || Number.isNaN(at.getTime()) || at.getTime() <= Date.now()) throw new ActionError('Pick a follow-up date in the future.');
        const interest = ['hot', 'warm', 'cold'].includes(String(body.interest)) ? (body.interest as InterestLevel) : null;
        await openDemoFollowUp({ userId: r.user_id, demoRegistrationId: r.id, kind: 'post_demo', dueAt: at, interest, note: text(body.note, 1000) || null, actorId }, supabase);
        await log('status', 'follow_up_started', text(body.note, 1000) || null);
        break;
      }
```

In `RequestPanel.tsx`, when `['attended', 'no_show'].includes(r.status) && !detail.followUp`, show `<Button variant="outlined" onClick={() => setAttendedOpen(true)} sx={{ minHeight: 44 }}>Start follow-up again</Button>`, and make `AttendedDialog`'s submit send `{ action: r.status === 'approved' ? 'attendance' : 'follow_up', attended: true, ...v }` (the server ignores `attended` for `follow_up`).

- [ ] **Step 9: Verify on staging** (local admin running, dry run). Create a request with Add demo `agreed`, confirm it, then:

```bash
TOK="test_$(printf 'e2etestingteacher@neramclasses.com' | base64)"
curl -s -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -X POST http://localhost:3013/api/demo-requests/<id> -d '{"action":"attendance","attended":true}'
```
Expected: `{"error":"Pick how interested they are and the first follow-up date."}`. Then with `"interest":"hot","note":"Liked it","nextFollowUpAt":"<ISO 2 days ahead>"`: expected 200 and `followUp.query_type === 'post_demo'`, `followUp.assigned_to` = Tamil Selvan's staging users id (set staging `followUpOwnerUpns` first: `update site_settings set value = value || '{"followUpOwnerUpns":["tamilselvan@neramclasses.com","shanthimano@nerasmclasses.onmicrosoft.com"],"followUpManagerUpn":"haribabu@neramclasses.com"}' where key='demo_class';`). Delete the test rows afterwards.

---

### Task 5: Log outcome from the Follow-ups page and the desk

**Files:**
- Create: `apps/admin/src/app/api/crm/follow-ups/[id]/outcome/route.ts`
- Create: `apps/admin/src/components/follow-ups/LogOutcomeDialog.tsx`
- Modify: `packages/database/src/queries/crm-follow-ups.ts` (`type` filter)
- Modify: `apps/admin/src/app/api/crm/follow-ups/route.ts` (`type` param)
- Modify: `apps/admin/src/components/follow-ups/FollowUpRow.tsx` (interest chip, flags, Log outcome, WhatsApp, Send enrolment link slot)
- Modify: `apps/admin/src/app/(dashboard)/follow-ups/page.tsx` (Type filter, dialog wiring, refresh after save)
- Modify: `apps/admin/src/components/demo-requests/RequestPanel.tsx` ("After the demo" block)

**Interfaces:**
- Consumes: `logDemoFollowUpOutcome`, `FOLLOW_UP_OUTCOME_LABELS`, `INTEREST_LABELS`, `type FollowUpOutcome` (Tasks 2, 3).
- Produces: POST `/api/crm/follow-ups/[id]/outcome` `{ outcome, nextAt?, note?, reason?, interest? }` → `{ ok: true }` or 400 `{ error }`; GET `/api/crm/follow-ups?type=demo|callback|all`; `listFollowUps({ type })`; `<LogOutcomeDialog open name callbackId onClose onSaved />`.

- [ ] **Step 1: Invoke the `ui-ux-pro-max` skill** for "admin follow-up worklist row with inline log-outcome dialog: 5 outcomes as choice chips, conditional date and reason, interest re-rate".

- [ ] **Step 2: Query filter.** In `listFollowUps` options add `type?: 'demo' | 'callback' | 'all'` and after the owner filter:

```ts
  if (options.type === 'demo') query = query.in('query_type', ['post_demo', 'demo_rebook']);
  if (options.type === 'callback') query = query.or('query_type.is.null,query_type.not.in.(post_demo,demo_rebook)');
```

In `apps/admin/src/app/api/crm/follow-ups/route.ts`:

```ts
  const typeParam = sp.get('type');
  const type = typeParam === 'demo' || typeParam === 'callback' ? typeParam : 'all';
  ...listFollowUps({ range, ownerId, type })
```

- [ ] **Step 3: Outcome route**

```ts
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSupabaseAdminClient, logDemoFollowUpOutcome, type FollowUpOutcome, type InterestLevel } from '@neram/database';
import { getRequestAdminId } from '@/lib/request-admin';

const OUTCOMES: FollowUpOutcome[] = ['thinking', 'will_join', 'no_answer', 'not_interested', 'joined'];

/** POST /api/crm/follow-ups/[id]/outcome: log one call on a follow-up. Staff only (middleware). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const adminId = getRequestAdminId(req);
  if (!adminId) return NextResponse.json({ error: 'Sign in again.' }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  const outcome = body.outcome as FollowUpOutcome;
  if (!OUTCOMES.includes(outcome)) return NextResponse.json({ error: 'Pick how the call went.' }, { status: 400 });
  const interest = ['hot', 'warm', 'cold'].includes(String(body.interest)) ? (body.interest as InterestLevel) : null;
  const str = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  try {
    const supabase = getSupabaseAdminClient();
    const { data: me } = await (supabase as any).from('users').select('name').eq('id', adminId).maybeSingle();
    const res = await logDemoFollowUpOutcome(
      {
        callbackId: params.id,
        outcome,
        nextAt: str(body.nextAt, 40) || null,
        note: str(body.note, 1000) || null,
        reason: str(body.reason, 300) || null,
        interest,
        admin: { id: adminId, name: me?.name || 'Staff' },
      },
      supabase,
    );
    if (res.error) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('follow-up outcome failed:', error);
    return NextResponse.json({ error: 'Could not save. Try again.' }, { status: 500 });
  }
}
```

- [ ] **Step 4: `LogOutcomeDialog.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@neram/ui';
import { FOLLOW_UP_OUTCOME_LABELS, INTEREST_LABELS, type FollowUpOutcome, type InterestLevel } from '@neram/database/demo-follow-up';
import { istDateKey, istDateTime } from '@neram/database/demo-schedule';

const CHIP_SX = { gap: 1, flexWrap: 'wrap', '& .MuiToggleButton-root': { minHeight: 44, px: 2, border: 1, borderColor: 'divider', borderRadius: '8px !important', textTransform: 'none' } } as const;

export default function LogOutcomeDialog({
  open,
  name,
  callbackId,
  interest: currentInterest,
  onClose,
  onSaved,
}: {
  open: boolean;
  name: string;
  callbackId: string;
  interest: InterestLevel | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [outcome, setOutcome] = useState<FollowUpOutcome | null>(null);
  const [interest, setInterest] = useState<InterestLevel | null>(currentInterest);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('11:00');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setOutcome(null);
    setInterest(currentInterest);
    setDate(istDateKey(new Date(Date.now() + 2 * 86_400_000)));
    setTime('11:00');
    setNote('');
    setReason('');
    setError(null);
  }, [open, currentInterest]);

  const needsDate = outcome === 'thinking' || outcome === 'will_join';
  const next = needsDate && date && /^\d{2}:\d{2}$/.test(time) ? istDateTime(date, time) : null;
  const ok = !!outcome && (!needsDate || (!!next && next.getTime() > Date.now())) && (outcome !== 'not_interested' || reason.trim().length > 1);

  const save = async () => {
    if (!outcome) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/follow-ups/${callbackId}/outcome`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome, nextAt: next?.toISOString(), note: note.trim(), reason: reason.trim(), interest }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Could not save.');
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="outcome-title">
      <DialogTitle id="outcome-title">Call with {name}</DialogTitle>
      <DialogContent dividers sx={{ display: 'grid', gap: 2 }}>
        <Box>
          <Typography variant="body2" id="outcome-label" sx={{ mb: 1 }}>How did it go?</Typography>
          <ToggleButtonGroup exclusive value={outcome} onChange={(_, v) => setOutcome(v)} aria-labelledby="outcome-label" sx={CHIP_SX}>
            {(Object.keys(FOLLOW_UP_OUTCOME_LABELS) as FollowUpOutcome[]).map((o) => (
              <ToggleButton key={o} value={o}>{FOLLOW_UP_OUTCOME_LABELS[o]}</ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
        {needsDate && (
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <TextField
              label={outcome === 'will_join' ? 'They will join on' : 'Next follow-up'}
              type="date" value={date} onChange={(e) => setDate(e.target.value)}
              InputLabelProps={{ shrink: true }} inputProps={{ min: istDateKey(new Date()) }} required
            />
            <TextField label="Time (India)" type="time" value={time} onChange={(e) => setTime(e.target.value)} InputLabelProps={{ shrink: true }} required />
          </Box>
        )}
        {outcome === 'no_answer' && (
          <Typography variant="body2" color="text.secondary">We will remind you to try again in 2 days.</Typography>
        )}
        {outcome === 'not_interested' && (
          <TextField label="Why not? (required)" value={reason} onChange={(e) => setReason(e.target.value)} inputProps={{ maxLength: 300 }} required />
        )}
        {outcome && outcome !== 'not_interested' && (
          <Box>
            <Typography variant="body2" id="interest2-label" sx={{ mb: 1 }}>Interest now</Typography>
            <ToggleButtonGroup exclusive value={interest} onChange={(_, v) => v && setInterest(v)} aria-labelledby="interest2-label" sx={CHIP_SX}>
              {(Object.keys(INTEREST_LABELS) as InterestLevel[]).map((k) => (
                <ToggleButton key={k} value={k}>{INTEREST_LABELS[k]}</ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>
        )}
        <TextField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} multiline minRows={2} inputProps={{ maxLength: 1000 }} />
        {error && <Alert severity="error" role="alert">{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={busy} sx={{ minHeight: 44 }}>Back</Button>
        <Button variant="contained" onClick={save} disabled={!ok || busy} startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined} sx={{ minHeight: 44 }}>
          {busy ? 'Saving' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

- [ ] **Step 5: `FollowUpRow.tsx`.** Add to `FollowUp`: `demo_registration_id: string | null; interest_level: 'hot' | 'warm' | 'cold' | null; flags: string[] | null;`. Add props `onLogOutcome?: () => void; onSendLink?: () => void;`. In the Person column after the stage chip add `{item.interest_level && <StatusChip icon={WhatshotIcon} label={INTEREST_LABELS[item.interest_level]} tone={item.interest_level === 'hot' ? 'error' : item.interest_level === 'warm' ? 'warning' : undefined} />}` and `{item.flags?.includes('hard_to_reach') && <StatusChip icon={PhoneDisabledIcon} label="Hard to reach" tone="warning" />}` and `{item.flags?.includes('payment_pending') && <StatusChip icon={PaymentsIcon} label="Payment not received" tone="error" />}`. In the Request column, when `item.demo_registration_id` render `<Link href={`/demo-classes?id=${item.demo_registration_id}`}>See the demo</Link>` under the label. In the Actions column add, after Call: a WhatsApp button (`href={`https://wa.me/${(item.person_phone || '').replace(/\D/g, '').replace(/^(\d{10})$/, '91$1')}`}`, `target="_blank"`), then `{onLogOutcome && <Button variant="outlined" onClick={onLogOutcome} ...>Log outcome</Button>}` and `{onSendLink && <Button onClick={onSendLink} ...>Enrolment link</Button>}`, each with `sx={{ ...TARGET_44, ...FOCUS_RING, textTransform: 'none' }}`. Replace the `query_type` label rendering with `item.query_type === 'post_demo' ? 'After demo' : item.query_type === 'demo_rebook' ? 'Rebook demo' : item.query_type ? humanizeKey(item.query_type) : 'Callback'`. Icons: `@mui/icons-material/Whatshot`, `PhoneDisabled`, `Payments`, `WhatsApp`.

- [ ] **Step 6: `follow-ups/page.tsx`.** Add a Type `ToggleButtonGroup` (All, After demo, Callback requests) beside the Mine/Everyone toggle, state `type`, include `&type=${type}` in the fetch URL and in the effect deps, read the initial `range`/`mine` from `useSearchParams` so the digest link (`?range=today&mine=true`) opens the right view. Hold `const [logging, setLogging] = useState<FollowUp | null>(null);` and render `<LogOutcomeDialog open={!!logging} name={logging?.person_name || ''} callbackId={logging?.callback_id || ''} interest={logging?.interest_level ?? null} onClose={() => setLogging(null)} onSaved={() => { setLogging(null); load(); }} />`, passing `onLogOutcome={() => setLogging(item)}` to each row. (`onSendLink` is wired in Task 7.)

- [ ] **Step 7: RequestPanel "After the demo" block.** When `detail.followUp` exists, render under the confirmed-demo card:

```tsx
      {detail.followUp && (
        <Box sx={{ mt: 2 }}>
          <SectionTitle>After the demo</SectionTitle>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            {detail.followUp.interest_level && <Chip size="small" label={INTEREST_LABELS[detail.followUp.interest_level]} color={detail.followUp.interest_level === 'hot' ? 'error' : detail.followUp.interest_level === 'warm' ? 'warning' : 'default'} />}
            <Typography variant="body2">
              Next follow-up {detail.followUp.scheduled_callback_at ? formatDemoDateTime(new Date(detail.followUp.scheduled_callback_at)) : 'not set'}
            </Typography>
          </Box>
          {detail.followUp.notes && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{detail.followUp.notes}</Typography>}
          <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
            <Button variant="outlined" onClick={() => setLogOpen(true)} sx={{ minHeight: 44 }}>Log outcome</Button>
          </Box>
          <LogOutcomeDialog
            open={logOpen}
            name={r.name}
            callbackId={detail.followUp.id}
            interest={detail.followUp.interest_level}
            onClose={() => setLogOpen(false)}
            onSaved={async () => { setLogOpen(false); await onAction({ action: 'note', note: 'Follow-up call logged' }); }}
          />
        </Box>
      )}
```

(`onAction` refreshes the detail; add `const [logOpen, setLogOpen] = useState(false);`.)

- [ ] **Step 8: Verify on staging.** With the follow-up from Task 4: POST `{"outcome":"thinking"}` → 400 "Pick the next follow-up date."; POST `{"outcome":"thinking","nextAt":"<future ISO>","interest":"warm"}` → 200; GET `/api/crm/follow-ups?range=all&type=demo` lists it with `interest_level: "warm"`; GET `?type=callback` does not.

---

### Task 6: Desk Done tab shows follow-up and Joined

**Files:**
- Modify: `apps/admin/src/app/api/demo-requests/route.ts` (GET attaches `followUps` and `joined`)
- Modify: `apps/admin/src/components/demo-requests/types.ts` (`DeskList.followUps`, `DeskList.joinedAt`)
- Modify: `apps/admin/src/components/demo-requests/RequestList.tsx` (Done tab columns)
- Modify: `apps/admin/src/app/(dashboard)/demo-classes/page.tsx` (pass the maps)

**Interfaces:**
- Consumes: `listDemoFollowUpsByDemo` (Task 3).
- Produces: GET `/api/demo-requests` returns `followUps: Record<demoId, DemoFollowUpRow>` and `joinedAt: Record<userId, string>` (student_profiles.enrollment_date).

- [ ] **Step 1: Server.** In GET after `requests` load:

```ts
    const doneIds = requests.filter((r) => r.status === 'attended' || r.status === 'no_show').map((r) => r.id);
    const followUps = await listDemoFollowUpsByDemo(doneIds, supabase).catch(() => ({}));
    const userIds = Array.from(new Set(requests.filter((r) => r.user_id).map((r) => r.user_id as string)));
    const joinedAt: Record<string, string> = {};
    if (userIds.length) {
      const { data } = await (supabase as any).from('student_profiles').select('user_id, enrollment_date').in('user_id', userIds);
      for (const s of data ?? []) joinedAt[s.user_id] = s.enrollment_date;
    }
```

Return `followUps, joinedAt` in the JSON. Reuse `joinedAt` for `enrolled30` (count recent request users present in `joinedAt`) and delete the old separate `student_profiles` query.

- [ ] **Step 2: Types.** `DeskList` gains `followUps: Record<string, DemoFollowUpRow>; joinedAt: Record<string, string>;`.

- [ ] **Step 3: `RequestList.tsx`.** Add props `followUps` and `joinedAt`. When `tab === 'done'`, the third header is `Follow-up` and the cell renders:

```tsx
{(() => {
  const f = followUps[r.id];
  const joined = r.user_id ? joinedAt[r.user_id] : null;
  if (joined) return <Chip size="small" color="success" icon={<CheckCircleIcon />} label={`Joined ${formatIstDate(joined)}`} />;
  if (!f) return <Typography variant="body2" color="text.secondary">Not started</Typography>;
  const due = f.scheduled_callback_at ? new Date(f.scheduled_callback_at) : null;
  const late = f.status !== 'completed' && due && due.getTime() < now.getTime();
  return (
    <Box>
      {f.interest_level && <Chip size="small" label={INTEREST_LABELS[f.interest_level]} sx={{ mr: 0.5 }} color={f.interest_level === 'hot' ? 'error' : f.interest_level === 'warm' ? 'warning' : 'default'} />}
      <Typography component="span" variant="body2" sx={{ color: late ? 'error.main' : 'text.primary', fontWeight: late ? 700 : 400 }}>
        {f.status === 'completed' ? (f.call_outcome === 'not_interested' ? 'Not interested' : 'Closed') : due ? `${late ? 'Overdue, ' : ''}${formatDemoDateTime(due)}` : 'No date'}
      </Typography>
    </Box>
  );
})()}
```

Imports: `Chip` from `@neram/ui`, `CheckCircleIcon` from `@mui/icons-material/CheckCircle`, `INTEREST_LABELS` from `@neram/database/demo-follow-up`, `formatDemoDateTime` from `@neram/database/demo-schedule`, `formatIstDate` from `@/lib/ops-format`.

- [ ] **Step 4: Page.** Pass `followUps={list.followUps ?? {}}` and `joinedAt={list.joinedAt ?? {}}` to `RequestList`.

- [ ] **Step 5: Verify** by loading `/api/demo-requests` locally: the Task 4 demo appears in `followUps` with its date.

---

### Task 7: Enrolment link tied to the demo's person (admin)

**Files:**
- Create: `apps/admin/src/lib/phone.ts` and `apps/admin/src/lib/phone.test.ts`
- Modify: `packages/database/src/queries/direct-enrollment.ts` (`CreateDirectEnrollmentLinkInput.user_id`, `.demo_registration_id`; insert both)
- Modify: `apps/admin/src/app/api/direct-enrollment/route.ts` (accept `userId`, `demoRegistrationId`; verify the user exists)
- Modify: `apps/admin/src/components/direct-enrollment/GenerateLinkDialog.tsx` (`prefillData.userId`, `.demoRegistrationId`, ten-digit phone, "For {name}'s account" note)
- Modify: `apps/admin/src/components/demo-requests/RequestPanel.tsx` ("Send enrolment link")
- Modify: `apps/admin/src/app/(dashboard)/follow-ups/page.tsx` (`onSendLink`)
- Modify: `apps/admin/src/components/user360/tabs/JourneyTab.tsx` (pass `userId`)

**Interfaces:**
- Produces: `tenDigitPhone(raw: string | null | undefined): string` in `apps/admin/src/lib/phone.ts`; POST `/api/direct-enrollment` accepts `userId?`, `demoRegistrationId?`; `GenerateLinkDialog` `prefillData: { studentName?; studentPhone?; studentEmail?; interestCourse?; userId?; demoRegistrationId? }`.

- [ ] **Step 1: Invoke the `ui-ux-pro-max` skill** for "admin: send enrolment link button placement on request panel and follow-up row; dialog header showing the linked account".

- [ ] **Step 2: Failing test** `apps/admin/src/lib/phone.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { tenDigitPhone } from './phone';

describe('tenDigitPhone', () => {
  it('strips +91 and spaces', () => {
    expect(tenDigitPhone('+91 99672 21751')).toBe('9967221751');
    expect(tenDigitPhone('+919967221751')).toBe('9967221751');
    expect(tenDigitPhone('09967221751')).toBe('9967221751');
    expect(tenDigitPhone('9967221751')).toBe('9967221751');
  });
  it('returns empty for nothing', () => {
    expect(tenDigitPhone(null)).toBe('');
  });
});
```

Run: `npx vitest run apps/admin/src/lib/phone.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** `apps/admin/src/lib/phone.ts`:

```ts
/** The last ten digits of an Indian mobile, for fields that add +91 themselves. */
export function tenDigitPhone(raw: string | null | undefined): string {
  return (raw || '').replace(/\D/g, '').slice(-10);
}
```

Run the test → PASS.

- [ ] **Step 4: Query.** In `CreateDirectEnrollmentLinkInput` add `user_id?: string; demo_registration_id?: string;` and in the insert object add `user_id: data.user_id || null, demo_registration_id: data.demo_registration_id || null,`.

- [ ] **Step 5: API.** In `apps/admin/src/app/api/direct-enrollment/route.ts` destructure `userId, demoRegistrationId`; before creating:

```ts
    if (userId) {
      const { data: u } = await (supabase as any).from('users').select('id, user_type').eq('id', userId).maybeSingle();
      if (!u) return NextResponse.json({ error: 'That person was not found.' }, { status: 400 });
      if (u.user_type === 'student') return NextResponse.json({ error: 'This person is already a student.' }, { status: 409 });
    }
```

and pass `user_id: userId || undefined, demo_registration_id: demoRegistrationId || undefined` into `createDirectEnrollmentLink`.

- [ ] **Step 6: Dialog.** Extend `prefillData` with `userId?: string; demoRegistrationId?: string;`. In the prefill effect use `setStudentPhone(tenDigitPhone(prefillData.studentPhone))`. In the POST body add `userId: prefillData?.userId, demoRegistrationId: prefillData?.demoRegistrationId`. Under the dialog title, when `prefillData?.userId`, render `<Alert severity="info">For {prefillData.studentName}'s existing account. They sign in with the same phone number, so no second account is made.</Alert>`.

- [ ] **Step 7: Buttons.**
  - `RequestPanel.tsx`: in the "After the demo" block and in the confirmed card when `r.status === 'attended'`, add `<Button variant="contained" startIcon={<SchoolIcon />} onClick={() => setLinkOpen(true)} sx={{ minHeight: 44 }}>Send enrolment link</Button>` and render `<GenerateLinkDialog open={linkOpen} onClose={() => setLinkOpen(false)} onSuccess={() => { setLinkOpen(false); onAction({ action: 'note', note: 'Enrolment link sent' }); }} adminId={adminId} prefillData={{ studentName: r.name, studentPhone: r.phone, studentEmail: r.email || undefined, userId: r.user_id || undefined, demoRegistrationId: r.id }} />`. `adminId` comes from `const { supabaseUserId } = useAdminProfile();` (`import { useAdminProfile } from '@/contexts/AdminProfileContext';`, the same as `apps/admin/src/app/(dashboard)/direct-enrollment/page.tsx:182`), passed as `adminId={supabaseUserId || ''}`.
  - `follow-ups/page.tsx`: `onSendLink={item.user_id ? () => setLinking(item) : undefined}` with one `GenerateLinkDialog` driven by `linking` (prefill from `person_name`, `person_phone`, `user_id`, `demo_registration_id`).
  - `JourneyTab.tsx`: add `userId: detail.user.id` to the existing `prefillData`.

- [ ] **Step 8: Verify.** Locally POST `/api/direct-enrollment` with a staging lead's `userId` and `demoRegistrationId` and the existing required fields; then `select user_id, demo_registration_id, student_phone from direct_enrollment_links order by created_at desc limit 1` on staging shows both ids and a single `+91`. Delete the row.

---

### Task 8: Enrol page signs in by phone and completes under the demo account (marketing)

**Files:**
- Create: `packages/database/src/queries/disposable-account.ts` (moved from `apps/app/src/lib/adopt-account.ts`)
- Modify: `apps/app/src/lib/adopt-account.ts` (re-export from the package)
- Modify: `packages/database/src/queries/index.ts` (export)
- Modify: `apps/marketing/src/app/api/enroll/validate/route.ts` (return `forDemo`, `maskedPhone`)
- Modify: `apps/marketing/src/components/enroll/EnrollWizard.tsx` (phone sign-in when `forDemo`; LoginModal `apiBaseUrl` to the app)
- Modify: `apps/marketing/src/app/api/enroll/complete/route.ts` (owner decision, merge, update lead profile, demo attribution, close follow-ups)
- Modify: `apps/marketing/src/app/api/auth/verify-phone/route.ts` (only a verified owner blocks)

**Interfaces:**
- Consumes: `decideEnrolUser` (Task 2), `closeDemoFollowUpsOnEnrol` (Task 3), `mergeUserRecords` (`packages/database/src/queries/user-merge.ts:162`), `findVerifiedPhoneOwner` (`packages/database/src/queries/users.ts:238`).
- Produces: `isDisposableAccount(client, user, now?)` exported from `@neram/database`; validate response `link.forDemo: boolean`, `link.maskedPhone: string | null`.

- [ ] **Step 1: Invoke the `ui-ux-pro-max` skill** for "mobile enrol page sign-in: 'Sign in with the number you used for your demo', phone OTP primary, Google secondary".

- [ ] **Step 2: Move `isDisposableAccount`.** Create `packages/database/src/queries/disposable-account.ts` with the exact body of `apps/app/src/lib/adopt-account.ts` (its `DISPOSABLE_WINDOW_MS`, `countRows`, `isDisposableAccount`), typing `AdminClient` as `TypedSupabaseClient` from `'../client'`. Replace `apps/app/src/lib/adopt-account.ts` content with:

```ts
/** Moved to @neram/database so the marketing enrol flow uses the same rule. */
export { isDisposableAccount } from '@neram/database';
```

Add `export * from './disposable-account';` to `packages/database/src/queries/index.ts`. Run `npx vitest run apps/app/src` and expect the existing adopt-account tests to still pass.

- [ ] **Step 3: Validate route.** In the active-link response object (around line 209) add:

```ts
        forDemo: Boolean(link.user_id),
        maskedPhone: link.student_phone ? link.student_phone.replace(/\D/g, '').slice(-10).replace(/^(\d{2})\d{6}(\d{2})$/, '$1******$2') : null,
```

Add `forDemo?: boolean; maskedPhone?: string | null;` to the wizard's `LinkData` type.

- [ ] **Step 4: Wizard sign-in.** In `EnrollWizard.tsx` add `const [showSignIn, setShowSignIn] = useState(false);` and `const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3011';`. In the "Complete Your Enrollment" card, when `linkData?.forDemo`:
  - text: `Sign in with the number you used for your demo{linkData.maskedPhone ? ` (${linkData.maskedPhone})` : ''}.`
  - primary button "Sign in with phone number" (`startIcon={<PhoneIphone />}`, `onClick={() => setShowSignIn(true)}`), Google button becomes `variant="outlined"` below it, caption "Use Google only if it is the account you booked the demo with."
  - render `<LoginModal open={showSignIn} onClose={() => setShowSignIn(false)} apiBaseUrl={APP_URL} initialPhone={(linkData.studentPhone || '').replace(/\D/g, '').slice(-10)} onAuthenticated={() => setShowSignIn(false)} />` (full mode: phone OTP plus Google).
  For links without `forDemo` keep the current Google-first card. In the existing phone-verify `LoginModal` (line ~1294) change `apiBaseUrl=""` to `apiBaseUrl={APP_URL}` so "Sign in with this number" reaches the app's `adopt-account` and `register-user`.

- [ ] **Step 5: Complete route, choose the account.** After loading `link` and before the "already a student" check:

```ts
    let userId = auth.userId;
    if (link.user_id && link.user_id !== auth.userId) {
      const { data: signedIn } = await supabase.from('users').select('id, user_type, created_at').eq('id', auth.userId).single();
      const decision = decideEnrolUser({
        linkUserId: link.user_id,
        signedInUserId: auth.userId,
        signedInIsDisposable: signedIn ? await isDisposableAccount(supabase as any, signedIn) : false,
      });
      if (decision.action === 'refuse') return NextResponse.json({ error: decision.message, code: 'WRONG_ACCOUNT' }, { status: 409 });
      if (decision.action === 'merge') {
        // mergeUserRecords(winnerId, loserId, adminId, client): the demo account wins.
        await mergeUserRecords(decision.userId, decision.mergeFrom, null, supabase);
      }
      userId = decision.userId;
    }
```

Then replace every later `auth.userId` in the route with `userId`.

- [ ] **Step 6: Complete route, one application.** Replace the `lead_profiles` insert with: look up `const { data: existingLead } = await supabase.from('lead_profiles').select('id').eq('user_id', userId).is('deleted_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle();`. Build the same field object as today plus `demo_registration_id: link.demo_registration_id || null`. If `existingLead`, `update(fields).eq('id', existingLead.id).select().single()`; otherwise `insert({ user_id: userId, ...fields })`. Keep the non-blocking error log.

- [ ] **Step 7: Complete route, attribution and follow-up.** After the payment insert:

```ts
    if (link.demo_registration_id && leadProfile?.id) {
      const { data: demo } = await supabase.from('demo_class_registrations').select('channel, utm_source, utm_medium, utm_campaign').eq('id', link.demo_registration_id).maybeSingle();
      if (demo) {
        await supabase.from('lead_profiles').update({ utm_source: demo.utm_source || demo.channel || null, utm_medium: demo.utm_medium || null, utm_campaign: demo.utm_campaign || null }).eq('id', leadProfile.id).is('utm_source', null);
      }
    }
    await closeDemoFollowUpsOnEnrol(userId, supabase).catch((e) => console.error('[Direct Enrollment] close follow-ups failed:', e?.message));
```

Imports: `decideEnrolUser, isDisposableAccount, mergeUserRecords, closeDemoFollowUpsOnEnrol` from `@neram/database`.

- [ ] **Step 8: Verify-phone rule.** In `apps/marketing/src/app/api/auth/verify-phone/route.ts` replace

```ts
    const existingPhoneUser = await checkPhoneExists(phoneNumber, user.id, adminClient);
```

with the app's rule:

```ts
    const typedElsewhere = await checkPhoneExists(phoneNumber, user.id, adminClient);
    const existingPhoneUser = typedElsewhere ? await findVerifiedPhoneOwner(phoneNumber, user.id, adminClient) : null;
```

and import `findVerifiedPhoneOwner`.

- [ ] **Step 9: Verify on staging (manual, marketing dev server + admin).** Create a staging lead via Add demo (phone 9000000077, held, attended), send a link from its panel, open `http://localhost:3010/en/enroll?token=...` at 375 px: the card asks for the demo number; sign in with a Firebase test number mapped to 9000000077 (see `project_phone_otp_e2e_testing` memory: `NEXT_PUBLIC_E2E_TEST_MODE` bypass); complete; then on staging:

```sql
select u.id, u.user_type, (select count(*) from lead_profiles lp where lp.user_id=u.id) as leads,
       (select demo_registration_id is not null from lead_profiles lp where lp.user_id=u.id limit 1) as via_demo,
       (select status from callback_requests where user_id=u.id order by created_at desc limit 1) as fu
from users u where u.phone in ('+919000000077','9000000077');
```

Expected: one row, `student`, `leads = 1`, `via_demo = true`, `fu = completed`. Then open the same link signed in as a different established account and expect "Sign in with the number you used for your demo." Delete test rows.

---

### Task 9: Close on any enrolment (sweep) and the morning digest

**Files:**
- Create: `apps/admin/src/app/api/cron/follow-up-digest/route.ts`
- Create: `apps/admin/src/lib/follow-up-digest.ts`
- Modify: `apps/admin/vercel.json` (cron `30 3 * * *` = 09:00 IST)
- Modify: `apps/admin/src/app/api/cron/demo-messages/route.ts` (15-minute nudges)
- Delete: `apps/admin/src/app/api/cron/callback-reminders/route.ts` (replaced; it was never scheduled)
- Modify: `apps/nexus/src/app/api/cron/demo-staff-reminders/route.ts` (send `staff_digest_messages`)
- Modify: `apps/admin/src/lib/lead-channels.ts` and `apps/admin/src/app/api/leads/channels/route.ts` (exclude demo follow-ups)
- Modify: `apps/admin/src/components/demo-requests/DemoSettingsDialog.tsx` (owner order + manager pickers)

**Interfaces:**
- Consumes: `buildOwnerDigest`, `buildManagerSummary`, `type DigestRow` (Task 2); `sweepDemoFollowUps`, `listFollowUps` (Task 3, existing); `createAdminNotification` (`packages/database/src/queries/notifications.ts:200`), `sendTelegramMessage` (`packages/database/src/services/telegram.ts:37`), `sendEmail` (`packages/database/src/services/email.ts`), `resolveDemoSettings`.
- Produces: `runFollowUpDigest(now: Date, adminOrigin: string): Promise<{ owners: number; items: number; swept: { closed: number; reopened: number } }>`, `queueFollowUpNudges(now: Date, adminOrigin: string): Promise<number>`.

- [ ] **Step 1: `apps/admin/src/lib/follow-up-digest.ts`**

```ts
import {
  getSupabaseAdminClient,
  createAdminNotification,
  sendTelegramMessage,
  sendEmail,
  sweepDemoFollowUps,
  resolveDemoSettings,
  buildOwnerDigest,
  buildManagerSummary,
  istDateKey,
  type DigestRow,
} from '@neram/database';

const DAY = 86_400_000;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Queue a Teams message once per dedupe key. True when this call queued it. */
async function queueTeams(sb: any, toUserId: string, kind: string, key: string, msg: { subject: string; plain: string; link: string }): Promise<boolean> {
  const { data } = await sb
    .from('staff_digest_messages')
    .upsert(
      { to_user_id: toUserId, kind, dedupe_key: key, subject: msg.subject, plain: msg.plain, link: msg.link },
      { onConflict: 'dedupe_key', ignoreDuplicates: true },
    )
    .select('id');
  return (data || []).length > 0;
}

/** 09:00 IST: sweep, then one digest per owner and a team summary for the manager. */
export async function runFollowUpDigest(now: Date, adminOrigin: string) {
  const sb: any = getSupabaseAdminClient();
  const swept = await sweepDemoFollowUps(now, sb);
  const endOfToday = new Date(new Date(`${istDateKey(now)}T00:00:00+05:30`).getTime() + DAY).toISOString();
  const { data: due } = await sb.from('crm_follow_ups').select('*').lt('due_at', endOfToday).limit(1000);
  const rows: DigestRow[] = (due || []).map((r: any) => ({
    callback_id: r.callback_id,
    user_id: r.user_id,
    person_name: r.person_name,
    person_phone: r.person_phone,
    due_at: r.due_at,
    interest_level: r.interest_level,
    owner_id: r.assigned_to || r.crm_owner_id,
    query_type: r.query_type,
    flags: r.flags,
  }));
  const ownerIds = Array.from(new Set(rows.map((r) => r.owner_id).filter(Boolean))) as string[];
  const { data: settingsRow } = await sb.from('site_settings').select('value').eq('key', 'demo_class').maybeSingle();
  const settings = resolveDemoSettings(settingsRow?.value);
  const { data: people } = await sb
    .from('users')
    .select('id, name, email')
    .or([ownerIds.length ? `id.in.(${ownerIds.join(',')})` : null, settings.followUpManagerUpn ? `email.ilike.${settings.followUpManagerUpn}` : null].filter(Boolean).join(',') || 'id.is.null');
  const byId: Record<string, { name: string; email: string | null }> = {};
  for (const p of people || []) byId[p.id] = { name: p.name, email: p.email };
  const day = istDateKey(now);

  for (const ownerId of ownerIds) {
    const mine = rows.filter((r) => r.owner_id === ownerId);
    const d = buildOwnerDigest(mine, now, adminOrigin);
    for (const r of mine) {
      await createAdminNotification(
        { event_type: 'callback_reminder', title: `Follow up: ${r.person_name || r.person_phone}`, message: d.subject, metadata: { user_id: r.user_id, callback_id: r.callback_id, owner_id: ownerId, link: `${adminOrigin}/crm/${r.user_id}` } },
        sb,
      ).catch(() => {});
    }
    const who = byId[ownerId]?.name || 'Staff';
    await sendTelegramMessage(`<b>${escapeHtml(who)}: ${escapeHtml(d.subject)}</b>\n${escapeHtml(d.plain.split('\n').slice(1).join('\n'))}\n${d.link}`).catch(() => {});
    if (byId[ownerId]?.email) {
      await sendEmail({ to: byId[ownerId].email!, subject: `Neram follow-ups: ${d.subject}`, html: `<p>${d.plain.split('\n').map(escapeHtml).join('<br>')}</p><p><a href="${d.link}">Open Follow-ups</a></p>` }).catch(() => {});
    }
    await queueTeams(sb, ownerId, 'follow_up_digest', `digest:${ownerId}:${day}`, d);
  }

  const manager = (people || []).find((p: any) => p.email && settings.followUpManagerUpn && p.email.toLowerCase() === settings.followUpManagerUpn);
  if (manager) {
    const since = new Date(new Date(`${day}T00:00:00+05:30`).getTime() - DAY).toISOString();
    const { data: done } = await sb.from('callback_attempts').select('admin_id').gte('attempted_at', since).lt('attempted_at', new Date(`${day}T00:00:00+05:30`).toISOString());
    const doneYesterday: Record<string, number> = {};
    for (const a of done || []) doneYesterday[a.admin_id] = (doneYesterday[a.admin_id] || 0) + 1;
    const names: Record<string, string> = Object.fromEntries(ownerIds.map((id) => [id, byId[id]?.name || 'Staff']));
    const s = buildManagerSummary(rows, doneYesterday, names, now, adminOrigin);
    await sendTelegramMessage(`<b>${escapeHtml(s.subject)}</b>\n${escapeHtml(s.plain.split('\n').slice(1).join('\n'))}\n${s.link}`).catch(() => {});
    if (manager.email) await sendEmail({ to: manager.email, subject: s.subject, html: `<p>${s.plain.split('\n').map(escapeHtml).join('<br>')}</p><p><a href="${s.link}">Open Follow-ups</a></p>` }).catch(() => {});
    await queueTeams(sb, manager.id, 'follow_up_manager', `manager:${manager.id}:${day}`, s);
  }
  return { owners: ownerIds.length, items: rows.length, swept };
}

/** Every 5 minutes: follow-ups with a time in the next 15 minutes get a Teams nudge (once). */
export async function queueFollowUpNudges(now: Date, adminOrigin: string): Promise<number> {
  const sb: any = getSupabaseAdminClient();
  const { data } = await sb
    .from('crm_follow_ups')
    .select('callback_id, user_id, person_name, person_phone, due_at, assigned_to, crm_owner_id')
    .gte('due_at', now.toISOString())
    .lt('due_at', new Date(now.getTime() + 15 * 60_000).toISOString());
  let queued = 0;
  for (const r of data || []) {
    const to = r.assigned_to || r.crm_owner_id;
    if (!to) continue;
    const name = r.person_name || r.person_phone || 'a student';
    const msg = {
      subject: `Call ${name} in 15 minutes`,
      plain: `Follow-up with ${name} is due at ${new Date(r.due_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' })}.`,
      link: `${adminOrigin}/crm/${r.user_id}`,
    };
    // The bell item rides on the Teams dedupe, so each follow-up time nudges once.
    if (await queueTeams(sb, to, 'follow_up_soon', `soon:${r.callback_id}:${r.due_at}`, msg)) {
      await createAdminNotification(
        { event_type: 'callback_reminder', title: msg.subject, message: msg.plain, metadata: { user_id: r.user_id, callback_id: r.callback_id, owner_id: to, link: msg.link } },
        sb,
      ).catch(() => {});
      queued++;
    }
  }
  return queued;
}
```

- [ ] **Step 2: Cron route** `apps/admin/src/app/api/cron/follow-up-digest/route.ts`:

```ts
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/lib/marketing-ai/guard';
import { runFollowUpDigest } from '@/lib/follow-up-digest';

/** GET /api/cron/follow-up-digest (Vercel Cron, 03:30 UTC = 09:00 IST). Fails closed without CRON_SECRET. */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const origin = process.env.NEXT_PUBLIC_ADMIN_URL || new URL(request.url).origin;
    return NextResponse.json({ success: true, ...(await runFollowUpDigest(new Date(), origin)) });
  } catch (error) {
    console.error('follow-up digest failed:', error);
    return NextResponse.json({ error: 'follow-up digest failed' }, { status: 500 });
  }
}
```

Add to `apps/admin/vercel.json` `crons`: `{ "path": "/api/cron/follow-up-digest", "schedule": "30 3 * * *" }`. In `apps/admin/src/app/api/cron/demo-messages/route.ts` after the draft nudges add:

```ts
    const followUpNudges = await queueFollowUpNudges(new Date(), process.env.NEXT_PUBLIC_ADMIN_URL || new URL(request.url).origin).catch((err) => {
      console.error('follow-up nudges failed:', err);
      return 0;
    });
```

import `queueFollowUpNudges` from `@/lib/follow-up-digest`, and add `followUpNudges` to the returned JSON. Delete `apps/admin/src/app/api/cron/callback-reminders/route.ts` after `grep -rn "callback-reminders" apps .github` shows no other reference.

- [ ] **Step 3: Nexus sends Teams digests.** In `apps/nexus/src/app/api/cron/demo-staff-reminders/route.ts`, after the demo loop and before the final return, process up to 50 due `staff_digest_messages`:

```ts
    const { data: digests } = await (supabase as any)
      .from('staff_digest_messages')
      .select('id, to_user_id, kind, subject, plain, link')
      .eq('status', 'pending')
      .lte('send_after', now.toISOString())
      .limit(50);
    for (const d of digests ?? []) {
      const { results } = await sendNudge({
        studentIds: [d.to_user_id],
        audience: 'staff',
        subject: d.subject,
        plain: d.plain,
        eventType: 'demo_reminder',
        assistant: { link: d.link },
        metadata: { digest_id: d.id, kind: d.kind },
        source: { kind: 'demo_reminder', refId: d.id },
      });
      const ok = !!results[0]?.ok;
      await (supabase as any)
        .from('staff_digest_messages')
        .update({ status: ok ? 'sent' : 'failed', sent_at: ok ? new Date().toISOString() : null, error_message: ok ? null : results[0]?.channel || 'not delivered' })
        .eq('id', d.id);
      if (ok) sent++;
      else failed++;
    }
```

Move the early `if (!due.length) return ...` so it only skips the demo loop (wrap the loop in `if (due.length) { ... }`), so digests still send on runs with no demo reminders.

- [ ] **Step 4: Leads by channel.** In `apps/admin/src/app/api/leads/channels/route.ts`, for `table === 'callback_requests'` add `.or('query_type.is.null,query_type.not.in.(post_demo,demo_rebook)')` to the query (build the query, then conditionally chain it).

- [ ] **Step 5: Settings UI.** Invoke `ui-ux-pro-max` for "ordered list of people with up/down and remove, plus a single picker". In `DemoSettingsDialog.tsx` add a "Follow-ups" section after "Demo team": an ordered list `followUpOwners: string[]` rendered as rows (name from the staff list, Up/Down `IconButton`s with `aria-label`, Remove), an `Autocomplete` "Add a follow-up owner" reusing the staff options, and an `Autocomplete` "Follow-up manager (gets the team summary)". Load from `s.followUpOwnerUpns` / `s.followUpManagerUpn`; save as `followUpOwnerUpns` and `followUpManagerUpn` in the PUT body.

- [ ] **Step 6: Verify on staging.** Set staging settings (Task 4 Step 9 SQL). With one due follow-up (from Task 4/5), call `curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3013/api/cron/follow-up-digest` (read `CRON_SECRET` from `apps/admin/.env.local` without printing it: `CRON_SECRET=$(grep ^CRON_SECRET= apps/admin/.env.local | cut -d= -f2-)`). Expected JSON `owners >= 1`, `items >= 1`; `select kind, subject from staff_digest_messages order by created_at desc limit 3` shows a `follow_up_digest` row and, with Hari set as manager, a `follow_up_manager` row. Run it twice: no duplicate rows (dedupe key). Then pin Review Focus 4 (enrolment by another path): for a staging test user with an open `post_demo` follow-up, insert a minimal `student_profiles` row (`insert into student_profiles (user_id, enrollment_date) values ('<user id>', current_date)`), run the digest again, and expect `swept.closed = 1` and `select status, call_outcome from callback_requests where user_id = '<user id>'` to return `completed, joined`. Then delete the test rows.

---

### Task 10: Full verification, review, memory

**Files:**
- Delete: `scripts/check-demo-follow-ups.ts`
- Modify: `C:\Users\Haribabu\.claude\projects\c--Users-Haribabu-Documents-AppsCopilot-2026-NeramEcosystem\memory\project_demo_class_v2.md` and `MEMORY.md`

- [ ] **Step 1: Unit tests**

Run: `npx vitest run packages/database/src/utils/demo-follow-up.test.ts packages/database/src/utils/demo-schedule.test.ts apps/admin/src/lib/phone.test.ts apps/app/src`
Expected: all PASS.

- [ ] **Step 2: Type-check and lint the touched apps**

Run (each can take several minutes; run in the background and filter):
`cd apps/admin && npx tsc --noEmit -p . 2>&1 | grep -E "demo|follow-up|follow-ups|direct-enrollment|phone"`
`cd apps/marketing && npx tsc --noEmit -p . 2>&1 | grep -E "enroll|verify-phone"`
`cd apps/nexus && npx tsc --noEmit -p . 2>&1 | grep -E "demo-staff-reminders"`
`cd apps/admin && npx eslint src/app/api/demo-requests src/app/api/crm/follow-ups src/app/api/cron src/components/demo-requests src/components/follow-ups "src/app/(dashboard)/follow-ups" src/lib/follow-up-digest.ts src/lib/phone.ts`
Expected: no output from the greps; eslint clean.

- [ ] **Step 3: UI review.** Invoke `ui-ux-pro-max` to review the Follow-ups page, the desk panel and dialogs at 1024 and 1440 px, and the enrol page at 375 px (no horizontal scroll, 44 px targets, visible focus rings, labelled fields).

- [ ] **Step 4: End-to-end on staging** (one pass, cleaning up afterwards): Add demo, held, attended, Hot, next date tomorrow → appears in Follow-ups with Hot chip and "See the demo" → Log outcome Thinking with a date → Send enrolment link → enrol at 375 px with the demo phone → follow-up closed, desk Done tab shows "Joined {date}", person timeline shows "Attended a demo class" and "Joined through a demo class" → digest run lists nothing for that person.

- [ ] **Step 5: Memory.** Update `project_demo_class_v2.md` with what shipped (tables, crons, settings keys, staging-only migrations) and the `MEMORY.md` line. Report to the founder; do not commit or deploy until asked.

- [ ] **Step 6: Deploy-day checklist (only when the founder says deploy).** Apply both migrations to prod via `mcp__supabase-prod__apply_migration`; set prod settings `update site_settings set value = value || '{"followUpOwnerUpns":["tamilselvan@neramclasses.com","shanthimano@nerasmclasses.onmicrosoft.com"],"followUpManagerUpn":"haribabu@neramclasses.com"}' where key = 'demo_class';`; confirm admin Vercel has `CRON_SECRET`, `RESEND_API_KEY`, `TELEGRAM_BOT_TOKEN`/chat id (names only via `vercel env ls`); deploy with `pnpm deploy:prod --skip-commit --skip-checks --skip-db` after committing only this plan's files. This touches `packages/`, so all four apps rebuild.
