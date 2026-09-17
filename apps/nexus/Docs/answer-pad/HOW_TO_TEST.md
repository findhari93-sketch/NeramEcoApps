# How to test the Answer Pad

A step by step guide for Hari. Everything automated has already run and passed (see
[TEST_SUMMARY_REPORT.md](TEST_SUMMARY_REPORT.md)). What is left needs real Microsoft
accounts, a real Teams meeting and your eyes: that is sections 3 to 5.

All commands are PowerShell, run from the worktree unless a step says otherwise:

```powershell
cd C:\Users\Haribabu\Documents\AppsCopilot\2026\NeramEcosystem-answer-pad
```

---

## 1. One-time setup

### 1.1 Tools

- Node 20 is needed for Nexus. Nothing to install: the commands below use `npx -y node@20`.
- pnpm 8 (already installed). If `node_modules` is missing, run `pnpm install`.
- A tunnel, so Teams on any device can reach Nexus on your laptop. Use Cloudflare's quick tunnel, which
  needs no account: `winget install --id Cloudflare.cloudflared`, then close and reopen PowerShell.

### 1.2 Point Nexus at staging, never production

`apps/nexus/.env.local` already points at the **staging** database. Do not copy or use
`.env.development` from the repository root: it points at **production**.

### 1.3 Start Nexus on port 3022

Nexus runs in one of two modes. Pick by what you are testing, and start it in its own window from
`apps\nexus` (leave the window open):

| Mode | Use it for | Start it |
|---|---|---|
| Dev server | The automated suites (section 2) on your laptop only. **Never put a tunnel in front of it.** | `npx -y node@20 node_modules/next/dist/bin/next dev -p 3022` |
| Production mode | Anything inside Teams through the tunnel (section 3) | `npx -y node@20 node_modules/next/dist/bin/next build`, then `npx -y node@20 node_modules/next/dist/bin/next start -p 3022` |

Why the dev server must stay private:
- Outside production mode, Nexus accepts `test_` sign-in tokens without checking them with Microsoft. That is
  how the automated tests sign in.
- Anyone who could reach a tunnelled dev server could sign in to staging as any user, including an admin.
- Production mode refuses those tokens.

Stop one mode (Ctrl+C) before starting the other, because they share the `.next` folder. After a code change,
production mode needs `next build` again (about 10 minutes).

Wait for `Ready`, then open http://localhost:3022/pad/teams/config once to check it answers.

> If you start it from a script or a background job instead, send its output to a file
> (`Start-Process ... -RedirectStandardOutput nexus.log`). A full output pipe freezes the server.

### 1.4 Open a tunnel to port 3022

Only with Nexus in **production mode** (1.3). In a second window:

```powershell
cloudflared tunnel --url http://localhost:3022
```

It prints an address such as `https://blue-river-tiger-lamp.trycloudflare.com`. Copy the host, without
`https://`. Leave this window open for the whole test. Closing it ends the address, and the next run gets a
new one, which means repeating 1.4 to 1.6.

Then, in `apps/nexus/.env.local`, set:

```
TEAMS_SSO_RESOURCE_HOSTS=nexus.neramclasses.com,blue-river-tiger-lamp.trycloudflare.com
```

and restart `next start`. No new build is needed for this setting.

### 1.5 Azure: Teams sign-in (once, plus once per tunnel host)

Follow section **A. Teams sign-in** in `apps/nexus/teams-app/README.md`, with one change while you test through
the tunnel: set the **Application ID URI** to `api://<tunnel host>/aa039c70-50d2-4c91-bd0e-5675df5e50ff`
instead of the `nexus.neramclasses.com` one.
- Nothing in the code uses that URI today, and Microsoft's guide supports one domain per app.
- A new tunnel host means editing this field again.
- Before the real launch, set it to `api://nexus.neramclasses.com/aa039c70-50d2-4c91-bd0e-5675df5e50ff`
  (TEST_SUMMARY_REPORT section 7).

Microsoft's guide also sets `requestedAccessTokenVersion` to 2 in **Manifest**. Nexus accepts either token
version, so you can skip that step.

### 1.6 Build and upload the dev Teams app

```powershell
node scripts/answer-pad/package-teams-app.mjs --dev --bot --host blue-river-tiger-lamp.trycloudflare.com
```

Build it with `--bot`. The question pop-up, the red badge, the class chat card and the automatic button all
need the bot and its permissions, and that is safe until Neram Assistant 1.1.0 is uploaded
(`teams-app/README.md`, Build the package).

Upload it so it has a catalog id, which the automatic button needs: Teams admin center, **Teams apps**,
**Manage apps**, **Upload new app**, and pick `apps\nexus\teams-app\dist\neram-pad-dev-1.1.0.zip`. Open
**Neram Pad Dev**, limit it to you and the test students, and copy its **App ID**. It can take a few hours to
show up in Teams.

For a quick look at the side panel alone, uploading it for yourself still works: in Teams, **Apps**,
**Manage your apps**, **Upload an app**, **Upload a custom app**. Your tenant must allow that for you (Teams
admin center, Setup policies).

Then add these to `apps/nexus/.env.local` and restart `next start`:

```
PAD_TEAMS_TAB_ORIGIN=https://blue-river-tiger-lamp.trycloudflare.com
PAD_TEAMS_APP_ID=7b1e4f0a-3c52-4d8e-9a61-2f9c0b7d5e43
PAD_TEAMS_APP_CATALOG_ID=<the App ID you copied>
PAD_AUTO_ADD_CLASSROOMS=<the E2E Test Classroom id>
```

A new tunnel host means building again with a higher version (for example `--version 1.1.1`) and updating the
app in the Teams admin center with the new file.

### 1.7 Feature flags

