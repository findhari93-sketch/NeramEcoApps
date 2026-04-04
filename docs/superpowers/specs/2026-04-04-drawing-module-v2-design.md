# Drawing Module V2 — Design Spec

> **Date:** 2026-04-04 | **Scope:** Phase 1-3 (Question Bank + Submissions + Sketch-Over Review)
> **Platform:** nexus.neramclasses.com | **Status:** Approved

---

## Context

The Nexus LMS needs a Drawing Practice Module for NATA exam preparation. Students practice drawing (2D composition, 3D object composition, kit sculpture) by browsing recalled exam questions, uploading photos of their work, and receiving visual feedback from tutors who sketch corrections directly over the student's drawing.

The existing drawing system (`nexus_drawing_levels` -> `categories` -> `exercises`) follows a learning-path model that doesn't match the NATA question bank approach. This redesign replaces it with a flat question-bank schema optimized for exam preparation, adds a sketch-over review tool, and introduces resource link sharing from tutors.

**Source spec:** `apps/nexus/Docs/DRAWING_MODULE_SPEC.md`

---

## Scope

### In scope (this implementation)
- **Question Bank**: 96 NATA 2025 drawing questions, browsable with filters
- **Practice & Submission**: Students photograph drawings and upload via mobile
- **Tutor Review with Sketch-Over**: Teachers draw corrections over student images using HTML5 Canvas
- **Resource Link Sharing**: Teachers attach Nexus library videos or YouTube URLs to feedback
- **Star Rating + Text Feedback**: 1-5 rating with written comments

### Out of scope (future phases)
- Object Library (Phase 5)
- Foundation Checklist (Phase 4)
- Art Gallery social wall (Phase 6)
- Homework Assignment system (Phase 7)
- AI Feedback Layer (Phase 8-9)

---

## Database Schema

### Migration: `20260504_drawing_module_v2.sql`

#### Drop old tables (FK order)
```sql
DROP TABLE IF EXISTS nexus_drawing_assignment_submissions CASCADE;
DROP TABLE IF EXISTS nexus_drawing_assignments CASCADE;
DROP TABLE IF EXISTS nexus_drawing_submissions CASCADE;
DROP TABLE IF EXISTS nexus_drawing_exercises CASCADE;
DROP TABLE IF EXISTS nexus_drawing_categories CASCADE;
DROP TABLE IF EXISTS nexus_drawing_levels CASCADE;
```

#### Update `bulk_delete_users_cascade` function
Replace references to old `nexus_drawing_submissions` and `nexus_drawing_assignment_submissions` with `drawing_submissions`.

#### Create `drawing_questions`
```sql
CREATE TABLE drawing_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year INTEGER NOT NULL,
  session_date DATE,
  source_student TEXT,
  category TEXT NOT NULL CHECK (category IN ('2d_composition', '3d_composition', 'kit_sculpture')),
  sub_type TEXT NOT NULL,
  question_text TEXT NOT NULL,
  objects TEXT[] DEFAULT '{}',
  color_constraint TEXT,
  design_principle TEXT,
  difficulty_tag TEXT NOT NULL DEFAULT 'medium' CHECK (difficulty_tag IN ('easy', 'medium', 'hard')),
  reference_images JSONB DEFAULT '[]',
  solution_images JSONB,
  tags TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_dq_category ON drawing_questions(category);
CREATE INDEX idx_dq_year ON drawing_questions(year DESC);
CREATE INDEX idx_dq_tags ON drawing_questions USING GIN(tags);
CREATE INDEX idx_dq_difficulty ON drawing_questions(difficulty_tag);
CREATE INDEX idx_dq_sub_type ON drawing_questions(sub_type);
CREATE INDEX idx_dq_active ON drawing_questions(is_active) WHERE is_active = true;
```

#### Create `drawing_submissions`
```sql
CREATE TABLE drawing_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id),
  question_id UUID REFERENCES drawing_questions(id),
  source_type TEXT NOT NULL CHECK (source_type IN ('question_bank', 'homework', 'free_practice')),
  original_image_url TEXT NOT NULL,
  reviewed_image_url TEXT,
  self_note TEXT,
  ai_feedback JSONB,
  tutor_rating INTEGER CHECK (tutor_rating BETWEEN 1 AND 5),
  tutor_feedback TEXT,
  tutor_resources JSONB DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'under_review', 'reviewed', 'published')),
  is_gallery_published BOOLEAN DEFAULT false,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX idx_ds_student ON drawing_submissions(student_id);
CREATE INDEX idx_ds_status ON drawing_submissions(status);
CREATE INDEX idx_ds_gallery ON drawing_submissions(is_gallery_published) WHERE is_gallery_published = true;
CREATE INDEX idx_ds_submitted ON drawing_submissions(submitted_at DESC);
CREATE INDEX idx_ds_question ON drawing_submissions(question_id);
```

