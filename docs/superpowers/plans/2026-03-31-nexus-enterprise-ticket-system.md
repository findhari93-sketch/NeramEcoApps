# Nexus Enterprise Ticket System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the existing foundation issues system into an enterprise-grade ticket system with ticket IDs, categories, screenshot uploads, contextual reporting from every page, and a student confirmation loop with 3-day auto-close.

**Architecture:** Enhance the existing `nexus_foundation_issues` table (which already has assignment, delegation, activity log, comments, notifications) with new columns for ticket numbers, categories, screenshots, and confirmation workflow. Add two new student entry points (TopBar menu item + My Issues create button) and update the teacher dashboard to show new fields.

**Tech Stack:** Next.js 14 App Router, Supabase (PostgreSQL + Storage), MUI v5, TypeScript, Canvas API for image compression

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `supabase/migrations/20260331_foundation_issues_v2.sql` | DB migration for new columns, trigger, statuses |
| `apps/nexus/src/components/issues/ReportIssueDialog.tsx` | Shared ticket creation form (bottom sheet mobile, dialog desktop) |
| `apps/nexus/src/components/issues/ScreenshotUploader.tsx` | Image picker with client-side compression |
| `apps/nexus/src/app/api/foundation/issues/upload/route.ts` | Screenshot upload endpoint |
| `apps/nexus/src/app/api/cron/auto-close-issues/route.ts` | Daily cron endpoint to auto-close expired tickets |

### Modified Files
| File | Changes |
|------|---------|
| `packages/database/src/types/index.ts` | Add new statuses, category type, update interfaces |
| `packages/database/src/queries/nexus/foundation.ts` | Add confirmIssue, reopenIssue, cleanupScreenshots, getExpiredAwaitingIssues; update createFoundationIssue |
| `apps/nexus/src/app/api/foundation/issues/route.ts` | Accept category, page_url, screenshot_urls, optional chapter_id |
| `apps/nexus/src/app/api/foundation/issues/[id]/route.ts` | Add confirm/reopen actions for students |
| `apps/nexus/src/app/(student)/student/issues/page.tsx` | Create Ticket button, ticket numbers, categories, screenshots, confirmation UI |
| `apps/nexus/src/components/TopBar.tsx` | Add "Report Issue" menu item |
| `apps/nexus/src/app/(teacher)/teacher/issues/page.tsx` | Ticket numbers, category badges, screenshot viewer, awaiting confirmation |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260331_foundation_issues_v2.sql`

- [ ] **Step 1: Create migration file**

```sql
-- ============================================
-- FOUNDATION ISSUES V2 — Enterprise Ticket System
-- Adds: ticket numbers, categories, screenshots,
-- confirmation workflow, standalone tickets
-- ============================================

-- 1. ADD NEW COLUMNS
ALTER TABLE nexus_foundation_issues
  ADD COLUMN IF NOT EXISTS ticket_number TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'other'
    CHECK (category IN ('bug', 'content_issue', 'ui_ux', 'feature_request', 'class_schedule', 'other')),
  ADD COLUMN IF NOT EXISTS screenshot_urls TEXT[],
  ADD COLUMN IF NOT EXISTS page_url TEXT,
  ADD COLUMN IF NOT EXISTS auto_close_at TIMESTAMPTZ;

-- 2. MAKE chapter_id NULLABLE (allow standalone tickets)
ALTER TABLE nexus_foundation_issues
  ALTER COLUMN chapter_id DROP NOT NULL;

-- 3. UPDATE STATUS CHECK CONSTRAINT
-- Drop old constraint and create new one with additional statuses
ALTER TABLE nexus_foundation_issues DROP CONSTRAINT IF EXISTS nexus_foundation_issues_status_check;
ALTER TABLE nexus_foundation_issues
  ADD CONSTRAINT nexus_foundation_issues_status_check
  CHECK (status IN ('open', 'in_progress', 'resolved', 'awaiting_confirmation', 'closed'));

-- 4. AUTO-INCREMENT TICKET NUMBER VIA SEQUENCE + TRIGGER
CREATE SEQUENCE IF NOT EXISTS nexus_issue_ticket_seq START WITH 1;

-- Set sequence to max existing count
DO $$
DECLARE
  max_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO max_count FROM nexus_foundation_issues;
  IF max_count > 0 THEN
    PERFORM setval('nexus_issue_ticket_seq', max_count);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION generate_nexus_ticket_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ticket_number IS NULL THEN
    NEW.ticket_number := 'NXS-' || LPAD(nextval('nexus_issue_ticket_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_nexus_ticket_number ON nexus_foundation_issues;
CREATE TRIGGER set_nexus_ticket_number
  BEFORE INSERT ON nexus_foundation_issues
  FOR EACH ROW
  EXECUTE FUNCTION generate_nexus_ticket_number();

-- 5. BACKFILL ticket_number for existing issues
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT id FROM nexus_foundation_issues
    WHERE ticket_number IS NULL
    ORDER BY created_at ASC
  LOOP
    UPDATE nexus_foundation_issues
    SET ticket_number = 'NXS-' || LPAD(nextval('nexus_issue_ticket_seq')::TEXT, 4, '0')
    WHERE id = rec.id;
  END LOOP;
END $$;

-- 6. ADD activity log actions for new workflow
ALTER TABLE nexus_foundation_issue_activity DROP CONSTRAINT IF EXISTS nexus_foundation_issue_activity_action_check;
ALTER TABLE nexus_foundation_issue_activity
  ADD CONSTRAINT nexus_foundation_issue_activity_action_check
  CHECK (action IN (
    'created', 'assigned', 'accepted', 'delegated', 'returned',
    'marked_in_progress', 'resolved', 'reopened', 'comment',
    'confirmed', 'auto_closed'
  ));

-- 7. NEW NOTIFICATION EVENT TYPES
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'foundation_issue_awaiting_confirmation';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'foundation_issue_reopened';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'foundation_issue_closed';

-- 8. INDEXES
CREATE INDEX IF NOT EXISTS idx_foundation_issues_ticket_number ON nexus_foundation_issues(ticket_number);
CREATE INDEX IF NOT EXISTS idx_foundation_issues_category ON nexus_foundation_issues(category);
CREATE INDEX IF NOT EXISTS idx_foundation_issues_auto_close ON nexus_foundation_issues(auto_close_at)
  WHERE status = 'awaiting_confirmation';
```

- [ ] **Step 2: Apply migration to staging**

Run via Supabase MCP tool: `mcp__supabase-staging__apply_migration` with the SQL above and name `foundation_issues_v2`.

- [ ] **Step 3: Apply migration to production**

Run via Supabase MCP tool: `mcp__supabase-prod__apply_migration` with the same SQL and name `foundation_issues_v2`.

- [ ] **Step 4: Create Supabase Storage bucket**

Run via `mcp__supabase-staging__execute_sql`:
```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'issue-screenshots',
  'issue-screenshots',
  true,
  524288,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- RLS: allow authenticated uploads to own folder
CREATE POLICY "Users can upload issue screenshots"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'issue-screenshots');

-- RLS: public read
CREATE POLICY "Public read issue screenshots"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'issue-screenshots');

-- RLS: service role can delete
CREATE POLICY "Service role delete issue screenshots"
ON storage.objects FOR DELETE
TO service_role
USING (bucket_id = 'issue-screenshots');
```

Repeat for production via `mcp__supabase-prod__execute_sql`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260331_foundation_issues_v2.sql
git commit -m "feat(db): add enterprise ticket columns, ticket numbers, and storage bucket for issues"
```

