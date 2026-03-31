# Nexus Enterprise Ticket System — Design Spec

## Context

Students onboarded into Nexus encounter bugs, content issues, UI problems, and have feature suggestions. Currently, foundation issues can only be reported from chapter pages (no screenshots, no categories, no ticket IDs). There's no way for students to create standalone tickets or report issues from any page. Staff needs better tracking with ticket numbers, and a confirmation loop to verify fixes actually worked.

**Goal:** Upgrade the existing foundation issues system into an enterprise-grade ticket system (modeled after Google, Amazon, Microsoft support patterns) with contextual reporting from every page, screenshot uploads, unique ticket IDs, categorization, and a student confirmation loop.

## Architecture Overview

### Approach: Enhance Existing Foundation Issues System

Build on `nexus_foundation_issues` table and its mature workflow (assignment, delegation, activity log, comments, notifications) rather than creating a new system or using the separate `support_tickets` table.

```
Student Entry Points                Staff Dashboard
─────────────────                   ──────────────

1. TopBar ⋮ Menu                    /teacher/issues (existing)
   → "Report Issue"                 ├── See all tickets with NXS-#### IDs
   → Pre-filled with page context   ├── Category badges
                                    ├── Screenshot viewer
2. /student/issues                  ├── Assign / Delegate / Resolve
   → "Create Ticket" button         ├── Awaiting Confirmation status
   → Standalone ticket creation     └── Reopened ticket handling

Both open → ReportIssueDialog
(bottom sheet mobile / dialog desktop)
```

## Database Changes

### Migration: `supabase/migrations/YYYYMMDD_foundation_issues_v2.sql`

**New columns on `nexus_foundation_issues`:**

| Column | Type | Description |
|--------|------|-------------|
| `ticket_number` | TEXT UNIQUE | Auto-generated "NXS-0001" via DB trigger |
| `category` | TEXT (CHECK) | 'bug', 'content_issue', 'ui_ux', 'feature_request', 'class_schedule', 'other' |
| `screenshot_urls` | TEXT[] | Array of up to 3 Supabase Storage paths |
| `page_url` | TEXT | Auto-captured page route where issue was reported |
| `auto_close_at` | TIMESTAMPTZ | Set to NOW() + 3 days when resolved; triggers auto-close |

**Schema changes:**
- Make `chapter_id` **nullable** (currently NOT NULL) — allows standalone tickets without chapter context
- Add `awaiting_confirmation` and `closed` to status CHECK constraint
- Status lifecycle: `open` → `in_progress` → `resolved` → `awaiting_confirmation` → `closed`
- Student can reject → reopens to `open`
- No response in 3 days → auto-closes to `closed`

**Auto-increment trigger:** Generate `NXS-0001`, `NXS-0002`, etc. using a sequence + trigger (same pattern as `support_tickets.ticket_number`).

**New notification event types:**
- `foundation_issue_awaiting_confirmation`
- `foundation_issue_reopened`
- `foundation_issue_closed`

### Supabase Storage

- Create bucket: `issue-screenshots`
- Path pattern: `issue-screenshots/{student_id}/{timestamp}.jpg`
- Cleanup: Delete files when ticket status changes to `closed`

## Screenshot Upload Flow

### Client-Side Optimization (Before Upload)
- Resize to max **1200px width** (maintains readability)
- Compress to **JPEG at 70% quality**
- Max **500KB per image** after optimization
- Up to **3 screenshots** per ticket
- Uses HTML Canvas API for resize/compress

### Upload Path
```
Student selects/captures image
  → Client-side resize + compress (canvas API)
  → POST /api/foundation/issues/upload (FormData with auth token)
  → Server uploads to Supabase Storage "issue-screenshots" bucket
  → Returns storage path
  → Paths stored in screenshot_urls array on ticket creation
```

### Cleanup on Close
When ticket status → `closed` (student confirms OR 3-day auto-close):
1. Delete all files from storage bucket referenced in `screenshot_urls`
2. Set `screenshot_urls` to NULL
3. Log cleanup in activity log

## Student UI

### Entry Point 1: TopBar Menu Item (Every Page)

Added to the existing TopBar overflow menu (⋮) across all student pages:

```
┌──────────────┐
│ Report Issue  │
│ Help          │
└──────────────┘
```

When tapped:
- Opens `ReportIssueDialog` component
- Auto-fills `page_url` from current route
- Pre-selects category if context is obvious (e.g., on chapter page → "Content Issue")

### Entry Point 2: Create Ticket on My Issues Page

New "Create Ticket" button at the top of `/student/issues`:

```
┌─────────────────────────────────────────┐
│  My Issues                              │
│  Track and manage your reported issues  │
│                                         │
│  [+ Create Ticket]                      │
│                                         │
│  All (3)  Open (2)  Awaiting (1)        │
│                                         │
│  NXS-0042 · Video not playing    [Open] │
│  Bug · Ch 1: History · 2 screenshots    │
│  Reported Today                         │
└─────────────────────────────────────────┘
```

### Ticket Creation Form (Shared Component)

`ReportIssueDialog` — renders as bottom sheet on mobile, dialog on desktop.

**Fields:**
- **Category** (required) — dropdown: Bug, Content Issue, UI/UX Problem, Feature Request, Class/Schedule Issue, Other
- **Title** (required) — "What's the issue?" text field
- **Description** (optional) — multiline details
- **Screenshots** (optional) — up to 3 images with preview thumbnails and remove (x) button
- **Page URL** (auto, read-only) — shows which page the report came from

### Student Confirmation Loop

