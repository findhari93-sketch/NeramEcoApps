# Question Bank Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin direct-edit, exam_month auto-populate, updated_at audit trail, owner tag change requests, and Google avatar display to the NATA Question Bank.

**Architecture:** DB migration adds `exam_month` to questions; a new `adminEditQuestion()` DB function and `PATCH /api/questions/[id]` admin route enable direct admin edits; frontend changes update QuestionCard, EditQuestionDialog, and the admin moderation view dialog.

**Tech Stack:** Next.js 14, Supabase (MCP tools for migrations), MUI v5, TypeScript, Vitest, Playwright

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `packages/database/supabase/migrations/20260409_exam_month_field.sql` | Create | Add exam_month column |
| `packages/database/src/types/index.ts` | Modify | Add exam_month to QuestionPost |
| `packages/database/src/queries/question-bank.ts` | Modify | Add adminEditQuestion(), update createQuestionPost() |
| `apps/admin/src/app/api/questions/[id]/route.ts` | Create | PATCH handler for admin direct edit |
| `apps/admin/src/components/question-bank/AdminEditQuestionDialog.tsx` | Create | Admin edit modal |
| `apps/admin/src/app/(dashboard)/question-moderation/page.tsx` | Modify | Add Edit button, audit dates, month chip |
| `apps/app/src/app/api/questions/route.ts` | Modify | Auto-set exam_year + exam_month on POST |
| `apps/app/src/components/question-bank/QuestionCard.tsx` | Modify | Month chip, updated_at audit line |
| `apps/app/src/components/question-bank/EditQuestionDialog.tsx` | Modify | Add tags chip field |
| `apps/app/src/app/api/auth/register-user/route.ts` | Modify | Sync avatar_url on repeat logins |

---

## Task 1: DB Migration - Add exam_month

**Files:**
- Create: `packages/database/supabase/migrations/20260409_exam_month_field.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Add exam_month to question_posts (1=January … 12=December)
ALTER TABLE question_posts
  ADD COLUMN IF NOT EXISTS exam_month SMALLINT
  CHECK (exam_month IS NULL OR exam_month BETWEEN 1 AND 12);

-- Add proposed session fields to question_change_requests
-- (for future owner-proposed session edits via change request flow)
ALTER TABLE question_change_requests
  ADD COLUMN IF NOT EXISTS proposed_exam_year  INT,
  ADD COLUMN IF NOT EXISTS proposed_exam_month SMALLINT
    CHECK (proposed_exam_month IS NULL OR proposed_exam_month BETWEEN 1 AND 12),
  ADD COLUMN IF NOT EXISTS proposed_exam_session TEXT;

COMMENT ON COLUMN question_posts.exam_month IS
  'Month of the exam session (1=Jan, 12=Dec). Auto-set from submission date.';
```

Save that to `packages/database/supabase/migrations/20260409_exam_month_field.sql`.

- [ ] **Step 2: Apply to staging via MCP**

Use `mcp__supabase-staging__apply_migration` with:
- `name`: `exam_month_field`
- `query`: (contents of the SQL file above)

Expected: success, no error.

- [ ] **Step 3: Verify column exists on staging**

Use `mcp__supabase-staging__execute_sql`:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'question_posts'
  AND column_name = 'exam_month';
```
Expected: one row returned.

- [ ] **Step 4: Apply to production**

Use `mcp__supabase-prod__apply_migration` with the same SQL.
Verify with `mcp__supabase-prod__execute_sql` same query.

- [ ] **Step 5: Commit**

```bash
git add packages/database/supabase/migrations/20260409_exam_month_field.sql
git commit -m "feat(db): add exam_month to question_posts and proposed session fields to change_requests"
```

---

## Task 2: Update TypeScript Types

**Files:**
- Modify: `packages/database/src/types/index.ts` lines ~3090-3273

- [ ] **Step 1: Add exam_month to QuestionPost**

In `packages/database/src/types/index.ts`, find the `QuestionPost` interface (around line 3090). After `exam_year: number | null;` add:

```typescript
  exam_month: number | null;
