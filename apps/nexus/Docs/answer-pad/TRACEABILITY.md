# Answer Pad Traceability Matrix

Every requirement the Answer Pad must meet, mapped to the tests that prove it.
Status reflects the runs recorded in [TEST_SUMMARY_REPORT.md](TEST_SUMMARY_REPORT.md) (10 and 11 September 2026).

## Test references

| Code | Suite | Location |
|---|---|---|
| DB-L | Database: migration, privileges, sessions, transitions, guards | `apps/nexus/src/lib/pad/db/lifecycle.db.test.ts` |
| DB-S | Database: submit, joining, student snapshot, normalisation | `apps/nexus/src/lib/pad/db/students.db.test.ts` |
| DB-P | Database: participation, scoring, oracle, report, notification targets, bot intervals | `apps/nexus/src/lib/pad/db/participation.db.test.ts` |
| DB-M | Database: meeting series memory | `apps/nexus/src/lib/pad/db/meeting-memory.db.test.ts` |
| MUT | Mutation check: broken copies of the SQL must fail the database tests | `scripts/answer-pad/db-mutation-check.mjs` |
| API-S | API and security: sessions, joining, access | `tests/e2e/answer-pad/pad-sessions-nexus.spec.ts` |
| API-P | API and security: the question loop, report, reminders | `tests/e2e/answer-pad/pad-prompts-nexus.spec.ts` |
| UI | End to end: a whole class in the side panel (teacher 320px, Pixel 5, iPhone 13, side panel) | `tests/e2e/answer-pad/pad-ui-nexus.spec.ts` |
| LOAD | Burst of concurrent submits and snapshots | `scripts/answer-pad/load-class.mjs` |
| C-TC | Component: teacher console | `components/answer-pad/TeacherConsole.test.tsx` |
| C-SP | Component: student pad | `components/answer-pad/StudentPad.test.tsx` |
| C-MP | Component: joining from the meeting or a room code | `components/answer-pad/StudentMeetingPad.test.tsx` |
| C-TA | Component: the Teams page (host, role, errors) | `components/answer-pad/TeamsPadApp.test.tsx` |
| C-BA | Component: the browser room code page | `components/answer-pad/BrowserPadApp.test.tsx` |
| C-RP | Component: the class report page | `app/(teacher)/teacher/answer-pad/sessions/[id]/page.test.tsx` |
| C-HK | Component: the snapshot hook | `components/answer-pad/usePadSnapshot.test.tsx` |
| U-VW | Unit: screen states, key rules, announcements, wording | `lib/pad/client/views.test.ts` |
| U-RP | Unit: report totals, scores, CSV | `lib/pad/client/report.test.ts` |
| U-MG | Unit: newer snapshot wins | `lib/pad/snapshot-merge.test.ts` |
| U-PL | Unit: poll cadence | `lib/pad/client/poll-policy.test.ts` |
| U-SSO | Unit: Teams sign-in token validation | `lib/teams-sso.test.ts`, `lib/ms-verify.test.ts` |
| U-CL | Unit: caller role and feature flags | `lib/pad/caller.test.ts`, `lib/feature-flags.test.ts` |
| U-BD | Unit: meeting and session binding | `lib/pad/meeting-binding.test.ts`, `lib/pad/session-binding.test.ts` |
| U-RPC | Unit: refusal codes, no database text | `lib/pad/rpc.test.ts` |
| U-RT | Unit: Realtime hints carry only a version | `lib/pad/realtime.test.ts` |
| U-BOT | Unit: Bot Framework tokens, activities, notifications | `lib/pad/bot/verify-activity.test.ts`, `activity.test.ts`, `connector-token.test.ts`, `notify.test.ts`, `lib/pad/notify-session.test.ts` |
| R-BOT | Route: the bot endpoint | `app/api/pad/bot/messages/route.test.ts` |
| U-EMB | Unit: framing headers in vercel.json | `lib/pad/embedded.test.ts` |
| U-MAN | Unit: Teams manifest against the code | `lib/pad/teams-manifest.test.ts` |
| U-TAB | Unit: adding the Answer Pad to a meeting chat through Graph, and which classes get it | `lib/pad/meeting-tab.test.ts`, `lib/pad/auto-add.test.ts` |
| R-CRON | Route: the sweep that adds the Answer Pad near class time | `app/api/cron/pad-meeting-tabs/route.test.ts` |
| U-CARD | Unit: the class chat card and its links | `lib/pad/bot/session-card.test.ts` |
| U-STG | Unit: what the meeting screen may show | `lib/pad/stage.test.ts` |
| R-STG | Route: the meeting screen's results | `app/api/pad/stage/route.test.ts` |
| C-STG | Component: the shared meeting screen | `components/answer-pad/StageResults.test.tsx` |
| TC | Manual cases | `tests/manual/answer-pad-test-cases.md` |

