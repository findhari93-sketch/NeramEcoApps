# Neram Nexus Answer Pad: Manual Test Cases

> **Module:** Answer Pad, live class questions in the Microsoft Teams meeting side panel
> **App:** Nexus (nexus.neramclasses.com) inside Microsoft Teams, and `/pad` in a browser
> **Version:** 1.1
> **Created:** 2026-09-10
> **Updated:** 2026-09-11 (section 14: automatic button, question pop-up, class chat card, red badge, Share results)
> **Author:** QA (Claude), executed with Hari
> **Spec Reference:** `TEAMS_LIVE_QUIZ_PLAN.v3-sidepanel.md` (v1), v3.1 section 11 scoring
> **Test Plan:** `apps/nexus/Docs/answer-pad/TEST_PLAN.md`
> **How to run these:** `apps/nexus/Docs/answer-pad/HOW_TO_TEST.md`
> **Total Test Cases:** 91

---

## Test Environment

| Item | Value |
|------|-------|
| **Nexus** | Local production-mode build (`next start`) on `http://localhost:3022`, wired to staging and reached from Teams through a Cloudflare quick tunnel. Never the dev server, which accepts test sign-ins (HOW_TO_TEST 1.3). The Answer Pad is not deployed to a hosted environment yet |
| **Teams app** | "Neram Pad Dev" (dev package) for testing; "Neram Assistant" 1.1.0 once published |
| **Database** | Supabase staging (`hgxjavrsrvpihqrpezdh`), migration `20260911090100_answer_pad.sql` |
| **Auth** | Microsoft Entra ID through Teams single sign-on; Nexus sign-in on `/pad` |
| **Teams clients** | Desktop (Windows or macOS), web (Edge or Chrome), Android, iOS |
| **Widths** | Side panel about 320px, phones 375px to 430px, tablet 768px |

### Test Accounts Required

| Role | Account Description | Notes |
|------|--------------------|-------|
| T1 | Teacher who teaches E2E Test Classroom | Runs the console |
| T2 | A second teacher of the same classroom | Must not control T1's session |
| S1 | Enrolled student | Teams desktop or web |
| S2 | Enrolled student | Android |
| S3 | Enrolled student | iOS |
| S4 | Student not enrolled in E2E Test Classroom | For refusals |
| A1 | Nexus admin | Feature flags |

