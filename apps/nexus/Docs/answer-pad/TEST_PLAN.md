# Answer Pad Test Plan

| Field | Value |
|---|---|
| Identifier | TP-PAD-001 |
| Version | 1.0, 10 September 2026 |
| Feature | Nexus Answer Pad in the Microsoft Teams meeting side panel |
| Specification | `TEAMS_LIVE_QUIZ_PLAN.v3-sidepanel.md` (v1 scope), with v3.1 section 11 scoring |
| Code | Branch `feat/answer-pad` |
| Sign-off | Hari |
| Automation and documents | Claude |

Companion documents:
- [HOW_TO_TEST.md](HOW_TO_TEST.md): step by step, for running every suite and a real meeting.
- [TRACEABILITY.md](TRACEABILITY.md): every requirement mapped to the tests that prove it.
- [TEST_SUMMARY_REPORT.md](TEST_SUMMARY_REPORT.md): the results at handover.
- [`tests/manual/answer-pad-test-cases.md`](../../../../tests/manual/answer-pad-test-cases.md): the manual `TC-PAD` cases.

---

## 1. Introduction

The Answer Pad lets a teacher ask a question in a live Teams class (out loud or on a
slide), collects every student's answer privately in the meeting side panel, grades it
on the server when the teacher reveals the answer, and shows who answered correctly,
who answered incorrectly, who was present but silent, and who was absent.

This plan says what is tested, how, where, by whom, and what "ready for a pilot" means.
The standard it follows is IEEE 829: items, features, approach, pass and fail criteria,
suspension, deliverables, environment, responsibilities, risks and approval.

## 2. Test items

| Item | Location |
|---|---|
| Database schema, functions, guard triggers and privileges | `supabase/migrations/20260911090100_answer_pad.sql` |
| Server library | `apps/nexus/src/lib/pad/` |
| Teams sign-in (SSO token validation) | `apps/nexus/src/lib/teams-sso.ts`, branch in `lib/ms-verify.ts` |
| API routes | `apps/nexus/src/app/api/pad/` |
| Side panel, configuration and room code pages | `apps/nexus/src/app/(pad)/pad/` |
| Class report | `apps/nexus/src/app/(teacher)/teacher/answer-pad/sessions/[id]/` |
| Screens | `apps/nexus/src/components/answer-pad/` |
| Meeting bot and notifications | `apps/nexus/src/lib/pad/bot/`, `app/api/pad/bot/messages/` |
| Feature flags | `staff.answer-pad`, `student.answer-pad` in `lib/feature-flags.ts` |
| Framing headers | `apps/nexus/vercel.json` |
| Teams app manifest 1.1.0 and packaging | `apps/nexus/teams-app/`, `scripts/answer-pad/package-teams-app.mjs` |
| Realtime proxy WebSocket passthrough (local change, not deployed) | `cloudflare/supabase-proxy/src/index.ts` |

## 3. Features to be tested

- **Sessions:** start, resume, end; one live session per teacher; never silently replacing a
  class; binding a meeting to its scheduled class or a remembered classroom; the room code.
- **Question loop:** ASK, CLOSE, set and change key, REOPEN, Poll or don't grade, REVEAL,
  idempotent repeats, refused transitions.
- **Answer types:** multiple choice with 2 to 6 options, numbers, short text, yes or no;
  normalisation and grouping.
- **Student pad:** tap to lock, locking and retry, every state in spec section 12, running score,
  nothing about other students.
- **Teacher console:** readiness, live count, key selector, reveal groups, named details,
  history, notes, ending, reminders.
- **Participation and scoring:** one row per student per question, presence windows,
  groups adding up to the class list, v3.1 section 11 scoring, report and CSV.
- **Identity and access:** Teams SSO, staff and enrollment rules, feature flags, rate limits.
- **Security:** every statement in spec section 9, tried directly against the API and database.
- **Bot:** Bot Framework token checks, participant and meeting events, notifications.
- **Embedding:** the pad may be framed only by Teams and Microsoft 365.
- **Usability:** accessibility, phone and side panel widths, Teams themes.
- **Phone-first meeting features:** the Answer Pad button added to class meetings automatically,
  the question pop-up, the class chat card, the red badge and Share results, on Teams desktop,
  Android, iOS and Teams in a laptop browser.

## 4. Features not to be tested

- Screen or audio capture, OCR, AI suggestions, storing question text: out of v1.
- Leaderboards, streaks, avatars: out of v1.
- Working together on the meeting screen: the shared screen shows class results only.
- Production: no production database, deploy or data is used by any test.
- A real 60 student class under load: staging has only three enrolled E2E students
  (risk R6). Class scale is exercised with bursts and confirmed in UAT.

## 5. Approach

