# Drawing Reviews Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Gemini API failures, make the review workspace mobile-accessible, add delete and re-review editing for teachers, then redesign the workspace with a two-prompt ChatGPT-based annotation system and level-based reference images.

**Architecture:** Phase 1 fixes bugs and adds CRUD capabilities with minimal UI change. Phase 2 redesigns AIFeedbackWorkspace to surface two ChatGPT prompts (correction overlay + level-based reference), keeps the existing manual canvas tool, and adds an AI Draft button for written feedback.

**Tech Stack:** Next.js 14 App Router, MUI v5, Supabase (Postgres + Storage), Google Gemini API, TypeScript

---

## File Map

| File | Change |
|------|--------|
| `apps/nexus/.env.local` | Update GEMINI_API_KEY |
| `apps/nexus/src/lib/drawing-ai.ts` | Better error handling; add annotation prompt + 3-level reference prompts to AI output |
| `apps/nexus/src/app/api/drawing/ai-feedback/route.ts` | Better per-error-type responses |
| `apps/nexus/src/app/api/drawing/submissions/[id]/route.ts` | Add DELETE handler |
| `apps/nexus/src/app/api/drawing/submissions/[id]/review/route.ts` | Insert re-review notification |
| `apps/nexus/src/app/(teacher)/teacher/drawing-reviews/page.tsx` | Delete icon + confirmation on list cards |
| `apps/nexus/src/app/(teacher)/teacher/drawing-reviews/[id]/page.tsx` | More-actions menu (delete + edit mode), mobile layout improvements |
| `apps/nexus/src/components/drawings/AIFeedbackWorkspace.tsx` | Mobile compact mode, Open ChatGPT button (Phase 1); full section redesign (Phase 2) |
| `apps/nexus/src/components/drawings/ImageToggleTabs.tsx` | Show annotation overlay image in Overlay tab |
| `packages/database/supabase/migrations/20260409_drawing_notifications.sql` | New table + two new columns |
| `packages/database/src/types/index.ts` | Types for new DB fields and notifications |
| `apps/app/src/` | Student notification badge on drawing submissions |

---

## PHASE 1: Bug Fixes + Quick Wins

---

### Task 1: Fix Gemini API Key and Error Handling

**Files:**
- Modify: `apps/nexus/.env.local:20`
- Modify: `apps/nexus/src/lib/drawing-ai.ts:76-91`
- Modify: `apps/nexus/src/app/api/drawing/ai-feedback/route.ts:44-50`

- [ ] **Step 1: Update the API key in .env.local**

Open `apps/nexus/.env.local`. Find line 20:
```
GEMINI_API_KEY=<YOUR_NEW_GEMINI_API_KEY>
```
Replace with your new key from Google AI Studio:
```
GEMINI_API_KEY=<YOUR_NEW_GEMINI_API_KEY>
```

- [ ] **Step 2: Improve callGemini error handling in drawing-ai.ts**

In `apps/nexus/src/lib/drawing-ai.ts`, replace lines 76-91 (the error handling block after `if (res.ok)` check) with:

```typescript
    const errBody = await res.json().catch(() => ({}));

    if (res.status === 400 || res.status === 403) {
      console.error(`Gemini API auth error (${res.status}):`, JSON.stringify(errBody));
      throw new Error(`Gemini API key invalid or unauthorized (${res.status}). Check GEMINI_API_KEY env var.`);
    }

    if (res.status === 429) {
      if (attempt < retries) {
        console.warn(`Gemini ${model} rate limited (429), retrying with flash-lite...`);
        continue;
      }
      throw new Error('Gemini API 429: rate limit reached');
    }

    console.error(`Gemini API error (${res.status}):`, JSON.stringify(errBody));
    throw new Error(`Gemini API error: ${res.status}`);
```

- [ ] **Step 3: Add per-error-type responses in the API route**

In `apps/nexus/src/app/api/drawing/ai-feedback/route.ts`, replace lines 44-52 with:

```typescript
    if (message.includes('429')) {
      return NextResponse.json(
        { error: 'Gemini rate limit reached. Wait 1 minute and try again.' },
        { status: 429 }
      );
    }
    if (message.includes('invalid or unauthorized')) {
      return NextResponse.json(
        { error: 'AI configuration error. Contact admin.' },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
```

- [ ] **Step 4: Test locally**

Start nexus: `pnpm dev:nexus`

Open a drawing submission at `http://localhost:3012/teacher/drawing-reviews/[any-id]` and click "Re-generate AI Draft". The request should succeed and populate annotations + prompt. Check the browser Network tab for a 200 response from `/api/drawing/ai-feedback`.

- [ ] **Step 5: Update Vercel production env var**

```bash
cd apps/nexus
echo "<YOUR_NEW_GEMINI_API_KEY>" | vercel env add GEMINI_API_KEY production
echo "<YOUR_NEW_GEMINI_API_KEY>" | vercel env add GEMINI_API_KEY preview
```

- [ ] **Step 6: Commit**

```bash
git add apps/nexus/.env.local apps/nexus/src/lib/drawing-ai.ts apps/nexus/src/app/api/drawing/ai-feedback/route.ts
git commit -m "fix(nexus): update Gemini API key and improve error handling for invalid key vs rate limit"
```

---

### Task 2: Fix Mobile Workspace (Compact + Collapsed + Scrollable)

**Files:**
- Modify: `apps/nexus/src/components/drawings/AIFeedbackWorkspace.tsx:33-42` (props interface + initial state)
- Modify: `apps/nexus/src/app/(teacher)/teacher/drawing-reviews/[id]/page.tsx:175-179` (pass defaultCollapsed)

- [ ] **Step 1: Add defaultCollapsed prop to AIFeedbackWorkspace**

In `AIFeedbackWorkspace.tsx`, update the props interface (around line 33-42):

```typescript
interface AIFeedbackWorkspaceProps {
  submission: DrawingSubmission & {
    ai_overlay_annotations?: OverlayAnnotation[] | null;
    ai_corrected_image_prompt?: string | null;
    corrected_image_url?: string | null;
    ai_draft_status?: 'pending' | 'generating' | 'ready' | 'failed';
  };
  getToken: () => Promise<string | null>;
  onChange: (data: WorkspaceData) => void;
  defaultCollapsed?: boolean;
}
```

Update the function signature:
```typescript
export default function AIFeedbackWorkspace({
  submission, getToken, onChange, defaultCollapsed = false,
}: AIFeedbackWorkspaceProps) {
```

- [ ] **Step 2: Use defaultCollapsed for initial section state**

Find the three `useState` lines for section expansion (around line 75-77):
```typescript
  const [overlayExpanded, setOverlayExpanded] = useState(true);
  const [correctedExpanded, setCorrectedExpanded] = useState(true);
  const [feedbackExpanded, setFeedbackExpanded] = useState(true);
```
Replace with:
```typescript
  const [overlayExpanded, setOverlayExpanded] = useState(!defaultCollapsed);
  const [correctedExpanded, setCorrectedExpanded] = useState(!defaultCollapsed);
  const [feedbackExpanded, setFeedbackExpanded] = useState(!defaultCollapsed);
```

