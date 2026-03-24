# Teams-Nexus Meeting Sync & Member Sync

**Date:** 2026-03-23
**Status:** Approved
**Scope:** Nexus app (`apps/nexus/`) + database

## Problem

The Common Classes classroom in Nexus has 35 enrolled users (2 teachers, 33 students) but the linked Microsoft Teams team only has 4 members. Meeting creation from the Nexus timetable with the Teams toggle enabled does not properly create channel meetings or save the join URL. Students see RSVP buttons but have no way to join meetings. There is no way to import meetings created directly in Teams into the Nexus timetable.

## Goals

1. Sync Nexus enrollments to the linked Teams team (and keep them in sync)
2. Fix meeting creation so Nexus → Teams works end-to-end
3. Give students a clear "Join" experience
4. Allow teachers to pull Teams meetings into the Nexus timetable
5. Improve the meeting detail panel with organizer info and description

## Non-Goals

- Real-time webhook-based sync from Teams → Nexus (future enhancement)
- Automatic Vercel Cron polling (future enhancement)
- Bi-directional meeting updates (editing a meeting in one place updates the other)

---

## Section 1: Member Sync Fix

### Current State

- `nexus_classrooms` row for Common Classes has `ms_team_id = 'fa6f2bc3-9fea-4dc5-9ef6-267241e2cc77'` but `ms_team_sync_enabled = false` and `ms_team_name = null`
- `syncClassroomToTeam()` in `apps/nexus/src/lib/teams-sync.ts` exists but is never called automatically
- Members added to Nexus enrollments are not pushed to the Teams team
- `nexus_teams_sync_log` table already exists in the database

### Changes

1. **Database fix:** Set `ms_team_sync_enabled = true` and `ms_team_name = 'Common Classes'` for the Common Classes classroom
2. **Auto-sync on enrollment:** In the enrollment API (`apps/nexus/src/app/api/classrooms/[id]/enrollments/route.ts`), when a user is enrolled in a classroom with `ms_team_sync_enabled = true` and `ms_team_id` set, call `addMemberToTeam()` to add them to the Teams team. Failures should be logged but not block enrollment.
3. **API endpoint:** `POST /api/classrooms/[id]/sync-members` — triggers `syncClassroomToTeam()` for a classroom. Teacher-only.
4. **UI:** Add a "Sync Members to Teams" button in the teacher timetable toolbar that calls the sync API and shows results (added: X, skipped: Y, already in team: Z)

### Files Changed

- `apps/nexus/src/app/api/classrooms/[id]/sync-members/route.ts` (new)
- `apps/nexus/src/app/api/classrooms/[id]/enrollments/route.ts` (add auto-sync call after enrollment)
- `apps/nexus/src/app/(teacher)/teacher/timetable/page.tsx` (add sync button)

---

## Section 2: Fix Meeting Creation (Nexus → Teams)

### Current State

- `POST /api/timetable/teams-meeting` creates a meeting via `POST /me/onlineMeetings` (Graph delegated)
- Then calls `postToTeamsChannel()` to post an HTML message to the General channel
- The meeting URL is saved to `nexus_scheduled_classes.teams_meeting_url`
- **Bug:** When creating a class via `POST /api/timetable` with the toggle on, the class is created first, then a second request creates the meeting. If the second request fails silently (only `console.error`), no meeting URL is saved and the dialog has already closed.

### Changes

1. **Keep the two-step flow** (create class → create meeting) but improve error handling:
   - **Race condition guard:** Before creating a new meeting in the API, verify that `teams_meeting_id` is still null on the scheduled class. Return a clear error if a meeting already exists.
   - **UX for failure:** If meeting creation fails after class is created, show a Snackbar/toast with the error message. The class is still created successfully — the teacher can retry via the "Create Meeting" button in the detail panel.
2. **Fix channel posting:** The current HTML message works but could be improved. Use a richer format with date/time and join button.
3. **Ensure `teams_meeting_url` is always saved** when the meeting is created successfully
4. **Add "Create Meeting" button** in the ClassDetailPanel for classes that don't have a meeting yet (teacher only). This also serves as the retry mechanism.