| # | Level | Tool and location | What it proves | Runs |
|---|---|---|---|---|
| 1 | Static | `tsc`, ESLint, `next build` | Types, lint rules, client bundle safety | Every change |
| 2 | Unit | Vitest, `*.test.ts` beside the code in `lib/pad`, `lib/teams-sso.ts`, `lib/feature-flags.ts` | Parsing, binding decisions, snapshot ordering, poll cadence, formatting, report and CSV rules, SSO and bot token validation with generated keys | Every change |
| 3 | Component | Vitest and Testing Library, `components/answer-pad/*.test.tsx` | Every console and pad state renders from a fixture; tap locks; REVEAL waits for a key or poll; no names while OPEN | Every change |
| 4 | Database | Vitest with PGlite, `lib/pad/db/*.db.test.ts`; mutation check `scripts/answer-pad/db-mutation-check.mjs`; schema fingerprint | Every valid and invalid transition, grade guard, privileges, participation and scoring, seeded random classes against an oracle; the mutation check proves the tests fail when the SQL is broken | Every migration change |
| 5 | Concurrency | `pnpm pad:load` against staging, plus the uniqueness constraints tested at level 4 | Concurrent duplicate submits leave one answer; repeats report the locked answer | Before handover, after each migration |
| 6 | API and security | Playwright request tests, `tests/e2e/answer-pad/pad-sessions-nexus.spec.ts` and `pad-prompts-nexus.spec.ts`, dev server wired to staging | Spec section 9 statements through the real routes and the anon key; no database text in any answer; no caching | Before handover, after each migration |
| 7 | End-to-end UI | Playwright with the injected Teams test host, `tests/e2e/answer-pad/pad-ui-nexus.spec.ts`, axe | A whole class: teacher at 320px plus students on Pixel 5, iPhone 13 and a side panel; reload, offline, end; accessibility; no sideways scroll; no console errors | Before handover |
| 8 | Bot contract | Vitest, `lib/pad/bot/*.test.ts`, `app/api/pad/bot/messages/route.test.ts` | Documented Teams payloads become the right database calls; forged, expired, misaddressed or unendorsed tokens are refused; notification batching and retry | Every change |
| 9 | Load | `pnpm pad:load` | Latency of a submit burst and a snapshot storm; no server errors | Before handover; strict mode on a deployed preview |
| 10 | Manual and UAT | `tests/manual/answer-pad-test-cases.md`, real Teams meetings | Teams install, SSO, the four Teams clients, bot and notifications, resilience drills, then one rehearsal with a real batch | With Hari, before handover |

**Test data.** Automated API and UI tests use the non-production `test_` tokens of existing
E2E accounts on staging, the classroom "E2E Test Classroom", and an empty classroom fixture
for the enrollment refusal. Every spec ends the sessions it starts. Nothing touches production.

**Why these levels.** The database functions are the security and grading boundary, so they
carry the deepest tests (level 4, with mutation testing to prove the tests have teeth). The
API tests (level 6) then prove the routes do not open a way around them. The UI tests (levels
3 and 7) prove the screens show the server's truth in every state, and the manual level
proves what only real Teams can: sign-in, the side panel on each client, and the bot.

## 6. Pass and fail criteria

- A test passes only when every expectation in it holds. A flaky test counts as failed
  until the cause is understood.
- Levels 1 to 4 and 6 to 8: 100% pass.
- Level 5 and 9: correctness checks always pass (one locked answer per student, no server
  errors). p95 under 1 second is required on a deployed preview; on the local dev server
  the timings are recorded for information only.
- Level 10: every P0 and P1 manual case passes on Teams desktop, web, Android and iOS,
  with no open S1 or S2 defect.

## 7. Suspension and resumption

Suspend testing when:
- the staging database is unavailable, or its schema fingerprint no longer matches the
  migration (drift);
- an S1 defect is found in grading, answer privacy or access control (fix first);
- the test accounts cannot sign in, or the tenant blocks custom Teams apps;
- the dev server cannot compile the branch.

Resume after the cause is fixed, then re-run the whole affected level and the regression gate.

## 8. Deliverables

- This plan, [TRACEABILITY.md](TRACEABILITY.md), [HOW_TO_TEST.md](HOW_TO_TEST.md),
  [TEST_SUMMARY_REPORT.md](TEST_SUMMARY_REPORT.md) and the manual cases.
- Automated suites (levels 1 to 9) in the repository, with the commands in HOW_TO_TEST.md.
- Playwright reports (`playwright-report/`, `test-results/`) and the load report JSON.
- Filled manual cases with evidence, and the defect log.

## 9. Environments