- [ ] **Step 3: Make section header padding compact on mobile**

Add `useTheme` and `useMediaQuery` imports. At the top of the component body (after the existing state declarations), add:
```typescript
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
```

Make sure `useTheme` and `useMediaQuery` are imported from `@neram/ui`.

Then for each section header `Box` (the clickable header with `px: 2, py: 1.25`), change to:
```typescript
sx={{ px: isMobile ? 1.5 : 2, py: isMobile ? 1 : 1.25, display: 'flex', alignItems: 'center', cursor: 'pointer', bgcolor: 'grey.50' }}
```

Apply this to all three section headers (Section 1, 2, and 3).

- [ ] **Step 4: Pass defaultCollapsed from the detail page**

In `apps/nexus/src/app/(teacher)/teacher/drawing-reviews/[id]/page.tsx`, find the `<AIFeedbackWorkspace>` usage (around line 175-179) and add the prop:

```typescript
        <AIFeedbackWorkspace
          submission={sub}
          getToken={getToken}
          onChange={handleWorkspaceChange}
          defaultCollapsed={isMobile}
        />
```

- [ ] **Step 5: Verify mobile drawer scrolls**

The `reviewPanel` Box already has `flex: 1, overflow: 'auto'` on the inner container (line 166). With sections collapsed by default, the workspace now fits within 88vh. Verify by opening Chrome DevTools, switching to 375px width, opening a drawing review, tapping "Give Feedback", and confirming the drawer opens with all 3 sections collapsed and visible. Tapping any section header should expand it and the drawer content should scroll.

- [ ] **Step 6: Commit**

```bash
git add apps/nexus/src/components/drawings/AIFeedbackWorkspace.tsx apps/nexus/src/app/(teacher)/teacher/drawing-reviews/[id]/page.tsx
git commit -m "fix(nexus): collapse workspace sections on mobile and make drawer scrollable"
```

---

### Task 3: Add "View Student Image" and "Open ChatGPT" Buttons

**Files:**
- Modify: `apps/nexus/src/components/drawings/AIFeedbackWorkspace.tsx:409-430`

- [ ] **Step 1: Add the two buttons in the prompt display area (Section 2)**

In `AIFeedbackWorkspace.tsx`, find the button row in the `aiPrompt` block (around lines 409-430). It currently shows "Copy Prompt" and "Re-generate". Add two more buttons after them:

```typescript
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Button
                    size="small"
                    variant={promptCopied ? 'contained' : 'outlined'}
                    startIcon={promptCopied ? <CheckCircleOutlineIcon /> : <ContentCopyIcon />}
                    onClick={handleCopyPrompt}
                    color={promptCopied ? 'success' : 'primary'}
                    sx={{ textTransform: 'none', minHeight: 36 }}
                  >
                    {promptCopied ? 'Copied!' : 'Copy Prompt'}
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<OpenInNewIcon />}
                    onClick={() => window.open(submission.original_image_url, '_blank')}
                    sx={{ textTransform: 'none', minHeight: 36 }}
                  >
                    View Student Image
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    color="secondary"
                    startIcon={<OpenInNewIcon />}
                    onClick={() => window.open('https://chat.openai.com', '_blank')}
                    sx={{ textTransform: 'none', minHeight: 36 }}
                  >
                    Open ChatGPT
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={regenerating ? <CircularProgress size={14} /> : <RefreshIcon />}
                    onClick={handleRegenerate}
                    disabled={regenerating}
                    sx={{ textTransform: 'none', minHeight: 36 }}
                  >
                    {regenerating ? 'Re-generating...' : 'Re-generate'}
                  </Button>
                </Box>
```

Add the helper hint text below the buttons:
```typescript
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
                  Copy the prompt, view and long-press (mobile) or right-click (desktop) the student image to copy it, then paste both into ChatGPT.
                </Typography>
```

- [ ] **Step 2: Import OpenInNewIcon**

Add to the existing MUI Icons imports at the top of AIFeedbackWorkspace.tsx:
```typescript
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
```

- [ ] **Step 3: Verify**

Start nexus locally, open a drawing submission that has an AI prompt, and confirm "View Student Image" opens the image in a new tab, and "Open ChatGPT" opens `https://chat.openai.com` in a new tab.

- [ ] **Step 4: Commit**

```bash
git add apps/nexus/src/components/drawings/AIFeedbackWorkspace.tsx
git commit -m "feat(nexus): add View Student Image and Open ChatGPT buttons to drawing workspace"
```

---

### Task 4: Database Migration for Notifications and New Columns

**Files:**
- Create: `packages/database/supabase/migrations/20260409_drawing_notifications.sql`
- Modify: `packages/database/src/types/index.ts`

- [ ] **Step 1: Write the migration file**

Create `packages/database/supabase/migrations/20260409_drawing_notifications.sql`:

```sql
-- Drawing re-review notifications for students
CREATE TABLE IF NOT EXISTS drawing_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  submission_id UUID NOT NULL REFERENCES drawing_submissions(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS drawing_notifications_student_unread_idx
  ON drawing_notifications(student_id, read)
  WHERE read = FALSE;

-- Separate annotation overlay prompt (for ChatGPT to annotate student image)
ALTER TABLE drawing_submissions
  ADD COLUMN IF NOT EXISTS ai_annotation_prompt TEXT;

-- Level-based reference image prompts stored as JSONB {beginner, medium, expert}
ALTER TABLE drawing_submissions
  ADD COLUMN IF NOT EXISTS ai_reference_prompts JSONB;
```

- [ ] **Step 2: Apply to staging**

Using the Supabase MCP tool, apply the migration to staging:

Tool: `mcp__supabase-staging__apply_migration`
- name: `20260409_drawing_notifications`
- query: (paste the full SQL above)

- [ ] **Step 3: Apply to production**

Tool: `mcp__supabase-prod__apply_migration`
- name: `20260409_drawing_notifications`
- query: (same SQL)

- [ ] **Step 4: Add TypeScript types**

In `packages/database/src/types/index.ts`, find the `DrawingSubmission` interface and add the new fields:

```typescript
  ai_annotation_prompt?: string | null;
  ai_reference_prompts?: {
    beginner: string;
    medium: string;
    expert: string;
  } | null;
```

Also add a new interface for notifications near the drawing types:

```typescript
export interface DrawingNotification {
  id: string;
  student_id: string;
  submission_id: string;
  message: string;
  read: boolean;
  created_at: string;
}
```

- [ ] **Step 5: Verify types compile**

```bash
cd packages/database && pnpm type-check
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/database/supabase/migrations/20260409_drawing_notifications.sql packages/database/src/types/index.ts
git commit -m "feat(db): add drawing_notifications table, ai_annotation_prompt and ai_reference_prompts columns"
```

---

### Task 5: DELETE API Endpoint for Submissions

