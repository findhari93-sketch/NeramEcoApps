# Teams-Nexus Meeting Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Teams member sync, meeting creation, student join experience, add Teams→Nexus sync, and improve the meeting detail panel.

**Architecture:** The existing timetable + Teams integration code in `apps/nexus/` has all the building blocks but several are disconnected. We fix the DB config, add a race-condition guard to meeting creation, add a "Sync from Teams" API that reads the group calendar via Graph, and enhance the UI with join buttons and a live banner.

**Tech Stack:** Next.js 14 App Router, Microsoft Graph API (delegated + app-only tokens), Supabase (Postgres), MUI v5, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-23-teams-nexus-meeting-sync-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `supabase/migrations/20260323_nexus_meeting_sync.sql` | Add `organizer_name` column |
| `apps/nexus/src/app/api/classrooms/[id]/sync-members/route.ts` | Teacher-triggered member sync API |
| `apps/nexus/src/app/api/timetable/sync-from-teams/route.ts` | Import meetings from Teams group calendar |

### Modified Files
| File | Changes |
|------|---------|
| `apps/nexus/src/components/timetable/ClassCard.tsx` | Add `description`, `organizer_name` to interface; add join icon button |
| `apps/nexus/src/components/timetable/ClassDetailPanel.tsx` | Add organizer display, description, "Create Meeting" button |
| `apps/nexus/src/components/timetable/ClassCreateDialog.tsx` | Add description field, surface meeting errors via callback |
| `apps/nexus/src/app/api/timetable/route.ts` | Add `description` to POST insert; SELECT `*` already includes new columns |
| `apps/nexus/src/app/api/timetable/my-schedule/route.ts` | No code change needed — SELECT `*` already includes new columns |
| `apps/nexus/src/app/api/timetable/teams-meeting/route.ts` | Add race condition guard |
| `apps/nexus/src/app/(teacher)/teacher/timetable/page.tsx` | Add sync buttons, meeting error Snackbar, "Create Meeting" handler |
| `apps/nexus/src/app/(student)/student/timetable/page.tsx` | Add live class banner |

---

## Task 1: Database Migration + Enable Sync

**Files:**
- Create: `supabase/migrations/20260323_nexus_meeting_sync.sql`

- [ ] **Step 1: Create migration file**

```sql
-- Add organizer_name to scheduled classes for Teams-imported meetings
ALTER TABLE nexus_scheduled_classes
  ADD COLUMN IF NOT EXISTS organizer_name TEXT;
```

Save to `supabase/migrations/20260323_nexus_meeting_sync.sql`.

- [ ] **Step 2: Apply migration to staging**

Run via MCP tool: `mcp__supabase-staging__apply_migration` with name `20260323_nexus_meeting_sync` and the SQL above.

- [ ] **Step 3: Apply migration to production**

Run via MCP tool: `mcp__supabase-prod__apply_migration` with name `20260323_nexus_meeting_sync` and the SQL above.

- [ ] **Step 4: Enable sync for Common Classes**

Run via MCP tool: `mcp__supabase-prod__execute_sql`
```sql
UPDATE nexus_classrooms
SET ms_team_sync_enabled = true, ms_team_name = 'Common Classes'
WHERE id = '8876a8fc-ac99-4091-b3b2-15f93723c642';
```

Also run on staging (use the staging classroom ID — query first to find it).

> **Note:** The enrollment API at `apps/nexus/src/app/api/classrooms/[id]/enrollments/route.ts` (lines 141-169) already has auto-sync logic that calls `addMemberToTeam()` when `ms_team_sync_enabled = true`. No code changes needed there — enabling the DB flag is sufficient.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260323_nexus_meeting_sync.sql
git commit -m "feat: add organizer_name column for Teams meeting sync"
```

---

## Task 2: Update Data Types & SELECT Queries

**Files:**
- Modify: `apps/nexus/src/components/timetable/ClassCard.tsx:12-30`
- Modify: `apps/nexus/src/app/api/timetable/route.ts:6`
- Modify: `apps/nexus/src/app/api/timetable/my-schedule/route.ts:5`

- [ ] **Step 1: Add fields to ClassCardData interface**

In `apps/nexus/src/components/timetable/ClassCard.tsx`, add to the `ClassCardData` interface after line 29 (`classroom?`):

```typescript
  description?: string | null;
  organizer_name?: string | null;
