# Answer Pad Test Summary Report

| Field | Value |
|---|---|
| Identifier | TSR-PAD-001 |
| Version | 1.3, 11 September 2026 (phone-first features: automatic button, question pop-up, class chat card, red badge, Share results; O-03 resolved in the build; D-11 and D-12) |
| Test plan | [TEST_PLAN.md](TEST_PLAN.md) (TP-PAD-001) |
| Code | Branch `feat/answer-pad`, working tree (not committed) |
| Environment | Nexus dev server on Node 20, port 3022, wired to Supabase staging, for the automated levels; a production-mode build on the same port for the Teams checks; Playwright Chromium; Windows 11 |
| Prepared by | Claude |
| For | Hari |

---

## 1. Verdict

**Every automated level passes.** That covers the production build, the database tests and their mutation check, the unit, component, bot contract, API and security tests, the whole-class UI run, and the load correctness check.

**Ready for manual testing in real Teams meetings.**

**Not yet ready for a pilot.** Three things still need you:
- The real-Teams checks (Definition of Done items 15 and 17) have not been run.
- They depend on the Azure sign-in setup and on sideloading the app, both still to do.
- Load latency was measured only on the local dev server, where it is well above target. It needs a deployed preview to judge.

No open defects are known in the Answer Pad.

**Update, 11 September 2026 evening (v1.3).** The phone-first features are built: the Answer Pad button added to class meetings automatically, the question pop-up, the class chat card, the red badge and Share results. Every level run since passes: type-check, production build, and the Answer Pad unit, component, bot contract, route and database suites (38 files, 517 tests). Two things are still missing:
- The Playwright specs have **not** been re-run after these screen changes. They need the dev server on port 3022, where the production-mode server now waits for the Teams tunnel test. Run them before any deploy.
- None of the new features has been tried in real Teams (TC-PAD-080 to 091).

---

## 2. Results by level

| # | Level | Result | Detail |
|---|---|---|---|
| 1 | Static: type-check | **Pass** | `tsc --noEmit` on Nexus: 0 errors |
| 1 | Static: lint | **Pass** | ESLint over Answer Pad components, library, pages, report and routes: 0 warnings |
| 1 | Static: production build | **Pass** | `next build` on Node 20: compiled, 365 of 365 pages generated, all Answer Pad pages and 17 `/api/pad` routes in the output; see section 2.1 |
| 2, 3, 8 | Unit, component, bot contract, routes | **Pass** | 31 files, 391 tests |
| 4 | Database (PGlite) | **Pass** | 4 files, 142 tests |
| 4 | Mutation check | **Pass** | 37 of 37 deliberate database defects caught by the PGlite suite; see section 2.1 |
| 4 | Staging schema matches the tested migration | **Pass** | Fingerprint on staging equals PGlite (177 objects), recorded when the migration was applied; the migration has not changed since |
| 2 to 4 | All of the above in one run | **Pass** | 35 files, 533 tests |
| 5 | Concurrency (`pnpm pad:load`) | **Pass** | 60 concurrent submits from 3 students: exactly one accepted per student, every repeat reported the locked answer, answered count 3 |
| 6 | API and security, sessions | **Pass** | `pad-sessions-nexus.spec.ts`: 16 of 16 |
| 6 | API and security, question loop | **Pass** | `pad-prompts-nexus.spec.ts`: 16 of 16 |
| 7 | End-to-end UI | **Pass** | `pad-ui-nexus.spec.ts`: 1 of 1 (a whole class in 8 steps, 4 browser contexts, 3 accessibility scans) |
| 6, 7 | All Playwright specs in one run | **Pass** | 33 of 33 in 5.5 minutes |
| 9 | Load latency | **Not assessed** | Dev server only: submit burst p50 2112 ms, p95 3245 ms, max 3345 ms; snapshot storm (80 requests) p50 2404 ms, p95 4153 ms, max 6246 ms; 0 errors. Above the 1 second target; must be re-run with `--strict` on a deployed preview |
| 10 | Manual and UAT | **Not run** | 91 cases written; needs Teams sign-in set up and the app uploaded |
| | Teams package | **Pass** | Manifest 1.1.0 checked by a contract test and by the packaging script; production and dev packages built. Not uploaded |
| 1 | Static, after the phone-first features | **Pass** | `tsc --noEmit`: 0 errors; `next build`: exit 0; see section 2.2 |
| 2 to 4 | Answer Pad suites, after the phone-first features | **Pass** | 38 files, 517 tests, database files included. The Teams sign-in, feature flag and report page suites were not re-run; these changes do not touch them |
| 6, 7 | Playwright specs, after the phone-first features | **Not re-run** | Need the dev server on 3022, which cannot run while the production-mode server waits for the tunnel test |
| 10 | Manual cases for the phone-first features | **Not run** | TC-PAD-080 to 091 written; the device check TC-PAD-080 comes first |

