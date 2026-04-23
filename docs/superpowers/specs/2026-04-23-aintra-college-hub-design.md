# Aintra: Architecture College Hub Q&A

**Date**: 2026-04-23
**Status**: Draft, awaiting user review
**Owner**: Project Architect (root)
**Affects**: `apps/marketing`, `packages/database` (no schema changes), Supabase `aintra_knowledge_base` seed data

## Summary

Extend the existing Aintra chatbot on the marketing site (`apps/marketing`) so it can answer questions about any architecture college in our database, compare colleges, answer general architecture-admissions questions (NATA, TNEA, COA, career paths), and fall back to web search for anything not in our data. Aintra is already deployed, runs on Google Gemini 2.5 Flash, and has an admin-editable knowledge base in Supabase. This spec adds:

1. Four tools Gemini can call (`get_college`, `search_colleges`, `compare_colleges`, native `google_search` grounding)
2. A tool-dispatch loop in `/api/chat/route.ts`
3. System-prompt additions covering the architecture-admissions domain
4. Seed rows in `aintra_knowledge_base` for admin-editable FAQ content
5. Slug-from-URL anchoring when the user is on a college page

No schema changes, no UI changes, no new provider integrations.

## Background

- Aintra lives at `apps/marketing/src/components/GeneralChatbot.tsx` and is mounted globally in `apps/marketing/src/app/[locale]/layout.tsx`.
- It posts to `apps/marketing/src/app/api/chat/route.ts`, which calls Gemini with a hardcoded Neram Classes system prompt plus admin-editable rows from `aintra_knowledge_base` (refreshed every 5 minutes).
- The marketing site has a substantial college hub (~200 to 400 colleges) backed by `colleges`, `college_fees`, `college_cutoffs`, `college_placements`, `college_infrastructure`, `college_faculty` tables, with queries in `apps/marketing/src/lib/college-hub/queries.ts`.
- Today, if a student on a college page asks "what are the fees?", Aintra has no idea, the data is in Supabase but never reaches the model.

## Goals

- Aintra answers page-specific questions on any college page (fees, cutoffs, placements, infrastructure, faculty).
- Aintra answers cross-college queries from any page (comparisons, filters like "Chennai colleges under 2L").
- Aintra answers general architecture-admissions questions (NATA, TNEA, COA vs NAAC, scholarships, careers).
- Aintra uses Google Search grounding when DB data is absent or the question is broader.
- Aintra cites its sources: internal `/colleges/...` links when DB-sourced, web URLs when grounded.
- Aintra declines clearly off-topic questions gracefully (scope level B: medium).
- All existing Aintra behavior (Neram coaching Q&A, lead capture after 3 messages, conversation logging) is preserved.

## Non-goals

- No new admin UI for editing architecture-admissions FAQs, admins edit `aintra_knowledge_base` via the Supabase dashboard.
- No changes to the lead-capture flow (3-message trigger stays).
- No per-college conversation analytics dashboard (logs already persist to `chatbot_conversations`).
- No voice input, no reviews injection, no brochure generation.
- No fine-tuning of Gemini. Behavior comes from prompt + tools + KB only.
- No schema changes to `colleges*` tables.

## Architecture

```
User (any marketing page, incl. college pages)
   │
   ▼
Aintra widget (GeneralChatbot.tsx), unchanged UI
   │  POST /api/chat { message, sessionId, pageUrl, history }
   ▼
/api/chat/route.ts
   │  1. Extract currentCollegeSlug from pageUrl if path matches /colleges/[state]/[slug]
   │  2. Build system prompt:
   │       existing Neram prompt
   │     + architecture admissions primer (static, ~300 words)
   │     + admin KB rows from aintra_knowledge_base (already cached 5 min)
   │     + soft anchor "User is currently viewing: <slug>" when applicable
   │  3. Declare tools, get_college, search_colleges, compare_colleges, google_search
   │  4. Call Gemini; loop up to 3 tool-call iterations
   │  5. Stream answer to widget, log to chatbot_conversations
   ▼
Gemini 2.5 Flash (tools + google_search grounding)
```

## Tools (function calling)

All tools are declared in `route.ts` and dispatched by a single `handleToolCall(name, args)` switch. Tool handlers live in `apps/marketing/src/lib/aintra/tools/`.

### `get_college(slug)`