#### `tutor_resources` JSONB structure
```typescript
// Array of resource links attached by tutor during review
[
  { type: 'nexus_video', url: '/student/library/abc123', title: 'Shading Techniques - Class Recording' },
  { type: 'youtube', url: 'https://youtube.com/watch?v=xyz', title: 'How to draw a pineapple' }
]
```

#### RLS Policies
- `drawing_questions`: SELECT for all authenticated users (where `is_active = true`)
- `drawing_submissions`: Students SELECT own rows, teachers SELECT all, service_role full access
- Students INSERT own submissions, teachers UPDATE for review

#### Storage Buckets
| Bucket | Access | Max Size | MIME Types | Purpose |
|--------|--------|----------|------------|---------|
| `drawing-uploads` | Private | 10MB | image/* | Student submission photos |
| `drawing-reviewed` | Private | 10MB | image/* | Tutor sketch-over composites |
| `drawing-references` | Public | 10MB | image/* | AI-generated reference images |

---

## TypeScript Types

File: `packages/database/src/types/index.ts`

### Remove
- `NexusDrawingLevel`, `NexusDrawingCategory`, `NexusDrawingExercise`
- `NexusDrawingSubmission`, `NexusDrawingAssignment`, `NexusDrawingAssignmentSubmission`
- All joined/extended types for the above

### Add
```typescript
export type DrawingCategory = '2d_composition' | '3d_composition' | 'kit_sculpture';
export type DrawingDifficulty = 'easy' | 'medium' | 'hard';
export type DrawingSubmissionStatus = 'submitted' | 'under_review' | 'reviewed' | 'published';
export type DrawingSubmissionSource = 'question_bank' | 'homework' | 'free_practice';

export interface TutorResource {
  type: 'nexus_video' | 'youtube';
  url: string;
  title: string;
}

export interface DrawingQuestion {
  id: string;
  year: number;
  session_date: string | null;
  source_student: string | null;
  category: DrawingCategory;
  sub_type: string;
  question_text: string;
  objects: string[];
  color_constraint: string | null;
  design_principle: string | null;
  difficulty_tag: DrawingDifficulty;
  reference_images: Array<{ level: number; url: string; alt_text?: string }>;
  solution_images: Array<{ url: string; caption?: string }> | null;
  tags: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DrawingSubmission {
  id: string;
  student_id: string;
  question_id: string | null;
  source_type: DrawingSubmissionSource;
  original_image_url: string;
  reviewed_image_url: string | null;
  self_note: string | null;
  ai_feedback: { score: string; feedback: string[] } | null;
  tutor_rating: number | null;
  tutor_feedback: string | null;
  tutor_resources: TutorResource[];
  status: DrawingSubmissionStatus;
  is_gallery_published: boolean;
  submitted_at: string;
  reviewed_at: string | null;
}

export interface DrawingSubmissionWithDetails extends DrawingSubmission {
  question: DrawingQuestion | null;
  student: Pick<User, 'id' | 'name' | 'email' | 'avatar_url'>;
}
```

---

## Query Functions

File: `packages/database/src/queries/nexus/drawings.ts` (complete rewrite)

Pattern: accept optional `client?: TypedSupabaseClient`, default to `getSupabaseAdminClient()`.

### Question Queries
- `getDrawingQuestions(filters?)` — List with category, sub_type, difficulty_tag, year, tags, search, pagination
- `getDrawingQuestionById(id)` — Single question
- `seedDrawingQuestions(questions[])` — Bulk insert for seed data

### Submission Queries — Student
- `getStudentDrawingSubmissions(studentId, filters?)` — Own submissions with status/question filters
- `createDrawingSubmission(data)` — Insert new submission
- `getDrawingSubmissionById(id)` — Single submission with question + student joins

### Submission Queries — Teacher
- `getDrawingReviewQueue(filters?)` — Pending submissions with student info, filterable by status/category/student
- `saveDrawingReview(submissionId, review)` — Update with rating, feedback, reviewed_image_url, tutor_resources, status='reviewed'

### Library Search (for resource links)
- `searchLibraryVideos(query, limit?)` — Leverage existing library video query with search filter

---

## API Routes

Base: `apps/nexus/src/app/api/drawing/`

All routes use: `verifyMsToken()` -> lookup user by `ms_oid` -> call query functions -> return JSON.

### Questions
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/questions` | Any authenticated | List with filters: `?category=&difficulty_tag=&year=&search=&limit=&offset=` |
| GET | `/questions/[id]` | Any authenticated | Single question detail |
| POST | `/questions/seed` | Teacher/Admin only | Bulk insert from JSON (one-time seed) |

### Submissions
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/submissions` | Student | Create submission (question_id, source_type, original_image_url, self_note) |
| GET | `/submissions/my` | Student | Own submissions with filters |
| GET | `/submissions/review-queue` | Teacher | Pending reviews with filters |
| GET | `/submissions/[id]` | Student (own) or Teacher | Submission detail with question + student |
| PATCH | `/submissions/[id]/review` | Teacher | Save review: rating, feedback, reviewed_image_url, tutor_resources |

### Upload
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/upload` | Any authenticated | Upload image to Supabase Storage, return URL. Body: FormData with `file` + `bucket` (drawing-uploads or drawing-reviewed) |

### Gamification Integration
The `POST /submissions` and `PATCH /submissions/[id]/review` routes record gamification events:
- `drawing_submitted` → +5 points (student)
- `drawing_reviewed` → +3 points (student receives)

---

## Student UI

### Navigation
Already exists: Practice group -> "Drawings" at `/student/drawings`. No changes needed.

### Pages

#### 1. Question Bank Browse — `/student/drawings/page.tsx` (rewrite)
- **Category tabs**: All | 2D Composition | 3D Composition | Kit/Sculpture (MUI `Tabs`)
- **Filter row**: Difficulty chips (Easy/Medium/Hard toggle), Year dropdown, Search text input
- **Card grid**: 2 columns mobile, 3 tablet, 4 desktop
- **Each card** (`DrawingQuestionCard`): Category badge (color-coded), difficulty chip, truncated question text (2 lines), year, object count
- **Skeleton loaders** during fetch, empty state when no results
- **Pagination**: Infinite scroll or "Load More" button
- Fetches `GET /api/drawing/questions?category=...&difficulty_tag=...&year=...&search=...`

#### 2. Question Detail — `/student/drawings/[questionId]/page.tsx` (new)
- Full question text prominently displayed
- Category badge + difficulty chip + year badge
- **Objects list** as chips
- **Color constraint** callout (if present)
- **Design principle** callout (if present, for kit questions)
- **Reference Images** with `ReferenceImageToggle` (Beginner/Intermediate/Advanced levels)
- **"Practice This" FAB** -> opens `DrawingSubmissionSheet` bottom sheet
- **My Submissions section** at bottom: previous attempts for this question with status badges

#### 3. My Submissions — `/student/drawings/submissions/page.tsx` (new)
- List of `DrawingSubmissionCard` components
- Filter by status: All | Submitted | Reviewed
- Each card: thumbnail, question snippet (or "Free Practice"), status badge, tutor rating if reviewed
- Empty state for no submissions

#### 4. Submission Detail — `/student/drawings/submissions/[id]/page.tsx` (new)
- **Toggle**: "My Drawing" | "Tutor Feedback" (MUI `ToggleButtonGroup`)
- My Drawing view: original image full-width, self-note
- Tutor Feedback view: reviewed image (sketch-over composite), star rating, text feedback, resource links (clickable — Nexus library links or YouTube)
- Resource links rendered as cards with video icon + title

### Student Components

| Component | File | Purpose |
|-----------|------|---------|
| `CategoryBadge` | `components/drawings/CategoryBadge.tsx` | Color-coded chip: 2D=blue (#1976d2), 3D=green (#2e7d32), Kit=purple (#7b1fa2) |
| `DifficultyChip` | `components/drawings/DifficultyChip.tsx` | Easy=green, Medium=orange, Hard=red. MUI `Chip` size="small" |
| `ReferenceImageToggle` | `components/drawings/ReferenceImageToggle.tsx` | 3-level toggle showing progressively detailed reference images |
| `DrawingQuestionCard` | `components/drawings/DrawingQuestionCard.tsx` | Grid card: badges + question text + year. Min 48px touch target. |
| `DrawingSubmissionSheet` | `components/drawings/DrawingSubmissionSheet.tsx` | Bottom sheet: camera/gallery picker, preview, upload progress, self-note input |
| `DrawingSubmissionCard` | `components/drawings/DrawingSubmissionCard.tsx` | List card: thumbnail + status + rating preview |
| `DrawingSubmissionDetail` | `components/drawings/DrawingSubmissionDetail.tsx` | Full submission with My Drawing / Tutor Feedback toggle |

---

## Teacher UI

### Navigation
Add "Drawing Reviews" to teaching panel in `PanelProvider.tsx`:
- Sidebar item with `BrushOutlinedIcon`
- Path: `/teacher/drawing-reviews`
- Add to `detectPanelFromPath` mapping

### Pages

#### 1. Review Queue — `/teacher/drawing-reviews/page.tsx` (new)
- Card list of pending submissions (status = 'submitted')
- Each card: student avatar + name, question text preview (or "Free Practice"), category badge, submission date
- Sort: oldest first (FIFO queue)
- Filter: student name search, category tabs
- Badge count in sidebar nav showing pending review count
- Skeleton loaders during fetch

#### 2. Review Panel — `/teacher/drawing-reviews/[id]/page.tsx` (new)
- **Student's drawing** displayed prominently
- **"Draw Over" button** -> opens `SketchOverCanvas` as fullscreen overlay
- **Rating**: MUI `Rating` component (1-5 stars)
- **Feedback**: `TextField` multiline for written comments
- **Resource Links**: `ResourceLinkSearch` component
  - Toggle between "Search Library" (autocomplete search Nexus videos) and "Paste YouTube URL"
  - Library search calls `GET /api/library/videos?search=...`
  - YouTube URL validation (regex)
  - Selected resources shown as removable chips
- **"Save Review" button**: Uploads sketch-over composite, calls PATCH API
- **Back button** to return to queue

### Teacher Components

| Component | File | Purpose |
|-----------|------|---------|
| `DrawingReviewQueue` | `components/drawings/DrawingReviewQueue.tsx` | Card list of pending reviews |
| `SketchOverCanvas` | `components/drawings/SketchOverCanvas.tsx` | Enhanced `SketchpadOverlay`: freehand pen, eraser, undo, redo, color picker, thickness, composite export |
| `DrawingReviewPanel` | `components/drawings/DrawingReviewPanel.tsx` | Full review interface: canvas + rating + feedback + resources |
| `ResourceLinkSearch` | `components/drawings/ResourceLinkSearch.tsx` | Search Nexus library videos or paste YouTube URL |

### Sketch-Over Canvas Details

Based on existing `SketchpadOverlay.tsx`, enhanced with:

1. **Redo support**: Maintain `redoPaths[]` array. Undo pushes to redo stack, new strokes clear redo stack.
2. **Composite export**: `canvas.toBlob()` -> upload to `drawing-reviewed` bucket via `/api/drawing/upload` -> return URL
3. **Tool palette**: Freehand pen (default red #ff0000), eraser, configurable color, 3 thickness levels (thin=2px, medium=4px, thick=8px)
4. **Fullscreen overlay**: Same pattern as existing — opens over the base image
5. **Touch support**: Touch events for mobile drawing (existing in SketchpadOverlay)
6. **CORS handling**: Set `img.crossOrigin = 'anonymous'` for Supabase Storage images

### Remove Old Teacher Pages
- Delete `apps/nexus/src/app/(teacher)/teacher/evaluate/page.tsx` (replaced by drawing-reviews)
- Remove "Evaluate" sidebar item from PanelProvider if it only served drawings

---

## Seed Data

### Source: `nata_2025_drawing_questions.json`
96 NATA 2025 questions (provided as conversation attachment) with fields: year, source_student, category, sub_type, question_text, objects, color_constraint, design_principle, difficulty_tag, tags.

### Seed process
1. Place JSON at `packages/database/src/data/nata_2025_drawing_questions.json`
2. Call `POST /api/drawing/questions/seed` with the JSON array (teacher/admin auth required)
3. `seedDrawingQuestions()` bulk inserts into `drawing_questions`
4. One-time operation after migration

---

## Files to Delete

| File | Reason |
|------|--------|
| `apps/nexus/src/app/api/drawings/route.ts` | Replaced by new `/api/drawing/` structure |
| `apps/nexus/src/app/api/drawings/upload/route.ts` | Replaced |
| `apps/nexus/src/app/api/drawings/submissions/route.ts` | Replaced |
| `apps/nexus/src/app/api/drawings/evaluate/route.ts` | Replaced |
| `apps/nexus/src/app/(teacher)/teacher/evaluate/page.tsx` | Replaced by `/teacher/drawing-reviews` |

---

## Files to Create/Rewrite (~30 files)

### Database Layer
1. `supabase/migrations/20260504_drawing_module_v2.sql`
2. `packages/database/src/data/nata_2025_drawing_questions.json`

### Query Functions
3. `packages/database/src/queries/nexus/drawings.ts` (rewrite)

### API Routes (9 files)
4. `apps/nexus/src/app/api/drawing/questions/route.ts`
5. `apps/nexus/src/app/api/drawing/questions/[id]/route.ts`
6. `apps/nexus/src/app/api/drawing/questions/seed/route.ts`
7. `apps/nexus/src/app/api/drawing/submissions/route.ts`
8. `apps/nexus/src/app/api/drawing/submissions/my/route.ts`
9. `apps/nexus/src/app/api/drawing/submissions/review-queue/route.ts`
10. `apps/nexus/src/app/api/drawing/submissions/[id]/route.ts`
11. `apps/nexus/src/app/api/drawing/submissions/[id]/review/route.ts`
12. `apps/nexus/src/app/api/drawing/upload/route.ts`

### Student Pages (3 new + 1 rewrite)
13. `apps/nexus/src/app/(student)/student/drawings/page.tsx` (rewrite)
14. `apps/nexus/src/app/(student)/student/drawings/[questionId]/page.tsx`
15. `apps/nexus/src/app/(student)/student/drawings/submissions/page.tsx`
16. `apps/nexus/src/app/(student)/student/drawings/submissions/[id]/page.tsx`

### Teacher Pages (2 new)
17. `apps/nexus/src/app/(teacher)/teacher/drawing-reviews/page.tsx`
18. `apps/nexus/src/app/(teacher)/teacher/drawing-reviews/[id]/page.tsx`

### Components (11 new)
19. `apps/nexus/src/components/drawings/CategoryBadge.tsx`
20. `apps/nexus/src/components/drawings/DifficultyChip.tsx`
21. `apps/nexus/src/components/drawings/ReferenceImageToggle.tsx`
22. `apps/nexus/src/components/drawings/DrawingQuestionCard.tsx`
23. `apps/nexus/src/components/drawings/DrawingSubmissionSheet.tsx`
24. `apps/nexus/src/components/drawings/DrawingSubmissionCard.tsx`
25. `apps/nexus/src/components/drawings/DrawingSubmissionDetail.tsx`
26. `apps/nexus/src/components/drawings/DrawingReviewQueue.tsx`
27. `apps/nexus/src/components/drawings/SketchOverCanvas.tsx`
28. `apps/nexus/src/components/drawings/DrawingReviewPanel.tsx`
29. `apps/nexus/src/components/drawings/ResourceLinkSearch.tsx`

### Files to Modify
30. `packages/database/src/types/index.ts` — Remove old drawing types, add new ones
31. `apps/nexus/src/components/PanelProvider.tsx` — Add "Drawing Reviews" to teaching panel

---

## Implementation Order & Dependencies

```
Phase 0: DB Migration + Types + Storage Buckets
    |
Phase 1: Query Functions (drawings.ts rewrite)
    |
Phase 2: API Routes (delete old, create 9 new)
    |
    +---> Phase 3: Student UI (4 pages, 7 components) ---|
    |                                                      |--> Phase 5: Seed Data
    +---> Phase 4: Teacher UI (2 pages, 4 components) ---|
```

Phase 3 and Phase 4 can run in parallel (different page directories, shared components in `drawings/`).

---

## Risks

| Risk | Mitigation |
|------|------------|
| Dropping old tables breaks `bulk_delete_users_cascade` | Redefine function in same migration before dropping tables |
| Canvas toDataURL CORS issues | Set `img.crossOrigin = 'anonymous'`, ensure Storage CORS headers |
| Large image uploads on slow mobile | Client-side resize to max 2048px before upload, progress indicator |
| Old evaluate page breaks after API removal | Deploy all changes together in one PR |
| Reference images not yet generated | Questions seed without images; `reference_images` defaults to `[]`; images added later |

---

## Verification Plan

1. **Migration**: Apply to staging via Supabase MCP, verify tables/indexes/policies/buckets created
2. **Seed**: Call seed API to insert 96 questions, verify count
3. **Student browse**: Load `/student/drawings`, verify card grid, filters, category tabs work on mobile (375px)
4. **Student submit**: Upload a drawing photo for a question, verify it appears in submissions
5. **Teacher queue**: Log in as teacher, verify pending submission appears in review queue
6. **Sketch-over**: Open review, draw over image, save — verify composite image saved to storage
7. **Resource links**: Search library video, paste YouTube URL, verify they appear in student's feedback view
8. **Student feedback view**: Verify toggle between "My Drawing" and "Tutor Feedback" shows correct images + resources
9. **Mobile**: All pages tested at 375px viewport, 48px touch targets, no horizontal scroll