---

## Task 2: Update TypeScript Types

**Files:**
- Modify: `packages/database/src/types/index.ts:5115-5182`

- [ ] **Step 1: Update FoundationIssueStatus type**

In `packages/database/src/types/index.ts`, find:
```typescript
export type FoundationIssueStatus = 'open' | 'in_progress' | 'resolved';
```
Replace with:
```typescript
export type FoundationIssueStatus = 'open' | 'in_progress' | 'resolved' | 'awaiting_confirmation' | 'closed';
```

- [ ] **Step 2: Add FoundationIssueCategory type**

After the `FoundationIssuePriority` type, add:
```typescript
export type FoundationIssueCategory = 'bug' | 'content_issue' | 'ui_ux' | 'feature_request' | 'class_schedule' | 'other';
```

- [ ] **Step 3: Update FoundationIssueAction type**

Find:
```typescript
export type FoundationIssueAction =
  | 'created'
  | 'assigned'
  | 'accepted'
  | 'delegated'
  | 'returned'
  | 'marked_in_progress'
  | 'resolved'
  | 'reopened'
  | 'comment';
```
Replace with:
```typescript
export type FoundationIssueAction =
  | 'created'
  | 'assigned'
  | 'accepted'
  | 'delegated'
  | 'returned'
  | 'marked_in_progress'
  | 'resolved'
  | 'reopened'
  | 'comment'
  | 'confirmed'
  | 'auto_closed';
```

- [ ] **Step 4: Update NexusFoundationIssue interface**