- **Args**: `slug: string`
- **Returns**: Full college record joined with fees, cutoffs, placements, infrastructure, faculty.
- **Implementation**: Thin wrapper around existing `getCollegeBySlug(slug)` in `src/lib/college-hub/queries.ts`.
- **Error modes**: Returns `{ error: "not_found", slug }` when the college does not exist. The model is prompted to offer `search_colleges` in that case.
- **Shape trimming**: Return the full record as-is; Gemini Flash handles it within context, and the model already trims for the user answer.

### `search_colleges(filters)`

- **Args**:
  - `q?: string` (free-text name match, maps to the existing listing `searchParams.q`; enables fuzzy name resolution, e.g., "Sathyabama" finds the correct slug)
  - `state?: string`
  - `city?: string`
  - `type?: 'government' | 'private' | 'aided' | 'deemed'`
  - `counseling_system?: string` (e.g., `tnea`)
  - `coa_approved?: boolean`
  - `naac_grade?: 'A++' | 'A+' | 'A' | 'B++' | 'B+' | 'B'`
  - `accepted_exam?: 'nata' | 'jee_paper_2' | 'kcet' | ...`
  - `fee_max?: number` (annual, INR)
  - `neram_tier?: 'platinum' | 'gold' | 'silver' | 'bronze'`
  - `sort_by?: 'arch_index' | 'nirf_rank' | 'fee_low' | 'fee_high' | 'name'`
  - `limit?: number` (default 10, max 20)
- **Returns**: Array of trimmed cards, `{ name, slug, url, city, state, type, annual_fee_min, annual_fee_max, coa_approved, naac_grade, nirf_rank, neram_tier, total_barch_seats }`.
- **Implementation**: Reuses existing `getColleges(filters)` from `queries.ts`, maps to trimmed shape.
- **`url`** is `/colleges/<state_slug>/<slug>` so the model can cite an internal link.

### `compare_colleges(slugs)`

- **Args**: `slugs: string[]` (min 2, max 3)
- **Returns**: Array of comparison-trimmed records: `{ name, slug, url, fees_summary, cutoffs_summary, placements_summary, coa_approved, naac_grade, nirf_rank, total_barch_seats, accepted_exams, annual_fee_approx }`.
- **Implementation**: Parallel `get_college` + per-record trim.
- **Error modes**: If any slug is not found, include `{ slug, error: "not_found" }` in that slot.

### `google_search` (native)

- Enable Gemini 2.5 Flash's built-in `google_search` tool alongside our function tools. Gemini decides when to use it.
- Used for: general admissions questions (NATA dates, TNEA schedule), obscure colleges not in our DB, time-sensitive info.
- Citations are returned by Gemini's grounding metadata; we pass them through to the UI as source links.

## Tool dispatch loop

In `route.ts`, after the initial Gemini call:

```
for (let i = 0; i < 3; i++) {
  if (response has tool_calls) {
    execute all tool_calls in parallel via Promise.all
    append tool results to messages
    call Gemini again
  } else {
    break
  }
}
```

- **Cap at 3 iterations** to prevent runaway. If the model still wants tools after 3, we force a final answer.
- **Parallel execution** inside one iteration so `compare_colleges` + `search_colleges` can run concurrently if the model asks.
- **Timeouts**: each DB tool has a 3-second timeout; `google_search` uses Gemini's default.
- **Logging**: append tool calls and their latencies to `chatbot_conversations.response_time_ms` (extend the logging payload to include `tool_calls` array, but no schema change, stored in an existing JSONB field or a new optional column; see "Schema" below).

## System prompt additions

Three blocks appended to the existing Aintra system prompt (in that order):

1. **Role extension** (1 paragraph)
   > You are also an architecture college admissions counselor for students exploring Neram's college hub. You help them understand colleges, compare options, and navigate NATA / TNEA / state counseling.

2. **Architecture admissions primer** (~300 words, static text in `route.ts`)
   - NATA exam pattern (sections, scoring, validity)
   - TNEA counseling flow (random number, rank list, choice filling, allotment, reporting)
   - COA approval vs NAAC grade vs NIRF ranking (what each means, why each matters)
   - B.Arch vs B.Planning at a glance
   - TN / Kerala / Karnataka counseling systems named correctly
   - When to consider each college tier (government vs private vs deemed)