**Files:**
- Modify: `apps/nexus/src/app/api/drawing/submissions/[id]/route.ts`

- [ ] **Step 1: Add DELETE handler**

In `apps/nexus/src/app/api/drawing/submissions/[id]/route.ts`, add after the existing `GET` export:

```typescript
import { getSupabaseAdminClient } from '@neram/database';
import { verifyMsToken } from '@/lib/ms-verify';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const { id } = await params;
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user || !['teacher', 'admin'].includes(user.user_type)) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Fetch image URLs before deleting
    const { data: submission } = await supabase
      .from('drawing_submissions')
      .select('original_image_url, reviewed_image_url, corrected_image_url')
      .eq('id', id)
      .single();

    if (!submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    // Delete the row (cascades to comments, notifications)
    const { error: deleteError } = await supabase
      .from('drawing_submissions')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;

    // Best-effort: delete associated storage files
    const urlsToDelete = [
      submission.original_image_url,
      submission.reviewed_image_url,
      submission.corrected_image_url,
    ].filter(Boolean) as string[];

    for (const url of urlsToDelete) {
      try {
        const bucket = url.includes('drawing-reviewed') ? 'drawing-reviewed' : 'drawing-submissions';
        const path = url.split(`/${bucket}/`)[1];
        if (path) await supabase.storage.from(bucket).remove([path]);
      } catch { /* non-critical */ }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Delete failed';
    console.error('Submission DELETE error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

Note: `NextRequest` and `NextResponse` are already imported from the existing GET handler. Add `getSupabaseAdminClient` to the imports.

- [ ] **Step 2: Verify the route handles DELETE**

```bash
pnpm dev:nexus
```

Test in terminal (replace TOKEN and ID with real values):
```bash
curl -X DELETE http://localhost:3012/api/drawing/submissions/TEST_ID \
  -H "Authorization: Bearer TEST_TOKEN"
```

Expected: `{"success":true}` or `{"error":"Submission not found"}` if ID doesn't exist.

- [ ] **Step 3: Commit**

```bash
git add apps/nexus/src/app/api/drawing/submissions/[id]/route.ts
git commit -m "feat(nexus): add DELETE endpoint for drawing submissions"
```

---

### Task 6: Delete from List Page

**Files:**
- Modify: `apps/nexus/src/app/(teacher)/teacher/drawing-reviews/page.tsx`

- [ ] **Step 1: Add delete state and handler to the list page**

In `apps/nexus/src/app/(teacher)/teacher/drawing-reviews/page.tsx`, add state and handler after the existing `useState` declarations:

```typescript
  const [deleteDialogId, setDeleteDialogId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deleteDialogId) return;
    setDeleting(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/drawing/submissions/${deleteDialogId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Delete failed');
      setSubmissions((prev) => prev.filter((s) => s.id !== deleteDialogId));
      setDeleteDialogId(null);
    } catch {
      // User sees nothing; keep dialog open
    } finally {
      setDeleting(false);
    }
  };
```

- [ ] **Step 2: Add trash icon to each card**

Find the submission card rendering (the `Paper` or `Box` that renders each item). Add a trash `IconButton` that stops propagation so the card click (navigate to detail) does not fire:

```typescript
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { IconButton, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button } from '@neram/ui';
```

Inside each card's render, add the delete icon in the top-right corner:

```typescript
<Box sx={{ position: 'relative' }}>
  {/* existing card content */}
  <IconButton
    size="small"
    color="error"
    onClick={(e) => { e.stopPropagation(); setDeleteDialogId(submission.id); }}
    sx={{ position: 'absolute', top: 8, right: 8 }}
    aria-label="Delete submission"
  >
    <DeleteOutlineIcon fontSize="small" />
  </IconButton>
</Box>
```

- [ ] **Step 3: Add confirmation dialog**

At the bottom of the return JSX (before the final closing tag), add:

```typescript
      <Dialog open={!!deleteDialogId} onClose={() => !deleting && setDeleteDialogId(null)}>
        <DialogTitle>Delete Submission?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will permanently delete the submission and all associated images. This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogId(null)} disabled={deleting}>
            Cancel
          </Button>
          <Button onClick={handleDelete} color="error" variant="contained" disabled={deleting}>
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
```

- [ ] **Step 4: Verify**

Start nexus locally, navigate to `/teacher/drawing-reviews`, confirm the trash icon appears on each card, clicking it shows the dialog, confirming deletes the item from the list without navigating.

- [ ] **Step 5: Commit**

```bash
git add apps/nexus/src/app/(teacher)/teacher/drawing-reviews/page.tsx
git commit -m "feat(nexus): add delete submission option on drawing review list"
```

---

### Task 7: Delete from Detail Page (More Actions Menu)

**Files:**
- Modify: `apps/nexus/src/app/(teacher)/teacher/drawing-reviews/[id]/page.tsx`

- [ ] **Step 1: Add more-actions menu state**

In the detail page, add state for the menu and delete dialog:

```typescript
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteSubmission = async () => {
    setDeleting(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/drawing/submissions/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Delete failed');
      router.push('/teacher/drawing-reviews');
    } catch {
      setDeleting(false);
      setDeleteDialogOpen(false);
    }
  };
```

- [ ] **Step 2: Add MoreVert icon button to desktop header**

Import required components:
```typescript
import MoreVertIcon from '@mui/icons-material/MoreVert';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { Menu, MenuItem, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions } from '@neram/ui';
```

In the desktop header (around line 304-308, after the Chip for attempt number), add:
```typescript
          <IconButton
            size="small"
            onClick={(e) => setMenuAnchor(e.currentTarget)}
            aria-label="More actions"
          >
            <MoreVertIcon />
          </IconButton>