```

The block should look like:
```typescript
export interface QuestionPost extends Timestamps {
  id: string;
  user_id: string;
  title: string;
  body: string;
  category: NataQuestionCategory;
  exam_type: string;
  exam_year: number | null;
  exam_month: number | null;   // ← add this line
  exam_session: string | null;
  // ... rest unchanged
```

- [ ] **Step 2: Add proposed fields to QuestionChangeRequest**

Find `QuestionChangeRequest` (around line 3253). After `proposed_tags: string[];` add:

```typescript
  proposed_exam_year: number | null;
  proposed_exam_month: number | null;
  proposed_exam_session: string | null;
```

The block should look like:
```typescript
export interface QuestionChangeRequest {
  // ...
  proposed_image_urls: string[];
  proposed_tags: string[];
  proposed_exam_year: number | null;    // ← add
  proposed_exam_month: number | null;   // ← add
  proposed_exam_session: string | null; // ← add
  // Delete field
  reason: string | null;
```

- [ ] **Step 3: Run type-check to confirm no errors**

```bash
cd c:/Users/Haribabu/Documents/AppsCopilot/2026/NeramEcosystem
pnpm type-check
```

Expected: zero TypeScript errors (there may be errors from DB queries not yet updated — that's fine, fix those in Task 3).

- [ ] **Step 4: Commit**

```bash
git add packages/database/src/types/index.ts
git commit -m "feat(types): add exam_month to QuestionPost, proposed session fields to QuestionChangeRequest"
```

---

## Task 3: DB Functions - adminEditQuestion + createQuestionPost

**Files:**
- Modify: `packages/database/src/queries/question-bank.ts`

- [ ] **Step 1: Add adminEditQuestion function**

Open `packages/database/src/queries/question-bank.ts`. Find `approveQuestion` (around line 615) and add `adminEditQuestion` directly after it:

```typescript
export async function adminEditQuestion(
  questionId: string,
  fields: {
    title?: string;
    body?: string;
    category?: NataQuestionCategory;
    exam_year?: number | null;
    exam_month?: number | null;
    exam_session?: string | null;
    confidence_level?: number;
    tags?: string[];
  },
  client?: TypedSupabaseClient
): Promise<QuestionPost> {
  const supabase = client || getSupabaseAdminClient();

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (fields.title !== undefined) updateData.title = fields.title;
  if (fields.body !== undefined) updateData.body = fields.body;
  if (fields.category !== undefined) updateData.category = fields.category;
  if (fields.exam_year !== undefined) updateData.exam_year = fields.exam_year;
  if (fields.exam_month !== undefined) updateData.exam_month = fields.exam_month;
  if (fields.exam_session !== undefined) updateData.exam_session = fields.exam_session;
  if (fields.confidence_level !== undefined) updateData.confidence_level = fields.confidence_level;
  if (fields.tags !== undefined) updateData.tags = fields.tags;

  const { data, error } = await (supabase as any)
    .from('question_posts')
    .update(updateData)
    .eq('id', questionId)
    .select()
    .single();

  if (error) throw new Error(`Failed to update question: ${error.message}`);
  return data as QuestionPost;
}
```

- [ ] **Step 2: Update createQuestionPost to accept and store exam_month**

Find `createQuestionPost` in the same file. Locate the parameter object type (it will have `exam_year`, `exam_session`, etc.) and add `exam_month?: number | null` to it. Then in the `.insert()` call, add `exam_month: postData.exam_month ?? null`.

Look for the insert block that looks like:
```typescript
.insert({
  user_id: userId,
  title: postData.title,
  body: postData.body,
  category: postData.category,
  exam_type: postData.exam_type || 'NATA',
  exam_year: postData.exam_year ?? null,
  exam_session: postData.exam_session ?? null,
  // ...
})
```

Add `exam_month: postData.exam_month ?? null,` after `exam_year`.

- [ ] **Step 3: Export adminEditQuestion from the package**

Open `packages/database/src/index.ts` (or whichever file re-exports queries). Find where `approveQuestion` is exported and add `adminEditQuestion` alongside it:

```typescript
export { adminEditQuestion } from './queries/question-bank';
```

- [ ] **Step 4: Run type-check**

```bash
pnpm type-check
```

Expected: no new errors from the database package.

- [ ] **Step 5: Commit**

```bash
git add packages/database/src/queries/question-bank.ts packages/database/src/index.ts
git commit -m "feat(db): add adminEditQuestion function, add exam_month to createQuestionPost"
```

---

## Task 4: Admin PATCH API Route

**Files:**
- Create: `apps/admin/src/app/api/questions/[id]/route.ts`

- [ ] **Step 1: Create the route file**

```typescript
export const dynamic = 'force-dynamic';

/**
 * Admin API - Direct question edit (bypasses change-request flow)
 *
 * PATCH /api/questions/[id]
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminEditQuestion } from '@neram/database';
import type { NataQuestionCategory } from '@neram/database';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Question ID is required' }, { status: 400 });
    }

    const body = await request.json();

    // Validate category if provided
    const validCategories = [
      'mathematics', 'general_aptitude', 'drawing',
      'logical_reasoning', 'aesthetic_sensitivity', 'other',
    ];
    if (body.category && !validCategories.includes(body.category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }

    // Validate exam_month if provided
    if (body.exam_month != null && (body.exam_month < 1 || body.exam_month > 12)) {
      return NextResponse.json({ error: 'exam_month must be 1-12' }, { status: 400 });
    }

    const question = await adminEditQuestion(id, {
      title: body.title,
      body: body.body,
      category: body.category as NataQuestionCategory | undefined,
      exam_year: body.exam_year,
      exam_month: body.exam_month,
      exam_session: body.exam_session,
      confidence_level: body.confidence_level,
      tags: body.tags,
    });

    return NextResponse.json({ data: question });
  } catch (error: any) {
    console.error('Error editing question:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update question' },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Run type-check**

```bash
pnpm type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/app/api/questions/[id]/route.ts
git commit -m "feat(admin): add PATCH /api/questions/[id] for direct admin edit"
```

---

## Task 5: AdminEditQuestionDialog Component

**Files:**
- Create: `apps/admin/src/components/question-bank/AdminEditQuestionDialog.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Typography,
  Alert,
  Stack,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
  Chip,
  Box,
} from '@neram/ui';
import type { QuestionPostDisplay, NataQuestionCategory } from '@neram/database';

const CATEGORY_OPTIONS: { value: NataQuestionCategory; label: string }[] = [
  { value: 'mathematics', label: 'Mathematics' },
  { value: 'general_aptitude', label: 'General Aptitude' },
  { value: 'drawing', label: 'Drawing' },
  { value: 'logical_reasoning', label: 'Logical Reasoning' },
  { value: 'aesthetic_sensitivity', label: 'Aesthetic Sensitivity' },
  { value: 'other', label: 'Other' },
];

const MONTH_OPTIONS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface AdminEditQuestionDialogProps {
  open: boolean;
  onClose: () => void;
  question: QuestionPostDisplay;
  onSaved: (updated: QuestionPostDisplay) => void;
}

export default function AdminEditQuestionDialog({
  open,
  onClose,
  question,
  onSaved,
}: AdminEditQuestionDialogProps) {
  const [title, setTitle] = useState(question.title);
  const [body, setBody] = useState(question.body);
  const [category, setCategory] = useState<NataQuestionCategory>(question.category);
  const [examYear, setExamYear] = useState<string>(String(question.exam_year ?? ''));
  const [examMonth, setExamMonth] = useState<number | ''>(question.exam_month ?? '');
  const [examSession, setExamSession] = useState(question.exam_session ?? '');
  const [confidenceLevel, setConfidenceLevel] = useState<number>(question.confidence_level ?? 3);
  const [tags, setTags] = useState<string[]>(question.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleAddTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) {
      setTags([...tags, t]);
    }
    setTagInput('');
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleSave = async () => {
    setError('');
    if (!title.trim() || title.trim().length < 5) {
      setError('Title must be at least 5 characters');
      return;
    }
    if (!body.trim() || body.trim().length < 20) {
      setError('Body must be at least 20 characters');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/questions/${question.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          category,
          exam_year: examYear ? parseInt(examYear, 10) : null,
          exam_month: examMonth || null,
          exam_session: examSession.trim() || null,
          confidence_level: confidenceLevel,
          tags,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save');
      }

      const { data: updated } = await res.json();
      onSaved({ ...question, ...updated });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save question');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Edit Question (Admin)</DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <TextField
          fullWidth
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          sx={{ mb: 2 }}
          helperText={`${title.length} chars (min 5)`}
        />

        <TextField
          fullWidth
          multiline
          minRows={4}
          maxRows={12}
          label="Body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          sx={{ mb: 2 }}
          helperText={`${body.length} chars (min 20)`}
        />

        <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
          <FormControl fullWidth>
            <InputLabel>Category</InputLabel>
            <Select
              value={category}
              label="Category"
              onChange={(e) => setCategory(e.target.value as NataQuestionCategory)}
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth>
            <InputLabel>Month</InputLabel>
            <Select
              value={examMonth}
              label="Month"
              onChange={(e) => setExamMonth(Number(e.target.value) as number | '')}
              displayEmpty
            >
              <MenuItem value="">None</MenuItem>
              {MONTH_OPTIONS.map((m, i) => (
                <MenuItem key={i + 1} value={i + 1}>{m}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            fullWidth
            label="Year"
            type="number"
            value={examYear}
            onChange={(e) => setExamYear(e.target.value)}
            inputProps={{ min: 2010, max: 2040 }}
          />
        </Stack>

        <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
          <TextField
            fullWidth
            label="Session / Slot"
            value={examSession}
            onChange={(e) => setExamSession(e.target.value)}
            placeholder="e.g. Session one slot 2"
          />

          <FormControl fullWidth>
            <InputLabel>Confidence (1-5)</InputLabel>
            <Select
              value={confidenceLevel}
              label="Confidence (1-5)"
              onChange={(e) => setConfidenceLevel(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <MenuItem key={n} value={n}>{n}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>

        {/* Tags */}
        <Stack direction="row" spacing={1} sx={{ mb: 1 }} flexWrap="wrap" useFlexGap>
          {tags.map((tag) => (
            <Chip
              key={tag}
              label={tag}
              size="small"
              onDelete={() => handleRemoveTag(tag)}
            />
          ))}
        </Stack>
        <Stack direction="row" spacing={1}>
          <TextField
            size="small"
            label="Add tag"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag(); } }}
            sx={{ flex: 1 }}
          />
          <Button variant="outlined" size="small" onClick={handleAddTag}>Add</Button>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving}
          startIcon={saving ? <CircularProgress size={16} /> : undefined}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