3. **Behavior rules**
   - When the user asks about "this college" / "the fees" and you see a soft anchor, call `get_college(<anchored_slug>)`.
   - When they name a specific college but you don't know its slug, call `search_colleges({ q: "<name>", limit: 3 })` first, then `get_college(<top_match_slug>)`.
   - When they ask to compare, use `compare_colleges` with up to 3 slugs.
   - When they ask broadly (city, state, fee range, exam), use `search_colleges`.
   - When the DB returns no match, offer alternatives via `search_colleges` or `google_search`.
   - When the question is general admissions (NATA schedule, TNEA dates, career paths), answer from the primer + admin KB; use `google_search` only if the info is time-sensitive or missing.
   - Cite sources: internal pages as `[College Name](/colleges/<state>/<slug>)`; web sources as clickable links.
   - Soft anchor injection string (when on a college page): `"User is currently viewing: <slug>"`.
   - Decline clearly off-topic questions ("best restaurant", "write me a poem") politely and redirect to how Aintra can help with architecture colleges.

## Slug extraction

`extractCollegeSlug(pageUrl: string): string | null` in `src/lib/aintra/slug.ts`:

- Parses URL path; matches `^/(?:[a-z]{2}/)?colleges/[^/]+/([^/?#]+)$` (optional locale segment, state, slug).
- Returns slug string or `null`.
- Unit-tested for: exact college page, state-listing page (returns null), listing page (returns null), URL with query/hash, URL with locale prefix.

## Knowledge base seeding

Seed ~15 rows into `aintra_knowledge_base` (existing table), each with `topic`, `content`, and `tags: ['architecture', 'admissions']`. Seed SQL at `packages/database/supabase/migrations/<timestamp>_aintra_architecture_kb_seed.sql` (data-only migration, idempotent `INSERT ... ON CONFLICT DO NOTHING`).

Topics:
- NATA 2026 exam pattern and dates
- NATA application process
- NATA 2026 important dates (placeholder for admin to update)
- TNEA counseling process walkthrough
- TNEA architecture cutoff trends
- Kerala architecture admission (KEAM + counseling)
- Karnataka architecture admission (KCET + COMEDK)
- JEE Paper 2 vs NATA, which one for which college
- COA approval, what it guarantees
- NAAC grading, how to read it
- NIRF rankings, what they measure
- Scholarship options for B.Arch
- Fee structure breakdown, tuition vs hostel vs mess vs lab
- Career paths after B.Arch
- How to shortlist architecture colleges

Admin edits rows via Supabase dashboard; the existing 5-minute cache in `route.ts` picks up changes.

## Schema

Two additive migrations, both safe on prod:

1. `packages/database/supabase/migrations/<timestamp>_chatbot_tool_calls.sql`: `ALTER TABLE chatbot_conversations ADD COLUMN IF NOT EXISTS tool_calls jsonb` (nullable). Stores `[{ name, args, latency_ms, success, error? }]` per user turn. Implementation should confirm the column doesn't already exist under a different name and skip the migration if so.
2. `packages/database/supabase/migrations/<timestamp>_aintra_architecture_kb_seed.sql`: idempotent `INSERT ... ON CONFLICT DO NOTHING` for the ~15 seed rows described under "Knowledge base seeding".

No changes to the `colleges*` tables.

## Token budget

- Current `route.ts` system prompt: ~1.5k tokens.
- Adding primer (~400 tokens) + tool declarations (~400 tokens) + typical KB rows (~1k): new baseline ~3.3k tokens per turn.
- Tool results are small (trimmed cards or one college JSON, ~500 to 2000 tokens).
- Comfortably within Gemini 2.5 Flash's context; monitor if growth continues.

## Error handling

- **Tool throws**: return `{ error: "tool_error", message }` to the model; it's prompted to apologize and offer an alternative.
- **Gemini API failure**: existing retry cascade (flash → flash-lite → cached) remains.
- **DB timeout**: 3s hard cap per tool; on timeout return `{ error: "timeout" }`, model falls back to a graceful message.
- **Rate limit**: existing rate-limit handling at the `/api/chat` level.
- **Tool loop exhaustion (3 iterations)**: force a final answer by sending one more call with tools disabled.

## Observability

