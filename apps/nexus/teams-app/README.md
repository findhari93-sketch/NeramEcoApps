# Neram Assistant, Teams app (reminders and updates)

This is the "Neram Assistant" Microsoft Teams app. Nexus uses it two ways:

- **Bot chat (v1.1.0, since 2026-09-13).** A notification-only bot posts a short
  1:1 chat message with a button, for anything no teacher typed by hand
  (automatic reminders such as the sketchbook 3-day nudge). This is the only way a
  scheduled job can reach a Teams chat: a chat message otherwise needs a signed-in
  person. Code: `src/lib/teams-bot.ts`, endpoint `src/app/api/teams/bot/messages`.
- **Activity feed.** `POST /users/{id}/teamwork/sendActivityNotification`
  (reserved `systemDefault` type). Since 2026-09-13 this is the FALLBACK, used only
  when no chat landed, so a student gets one Teams alert per message, not two.

Every student message goes through `sendNudge` in `src/lib/nudge-delivery.ts`,
which picks the tiers and writes a receipt per recipient.

Files:
- `manifest.json`, the Teams app manifest. `webApplicationInfo.id` and `bots[0].botId`
  are the existing Azure AD app registration (`AZ_CLIENT_ID` =
  `aa039c70-50d2-4c91-bd0e-5675df5e50ff`), so one app id and one secret serve Graph
  and the bot.
- `color.png` (192x192) and `outline.png` (32x32), app icons.
- `neram-assistant.zip`, the upload package (rebuild after any manifest change).

## One-time admin setup (tenant admin)

1. **Graph application permissions** on app registration
   `aa039c70-50d2-4c91-bd0e-5675df5e50ff`, then **Grant admin consent**:
   - `TeamsActivity.Send`, the activity-feed fallback.
   - `TeamsAppInstallation.ReadWriteForUser.All`, install and upgrade this app for
     each student and read its 1:1 chat id.

2. **Azure Bot resource (for the bot chat).** Azure Portal, Create "Azure Bot":
   - Type of App: **Single Tenant**; "Use existing app registration" with the app id
     above and the same tenant. Pricing tier F0 is enough (Teams is a standard channel).
   - Configuration, Messaging endpoint: `https://nexus.neramclasses.com/api/teams/bot/messages`
   - Channels: add **Microsoft Teams**.

3. **Package and upload v1.1.0.** Zip the three files at the root of the zip:
   ```powershell
   Compress-Archive -Path manifest.json,color.png,outline.png -DestinationPath neram-assistant.zip -Force
   ```
   Teams admin center, Manage apps, open **Neram Assistant**, **Upload file** to
   update the existing app (the catalog App ID stays the same), then approve it.

4. **Env vars on Nexus** (Production and Preview):
   ```bash
   cd apps/nexus && echo "<catalog-app-id>" | vercel env add TEAMS_APP_CATALOG_ID production
   cd apps/nexus && echo "1" | vercel env add TEAMS_BOT_ENABLED production
   ```
   Optional: `TEAMS_BOT_SERVICE_URL` (default `https://smba.trafficmanager.net/teams/`).
   Set `TEAMS_BOT_ENABLED` only after one test send reached the e2e student.

5. **Backfill** existing students: `POST /api/teams/backfill-app-install` as an
   admin. Students who already have v1.0.0 are upgraded to the bot version the first
   time a bot message is sent to them. Safe to re-run.

6. **Check it worked:** `GET /api/admin/delivery-health` (admin) shows which env vars
   are present, which Graph permissions the token really has, and the last 7 days of
   delivery per channel. Add `?probeUserId=<users.id>` to send one test message.

Until `TEAMS_BOT_ENABLED=1`, messages use the activity feed; until
`TEAMS_APP_CATALOG_ID` is set, they fall back to the Nexus bell plus email.