When staff resolves a ticket, student sees a confirmation banner on the ticket card:

```
┌─ Is this resolved? ────────────────┐
│                                     │
│  [Yes, close it]  [Reopen]         │
│                                     │
│  Auto-closes in 2 days              │
└─────────────────────────────────────┘
```

- **"Yes, close it"** → status → `closed`, screenshots deleted, ticket archived
- **"Reopen"** → student enters short reason → status → `open`, staff notified via bell
- **No response 3 days** → auto-close via cron, screenshots cleaned up

**Tabs update:** Add "Awaiting" tab to show tickets needing student confirmation.

## Teacher/Admin Side Changes

Existing `/teacher/issues` dashboard — minor additions only:

1. **Ticket number** — `NXS-0042` displayed alongside title
2. **Category badge** — Color-coded chip (Bug=red, Content=orange, UI/UX=blue, Feature=purple, Class=green, Other=gray)
3. **Screenshot viewer** — Clickable thumbnails that open in lightbox/modal
4. **Page URL** — Shows which page the student was on
5. **Awaiting Confirmation status** — Shows countdown "Auto-closes in X days"
6. **Reopened indicator** — "Reopened by student" with their reason in activity log

No new pages needed for staff.

## API Changes

### POST /api/foundation/issues (Update)
```typescript
// Updated body:
{
  chapter_id?: string,    // NOW OPTIONAL
  section_id?: string,
  title: string,          // required
  description?: string,
  category: string,       // NEW required
  page_url?: string,      // NEW auto-captured
  screenshot_urls?: string[] // NEW max 3 paths
}
```

### PATCH /api/foundation/issues/[id] (New Actions)
```typescript
// New actions for students:
{ action: 'confirm' }           // Student confirms fix → closed
{ action: 'reopen', reason: string }  // Student rejects → open

// Updated resolve action (for staff):
{ action: 'resolve', resolution_note: string }
// Now sets status to 'awaiting_confirmation' + sets auto_close_at
```

### POST /api/foundation/issues/upload (New)
```typescript
// FormData with file
// Returns: { path: "issue-screenshots/student-id/timestamp.jpg" }
```

## Cron / Auto-Close

A scheduled job (API route triggered by cron or Supabase Edge Function) that runs daily:
1. Query tickets where `status = 'awaiting_confirmation'` AND `auto_close_at < NOW()`
2. Update status to `closed`
3. Delete screenshot files from storage
4. Set `screenshot_urls` to NULL
5. Log auto-close in activity log
6. Send in-app notification to student: "Your ticket NXS-XXXX was auto-closed after 3 days"

## Notifications (In-App Bell Only)

| Event | Recipient | Message |
|-------|-----------|---------|
| Ticket created | Staff (admin notification) | "New issue NXS-XXXX: {title}" |
| Assigned | Assignee + Student | "Issue assigned to {name}" / "Your issue is being reviewed" |
| Delegated | New assignee | "{name} delegated issue to you" |
| Resolved | Student | "Your issue NXS-XXXX has been resolved. Please confirm." |
| Student confirms | Staff (assignee) | "Student confirmed NXS-XXXX is resolved" |
| Student reopens | Staff (assignee) | "Student reopened NXS-XXXX: {reason}" |
| Auto-closed | Student | "NXS-XXXX auto-closed after 3 days" |

## Files to Modify/Create

### Database
- `supabase/migrations/YYYYMMDD_foundation_issues_v2.sql` — New migration

### packages/database
- `src/queries/nexus/foundation.ts` — New query functions (confirmIssue, reopenIssue, cleanupScreenshots, getTicketsAwaitingAutoClose)
- `src/types/index.ts` — Updated types for new fields and statuses

### apps/nexus — API Routes
- `src/app/api/foundation/issues/route.ts` — Update POST for categories, screenshots, optional chapter_id
- `src/app/api/foundation/issues/[id]/route.ts` — Add confirm/reopen actions for students
- `src/app/api/foundation/issues/upload/route.ts` — NEW screenshot upload endpoint

### apps/nexus — Student Frontend
- `src/app/(student)/student/issues/page.tsx` — Create Ticket button, ticket numbers, categories, screenshots, confirmation UI, new tabs
- `src/components/issues/ReportIssueDialog.tsx` — NEW shared ticket creation form
- `src/components/issues/ScreenshotUploader.tsx` — NEW image picker with client-side compression
- TopBar component — Add "Report Issue" to overflow menu

### apps/nexus — Teacher Frontend
- `src/app/(teacher)/teacher/issues/page.tsx` — Ticket numbers, category badges, screenshot viewer, awaiting confirmation status

### Cron
- Auto-close endpoint or Edge Function for 3-day expiry

## Verification Plan

1. **Create ticket from TopBar menu** — verify page_url auto-captured, category selectable, screenshots uploadable
2. **Create standalone ticket from My Issues** — verify works without chapter context
3. **Create chapter-specific ticket** — verify existing ChapterFeedback still works
4. **Screenshot upload** — verify client-side compression, max 3 limit, preview/remove
5. **Ticket number** — verify NXS-0001 auto-generated and visible to both student and staff
6. **Staff resolve** — verify status goes to awaiting_confirmation, student gets notification
7. **Student confirm** — verify status goes to closed, screenshots deleted from storage
8. **Student reopen** — verify status goes to open, staff notified with reason
9. **Auto-close** — verify tickets auto-close after 3 days, screenshots cleaned up
10. **Mobile** — test at 375px viewport, touch targets 48px, bottom sheet form