### 2.1 Results recorded after the first draft

| Check | Result |
|---|---|
| Mutation check (`scripts/answer-pad/db-mutation-check.mjs`) | **Pass**, 11 September 2026. 37 of 37 mutants killed, none survived, none invalid. M01 to M27 ran on 10 September; that run was cut off when the session ended, so M28 to M37 were run again on 11 September from a green baseline of 142 tests. Each mutant breaks one rule (grading, answers only while open, key hidden until Reveal, no names or distribution while open, scoring of absent, skipped and polls, privileges and row level security, bot presence and who gets notified), and at least one test failed for every one |
| Production build (`next build`) | **Pass**, 11 September 2026. Exit code 0, 365 of 365 pages. The build's lint warnings all come from existing Nexus pages, none from Answer Pad, Teams sign-in, feature flag or auth files. The "Dynamic server usage" lines are other API routes skipped during static generation, as expected. First Load JS: `/pad/teams` 586 kB, `/pad` and `/pad/r/[code]` 695 kB, `/pad/teams/config` 250 kB, report page 370 kB (see O-03) |

### 2.2 Phone-first features, 11 September 2026 evening

| Check | Result |
|---|---|
| New suites | `lib/pad/meeting-tab.test.ts` (13), `lib/pad/auto-add.test.ts` (13), `app/api/cron/pad-meeting-tabs/route.test.ts` (5), `lib/pad/bot/session-card.test.ts` (5), `lib/pad/stage.test.ts` (7), `app/api/pad/stage/route.test.ts` (5), `components/answer-pad/StageResults.test.tsx` (6). Extended: `notify.test.ts`, `notify-session.test.ts`, `pad-host.test.ts`, `TeacherConsole.test.tsx`, `TeamsPadApp.test.tsx`, `StudentPad.test.tsx`, `StudentMeetingPad.test.tsx`, `teams-manifest.test.ts` |
| Type-check | **Pass** after fixing D-11 and D-12 |
| Production build | **Pass**, exit code 0. First Load JS: `/pad/teams`, `/pad/teams/answer` and `/pad/stage` 261 kB (was 586 kB); `/pad` and `/pad/r/[code]` 386 kB (was 695 kB); `/pad/teams/config` 250 kB |
| Local production-mode server | Restarted on port 3022. The four Teams pages answer 200; a `test_` token gets 401 from `/api/pad/me` and `/api/pad/stage`; `/api/cron/pad-meeting-tabs` without the secret gets 401 |

---

## 3. Definition of Done

| # | Item | Status |
|---|---|---|
| 1 | Teacher can start a session | Automated evidence; manual confirmation pending |
| 2 | Ask in four or fewer interactions | Automated evidence (two taps); manual confirmation pending |
| 3 | Students can answer privately | Automated evidence |
| 4 | Students cannot see other students' answers | Automated evidence |
| 5 | Correct answer unavailable before Reveal | Automated evidence |
| 6 | Close, set/change key, Reopen, Reveal | Automated evidence |
| 7 | Grading is server-authoritative | Automated evidence |
| 8 | Correct, incorrect, present-but-silent, absent | Automated evidence |
| 9 | Student state survives reconnect | Automated evidence (UI offline and reload drills) |
| 10 | Teacher state survives refresh | Automated evidence (UI reload drill) |
| 11 | Late join is deterministic | Automated evidence |
| 12 | Duplicate answers prevented | Automated evidence (including 60 concurrent submits) |
| 13 | Presence cannot duplicate students | Automated evidence |
| 14 | Mobile experience works | Automated on emulated phones and a 320px panel; real phones pending |
| 15 | Student activation in a real Teams meeting | **Pending** (needs Azure sign-in setup, sideload) |
| 16 | Security tests pass against direct manipulation | Automated evidence (all 19 statements) |
| 17 | A real batch completes a class | **Pending** (UAT) |

