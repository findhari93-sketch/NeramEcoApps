# YouTube backup: one-time setup

Turns on the nightly job that copies each class recording from Teams to YouTube.

Teams deletes a class recording after about six months, so the YouTube copy is the durable one. Until this is connected, the code is inert: the feature flag defaults off and the cron returns `{"skipped":"feature disabled"}`.

Budget about 30 minutes. Steps 1 to 5 are Google Cloud Console. Steps 6 to 8 are ours.

---

> **Console note.** Google replaced the single "OAuth consent screen" page with the **Google Auth Platform**, where the same settings live under Branding, Audience, Data Access and Clients. The steps below use the new names. If you land on a page called "OAuth consent screen", you are on the old UI and it maps one to one.

## 1. Pick the Google Cloud project

Quota is **per project**, and `videos.insert` costs 1600 of a 10,000-unit daily allowance, so this decides how many videos a day can ever go up.

**Decided: the `neramclasses` project** (number `362970587122`), where YouTube Data API v3 is already enabled.

It gets the full 10,000 units. The student subscription reward's `GOOGLE_YOUTUBE_CLIENT_ID`, used by [apps/app](apps/app/src/app/api/youtube/oauth-callback/route.ts) and [apps/marketing](apps/marketing/src/app/api/youtube/oauth-callback/route.ts), belongs to a **different** project (number `253536076108`), so the two never compete.

The one client already in `neramclasses`, "Nexus server", is a **Desktop** credential for a local script (`scripts/google-oauth-credentials.json`, gitignored, redirect `http://localhost`). Leave it alone. Desktop clients cannot hold an https redirect URI, so it cannot serve this feature.

## 2. Publish the app, and ignore the verification wall

**Google Auth Platform, Audience, press "Publish app"** so publishing status reads **In production**.

That is the whole step. One click.

**As of 2026-07-31 this is already done**: `neramclasses` reads "In production", User type "External", 3 of 100 user cap used. The button on that page now reads **"Back to testing"**, which is the inverse action. Do not press it. If you ever see "Publish app" there again, someone reverted it and the 7-day token expiry is back.

The yellow "Your app requires verification" banner stays on this page and on Data Access **permanently**, for any unverified app using sensitive scopes. It is not a to-do item. See the table below.

### Why not leave it in Testing

Testing-mode refresh tokens **expire after 7 days**. The backup would work for a week, then stop silently on a 1am schedule, and nobody would notice until a term of recordings had aged out of Teams. Published tokens do not expire.

### Why you do not need verification, despite what the console says

The Data Access page shows "Your app requires verification" and asks for a scope justification and a demo video. **Skip all of it.** Do not press "Go to verification center", do not record a video.

Two separate reviews get confused here, and neither blocks you:

| Review | What it buys | Needed? |
|---|---|---|
| **Google OAuth app verification** (Verification Center, demo video) | Removes the "Google hasn't verified this app" warning, and lifts the 100-user cap | **No.** This app has exactly one user, the account that owns the channel. |
| **YouTube API compliance audit** (step 5, a different form) | Lets uploads be `unlisted` instead of forced `private` | Not to start. Uploads work now and land private. |

An unverified published app still works. At consent time, once, you get an interstitial: press **Advanced**, then **Go to nexus.neramclasses.com (unsafe)**. After that the grant is permanent.

**Internal is not an option here.** It requires a Google Workspace org, and `neramclasses` sits under a consumer Google account. `@neramclasses.com` mail is Microsoft 365, which does not give Google an org to scope to.

**Write down today's date.** If `invalid_grant` shows up about 7 days later, the app never actually published and is still in Testing.

## 3. Add the scopes

**Google Auth Platform, Data Access, Add or remove scopes.** Paste both:

```
https://www.googleapis.com/auth/youtube.upload
https://www.googleapis.com/auth/youtube.readonly
```

`youtube.readonly` is what lets the job check, for 1 quota unit per 50 videos, whether you have flipped a video off private yet. Without it, uploaded videos stay stuck at private in the Library forever.

## 4. Create a NEW OAuth client

**Google Auth Platform, Clients, Create client, Application type: Web application.** Name it something like "Nexus YouTube backup".

It must be **Web application**. The existing "Nexus server" client is type Desktop, which only accepts `http://localhost` loopback redirects and cannot be pointed at `https://nexus.neramclasses.com`.

Do not extend the student client either. It is consented by students on a different redirect URI, and adding the upload scope to it would show every student a "upload videos to your YouTube account" prompt.