Test names below are quoted as they appear in the suites.

---

## A. Definition of Done (side-panel spec section 18)

| # | Requirement | Automated evidence | Manual | Status |
|---|---|---|---|---|
| 1 | Teacher can start a session | DB-L "starts a live session with a 6-digit room code and two distinct random topics"; API-S "starts a session for the chosen classroom and resumes it when the console reopens"; C-TC "starts the session for this meeting, shows readiness, and asks with the chosen answer type"; UI step "the teacher links this meeting to the class once" | TC-PAD-001, 015, 016 | Automated pass; manual pending |
| 2 | Teacher can Ask with four or fewer normal interactions | C-TC (type, then Ask: two taps); UI step "ASK opens question 1 everywhere, one tap locks an answer, the console shows a count only" | TC-PAD-021 | Automated pass; manual pending |
| 3 | Students can answer privately | DB-S "accepts an enrolled student and returns the normalised answer"; API-P "locks each student's first answer"; C-SP "locks an answer with one tap and shows Locking while it travels" | TC-PAD-033 | Automated pass; manual pending |
| 4 | Students cannot see other students' answers | API-P "shows the teacher a count while OPEN, never names or answers" (a student's snapshot never contains another student's id); DB-S "student snapshot"; DB-L "gives anon and authenticated no privilege on any pad table" | TC-PAD-034, 069 | Automated pass; manual pending |
| 5 | Correct answer is unavailable before Reveal | DB-S "never carries the key, the grading choice or any result before Reveal"; API-P "lets the key change freely and keeps it from students until REVEAL"; C-SP "shows correct, incorrect and poll results only after REVEAL" | TC-PAD-024, 069 | Automated pass; manual pending |
| 6 | Teacher can Close, set/change key, Reopen, and Reveal | DB-L "CLOSE, REOPEN, SET KEY, REVEAL"; API-P "stops answers at CLOSE...", "lets the key change freely...", "clears the key at REOPEN...", "grades everyone at REVEAL, in one step, for good"; C-TC "keeps Reveal off until a key is chosen, then reveals", "marks a question as a poll instead of choosing a key"; UI | TC-PAD-023 to 027 | Automated pass; manual pending |
| 7 | Grading is server-authoritative | DB-L "database guards, even for a caller holding the service key"; API-P "grades everyone at REVEAL, in one step, for good"; MUT | TC-PAD-035 | Automated pass |
| 8 | Teacher can distinguish correct, incorrect, present-but-silent and absent | DB-P "participation: exactly one row per student", "participation: presence inside the prompt window"; API-P "names every student once in the details after REVEAL"; C-TC "shows the four groups after REVEAL and the names on request"; UI step "the four groups add up to the class list, and names come on request" | TC-PAD-028, 046, 047 | Automated pass; manual pending |
| 9 | Student state survives reconnect | UI steps "a reload on either side comes back exactly where the class was" and "an answer tapped with the network off locks once it is back"; C-SP "keeps trying to lock the answer while the connection is down", "shows the server's locked answer after a reload instead of the answer buttons"; DB-S "returns the locked answer to a retry that arrives after CLOSE"; C-HK; U-MG | TC-PAD-056 to 058, 060 | Automated pass; manual pending |
| 10 | Teacher state survives refresh | UI reload step; API-S "starts a session for the chosen classroom and resumes it when the console reopens"; DB-L "resumes silently for the same class and meeting" | TC-PAD-018, 059 | Automated pass; manual pending |
| 11 | Late join behavior is deterministic | DB-P "participation: joined mid-prompt" and presence window tests; C-SP "tells a student who opened the pad late that the question closed before they joined"; U-VW (the three ways of missing a question) | TC-PAD-036, 048, 050 | Automated pass; manual pending |
| 12 | Duplicate answers are prevented | DB-S "keeps the first answer: a duplicate or a different second answer returns the first"; API-P "locks each student's first answer"; LOAD (60 concurrent submits, exactly one locked answer per student) | TC-PAD-033 | Automated pass |
| 13 | Presence records cannot duplicate students in reporting | DB-P "returns one row per roster student despite duplicate and overlapping presence from every source", "meeting intervals under duplicate and out-of-order delivery"; API-P report test (each student once) | TC-PAD-054 | Automated pass |
| 14 | Mobile experience works | UI on emulated Pixel 5, iPhone 13 and a 320px side panel: no sideways scroll, answer buttons at least 44px | TC-PAD-038, 039, 076 | Automated pass (emulated); real devices pending |
| 15 | Student activation works in a real Teams meeting | Automated only with the injected Teams host: UI, C-MP, C-TA; sign-in tokens in U-SSO; manifest in U-MAN | TC-PAD-002, 007 to 010, 032, 052 | **Pending**: needs Teams SSO set up and the app sideloaded |
| 16 | Security tests pass against direct API/client manipulation | Section B below: API-S, API-P, DB-L, DB-S | TC-PAD-069 to 073 | Automated pass; manual spot checks pending |
| 17 | A real batch can complete a full class session without teacher confusion | None possible | TC-PAD-078, 079 | **Pending**: UAT |