Automated evidence covers 15 of the 17 items. Details and test names are in [TRACEABILITY.md](TRACEABILITY.md).

---

## 4. Defects

### 4.1 Found and fixed during testing

| Id | Severity | Found by | Defect | Fix and proof |
|---|---|---|---|---|
| D-01 | S3 | UI accessibility scan | The answer type buttons had `role="radio"` while MUI also set `aria-pressed`, which a radio may not carry (4 elements) | Plain toggle buttons in a labelled group; component test updated; scan passes |
| D-02 | S4 | UI screenshot review | The student score chip read "Score No score yet" | Now "No score yet", then "Score 3 of 4" |
| D-03 | S3 | Component test design | A typed answer the server refused was wiped from the box | Kept for correction; test "keeps a typed answer the question cannot take, so the student can fix it" |
| D-04 | S3 | Accessibility review | Live regions wrapped the answer buttons, so screen readers would re-read controls and a two-second counter | One screen-reader announcement line per state change; announcement tests |
| D-05 | S3 | Accessibility review | Classroom picker buttons carried `role="listitem"`, losing their button role | A real list of buttons |
| D-06 | S2 | Embedding review | `X-Frame-Options: SAMEORIGIN` on every page would leave the Teams panel blank | `/pad` pages framed only by Teams and Microsoft 365 through `frame-ancestors`; contract test on `vercel.json` |
| D-07 | S2 | Embedding review | Nexus Microsoft sign-in could try a redirect inside the Teams frame | Skipped on Teams pad pages, which use Teams SSO |
| D-08 | S1 to S3 | Database review and mutation testing | Joined-mid-question detection, bot presence under duplicate or out-of-order events, attendance leave times, report scoring for dormant students, details while a question is open, non-ISO attendance timestamps, a null participant event; privilege tests were not really testing until the harness mirrored Supabase's default grants | Each fixed with a database test and a mutant the tests now kill |
| D-09 | S2 | Realtime probe | The Cloudflare database proxy drops WebSocket upgrades, so Realtime never connects | Screens poll on a tuned cadence (tested). Proxy fix written, **not deployed**: needs your approval |
| D-10 | S2 | Review of the test guide, 11 September 2026 | The guide said to put a tunnel in front of the dev server. Outside production mode Nexus accepts unchecked `test_` sign-in tokens, so anyone who found the tunnel address could act as any staging user, including an admin. The Answer Pad code itself was not affected | HOW_TO_TEST now tunnels only a production-mode build (`next build`, `next start`), which refuses those tokens, and says the simulator cannot feed a Teams class. Found before anyone ran the tunnel |
| D-11 | S2 | Type-check, 11 September 2026 | The Share results button asked TeamsJS for `meeting.isSupported()`, which the installed version (2.56.0) does not have. The call would have thrown inside a guard, so every teacher would silently have had no Share results button | Checks for the four sharing functions instead; test "is absent where the Teams client has no meeting sharing functions" |
| D-12 | S4 | Next.js route type-check, 11 September 2026 | The stage route exported a test helper, which a Next.js route file may not export | The caches and the helper moved to `lib/pad/stage-cache.ts` |

### 4.2 Open

None known in the Answer Pad.

Observations outside its scope:
- O-01 (S4): the dev-only "LOCAL / STAGING DB" badge has 3.29:1 contrast. It shows only on localhost.
- O-02: dev server latency, as in level 9.
- O-03 (performance): resolved in the build, still to be timed on a phone.
  - Before: First Load JS was 586 kB for `/pad/teams` and 695 kB for `/pad` and `/pad/r/[code]`, against a median of 393 kB across the 166 Nexus pages.
  - Loading the teacher console only for teachers saved just 8 kB. The real weight was the Supabase client (about 640 kB before compression), which the pad needs only for Realtime hints after its first snapshot. It now loads after the first snapshot (`lib/pad/client/realtime-client.ts`).
  - Now: 261 kB for the Teams pages and 386 kB for the browser pages, both below the Nexus median.
  - Action: time the pop-up and the panel on a mid-range Android phone on mobile data (TC-PAD-091).