```

- [ ] **Step 2: Update CLASS_SELECT in timetable route**

In `apps/nexus/src/app/api/timetable/route.ts` line 6, change:

```typescript
const CLASS_SELECT = `*, topic:nexus_topics(id, title, category), teacher:users!nexus_scheduled_classes_teacher_id_fkey(id, name, avatar_url), batch:nexus_batches!nexus_scheduled_classes_batch_id_fkey(id, name)`;
```

The `*` already includes all columns from `nexus_scheduled_classes` (including `description` and `organizer_name`), so this select already works. **No change needed** — verify by reading the Supabase docs that `*` includes all scalar columns. It does.

- [ ] **Step 3: Verify CLASS_SELECT in my-schedule route**

In `apps/nexus/src/app/api/timetable/my-schedule/route.ts` line 5, the select also uses `*` which includes all columns. **No change needed.**

- [ ] **Step 4: Add description to timetable POST handler**

In `apps/nexus/src/app/api/timetable/route.ts`, the POST handler (line 124) destructures the body but does not include `description`. Add it:

Change line 124:
```typescript
    const { classroom_id, title, scheduled_date, start_time, end_time, topic_id, batch_id, teams_meeting_scope, target_scope } = body;
```
To:
```typescript
    const { classroom_id, title, scheduled_date, start_time, end_time, topic_id, batch_id, teams_meeting_scope, target_scope, description } = body;
```

And add to the `insertData` object (after line 144):
```typescript
      description: description || null,
```

- [ ] **Step 5: Commit**

```bash
git add apps/nexus/src/components/timetable/ClassCard.tsx apps/nexus/src/app/api/timetable/route.ts
git commit -m "feat: add description and organizer_name to ClassCardData and POST handler"
```

---

## Task 3: Member Sync API

**Files:**
- Create: `apps/nexus/src/app/api/classrooms/[id]/sync-members/route.ts`

- [ ] **Step 1: Create sync-members API route**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { syncClassroomToTeam } from '@/lib/teams-sync';

/**
 * POST /api/classrooms/[id]/sync-members
 * Trigger a full member sync from Nexus enrollments to the linked Teams team.
 * Teacher-only.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    // Verify teacher/admin role
    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user || !['teacher', 'admin'].includes(user.user_type)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Verify classroom has a linked team
    const { data: classroom } = await supabase
      .from('nexus_classrooms')
      .select('ms_team_id, name')
      .eq('id', id)
      .single();

    if (!classroom?.ms_team_id) {
      return NextResponse.json(
        { error: 'This classroom has no linked Teams team' },
        { status: 400 }
      );
    }

    const result = await syncClassroomToTeam(id);

    return NextResponse.json({
      message: `Synced members to "${classroom.name}" Teams team`,
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to sync members';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/nexus/src/app/api/classrooms/\[id\]/sync-members/route.ts
git commit -m "feat: add teacher-triggered member sync API"
```

---

## Task 4: Race Condition Guard in Meeting Creation

**Files:**
- Modify: `apps/nexus/src/app/api/timetable/teams-meeting/route.ts:72-83`

- [ ] **Step 1: Add guard before Graph API call**

In `apps/nexus/src/app/api/timetable/teams-meeting/route.ts`, after fetching the scheduled class (line 77) and before building date-times (line 84), add:

```typescript
    // Race condition guard: ensure no meeting was created between page load and now
    if (scheduledClass.teams_meeting_id) {
      return NextResponse.json({
        class: scheduledClass,
        meeting: {
          id: scheduledClass.teams_meeting_id,
          joinUrl: scheduledClass.teams_meeting_join_url || scheduledClass.teams_meeting_url,
          scope: scheduledClass.teams_meeting_scope,
        },
        alreadyExists: true,
      });
    }
```

Insert this right after line 82 (`if (!scheduledClass)` block) and before line 84 (`// Build date-times`).

- [ ] **Step 2: Commit**

```bash
git add apps/nexus/src/app/api/timetable/teams-meeting/route.ts
git commit -m "fix: add race condition guard for duplicate meeting creation"
```