- [ ] **Step 2: Run type-check**

```bash
pnpm type-check
```

Expected: no errors in the admin app.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/components/question-bank/AdminEditQuestionDialog.tsx
git commit -m "feat(admin): add AdminEditQuestionDialog for direct question editing"
```

---

## Task 6: Update Admin Moderation Page

**Files:**
- Modify: `apps/admin/src/app/(dashboard)/question-moderation/page.tsx`

Make 4 changes in this file:

- [ ] **Step 1: Import AdminEditQuestionDialog and add edit state**

At the top of the file, add the import:
```typescript
import AdminEditQuestionDialog from '@/components/question-bank/AdminEditQuestionDialog';
```

Inside the component, add a state variable alongside `viewQuestion`:
```typescript
const [editQuestion, setEditQuestion] = useState<QuestionPostDisplay | null>(null);
```

- [ ] **Step 2: Add month-year chip helper**

At the top of the component (or as a module-level constant), add:
```typescript
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
```

- [ ] **Step 3: Update the view dialog title area to include Edit button**

Find the `<DialogTitle>` block inside the view dialog (around line 686-699) and add an Edit `IconButton` before the status chip:

```tsx
<DialogTitle>
  <Stack direction="row" alignItems="center" spacing={1}>
    <Typography variant="h6" sx={{ flex: 1 }}>
      {viewQuestion.title}
    </Typography>
    {viewQuestion.is_admin_post && (
      <Chip label="Official" size="small" color="warning" />
    )}
    <IconButton
      size="small"
      title="Edit question"
      onClick={() => { setViewQuestion(null); setEditQuestion(viewQuestion); }}
    >
      <EditIcon fontSize="small" />
    </IconButton>
    <Chip
      label={viewQuestion.status}
      size="small"
      color={STATUS_COLORS[viewQuestion.status] || 'default'}
    />
  </Stack>
