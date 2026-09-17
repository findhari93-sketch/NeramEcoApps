# Neram Assistant, Teams app

This is the "Neram Assistant" Microsoft Teams app. It has two jobs:

1. **Reminders.** Nexus delivers assignment and study reminders to a student's
   **Teams Activity feed** (the bell), separate from any chat.
2. **The Answer Pad** (from version 1.1.0). In a class meeting the teacher asks a
   question out loud or on a slide, students answer in the meeting side panel, and
   the teacher sees who answered, who was right and who stayed silent.

Files:
- `manifest.json`, the Teams app manifest. `webApplicationInfo.id` is the existing
  Entra app registration (`AZ_CLIENT_ID` = `aa039c70-50d2-4c91-bd0e-5675df5e50ff`).
  The same app signs users in to the Answer Pad and is the Answer Pad bot.
- `color.png` (192x192) and `outline.png` (32x32), the app icons. Keep the exact sizes.
- `dist/`, built packages (gitignored).

## Build the package

```bash
node scripts/answer-pad/package-teams-app.mjs
# writes apps/nexus/teams-app/dist/neram-assistant-1.1.0.zip
```

The script checks the manifest first (every page on a valid domain, sign-in resource
matching, no en or em dashes in names) and refuses to build a broken package.

For local testing through a tunnel, build a separate dev app that points at the tunnel:

```bash
node scripts/answer-pad/package-teams-app.mjs --dev --host <tunnel host, no https://>
# writes dist/neram-pad-dev-1.1.0.zip ("Neram Pad Dev", its own app id)
```

The dev app leaves the bot out unless you add `--bot`, because a bot id can belong to
only one Teams app in the tenant. Until Neram Assistant 1.1.0 is uploaded, build the dev
app with `--bot`: the question pop-up, the red badge, the class chat card and the
automatic button all need the bot and its permissions. Without `--bot` the package keeps
only the permission for sharing results to the meeting screen. Each re-upload to the
Teams admin center needs a higher version, for example `--version 1.1.1`.

## Reminders: one-time admin setup (tenant admin)

1. **Grant Graph application permissions** on app registration
   `aa039c70-50d2-4c91-bd0e-5675df5e50ff` (Azure portal, API permissions,
   Microsoft Graph, Application permissions), then **Grant admin consent**:
   - `TeamsActivity.Send`, send the activity-feed notification.
   - `TeamsAppInstallation.ReadWriteForUser.All`, install this app in each
     student's personal scope (a prerequisite for notifying them).

2. **Upload the app.** Build the package (above), then Teams admin center, Manage
   apps, Upload new app, and **Allow/approve** it for the org (or the students' app
   permission policy).

3. **Copy the catalog app id.** After upload, open the app in Manage apps and copy
   its **App ID** (the catalog `teamsApp` id). Set it as `TEAMS_APP_CATALOG_ID` in
   the Nexus (and Admin) environments:
   ```bash
   cd apps/nexus && echo "<catalog-app-id>" | vercel env add TEAMS_APP_CATALOG_ID production
   cd apps/nexus && echo "<catalog-app-id>" | vercel env add TEAMS_APP_CATALOG_ID preview
   # (repeat for apps/admin so install-at-enrollment fires there too)
   ```
   Add it to `apps/nexus/.env.local` for local testing.

4. **Backfill existing students** (installs the app for everyone already enrolled):
   `POST /api/teams/backfill-app-install` as an admin. New enrollments install
   automatically, and the reminder send path installs lazily on first use, so this
   is only needed once for the current roster. Safe to re-run.

Until `TEAMS_APP_CATALOG_ID` is set, reminders fall back to the Nexus bell only.
There is no email channel.

## Since 2026-09-14: the activity feed is the fallback, not the first choice

Every student message goes through `sendNudge` (`src/lib/nudge-delivery.ts`) and
tries a Teams **chat** first: the teacher's own chat when they press Send, or, for
automatic reminders, the chat of the teacher who connected their Teams once
(`src/lib/teams-sender.ts`, "Connect Teams" on Sketchbooks, Class rhythm). The
activity feed below is used only when no chat landed.