Authorised redirect URIs, add all three:

```
https://nexus.neramclasses.com/api/admin/youtube-oauth/callback
https://staging-nexus.neramclasses.com/api/admin/youtube-oauth/callback
http://localhost:3012/api/admin/youtube-oauth/callback
```

They must match character for character. A trailing slash is a different URI, and the failure is `redirect_uri_mismatch` at consent time.

The staging one is needed because Vercel Preview serves the `staging` branch, and its `YOUTUBE_UPLOAD_REDIRECT_URI` points there. Per-deployment `*.vercel.app` URLs cannot be registered (they change every push), so **OAuth can only be connected from production, staging or localhost**, never from a raw preview URL.

**Done 2026-07-31.** Client `362970587122-dpe07...` in `neramclasses`, type Web application.

## 5. Submit the compliance audit

**YouTube API Services, Audit and Quota Extension form.**

Until this passes, YouTube forces every video uploaded through the API to `private`, whatever the code asks for. Nothing waits on this: uploads work now, they just land private and you flip each one to Unlisted in Studio with one click.

When it passes, change `UPLOAD_PRIVACY_STATUS` in [apps/nexus/src/lib/youtube-upload.ts](apps/nexus/src/lib/youtube-upload.ts) from `'private'` to `'unlisted'`. A unit test asserts that constant is the only thing that changes.

## 6. Set the environment variables

**Done 2026-07-31.** All four are set on `neram-nexus-new` for both Production and Preview, and in `apps/nexus/.env.local` for local dev. Verify any time with `cd apps/nexus && vercel env ls`.

`YOUTUBE_UPLOAD_REDIRECT_URI` differs per environment and must match a URI registered in step 4:

| Environment | Value |
|---|---|
| Production | `https://nexus.neramclasses.com/api/admin/youtube-oauth/callback` |
| Preview (the `staging` branch) | `https://staging-nexus.neramclasses.com/api/admin/youtube-oauth/callback` |
| `.env.local` | `http://localhost:3012/api/admin/youtube-oauth/callback` |

To re-key later, for each environment:

```bash
cd apps/nexus
vercel env rm YOUTUBE_UPLOAD_CLIENT_SECRET production      # remove the old first
printf '%s' "<new-secret>" | vercel env add YOUTUBE_UPLOAD_CLIENT_SECRET production
```

Env changes only take effect on the **next deploy**. Adding them does not redeploy anything by itself.

### Why `CRON_SECRET` matters more here than anywhere else

[assertCronRequest](apps/nexus/src/lib/cron-auth.ts) normally waves calls through when this is missing, which is merely untidy for a route that sends reminders. The backup route opts into `{ required: true }` and returns **503** instead, because an open endpoint there is six requests away from spending a day of upload quota.

Setting it also closed the other nine nexus crons, which were previously callable by anyone. That takes effect on the next deploy.

## 7. Apply the migrations

**Already done, 2026-07-31.** Both tables were applied to staging and production and verified identical. Nothing to do unless you are setting up a fresh environment.

- `nexus_class_video_uploads`, the per-class job with the resumable session and confirmed byte offset
- `nexus_youtube_credentials`, the OAuth grant

Both are inert until the feature flag is on. To re-verify in any environment:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('nexus_class_video_uploads','nexus_youtube_credentials');
```

## 8. Connect the account

Sign in to Nexus as an admin, then visit:

```
https://nexus.neramclasses.com/api/admin/youtube-oauth/start
```

Consent **with the Google account that owns the Neram channel**. Authorising a personal account is the likeliest mistake here and it fails silently: recordings would upload to the wrong channel and nothing would look broken.

If the channel has multiple managers, Google shows a channel picker. Pick the Neram channel, not the "personal channel" entry that appears above it.

Confirm what was actually connected:

```
GET /api/admin/youtube-oauth/status
```

It returns the channel id and title, and never any token. Check the title is the Neram channel.

---

## Turning it on

The flag `staff.youtube-auto-backup` defaults **off**. Do not turn it on first.

**Step 1, see what would run.** Nothing is uploaded, nothing is charged:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://nexus.neramclasses.com/api/cron/youtube-backup?dry_run=1"
```

Expect `{"skipped":"feature disabled"}` until the flag is on, then a candidate list with `"started":0`.

**Step 2, check a recording is readable.** Pick a class id with a recording:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://nexus.neramclasses.com/api/cron/youtube-backup?probe=<classId>"
```

Want `"rangeSupported": true`. Verified across all four recording URL shapes on 2026-07-30, so a `false` here means something changed on the SharePoint side.

**Step 3, one real class.** Turn the flag on at `/teacher/admin/features`, then run with `limit=1` and watch it:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://nexus.neramclasses.com/api/cron/youtube-backup?limit=1"
```