On staging the `staff.answer-pad` and `student.answer-pad` flags are already on. If a test
account says "The Answer Pad isn't switched on for your account yet", switch them on in
Nexus Admin, feature flags.

---

## 2. Running the automated suites

Run these before a manual session, and again after any change.

| What | Command | Expect |
|---|---|---|
| Unit, component, bot and route tests | `npx -y node@20 node_modules/vitest/vitest.mjs run apps/nexus/src/lib/pad apps/nexus/src/components/answer-pad apps/nexus/src/app/api/pad apps/nexus/src/app/api/cron/pad-meeting-tabs apps/nexus/src/lib/teams-sso.test.ts apps/nexus/src/lib/ms-verify.test.ts apps/nexus/src/lib/feature-flags.test.ts --exclude "**/*.db.test.ts"` | All pass |
| Database suites (PGlite, no network) | `npx -y node@20 node_modules/vitest/vitest.mjs run apps/nexus/src/lib/pad/db` | All pass |
| Mutation check (proves the database tests catch broken SQL; slow) | `npx -y node@20 scripts/answer-pad/db-mutation-check.mjs` | Every mutant KILLED |
| Type-check | `cd apps\nexus; npx -y node@20 node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` | No output |
| Lint | `cd apps\nexus; npx -y node@20 node_modules/next/dist/bin/next lint --dir src/components/answer-pad --dir src/lib/pad --dir src/app/api/pad` | No warnings |
| API, security and UI end to end (needs the dev server on 3022, see 1.3) | `$env:E2E_NEXUS_URL='http://localhost:3022'; $env:PW_APPS='none'; npx playwright test tests/e2e/answer-pad --project=nexus-chrome --no-deps` | All pass (about 7 minutes) |
| Load (needs the dev server on 3022) | `$env:E2E_NEXUS_URL='http://localhost:3022'; pnpm pad:load` | `PASSED` |
| Teams package check | `node scripts/answer-pad/package-teams-app.mjs` | `Wrote ...neram-assistant-1.1.0.zip` |

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

1. As T1, schedule a Teams meeting for now (a channel meeting in the class team, or a
   private meeting), and invite S1 to S4 and T2.
2. Open the meeting's chat, select **+** (Apps), and add **Neram Pad Dev**. The Answer Pad
   page appears; select **Save**.
3. Join the meeting as T1 on desktop. Open **Neram Pad Dev** from the meeting toolbar. The
   side panel opens.
4. Join as S1, S2 and S3 on their devices and open the app from the toolbar.

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

**Answer in browser** opens the room code page, which uses the normal Nexus sign-in. Through a quick tunnel
that sign-in may refuse the tunnel address; if it does, note it in TC-PAD-088 and check it again on a deployed
preview rather than filing a defect.

### 3.5 The button appears by itself

1. Complete 1.6 and section F of `teams-app/README.md` (two Graph permissions and admin consent).
2. Schedule a class for E2E Test Classroom in Nexus, or ask Claude to add a staging test class whose join link
   is your test meeting's.
3. Before anyone joins, run the sweep for that class and read the `outcome`:

   ```powershell
   $h = @{ Authorization = 'Bearer <CRON_SECRET from apps/nexus/.env.local>' }
   Invoke-RestMethod 'http://localhost:3022/api/cron/pad-meeting-tabs?classId=<class id>' -Headers $h
   ```

   - `added` or `already`: good.
   - `chat_not_ready`: normal before anyone joins. Join the meeting, run it again, and it should say `added`.
   - `permission_missing`: the admin consent in step 1 is not in place yet.
4. Join on each device. The Answer Pad button is there without anyone adding it (TC-PAD-081).

### 3.6 Share results

After revealing a question, select **Share results** on the console. Everyone's meeting screen shows the class
totals and the answer breakdown, never names (TC-PAD-090). **Stop sharing** on the console, or Teams' own stop
button, ends it.

---

## 4. Testing alone: the class simulator cannot feed a Teams class yet

`pnpm pad:simulate --code <room code>` plays the three E2E students. It signs them in with `test_` tokens,
which work only on the dev server. The dev server must never be behind a tunnel (1.3), and a class inside Teams
needs the tunnel. So today the simulator cannot answer a class you run in Teams.

To test alone in Teams, be the students yourself on other devices: a phone, and a private browser window at
https://teams.microsoft.com, each signed in with a Microsoft account enrolled in E2E Test Classroom.

The simulator could be changed to call the database directly with the staging key on your laptop, which would
work next to a production-mode server. Ask for it if testing alone matters.

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
Environment:  Teams desktop / web / Android / iOS, version, device; local 3022 + tunnel
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
| A blank side panel | The tunnel host is not in the app's valid domains, or Nexus is not running | Rebuild the dev package with the current tunnel host (1.6) and check http://localhost:3022/pad/teams/config loads |
| "Teams could not sign you in to Neram" | SSO scope, pre-authorized Teams clients, or the tunnel's `api://` identifier missing | Section 1.5; also set `TEAMS_SSO_RESOURCE_HOSTS` (1.4) and restart Nexus |
| "The Answer Pad isn't switched on for your account yet" | Feature flag off for that user | Section 1.7 |
| "You're not on the class list for this class" | The student is not enrolled in the classroom the session is for | Expected for S4; otherwise check enrollment in Nexus |
| "Updating every few seconds" in readiness | Realtime is blocked by the database proxy until its fix is deployed | Expected for now: screens poll every 2 to 5 seconds |
| "Meeting bot not added, so no reminders go out" | No Azure Bot yet, or the app was added after students joined | README section B; add the app before class |
| Nexus stops answering while started from a script | Its output pipe filled up | Run it in its own window (1.3) |
| `cloudflared` is not recognized | PowerShell was already open when it was installed | Close PowerShell and open a new window |