```

- [ ] **Step 3: Add MoreVert to mobile header too**

In the mobile header (around line 204-216), add the same `IconButton` after the `CategoryBadge`.

- [ ] **Step 4: Add Menu and Dialog JSX**

Before the final `</>` closing tag in the mobile layout, and before `</Box>` in desktop layout, add:

```typescript
      {/* More actions menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
      >
        <MenuItem
          onClick={() => { setMenuAnchor(null); setDeleteDialogOpen(true); }}
          sx={{ color: 'error.main' }}
        >
          <DeleteOutlineIcon fontSize="small" sx={{ mr: 1 }} />
          Delete Submission
        </MenuItem>
      </Menu>

      {/* Delete confirmation */}
      <Dialog open={deleteDialogOpen} onClose={() => !deleting && setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Submission?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will permanently delete the submission and all associated images. This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>Cancel</Button>
          <Button onClick={handleDeleteSubmission} color="error" variant="contained" disabled={deleting}>
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
```

- [ ] **Step 5: Verify**

Open a drawing detail page, click the 3-dot menu, choose Delete, confirm the dialog, and verify it navigates back to the list.

- [ ] **Step 6: Commit**

```bash
git add apps/nexus/src/app/(teacher)/teacher/drawing-reviews/[id]/page.tsx
git commit -m "feat(nexus): add delete from drawing review detail page via more-actions menu"
```

---

### Task 8: Edit Already-Reviewed Submissions + Re-review Notification

**Files:**
- Modify: `apps/nexus/src/app/(teacher)/teacher/drawing-reviews/[id]/page.tsx`
- Modify: `apps/nexus/src/app/api/drawing/submissions/[id]/review/route.ts`

- [ ] **Step 1: Add re-review notification in the review PATCH route**

In `apps/nexus/src/app/api/drawing/submissions/[id]/review/route.ts`, fetch the current submission status BEFORE calling `saveDrawingReviewWithAction`. Add this block after the user authorization check (around line 22) and before the body parsing:

```typescript
    // Check current status before update (to detect re-reviews)
    const { data: currentSub } = await supabase
      .from('drawing_submissions')
      .select('status, student_id')
      .eq('id', id)
      .single();
    const wasAlreadyReviewed = ['reviewed', 'redo', 'completed'].includes(currentSub?.status || '');
```

Then, after the `saveDrawingReviewWithAction` call and before the gamification block, add:

```typescript
    // Notify student if this is a re-review
    if (wasAlreadyReviewed) {
      supabase
        .from('drawing_notifications' as any)
        .insert({
          student_id: submission.student_id,
          submission_id: id,
          message: 'Your teacher has reviewed your drawing again. Check the updated feedback.',
        })
        .then(() => {})
        .catch(() => {}); // non-critical, fire and forget
    }
```

- [ ] **Step 2: Add "edit mode" banner on already-reviewed submissions in detail page**

In `apps/nexus/src/app/(teacher)/teacher/drawing-reviews/[id]/page.tsx`, add this banner inside `reviewPanel`, before the `AIFeedbackWorkspace` component, conditioned on the submission already being reviewed:

```typescript
        {['reviewed', 'redo', 'completed'].includes(submission.status) && (
          <Paper variant="outlined" sx={{ p: 1.5, mb: 2, bgcolor: '#e8f5e9', flexShrink: 0 }}>
            <Typography variant="body2" color="success.dark" fontWeight={600}>
              This submission has already been reviewed. Any changes you save will notify the student.
            </Typography>
          </Paper>
        )}
```

This banner goes inside the `<Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>` container (line 166), before the `{submission.self_note && ...}` block.

- [ ] **Step 3: Change action button label for re-reviews**

The existing "Mark Complete" button is sufficient for re-saving. Add a label hint when re-reviewing. Find the `Mark Complete` button (around line 143-153) and update its label conditionally:

```typescript
          {saving && action === 'complete' ? 'Saving...' : 
            ['reviewed', 'redo', 'completed'].includes(submission.status) ? 'Save Changes' : 'Mark Complete'}
```

- [ ] **Step 4: Verify end-to-end**

1. Open a submission with status `reviewed` or `completed`
2. Confirm the green banner appears
3. Edit the written feedback text
4. Click "Save Changes"
5. Confirm the save succeeds (check DB via Supabase dashboard or MCP tool)
6. Confirm a row is inserted in `drawing_notifications` for the student

Check with MCP:
Tool: `mcp__supabase-staging__execute_sql`
Query: `SELECT * FROM drawing_notifications ORDER BY created_at DESC LIMIT 5;`

- [ ] **Step 5: Commit**

```bash
git add apps/nexus/src/app/(teacher)/teacher/drawing-reviews/[id]/page.tsx apps/nexus/src/app/api/drawing/submissions/[id]/review/route.ts
git commit -m "feat(nexus): allow editing reviewed submissions and notify student on re-review"
```

---

## PHASE 2: Workspace Redesign

---

### Task 9: Update drawing-ai.ts for Two Prompts + 3-Level Reference

**Files:**
- Modify: `apps/nexus/src/lib/drawing-ai.ts`

- [ ] **Step 1: Extend the AI_PROMPT to output annotation_overlay_prompt and reference_prompts**

In `drawing-ai.ts`, replace the `AI_PROMPT` constant (lines 12-43) with:

```typescript
const AI_PROMPT = `You are an expert NATA (National Aptitude Test in Architecture) drawing evaluator. Evaluate this student's drawing practice submission.

QUESTION_CONTEXT

Evaluate on these criteria:
1. COMPOSITION: Is the drawing well-composed? Is the frame well-utilized? Is there visual balance?
2. PROPORTION: Are objects proportional to each other? Are sizes realistic?
3. SHADING: Is there a clear light direction? Are shadows present and consistent? Quality of shading technique?
4. COMPLETENESS: Does the drawing address all objects/requirements mentioned in the question?
5. TECHNIQUE: Line quality, texture rendering, overall craftsmanship.

Also provide:
6. OVERLAY ANNOTATIONS: Identify 3-6 specific areas in this drawing that need correction. For each, give the rough position (choose from: top-left, top-center, top-right, center-left, center, center-right, bottom-left, bottom-center, bottom-right), a short label (max 6 words), and severity (high/medium/low).

7. ANNOTATION OVERLAY PROMPT: Write a ChatGPT prompt that a teacher will use alongside this student image to get an annotated correction overlay. The prompt should instruct ChatGPT to: keep the original drawing visible, draw red arrows pointing to each problem area identified above, add short text labels near each arrow explaining what needs correction (e.g., "straighten this line", "too large relative to circle"). Reference the specific issues found. Max 120 words.

8. REFERENCE IMAGE PROMPTS: Write three ChatGPT/DALL-E prompts to generate ideal reference versions of this drawing at different skill levels. DRAWING_MEDIUM_CONTEXT Include style: "hand-drawn appearance, not digital, looks manually created by a student, pencil/colour-pencil texture".
   - beginner: Simple, basic shapes, minimal detail, focus on correct placement only. Max 80 words.
   - medium: Moderate detail, correct proportions, some shading. Max 100 words.
   - expert: Full technique, shading, texture, professional finish. Max 120 words.

Respond ONLY in valid JSON format (no markdown, no code blocks, no backticks):
{
  "grade": "A" or "B" or "C" or "D",
  "feedback": ["point 1", "point 2", "point 3", "point 4", "point 5"],
  "composition": "brief assessment",
  "proportion": "brief assessment",
  "shading": "brief assessment",
  "completeness": "brief assessment",
  "technique": "brief assessment",
  "improvement_tip": "one specific actionable tip to improve",
  "progress_note": "comparison with previous attempts if available, otherwise null",
  "overlay_annotations": [
    {"area": "top-left", "label": "Proportion off", "severity": "high"},
    {"area": "center", "label": "Good shading here", "severity": "low"}
  ],
  "annotation_overlay_prompt": "I am sharing a student drawing with you. Please redraw keeping the original marks visible, then overlay corrections: draw red arrows to [specific issues]. Add short text labels. Keep it educational.",
  "reference_prompts": {
    "beginner": "Draw a basic 2D composition using simple shapes...",
    "medium": "Draw a 2D composition with moderate detail...",
    "expert": "Draw a refined 2D composition with full technique..."
  }
}`;
```

- [ ] **Step 2: Update generateDrawingAIFeedback to extract and save new fields**

In `generateDrawingAIFeedback`, find the destructuring line (around line 214):
```typescript
    const { overlay_annotations, corrected_image_prompt, ...aiFeedback } = parsed as any;
```
Replace with:
```typescript
    const {
      overlay_annotations,
      annotation_overlay_prompt,
      reference_prompts,
      corrected_image_prompt,
      ...aiFeedback
    } = parsed as any;
```

Then update the DB save block (around lines 217-225):
```typescript
    await supabase
      .from('drawing_submissions' as any)
      .update({
        ai_feedback: { ...aiFeedback, provider },
        ai_overlay_annotations: overlay_annotations || null,
        ai_corrected_image_prompt: corrected_image_prompt || null,
        ai_annotation_prompt: annotation_overlay_prompt || null,
        ai_reference_prompts: reference_prompts || null,
        ai_draft_status: 'ready',
      })
      .eq('id', submission_id);

    return {
      ...aiFeedback,
      overlay_annotations,
      corrected_image_prompt,
      annotation_overlay_prompt,
      reference_prompts,
      provider,
    };
```

- [ ] **Step 3: Test the AI output**

Start nexus locally and click "Re-generate AI Draft" on a drawing submission. In the browser Network tab, inspect the response from `/api/drawing/ai-feedback`. Confirm the response contains `annotation_overlay_prompt` and `reference_prompts.beginner/medium/expert` fields.

- [ ] **Step 4: Commit**

```bash
git add apps/nexus/src/lib/drawing-ai.ts
git commit -m "feat(nexus): extend Gemini prompt to generate annotation overlay prompt and 3-level reference prompts"
```

---

### Task 10: Update AIFeedbackWorkspace State for New Prompts

**Files:**
- Modify: `apps/nexus/src/components/drawings/AIFeedbackWorkspace.tsx`

- [ ] **Step 1: Add state for annotation prompt, reference prompts, and active level**

In `AIFeedbackWorkspace.tsx`, add to the state declarations (after the existing `[aiPrompt, setAiPrompt]` line around line 61):

```typescript
  const initialAnnotationPrompt = (submission as any).ai_annotation_prompt as string | null;
  const initialReferencePrompts = (submission as any).ai_reference_prompts as {
    beginner: string; medium: string; expert: string;
  } | null;

  const [annotationPrompt, setAnnotationPrompt] = useState<string | null>(initialAnnotationPrompt);
  const [referencePrompts, setReferencePrompts] = useState<{ beginner: string; medium: string; expert: string } | null>(initialReferencePrompts);
  const [activeLevel, setActiveLevel] = useState<'beginner' | 'medium' | 'expert'>('medium');
  const [annotationPromptCopied, setAnnotationPromptCopied] = useState(false);
  const [referenceCopied, setReferenceCopied] = useState(false);
  const [latestAiFeedback, setLatestAiFeedback] = useState<Record<string, unknown> | null>(
    submission.ai_feedback as Record<string, unknown> | null
  );
  const [uploadingAnnotation, setUploadingAnnotation] = useState(false);
```

- [ ] **Step 2: Update handleRegenerate to capture new prompt fields**

In the `handleRegenerate` function (around line 183-223), after the section that updates corrected image prompt, add:

```typescript
      if (feedback?.annotation_overlay_prompt) {
        setAnnotationPrompt(feedback.annotation_overlay_prompt);
      }
      if (feedback?.reference_prompts) {
        setReferencePrompts(feedback.reference_prompts);
      }
      // Always update latest AI feedback for the AI Draft button
      setLatestAiFeedback(feedback);
```

- [ ] **Step 3: Add handleAnnotationOverlayUpload for pasting annotated image**

Add a new upload handler for the annotation overlay image (similar to `handleCorrectedUpload`):

```typescript
  const handleAnnotationOverlayUpload = useCallback(async (file: File) => {
    setUploadingAnnotation(true);
    try {
      const token = await getToken();
      const formData = new FormData();
      formData.append('file', file);
      formData.append('bucket', 'drawing-reviewed');
      const res = await fetch('/api/drawing/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error('Upload failed');
      const { url } = await res.json();
      setOverlayImageUrl(url);
      notify({ overlayImageUrl: url });
    } catch { /* silent */ } finally {
      setUploadingAnnotation(false);
    }
  }, [getToken, notify]);
```

- [ ] **Step 4: Commit**

```bash
git add apps/nexus/src/components/drawings/AIFeedbackWorkspace.tsx
git commit -m "feat(nexus): add state for annotation prompt, reference prompts, and level selector in workspace"
```

---

### Task 11: Redesign Overlay Annotations Section (Section 1)

**Files:**
- Modify: `apps/nexus/src/components/drawings/AIFeedbackWorkspace.tsx`

- [ ] **Step 1: Add copy handler for annotation prompt**

Add `handleCopyAnnotationPrompt` after the existing `handleCopyPrompt` function:

```typescript
  const handleCopyAnnotationPrompt = async () => {
    if (!annotationPrompt) return;
    await navigator.clipboard.writeText(annotationPrompt);
    setAnnotationPromptCopied(true);
    setTimeout(() => setAnnotationPromptCopied(false), 2500);
  };
```

- [ ] **Step 2: Add global paste listener for annotation overlay image**

Extend the existing `useEffect` for global paste (lines 163-180) to also handle paste into the annotation overlay area when overlay section is expanded and no overlay image exists yet:

```typescript
  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (!file) continue;
          // Paste to annotation overlay if expanded and empty
          if (overlayExpanded && !overlayImageUrl) {
            handleAnnotationOverlayUpload(file);
            return;
          }
          // Paste to corrected image if expanded and empty
          if (correctedExpanded && !correctedImageUrl) {
            handleCorrectedUpload(file);
            return;
          }
        }
      }
    };
    document.addEventListener('paste', handleGlobalPaste);
    return () => document.removeEventListener('paste', handleGlobalPaste);
  }, [overlayExpanded, overlayImageUrl, correctedExpanded, correctedImageUrl, handleAnnotationOverlayUpload, handleCorrectedUpload]);
