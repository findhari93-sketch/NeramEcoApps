# Drawing Reviews Improvements Design

**Date:** 2026-04-09
**App:** apps/nexus (Teacher LMS)
**Status:** Approved

## Context

The drawing review feature allows teachers to evaluate student drawing submissions with AI-assisted feedback. Several issues and improvements have been identified:

1. Gemini AI is never actually called (old/invalid API key + error handling hides the real cause)
2. The feedback workspace is inaccessible on mobile (clipped inside bottom drawer, not scrollable)
3. Teachers cannot delete test/unwanted submissions
4. Already-reviewed submissions cannot be edited
5. The overlay annotation and reference image workflow needs a ChatGPT-based path (free, no token cost inside the app)
6. Written feedback needs an AI draft button
7. Students are not notified when a teacher re-reviews their submission

## Approach: Two Phases

### Phase 1: Bug Fixes + Quick Wins
Ships first. Unblocks teachers immediately.

### Phase 2: Workspace Redesign
Two-prompt AI system, level-based reference image, AI feedback draft button.

---

## Phase 1 Detailed Design

### 1. Gemini API Fix

**Files:**
- `apps/nexus/.env.local` — update `GEMINI_API_KEY`
- `apps/nexus/src/lib/drawing-ai.ts` — improve error handling in `callGemini()`

**Changes:**
- Replace old key `AIzaSyC79STLrAhGIQQG8cjopOd_ltq0hgTQP-0` with new key `AIzaSyCb3ZQ0a0NdMx1yHcb-3EMj887lirW84ok`
- In `callGemini()` (line 76-88), log the actual Gemini error response body
- Handle `400` (invalid key) and `403` (permission denied) separately from `429` (rate limit) with distinct error messages surfaced to the teacher
- Update Vercel production env var via CLI: `echo "<key>" | vercel env add GEMINI_API_KEY production`

**Error messages shown to teacher:**
- 400/403: "AI configuration error. Contact admin."
- 429: "Gemini rate limit reached. Wait 1 minute and try again."
- Other: "AI generation failed. Try again."

### 2. Mobile Feedback Workspace Fix

**Files:**
- `apps/nexus/src/app/(teacher)/teacher/drawing-reviews/[id]/page.tsx`
- `apps/nexus/src/components/drawings/AIFeedbackWorkspace.tsx`

**Changes:**
- Inside the bottom drawer (mobile), make the workspace container `overflow-y: auto`, `flex: 1`
- Make the workspace sections (Overlay, Reference Image, Written Feedback) compact on mobile: tighter padding, smaller headers, sections default to **collapsed** on mobile (teacher taps to expand)
- Pin "Mark Complete" and "Request Redo" buttons as a sticky footer inside the drawer so they are always visible without scrolling
- Add "Open ChatGPT" button (visible on mobile and desktop) in relevant sections that calls `window.open('https://chat.openai.com', '_blank')`

### 3. Delete Submissions

**Files:**
- `apps/nexus/src/app/api/drawing/submissions/[id]/route.ts` — new DELETE handler
- `apps/nexus/src/app/(teacher)/teacher/drawing-reviews/page.tsx` — list page
- `apps/nexus/src/app/(teacher)/teacher/drawing-reviews/[id]/page.tsx` — detail page

**API:** `DELETE /api/drawing/submissions/[id]`
- Verifies MS token
- Hard deletes the submission row from `drawing_submissions`
- Deletes associated images from Supabase storage (`original_image_url`, `reviewed_image_url`, `corrected_image_url`)

**List page:** Trash icon on each submission card. Confirmation dialog: "Delete this submission? This cannot be undone." On confirm, removes card from list optimistically.

**Detail page:** 3-dot "More actions" menu in the header. Same confirmation dialog. On confirm, navigates back to list.

### 4. Edit Already-Reviewed Submissions + Re-review Notification

**Files:**
- `apps/nexus/src/app/(teacher)/teacher/drawing-reviews/[id]/page.tsx`
- `apps/nexus/src/components/drawings/AIFeedbackWorkspace.tsx`
- `apps/nexus/src/app/api/drawing/submissions/[id]/review/route.ts`
- `packages/database/supabase/migrations/` — new migration for `drawing_notifications`

**Edit mode:**
- Any submission (regardless of status) shows an "Edit Review" button in the header
- Clicking it sets the workspace to editable mode (written feedback, rating, annotations, corrected image, status)
- Status dropdown options: Feedback Sent, Needs Redo, Completed
- Save button updates all fields in DB

**Re-review notification:**
- New table `drawing_notifications`: `id`, `student_id`, `submission_id`, `message`, `read`, `created_at`
- On save of a re-review, insert a notification: "Your teacher has updated feedback on your drawing. Check the latest comments."
- Student sees a notification badge on their submission card in `apps/app`
- Clicking clears the `read` flag and opens the submission

---

## Phase 2 Detailed Design

### 1. Redesigned Overlay Annotations Section

**File:** `apps/nexus/src/components/drawings/AIFeedbackWorkspace.tsx`

**Two parallel paths:**

**Path A: Draw Manually**
- Existing `SketchOverCanvas` component, unchanged
- "Draw Manually" button opens the canvas modal