---

## Task 5: Meeting Detail Panel — Create Meeting Button + Organizer + Description

**Files:**
- Modify: `apps/nexus/src/components/timetable/ClassDetailPanel.tsx`

- [ ] **Step 1: Add new props to ClassDetailPanelProps**

After the `onSyncRecording` prop (line 51), add:

```typescript
  onCreateMeeting?: (cls: ClassCardData) => void;
```

Add it to the destructured props in the function signature as well.

- [ ] **Step 2: Add organizer display**

In the quick info section, after the Teacher block (around line 222), add:

```typescript
        {/* Organizer (if different from teacher) */}
        {cls.organizer_name && cls.teacher && cls.organizer_name !== cls.teacher.name && (
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              Organized by
            </Typography>
            <Typography variant="body2">{cls.organizer_name}</Typography>
          </Box>
        )}
```

- [ ] **Step 3: Add description display**

After the organizer block, add:

```typescript
        {/* Description */}
        {cls.description && (
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              Description
            </Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
              {cls.description}
            </Typography>
          </Box>
        )}
```

- [ ] **Step 4: Add "Create Meeting" button for teachers**

In the teacher actions section (around line 362-386), after the existing teacher buttons block, add before the edit/delete buttons block (before line 388):

```typescript
          {/* Create Teams Meeting (for classes without one) */}
          {role === 'teacher' && isUpcoming && !isCancelled && !cls.teams_meeting_id && onCreateMeeting && (
            <Button
              variant="contained"
              fullWidth
              color="primary"
              startIcon={<VideocamIcon />}
              onClick={() => onCreateMeeting(cls)}
              sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600 }}
            >
              Create Teams Meeting
            </Button>
          )}
```

- [ ] **Step 5: Commit**

```bash
git add apps/nexus/src/components/timetable/ClassDetailPanel.tsx
git commit -m "feat: add organizer, description, and create-meeting button to detail panel"
```

---

## Task 6: ClassCreateDialog — Description Field + Error Callback

**Files:**
- Modify: `apps/nexus/src/components/timetable/ClassCreateDialog.tsx`

- [ ] **Step 1: Add description to form data**

In `ClassFormData` interface (line 48-57), add:

```typescript
  description: string;
```

In `emptyForm` (line 59-67), add:

```typescript
  description: '',
```

- [ ] **Step 2: Add onMeetingError callback prop**

In `ClassCreateDialogProps` (line 78-100), add:

```typescript
  onMeetingError?: (error: string) => void;
```

Add to the destructured props in the function signature.

- [ ] **Step 3: Add description TextField**

After the topic Select (after line 490), add:

```typescript
          <TextField
            label="Description"
            fullWidth
            multiline
            minRows={2}
            maxRows={4}
            value={formData.description}
            onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
            placeholder="Optional notes or agenda for this class"
          />
```

- [ ] **Step 4: Include description in API body**

In the `doSubmit` function (line 244), add to the body object:

```typescript
      description: formData.description || null,
```

- [ ] **Step 5: Surface meeting creation errors**

In the `doSubmit` function, replace the silent `console.error` block (lines 293-298) with:

```typescript
          if (!meetingRes.ok) {
            const meetingErr = await meetingRes.json().catch(() => ({}));
            const errMsg = meetingErr.error || 'Failed to create Teams meeting';
            console.error('Teams meeting creation failed:', errMsg);
            onMeetingError?.(errMsg);
          }
        } catch (meetingErr) {
          console.error('Teams meeting creation error:', meetingErr);
          onMeetingError?.('Failed to create Teams meeting. You can retry from the class detail panel.');
        }
```

- [ ] **Step 6: Populate description when editing**

In the `useEffect` that populates the form on edit (line 159-192), add `description` to the editingClass branch:

```typescript
        description: editingClass.description || '',
```

- [ ] **Step 7: Commit**

```bash
git add apps/nexus/src/components/timetable/ClassCreateDialog.tsx
git commit -m "feat: add description field and meeting error callback to class dialog"
```

---

## Task 7: Teacher Timetable — Sync Buttons + Meeting Handlers