Find:
```typescript
export interface NexusFoundationIssue {
  id: string;
  student_id: string;
  chapter_id: string;
  section_id: string | null;
  title: string;
  description: string;
  status: FoundationIssueStatus;
  priority: FoundationIssuePriority;
  assigned_to: string | null;
  assigned_by: string | null;
  assigned_at: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
}
```
Replace with:
```typescript
export interface NexusFoundationIssue {
  id: string;
  student_id: string;
  chapter_id: string | null;
  section_id: string | null;
  title: string;
  description: string;
  status: FoundationIssueStatus;
  priority: FoundationIssuePriority;
  assigned_to: string | null;
  assigned_by: string | null;
  assigned_at: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  ticket_number: string;
  category: FoundationIssueCategory;
  screenshot_urls: string[] | null;
  page_url: string | null;
  auto_close_at: string | null;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 5: Commit**

```bash
git add packages/database/src/types/index.ts
git commit -m "feat(types): add ticket number, category, screenshot, and confirmation fields to foundation issues"
```

---

## Task 3: Update Database Query Functions

**Files:**
- Modify: `packages/database/src/queries/nexus/foundation.ts:698-1013`

- [ ] **Step 1: Update createFoundationIssue to accept new fields**

In `packages/database/src/queries/nexus/foundation.ts`, find the `createFoundationIssue` function (line ~698) and replace it:

```typescript
export async function createFoundationIssue(
  data: {
    student_id: string;
    chapter_id?: string;
    section_id?: string;
    title: string;
    description: string;
    category?: FoundationIssueCategory;
    page_url?: string;
    screenshot_urls?: string[];
  },
  client?: TypedSupabaseClient
): Promise<NexusFoundationIssue> {
  const supabase = client || getSupabaseAdminClient();
  const { data: issue, error } = await supabase
    .from('nexus_foundation_issues')
    .insert({
      student_id: data.student_id,
      chapter_id: data.chapter_id || null,
      section_id: data.section_id || null,
      title: data.title,
      description: data.description,
      category: data.category || 'other',
      page_url: data.page_url || null,
      screenshot_urls: data.screenshot_urls || null,
    })
    .select()
    .single();
  if (error) throw error;

  // Log the creation activity
  await supabase.from('nexus_foundation_issue_activity').insert({
    issue_id: issue.id,
    actor_id: data.student_id,
    action: 'created',
    new_status: 'open',
  });

  return issue as unknown as NexusFoundationIssue;
}
```

- [ ] **Step 2: Update resolveFoundationIssue to set awaiting_confirmation**

Find `resolveFoundationIssue` (line ~882) and replace it:

```typescript
export async function resolveFoundationIssue(
  issueId: string,
  resolvedBy: string,
  resolutionNote: string,
  client?: TypedSupabaseClient
): Promise<NexusFoundationIssue> {
  const supabase = client || getSupabaseAdminClient();
  const autoCloseAt = new Date();
  autoCloseAt.setDate(autoCloseAt.getDate() + 3);

  const { data, error } = await supabase
    .from('nexus_foundation_issues')
    .update({
      status: 'awaiting_confirmation' as FoundationIssueStatus,
      resolved_by: resolvedBy,
      resolved_at: new Date().toISOString(),
      resolution_note: resolutionNote,
      auto_close_at: autoCloseAt.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', issueId)
    .select()
    .single();
  if (error) throw error;

  await supabase.from('nexus_foundation_issue_activity').insert({
    issue_id: issueId,
    actor_id: resolvedBy,
    action: 'resolved',
    old_status: 'in_progress',
    new_status: 'awaiting_confirmation',
    reason: resolutionNote,
  });

  return data as unknown as NexusFoundationIssue;
}
```

- [ ] **Step 3: Add confirmIssue function**

After `resolveFoundationIssue`, add:

```typescript
export async function confirmFoundationIssue(
  issueId: string,
  studentId: string,
  client?: TypedSupabaseClient
): Promise<NexusFoundationIssue> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_foundation_issues')
    .update({
      status: 'closed' as FoundationIssueStatus,
      auto_close_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', issueId)
    .select()
    .single();
  if (error) throw error;

  await supabase.from('nexus_foundation_issue_activity').insert({
    issue_id: issueId,
    actor_id: studentId,
    action: 'confirmed',
    old_status: 'awaiting_confirmation',
    new_status: 'closed',
  });

  return data as unknown as NexusFoundationIssue;
}
```

- [ ] **Step 4: Add reopenIssue function**

```typescript
export async function reopenFoundationIssue(
  issueId: string,
  studentId: string,
  reason: string,
  client?: TypedSupabaseClient
): Promise<NexusFoundationIssue> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_foundation_issues')
    .update({
      status: 'open' as FoundationIssueStatus,
      resolved_by: null,
      resolved_at: null,
      resolution_note: null,
      auto_close_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', issueId)
    .select()
    .single();
  if (error) throw error;

  await supabase.from('nexus_foundation_issue_activity').insert({
    issue_id: issueId,
    actor_id: studentId,
    action: 'reopened',
    old_status: 'awaiting_confirmation',
    new_status: 'open',
    reason,
  });

  return data as unknown as NexusFoundationIssue;
}
```

- [ ] **Step 5: Add cleanupIssueScreenshots function**

```typescript
export async function cleanupIssueScreenshots(
  issueId: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();

  // Get current screenshot URLs
  const { data: issue } = await supabase
    .from('nexus_foundation_issues')
    .select('screenshot_urls')
    .eq('id', issueId)
    .single();

  if (issue?.screenshot_urls && issue.screenshot_urls.length > 0) {
    // Delete files from storage
    const { error: storageError } = await supabase.storage
      .from('issue-screenshots')
      .remove(issue.screenshot_urls);
    if (storageError) console.error('Failed to delete screenshots:', storageError);

    // Clear URLs from record
    await supabase
      .from('nexus_foundation_issues')
      .update({ screenshot_urls: null, updated_at: new Date().toISOString() })
      .eq('id', issueId);
  }
}
```

- [ ] **Step 6: Add getExpiredAwaitingIssues function**

```typescript
export async function getExpiredAwaitingIssues(
  client?: TypedSupabaseClient
): Promise<NexusFoundationIssue[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_foundation_issues')
    .select('*')
    .eq('status', 'awaiting_confirmation')
    .lt('auto_close_at', new Date().toISOString());
  if (error) throw error;
  return (data || []) as unknown as NexusFoundationIssue[];
}
```

- [ ] **Step 7: Export new functions from the nexus queries index**

Check `packages/database/src/queries/nexus/index.ts` and ensure the new functions are exported. They should be auto-exported if using `export * from './foundation'`.

- [ ] **Step 8: Commit**

```bash
git add packages/database/src/queries/nexus/foundation.ts
git commit -m "feat(db): add confirm, reopen, cleanup, and auto-close query functions for ticket system"
```

---

## Task 4: Screenshot Upload API

**Files:**
- Create: `apps/nexus/src/app/api/foundation/issues/upload/route.ts`

- [ ] **Step 1: Create the upload endpoint**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

const MAX_FILE_SIZE = 500 * 1024; // 500KB (client should compress before upload)
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid file type. Use JPEG, PNG, or WebP.' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large. Max 500KB.' }, { status: 400 });
    }

    const timestamp = Date.now();
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const filePath = `${user.id}/${timestamp}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from('issue-screenshots')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
    }

    return NextResponse.json({ path: filePath }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/nexus/src/app/api/foundation/issues/upload/route.ts
git commit -m "feat(api): add screenshot upload endpoint for issue tickets"
```

---

## Task 5: Update Issues API Routes

**Files:**
- Modify: `apps/nexus/src/app/api/foundation/issues/route.ts`
- Modify: `apps/nexus/src/app/api/foundation/issues/[id]/route.ts`

- [ ] **Step 1: Update POST in route.ts to accept new fields**

In `apps/nexus/src/app/api/foundation/issues/route.ts`, replace the POST function:

```typescript
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const body = await request.json();
    const supabase = getSupabaseAdminClient();

    if (!body.title?.trim()) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }

    if (!body.category) {
      return NextResponse.json({ error: 'category is required' }, { status: 400 });
    }

    const { data: user } = await supabase
      .from('users')
      .select('id, name')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get chapter title for notification (if chapter_id provided)
    let chapter: { title: string; chapter_number: number } | null = null;
    if (body.chapter_id) {
      const { data: ch } = await supabase
        .from('nexus_foundation_chapters')
        .select('title, chapter_number')
        .eq('id', body.chapter_id)
        .single();
      chapter = ch;
    }

    const issue = await createFoundationIssue({
      student_id: user.id,
      chapter_id: body.chapter_id || undefined,
      section_id: body.section_id || undefined,
      title: body.title.trim(),
      description: (body.description || '').trim(),
      category: body.category,
      page_url: body.page_url || undefined,
      screenshot_urls: body.screenshot_urls || undefined,
    });

    // Notify teachers/admins about the new issue
    try {
      const chapterInfo = chapter
        ? ` on Ch ${chapter.chapter_number}: ${chapter.title}`
        : '';
      await createAdminNotification({
        event_type: 'foundation_issue_reported',
        title: `New Ticket ${issue.ticket_number}`,
        message: `${user.name} reported: "${body.title.trim()}"${chapterInfo}`,
        metadata: {
          issue_id: issue.id,
          ticket_number: issue.ticket_number,
          student_name: user.name,
          category: body.category,
          chapter_title: chapter?.title || null,
          chapter_number: chapter?.chapter_number || null,
        },
      });
    } catch (notifErr) {
      console.error('Failed to send issue reported notification:', notifErr);
    }

    return NextResponse.json({ issue }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create issue';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Add confirm and reopen actions to [id]/route.ts**

In `apps/nexus/src/app/api/foundation/issues/[id]/route.ts`, add these imports at the top:

```typescript
import {
  getFoundationIssueById,
  resolveFoundationIssue,
  updateFoundationIssueStatus,
  assignFoundationIssue,
  delegateFoundationIssue,
  returnFoundationIssue,
  updateFoundationIssuePriority,
  getIssueActivityLog,
  addIssueComment,
  confirmFoundationIssue,
  reopenFoundationIssue,
  cleanupIssueScreenshots,
} from '@neram/database/queries/nexus';
```

- [ ] **Step 3: Add student verification helper to [id]/route.ts**

After the `verifyTeacherOrAdmin` function, add:

```typescript
async function verifyStudent(request: NextRequest) {
  const msUser = await verifyMsToken(request.headers.get('Authorization'));
  const supabase = getSupabaseAdminClient();
  const { data: user } = await supabase
    .from('users')
    .select('id, user_type, name')
    .eq('ms_oid', msUser.oid)
    .single();

  if (!user) {
    throw new Error('User not found');
  }
  return user;
}
```

- [ ] **Step 4: Add confirm and reopen cases in PATCH switch**

Inside the PATCH function's switch statement (before the `// Backward-compatible: status change` default case), add these two cases:

```typescript
      case 'confirm': {
        // Student confirms the fix works — close the ticket
        const student = await verifyStudent(request);

        // Verify the student owns this issue
        const { data: ownIssue } = await supabase
          .from('nexus_foundation_issues')
          .select('student_id, status, ticket_number')
          .eq('id', issueId)
          .single();

        if (!ownIssue || ownIssue.student_id !== student.id) {
          return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
        }
        if (ownIssue.status !== 'awaiting_confirmation') {
          return NextResponse.json({ error: 'Issue is not awaiting confirmation' }, { status: 400 });
        }

        issue = await confirmFoundationIssue(issueId, student.id);

        // Cleanup screenshots from storage
        await cleanupIssueScreenshots(issueId).catch(console.error);

        // Notify the resolver
        if (issueData?.resolved_by) {
          await createUserNotification({
            user_id: issueData.resolved_by,
            event_type: 'foundation_issue_closed',
            title: 'Issue Confirmed Resolved',
            message: `Student confirmed ${ownIssue.ticket_number} is resolved.`,
            metadata: { issue_id: issueId, ticket_number: ownIssue.ticket_number },
          }).catch(console.error);
        }
        break;
      }

      case 'reopen': {
        // Student says fix didn't work — reopen
        const student = await verifyStudent(request);

        if (!body.reason?.trim()) {
          return NextResponse.json({ error: 'reason is required' }, { status: 400 });
        }

        const { data: ownIssue } = await supabase
          .from('nexus_foundation_issues')
          .select('student_id, status, ticket_number, assigned_to')
          .eq('id', issueId)
          .single();

        if (!ownIssue || ownIssue.student_id !== student.id) {
          return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
        }
        if (ownIssue.status !== 'awaiting_confirmation') {
          return NextResponse.json({ error: 'Issue is not awaiting confirmation' }, { status: 400 });
        }

        issue = await reopenFoundationIssue(issueId, student.id, body.reason.trim());

        // Notify the last assignee / resolver
        const notifyUserId = ownIssue.assigned_to || issueData?.resolved_by;
        if (notifyUserId) {
          await createUserNotification({
            user_id: notifyUserId,
            event_type: 'foundation_issue_reopened',
            title: 'Issue Reopened',
            message: `Student reopened ${ownIssue.ticket_number}: "${body.reason.trim()}"`,
            metadata: { issue_id: issueId, ticket_number: ownIssue.ticket_number, reason: body.reason.trim() },
          }).catch(console.error);
        }
        break;
      }
```

- [ ] **Step 5: Update the GET to allow students to access their own issue details**

Replace the GET function to also allow students (not just teachers/admins):

```typescript
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();
    const { id } = await params;

    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const [issue, activity] = await Promise.all([
      getFoundationIssueById(id),
      getIssueActivityLog(id),
    ]);

    // Students can only see their own issues
    if (user.user_type === 'student' && issue.student_id !== user.id) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    return NextResponse.json({ issue, activity });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load issue';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 6: Update the resolve notification to mention awaiting_confirmation**

In the existing `case 'resolve':` block, update the student notification:

```typescript
        // Notify the student
        if (issueData) {
          await createUserNotification({
            user_id: issueData.student_id,
            event_type: 'foundation_issue_awaiting_confirmation',
            title: 'Issue Resolved — Please Confirm',
            message: `Your issue "${issueData.title}" has been resolved: ${note}. Please confirm if the fix works.`,
            metadata: {
              issue_id: issueId,
              resolution_note: note,
              resolved_by: user.name,
            },
          }).catch(console.error);
        }
```

- [ ] **Step 7: Commit**

```bash
git add apps/nexus/src/app/api/foundation/issues/route.ts apps/nexus/src/app/api/foundation/issues/[id]/route.ts
git commit -m "feat(api): add confirm/reopen actions, categories, screenshots to issues API"
```

---

## Task 6: ScreenshotUploader Component

**Files:**
- Create: `apps/nexus/src/components/issues/ScreenshotUploader.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client';

import { useState, useRef } from 'react';
import {
  Box,
  IconButton,
  Typography,
  CircularProgress,
  alpha,
  useTheme,
} from '@neram/ui';
import AddPhotoAlternateOutlinedIcon from '@mui/icons-material/AddPhotoAlternateOutlined';
import CloseIcon from '@mui/icons-material/Close';

interface ScreenshotUploaderProps {
  screenshots: string[]; // array of storage paths
  onScreenshotsChange: (paths: string[]) => void;
  getToken: () => Promise<string | null>;
  maxCount?: number;
  disabled?: boolean;
}

async function compressImage(file: File, maxWidth = 1200, quality = 0.7): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('No canvas context'));
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Compression failed'));
        },
        'image/jpeg',
        quality
      );
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

export default function ScreenshotUploader({
  screenshots,
  onScreenshotsChange,
  getToken,
  maxCount = 3,
  disabled = false,
}: ScreenshotUploaderProps) {
  const theme = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Store preview URLs for display
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const remaining = maxCount - screenshots.length;
    if (remaining <= 0) return;

    const filesToUpload = Array.from(files).slice(0, remaining);
    setUploading(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');

      const newPaths: string[] = [];
      const newPreviews: Record<string, string> = {};

      for (const file of filesToUpload) {
        // Compress client-side
        const compressed = await compressImage(file);
        const formData = new FormData();
        formData.append('file', compressed, `screenshot.jpg`);

        const res = await fetch('/api/foundation/issues/upload', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Upload failed');
        }

        const { path } = await res.json();
        newPaths.push(path);
        // Generate local preview URL
        newPreviews[path] = URL.createObjectURL(compressed);
      }

      setPreviewUrls((prev) => ({ ...prev, ...newPreviews }));
      onScreenshotsChange([...screenshots, ...newPaths]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemove = (index: number) => {
    const path = screenshots[index];
    // Revoke preview URL
    if (previewUrls[path]) {
      URL.revokeObjectURL(previewUrls[path]);
      setPreviewUrls((prev) => {
        const next = { ...prev };
        delete next[path];
        return next;
      });
    }
    const updated = screenshots.filter((_, i) => i !== index);
    onScreenshotsChange(updated);
  };

  const getDisplayUrl = (path: string) => {
    if (previewUrls[path]) return previewUrls[path];
    // Construct Supabase storage URL for already-uploaded images
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    return `${supabaseUrl}/storage/v1/object/public/issue-screenshots/${path}`;
  };

  return (
    <Box>
      <Typography variant="caption" sx={{ color: 'text.secondary', mb: 0.5, display: 'block' }}>
        Screenshots ({screenshots.length}/{maxCount})
      </Typography>

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {screenshots.map((path, index) => (
          <Box
            key={path}
            sx={{
              position: 'relative',
              width: 80,
              height: 80,
              borderRadius: 1.5,
              overflow: 'hidden',
              border: `1px solid ${theme.palette.divider}`,
            }}
          >
            <Box
              component="img"
              src={getDisplayUrl(path)}
              alt={`Screenshot ${index + 1}`}
              sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            {!disabled && (
              <IconButton
                size="small"
                onClick={() => handleRemove(index)}
                sx={{
                  position: 'absolute',
                  top: 2,
                  right: 2,
                  bgcolor: alpha('#000', 0.6),
                  color: '#fff',
                  p: 0.25,
                  '&:hover': { bgcolor: alpha('#000', 0.8) },
                }}
              >
                <CloseIcon sx={{ fontSize: '0.85rem' }} />
              </IconButton>
            )}
          </Box>
        ))}

        {screenshots.length < maxCount && !disabled && (
          <Box
            component="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            sx={{
              width: 80,
              height: 80,
              borderRadius: 1.5,
              border: `2px dashed ${theme.palette.divider}`,
              bgcolor: alpha(theme.palette.action.hover, 0.04),
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: uploading ? 'wait' : 'pointer',
              transition: 'border-color 200ms, background 200ms',
              '&:hover': {
                borderColor: theme.palette.primary.main,
                bgcolor: alpha(theme.palette.primary.main, 0.04),
              },
            }}
          >
            {uploading ? (
              <CircularProgress size={20} />
            ) : (
              <>
                <AddPhotoAlternateOutlinedIcon sx={{ fontSize: '1.3rem', color: 'text.secondary' }} />
                <Typography variant="caption" sx={{ fontSize: '0.6rem', color: 'text.secondary', mt: 0.25 }}>
                  Add
                </Typography>
              </>
            )}
          </Box>
        )}
      </Box>

      {error && (
        <Typography variant="caption" color="error" sx={{ mt: 0.5, display: 'block' }}>
          {error}
        </Typography>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />
    </Box>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/nexus/src/components/issues/ScreenshotUploader.tsx
git commit -m "feat(ui): add ScreenshotUploader component with client-side compression"
```

---

## Task 7: ReportIssueDialog Component

**Files:**
- Create: `apps/nexus/src/components/issues/ReportIssueDialog.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  SwipeableDrawer,
  IconButton,
  useTheme,
  useMediaQuery,
  alpha,
  Snackbar,
  Alert,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import DesignServicesOutlinedIcon from '@mui/icons-material/DesignServicesOutlined';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import HelpOutlineOutlinedIcon from '@mui/icons-material/HelpOutlineOutlined';
import ScreenshotUploader from './ScreenshotUploader';
import type { FoundationIssueCategory } from '@neram/database/types';

const CATEGORIES: { value: FoundationIssueCategory; label: string; icon: React.ReactNode }[] = [
  { value: 'bug', label: 'Bug / Something Broken', icon: <BugReportOutlinedIcon fontSize="small" /> },
  { value: 'content_issue', label: 'Content Issue', icon: <MenuBookOutlinedIcon fontSize="small" /> },
  { value: 'ui_ux', label: 'UI/UX Problem', icon: <DesignServicesOutlinedIcon fontSize="small" /> },
  { value: 'feature_request', label: 'Feature Request', icon: <LightbulbOutlinedIcon fontSize="small" /> },
  { value: 'class_schedule', label: 'Class / Schedule Issue', icon: <EventOutlinedIcon fontSize="small" /> },
  { value: 'other', label: 'Other', icon: <HelpOutlineOutlinedIcon fontSize="small" /> },
];

interface ReportIssueDialogProps {
  open: boolean;
  onClose: () => void;
  getToken: () => Promise<string | null>;
  pageUrl?: string;
  defaultCategory?: FoundationIssueCategory;
  chapterId?: string;
  sectionId?: string;
  onSuccess?: () => void;
}

export default function ReportIssueDialog({
  open,
  onClose,
  getToken,
  pageUrl,
  defaultCategory,
  chapterId,
  sectionId,
  onSuccess,
}: ReportIssueDialogProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [category, setCategory] = useState<FoundationIssueCategory>(defaultCategory || 'bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const resetForm = () => {
    setCategory(defaultCategory || 'bug');
    setTitle('');
    setDescription('');
    setScreenshots([]);
  };

  const handleSubmit = async () => {
    if (!title.trim() || !category) return;
    setSubmitting(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');

      const res = await fetch('/api/foundation/issues', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          category,
          page_url: pageUrl || window.location.pathname,
          chapter_id: chapterId || undefined,
          section_id: sectionId || undefined,
          screenshot_urls: screenshots.length > 0 ? screenshots : undefined,
        }),
      });

      if (!res.ok) throw new Error('Failed to submit');

      const data = await res.json();
      resetForm();
      onClose();
      setSnackbar({
        open: true,
        message: `Ticket ${data.issue.ticket_number} created successfully.`,
        severity: 'success',
      });
      onSuccess?.();
    } catch {
      setSnackbar({ open: true, message: 'Failed to submit ticket. Please try again.', severity: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!submitting) {
      resetForm();
      onClose();
    }
  };

  const formContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <TextField
        select
        label="Category"
        value={category}
        onChange={(e) => setCategory(e.target.value as FoundationIssueCategory)}
        size="small"
        fullWidth
        required
      >
        {CATEGORIES.map((cat) => (
          <MenuItem key={cat.value} value={cat.value}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {cat.icon}
              {cat.label}
            </Box>
          </MenuItem>
        ))}
      </TextField>

      <TextField
        label="What's the issue?"
        placeholder="e.g. Video not playing, Wrong answer in quiz..."
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        size="small"
        fullWidth
        required
        inputProps={{ maxLength: 200 }}
      />

      <TextField
        label="Details (optional)"
        placeholder="Describe the issue in more detail..."
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        size="small"
        fullWidth
        multiline
        rows={3}
        inputProps={{ maxLength: 2000 }}
      />

      <ScreenshotUploader
        screenshots={screenshots}
        onScreenshotsChange={setScreenshots}
        getToken={getToken}
      />

      {pageUrl && (
        <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem' }}>
          Page: {pageUrl}
        </Typography>
      )}
    </Box>
  );

  // Mobile: bottom sheet. Desktop: centered dialog.
  if (isMobile) {
    return (
      <>
        <SwipeableDrawer
          anchor="bottom"
          open={open}
          onClose={handleClose}
          onOpen={() => {}}
          disableSwipeToOpen
          PaperProps={{
            sx: {
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              maxHeight: '90vh',
            },
          }}
        >
          {/* Drag handle */}
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
            <Box sx={{ width: 40, height: 4, borderRadius: 2, bgcolor: 'divider' }} />
          </Box>

          <Box sx={{ px: 2.5, pb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Report an Issue
              </Typography>
              <IconButton size="small" onClick={handleClose}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>

            {formContent}

            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 2, pb: 2 }}>
              <Button size="small" onClick={handleClose} sx={{ textTransform: 'none' }}>
                Cancel
              </Button>
              <Button
                size="small"
                variant="contained"
                onClick={handleSubmit}
                disabled={submitting || !title.trim()}
                endIcon={<SendIcon sx={{ fontSize: '1rem !important' }} />}
                sx={{ textTransform: 'none', minHeight: 40, minWidth: 120 }}
              >
                {submitting ? 'Submitting...' : 'Submit Ticket'}
              </Button>
            </Box>
          </Box>
        </SwipeableDrawer>

        <Snackbar
          open={snackbar.open}
          autoHideDuration={4000}
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
            {snackbar.message}
          </Alert>
        </Snackbar>
      </>
    );
  }

  return (
    <>
      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>
          Report an Issue
          <IconButton
            onClick={handleClose}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>{formContent}</DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleClose} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={submitting || !title.trim()}
            endIcon={<SendIcon sx={{ fontSize: '1rem !important' }} />}
            sx={{ textTransform: 'none', minHeight: 40 }}
          >
            {submitting ? 'Submitting...' : 'Submit Ticket'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/nexus/src/components/issues/ReportIssueDialog.tsx
git commit -m "feat(ui): add ReportIssueDialog with bottom sheet (mobile) and dialog (desktop)"
```

---

## Task 8: Add "Report Issue" to TopBar

**Files:**
- Modify: `apps/nexus/src/components/TopBar.tsx`

- [ ] **Step 1: Add import for ReportIssueDialog and the bug icon**

At the top of `TopBar.tsx`, add:

```typescript
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import ReportIssueDialog from '@/components/issues/ReportIssueDialog';
```

Also add `usePathname` import:
```typescript
import { useRouter, usePathname } from 'next/navigation';
```

- [ ] **Step 2: Add state for report issue dialog**

Inside the `TopBar` component, after the existing `useState` declarations (around line 61), add:

```typescript
  const pathname = usePathname();
  const [reportIssueOpen, setReportIssueOpen] = useState(false);
```

- [ ] **Step 3: Add "Report Issue" menu item to the profile dropdown**

In the profile dropdown `<Menu>`, after the "Guide" `<MenuItem>` (around line 515) and before the `<Divider>` that precedes the "Sign Out" item, add:

```typescript
          {/* Report Issue — students only */}
          {nexusRole === 'student' && (
            <MenuItem
              onClick={() => {
                setProfileAnchor(null);
                setReportIssueOpen(true);
              }}
              sx={{
                py: 1,
                px: 2.5,
                mx: 1,
                borderRadius: 2,
                gap: 1.5,
                minHeight: 42,
                '&:hover': {
                  bgcolor: alpha(theme.palette.warning.main, 0.06),
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 0, color: 'warning.main' }}>
                <BugReportOutlinedIcon sx={{ fontSize: '1.2rem' }} />
              </ListItemIcon>
              <ListItemText
                primary="Report Issue"
                primaryTypographyProps={{ variant: 'body2' }}
              />
            </MenuItem>
          )}
```

- [ ] **Step 4: Render ReportIssueDialog at the bottom of the component**

Before the final `</AppBar>` closing tag, add:

```typescript
        {/* Report Issue Dialog */}
        {nexusRole === 'student' && (
          <ReportIssueDialog
            open={reportIssueOpen}
            onClose={() => setReportIssueOpen(false)}
            getToken={getToken}
            pageUrl={pathname}
          />
        )}
```

Note: You'll need to destructure `getToken` from the auth context. Update the destructuring at the top:
```typescript
  const {
    user,
    nexusRole,
    activeClassroom,
    classrooms,
    setActiveClassroom,
    signOut,
    getToken,
  } = useNexusAuthContext();
```

- [ ] **Step 5: Commit**

```bash
git add apps/nexus/src/components/TopBar.tsx
git commit -m "feat(ui): add Report Issue menu item to TopBar for students"
```

---

## Task 9: Update Student My Issues Page

**Files:**
- Modify: `apps/nexus/src/app/(student)/student/issues/page.tsx`

- [ ] **Step 1: Rewrite the student issues page**

Replace the entire content of `apps/nexus/src/app/(student)/student/issues/page.tsx` with:

```typescript
'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Skeleton,
  alpha,
  useTheme,
  Tabs,
  Tab,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  Snackbar,
  Alert,
} from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import PhotoOutlinedIcon from '@mui/icons-material/PhotoOutlined';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import DesignServicesOutlinedIcon from '@mui/icons-material/DesignServicesOutlined';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import HelpOutlineOutlinedIcon from '@mui/icons-material/HelpOutlineOutlined';
import CloseIcon from '@mui/icons-material/Close';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import ReportIssueDialog from '@/components/issues/ReportIssueDialog';
import type { NexusFoundationIssueWithDetails, FoundationIssueCategory } from '@neram/database/types';

const CATEGORY_CONFIG: Record<FoundationIssueCategory, { label: string; icon: React.ReactNode; color: string }> = {
  bug: { label: 'Bug', icon: <BugReportOutlinedIcon sx={{ fontSize: '0.8rem' }} />, color: '#d32f2f' },
  content_issue: { label: 'Content', icon: <MenuBookOutlinedIcon sx={{ fontSize: '0.8rem' }} />, color: '#ed6c02' },
  ui_ux: { label: 'UI/UX', icon: <DesignServicesOutlinedIcon sx={{ fontSize: '0.8rem' }} />, color: '#1976d2' },
  feature_request: { label: 'Feature', icon: <LightbulbOutlinedIcon sx={{ fontSize: '0.8rem' }} />, color: '#7b1fa2' },
  class_schedule: { label: 'Class', icon: <EventOutlinedIcon sx={{ fontSize: '0.8rem' }} />, color: '#2e7d32' },
  other: { label: 'Other', icon: <HelpOutlineOutlinedIcon sx={{ fontSize: '0.8rem' }} />, color: '#757575' },
};

export default function StudentIssuesPage() {
  const theme = useTheme();
  const { getToken } = useNexusAuthContext();
  const [issues, setIssues] = useState<NexusFoundationIssueWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0); // 0=all, 1=open, 2=awaiting, 3=closed
  const [createOpen, setCreateOpen] = useState(false);

  // Reopen dialog state
  const [reopenIssueId, setReopenIssueId] = useState<string | null>(null);
  const [reopenReason, setReopenReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success',
  });

  // Screenshot preview
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  useEffect(() => {
    fetchIssues();
  }, []);

  async function fetchIssues() {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/foundation/issues', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setIssues(data.issues || []);
      }
    } catch (err) {
      console.error('Failed to load issues:', err);
    } finally {
      setLoading(false);
    }
  }

  const filteredIssues = issues.filter((issue) => {
    if (tab === 1) return issue.status === 'open' || issue.status === 'in_progress';
    if (tab === 2) return issue.status === 'awaiting_confirmation';
    if (tab === 3) return issue.status === 'resolved' || issue.status === 'closed';
    return true;
  });

  const openCount = issues.filter((i) => i.status === 'open' || i.status === 'in_progress').length;
  const awaitingCount = issues.filter((i) => i.status === 'awaiting_confirmation').length;
  const closedCount = issues.filter((i) => i.status === 'resolved' || i.status === 'closed').length;

  const statusColor = (status: string) => {
    if (status === 'open') return 'warning';
    if (status === 'in_progress') return 'info';
    if (status === 'awaiting_confirmation') return 'success';
    if (status === 'closed') return 'default';
    if (status === 'resolved') return 'success';
    return 'default';
  };

  const statusLabel = (status: string) => {
    const labels: Record<string, string> = {
      open: 'Open',
      in_progress: 'In Progress',
      resolved: 'Resolved',
      awaiting_confirmation: 'Awaiting Confirmation',
      closed: 'Closed',
    };
    return labels[status] || status;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const getDaysUntilAutoClose = (autoCloseAt: string | null) => {
    if (!autoCloseAt) return null;
    const diff = new Date(autoCloseAt).getTime() - Date.now();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return Math.max(0, days);
  };

  const handleConfirm = async (issueId: string) => {
    setActionLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/foundation/issues/${issueId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm' }),
      });
      if (res.ok) {
        setSnackbar({ open: true, message: 'Ticket closed. Thank you for confirming!', severity: 'success' });
        fetchIssues();
      } else {
        throw new Error('Failed');
      }
    } catch {
      setSnackbar({ open: true, message: 'Failed to confirm. Please try again.', severity: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReopen = async () => {
    if (!reopenIssueId || !reopenReason.trim()) return;
    setActionLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/foundation/issues/${reopenIssueId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reopen', reason: reopenReason.trim() }),
      });
      if (res.ok) {
        setSnackbar({ open: true, message: 'Ticket reopened. Staff will review again.', severity: 'success' });
        setReopenIssueId(null);
        setReopenReason('');
        fetchIssues();
      } else {
        throw new Error('Failed');
      }
    } catch {
      setSnackbar({ open: true, message: 'Failed to reopen. Please try again.', severity: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const getScreenshotUrl = (path: string) => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    return `${supabaseUrl}/storage/v1/object/public/issue-screenshots/${path}`;
  };

  return (
    <Box>
      {/* Header with Create button */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 0.5 }}>
        <Box>
          <Typography variant="h6" component="h1" sx={{ fontWeight: 700, mb: 0.5 }}>
            My Issues
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>
            Track and manage your reported issues
          </Typography>
        </Box>
        <Button
          variant="contained"
          size="small"
          startIcon={<AddIcon />}
          onClick={() => setCreateOpen(true)}
          sx={{ textTransform: 'none', minHeight: 36, mt: 0.5 }}
        >
          Create Ticket
        </Button>
      </Box>

      {/* Tabs */}
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{
          mb: 2, mt: 1.5,
          minHeight: 36,
          '& .MuiTab-root': { minHeight: 36, textTransform: 'none', fontSize: '0.85rem', py: 0.5 },
        }}
      >
        <Tab label={`All (${issues.length})`} />
        <Tab label={`Open (${openCount})`} />
        <Tab label={`Awaiting (${awaitingCount})`} />
        <Tab label={`Closed (${closedCount})`} />
      </Tabs>

      {/* Issue List */}
      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rectangular" height={120} sx={{ borderRadius: 2 }} />
          ))}
        </Box>
      ) : filteredIssues.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
          <ReportProblemOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            {tab === 0
              ? 'No issues reported yet. Use "Create Ticket" to report your first issue.'
              : 'No issues in this category.'}
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {filteredIssues.map((issue) => {
            const catConfig = CATEGORY_CONFIG[issue.category as FoundationIssueCategory] || CATEGORY_CONFIG.other;
            const daysLeft = getDaysUntilAutoClose(issue.auto_close_at);

            return (
              <Paper
                key={issue.id}
                variant="outlined"
                sx={{
                  p: 2,
                  borderRadius: 2,
                  borderLeftWidth: 3,
                  borderLeftColor: catConfig.color,
                }}
              >
                {/* Ticket number + Status */}
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 0.75 }}>
                  <Box sx={{ flex: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.25 }}>
                      <Typography variant="caption" sx={{ color: 'text.disabled', fontWeight: 600, fontSize: '0.7rem' }}>
                        {issue.ticket_number}
                      </Typography>
                      <Chip
                        icon={catConfig.icon as React.ReactElement}
                        label={catConfig.label}
                        size="small"
                        sx={{
                          height: 20,
                          fontSize: '0.65rem',
                          bgcolor: alpha(catConfig.color, 0.08),
                          color: catConfig.color,
                          '& .MuiChip-icon': { fontSize: '0.7rem', color: catConfig.color },
                          '& .MuiChip-label': { px: 0.5 },
                        }}
                      />
                    </Box>
                    <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
                      {issue.title}
                    </Typography>
                  </Box>
                  <Chip
                    label={statusLabel(issue.status)}
                    size="small"
                    color={statusColor(issue.status) as any}
                    sx={{ fontSize: '0.7rem', height: 22 }}
                  />
                </Box>

                {/* Chapter info (if present) */}
                {issue.chapter_title && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                    <MenuBookOutlinedIcon sx={{ fontSize: '0.85rem', color: 'text.secondary' }} />
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      Ch {issue.chapter_number}: {issue.chapter_title}
                      {issue.section_title && ` · ${issue.section_title}`}
                    </Typography>
                  </Box>
                )}

                {/* Description */}
                {issue.description && (
                  <Typography
                    variant="caption"
                    sx={{ color: 'text.secondary', display: 'block', mb: 0.75, lineHeight: 1.4 }}
                  >
                    {issue.description}
                  </Typography>
                )}

                {/* Screenshot thumbnails */}
                {issue.screenshot_urls && issue.screenshot_urls.length > 0 && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.75 }}>
                    <PhotoOutlinedIcon sx={{ fontSize: '0.85rem', color: 'text.secondary' }} />
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      {issue.screenshot_urls.map((url, idx) => (
                        <Box
                          key={idx}
                          component="img"
                          src={getScreenshotUrl(url)}
                          alt={`Screenshot ${idx + 1}`}
                          onClick={() => setPreviewImage(getScreenshotUrl(url))}
                          sx={{
                            width: 40,
                            height: 40,
                            borderRadius: 1,
                            objectFit: 'cover',
                            border: `1px solid ${theme.palette.divider}`,
                            cursor: 'pointer',
                            '&:hover': { opacity: 0.8 },
                          }}
                        />
                      ))}
                    </Box>
                  </Box>
                )}

                {/* Date */}
                <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem' }}>
                  Reported {formatDate(issue.created_at)}
                </Typography>

                {/* Resolution note */}
                {(issue.status === 'awaiting_confirmation' || issue.status === 'resolved' || issue.status === 'closed') && issue.resolution_note && (
                  <Box
                    sx={{
                      mt: 1,
                      p: 1.5,
                      borderRadius: 1.5,
                      bgcolor: alpha(theme.palette.success.main, 0.06),
                      border: `1px solid ${alpha(theme.palette.success.main, 0.15)}`,
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
                      <CheckCircleOutlineIcon sx={{ fontSize: '0.85rem', color: theme.palette.success.main }} />
                      <Typography variant="caption" sx={{ fontWeight: 600, color: theme.palette.success.main }}>
                        Resolved{issue.resolved_by_name ? ` by ${issue.resolved_by_name}` : ''}
                      </Typography>
                    </Box>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {issue.resolution_note}
                    </Typography>
                  </Box>
                )}

                {/* Awaiting Confirmation Banner */}
                {issue.status === 'awaiting_confirmation' && (
                  <Box
                    sx={{
                      mt: 1,
                      p: 1.5,
                      borderRadius: 1.5,
                      bgcolor: alpha(theme.palette.info.main, 0.06),
                      border: `1px solid ${alpha(theme.palette.info.main, 0.15)}`,
                    }}
                  >
                    <Typography variant="caption" sx={{ fontWeight: 600, color: theme.palette.info.main, display: 'block', mb: 1 }}>
                      Is this issue resolved?
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Button
                        size="small"
                        variant="contained"
                        color="success"
                        onClick={() => handleConfirm(issue.id)}
                        disabled={actionLoading}
                        sx={{ textTransform: 'none', minHeight: 32, fontSize: '0.8rem' }}
                      >
                        Yes, close it
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        color="warning"
                        onClick={() => setReopenIssueId(issue.id)}
                        disabled={actionLoading}
                        sx={{ textTransform: 'none', minHeight: 32, fontSize: '0.8rem' }}
                      >
                        Reopen
                      </Button>
                      {daysLeft !== null && (
                        <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem' }}>
                          Auto-closes in {daysLeft} day{daysLeft !== 1 ? 's' : ''}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                )}

                {/* In progress indicator */}
                {issue.status === 'in_progress' && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.75 }}>
                    <HourglassEmptyIcon sx={{ fontSize: '0.8rem', color: theme.palette.info.main }} />
                    <Typography variant="caption" sx={{ color: theme.palette.info.main }}>
                      Being reviewed by your teacher
                    </Typography>
                  </Box>
                )}
              </Paper>
            );
          })}
        </Box>
      )}

      {/* Create Ticket Dialog */}
      <ReportIssueDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        getToken={getToken}
        pageUrl="/student/issues"
        onSuccess={fetchIssues}
      />

      {/* Reopen Dialog */}
      <Dialog open={!!reopenIssueId} onClose={() => setReopenIssueId(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>
          Reopen Issue
          <IconButton onClick={() => setReopenIssueId(null)} sx={{ position: 'absolute', right: 8, top: 8 }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
            Please describe why the issue is not resolved:
          </Typography>
          <TextField
            label="Reason"
            placeholder="e.g. The video still doesn't play after the fix..."
            value={reopenReason}
            onChange={(e) => setReopenReason(e.target.value)}
            size="small"
            fullWidth
            multiline
            rows={3}
            required
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setReopenIssueId(null)} sx={{ textTransform: 'none' }}>Cancel</Button>
          <Button
            variant="contained"
            color="warning"
            onClick={handleReopen}
            disabled={actionLoading || !reopenReason.trim()}
            sx={{ textTransform: 'none' }}
          >
            {actionLoading ? 'Reopening...' : 'Reopen Ticket'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Screenshot Preview */}
      <Dialog open={!!previewImage} onClose={() => setPreviewImage(null)} maxWidth="md">
        <DialogContent sx={{ p: 0 }}>
          {previewImage && (
            <Box
              component="img"
              src={previewImage}
              alt="Screenshot preview"
              sx={{ width: '100%', display: 'block' }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/nexus/src/app/(student)/student/issues/page.tsx
git commit -m "feat(ui): upgrade My Issues page with ticket numbers, categories, screenshots, and confirmation loop"
```

---

## Task 10: Update Teacher Issues Dashboard

**Files:**
- Modify: `apps/nexus/src/app/(teacher)/teacher/issues/page.tsx`

- [ ] **Step 1: Add ticket number display**

In the teacher issues page, find where each issue's title is rendered in the issue list cards. Add the ticket number before the title:

```typescript
<Typography variant="caption" sx={{ color: 'text.disabled', fontWeight: 600, fontSize: '0.7rem' }}>
  {issue.ticket_number}
</Typography>
```

- [ ] **Step 2: Add category badge**

Import the category config (same as student page) and add a category chip next to the ticket number:

```typescript
const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
  bug: { label: 'Bug', color: '#d32f2f' },
  content_issue: { label: 'Content', color: '#ed6c02' },
  ui_ux: { label: 'UI/UX', color: '#1976d2' },
  feature_request: { label: 'Feature', color: '#7b1fa2' },
  class_schedule: { label: 'Class', color: '#2e7d32' },
  other: { label: 'Other', color: '#757575' },
};
```

Add the chip in the issue card header:
```typescript
{issue.category && (
  <Chip
    label={CATEGORY_CONFIG[issue.category]?.label || issue.category}
    size="small"
    sx={{
      height: 18,
      fontSize: '0.6rem',
      bgcolor: alpha(CATEGORY_CONFIG[issue.category]?.color || '#757575', 0.08),
      color: CATEGORY_CONFIG[issue.category]?.color || '#757575',
    }}
  />
)}
```

- [ ] **Step 3: Add screenshot thumbnails in issue detail drawer**

In the issue detail drawer/panel, after the description section, add:

```typescript
{selectedIssue?.screenshot_urls && selectedIssue.screenshot_urls.length > 0 && (
  <Box sx={{ mt: 2 }}>
    <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', display: 'block', mb: 0.5 }}>
      Screenshots
    </Typography>
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
      {selectedIssue.screenshot_urls.map((path, idx) => (
        <Box
          key={idx}
          component="img"
          src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/issue-screenshots/${path}`}
          alt={`Screenshot ${idx + 1}`}
          onClick={() => window.open(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/issue-screenshots/${path}`, '_blank')}
          sx={{
            width: 100,
            height: 100,
            borderRadius: 1.5,
            objectFit: 'cover',
            border: `1px solid ${theme.palette.divider}`,
            cursor: 'pointer',
            '&:hover': { opacity: 0.8 },
          }}
        />
      ))}
    </Box>
  </Box>
)}
```

- [ ] **Step 4: Add awaiting_confirmation and closed to tab filters**

Update the tab filter logic to include new statuses. The existing tabs should be updated to include awaiting_confirmation as a visible status with auto-close countdown.

- [ ] **Step 5: Add page_url display**

In the issue detail drawer, show the page context:
```typescript
{selectedIssue?.page_url && (
  <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mt: 1 }}>
    Reported from: {selectedIssue.page_url}
  </Typography>
)}
```

- [ ] **Step 6: Commit**

```bash
git add apps/nexus/src/app/(teacher)/teacher/issues/page.tsx
git commit -m "feat(ui): add ticket numbers, categories, screenshots, and confirmation status to teacher dashboard"
```

---

## Task 11: Auto-Close Cron Endpoint

**Files:**
- Create: `apps/nexus/src/app/api/cron/auto-close-issues/route.ts`

- [ ] **Step 1: Create the cron endpoint**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import {
  getExpiredAwaitingIssues,
  cleanupIssueScreenshots,
} from '@neram/database/queries/nexus';
import { createUserNotification } from '@neram/database/queries';

export async function GET(request: NextRequest) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get('Authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = getSupabaseAdminClient();
    const expiredIssues = await getExpiredAwaitingIssues();

    let closed = 0;

    for (const issue of expiredIssues) {
      // Update status to closed
      await supabase
        .from('nexus_foundation_issues')
        .update({
          status: 'closed',
          auto_close_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', issue.id);

      // Log activity
      await supabase.from('nexus_foundation_issue_activity').insert({
        issue_id: issue.id,
        actor_id: issue.student_id, // system action attributed to student
        action: 'auto_closed',
        old_status: 'awaiting_confirmation',
        new_status: 'closed',
        reason: 'Auto-closed after 3 days with no response',
      });

      // Cleanup screenshots
      await cleanupIssueScreenshots(issue.id).catch(console.error);

      // Notify student
      await createUserNotification({
        user_id: issue.student_id,
        event_type: 'foundation_issue_closed',
        title: 'Issue Auto-Closed',
        message: `Your issue ${issue.ticket_number} was auto-closed after 3 days. Reopen it from My Issues if needed.`,
        metadata: { issue_id: issue.id, ticket_number: issue.ticket_number },
      }).catch(console.error);

      closed++;
    }

    return NextResponse.json({
      success: true,
      closed,
      message: `Auto-closed ${closed} expired tickets`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Cron failed';
    console.error('Auto-close cron error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Add CRON_SECRET to environment**

Add `CRON_SECRET` to the Nexus app's Vercel environment:
```bash
cd apps/nexus && echo "your-secure-random-string" | vercel env add CRON_SECRET production
cd apps/nexus && echo "your-secure-random-string" | vercel env add CRON_SECRET preview
```

Also add to `.env.local`:
```
CRON_SECRET=local-dev-secret
```

- [ ] **Step 3: Configure Vercel cron (vercel.json)**

Add cron configuration in `apps/nexus/vercel.json` (create if doesn't exist):
```json
{
  "crons": [
    {
      "path": "/api/cron/auto-close-issues",
      "schedule": "0 6 * * *"
    }
  ]
}
```

This runs daily at 6 AM UTC.

- [ ] **Step 4: Commit**

```bash
git add apps/nexus/src/app/api/cron/auto-close-issues/route.ts apps/nexus/vercel.json
git commit -m "feat(cron): add daily auto-close for expired awaiting_confirmation tickets"
```

---

## Task 12: Update ChapterFeedback to Pass Category

**Files:**
- Modify: `apps/nexus/src/components/foundation/ChapterFeedback.tsx`

- [ ] **Step 1: Update the issue submission in ChapterFeedback**

In `ChapterFeedback.tsx`, find the `handleSubmitIssue` function and update the request body to include `category`:

```typescript
        body: JSON.stringify({
          [issueItemKey]: chapterId,
          section_id: issueSectionId || undefined,
          title: issueTitle.trim(),
          description: issueDescription.trim(),
          category: 'content_issue',
          page_url: window.location.pathname,
        }),