**Path B: AI Annotation Prompt**
- "Get AI Prompt" button triggers Gemini to generate a correction overlay prompt
- Gemini analyzes the drawing and outputs a ChatGPT-specific prompt describing what corrections to draw on the student's image (arrows, labels, highlighted areas)
- UI shows:
  - Prompt text box (read-only) with **Copy Prompt** button
  - **View Student Image** button: opens the original image in a new browser tab. On mobile, teacher long-presses to copy; on desktop, teacher right-clicks to copy. A hint text explains this flow.
  - **Open ChatGPT** button (`window.open('https://chat.openai.com', '_blank')`)
- Paste area: Teacher pastes the ChatGPT-annotated image back. This image is uploaded to Supabase storage and saved as `reviewed_image_url`

**Overlay tab** in `ImageToggleTabs`: shows the ChatGPT-annotated image if available, else the manually drawn canvas overlay.

### 2. Redesigned Reference Image Section

**File:** `apps/nexus/src/components/drawings/AIFeedbackWorkspace.tsx`

**Level selector:** Three tabs: Beginner / Medium / Expert

- **Beginner:** Simple composition, minimal detail, focus on shape placement
- **Medium:** Moderate detail, some shading, proportions correct
- **Expert:** Full technique, shading, texture, professional finish

Selecting a level adjusts the prompt Gemini generates. One prompt per level is generated on demand (not all three upfront).

**Flow:**
- Select level tab
- Click **Generate Prompt** — calls Gemini with level context
- Shows prompt text box with **Copy Prompt** + **View Student Image** + **Open ChatGPT** buttons
- Paste area: Teacher pastes ChatGPT-generated reference image back. Uploaded to Supabase storage and saved as `corrected_image_url`

### 3. Written Feedback AI Draft Button

**File:** `apps/nexus/src/components/drawings/AIFeedbackWorkspace.tsx`

- Small "AI Draft" button in the Written Feedback section header
- On click: reads existing `ai_feedback` JSON (grade, composition, proportion, shading, technique, improvement_tip) from the submission and formats it into a friendly paragraph addressed to the student
- Pre-fills the multiline text field. Teacher edits freely.
- If `ai_feedback` is null, button shows tooltip: "Generate AI draft first using Re-generate above"
- No additional API call — pure client-side formatting of existing data

**Formatted output example:**
"Great effort on your 2D composition! Your use of shapes shows good understanding of the concept. The composition could be improved by better spacing between elements. Your shading technique is developing well. Focus on keeping line quality consistent throughout. One tip: try varying the pressure on your pencil to create depth."

---

## Gemini Prompt Additions (Phase 2)

The existing `AI_PROMPT` in `drawing-ai.ts` is extended to also generate:

1. **Annotation overlay prompt** (for ChatGPT): A prompt that asks ChatGPT to redraw the student image with correction arrows and labels at specific areas
2. **Reference image prompt** (level-aware): Existing field, but now generated with a level parameter (beginner/medium/expert) that adjusts the complexity of the ideal drawing

The API route `POST /api/drawing/ai-feedback` accepts an optional `level` parameter for reference image generation.

---

## Database Changes

### New Table: `drawing_notifications`
```sql
CREATE TABLE drawing_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES users(id) ON DELETE CASCADE,
  submission_id UUID REFERENCES drawing_submissions(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### New Column (if not already present): `ai_annotation_prompt` on `drawing_submissions`
- Stores the ChatGPT prompt for the correction overlay (separate from `ai_corrected_image_prompt`)

---

## Critical Files

| File | Change |
|------|--------|
| `apps/nexus/.env.local` | Update GEMINI_API_KEY |
| `apps/nexus/src/lib/drawing-ai.ts` | Error handling, annotation prompt, level-aware reference prompt |
| `apps/nexus/src/app/api/drawing/ai-feedback/route.ts` | Accept level param, better error responses |
| `apps/nexus/src/app/api/drawing/submissions/[id]/route.ts` | New DELETE handler |
| `apps/nexus/src/app/api/drawing/submissions/[id]/review/route.ts` | Re-review notification insert |
| `apps/nexus/src/app/(teacher)/teacher/drawing-reviews/page.tsx` | Delete from list |
| `apps/nexus/src/app/(teacher)/teacher/drawing-reviews/[id]/page.tsx` | Edit mode, delete from detail, mobile layout fix |
| `apps/nexus/src/components/drawings/AIFeedbackWorkspace.tsx` | All Phase 2 workspace changes |
| `apps/nexus/src/components/drawings/ImageToggleTabs.tsx` | Show ChatGPT-annotated image in Overlay tab |
| `packages/database/supabase/migrations/` | drawing_notifications table, ai_annotation_prompt column |
| `packages/database/src/types/index.ts` | New types for notifications |
| `apps/app/src/` — drawing submission view | Show notification badge for re-reviewed submissions |

---

## Verification

### Phase 1
1. Click "Re-generate AI Draft" on a submission — should succeed without rate limit error
2. Open drawing review on mobile (375px) — feedback workspace must be scrollable, action buttons pinned at bottom
3. Delete a submission from list and from detail page — confirm it disappears and images are removed
4. Open a reviewed submission, click "Edit Review", change written feedback and status, save — confirm DB updated
5. After re-review, check student app for notification badge on the submission

### Phase 2
1. In Overlay section, click "Get AI Prompt" — prompt appears with Copy, Copy Image, Open ChatGPT buttons
2. Open ChatGPT, paste image + prompt, get annotated image, paste back — image shows in Overlay tab
3. In Reference Image, select Beginner/Medium/Expert, generate prompt, paste result back — image saved
4. In Written Feedback, click "AI Draft" — text field pre-filled with formatted feedback
5. Run `pnpm test:e2e --project=nexus-chrome` for drawing review flows