```

- [ ] **Step 3: Redesign Section 1 content**

Replace the current Section 1 collapse content (the `<Box sx={{ p: 2 }}>` inside Section 1's `<Collapse>`, roughly lines 284-374) with the new two-path layout:

```typescript
          <Box sx={{ p: isMobile ? 1.5 : 2 }}>
            {/* Path A: Manual Drawing */}
            <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
              DRAW MANUALLY
            </Typography>
            <Button
              variant="outlined"
              startIcon={<BrushOutlinedIcon />}
              onClick={() => setSketchOpen(true)}
              sx={{ textTransform: 'none', minHeight: 40, mb: 2 }}
              size="small"
              fullWidth
            >
              Open Drawing Canvas
            </Button>

            {/* Path B: AI Annotation Prompt */}
            <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
              AI ANNOTATION PROMPT FOR CHATGPT
            </Typography>
            {annotationPrompt ? (
              <Box>
                <Paper
                  variant="outlined"
                  sx={{ p: 1.5, bgcolor: '#f9f9f9', fontFamily: 'monospace', fontSize: '0.78rem', lineHeight: 1.5, mb: 1 }}
                >
                  <Typography variant="body2" sx={{ fontSize: '0.78rem', fontFamily: 'inherit' }}>
                    {annotationPrompt}
                  </Typography>
                </Paper>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                  <Button
                    size="small"
                    variant={annotationPromptCopied ? 'contained' : 'outlined'}
                    startIcon={annotationPromptCopied ? <CheckCircleOutlineIcon /> : <ContentCopyIcon />}
                    onClick={handleCopyAnnotationPrompt}
                    color={annotationPromptCopied ? 'success' : 'primary'}
                    sx={{ textTransform: 'none', minHeight: 36 }}
                  >
                    {annotationPromptCopied ? 'Copied!' : 'Copy Prompt'}
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<OpenInNewIcon />}
                    onClick={() => window.open(submission.original_image_url, '_blank')}
                    sx={{ textTransform: 'none', minHeight: 36 }}
                  >
                    View Student Image
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    color="secondary"
                    startIcon={<OpenInNewIcon />}
                    onClick={() => window.open('https://chat.openai.com', '_blank')}
                    sx={{ textTransform: 'none', minHeight: 36 }}
                  >
                    Open ChatGPT
                  </Button>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                  Copy prompt, open student image (long-press on mobile or right-click on desktop to copy), then paste both into ChatGPT.
                </Typography>

                {/* Paste annotated image back */}
                {overlayImageUrl ? (
                  <Box>
                    <Box
                      component="img"
                      src={overlayImageUrl}
                      alt="Annotated overlay"
                      sx={{ width: '100%', borderRadius: 1, border: '1px solid', borderColor: 'divider', mb: 1 }}
                    />
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      startIcon={<DeleteOutlineIcon />}
                      onClick={() => { setOverlayImageUrl(null); notify({ overlayImageUrl: null }); }}
                      sx={{ textTransform: 'none' }}
                    >
                      Remove Annotated Image
                    </Button>
                  </Box>
                ) : (
                  <Box>
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      id="upload-annotation-overlay"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleAnnotationOverlayUpload(file);
                        e.target.value = '';
                      }}
                    />
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      <Button
                        variant="outlined"
                        startIcon={uploadingAnnotation ? <CircularProgress size={16} /> : <CloudUploadOutlinedIcon />}
                        disabled={uploadingAnnotation}
                        onClick={() => document.getElementById('upload-annotation-overlay')?.click()}
                        sx={{ textTransform: 'none', minHeight: 44, borderStyle: 'dashed', flex: 1 }}
                        size="small"
                      >
                        {uploadingAnnotation ? 'Uploading...' : 'Upload Annotated Image'}
                      </Button>
                      <Button
                        variant="outlined"
                        startIcon={<ContentPasteIcon />}
                        disabled={uploadingAnnotation}
                        onClick={async () => {
                          try {
                            const items = await navigator.clipboard.read();
                            for (const item of items) {
                              for (const type of item.types) {
                                if (type.startsWith('image/')) {
                                  const blob = await item.getType(type);
                                  handleAnnotationOverlayUpload(new File([blob], 'annotated.png', { type }));
                                  return;
                                }
                              }
                            }
                          } catch { /* silent */ }
                        }}
                        sx={{ textTransform: 'none', minHeight: 44, borderStyle: 'dashed', flex: 1 }}
                        size="small"
                      >
                        Paste Image
                      </Button>
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
                      Paste the annotated drawing from ChatGPT here (Ctrl+V also works)
                    </Typography>
                  </Box>
                )}
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No AI annotation prompt yet. Click Re-generate in Section 2 to generate one.
              </Typography>
            )}

            {/* Zone-based annotation chips (keep existing manual chip annotations) */}
            {annotations.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
                  ZONE ANNOTATIONS
                </Typography>
                {annotations.map((ann, i) => (
                  <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                    {editingAnnotations ? (
                      <>
                        <TextField size="small" value={ann.label} sx={{ flex: 1 }}
                          onChange={(e) => handleAnnotationChange(i, 'label', e.target.value)} />
                        <Select size="small" value={ann.severity}
                          onChange={(e) => handleAnnotationChange(i, 'severity', e.target.value as string)}>
                          <MenuItem value="high">High</MenuItem>
                          <MenuItem value="medium">Medium</MenuItem>
                          <MenuItem value="low">Low</MenuItem>
                        </Select>
                        <IconButton size="small" color="error" onClick={() => handleAnnotationDelete(i)}>
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </>
                    ) : (
                      <Chip
                        label={`${ann.area}: ${ann.label}`}
                        size="small"
                        color={SEVERITY_COLORS[ann.severity]}
                        variant="outlined"
                      />
                    )}
                  </Box>
                ))}
                <Box sx={{ display: 'flex', gap: 1, mt: 0.75 }}>
                  <Button size="small" startIcon={<EditOutlinedIcon />}
                    onClick={() => setEditingAnnotations(!editingAnnotations)}
                    sx={{ textTransform: 'none' }}>
                    {editingAnnotations ? 'Done' : 'Edit'}
                  </Button>
                  {editingAnnotations && (
                    <Button size="small" startIcon={<AddIcon />}
                      onClick={handleAddAnnotation} sx={{ textTransform: 'none' }}>
                      Add
                    </Button>
                  )}
                </Box>
              </Box>
            )}
          </Box>
