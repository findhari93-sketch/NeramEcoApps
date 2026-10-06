# How to test the Answer Pad

A step by step guide for Hari. Everything automated has already run and passed (see
[TEST_SUMMARY_REPORT.md](TEST_SUMMARY_REPORT.md)). What is left needs real Microsoft
accounts, a real Teams meeting and your eyes: that is sections 3 to 5.

The Answer Pad is part of the **Neram Assistant** Teams app: its meeting tab is called **Answer Pad**.
The separate "Neram Pad Dev" app and the tunnel setup it needed are retired.

All commands are PowerShell, run from the repository root unless a step says otherwise:

```powershell
cd C:\Users\Haribabu\Documents\AppsCopilot\2026\NeramEcosystem
```

---

## 1. One-time setup

### 1.1 Tools

- Node 20 is needed for Nexus. Nothing to install: the commands below use `npx -y node@20`.
- pnpm 8 (already installed). If `node_modules` is missing, run `pnpm install`.

### 1.2 Point Nexus at staging, never production

`apps/nexus/.env.local` already points at the **staging** database. Do not copy or use
`.env.development` from the repository root: it points at **production**.

### 1.3 Two places to test

| Where | What it covers | How |
|---|---|---|
| Your laptop, in a browser | Everything outside Teams: the console and the student pad at `/pad` (students join with the room code), Present to class at `/pad/present`, and the automated suites (section 2) | From `apps\nexus`: `npx -y node@20 node_modules/next/dist/bin/next dev -p 3022`, then open http://localhost:3022/pad |
| Teams, through Neram Assistant | The meeting side panel, sign-in inside Teams, the question pop-up, the red badge, the class chat card, the automatic button and results on the meeting screen | Neram Assistant's pages and bot point at https://nexus.neramclasses.com, so Teams always runs the deployed production Nexus. Deploy a change first, then test it in Teams |

Keep the dev server on your laptop only. Outside production mode Nexus accepts `test_` sign-in tokens without
checking them with Microsoft (that is how the automated tests sign in), so anyone who could reach it could sign in
to staging as any user, including an admin.

> If you start it from a script or a background job instead, send its output to a file
> (`Start-Process ... -RedirectStandardOutput nexus.log`). A full output pipe freezes the server.

### 1.4 The Teams app: Neram Assistant

- Neram Assistant is already published in the tenant. Its manifest is `apps/nexus/teams-app/manifest.json`.
- Nexus puts the **Answer Pad** button in the top bar of every new class meeting by itself (3.5).
- For a meeting Nexus did not create: in the meeting chat select **+** (Apps), add **Neram Assistant**, choose
  **Answer Pad** and select **Save**.
- To publish a manifest change, build the package with `node scripts/answer-pad/package-teams-app.mjs`, raise the
  version, and update the app in the Teams admin center with the new file (`teams-app/README.md`).

### 1.5 Feature flags

Switch on `staff.answer-pad` and `student.answer-pad` (and `staff.qb-present` for Present to class) for the test
accounts in Nexus Admin, feature flags, on the environment you test: staging for your laptop, production for Teams.
An account without them sees "The Answer Pad isn't switched on for your account yet".

---

## 2. Running the automated suites

Run these before a manual session, and again after any change.

| What | Command | Expect |
|---|---|---|
| Unit, component, bot and route tests | `npx -y node@20 node_modules/vitest/vitest.mjs run apps/nexus/src/lib/pad apps/nexus/src/components/answer-pad apps/nexus/src/app/api/pad apps/nexus/src/app/api/cron/pad-meeting-tabs apps/nexus/src/lib/teams-sso.test.ts apps/nexus/src/lib/ms-verify.test.ts apps/nexus/src/lib/feature-flags.test.ts --exclude "**/*.db.test.ts"` | All pass |
| Present to class | `npx -y node@20 node_modules/vitest/vitest.mjs run apps/nexus/src/components/question-bank/present apps/nexus/src/lib/qb-present` | All pass |
| Database suites (PGlite, no network) | `npx -y node@20 node_modules/vitest/vitest.mjs run apps/nexus/src/lib/pad/db` | All pass |
| Mutation check (proves the database tests catch broken SQL; slow) | `npx -y node@20 scripts/answer-pad/db-mutation-check.mjs` | Every mutant KILLED |
| Type-check | `cd apps\nexus; npx -y node@20 node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` | No output |
| Lint | `cd apps\nexus; npx -y node@20 node_modules/next/dist/bin/next lint --dir src/components/answer-pad --dir src/lib/pad --dir src/app/api/pad` | No warnings |
| API, security and UI end to end (needs the dev server on 3022, see 1.3) | `$env:E2E_NEXUS_URL='http://localhost:3022'; $env:PW_APPS='none'; npx playwright test tests/e2e/answer-pad --project=nexus-chrome --no-deps` | All pass (about 7 minutes) |
| Load (needs the dev server on 3022) | `$env:E2E_NEXUS_URL='http://localhost:3022'; pnpm pad:load` | `PASSED` |
| Teams package check | `node scripts/answer-pad/package-teams-app.mjs` | `Wrote ...neram-assistant-<version>.zip` |

