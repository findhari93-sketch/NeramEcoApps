# YouTube backup: one-time setup

Turns on the nightly job that copies each class recording from Teams to YouTube.

Teams deletes a class recording after about six months, so the YouTube copy is the durable one. Until this is connected, the code is inert: the feature flag defaults off and the cron returns `{"skipped":"feature disabled"}`.

Budget about 30 minutes. Steps 1 to 4 are Google Cloud Console. Steps 5 to 7 are ours.

---

## 1. Pick the Google Cloud project

Quota is **per project**, and `videos.insert` costs 1600 of a 10,000-unit daily allowance, so this decides how many videos a day can ever go up.

There is already a Google OAuth client in this monorepo, `GOOGLE_YOUTUBE_CLIENT_ID`, used by [apps/app](apps/app/src/app/api/youtube/oauth-callback/route.ts) for the student subscription reward. Check which project it lives in.

- If you reuse that project, the student subscription checks and these uploads share one 10,000-unit budget.
- A separate project gets its own 10,000. Prefer this.

Enable **YouTube Data API v3** on whichever project you choose.

## 2. Create a NEW OAuth client

Do not extend the existing one. It is consented by students on a different redirect URI, and adding the upload scope to it would show every student a "upload videos to your YouTube account" prompt.

**APIs & Services, Credentials, Create credentials, OAuth client ID, Web application.**

Authorised redirect URIs, add both:

```
https://nexus.neramclasses.com/api/admin/youtube-oauth/callback
http://localhost:3012/api/admin/youtube-oauth/callback
```

They must match character for character. A trailing slash is a different URI.

Keep the client ID and secret for step 5.

## 3. Publish the consent screen (the one that bites)

**APIs & Services, OAuth consent screen, Publishing status: set to "In production".**

A consent screen left in **Testing** issues refresh tokens that **expire after 7 days**. The backup would work for a week, then stop silently on a 1am schedule, and nobody would notice until a term of recordings had aged out of Teams.

`youtube.upload` is a sensitive scope, so an unverified production app shows a "Google hasn't verified this app, Advanced, Go to (unsafe)" screen. For one internal account clicking through once, that is fine, and the refresh token then does not expire.

Scopes to add:

```
https://www.googleapis.com/auth/youtube.upload
https://www.googleapis.com/auth/youtube.readonly
```

`youtube.readonly` is what lets the job check, for 1 quota unit per 50 videos, whether you have flipped a video off private yet.

**Write down today's date.** If `invalid_grant` shows up about 7 days later, the screen is still in Testing.

## 4. Submit the compliance audit

**YouTube API Services, Audit and Quota Extension form.**

Until this passes, YouTube forces every video uploaded through the API to `private`, whatever the code asks for. Nothing waits on this: uploads work now, they just land private and you flip each one to Unlisted in Studio with one click.

When it passes, change `UPLOAD_PRIVACY_STATUS` in [apps/nexus/src/lib/youtube-upload.ts](apps/nexus/src/lib/youtube-upload.ts) from `'private'` to `'unlisted'`. A unit test asserts that constant is the only thing that changes.

## 5. Set the environment variables

```bash
cd apps/nexus

echo "<client-id>"     | vercel env add YOUTUBE_UPLOAD_CLIENT_ID production
echo "<client-secret>" | vercel env add YOUTUBE_UPLOAD_CLIENT_SECRET production
echo "https://nexus.neramclasses.com/api/admin/youtube-oauth/callback" | vercel env add YOUTUBE_UPLOAD_REDIRECT_URI production
```

Repeat each with `preview` in place of `production`, using the preview URL for the redirect.

### `CRON_SECRET` is currently unset, and it matters more here than anywhere else

```bash
openssl rand -hex 32   # or any 32+ random chars
cd apps/nexus && echo "<value>" | vercel env add CRON_SECRET production
```

[assertCronRequest](apps/nexus/src/lib/cron-auth.ts) normally waves calls through when this is missing, which is merely untidy for a route that sends reminders. The backup route opts into `{ required: true }` and returns **503** instead, because an open endpoint there is six requests away from spending a day of upload quota.

Setting this also closes the other nine nexus crons, which are currently public.

For local testing, add the same four to `apps/nexus/.env.local`.

## 6. Apply the migrations

Two tables, both inert until the flag is on:

- `nexus_class_video_uploads`, the per-class job with the resumable session and confirmed byte offset
- `nexus_youtube_credentials`, the OAuth grant

They ship with the deploy. Verify they actually landed rather than assuming, because `supabase db push` in CI has silently no-opped before:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('nexus_class_video_uploads','nexus_youtube_credentials');
```

## 7. Connect the account

Sign in to Nexus as an admin, then visit:

```
https://nexus.neramclasses.com/api/admin/youtube-oauth/start
```

Consent **with the Google account that owns the Neram channel**. Authorising a personal account is the likeliest mistake here and it fails silently: recordings would upload to the wrong channel and nothing would look broken.

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

## What the numbers mean

| Field | |
|---|---|
| `started` | new sessions opened. **Each cost 1600 quota units.** Capped at 3 per run, 5 per day. |
| `resumed` | part-done uploads continued. **Cost nothing** and are never capped. |
| `completed` | videos that finished. Private, waiting for you in Studio. |
| `partial` | ran out of clock. Normal. Resumes next run. |
| `promoted` | videos you flipped off private, now published to the Library. |
| `quotaBlocked` | the day's quota is gone. Stops cleanly and counts against no class. |
| `reasons.oauth_revoked` | the grant is dead. Reconnect at step 7. |

## When something goes wrong

| Symptom | Cause |
|---|---|
| `503` from the cron | `CRON_SECRET` is not set. Step 5. |
| `{"skipped":"feature disabled"}` | Normal until you turn the flag on. |
| `reasons.oauth_revoked`, roughly 7 days after setup | The consent screen is still in **Testing**. Step 3. |
| `reasons.oauth_revoked` at any other time | Consent withdrawn or password changed. Reconnect at step 7. |
| Videos upload but stay private | Expected until the audit passes. Step 4. |
| `quotaExceeded` | 5 uploads already today. It resets at midnight **Pacific**. |
| `RANGE_NOT_SUPPORTED` | SharePoint stopped honouring Range. Re-run the probe; the chunked design depends on it. |
| A class stuck at `status='unavailable'` | Four failed attempts. Read its `detail` column; the cap exists so a broken class cannot burn 1600 units a night forever. |

## Turning it off

Flip `staff.youtube-auto-backup` off at `/teacher/admin/features`. The next run returns immediately. In-flight sessions stay valid and resume whenever it is switched back on.

To disconnect the account entirely, `POST /api/admin/youtube-oauth/disconnect`. That deletes the stored grant but does not revoke at Google's end; do that at myaccount.google.com if you want it gone everywhere.