**Files:**
- Modify: `apps/nexus/src/app/(teacher)/teacher/timetable/page.tsx`

- [ ] **Step 1: Add imports**

Add to the imports at the top:

```typescript
import SyncIcon from '@mui/icons-material/Sync';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
```

- [ ] **Step 2: Add handleSyncMembers function**

After `handleViewRsvpDashboard` (around line 343), add:

```typescript
  const handleSyncMembers = async () => {
    if (!activeClassroom) return;
    try {
      const token = await getToken();
      if (!token) return;

      setSnackbar({ open: true, message: 'Syncing members to Teams...', severity: 'success' });

      const res = await fetch(`/api/classrooms/${activeClassroom.id}/sync-members`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (res.ok) {
        setSnackbar({
          open: true,
          message: `Sync complete: ${data.added} added, ${data.alreadyInTeam} already in team, ${data.skipped} skipped`,
          severity: 'success',
        });
      } else {
        setSnackbar({ open: true, message: data.error || 'Sync failed', severity: 'error' });
      }
    } catch {
      setSnackbar({ open: true, message: 'Failed to sync members', severity: 'error' });
    }
  };
```

- [ ] **Step 3: Add handleSyncFromTeams function**

```typescript
  const handleSyncFromTeams = async () => {
    if (!activeClassroom) return;
    try {
      const token = await getToken();
      if (!token) return;

      setSnackbar({ open: true, message: 'Importing meetings from Teams...', severity: 'success' });

      const res = await fetch('/api/timetable/sync-from-teams', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ classroom_id: activeClassroom.id }),
      });

      const data = await res.json();
      if (res.ok) {
        setSnackbar({
          open: true,
          message: `Imported ${data.imported} meeting(s), ${data.skipped} already existed`,
          severity: 'success',
        });
        if (data.imported > 0) fetchClasses();
      } else {
        setSnackbar({ open: true, message: data.error || 'Import failed', severity: 'error' });
      }
    } catch {
      setSnackbar({ open: true, message: 'Failed to import from Teams', severity: 'error' });
    }
  };
```

- [ ] **Step 4: Add handleCreateMeeting function**

```typescript
  const handleCreateMeeting = async (cls: ClassCardData) => {
    if (!activeClassroom) return;
    setSelectedClass(null);
    try {
      const token = await getToken();
      if (!token) return;

      setSnackbar({ open: true, message: 'Creating Teams meeting...', severity: 'success' });

      const res = await fetch('/api/timetable/teams-meeting', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          class_id: cls.id,
          classroom_id: cls.classroom?.id || activeClassroom.id,
          auto: true,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setSnackbar({
          open: true,
          message: data.alreadyExists ? 'Meeting already exists' : 'Teams meeting created!',
          severity: 'success',
        });
        fetchClasses();
      } else {
        setSnackbar({ open: true, message: data.error || 'Failed to create meeting', severity: 'error' });
      }
    } catch {
      setSnackbar({ open: true, message: 'Failed to create meeting', severity: 'error' });
    }
  };
```

- [ ] **Step 5: Add handleMeetingError function**

```typescript
  const handleMeetingError = (error: string) => {
    setSnackbar({ open: true, message: error, severity: 'error' });
  };
```

- [ ] **Step 6: Add sync buttons to toolbar**

In the toolbar area (around line 435-479), after the "RSVP" button and before the notification bell, add:

```typescript
          {activeClassroom?.ms_team_id && (
            <>
              <Button
                size="small"
                variant="outlined"
                startIcon={<SyncIcon />}
                onClick={handleSyncMembers}
                sx={{ textTransform: 'none', minHeight: 40 }}
              >
                Sync Members
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={<CloudDownloadIcon />}
                onClick={handleSyncFromTeams}
                sx={{ textTransform: 'none', minHeight: 40 }}
              >
                Sync from Teams
              </Button>
            </>
          )}
```

- [ ] **Step 7: Wire up new props to ClassDetailPanel**

In the `<ClassDetailPanel>` component (around line 525), add:

```typescript
        onCreateMeeting={handleCreateMeeting}
```

- [ ] **Step 8: Wire up onMeetingError to ClassCreateDialog**

In the `<ClassCreateDialog>` component (around line 543), add:

```typescript
        onMeetingError={handleMeetingError}
```

- [ ] **Step 9: Commit**

```bash
git add apps/nexus/src/app/\(teacher\)/teacher/timetable/page.tsx
git commit -m "feat: add sync members, sync from teams, and create meeting handlers"
```

---

## Task 8: Sync from Teams API

**Files:**
- Create: `apps/nexus/src/app/api/timetable/sync-from-teams/route.ts`

- [ ] **Step 1: Create the API route**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getAppOnlyToken } from '@/lib/graph-app-token';

/**
 * POST /api/timetable/sync-from-teams
 * Import online meeting events from the Teams group calendar into the Nexus timetable.
 * Teacher-only.
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const { classroom_id } = await request.json();

    if (!classroom_id) {
      return NextResponse.json({ error: 'classroom_id is required' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    // Verify teacher role
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { data: enrollment } = await supabase
      .from('nexus_enrollments')
      .select('role')
      .eq('user_id', user.id)
      .eq('classroom_id', classroom_id)
      .single();

    if (!enrollment || enrollment.role !== 'teacher') {
      return NextResponse.json({ error: 'Only teachers can sync from Teams' }, { status: 403 });
    }

    // Get linked team
    const { data: classroom } = await supabase
      .from('nexus_classrooms')
      .select('ms_team_id, name')
      .eq('id', classroom_id)
      .single();

    if (!classroom?.ms_team_id) {
      return NextResponse.json({ error: 'Classroom has no linked Teams team' }, { status: 400 });
    }

    // Fetch online meeting events from the group calendar
    const token = await getAppOnlyToken();
    const now = new Date();
    const pastDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const futureDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const events = await fetchGroupCalendarView(
      token,
      classroom.ms_team_id,
      pastDate,
      futureDate
    );

    // Get existing meetings for dedup
    const { data: existingClasses } = await supabase
      .from('nexus_scheduled_classes')
      .select('teams_meeting_id, teams_meeting_url')
      .eq('classroom_id', classroom_id)
      .not('teams_meeting_url', 'is', null);

    const existingMeetingIds = new Set(
      (existingClasses || []).map((c: any) => c.teams_meeting_id).filter(Boolean)
    );
    const existingJoinUrls = new Set(
      (existingClasses || []).map((c: any) => c.teams_meeting_url).filter(Boolean)
    );

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];
    const meetings: { title: string; scheduled_date: string; status: string }[] = [];

    for (const event of events) {
      const joinUrl = event.onlineMeeting?.joinUrl;
      if (!joinUrl) {
        // Not an online meeting — skip
        continue;
      }

      // Dedup by event ID
      if (existingMeetingIds.has(event.id)) {
        skipped++;
        continue;
      }

      // Dedup by join URL (catches Nexus-created meetings)
      if (existingJoinUrls.has(joinUrl)) {
        skipped++;
        continue;
      }

      try {
        // Parse date/time — Graph returns IST thanks to Prefer: outlook.timezone header
        // event.start.dateTime is like "2026-03-23T19:30:00.0000000"
        const startStr = event.start.dateTime as string;
        const endStr = event.end.dateTime as string;

        const scheduledDate = startStr.substring(0, 10); // "2026-03-23"
        const startTime = startStr.substring(11, 16);     // "19:30"
        const endTime = endStr.substring(11, 16);          // "20:30"

        // Resolve organizer → teacher_id
        let teacherId = user.id; // Default to calling teacher
        let organizerName = event.organizer?.emailAddress?.name || null;

        if (event.organizer?.emailAddress?.address) {
          const { data: organizer } = await supabase
            .from('users')
            .select('id')
            .eq('email', event.organizer.emailAddress.address)
            .single();

          if (organizer) {
            teacherId = organizer.id;
          }
        }

        // Extract description
        let description: string | null = null;
        if (event.body?.content) {
          // Strip HTML tags, truncate
          description = event.body.content
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/g, ' ')
            .trim()
            .substring(0, 500) || null;
        }

        const { error: insertError } = await supabase
          .from('nexus_scheduled_classes')
          .insert({
            classroom_id,
            title: event.subject || 'Teams Meeting',
            scheduled_date: scheduledDate,
            start_time: startTime,
            end_time: endTime,
            teacher_id: teacherId,
            organizer_name: organizerName,
            description,
            teams_meeting_id: event.id,
            teams_meeting_url: joinUrl,
            teams_meeting_join_url: joinUrl,
            teams_meeting_scope: 'channel_meeting',
            target_scope: 'classroom',
            status: 'scheduled',
          });

        if (insertError) {
          errors.push(`${event.subject}: ${insertError.message}`);
        } else {
          imported++;
          meetings.push({ title: event.subject, scheduled_date: scheduledDate, status: 'imported' });
          // Add to dedup sets for subsequent events in this batch
          existingMeetingIds.add(event.id);
          existingJoinUrls.add(joinUrl);
        }
      } catch (err) {
        errors.push(`${event.subject}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    return NextResponse.json({ imported, skipped, errors, meetings });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to sync from Teams';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Fetch online meeting events from a Teams group calendar using calendarView.
 * calendarView returns events within a time range (the correct Graph API for bounded queries).
 * Handles pagination, returns max 100 events.
 */