```

- [ ] **Step 2: Commit**

```bash
git add apps/nexus/src/components/foundation/ChapterFeedback.tsx
git commit -m "feat: add category and page_url to ChapterFeedback issue submissions"
```

---

## Task 13: Verify End-to-End

- [ ] **Step 1: Run type-check**

```bash
pnpm type-check
```

Expected: No TypeScript errors.

- [ ] **Step 2: Run lint**

```bash
pnpm lint
```

Expected: No lint errors on changed files.

- [ ] **Step 3: Start dev server and test manually**

```bash
pnpm dev:nexus
```

Test checklist:
1. Log in as a student
2. Open TopBar menu → see "Report Issue" option
3. Click "Report Issue" → form opens as bottom sheet (mobile) or dialog (desktop)
4. Select category, enter title, add 1-2 screenshots, submit
5. Go to `/student/issues` → see the new ticket with NXS-#### number
6. Click "Create Ticket" button → create a standalone ticket
7. Log in as teacher → go to Issues → see ticket numbers, categories, screenshot thumbnails
8. Assign and resolve a ticket
9. Log back in as student → see "Is this resolved?" confirmation banner
10. Click "Yes, close it" → ticket closes, screenshots cleaned up
11. Create another ticket, resolve it, then click "Reopen" with a reason → ticket reopens

- [ ] **Step 4: Test mobile viewport**

Open Chrome DevTools → toggle device toolbar → set to iPhone SE (375px):
- Report Issue form renders as bottom sheet
- Touch targets are 48px minimum
- No horizontal scroll
- Screenshots are tappable
- Confirmation buttons are easy to tap

- [ ] **Step 5: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address issues found during verification"
```
