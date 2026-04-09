# Question Bank Enhancements Design

**Date:** 2026-04-09
**Scope:** apps/admin, apps/app, packages/database

---

## Context

The NATA Question Bank allows students to submit questions from past exam sessions. Currently:
- Admins can only approve or reject questions, not directly edit them
- There is no month field to identify which exam sitting a question came from
- Question cards show initials instead of Google avatars
- There is no audit trail showing when a question was last edited
- The owner's edit dialog does not expose the tags field

This spec addresses all five gaps.

---

## Feature 1: `exam_month` Field + Auto-Populate

### Database
- Add `exam_month SMALLINT CHECK (exam_month BETWEEN 1 AND 12)` to `question_posts`
- Add `proposed_exam_year INT`, `proposed_exam_month SMALLINT`, `proposed_exam_session TEXT` to `question_change_requests` (for future owner-proposed session edits)

### API (post-question)
- In `apps/app/src/app/api/questions/route.ts` (POST handler), auto-set:
  - `exam_year = new Date().getFullYear()`
  - `exam_month = new Date().getMonth() + 1`
  - Students do not get a manual input; admin can correct via direct edit

### Display
- Question cards show month+year as a single chip: "April 2026"
- If `exam_month` is null, fall back to showing just "NATA {year}" as before
- Month stored as number (1-12), displayed as locale month name

---

## Feature 2: Admin Direct Edit

### Admin moderation panel
- Add an "Edit" icon button in the top-right of the question view dialog (next to the status badge)
- Clicking opens a separate `AdminEditQuestionDialog` modal
- Fields: title, body, category (dropdown), exam_year (number input), exam_month (month select 1-12), exam_session (text), confidence_level (1-5 slider), tags (chip input)
- Save is immediate, no approval flow

### New API: `PATCH /api/questions/[id]` in `apps/admin`
- Auth: must be authenticated admin session
- Body: partial `{ title, body, category, exam_year, exam_month, exam_session, confidence_level, tags }`
- Updates `question_posts`, sets `updated_at = now()`, sets `reviewed_by = admin_id`

### New DB function: `adminEditQuestion(id, fields, adminId)` in `packages/database/src/queries/question-bank.ts`
- Partial update of allowed fields
- Returns updated `QuestionPost`

### TypeScript types
- Add `exam_month: number | null` to `QuestionPost`
- Add `proposed_exam_year`, `proposed_exam_month`, `proposed_exam_session` to `QuestionChangeRequest`

---

## Feature 3: Updated_at Audit Trail

### App question cards (`QuestionCard.tsx`)
- Show "Updated X ago" as a subtle secondary text only when `updated_at` is more than 5 minutes after `created_at`
- Appears on the same line as author/time, separated by a dot: "Riya 6d ago · Updated 2h ago"

### App question detail page (`[id]/page.tsx`)
- Show "Last edited [relative time]" in the metadata/header area when applicable

### Admin moderation view dialog
- Show two rows: "Posted: [absolute date]" and "Updated: [absolute date]"
- Always visible (not conditional on time diff)

---

## Feature 4: Owner Can Change Tags via Change Request

### App `EditQuestionDialog.tsx`
- Add a tags chip-input field below the existing category dropdown
- Pre-populate with current `tags` array
- On submit, include `proposed_tags` in the change-request payload

### API / DB
- `apps/app/src/app/api/questions/[id]/edit-request/route.ts` already accepts `proposed_tags`
- `approveEditRequest()` in `question-bank.ts` already applies `proposed_tags` when approving
- No backend changes needed, only frontend dialog update

---

## Feature 5: Google Avatar Display

### Components to update
- `apps/app/src/components/question-bank/QuestionCard.tsx`
- `apps/app/src/app/(protected)/tools/nata/question-bank/[id]/page.tsx`
- `apps/admin/src/app/(dashboard)/question-moderation/page.tsx`

### Change
- Pass `src={author.avatar_url ?? undefined}` to MUI `<Avatar>` component
- MUI Avatar naturally falls back to initials when `src` is undefined or fails to load
- No logic change required, just pass the prop

---

## Files to Modify

| File | Change |
|------|--------|
| `packages/database/supabase/migrations/YYYYMMDD_exam_month.sql` | Add `exam_month` to `question_posts`, add proposed fields to `question_change_requests` |
| `packages/database/src/types/index.ts` | Add `exam_month`, `proposed_exam_year/month/session` to types |
| `packages/database/src/queries/question-bank.ts` | Add `adminEditQuestion()`, update `approveEditRequest()` to handle new proposed fields |
| `apps/admin/src/app/api/questions/[id]/route.ts` (new) | `PATCH` handler for admin direct edit |
| `apps/admin/src/app/(dashboard)/question-moderation/page.tsx` | Add Edit icon button + import AdminEditQuestionDialog |
| `apps/admin/src/components/question-bank/AdminEditQuestionDialog.tsx` (new) | Edit modal for admin |
| `apps/app/src/app/api/questions/route.ts` | Auto-set `exam_year` and `exam_month` on POST |
| `apps/app/src/components/question-bank/QuestionCard.tsx` | Avatar src, updated_at display, month chip |
| `apps/app/src/components/question-bank/EditQuestionDialog.tsx` | Add tags field |
| `apps/app/src/app/(protected)/tools/nata/question-bank/[id]/page.tsx` | Avatar src, last-edited audit line |

---

## Verification

1. Submit a new question via `app.neramclasses.com/tools/nata/question-bank` - confirm `exam_year` and `exam_month` are auto-set in DB
2. Open admin moderation, click a question, click Edit icon - confirm all fields are editable and saved immediately
3. Check question card shows "April 2026" chip (or equivalent month chip)
4. Check question card shows "Updated X ago" after admin edits
5. Open EditQuestionDialog as question owner - confirm tags field is present and submits a change request
6. Use a Google-authenticated student account - confirm avatar image appears on question cards