### Files Changed

- `apps/nexus/src/app/api/timetable/teams-meeting/route.ts` (add race condition guard, improve error handling, richer channel post)
- `apps/nexus/src/components/timetable/ClassDetailPanel.tsx` (add "Create Meeting" button for classes without one)
- `apps/nexus/src/components/timetable/ClassCreateDialog.tsx` (surface meeting creation errors via callback instead of silent console.error)
- `apps/nexus/src/app/(teacher)/teacher/timetable/page.tsx` (handle meeting creation error Snackbar)

---

## Section 3: Student Join Experience

### Current State

- `ClassDetailPanel.tsx` line 307-333 already has a "Join in Teams" button — but it only shows when `teams_meeting_url` exists
- The class card in the weekly grid does not show a join button

### Changes

1. **Fix the data flow:** Once Section 2 ensures `teams_meeting_url` is saved, the existing "Join in Teams" button in ClassDetailPanel will appear automatically
2. **Add join button on ClassCard:** For upcoming/live classes with a meeting URL, show a small "Join" icon button directly on the card in the weekly calendar view
3. **Live class banner:** When a class has status 'live' and has a meeting URL, show a prominent dismissible banner at the top of the student timetable: "Your class [Title] is live now — Join Meeting". Only one banner shown at a time (the nearest live class). Banner is dismissible and does not persist across page refreshes.

### Files Changed

- `apps/nexus/src/components/timetable/ClassCard.tsx` (add join button on card)
- `apps/nexus/src/app/(student)/student/timetable/page.tsx` (add live class banner)

---

## Section 4: Sync from Teams (Teams → Nexus)

### New Feature

A "Sync from Teams" button that imports online meetings from the linked Teams group calendar into the Nexus timetable.

### API Design

`POST /api/timetable/sync-from-teams`

**Request:**
```json
{
  "classroom_id": "uuid"
}
```

**Response:**
```json
{
  "imported": 3,
  "skipped": 1,
  "errors": [],
  "meetings": [{ "title": "...", "scheduled_date": "...", "status": "imported" }]
}
```

### How It Works

1. Verify the caller is a teacher in the classroom and the classroom has `ms_team_id`
2. Fetch online meeting events from the Teams group calendar using app-only token:
   ```
   GET /groups/{groupId}/calendar/events?$filter=isOnlineMeeting eq true&$top=50&$orderby=start/dateTime desc
   ```
   Filter to events within the last 7 days and next 30 days. Handle `@odata.nextLink` pagination up to a maximum of 100 events.
3. For each event:
   - **Dedup by join URL:** Check if `onlineMeeting.joinUrl` already matches any `teams_meeting_url` in `nexus_scheduled_classes` for this classroom. This catches meetings created via Nexus → Teams flow (which stores a different ID format than the calendar event `id`).
   - **Dedup by event ID:** Also check `teams_meeting_id` against the event `id` for previously imported events.
   - If no match, create a new scheduled class entry
   - Skip events without `onlineMeeting.joinUrl` (non-online calendar events)
4. Return summary

### Data Mapping

| Teams Event Field | Nexus Field |
|---|---|
| `subject` | `title` |
| `start.dateTime` (convert from UTC to IST) | `scheduled_date` + `start_time` |
| `end.dateTime` (convert from UTC to IST) | `end_time` |
| `onlineMeeting.joinUrl` | `teams_meeting_url` + `teams_meeting_join_url` |
| `id` (calendar event ID) | `teams_meeting_id` |
| `organizer.emailAddress.address` | `teacher_id` (match against `users.email` → `users.id`). If organizer not found in `users` table, set `teacher_id` to the calling teacher's ID and store the organizer name in `organizer_name` |
| `organizer.emailAddress.name` | `organizer_name` (always stored for reference) |
| `body.content` (if present) | `description` (strip HTML, truncate to 500 chars) |

### Limitations

- Only imports events that have `isOnlineMeeting = true`. Non-online calendar events are skipped.
- The calendar event `id` is an Outlook event ID, not a Teams meeting ID. It is used for dedup of imported events only. Meetings created via the Nexus → Teams flow use the online meeting ID from `/me/onlineMeetings`, which is a different format — hence the join URL dedup as a secondary check.
- Time range is limited to -7 days to +30 days to avoid unbounded imports.