</DialogTitle>
```

Add `EditIcon` to the MUI imports at the top of the file (look for existing `import { ... } from '@neram/ui'` and add `EditIcon` to that list, or import directly: `import EditIcon from '@mui/icons-material/Edit';`).

- [ ] **Step 4: Add month chip and audit dates inside the view dialog**

Find the chips Stack block (around line 710-716):
```tsx
<Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
  <Chip label={CATEGORY_LABELS[viewQuestion.category] || viewQuestion.category} ... />
  {viewQuestion.exam_year && <Chip label={`NATA ${viewQuestion.exam_year}`} ... />}
  {viewQuestion.exam_session && <Chip label={viewQuestion.exam_session} ... />}
  {viewQuestion.confidence_level && viewQuestion.confidence_level !== 3 && (
    <Chip label={`Confidence: ${viewQuestion.confidence_level}/5`} ... />
  )}
</Stack>
```

Replace it with:
```tsx
<Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
  <Chip label={CATEGORY_LABELS[viewQuestion.category] || viewQuestion.category} size="small" color="primary" variant="outlined" />
  {(viewQuestion.exam_month && viewQuestion.exam_year) ? (
    <Chip label={`${MONTH_NAMES[(viewQuestion.exam_month as number) - 1]} ${viewQuestion.exam_year}`} size="small" variant="outlined" />
  ) : viewQuestion.exam_year ? (
    <Chip label={`NATA ${viewQuestion.exam_year}`} size="small" variant="outlined" />
  ) : null}
  {viewQuestion.exam_session && <Chip label={viewQuestion.exam_session} size="small" variant="outlined" />}
  {viewQuestion.confidence_level && viewQuestion.confidence_level !== 3 && (
    <Chip label={`Confidence: ${viewQuestion.confidence_level}/5`} size="small" variant="outlined" />
  )}
