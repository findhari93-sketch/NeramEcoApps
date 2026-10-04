# Neram Assistant M1: Foundation, Brief, Launcher and Guided Flows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every Nexus student one assistant entry point that briefs them, answers the common asks deterministically, and performs three actions by guided conversation (cannot attend, remind me, add a sketch), with no language model and no Teams work yet.

**Architecture:** A server-side "brain" under `apps/nexus/src/lib/assistant/` (tool registry, policy, regex router, pure flow state machines, templated brief, action propose/confirm) behind four `/api/assistant/*` routes, plus a student-only panel (one floating button, bottom sheet on phones, right drawer on desktop) and a briefing card on the dashboard. Writes reuse the existing RSVP, away-window and sketchbook routes, whose bodies are first extracted into libraries so the route and the assistant share one implementation. M2 adds Gemini on top of the same registry; M3 adds Teams, crons and staff story cards.

**Tech Stack:** Next.js 14 App Router, TypeScript, MUI via `@neram/ui`, Supabase (service role, admin client), Vitest (root config, jsdom default, `// @vitest-environment node` for server files), Playwright (`nexus-mobile` project).

**Spec:** `docs/superpowers/specs/2026-10-03-neram-assistant-design.md`

## Global Constraints

- Never use the em dash character (U+2014), double dashes (`--`) or `&mdash;` in any user-visible text, label, reply, test fixture sentence or doc comment that renders.
- Every message to a student or teacher goes through `sendNudge` in `apps/nexus/src/lib/nudge-delivery.ts`. M1 sends no messages at all; the reminders cron that does is M3.
- No Gemini calls in M1. Do not import `@neram/ai` anywhere in this plan.
- New SQL files go in `supabase/migrations/` at the repo root and must sort after `20261101090000`. RLS enabled, no policies (service role only), end with `NOTIFY pgrst, 'reload schema';`.
- API routes are `export const dynamic = 'force-dynamic'`; every server-side `fetch` passes `cache: 'no-store'`. No new page-level data route; the brief has its own route because the dashboard route is the page's critical path.
- Caller identity on the server: `verifyMsToken` (`apps/nexus/src/lib/ms-verify.ts`) for `impersonatorUserId`, then `getRequestUser` (`apps/nexus/src/lib/study-materials.ts:69`). Student tools never accept a student id; they use `caller.id`.
- UI: MUI from `@neram/ui` only; icons from `@mui/icons-material`, never emoji; touch targets at least 48px; skeletons not spinners for async content; `prefers-reduced-motion` honoured; no horizontal scroll at 375, 768, 1024 and 1440.
- Feature flag `student.assistant-chat` (default OFF) gates the launcher, the brief card and every `/api/assistant/*` route. A `nexus_settings` key `assistant_pilot_user_ids` (JSON array of users.id) narrows it further; an empty array or missing row means everyone with the flag on.
- Tables missing from `database.generated.ts` are read with an untyped client (`getSupabaseAdminClient() as any`), the house idiom.
- Tests: Vitest colocated next to the source (`foo.test.ts`), run from the repo root with `pnpm vitest run <path>`. The nexus package has no `test` script.
- Never deploy, push or run `pnpm deploy:*`. Commit after each task only (local commits are fine; the founder pushes).

## Review Focus

Inputs the spec implies but no feature test exercises; each line's test is added to the owning task below.

1. A student types "cancel" or "stop" in the middle of a flow: the flow must clear and the reply must say so, never carry on asking the next question. (Task 14, router + turn tests.)
2. A flow left half-finished yesterday: `flow_state` older than 10 minutes must be ignored and the new message routed fresh, not fed into a stale step. (Task 14, turn test.)
3. "I can't attend" when the student has no upcoming classes in the next 14 days: the flow must say there is nothing to decline and offer the away-window path, not present empty chips. (Task 11, cannot-attend test.)
4. A confirm request for an action owned by another student, or with a stale token, or after it was already executed: all three must be refused and must not execute. (Task 6, actions tests.)
5. Image attached to the composer that is not an image, or larger than the upload accepts: the composer must refuse before uploading and keep the typed text. (Task 18, Composer test.)

## File Structure

New files, one responsibility each:

| File | Responsibility |
|---|---|
| `supabase/migrations/20261105090000_nexus_assistant_threads.sql` | threads, messages, actions tables |
| `supabase/migrations/20261105090100_nexus_assistant_reminders.sql` | reminders table |
| `apps/nexus/src/lib/assistant/types.ts` | shared types: caller, tool, context, envelope, flow state |
| `apps/nexus/src/lib/assistant/access.ts` | flag + pilot allowlist gate for the server routes |
| `apps/nexus/src/lib/assistant/registry.ts` | `TOOLS`, `toolsFor`, `findTool` |
| `apps/nexus/src/lib/assistant/policy.ts` | audience filter, impersonation rule, `bindStudentSelf` |
| `apps/nexus/src/lib/assistant/store.ts` | service-role CRUD for threads, messages, actions, reminders |
| `apps/nexus/src/lib/assistant/actions.ts` | propose, confirm, cancel with token and expiry |
| `apps/nexus/src/lib/assistant/format.ts` | `formatTime12`, `relativeDay`, `todayIst`, `addDaysYmd` re-export |
| `apps/nexus/src/lib/assistant/dates.ts` | `parseDateRange`, `parseSingleDate` for typed dates |
| `apps/nexus/src/lib/assistant/brief.ts` | pure `buildBrief(facts)` |
| `apps/nexus/src/lib/assistant/brief-load.ts` | `loadBriefFacts(supabase, userId)` |
| `apps/nexus/src/lib/assistant/router.ts` | pure `routeIntent(text, pageContext)` |
| `apps/nexus/src/lib/assistant/flows/types.ts` | `FlowState`, `FlowInput`, `FlowOutcome` |
| `apps/nexus/src/lib/assistant/flows/cannot-attend.ts` | state machine |
| `apps/nexus/src/lib/assistant/flows/remind-me.ts` | state machine |
| `apps/nexus/src/lib/assistant/flows/upload-sketch.ts` | state machine |
| `apps/nexus/src/lib/assistant/tools/student/*.ts` | `my_brief`, `my_schedule`, `my_assignments`, `my_catchup`, `my_attendance`, `my_sketchbook`, `exam_countdown` |
| `apps/nexus/src/lib/assistant/tools/actions/*.ts` | `decline_class`, `declare_away_window`, `set_reminder`, `add_sketch` |
| `apps/nexus/src/lib/assistant/turn.ts` | `runAssistantTurn` stages 1 to 3 plus the no-model fallback |
| `apps/nexus/src/lib/upcoming-classes.ts` | extracted upcoming-classes query |
| `apps/nexus/src/lib/rsvp-write.ts` | extracted RSVP decline/attend writer |
| `apps/nexus/src/lib/away-windows-write.ts` | extracted away-window declaration |
| `apps/nexus/src/lib/sketchbook-add.ts` | extracted add-sketch writer |
| `apps/nexus/src/app/api/assistant/brief/route.ts` | GET brief |
| `apps/nexus/src/app/api/assistant/turn/route.ts` | POST turn |
| `apps/nexus/src/app/api/assistant/actions/[id]/route.ts` | POST confirm, DELETE cancel |
| `apps/nexus/src/app/api/assistant/threads/route.ts` | POST new thread |
| `apps/nexus/src/app/api/assistant/threads/[id]/route.ts` | GET messages |
| `apps/nexus/src/lib/assistant/client.ts` | browser fetch helpers and the `Envelope` client type |
| `apps/nexus/src/components/assistant/AssistantProvider.tsx` | panel state, thread, send/confirm, report-a-problem action |
| `apps/nexus/src/components/assistant/AssistantLauncher.tsx` | the one floating button |
| `apps/nexus/src/components/assistant/AssistantSheet.tsx` | bottom sheet / right drawer shell |
| `apps/nexus/src/components/assistant/MessageList.tsx`, `MessageBubble.tsx`, `SuggestionChips.tsx`, `Composer.tsx`, `ActionCard.tsx`, `QuickActions.tsx` | panel parts |
| `apps/nexus/src/components/assistant/BriefCard.tsx` | dashboard card |
| `apps/nexus/src/components/assistant/AssistantTopBarButton.tsx` | desktop icon beside the bell |
| `tests/e2e/assistant-nexus-mobile.spec.ts` | Playwright, 375px and 1280px |

Modified: `apps/nexus/src/lib/feature-flags.ts`, `apps/nexus/src/app/api/dashboard/student/route.ts`, `apps/nexus/src/app/api/timetable/rsvp/route.ts`, `apps/nexus/src/app/api/student/away-windows/route.ts`, `apps/nexus/src/app/api/sketchbook/entries/route.ts`, `apps/nexus/src/app/(student)/layout.tsx`, `apps/nexus/src/app/(student)/student/dashboard/page.tsx`, `apps/nexus/src/components/TopBar.tsx`. Deleted: `apps/nexus/src/components/ReportIssueFab.tsx`.

---

### Task 1: Migrations

**Files:**
- Create: `supabase/migrations/20261105090000_nexus_assistant_threads.sql`
- Create: `supabase/migrations/20261105090100_nexus_assistant_reminders.sql`

**Interfaces:**
- Produces: tables `nexus_assistant_threads`, `nexus_assistant_messages`, `nexus_assistant_actions`, `nexus_assistant_reminders` read by `store.ts` (Task 5).

- [ ] **Step 1: Write the threads migration**

```sql
-- Neram Assistant conversations: one thread per person per channel, the
-- messages in it, and the actions the assistant proposed and the person
-- confirmed. Written only by apps/nexus/src/lib/assistant/store.ts.
--
-- flow_state holds a guided flow in progress ("which class can't you attend?")
-- so the next message can continue it; it is cleared when the flow ends and
-- ignored once stale (see lib/assistant/turn.ts).

CREATE TABLE IF NOT EXISTS nexus_assistant_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('nexus', 'teams')),
  external_id text,
  title text,
  page_context jsonb,
  flow_state jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_nat_user_channel_external
  ON nexus_assistant_threads (user_id, channel, external_id)
  WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nat_user_recent
  ON nexus_assistant_threads (user_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS nexus_assistant_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES nexus_assistant_threads(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  text text NOT NULL,
  mode text,
  llm boolean NOT NULL DEFAULT false,
  tool_calls jsonb,
  envelope jsonb,
  model text,
  prompt_tokens integer,
  output_tokens integer,
  cost_usd numeric(10,6),
  external_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Teams redelivers an activity it thinks failed; the same activity id must
-- not become two user messages.
CREATE UNIQUE INDEX IF NOT EXISTS idx_nam_thread_external
  ON nexus_assistant_messages (thread_id, external_id)
  WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nam_thread_created
  ON nexus_assistant_messages (thread_id, created_at);

CREATE TABLE IF NOT EXISTS nexus_assistant_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid REFERENCES nexus_assistant_threads(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  args jsonb NOT NULL,
  summary text NOT NULL,
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  confirm_token text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'executing', 'executed', 'failed', 'cancelled', 'expired')),
  result jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  executed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_naa_user_status ON nexus_assistant_actions (user_id, status);

ALTER TABLE nexus_assistant_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_assistant_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_assistant_actions ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Write the reminders migration**

```sql
-- "Remind me on Friday to finish the catch-up." Stored here by the assistant;
-- the daily brief shows the ones due today and the M3 cron sends the rest
-- through sendNudge. status: queued -> sent. sent_via: 'brief' | 'cron'.

CREATE TABLE IF NOT EXISTS nexus_assistant_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES nexus_assistant_threads(id) ON DELETE SET NULL,
  due_on date NOT NULL,
  text text NOT NULL,
  kind text NOT NULL DEFAULT 'free',
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'cancelled')),
  sent_at timestamptz,
  sent_via text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nar_status_due ON nexus_assistant_reminders (status, due_on);
CREATE INDEX IF NOT EXISTS idx_nar_user_due ON nexus_assistant_reminders (user_id, due_on);

ALTER TABLE nexus_assistant_reminders ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 3: Check the files sort after the newest migration**

Run: `ls supabase/migrations | tail -4`
Expected: the two new files appear after `20261028090000_answer_pad_present_mode.sql`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261105090000_nexus_assistant_threads.sql supabase/migrations/20261105090100_nexus_assistant_reminders.sql
git commit -m "feat(assistant): threads, messages, actions and reminders tables"
```

---

### Task 2: Feature flag and pilot allowlist gate

**Files:**
- Modify: `apps/nexus/src/lib/feature-flags.ts` (student block, after `student.attendance` at line 64)
- Create: `apps/nexus/src/lib/assistant/access.ts`
- Test: `apps/nexus/src/lib/assistant/access.test.ts`

**Interfaces:**
- Produces: `ASSISTANT_FLAG = 'student.assistant-chat'`, `PILOT_KEY = 'assistant_pilot_user_ids'`, `assertAssistantAccess(supabase, caller: { id: string; user_type: string | null }): Promise<void>` (throws `ApiError` 403/404), `readAssistantGate(supabase): Promise<{ enabled: boolean; pilot: string[] }>`.

- [ ] **Step 1: Add the flag**

In `apps/nexus/src/lib/feature-flags.ts`, directly after the `student.attendance` line:

```ts
  // Behaviour switch and a surface at once: the Neram Assistant launcher, the
  // dashboard brief card and every /api/assistant route. OFF until the founder
  // has walked the three guided flows on a phone. The pilot allowlist in
  // nexus_settings (assistant_pilot_user_ids) narrows it further.
  { id: 'student.assistant-chat', label: 'Neram Assistant (chat, brief card, guided actions)', surface: 'student', group: 'Home', paths: [], defaultEnabled: false },
```

- [ ] **Step 2: Write the failing access test**

`apps/nexus/src/lib/assistant/access.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api-errors';
import { assertAssistantAccess, readAssistantGate } from './access';

function settingsDb(rows: Record<string, unknown>) {
  return {
    from: () => ({
      select: () => ({
        in: async () => ({
          data: Object.entries(rows).map(([key, value]) => ({ key, value })),
          error: null,
        }),
      }),
    }),
  };
}

const student = { id: 'u1', user_type: 'student' };

describe('readAssistantGate', () => {
  it('is off with no settings rows at all', async () => {
    const gate = await readAssistantGate(settingsDb({}));
    expect(gate).toEqual({ enabled: false, pilot: [] });
  });

  it('reads the flag and the allowlist', async () => {
    const gate = await readAssistantGate(
      settingsDb({ feature_flags: { 'student.assistant-chat': true }, assistant_pilot_user_ids: ['u1', 'u2'] }),
    );
    expect(gate).toEqual({ enabled: true, pilot: ['u1', 'u2'] });
  });

  it('ignores a malformed allowlist instead of trusting it', async () => {
    const gate = await readAssistantGate(
      settingsDb({ feature_flags: { 'student.assistant-chat': true }, assistant_pilot_user_ids: 'u1' }),
    );
    expect(gate.pilot).toEqual([]);
  });
});