Automatic chats need one Azure change on app registration
`aa039c70-50d2-4c91-bd0e-5675df5e50ff`: Authentication, Add a platform, **Web**,
redirect URIs `https://nexus.neramclasses.com/api/teams/sender/callback` and
`https://staging-nexus.neramclasses.com/api/teams/sender/callback` (plus
`http://localhost:3012/api/teams/sender/callback` for local work). Keep the
existing SPA platform as it is.

## Answer Pad: one-time setup

### A. Teams sign-in (required)

In the Azure portal, App registrations, `aa039c70-50d2-4c91-bd0e-5675df5e50ff`,
**Expose an API**:

1. Application ID URI: `api://nexus.neramclasses.com/aa039c70-50d2-4c91-bd0e-5675df5e50ff`.
   While testing through a tunnel, use `api://<tunnel host>/aa039c70-50d2-4c91-bd0e-5675df5e50ff`
   instead, then set it back before launch (see `Docs/answer-pad/HOW_TO_TEST.md` section 1.5).
2. Add a scope named `access_as_user` (who can consent: admins and users).
3. Add both Teams clients as authorized client applications, with that scope:
   - `1fec8e78-bce4-4aaf-ab1b-5451cc387264` (Teams desktop and mobile)
   - `5e3ce6c0-2b1f-4285-8d4b-75ee78787346` (Teams web)
4. Locally, set `TEAMS_SSO_RESOURCE_HOSTS=nexus.neramclasses.com,<tunnel host>` in
   `apps/nexus/.env.local`. Production needs nothing: the default is
   `nexus.neramclasses.com`.

### B. The meeting bot (optional, recommended)

The Answer Pad works without the bot. The bot adds meeting presence (who is in the
meeting, so "present but silent" is exact) and the "Question N is open" notification.

1. Create an **Azure Bot** (pricing tier F0). Type of app: **Single Tenant**, using
   the existing app registration `aa039c70-50d2-4c91-bd0e-5675df5e50ff`.
2. Messaging endpoint: `https://nexus.neramclasses.com/api/pad/bot/messages`
   (for dev, the same path on the tunnel).