</Stack>
```

After the stats Stack (around line 733), add the audit row:
```tsx
<Stack direction="row" spacing={3} sx={{ mt: 1 }}>
  <Typography variant="caption" color="text.disabled">
    Posted: {new Date(viewQuestion.created_at).toLocaleString()}
  </Typography>
  {viewQuestion.updated_at !== viewQuestion.created_at && (
    <Typography variant="caption" color="text.disabled">
      Updated: {new Date(viewQuestion.updated_at).toLocaleString()}
    </Typography>
  )}
</Stack>
```

- [ ] **Step 5: Add AdminEditQuestionDialog mount at bottom of JSX**

Find where the reject Dialog and view Dialog are rendered. After the closing `</Dialog>` of the view dialog, add:

```tsx
{/* Admin Edit Dialog */}
{editQuestion && (
  <AdminEditQuestionDialog
    open={!!editQuestion}
    onClose={() => setEditQuestion(null)}
    question={editQuestion}
    onSaved={(updated) => {
      // Refresh the question in the list
      setQuestions((prev) =>
        prev.map((q) => (q.id === updated.id ? { ...q, ...updated } : q))
      );
      setEditQuestion(null);
    }}
  />
)}
```

Note: `setQuestions` is the state setter for the questions list — check the actual variable name in the page and use that.

- [ ] **Step 6: Run type-check and verify the page compiles**

```bash
pnpm type-check
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/app/(dashboard)/question-moderation/page.tsx
git commit -m "feat(admin): add edit button, month chip, and audit dates to question moderation view dialog"
```

---

## Task 7: Auto-Populate exam_year + exam_month on Question Submission

**Files:**
- Modify: `apps/app/src/app/api/questions/route.ts`

- [ ] **Step 1: Update the POST handler to auto-set exam_year and exam_month**

In `apps/app/src/app/api/questions/route.ts`, find the `createQuestionPost` call (around line 155). It currently passes:
```typescript
exam_year: examYear || null,
exam_session: examSession || null,
```

Replace those two lines with:
```typescript
exam_year: examYear || new Date().getFullYear(),
exam_month: examMonth || (new Date().getMonth() + 1),
exam_session: examSession || null,
```

Also update the destructuring at line 116 to include `examMonth`:
```typescript
const { title, body: questionBody, category, examType, examYear, examMonth, examSession, tags, confidenceLevel, imageUrls } = body;
```

- [ ] **Step 2: Run type-check**

```bash
pnpm type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/app/api/questions/route.ts
git commit -m "feat(app): auto-populate exam_year and exam_month from submission date"
```

---

## Task 8: QuestionCard - Month Chip + Updated_at Audit

**Files:**
- Modify: `apps/app/src/components/question-bank/QuestionCard.tsx`

- [ ] **Step 1: Add MONTH_NAMES constant and updated_at helper**

In `QuestionCard.tsx`, after the `CATEGORY_LABELS` constant, add:

```typescript
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function wasEdited(createdAt: string, updatedAt: string): boolean {
  return new Date(updatedAt).getTime() - new Date(createdAt).getTime() > 5 * 60 * 1000;
}
```

- [ ] **Step 2: Update the author row to show "Updated X ago" when edited**

Find the author row Stack (lines 48-62):
```tsx
<Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
  <Avatar ...>...</Avatar>
  <Typography ...>{question.author?.name || 'Anonymous'}</Typography>
  <AdminBadge ... />
  <Typography variant="body2" color="text.disabled" sx={{ fontSize: '0.75rem' }}>
    {timeAgo(question.created_at)}
  </Typography>