Reports: `playwright-report\index.html` (open with `npx playwright show-report`), screenshots
and traces of any failure in `test-results\`.

---

## 3. A manual session in a real Teams meeting

### 3.1 Accounts

| Role | Who | Notes |
|---|---|---|
| T1 | A teacher who teaches **E2E Test Classroom** | Runs the console |
| S1, S2, S3 | Students enrolled in E2E Test Classroom | One on Teams desktop or web, one on Android, one on iOS |
| S4 | A student **not** enrolled there | For the refusal case |
| T2 | Another teacher of the classroom | For the "not your session" case |

All of them must be able to sign in to Teams (MFA registered).

### 3.2 Set up the meeting

1. As T1, schedule a class for E2E Test Classroom in Nexus and invite S1 to S4 and T2. Its meeting gets the
   **Answer Pad** button by itself (3.5). For a meeting made in Teams instead, add Neram Assistant as in 1.4.
2. Join the meeting as T1 on desktop. Open **Answer Pad** from the meeting toolbar. The side panel opens.
3. Join as S1, S2 and S3 on their devices and open **Answer Pad** from the toolbar (on phones it is under
   **More**).

### 3.3 Run the cases

Work through [`tests/manual/answer-pad-test-cases.md`](../../../../tests/manual/answer-pad-test-cases.md)
in order: smoke (section 1) first. If a smoke case fails, stop and report it, since the rest
will not be meaningful.

A good first run takes about 90 minutes with three students. Sections 7 (bot and notifications)
need the Azure Bot from `teams-app/README.md` section B; mark them **Blocked** until it exists.

### 3.4 Device check first: what each Teams client really does

Microsoft's documentation says some meeting features do not work everywhere. About 90% of students join on
phones, so confirm on real devices before judging anything else (TC-PAD-080):

| Feature | Teams desktop | Android and iPhone | Teams in a laptop browser |
|---|---|---|---|
| Answer Pad button | Top bar | Under **More** | Microsoft says developer preview only |
| Question pop-up | Expected | Expected; confirm | Not documented; record what happens |
| Red badge | Expected | Not supported | Not documented; record what happens |
| Shared results on the meeting screen | Teacher shares | Expected to view; confirm | Microsoft says developer preview only |

Write down what each cell really does in TC-PAD-080. Wherever the pop-up or the panel is missing, the chat
card's **Answer in browser** must still get that student answering (TC-PAD-087, TC-PAD-088).

**Answer in browser** opens the room code page on nexus.neramclasses.com, with the normal Nexus sign-in.

### 3.5 The button appears by itself

1. Check section F of `teams-app/README.md` is done (two Graph permissions and admin consent).
2. Schedule a class for E2E Test Classroom in Nexus.
3. Before anyone joins, run the sweep for that class and read the `outcome`:

   ```powershell
   $h = @{ Authorization = 'Bearer <CRON_SECRET, from the Nexus production env in Vercel>' }
   Invoke-RestMethod 'https://nexus.neramclasses.com/api/cron/pad-meeting-tabs?classId=<class id>' -Headers $h
   ```

   - `added` or `already`: good.
   - `granted`: the pad was there without its permissions, and they are granted now. Good.
   - `chat_not_ready`: normal before anyone joins. Join the meeting, run it again, and it should say `added`.
   - `not_meeting_chat`: no join link, or a channel meeting. Add the pad from Apps (1.4).
   - `permission_missing`: the admin consent in step 1 is not in place yet.
4. Join on each device. The Answer Pad button is there without anyone adding it (TC-PAD-081).

### 3.6 Show results on the meeting screen

After revealing a question, open the **console menu** (the three dots next to the class name) and select **Show results
on the meeting screen**. Everyone's meeting screen shows the class totals and the answer breakdown, never names
(TC-PAD-090). It replaces the teacher's screen share, which is why it is not a big button. **Stop** on the console,
or Teams' own stop button, ends it. From package 1.3.0 Teams' own Share button under the side panel is hidden for
everyone, so students cannot put their pad on the meeting screen.

### 3.7 Picture, reasons and nudge

- **Picture:** Win + Shift + S, snip the question, click the paste box in the Ask bar at the bottom of the console
  (it says "Click here, then press Ctrl + V" while the pad does not have focus) and press Ctrl + V. Ctrl + V works
  anywhere in the pad, in every state. While a question is open the picture goes to the next question, and the
  message "Picture added to Q.33" offers "Use for Q.32" to put it on the open one instead. Pictures are shrunk in
  the browser and stored in the `uploads` bucket under `pad/<session id>/` (TC-PAD-092).
- **I can't answer:** students pick a reason under the answer buttons. The console shows counts by reason while the
  question is open, and names only after it closes (TC-PAD-093).
- **Nudge:** one press per minute per question. Pads that are open show a banner; students whose pad is closed get a
  Teams chat from the teacher's connected Teams login, or a Nexus notification when that is not connected (TC-PAD-094).
  Try it in a demo class with test accounts: it reaches everyone on the class list who has not answered.

### 3.8 One monitor

Share a Window (the PDF viewer, or the Present to class window), not the Screen: students then see only that
window, never the pad. On Teams desktop the Pop out button next to the class name opens the console in its own
window to sit beside it (TC-PAD-091).

---

## 4. Testing alone: the class simulator cannot feed a Teams class

`pnpm pad:simulate --code <room code>` plays the three E2E students. It signs them in with `test_` tokens,
which work only on the dev server on your laptop. Teams runs production Nexus (1.3), so the simulator can answer a
class you run at http://localhost:3022/pad, but not one you run in Teams.

To test alone in Teams, be the students yourself on other devices: a phone, and a private browser window at
https://teams.microsoft.com, each signed in with a Microsoft account enrolled in E2E Test Classroom.

---

## 5. What to look at closely

- **Privacy:** while a question is open, the console shows a count only. No student's pad ever
  shows another student's answer, or the correct answer before **Reveal answer**.
- **Truth after trouble:** after airplane mode, a reload or closing the panel, every screen comes
  back to exactly the right state.
- **Counting:** Correct + Incorrect + Present but silent + Absent always equals the class list.
- **Phones:** answer buttons are easy to hit, nothing scrolls sideways, and the panel opens quickly.
- **Words:** messages are clear to a student, and nothing uses a long dash.

---

## 6. Recording results and filing a defect

In the manual cases file, fill **Actual Result** and set **Status** to Pass, Fail, Blocked or
Skipped for each case. Keep screenshots or screen recordings in a folder named by date and
case id, for example `2026-09-12/TC-PAD-033.png`.

For each failure, file a defect with this template (a GitHub issue, or send it to me):

```
Title:        [TC-PAD-###] short description of what went wrong
Severity:     S1 / S2 / S3 / S4   (see TEST_PLAN.md section 11)
Priority:     P0 / P1 / P2 / P3
Environment:  Teams desktop / web / Android / iOS, version, device; production or local 3022
Account:      T1 / S1 / ...
Steps:        1. ...  2. ...
Expected:     what the case says should happen
Actual:       what happened, with the exact message shown
Evidence:     screenshot or recording; time it happened (IST)
```

The time helps me find the matching server log line.

---

## 7. Troubleshooting

| You see | Likely cause | Fix |
|---|---|---|
| A blank side panel | Nexus is not answering, or the page's host is not in the app's valid domains | Check https://nexus.neramclasses.com/pad/teams/config loads in a browser, and the manifest's `validDomains` |
| "Teams could not sign you in to Neram" | SSO scope or pre-authorized Teams clients missing | `teams-app/README.md` section A |
| "The Answer Pad isn't switched on for your account yet" | Feature flag off for that user | Section 1.5 |
| "You're not on the class list for this class" | The student is not enrolled in the classroom the session is for | Expected for S4; otherwise check enrollment in Nexus |
| "Updating every few seconds" in readiness | Realtime is blocked by the database proxy until its fix is deployed | Expected for now: screens poll every 2 to 5 seconds |
| "Meeting bot not added, so no reminders go out" | No Azure Bot yet, or the app was added after students joined | README section B; add the app before class |
| No Answer Pad button in a class meeting | The sweep has not reached it, or a permission is missing | Run the sweep for that class (3.5) and read the outcome |
| Nexus stops answering while started from a script | Its output pipe filled up | Run it in its own window (1.3) |