```

Note: `Select` and `MenuItem` need to be imported from `@neram/ui` if not already imported.

- [ ] **Step 4: Verify Section 1**

Open a drawing review after re-generating the AI draft. Section 1 should show:
- "Open Drawing Canvas" button (manual path)
- AI annotation prompt with Copy, View Student Image, Open ChatGPT buttons
- Paste/upload area for the annotated image from ChatGPT
- Existing zone annotation chips below

- [ ] **Step 5: Commit**

```bash
git add apps/nexus/src/components/drawings/AIFeedbackWorkspace.tsx
git commit -m "feat(nexus): redesign overlay annotations section with AI annotation prompt path and ChatGPT flow"
```

---

### Task 12: Redesign Reference Image Section (Section 2) with Level Tabs

**Files:**
- Modify: `apps/nexus/src/components/drawings/AIFeedbackWorkspace.tsx`

- [ ] **Step 1: Add copy handler for reference prompt**

Add after `handleCopyAnnotationPrompt`:

```typescript
  const handleCopyReferencePrompt = async () => {
    const prompt = referencePrompts?.[activeLevel];
    if (!prompt) return;
    await navigator.clipboard.writeText(prompt);
    setReferenceCopied(true);
    setTimeout(() => setReferenceCopied(false), 2500);
  };