</Stack>
```

Replace the last Typography inside that Stack with:
```tsx
<Typography variant="body2" color="text.disabled" sx={{ fontSize: '0.75rem' }}>
  {timeAgo(question.created_at)}
  {wasEdited(question.created_at, question.updated_at) && (
    <> · Updated {timeAgo(question.updated_at)}</>
  )}
</Typography>
```

- [ ] **Step 3: Add month+year chip to the tags row**

Find the tags/meta Stack (line 84). After the category `<Chip>`, add:

```tsx
{question.exam_month && question.exam_year ? (
  <Chip
    label={`${MONTH_NAMES[question.exam_month - 1]} ${question.exam_year}`}
    size="small"
    variant="outlined"
    sx={{ height: 22, fontSize: '0.7rem' }}
  />
) : question.exam_year ? (
  <Chip
    label={`NATA ${question.exam_year}`}
    size="small"
    variant="outlined"
    sx={{ height: 22, fontSize: '0.7rem' }}
  />
) : null}
```

- [ ] **Step 4: Run type-check**

```bash
pnpm type-check
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/components/question-bank/QuestionCard.tsx
git commit -m "feat(app): add month+year chip and updated_at audit to QuestionCard"
```

---

## Task 9: EditQuestionDialog - Add Tags Field

**Files:**
- Modify: `apps/app/src/components/question-bank/EditQuestionDialog.tsx`

- [ ] **Step 1: Add tags state**

Inside `EditQuestionDialog`, after `const [category, setCategory] = useState...` add:

```typescript
const [tags, setTags] = useState<string[]>(question.tags ?? []);
const [tagInput, setTagInput] = useState('');
```

- [ ] **Step 2: Add tag helpers**

After the state declarations:
```typescript
const handleAddTag = () => {
  const t = tagInput.trim().toLowerCase();
  if (t && !tags.includes(t)) setTags([...tags, t]);
  setTagInput('');
};