### Key API Endpoints Under Test

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/pad/me` | GET | Teacher console or student pad |
| `/api/pad/sessions` | POST | Start or resume a session for the meeting |
| `/api/pad/sessions/{id}/snapshot` | GET | The whole truth for one screen |
| `/api/pad/sessions/{id}/end` | POST | End the class |
| `/api/pad/sessions/{id}/report` | GET | Class report |
| `/api/pad/sessions/{id}/resend` | POST | Remind students without the pad |
| `/api/pad/join` | POST | Join by meeting or room code |
| `/api/pad/heartbeat` | POST | Keep a student counted as connected |
| `/api/pad/prompts/ask` | POST | Open a question |
| `/api/pad/prompts/{id}/close`, `/reopen`, `/key`, `/reveal`, `/label` | POST | Question transitions |
| `/api/pad/prompts/{id}/participation` | GET | Named details after closing |
| `/api/pad/submit` | POST | Lock a student's answer |
| `/api/pad/bot/messages` | POST | Bot Framework only |
| `/api/pad/stage` | GET | Class results for the meeting screen |
| `/api/cron/pad-meeting-tabs` | GET | Adds the Answer Pad to due class meetings (needs `CRON_SECRET`) |

---

## Execution Legend

| Status | Meaning |
|--------|---------|
| **Not Run** | Test has not been executed yet |
| **Pass** | Test executed and all expected results confirmed |
| **Fail** | Test executed and one or more expected results not met |
| **Blocked** | Cannot run due to dependency or environment issue |
| **Skipped** | Intentionally skipped (document reason) |

Priority: **P0** before any pilot, **P1** before the pilot, **P2** before general release, **P3** when convenient.

---

## 1. Smoke Tests (P0)

Run these first. If one fails, stop and report it.

---

### TC-PAD-001: Teacher starts the Answer Pad in a meeting
**Priority:** P0
**Type:** Smoke
**Preconditions:** Neram Pad Dev added to a meeting (TC-PAD-007). T1 in the meeting on Teams desktop.
**Steps:**
1. Open Neram Pad Dev from the meeting toolbar.
2. If asked "Which class is this?", select E2E Test Classroom.
**Expected Result:** "Starting the Answer Pad." shows briefly, then the console with the classroom name, "Started" time, the "Before you ask" panel with a six digit room code, and the **Ask question 1** button. No sign-in prompt appears.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-002: Student opens the pad and is connected
**Priority:** P0
**Type:** Smoke
**Preconditions:** TC-PAD-001 done. S1 in the same meeting.
**Steps:**
1. S1 opens Neram Pad Dev from the meeting toolbar.
2. T1 watches the "Before you ask" panel.
**Expected Result:** S1 sees "You're connected" and "Questions will appear here when your teacher asks.", with "No score yet". Within about 10 seconds T1's count rises by one ("1 of N students have the pad open").
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-003: One full question
**Priority:** P0
**Type:** Smoke
**Preconditions:** TC-PAD-002 done, with S1 and S2 connected.
**Steps:**
1. T1 selects **Ask question 1** (A to D).
2. S1 taps B. S2 taps A.
3. T1 selects **Close answers**, selects **B** as the correct answer, then **Reveal answer**.
**Expected Result:** Both students see "Question 1" within about 5 seconds. After tapping, each sees "Answer locked: B" or "Answer locked: A". T1's counter reaches 2. After reveal, S1 sees "Correct", S2 sees "Not this time" with "The answer was B.", and T1 sees Correct 1 and Incorrect 1.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-004: End the class and open the report
**Priority:** P0
**Type:** Smoke
**Preconditions:** TC-PAD-003 done.
**Steps:**
1. T1 selects **End class**, then **End**.
2. T1 selects **Open the class report**.
**Expected Result:** The console shows "Class ended after 1 question." Students see "This class has ended" with their score. The report opens in the browser with Questions asked 1, Graded 1, and one row per student.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-005: Switched off means hidden
**Priority:** P0
**Type:** Smoke
**Preconditions:** A1 can edit feature flags. A spare student account.
**Steps:**
1. A1 turns `student.answer-pad` off for the spare student.
2. The student opens the Answer Pad in the meeting.
3. A1 turns it back on.
**Expected Result:** The student sees "The Answer Pad isn't switched on for your account yet." with no Try again button. After the flag is back on, reopening the panel works.
**Actual Result:**
**Status:** Not Run

---

## 2. Teams Install and Sign-in

---

### TC-PAD-006: The Teams package uploads cleanly
**Priority:** P0
**Type:** Installation
**Preconditions:** Package built with `package-teams-app.mjs` (dev or production).
**Steps:**
1. Upload the zip (Teams, Manage your apps, Upload a custom app; or Teams admin center for production).
**Expected Result:** No validation errors. The app shows its name, icons and, for production, the new meeting permissions to review.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-007: Adding the app to a meeting
**Priority:** P0
**Type:** Installation
**Preconditions:** A scheduled meeting organised by T1.
**Steps:**
1. In the meeting chat, select **+** (Apps) and choose the app.
2. Read the configuration page, then select **Save**.
**Expected Result:** The page reads "Answer Pad" and "There is nothing to set up. Select Save, then open the Answer Pad from the meeting toolbar during class." Save succeeds, and the app appears in the meeting toolbar and as a chat tab.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-008: Silent sign-in on Teams desktop
**Priority:** P0
**Type:** Functional
**Preconditions:** SSO configured (HOW_TO_TEST 1.5). T1 and S1 on Teams desktop.
**Steps:**
1. Open the Answer Pad in the meeting as T1, then as S1.
**Expected Result:** No sign-in window or consent prompt. T1 gets the console, S1 the pad.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-009: Sign-in on Teams web
**Priority:** P1
**Type:** Functional
**Preconditions:** S1 using Teams in Edge or Chrome.
**Steps:**
1. Join the meeting in the browser and open the Answer Pad.
**Expected Result:** Same as TC-PAD-008. If a one-time consent prompt appears, accepting it opens the pad and it does not appear again.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-010: Sign-in on Android and iOS
**Priority:** P1
**Type:** Functional
**Preconditions:** S2 on Android, S3 on iOS, Teams app up to date.
**Steps:**
1. Join the meeting on the phone and open the Answer Pad from the meeting's more options.
2. Note how long it takes from tap to "You're connected".
**Expected Result:** No sign-in prompt; the pad opens. Record the time; over 10 seconds is an S3 defect.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-011: A non-Neram account
**Priority:** P2
**Type:** Negative
**Preconditions:** A guest or personal Microsoft account in the meeting.
**Steps:**
1. The guest opens the Answer Pad.
**Expected Result:** "Teams could not sign you in to Neram. Check that you are using your Neram Microsoft account, then try again." with **Try again**. No class data is shown.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-012: The side panel address outside Teams
**Priority:** P2
**Type:** Negative
**Preconditions:** None.
**Steps:**
1. Open `/pad/teams` directly in a normal browser tab.
**Expected Result:** Within about 5 seconds: "Open this in a Teams meeting", with a **Join with a room code** button that goes to `/pad`.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-013: Teams light, dark and high contrast themes
**Priority:** P2
**Type:** UI
**Preconditions:** T1 and S1 in a class.
**Steps:**
1. In Teams settings, switch between Light, Dark and High contrast while the pad and console are open (reopen the panel if needed).
**Expected Result:** Both screens follow the theme with readable text. In High contrast, borders are white on black and the focused control has a yellow outline.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-014: My Work and reminders still work after the upgrade
**Priority:** P1
**Type:** Regression
**Preconditions:** Production app 1.1.0 uploaded; a student with the app installed personally.
**Steps:**
1. The student opens the **My Work** tab of Neram Assistant.
2. Trigger an assignment reminder from Nexus.
**Expected Result:** My Work loads as before, and the reminder arrives in the Teams activity feed.
**Actual Result:**
**Status:** Not Run

---

## 3. Teacher Flow

---

### TC-PAD-015: The class is chosen once per meeting series
**Priority:** P0
**Type:** Functional
**Preconditions:** A recurring meeting not created by Nexus scheduling.
**Steps:**
1. In the first occurrence, T1 opens the Answer Pad and picks E2E Test Classroom, then ends the class.
2. In the next occurrence (or the same meeting after ending), T1 opens the Answer Pad again.
**Expected Result:** Step 1 shows "Which class is this?" and "Pick it once and it is remembered for this meeting series." Step 2 goes straight to the console for E2E Test Classroom.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-016: A scheduled Nexus class needs no choice
**Priority:** P1
**Type:** Functional
**Preconditions:** A class scheduled in the Nexus timetable for today, with its Teams meeting.
**Steps:**
1. T1 joins that meeting and opens the Answer Pad.
**Expected Result:** The console opens for that class without asking which class it is.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-017: A teacher only runs classes they teach
**Priority:** P1
**Type:** Security
**Preconditions:** An external teacher who teaches some classrooms, not all.
**Steps:**
1. The teacher opens the Answer Pad in an unlinked meeting and reads the class list.
2. The teacher opens it in a meeting scheduled for a class they do not teach.
**Expected Result:** Step 1 lists only classrooms they teach. Step 2 shows "You can only run the Answer Pad for classes you teach." with **Try again**.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-018: Reopening the console resumes the class
**Priority:** P0
**Type:** Resilience
**Preconditions:** A live class with question 1 open.
**Steps:**
1. T1 closes the side panel, then opens it again.
**Expected Result:** No class picker and no conflict message: the same session, with "Question 1 is open" and the live count as it was.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-019: An old live class is never silently replaced
**Priority:** P1
**Type:** Functional
**Preconditions:** T1 has a live session in another classroom (started earlier and not ended).
**Steps:**
1. T1 opens the Answer Pad in a different meeting and picks E2E Test Classroom.
2. Select **End (other class) and start this class**.
**Expected Result:** Step 1 shows "(Other class) is still running, started at (time)." with the end-and-start button and **Continue that class instead**. Step 2 ends the old session and starts this one.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-020: Readiness before the first question
**Priority:** P1
**Type:** Functional
**Preconditions:** A new session; S1 to S3 open the pad one by one.
**Steps:**
1. T1 watches "Before you ask" as each student opens the pad.
**Expected Result:** "N of M students have the pad open" counts up. The checks show "Teams connected", "Class: E2E Test Classroom", "Live updates on" or "Updating every few seconds", and the bot line. The room code shows as two groups of three digits, with the `/pad` address.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-021: Asking takes four taps or fewer
**Priority:** P0
**Type:** Usability
**Preconditions:** A session with the console ready.
**Steps:**
1. T1 selects **Short text**, then **Ask question 1**. Count the taps.
2. After revealing, T1 asks question 2.
**Expected Result:** Asking takes at most two taps. The answer type and the number of options are remembered, so question 2 starts with **Short text** already chosen.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-022: Only a count while students answer
**Priority:** P0
**Type:** Security
**Preconditions:** Question open; S1 and S2 answer, S3 does not.
**Steps:**
1. T1 looks at the console while students answer.
**Expected Result:** A large "2 / N" and "answered". No student names, no answers, no chart and no **Show names** button while the question is open. An answer from someone off the class list shows as "plus 1 not on the class list".
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-023: Closing shows the spread of answers
**Priority:** P0
**Type:** Functional
**Preconditions:** TC-PAD-022.
**Steps:**
1. T1 selects **Close answers**.
**Expected Result:** "Question 1 closed", a bar per option with its count, the **Correct answer** buttons with counts (for example "B (1)"), **Poll, don't grade**, and **Reveal answer** disabled with "Choose the correct answer, or mark it as a poll, to reveal." Students can no longer answer.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-024: The key can change freely before reveal
**Priority:** P1
**Type:** Functional
**Preconditions:** Question closed.
**Steps:**
1. T1 selects A, then also C, then deselects A.
2. T1 taps C (the only key left).
3. S1 checks the pad during all of this.
**Expected Result:** Keys update each time (a tick marks each chosen answer). Tapping the only remaining key does nothing. Students see nothing about the key until reveal.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-025: Reveal needs a key or a poll
**Priority:** P1
**Type:** Negative
**Preconditions:** Question closed with no key.
**Steps:**
1. T1 tries **Reveal answer**.
2. T1 chooses a key, then reveals.
**Expected Result:** Step 1 is not possible (the button is disabled). Step 2 reveals.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-026: Reopen after closing too early
**Priority:** P1
**Type:** Functional
**Preconditions:** Question closed with a key chosen; S3 has not answered.
**Steps:**
1. T1 selects **Reopen**.
2. S1 (already answered) and S3 (not answered) look at their pads. S3 answers.
3. T1 closes again.
**Expected Result:** The question is open again with the key cleared. S1 still sees "Answer locked". S3 can answer. After closing, T1 must choose the key again.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-027: Poll, don't grade
**Priority:** P1
**Type:** Functional
**Preconditions:** Question closed.
**Steps:**
1. T1 selects **Poll, don't grade**, then **Reveal answer**.
**Expected Result:** The console shows "Poll, not graded" with Answered, Present but silent and Absent. Students who answered see "Thanks for answering" and "This one was a poll, so it is not graded." Nobody's score changes.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-028: Reveal groups and names
**Priority:** P0
**Type:** Functional
**Preconditions:** Question revealed; S1 correct, S2 incorrect, S3 connected but silent.
**Steps:**
1. T1 reads the four groups, then selects **Show names**.
**Expected Result:** Correct 1, Incorrect 1, Present but silent 1, Absent for the rest, adding up to the class list. Names are listed under each group; incorrect answers show "answered A". A student who opened the pad after the question opened shows "Joined mid-question".
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-029: Question numbers and the question history
**Priority:** P1
**Type:** Functional
**Preconditions:** A session with nothing asked yet.
**Steps:**
1. T1 types 38 in **Question no.**, types a short question in **Question (optional)** (or dictates it with Windows + H), and selects **Ask Q.38**.
2. T1 closes and reveals it, then looks at the next Ask button.
3. T1 selects the pencil next to the question title, changes the number to 38a and selects **Save**.
4. After two questions, T1 taps an earlier question in "Questions so far".
**Expected Result:** Step 1: every student pad and the meeting screen say "Q.38", and the pads show the question text. Step 2: the button reads **Ask Q.39** with 39 already filled in. Step 3: every screen updates to "Q.38a". History chips read like "Q.38  1 of 2" or "Q.39 poll", and the report names each question the same way. Tapping an earlier revealed question shows its names below the strip.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-032: Decide the answer later
**Priority:** P1
**Type:** Functional
**Preconditions:** A question closed, with answers from at least two students.
**Steps:**
1. T1 selects **Decide later, ask the next question**, then asks the next question.
2. T1 taps the "Q.38 answer later" chip in "Questions so far", picks the answer the class chose most and selects **Reveal answer**.
3. Leave another question without an answer, end the class, open the class report and select **Set the answer** on it.
**Expected Result:** Step 1: the next question opens for students while the first keeps its answers. Step 2: the counts show beside each choice, and after the reveal the students' scores include it. Step 3: the report shows the answers counted, the reveal works after the class has ended, and the student table updates. Reopen works only on the newest question.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-030: Double taps do nothing twice
**Priority:** P1
**Type:** Resilience
**Preconditions:** A session.
**Steps:**
1. T1 double taps **Ask question N** quickly.
2. T1 double taps **Close answers**, then **Reveal answer**.
**Expected Result:** One question is created (history shows no extra question). Buttons are disabled while a press is being handled, and no error appears.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-031: Ending with a question not revealed
**Priority:** P1
**Type:** Functional
**Preconditions:** Question open or closed, not revealed.
**Steps:**
1. T1 selects **End class**, then **End**.
2. T1 selects **End anyway**.
**Expected Result:** Step 1 shows "Q.38 has no answer yet. You can set it later from the class report, and scores update then." (or "2 questions have no answer yet, starting with Q.38...") with **End anyway** and **Cancel**. Step 2 ends the class and says how many questions are waiting. Setting the answer from the report (TC-PAD-032) grades them.
**Actual Result:**
**Status:** Not Run

---

## 4. Student Flow on Each Client

---

### TC-PAD-032: Waiting for the teacher
**Priority:** P0
**Type:** Functional
**Preconditions:** A meeting with the app; T1 has not opened the console yet.
**Steps:**
1. S1 opens the Answer Pad.
2. T1 opens the console.
**Expected Result:** S1 sees "Waiting for your teacher" and "The Answer Pad opens here as soon as your teacher starts it. Keep this panel open." Within about 6 seconds of T1 starting, S1's pad opens.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-033: One tap locks the answer
**Priority:** P0
**Type:** Functional
**Preconditions:** Question open (A to D).
**Steps:**
1. S1 reads the hint, then taps C once.
2. S1 tries to tap another answer.
**Expected Result:** The hint reads "Tap an answer to lock it. You can't change it afterwards." After one tap, "Locking your answer" shows briefly, then "Answer locked: C" and "Wait for your teacher to close the question." No other answer can be chosen.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-034: Nothing about other students
**Priority:** P0
**Type:** Security
**Preconditions:** Several students answered.
**Steps:**
1. S1 looks at the pad through open, closed and revealed.
**Expected Result:** No other names, counts, answers or percentages ever appear. Only S1's own answer, result and score ("Score 1 of 2" once something is graded).
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-035: Results after reveal
**Priority:** P0
**Type:** Functional
**Preconditions:** A graded question revealed with key B, and a poll revealed.
**Steps:**
1. Compare S1 (answered B), S2 (answered A), S3 (answered in the poll).
**Expected Result:** S1: "Correct" and "You answered B.". S2: "Not this time" and "You answered A. The answer was B.". S3 in the poll: "Thanks for answering". Correct and incorrect also differ by icon, not only colour.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-036: Missing a question
**Priority:** P1
**Type:** Functional
**Preconditions:** A question S3 did not answer.
**Steps:**
1. S3 keeps the pad open and does not answer; T1 closes and reveals.
2. S4 (enrolled in a second class run) opens the pad after a question was already closed.
**Expected Result:** Step 1: "You didn't answer this one", then "The answer was B. The next question will appear here." Step 2: "This question closed before you joined".
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-037: Student on Teams web
**Priority:** P1
**Type:** Compatibility
**Preconditions:** S1 on Teams web.
**Steps:**
1. Repeat TC-PAD-033 and TC-PAD-035 in the browser.
**Expected Result:** Same results as desktop, with no layout problems.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-038: Student on Android
**Priority:** P1
**Type:** Compatibility
**Preconditions:** S2 on Android.
**Steps:**
1. Repeat TC-PAD-033 and TC-PAD-035 on the phone, holding it in one hand.
2. Rotate the phone to landscape.
**Expected Result:** Answer buttons are large and easy to hit, nothing scrolls sideways, and landscape stays usable.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-039: Student on iOS
**Priority:** P1
**Type:** Compatibility
**Preconditions:** S3 on iPhone.
**Steps:**
1. Repeat TC-PAD-038 on iOS, including a typed answer (the keyboard must not cover the **Lock answer** button).
**Expected Result:** As TC-PAD-038.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-040: The end of class
**Priority:** P1
**Type:** Functional
**Preconditions:** Two graded questions revealed; S1 got one right.
**Steps:**
1. T1 ends the class.
**Expected Result:** S1 sees "This class has ended" and "You got 1 of 2 graded questions." A class with no graded questions says "There were no graded questions in this class."
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-041: A student not on the class list
**Priority:** P1
**Type:** Security
**Preconditions:** S4 in the meeting; T1's session is for E2E Test Classroom.
**Steps:**
1. S4 opens the Answer Pad.
**Expected Result:** "You're not on the class list for this class. Ask your teacher to check your enrollment." S4 cannot see or answer questions.
**Actual Result:**
**Status:** Not Run

---

## 5. Answer Types

---

### TC-PAD-042: Multiple choice with 2, 4 and 6 options
**Priority:** P1
**Type:** Functional
**Preconditions:** A session.
**Steps:**
1. T1 uses **Fewer answer options** and **More answer options** to ask with 2, then 6 options.
**Expected Result:** The type button reads "A to B", then "A to F". Students see exactly that many large buttons; the key selector offers the same letters.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-043: Numbers
**Priority:** P1
**Type:** Functional
**Preconditions:** T1 asks a **Number** question.
**Steps:**
1. S1 enters `12.50`, S2 enters `12.5`, S3 enters `twelve`.
2. T1 closes and marks 12.5 correct, then reveals.
**Expected Result:** S3 sees "That answer does not fit this question. Please check it." with the text still in the box to fix. S1 and S2 appear as one group "12.5 (2)" and both are correct.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-044: Short text and more than one correct answer
**Priority:** P1
**Type:** Functional
**Preconditions:** T1 asks a **Short text** question.
**Steps:**
1. S1 types `Triangle `, S2 types `triangle`, S3 types `trianlge`.
2. T1 closes, marks "triangle" correct, types `trianlge` in **Another correct answer**, selects **Add**, and reveals.
**Expected Result:** S1 and S2 group together. All three are correct after the second key is added.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-045: Yes or No
**Priority:** P2
**Type:** Functional
**Preconditions:** T1 asks a **Yes or No** question.
**Steps:**
1. Students answer; T1 closes, marks Yes, reveals.
**Expected Result:** Students see two large buttons, Yes and No. Results and the report show "Yes" and "No", not internal values.
**Actual Result:**
**Status:** Not Run

---

## 6. Participation and Presence

---

### TC-PAD-046: The groups add up
**Priority:** P0
**Type:** Functional
**Preconditions:** A revealed graded question in a class of N.
**Steps:**
1. Add Correct + Incorrect + Present but silent + Absent on the console.
**Expected Result:** The sum equals N, the class list size shown in readiness ("of N").
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-047: Silent is not absent
**Priority:** P0
**Type:** Functional
**Preconditions:** S3 has the pad open and does not answer; another enrolled student never joins.
**Steps:**
1. Ask, close, key and reveal.
**Expected Result:** S3 counts as Present but silent; the student who never joined counts as Absent.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-048: Joined mid-question
**Priority:** P2
**Type:** Functional
**Preconditions:** Question open.
**Steps:**
1. S3 opens the pad only after the question is open, and answers.
2. T1 closes and selects **Show names**.
**Expected Result:** S3 is graded normally and carries the "Joined mid-question" label.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-049: In the meeting without the pad (bot)
**Priority:** P1
**Type:** Functional
**Preconditions:** Azure Bot set up and the app added before students join. S2 in the meeting but with the pad closed.
**Steps:**
1. Ask, close, key and reveal without S2 answering.
**Expected Result:** Readiness shows "in the meeting" counts. S2 counts as Present but silent (in the meeting), not Absent.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-050: A late joiner after closing
**Priority:** P1
**Type:** Resilience
**Preconditions:** Question 1 closed.
**Steps:**
1. A student joins the meeting and opens the pad now.
2. T1 reveals question 1, then asks question 2.
**Expected Result:** The student is Absent for question 1, sees "This question closed before you joined", and answers question 2 normally.
**Actual Result:**
**Status:** Not Run

---

## 7. Notifications and Bot

These need the Azure Bot (`apps/nexus/teams-app/README.md` section B). Mark them **Blocked** until it exists.

---

### TC-PAD-051: The bot is in the meeting
**Priority:** P1
**Type:** Functional
**Preconditions:** Bot configured; app added to the meeting before class.
**Steps:**
1. Students join. T1 opens the console.
**Expected Result:** Readiness shows "Meeting bot added".
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-052: "Question N is open" reaches students without the pad
**Priority:** P1
**Type:** Functional
**Preconditions:** TC-PAD-051; S2 in the meeting with the side panel closed.
**Steps:**
1. T1 asks a question.
2. S2 selects the notification.
**Expected Result:** Within a few seconds S2 sees a notification titled "Question N is open" in the meeting. Selecting it opens the pad. Students who already have the pad open get nothing.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-053: Remind students without the pad
**Priority:** P2
**Type:** Functional
**Preconditions:** TC-PAD-052, question open.
**Steps:**
1. T1 selects **Remind students without the pad**.
2. T1 selects it again at once.
**Expected Result:** Step 1 shows "Reminder sent to N students." (or "Everyone has the pad open."). Step 2 shows "A reminder just went out. Try again in a few seconds." Without the bot the button is not shown at all.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-054: Joins and leaves are recorded
**Priority:** P2
**Type:** Functional
**Preconditions:** TC-PAD-051.
**Steps:**
1. S2 leaves the meeting while a question is open and rejoins after it closes.
2. Reveal, then open the report.
**Expected Result:** S2's presence for that question matches what happened (Absent if away for the whole open window). No student appears twice anywhere.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-055: The meeting ends
**Priority:** P3
**Type:** Functional
**Preconditions:** TC-PAD-051.
**Steps:**
1. The organiser ends the meeting for everyone, then T1 opens the report.
**Expected Result:** The report shows nobody still "in the meeting" after the end.
**Actual Result:**
**Status:** Not Run

---

## 8. Resilience Drills

---

### TC-PAD-056: Answer, then lose the network
**Priority:** P0
**Type:** Resilience
**Preconditions:** S2 on a phone; question open.
**Steps:**
1. S2 taps B and sees "Answer locked: B".
2. S2 turns on airplane mode for 30 seconds while T1 closes and reveals.
3. S2 turns airplane mode off.
**Expected Result:** While offline the pad shows "No connection. Reconnecting now." After reconnecting it shows the revealed result for B without any action.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-057: Tap while offline
**Priority:** P0
**Type:** Resilience
**Preconditions:** Question open.
**Steps:**
1. S2 turns on airplane mode, then taps C.
2. After 15 seconds, S2 turns airplane mode off.
**Expected Result:** "Still trying to lock your answer" and "No connection yet. Your answer C will lock as soon as you are back online." After reconnecting, "Answer locked: C", and T1's count includes S2.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-058: The question closes before the offline answer arrives
**Priority:** P1
**Type:** Resilience
**Preconditions:** Question open.
**Steps:**
1. S2 goes offline and taps A.
2. T1 closes the question.
3. S2 comes back online.
**Expected Result:** S2 sees "This question closed before your answer arrived". The answer is not counted.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-059: The teacher refreshes Teams mid-class
**Priority:** P0
**Type:** Resilience
**Preconditions:** A class with a question in each state across the drill.
**Steps:**
1. With a question open, T1 reloads Teams (Ctrl+R on desktop or reload the browser tab).
2. Repeat with the question closed and a key chosen, then after reveal.
**Expected Result:** Each time the console comes back to exactly that state: the live count; the key selector with the key still chosen; the groups.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-060: The panel closes or the phone switches apps
**Priority:** P1
**Type:** Resilience
**Preconditions:** S2 on a phone, question open.
**Steps:**
1. S2 closes the side panel and reopens it.
2. S2 switches to another app for a minute, then back to Teams.
**Expected Result:** Both times the pad shows the current state within a few seconds, including an answer locked before leaving.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-061: An accidental ASK
**Priority:** P1
**Type:** Resilience
**Preconditions:** A class.
**Steps:**
1. T1 asks by mistake, then closes, selects **Poll, don't grade**, and reveals.
2. Compare student scores before and after.
**Expected Result:** No score changes, and the report counts the question as a poll.
**Actual Result:**
**Status:** Not Run

---

## 9. Room Code Fallback

---

### TC-PAD-062: Joining from a phone browser
**Priority:** P1
**Type:** Functional
**Preconditions:** A live session; S1 on a phone browser, not in Teams.
**Steps:**
1. Open `/pad`. If asked, select **Sign in** and sign in with the Neram account.
2. Type the room code from the console and select **Join class**.
3. Answer a question.
**Expected Result:** After sign-in the page returns to `/pad`. "Join with a room code" accepts digits only and enables **Join class** at six digits. The pad works as in Teams.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-063: A room code link, and reloading
**Priority:** P2
**Type:** Functional
**Preconditions:** A live session with code 482913 (use the real code).
**Steps:**
1. Open `/pad/r/482913`.
2. Reload the page.
**Expected Result:** The pad opens without typing the code, and a reload returns to the same class.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-064: Wrong codes
**Priority:** P2
**Type:** Negative
**Preconditions:** A signed-in student at `/pad`.
**Steps:**
1. Enter a wrong six digit code.
2. Enter wrong codes until refused.
**Expected Result:** Step 1: "That code doesn't match a live class. Check the six digits on your teacher's screen." Step 2: after eight failures, "Too many tries. Wait a minute, then try again.", even for the right code.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-065: A teacher at the room code page
**Priority:** P3
**Type:** Negative
**Preconditions:** T1 signed in to Nexus in a browser.
**Steps:**
1. T1 opens `/pad`.
**Expected Result:** "Teachers run the Answer Pad from the class meeting in Teams. Open the meeting, then select Answer Pad in the meeting toolbar."
**Actual Result:**
**Status:** Not Run

---

## 10. Report and CSV

---

### TC-PAD-066: The report matches the class
**Priority:** P0
**Type:** Functional
**Preconditions:** An ended class with graded questions, a poll and an unrevealed question.
**Steps:**
1. Open the report from the ended console.
2. Compare with what the console and each student's pad showed.
**Expected Result:** "Questions asked", "Graded", "Polls" and "Class score" are right; "1 question was never revealed, so it is not graded." is shown. Each student's Score equals the score their pad showed at the end.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-067: The CSV opens correctly in Excel
**Priority:** P1
**Type:** Functional
**Preconditions:** TC-PAD-066; include a student whose name has a comma or Tamil characters if available.
**Steps:**
1. Select **Download CSV** and open the file in Excel.
**Expected Result:** Columns: Student, On class list, Answered, Present but silent, Absent, Correct, Wrong, Skipped, Graded questions, Score. Names display correctly (no garbled characters) and stay in one column. Numbers match the page.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-068: Only the class's teacher sees the report
**Priority:** P1
**Type:** Security
**Preconditions:** The report link from TC-PAD-066.
**Steps:**
1. T2 opens the same report link.
**Expected Result:** "Only the teacher who ran this class can see its report." No data shows.
**Actual Result:**
**Status:** Not Run

---

## 11. Security Spot Checks (browser developer tools)

Use Teams web or `/pad` in Chrome, press F12, and watch the Network tab.

---

### TC-PAD-069: A student's snapshot hides the key and other students
**Priority:** P0
**Type:** Security
**Preconditions:** S1 on Teams web; question open, then closed with a key, then revealed.
**Steps:**
1. In Network, open each `snapshot` response while the question is open and closed.
2. Repeat after reveal.
**Expected Result:** Before reveal, `correct_keys` and `ungraded` are `null`, and there are no other students' ids, names or answers. After reveal only the key and S1's own result appear.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-070: A student cannot act as a teacher
**Priority:** P0
**Type:** Security
**Preconditions:** S1 on `/pad` with developer tools open; a live session id from the Network tab.
**Steps:**
1. Copy S1's `Authorization` header from any `/api/pad` request.
2. In the Console, call `fetch('/api/pad/prompts/ask', { method: 'POST', headers: { Authorization: '<copied>', 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: '<id>' }) }).then(r => r.status)`.
3. Try `/api/pad/sessions/<id>/end` the same way.
**Expected Result:** Both answer 403, and nothing changes on T1's console.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-071: The public database key reaches nothing
**Priority:** P0
**Type:** Security
**Preconditions:** The staging anon key (from HOW_TO_TEST or Supabase settings).
**Steps:**
1. Request `https://db-staging.neramclasses.com/rest/v1/pad_responses?select=*` with headers `apikey` and `Authorization: Bearer` set to the anon key.
2. Try `/rest/v1/rpc/pad_submit` with a POST.
**Expected Result:** No rows and no function access (an empty list, 401 or 404 style refusal).
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-072: Realtime messages carry nothing
**Priority:** P1
**Type:** Security
**Preconditions:** The Realtime proxy fix deployed (until then mark Blocked). Network, WS filter.
**Steps:**
1. Watch the WebSocket frames while T1 asks, closes and reveals.
**Expected Result:** Each message payload is only a version number like `{"v":...}`. No keys, answers or names.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-073: Only Teams may frame the pad
**Priority:** P2
**Type:** Security
**Preconditions:** A deployed preview (not the local dev server, which does not apply the headers).
**Steps:**
1. Check the response headers of `/pad/teams` and of `/student/assignments`.
**Expected Result:** `/pad/teams` sends `Content-Security-Policy: frame-ancestors` listing Teams and Microsoft 365 hosts, with no `X-Frame-Options`. Other pages send `X-Frame-Options: SAMEORIGIN`.
**Actual Result:**
**Status:** Not Run

