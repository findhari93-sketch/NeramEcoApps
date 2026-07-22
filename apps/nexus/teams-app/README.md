# Neram Assistant, Teams app (assignment reminders)

This is the "Neram Assistant" Microsoft Teams app. Its only job is to let Nexus
deliver assignment and study reminders to a student's **Teams Activity feed** (the
bell), completely separate from any chat, so templated reminders never clutter a
real 1:1 conversation. Delivery uses the app-only Graph call
`POST /users/{id}/teamwork/sendActivityNotification` (reserved `systemDefault`
activity type, so no `activities` block is needed in the manifest).

Files:
- `manifest.json`, the Teams app manifest. `webApplicationInfo.id` is the existing
  Azure AD app registration (`AZ_CLIENT_ID` = `aa039c70-50d2-4c91-bd0e-5675df5e50ff`),
  so the same app-only token the server already uses is authorized to notify on
  this app's behalf.
- `color.png` (192x192) and `outline.png` (32x32), app icons. Replace the generated
  placeholders with real branding whenever you like; keep the exact sizes.

## One-time admin setup (tenant admin)

1. **Grant Graph application permissions** on app registration
   `aa039c70-50d2-4c91-bd0e-5675df5e50ff` (Azure Portal, API permissions,
   Microsoft Graph, Application permissions), then **Grant admin consent**:
   - `TeamsActivity.Send`, send the activity-feed notification.
   - `TeamsAppInstallation.ReadWriteForUser.All`, install this app in each
     student's personal scope (a prerequisite for notifying them).

2. **Package + upload the app.** Zip the three files at the root of the zip
   (`manifest.json`, `color.png`, `outline.png`, no enclosing folder):
   ```powershell
   Compress-Archive -Path manifest.json,color.png,outline.png -DestinationPath neram-assistant.zip -Force
   ```
   Then Teams admin center, Manage apps, Upload new app, and **Allow/approve** it
   for the org (or the students' app permission policy).

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

Until `TEAMS_APP_CATALOG_ID` is set, reminders fall back to in-app notification +
email, so the feature works before this setup is complete.