```

- [ ] **Step 2: Replace Section 2 content**

Replace the existing Section 2 collapse body (lines 393-515) with:

```typescript
          <Box sx={{ p: isMobile ? 1.5 : 2 }}>
            {/* Level tabs */}
            <Tabs
              value={activeLevel}
              onChange={(_, v) => setActiveLevel(v)}
              sx={{ mb: 1.5, minHeight: 32, '& .MuiTab-root': { minHeight: 32, py: 0.25, textTransform: 'none', fontSize: '0.8rem' } }}
            >
              <Tab value="beginner" label="Beginner" />
              <Tab value="medium" label="Medium" />
              <Tab value="expert" label="Expert" />
            </Tabs>

            {/* Prompt for selected level */}
            {referencePrompts ? (
              <Box sx={{ mb: 2 }}>
                <Paper
                  variant="outlined"
                  sx={{ p: 1.5, bgcolor: '#f9f9f9', fontFamily: 'monospace', fontSize: '0.78rem', lineHeight: 1.5, mb: 1 }}
                >
                  <Typography variant="body2" sx={{ fontSize: '0.78rem', fontFamily: 'inherit' }}>
                    {referencePrompts[activeLevel]}
                  </Typography>
                </Paper>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                  <Button
                    size="small"
                    variant={referenceCopied ? 'contained' : 'outlined'}
                    startIcon={referenceCopied ? <CheckCircleOutlineIcon /> : <ContentCopyIcon />}
                    onClick={handleCopyReferencePrompt}
                    color={referenceCopied ? 'success' : 'primary'}
                    sx={{ textTransform: 'none', minHeight: 36 }}
                  >
                    {referenceCopied ? 'Copied!' : 'Copy Prompt'}
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<OpenInNewIcon />}
                    onClick={() => window.open(submission.original_image_url, '_blank')}
                    sx={{ textTransform: 'none', minHeight: 36 }}
                  >
                    View Student Image
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    color="secondary"
                    startIcon={<OpenInNewIcon />}
                    onClick={() => window.open('https://chat.openai.com', '_blank')}
                    sx={{ textTransform: 'none', minHeight: 36 }}
                  >
                    Open ChatGPT
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={regenerating ? <CircularProgress size={14} /> : <RefreshIcon />}
                    onClick={handleRegenerate}
                    disabled={regenerating}
                    sx={{ textTransform: 'none', minHeight: 36 }}
                  >
                    {regenerating ? 'Re-generating...' : 'Re-generate'}
                  </Button>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  Copy the {activeLevel} prompt, paste into ChatGPT (with student image for context), then paste the result below.
                </Typography>
              </Box>
            ) : aiDraftStatus === 'generating' ? (
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2 }}>
                <CircularProgress size={14} />
                <Typography variant="body2" color="text.secondary">Generating prompts...</Typography>
              </Box>
            ) : (
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                  No reference prompts yet. Click Re-generate to get prompts for all three levels.
                </Typography>
                <Button
                  size="small"
                  variant="contained"
                  startIcon={regenerating ? <CircularProgress size={14} /> : <RefreshIcon />}
                  onClick={handleRegenerate}
                  disabled={regenerating}
                  sx={{ textTransform: 'none', minHeight: 36 }}
                >
                  {regenerating ? 'Re-generating...' : 'Re-generate AI Draft'}
                </Button>
              </Box>
            )}

            {/* Upload / Paste corrected image */}
            {correctedImageUrl ? (
              <Box>
                <Box
                  component="img"
                  src={correctedImageUrl}
                  alt="Reference image"
                  sx={{ width: '100%', borderRadius: 1, border: '1px solid', borderColor: 'divider', mb: 1 }}
                />
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  startIcon={<DeleteOutlineIcon />}
                  onClick={() => { setCorrectedImageUrl(null); notify({ correctedImageUrl: null }); }}
                  sx={{ textTransform: 'none' }}
                >
                  Remove Image
                </Button>
              </Box>
            ) : (
              <Box ref={pasteZoneRef}>
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  id="upload-corrected"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleCorrectedUpload(file);
                    e.target.value = '';
                  }}
                />
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Button
                    variant="outlined"
                    startIcon={uploadingCorrected ? <CircularProgress size={16} /> : <CloudUploadOutlinedIcon />}
                    disabled={uploadingCorrected}
                    onClick={() => document.getElementById('upload-corrected')?.click()}
                    sx={{ textTransform: 'none', minHeight: 44, borderStyle: 'dashed', flex: 1 }}
                    size="small"
                  >
                    {uploadingCorrected ? 'Uploading...' : 'Upload Reference Image'}
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={uploadingCorrected ? <CircularProgress size={16} /> : <ContentPasteIcon />}
                    disabled={uploadingCorrected}
                    onClick={handlePasteImage}
                    sx={{ textTransform: 'none', minHeight: 44, borderStyle: 'dashed', flex: 1 }}
                    size="small"
                  >
                    Paste Image
                  </Button>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
                  Paste the reference image from ChatGPT here (Ctrl+V also works)
                </Typography>
                {pasteError && (
                  <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>{pasteError}</Typography>
                )}
              </Box>
            )}
          </Box>