---

## 12. Accessibility and Display

---

### TC-PAD-074: Screen reader announcements
**Priority:** P2
**Type:** Accessibility
**Preconditions:** NVDA on Windows (Teams web), VoiceOver on iOS or TalkBack on Android.
**Steps:**
1. With the screen reader on, a student goes through open, locked and revealed.
**Expected Result:** It announces "Question N is open.", "Your answer is locked.", and "Correct." or "Not this time." once each, without reading the whole screen again. Every button has a clear name ("Answer B").
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-075: Keyboard only
**Priority:** P2
**Type:** Accessibility
**Preconditions:** T1 on Teams web with no mouse.
**Steps:**
1. Using Tab, Shift+Tab, Enter and Space only, ask, close, choose a key and reveal.
**Expected Result:** Every control can be reached in a sensible order and has a visible focus outline.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-076: Widths and text size
**Priority:** P2
**Type:** UI
**Preconditions:** Browser responsive mode or real devices.
**Steps:**
1. View the console and the pad at 320px, 375px and 768px wide.
2. Increase browser text size to 200%.
**Expected Result:** Nothing scrolls sideways, nothing overlaps, and text wraps rather than being cut off.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-077: Wording
**Priority:** P3
**Type:** UI
**Preconditions:** Any run of the cases above.
**Steps:**
1. Read every message on the console, pad, room code page and report.
**Expected Result:** Plain words, no em dashes or double dashes, and no technical codes such as `PROMPT_NOT_OPEN` shown to anyone.
**Actual Result:**
**Status:** Not Run