---

## 5. Residual risks

| Risk | State |
|---|---|
| Realtime through the proxy (R1) | Polling works; fix awaits deploy approval |
| Participant events only for scheduled meetings (R2) | Heartbeat and attendance intervals cover presence; confirm in TC-PAD-049 and 054 |
| Phone side panel (R3) | Room code page tested (component and API); real phones pending. The pad pages now load 261 kB (O-03); time the pop-up and the panel on a mid-range Android phone on mobile data (TC-PAD-091) |
| What each Teams client supports (R8) | Known only from Microsoft's documentation: Teams on the web shows meeting side panels and shared results only with developer preview, and phones show no badge. The chat card and the room code page cover the gaps; TC-PAD-080 checks real devices first |
| Automatic button timing (R9) | A new meeting's chat may refuse Graph until somebody joins. The five-minute sweep adds the pad after the first join, and the Apps step still works (TC-PAD-082) |
| Consent set for the automatic install (R10) | The install consents to the manifest's five resource-specific permissions, including the delegated `MeetingStage.Write.Chat`. Whether Teams accepts that set from an app-only call is confirmed in TC-PAD-081 |
| Test accounts and MFA (R4) | Needed before manual testing |
| Notifications without the Azure Bot (R5) | Payload matched to Microsoft's documentation; live check TC-PAD-052 pending |
| Class scale with 3 test students (R6) | Concurrency bursts pass; real class in UAT |
| Dev server timings (R7) | Latency needs a preview deploy |

---

## 6. Deviations from the plan

- **Level 5.** The planned direct Postgres tests against the staging pooler were replaced by
  concurrent API bursts against staging (`pnpm pad:load`), plus the uniqueness and locking
  tests at the database level.
- **Level 8.** It uses Microsoft's documented activity payloads, because no bot is registered
  yet to record real Teams traffic.
- **Simulated students.** No `e2e-pad-*` accounts were created on staging, since that would add
  users. The simulator and load script use the three existing enrolled E2E students.
- **Deploys.** Nothing was deployed. Manual testing in Teams runs against a local production-mode
  build (`next start`) through a tunnel, never the dev server, which accepts `test_` sign-ins (D-10).
- **Stage view.** Built on 11 September 2026 as Share results (class results on the meeting screen), at Hari's request.
- **`pad:attach` script.** Not built. The real-tenant attach test uses the sweep route's single-class mode
  (`/api/cron/pad-meeting-tabs?classId=`), so it exercises the real code path.

---

## 7. What is needed to reach the pilot

1. Azure: Teams sign-in (`apps/nexus/teams-app/README.md` section A).
2. Re-run the Playwright specs on the dev server, never tunnelled, after the phone-first changes.
3. Build the dev app with `--bot`, upload it in the Teams admin center, run the device check TC-PAD-080, then the smoke cases TC-PAD-001 to 005.
4. Azure Bot and meeting event subscriptions (README section B).
5. Grant the two Graph permissions for the automatic button (README section F), then run TC-PAD-081 to 084.
6. Run all P0 and P1 manual cases, section 14 included, on Teams desktop, web, Android and iOS, and time the pop-up on a mid-range Android phone (TC-PAD-091).
7. Approve deploying the proxy WebSocket fix, then run TC-PAD-072.
8. Approve a preview deploy, then run `pnpm pad:load --strict` against it.
9. One rehearsal with a real batch (TC-PAD-078, 079).
10. Set the Entra Application ID URI back to `api://nexus.neramclasses.com/aa039c70-50d2-4c91-bd0e-5675df5e50ff` (testing points it at the tunnel), publish Neram Assistant 1.1.0, set `PAD_AUTO_ADD_CLASSROOMS` and `PAD_TEAMS_APP_ID` in production, and switch the flags on for the pilot group.

---

## 8. Sign-off

| Role | Name | Decision | Date |
|---|---|---|---|
| Product owner | Hari | | |