describe('assertAssistantAccess', () => {
  it('404s when the flag is off, so the route looks absent', async () => {
    await expect(assertAssistantAccess(settingsDb({}), student)).rejects.toMatchObject({ status: 404 });
  });

  it('403s a non-student', async () => {
    const db = settingsDb({ feature_flags: { 'student.assistant-chat': true } });
    await expect(assertAssistantAccess(db, { id: 't1', user_type: 'teacher' })).rejects.toMatchObject({ status: 403 });
  });

  it('403s a student outside a non-empty pilot list', async () => {
    const db = settingsDb({ feature_flags: { 'student.assistant-chat': true }, assistant_pilot_user_ids: ['u9'] });
    await expect(assertAssistantAccess(db, student)).rejects.toMatchObject({ status: 403 });
  });

  it('passes a student when the flag is on and the list is empty', async () => {
    const db = settingsDb({ feature_flags: { 'student.assistant-chat': true } });
    await expect(assertAssistantAccess(db, student)).resolves.toBeUndefined();
  });

  it('passes a listed student', async () => {
    const db = settingsDb({ feature_flags: { 'student.assistant-chat': true }, assistant_pilot_user_ids: ['u1'] });
    await expect(assertAssistantAccess(db, student)).resolves.toBeUndefined();
  });

  it('throws ApiError, not a bare Error', async () => {
    await expect(assertAssistantAccess(settingsDb({}), student)).rejects.toBeInstanceOf(ApiError);
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `pnpm vitest run apps/nexus/src/lib/assistant/access.test.ts`
Expected: FAIL, cannot find module `./access`.

- [ ] **Step 4: Implement access.ts**

```ts
import { ApiError } from '@/lib/api-errors';
import { FEATURE_FLAGS_KEY, isFeatureEnabled, resolveFlags } from '@/lib/feature-flags';

export const ASSISTANT_FLAG = 'student.assistant-chat';
/** nexus_settings key: a JSON array of users.id. Empty or missing means everyone with the flag on. */
export const PILOT_KEY = 'assistant_pilot_user_ids';

export interface AssistantGate {
  enabled: boolean;
  pilot: string[];
}

/**
 * One read for both switches. Fails CLOSED: a settings error reads as "off",
 * which is a 404 on a feature the founder has not opened yet, never a leak.
 */
export async function readAssistantGate(supabase: any): Promise<AssistantGate> {
  try {
    const { data, error } = await supabase
      .from('nexus_settings')
      .select('key, value')
      .in('key', [FEATURE_FLAGS_KEY, PILOT_KEY]);
    if (error) return { enabled: false, pilot: [] };
    const rows = (data || []) as Array<{ key: string; value: unknown }>;
    const flags = resolveFlags((rows.find((r) => r.key === FEATURE_FLAGS_KEY)?.value as Record<string, boolean>) || {});
    const rawPilot = rows.find((r) => r.key === PILOT_KEY)?.value;
    const pilot = Array.isArray(rawPilot) ? rawPilot.filter((v): v is string => typeof v === 'string') : [];
    return { enabled: isFeatureEnabled(ASSISTANT_FLAG, flags), pilot };
  } catch {
    return { enabled: false, pilot: [] };
  }
}

/**
 * The gate every /api/assistant route passes first.
 *
 * Off reads as 404 rather than 403 on purpose: while the feature is dark the
 * route should look like it does not exist, so nothing in a console hints at
 * what is coming. A student outside the pilot list, or a non-student, gets the
 * honest 403.
 */
export async function assertAssistantAccess(
  supabase: any,
  caller: { id: string; user_type: string | null },
): Promise<void> {
  const gate = await readAssistantGate(supabase);
  if (!gate.enabled) throw new ApiError('Not found', 404);
  if (caller.user_type !== 'student') throw new ApiError('Neram Assistant is for students in this release.', 403);
  if (gate.pilot.length > 0 && !gate.pilot.includes(caller.id)) {
    throw new ApiError('Neram Assistant is not switched on for your account yet.', 403);
  }
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run apps/nexus/src/lib/assistant/access.test.ts apps/nexus/src/lib/feature-flags.test.ts`
Expected: PASS (the flag is a student flag defaulting OFF, which the existing registry test requires).

- [ ] **Step 6: Commit**

```bash
git add apps/nexus/src/lib/feature-flags.ts apps/nexus/src/lib/assistant/access.ts apps/nexus/src/lib/assistant/access.test.ts
git commit -m "feat(assistant): student.assistant-chat flag and pilot allowlist gate"
```

---

### Task 3: Types, format helpers and date parsing

**Files:**
- Create: `apps/nexus/src/lib/assistant/types.ts`
- Create: `apps/nexus/src/lib/assistant/format.ts`
- Create: `apps/nexus/src/lib/assistant/dates.ts`
- Test: `apps/nexus/src/lib/assistant/format.test.ts`, `apps/nexus/src/lib/assistant/dates.test.ts`

**Interfaces:**
- Produces: every type below; `formatTime12(hhmm)`, `relativeDay(ymd, today)`, `todayIst()`, `parseSingleDate(text, today)`, `parseDateRange(text, today)`.

- [ ] **Step 1: Write types.ts**

```ts
/**
 * Shared shapes for the Neram Assistant brain. Pure types, no imports from
 * Supabase or React, so both the server and the panel can use them.
 */

export type Channel = 'nexus' | 'teams';
export type Mode = 'general' | 'exam';
export type Audience = 'student' | 'staff' | 'both';
export type ToolKind = 'read' | 'action';

export interface AssistantCaller {
  id: string;
  name: string | null;
  user_type: string | null;
  staff_role: string | null;
  can_teach: boolean | null;
  /** True when a teacher is viewing as this student. Reads allowed, actions refused. */
  impersonating: boolean;
}

export interface PageContext {
  path: string;
  classroomId?: string | null;
  classId?: string | null;
}

export interface ToolLink {
  label: string;
  url: string;
}

/** A chip the person can tap. `send` is the text posted back when tapped. */
export interface Suggestion {
  label: string;
  send: string;
}

export interface ActionProposal {
  id: string;
  kind: string;
  summary: string;
  fields: Array<{ label: string; value: string }>;
  confirmToken: string;
  expiresAt: string;
}

export interface ToolResult {
  ok: boolean;
  /** Templated sentence for the deterministic path. The LLM path (M2) reads `data`. */
  reply?: string;
  data?: unknown;
  error?: string;
  links?: ToolLink[];
  suggest?: Suggestion[];
  action?: ActionProposal;
}

export interface ToolContext {
  caller: AssistantCaller;
  channel: Channel;
  mode: Mode;
  /** Untyped admin client: the assistant tables are not in database.generated.ts. */
  supabase: any;
  /** The student's newest active classroom, resolved once per turn. */
  classroomId: string | null;
  threadId: string | null;
  now: Date;
  baseUrl: string;
}

export interface JsonSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
}

export interface ToolDef<A = Record<string, unknown>> {
  name: string;
  description: string;
  parameters: JsonSchema;
  audience: Audience;
  kind: ToolKind;
  /** Exam-knowledge tools set 'exam'. Absent means general. */
  mode?: Mode;
  run(ctx: ToolContext, args: A): Promise<ToolResult>;
}

/** An action tool proposes in `run` and writes in `execute`. */
export interface ActionToolDef<A = Record<string, unknown>> extends ToolDef<A> {
  kind: 'action';
  execute(ctx: ToolContext, args: A): Promise<ToolResult>;
}

export interface Envelope {
  reply: string;
  suggestions: Suggestion[];
  links: ToolLink[];
  action: ActionProposal | null;
  mode: Mode;
  threadId: string;
  /** Set by the flows so the panel can show the attach button at the right step. */
  wantsAttachment?: boolean;
}

export interface Attachment {
  original_image_url: string;
  thumbnail_url: string | null;
}
```

- [ ] **Step 2: Write the failing format and dates tests**

`apps/nexus/src/lib/assistant/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatTime12, relativeDay } from './format';

describe('formatTime12', () => {
  it('turns 24h into 12h with am/pm', () => {
    expect(formatTime12('18:00')).toBe('6:00 pm');
    expect(formatTime12('09:05:00')).toBe('9:05 am');
    expect(formatTime12('00:30')).toBe('12:30 am');
    expect(formatTime12('12:00')).toBe('12:00 pm');
  });
  it('returns the input when it is not a time', () => {
    expect(formatTime12('soon')).toBe('soon');
  });
});

describe('relativeDay', () => {
  const today = '2026-10-03';
  it('names today and tomorrow', () => {
    expect(relativeDay('2026-10-03', today)).toBe('today');
    expect(relativeDay('2026-10-04', today)).toBe('tomorrow');
  });
  it('names a weekday inside the week, then a date', () => {
    expect(relativeDay('2026-10-06', today)).toBe('Tuesday 6 Oct');
    expect(relativeDay('2026-10-20', today)).toBe('20 Oct');
  });
  it('says yesterday for the day before', () => {
    expect(relativeDay('2026-10-02', today)).toBe('yesterday');
  });
});
```

`apps/nexus/src/lib/assistant/dates.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseDateRange, parseSingleDate } from './dates';

const today = '2026-10-03'; // a Saturday

describe('parseSingleDate', () => {
  it('reads relative words', () => {
    expect(parseSingleDate('today', today)).toBe('2026-10-03');
    expect(parseSingleDate('tomorrow', today)).toBe('2026-10-04');
    expect(parseSingleDate('day after tomorrow', today)).toBe('2026-10-05');
  });
  it('reads a weekday as the next one', () => {
    expect(parseSingleDate('monday', today)).toBe('2026-10-05');
    expect(parseSingleDate('next friday', today)).toBe('2026-10-09');
    expect(parseSingleDate('on sat', today)).toBe('2026-10-10');
  });
  it('reads day and month, with or without a year', () => {
    expect(parseSingleDate('8 Oct', today)).toBe('2026-10-08');
    expect(parseSingleDate('8th October 2026', today)).toBe('2026-10-08');
    expect(parseSingleDate('2026-10-08', today)).toBe('2026-10-08');
  });
  it('rolls a past day-month into next year', () => {
    expect(parseSingleDate('2 Jan', today)).toBe('2027-01-02');
  });
  it('returns null for nothing it recognises', () => {
    expect(parseSingleDate('whenever', today)).toBeNull();
  });
});

describe('parseDateRange', () => {
  it('reads "X to Y"', () => {
    expect(parseDateRange('8 Oct to 12 Oct', today)).toEqual({ from: '2026-10-08', to: '2026-10-12' });
    expect(parseDateRange('from tomorrow till friday', today)).toEqual({ from: '2026-10-04', to: '2026-10-09' });
  });
  it('reads "for N days" from today or a start', () => {
    expect(parseDateRange('for 3 days', today)).toEqual({ from: '2026-10-03', to: '2026-10-05' });
    expect(parseDateRange('from monday for 5 days', today)).toEqual({ from: '2026-10-05', to: '2026-10-09' });
  });
  it('reads "next week" as Monday to Sunday', () => {
    expect(parseDateRange('next week', today)).toEqual({ from: '2026-10-05', to: '2026-10-11' });
  });
  it('reads one date as a one-day range', () => {
    expect(parseDateRange('tomorrow', today)).toEqual({ from: '2026-10-04', to: '2026-10-04' });
  });
  it('returns null when it cannot', () => {
    expect(parseDateRange('some time', today)).toBeNull();
    expect(parseDateRange('12 Oct to 8 Oct', today)).toBeNull();
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `pnpm vitest run apps/nexus/src/lib/assistant/format.test.ts apps/nexus/src/lib/assistant/dates.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 4: Implement format.ts**

```ts
/**
 * Words for times and days, shared by the brief, the flows and the panel.
 * YYYY-MM-DD strings only, compared as strings, never through Date math that
 * could shift under a time zone (see lib/away-windows.ts for the reasoning).
 */
import { addDaysYmd, formatDay } from '@/lib/away-windows';

export { addDaysYmd, formatDay };

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** IST calendar date, as every other student-facing surface counts "today". */
export function todayIst(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
}

/** "HH:MM" in IST right now, for "has this class already ended today". */
export function nowHHMMIst(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
}

/** "18:00" or "18:00:00" to "6:00 pm". Anything else is returned untouched. */
export function formatTime12(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!m) return hhmm;
  const h = Number(m[1]);
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]} ${suffix}`;
}

export function dayOfWeek(ymd: string): number {
  return new Date(`${ymd}T00:00:00Z`).getUTCDay();
}

export function daysBetweenYmd(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** "today", "tomorrow", "yesterday", "Tuesday 6 Oct" within a week, else "20 Oct". */
export function relativeDay(ymd: string, today: string): string {
  const d = daysBetweenYmd(today, ymd);
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d === -1) return 'yesterday';
  if (d > 1 && d < 7) return `${WEEKDAYS[dayOfWeek(ymd)]} ${formatDay(ymd)}`;
  return formatDay(ymd);
}
```

- [ ] **Step 5: Implement dates.ts**

```ts
/**
 * Dates a student types: "tomorrow", "next friday", "8 Oct to 12 Oct", "for 3
 * days". English only in M1; Tamil and Hindi forms are a later task. Pure.
 */
import { addDaysYmd, dayOfWeek, todayIst } from './format';

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
};

const pad = (n: number) => String(n).padStart(2, '0');

function ymd(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const s = `${y}-${pad(m)}-${pad(d)}`;
  // Reject 31 Feb and friends: a real date round-trips.
  return new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s ? s : null;
}

/** One date from free text, or null. Past day-months roll into next year. */
export function parseSingleDate(raw: string, today: string = todayIst()): string | null {
  const text = raw.trim().toLowerCase().replace(/^(on|from|by|until|till|to)\s+/, '');
  if (!text) return null;
  if (/^today$/.test(text)) return today;
  if (/^tomorrow$/.test(text)) return addDaysYmd(today, 1);
  if (/^day after( tomorrow)?$/.test(text)) return addDaysYmd(today, 2);
  if (/^yesterday$/.test(text)) return addDaysYmd(today, -1);

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (iso) return ymd(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const weekday = /^(?:next\s+|this\s+)?([a-z]+)$/.exec(text);
  if (weekday && weekday[1] in WEEKDAYS) {
    const target = WEEKDAYS[weekday[1]];
    const cur = dayOfWeek(today);
    let ahead = (target - cur + 7) % 7;
    if (ahead === 0) ahead = 7; // "friday" said on a Friday means next Friday
    return addDaysYmd(today, ahead);
  }

  // "8 oct", "8th october 2026", "oct 8", "october 8, 2026", "8/10", "8/10/2026"
  let m = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\.?(?:\s+(\d{4}))?$/.exec(text);
  let day: number | null = null;
  let month: number | null = null;
  let year: number | null = null;
  if (m && m[2] in MONTHS) {
    day = Number(m[1]); month = MONTHS[m[2]]; year = m[3] ? Number(m[3]) : null;
  } else {
    m = /^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?(?:\s+(\d{4}))?$/.exec(text);
    if (m && m[1] in MONTHS) {
      day = Number(m[2]); month = MONTHS[m[1]]; year = m[3] ? Number(m[3]) : null;
    } else {
      m = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?$/.exec(text);
      if (m) { day = Number(m[1]); month = Number(m[2]); year = m[3] ? Number(m[3]) : null; }
    }
  }
  if (day === null || month === null) return null;
  const thisYear = Number(today.slice(0, 4));
  const candidate = ymd(year ?? thisYear, month, day);
  if (!candidate) return null;
  if (year === null && candidate < today) return ymd(thisYear + 1, month, day);
  return candidate;
}

export interface DateRange {
  from: string;
  to: string;
}

/** A span of days from free text, or null. `to` is inclusive. */
export function parseDateRange(raw: string, today: string = todayIst()): DateRange | null {
  const text = raw.trim().toLowerCase();
  if (!text) return null;

  if (/^next week$/.test(text)) {
    const cur = dayOfWeek(today);
    const toMonday = ((1 - cur + 7) % 7) || 7;
    const from = addDaysYmd(today, toMonday);
    return { from, to: addDaysYmd(from, 6) };
  }

  // "from X for N days" or "for N days"
  let m = /^(?:from\s+(.+?)\s+)?for\s+(?:the\s+)?(?:next\s+)?(\d{1,3})\s+days?$/.exec(text);
  if (m) {
    const from = m[1] ? parseSingleDate(m[1], today) : today;
    const n = Number(m[2]);
    if (!from || n < 1) return null;
    return { from, to: addDaysYmd(from, n - 1) };
  }
  m = /^(?:next|the next)\s+(\d{1,3})\s+days?$/.exec(text);
  if (m) return { from: today, to: addDaysYmd(today, Number(m[1]) - 1) };

  // "X to Y", "X till Y", "X until Y", "X - Y"
  m = /^(?:from\s+)?(.+?)\s+(?:to|till|until|through|-)\s+(.+)$/.exec(text);
  if (m) {
    const from = parseSingleDate(m[1], today);
    const to = parseSingleDate(m[2], today);
    if (!from || !to || to < from) return null;
    return { from, to };
  }

  const single = parseSingleDate(text, today);
  return single ? { from: single, to: single } : null;
}
```

- [ ] **Step 6: Run the tests**

Run: `pnpm vitest run apps/nexus/src/lib/assistant/format.test.ts apps/nexus/src/lib/assistant/dates.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/nexus/src/lib/assistant/types.ts apps/nexus/src/lib/assistant/format.ts apps/nexus/src/lib/assistant/dates.ts apps/nexus/src/lib/assistant/format.test.ts apps/nexus/src/lib/assistant/dates.test.ts
git commit -m "feat(assistant): shared types, time and date helpers"
```

---

### Task 4: Registry and policy

**Files:**
- Create: `apps/nexus/src/lib/assistant/registry.ts`
- Create: `apps/nexus/src/lib/assistant/policy.ts`
- Test: `apps/nexus/src/lib/assistant/policy.test.ts`

**Interfaces:**
- Consumes: `ToolDef`, `ActionToolDef`, `AssistantCaller`, `Mode` from Task 3.
- Produces: `TOOLS: ToolDef[]` (filled by Tasks 12 and 13; starts empty), `registerTools(defs)` for tests, `findTool(name)`, `findActionTool(kind)`, `toolsFor(caller, mode)`; `audienceOf(caller)`, `allowedTools(tools, caller, mode)`, `bindStudentSelf(caller, args)`.

- [ ] **Step 1: Write the failing policy test**

```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ActionToolDef, AssistantCaller, ToolDef } from './types';
import { allowedTools, audienceOf, bindStudentSelf } from './policy';

const ok = async () => ({ ok: true });
const schema = { type: 'object' as const, properties: {} };

const studentRead: ToolDef = { name: 'my_brief', description: '', parameters: schema, audience: 'student', kind: 'read', run: ok };
const staffRead: ToolDef = { name: 'find_student', description: '', parameters: schema, audience: 'staff', kind: 'read', run: ok };
const examRead: ToolDef = { name: 'qb_weightage', description: '', parameters: schema, audience: 'student', kind: 'read', mode: 'exam', run: ok };
const studentAction: ActionToolDef = { name: 'set_reminder', description: '', parameters: schema, audience: 'student', kind: 'action', run: ok, execute: ok };
const ALL = [studentRead, staffRead, examRead, studentAction];

const student: AssistantCaller = { id: 's1', name: 'Priya', user_type: 'student', staff_role: null, can_teach: null, impersonating: false };
const teacher: AssistantCaller = { ...student, id: 't1', user_type: 'teacher', staff_role: 'teacher' };

describe('audienceOf', () => {
  it('is student for a plain student and staff for any staff tier', () => {
    expect(audienceOf(student)).toBe('student');
    expect(audienceOf(teacher)).toBe('staff');
    expect(audienceOf({ ...student, user_type: 'admin', staff_role: null })).toBe('staff');
  });
});

describe('allowedTools', () => {
  it('never shows a student a staff tool', () => {
    const names = allowedTools(ALL, student, 'general').map((t) => t.name);
    expect(names).toEqual(['my_brief', 'set_reminder']);
  });
  it('in exam mode allows only exam tools, so no student data can reach that path', () => {
    expect(allowedTools(ALL, student, 'exam').map((t) => t.name)).toEqual(['qb_weightage']);
  });
  it('drops every action while impersonating', () => {
    const names = allowedTools(ALL, { ...student, impersonating: true }, 'general').map((t) => t.name);
    expect(names).toEqual(['my_brief']);
  });
  it('shows staff their tools and nothing student-only', () => {
    expect(allowedTools(ALL, teacher, 'general').map((t) => t.name)).toEqual(['find_student']);
  });
});

describe('bindStudentSelf', () => {
  it('overwrites any id a student passes with their own', () => {
    expect(bindStudentSelf(student, { student_id: 'victim', user_id: 'victim', classroom_id: 'c1' })).toEqual({
      student_id: 's1', user_id: 's1', classroom_id: 'c1',
    });
  });
  it('leaves staff arguments alone', () => {
    expect(bindStudentSelf(teacher, { student_id: 'x' })).toEqual({ student_id: 'x' });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vitest run apps/nexus/src/lib/assistant/policy.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement policy.ts**

```ts
import { resolveStaffRole } from '@/lib/staff-capabilities';
import type { AssistantCaller, Audience, Mode, ToolDef } from './types';

/** Student unless the row resolves to a staff tier. Parents never reach here (access.ts). */
export function audienceOf(caller: AssistantCaller): Exclude<Audience, 'both'> {
  return resolveStaffRole({ staff_role: caller.staff_role, user_type: caller.user_type }) ? 'staff' : 'student';
}

/**
 * Which tools this person may use right now. Enforced here, not in a prompt.
 *
 * Exam mode keeps ONLY exam tools. That rule is what makes the free Gemini key
 * safe there in M2: nothing about the student can be fetched on that path.
 * Impersonation drops every action: a teacher viewing as a student may look,
 * never act in their name.
 */
export function allowedTools(tools: ToolDef[], caller: AssistantCaller, mode: Mode): ToolDef[] {
  const audience = audienceOf(caller);
  return tools.filter((t) => {
    if (t.audience !== 'both' && t.audience !== audience) return false;
    // Impersonation runs BEFORE the mode filter, in every mode (Ruling 6).
    if (caller.impersonating && t.kind === 'action') return false;
    if (mode === 'exam') return t.mode === 'exam';
    return t.mode !== 'exam';
  });
}

const SELF_KEYS = ['student_id', 'user_id', 'studentId', 'userId'];

/** A student's arguments always point at themselves, whatever was typed or generated. */
export function bindStudentSelf<A extends Record<string, unknown>>(caller: AssistantCaller, args: A): A {
  if (audienceOf(caller) !== 'student') return args;
  const out: Record<string, unknown> = { ...args };
  for (const key of SELF_KEYS) if (key in out) out[key] = caller.id;
  return out as A;
}
```

- [ ] **Step 4: Implement registry.ts**

```ts
import type { ActionToolDef, AssistantCaller, Mode, ToolDef } from './types';
import { allowedTools } from './policy';

/**
 * Every tool the assistant knows. Filled by the tool modules at import time
 * through registerTools, so a module that is never imported never exists, and
 * tests can register fixtures without touching the real list.
 */
export const TOOLS: ToolDef[] = [];

export function registerTools(defs: ToolDef[]): void {
  for (const def of defs) {
    if (TOOLS.some((t) => t.name === def.name)) throw new Error(`Duplicate assistant tool: ${def.name}`);
    TOOLS.push(def);
  }
}

export function findTool(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name);
}

export function isActionTool(def: ToolDef | undefined): def is ActionToolDef {
  return !!def && def.kind === 'action' && typeof (def as ActionToolDef).execute === 'function';
}

export function findActionTool(kind: string): ActionToolDef | undefined {
  const def = findTool(kind);
  return isActionTool(def) ? def : undefined;
}

export function toolsFor(caller: AssistantCaller, mode: Mode): ToolDef[] {
  return allowedTools(TOOLS, caller, mode);
}

/** Gemini `functionDeclarations` shape, used from M2. Harmless here. */
export function toGeminiDeclarations(tools: ToolDef[]): Array<{ functionDeclarations: unknown[] }> {
  return [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })) }];
}
```

- [ ] **Step 5: Run the test**

Run: `pnpm vitest run apps/nexus/src/lib/assistant/policy.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/nexus/src/lib/assistant/registry.ts apps/nexus/src/lib/assistant/policy.ts apps/nexus/src/lib/assistant/policy.test.ts
git commit -m "feat(assistant): tool registry and audience policy"
```

---

### Task 5: In-memory fake database and the store

**Files:**
- Create: `apps/nexus/src/lib/assistant/testing/fake-db.ts` (test helper, imported only by tests)
- Create: `apps/nexus/src/lib/assistant/store.ts`
- Test: `apps/nexus/src/lib/assistant/store.test.ts`

**Interfaces:**
- Produces: `fakeDb(tables, opts?)` for every later test; store functions `createThread`, `getThread`, `findThreadByExternalId`, `touchThread`, `appendMessage`, `listMessages`, `createAction`, `getAction`, `updateAction`, `createReminder`, `listRemindersDue`, and the row types `ThreadRow`, `MessageRow`, `ActionRow`, `ReminderRow`.

- [ ] **Step 1: Write the fake database**

`apps/nexus/src/lib/assistant/testing/fake-db.ts`:

```ts
/**
 * Enough of the supabase-js query builder to test the assistant's store and
 * writers without a database: from, select, insert, upsert, update, delete,
 * eq, neq, in, is, lte, gte, lt, gt, or (ignored), order, limit, maybeSingle,
 * single, and awaiting the chain. `unique` emulates a unique index with error
 * code 23505.
 */
export type Row = Record<string, any>;

export interface FakeDbOptions {
  /** table -> list of column groups that must be unique together. */
  unique?: Record<string, string[][]>;
}

let seq = 0;
const newId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

export function fakeDb(tables: Record<string, Row[]>, opts: FakeDbOptions = {}) {
  const data: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(tables)) data[name] = rows.map((r) => ({ ...r }));

  function table(name: string): Row[] {
    if (!data[name]) data[name] = [];
    return data[name];
  }

  function violates(name: string, row: Row): boolean {
    const groups = opts.unique?.[name] || [];
    return groups.some(
      (cols) =>
        cols.every((c) => row[c] !== null && row[c] !== undefined) &&
        table(name).some((r) => cols.every((c) => r[c] === row[c])),
    );
  }

  function chain(name: string) {
    type Filter = (r: Row) => boolean;
    const filters: Filter[] = [];
    let op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
    let payload: Row | Row[] | null = null;
    let upsertKeys: string[] = [];
    let orderBy: { col: string; asc: boolean } | null = null;
    let take: number | null = null;
    let single: 'maybe' | 'one' | null = null;

    const run = (): { data: any; error: any } => {
      const rows = table(name);
      const matching = () => rows.filter((r) => filters.every((f) => f(r)));
      let out: Row[] = [];
      if (op === 'insert') {
        const list = Array.isArray(payload) ? payload : [payload as Row];
        for (const r of list) {
          const row = { id: newId(), created_at: new Date().toISOString(), ...r };
          if (violates(name, row)) {
            return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
          }
          rows.push(row);
          out.push(row);
        }
      } else if (op === 'upsert') {
        const r = payload as Row;
        const existing = rows.find((x) => upsertKeys.every((k) => x[k] === r[k]));
        if (existing) {
          Object.assign(existing, r);
          out = [existing];
        } else {
          const row = { id: newId(), created_at: new Date().toISOString(), ...r };
          rows.push(row);
          out = [row];
        }
      } else if (op === 'update') {
        out = matching();
        for (const r of out) Object.assign(r, payload);
      } else if (op === 'delete') {
        out = matching();
        for (const r of out) rows.splice(rows.indexOf(r), 1);
      } else {
        out = matching();
      }
      if (orderBy) {
        const { col, asc } = orderBy;
        out = [...out].sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (asc ? 1 : -1));
      }
      if (take !== null) out = out.slice(0, take);
      if (single === 'one') {
        if (out.length !== 1) return { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } };
        return { data: out[0], error: null };
      }
      if (single === 'maybe') return { data: out[0] ?? null, error: null };
      return { data: out, error: null };
    };

    const api: any = {
      select: () => api,
      insert: (p: Row | Row[]) => { op = 'insert'; payload = p; return api; },
      upsert: (p: Row, o?: { onConflict?: string }) => { op = 'upsert'; payload = p; upsertKeys = (o?.onConflict || 'id').split(',').map((s) => s.trim()); return api; },
      update: (p: Row) => { op = 'update'; payload = p; return api; },
      delete: () => { op = 'delete'; return api; },
      eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return api; },
      neq: (c: string, v: unknown) => { filters.push((r) => r[c] !== v); return api; },
      in: (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return api; },
      is: (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return api; },
      lte: (c: string, v: any) => { filters.push((r) => r[c] <= v); return api; },
      gte: (c: string, v: any) => { filters.push((r) => r[c] >= v); return api; },
      lt: (c: string, v: any) => { filters.push((r) => r[c] < v); return api; },
      gt: (c: string, v: any) => { filters.push((r) => r[c] > v); return api; },
      or: () => api,
      order: (c: string, o?: { ascending?: boolean }) => { orderBy = { col: c, asc: o?.ascending !== false }; return api; },
      limit: (n: number) => { take = n; return api; },
      maybeSingle: () => { single = 'maybe'; return api; },
      single: () => { single = 'one'; return api; },
      then: (res: (v: any) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
    };
    return api;
  }

  return {
    from: (name: string) => chain(name),
    /** Peek at a table in assertions. */
    rows: (name: string) => table(name),
  };
}
```

- [ ] **Step 2: Write the failing store test**

`apps/nexus/src/lib/assistant/store.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { fakeDb } from './testing/fake-db';
import {
  appendMessage, createAction, createReminder, createThread, findThreadByExternalId,
  getAction, listMessages, listRemindersDue, touchThread, updateAction,
} from './store';

const UNIQUE = { nexus_assistant_messages: [['thread_id', 'external_id']] };

describe('threads and messages', () => {
  it('creates a thread and finds it again by external id', async () => {
    const db = fakeDb({}, { unique: UNIQUE });
    const t = await createThread(db, { userId: 'u1', channel: 'teams', externalId: '19:abc' });
    expect(t.user_id).toBe('u1');
    expect(await findThreadByExternalId(db, 'u1', 'teams', '19:abc')).toMatchObject({ id: t.id });
    expect(await findThreadByExternalId(db, 'u2', 'teams', '19:abc')).toBeNull();
    expect(await findThreadByExternalId(db, 'u1', 'teams', null)).toBeNull();
  });

  it('appends messages in order and refuses a repeated external id', async () => {
    const db = fakeDb({}, { unique: UNIQUE });
    const t = await createThread(db, { userId: 'u1', channel: 'nexus' });
    const a = await appendMessage(db, { threadId: t.id, role: 'user', text: 'hi', externalId: 'act-1' });
    const b = await appendMessage(db, { threadId: t.id, role: 'assistant', text: 'hello' });
    const dup = await appendMessage(db, { threadId: t.id, role: 'user', text: 'hi again', externalId: 'act-1' });
    expect(a.inserted && b.inserted).toBe(true);
    expect(dup.inserted).toBe(false);
    expect((await listMessages(db, t.id)).map((m) => m.text)).toEqual(['hi', 'hello']);
  });

  it('stores and clears flow state', async () => {
    const db = fakeDb({});
    const t = await createThread(db, { userId: 'u1', channel: 'nexus' });
    await touchThread(db, t.id, { flowState: { flow: 'remind-me', step: 'when' } });
    expect(db.rows('nexus_assistant_threads')[0].flow_state).toEqual({ flow: 'remind-me', step: 'when' });
    await touchThread(db, t.id, { flowState: null });
    expect(db.rows('nexus_assistant_threads')[0].flow_state).toBeNull();
  });
});

describe('actions and reminders', () => {
  it('round-trips an action', async () => {
    const db = fakeDb({});
    const a = await createAction(db, {
      threadId: null, userId: 'u1', kind: 'set_reminder', args: { due_on: '2026-10-04' },
      summary: 'Remind you tomorrow', fields: [{ label: 'When', value: 'tomorrow' }],
      confirmToken: 'tok', expiresAt: '2026-10-03T10:10:00.000Z',
    });
    expect(a.status).toBe('pending');
    await updateAction(db, a.id, { status: 'executed', result: { ok: true } });
    expect(await getAction(db, a.id)).toMatchObject({ status: 'executed', result: { ok: true } });
  });

  it('lists queued reminders due today or earlier, oldest first', async () => {
    const db = fakeDb({
      nexus_assistant_reminders: [
        { id: 'r1', user_id: 'u1', due_on: '2026-10-03', text: 'a', status: 'queued' },
        { id: 'r2', user_id: 'u1', due_on: '2026-10-01', text: 'b', status: 'queued' },
        { id: 'r3', user_id: 'u1', due_on: '2026-10-04', text: 'c', status: 'queued' },
        { id: 'r4', user_id: 'u1', due_on: '2026-10-02', text: 'd', status: 'sent' },
        { id: 'r5', user_id: 'u2', due_on: '2026-10-02', text: 'e', status: 'queued' },
      ],
    });
    const due = await listRemindersDue(db, 'u1', '2026-10-03');
    expect(due.map((r) => r.id)).toEqual(['r2', 'r1']);
    const made = await createReminder(db, { userId: 'u1', threadId: null, dueOn: '2026-10-05', text: 'f', kind: 'free' });
    expect(made.status).toBe('queued');
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `pnpm vitest run apps/nexus/src/lib/assistant/store.test.ts`
Expected: FAIL, `./store` not found.

- [ ] **Step 4: Implement store.ts**

```ts
/**
 * Service-role reads and writes for the assistant tables. Thin on purpose:
 * no policy here, the callers (turn.ts, actions.ts) decide who may do what.
 * `supabase` is the untyped admin client (tables are not in the generated types).
 */
import type { Channel, Envelope, Mode } from './types';

export interface ThreadRow {
  id: string;
  user_id: string;
  channel: Channel;
  external_id: string | null;
  title: string | null;
  page_context: Record<string, unknown> | null;
  flow_state: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
}

export interface MessageRow {
  id: string;
  thread_id: string;
  role: 'user' | 'assistant';
  text: string;
  mode: Mode | null;
  llm: boolean;
  envelope: Envelope | null;
  external_id: string | null;
  created_at: string;
}

export interface ActionRow {
  id: string;
  thread_id: string | null;
  user_id: string;
  kind: string;
  args: Record<string, unknown>;
  summary: string;
  fields: Array<{ label: string; value: string }>;
  confirm_token: string;
  status: 'pending' | 'executing' | 'executed' | 'failed' | 'cancelled' | 'expired';
  result: Record<string, unknown> | null;
  expires_at: string;
  created_at: string;
  executed_at: string | null;
}

export interface ReminderRow {
  id: string;
  user_id: string;
  thread_id: string | null;
  due_on: string;
  text: string;
  kind: string;
  status: 'queued' | 'sent' | 'cancelled';
  sent_at: string | null;
  sent_via: string | null;
  created_at: string;
}

const THREADS = 'nexus_assistant_threads';
const MESSAGES = 'nexus_assistant_messages';
const ACTIONS = 'nexus_assistant_actions';
const REMINDERS = 'nexus_assistant_reminders';

function throwIf(error: unknown): void {
  if (error) throw Object.assign(new Error((error as { message?: string }).message || 'Database error'), { cause: error });
}

export async function createThread(
  supabase: any,
  input: { userId: string; channel: Channel; externalId?: string | null; pageContext?: Record<string, unknown> | null },
): Promise<ThreadRow> {
  const { data, error } = await supabase
    .from(THREADS)
    .insert({
      user_id: input.userId,
      channel: input.channel,
      external_id: input.externalId ?? null,
      page_context: input.pageContext ?? null,
      flow_state: null,
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single();
  throwIf(error);
  return data as ThreadRow;
}

export async function getThread(supabase: any, id: string): Promise<ThreadRow | null> {
  const { data, error } = await supabase.from(THREADS).select('*').eq('id', id).maybeSingle();
  throwIf(error);
  return (data as ThreadRow) ?? null;
}

export async function findThreadByExternalId(
  supabase: any,
  userId: string,
  channel: Channel,
  externalId: string | null,
): Promise<ThreadRow | null> {
  if (!externalId) return null;
  const { data, error } = await supabase
    .from(THREADS)
    .select('*')
    .eq('user_id', userId)
    .eq('channel', channel)
    .eq('external_id', externalId)
    .maybeSingle();
  throwIf(error);
  return (data as ThreadRow) ?? null;
}

export async function touchThread(
  supabase: any,
  id: string,
  patch: { flowState?: Record<string, unknown> | null; pageContext?: Record<string, unknown> | null; title?: string | null; lastMessageAt?: string },
): Promise<void> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ('flowState' in patch) row.flow_state = patch.flowState ?? null;
  if ('pageContext' in patch) row.page_context = patch.pageContext ?? null;
  if ('title' in patch) row.title = patch.title ?? null;
  if (patch.lastMessageAt) row.last_message_at = patch.lastMessageAt;
  const { error } = await supabase.from(THREADS).update(row).eq('id', id);
  throwIf(error);
}

/**
 * Insert one message. `inserted: false` means the same external id was already
 * stored for this thread (a Teams redelivery), and nothing was written.
 */
export async function appendMessage(
  supabase: any,
  input: { threadId: string; role: 'user' | 'assistant'; text: string; externalId?: string | null; envelope?: Envelope | null; mode?: Mode | null; llm?: boolean },
): Promise<{ inserted: boolean; row: MessageRow | null }> {
  const { data, error } = await supabase
    .from(MESSAGES)
    .insert({
      thread_id: input.threadId,
      role: input.role,
      text: input.text,
      external_id: input.externalId ?? null,
      envelope: input.envelope ?? null,
      mode: input.mode ?? null,
      llm: input.llm ?? false,
    })
    .select('*')
    .single();
  if (error && (error as { code?: string }).code === '23505') return { inserted: false, row: null };
  throwIf(error);
  return { inserted: true, row: data as MessageRow };
}

export async function listMessages(supabase: any, threadId: string, limit = 30): Promise<MessageRow[]> {
  const { data, error } = await supabase
    .from(MESSAGES)
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })
    .limit(limit);
  throwIf(error);
  return (data || []) as MessageRow[];
}

export async function createAction(
  supabase: any,
  input: {
    threadId: string | null; userId: string; kind: string; args: Record<string, unknown>; summary: string;
    fields: Array<{ label: string; value: string }>; confirmToken: string; expiresAt: string;
  },
): Promise<ActionRow> {
  const { data, error } = await supabase
    .from(ACTIONS)
    .insert({
      thread_id: input.threadId,
      user_id: input.userId,
      kind: input.kind,
      args: input.args,
      summary: input.summary,
      fields: input.fields,
      confirm_token: input.confirmToken,
      status: 'pending',
      expires_at: input.expiresAt,
    })
    .select('*')
    .single();
  throwIf(error);
  return data as ActionRow;
}

export async function getAction(supabase: any, id: string): Promise<ActionRow | null> {
  const { data, error } = await supabase.from(ACTIONS).select('*').eq('id', id).maybeSingle();
  throwIf(error);
  return (data as ActionRow) ?? null;
}

export async function updateAction(
  supabase: any,
  id: string,
  patch: Partial<Pick<ActionRow, 'status' | 'result' | 'executed_at'>>,
): Promise<void> {
  const { error } = await supabase.from(ACTIONS).update(patch).eq('id', id);
  throwIf(error);
}

export async function createReminder(
  supabase: any,
  input: { userId: string; threadId: string | null; dueOn: string; text: string; kind: string },
): Promise<ReminderRow> {
  const { data, error } = await supabase
    .from(REMINDERS)
    .insert({ user_id: input.userId, thread_id: input.threadId, due_on: input.dueOn, text: input.text, kind: input.kind, status: 'queued' })
    .select('*')
    .single();
  throwIf(error);
  return data as ReminderRow;
}

/** Queued reminders due on or before `today` (YYYY-MM-DD), oldest first. */
export async function listRemindersDue(supabase: any, userId: string, today: string): Promise<ReminderRow[]> {
  const { data, error } = await supabase
    .from(REMINDERS)
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'queued')
    .lte('due_on', today)
    .order('due_on', { ascending: true });
  throwIf(error);
  return (data || []) as ReminderRow[];
}
```

- [ ] **Step 5: Run the test**

Run: `pnpm vitest run apps/nexus/src/lib/assistant/store.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/nexus/src/lib/assistant/testing/fake-db.ts apps/nexus/src/lib/assistant/store.ts apps/nexus/src/lib/assistant/store.test.ts
git commit -m "feat(assistant): store for threads, messages, actions, reminders"
```

---

### Task 6: Action propose, confirm and cancel

**Files:**
- Create: `apps/nexus/src/lib/assistant/actions.ts`
- Test: `apps/nexus/src/lib/assistant/actions.test.ts`

**Interfaces:**
- Consumes: `createAction`, `getAction`, `updateAction` (Task 5); `findActionTool`, `registerTools`, `TOOLS` (Task 4); `ToolContext`, `ActionProposal`, `ToolResult` (Task 3).
- Produces: `ACTION_TTL_MS`, `proposeAction(ctx, input)`, `confirmAction(ctx, { id, token })`, `cancelAction(ctx, { id })`, `ConfirmOutcome`.

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeDb } from './testing/fake-db';
import { TOOLS, registerTools } from './registry';
import type { ActionToolDef, AssistantCaller, ToolContext } from './types';
import { ACTION_TTL_MS, cancelAction, confirmAction, proposeAction } from './actions';

const executed: unknown[] = [];
const reminderTool: ActionToolDef<{ due_on: string; text: string }> = {
  name: 'set_reminder',
  description: 'Store a reminder',
  parameters: { type: 'object', properties: {}, required: [] },
  audience: 'student',
  kind: 'action',
  run: async () => ({ ok: true }),
  execute: async (_ctx, args) => {
    executed.push(args);
    return {
      ok: true,
      reply: `Done. I will remind you on ${args.due_on}.`,
      links: [{ label: 'My catch-up', url: 'https://nexus.test/student/catch-up' }],
    };
  },
};

const student: AssistantCaller = { id: 'u1', name: 'Priya', user_type: 'student', staff_role: null, can_teach: null, impersonating: false };

function ctxFor(db: ReturnType<typeof fakeDb>, caller = student, now = new Date('2026-10-03T10:00:00Z')): ToolContext {
  return { caller, channel: 'nexus', mode: 'general', supabase: db, classroomId: 'c1', threadId: null, now, baseUrl: 'https://nexus.test' };
}

beforeEach(() => {
  TOOLS.length = 0;
  registerTools([reminderTool as unknown as ActionToolDef]);
  executed.length = 0;
});

describe('proposeAction', () => {
  it('stores a pending row with a token and a 10 minute expiry', async () => {
    const db = fakeDb({});
    const p = await proposeAction(ctxFor(db), {
      kind: 'set_reminder', args: { due_on: '2026-10-04', text: 'finish' },
      summary: 'Remind you tomorrow to finish', fields: [{ label: 'When', value: 'tomorrow' }],
    });
    expect(p.confirmToken).toHaveLength(36);
    expect(p.expiresAt).toBe(new Date(Date.parse('2026-10-03T10:00:00Z') + ACTION_TTL_MS).toISOString());
    expect(db.rows('nexus_assistant_actions')[0]).toMatchObject({ user_id: 'u1', status: 'pending', kind: 'set_reminder' });
  });

  it('refuses an unknown kind before writing anything', async () => {
    const db = fakeDb({});
    await expect(proposeAction(ctxFor(db), { kind: 'launch_rocket', args: {}, summary: 's', fields: [] })).rejects.toThrow(/Unknown action/);
    expect(db.rows('nexus_assistant_actions')).toHaveLength(0);
  });
});

describe('confirmAction', () => {
  async function pending(db: ReturnType<typeof fakeDb>) {
    return proposeAction(ctxFor(db), { kind: 'set_reminder', args: { due_on: '2026-10-04', text: 'finish' }, summary: 's', fields: [] });
  }

  it('executes once and records the result', async () => {
    const db = fakeDb({});
    const p = await pending(db);
    const out = await confirmAction(ctxFor(db), { id: p.id, token: p.confirmToken });
    expect(out).toMatchObject({ ok: true, reply: 'Done. I will remind you on 2026-10-04.' });
    expect(executed).toHaveLength(1);
    expect(db.rows('nexus_assistant_actions')[0]).toMatchObject({ status: 'executed', result: { ok: true } });
    const again = await confirmAction(ctxFor(db), { id: p.id, token: p.confirmToken });
    expect(again).toMatchObject({ ok: false, status: 409 });
    expect(executed).toHaveLength(1);
  });

  it('refuses another student, a wrong token, and an unknown id', async () => {
    const db = fakeDb({});
    const p = await pending(db);
    expect(await confirmAction(ctxFor(db, { ...student, id: 'u2' }), { id: p.id, token: p.confirmToken })).toMatchObject({ ok: false, status: 403 });
    expect(await confirmAction(ctxFor(db), { id: p.id, token: 'nope' })).toMatchObject({ ok: false, status: 403 });
    expect(await confirmAction(ctxFor(db), { id: 'missing', token: 'x' })).toMatchObject({ ok: false, status: 404 });
    expect(executed).toHaveLength(0);
  });

  it('expires after ten minutes and marks the row', async () => {
    const db = fakeDb({});
    const p = await pending(db);
    const later = new Date(Date.parse('2026-10-03T10:00:00Z') + ACTION_TTL_MS + 1);
    expect(await confirmAction(ctxFor(db, student, later), { id: p.id, token: p.confirmToken })).toMatchObject({ ok: false, status: 410 });
    expect(db.rows('nexus_assistant_actions')[0].status).toBe('expired');
  });

  it('refuses while impersonating, even with the right token', async () => {
    const db = fakeDb({});
    const p = await pending(db);
    expect(await confirmAction(ctxFor(db, { ...student, impersonating: true }), { id: p.id, token: p.confirmToken })).toMatchObject({ ok: false, status: 403 });
    expect(executed).toHaveLength(0);
  });

  it('marks failed when the tool throws, and says nothing changed', async () => {
    const db = fakeDb({});
    const p = await pending(db);
    vi.spyOn(reminderTool, 'execute').mockRejectedValueOnce(new Error('db down'));
    const out = await confirmAction(ctxFor(db), { id: p.id, token: p.confirmToken });
    expect(out).toMatchObject({ ok: false, status: 500 });
    expect(db.rows('nexus_assistant_actions')[0].status).toBe('failed');
  });
});

describe('cancelAction', () => {
  it('cancels a pending action of the owner only', async () => {
    const db = fakeDb({});
    const p = await proposeAction(ctxFor(db), { kind: 'set_reminder', args: {}, summary: 's', fields: [] });
    expect(await cancelAction(ctxFor(db, { ...student, id: 'u2' }), { id: p.id })).toMatchObject({ ok: false, status: 403 });
    expect(await cancelAction(ctxFor(db), { id: p.id })).toMatchObject({ ok: true });
    expect(db.rows('nexus_assistant_actions')[0].status).toBe('cancelled');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vitest run apps/nexus/src/lib/assistant/actions.test.ts`
Expected: FAIL, `./actions` not found.

- [ ] **Step 3: Implement actions.ts**

```ts
/**
 * Propose, confirm, execute. The assistant never writes directly: a tool or a
 * flow proposes an action with every field visible, the person confirms, and
 * only then does the tool's `execute` run, re-checked here against the owner,
 * the token, the clock and impersonation.
 */
import { randomUUID } from 'crypto';
import { findActionTool } from './registry';
import { createAction, getAction, updateAction } from './store';
import type { ActionProposal, ToolContext, ToolLink } from './types';

export const ACTION_TTL_MS = 10 * 60_000;

export type ConfirmOutcome =
  | { ok: true; reply: string; links: ToolLink[] }
  | { ok: false; status: number; error: string };

export async function proposeAction(
  ctx: ToolContext,
  input: { kind: string; args: Record<string, unknown>; summary: string; fields: Array<{ label: string; value: string }> },
): Promise<ActionProposal> {
  if (!findActionTool(input.kind)) throw new Error(`Unknown action: ${input.kind}`);
  const row = await createAction(ctx.supabase, {
    threadId: ctx.threadId,
    userId: ctx.caller.id,
    kind: input.kind,
    args: input.args,
    summary: input.summary,
    fields: input.fields,
    confirmToken: randomUUID(),
    expiresAt: new Date(ctx.now.getTime() + ACTION_TTL_MS).toISOString(),
  });
  return { id: row.id, kind: row.kind, summary: row.summary, fields: row.fields, confirmToken: row.confirm_token, expiresAt: row.expires_at };
}

export async function confirmAction(ctx: ToolContext, input: { id: string; token: string }): Promise<ConfirmOutcome> {
  const row = await getAction(ctx.supabase, input.id);
  if (!row) return { ok: false, status: 404, error: 'That action is gone.' };
  if (row.user_id !== ctx.caller.id) return { ok: false, status: 403, error: 'That is not your action.' };
  if (ctx.caller.impersonating) return { ok: false, status: 403, error: 'Viewing as a student is read only.' };
  if (row.status !== 'pending') return { ok: false, status: 409, error: 'That action was already handled.' };
  if (Date.parse(row.expires_at) < ctx.now.getTime()) {
    await updateAction(ctx.supabase, row.id, { status: 'expired' });
    return { ok: false, status: 410, error: 'That took a while, so I let it go. Ask me again and I will set it up fresh.' };
  }
  if (row.confirm_token !== input.token) return { ok: false, status: 403, error: 'That confirmation did not match.' };

  const tool = findActionTool(row.kind);
  if (!tool) return { ok: false, status: 500, error: 'I no longer know how to do that.' };

  await updateAction(ctx.supabase, row.id, { status: 'executing' });
  try {
    const result = await tool.execute(ctx, row.args);
    if (!result.ok) {
      await updateAction(ctx.supabase, row.id, { status: 'failed', result: { error: result.error ?? 'failed' } });
      return { ok: false, status: 400, error: result.error || 'That did not work.' };
    }
    await updateAction(ctx.supabase, row.id, {
      status: 'executed',
      result: { ok: true, reply: result.reply ?? null, data: (result.data as Record<string, unknown>) ?? null },
      executed_at: ctx.now.toISOString(),
    });
    return { ok: true, reply: result.reply || 'Done.', links: result.links || [] };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'failed';
    await updateAction(ctx.supabase, row.id, { status: 'failed', result: { error: message } });
    return { ok: false, status: 500, error: 'Something went wrong while doing that. Nothing was changed.' };
  }
}

export async function cancelAction(ctx: ToolContext, input: { id: string }): Promise<ConfirmOutcome> {
  const row = await getAction(ctx.supabase, input.id);
  if (!row) return { ok: false, status: 404, error: 'That action is gone.' };
  if (row.user_id !== ctx.caller.id) return { ok: false, status: 403, error: 'That is not your action.' };
  if (row.status !== 'pending') return { ok: false, status: 409, error: 'That action was already handled.' };
  await updateAction(ctx.supabase, row.id, { status: 'cancelled' });
  return { ok: true, reply: 'Okay, cancelled. Nothing was changed.', links: [] };
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm vitest run apps/nexus/src/lib/assistant/actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/nexus/src/lib/assistant/actions.ts apps/nexus/src/lib/assistant/actions.test.ts
git commit -m "feat(assistant): action propose, confirm and cancel with token and expiry"
```

---

### Task 7: Extract the upcoming-classes query

**Files:**
- Create: `apps/nexus/src/lib/upcoming-classes.ts`
- Modify: `apps/nexus/src/app/api/dashboard/student/route.ts:60-77` and `:148-151`
- Test: `apps/nexus/src/lib/upcoming-classes.test.ts`

**Interfaces:**
- Produces: `UpcomingClass`, `UPCOMING_CLASS_SELECT`, `dropEnded(rows, today, nowHHMM)`, `loadUpcomingClasses(supabase, classroomId, { today?, nowHHMM?, limit? })`, `loadDeclinedClassIds(supabase, studentId, classIds)`. Used by the brief (Task 11), `my_schedule` (Task 12) and the cannot-attend flow (Task 13).

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { fakeDb } from '@/lib/assistant/testing/fake-db';
import { dropEnded, loadDeclinedClassIds, loadUpcomingClasses } from './upcoming-classes';

const cls = (id: string, date: string, start: string, end: string, status = 'scheduled') => ({
  id, title: `Class ${id}`, classroom_id: 'c1', scheduled_date: date, start_time: start, end_time: end, status, teams_meeting_url: null,
});

describe('dropEnded', () => {
  it('drops a class today whose end time has passed and keeps everything else', () => {
    const rows = [cls('a', '2026-10-03', '16:00', '17:00'), cls('b', '2026-10-03', '18:00', '19:30'), cls('c', '2026-10-04', '09:00', '10:00')];
    expect(dropEnded(rows, '2026-10-03', '17:30').map((r) => r.id)).toEqual(['b', 'c']);
  });
  it('keeps a class that is live right now', () => {
    const rows = [cls('a', '2026-10-03', '16:00', '17:00')];
    expect(dropEnded(rows, '2026-10-03', '16:30')).toHaveLength(1);
  });
});

describe('loadUpcomingClasses', () => {
  it('returns scheduled and live classes from today on, in order, after dropping ended ones', async () => {
    const db = fakeDb({
      nexus_scheduled_classes: [
        cls('old', '2026-10-01', '18:00', '19:00'),
        cls('done', '2026-10-03', '10:00', '11:00'),
        cls('cancelled', '2026-10-04', '18:00', '19:00', 'cancelled'),
        cls('tonight', '2026-10-03', '18:00', '19:30'),
        cls('tomorrow', '2026-10-04', '18:00', '19:30'),
        { ...cls('other', '2026-10-04', '18:00', '19:30'), classroom_id: 'c2' },
      ],
    });
    const rows = await loadUpcomingClasses(db, 'c1', { today: '2026-10-03', nowHHMM: '12:00', limit: 5 });
    expect(rows.map((r) => r.id)).toEqual(['tonight', 'tomorrow']);
  });
  it('applies the limit after dropping, so an ended class does not steal a slot', async () => {
    const db = fakeDb({
      nexus_scheduled_classes: [cls('done', '2026-10-03', '10:00', '11:00'), cls('a', '2026-10-04', '18:00', '19:00'), cls('b', '2026-10-05', '18:00', '19:00')],
    });
    const rows = await loadUpcomingClasses(db, 'c1', { today: '2026-10-03', nowHHMM: '12:00', limit: 2 });
    expect(rows.map((r) => r.id)).toEqual(['a', 'b']);
  });
});

describe('loadDeclinedClassIds', () => {
  it('returns only not_attending rows of this student among the given classes', async () => {
    const db = fakeDb({
      nexus_class_rsvp: [
        { scheduled_class_id: 'a', student_id: 's1', response: 'not_attending' },
        { scheduled_class_id: 'b', student_id: 's1', response: 'attending' },
        { scheduled_class_id: 'c', student_id: 's2', response: 'not_attending' },
      ],
    });
    expect([...(await loadDeclinedClassIds(db, 's1', ['a', 'b', 'c']))]).toEqual(['a']);
    expect((await loadDeclinedClassIds(db, 's1', [])).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vitest run apps/nexus/src/lib/upcoming-classes.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement upcoming-classes.ts**

```ts
/**
 * A classroom's next classes, as the student dashboard has always listed them:
 * scheduled or live, today onwards, with today's already-ended classes dropped.
 * Extracted from app/api/dashboard/student/route.ts so the assistant's brief,
 * `my_schedule` and the cannot-attend flow read exactly what the dashboard shows.
 */

export const UPCOMING_CLASS_SELECT =
  'id, title, classroom_id, scheduled_date, start_time, end_time, status, teams_meeting_url, ' +
  'topic:nexus_topics(title, category), teacher:users!nexus_scheduled_classes_teacher_id_fkey(name)';

export interface UpcomingClass {
  id: string;
  title: string;
  classroom_id: string;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  status: string;
  teams_meeting_url: string | null;
  topic?: { title: string; category: string } | null;
  teacher?: { name: string } | null;
}

/** IST calendar date and clock, so a Vercel UTC server agrees with the student's evening. */
export function istNow(now: Date = new Date()): { today: string; nowHHMM: string } {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
  const nowHHMM = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  return { today, nowHHMM };
}

/** Today's classes whose end time has passed are over; everything else stays. Pure. */
export function dropEnded<T extends { scheduled_date: string; end_time: string }>(rows: T[], today: string, nowHHMM: string): T[] {
  return rows.filter((cls) => (cls.scheduled_date > today ? true : cls.end_time > nowHHMM));
}

export async function loadUpcomingClasses(
  supabase: any,
  classroomId: string,
  opts: { today?: string; nowHHMM?: string; limit?: number } = {},
): Promise<UpcomingClass[]> {
  const { today, nowHHMM } = { ...istNow(), ...opts };
  const limit = opts.limit ?? 5;
  // Over-fetch: today's ended classes are dropped in code, and the limit applies after.
  const { data, error } = await supabase
    .from('nexus_scheduled_classes')
    .select(UPCOMING_CLASS_SELECT)
    .eq('classroom_id', classroomId)
    .gte('scheduled_date', today)
    .in('status', ['scheduled', 'live'])
    .order('scheduled_date', { ascending: true })
    .order('start_time', { ascending: true })
    .limit(limit + 5);
  if (error) throw error;
  return dropEnded((data || []) as UpcomingClass[], today, nowHHMM).slice(0, limit);
}

/** Which of these classes the student has already said they will miss. */
export async function loadDeclinedClassIds(supabase: any, studentId: string, classIds: string[]): Promise<Set<string>> {
  if (classIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from('nexus_class_rsvp')
    .select('scheduled_class_id, response')
    .eq('student_id', studentId)
    .in('scheduled_class_id', classIds);
  if (error) throw error;
  return new Set(((data || []) as Array<{ scheduled_class_id: string; response: string }>).filter((r) => r.response === 'not_attending').map((r) => r.scheduled_class_id));
}
```

Note: the fake database's `order` keeps only the last call; the real client orders by both. The tests order their fixtures so this difference does not matter.

- [ ] **Step 4: Rewire the dashboard route**

In `apps/nexus/src/app/api/dashboard/student/route.ts`, add the import:

```ts
import { loadUpcomingClasses } from '@/lib/upcoming-classes';
```

Replace the first entry of the `Promise.all` (the `supabase.from('nexus_scheduled_classes')...limit(10)` block, lines 67-77) with:

```ts
      // Upcoming classes, through the shared loader the assistant also uses, so
      // the brief and the dashboard can never disagree about "next class".
      loadUpcomingClasses(supabase, classroomId, { today, nowHHMM: nowTimeHHMM, limit: 5 }),
```

Rename the destructured `upcomingClassesRaw` to `upcomingClasses` and delete the filter block at lines 148-151:

```ts
    // Filter out today's classes whose end_time has already passed
    const upcomingClasses = (upcomingClassesRaw.data || []).filter((cls) => {
      if (cls.scheduled_date > today) return true;
      return cls.end_time > nowTimeHHMM;
    }).slice(0, 5);
```

Everything below (`applyClassPrepGate(... upcomingClasses as any ...)` and the response) stays as it is.

- [ ] **Step 5: Run the tests and type-check**

Run: `pnpm vitest run apps/nexus/src/lib/upcoming-classes.test.ts && pnpm --filter @neram/nexus type-check`
Expected: PASS, and type-check clean.

- [ ] **Step 6: Commit**

```bash
git add apps/nexus/src/lib/upcoming-classes.ts apps/nexus/src/lib/upcoming-classes.test.ts apps/nexus/src/app/api/dashboard/student/route.ts
git commit -m "refactor(nexus): extract loadUpcomingClasses from the student dashboard route"
```

---

### Task 8: Extract the RSVP writer

**Files:**
- Create: `apps/nexus/src/lib/rsvp-write.ts`
- Modify: `apps/nexus/src/app/api/timetable/rsvp/route.ts` (POST handler, lines 153-259)
- Test: `apps/nexus/src/lib/rsvp-write.test.ts`

**Interfaces:**
- Produces: `writeRsvp(supabase, input, deps?)`, `RsvpWriteInput`, `RsvpWriteResult`. Used by the route and by `decline_class` (Task 13).

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { fakeDb } from '@/lib/assistant/testing/fake-db';
import { writeRsvp } from './rsvp-write';

function db() {
  return fakeDb({
    users: [{ id: 's1', name: 'Priya S' }],
    nexus_enrollments: [{ user_id: 's1', classroom_id: 'c1', role: 'student', is_active: true }],
    nexus_scheduled_classes: [{ id: 'k1', title: 'Perspective', classroom_id: 'c1' }],
    nexus_class_rsvp: [],
  });
}

describe('writeRsvp', () => {
  it('rejects a bad response value and a missing reason', async () => {
    expect(await writeRsvp(db(), { userId: 's1', classId: 'k1', response: 'maybe' as any })).toMatchObject({ ok: false, status: 400 });
    expect(await writeRsvp(db(), { userId: 's1', classId: 'k1', response: 'not_attending' })).toMatchObject({ ok: false, status: 400 });
    expect(await writeRsvp(db(), { userId: 's1', classId: 'k1', response: 'not_attending', reasonCode: 'other' })).toMatchObject({
      ok: false, status: 400, error: expect.stringMatching(/Tell us a little more/),
    });
  });

  it('404s an unknown class and 403s a student not enrolled in its classroom', async () => {
    expect(await writeRsvp(db(), { userId: 's1', classId: 'nope', response: 'not_attending', reasonCode: 'unwell' })).toMatchObject({ ok: false, status: 404 });
    expect(await writeRsvp(db(), { userId: 's9', classId: 'k1', response: 'not_attending', reasonCode: 'unwell' })).toMatchObject({ ok: false, status: 403 });
  });

  it('stores the opt-out, notifies the teachers once, and reports the class title', async () => {
    const d = db();
    const notify = vi.fn(async () => undefined);
    const out = await writeRsvp(d, { userId: 's1', classId: 'k1', response: 'not_attending', reasonCode: 'unwell', wantsCatchup: true }, { notify });
    expect(out).toMatchObject({ ok: true, attending: false, classTitle: 'Perspective', classroomId: 'c1' });
    expect(d.rows('nexus_class_rsvp')[0]).toMatchObject({ scheduled_class_id: 'k1', student_id: 's1', response: 'not_attending', reason_code: 'unwell', reason: null, wants_catchup: true });
    expect(notify).toHaveBeenCalledWith('c1', 'Priya S', 'not_attending', null, 'Perspective', 'k1');
  });

  it('opting back in deletes the row and notifies nobody', async () => {
    const d = db();
    const notify = vi.fn(async () => undefined);
    await writeRsvp(d, { userId: 's1', classId: 'k1', response: 'not_attending', reasonCode: 'family' }, { notify });
    const out = await writeRsvp(d, { userId: 's1', classId: 'k1', response: 'attending' }, { notify });
    expect(out).toMatchObject({ ok: true, attending: true });
    expect(d.rows('nexus_class_rsvp')).toHaveLength(0);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('a notification failure never loses the RSVP', async () => {
    const d = db();
    const notify = vi.fn(async () => { throw new Error('teams down'); });
    const out = await writeRsvp(d, { userId: 's1', classId: 'k1', response: 'not_attending', reasonCode: 'clash' }, { notify });
    expect(out.ok).toBe(true);
    expect(d.rows('nexus_class_rsvp')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vitest run apps/nexus/src/lib/rsvp-write.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement rsvp-write.ts**

```ts
/**
 * Writing a class RSVP, on the default-attending model (see the route's header
 * comment): only opt-outs are stored, opting back in deletes the row.
 *
 * Extracted from POST /api/timetable/rsvp so the assistant's cannot-attend
 * flow and the RSVP sheet share one set of rules and one teacher notification.
 */
import { notifyRsvpToTeacher } from '@/lib/timetable-notifications';
import { isRsvpReasonCode, reasonRequiresNote } from '@/lib/rsvp-reasons';

export interface RsvpWriteInput {
  userId: string;
  classId: string;
  /** Optional cross-check; the class row is the source of truth. */
  classroomId?: string | null;
  response: 'attending' | 'not_attending';
  reasonCode?: unknown;
  note?: string | null;
  wantsCatchup?: boolean;
}

export type RsvpWriteResult =
  | { ok: true; attending: boolean; rsvp: Record<string, unknown> | null; classTitle: string | null; classroomId: string }
  | { ok: false; status: number; error: string };

type NotifyFn = typeof notifyRsvpToTeacher;

export async function writeRsvp(
  supabase: any,
  input: RsvpWriteInput,
  deps: { notify: NotifyFn } = { notify: notifyRsvpToTeacher },
): Promise<RsvpWriteResult> {
  if (input.response !== 'attending' && input.response !== 'not_attending') {
    return { ok: false, status: 400, error: 'Invalid response value' };
  }
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (input.response === 'not_attending') {
    if (!isRsvpReasonCode(input.reasonCode)) {
      return { ok: false, status: 400, error: 'Pick a reason so your teacher knows why you cannot make it' };
    }
    if (reasonRequiresNote(input.reasonCode) && !note) {
      return { ok: false, status: 400, error: 'Tell us a little more so your teacher knows what came up' };
    }
  }

  const { data: cls } = await supabase
    .from('nexus_scheduled_classes')
    .select('id, title, classroom_id')
    .eq('id', input.classId)
    .maybeSingle();
  if (!cls || (input.classroomId && cls.classroom_id !== input.classroomId)) {
    return { ok: false, status: 404, error: 'Class not found in this classroom' };
  }
  const classroomId = cls.classroom_id as string;

  const { data: enrollment } = await supabase
    .from('nexus_enrollments')
    .select('role')
    .eq('user_id', input.userId)
    .eq('classroom_id', classroomId)
    .eq('is_active', true)
    .maybeSingle();
  if (!enrollment) return { ok: false, status: 403, error: 'Not enrolled' };

  if (input.response === 'attending') {
    const { error } = await supabase
      .from('nexus_class_rsvp')
      .delete()
      .eq('scheduled_class_id', input.classId)
      .eq('student_id', input.userId);
    if (error) throw error;
    return { ok: true, attending: true, rsvp: null, classTitle: cls.title ?? null, classroomId };
  }

  const { data, error } = await supabase
    .from('nexus_class_rsvp')
    .upsert(
      {
        scheduled_class_id: input.classId,
        student_id: input.userId,
        response: 'not_attending',
        reason_code: input.reasonCode,
        reason: note || null,
        wants_catchup: input.wantsCatchup !== false,
        responded_at: new Date().toISOString(),
      },
      { onConflict: 'scheduled_class_id,student_id' },
    )
    .select('*')
    .single();
  if (error) throw error;

  // Tell the teachers. Never let a notification failure lose the RSVP.
  try {
    const { data: userData } = await supabase.from('users').select('name').eq('id', input.userId).single();
    await deps.notify(classroomId, userData?.name || 'A student', 'not_attending', note || null, cls.title, input.classId);
  } catch {
    /* notification is best-effort */
  }

  return { ok: true, attending: false, rsvp: data, classTitle: cls.title ?? null, classroomId };
}
```

- [ ] **Step 4: Rewire the route's POST**

In `apps/nexus/src/app/api/timetable/rsvp/route.ts`, change the imports:

```ts
import { tallyReasons } from '@/lib/rsvp-reasons';
import { writeRsvp } from '@/lib/rsvp-write';
```

(Remove `notifyRsvpToTeacher`, `isRsvpReasonCode` and `reasonRequiresNote` from the imports; GET still uses `tallyReasons`, `resolveCaller` and `assertClassInClassroom`.)

Replace the whole POST body (from `const body = await request.json();` to the final `return NextResponse.json({ rsvp: data, attending: false });`) with:

```ts
    const body = await request.json();
    const { class_id, classroom_id, response, reason_code, reason, wants_catchup } = body;
    if (!class_id || !classroom_id || !response) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient() as any;
    const { data: user } = await supabase.from('users').select('id').eq('ms_oid', msUser.oid).single();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const result = await writeRsvp(supabase, {
      userId: user.id,
      classId: class_id,
      classroomId: classroom_id,
      response,
      reasonCode: reason_code,
      note: reason,
      wantsCatchup: wants_catchup,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ rsvp: result.rsvp, attending: result.attending });
```

- [ ] **Step 5: Run the tests and type-check**

Run: `pnpm vitest run apps/nexus/src/lib/rsvp-write.test.ts && pnpm --filter @neram/nexus type-check`
Expected: PASS, clean.

- [ ] **Step 6: Commit**

```bash
git add apps/nexus/src/lib/rsvp-write.ts apps/nexus/src/lib/rsvp-write.test.ts apps/nexus/src/app/api/timetable/rsvp/route.ts
git commit -m "refactor(nexus): extract writeRsvp from the RSVP route"
```

---

### Task 9: Extract the away-window writer

**Files:**
- Create: `apps/nexus/src/lib/away-windows-write.ts`
- Modify: `apps/nexus/src/app/api/student/away-windows/route.ts`
- Test: `apps/nexus/src/lib/away-windows-write.test.ts`

**Interfaces:**
- Produces: `MAX_WINDOW_DAYS`, `resolveStudentEnrolment(supabase, { userId } | { msOid })`, `declareAwayWindow(supabase, input, deps?)`, `notifyAwayTeachers(...)`, `AwayWriteInput`, `AwayWriteResult`. Used by the route and by `declare_away_window` (Task 13).

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { fakeDb } from '@/lib/assistant/testing/fake-db';
import { declareAwayWindow, resolveStudentEnrolment } from './away-windows-write';

const today = '2026-10-03';

function db(windows: Record<string, unknown>[] = []) {
  return fakeDb({
    users: [{ id: 's1', name: 'Priya S', ms_oid: 'oid-1' }],
    nexus_enrollments: [{ user_id: 's1', classroom_id: 'c1', role: 'student', is_active: true }],
    nexus_student_away_windows: windows,
  });
}
const notify = () => vi.fn(async () => undefined);

describe('resolveStudentEnrolment', () => {
  it('finds the student by id or by Microsoft oid, and null otherwise', async () => {
    expect(await resolveStudentEnrolment(db(), { userId: 's1' })).toEqual({ user: { id: 's1', name: 'Priya S' }, classroomId: 'c1' });
    expect(await resolveStudentEnrolment(db(), { msOid: 'oid-1' })).toMatchObject({ classroomId: 'c1' });
    expect(await resolveStudentEnrolment(db(), { userId: 'nobody' })).toBeNull();
  });
});

describe('declareAwayWindow', () => {
  it('refuses a non-student', async () => {
    expect(await declareAwayWindow(db(), { userId: 'nobody', reasonCode: 'unwell', today }, { notify: notify() })).toMatchObject({ ok: false, status: 403 });
  });

  it('applies the date rules', async () => {
    const d = { notify: notify() };
    expect(await declareAwayWindow(db(), { userId: 's1', reasonCode: 'nope', today }, d)).toMatchObject({ ok: false, status: 400, error: 'Pick a reason.' });
    expect(await declareAwayWindow(db(), { userId: 's1', reasonCode: 'other', today }, d)).toMatchObject({ ok: false, status: 400 });
    expect(await declareAwayWindow(db(), { userId: 's1', reasonCode: 'unwell', startsOn: '2026-10-01', today }, d)).toMatchObject({ ok: false, status: 400 });
    expect(await declareAwayWindow(db(), { userId: 's1', reasonCode: 'unwell', startsOn: '2026-10-05', endsOn: '2026-10-04', today }, d)).toMatchObject({ ok: false, status: 400 });
    expect(await declareAwayWindow(db(), { userId: 's1', reasonCode: 'unwell', startsOn: today, endsOn: '2027-03-01', today }, d)).toMatchObject({ ok: false, status: 400 });
  });

  it('refuses an overlap with a live window and names it', async () => {
    const existing = { id: 'w1', student_id: 's1', starts_on: '2026-10-04', ends_on: '2026-10-06', reason_code: 'family', reason_note: null, source: 'student', cancelled_at: null, created_at: '2026-10-01T00:00:00Z' };
    const out = await declareAwayWindow(db([existing]), { userId: 's1', reasonCode: 'unwell', startsOn: '2026-10-05', endsOn: '2026-10-07', today }, { notify: notify() });
    expect(out).toMatchObject({ ok: false, status: 409, existingId: 'w1' });
  });

  it('inserts a student-sourced window and tells the teachers', async () => {
    const d = db();
    const n = notify();
    const out = await declareAwayWindow(d, { userId: 's1', reasonCode: 'clash', startsOn: '2026-10-05', endsOn: '2026-10-09', note: 'School exams', today }, { notify: n });
    expect(out).toMatchObject({ ok: true, classroomId: 'c1' });
    expect(d.rows('nexus_student_away_windows')[0]).toMatchObject({ student_id: 's1', starts_on: '2026-10-05', ends_on: '2026-10-09', reason_code: 'clash', reason_note: 'School exams', source: 'student', created_by: 's1' });
    expect(n).toHaveBeenCalledTimes(1);
    expect(out.ok && out.summary.length > 0).toBe(true);
  });

  it('defaults the start to today and allows an open end', async () => {
    const d = db();
    const out = await declareAwayWindow(d, { userId: 's1', reasonCode: 'unwell', today }, { notify: notify() });
    expect(out.ok).toBe(true);
    expect(d.rows('nexus_student_away_windows')[0]).toMatchObject({ starts_on: today, ends_on: null });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vitest run apps/nexus/src/lib/away-windows-write.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement away-windows-write.ts**

```ts
/**
 * A student declaring that they will be away. The rules are the ones the route
 * enforced (forward-looking only, at most 120 days, one live window at a time);
 * they live here so the assistant's cannot-attend flow and the away-dates
 * screen cannot drift apart. See app/api/student/away-windows/route.ts for why
 * a window is auto-accepted and why it is a reason, not an excuse.
 */
import { istTodayYmd } from '@neram/database';
import { isRsvpReasonCode, reasonRequiresNote } from '@/lib/rsvp-reasons';
import {
  AWAY_COLUMNS, defaultReviewOn, describeWindow, loadAwayWindows, overlaps, sortWindows, type AwayWindow,
} from '@/lib/away-windows';

/** Nothing longer than this in one declaration, so a typo cannot swallow a year. */
export const MAX_WINDOW_DAYS = 120;

const isYmd = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export interface StudentEnrolment {
  user: { id: string; name: string | null };
  classroomId: string;
}

/**
 * The student and their active student enrolment, by users.id or by Microsoft
 * oid. Enrolment with role 'student', not staffness: a teacher recording a
 * window on somebody's behalf goes through the staff route instead.
 */
export async function resolveStudentEnrolment(
  supabase: any,
  by: { userId: string } | { msOid: string },
): Promise<StudentEnrolment | null> {
  const query = supabase.from('users').select('id, name');
  const { data: user } = 'userId' in by ? await query.eq('id', by.userId).maybeSingle() : await query.eq('ms_oid', by.msOid).maybeSingle();
  if (!user) return null;
  const { data: enrollment } = await supabase
    .from('nexus_enrollments')
    .select('role, classroom_id')
    .eq('user_id', user.id)
    .eq('role', 'student')
    .eq('is_active', true)
    .maybeSingle();
  if (!enrollment) return null;
  return { user: { id: user.id, name: user.name ?? null }, classroomId: enrollment.classroom_id as string };
}

export interface AwayWriteInput {
  userId: string;
  startsOn?: string | null;
  endsOn?: string | null;
  reasonCode: unknown;
  note?: string | null;
  returnNote?: string | null;
  /** IST today; injectable for tests. */
  today?: string;
}

export type AwayWriteResult =
  | { ok: true; window: AwayWindow; summary: string; classroomId: string }
  | { ok: false; status: number; error: string; existingId?: string };

export interface AwayNotifyArgs {
  classroomId: string;
  studentId: string;
  studentName: string;
  window: AwayWindow;
  today: string;
}

export async function declareAwayWindow(
  supabase: any,
  input: AwayWriteInput,
  deps: { notify: (supabase: any, args: AwayNotifyArgs) => Promise<void> } = { notify: notifyAwayTeachers },
): Promise<AwayWriteResult> {
  const resolved = await resolveStudentEnrolment(supabase, { userId: input.userId });
  if (!resolved) return { ok: false, status: 403, error: 'You are not enrolled in a class.' };

  const today = input.today ?? istTodayYmd();
  const startsOn = isYmd(input.startsOn) ? input.startsOn : today;
  const endsOn = isYmd(input.endsOn) ? input.endsOn : null;
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  const returnNote = typeof input.returnNote === 'string' ? input.returnNote.trim() : '';

  if (!isRsvpReasonCode(input.reasonCode)) return { ok: false, status: 400, error: 'Pick a reason.' };
  if (reasonRequiresNote(input.reasonCode) && !note) return { ok: false, status: 400, error: 'Add a short note so your teacher knows.' };
  if (startsOn < today) {
    return { ok: false, status: 400, error: 'Away dates can only start from today. For a class you already missed, give a reason on that class.' };
  }
  if (endsOn && endsOn < startsOn) return { ok: false, status: 400, error: 'The return date is before the start date.' };
  if (endsOn && daysBetween(startsOn, endsOn) > MAX_WINDOW_DAYS) {
    return { ok: false, status: 400, error: `Away dates cannot cover more than ${MAX_WINDOW_DAYS} days at once.` };
  }

  // One live window at a time, refused rather than merged (see the route header).
  const live = await loadAwayWindows(supabase, { studentIds: [resolved.user.id] });
  const clash = sortWindows(live).find((w) => overlaps(w, { starts_on: startsOn, ends_on: endsOn }));
  if (clash) {
    return {
      ok: false,
      status: 409,
      error: `You have already told us you are away then: ${describeWindow(clash, today).toLowerCase()}. Change those dates instead.`,
      existingId: clash.id,
    };
  }

  const { data: inserted, error } = await supabase
    .from('nexus_student_away_windows')
    .insert({
      student_id: resolved.user.id,
      starts_on: startsOn,
      ends_on: endsOn,
      review_on: defaultReviewOn(startsOn, endsOn),
      reason_code: input.reasonCode,
      reason_note: note || null,
      expected_return_note: returnNote || null,
      source: 'student',
      created_by: resolved.user.id,
    })
    .select(AWAY_COLUMNS)
    .single();
  if (error) throw error;

  const window = inserted as AwayWindow;
  await deps.notify(supabase, {
    classroomId: resolved.classroomId,
    studentId: resolved.user.id,
    studentName: resolved.user.name || 'A student',
    window,
    today,
  });

  return { ok: true, window, summary: describeWindow(window, today), classroomId: resolved.classroomId };
}

/**
 * Tell the teachers, through the one door. Best effort: a declaration that
 * saved must not fail because a chat did not. Moved verbatim from the route.
 */
export async function notifyAwayTeachers(supabase: any, args: AwayNotifyArgs): Promise<void> {
  try {
    const { sendNudge } = await import('@/lib/nudge-delivery');
    const { data: staff } = await supabase
      .from('nexus_enrollments')
      .select('user_id')
      .eq('classroom_id', args.classroomId)
      .eq('role', 'teacher')
      .eq('is_active', true);
    const staffIds = (staff || []).map((s: any) => s.user_id as string);
    if (!staffIds.length) return;

    const summary = describeWindow(args.window, args.today);
    await sendNudge({
      studentIds: staffIds,
      audience: 'staff',
      eventType: 'away_window_declared',
      subject: `${args.studentName} will be away`,
      plain: `${args.studentName} told us they cannot attend: ${summary.toLowerCase()}. Their classes in that period will show as "Away" on the register.`,
      metadata: { student_id: args.studentId, away_window_id: args.window.id },
      source: { kind: 'away_window', refId: args.window.id },
    });
  } catch (e) {
    console.error('away window teacher notify failed:', e);
  }
}
```

- [ ] **Step 4: Rewire the route**

In `apps/nexus/src/app/api/student/away-windows/route.ts`:
- Replace the imports of `isRsvpReasonCode`, `reasonRequiresNote`, `defaultReviewOn`, `loadAwayWindows`, `overlaps`, `sortWindows` with `import { declareAwayWindow, resolveStudentEnrolment } from '@/lib/away-windows-write';` (keep `AWAY_COLUMNS`, `describeWindow`, `isMissingTable`, `AwayWindow`, `istTodayYmd`, `verifyMsToken`).
- Delete `MAX_WINDOW_DAYS`, `daysBetween`, `isYmd`, the `Resolved` type, `resolveStudent` and `notifyTeachers`.
- In GET, replace `const resolved = await resolveStudent(supabase, msUser.oid); if (resolved.error) return resolved.error;` with:

```ts
    const resolved = await resolveStudentEnrolment(supabase, { msOid: msUser.oid });
    if (!resolved) return NextResponse.json({ error: 'You are not enrolled in a class.' }, { status: 403 });
```

- Replace the whole POST body after `const supabase = getSupabaseAdminClient() as any;` with:

```ts
    const { data: user } = await supabase.from('users').select('id').eq('ms_oid', msUser.oid).maybeSingle();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const result = await declareAwayWindow(supabase, {
      userId: user.id,
      startsOn: body?.starts_on,
      endsOn: body?.ends_on,
      reasonCode: body?.reason_code,
      note: body?.reason_note,
      returnNote: body?.expected_return_note,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, ...(result.existingId ? { existing_id: result.existingId } : {}) },
        { status: result.status },
      );
    }
    return NextResponse.json({ window: { ...result.window, summary: result.summary } });
```

- [ ] **Step 5: Run the tests, type-check, and the existing E2E stays green later**

Run: `pnpm vitest run apps/nexus/src/lib/away-windows-write.test.ts && pnpm --filter @neram/nexus type-check`
Expected: PASS, clean. (`tests/e2e/away-windows-nexus.spec.ts` is run in Task 19.)

- [ ] **Step 6: Commit**

```bash
git add apps/nexus/src/lib/away-windows-write.ts apps/nexus/src/lib/away-windows-write.test.ts apps/nexus/src/app/api/student/away-windows/route.ts
git commit -m "refactor(nexus): extract declareAwayWindow from the away-windows route"
```

---

### Task 10: Extract the add-sketch writer

**Files:**
- Create: `apps/nexus/src/lib/sketchbook-add.ts`
- Modify: `apps/nexus/src/app/api/sketchbook/entries/route.ts`
- Test: `apps/nexus/src/lib/sketchbook-add.test.ts`

**Interfaces:**
- Produces: `addSketchForStudent(caller: { id: string; user_type: string | null }, body: unknown): Promise<AddSketchResult>` (throws `ApiError`), `AddSketchResult = { sketch, rhythm, isNewDay }`, `CAPTION_MAX`. Used by the route and `add_sketch` (Task 13).

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDrawingSubmission: vi.fn(),
  getInspirationItem: vi.fn(),
  getStudentPrimaryClassroom: vi.fn(),
  recordGamificationEvent: vi.fn(),
  upsertPracticeDay: vi.fn(),
  loadStudentRhythm: vi.fn(),
  update: vi.fn(),
  del: vi.fn(),
}));

vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({
    from: () => ({
      update: (patch: unknown) => ({ eq: async () => mocks.update(patch) }),
      delete: () => ({ eq: async () => mocks.del() }),
    }),
  }),
}));
vi.mock('@neram/database/queries/nexus', () => ({
  createDrawingSubmission: mocks.createDrawingSubmission,
  getInspirationItem: mocks.getInspirationItem,
  getStudentPrimaryClassroom: mocks.getStudentPrimaryClassroom,
  recordGamificationEvent: mocks.recordGamificationEvent,
  upsertPracticeDay: mocks.upsertPracticeDay,
}));
vi.mock('@/lib/sketchbook-payload', () => ({ loadStudentRhythm: mocks.loadStudentRhythm }));

import { addSketchForStudent, CAPTION_MAX } from './sketchbook-add';

const student = { id: 's1', user_type: 'student' };
const ok = { original_image_url: 'https://cdn.test/a.jpg', thumbnail_url: 'https://cdn.test/t.jpg', caption: 'Perspective study' };

beforeEach(() => {
  mocks.createDrawingSubmission.mockReset().mockResolvedValue({ id: 'sub1', submitted_at: '2026-10-03T12:00:00Z' });
  mocks.update.mockReset().mockResolvedValue({ error: null });
  mocks.del.mockReset().mockResolvedValue({ error: null });
  mocks.upsertPracticeDay.mockReset().mockResolvedValue({ isNewDay: true });
  mocks.getStudentPrimaryClassroom.mockReset().mockResolvedValue({ id: 'c1', batch_id: 'b1' });
  mocks.recordGamificationEvent.mockReset().mockResolvedValue(undefined);
  mocks.loadStudentRhythm.mockReset().mockResolvedValue({ rhythm: { week: { count: 1, goal: 3 } }, timeZone: 'Asia/Kolkata' });
  mocks.getInspirationItem.mockReset();
});

describe('addSketchForStudent', () => {
  it('refuses a non-student with 403 and a non-https image with 400', async () => {
    await expect(addSketchForStudent({ id: 't1', user_type: 'teacher' }, ok)).rejects.toMatchObject({ status: 403 });
    await expect(addSketchForStudent(student, { ...ok, original_image_url: 'http://x' })).rejects.toMatchObject({ status: 400 });
    expect(mocks.createDrawingSubmission).not.toHaveBeenCalled();
  });

  it('creates the sketch, finishes it as completed, and awards the first sketch of the day', async () => {
    const out = await addSketchForStudent(student, ok);
    expect(mocks.createDrawingSubmission).toHaveBeenCalledWith({ student_id: 's1', source_type: 'sketchbook', original_image_url: ok.original_image_url, self_note: 'Perspective study' });
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed', thumbnail_url: ok.thumbnail_url, thread_id: 'sub1' }));
    expect(mocks.recordGamificationEvent).toHaveBeenCalledTimes(1);
    expect(out).toMatchObject({ isNewDay: true, sketch: { id: 'sub1', status: 'completed' } });
  });

  it('truncates a long caption and skips the award on a repeat day', async () => {
    mocks.upsertPracticeDay.mockResolvedValue({ isNewDay: false });
    await addSketchForStudent(student, { ...ok, caption: 'x'.repeat(200) });
    expect(mocks.createDrawingSubmission.mock.calls[0][0].self_note).toHaveLength(CAPTION_MAX);
    expect(mocks.recordGamificationEvent).not.toHaveBeenCalled();
  });

  it('deletes the orphan when finishing the row fails', async () => {
    mocks.update.mockResolvedValueOnce({ error: { message: 'boom' } });
    await expect(addSketchForStudent(student, ok)).rejects.toBeTruthy();
    expect(mocks.del).toHaveBeenCalledTimes(1);
  });

  it('refuses an inspiration item the student cannot see', async () => {
    mocks.getInspirationItem.mockResolvedValue({ item: null });
    await expect(addSketchForStudent(student, { ...ok, inspiration_item_id: '11111111-1111-4111-8111-111111111111' })).rejects.toMatchObject({ status: 400 });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vitest run apps/nexus/src/lib/sketchbook-add.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement sketchbook-add.ts**

Move the body of the route's POST (from `if (caller.user_type !== 'student')` through the `return` of the payload) into this file, unchanged in behaviour:

```ts
/**
 * Adding one sketch to a student's sketchbook. Extracted from
 * POST /api/sketchbook/entries so the assistant's upload flow and the
 * sketchbook screen create a sketch the same way: completed on arrival, one
 * practice day and one award per IST day, inspiration link checked first.
 */
import { getSupabaseAdminClient } from '@neram/database';
import {
  createDrawingSubmission, getInspirationItem, getStudentPrimaryClassroom, recordGamificationEvent, upsertPracticeDay,
} from '@neram/database/queries/nexus';
import { ApiError } from '@/lib/api-errors';
import { practiceDate, type Rhythm } from '@/lib/sketchbook-rhythm';
import { loadStudentRhythm } from '@/lib/sketchbook-payload';
import { parseQuality } from '@/lib/image-quality';

export const CAPTION_MAX = 80;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AddSketchResult {
  sketch: Record<string, unknown>;
  rhythm: Rhythm;
  isNewDay: boolean;
}

export async function addSketchForStudent(
  caller: { id: string; user_type: string | null },
  body: unknown,
): Promise<AddSketchResult> {
  if (caller.user_type !== 'student') throw new ApiError('Only students keep a sketchbook.', 403);
  const b = (body ?? {}) as Record<string, unknown>;

  const originalUrl = typeof b.original_image_url === 'string' ? b.original_image_url : '';
  if (!/^https:\/\//.test(originalUrl)) throw new ApiError('Missing original_image_url', 400);
  const thumbnailUrl = typeof b.thumbnail_url === 'string' && /^https:\/\//.test(b.thumbnail_url) ? b.thumbnail_url : null;
  const caption = typeof b.caption === 'string' ? b.caption.trim().slice(0, CAPTION_MAX) : '';
  const imageQuality = parseQuality(b.image_quality);

  let inspirationItemId: string | null = null;
  if (b.inspiration_item_id !== undefined && b.inspiration_item_id !== null) {
    const raw = b.inspiration_item_id;
    if (typeof raw !== 'string' || !UUID_RE.test(raw)) throw new ApiError('That Inspiration drawing was not found.', 400);
    const { item } = await getInspirationItem(raw, caller.id, 'visible');
    if (!item) throw new ApiError('That Inspiration drawing was not found.', 400);
    inspirationItemId = raw;
  }

  const supabase = getSupabaseAdminClient();
  const submission = await createDrawingSubmission({
    student_id: caller.id,
    source_type: 'sketchbook',
    original_image_url: originalUrl,
    self_note: caption || null,
  });
  const { error: finishError } = await supabase
    .from('drawing_submissions')
    .update({ status: 'completed', thumbnail_url: thumbnailUrl, thread_id: submission.id, inspiration_item_id: inspirationItemId })
    .eq('id', submission.id);
  if (finishError) {
    await supabase.from('drawing_submissions').delete().eq('id', submission.id);
    throw finishError;
  }
  if (imageQuality) {
    const { error: qualityError } = await (supabase as any)
      .from('drawing_submissions')
      .update({ image_quality: imageQuality })
      .eq('id', submission.id);
    if (qualityError) console.error('[sketchbook] could not store the photo measurement:', qualityError.message);
  }

  const { rhythm, timeZone } = await loadStudentRhythm(caller.id);
  const today = practiceDate(submission.submitted_at || new Date(), timeZone);
  const { isNewDay } = await upsertPracticeDay(caller.id, today, submission.id);

  const classroom = await getStudentPrimaryClassroom(caller.id);
  if (isNewDay && classroom) {
    recordGamificationEvent({
      student_id: caller.id,
      classroom_id: classroom.id,
      batch_id: classroom.batch_id,
      event_type: 'drawing_submitted',
      points: 2,
      source_id: `sketch_day_${today}`,
      activity_type: 'drawing_submitted',
      activity_title: 'Added a sketch to their sketchbook',
      metadata: { submission_id: submission.id, practice_date: today },
    }).catch(() => {});
  }

  return {
    sketch: { ...submission, status: 'completed', thumbnail_url: thumbnailUrl, inspiration_item_id: inspirationItemId },
    rhythm,
    isNewDay,
  };
}
```

Keep the existing explanatory comments from the route beside the matching lines when you move them (they are the reasoning for the orphan delete, the non-fatal quality write, and the one award per day).

- [ ] **Step 4: Rewire the route**

`apps/nexus/src/app/api/sketchbook/entries/route.ts` becomes:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/study-materials';
import { errorResponse } from '@/lib/api-errors';
import { addSketchForStudent } from '@/lib/sketchbook-add';

const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * POST /api/sketchbook/entries   (student)
 * body { original_image_url, thumbnail_url?, caption?, inspiration_item_id?, image_quality? }
 *
 * The image is already in the drawing-uploads bucket (POST /api/drawing/upload).
 * The rules live in lib/sketchbook-add.ts, shared with the Neram Assistant.
 */
export async function POST(request: NextRequest) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    const body = await request.json().catch(() => ({}));
    const result = await addSketchForStudent(caller, body);
    return NextResponse.json(result, { status: 201, headers: NO_STORE });
  } catch (err) {
    return errorResponse(err, 'Could not add the sketch');
  }
}
```

- [ ] **Step 5: Run the tests and type-check**

Run: `pnpm vitest run apps/nexus/src/lib/sketchbook-add.test.ts && pnpm --filter @neram/nexus type-check`
Expected: PASS, clean.

- [ ] **Step 6: Commit**

```bash
git add apps/nexus/src/lib/sketchbook-add.ts apps/nexus/src/lib/sketchbook-add.test.ts apps/nexus/src/app/api/sketchbook/entries/route.ts
git commit -m "refactor(nexus): extract addSketchForStudent from the sketchbook entries route"
```

---

### Task 11: The brief, its loader and its route

**Files:**
- Create: `apps/nexus/src/lib/assistant/brief.ts`
- Create: `apps/nexus/src/lib/assistant/brief-load.ts`
- Create: `apps/nexus/src/app/api/assistant/brief/route.ts`
- Test: `apps/nexus/src/lib/assistant/brief.test.ts`, `apps/nexus/src/app/api/assistant/brief/route.test.ts`

**Interfaces:**
- Consumes: `loadUpcomingClasses`, `loadDeclinedClassIds` (Task 7); `listRemindersDue` (Task 5); `assertAssistantAccess` (Task 2); `relativeDay`, `formatTime12`, `todayIst` (Task 3).
- Produces: `BriefFacts`, `BriefSection`, `Brief`, `buildBrief(facts, nowHourIst)`, `loadBriefFacts(supabase, userId, now?)`, `GET /api/assistant/brief` returning `{ brief: Brief }`.

- [ ] **Step 1: Write the failing brief test**

`apps/nexus/src/lib/assistant/brief.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildBrief, type BriefFacts } from './brief';

const base: BriefFacts = {
  firstName: 'Priya',
  today: '2026-10-03',
  classroomName: 'JEE B.Arch Session 1',
  nextClass: null,
  assignments: { pending: 0, nextTitle: null, nextDueOn: null },
  catchup: null,
  reviewsBack: 0,
  sketchbookLine: null,
  exam: null,
  remindersToday: [],
};

describe('buildBrief', () => {
  it('greets by the hour and says when there is nothing to report', () => {
    const b = buildBrief(base, 9);
    expect(b.greeting).toBe('Good morning, Priya');
    expect(b.hasContent).toBe(false);
    expect(b.sections).toEqual([]);
    expect(buildBrief(base, 14).greeting).toBe('Good afternoon, Priya');
    expect(buildBrief(base, 19).greeting).toBe('Good evening, Priya');
    expect(buildBrief({ ...base, firstName: null }, 19).greeting).toBe('Good evening');
  });

  it('describes the next class today and tomorrow, and a declined one', () => {
    const today = buildBrief({ ...base, nextClass: { id: 'k1', title: 'Perspective', date: '2026-10-03', startTime: '18:00', endTime: '19:30', declined: false } }, 9);
    expect(today.sections[0]).toEqual({ id: 'next_class', text: 'Class today at 6:00 pm: Perspective.', link: '/student/timetable' });
    const declined = buildBrief({ ...base, nextClass: { id: 'k1', title: 'Perspective', date: '2026-10-04', startTime: '18:00', endTime: '19:30', declined: true } }, 9);
    expect(declined.sections[0].text).toBe('Class tomorrow at 6:00 pm: Perspective. You said you cannot attend.');
  });

  it('counts assignments and names the nearest due date', () => {
    const b = buildBrief({ ...base, assignments: { pending: 2, nextTitle: 'Shading sheet', nextDueOn: '2026-10-05' } }, 9);
    expect(b.sections[0]).toEqual({ id: 'assignments', text: '2 assignments to submit. Shading sheet is due Monday 5 Oct.', link: '/student/assignments' });
    const one = buildBrief({ ...base, assignments: { pending: 1, nextTitle: 'Shading sheet', nextDueOn: null } }, 9);
    expect(one.sections[0].text).toBe('1 assignment to submit: Shading sheet.');
  });

  it('passes the catch-up sentence through and counts reviews back', () => {
    const b = buildBrief({ ...base, catchup: { open: 1, sentence: 'You are on track. Keep going at 2 classes a week and you will be level with the class.' }, reviewsBack: 2 }, 9);
    expect(b.sections.map((s) => s.id)).toEqual(['catchup', 'reviews']);
    expect(b.sections[0].link).toBe('/student/catch-up');
    expect(b.sections[1].text).toBe('2 drawings came back with a review this week.');
    expect(buildBrief({ ...base, reviewsBack: 1 }, 9).sections[0].text).toBe('1 drawing came back with a review this week.');
  });

  it('adds the sketchbook line, the exam countdown and reminders due today, in that order', () => {
    const b = buildBrief({
      ...base,
      sketchbookLine: '1 of 3 days this week.',
      exam: { shortLabel: 'NATA', headline: 'About 4 months to go', detail: '14 Feb, date confirmed' },
      remindersToday: ['finish the catch-up', 'bring the sketchbook'],
    }, 9);
    expect(b.sections.map((s) => s.id)).toEqual(['sketchbook', 'exam', 'reminders']);
    expect(b.sections[0]).toEqual({ id: 'sketchbook', text: 'Sketchbook: 1 of 3 days this week.', link: '/student/sketchbook' });
    expect(b.sections[1].text).toBe('NATA: About 4 months to go. 14 Feb, date confirmed.');
    expect(b.sections[2]).toEqual({ id: 'reminders', text: 'You asked me to remind you today: finish the catch-up; bring the sketchbook.', link: null });
    expect(b.hasContent).toBe(true);
  });

  it('never contains an em dash', () => {
    const b = buildBrief({ ...base, assignments: { pending: 3, nextTitle: 'A', nextDueOn: '2026-10-04' }, reviewsBack: 1 }, 9);
    for (const s of b.sections) expect(s.text).not.toMatch(/—|--/);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vitest run apps/nexus/src/lib/assistant/brief.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement brief.ts**

```ts
/**
 * The daily brief: what a student should know when they arrive, as templated
 * sentences built from facts. No model. The same function feeds the dashboard
 * card, the `my_brief` tool and (M3) the morning Teams message, so the three
 * cannot say different things.
 */
import { formatTime12, relativeDay } from './format';

export interface BriefFacts {
  firstName: string | null;
  /** IST calendar date. */
  today: string;
  classroomName: string | null;
  nextClass: { id: string; title: string; date: string; startTime: string; endTime: string; declined: boolean } | null;
  assignments: { pending: number; nextTitle: string | null; nextDueOn: string | null };
  /** Null when the student has no catch-up list at all. */
  catchup: { open: number; sentence: string | null } | null;
  /** Drawings reviewed by a teacher in the last seven days. */
  reviewsBack: number;
  /** rhythmLine() from lib/sketchbook-rhythm, or null when the sketchbook is off. */
  sketchbookLine: string | null;
  exam: { shortLabel: string; headline: string; detail: string } | null;
  /** Texts of reminders due today or earlier. */
  remindersToday: string[];
}

export type BriefSectionId = 'next_class' | 'assignments' | 'catchup' | 'reviews' | 'sketchbook' | 'exam' | 'reminders';

export interface BriefSection {
  id: BriefSectionId;
  text: string;
  link: string | null;
}

export interface Brief {
  greeting: string;
  classroomName: string | null;
  sections: BriefSection[];
  hasContent: boolean;
}

function greeting(firstName: string | null, hour: number): string {
  const part = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return firstName ? `${part}, ${firstName}` : part;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** `nowHourIst` is 0 to 23 in IST; the caller reads the clock so this stays pure. */
export function buildBrief(f: BriefFacts, nowHourIst: number): Brief {
  const sections: BriefSection[] = [];

  if (f.nextClass) {
    const when = relativeDay(f.nextClass.date, f.today);
    const declined = f.nextClass.declined ? ' You said you cannot attend.' : '';
    sections.push({ id: 'next_class', text: `Class ${when} at ${formatTime12(f.nextClass.startTime)}: ${f.nextClass.title}.${declined}`, link: '/student/timetable' });
  }

  if (f.assignments.pending > 0) {
    const head = plural(f.assignments.pending, 'assignment', 'assignments');
    let text: string;
    if (f.assignments.nextTitle && f.assignments.nextDueOn) {
      text = `${head} to submit. ${f.assignments.nextTitle} is due ${relativeDay(f.assignments.nextDueOn, f.today)}.`;
    } else if (f.assignments.nextTitle) {
      text = `${head} to submit: ${f.assignments.nextTitle}.`;
    } else {
      text = `${head} to submit.`;
    }
    sections.push({ id: 'assignments', text, link: '/student/assignments' });
  }

  if (f.catchup && f.catchup.open > 0) {
    const text = f.catchup.sentence || `${plural(f.catchup.open, 'class', 'classes')} to catch up on.`;
    sections.push({ id: 'catchup', text, link: '/student/catch-up' });
  }

  if (f.reviewsBack > 0) {
    sections.push({ id: 'reviews', text: `${plural(f.reviewsBack, 'drawing', 'drawings')} came back with a review this week.`, link: '/student/drawings' });
  }

  if (f.sketchbookLine) {
    sections.push({ id: 'sketchbook', text: `Sketchbook: ${f.sketchbookLine}`, link: '/student/sketchbook' });
  }

  if (f.exam) {
    const detail = f.exam.detail ? ` ${f.exam.detail.replace(/\.?$/, '.')}` : '';
    sections.push({ id: 'exam', text: `${f.exam.shortLabel}: ${f.exam.headline.replace(/\.?$/, '.')}${detail}`, link: '/student/dashboard' });
  }

  if (f.remindersToday.length > 0) {
    sections.push({ id: 'reminders', text: `You asked me to remind you today: ${f.remindersToday.join('; ')}.`, link: null });
  }

  return { greeting: greeting(f.firstName, nowHourIst), classroomName: f.classroomName, sections, hasContent: sections.length > 0 };
}
```

- [ ] **Step 4: Implement brief-load.ts**

```ts
/**
 * Gathers the facts for buildBrief from the loaders the student screens already
 * use. Every call is scoped to `userId`; nothing here takes a student id from
 * a request. A failed optional loader drops its section rather than the brief.
 */
import { getCatchupBacklog, getSupabaseAdminClient, listAssignmentsForStudent } from '@neram/database';
import { getStudentPrimaryClassroom } from '@neram/database/queries/nexus';
import { computeCatchupPace, describeCatchupPace } from '@/lib/catchup-pace';
import { describeExamCountdown } from '@/lib/exam-countdown';
import { resolveExamCountdown } from '@/lib/exam-countdown-server';
import { loadStudentRhythm } from '@/lib/sketchbook-payload';
import { rhythmLine } from '@/lib/sketchbook-rhythm';
import { istNow, loadDeclinedClassIds, loadUpcomingClasses } from '@/lib/upcoming-classes';
import type { BriefFacts } from './brief';
import { listRemindersDue } from './store';

async function quiet<T>(label: string, p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (err) {
    console.error(`[assistant brief] ${label} failed:`, err instanceof Error ? err.message : err);
    return fallback;
  }
}

export async function loadBriefFacts(supabaseIn: any, userId: string, now: Date = new Date()): Promise<BriefFacts> {
  const supabase = supabaseIn || (getSupabaseAdminClient() as any);
  const { today, nowHHMM } = istNow(now);

  const [{ data: user }, classroom] = await Promise.all([
    supabase.from('users').select('name').eq('id', userId).maybeSingle(),
    quiet('classroom', getStudentPrimaryClassroom(userId, supabase), null),
  ]);
  const firstName = String(user?.name || '').trim().split(/\s+/)[0] || null;

  const empty: BriefFacts = {
    firstName, today, classroomName: classroom?.name ?? null, nextClass: null,
    assignments: { pending: 0, nextTitle: null, nextDueOn: null }, catchup: null, reviewsBack: 0,
    sketchbookLine: null, exam: null, remindersToday: [],
  };
  if (!classroom) return empty;

  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();

  const [upcoming, assignments, backlog, reviewed, rhythm, examTarget, reminders] = await Promise.all([
    quiet('upcoming', loadUpcomingClasses(supabase, classroom.id, { today, nowHHMM, limit: 3 }), []),
    quiet('assignments', listAssignmentsForStudent(userId, classroom.id, supabase), []),
    quiet('catchup', getCatchupBacklog(userId, classroom.id, supabase), null),
    quiet('reviews', supabase.from('drawing_submissions').select('id', { count: 'exact', head: true }).eq('student_id', userId).eq('status', 'reviewed').gte('reviewed_at', weekAgo), { count: 0 }),
    quiet('sketchbook', loadStudentRhythm(userId, now), null),
    quiet('exam', resolveExamCountdown(supabase, { classroomId: classroom.id, studentId: userId }), null),
    quiet('reminders', listRemindersDue(supabase, userId, today), []),
  ]);

  const declined = upcoming.length ? await quiet('declined', loadDeclinedClassIds(supabase, userId, upcoming.map((c) => c.id)), new Set<string>()) : new Set<string>();
  const next = upcoming[0];

  const pending = assignments
    .filter((a) => !a.submission)
    .sort((a, b) => String(a.due_at || '9999').localeCompare(String(b.due_at || '9999')));
  const nextAssignment = pending[0];

  let catchup: BriefFacts['catchup'] = null;
  if (backlog) {
    const open = backlog.items.filter((i) => !i.caught_up_at && !i.excused).length;
    let sentence: string | null = null;
    if (backlog.journey) {
      const quota = backlog.journey.weekly_quota ?? 2;
      const pace = computeCatchupPace(
        { started_on: backlog.journey.started_on, weekly_quota: quota, total_items: backlog.totals?.total ?? open, completed_items: backlog.totals?.completed ?? 0 },
        today,
      );
      sentence = describeCatchupPace(pace, quota);
    }
    catchup = { open, sentence };
  }

  const examView = examTarget ? describeExamCountdown(examTarget, today) : null;

  return {
    ...empty,
    nextClass: next
      ? { id: next.id, title: next.title, date: next.scheduled_date, startTime: next.start_time, endTime: next.end_time, declined: declined.has(next.id) }
      : null,
    assignments: {
      pending: pending.length,
      nextTitle: nextAssignment?.title ?? null,
      nextDueOn: nextAssignment?.due_at ? String(nextAssignment.due_at).slice(0, 10) : null,
    },
    catchup,
    reviewsBack: (reviewed as { count?: number | null })?.count ?? 0,
    sketchbookLine: rhythm ? rhythmLine(rhythm.rhythm) : null,
    exam: examView && examView.visible ? { shortLabel: examView.short_label, headline: examView.headline, detail: examView.detail } : null,
    remindersToday: reminders.map((r) => r.text),
  };
}

/** IST hour of the day, for the greeting. */
export function istHour(now: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }).format(now));
}
```

If `listAssignmentsForStudent` or `getCatchupBacklog` is not exported from the `@neram/database` barrel, import them the way `apps/nexus/src/app/api/student/assignments/route.ts` and `apps/nexus/src/app/api/student/catchup-journey/route.ts` do; do not add new exports to the package.

- [ ] **Step 5: Write the failing route test**

`apps/nexus/src/app/api/assistant/brief/route.test.ts`:

```ts
// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getRequestUser: vi.fn(),
  verifyMsToken: vi.fn(),
  assertAssistantAccess: vi.fn(),
  loadBriefFacts: vi.fn(),
}));

vi.mock('@/lib/study-materials', () => ({ getRequestUser: mocks.getRequestUser }));
vi.mock('@/lib/ms-verify', () => ({ verifyMsToken: mocks.verifyMsToken }));
vi.mock('@/lib/assistant/access', () => ({ assertAssistantAccess: mocks.assertAssistantAccess }));
vi.mock('@/lib/assistant/brief-load', () => ({ loadBriefFacts: mocks.loadBriefFacts, istHour: () => 9 }));
vi.mock('@neram/database', () => ({ getSupabaseAdminClient: () => ({}) }));

import { GET } from './route';
import { ApiError } from '@/lib/api-errors';

const req = () => new NextRequest('http://localhost/api/assistant/brief', { headers: { Authorization: 'Bearer t' } });

beforeEach(() => {
  mocks.verifyMsToken.mockReset().mockResolvedValue({ oid: 'oid-1' });
  mocks.getRequestUser.mockReset().mockResolvedValue({ id: 'u1', user_type: 'student', name: 'Priya S', staff_role: null, can_teach: null });
  mocks.assertAssistantAccess.mockReset().mockResolvedValue(undefined);
  mocks.loadBriefFacts.mockReset().mockResolvedValue({
    firstName: 'Priya', today: '2026-10-03', classroomName: 'JEE', nextClass: null,
    assignments: { pending: 1, nextTitle: 'Sheet', nextDueOn: null }, catchup: null, reviewsBack: 0, sketchbookLine: null, exam: null, remindersToday: [],
  });
});

describe('GET /api/assistant/brief', () => {
  it('returns the built brief for the signed-in student', async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.brief.greeting).toBe('Good morning, Priya');
    expect(body.brief.sections[0].id).toBe('assignments');
    expect(mocks.loadBriefFacts).toHaveBeenCalledWith(expect.anything(), 'u1', expect.any(Date));
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('passes the gate\'s status through (404 while dark, 403 outside the pilot)', async () => {
    mocks.assertAssistantAccess.mockRejectedValueOnce(new ApiError('Not found', 404));
    expect((await GET(req())).status).toBe(404);
    mocks.assertAssistantAccess.mockRejectedValueOnce(new ApiError('no', 403));
    expect((await GET(req())).status).toBe(403);
  });

  it('answers 401 when the token is bad', async () => {
    mocks.verifyMsToken.mockRejectedValueOnce(new Error('Invalid Microsoft token'));
    expect((await GET(req())).status).toBe(401);
  });
});
```

- [ ] **Step 6: Run it to see it fail**

Run: `pnpm vitest run apps/nexus/src/app/api/assistant/brief/route.test.ts`
Expected: FAIL, `./route` not found.

- [ ] **Step 7: Implement the route**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { errorResponse } from '@/lib/api-errors';
import { verifyMsToken } from '@/lib/ms-verify';
import { getRequestUser } from '@/lib/study-materials';
import { assertAssistantAccess } from '@/lib/assistant/access';
import { buildBrief } from '@/lib/assistant/brief';
import { istHour, loadBriefFacts } from '@/lib/assistant/brief-load';

export const dynamic = 'force-dynamic';

/**
 * GET /api/assistant/brief   (student)
 *
 * The dashboard card. Its own route rather than a field on the dashboard
 * payload because the dashboard route is the page's critical path and this
 * needs six loaders it does not have; the card shows a skeleton meanwhile.
 * Per-user and gate-dependent, so uncacheable by construction.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = request.headers.get('Authorization');
    await verifyMsToken(auth);
    const caller = await getRequestUser(auth);
    const supabase = getSupabaseAdminClient() as any;
    await assertAssistantAccess(supabase, caller);

    const now = new Date();
    const facts = await loadBriefFacts(supabase, caller.id, now);
    return NextResponse.json({ brief: buildBrief(facts, istHour(now)) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err, 'Could not build your brief');
  }
}
```

- [ ] **Step 8: Run the tests and type-check**

Run: `pnpm vitest run apps/nexus/src/lib/assistant/brief.test.ts apps/nexus/src/app/api/assistant/brief/route.test.ts && pnpm --filter @neram/nexus type-check`
Expected: PASS, clean.

- [ ] **Step 9: Commit**

```bash
git add apps/nexus/src/lib/assistant/brief.ts apps/nexus/src/lib/assistant/brief.test.ts apps/nexus/src/lib/assistant/brief-load.ts apps/nexus/src/app/api/assistant/brief
git commit -m "feat(assistant): templated daily brief, loader and GET /api/assistant/brief"
```

---

### Task 12: Intent router and the student read tools

**Files:**
- Create: `apps/nexus/src/lib/assistant/router.ts`
- Create: `apps/nexus/src/lib/assistant/tools/student/index.ts` (registers the seven read tools)
- Create: `apps/nexus/src/lib/assistant/tools/student/my-brief.ts`, `my-schedule.ts`, `my-assignments.ts`, `my-catchup.ts`, `my-attendance.ts`, `my-sketchbook.ts`, `exam-countdown.ts`
- Test: `apps/nexus/src/lib/assistant/router.test.ts`, `apps/nexus/src/lib/assistant/tools/student/student-tools.test.ts`

**Interfaces:**
- Consumes: Task 3 types and helpers, Task 7 loaders, Task 11 `buildBrief`/`loadBriefFacts`/`istHour`, Task 4 `registerTools`.
- Produces: `routeIntent(text, pageContext): Route` where `Route = { kind: 'cancel' } | { kind: 'flow'; flow: 'cannot-attend' | 'remind-me' | 'upload-sketch' } | { kind: 'tool'; tool: string } | { kind: 'llm'; mode: Mode }`; `detectMode(text, pageContext)`; the tools `my_brief`, `my_schedule`, `my_assignments`, `my_catchup`, `my_attendance`, `my_sketchbook`, `exam_countdown`, each `audience: 'student'`, `kind: 'read'`, returning `{ ok, reply, links }`.

- [ ] **Step 1: Write the failing router test**

```ts
import { describe, expect, it } from 'vitest';
import { detectMode, routeIntent } from './router';

const page = { path: '/student/dashboard' };

describe('routeIntent', () => {
  it.each([
    ['cancel', 'cancel'], ['Stop', 'cancel'], ['never mind', 'cancel'],
  ])('%s -> %s', (text, kind) => {
    expect(routeIntent(text, page)).toEqual({ kind });
  });

  it.each([
    ["I can't attend tomorrow", 'cannot-attend'],
    ['cannot come to class on friday', 'cannot-attend'],
    ["won't be able to join today", 'cannot-attend'],
    ['I will miss the class', 'cannot-attend'],
    ['mark me away next week', 'cannot-attend'],
    ['remind me tomorrow to finish the catch-up', 'remind-me'],
    ['Remind me on friday', 'remind-me'],
    ['add a sketch', 'upload-sketch'],
    ['upload my drawing', 'upload-sketch'],
  ])('%s -> flow %s', (text, flow) => {
    expect(routeIntent(text, page)).toEqual({ kind: 'flow', flow });
  });

  it.each([
    ["what's due", 'my_assignments'], ['pending assignments', 'my_assignments'], ['homework', 'my_assignments'],
    ['my schedule', 'my_schedule'], ['when is my next class', 'my_schedule'], ['timetable', 'my_schedule'],
    ['brief', 'my_brief'], ['what do I have today', 'my_brief'], ['summary', 'my_brief'],
    ['my attendance', 'my_attendance'],
    ['catch up', 'my_catchup'], ['catch-up', 'my_catchup'], ['what did I miss', 'my_catchup'],
    ['sketchbook', 'my_sketchbook'], ['how is my rhythm', 'my_sketchbook'],
    ['how many days left for the exam', 'exam_countdown'], ['exam date', 'exam_countdown'], ['days to NATA', 'exam_countdown'],
  ])('%s -> tool %s', (text, tool) => {
    expect(routeIntent(text, page)).toEqual({ kind: 'tool', tool });
  });

  it('sends anything else to the model in the detected mode', () => {
    expect(routeIntent('why do we draw two point perspective', page)).toEqual({ kind: 'llm', mode: 'general' });
    expect(routeIntent('which chapter has most weightage in maths', page)).toEqual({ kind: 'llm', mode: 'exam' });
    expect(routeIntent('anything', { path: '/student/question-bank/nata/questions' })).toEqual({ kind: 'llm', mode: 'exam' });
  });

  it('prefers a flow over a tool when both words appear', () => {
    expect(routeIntent("I can't attend the class, what's the catch up", page)).toEqual({ kind: 'flow', flow: 'cannot-attend' });
  });
});

describe('detectMode', () => {
  it('is exam on question-bank pages or on exam words', () => {
    expect(detectMode('hello', { path: '/student/question-bank/jee' })).toBe('exam');
    expect(detectMode('NCERT chapter on probability', { path: '/student/dashboard' })).toBe('exam');
    expect(detectMode('hello', { path: '/student/dashboard' })).toBe('general');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vitest run apps/nexus/src/lib/assistant/router.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement router.ts**

```ts
/**
 * Where a message goes before any model sees it. A small table of English
 * patterns; Tamil and Hindi forms are a later task. Order matters: cancel
 * first, then guided flows, then direct tools, then the model.
 */
import type { Mode, PageContext } from './types';

export type FlowName = 'cannot-attend' | 'remind-me' | 'upload-sketch';

export type Route =
  | { kind: 'cancel' }
  | { kind: 'flow'; flow: FlowName }
  | { kind: 'tool'; tool: string }
  | { kind: 'llm'; mode: Mode };

const CANCEL = /^\s*(cancel|stop|never ?mind|forget it|no thanks)\s*[.!]?\s*$/i;

const FLOWS: Array<[FlowName, RegExp]> = [
  ['cannot-attend', /\b(can'?t|cannot|can not|won'?t be able to|unable to|not able to)\s+(attend|come|join|make it)\b|\bmiss(ing)?\s+(the\s+|today'?s\s+|tomorrow'?s\s+)?class\b|\bmark me away\b|\bi am away\b|\bi'?ll be away\b/i],
  ['remind-me', /\bremind me\b/i],
  ['upload-sketch', /\b(add|upload|submit|post)\s+(a\s+|my\s+|this\s+)?(sketch|drawing|photo of my sketch)\b/i],
];

const TOOLS: Array<[string, RegExp]> = [
  ['my_assignments', /\b(due|pending|assignments?|homework|work to submit|submit)\b/i],
  ['my_schedule', /\b(schedule|timetable|next class|my classes|class (today|tomorrow|this week)|when is (the|my) class)\b/i],
  ['exam_countdown', /\b(days (left|to go|until)|exam (date|countdown)|how long (till|until) (the )?exam|days to (nata|jee))\b/i],
  ['my_attendance', /\battendance\b/i],
  ['my_catchup', /\bcatch[\s-]?up\b|\bwhat did i miss\b|\bmissed classes\b/i],
  ['my_sketchbook', /\bsketchbook\b|\brhythm\b|\bpractice days\b/i],
  ['my_brief', /^\s*(brief|summary|today|what do i have today|what'?s (on|up) today|my day)\s*\??\s*$/i],
];

const EXAM_WORDS = /\b(chapter|jee|nata|maths?|mathematics|formula|question|weightage|ncert|syllabus|aptitude|past papers?)\b/i;

export function detectMode(text: string, page: PageContext | null | undefined): Mode {
  if (page?.path?.startsWith('/student/question-bank')) return 'exam';
  return EXAM_WORDS.test(text) ? 'exam' : 'general';
}

export function routeIntent(text: string, page: PageContext | null | undefined): Route {
  const t = text.trim();
  if (CANCEL.test(t)) return { kind: 'cancel' };
  for (const [flow, re] of FLOWS) if (re.test(t)) return { kind: 'flow', flow };
  for (const [tool, re] of TOOLS) if (re.test(t)) return { kind: 'tool', tool };
  return { kind: 'llm', mode: detectMode(t, page) };
}
```

- [ ] **Step 4: Run the router test**

Run: `pnpm vitest run apps/nexus/src/lib/assistant/router.test.ts`
Expected: PASS. If a row fails, fix the pattern, not the test; the table is the contract.

- [ ] **Step 5: Write the failing tools test**

`apps/nexus/src/lib/assistant/tools/student/student-tools.test.ts`:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadBriefFacts: vi.fn(),
  loadUpcomingClasses: vi.fn(),
  loadDeclinedClassIds: vi.fn(),
  listAssignmentsForStudent: vi.fn(),
  getCatchupBacklog: vi.fn(),
  loadOwnAttendance: vi.fn(),
  loadStudentRhythm: vi.fn(),
  resolveExamCountdown: vi.fn(),
}));

vi.mock('@/lib/assistant/brief-load', () => ({ loadBriefFacts: mocks.loadBriefFacts, istHour: () => 10 }));
vi.mock('@/lib/upcoming-classes', () => ({ loadUpcomingClasses: mocks.loadUpcomingClasses, loadDeclinedClassIds: mocks.loadDeclinedClassIds, istNow: () => ({ today: '2026-10-03', nowHHMM: '10:00' }) }));
vi.mock('@neram/database', () => ({ listAssignmentsForStudent: mocks.listAssignmentsForStudent, getCatchupBacklog: mocks.getCatchupBacklog, getSupabaseAdminClient: () => ({}) }));
vi.mock('@/lib/student-attendance', () => ({ loadOwnAttendance: mocks.loadOwnAttendance }));
vi.mock('@/lib/sketchbook-payload', () => ({ loadStudentRhythm: mocks.loadStudentRhythm }));
vi.mock('@/lib/exam-countdown-server', () => ({ resolveExamCountdown: mocks.resolveExamCountdown }));

import { TOOLS } from '@/lib/assistant/registry';
import '@/lib/assistant/tools/student';
import type { AssistantCaller, ToolContext } from '@/lib/assistant/types';

const caller: AssistantCaller = { id: 's1', name: 'Priya S', user_type: 'student', staff_role: null, can_teach: null, impersonating: false };
const ctx = (classroomId: string | null = 'c1'): ToolContext => ({
  caller, channel: 'nexus', mode: 'general', supabase: { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { batch_id: 'b1', enrolled_at: '2026-06-01' } }) }) }) }) }) },
  classroomId, threadId: 't1', now: new Date('2026-10-03T04:30:00Z'), baseUrl: 'https://nexus.test',
});
const tool = (name: string) => TOOLS.find((t) => t.name === name)!;

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.loadDeclinedClassIds.mockResolvedValue(new Set());
});

describe('student read tools', () => {
  it('are all registered for students only, as reads', () => {
    const names = ['my_brief', 'my_schedule', 'my_assignments', 'my_catchup', 'my_attendance', 'my_sketchbook', 'exam_countdown'];
    for (const n of names) expect(tool(n)).toMatchObject({ audience: 'student', kind: 'read' });
  });

  it('every tool says so when the student has no classroom', async () => {
    for (const n of ['my_schedule', 'my_assignments', 'my_catchup', 'my_attendance', 'exam_countdown']) {
      const out = await tool(n).run(ctx(null), {});
      expect(out.ok).toBe(true);
      expect(out.reply).toMatch(/not in a classroom yet/);
    }
  });

  it('my_brief joins the brief sections into one reply with their links', async () => {
    mocks.loadBriefFacts.mockResolvedValue({
      firstName: 'Priya', today: '2026-10-03', classroomName: 'JEE', nextClass: { id: 'k', title: 'Perspective', date: '2026-10-03', startTime: '18:00', endTime: '19:30', declined: false },
      assignments: { pending: 0, nextTitle: null, nextDueOn: null }, catchup: null, reviewsBack: 0, sketchbookLine: null, exam: null, remindersToday: [],
    });
    const out = await tool('my_brief').run(ctx(), {});
    expect(out.reply).toBe('Good morning, Priya. Class today at 6:00 pm: Perspective.');
    expect(out.links).toEqual([{ label: 'Timetable', url: '/student/timetable' }]);
  });

  it('my_schedule lists the next classes and marks a declined one', async () => {
    mocks.loadUpcomingClasses.mockResolvedValue([
      { id: 'a', title: 'Perspective', scheduled_date: '2026-10-03', start_time: '18:00', end_time: '19:30' },
      { id: 'b', title: 'Shading', scheduled_date: '2026-10-05', start_time: '18:00', end_time: '19:30' },
    ]);
    mocks.loadDeclinedClassIds.mockResolvedValue(new Set(['b']));
    const out = await tool('my_schedule').run(ctx(), {});
    expect(out.reply).toBe('Your next classes:\n1. Today, 6:00 pm to 7:30 pm: Perspective.\n2. Monday 5 Oct, 6:00 pm to 7:30 pm: Shading (you said you cannot attend).');
    expect(out.links?.[0].url).toBe('/student/timetable');
    mocks.loadUpcomingClasses.mockResolvedValue([]);
    expect((await tool('my_schedule').run(ctx(), {})).reply).toBe('No classes are scheduled in the next few days.');
  });

  it('my_assignments counts pending work and names due dates', async () => {
    mocks.listAssignmentsForStudent.mockResolvedValue([
      { id: '1', title: 'Shading sheet', due_at: '2026-10-05T18:00:00Z', submission: null },
      { id: '2', title: 'Done one', due_at: null, submission: { id: 'x' } },
      { id: '3', title: 'Plan drawing', due_at: null, submission: null },
    ]);
    const out = await tool('my_assignments').run(ctx(), {});
    expect(out.reply).toBe('You have 2 assignments to submit:\n1. Shading sheet, due Monday 5 Oct.\n2. Plan drawing, no due date.');
    mocks.listAssignmentsForStudent.mockResolvedValue([{ id: '2', title: 'Done', due_at: null, submission: { id: 'x' } }]);
    expect((await tool('my_assignments').run(ctx(), {})).reply).toBe('Nothing to submit right now. All your assignments are in.');
  });

  it('my_catchup reports open items and the pace sentence', async () => {
    mocks.getCatchupBacklog.mockResolvedValue({
      journey: { started_on: '2026-09-01', weekly_quota: 2 },
      totals: { total: 6, completed: 4 },
      items: [
        { caught_up_at: null, excused: false, class: { title: 'Perspective', scheduled_date: '2026-09-15' } },
        { caught_up_at: '2026-09-20T00:00:00Z', excused: false, class: { title: 'Done', scheduled_date: '2026-09-10' } },
      ],
    });
    const out = await tool('my_catchup').run(ctx(), {});
    expect(out.reply).toMatch(/^1 class to catch up on: Perspective \(15 Sep\)\. You are /);
    expect(out.links?.[0].url).toBe('/student/catch-up');
    mocks.getCatchupBacklog.mockResolvedValue(null);
    expect((await tool('my_catchup').run(ctx(), {})).reply).toBe('You have nothing to catch up on.');
  });

  it('my_attendance returns the shared sentence', async () => {
    mocks.loadOwnAttendance.mockResolvedValue({ sentence: 'You attended 12 of 14 measured classes.' });
    const out = await tool('my_attendance').run(ctx(), {});
    expect(out.reply).toBe('You attended 12 of 14 measured classes.');
    expect(mocks.loadOwnAttendance).toHaveBeenCalledWith('s1', { classroom_id: 'c1', batch_id: 'b1', enrolled_at: '2026-06-01' });
  });

  it('my_sketchbook returns the rhythm line', async () => {
    mocks.loadStudentRhythm.mockResolvedValue({ rhythm: { today: '2026-10-03', week: { start: '2026-09-28', days: [], count: 1, goal: 3, met: false }, lastWeek: null, run: 0, bestRun: 0, totalDays: 4, lastPracticeDate: '2026-10-01', quietDays: 2 } });
    const out = await tool('my_sketchbook').run(ctx(), {});
    expect(out.reply).toBe('1 of 3 days this week.');
    expect(out.links?.[0].url).toBe('/student/sketchbook');
  });

  it('exam_countdown speaks the headline and detail, or says no date is set', async () => {
    mocks.resolveExamCountdown.mockResolvedValue({ exam_date: '2027-02-14', confidence: 'confirmed', exam_type: 'NATA', phase: null, label: 'NATA 2027', source: 'exam_registry', note: null });
    const out = await tool('exam_countdown').run(ctx(), {});
    expect(out.reply).toMatch(/to go/);
    mocks.resolveExamCountdown.mockResolvedValue(null);
    expect((await tool('exam_countdown').run(ctx(), {})).reply).toBe('No exam date is set for your class yet. Your teacher will add it.');
  });
});
```

The `exam_countdown` fixture must satisfy `ExamCountdownTarget` (`apps/nexus/src/lib/exam-countdown.ts:75`); copy the field list from that interface when writing the test.

- [ ] **Step 6: Run it to see it fail**

Run: `pnpm vitest run apps/nexus/src/lib/assistant/tools/student/student-tools.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 7: Implement the shared bits and the seven tools**

`apps/nexus/src/lib/assistant/tools/student/shared.ts`:

```ts
import type { ToolContext, ToolResult } from '@/lib/assistant/types';

export const NO_CLASSROOM: ToolResult = { ok: true, reply: 'You are not in a classroom yet, so there is nothing to show here. Your teacher will add you soon.' };

export const EMPTY_SCHEMA = { type: 'object' as const, properties: {} };

export function needsClassroom(ctx: ToolContext): ToolResult | null {
  return ctx.classroomId ? null : NO_CLASSROOM;
}

/** The student's batch and enrolment date, for loaders scoped that way. */
export async function studentScope(ctx: ToolContext): Promise<{ classroom_id: string; batch_id: string | null; enrolled_at: string | null }> {
  const { data } = await ctx.supabase
    .from('nexus_enrollments')
    .select('batch_id, enrolled_at')
    .eq('user_id', ctx.caller.id)
    .eq('classroom_id', ctx.classroomId)
    .maybeSingle();
  return { classroom_id: ctx.classroomId as string, batch_id: data?.batch_id ?? null, enrolled_at: data?.enrolled_at ?? null };
}
```

`my-brief.ts`:

```ts
import { buildBrief } from '@/lib/assistant/brief';
import { istHour, loadBriefFacts } from '@/lib/assistant/brief-load';
import type { ToolDef, ToolLink } from '@/lib/assistant/types';
import { EMPTY_SCHEMA } from './shared';

const LABELS: Record<string, string> = {
  '/student/timetable': 'Timetable', '/student/assignments': 'Assignments', '/student/catch-up': 'Catch-up',
  '/student/drawings': 'My drawings', '/student/sketchbook': 'Sketchbook', '/student/dashboard': 'Dashboard',
};

export const myBrief: ToolDef = {
  name: 'my_brief',
  description: "Today's summary for the student: next class, work due, catch-up, reviews, sketchbook, exam countdown, reminders.",
  parameters: EMPTY_SCHEMA,
  audience: 'student',
  kind: 'read',
  async run(ctx) {
    const facts = await loadBriefFacts(ctx.supabase, ctx.caller.id, ctx.now);
    const brief = buildBrief(facts, istHour(ctx.now));
    if (!brief.hasContent) return { ok: true, reply: `${brief.greeting}. Nothing is waiting on you right now.`, data: brief };
    const links: ToolLink[] = [];
    for (const s of brief.sections) if (s.link && !links.some((l) => l.url === s.link)) links.push({ label: LABELS[s.link] || 'Open', url: s.link });
    return { ok: true, reply: `${brief.greeting}. ${brief.sections.map((s) => s.text).join(' ')}`, data: brief, links };
  },
};
```

`my-schedule.ts`:

```ts
import { formatTime12, relativeDay } from '@/lib/assistant/format';
import type { ToolDef } from '@/lib/assistant/types';
import { istNow, loadDeclinedClassIds, loadUpcomingClasses } from '@/lib/upcoming-classes';
import { EMPTY_SCHEMA, needsClassroom } from './shared';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const mySchedule: ToolDef = {
  name: 'my_schedule',
  description: "The student's next classes with date, time and whether they said they cannot attend.",
  parameters: EMPTY_SCHEMA,
  audience: 'student',
  kind: 'read',
  async run(ctx) {
    const gate = needsClassroom(ctx);
    if (gate) return gate;
    const { today, nowHHMM } = istNow(ctx.now);
    const classes = await loadUpcomingClasses(ctx.supabase, ctx.classroomId as string, { today, nowHHMM, limit: 5 });
    if (classes.length === 0) return { ok: true, reply: 'No classes are scheduled in the next few days.', data: [], links: [{ label: 'Timetable', url: '/student/timetable' }] };
    const declined = await loadDeclinedClassIds(ctx.supabase, ctx.caller.id, classes.map((c) => c.id));
    const lines = classes.map((c, i) => {
      const flag = declined.has(c.id) ? ' (you said you cannot attend)' : '';
      return `${i + 1}. ${cap(relativeDay(c.scheduled_date, today))}, ${formatTime12(c.start_time)} to ${formatTime12(c.end_time)}: ${c.title}${flag}.`;
    });
    return { ok: true, reply: `Your next classes:\n${lines.join('\n')}`, data: classes, links: [{ label: 'Timetable', url: '/student/timetable' }] };
  },
};
```

`my-assignments.ts`:

```ts
import { listAssignmentsForStudent } from '@neram/database';
import { relativeDay } from '@/lib/assistant/format';
import type { ToolDef } from '@/lib/assistant/types';
import { istNow } from '@/lib/upcoming-classes';
import { EMPTY_SCHEMA, needsClassroom } from './shared';

export const myAssignments: ToolDef = {
  name: 'my_assignments',
  description: 'Assignments the student still has to submit, nearest due date first.',
  parameters: EMPTY_SCHEMA,
  audience: 'student',
  kind: 'read',
  async run(ctx) {
    const gate = needsClassroom(ctx);
    if (gate) return gate;
    const { today } = istNow(ctx.now);
    const all = await listAssignmentsForStudent(ctx.caller.id, ctx.classroomId as string, ctx.supabase);
    const pending = all.filter((a) => !a.submission).sort((a, b) => String(a.due_at || '9999').localeCompare(String(b.due_at || '9999')));
    const links = [{ label: 'Assignments', url: '/student/assignments' }];
    if (pending.length === 0) return { ok: true, reply: 'Nothing to submit right now. All your assignments are in.', data: [], links };
    const lines = pending.slice(0, 5).map((a, i) => `${i + 1}. ${a.title}, ${a.due_at ? `due ${relativeDay(String(a.due_at).slice(0, 10), today)}` : 'no due date'}.`);
    const head = `You have ${pending.length} ${pending.length === 1 ? 'assignment' : 'assignments'} to submit:`;
    return { ok: true, reply: `${head}\n${lines.join('\n')}`, data: pending, links };
  },
};
```

`my-catchup.ts`:

```ts
import { getCatchupBacklog } from '@neram/database';
import { formatDay } from '@/lib/assistant/format';
import { computeCatchupPace, describeCatchupPace } from '@/lib/catchup-pace';
import type { ToolDef } from '@/lib/assistant/types';
import { istNow } from '@/lib/upcoming-classes';
import { EMPTY_SCHEMA, needsClassroom } from './shared';

export const myCatchup: ToolDef = {
  name: 'my_catchup',
  description: 'Missed classes the student still has to catch up on, and how they stand against their weekly pace.',
  parameters: EMPTY_SCHEMA,
  audience: 'student',
  kind: 'read',
  async run(ctx) {
    const gate = needsClassroom(ctx);
    if (gate) return gate;
    const { today } = istNow(ctx.now);
    const links = [{ label: 'Catch-up', url: '/student/catch-up' }];
    const backlog = await getCatchupBacklog(ctx.caller.id, ctx.classroomId as string, ctx.supabase);
    const open = (backlog?.items || []).filter((i) => !i.caught_up_at && !i.excused);
    if (!backlog || open.length === 0) return { ok: true, reply: 'You have nothing to catch up on.', data: [], links };
    const named = open.slice(0, 3).map((i) => `${i.class.title || 'a class'} (${formatDay(i.class.scheduled_date)})`).join(', ');
    const more = open.length > 3 ? ` and ${open.length - 3} more` : '';
    let pace = '';
    if (backlog.journey) {
      const quota = backlog.journey.weekly_quota ?? 2;
      pace = ' ' + describeCatchupPace(
        computeCatchupPace({ started_on: backlog.journey.started_on, weekly_quota: quota, total_items: backlog.totals?.total ?? open.length, completed_items: backlog.totals?.completed ?? 0 }, today),
        quota,
      );
    }
    return { ok: true, reply: `${open.length} ${open.length === 1 ? 'class' : 'classes'} to catch up on: ${named}${more}.${pace}`, data: open, links };
  },
};
```

`my-attendance.ts`:

```ts
import { loadOwnAttendance } from '@/lib/student-attendance';
import type { ToolDef } from '@/lib/assistant/types';
import { EMPTY_SCHEMA, needsClassroom, studentScope } from './shared';

export const myAttendance: ToolDef = {
  name: 'my_attendance',
  description: "The student's own attendance, as the attendance page words it.",
  parameters: EMPTY_SCHEMA,
  audience: 'student',
  kind: 'read',
  async run(ctx) {
    const gate = needsClassroom(ctx);
    if (gate) return gate;
    const own = await loadOwnAttendance(ctx.caller.id, await studentScope(ctx));
    return { ok: true, reply: own.sentence, data: own.summary, links: [{ label: 'Attendance', url: '/student/attendance' }] };
  },
};
```

`my-sketchbook.ts`:

```ts
import { loadStudentRhythm } from '@/lib/sketchbook-payload';
import { rhythmLine } from '@/lib/sketchbook-rhythm';
import type { ToolDef } from '@/lib/assistant/types';
import { EMPTY_SCHEMA } from './shared';

export const mySketchbook: ToolDef = {
  name: 'my_sketchbook',
  description: "The student's sketchbook rhythm this week.",
  parameters: EMPTY_SCHEMA,
  audience: 'student',
  kind: 'read',
  async run(ctx) {
    const { rhythm } = await loadStudentRhythm(ctx.caller.id, ctx.now);
    return { ok: true, reply: rhythmLine(rhythm), data: rhythm, links: [{ label: 'Sketchbook', url: '/student/sketchbook' }] };
  },
};
```

`exam-countdown.ts`:

```ts
import { describeExamCountdown } from '@/lib/exam-countdown';
import { resolveExamCountdown } from '@/lib/exam-countdown-server';
import type { ToolDef } from '@/lib/assistant/types';
import { istNow } from '@/lib/upcoming-classes';
import { EMPTY_SCHEMA, needsClassroom } from './shared';

export const examCountdown: ToolDef = {
  name: 'exam_countdown',
  description: 'Days left until the exam the class is preparing for.',
  parameters: EMPTY_SCHEMA,
  audience: 'student',
  kind: 'read',
  async run(ctx) {
    const gate = needsClassroom(ctx);
    if (gate) return gate;
    const { today } = istNow(ctx.now);
    const target = await resolveExamCountdown(ctx.supabase, { classroomId: ctx.classroomId as string, studentId: ctx.caller.id });
    const view = target ? describeExamCountdown(target, today) : null;
    if (!view || !view.visible) return { ok: true, reply: 'No exam date is set for your class yet. Your teacher will add it.', data: null };
    return { ok: true, reply: `${view.short_label}: ${view.headline.replace(/\.?$/, '.')} ${view.detail.replace(/\.?$/, '.')}`.trim(), data: view };
  },
};
```

`index.ts`:

```ts
import { registerTools } from '@/lib/assistant/registry';
import { examCountdown } from './exam-countdown';
import { myAssignments } from './my-assignments';
import { myAttendance } from './my-attendance';
import { myBrief } from './my-brief';
import { myCatchup } from './my-catchup';
import { mySchedule } from './my-schedule';
import { mySketchbook } from './my-sketchbook';

registerTools([myBrief, mySchedule, myAssignments, myCatchup, myAttendance, mySketchbook, examCountdown]);
```

- [ ] **Step 8: Run the tests and type-check**

Run: `pnpm vitest run apps/nexus/src/lib/assistant && pnpm --filter @neram/nexus type-check`
Expected: PASS, clean. If `my_brief`'s expected sentence differs by a space, fix the join in the tool, never the test.

- [ ] **Step 9: Commit**

```bash
git add apps/nexus/src/lib/assistant/router.ts apps/nexus/src/lib/assistant/router.test.ts apps/nexus/src/lib/assistant/tools/student
git commit -m "feat(assistant): intent router and seven deterministic student read tools"
```

---

### Task 13: Action tools and guided flows

**Files:**
- Create: `apps/nexus/src/lib/assistant/tools/actions/index.ts`, `decline-class.ts`, `declare-away-window.ts`, `set-reminder.ts`, `add-sketch.ts`
- Create: `apps/nexus/src/lib/assistant/flows/types.ts`, `cannot-attend.ts`, `remind-me.ts`, `upload-sketch.ts`
- Create: `apps/nexus/src/lib/assistant/registry-all.ts` (imports both tool folders so one import registers everything)
- Test: `apps/nexus/src/lib/assistant/tools/actions/action-tools.test.ts`, `apps/nexus/src/lib/assistant/flows/cannot-attend.test.ts`, `remind-me.test.ts`, `upload-sketch.test.ts`

**Interfaces:**
- Consumes: `writeRsvp` (Task 8), `declareAwayWindow` (Task 9), `addSketchForStudent` (Task 10), `createReminder` (Task 5), `parseDateRange`/`parseSingleDate`/`relativeDay`/`formatTime12`/`formatDay` (Task 3), `RSVP_REASONS` (`lib/rsvp-reasons.ts`), `UpcomingClass` (Task 7).
- Produces: action tools `decline_class`, `declare_away_window`, `set_reminder`, `add_sketch` (each an `ActionToolDef` whose `run` validates and returns `{ ok, data: proposal }` where `proposal = { kind, args, summary, fields }`, and whose `execute` writes); flow modules each exporting `start(input, deps)` and `step(state, input, deps)` returning `FlowOutcome`; `FlowState`, `FlowInput`, `FlowOutcome`, `Proposal`, `FLOW_TTL_MS`.

- [ ] **Step 1: Write flows/types.ts**

```ts
import type { Attachment, Suggestion } from '@/lib/assistant/types';
import type { UpcomingClass } from '@/lib/upcoming-classes';

export const FLOW_TTL_MS = 10 * 60_000;

/** What a tool or flow asks the person to confirm. Becomes a pending action row. */
export interface Proposal {
  kind: string;
  args: Record<string, unknown>;
  summary: string;
  fields: Array<{ label: string; value: string }>;
}

export interface FlowState {
  flow: 'cannot-attend' | 'remind-me' | 'upload-sketch';
  step: string;
  data: Record<string, unknown>;
  startedAt: string;
}

export interface FlowInput {
  text: string;
  attachment?: Attachment | null;
}

export interface FlowDeps {
  today: string;
  /** Upcoming classes within two weeks, already filtered for the student's classroom. */
  upcoming: UpcomingClass[];
  /** Ids among `upcoming` the student has already declined. */
  declined: Set<string>;
}

export interface FlowOutcome {
  /** Null when the flow has ended (proposal made, or nothing to do). */
  state: FlowState | null;
  reply: string;
  suggestions: Suggestion[];
  propose?: Proposal;
  wantsAttachment?: boolean;
}

export const chip = (label: string, send: string = label): Suggestion => ({ label, send });

export function isStale(state: FlowState, now: Date): boolean {
  return now.getTime() - Date.parse(state.startedAt) > FLOW_TTL_MS;
}
```

- [ ] **Step 2: Write the failing action-tools test**

`apps/nexus/src/lib/assistant/tools/actions/action-tools.test.ts`:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ writeRsvp: vi.fn(), declareAwayWindow: vi.fn(), addSketchForStudent: vi.fn(), createReminder: vi.fn() }));
vi.mock('@/lib/rsvp-write', () => ({ writeRsvp: mocks.writeRsvp }));
vi.mock('@/lib/away-windows-write', () => ({ declareAwayWindow: mocks.declareAwayWindow }));
vi.mock('@/lib/sketchbook-add', () => ({ addSketchForStudent: mocks.addSketchForStudent }));
vi.mock('@/lib/assistant/store', () => ({ createReminder: mocks.createReminder }));

import { TOOLS, findActionTool } from '@/lib/assistant/registry';
import '@/lib/assistant/tools/actions';
import type { AssistantCaller, ToolContext } from '@/lib/assistant/types';

const caller: AssistantCaller = { id: 's1', name: 'Priya S', user_type: 'student', staff_role: null, can_teach: null, impersonating: false };
const classRow = { id: 'k1', title: 'Perspective', scheduled_date: '2026-10-07', start_time: '18:00', end_time: '19:30', classroom_id: 'c1' };
const ctx = (): ToolContext => ({
  caller, channel: 'nexus', mode: 'general',
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: classRow }) }) }) }) },
  classroomId: 'c1', threadId: 't1', now: new Date('2026-10-03T04:30:00Z'), baseUrl: 'https://nexus.test',
});

beforeEach(() => Object.values(mocks).forEach((m) => m.mockReset()));

describe('action tools', () => {
  it('are registered as student actions with an execute', () => {
    for (const n of ['decline_class', 'declare_away_window', 'set_reminder', 'add_sketch']) {
      expect(findActionTool(n)).toMatchObject({ audience: 'student', kind: 'action' });
    }
    expect(TOOLS.filter((t) => t.kind === 'action')).toHaveLength(4);
  });

  it('decline_class proposes with the class named, then writes through writeRsvp', async () => {
    const tool = findActionTool('decline_class')!;
    const proposed = await tool.run(ctx(), { class_id: 'k1', reason_code: 'unwell' });
    expect(proposed.ok).toBe(true);
    expect(proposed.data).toMatchObject({
      kind: 'decline_class',
      args: { class_id: 'k1', reason_code: 'unwell', note: null },
      summary: 'Tell your teacher you cannot attend Perspective on Wednesday 7 Oct at 6:00 pm.',
      fields: [{ label: 'Class', value: 'Perspective' }, { label: 'When', value: 'Wednesday 7 Oct, 6:00 pm' }, { label: 'Reason', value: 'Feeling unwell' }],
    });
    expect(await tool.run(ctx(), { class_id: 'k1', reason_code: 'other' })).toMatchObject({ ok: false });
    mocks.writeRsvp.mockResolvedValue({ ok: true, attending: false, rsvp: {}, classTitle: 'Perspective', classroomId: 'c1' });
    const done = await tool.execute(ctx(), { class_id: 'k1', reason_code: 'unwell', note: null });
    expect(mocks.writeRsvp).toHaveBeenCalledWith(expect.anything(), { userId: 's1', classId: 'k1', response: 'not_attending', reasonCode: 'unwell', note: null, wantsCatchup: true });
    expect(done.reply).toBe('Done. Your teacher knows you cannot attend Perspective. The catch-up for it will appear on your list after the class.');
    mocks.writeRsvp.mockResolvedValue({ ok: false, status: 404, error: 'Class not found in this classroom' });
    expect(await tool.execute(ctx(), { class_id: 'k1', reason_code: 'unwell', note: null })).toMatchObject({ ok: false, error: 'Class not found in this classroom' });
  });

  it('declare_away_window proposes a range and writes through declareAwayWindow', async () => {
    const tool = findActionTool('declare_away_window')!;
    const proposed = await tool.run(ctx(), { starts_on: '2026-10-05', ends_on: '2026-10-09', reason_code: 'clash', note: 'School exams' });
    expect(proposed.data).toMatchObject({
      kind: 'declare_away_window',
      summary: 'Mark you away from Monday 5 Oct to Friday 9 Oct. Reason: School or exam clash.',
      fields: [{ label: 'From', value: 'Monday 5 Oct' }, { label: 'To', value: 'Friday 9 Oct' }, { label: 'Reason', value: 'School or exam clash' }, { label: 'Note', value: 'School exams' }],
    });
    expect(await tool.run(ctx(), { starts_on: '2026-10-05', ends_on: '2026-10-01', reason_code: 'clash' })).toMatchObject({ ok: false });
    mocks.declareAwayWindow.mockResolvedValue({ ok: true, window: { id: 'w1' }, summary: 'Away from 5 Oct to 9 Oct', classroomId: 'c1' });
    const done = await tool.execute(ctx(), { starts_on: '2026-10-05', ends_on: '2026-10-09', reason_code: 'clash', note: 'School exams' });
    expect(mocks.declareAwayWindow).toHaveBeenCalledWith(expect.anything(), { userId: 's1', startsOn: '2026-10-05', endsOn: '2026-10-09', reasonCode: 'clash', note: 'School exams' });
    expect(done.reply).toBe('Done. Away from 5 Oct to 9 Oct. Your teachers know, and those classes will show as away on the register. The catch-up work still waits for you when you are back.');
    mocks.declareAwayWindow.mockResolvedValue({ ok: false, status: 409, error: 'You have already told us you are away then' });
    expect(await tool.execute(ctx(), { starts_on: '2026-10-05', ends_on: null, reason_code: 'unwell' })).toMatchObject({ ok: false, error: expect.stringMatching(/already told us/) });
  });

  it('set_reminder proposes and stores', async () => {
    const tool = findActionTool('set_reminder')!;
    const proposed = await tool.run(ctx(), { due_on: '2026-10-04', text: 'finish the catch-up' });
    expect(proposed.data).toMatchObject({ kind: 'set_reminder', summary: 'Remind you tomorrow: finish the catch-up.', fields: [{ label: 'When', value: 'tomorrow' }, { label: 'About', value: 'finish the catch-up' }] });
    expect(await tool.run(ctx(), { due_on: '2026-10-01', text: 'x' })).toMatchObject({ ok: false, error: expect.stringMatching(/already passed/) });
    expect(await tool.run(ctx(), { due_on: '2026-10-04', text: '' })).toMatchObject({ ok: false });
    mocks.createReminder.mockResolvedValue({ id: 'r1' });
    const done = await tool.execute(ctx(), { due_on: '2026-10-04', text: 'finish the catch-up' });
    expect(mocks.createReminder).toHaveBeenCalledWith(expect.anything(), { userId: 's1', threadId: 't1', dueOn: '2026-10-04', text: 'finish the catch-up', kind: 'free' });
    expect(done.reply).toBe('Done. I will remind you tomorrow: finish the catch-up. It will also be in your brief that morning.');
  });

  it('add_sketch proposes with the caption and files the sketch', async () => {
    const tool = findActionTool('add_sketch')!;
    const args = { original_image_url: 'https://cdn.test/a.jpg', thumbnail_url: 'https://cdn.test/t.jpg', caption: 'Perspective study' };
    expect((await tool.run(ctx(), args)).data).toMatchObject({ kind: 'add_sketch', summary: 'Add this sketch to your sketchbook.', fields: [{ label: 'Caption', value: 'Perspective study' }] });
    expect(await tool.run(ctx(), { ...args, original_image_url: 'nope' })).toMatchObject({ ok: false });
    mocks.addSketchForStudent.mockResolvedValue({ sketch: { id: 'sub1' }, rhythm: { today: '2026-10-03', week: { start: '', days: [], count: 2, goal: 3, met: false }, lastWeek: null, run: 0, bestRun: 0, totalDays: 5, lastPracticeDate: null, quietDays: 0 }, isNewDay: true });
    const done = await tool.execute(ctx(), args);
    expect(mocks.addSketchForStudent).toHaveBeenCalledWith({ id: 's1', user_type: 'student' }, args);
    expect(done.reply).toBe('Added to your sketchbook. 2 of 3 days this week.');
    expect(done.links?.[0].url).toBe('/student/sketchbook');
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `pnpm vitest run apps/nexus/src/lib/assistant/tools/actions/action-tools.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 4: Implement the action tools**

`decline-class.ts`:

```ts
import type { ActionToolDef } from '@/lib/assistant/types';
import { formatTime12, relativeDay, todayIst } from '@/lib/assistant/format';
import { RSVP_REASONS, isRsvpReasonCode, reasonRequiresNote } from '@/lib/rsvp-reasons';
import { writeRsvp } from '@/lib/rsvp-write';

export interface DeclineClassArgs { class_id: string; reason_code: string; note?: string | null }

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const reasonLabel = (code: string) => RSVP_REASONS.find((r) => r.code === code)?.label || code;

export const declineClass: ActionToolDef<DeclineClassArgs> = {
  name: 'decline_class',
  description: 'Tell the teacher the student cannot attend one scheduled class, with a reason.',
  parameters: {
    type: 'object',
    properties: {
      class_id: { type: 'string' },
      reason_code: { type: 'string', enum: RSVP_REASONS.map((r) => r.code) },
      note: { type: 'string' },
    },
    required: ['class_id', 'reason_code'],
  },
  audience: 'student',
  kind: 'action',
  async run(ctx, args) {
    if (!isRsvpReasonCode(args.reason_code)) return { ok: false, error: 'Pick a reason so your teacher knows why you cannot make it.' };
    const note = typeof args.note === 'string' && args.note.trim() ? args.note.trim() : null;
    if (reasonRequiresNote(args.reason_code) && !note) return { ok: false, error: 'Tell us a little more so your teacher knows what came up.' };
    const { data: cls } = await ctx.supabase
      .from('nexus_scheduled_classes')
      .select('id, title, scheduled_date, start_time, end_time, classroom_id')
      .eq('id', args.class_id)
      .maybeSingle();
    if (!cls) return { ok: false, error: 'I could not find that class.' };
    const when = `${cap(relativeDay(cls.scheduled_date, todayIst(ctx.now)))}, ${formatTime12(cls.start_time)}`;
    return {
      ok: true,
      data: {
        kind: 'decline_class',
        args: { class_id: cls.id, reason_code: args.reason_code, note },
        summary: `Tell your teacher you cannot attend ${cls.title} on ${cap(relativeDay(cls.scheduled_date, todayIst(ctx.now)))} at ${formatTime12(cls.start_time)}.`,
        fields: [
          { label: 'Class', value: cls.title },
          { label: 'When', value: when },
          { label: 'Reason', value: note && args.reason_code === 'other' ? note : reasonLabel(args.reason_code) },
        ],
      },
    };
  },
  async execute(ctx, args) {
    const result = await writeRsvp(ctx.supabase, {
      userId: ctx.caller.id, classId: args.class_id, response: 'not_attending', reasonCode: args.reason_code, note: args.note ?? null, wantsCatchup: true,
    });
    if (!result.ok) return { ok: false, error: result.error };
    return {
      ok: true,
      reply: `Done. Your teacher knows you cannot attend ${result.classTitle || 'the class'}. The catch-up for it will appear on your list after the class.`,
      links: [{ label: 'Timetable', url: '/student/timetable' }],
    };
  },
};
```

`declare-away-window.ts`:

```ts
import type { ActionToolDef } from '@/lib/assistant/types';
import { daysBetweenYmd, relativeDay, todayIst } from '@/lib/assistant/format';
import { MAX_WINDOW_DAYS, declareAwayWindow } from '@/lib/away-windows-write';
import { RSVP_REASONS, isRsvpReasonCode, reasonRequiresNote } from '@/lib/rsvp-reasons';
import { reasonLabel } from './decline-class';

export interface AwayArgs { starts_on: string; ends_on?: string | null; reason_code: string; note?: string | null }

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const isYmd = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

export const declareAway: ActionToolDef<AwayArgs> = {
  name: 'declare_away_window',
  description: 'Mark the student away for a stretch of days, with a reason. Their classes in that period show as away.',
  parameters: {
    type: 'object',
    properties: {
      starts_on: { type: 'string', description: 'YYYY-MM-DD' },
      ends_on: { type: 'string', description: 'YYYY-MM-DD, inclusive; omit for open ended' },
      reason_code: { type: 'string', enum: RSVP_REASONS.map((r) => r.code) },
      note: { type: 'string' },
    },
    required: ['starts_on', 'reason_code'],
  },
  audience: 'student',
  kind: 'action',
  async run(ctx, args) {
    const today = todayIst(ctx.now);
    if (!isYmd(args.starts_on)) return { ok: false, error: 'I need a start date.' };
    const endsOn = isYmd(args.ends_on) ? args.ends_on : null;
    if (!isRsvpReasonCode(args.reason_code)) return { ok: false, error: 'Pick a reason.' };
    const note = typeof args.note === 'string' && args.note.trim() ? args.note.trim() : null;
    if (reasonRequiresNote(args.reason_code) && !note) return { ok: false, error: 'Add a short note so your teacher knows.' };
    if (args.starts_on < today) return { ok: false, error: 'Away dates can only start from today.' };
    if (endsOn && endsOn < args.starts_on) return { ok: false, error: 'The return date is before the start date.' };
    if (endsOn && daysBetweenYmd(args.starts_on, endsOn) > MAX_WINDOW_DAYS) return { ok: false, error: `Away dates cannot cover more than ${MAX_WINDOW_DAYS} days at once.` };
    const from = cap(relativeDay(args.starts_on, today));
    const to = endsOn ? cap(relativeDay(endsOn, today)) : 'until you tell me you are back';
    const fields = [
      { label: 'From', value: from },
      { label: 'To', value: endsOn ? to : 'Open ended' },
      { label: 'Reason', value: reasonLabel(args.reason_code) },
    ];
    if (note) fields.push({ label: 'Note', value: note });
    return {
      ok: true,
      data: {
        kind: 'declare_away_window',
        args: { starts_on: args.starts_on, ends_on: endsOn, reason_code: args.reason_code, note },
        summary: `Mark you away from ${from} ${endsOn ? `to ${to}` : to}. Reason: ${reasonLabel(args.reason_code)}.`,
        fields,
      },
    };
  },
  async execute(ctx, args) {
    const result = await declareAwayWindow(ctx.supabase, {
      userId: ctx.caller.id, startsOn: args.starts_on, endsOn: args.ends_on ?? null, reasonCode: args.reason_code, note: args.note ?? null,
    });
    if (!result.ok) return { ok: false, error: result.error };
    return {
      ok: true,
      reply: `Done. ${result.summary}. Your teachers know, and those classes will show as away on the register. The catch-up work still waits for you when you are back.`,
      links: [{ label: 'Timetable', url: '/student/timetable' }],
    };
  },
};
```

`set-reminder.ts`:

```ts
import type { ActionToolDef } from '@/lib/assistant/types';
import { daysBetweenYmd, relativeDay, todayIst } from '@/lib/assistant/format';
import { createReminder } from '@/lib/assistant/store';

export interface ReminderArgs { due_on: string; text: string }

export const MAX_REMINDER_DAYS = 120;

export const setReminder: ActionToolDef<ReminderArgs> = {
  name: 'set_reminder',
  description: 'Remind the student about something on a given day. Delivered in their morning brief and as a message.',
  parameters: {
    type: 'object',
    properties: { due_on: { type: 'string', description: 'YYYY-MM-DD' }, text: { type: 'string' } },
    required: ['due_on', 'text'],
  },
  audience: 'student',
  kind: 'action',
  async run(ctx, args) {
    const today = todayIst(ctx.now);
    const text = typeof args.text === 'string' ? args.text.trim().slice(0, 200) : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(args.due_on))) return { ok: false, error: 'Which day should I remind you?' };
    if (!text) return { ok: false, error: 'What should I remind you about?' };
    if (args.due_on < today) return { ok: false, error: 'That day has already passed. Which day should I remind you?' };
    if (daysBetweenYmd(today, args.due_on) > MAX_REMINDER_DAYS) return { ok: false, error: 'I can only set reminders up to four months ahead.' };
    const when = relativeDay(args.due_on, today);
    return {
      ok: true,
      data: { kind: 'set_reminder', args: { due_on: args.due_on, text }, summary: `Remind you ${when}: ${text}.`, fields: [{ label: 'When', value: when }, { label: 'About', value: text }] },
    };
  },
  async execute(ctx, args) {
    await createReminder(ctx.supabase, { userId: ctx.caller.id, threadId: ctx.threadId, dueOn: args.due_on, text: args.text, kind: 'free' });
    const when = relativeDay(args.due_on, todayIst(ctx.now));
    return { ok: true, reply: `Done. I will remind you ${when}: ${args.text}. It will also be in your brief that morning.`, links: [] };
  },
};
```

`add-sketch.ts`:

```ts
import type { ActionToolDef } from '@/lib/assistant/types';
import { CAPTION_MAX, addSketchForStudent } from '@/lib/sketchbook-add';
import { rhythmLine } from '@/lib/sketchbook-rhythm';

export interface AddSketchArgs { original_image_url: string; thumbnail_url?: string | null; caption?: string | null }

export const addSketch: ActionToolDef<AddSketchArgs> = {
  name: 'add_sketch',
  description: "Add an already uploaded photo to the student's sketchbook, with an optional caption.",
  parameters: {
    type: 'object',
    properties: { original_image_url: { type: 'string' }, thumbnail_url: { type: 'string' }, caption: { type: 'string' } },
    required: ['original_image_url'],
  },
  audience: 'student',
  kind: 'action',
  async run(_ctx, args) {
    if (!/^https:\/\//.test(String(args.original_image_url || ''))) return { ok: false, error: 'I need the photo first. Tap the camera button to attach it.' };
    const caption = typeof args.caption === 'string' ? args.caption.trim().slice(0, CAPTION_MAX) : '';
    return {
      ok: true,
      data: {
        kind: 'add_sketch',
        args: { original_image_url: args.original_image_url, thumbnail_url: args.thumbnail_url ?? null, caption },
        summary: 'Add this sketch to your sketchbook.',
        fields: [{ label: 'Caption', value: caption || 'None' }],
      },
    };
  },
  async execute(ctx, args) {
    const result = await addSketchForStudent({ id: ctx.caller.id, user_type: ctx.caller.user_type }, args);
    return { ok: true, reply: `Added to your sketchbook. ${rhythmLine(result.rhythm)}`, links: [{ label: 'Sketchbook', url: '/student/sketchbook' }] };
  },
};
```

`index.ts`:

```ts
import { registerTools } from '@/lib/assistant/registry';
import { addSketch } from './add-sketch';
import { declareAway } from './declare-away-window';
import { declineClass } from './decline-class';
import { setReminder } from './set-reminder';

registerTools([declineClass, declareAway, setReminder, addSketch] as never[]);
```

`apps/nexus/src/lib/assistant/registry-all.ts`:

```ts
/** Import this, not registry.ts, wherever the full tool list is needed at runtime. */
import '@/lib/assistant/tools/student';
import '@/lib/assistant/tools/actions';
export * from './registry';
```

- [ ] **Step 5: Run the action-tools test**

Run: `pnpm vitest run apps/nexus/src/lib/assistant/tools/actions/action-tools.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the failing flow tests**

`apps/nexus/src/lib/assistant/flows/cannot-attend.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { FlowDeps } from './types';
import { start, step } from './cannot-attend';

const today = '2026-10-03';
const deps: FlowDeps = {
  today,
  upcoming: [
    { id: 'k1', title: 'Perspective', classroom_id: 'c1', scheduled_date: '2026-10-04', start_time: '18:00', end_time: '19:30', status: 'scheduled', teams_meeting_url: null },
    { id: 'k2', title: 'Shading', classroom_id: 'c1', scheduled_date: '2026-10-07', start_time: '18:00', end_time: '19:30', status: 'scheduled', teams_meeting_url: null },
  ],
  declined: new Set(),
};

describe('cannot-attend flow', () => {
  it('asks which class, offering the upcoming ones and several days', () => {
    const out = start({ text: "I can't attend" }, deps);
    expect(out.state?.step).toBe('pick-class');
    expect(out.reply).toBe('Which class can you not attend?');
    expect(out.suggestions.map((s) => s.label)).toEqual(['Tomorrow 6:00 pm: Perspective', 'Wednesday 7 Oct 6:00 pm: Shading', 'Several days']);
  });

  it('jumps to the reason when the first message names the day', () => {
    const out = start({ text: "I can't attend tomorrow's class" }, deps);
    expect(out.state).toMatchObject({ step: 'pick-reason', data: { classId: 'k1' } });
    expect(out.reply).toBe('Perspective, tomorrow at 6:00 pm. Why can you not make it?');
    expect(out.suggestions.map((s) => s.label)).toEqual(['Feeling unwell', 'Family commitment', 'School or exam clash', 'Other reason']);
  });

  it('offers the away path when nothing is scheduled', () => {
    const out = start({ text: "I can't come" }, { ...deps, upcoming: [] });
    expect(out.state?.step).toBe('pick-range');
    expect(out.reply).toMatch(/no class in the next two weeks/);
  });

  it('picks a class by chip text, then a reason, then proposes decline_class', () => {
    let out = start({ text: "I can't attend" }, deps);
    out = step(out.state!, { text: 'Wednesday 7 Oct 6:00 pm: Shading' }, deps);
    expect(out.state).toMatchObject({ step: 'pick-reason', data: { classId: 'k2' } });
    out = step(out.state!, { text: 'Family commitment' }, deps);
    expect(out.state).toBeNull();
    expect(out.propose).toEqual({ kind: 'decline_class', args: { class_id: 'k2', reason_code: 'family', note: null }, summary: expect.any(String), fields: expect.any(Array) });
  });

  it('asks for a note on Other and keeps asking until it gets one', () => {
    let out = start({ text: "I can't attend tomorrow" }, deps);
    out = step(out.state!, { text: 'Other reason' }, deps);
    expect(out.state?.step).toBe('note');
    out = step(out.state!, { text: 'ok' }, deps);
    expect(out.state?.step).toBe('note');
    out = step(out.state!, { text: 'Cousin\'s wedding in Madurai' }, deps);
    expect(out.propose?.args).toMatchObject({ reason_code: 'other', note: "Cousin's wedding in Madurai" });
  });

  it('several days: parses a range, then a reason, then proposes declare_away_window', () => {
    let out = start({ text: "I can't attend" }, deps);
    out = step(out.state!, { text: 'Several days' }, deps);
    expect(out.state?.step).toBe('pick-range');
    out = step(out.state!, { text: 'whenever' }, deps);
    expect(out.state?.step).toBe('pick-range');
    expect(out.reply).toMatch(/did not catch the dates/);
    out = step(out.state!, { text: '8 Oct to 12 Oct' }, deps);
    expect(out.state).toMatchObject({ step: 'pick-reason', data: { range: { from: '2026-10-08', to: '2026-10-12' } } });
    out = step(out.state!, { text: 'School or exam clash' }, deps);
    expect(out.propose).toMatchObject({ kind: 'declare_away_window', args: { starts_on: '2026-10-08', ends_on: '2026-10-12', reason_code: 'clash', note: null } });
  });

  it('refuses a range longer than 120 days and a range in the past', () => {
    let out = start({ text: 'mark me away' }, deps);
    out = step(out.state!, { text: 'Several days' }, deps);
    expect(step(out.state!, { text: 'today to 2027-05-01' }, deps).reply).toMatch(/120 days/);
    expect(step(out.state!, { text: '1 Sep 2026 to 2 Sep 2026' }, deps).reply).toMatch(/already passed/);
  });

  it('an unrecognised class answer re-asks instead of guessing', () => {
    let out = start({ text: "I can't attend" }, deps);
    out = step(out.state!, { text: 'the blue one' }, deps);
    expect(out.state?.step).toBe('pick-class');
    expect(out.reply).toMatch(/Tap one of the classes/);
  });
});
```

`apps/nexus/src/lib/assistant/flows/remind-me.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { start, step } from './remind-me';

const today = '2026-10-03';
const deps = { today, upcoming: [], declined: new Set<string>() };

describe('remind-me flow', () => {
  it('proposes straight away when the message has both the day and the task', () => {
    const out = start({ text: 'remind me tomorrow to finish the catch-up' }, deps);
    expect(out.state).toBeNull();
    expect(out.propose).toMatchObject({ kind: 'set_reminder', args: { due_on: '2026-10-04', text: 'finish the catch-up' } });
    const alt = start({ text: 'Remind me to bring the sketchbook on friday' }, deps);
    expect(alt.propose?.args).toEqual({ due_on: '2026-10-09', text: 'bring the sketchbook' });
  });

  it('asks for the day when only the task is given', () => {
    const out = start({ text: 'remind me to finish the catch-up' }, deps);
    expect(out.state).toMatchObject({ step: 'when', data: { text: 'finish the catch-up' } });
    expect(out.suggestions.map((s) => s.label)).toEqual(['Tomorrow', 'Day after tomorrow', 'Next Monday']);
    const next = step(out.state!, { text: 'Day after tomorrow' }, deps);
    expect(next.propose?.args).toEqual({ due_on: '2026-10-05', text: 'finish the catch-up' });
  });

  it('asks for the task when only the day is given, and re-asks on an unreadable day', () => {
    let out = start({ text: 'remind me on friday' }, deps);
    expect(out.state).toMatchObject({ step: 'what', data: { due_on: '2026-10-09' } });
    out = step(out.state!, { text: 'submit the shading sheet' }, deps);
    expect(out.propose?.args).toEqual({ due_on: '2026-10-09', text: 'submit the shading sheet' });

    let bare = start({ text: 'remind me' }, deps);
    expect(bare.state?.step).toBe('when');
    bare = step(bare.state!, { text: 'sometime' }, deps);
    expect(bare.state?.step).toBe('when');
    expect(bare.reply).toMatch(/did not catch the day/);
  });

  it('refuses a day in the past', () => {
    const out = start({ text: 'remind me yesterday to breathe' }, deps);
    expect(out.state?.step).toBe('when');
    expect(out.reply).toMatch(/already passed/);
  });
});
```

`apps/nexus/src/lib/assistant/flows/upload-sketch.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { start, step } from './upload-sketch';

const deps = { today: '2026-10-03', upcoming: [], declined: new Set<string>() };
const photo = { original_image_url: 'https://cdn.test/a.jpg', thumbnail_url: 'https://cdn.test/t.jpg' };

describe('upload-sketch flow', () => {
  it('asks for the photo and flags that an attachment is wanted', () => {
    const out = start({ text: 'add a sketch' }, deps);
    expect(out.state?.step).toBe('attach');
    expect(out.wantsAttachment).toBe(true);
    const nag = step(out.state!, { text: 'here' }, deps);
    expect(nag.state?.step).toBe('attach');
    expect(nag.reply).toMatch(/still need the photo/);
  });

  it('moves to the caption once a photo arrives, then proposes add_sketch', () => {
    let out = start({ text: 'add a sketch', attachment: photo }, deps);
    expect(out.state).toMatchObject({ step: 'caption', data: photo });
    expect(out.suggestions.map((s) => s.label)).toEqual(['No caption']);
    out = step(out.state!, { text: 'Two point perspective practice' }, deps);
    expect(out.state).toBeNull();
    expect(out.propose).toMatchObject({ kind: 'add_sketch', args: { ...photo, caption: 'Two point perspective practice' } });
  });

  it('No caption proposes with an empty caption', () => {
    let out = start({ text: 'upload my drawing' }, deps);
    out = step(out.state!, { text: '', attachment: photo }, deps);
    out = step(out.state!, { text: 'No caption' }, deps);
    expect(out.propose?.args).toEqual({ ...photo, caption: '' });
  });
});
```

- [ ] **Step 7: Run them to see them fail**

Run: `pnpm vitest run apps/nexus/src/lib/assistant/flows`
Expected: FAIL, modules not found.

- [ ] **Step 8: Implement the flows**

`cannot-attend.ts`:

```ts
/**
 * "I can't attend." Which class (or several days), why, then a proposal the
 * person confirms. Pure: the turn loads the deps and stores the state.
 */
import { parseDateRange, parseSingleDate } from '@/lib/assistant/dates';
import { daysBetweenYmd, formatTime12, relativeDay } from '@/lib/assistant/format';
import { MAX_WINDOW_DAYS } from '@/lib/away-windows-write';
import { RSVP_REASONS } from '@/lib/rsvp-reasons';
import type { UpcomingClass } from '@/lib/upcoming-classes';
import { chip, type FlowDeps, type FlowInput, type FlowOutcome, type FlowState } from './types';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const SEVERAL = 'Several days';
const REASON_CHIPS = RSVP_REASONS.map((r) => chip(r.label));

function classLabel(c: UpcomingClass, today: string): string {
  return `${cap(relativeDay(c.scheduled_date, today))} ${formatTime12(c.start_time)}: ${c.title}`;
}

function state(step: string, data: Record<string, unknown>, prev?: FlowState): FlowState {
  return { flow: 'cannot-attend', step, data, startedAt: prev?.startedAt ?? new Date().toISOString() };
}

/** Match a typed answer to one upcoming class: chip text, title, or a day word. */
function matchClass(text: string, deps: FlowDeps): UpcomingClass | 'several' | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  if (/\b(several|few|many|some)\s+days\b|\bweek\b|\btill\b|\buntil\b|\baway\b/.test(t) || t === SEVERAL.toLowerCase()) return 'several';
  const byLabel = deps.upcoming.find((c) => classLabel(c, deps.today).toLowerCase() === t);
  if (byLabel) return byLabel;
  const byTitle = deps.upcoming.filter((c) => c.title && t.includes(c.title.toLowerCase()));
  if (byTitle.length === 1) return byTitle[0];
  const dayWord = /\b(today|tomorrow|day after( tomorrow)?|mon(day)?|tue(s|sday)?|wed(nesday)?|thu(rs|rsday)?|fri(day)?|sat(urday)?|sun(day)?|\d{1,2}(st|nd|rd|th)?\s+[a-z]{3,9})\b/.exec(t);
  if (dayWord) {
    const day = parseSingleDate(dayWord[0].replace(/'s$/, ''), deps.today);
    const onDay = day ? deps.upcoming.filter((c) => c.scheduled_date === day) : [];
    if (onDay.length === 1) return onDay[0];
  }
  return null;
}

function askClass(deps: FlowDeps, prev?: FlowState, prefix = ''): FlowOutcome {
  if (deps.upcoming.length === 0) {
    return {
      state: state('pick-range', {}, prev),
      reply: 'There is no class in the next two weeks to decline. If you will be away for a while, tell me the dates, for example "from Monday for 5 days" or "8 Oct to 12 Oct".',
      suggestions: [chip('Next week'), chip('For 3 days')],
    };
  }
  return {
    state: state('pick-class', {}, prev),
    reply: `${prefix}Which class can you not attend?`,
    suggestions: [...deps.upcoming.slice(0, 4).map((c) => chip(classLabel(c, deps.today))), chip(SEVERAL)],
  };
}

function askReason(data: Record<string, unknown>, deps: FlowDeps, prev?: FlowState): FlowOutcome {
  let lead: string;
  if (data.classId) {
    const c = deps.upcoming.find((x) => x.id === data.classId);
    lead = c ? `${c.title}, ${relativeDay(c.scheduled_date, deps.today)} at ${formatTime12(c.start_time)}. ` : '';
  } else {
    const r = data.range as { from: string; to: string };
    lead = `Away from ${relativeDay(r.from, deps.today)} to ${relativeDay(r.to, deps.today)}. `;
  }
  return { state: state('pick-reason', data, prev), reply: `${lead}Why can you not make it?`, suggestions: REASON_CHIPS };
}

function propose(data: Record<string, unknown>, deps: FlowDeps, reasonCode: string, note: string | null): FlowOutcome {
  const reason = RSVP_REASONS.find((r) => r.code === reasonCode)!;
  if (data.classId) {
    const c = deps.upcoming.find((x) => x.id === data.classId)!;
    const when = `${cap(relativeDay(c.scheduled_date, deps.today))}, ${formatTime12(c.start_time)}`;
    return {
      state: null,
      reply: 'Here is what I will tell your teacher. Confirm and it is done.',
      suggestions: [],
      propose: {
        kind: 'decline_class',
        args: { class_id: c.id, reason_code: reasonCode, note },
        summary: `Tell your teacher you cannot attend ${c.title} on ${cap(relativeDay(c.scheduled_date, deps.today))} at ${formatTime12(c.start_time)}.`,
        fields: [{ label: 'Class', value: c.title }, { label: 'When', value: when }, { label: 'Reason', value: note && reasonCode === 'other' ? note : reason.label }],
      },
    };
  }
  const r = data.range as { from: string; to: string };
  const fields = [
    { label: 'From', value: cap(relativeDay(r.from, deps.today)) },
    { label: 'To', value: cap(relativeDay(r.to, deps.today)) },
    { label: 'Reason', value: reason.label },
  ];
  if (note) fields.push({ label: 'Note', value: note });
  return {
    state: null,
    reply: 'Here is what I will record. Confirm and your teachers are told.',
    suggestions: [],
    propose: {
      kind: 'declare_away_window',
      args: { starts_on: r.from, ends_on: r.to, reason_code: reasonCode, note },
      summary: `Mark you away from ${cap(relativeDay(r.from, deps.today))} to ${cap(relativeDay(r.to, deps.today))}. Reason: ${reason.label}.`,
      fields,
    },
  };
}

export function start(input: FlowInput, deps: FlowDeps): FlowOutcome {
  const match = matchClass(input.text, deps);
  if (match && match !== 'several') return askReason({ classId: match.id }, deps);
  if (match === 'several') {
    const range = parseDateRange(input.text.replace(/^.*?\b(away|attend|come|join|miss)\b/i, '').trim(), deps.today);
    if (range) return rangeAccepted(range, deps);
    return { state: state('pick-range', {}), reply: 'Which dates will you be away? For example "8 Oct to 12 Oct" or "from tomorrow for 3 days".', suggestions: [chip('Next week'), chip('For 3 days')] };
  }
  return askClass(deps);
}

function rangeAccepted(range: { from: string; to: string }, deps: FlowDeps, prev?: FlowState): FlowOutcome {
  if (range.from < deps.today) {
    return { state: state('pick-range', {}, prev), reply: 'Those dates have already passed. Away dates can only start from today. Which dates?', suggestions: [chip('Next week'), chip('For 3 days')] };
  }
  if (daysBetweenYmd(range.from, range.to) > MAX_WINDOW_DAYS) {
    return { state: state('pick-range', {}, prev), reply: `That is more than ${MAX_WINDOW_DAYS} days. Give me a shorter range, and tell me again when you know more.`, suggestions: [] };
  }
  return askReason({ range }, deps, prev);
}

export function step(prev: FlowState, input: FlowInput, deps: FlowDeps): FlowOutcome {
  const text = input.text.trim();
  switch (prev.step) {
    case 'pick-class': {
      const match = matchClass(text, deps);
      if (match === 'several') {
        return { state: state('pick-range', {}, prev), reply: 'Which dates will you be away? For example "8 Oct to 12 Oct" or "from tomorrow for 3 days".', suggestions: [chip('Next week'), chip('For 3 days')] };
      }
      if (match) return askReason({ classId: match.id }, deps, prev);
      return askClass(deps, prev, 'I did not catch that. Tap one of the classes, or say "several days". ');
    }
    case 'pick-range': {
      const range = parseDateRange(text, deps.today);
      if (!range) return { state: state('pick-range', {}, prev), reply: 'I did not catch the dates. Try "8 Oct to 12 Oct" or "from tomorrow for 3 days".', suggestions: [chip('Next week'), chip('For 3 days')] };
      return rangeAccepted(range, deps, prev);
    }
    case 'pick-reason': {
      const t = text.toLowerCase();
      const reason = RSVP_REASONS.find((r) => r.label.toLowerCase() === t || r.shortLabel.toLowerCase() === t || r.code === t)
        || RSVP_REASONS.find((r) => t.includes(r.shortLabel.toLowerCase()) || t.includes(r.code));
      if (!reason) return { state: prev, reply: 'Pick one of the reasons so your teacher knows.', suggestions: REASON_CHIPS };
      if (reason.requiresNote) return { state: state('note', { ...prev.data, reasonCode: reason.code }, prev), reply: 'Tell me a little more so your teacher knows what came up.', suggestions: [] };
      return propose(prev.data, deps, reason.code, null);
    }
    case 'note': {
      if (text.length < 3) return { state: prev, reply: 'A few words is enough, for example "hospital visit".', suggestions: [] };
      return propose(prev.data, deps, String(prev.data.reasonCode), text.slice(0, 200));
    }
    default:
      return askClass(deps);
  }
}
```

`remind-me.ts`:

```ts
/** "Remind me on Friday to finish the catch-up." Pure. */
import { parseSingleDate } from '@/lib/assistant/dates';
import { addDaysYmd, dayOfWeek, relativeDay } from '@/lib/assistant/format';
import { chip, type FlowDeps, type FlowInput, type FlowOutcome, type FlowState } from './types';

function state(step: string, data: Record<string, unknown>, prev?: FlowState): FlowState {
  return { flow: 'remind-me', step, data, startedAt: prev?.startedAt ?? new Date().toISOString() };
}

function whenChips(today: string) {
  const toMonday = ((1 - dayOfWeek(today) + 7) % 7) || 7;
  return [chip('Tomorrow'), chip('Day after tomorrow'), chip('Next Monday', addDaysYmd(today, toMonday))];
}

/** Split "remind me ..." into a day and a task, either order. */
function parse(text: string, today: string): { due_on: string | null; task: string | null; pastDay: boolean } {
  let rest = text.replace(/^\s*remind me\b/i, '').trim().replace(/^(please|that|about)\s+/i, '');
  let task: string | null = null;
  let due: string | null = null;
  let pastDay = false;

  const tryDay = (s: string) => {
    const d = parseSingleDate(s.replace(/^(on|at|by|this|next)\s+/i, (m) => (/^next$/i.test(m.trim()) ? 'next ' : '')), today);
    return d;
  };

  const toIdx = rest.search(/\bto\b/i);
  if (toIdx >= 0) {
    const before = rest.slice(0, toIdx).trim();
    const after = rest.slice(toIdx + 2).trim();
    // "tomorrow to finish X" or "to finish X on friday"
    const dBefore = before ? tryDay(before) : null;
    if (dBefore) { due = dBefore; task = after; }
    else {
      const words = after.split(/\s+/);
      for (let n = Math.min(4, words.length); n >= 1 && !due; n--) {
        const tail = words.slice(-n).join(' ');
        const d = tryDay(tail);
        if (d) { due = d; task = words.slice(0, -n).join(' ').replace(/\s+(on|at|by)$/i, ''); }
      }
      if (!due) task = after;
      if (!before && !due) task = after;
    }
  } else if (rest) {
    const d = tryDay(rest);
    if (d) due = d; else task = rest;
  }
  if (due && due < today) { pastDay = true; due = null; }
  task = task ? task.trim().replace(/[.!]+$/, '').slice(0, 200) : null;
  return { due_on: due, task: task || null, pastDay };
}

function proposal(due_on: string, task: string, today: string): FlowOutcome {
  const when = relativeDay(due_on, today);
  return {
    state: null,
    reply: 'Here is the reminder. Confirm and I will keep it.',
    suggestions: [],
    propose: { kind: 'set_reminder', args: { due_on, text: task }, summary: `Remind you ${when}: ${task}.`, fields: [{ label: 'When', value: when }, { label: 'About', value: task }] },
  };
}

export function start(input: FlowInput, deps: FlowDeps): FlowOutcome {
  const { due_on, task, pastDay } = parse(input.text, deps.today);
  if (due_on && task) return proposal(due_on, task, deps.today);
  if (!due_on) {
    const reply = pastDay ? 'That day has already passed. Which day should I remind you?' : 'Which day should I remind you?';
    return { state: state('when', { text: task }, undefined), reply, suggestions: whenChips(deps.today) };
  }
  return { state: state('what', { due_on }), reply: 'What should I remind you about?', suggestions: [] };
}

export function step(prev: FlowState, input: FlowInput, deps: FlowDeps): FlowOutcome {
  const text = input.text.trim();
  if (prev.step === 'when') {
    const day = parseSingleDate(text, deps.today);
    if (!day) return { state: prev, reply: 'I did not catch the day. Try "tomorrow", "Friday" or "8 Oct".', suggestions: whenChips(deps.today) };
    if (day < deps.today) return { state: prev, reply: 'That day has already passed. Which day should I remind you?', suggestions: whenChips(deps.today) };
    if (prev.data.text) return proposal(day, String(prev.data.text), deps.today);
    return { state: state('what', { due_on: day }, prev), reply: 'What should I remind you about?', suggestions: [] };
  }
  if (prev.step === 'what') {
    if (text.length < 2) return { state: prev, reply: 'A few words is enough, for example "finish the catch-up".', suggestions: [] };
    return proposal(String(prev.data.due_on), text.slice(0, 200), deps.today);
  }
  return start(input, deps);
}
```

`upload-sketch.ts`:

```ts
/** "Add a sketch": wait for the photo, offer a caption, propose. Nexus only. */
import { CAPTION_MAX } from '@/lib/sketchbook-add';
import { chip, type FlowDeps, type FlowInput, type FlowOutcome, type FlowState } from './types';

const NO_CAPTION = 'No caption';

function state(step: string, data: Record<string, unknown>, prev?: FlowState): FlowState {
  return { flow: 'upload-sketch', step, data, startedAt: prev?.startedAt ?? new Date().toISOString() };
}

function askCaption(data: Record<string, unknown>, prev?: FlowState): FlowOutcome {
  return { state: state('caption', data, prev), reply: 'Got it. Add a caption? A few words about what you drew, or skip it.', suggestions: [chip(NO_CAPTION)] };
}

function proposal(data: Record<string, unknown>, caption: string): FlowOutcome {
  return {
    state: null,
    reply: 'Ready to add it to your sketchbook.',
    suggestions: [],
    propose: {
      kind: 'add_sketch',
      args: { original_image_url: data.original_image_url, thumbnail_url: data.thumbnail_url ?? null, caption },
      summary: 'Add this sketch to your sketchbook.',
      fields: [{ label: 'Caption', value: caption || 'None' }],
    },
  };
}

export function start(input: FlowInput, _deps: FlowDeps): FlowOutcome {
  if (input.attachment) return askCaption({ ...input.attachment });
  return { state: state('attach', {}), reply: 'Attach a photo of your sketch and I will add it to your sketchbook.', suggestions: [], wantsAttachment: true };
}

export function step(prev: FlowState, input: FlowInput, deps: FlowDeps): FlowOutcome {
  if (prev.step === 'attach') {
    if (input.attachment) return askCaption({ ...input.attachment }, prev);
    return { state: prev, reply: 'I still need the photo. Tap the camera button to attach it.', suggestions: [], wantsAttachment: true };
  }
  if (prev.step === 'caption') {
    const t = input.text.trim();
    const caption = t.toLowerCase() === NO_CAPTION.toLowerCase() || /^(skip|no|none)$/i.test(t) ? '' : t.slice(0, CAPTION_MAX);
    return proposal(prev.data, caption);
  }
  return start(input, deps);
}
```

- [ ] **Step 9: Run every assistant test and type-check**

Run: `pnpm vitest run apps/nexus/src/lib/assistant && pnpm --filter @neram/nexus type-check`
Expected: PASS, clean. Where a flow test's expected sentence differs from what the code says, change the code to match the test; the sentences are the contract the panel and Teams card will show.

- [ ] **Step 10: Commit**

```bash
git add apps/nexus/src/lib/assistant/tools/actions apps/nexus/src/lib/assistant/flows apps/nexus/src/lib/assistant/registry-all.ts
git commit -m "feat(assistant): student action tools and guided flows (cannot attend, remind me, add a sketch)"
```

---

### Task 14: The turn orchestrator and the assistant API routes

**Files:**
- Create: `apps/nexus/src/lib/assistant/page-suggestions.ts`
- Create: `apps/nexus/src/lib/assistant/turn.ts`
- Create: `apps/nexus/src/lib/assistant/caller.ts`
- Modify: `apps/nexus/src/lib/assistant/actions.ts` (confirm passes the action's thread id into `execute`, and returns it)
- Create: `apps/nexus/src/app/api/assistant/turn/route.ts`, `apps/nexus/src/app/api/assistant/actions/[id]/route.ts`, `apps/nexus/src/app/api/assistant/threads/route.ts`, `apps/nexus/src/app/api/assistant/threads/[id]/route.ts`
- Test: `apps/nexus/src/lib/assistant/page-suggestions.test.ts`, `apps/nexus/src/lib/assistant/turn.test.ts`, `apps/nexus/src/app/api/assistant/turn/route.test.ts`, `apps/nexus/src/app/api/assistant/actions/[id]/route.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2 to 13.
- Produces: `defaultSuggestions(pageContext)`, `runAssistantTurn(input): Promise<Envelope>`, `resolveAssistantCaller(request)`, and the HTTP contract the panel (Task 16) calls:
  - `POST /api/assistant/turn` body `{ threadId?: string; text: string; attachment?: Attachment; pageContext?: PageContext }` → `Envelope`
  - `POST /api/assistant/actions/[id]` body `{ token }` → `{ ok: true, reply, links, threadId }` or `{ error }` with the outcome's status
  - `DELETE /api/assistant/actions/[id]` → same shape
  - `POST /api/assistant/threads` body `{ pageContext? }` → `{ threadId }`
  - `GET /api/assistant/threads/[id]` → `{ thread: { id }, messages: Array<{ id, role, text, envelope, created_at }> }`

- [ ] **Step 1: Amend actions.ts**

In `confirmAction`, change the execute call and the success return so the tool sees the action's thread and the route can store the reply in it:

```ts
    const result = await tool.execute({ ...ctx, threadId: row.thread_id ?? ctx.threadId }, row.args);
    ...
    return { ok: true, reply: result.reply || 'Done.', links: result.links || [], threadId: row.thread_id };
```

and widen the type:

```ts
export type ConfirmOutcome =
  | { ok: true; reply: string; links: ToolLink[]; threadId: string | null }
  | { ok: false; status: number; error: string };
```

`cancelAction`'s success return becomes `{ ok: true, reply: 'Okay, cancelled. Nothing was changed.', links: [], threadId: row.thread_id }`.

Run: `pnpm vitest run apps/nexus/src/lib/assistant/actions.test.ts`
Expected: PASS (the tests use `toMatchObject`).

- [ ] **Step 2: Write the failing page-suggestions test**

```ts
import { describe, expect, it } from 'vitest';
import { defaultSuggestions } from './page-suggestions';

describe('defaultSuggestions', () => {
  it('leads with the page the student is on', () => {
    expect(defaultSuggestions({ path: '/student/sketchbook' })[0].label).toBe('How is my rhythm?');
    expect(defaultSuggestions({ path: '/student/catch-up' })[0].label).toBe('What do I have to catch up on?');
    expect(defaultSuggestions({ path: '/student/timetable' })[0].label).toBe('My next class');
  });
  it('falls back to the standard five anywhere else, and never repeats a chip', () => {
    const chips = defaultSuggestions({ path: '/student/dashboard' });
    expect(chips.map((c) => c.label)).toEqual(["What's due?", 'My next class', "I can't attend a class", 'Remind me', 'Add a sketch']);
    const sb = defaultSuggestions({ path: '/student/sketchbook' });
    expect(new Set(sb.map((c) => c.label)).size).toBe(sb.length);
  });
});
```

- [ ] **Step 3: Implement page-suggestions.ts**

```ts
import type { PageContext, Suggestion } from './types';

const BASE: Suggestion[] = [
  { label: "What's due?", send: "What's due?" },
  { label: 'My next class', send: 'When is my next class?' },
  { label: "I can't attend a class", send: "I can't attend a class" },
  { label: 'Remind me', send: 'Remind me' },
  { label: 'Add a sketch', send: 'Add a sketch' },
];

const BY_PAGE: Array<[string, Suggestion]> = [
  ['/student/sketchbook', { label: 'How is my rhythm?', send: 'How is my sketchbook rhythm?' }],
  ['/student/catch-up', { label: 'What do I have to catch up on?', send: 'What do I have to catch up on?' }],
  ['/student/timetable', BASE[1]],
  ['/student/assignments', BASE[0]],
];

/** Chips for an empty composer: the page's own ask first, then the standard set, no repeats. */
export function defaultSuggestions(page: PageContext | null | undefined): Suggestion[] {
  const lead = BY_PAGE.find(([prefix]) => page?.path?.startsWith(prefix))?.[1];
  const out: Suggestion[] = lead ? [lead] : [];
  for (const s of BASE) if (!out.some((o) => o.label === s.label)) out.push(s);
  return out.slice(0, 5);
}
```

Run: `pnpm vitest run apps/nexus/src/lib/assistant/page-suggestions.test.ts`
Expected: PASS.

- [ ] **Step 4: Write the failing turn test**

`apps/nexus/src/lib/assistant/turn.test.ts`:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getStudentPrimaryClassroom: vi.fn(), loadUpcomingClasses: vi.fn(), loadDeclinedClassIds: vi.fn(), loadBriefFacts: vi.fn() }));
vi.mock('@neram/database/queries/nexus', () => ({ getStudentPrimaryClassroom: mocks.getStudentPrimaryClassroom }));
vi.mock('@/lib/upcoming-classes', () => ({
  loadUpcomingClasses: mocks.loadUpcomingClasses, loadDeclinedClassIds: mocks.loadDeclinedClassIds,
  istNow: () => ({ today: '2026-10-03', nowHHMM: '10:00' }),
}));
vi.mock('@/lib/assistant/brief-load', () => ({ loadBriefFacts: mocks.loadBriefFacts, istHour: () => 10 }));
vi.mock('@neram/database', () => ({ getSupabaseAdminClient: () => ({}), listAssignmentsForStudent: vi.fn(), getCatchupBacklog: vi.fn() }));

import { fakeDb } from './testing/fake-db';
import { FLOW_TTL_MS } from './flows/types';
import type { AssistantCaller } from './types';
import { runAssistantTurn } from './turn';

const student: AssistantCaller = { id: 's1', name: 'Priya S', user_type: 'student', staff_role: null, can_teach: null, impersonating: false };
const UNIQUE = { nexus_assistant_messages: [['thread_id', 'external_id']] };
const upcoming = [{ id: 'k1', title: 'Perspective', classroom_id: 'c1', scheduled_date: '2026-10-04', start_time: '18:00', end_time: '19:30', status: 'scheduled', teams_meeting_url: null }];

function turn(db: ReturnType<typeof fakeDb>, text: string, extra: Record<string, unknown> = {}) {
  return runAssistantTurn({ supabase: db, caller: student, channel: 'nexus', text, baseUrl: 'https://nexus.test', now: new Date('2026-10-03T04:30:00Z'), ...extra });
}

beforeEach(() => {
  mocks.getStudentPrimaryClassroom.mockReset().mockResolvedValue({ id: 'c1', name: 'JEE', sketchbook_weekly_goal: 3, batch_id: null });
  mocks.loadUpcomingClasses.mockReset().mockResolvedValue(upcoming);
  mocks.loadDeclinedClassIds.mockReset().mockResolvedValue(new Set());
});

describe('runAssistantTurn', () => {
  it('creates a thread, stores both messages, and answers a routed tool without a model', async () => {
    const db = fakeDb({}, { unique: UNIQUE });
    const env = await turn(db, 'when is my next class');
    expect(env.reply).toMatch(/^Your next classes:/);
    expect(env.threadId).toBeTruthy();
    expect(env.mode).toBe('general');
    expect(db.rows('nexus_assistant_messages').map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(db.rows('nexus_assistant_messages')[1].llm).toBe(false);
  });

  it('falls back politely when the model would be needed, with the page chips', async () => {
    const db = fakeDb({});
    const env = await turn(db, 'why is the sky blue', { pageContext: { path: '/student/sketchbook' } });
    expect(env.reply).toMatch(/I cannot answer free questions yet/);
    expect(env.suggestions[0].label).toBe('How is my rhythm?');
  });

  it('runs a flow across turns and proposes an action at the end', async () => {
    const db = fakeDb({});
    const first = await turn(db, "I can't attend");
    expect(first.reply).toBe('Which class can you not attend?');
    expect(db.rows('nexus_assistant_threads')[0].flow_state).toMatchObject({ flow: 'cannot-attend', step: 'pick-class' });
    const second = await turn(db, 'Tomorrow 6:00 pm: Perspective', { threadId: first.threadId });
    expect(second.reply).toMatch(/Why can you not make it/);
    const third = await turn(db, 'Feeling unwell', { threadId: first.threadId });
    expect(third.action).toMatchObject({ kind: 'decline_class', fields: expect.any(Array) });
    expect(db.rows('nexus_assistant_actions')[0]).toMatchObject({ user_id: 's1', status: 'pending' });
    expect(db.rows('nexus_assistant_threads')[0].flow_state).toBeNull();
  });

  it('cancel clears the flow and says so', async () => {
    const db = fakeDb({});
    const first = await turn(db, "I can't attend");
    const out = await turn(db, 'cancel', { threadId: first.threadId });
    expect(out.reply).toBe('Okay, cancelled. Nothing was changed.');
    expect(db.rows('nexus_assistant_threads')[0].flow_state).toBeNull();
    expect(out.suggestions.length).toBeGreaterThan(0);
  });

  it('ignores a stale flow and routes the message fresh', async () => {
    const db = fakeDb({});
    const first = await turn(db, "I can't attend");
    const later = new Date(Date.parse('2026-10-03T04:30:00Z') + FLOW_TTL_MS + 1000);
    const out = await turn(db, 'when is my next class', { threadId: first.threadId, now: later });
    expect(out.reply).toMatch(/^Your next classes:/);
    expect(db.rows('nexus_assistant_threads')[0].flow_state).toBeNull();
  });

  it('refuses to propose while impersonating but still answers reads', async () => {
    const db = fakeDb({});
    const viewer = { ...student, impersonating: true };
    const read = await runAssistantTurn({ supabase: db, caller: viewer, channel: 'nexus', text: 'my schedule', baseUrl: 'https://nexus.test' });
    expect(read.reply).toMatch(/^Your next classes:/);
    const out = await runAssistantTurn({ supabase: db, caller: viewer, channel: 'nexus', text: 'remind me tomorrow to practise', baseUrl: 'https://nexus.test' });
    expect(out.action).toBeNull();
    expect(out.reply).toMatch(/read only/);
    expect(db.rows('nexus_assistant_actions')).toHaveLength(0);
  });

  it('returns the stored reply for a redelivered external id without doing the work twice', async () => {
    const db = fakeDb({}, { unique: UNIQUE });
    const a = await turn(db, 'when is my next class', { channel: 'teams', externalId: 'act-1', threadExternalId: '19:conv' });
    const b = await turn(db, 'when is my next class', { channel: 'teams', externalId: 'act-1', threadExternalId: '19:conv' });
    expect(b.reply).toBe(a.reply);
    expect(mocks.loadUpcomingClasses).toHaveBeenCalledTimes(1);
    expect(db.rows('nexus_assistant_messages')).toHaveLength(2);
  });

  it('refuses a thread that belongs to someone else by starting a fresh one', async () => {
    const db = fakeDb({ nexus_assistant_threads: [{ id: 't-other', user_id: 'u9', channel: 'nexus', flow_state: null }] });
    const env = await turn(db, 'brief', { threadId: 't-other' });
    expect(env.threadId).not.toBe('t-other');
  });

  it('answers an empty message without storing anything', async () => {
    const db = fakeDb({});
    const env = await turn(db, '   ');
    expect(env.reply).toMatch(/Say what you need/);
    expect(db.rows('nexus_assistant_messages')).toHaveLength(0);
  });
});
```

- [ ] **Step 5: Run it to see it fail**

Run: `pnpm vitest run apps/nexus/src/lib/assistant/turn.test.ts`
Expected: FAIL, `./turn` not found.

- [ ] **Step 6: Implement turn.ts**

```ts
/**
 * One message in, one envelope out. Four stages, in order:
 *   1. the regex router (cancel, a guided flow, a direct tool),
 *   2. a flow already in progress on the thread (unless stale),
 *   3. running the tool with no model,
 *   4. the model (M2). In M1 this stage is a polite "not yet" with chips.
 * Stages 1 to 3 never import @neram/ai.
 */
import { getStudentPrimaryClassroom } from '@neram/database/queries/nexus';
import { loadDeclinedClassIds, loadUpcomingClasses, istNow } from '@/lib/upcoming-classes';
import { proposeAction } from './actions';
import * as cannotAttend from './flows/cannot-attend';
import * as remindMe from './flows/remind-me';
import * as uploadSketch from './flows/upload-sketch';
import { isStale, type FlowDeps, type FlowOutcome, type FlowState } from './flows/types';
import { defaultSuggestions } from './page-suggestions';
import { findTool, toolsFor } from './registry-all';
import { routeIntent, type FlowName } from './router';
import { appendMessage, createThread, findThreadByExternalId, getThread, listMessages, touchThread, type ThreadRow } from './store';
import type { AssistantCaller, Attachment, Channel, Envelope, Mode, PageContext, ToolContext } from './types';

export const MAX_TEXT = 2000;

const FLOWS: Record<FlowName, { start: typeof cannotAttend.start; step: typeof cannotAttend.step }> = {
  'cannot-attend': cannotAttend,
  'remind-me': remindMe,
  'upload-sketch': uploadSketch,
};

export interface TurnInput {
  supabase: any;
  caller: AssistantCaller;
  channel: Channel;
  /** A thread the caller already has open (Nexus). Ignored when it is not theirs. */
  threadId?: string | null;
  /** Teams: the conversation id, one thread per conversation. */
  threadExternalId?: string | null;
  /** Teams: the activity id, so a redelivery is answered from the store. */
  externalId?: string | null;
  text: string;
  attachment?: Attachment | null;
  pageContext?: PageContext | null;
  baseUrl: string;
  now?: Date;
}

const READ_ONLY = 'Viewing as a student is read only, so I cannot do that from here. Everything else still works.';
const NOT_YET = 'I cannot answer free questions yet. Here is what I can do right now.';

async function resolveThread(input: TurnInput): Promise<ThreadRow> {
  if (input.threadId) {
    const t = await getThread(input.supabase, input.threadId);
    if (t && t.user_id === input.caller.id && t.channel === input.channel) return t;
  }
  if (input.threadExternalId) {
    const t = await findThreadByExternalId(input.supabase, input.caller.id, input.channel, input.threadExternalId);
    if (t) return t;
  }
  return createThread(input.supabase, {
    userId: input.caller.id, channel: input.channel, externalId: input.threadExternalId ?? null, pageContext: (input.pageContext as Record<string, unknown>) ?? null,
  });
}

async function flowDeps(ctx: ToolContext): Promise<FlowDeps> {
  const { today, nowHHMM } = istNow(ctx.now);
  if (!ctx.classroomId) return { today, upcoming: [], declined: new Set() };
  const upcoming = (await loadUpcomingClasses(ctx.supabase, ctx.classroomId, { today, nowHHMM, limit: 6 })).filter((c) => c.scheduled_date <= addDays(today, 14));
  const declined = await loadDeclinedClassIds(ctx.supabase, ctx.caller.id, upcoming.map((c) => c.id));
  return { today, upcoming, declined };
}

function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function runAssistantTurn(input: TurnInput): Promise<Envelope> {
  const now = input.now ?? new Date();
  const text = input.text.trim().slice(0, MAX_TEXT);
  const page = input.pageContext ?? null;

  if (!text && !input.attachment) {
    return { reply: 'Say what you need, or tap one of these.', suggestions: defaultSuggestions(page), links: [], action: null, mode: 'general', threadId: input.threadId || '' };
  }

  const thread = await resolveThread(input);
  const stored = await appendMessage(input.supabase, { threadId: thread.id, role: 'user', text: text || '(photo)', externalId: input.externalId ?? null });
  if (!stored.inserted) {
    // Redelivery: answer with what we already said.
    const history = await listMessages(input.supabase, thread.id, 50);
    const last = [...history].reverse().find((m) => m.role === 'assistant' && m.envelope);
    if (last?.envelope) return last.envelope;
  }

  const classroom = await getStudentPrimaryClassroom(input.caller.id, input.supabase).catch(() => null);
  const ctx: ToolContext = {
    caller: input.caller, channel: input.channel, mode: 'general', supabase: input.supabase,
    classroomId: classroom?.id ?? null, threadId: thread.id, now, baseUrl: input.baseUrl,
  };

  const route = routeIntent(text, page);
  let outcome: FlowOutcome;
  let mode: Mode = 'general';

  const activeFlow = thread.flow_state as FlowState | null;
  const live = activeFlow && !isStale(activeFlow, now) ? activeFlow : null;

  if (route.kind === 'cancel') {
    outcome = { state: null, reply: 'Okay, cancelled. Nothing was changed.', suggestions: defaultSuggestions(page) };
  } else if (live) {
    outcome = FLOWS[live.flow].step(live, { text, attachment: input.attachment ?? null }, await flowDeps(ctx));
  } else if (route.kind === 'flow') {
    outcome = FLOWS[route.flow].start({ text, attachment: input.attachment ?? null }, await flowDeps(ctx));
  } else if (route.kind === 'tool') {
    const tool = findTool(route.tool);
    const allowed = toolsFor(input.caller, 'general').some((t) => t.name === route.tool);
    if (!tool || !allowed) {
      outcome = { state: null, reply: NOT_YET, suggestions: defaultSuggestions(page) };
    } else {
      const result = await tool.run(ctx, {});
      outcome = {
        state: null,
        reply: result.ok ? result.reply || 'Done.' : result.error || 'That did not work.',
        suggestions: result.suggest ?? defaultSuggestions(page),
      };
      (outcome as FlowOutcome & { links?: Envelope['links'] }).links = result.links;
    }
  } else {
    mode = route.mode;
    outcome = { state: null, reply: NOT_YET, suggestions: defaultSuggestions(page) };
  }

  let action: Envelope['action'] = null;
  if (outcome.propose) {
    if (input.caller.impersonating) {
      outcome = { ...outcome, reply: READ_ONLY, propose: undefined, state: null };
    } else {
      action = await proposeAction(ctx, outcome.propose);
    }
  }

  await touchThread(input.supabase, thread.id, { flowState: (outcome.state as unknown as Record<string, unknown>) ?? null, lastMessageAt: now.toISOString(), pageContext: (page as Record<string, unknown>) ?? thread.page_context });

  const envelope: Envelope = {
    reply: outcome.reply,
    suggestions: outcome.suggestions,
    links: (outcome as FlowOutcome & { links?: Envelope['links'] }).links ?? [],
    action,
    mode,
    threadId: thread.id,
    ...(outcome.wantsAttachment ? { wantsAttachment: true } : {}),
  };
  await appendMessage(input.supabase, { threadId: thread.id, role: 'assistant', text: envelope.reply, envelope, mode, llm: false });
  return envelope;
}
```

- [ ] **Step 7: Run the turn test**

Run: `pnpm vitest run apps/nexus/src/lib/assistant/turn.test.ts`
Expected: PASS. If the flow chip text in the third test does not match (`Tomorrow 6:00 pm: Perspective`), check `classLabel` in `cannot-attend.ts`, not the test.

- [ ] **Step 8: Implement caller.ts**

```ts
/**
 * Who is asking, for every /api/assistant route: the verified token, the users
 * row, whether this is a View-as-Student session, and the feature gate.
 */
import { getSupabaseAdminClient } from '@neram/database';
import { verifyMsToken } from '@/lib/ms-verify';
import { getRequestUser } from '@/lib/study-materials';
import { assertAssistantAccess } from './access';
import type { AssistantCaller } from './types';

export async function resolveAssistantCaller(authHeader: string | null): Promise<{ caller: AssistantCaller; supabase: any }> {
  const ms = await verifyMsToken(authHeader);
  const user = await getRequestUser(authHeader);
  const supabase = getSupabaseAdminClient() as any;
  await assertAssistantAccess(supabase, user);
  return {
    supabase,
    caller: {
      id: user.id, name: user.name, user_type: user.user_type, staff_role: user.staff_role, can_teach: user.can_teach,
      impersonating: Boolean(ms.impersonatorUserId),
    },
  };
}

export function baseUrlOf(request: { nextUrl: { origin: string } }): string {
  return (process.env.NEXT_PUBLIC_NEXUS_URL || request.nextUrl.origin).replace(/\/$/, '');
}
```

- [ ] **Step 9: Write the failing route tests**

`apps/nexus/src/app/api/assistant/turn/route.test.ts`:

```ts
// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ resolveAssistantCaller: vi.fn(), runAssistantTurn: vi.fn() }));
vi.mock('@/lib/assistant/caller', () => ({ resolveAssistantCaller: mocks.resolveAssistantCaller, baseUrlOf: () => 'https://nexus.test' }));
vi.mock('@/lib/assistant/turn', () => ({ runAssistantTurn: mocks.runAssistantTurn, MAX_TEXT: 2000 }));

import { POST } from './route';
import { ApiError } from '@/lib/api-errors';

const caller = { id: 'u1', name: 'Priya', user_type: 'student', staff_role: null, can_teach: null, impersonating: false };
const req = (body: unknown) => new NextRequest('http://localhost/api/assistant/turn', { method: 'POST', headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

beforeEach(() => {
  mocks.resolveAssistantCaller.mockReset().mockResolvedValue({ caller, supabase: {} });
  mocks.runAssistantTurn.mockReset().mockResolvedValue({ reply: 'hi', suggestions: [], links: [], action: null, mode: 'general', threadId: 't1' });
});

describe('POST /api/assistant/turn', () => {
  it('runs the turn for the caller and returns the envelope, uncached', async () => {
    const res = await POST(req({ text: 'brief', threadId: 't1', pageContext: { path: '/student/dashboard' } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ reply: 'hi', threadId: 't1' });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(mocks.runAssistantTurn).toHaveBeenCalledWith(expect.objectContaining({ caller, channel: 'nexus', text: 'brief', threadId: 't1', pageContext: { path: '/student/dashboard' }, baseUrl: 'https://nexus.test' }));
  });

  it('rejects a body with no text and no attachment, and a text over the cap', async () => {
    expect((await POST(req({}))).status).toBe(400);
    expect((await POST(req({ text: 'x'.repeat(2001) }))).status).toBe(400);
    expect(mocks.runAssistantTurn).not.toHaveBeenCalled();
  });

  it('only accepts https attachments', async () => {
    expect((await POST(req({ text: '', attachment: { original_image_url: 'http://x', thumbnail_url: null } }))).status).toBe(400);
    expect((await POST(req({ text: '', attachment: { original_image_url: 'https://cdn.test/a.jpg', thumbnail_url: null } }))).status).toBe(200);
  });

  it('maps the gate to its status', async () => {
    mocks.resolveAssistantCaller.mockRejectedValueOnce(new ApiError('Not found', 404));
    expect((await POST(req({ text: 'hi' }))).status).toBe(404);
  });
});
```

`apps/nexus/src/app/api/assistant/actions/[id]/route.test.ts`:

```ts
// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ resolveAssistantCaller: vi.fn(), confirmAction: vi.fn(), cancelAction: vi.fn(), appendMessage: vi.fn() }));
vi.mock('@/lib/assistant/caller', () => ({ resolveAssistantCaller: mocks.resolveAssistantCaller, baseUrlOf: () => 'https://nexus.test' }));
vi.mock('@/lib/assistant/actions', () => ({ confirmAction: mocks.confirmAction, cancelAction: mocks.cancelAction }));
vi.mock('@/lib/assistant/store', () => ({ appendMessage: mocks.appendMessage }));
vi.mock('@neram/database/queries/nexus', () => ({ getStudentPrimaryClassroom: async () => ({ id: 'c1' }) }));

import { DELETE, POST } from './route';

const caller = { id: 'u1', name: 'Priya', user_type: 'student', staff_role: null, can_teach: null, impersonating: false };
const ctx = { params: { id: 'a1' } };
const post = (body: unknown) => new NextRequest('http://localhost/api/assistant/actions/a1', { method: 'POST', headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const del = () => new NextRequest('http://localhost/api/assistant/actions/a1', { method: 'DELETE', headers: { Authorization: 'Bearer t' } });

beforeEach(() => {
  mocks.resolveAssistantCaller.mockReset().mockResolvedValue({ caller, supabase: {} });
  mocks.confirmAction.mockReset();
  mocks.cancelAction.mockReset();
  mocks.appendMessage.mockReset().mockResolvedValue({ inserted: true, row: null });
});

describe('/api/assistant/actions/[id]', () => {
  it('confirms with the token, stores the reply in the thread, and returns it', async () => {
    mocks.confirmAction.mockResolvedValue({ ok: true, reply: 'Done.', links: [], threadId: 't1' });
    const res = await POST(post({ token: 'tok' }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, reply: 'Done.', links: [], threadId: 't1' });
    expect(mocks.confirmAction).toHaveBeenCalledWith(expect.objectContaining({ caller }), { id: 'a1', token: 'tok' });
    expect(mocks.appendMessage).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ threadId: 't1', role: 'assistant', text: 'Done.' }));
  });

  it('passes a refusal through with its status and no thread write', async () => {
    mocks.confirmAction.mockResolvedValue({ ok: false, status: 410, error: 'expired' });
    const res = await POST(post({ token: 'tok' }), ctx);
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: 'expired' });
    expect(mocks.appendMessage).not.toHaveBeenCalled();
  });

  it('400s a missing token and DELETE cancels', async () => {
    expect((await POST(post({}), ctx)).status).toBe(400);
    mocks.cancelAction.mockResolvedValue({ ok: true, reply: 'Okay, cancelled. Nothing was changed.', links: [], threadId: 't1' });
    expect((await DELETE(del(), ctx)).status).toBe(200);
  });
});
```

- [ ] **Step 10: Implement the four routes**

`app/api/assistant/turn/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api-errors';
import { baseUrlOf, resolveAssistantCaller } from '@/lib/assistant/caller';
import { MAX_TEXT, runAssistantTurn } from '@/lib/assistant/turn';
import type { Attachment, PageContext } from '@/lib/assistant/types';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };

function readAttachment(raw: unknown): Attachment | null | 'bad' {
  if (raw === undefined || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.original_image_url !== 'string' || !/^https:\/\//.test(r.original_image_url)) return 'bad';
  const thumb = typeof r.thumbnail_url === 'string' && /^https:\/\//.test(r.thumbnail_url) ? r.thumbnail_url : null;
  return { original_image_url: r.original_image_url, thumbnail_url: thumb };
}

function readPage(raw: unknown): PageContext | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r.path !== 'string') return null;
  return { path: r.path.slice(0, 200), classroomId: typeof r.classroomId === 'string' ? r.classroomId : null, classId: typeof r.classId === 'string' ? r.classId : null };
}

/**
 * POST /api/assistant/turn   (student)
 * body { threadId?, text, attachment?, pageContext? }
 */
export async function POST(request: NextRequest) {
  try {
    const { caller, supabase } = await resolveAssistantCaller(request.headers.get('Authorization'));
    const body = await request.json().catch(() => ({}));
    const text = typeof body?.text === 'string' ? body.text : '';
    const attachment = readAttachment(body?.attachment);
    if (attachment === 'bad') return NextResponse.json({ error: 'The attachment must be an https image URL.' }, { status: 400 });
    if (!text.trim() && !attachment) return NextResponse.json({ error: 'Say something or attach a photo.' }, { status: 400 });
    if (text.length > MAX_TEXT) return NextResponse.json({ error: `Keep it under ${MAX_TEXT} characters.` }, { status: 400 });

    const envelope = await runAssistantTurn({
      supabase, caller, channel: 'nexus',
      threadId: typeof body?.threadId === 'string' ? body.threadId : null,
      text, attachment, pageContext: readPage(body?.pageContext), baseUrl: baseUrlOf(request),
    });
    return NextResponse.json(envelope, { headers: NO_STORE });
  } catch (err) {
    return errorResponse(err, 'The assistant could not answer');
  }
}
```

`app/api/assistant/actions/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getStudentPrimaryClassroom } from '@neram/database/queries/nexus';
import { errorResponse } from '@/lib/api-errors';
import { cancelAction, confirmAction } from '@/lib/assistant/actions';
import { baseUrlOf, resolveAssistantCaller } from '@/lib/assistant/caller';
import '@/lib/assistant/registry-all';
import { appendMessage } from '@/lib/assistant/store';
import type { ToolContext } from '@/lib/assistant/types';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };

async function contextFor(request: NextRequest): Promise<ToolContext> {
  const { caller, supabase } = await resolveAssistantCaller(request.headers.get('Authorization'));
  const classroom = await getStudentPrimaryClassroom(caller.id, supabase).catch(() => null);
  return { caller, channel: 'nexus', mode: 'general', supabase, classroomId: classroom?.id ?? null, threadId: null, now: new Date(), baseUrl: baseUrlOf(request) };
}

async function respond(ctx: ToolContext, outcome: Awaited<ReturnType<typeof confirmAction>>) {
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status, headers: NO_STORE });
  if (outcome.threadId) {
    await appendMessage(ctx.supabase, { threadId: outcome.threadId, role: 'assistant', text: outcome.reply, envelope: { reply: outcome.reply, suggestions: [], links: outcome.links, action: null, mode: 'general', threadId: outcome.threadId } }).catch(() => undefined);
  }
  return NextResponse.json(outcome, { headers: NO_STORE });
}

/** POST /api/assistant/actions/[id]  body { token }: confirm and execute. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await contextFor(request);
    const body = await request.json().catch(() => ({}));
    if (typeof body?.token !== 'string' || !body.token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    return respond(ctx, await confirmAction(ctx, { id: params.id, token: body.token }));
  } catch (err) {
    return errorResponse(err, 'Could not confirm that');
  }
}

/** DELETE /api/assistant/actions/[id]: cancel a pending action. */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await contextFor(request);
    return respond(ctx, await cancelAction(ctx, { id: params.id }));
  } catch (err) {
    return errorResponse(err, 'Could not cancel that');
  }
}
```

`app/api/assistant/threads/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api-errors';
import { resolveAssistantCaller } from '@/lib/assistant/caller';
import { createThread } from '@/lib/assistant/store';

export const dynamic = 'force-dynamic';

/** POST /api/assistant/threads  body { pageContext? }: "New chat". */
export async function POST(request: NextRequest) {
  try {
    const { caller, supabase } = await resolveAssistantCaller(request.headers.get('Authorization'));
    const body = await request.json().catch(() => ({}));
    const thread = await createThread(supabase, { userId: caller.id, channel: 'nexus', pageContext: body?.pageContext ?? null });
    return NextResponse.json({ threadId: thread.id }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err, 'Could not start a chat');
  }
}
```

`app/api/assistant/threads/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api-errors';
import { resolveAssistantCaller } from '@/lib/assistant/caller';
import { getThread, listMessages } from '@/lib/assistant/store';

export const dynamic = 'force-dynamic';

/** GET /api/assistant/threads/[id]: the messages of one of the caller's threads. */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { caller, supabase } = await resolveAssistantCaller(request.headers.get('Authorization'));
    const thread = await getThread(supabase, params.id);
    if (!thread || thread.user_id !== caller.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const messages = await listMessages(supabase, thread.id, 50);
    return NextResponse.json(
      { thread: { id: thread.id }, messages: messages.map((m) => ({ id: m.id, role: m.role, text: m.text, envelope: m.envelope, created_at: m.created_at })) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    return errorResponse(err, 'Could not load the chat');
  }
}
```

- [ ] **Step 11: Run every assistant test, type-check and lint**

Run: `pnpm vitest run apps/nexus/src/lib/assistant apps/nexus/src/app/api/assistant && pnpm --filter @neram/nexus type-check && pnpm --filter @neram/nexus lint`
Expected: PASS, clean, clean.

- [ ] **Step 12: Commit**

```bash
git add apps/nexus/src/lib/assistant apps/nexus/src/app/api/assistant
git commit -m "feat(assistant): turn orchestrator and /api/assistant routes (turn, actions, threads)"
```

---

### Task 15: Browser client and the AssistantProvider

**Files:**
- Create: `apps/nexus/src/components/assistant/client.ts`
- Create: `apps/nexus/src/components/assistant/AssistantProvider.tsx`
- Test: `apps/nexus/src/components/assistant/client.test.ts`

**Interfaces:**
- Consumes: the HTTP contract from Task 14; `captureScreenshot` (`lib/capture-screenshot.ts`); `ReportIssueDialog` (`components/issues/ReportIssueDialog.tsx`); `compressImage` (`utils/imageCompression.ts`); `useNexusAuthContext`.
- Produces: `postTurn`, `confirmActionRequest`, `cancelActionRequest`, `newThread`, `uploadImage`, `AssistantHttpError`; `AssistantProvider`, `useAssistant()` (throws outside the provider), `useAssistantOptional()` (null outside), `AssistantMessage`, `ASSISTANT_FLAG` re-exported for the client.

- [ ] **Step 1: Write the failing client test**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssistantHttpError, confirmActionRequest, postTurn } from './client';

const getToken = async () => 'tok';

afterEach(() => vi.unstubAllGlobals());

describe('postTurn', () => {
  it('posts the body with the bearer token and returns the envelope', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ reply: 'hi', suggestions: [], links: [], action: null, mode: 'general', threadId: 't1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const env = await postTurn(getToken, { threadId: null, text: 'brief', pageContext: { path: '/student/dashboard' } });
    expect(env.threadId).toBe('t1');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/assistant/turn');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(JSON.parse(String(init.body))).toMatchObject({ text: 'brief', pageContext: { path: '/student/dashboard' } });
  });

  it('throws AssistantHttpError carrying the status and the server message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'not switched on for your account yet' }), { status: 403 })));
    await expect(postTurn(getToken, { threadId: null, text: 'x' })).rejects.toMatchObject({ name: 'AssistantHttpError', status: 403, message: 'not switched on for your account yet' });
  });

  it('fails with 401 when there is no token, without calling the server', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(postTurn(async () => null, { threadId: null, text: 'x' })).rejects.toBeInstanceOf(AssistantHttpError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('confirmActionRequest', () => {
  it('posts the token to the action route', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, reply: 'Done.', links: [], threadId: 't1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const out = await confirmActionRequest(getToken, 'a1', 'ct');
    expect(out.reply).toBe('Done.');
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('/api/assistant/actions/a1');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vitest run apps/nexus/src/components/assistant/client.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement client.ts**

```ts
/**
 * Browser-side calls to /api/assistant. Never imported on the server.
 * The Envelope type is shared with the brain so the panel renders exactly what
 * the server produced.
 */
import type { ActionProposal, Attachment, Envelope, PageContext, Suggestion, ToolLink } from '@/lib/assistant/types';
import { compressImage } from '@/utils/imageCompression';

export type { ActionProposal, Attachment, Envelope, PageContext, Suggestion, ToolLink };
export { ASSISTANT_FLAG } from '@/lib/assistant/access';

export type GetToken = () => Promise<string | null>;

export class AssistantHttpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'AssistantHttpError';
    this.status = status;
  }
}

async function authed<T>(getToken: GetToken, url: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken();
  if (!token) throw new AssistantHttpError('Your session has ended. Sign in again.', 401);
  const res = await fetch(url, {
    ...init,
    cache: 'no-store',
    headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new AssistantHttpError(typeof body?.error === 'string' ? body.error : 'The assistant could not answer', res.status);
  return body as T;
}

export function postTurn(
  getToken: GetToken,
  body: { threadId: string | null; text: string; attachment?: Attachment | null; pageContext?: PageContext | null },
): Promise<Envelope> {
  return authed<Envelope>(getToken, '/api/assistant/turn', { method: 'POST', body: JSON.stringify(body) });
}

export interface ActionOutcome { ok: true; reply: string; links: ToolLink[]; threadId: string | null }

export function confirmActionRequest(getToken: GetToken, id: string, token: string): Promise<ActionOutcome> {
  return authed<ActionOutcome>(getToken, `/api/assistant/actions/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify({ token }) });
}

export function cancelActionRequest(getToken: GetToken, id: string): Promise<ActionOutcome> {
  return authed<ActionOutcome>(getToken, `/api/assistant/actions/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function newThread(getToken: GetToken, pageContext: PageContext | null): Promise<string> {
  const out = await authed<{ threadId: string }>(getToken, '/api/assistant/threads', { method: 'POST', body: JSON.stringify({ pageContext }) });
  return out.threadId;
}

/** Same path the sketchbook uses: downscale, upload, thumbnail, upload. */
export async function uploadImage(getToken: GetToken, file: File): Promise<Attachment> {
  const token = await getToken();
  if (!token) throw new AssistantHttpError('Your session has ended. Sign in again.', 401);
  const send = async (blob: File) => {
    const form = new FormData();
    form.append('file', blob);
    form.append('bucket', 'drawing-uploads');
    const res = await fetch('/api/drawing/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
    if (!res.ok) throw new AssistantHttpError(res.status === 413 ? 'That image is too large to upload. Try a smaller photo.' : 'Upload failed. Check your connection and try again.', res.status);
    return (await res.json()).url as string;
  };
  let main: File;
  try {
    main = await compressImage(file, 2400, 0.85, 'sketch.jpg');
  } catch {
    main = file;
  }
  const original_image_url = await send(main);
  let thumbnail_url: string | null = null;
  try {
    thumbnail_url = await send(await compressImage(main, 400, 0.8, 'thumb.jpg'));
  } catch {
    thumbnail_url = null;
  }
  return { original_image_url, thumbnail_url };
}
```

- [ ] **Step 4: Run the client test**

Run: `pnpm vitest run apps/nexus/src/components/assistant/client.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement AssistantProvider.tsx**

```tsx
'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { captureScreenshot } from '@/lib/capture-screenshot';
import { isTeamsPadPath } from '@/lib/pad/embedded';
import ReportIssueDialog from '@/components/issues/ReportIssueDialog';
import {
  ASSISTANT_FLAG, AssistantHttpError, cancelActionRequest, confirmActionRequest, newThread, postTurn,
  type ActionProposal, type Attachment, type Envelope, type PageContext, type Suggestion,
} from './client';

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  envelope?: Envelope | null;
  /** True while the reply is in flight; the list shows a skeleton for it. */
  pending?: boolean;
}

export interface AssistantContextValue {
  /** Student, flag on, not a pad page, not refused by the server. */
  enabled: boolean;
  open: boolean;
  openPanel: (intent?: string) => void;
  closePanel: () => void;
  messages: AssistantMessage[];
  busy: boolean;
  error: string | null;
  suggestions: Suggestion[];
  wantsAttachment: boolean;
  pendingAction: ActionProposal | null;
  /** Text the composer should show, set by Edit on an action card. */
  draft: string;
  setDraft: (text: string) => void;
  send: (text: string, attachment?: Attachment | null) => Promise<void>;
  confirm: () => Promise<void>;
  cancel: () => Promise<void>;
  newChat: () => Promise<void>;
  reportProblem: () => Promise<void>;
  pageContext: PageContext;
}

const Ctx = createContext<AssistantContextValue | null>(null);
const THREAD_KEY = 'nexus-assistant-thread';

let seq = 0;
const nextId = () => `m${Date.now()}-${++seq}`;

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const { isStudent, isFeatureEnabled, getToken, tokenReady, parentSession } = useNexusAuthContext();
  const pathname = usePathname() || '/';

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [wantsAttachment, setWantsAttachment] = useState(false);
  const [pendingAction, setPendingAction] = useState<ActionProposal | null>(null);
  const [draft, setDraft] = useState('');
  const [refused, setRefused] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [autoShot, setAutoShot] = useState<File | null>(null);
  const threadRef = useRef<string | null>(null);

  useEffect(() => {
    try {
      threadRef.current = window.sessionStorage.getItem(THREAD_KEY);
    } catch {
      threadRef.current = null;
    }
  }, []);

  const pageContext = useMemo<PageContext>(() => ({ path: pathname }), [pathname]);
  const enabled = isStudent && tokenReady && !parentSession.active && !isTeamsPadPath(pathname) && isFeatureEnabled(ASSISTANT_FLAG) && !refused;

  const applyEnvelope = useCallback((env: Envelope, userText: string | null) => {
    threadRef.current = env.threadId;
    try {
      window.sessionStorage.setItem(THREAD_KEY, env.threadId);
    } catch {
      /* private mode: the thread simply does not survive a reload */
    }
    setMessages((prev) => {
      const withoutPending = prev.filter((m) => !m.pending);
      const user = userText ? [{ id: nextId(), role: 'user' as const, text: userText }] : [];
      return [...withoutPending, ...user, { id: nextId(), role: 'assistant' as const, text: env.reply, envelope: env }];
    });
    setSuggestions(env.suggestions);
    setWantsAttachment(Boolean(env.wantsAttachment));
    setPendingAction(env.action);
  }, []);

  const fail = useCallback((err: unknown) => {
    setMessages((prev) => prev.filter((m) => !m.pending));
    if (err instanceof AssistantHttpError && (err.status === 403 || err.status === 404)) {
      setRefused(true);
      setOpen(false);
      return;
    }
    setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
  }, []);

  const send = useCallback(async (text: string, attachment: Attachment | null = null) => {
    const trimmed = text.trim();
    if ((!trimmed && !attachment) || busy) return;
    setError(null);
    setBusy(true);
    setPendingAction(null);
    setMessages((prev) => [...prev, { id: nextId(), role: 'user', text: trimmed || 'Photo attached' }, { id: nextId(), role: 'assistant', text: '', pending: true }]);
    try {
      const env = await postTurn(getToken, { threadId: threadRef.current, text: trimmed, attachment, pageContext });
      applyEnvelope(env, null);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }, [applyEnvelope, busy, fail, getToken, pageContext]);

  const confirm = useCallback(async () => {
    if (!pendingAction || busy) return;
    setBusy(true);
    setError(null);
    try {
      const out = await confirmActionRequest(getToken, pendingAction.id, pendingAction.confirmToken);
      setPendingAction(null);
      setMessages((prev) => [...prev, { id: nextId(), role: 'assistant', text: out.reply, envelope: { reply: out.reply, suggestions: [], links: out.links, action: null, mode: 'general', threadId: out.threadId || threadRef.current || '' } }]);
    } catch (err) {
      if (err instanceof AssistantHttpError && [409, 410].includes(err.status)) setPendingAction(null);
      fail(err);
    } finally {
      setBusy(false);
    }
  }, [busy, fail, getToken, pendingAction]);

  const cancel = useCallback(async () => {
    if (!pendingAction) return;
    const id = pendingAction.id;
    setPendingAction(null);
    try {
      const out = await cancelActionRequest(getToken, id);
      setMessages((prev) => [...prev, { id: nextId(), role: 'assistant', text: out.reply }]);
    } catch {
      /* already gone is fine */
    }
  }, [getToken, pendingAction]);

  const newChat = useCallback(async () => {
    setMessages([]);
    setSuggestions([]);
    setPendingAction(null);
    setWantsAttachment(false);
    setError(null);
    try {
      threadRef.current = await newThread(getToken, pageContext);
      window.sessionStorage.setItem(THREAD_KEY, threadRef.current);
    } catch (err) {
      fail(err);
    }
  }, [fail, getToken, pageContext]);

  const openPanel = useCallback((intent?: string) => {
    setOpen(true);
    if (intent) void send(intent);
  }, [send]);

  const closePanel = useCallback(() => setOpen(false), []);

  /** Close first, then shoot, so the sheet is not in the picture. */
  const reportProblem = useCallback(async () => {
    setOpen(false);
    await new Promise((r) => setTimeout(r, 350));
    const shot = await captureScreenshot();
    setAutoShot(shot);
    setReportOpen(true);
  }, []);

  const value = useMemo<AssistantContextValue>(() => ({
    enabled, open, openPanel, closePanel, messages, busy, error, suggestions, wantsAttachment, pendingAction,
    draft, setDraft, send, confirm, cancel, newChat, reportProblem, pageContext,
  }), [enabled, open, openPanel, closePanel, messages, busy, error, suggestions, wantsAttachment, pendingAction, draft, send, confirm, cancel, newChat, reportProblem, pageContext]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <ReportIssueDialog
        open={reportOpen}
        onClose={() => { setReportOpen(false); setAutoShot(null); }}
        getToken={getToken}
        pageUrl={pathname}
        initialScreenshotFile={autoShot}
      />
    </Ctx.Provider>
  );
}

export function useAssistant(): AssistantContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAssistant must be used inside AssistantProvider');
  return v;
}

/** For chrome shared with other roles (TopBar): null when no provider is mounted. */
export function useAssistantOptional(): AssistantContextValue | null {
  return useContext(Ctx);
}
```

- [ ] **Step 6: Type-check**

Run: `pnpm --filter @neram/nexus type-check`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add apps/nexus/src/components/assistant/client.ts apps/nexus/src/components/assistant/client.test.ts apps/nexus/src/components/assistant/AssistantProvider.tsx
git commit -m "feat(assistant): browser client and AssistantProvider"
```

---

### Task 16: Panel components

**Files:**
- Create under `apps/nexus/src/components/assistant/`: `AssistantLauncher.tsx`, `AssistantSheet.tsx`, `QuickActions.tsx`, `MessageList.tsx`, `MessageBubble.tsx`, `SuggestionChips.tsx`, `Composer.tsx`, `ActionCard.tsx`
- Test: `AssistantLauncher.test.tsx`, `Composer.test.tsx`

**Interfaces:**
- Consumes: `useAssistant`, `useAssistantOptional` (Task 15), `uploadImage` (Task 15), `BOTTOM_NAV_HEIGHT` (`lib/shell-chrome.ts`).
- Produces: `<AssistantLauncher />`, `<AssistantSheet />` (mounted in Task 17).

Design rules for every file here: MUI from `@neram/ui`; icons from `@mui/icons-material`; 48px targets; 16px body text; skeletons; `prefers-reduced-motion`; no horizontal scroll at 375.

- [ ] **Step 1: Write the failing launcher test**

`AssistantLauncher.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AssistantLauncher from './AssistantLauncher';

let pathname = '/student/dashboard';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

const ctx = { enabled: true, open: false, openPanel: vi.fn() };
vi.mock('./AssistantProvider', () => ({ useAssistantOptional: () => ctx }));

beforeEach(() => {
  ctx.enabled = true;
  ctx.open = false;
  pathname = '/student/dashboard';
});

describe('AssistantLauncher', () => {
  it('renders one labelled, screenshot-excluded button and opens the panel', () => {
    render(<AssistantLauncher />);
    const btn = screen.getByRole('button', { name: 'Open Neram Assistant' });
    expect(btn).toHaveAttribute('data-no-screenshot', 'true');
    btn.click();
    expect(ctx.openPanel).toHaveBeenCalled();
  });
  it('hides on the sketchbook page, which has its own button', () => {
    pathname = '/student/sketchbook';
    render(<AssistantLauncher />);
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('hides while the panel is open and when the assistant is not enabled', () => {
    ctx.open = true;
    const { unmount } = render(<AssistantLauncher />);
    expect(screen.queryByRole('button')).toBeNull();
    unmount();
    ctx.open = false;
    ctx.enabled = false;
    render(<AssistantLauncher />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
```

- [ ] **Step 2: Implement AssistantLauncher.tsx**

```tsx
'use client';

import { usePathname } from 'next/navigation';
import { Fab, Tooltip } from '@neram/ui';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import { useAssistantOptional } from './AssistantProvider';

/**
 * The ONE floating button on student pages. It replaced the fixed "Report a
 * problem" button (now a quick action inside the sheet). The sketchbook page
 * keeps its own "Add a sketch" button in this corner, so the launcher steps
 * aside there; the top-bar icon and the dashboard card still open the panel.
 */
export default function AssistantLauncher() {
  const assistant = useAssistantOptional();
  const pathname = usePathname() || '';
  if (!assistant || !assistant.enabled || assistant.open) return null;
  if (pathname.startsWith('/student/sketchbook')) return null;

  return (
    <Tooltip title="Neram Assistant" placement="left">
      <Fab
        color="primary"
        size="medium"
        aria-label="Open Neram Assistant"
        onClick={() => assistant.openPanel()}
        data-no-screenshot="true"
        sx={{
          position: 'fixed',
          right: 16,
          // Above the bottom nav on phones, and above the sketchbook's scroll-to-top.
          bottom: { xs: 128, sm: 32 },
          minWidth: 56,
          minHeight: 56,
          zIndex: (t) => t.zIndex.speedDial,
        }}
      >
        <AutoAwesomeOutlinedIcon />
      </Fab>
    </Tooltip>
  );
}
```

Run: `pnpm vitest run apps/nexus/src/components/assistant/AssistantLauncher.test.tsx`
Expected: PASS.

- [ ] **Step 3: Implement SuggestionChips.tsx and MessageBubble.tsx**

`SuggestionChips.tsx`:

```tsx
'use client';

import { Box, Chip } from '@neram/ui';
import type { Suggestion } from './client';

/** One row of tappable prompts. Scrolls sideways inside its own box, never the page. */
export default function SuggestionChips({ items, onPick, disabled }: { items: Suggestion[]; onPick: (send: string) => void; disabled?: boolean }) {
  if (items.length === 0) return null;
  return (
    <Box
      role="list"
      aria-label="Suggestions"
      sx={{ display: 'flex', gap: 1, overflowX: 'auto', px: 2, py: 1, scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}
    >
      {items.map((s) => (
        <Chip
          key={s.label}
          role="listitem"
          data-testid="assistant-chip"
          label={s.label}
          onClick={() => onPick(s.send)}
          disabled={disabled}
          variant="outlined"
          sx={{ height: 48, borderRadius: 24, fontSize: '0.9375rem', px: 0.5, flexShrink: 0, cursor: 'pointer' }}
        />
      ))}
    </Box>
  );
}
```

`MessageBubble.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { Box, Button, Paper, Skeleton, Typography, alpha, useTheme } from '@neram/ui';
import OpenInNewOutlinedIcon from '@mui/icons-material/OpenInNewOutlined';
import type { AssistantMessage } from './AssistantProvider';

export default function MessageBubble({ message }: { message: AssistantMessage }) {
  const theme = useTheme();
  const mine = message.role === 'user';
  if (message.pending) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'flex-start', px: 2, py: 0.5 }} aria-label="Neram Assistant is thinking">
        <Paper elevation={0} sx={{ p: 1.5, borderRadius: 3, width: '70%', bgcolor: alpha(theme.palette.primary.main, 0.06) }}>
          <Skeleton width="90%" /><Skeleton width="75%" /><Skeleton width="40%" />
        </Paper>
      </Box>
    );
  }
  const links = message.envelope?.links || [];
  return (
    <Box sx={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', px: 2, py: 0.5 }}>
      <Paper
        elevation={0}
        sx={{
          p: 1.5, borderRadius: 3, maxWidth: '85%',
          bgcolor: mine ? 'primary.main' : alpha(theme.palette.primary.main, 0.06),
          color: mine ? 'primary.contrastText' : 'text.primary',
        }}
      >
        <Typography variant="body1" sx={{ whiteSpace: 'pre-line', lineHeight: 1.5 }}>{message.text}</Typography>
        {links.length > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1.5 }}>
            {links.map((l) => (
              <Button key={l.url} component={Link} href={l.url} variant="outlined" size="medium" endIcon={<OpenInNewOutlinedIcon />} sx={{ minHeight: 44, textTransform: 'none', fontWeight: 700 }}>
                {l.label}
              </Button>
            ))}
          </Box>
        )}
      </Paper>
    </Box>
  );
}
```

- [ ] **Step 4: Implement MessageList.tsx and ActionCard.tsx**

`MessageList.tsx`:

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { Box, useMediaQuery } from '@neram/ui';
import type { AssistantMessage } from './AssistantProvider';
import MessageBubble from './MessageBubble';

export default function MessageList({ messages }: { messages: AssistantMessage[] }) {
  const endRef = useRef<HTMLDivElement>(null);
  const reduce = useMediaQuery('(prefers-reduced-motion: reduce)');
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'end' });
  }, [messages, reduce]);
  return (
    <Box role="log" aria-live="polite" aria-relevant="additions" sx={{ flex: 1, overflowY: 'auto', py: 1 }}>
      {messages.map((m) => <MessageBubble key={m.id} message={m} />)}
      <div ref={endRef} />
    </Box>
  );
}
```

`ActionCard.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Box, Button, Paper, Typography } from '@neram/ui';
import type { ActionProposal } from './client';

function minutesLeft(expiresAt: string): number {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - Date.now()) / 60_000));
}

/** The one place a write is approved. Every field visible, three equal-weight buttons. */
export default function ActionCard({ action, busy, onConfirm, onEdit, onCancel }: {
  action: ActionProposal; busy: boolean; onConfirm: () => void; onEdit: () => void; onCancel: () => void;
}) {
  const [left, setLeft] = useState(() => minutesLeft(action.expiresAt));
  useEffect(() => {
    const t = setInterval(() => setLeft(minutesLeft(action.expiresAt)), 30_000);
    return () => clearInterval(t);
  }, [action.expiresAt]);
  return (
    <Paper elevation={0} role="group" aria-label="Confirm this action" sx={{ mx: 2, my: 1, p: 2, borderRadius: 3, border: (t) => `1px solid ${t.palette.divider}` }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>{action.summary}</Typography>
      <Box component="dl" sx={{ m: 0, mb: 1.5, display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 2, rowGap: 0.5 }}>
        {action.fields.map((f) => (
          <Box key={f.label} sx={{ display: 'contents' }}>
            <Typography component="dt" variant="body2" color="text.secondary">{f.label}</Typography>
            <Typography component="dd" variant="body2" sx={{ m: 0 }}>{f.value}</Typography>
          </Box>
        ))}
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
        {left > 0 ? `Expires in ${left} min` : 'Expired. Ask me again and I will set it up fresh.'}
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Button variant="contained" onClick={onConfirm} disabled={busy || left === 0} sx={{ minHeight: 48, flex: 1, textTransform: 'none', fontWeight: 700 }}>Confirm</Button>
        <Button variant="text" onClick={onEdit} disabled={busy} sx={{ minHeight: 48, textTransform: 'none' }}>Edit</Button>
        <Button variant="outlined" onClick={onCancel} disabled={busy} sx={{ minHeight: 48, textTransform: 'none' }}>Cancel</Button>
      </Box>
    </Paper>
  );
}
```

- [ ] **Step 5: Write the failing Composer test**

`Composer.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Composer from './Composer';

const upload = vi.fn(async () => ({ original_image_url: 'https://cdn.test/a.jpg', thumbnail_url: null }));

function setup(props: Partial<React.ComponentProps<typeof Composer>> = {}) {
  const onSend = vi.fn(async () => undefined);
  render(<Composer onSend={onSend} busy={false} wantsAttachment={false} draft="" onDraftConsumed={() => {}} upload={upload} {...props} />);
  return { onSend };
}

describe('Composer', () => {
  it('sends on Enter and keeps Shift+Enter as a newline', async () => {
    const { onSend } = setup();
    const box = screen.getByRole('textbox', { name: 'Message Neram Assistant' });
    fireEvent.change(box, { target: { value: 'hello' } });
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('hello', null));
  });

  it('refuses a non-image file before uploading and keeps the typed text', async () => {
    const { onSend } = setup();
    const box = screen.getByRole('textbox', { name: 'Message Neram Assistant' });
    fireEvent.change(box, { target: { value: 'my sketch' } });
    const input = screen.getByTestId('assistant-file-input') as HTMLInputElement;
    const file = new File(['x'], 'notes.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByText(/Only photos can be attached/)).toBeInTheDocument();
    expect(upload).not.toHaveBeenCalled();
    expect(box).toHaveValue('my sketch');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('refuses a file over 12 MB', async () => {
    setup();
    const input = screen.getByTestId('assistant-file-input') as HTMLInputElement;
    const big = new File([new Uint8Array(1)], 'big.jpg', { type: 'image/jpeg' });
    Object.defineProperty(big, 'size', { value: 13 * 1024 * 1024 });
    fireEvent.change(input, { target: { files: [big] } });
    expect(await screen.findByText(/smaller than 12 MB/)).toBeInTheDocument();
    expect(upload).not.toHaveBeenCalled();
  });

  it('uploads an image, shows it, and sends it with the text', async () => {
    const { onSend } = setup();
    const input = screen.getByTestId('assistant-file-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] } });
    await waitFor(() => expect(upload).toHaveBeenCalled());
    expect(await screen.findByAltText('Attached sketch')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('', { original_image_url: 'https://cdn.test/a.jpg', thumbnail_url: null }));
  });

  it('send and attach buttons are at least 48px', () => {
    setup();
    for (const name of ['Send', 'Attach a photo']) {
      const b = screen.getByRole('button', { name });
      expect(b.className).toMatch(/MuiIconButton/);
      expect(getComputedStyle(b).minHeight === '48px' || b.getAttribute('data-size') === '48').toBe(true);
    }
  });
});
```

- [ ] **Step 6: Implement Composer.tsx**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { Box, CircularProgress, IconButton, TextField, Typography } from '@neram/ui';
import CameraAltOutlinedIcon from '@mui/icons-material/CameraAltOutlined';
import CloseIcon from '@mui/icons-material/Close';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import type { Attachment, GetToken } from './client';

const MAX_BYTES = 12 * 1024 * 1024;
const MAX_CHARS = 2000;

export default function Composer({ onSend, busy, wantsAttachment, draft, onDraftConsumed, upload, getToken }: {
  onSend: (text: string, attachment: Attachment | null) => Promise<void>;
  busy: boolean;
  wantsAttachment: boolean;
  /** Text pushed in from outside (Edit on an action card). Consumed once. */
  draft: string;
  onDraftConsumed: () => void;
  /** Injected so tests need no network. Defaults to uploadImage in the sheet. */
  upload: (getToken: GetToken, file: File) => Promise<Attachment>;
  getToken?: GetToken;
}) {
  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!draft) return;
    setText(draft);
    onDraftConsumed();
    boxRef.current?.focus();
  }, [draft, onDraftConsumed]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('Only photos can be attached here.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('That photo is too big. Choose one smaller than 12 MB.');
      return;
    }
    setUploading(true);
    try {
      setAttachment(await upload(getToken || (async () => null), file));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Try again.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const submit = async () => {
    if (busy || uploading) return;
    const t = text.trim();
    if (!t && !attachment) return;
    await onSend(t, attachment);
    setText('');
    setAttachment(null);
  };

  return (
    <Box sx={{ borderTop: (th) => `1px solid ${th.palette.divider}`, px: 1.5, pt: 1, pb: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}>
      {attachment && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Box component="img" src={attachment.thumbnail_url || attachment.original_image_url} alt="Attached sketch" sx={{ width: 56, height: 56, borderRadius: 1.5, objectFit: 'cover' }} />
          <Typography variant="body2" sx={{ flex: 1 }}>Photo attached</Typography>
          <IconButton aria-label="Remove photo" onClick={() => setAttachment(null)} sx={{ width: 48, height: 48 }}><CloseIcon /></IconButton>
        </Box>
      )}
      {error && <Typography role="alert" variant="body2" color="error" sx={{ mb: 1 }}>{error}</Typography>}
      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.5 }}>
        <input ref={fileRef} data-testid="assistant-file-input" type="file" accept="image/*" capture="environment" onChange={(e) => void pick(e.target.files?.[0])} style={{ display: 'none' }} />
        <IconButton
          aria-label="Attach a photo"
          color={wantsAttachment ? 'primary' : 'default'}
          onClick={() => fileRef.current?.click()}
          disabled={busy || uploading}
          data-size="48"
          sx={{ width: 48, height: 48, minHeight: 48 }}
        >
          {uploading ? <CircularProgress size={22} /> : <CameraAltOutlinedIcon />}
        </IconButton>
        <TextField
          inputRef={boxRef}
          multiline
          maxRows={4}
          fullWidth
          size="small"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder={wantsAttachment ? 'Attach a photo, or type' : 'Ask or tell me what to do'}
          inputProps={{ 'aria-label': 'Message Neram Assistant', style: { fontSize: 16, lineHeight: 1.5 } }}
          disabled={busy}
        />
        <IconButton
          aria-label="Send"
          color="primary"
          onClick={() => void submit()}
          disabled={busy || uploading || (!text.trim() && !attachment)}
          data-size="48"
          sx={{ width: 48, height: 48, minHeight: 48 }}
        >
          <SendRoundedIcon />
        </IconButton>
      </Box>
    </Box>
  );
}
```

Run: `pnpm vitest run apps/nexus/src/components/assistant/Composer.test.tsx`
Expected: PASS. (If the 48px assertion flakes under jsdom, assert on `data-size="48"` alone and keep the real check in the E2E test.)

- [ ] **Step 7: Implement QuickActions.tsx and AssistantSheet.tsx**

`QuickActions.tsx`:

```tsx
'use client';

import { Box, ListItemButton, ListItemIcon, ListItemText, Typography } from '@neram/ui';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined';
import NotificationsNoneOutlinedIcon from '@mui/icons-material/NotificationsNoneOutlined';
import TodayOutlinedIcon from '@mui/icons-material/TodayOutlined';

export interface QuickAction { label: string; hint: string; icon: React.ReactNode; onPick: () => void }

/** The empty-panel menu. Rows, not tiles: five of them read as a list on a phone. */
export default function QuickActions({ onSend, onReport }: { onSend: (text: string) => void; onReport: () => void }) {
  const items: QuickAction[] = [
    { label: "What's on today?", hint: 'Your classes, work due and reminders', icon: <TodayOutlinedIcon />, onPick: () => onSend('brief') },
    { label: "I can't attend a class", hint: 'Tell your teacher, one class or several days', icon: <EventBusyOutlinedIcon />, onPick: () => onSend("I can't attend a class") },
    { label: 'Remind me', hint: 'A reminder on the day you choose', icon: <NotificationsNoneOutlinedIcon />, onPick: () => onSend('Remind me') },
    { label: 'Add a sketch', hint: 'Snap it and it goes in your sketchbook', icon: <BrushOutlinedIcon />, onPick: () => onSend('Add a sketch') },
    { label: 'Report a problem', hint: 'Something on this page is not right', icon: <BugReportOutlinedIcon />, onPick: onReport },
  ];
  return (
    <Box sx={{ px: 1, py: 1 }}>
      <Typography variant="caption" sx={{ px: 1.5, pb: 0.5, display: 'block', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'text.secondary' }}>What I can do</Typography>
      {items.map((it) => (
        <ListItemButton key={it.label} onClick={it.onPick} sx={{ borderRadius: 2, minHeight: 56, px: 1.5 }}>
          <ListItemIcon sx={{ minWidth: 40, color: 'primary.main' }}>{it.icon}</ListItemIcon>
          <ListItemText primary={it.label} secondary={it.hint} primaryTypographyProps={{ fontWeight: 600 }} />
        </ListItemButton>
      ))}
    </Box>
  );
}
```

`AssistantSheet.tsx`:

```tsx
'use client';

import { useCallback } from 'react';
import { Box, Drawer, IconButton, SwipeableDrawer, Typography, alpha, useMediaQuery, useTheme } from '@neram/ui';
import AddCommentOutlinedIcon from '@mui/icons-material/AddCommentOutlined';
import CloseIcon from '@mui/icons-material/Close';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import ActionCard from './ActionCard';
import { useAssistant } from './AssistantProvider';
import { uploadImage } from './client';
import Composer from './Composer';
import MessageList from './MessageList';
import QuickActions from './QuickActions';
import SuggestionChips from './SuggestionChips';

export const SHEET_WIDTH = 420;

export default function AssistantSheet() {
  const a = useAssistant();
  const { getToken } = useNexusAuthContext();
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up('md'));
  const reduce = useMediaQuery('(prefers-reduced-motion: reduce)');
  const onEdit = useCallback(() => a.setDraft('Change: '), [a]);

  if (!a.enabled) return null;

  const body = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <Typography variant="h6" component="h2" sx={{ flex: 1, fontWeight: 700 }}>Neram Assistant</Typography>
        <IconButton aria-label="New chat" onClick={() => void a.newChat()} sx={{ width: 48, height: 48 }}><AddCommentOutlinedIcon /></IconButton>
        <IconButton aria-label="Close" onClick={a.closePanel} sx={{ width: 48, height: 48 }}><CloseIcon /></IconButton>
      </Box>
      {a.messages.length === 0 ? (
        <Box sx={{ flex: 1, overflowY: 'auto' }}><QuickActions onSend={(t) => void a.send(t)} onReport={() => void a.reportProblem()} /></Box>
      ) : (
        <MessageList messages={a.messages} />
      )}
      {a.pendingAction && <ActionCard action={a.pendingAction} busy={a.busy} onConfirm={() => void a.confirm()} onEdit={onEdit} onCancel={() => void a.cancel()} />}
      {a.error && <Typography role="alert" variant="body2" color="error" sx={{ px: 2, py: 1 }}>{a.error}</Typography>}
      <SuggestionChips items={a.messages.length ? a.suggestions : []} onPick={(s) => void a.send(s)} disabled={a.busy} />
      <Composer onSend={a.send} busy={a.busy} wantsAttachment={a.wantsAttachment} draft={a.draft} onDraftConsumed={() => a.setDraft('')} upload={uploadImage} getToken={getToken} />
    </Box>
  );

  if (desktop) {
    return (
      <Drawer anchor="right" open={a.open} onClose={a.closePanel} transitionDuration={reduce ? 0 : undefined} PaperProps={{ sx: { width: SHEET_WIDTH, maxWidth: '100vw' }, 'aria-label': 'Neram Assistant' } as never}>
        {body}
      </Drawer>
    );
  }
  return (
    <SwipeableDrawer
      anchor="bottom"
      open={a.open}
      onClose={a.closePanel}
      onOpen={() => a.openPanel()}
      disableSwipeToOpen
      swipeAreaWidth={0}
      transitionDuration={reduce ? 0 : undefined}
      slotProps={{ backdrop: { sx: { bgcolor: alpha(theme.palette.common.black, 0.3) } } }}
      PaperProps={{ sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, height: '85vh', overscrollBehavior: 'contain' }, 'aria-label': 'Neram Assistant' } as never}
    >
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1.5 }}>
        <Box sx={{ width: 32, height: 4, borderRadius: 2, bgcolor: alpha(theme.palette.text.secondary, 0.3) }} />
      </Box>
      {body}
    </SwipeableDrawer>
  );
}
```

- [ ] **Step 8: Run the component tests, type-check and lint**

Run: `pnpm vitest run apps/nexus/src/components/assistant && pnpm --filter @neram/nexus type-check && pnpm --filter @neram/nexus lint`
Expected: PASS, clean, clean.

- [ ] **Step 9: Commit**

```bash
git add apps/nexus/src/components/assistant
git commit -m "feat(assistant): launcher, sheet, messages, chips, composer with photo attach, action card"
```

---

### Task 17: Brief card, top-bar button, and the mounts

**Files:**
- Create: `apps/nexus/src/components/assistant/BriefCard.tsx`, `AssistantTopBarButton.tsx`
- Modify: `apps/nexus/src/app/(student)/layout.tsx`, `apps/nexus/src/app/(student)/student/dashboard/page.tsx:272`, `apps/nexus/src/components/TopBar.tsx:399`
- Delete: `apps/nexus/src/components/ReportIssueFab.tsx`
- Test: `apps/nexus/src/components/assistant/BriefCard.test.tsx`

**Interfaces:**
- Consumes: `useAuthSWR` (`lib/nexus-swr.ts`), `Brief` type (Task 11), `useAssistantOptional` (Task 15).

- [ ] **Step 1: Write the failing BriefCard test**

```tsx
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BriefCard from './BriefCard';

const swr = { data: undefined as unknown, error: undefined as unknown, isLoading: false };
vi.mock('@/lib/nexus-swr', () => ({ useAuthSWR: () => swr }));
vi.mock('@/hooks/useNexusAuth', () => ({ useNexusAuthContext: () => ({ tokenReady: true, isFeatureEnabled: () => true }) }));
const assistant = { enabled: true, openPanel: vi.fn() };
vi.mock('./AssistantProvider', () => ({ useAssistantOptional: () => assistant }));
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a> }));

beforeEach(() => { swr.data = undefined; swr.error = undefined; swr.isLoading = false; assistant.openPanel.mockReset(); });

describe('BriefCard', () => {
  it('shows a skeleton while loading, reserving the space', () => {
    swr.isLoading = true;
    render(<BriefCard />);
    expect(screen.getByTestId('brief-skeleton')).toBeInTheDocument();
  });
  it('renders the greeting, sections with links, and the two buttons', () => {
    swr.data = { brief: { greeting: 'Good morning, Priya', classroomName: 'JEE', hasContent: true, sections: [
      { id: 'next_class', text: 'Class today at 6:00 pm: Perspective.', link: '/student/timetable' },
      { id: 'reminders', text: 'You asked me to remind you today: bring the sketchbook.', link: null },
    ] } };
    render(<BriefCard />);
    expect(screen.getByText('Good morning, Priya')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Class today at 6:00 pm/ })).toHaveAttribute('href', '/student/timetable');
    expect(screen.getByText(/bring the sketchbook/)).toBeInTheDocument();
    screen.getByRole('button', { name: 'Ask' }).click();
    expect(assistant.openPanel).toHaveBeenCalledWith();
    screen.getByRole('button', { name: "Can't attend" }).click();
    expect(assistant.openPanel).toHaveBeenCalledWith("I can't attend a class");
  });
  it('renders nothing when there is nothing to say or the server refused', () => {
    swr.data = { brief: { greeting: 'Hi', classroomName: null, hasContent: false, sections: [] } };
    const { container, unmount } = render(<BriefCard />);
    expect(container).toBeEmptyDOMElement();
    unmount();
    swr.data = undefined;
    swr.error = { status: 403 };
    expect(render(<BriefCard />).container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Implement BriefCard.tsx**

```tsx
'use client';

import Link from 'next/link';
import { Box, Button, Paper, Skeleton, Typography, alpha, useTheme } from '@neram/ui';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useAuthSWR } from '@/lib/nexus-swr';
import type { Brief } from '@/lib/assistant/brief';
import { useAssistantOptional } from './AssistantProvider';
import { ASSISTANT_FLAG } from './client';

/**
 * "Your day", at the top of the student dashboard. Deterministic: the server
 * builds it from the same loaders as the pages it links to, so nothing here
 * can disagree with the page behind the link. Nothing to say means no card.
 */
export default function BriefCard() {
  const theme = useTheme();
  const { tokenReady, isFeatureEnabled } = useNexusAuthContext();
  const assistant = useAssistantOptional();
  const on = tokenReady && isFeatureEnabled(ASSISTANT_FLAG);
  const { data, error, isLoading } = useAuthSWR<{ brief: Brief }>(on ? '/api/assistant/brief' : null);

  if (!on || error) return null;
  if (isLoading || !data) {
    return (
      <Paper data-testid="brief-skeleton" elevation={0} sx={{ p: 2, mb: 2, borderRadius: 3, border: `1px solid ${theme.palette.divider}` }}>
        <Skeleton width="40%" height={28} /><Skeleton width="90%" /><Skeleton width="70%" /><Skeleton width="60%" />
      </Paper>
    );
  }
  const { brief } = data;
  if (!brief.hasContent) return null;

  return (
    <Paper elevation={0} component="section" aria-labelledby="brief-title" sx={{ p: 2, mb: 2, borderRadius: 3, border: `1px solid ${theme.palette.divider}`, bgcolor: alpha(theme.palette.primary.main, 0.03) }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <AutoAwesomeOutlinedIcon fontSize="small" color="primary" />
        <Typography id="brief-title" variant="subtitle1" sx={{ fontWeight: 700 }}>{brief.greeting}</Typography>
      </Box>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {brief.sections.map((s) => (
          <Box component="li" key={s.id}>
            {s.link ? (
              <Button component={Link} href={s.link} endIcon={<ChevronRightIcon />} sx={{ justifyContent: 'space-between', width: '100%', minHeight: 48, textTransform: 'none', textAlign: 'left', color: 'text.primary', px: 1 }}>
                <Typography variant="body1" sx={{ lineHeight: 1.5 }}>{s.text}</Typography>
              </Button>
            ) : (
              <Typography variant="body1" sx={{ px: 1, py: 1.5, lineHeight: 1.5 }}>{s.text}</Typography>
            )}
          </Box>
        ))}
      </Box>
      {assistant?.enabled && (
        <Box sx={{ display: 'flex', gap: 1, mt: 1.5 }}>
          <Button variant="contained" onClick={() => assistant.openPanel()} sx={{ minHeight: 48, textTransform: 'none', fontWeight: 700 }}>Ask</Button>
          <Button variant="outlined" onClick={() => assistant.openPanel("I can't attend a class")} sx={{ minHeight: 48, textTransform: 'none', fontWeight: 700 }}>Can&apos;t attend</Button>
        </Box>
      )}
    </Paper>
  );
}
```

Run: `pnpm vitest run apps/nexus/src/components/assistant/BriefCard.test.tsx`
Expected: PASS.

- [ ] **Step 3: Implement AssistantTopBarButton.tsx**

```tsx
'use client';

import { IconButton, Tooltip } from '@neram/ui';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import { useAssistantOptional } from './AssistantProvider';

/** Desktop only: on phones the launcher owns the corner. Null outside the student shell. */
export default function AssistantTopBarButton() {
  const a = useAssistantOptional();
  if (!a || !a.enabled) return null;
  return (
    <Tooltip title="Neram Assistant">
      <IconButton aria-label="Open Neram Assistant" onClick={() => a.openPanel()} size="small" sx={{ color: 'inherit', mr: 0.5, display: { xs: 'none', md: 'inline-flex' }, width: 44, height: 44 }}>
        <AutoAwesomeOutlinedIcon />
      </IconButton>
    </Tooltip>
  );
}
```

- [ ] **Step 4: Mount everything**

`apps/nexus/src/app/(student)/layout.tsx`:
- Replace `import ReportIssueFab from '@/components/ReportIssueFab';` with
  ```ts
  import { AssistantProvider } from '@/components/assistant/AssistantProvider';
  import AssistantLauncher from '@/components/assistant/AssistantLauncher';
  import AssistantSheet from '@/components/assistant/AssistantSheet';
  ```
- Replace `<ReportIssueFab />` (line 88) with `<AssistantLauncher />` and `<AssistantSheet />` on consecutive lines.
- In `StudentLayout`, wrap the shell: `<StudentZoneProvider qbExams={qbExams}><AssistantProvider><StudentShell>{children}</StudentShell></AssistantProvider></StudentZoneProvider>`.
- The chromeless (Focus Mode) branch of `StudentShell` renders neither the launcher nor the sheet; leave it as it is.

`apps/nexus/src/components/TopBar.tsx`: add `import AssistantTopBarButton from '@/components/assistant/AssistantTopBarButton';` and, directly above `{nexusRole !== 'parent' && <NotificationBell />}` (line 399), insert `{nexusRole === 'student' && <AssistantTopBarButton />}`.

`apps/nexus/src/app/(student)/student/dashboard/page.tsx`: add `import BriefCard from '@/components/assistant/BriefCard';` and insert `<BriefCard />` directly after `<AwayBanner />` (line 272).

Delete the old button: `git rm apps/nexus/src/components/ReportIssueFab.tsx`. (Only the student layout imported it; the grep in this plan's preparation found no other reference.)

- [ ] **Step 5: Run everything, type-check, lint, and the existing E2E that touches the dashboard**

Run: `pnpm vitest run apps/nexus/src/components/assistant apps/nexus/src/lib/assistant && pnpm --filter @neram/nexus type-check && pnpm --filter @neram/nexus lint`
Expected: PASS, clean, clean.

Then, with the Nexus dev server running on :3012 (`pnpm dev:nexus` in another terminal): `pnpm exec playwright test --project=nexus-mobile tests/e2e/dashboard-nexus.spec.ts tests/e2e/away-windows-nexus.spec.ts`
Expected: PASS (the brief card returns 404 while the flag is off, and renders nothing).

- [ ] **Step 6: Commit**

```bash
git add apps/nexus/src/components/assistant apps/nexus/src/components/TopBar.tsx "apps/nexus/src/app/(student)/layout.tsx" "apps/nexus/src/app/(student)/student/dashboard/page.tsx"
git rm -q apps/nexus/src/components/ReportIssueFab.tsx
git commit -m "feat(assistant): brief card, top-bar button, student mounts; Report a problem moves into the assistant"
```

---

### Task 18: End-to-end test at phone and desktop widths

**Files:**
- Create: `tests/e2e/assistant-nexus-mobile.spec.ts`

**Interfaces:**
- Consumes: `injectAuthForPage`, `APP_URLS` (`tests/utils/credentials.ts`), `assertNoHorizontalOverflow`, `assertTouchTargetSize` (`tests/utils/mobile-helpers.ts`). The test-mode session enables every feature flag (`allFeaturesEnabled()` in `useNexusAuth`), so the launcher renders. The server routes are stubbed with `page.route`, so no database row and no model call is made.

- [ ] **Step 1: Write the spec**

```ts
import { test, expect, type Page } from '@playwright/test';
import { APP_URLS, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

/**
 * Neram Assistant M1 on a phone and on a desktop.
 *
 * The server side is stubbed: the brief and the turn answer with fixtures, so
 * this file holds the facts that have to be true on screen. One floating
 * button on student pages. The sheet opens, the quick actions are there, a
 * reply renders with chips of a tappable size, the page never scrolls
 * sideways, and Report a problem still works from inside the assistant.
 *
 * Self-skips without the Nexus dev server on :3012.
 */

const NEXUS = APP_URLS.nexus;

const BRIEF = {
  brief: {
    greeting: 'Good evening, Priya',
    classroomName: 'JEE B.Arch Session 1',
    hasContent: true,
    sections: [
      { id: 'next_class', text: 'Class today at 6:00 pm: Perspective.', link: '/student/timetable' },
      { id: 'assignments', text: '2 assignments to submit. Shading sheet is due tomorrow.', link: '/student/assignments' },
    ],
  },
};

function envelope(reply: string, extra: Record<string, unknown> = {}) {
  return {
    reply,
    suggestions: [
      { label: 'Tomorrow 6:00 pm: Perspective', send: 'Tomorrow 6:00 pm: Perspective' },
      { label: 'Several days', send: 'Several days' },
    ],
    links: [],
    action: null,
    mode: 'general',
    threadId: 'thread-e2e',
    ...extra,
  };
}

async function stubAssistant(page: Page) {
  await page.route('**/api/assistant/brief**', (route) => route.fulfill({ json: BRIEF }));
  await page.route('**/api/assistant/turn**', async (route) => {
    const body = route.request().postDataJSON() as { text?: string };
    const text = body?.text || '';
    if (/can'?t attend/i.test(text)) return route.fulfill({ json: envelope('Which class can you not attend?') });
    if (/Perspective/.test(text)) return route.fulfill({ json: envelope('Perspective, tomorrow at 6:00 pm. Why can you not make it?', { suggestions: [{ label: 'Feeling unwell', send: 'Feeling unwell' }] }) });
    if (/unwell/i.test(text)) {
      return route.fulfill({ json: envelope('Here is what I will tell your teacher. Confirm and it is done.', {
        suggestions: [],
        action: { id: 'act-1', kind: 'decline_class', summary: 'Tell your teacher you cannot attend Perspective on Tomorrow at 6:00 pm.', fields: [{ label: 'Class', value: 'Perspective' }, { label: 'Reason', value: 'Feeling unwell' }], confirmToken: 'ct', expiresAt: new Date(Date.now() + 600_000).toISOString() },
      }) });
    }
    return route.fulfill({ json: envelope('I cannot answer free questions yet. Here is what I can do right now.') });
  });
  await page.route('**/api/assistant/actions/**', (route) => route.fulfill({ json: { ok: true, reply: 'Done. Your teacher knows you cannot attend Perspective.', links: [{ label: 'Timetable', url: '/student/timetable' }], threadId: 'thread-e2e' } }));
}

async function openDashboard(page: Page): Promise<boolean> {
  const ok = await injectAuthForPage(page, 'student');
  if (!ok) return false;
  await stubAssistant(page);
  await page.goto(`${NEXUS}/student/dashboard`, { waitUntil: 'domcontentloaded' });
  try {
    await expect(page.getByText('Good evening, Priya')).toBeVisible({ timeout: 30_000 });
    return true;
  } catch {
    return false;
  }
}

test.describe('Neram Assistant on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test.describe.configure({ timeout: 120_000 });

  test('one floating button, above the bottom nav, and the brief card', async ({ page }) => {
    if (!(await openDashboard(page))) { test.skip(true, 'Nexus dev server or student session unavailable'); return; }
    const fabs = page.locator('[data-no-screenshot="true"]');
    await expect(fabs).toHaveCount(1);
    const launcher = page.getByRole('button', { name: 'Open Neram Assistant' });
    await expect(launcher).toBeVisible();
    const box = (await launcher.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(56);
    expect(box.y + box.height).toBeLessThanOrEqual(812 - 64);
    await expect(page.getByRole('link', { name: /Class today at 6:00 pm/ })).toHaveAttribute('href', '/student/timetable');
    await assertNoHorizontalOverflow(page);
  });

  test('the guided flow runs to a confirmation card, with tappable chips', async ({ page }) => {
    if (!(await openDashboard(page))) { test.skip(true, 'Nexus dev server or student session unavailable'); return; }
    await page.getByRole('button', { name: 'Open Neram Assistant' }).click();
    const sheet = page.getByLabel('Neram Assistant', { exact: true });
    await expect(sheet).toBeVisible();
    const sheetBox = (await sheet.boundingBox())!;
    expect(sheetBox.height).toBeGreaterThan(812 * 0.8);

    await page.getByRole('button', { name: "I can't attend a class" }).click();
    await expect(page.getByText('Which class can you not attend?')).toBeVisible();
    await assertTouchTargetSize(page, '[data-testid="assistant-chip"]', 48);
    await assertTouchTargetSize(page, 'button[aria-label="Send"]', 48);

    await page.getByTestId('assistant-chip').filter({ hasText: 'Perspective' }).click();
    await expect(page.getByText(/Why can you not make it/)).toBeVisible();
    await page.getByTestId('assistant-chip').filter({ hasText: 'Feeling unwell' }).click();
    await expect(page.getByRole('group', { name: 'Confirm this action' })).toBeVisible();
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText(/Your teacher knows you cannot attend/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Timetable' })).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  test('Report a problem still opens the dialog from inside the assistant', async ({ page }) => {
    if (!(await openDashboard(page))) { test.skip(true, 'Nexus dev server or student session unavailable'); return; }
    await page.getByRole('button', { name: 'Open Neram Assistant' }).click();
    await page.getByRole('button', { name: 'Report a problem' }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('dialog').getByText(/Report/i).first()).toBeVisible();
  });
});

test.describe('Neram Assistant on a desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test.describe.configure({ timeout: 120_000 });

  test('the top-bar icon opens a right-hand drawer', async ({ page }) => {
    if (!(await openDashboard(page))) { test.skip(true, 'Nexus dev server or student session unavailable'); return; }
    const icons = page.getByRole('button', { name: 'Open Neram Assistant' });
    await expect(icons.first()).toBeVisible();
    await icons.first().click();
    const drawer = page.getByLabel('Neram Assistant', { exact: true });
    await expect(drawer).toBeVisible();
    const box = (await drawer.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(400);
    expect(box.x + box.width).toBeGreaterThanOrEqual(1270);
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await assertNoHorizontalOverflow(page);
  });
});
```

- [ ] **Step 2: Run it against the dev server**

Start the server in another terminal: `pnpm dev:nexus`. Then:

Run: `pnpm exec playwright test --project=nexus-mobile tests/e2e/assistant-nexus-mobile.spec.ts`
Expected: 4 passed (or skipped with the stated reason when the server is down, never a failure for an environment cause).

If the `aria-label` on the drawer paper is not picked up by `getByLabel`, use `page.locator('.MuiDrawer-paper')` for the sheet locator and keep the assertions.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/assistant-nexus-mobile.spec.ts
git commit -m "test(assistant): Playwright coverage for the launcher, sheet, guided flow and Report a problem"
```

---

### Task 19: Design review and the final sweep

**Files:**
- Modify: whatever the review finds, within `apps/nexus/src/components/assistant/`

- [ ] **Step 1: Run the design skill against the built screens**

Invoke `/ui-ux-pro-max` with: `review the Neram Assistant student panel in apps/nexus/src/components/assistant at 375px and 1280px: launcher, bottom sheet, quick actions, chips, composer, action card, brief card`. Walk its pre-delivery checklist against the real screens in the browser (dev server on :3012, flag `student.assistant-chat` on in `nexus_settings.feature_flags` for your dev account, or the pilot allowlist containing your user id):

- No emoji used as icons; every icon is an `@mui/icons-material` SVG.
- Every tappable thing is at least 48px tall (chips, send, attach, quick-action rows, card buttons, brief links).
- Focus is trapped in the sheet, Escape closes it, focus returns to the launcher.
- Text contrast on the user bubble (primary on primary.contrastText) and the assistant bubble meets 4.5:1 in the current theme.
- The keyboard on a phone does not cover the composer (the sheet is 85vh and the composer sits above the safe-area inset).
- `prefers-reduced-motion`: open and close happen without animation, the message list jumps rather than smooth-scrolls.
- No horizontal scroll at 375, 768, 1024, 1440.
- Skeletons, never spinners, for the brief card and the pending reply (the only spinner is inside the attach button while a photo uploads, where it signals a short wait on a button).

Fix every finding inline, re-run `pnpm vitest run apps/nexus/src/components/assistant` and the Playwright spec, and commit.

- [ ] **Step 2: Full M1 verification**

```bash
pnpm vitest run apps/nexus/src/lib/assistant apps/nexus/src/app/api/assistant apps/nexus/src/components/assistant apps/nexus/src/lib/upcoming-classes.test.ts apps/nexus/src/lib/rsvp-write.test.ts apps/nexus/src/lib/away-windows-write.test.ts apps/nexus/src/lib/sketchbook-add.test.ts apps/nexus/src/lib/feature-flags.test.ts apps/nexus/src/lib/notification-door-guard.test.ts apps/nexus/src/lib/sender-classification.test.ts
pnpm --filter @neram/nexus type-check
pnpm --filter @neram/nexus lint
pnpm exec playwright test --project=nexus-mobile tests/e2e/assistant-nexus-mobile.spec.ts tests/e2e/dashboard-nexus.spec.ts tests/e2e/away-windows-nexus.spec.ts tests/e2e/sketchbook-nexus-mobile.spec.ts
```

Expected: all green. `notification-door-guard` and `sender-classification` must stay green untouched: M1 sends no messages, and the two extracted writers still call the same `notifyRsvpToTeacher` and `sendNudge` paths the routes did.

- [ ] **Step 3: Manual walk on a real phone (founder)**

With the flag on for one account: open the dashboard (brief card), tap the launcher, run "I can't attend" to a real RSVP, run "Remind me tomorrow to practise" and check the row in `nexus_assistant_reminders`, attach a photo via "Add a sketch" and see it in the sketchbook, tap "Report a problem" and confirm the screenshot excludes the sheet. Then switch the flag off and confirm the launcher and card vanish and the old sketchbook Add button is unchanged.

- [ ] **Step 4: Commit**

```bash
git add -A apps/nexus/src/components/assistant
git commit -m "fix(assistant): design review findings at 375 and 1280"
```

---

## Self-review against the spec

**Spec coverage (what M1 delivers, and what the next two plans own):**

| Spec item | Where |
|---|---|
| One tool registry with audience policy, impersonation rule, self-binding | Tasks 3, 4 |
| Deterministic first: router, flows, templated brief, direct tools | Tasks 11 to 14 |
| Student actions: cannot attend (RSVP or away window), reminders, add a sketch, each behind confirm | Tasks 6, 8, 9, 10, 13 |
| One floating button absorbing Report a problem; brief card; desktop icon | Tasks 15 to 17 |
| Flag + pilot allowlist; 404 while dark | Task 2 |
| Threads, messages, actions, reminders tables with RLS | Task 1 |
| Mobile-first panel, 48px targets, skeletons, reduced motion, no overflow | Tasks 16, 18, 19 |
| Gemini Q&A, exam mode, free key policy, `nexus.assistant-*` features, daily LLM cap, `my_tests` extraction, `my_reviews` proper tool, inspirations tool | **M2 plan** (written after M1 ships, against the real registry) |
| Teams chat on the same brain, daily brief cron, reminders cron, `assistant_brief`/`assistant_reminder` enum values, staff story card, personal tab copy, manifest 1.4.0, staff tools + MCP manifest | **M3 plan** |

**Placeholder scan:** every code step carries its code; no "similar to", no "add validation" without the rule spelled out.

**Type consistency:** `Envelope`, `Suggestion { label, send }`, `ActionProposal`, `Attachment`, `ToolContext` are defined once in Task 3 and imported everywhere; `ConfirmOutcome` is widened in Task 14 Step 1 and the Task 6 tests use `toMatchObject`, so they stay green; `FlowOutcome.links` is set through a typed cast in `turn.ts` because flows never produce links and tools never produce flow state, which keeps the two shapes separate.

**Review Focus coverage:** cancel mid-flow and the stale flow are pinned in Task 14's turn tests; the empty-upcoming path in Task 13's cannot-attend test; owner, token and already-executed refusals in Task 6; the non-image and oversize attachment in Task 16's Composer test.

**Known simplifications, deliberate:** `fakeDb.order` keeps only the last ordering; the real client applies both, and fixtures are written in final order. `my_brief` and the brief card show "reviews back" as a count of drawings reviewed in the last seven days because `drawing_submissions` has no "seen by student" marker. The `what_to_study` chapter-to-slug mapping is M2's problem and is called out there.