---

## 13. UAT with a Real Batch

---

### TC-PAD-078: A full class rehearsal
**Priority:** P0
**Type:** UAT
**Preconditions:** Every P0 and P1 case above passes. A real batch, its teacher, flags on for them.
**Steps:**
1. The teacher runs the Answer Pad for a whole class: at least five questions, including a number question, a poll and a changed key.
2. Hari notes every moment of teacher hesitation or confusion.
3. Afterwards, ask five students: could you answer quickly, did you understand what you saw?
**Expected Result:** The class completes without help. No lost answers, no student sees another's answer, and the report matches the class. Confusion notes are recorded as defects or improvements.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-079: Class-scale behaviour
**Priority:** P1
**Type:** UAT
**Preconditions:** TC-PAD-078 with the full batch present.
**Steps:**
1. Note how quickly the counter reaches most of the class after each ASK.
2. Note whether any student reports a slow or stuck pad.
**Expected Result:** Most of the class is counted within about 15 seconds of ASK, and no pad stays stuck on "Locking your answer".
**Actual Result:**
**Status:** Not Run

---

## 14. Phone-first Meeting Features

About 90% of students join on the Teams phone app. Run TC-PAD-080 first: it records what each Teams client really does, and the other cases here are judged against it. Setup: HOW_TO_TEST sections 1.6 and 3.4 to 3.6, and `apps/nexus/teams-app/README.md` section F.