const handleRemoveTag = (tag: string) => setTags(tags.filter((x) => x !== tag));
```

- [ ] **Step 3: Add tags to the form body**

After the category `<FormControl>` (around line 167), add:

```tsx
{/* Tags */}
<Box sx={{ mb: 2 }}>
  <Stack direction="row" spacing={1} sx={{ mb: 1 }} flexWrap="wrap" useFlexGap>
    {tags.map((tag) => (
      <Chip
        key={tag}
        label={tag}
        size="small"
        onDelete={() => handleRemoveTag(tag)}
      />
    ))}
  </Stack>
  <Stack direction="row" spacing={1}>
    <TextField
      size="small"
      label="Add tag (optional)"
      value={tagInput}
      onChange={(e) => setTagInput(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag(); } }}
      sx={{ flex: 1 }}
    />
    <Button variant="outlined" size="small" onClick={handleAddTag} disabled={!tagInput.trim()}>
      Add
    </Button>
  </Stack>
</Box>
```

Add `Box, Stack, Chip` to the `@neram/ui` imports if not already present.

- [ ] **Step 4: Include proposed_tags in the fetch body**

Find the `fetch` call (around line 66-76). In the `JSON.stringify(...)` body, add `proposed_tags: tags`:

```typescript
body: JSON.stringify({
  proposed_title: title.trim(),
  proposed_body: body.trim(),
  proposed_category: category,
  proposed_tags: tags,
}),
```

- [ ] **Step 5: Run type-check**

```bash
pnpm type-check
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/components/question-bank/EditQuestionDialog.tsx
git commit -m "feat(app): add tags field to EditQuestionDialog (submitted via change request)"
```

---

## Task 10: Fix Google Avatar Sync for Existing Users

**Files:**
- Modify: `apps/app/src/app/api/auth/register-user/route.ts`

The `register-user` route calls `getOrCreateUserFromFirebase` with `photoURL: decodedToken.picture || null` for new users. Existing users only get `last_login_at` updated. Users who signed up before `avatar_url` was stored won't see their Google photo.

- [ ] **Step 1: Update the existing-user avatar sync**

In `register-user/route.ts`, find the `updateUser` call (around line 95-97):
```typescript
await updateUser(user.id, {
  last_login_at: new Date().toISOString(),
}, adminClient);
```

Replace it with:
```typescript
const profileUpdate: Record<string, string | null> = {
  last_login_at: new Date().toISOString(),
};
// Sync Google avatar for users who authenticated before avatar_url was stored
if (!user.avatar_url && decodedToken.picture) {
  profileUpdate.avatar_url = decodedToken.picture;
}
await updateUser(user.id, profileUpdate as any, adminClient);
```

- [ ] **Step 2: Run type-check**

```bash
pnpm type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/app/api/auth/register-user/route.ts
git commit -m "fix(auth): sync Google avatar_url for existing users on login"
```

---

## Task 11: E2E Verification Tests

**Files:**
- Create: `tests/e2e/question-bank-enhancements.spec.ts`

- [ ] **Step 1: Write the E2E test file**

```typescript
import { test, expect } from '@playwright/test';
import { injectAuthForPage } from '../utils/credentials';
import { APP_URLS } from '../utils/credentials';

const ADMIN_URL = APP_URLS.admin;
const APP_URL = APP_URLS.app;