### Files Changed

- `apps/nexus/src/app/api/timetable/sync-from-teams/route.ts` (new)
- `apps/nexus/src/app/(teacher)/teacher/timetable/page.tsx` (add "Sync from Teams" button)

---

## Section 5: Meeting Detail Panel Improvements

### Changes to ClassDetailPanel

1. **Organizer info:** Show "Organized by: [name]" when `organizer_name` exists and differs from the assigned teacher's name
2. **Description field:** Display `nexus_scheduled_classes.description` if present. Teachers can add/edit description via the edit dialog.
3. **Meeting scope display:** Already exists — keep as is, just ensure it renders for all states

### Database Changes

- `nexus_scheduled_classes.description` — column already exists, already in PATCH allowed fields. Needs to be added to the create dialog and included in SELECT queries.
- `nexus_scheduled_classes.organizer_name` — new column (nullable TEXT) to store the meeting organizer display name when synced from Teams

### Type Changes

The `ClassCardData` interface in `ClassCard.tsx` needs two new optional fields:
```typescript
description?: string | null;
organizer_name?: string | null;
```

### Files Changed

- `apps/nexus/src/components/timetable/ClassDetailPanel.tsx` (add organizer, description display)
- `apps/nexus/src/components/timetable/ClassCreateDialog.tsx` (add description field)
- `apps/nexus/src/components/timetable/ClassCard.tsx` (add `description` and `organizer_name` to `ClassCardData` interface)
- `apps/nexus/src/app/api/timetable/route.ts` (add `description`, `organizer_name` to CLASS_SELECT)
- `apps/nexus/src/app/api/timetable/my-schedule/route.ts` (add `description`, `organizer_name` to SELECT query)
- Database migration for `organizer_name` column

---

## Database Migration

**File:** `supabase/migrations/20260323_nexus_meeting_sync.sql`

```sql
-- Add organizer_name to scheduled classes for Teams sync
ALTER TABLE nexus_scheduled_classes
  ADD COLUMN IF NOT EXISTS organizer_name TEXT;
```

---

## Microsoft Graph API Permissions Required

| Permission | Type | Used For | Status |
|---|---|---|---|
| `OnlineMeetings.ReadWrite` | Delegated | Creating meetings via `/me/onlineMeetings` | Already configured |
| `ChannelMessage.Send` | Delegated | Posting to Teams channel | Already configured |
| `TeamMember.ReadWrite.All` | Application | Adding/removing team members | Already configured |
| `Calendars.Read` | Application | Reading group calendar for Teams → Nexus sync | **Verify** |
| `Group.Read.All` | Application | Reading group info | **Verify** |

**Action required:** Verify that `Calendars.Read` and `Group.Read.All` application permissions are granted in Azure AD portal (App registrations → API permissions). If not, add them and grant admin consent.

---

## Testing Plan

1. **Member sync:** Run sync for Common Classes, verify all 35 users appear in the Teams team
2. **Auto-sync on enrollment:** Add a new student to Common Classes in Nexus, verify they appear in the Teams team
3. **Meeting creation:** Create a class with Teams toggle ON, verify:
   - Meeting URL is saved to the database
   - Message is posted to the Teams General channel
   - "Join in Teams" button appears in the detail panel
4. **Meeting creation retry:** Create a class without the toggle, then use "Create Meeting" button in detail panel
5. **Race condition:** Verify that clicking "Create Meeting" twice doesn't create duplicate meetings
6. **Student join:** Log in as student, verify "Join in Teams" button appears for classes with meetings
7. **Join on card:** Verify the join icon button appears directly on the class card in the weekly view
8. **Live banner:** Set a class to 'live' status, verify the banner appears for students
9. **Sync from Teams:** Create a meeting directly in Teams channel, click "Sync from Teams," verify it imports
10. **Dedup:** Run sync again — verify the same meeting is not imported twice
11. **Detail panel:** Verify organizer name and description render correctly for synced meetings