---

### TC-PAD-080: Device check, what each Teams client shows
**Priority:** P0
**Type:** Compatibility
**Preconditions:** Neram Pad Dev built with `--bot` and uploaded (HOW_TO_TEST 1.6). A scheduled test meeting with the Answer Pad in it. T1 on Teams desktop; S1 on Teams in Chrome or Edge on a laptop; S2 on Android; S3 on iPhone.
**Steps:**
1. On each client, find the Answer Pad in the meeting and open it.
2. T1 asks a question. Each student notes whether a pop-up appears and whether they can answer inside it.
3. On Teams desktop, with the pad closed, note whether a red dot appears on the Answer Pad button.
4. T1 reveals and selects **More options**, then **Show results on the meeting screen**. Each student notes what their meeting screen shows. No student has a Share button under the side panel.
5. Note how long the pop-up and the side panel take to show answer buttons on each phone.
**Expected Result:** A filled table with one row per client: where the button is (top bar, under More, or missing), the pop-up (answered inside it or not), the badge, shared results, and open time. Teams desktop shows everything; phones show the button under More and the pop-up. A client without the panel or the pop-up can still answer through TC-PAD-087. Record surprises as observations with screenshots, not as defects.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-081: The button is already in a class meeting
**Priority:** P1
**Type:** Functional
**Preconditions:** `teams-app/README.md` section F done: both Graph permissions with admin consent, `PAD_AUTO_ADD_CLASSROOMS` lists E2E Test Classroom, `PAD_TEAMS_APP_CATALOG_ID` set. A scheduled class for E2E Test Classroom whose meeting has no Answer Pad yet.
**Steps:**
1. Before anyone joins, run the sweep for the class (HOW_TO_TEST 3.5) and note the outcome.
2. T1 joins the meeting. If step 1 said `chat_not_ready`, run the sweep again.
3. S2 joins on Android and S3 on iPhone.
**Expected Result:** The sweep answers `added` (or `chat_not_ready` before the first join, then `added`). T1 sees the Answer Pad button in the top bar and the students find it under More, without anyone selecting Apps. Opening it shows the console or the pad.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-082: Scheduling a class in Nexus adds the pad
**Priority:** P1
**Type:** Functional
**Preconditions:** TC-PAD-081 settings. T1 can schedule classes for E2E Test Classroom in Nexus.
**Steps:**
1. Schedule a class for E2E Test Classroom in Nexus, starting within the next hour.
2. Join the meeting 20 minutes before the start and check the top bar every 5 minutes.
**Expected Result:** Scheduling works as before, with no new delay or error. The Answer Pad button appears at once or within 5 minutes of the first join. Record which, and when.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-083: Adding it by hand does not create a second button
**Priority:** P2
**Type:** Functional
**Preconditions:** TC-PAD-081 settings; a class meeting without the pad.
**Steps:**
1. T1 adds the Answer Pad by hand from **Apps**.
2. Run the sweep for the class twice.
**Expected Result:** The sweep answers `already` both times, and the meeting shows one Answer Pad button, not two.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-084: Where the button is not added automatically
**Priority:** P2
**Type:** Negative
**Preconditions:** TC-PAD-081 settings.
**Steps:**
1. Run the sweep for a class whose join link is a meeting created inside a Teams channel.
2. Remove E2E Test Classroom from `PAD_AUTO_ADD_CLASSROOMS`, restart Nexus, and run the sweep for one of its classes.
3. Put the classroom back, switch off `staff.answer-pad`, and run the sweep again.
**Expected Result:** No button is added and nothing errors. Steps 1 and 2 report the class as not due (a channel meeting keeps the Apps step). Step 3 reports `skipped: switched_off`. Switch the flag back on afterwards.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-085: Answering from the pop-up on a phone
**Priority:** P0
**Type:** Functional
**Preconditions:** TC-PAD-051 (bot in the meeting). S2 on Android and S3 on iPhone in the meeting with the Answer Pad closed.
**Steps:**
1. T1 asks a multiple choice question.
2. S2 and S3 tap an answer in the pop-up, without opening the side panel.
3. T1 closes and reveals.
**Expected Result:** The pop-up appears within a few seconds of ASK with "Question N", "Tap an answer to lock it." and the answer buttons, with no scrolling. One tap shows "Answer locked". T1's count includes both students. After the reveal each phone shows its result when the pad is opened.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-086: The pop-up fits, for every answer type
**Priority:** P1
**Type:** UI/UX
**Preconditions:** TC-PAD-085.
**Steps:**
1. T1 asks, in turn, a 6 option question, a number question and a Yes or No question.
2. Look at the pop-up on each phone and on Teams desktop.
3. T1 opens the pop-up's page as a teacher, for example from a reminder.
**Expected Result:** Every control is visible without sideways scrolling, the buttons are comfortably finger sized, and the number keyboard does not hide **Lock answer**. The teacher sees "This pop-up is for students. Run the class from the Answer Pad button in the meeting." No en or em dashes.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-087: The class chat card
**Priority:** P1
**Type:** Functional
**Preconditions:** TC-PAD-051; `PAD_TEAMS_APP_ID` set; no Answer Pad session started yet in the meeting.
**Steps:**
1. T1 opens the Answer Pad and the session starts.
2. T1 closes the Answer Pad panel and opens it again.
3. S2 on Android selects **Open Answer Pad** in the card.
4. S1 on a laptop browser selects **Answer in browser**.
**Expected Result:** After step 1 one card appears in the meeting chat: "Answer Pad is on for this class", the room code as two groups of three digits, and both buttons. Step 2 posts nothing more. Step 3 opens the Answer Pad panel on the phone. Step 4 opens this class's room code page in a new tab, signed in (see HOW_TO_TEST 3.4 about sign-in through a quick tunnel).
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-088: A full question from Teams in a laptop browser
**Priority:** P1
**Type:** Compatibility
**Preconditions:** TC-PAD-087. S1 in the meeting in Chrome or Edge at teams.microsoft.com.
**Steps:**
1. T1 asks a question.
2. S1 answers through the pop-up if one appeared, otherwise from the room code tab.
3. T1 reveals.
**Expected Result:** S1's answer is counted and graded like any other student's, and S1 sees the result. Record which way in worked: pop-up, side panel or room code tab.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-089: The red badge on Teams desktop
**Priority:** P2
**Type:** Functional
**Preconditions:** TC-PAD-051. A student on Teams desktop with the Answer Pad closed.
**Steps:**
1. T1 asks a question.
2. The student looks at the Answer Pad button in the top bar, then opens the pad.
**Expected Result:** A red dot appears on the Answer Pad button after ASK and goes away when the pad is opened. Phones show no badge, which Teams does not support. A second question within a minute may not badge again, a Teams limit.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-091: Pop out and one screen
**Priority:** P1
**Type:** Functional
**Preconditions:** T1 on Teams desktop with one monitor, a question paper open in a PDF viewer.
**Steps:**
1. T1 selects the Pop out button next to the class name.
2. T1 shares with Share, then Window, and picks the PDF viewer, not the screen.
3. T1 asks, closes and reveals a question from the popped-out window placed beside the PDF.
4. T1 opens **More options**, then **Using one screen?**
**Expected Result:** Step 1: the console opens in its own Teams window on the same class, movable and resizable. Step 2 and 3: students see only the PDF, never the pad, and the pads update as usual. Step 4 explains sharing a window. On Teams on the web the Pop out button is not shown.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-092: A snip of the paper on the question
**Priority:** P1
**Type:** Functional
**Preconditions:** T1 on Teams desktop with a question paper open; S1 on a phone.
**Steps:**
1. T1 presses Win + Shift + S, snips a question, clicks into the Answer Pad and presses Ctrl + V.
2. T1 opens **Add option text (optional)**, types text for A and C only, and asks.
3. S1 taps the picture.
4. On the next question, T1 asks first, then pastes a picture into **Add a picture** while it is open.
**Expected Result:** Step 1: a preview appears under "Picture (optional)" within a few seconds. Step 2: S1 sees the picture under the question title, and the answer buttons read "A Both correct", "B", "C Both wrong", "D". Step 3: the picture opens full screen and closes again. Step 4: the picture appears on every pad without the question closing. The class report shows a thumbnail for both questions.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-093: "I can't answer" with a reason
**Priority:** P1
**Type:** Functional / Privacy
**Preconditions:** A question open; S1, S2 and S3 have not answered.
**Steps:**
1. S1 taps **I can't answer**, picks **I don't know** and taps **Send to my teacher**.
2. S2 does the same with **Something else** and the note "My pen ran out".
3. T1 looks at the console.
4. S1 taps an answer anyway.
5. T1 closes the question and taps **Show names**.
**Expected Result:** Step 1: S1 reads "You told your teacher: I don't know. You can still answer above." and the answer buttons stay. Step 3: the console shows "2 can't answer: 1 don't know, 1 other" and no names. Step 4: S1's answer locks and the count drops to 1. Step 5: S2 is listed under Present but silent with "Said: Something else, My pen ran out". The report shows "1 can't answer: 1 other" under that question.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-094: Nudge the students who have not answered
**Priority:** P1
**Type:** Functional
**Preconditions:** A question open. S1 has the pad open and has not answered; S2 has the pad closed; S3 has answered; T1 has connected their Teams login in Nexus.
**Steps:**
1. T1 taps **Nudge the N who haven't answered**.
2. T1 taps it again straight away.
3. S1 looks at the pad; S2 looks at Teams chat.
4. S1 taps **I can't answer** and gives a reason.
**Expected Result:** Step 1: the console says "Nudged 1 on their pad and 1 by Teams chat." and the button reads "Nudge again in 60s", counting down. Step 2: nothing is sent. Step 3: S1 sees "Your teacher is waiting for your answer to Q.38. A guess is fine, or tap I can't answer." (a phone buzzes once); S2 gets a chat from T1 with the same polite words and an Open the Answer Pad link; S3 gets nothing. Step 4: the banner goes away. If T1's Teams login is not connected, S2 gets a Nexus notification instead and the console says so.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-090: Share results to the meeting screen
**Priority:** P1
**Type:** Functional / Security
**Preconditions:** A revealed question that at least two students answered. T1 is the organizer, on Teams desktop.
**Steps:**
1. T1 selects **More options**, then **Show results on the meeting screen**.
2. Every student looks at the meeting screen.
3. T1 asks the next question while still sharing, then closes it.
4. T1 reveals, then selects **Stop** on "The results are on the meeting screen."
5. A student opens the Answer Pad panel and looks under it.
**Expected Result:** Step 2: everyone sees the question as the paper names it ("Q.38"), the answer, the Correct and Incorrect totals, and a bar for each choice with the correct one marked, and no student names anywhere. Step 3: the screen shows only "N of M answered", with no breakdown before the reveal. Step 4: the new breakdown shows, then sharing ends for everyone. Step 5: there is no Share button under the panel (Teams' own button is hidden by the 1.3.0 package). A short text question never shows what students typed.
**Actual Result:**
**Status:** Not Run

---

### TC-PAD-091: How fast the pad opens on a phone
**Priority:** P2
**Type:** Performance
**Preconditions:** A mid-range Android phone on mobile data, with S2's account.
**Steps:**
1. Join the meeting. T1 asks. Time from the pop-up appearing to its answer buttons showing.
2. Close Teams completely, rejoin, and time opening the Answer Pad from More until its answer buttons show.
**Expected Result:** Answer buttons within about 3 seconds of the pop-up, and within about 5 seconds from More after a cold start. Record both times, on both phones, against TEST_SUMMARY_REPORT observation O-03.
**Actual Result:**
**Status:** Not Run