A 300 MB recording may not finish inside one 300s invocation. That is expected and is not a failure: `"partial":1` means it will resume from the confirmed byte on the next run, at no extra quota cost.

**Step 4, leave it.** The three nightly schedules (00:40, 01:20 and 02:00 IST) take over. Only the first is expected to start new uploads; the other two exist to finish them.

---

## What feeds it, and what the teacher sees

**The recording link is now found automatically.** This job selects on `recording_url IS NOT NULL`, and until recently nothing filled that column on a schedule: only a human pressing Sync, Generate or Backfill. So a class nobody opened was never a candidate here, however healthy this job was. [syncClassRecordingLinks](apps/nexus/src/lib/recording-backfill.ts) now runs inside `/api/cron/sync-attendance` (20:50 and 23:30 IST), which is early enough that a class taught tonight is queued for the 00:40 upload the same night.

If a class never gets a link, look there first, not here. Its `recording_sync_status` and `recording_sync_detail` columns say why, and `unavailable` means four attempts were spent and it will not be retried.

**The private-video step is now visible in the app.** The wrap-up panel on `/teacher/timetable` shows a status strip under the YouTube field, reading `nexus_class_video_uploads`:

| State | What the teacher sees |
|---|---|
| `uploading` | "Uploading to YouTube, 62%" with a progress bar |
| `ok` + `private` | "Uploaded to YouTube as private, so students cannot watch it yet", plus an **Open in YouTube Studio** button straight to that video's edit page |
| `pending`, attempts > 0 | "Backup did not finish last night. It tries again tonight" |
| `unavailable` | "Automatic backup gave up after 4 tries", with the failure detail |
| link already filled | nothing, so a class needing no attention stays quiet |

That strip is the whole reason the forced-private rule is survivable. The teacher's one click in Studio is the real publish trigger, and the promotion pass fills `youtube_url` in by itself on the next run.

---

## What the numbers mean

| Field | |
|---|---|
| `started` | new sessions opened. **Each cost 1600 quota units.** Capped at 3 per run, 5 per day. |
| `resumed` | part-done uploads continued. **Cost nothing** and are never capped. |
| `completed` | videos that finished. Private, waiting for you in Studio. |
| `partial` | ran out of clock. Normal. Resumes next run. |
| `promoted` | videos you flipped off private, now published to the Library. |
| `quotaBlocked` | the day's quota is gone. Stops cleanly and counts against no class. |
| `reasons.oauth_revoked` | the grant is dead. Reconnect at step 8. |

## When something goes wrong

| Symptom | Cause |
|---|---|
| `503` from the cron | `CRON_SECRET` is not set. Step 6. |
| `{"skipped":"feature disabled"}` | Normal until you turn the flag on. |
| `reasons.oauth_revoked`, roughly 7 days after setup | An External app still in **Testing**. Step 2. |
| `reasons.oauth_revoked` at any other time | Consent withdrawn or password changed. Reconnect at step 8. |
| `redirect_uri_mismatch` at consent | The URI in step 4 does not match `YOUTUBE_UPLOAD_REDIRECT_URI` byte for byte. |
| `access_denied` for an `@neramclasses.com` account | Audience is External but the app is unpublished, or the account is not a test user. Step 2. |
| `access_denied` for a Gmail account | Audience is Internal, which only admits the Workspace org. Step 2. |
| `insufficient scopes` on the promotion pass | `youtube.readonly` was not added. Step 3, then reconnect. |
| Videos upload but stay private | Expected until the audit passes. Step 5. |
| `quotaExceeded` | 5 uploads already today. It resets at midnight **Pacific**. |
| `RANGE_NOT_SUPPORTED` | SharePoint stopped honouring Range. Re-run the probe; the chunked design depends on it. |
| A class stuck at `status='unavailable'` | Four failed attempts. Read its `detail` column; the cap exists so a broken class cannot burn 1600 units a night forever. |

## Turning it off

Flip `staff.youtube-auto-backup` off at `/teacher/admin/features`. The next run returns immediately. In-flight sessions stay valid and resume whenever it is switched back on.

To disconnect the account entirely, `POST /api/admin/youtube-oauth/disconnect`. That deletes the stored grant but does not revoke at Google's end; do that at myaccount.google.com if you want it gone everywhere.