async function fetchGroupCalendarView(
  token: string,
  groupId: string,
  startDateTime: string,
  endDateTime: string,
): Promise<any[]> {
  const events: any[] = [];
  let url: string | null =
    `https://graph.microsoft.com/v1.0/groups/${groupId}/calendarView` +
    `?startDateTime=${encodeURIComponent(startDateTime)}` +
    `&endDateTime=${encodeURIComponent(endDateTime)}` +
    `&$top=50` +
    `&$orderby=start/dateTime desc` +
    `&$select=id,subject,start,end,onlineMeeting,organizer,body,isOnlineMeeting`;

  while (url && events.length < 100) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Prefer: 'outlook.timezone="Asia/Kolkata"',
      },
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Failed to fetch group calendar: ${res.status} ${errText}`);
    }

    const data = await res.json();
    for (const event of data.value || []) {
      // Only import online meetings
      if (event.isOnlineMeeting && event.onlineMeeting?.joinUrl) {
        events.push(event);
      }
    }

    url = data['@odata.nextLink'] || null;
  }

  return events;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/nexus/src/app/api/timetable/sync-from-teams/route.ts
git commit -m "feat: add sync-from-teams API to import meetings from Teams calendar"
```

---

## Task 9: Student Join Button on ClassCard

**Files:**
- Modify: `apps/nexus/src/components/timetable/ClassCard.tsx`

- [ ] **Step 1: Add join icon button to ClassCard**

In `ClassCard.tsx`, the card currently renders title, time, status chips, etc. Find the section where action buttons are rendered (around the bottom of the card). Add a join button for upcoming/live classes with a meeting URL.

After the existing status chip area inside the card content, add a conditional join button:

```typescript
      {/* Quick join button for upcoming/live classes */}
      {(cls.status === 'scheduled' || cls.status === 'live') && (cls.teams_meeting_join_url || cls.teams_meeting_url) && (
        <IconButton
          size="small"
          href={cls.teams_meeting_join_url || cls.teams_meeting_url || ''}
          target="_blank"
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          sx={{
            position: 'absolute',
            top: 4,
            right: 4,
            bgcolor: cls.status === 'live' ? 'success.main' : 'primary.main',
            color: 'white',
            '&:hover': { bgcolor: cls.status === 'live' ? 'success.dark' : 'primary.dark' },
            width: 32,
            height: 32,
            animation: cls.status === 'live' ? 'pulse 1.5s infinite' : 'none',
            '@keyframes pulse': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.7 } },
          }}
          title="Join Teams Meeting"
        >
          <VideocamIcon sx={{ fontSize: 18 }} />
        </IconButton>
      )}
```

Make sure the card's root Box has `position: 'relative'` so the absolute positioning works.

- [ ] **Step 2: Commit**

```bash
git add apps/nexus/src/components/timetable/ClassCard.tsx
git commit -m "feat: add quick join button on class cards for live/upcoming meetings"
```

---

## Task 10: Student Live Class Banner

**Files:**
- Modify: `apps/nexus/src/app/(student)/student/timetable/page.tsx`