- Log `tool_calls: [{ name, args, latency_ms, success, error? }]` per user turn.
- Count tool invocations by name per day (Supabase SQL query, no dashboard needed).
- Alert if `tool_calls` aggregate error rate exceeds 5% over a rolling hour (future work, not in this spec).

## Testing

### Unit tests (Vitest, colocated)

- `src/lib/aintra/slug.test.ts`: URL parsing correctness across locale / state / listing / query-string / hash / trailing-slash variants.
- `src/lib/aintra/tools/get-college.test.ts`: returns trimmed shape, handles `not_found`, 3s timeout triggers error result.
- `src/lib/aintra/tools/search-colleges.test.ts`: filter args validated (reject invalid enums), limit capped at 20.
- `src/lib/aintra/tools/compare-colleges.test.ts`: enforces slug count (2 to 3), handles partial not_found.
- `src/app/api/chat/route.test.ts`: mocks Gemini, verifies dispatch loop runs tools, caps at 3 iterations.

### E2E tests (Playwright, `tests/e2e/aintra-colleges.spec.ts`)

Project: `marketing-chrome` + `mobile-chrome`. No auth needed.

- **AC1 page anchor**: Load a specific college page, open Aintra, ask "what are the fees?", verify answer contains DB-sourced fee numbers and cites the internal URL.
- **AC2 comparison**: On the college hub landing page, ask "compare Papni vs MEASI", verify answer names both and includes at least one field from each.
- **AC3 filter search**: Ask "architecture colleges in Chennai under 2L annual fee", verify answer lists multiple colleges all from Chennai.
- **AC4 general primer**: Ask "what's a good NATA score?", verify answer is substantive without necessarily calling a tool (primer answer).
- **AC5 off-topic decline**: Ask "what's the best restaurant in Chennai?", verify polite decline + redirect.
- **AC6 web fallback**: Ask about a college deliberately not in our DB (mocked by query name), verify answer uses Google Search and cites a web URL.
- **AC7 mobile**: At viewport 375x812, widget opens, conversation is readable, no horizontal overflow; touch targets >= 44px.
- **AC8 source links**: Every answer that used `get_college` / `search_colleges` / `compare_colleges` includes at least one internal `/colleges/` link.
- **AC9 preservation**: Existing Neram Classes questions ("what are your coaching fees?") still answer correctly, lead capture still triggers after 3 messages.
- **AC10 loop cap**: Instrumented test, force the model into a long tool loop, verify it terminates at 3 iterations with a user-facing answer.

## Rollout plan

1. Merge to `staging`, verify on `staging.neramclasses.com` against staging Supabase (seeded KB rows).
2. Let internal team exercise 20+ queries across college pages / landing / cross-college / off-topic.
3. Review `chatbot_conversations` logs and `tool_calls` telemetry for error rate and tool distribution.
4. Promote to `main` (production). Seed KB rows run as part of the standard migration push.
5. Monitor for one week; tune primer or decline language based on observed conversations.

## Risks

- **Hallucinated college names / slugs**: Mitigated by requiring the model to call `get_college` or `search_colleges`, not answer from memory.
- **Google Search returns noisy / irrelevant results**: Prompt rules require DB tools to be tried first for any specific college; `google_search` is a fallback not a default.
- **Token cost creep**: Longer answers with tool chains cost more. Budget absorbed by Gemini 2.5 Flash pricing; revisit if monthly cost grows >2x.
- **Data staleness**: Admin KB rows can go stale (e.g., NATA dates for a past year). Mitigation: `updated_at` surfaced in Supabase UI so admins notice; no code mitigation in this spec.
- **Aintra answers incorrectly from primer when DB would be authoritative**: Behavior rule explicitly requires DB tool use for any specific-college question; enforced by E2E tests.

## Open questions

None. All design questions were resolved during brainstorming:
- Scope: medium (B), architecture admissions + colleges + web fallback
- Retrieval: tool-calling (A)
- Web: Gemini native Google Search grounding (A)
- Anchoring: soft, slug in system prompt (A)

## Out of scope (future work)

- Admin UI for editing architecture-admissions FAQ rows (currently Supabase dashboard)
- Per-college conversation analytics
- Voice input / text-to-speech
- College reviews / ratings from students (not in current schema)
- Personalization based on the student's profile (rank, state, budget)
- Multi-turn follow-up suggestions ("ask about placements")