| Environment | Detail |
|---|---|
| Local dev server | Nexus on Node 20, port 3022, `apps/nexus/.env.local` pointing at the **staging** Supabase project. Automated levels only: it accepts `test_` sign-ins, so it is never tunnelled |
| Local production mode | The same code built with `next build` and served by `next start` on port 3022, still on staging. Used for manual testing in Teams, because it refuses `test_` sign-ins |
| Staging database | Supabase staging (`hgxjavrsrvpihqrpezdh`) with migration `20260911090100_answer_pad.sql` applied and verified by schema fingerprint |
| Tunnel for Teams | `cloudflared` quick tunnel in front of the production-mode server only, with the dev Teams app built by `package-teams-app.mjs --dev` |
| Teams app catalog | For the automatic button, the dev package is uploaded in the Teams admin center and limited to the testers, so it has a catalog id; the tab origin and app ids come from `PAD_*` settings in `.env.local` |
| Teams clients | Desktop (Windows, macOS), web (Edge, Chrome) on laptops, Android, iOS. About 90% of students use the phone apps, so phone results decide. Microsoft's notes on what each client supports are confirmed on devices first (TC-PAD-080) |
| Widths | 280px and 320px side panel, 360px to 412px phones, the question pop-up (280px to 460px wide, about 300px tall), the meeting screen (472x382 to 994x678), 768px tablet |
| Production | Not used. `.env.development` at the repository root points at production and must never be used for testing |

## 10. Entry and exit criteria

**Entry to manual testing and UAT**
- Levels 1 to 9 pass on the branch.
- Teams SSO is configured on the Entra app (scope `access_as_user`, both Teams clients
  pre-authorized, the tunnel's `api://` identifier added).
- The dev Teams app is sideloaded, and the Answer Pad flags are on for the test accounts.

**Exit (handover to pilot)**
- Levels 1 to 9 pass, with reports saved.
- All P0 and P1 manual cases pass on the four Teams clients; no open S1 or S2.
- Every Definition of Done item in TRACEABILITY.md has evidence.
- A real Teams meeting demo: ASK, three students answer (one on a phone, one by room code),
  CLOSE, change the key, REVEAL, groups add up, a student reconnect keeps the lock, a teacher
  refresh restores state, and the report matches the pads.
- TEST_SUMMARY_REPORT.md is complete, and the feature flags stay off in production until Hari
  decides otherwise.

## 11. Severity and priority

| Severity | Meaning | Examples |
|---|---|---|
| S1 Critical | Wrong or leaked data, or a class cannot run | A student sees another answer or the key before REVEAL; wrong grading; a locked answer lost; the console unusable in class |
| S2 Major | A flow is blocked or a client is unusable, with no reasonable workaround | Android side panel cannot answer; report totals wrong |
| S3 Minor | Wrong behaviour with a workaround, or a clear UI defect | A wrong message; layout breaks at one width |
| S4 Trivial | Cosmetic | Spacing, wording polish |

| Priority | Meaning |
|---|---|
| P0 | Must pass before any pilot; fix immediately |
| P1 | Must pass before the pilot |
| P2 | Fix before general release |
| P3 | Fix when convenient |

## 12. Defect workflow

New, then Triaged (severity and priority set), In progress, Fixed, Verified, Closed; or Reopened.

- A fix for an automatable defect starts with a test that fails without it.
- Verification re-runs the manual case that found it plus the regression gate.
- The defect template is in [HOW_TO_TEST.md](HOW_TO_TEST.md#6-recording-results-and-filing-a-defect).

## 13. Regression gate

Run before any deploy Hari asks for:

1. `pnpm --filter @neram/nexus type-check`
2. `pnpm --filter @neram/nexus lint`
3. The Answer Pad unit, component, bot and database suites (commands in HOW_TO_TEST.md)
4. `pnpm build:nexus`
5. The three Playwright specs in `tests/e2e/answer-pad` against the staging-wired dev server
6. `pnpm pad:load`
7. The manual P0 cases

## 14. Risks and contingencies

| # | Risk | Contingency |
|---|---|---|
| R1 | Realtime WebSockets fail through the Cloudflare proxy | Screens fall back to a tuned safety poll (tested). The proxy fix is written and waits for approval to deploy |
| R2 | Microsoft sends participant events for scheduled meetings only, and channel meetings may not deliver them | App heartbeat and the attendance report still mark presence; notifications fall back to "not connected" students |
| R3 | The side panel is cramped or slow on some phones | Room code page at `/pad` in the phone browser |
| R4 | Test accounts cannot complete MFA sign-in in Teams | Hari provides MFA-registered accounts or a Conditional Access exclusion |
| R5 | The notification API cannot be exercised without the Azure Bot | Request body matched to Microsoft's documented payload in unit tests; confirmed in manual case TC-PAD-052 |
| R6 | Only three enrolled E2E students exist on staging | Bursts of concurrent duplicates at level 5; class scale confirmed in UAT |
| R7 | Dev server timings are not production timings | p95 is informational until a preview deploy |
| R8 | The reminder limit is per server instance | Acceptable: it only prevents a double tap buzzing the class twice |

## 15. Responsibilities

| Who | Does |
|---|---|
| Claude | Automated suites, test data handling, documents, defect fixes, re-runs |
| Hari | Azure and Teams admin steps, providing test accounts, joining real-meeting sessions on each client, the batch rehearsal, severity decisions, sign-off |

## 16. Approval

| Role | Name | Decision | Date |
|---|---|---|---|
| Product owner | Hari | | |