- [ ] **Step 1: Add live class banner state**

Add state for dismissing the banner:

```typescript
  const [liveBannerDismissed, setLiveBannerDismissed] = useState(false);
```

- [ ] **Step 2: Compute live class**

After the `classes` filter (around line 35-37), add:

```typescript
  // Find the nearest live class with a meeting URL
  const liveClass = !liveBannerDismissed
    ? allClasses.find(
        (c) => c.status === 'live' && (c.teams_meeting_join_url || c.teams_meeting_url)
      )
    : null;
```

- [ ] **Step 3: Add banner JSX**

After the classroom filter chips section (around line 346) and before the calendar grid, add:

```typescript
      {/* Live class banner */}
      {liveClass && (
        <Alert
          severity="info"
          variant="filled"
          sx={{
            mb: 2,
            bgcolor: 'success.main',
            '& .MuiAlert-icon': { color: 'white' },
            '& .MuiAlert-message': { color: 'white', width: '100%' },
            '& .MuiAlert-action': { color: 'white' },
          }}
          action={
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <Button
                color="inherit"
                size="small"
                variant="outlined"
                href={liveClass.teams_meeting_join_url || liveClass.teams_meeting_url || ''}
                target="_blank"
                sx={{ fontWeight: 700, borderColor: 'white', color: 'white', minHeight: 36 }}
              >
                Join Now
              </Button>
              <IconButton
                size="small"
                color="inherit"
                onClick={() => setLiveBannerDismissed(true)}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>
          }
        >
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {liveClass.title} is live now!
          </Typography>
        </Alert>
      )}
```

- [ ] **Step 4: Add missing imports**

In `apps/nexus/src/app/(student)/student/timetable/page.tsx` line 4, change the import from:

```typescript
import { Box, Typography, Snackbar, Alert, ToggleButton, ToggleButtonGroup, Chip, useMediaQuery, useTheme } from '@neram/ui';
```

To:

```typescript
import { Box, Typography, Snackbar, Alert, Button, IconButton, ToggleButton, ToggleButtonGroup, Chip, useMediaQuery, useTheme } from '@neram/ui';
```

And add after the existing icon imports:

```typescript
import CloseIcon from '@mui/icons-material/Close';
```

- [ ] **Step 5: Reset banner on week change**

In the `fetchClasses` callback, reset the dismissed state:

```typescript
  // Reset live banner when classes refresh
  useEffect(() => {
    setLiveBannerDismissed(false);
  }, [allClasses]);
```

- [ ] **Step 6: Commit**

```bash
git add apps/nexus/src/app/\(student\)/student/timetable/page.tsx
git commit -m "feat: add live class banner with join button for students"
```

---

## Task 11: Verify & Test End-to-End

- [ ] **Step 1: Verify Azure AD permissions**

Check that `Calendars.Read` and `Group.Read.All` application permissions are granted in the Azure AD app registration. If not, note them for the user to add manually in the Azure portal.

- [ ] **Step 2: Run member sync for Common Classes**

After deploying, trigger the member sync via the new "Sync Members" button. Verify all 35 enrolled users appear in the Teams team.

- [ ] **Step 3: Test meeting creation**

1. Create a class in the Common Classes timetable with the Teams toggle ON
2. Verify the meeting URL is saved (check DB or inspect the class detail panel)
3. Verify the "Join in Teams" button appears in the detail panel
4. Verify the message is posted to the Teams General channel

- [ ] **Step 4: Test "Create Meeting" retry**

1. Create a class WITHOUT the Teams toggle
2. Open the class detail panel
3. Click "Create Teams Meeting"
4. Verify the meeting is created and join URL appears

- [ ] **Step 5: Test student join experience**

1. Log in as a student
2. Verify the "Join in Teams" button appears for classes with meetings
3. Verify the join icon on the class card
4. Set a class to 'live' and verify the live banner appears

- [ ] **Step 6: Test sync from Teams**

1. Create a meeting directly in the Teams channel
2. Click "Sync from Teams" in the teacher timetable
3. Verify the meeting is imported into the Nexus timetable
4. Click "Sync from Teams" again — verify the same meeting is not imported twice

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat: complete Teams-Nexus meeting sync integration"
```