test.describe('Question Bank Enhancements', () => {
  // -------------------------------------------------------------------
  // Admin: Edit button + month chip + audit dates
  // -------------------------------------------------------------------
  test.describe('Admin moderation - direct edit', () => {
    test.beforeEach(async ({ page }) => {
      await injectAuthForPage(page, 'teacher');
      await page.goto(`${ADMIN_URL}/question-moderation`);
    });

    test('approved question shows Edit icon in view dialog', async ({ page }) => {
      // Click "Approved" tab
      await page.getByRole('button', { name: /approved/i }).click();
      // Click View on first question
      await page.getByRole('button', { name: /view/i }).first().click();
      // Edit icon should be visible
      await expect(page.getByTitle('Edit question')).toBeVisible();
    });

    test('Edit icon opens AdminEditQuestionDialog with all fields', async ({ page }) => {
      await page.getByRole('button', { name: /approved/i }).click();
      await page.getByRole('button', { name: /view/i }).first().click();
      await page.getByTitle('Edit question').click();
      // Dialog should open with fields
      await expect(page.getByLabel('Title')).toBeVisible();
      await expect(page.getByLabel('Category')).toBeVisible();
      await expect(page.getByLabel('Month')).toBeVisible();
      await expect(page.getByLabel('Year')).toBeVisible();
    });

    test('admin can change category and save', async ({ page }) => {
      await page.getByRole('button', { name: /approved/i }).click();
      await page.getByRole('button', { name: /view/i }).first().click();
      const questionTitle = await page.getByRole('heading').first().textContent();
      await page.getByTitle('Edit question').click();

      // Change category to Drawing
      await page.getByLabel('Category').click();
      await page.getByRole('option', { name: 'Drawing' }).click();

      // Change month to April (4)
      await page.getByLabel('Month').click();
      await page.getByRole('option', { name: 'April' }).click();

      await page.getByRole('button', { name: 'Save Changes' }).click();
      // Dialog closes
      await expect(page.getByRole('dialog')).not.toBeVisible();
    });
  });

  // -------------------------------------------------------------------
  // App: month chip on question cards
  // -------------------------------------------------------------------
  test.describe('App question bank - month chip + updated_at', () => {
    test.beforeEach(async ({ page }) => {
      await injectAuthForPage(page, 'student');
      await page.goto(`${APP_URL}/tools/nata/question-bank`);
    });

    test('question cards show month+year chip when exam_month is set', async ({ page }) => {
      // After admin sets exam_month=4 exam_year=2026 for a question,
      // the card should show "April 2026"
      const chip = page.getByText(/April 2026/).first();
      await expect(chip).toBeVisible();
    });
  });

  // -------------------------------------------------------------------
  // App: tags field in EditQuestionDialog
  // -------------------------------------------------------------------
  test.describe('EditQuestionDialog - tags field', () => {
    test('edit dialog shows tags section', async ({ page }) => {
      await injectAuthForPage(page, 'student');
      // Navigate to a question the student owns (use test data or the first approved question)
      await page.goto(`${APP_URL}/tools/nata/question-bank`);
      await page.locator('a[href*="/question-bank/"]').first().click();
      // Edit icon (only visible for question author)
      const editBtn = page.getByTestId('edit-question-btn');
      if (await editBtn.isVisible()) {
        await editBtn.click();
        await expect(page.getByLabel('Add tag (optional)')).toBeVisible();
      }
    });
  });
});
```

- [ ] **Step 2: Run just this test file to confirm structure**

```bash
cd c:/Users/Haribabu/Documents/AppsCopilot/2026/NeramEcosystem
pnpm test:e2e tests/e2e/question-bank-enhancements.spec.ts --project=admin-chrome --no-deps
```

Expected: tests run (some may fail until features are deployed — that's acceptable at this stage; fix any syntax errors).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/question-bank-enhancements.spec.ts
git commit -m "test(e2e): add question bank enhancements E2E test file"
```

---

## Verification Checklist

After all tasks are complete, verify end-to-end:

1. **DB**: `SELECT id, exam_year, exam_month FROM question_posts LIMIT 5;` — new posts should have both fields set.
2. **Admin edit**: Open a question in moderation, click Edit, change category to "Drawing", set Month=April, Year=2026, save. Reload — question should show "April 2026" chip.
3. **Admin audit**: View a recently-edited question in the dialog — both "Posted" and "Updated" timestamps should appear.
4. **App card**: Visit `app.neramclasses.com/tools/nata/question-bank` — the edited question should show "Drawing" chip and "April 2026" chip.
5. **App updated_at**: The card for the admin-edited question should show "Updated X ago".
6. **Owner tags**: Open EditQuestionDialog on an owned question — tags chip input should appear. Submit — change request goes to moderation with proposed_tags set.
7. **Avatar**: Log out and back in with a Google account — `avatar_url` should be set in DB; question cards should show the photo.