---

## B. Security statements (side-panel spec section 9)

| # | Statement | Automated evidence | Manual | Status |
|---|---|---|---|---|
| 1 | Student A cannot read Student B's response | API-P "shows the teacher a count while OPEN, never names or answers" (A's snapshot text never contains B's id); DB-S "student snapshot"; API-P "refuses prompt routes without a token, and keeps students and teachers on their own sides" (participation refused to students) | TC-PAD-069 | Pass |
| 2 | Student cannot read correct_keys before Reveal | DB-S "never carries the key, the grading choice or any result before Reveal"; API-P "lets the key change freely and keeps it from students until REVEAL" | TC-PAD-069 | Pass |
| 3 | Student cannot modify an existing response | DB-S "keeps the first answer: a duplicate or a different second answer returns the first"; API-P "locks each student's first answer"; DB-L "database guards, even for a caller holding the service key" | TC-PAD-033 | Pass |
| 4 | Student cannot submit after Close | DB-S "rejects a first answer after CLOSE and after REVEAL, and logs it"; API-P "stops answers at CLOSE, while a locked answer can still be fetched again" | TC-PAD-058 | Pass |
| 5 | Student cannot submit after Reveal | DB-S "rejects a first answer after CLOSE and after REVEAL, and logs it"; API-P "asks before ending with a question still open, then closes it for good" (SESSION_NOT_LIVE after end) | | Pass |
| 6 | Student cannot trigger Reveal | API-P "refuses prompt routes without a token, and keeps students and teachers on their own sides"; DB-L "refuses a student and another teacher, and logs the refusal" | TC-PAD-070 | Pass |
| 7 | Student cannot modify another session's prompt | DB-L "refuses a student and another teacher, and logs the refusal"; API-P as #6 | TC-PAD-070 | Pass |
| 8 | Student cannot impersonate a teacher | API-S "keeps each role on its own surface"; U-CL (role comes from the Nexus staff record, never from the client); U-SSO (token audience, tenant, issuer, client and signature) | TC-PAD-070 | Pass |
| 9 | Room code alone cannot authenticate a student | DB-S "never lets the room code authenticate anyone on its own"; API-S "refuses a student outside the classroom, even holding the right room code", "locks room-code guessing after eight failures, even for the right code" | TC-PAD-041, 064 | Pass |
| 10 | A student not enrolled cannot submit, read the session, or join its channel | DB-S "rejects anyone not actively enrolled as a student in the session classroom"; API-S "refuses a student outside the classroom, even holding the right room code"; the Realtime topic is handed out only inside an authorised snapshot (DB-S "shows an idle session before the first ASK, with no room code or teacher topic") | TC-PAD-041 | Pass |
| 11 | Student cannot call any teacher function (ASK, CLOSE, REOPEN, SET KEY, END SESSION) | API-P "refuses prompt routes without a token, and keeps students and teachers on their own sides"; API-S "keeps each role on its own surface"; API-P reminders and report refused to a student | TC-PAD-070 | Pass |
| 12 | Student cannot read presence, events, or any participation list | DB-L "gives anon and authenticated no privilege on any pad table", "gives anon and authenticated no privilege on the sequences behind pad tables", "refuses a direct read as anon and a direct RPC as authenticated"; API-S "reaches nothing through Supabase with the public anon key" | TC-PAD-071 | Pass |
| 13 | Student cannot subscribe to the teacher Realtime channel | DB-L "starts a live session with a 6-digit room code and two distinct random topics"; DB-S student snapshot carries no teacher topic; C-HK "a student listens on the students' topic, never the teacher's"; U-RT (payload is a version only) | TC-PAD-072 | Pass (live check blocked until the proxy fix is deployed) |
| 14 | Holding a Teams Presenter role does not make a student a teacher | By design no code reads the Teams meeting role; U-CL and API-S "keeps each role on its own surface" | Fold into TC-PAD-008: make S1 a presenter, S1 still gets the pad | Pass (automated); manual pending |
| 15 | Teacher cannot read or change another teacher's session | DB-L "refuses to let another teacher end a session"; API-S "shows the console snapshot to the session teacher only"; API-P "refuses another teacher on every prompt route, and answers 404 for an unknown prompt"; API-P report and reminders refused to another teacher | TC-PAD-068 | Pass |
| 16 | Concurrent duplicate submits leave exactly one response | DB-S "keeps the first answer..." (unique response per student and prompt); LOAD | | Pass |
| 17 | A submit that commits after Close is rejected | DB-S "rejects a first answer after CLOSE and after REVEAL, and logs it" (state checked under the prompt's row lock); MUT | | Pass |
| 18 | Participation groups sum to enrolled, even with duplicate and overlapping presence rows | DB-P "returns one row per roster student despite duplicate and overlapping presence from every source", "scoring and participation agree with an independent model"; API-P count sums; UI sum step | TC-PAD-046 | Pass |
| 19 | Every invalid transition is rejected and returns the current state | DB-L "refuses REVEAL from OPEN and SET KEY while OPEN", "refuses every transition once the session has ended"; API-P "refuses a key or a reveal while the prompt is OPEN" (INVALID_TRANSITION with the state), KEY_REQUIRED; U-RPC. The screens then refetch the snapshot | TC-PAD-025, 030 | Pass |

Additional security checks from the build plan:

| Check | Automated evidence | Manual | Status |
|---|---|---|---|
| No database text ever reaches a client | Every API-S and API-P response passes the leak check in `pad-api.ts`; U-RPC | TC-PAD-077 | Pass |
| No caching of pad answers | API-S "answers 401 on every route without a valid token, and forbids caching" | | Pass |
| The bot endpoint believes only the Bot Framework connector | U-BOT (12 token rules: issuer, audience, lifetime, signature, key rotation, service URL, Teams endorsement); R-BOT; API-P forged and unsigned bot requests answer 401 | TC-PAD-051 | Pass |
| Only Teams and Microsoft 365 may frame the pad | U-EMB (vercel.json headers) | TC-PAD-073 | Pass; live check needs a deploy |
| Switched off means unreachable | U-CL; every route answers 404 while the flag is off | TC-PAD-005 | Pass |

---

## C. Scoring rules (v3.1 section 11)

| Rule | Automated evidence | Manual | Status |
|---|---|---|---|
| Only revealed, graded questions count | DB-P "scores a worked example: correct, wrong and skipped count; absent, polls and unrevealed prompts do not"; API-P "starts Q2 at the next ASK, and a poll never grades or scores"; U-RP | TC-PAD-027, 031, 061 | Pass |
| Present and silent counts as skipped, and as graded | DB-P worked example; U-RP CSV | TC-PAD-047 | Pass |
| Absent never counts for or against a student | DB-P worked example; DB-P oracle | TC-PAD-050 | Pass |
| Score is correct out of graded | DB-P; C-SP "shows the final score when the class ends"; U-VW; U-RP | TC-PAD-040 | Pass |
| The report and the pad agree | API-P "reports every question and every student, with the score each student's pad showed"; DB-P "session report" | TC-PAD-066 | Pass |
| A question left unrevealed at the end is never graded | DB-L "asks for confirmation before ending with an unrevealed prompt, then closes it"; API-P report (question 3 closed, not graded); UI end step ("You got 1 of 1 graded questions.") | TC-PAD-031, 066 | Pass |
| Random classes agree with an independent model | DB-P "scoring and participation agree with an independent model" (seeded) | | Pass |

---

## D. Classroom resilience (side-panel spec section 12)

| Situation | Automated evidence | Manual | Status |
|---|---|---|---|
| Student answers, then loses network | UI offline and reload steps; C-SP locked after reload; C-HK "keeps the last snapshot on screen when the network drops, and says so" | TC-PAD-056 | Pass; manual pending |
| Student taps; network drops before the server confirms | C-SP "keeps trying to lock the answer while the connection is down", "says so when the question closed before the answer arrived"; DB-S "returns the locked answer to a retry that arrives after CLOSE"; UI offline step | TC-PAD-057, 058 | Pass; manual pending |
| Teacher refreshes Teams or the app | UI reload step; API-S resume test; DB-L "resumes silently for the same class and meeting" | TC-PAD-059 | Pass; manual pending |
| Side panel closed, suspended or recreated | C-HK "refetches when Teams brings the panel back and when the network returns"; C-MP (resume checks again); UI reload | TC-PAD-060 | Pass; manual pending on phones |
| Late joiner, prompt OPEN | DB-P "participation: joined mid-prompt" | TC-PAD-048 | Pass |
| Late joiner, prompt CLOSED or REVEALED | C-SP late joiner test; DB-P presence window tests | TC-PAD-036, 050 | Pass |
| Wrong answer key | API-P "lets the key change freely and keeps it from students until REVEAL"; C-TC key tests | TC-PAD-024 | Pass |
| Closed too early | API-P "clears the key at REOPEN and lets the students who had not answered answer" | TC-PAD-026 | Pass |
| Duplicate tap (student) | DB-S first answer wins; API-P; LOAD | TC-PAD-033 | Pass |
| Double tap or retry (teacher) | API-P "opens one prompt however often ASK is pressed", repeated CLOSE and REVEAL answer `changed: false` | TC-PAD-030 | Pass |
| Accidental ASK | API-P poll test; C-TC poll test | TC-PAD-061 | Pass |
| Reopening the app, session recovery | DB-L "resumes silently for the same class and meeting", "does not silently resume a session older than 6 hours"; API-S "never silently replaces a live session with another class"; C-TC "offers to end the other live class instead of silently replacing it" | TC-PAD-018, 019 | Pass |
| Ending with a prompt not yet revealed | DB-L; API-P; C-TC "warns before ending the class with a question that was never revealed"; UI end step | TC-PAD-031 | Pass |
| Teams join or leave event missed | DB-S "keeps one presence interval alive with heartbeats and starts a new one after a gap"; DB-P attendance intervals and bot interval tests | TC-PAD-049, 054 | Pass; bot live check pending |

---

## E. Other build requirements

| Requirement | Automated evidence | Manual | Status |
|---|---|---|---|
| Teams sign-in validated locally, other tokens unchanged | U-SSO | TC-PAD-008 to 011 | Pass; live pending |
| Meeting bound to its scheduled class, else the class chosen once per series | U-BD; DB-M; API-S "joins from the Teams meeting once the teacher starts, and remembers the meeting series", "asks which classroom when nothing identifies the class, scoped to what the teacher may run" | TC-PAD-015, 016 | Pass; live pending |
| External teachers run only their classes | API-S "lets an external teacher run only classrooms they teach" | TC-PAD-017 | Pass |
| Room code fallback in a browser | API-S "lets an enrolled student join by room code, and refuses a wrong code"; C-BA; C-MP | TC-PAD-062 to 065 | Pass; live pending |
| Participant events become presence | U-BOT activity tests; R-BOT; DB-P "bot" | TC-PAD-054, 055 | Pass; live pending |
| "Question N is open" notification and reminders | U-BOT notify tests; `notify-session.test.ts`; API-P "keeps reminders to the session teacher, sends none without a meeting bot, and limits how often"; C-TC reminder tests | TC-PAD-052, 053 | Pass; live pending (needs Azure Bot) |
| Report and CSV | U-RP; C-RP; API-P report test; DB-P "session report" | TC-PAD-066 to 068 | Pass; manual pending |
| Teams manifest 1.1.0 is consistent with the code | U-MAN; package script validation | TC-PAD-006, 014 | Pass; upload pending |
| Accessibility | UI axe scans (ready console, waiting pad, revealed console: no serious or critical WCAG A/AA issues); U-VW announcements; C-TC and C-SP use roles and labels | TC-PAD-074 to 076 | Pass; screen reader check pending |
| No em dashes or double dashes in UI text | C-SP, C-TC, C-RP dash checks; U-VW wording test | TC-PAD-077 | Pass |
| Realtime hints carry no state | U-RT | TC-PAD-072 | Pass; live check blocked on proxy deploy |
| The Answer Pad button appears in class meetings without anyone adding it: least-privilege Graph calls, retried near class time, never failing or delaying scheduling | U-TAB; R-CRON | TC-PAD-081 to 084 | Pass; live pending (needs the two Graph permissions) |
| Phone-first question pop-up with only the answer buttons, and a student download without the teacher console | C-SP "drops the header and the long hint in the pop-up"; C-MP "uses pop-up wording while the compact pad waits"; C-TA pop-up test; `notify-session.test.ts` "questionPopupUrl" | TC-PAD-085, 086, 091 | Pass; device check pending |
| Red badge on the Answer Pad button when a question opens, sent apart from the pop-up | U-BOT "the red badge on the Answer Pad button"; `notify-session.test.ts` "sends the pop-up and the button badge" | TC-PAD-089 | Pass; live pending |
| One class chat card per session with the room code, a side panel link and a browser link | U-CARD; `notify-session.test.ts` "announceSessionInChat" and "announceForStart" | TC-PAD-087, 088 | Pass; live pending |
| Share results: class-level numbers only, no breakdown before reveal, never typed text, only the session teacher and enrolled students | U-STG; R-STG; C-STG; C-TC "shares the class results to the meeting screen"; C-TA stage test; `pad-host.test.ts` "stageSharing" | TC-PAD-090 | Pass; live pending |

---

## F. Known gaps

| # | Gap | Mitigation |
|---|---|---|
| G1 | Real Teams sign-in, the side panel on the four real clients, the bot and notifications can only be verified in a real meeting | Manual sections 2, 4, 7; entry needs the Azure steps in `teams-app/README.md` |
| G2 | Load timings were measured on the local dev server (p95 above 1 second there) | Re-run `pnpm pad:load --strict` against a deployed preview |
| G3 | Realtime is not exercised live while the Cloudflare proxy drops WebSocket upgrades | Screens poll (tested in UI); deploy the proxy fix after approval, then TC-PAD-072 |
| G4 | The Teams configuration page has no automated test beyond the manifest contract | TC-PAD-007 |
| G5 | Statement B14 (Teams Presenter role) has no dedicated manual case | Checked inside TC-PAD-008 |
| G6 | The shared meeting screen is tested with Teams mocked only | TC-PAD-090 on the real clients |
| G7 | Which Teams client shows the pop-up, the badge, the side panel and shared results comes from Microsoft's documentation, not from devices | TC-PAD-080 device check before judging other cases |
| G8 | A scheduled meeting's chat may refuse Graph until somebody joins, so the automatic button can appear minutes after the first join | The five-minute sweep; the Apps step still works; TC-PAD-082 records when it appeared |