```

Make sure `Tabs` and `Tab` are imported from `@neram/ui`.

- [ ] **Step 3: Verify**

After re-generating, Section 2 should show three tabs (Beginner/Medium/Expert). Switching tabs should show the prompt for that level. Buttons appear below the prompt.

- [ ] **Step 4: Commit**

```bash
git add apps/nexus/src/components/drawings/AIFeedbackWorkspace.tsx
git commit -m "feat(nexus): redesign reference image section with 3-level tabs and ChatGPT prompt flow"
```

---

### Task 13: AI Draft Button for Written Feedback (Section 3)

**Files:**
- Modify: `apps/nexus/src/components/drawings/AIFeedbackWorkspace.tsx`

- [ ] **Step 1: Add AI Draft button to Section 3 header**

Find the Section 3 header Box (around line 523-529). Replace its content with:

```typescript
        <Box
          sx={{ px: isMobile ? 1.5 : 2, py: isMobile ? 1 : 1.25, display: 'flex', alignItems: 'center', cursor: 'pointer', bgcolor: 'grey.50' }}
          onClick={() => setFeedbackExpanded(!feedbackExpanded)}
        >
          <Typography variant="subtitle2" fontWeight={700} sx={{ flex: 1 }}>
            3. Written Feedback
          </Typography>
          <Button
            size="small"
            variant="outlined"
            color="secondary"
            startIcon={<AutoAwesomeIcon />}
            onClick={(e) => {
              e.stopPropagation();
              const feedbackSource = latestAiFeedback || submission.ai_feedback;
              if (!feedbackSource) return;
              const draft = buildAIFeedbackText(feedbackSource as any);
              if (draft) {
                setTutorFeedback(draft);
                notify({ tutorFeedback: draft });
              }
            }}
            disabled={!latestAiFeedback && !submission.ai_feedback}
            title={!latestAiFeedback && !submission.ai_feedback ? 'Generate AI draft first using Re-generate above' : 'Pre-fill feedback from AI analysis'}
            sx={{ textTransform: 'none', mr: 1, minHeight: 28, fontSize: '0.75rem' }}
          >
            AI Draft
          </Button>
          {feedbackExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </Box>
```

- [ ] **Step 2: Import AutoAwesomeIcon**

Add to the existing MUI Icons imports:
```typescript
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
```

- [ ] **Step 3: Verify**

Open a drawing review that has AI feedback (green status). Section 3 header should show "AI Draft" button. Clicking it should pre-fill the text field with the AI-generated feedback points and improvement tip. The button should be disabled (greyed out) when no AI draft exists.

- [ ] **Step 4: Remove the old helper text that references "Re-generate in Section 2"**

Find the helperText on the TextField (around lines 544-550) and simplify it:

```typescript
              helperText={
                tutorFeedback && (latestAiFeedback || submission.ai_feedback)
                  ? 'Pre-filled from AI analysis. Edit as needed.'
                  : undefined
              }
```

- [ ] **Step 5: Commit**

```bash
git add apps/nexus/src/components/drawings/AIFeedbackWorkspace.tsx
git commit -m "feat(nexus): add AI Draft button to written feedback section using existing AI analysis"
```

---

### Task 14: Student Notification Badge in apps/app

**Files:**
- Explore: `apps/app/src/` (find where drawing submissions are listed for students)
- Create/Modify: relevant student drawing submission component

- [ ] **Step 1: Find the student drawing submission list/view**

In `apps/app/src/`, search for drawing-related components:

```bash
find apps/app/src -name "*.tsx" | xargs grep -l "drawing" 2>/dev/null
```

Identify the component that renders the student's submitted drawings list.

- [ ] **Step 2: Add a query to fetch unread notifications for the student**

In the student drawing list component (or its parent page), add a fetch for unread drawing notifications:

```typescript
const [unreadNotifications, setUnreadNotifications] = useState<string[]>([]); // submission IDs with unread notifications

useEffect(() => {
  const fetchNotifications = async () => {
    const token = await getToken(); // or however the app gets the auth token
    const res = await fetch('/api/drawing/notifications', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    setUnreadNotifications((data.notifications || []).map((n: any) => n.submission_id));
  };
  fetchNotifications();
}, []);
```

- [ ] **Step 3: Create the notifications API route in apps/app**

Create `apps/app/src/app/api/drawing/notifications/route.ts`:

```typescript
// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import { getUserByFirebaseUid, getSupabaseAdminClient } from '@neram/database';
import { getCorsHeaders } from '@/lib/cors';

export async function OPTIONS(request: NextRequest) {
  return NextResponse.json({}, { headers: getCorsHeaders(request.headers.get('Origin')) });
}

export async function GET(request: NextRequest) {
  const corsHeaders = getCorsHeaders(request.headers.get('Origin'));
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
    }
    const decodedToken = await verifyIdToken(authHeader.slice(7));
    const supabase = getSupabaseAdminClient();
    const user = await getUserByFirebaseUid(decodedToken.uid);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404, headers: corsHeaders });

    const { data: notifications } = await supabase
      .from('drawing_notifications' as any)
      .select('id, submission_id, message, created_at')
      .eq('student_id', user.id)
      .eq('read', false)
      .order('created_at', { ascending: false });

    return NextResponse.json({ notifications: notifications || [] }, { headers: corsHeaders });
  } catch {
    return NextResponse.json({ error: 'Failed to load' }, { status: 500, headers: corsHeaders });
  }
}

export async function PATCH(request: NextRequest) {
  const corsHeaders = getCorsHeaders(request.headers.get('Origin'));
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
    }
    await verifyIdToken(authHeader.slice(7));
    const { notification_id } = await request.json();
    const supabase = getSupabaseAdminClient();
    await supabase
      .from('drawing_notifications' as any)
      .update({ read: true })
      .eq('id', notification_id);
    return NextResponse.json({ success: true }, { headers: corsHeaders });
  } catch {
    return NextResponse.json({ error: 'Failed to update' }, { status: 500, headers: corsHeaders });
  }
}
```

- [ ] **Step 4: Add notification badge to student submission cards**

On each submission card that has an unread notification (`unreadNotifications.includes(submission.id)`), show a badge:

```typescript
{unreadNotifications.includes(submission.id) && (
  <Chip
    label="Updated feedback"
    size="small"
    color="primary"
    sx={{ ml: 1 }}
  />
)}
```

When the student opens the submission, call `PATCH /api/drawing/notifications` to mark it as read:

```typescript
// On submission open/view
if (unreadNotifications.includes(submissionId)) {
  fetch('/api/drawing/notifications', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ notification_id: relevantNotificationId }),
  }).catch(() => {});
}
```

- [ ] **Step 5: Verify**

1. Teacher re-reviews a submission and saves
2. Check DB: `SELECT * FROM drawing_notifications WHERE read = FALSE LIMIT 5;`
3. Open the student app, navigate to the drawing submission list
4. Confirm the "Updated feedback" chip appears on the re-reviewed submission
5. Open the submission, confirm the chip disappears (marked read)

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/app/api/drawing/notifications/route.ts apps/app/src/
git commit -m "feat(app): show notification badge on student drawing submissions when teacher re-reviews"
```

---

## Verification Checklist

### Phase 1 End-to-End

- [ ] Re-generate AI Draft on a drawing submission succeeds (no error banner)
- [ ] Error message is descriptive when AI generation fails (not generic 500)
- [ ] Open drawing review on 375px viewport: drawer opens, sections are collapsed, all 3 section headers visible without scrolling
- [ ] Tapping a section header expands it, content scrollable within drawer
- [ ] "Mark Complete" and "Request Redo" buttons always visible at drawer bottom
- [ ] "View Student Image" opens image in new tab
- [ ] "Open ChatGPT" opens `https://chat.openai.com` in new tab
- [ ] Trash icon visible on each card in the list; clicking shows confirmation; confirming removes the card
- [ ] 3-dot menu on detail page shows "Delete Submission"; confirming navigates back to list
- [ ] Opening a reviewed submission shows green "already reviewed" banner
- [ ] Saving a reviewed submission creates a row in `drawing_notifications` for the student

### Phase 2 End-to-End

- [ ] After re-generate, Section 1 shows AI annotation prompt with Copy/View/ChatGPT buttons
- [ ] Pasting an annotated image in Section 1 uploads and shows in the Overlay tab of the image viewer
- [ ] Section 2 shows Beginner/Medium/Expert tabs; each tab shows the correct level prompt
- [ ] Copy Prompt in Section 2 copies the active level's prompt to clipboard
- [ ] "AI Draft" button in Section 3 pre-fills the feedback text field
- [ ] "AI Draft" button is disabled (greyed out with tooltip) when no AI analysis exists

Run E2E tests:
```bash
pnpm test:e2e --project=nexus-chrome tests/e2e/ --grep "drawing"
pnpm test:e2e --project=nexus-mobile tests/e2e/ --grep "drawing"
```