3. Channels: add **Microsoft Teams**.
4. In the [Teams Developer Portal](https://dev.teams.microsoft.com/), open the app,
   **Meeting event subscriptions**, and select **Participant join** and
   **Participant leave**. Microsoft sends these for scheduled meetings only, and only
   once the app is in the meeting, so add the app before class starts.
5. Only if the bot uses a different app registration from Nexus, set
   `PAD_BOT_APP_ID`, `PAD_BOT_APP_SECRET` and `PAD_BOT_TENANT_ID` in Nexus. Otherwise
   it uses `AZ_CLIENT_ID`, `AZ_CLIENT_SECRET` and `AZ_TENANT_ID`.

The resource-specific permissions in the manifest are exactly what the app uses:

| Permission | Why |
|---|---|
| `OnlineMeetingParticipant.Read.Chat` | Participant join and leave events in meeting chats |
| `OnlineMeetingNotification.Send.Chat` | "Question N is open" and the red badge in meeting chats |
| `ChannelMeetingParticipant.Read.Group` | The same, for channel meetings |
| `ChannelMeetingNotification.Send.Group` | The same, for channel meetings |
| `MeetingStage.Write.Chat` (delegated) | The teacher's **Share results** button, which puts the class totals on the meeting screen |

### C. Publish version 1.1.0

Build the package, then Teams admin center, Manage apps, Neram Assistant, **Upload
file**, and review the new permissions. The update keeps the same app id, so the
reminder installs carry on.

### D. Switch it on for a pilot

In Nexus Admin, feature flags, turn on `staff.answer-pad` and `student.answer-pad`
for the pilot teachers and students. Both are off by default, and every `/api/pad`
route answers 404 while they are off.

### E. Use it in a class

For classrooms listed in section F, the Answer Pad button is already in the class
meeting's top bar (on phones, under **More**). For any other meeting, select **Apps** in
the meeting (or **+** in its chat before the meeting), add **Neram Assistant**, and select
**Save** on the Answer Pad page. The first time a meeting series is used, the teacher
picks the class once; after that it is remembered.

During class:
- When the teacher asks, students without the pad open get a pop-up with just the answer
  buttons, and on Teams desktop a red dot on the Answer Pad button.
- When a session starts, one card goes into the meeting chat with the room code,
  **Open Answer Pad** (opens the side panel) and **Answer in browser**.
- After a reveal, **Share results** puts the class totals, never names, on the meeting
  screen.

Students without the side panel (Teams in a browser, an older phone) use **Answer in
browser**, or open `https://nexus.neramclasses.com/pad` and type the six digit room code
shown on the teacher's console.

### F. The button in every class meeting (automatic)

Teams has no setting that adds an app to every meeting, so Nexus adds the Answer Pad to
class meetings itself (`lib/pad/auto-add.ts`): once when a class meeting is scheduled, and
from the `/api/cron/pad-meeting-tabs` sweep every five minutes from 05:30 to 23:25 IST,
because a new meeting's chat often refuses until somebody joins. It installs the app into
the meeting chat and pins the Answer Pad tab, and leaves a meeting that already has it alone.

1. **Grant two Graph application permissions** on `aa039c70-50d2-4c91-bd0e-5675df5e50ff`,
   then **Grant admin consent**. Both are "Self" permissions: the app can manage only
   itself and its own tabs.
   - `TeamsAppInstallation.ReadWriteAndConsentSelfForChat.All`
   - `TeamsTab.ReadWriteSelfForChat.All`
2. **The app must be in the org catalog** (section C, or the dev package uploaded in the
   Teams admin center). An app a user uploaded for themselves has no catalog id.
3. **Set the Nexus environment:**

   | Variable | Value |
   |---|---|
   | `PAD_AUTO_ADD_CLASSROOMS` | Comma-separated classroom ids, or `all`. Empty means off |
   | `PAD_TEAMS_APP_CATALOG_ID` | Only while testing the dev app: its App ID from the Teams admin center. Otherwise `TEAMS_APP_CATALOG_ID` is used |
   | `PAD_TEAMS_TAB_ORIGIN` | Only behind a tunnel: `https://<tunnel host>`. The pop-up and chat card links use it too |
   | `PAD_TEAMS_APP_ID` | The manifest id, for the chat card's **Open Answer Pad** link: `df4f6b2d-ea18-46d1-8934-f508ac248e6c`, or `7b1e4f0a-3c52-4d8e-9a61-2f9c0b7d5e43` for Neram Pad Dev |
   | `CRON_SECRET` | Already set in production; the sweep refuses to run without it |

   The `staff.answer-pad` flag must be on as well.
4. **Check one class by hand:** `GET /api/cron/pad-meeting-tabs?classId=<class id>` with
   `Authorization: Bearer <CRON_SECRET>` runs that class whatever the time and answers with
   the outcome: `added`, `already`, `chat_not_ready` (join the meeting and try again),
   `permission_missing` (step 1 is not in place) or `failed` with a reason.

Meetings created inside a Teams channel, rather than scheduled from Nexus, live on the
channel's thread, which Graph cannot add apps to. For those the teacher adds the app from
**Apps** once.

## Security notes

- `/pad` pages may be framed only by Teams and Microsoft 365 hosts
  (`Content-Security-Policy: frame-ancestors` in `apps/nexus/vercel.json`); every
  other page keeps `X-Frame-Options: SAMEORIGIN`.
- The bot endpoint believes a request only when it carries a Bot Framework token
  signed for this bot, for Microsoft Teams, with a matching service URL
  (`src/lib/pad/bot/verify-activity.ts`).
- Students never read pad tables directly. Every read and write goes through
  `/api/pad` routes and database functions that check the signed-in user.
