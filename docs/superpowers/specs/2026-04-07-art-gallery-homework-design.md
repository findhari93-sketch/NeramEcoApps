# Art Gallery + Homework Assignment — Design Spec

> **Date:** 2026-04-07 | **Scope:** Phase 6 + Phase 7 of Drawing Module
> **Platform:** nexus.neramclasses.com | **Status:** Approved

---

## Phase 6: Art Gallery (Social Wall)

### What
Instagram/Pinterest-style social feed where tutor-approved student drawings are displayed. Students can react and comment on each other's work.

### Flow
1. Teacher reviews a submission and toggles "Publish to Gallery"
2. Published work appears on the Art Gallery tab (visible to all students)
3. Other students can: React (heart, clap, fire, star, wow) and Comment
4. Gallery feed: chronological default, filterable by category/student

### Database

**`drawing_gallery_reactions`:**
```sql
CREATE TABLE drawing_gallery_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES drawing_submissions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction_type TEXT NOT NULL CHECK (reaction_type IN ('heart', 'clap', 'fire', 'star', 'wow')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(submission_id, user_id, reaction_type)
);
```

Note: Gallery comments reuse the existing `drawing_submission_comments` table since it already supports author_role and is per-submission.

### Teacher Review Changes
- Add "Publish to Gallery" toggle in the review panel (already have `is_gallery_published` field on `drawing_submissions`)
- When teacher marks complete, show an optional "Publish to Gallery" checkbox

### Student UI
- New "Gallery" tab on the drawings page (alongside Questions/Foundation/Objects)
- Masonry or feed layout showing published submissions
- Each card: student avatar+name, drawing image, question text, tutor rating, reactions bar, comment count
- Tap to view full detail with reactions and comments
- Filter: All / 2D / 3D / Kit

### API Routes
- `GET /api/drawing/gallery` — paginated feed of published submissions with reaction counts
- `POST /api/drawing/gallery/[submissionId]/react` — add/remove reaction
- Gallery comments use existing `/api/drawing/submissions/[id]/comments`

### Gamification
- Published to gallery: +10 points (on teacher publish action)
- Receiving a reaction: +1 point each (capped at 20/day)

---

## Phase 7: Homework Assignment

### What
Teachers create drawing homework assignments linked to question bank questions or custom prompts. Students see pending homework in the Drawing module. Submission flow is the same as question bank practice.

### Database

**`drawing_homework`:**
```sql
CREATE TABLE drawing_homework (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  question_ids UUID[] DEFAULT '{}',
  reference_images JSONB DEFAULT '[]',
  assigned_to TEXT NOT NULL CHECK (assigned_to IN ('all_students', 'specific_students')),
  student_ids UUID[] DEFAULT '{}',
  due_date TIMESTAMPTZ NOT NULL,
  is_mandatory BOOLEAN DEFAULT false,
  created_by UUID NOT NULL REFERENCES users(id),
  classroom_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Teacher UI
- "Homework" button in Drawing Reviews page header
- Create homework dialog: title, description, select questions from bank (optional), upload reference images, assign to all or specific students, due date, mandatory toggle
- List of created homework with submission counts

### Student UI
- "Homework" tab on the drawings page (5th tab)
- Shows pending homework cards with due date, title, question links
- "Submit" button opens the submission sheet (source_type = 'homework', homework_id linked)
- Completed homework shows checkmark

### API Routes
- `GET /api/drawing/homework` — list homework (student: assigned to me, teacher: all created)
- `POST /api/drawing/homework` — create homework (teacher only)
- `GET /api/drawing/homework/[id]` — homework detail with submissions

### Submission Integration
- `drawing_submissions` already has `source_type = 'homework'` and `homework_id` column needed (we need to add it)
- When student submits for homework, the submission links to the homework ID

---

## Implementation Summary

### Migration: `20260507_art_gallery_and_homework.sql`
- Create `drawing_gallery_reactions`
- Create `drawing_homework`
- Add `homework_id UUID` to `drawing_submissions` (FK to drawing_homework)
- Indexes, RLS

### Files (~18 files)
- 1 migration
- Types + query functions (2 files modified)
- 5 API routes (gallery feed, react, homework CRUD)
- 3 new components (GalleryFeed, GalleryCard, HomeworkCard)
- Modify drawings page (add Gallery + Homework tabs)
- Modify teacher review page (add publish toggle)
