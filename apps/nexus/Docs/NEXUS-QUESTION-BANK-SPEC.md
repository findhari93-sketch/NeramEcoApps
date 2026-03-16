# Nexus Question & Learning Systems — Implementation Guide

> **App:** nexus.neramclasses.com
> **Stack:** Next.js 14 (App Router) / MUI v5 / Supabase / Microsoft Entra ID
> **Last Updated:** April 2026

---

## Table of Contents

1. [Feature Overview — Two Separate Systems](#1-feature-overview--two-separate-systems)
2. [Question Bank (PYQ System)](#2-question-bank-pyq-system)
3. [Question Sharing (Community Q&A)](#3-question-sharing-community-qa)
4. [Classroom-Scoped Access Control](#4-classroom-scoped-access-control)
5. [File Structure — Actual Implementation](#5-file-structure--actual-implementation)
6. [Database Schema — Question Bank](#6-database-schema--question-bank)
7. [Database Schema — Question Sharing](#7-database-schema--question-sharing)
8. [API Routes Reference](#8-api-routes-reference)
9. [Components Reference](#9-components-reference)
10. [Learning Modes](#10-learning-modes)
11. [Filtering & Navigation](#11-filtering--navigation)
12. [JEE vs NATA — Exam Differences](#12-jee-vs-nata--exam-differences)
13. [Bulk Upload Pipeline (Planned)](#13-bulk-upload-pipeline-planned)
14. [Implementation Status](#14-implementation-status)
15. [Planned Features](#15-planned-features)

---

## 1. Feature Overview — Two Separate Systems

Nexus has **two distinct question-related features**. They serve different purposes and should not be confused.

### Quick Comparison

| Aspect | Question Bank (QB) | Question Sharing |
|--------|-------------------|------------------|
| **Purpose** | Teacher-curated PYQ learning library | Community forum for students to share exam questions from memory |
| **URL path** | `/question-bank/...` | `/questions/...` |
| **API path** | `/api/question-bank/...` | `/api/questions/...` |
| **Content source** | Teachers/admins manually add verified questions | Students post questions they remember from exams |
| **Quality** | Verified, with correct answers and solutions | Crowd-sourced, improved over time via votes |
| **Access control** | Classroom-scoped (teacher must enable QB for classroom) | Available to all enrolled students |
| **Exam focus** | JEE Paper 2 (primary) + NATA | NATA (primary, since NATA doesn't publish papers) |
| **Answer format** | MCQ, Numerical, Drawing Prompt, Image-based | Free text with community improvements |
| **Status** | Fully implemented | Schema + basic UI exists, needs completion |

### Why Two Systems?

- **JEE Paper 2**: Official question papers are publicly available. Teachers digitize them into the QB with verified answers, solutions, and categorization. Students practice against known-correct questions.
- **NATA**: Does NOT publish official question papers. Students share what they remember after taking the exam. The community votes on accuracy and improves question wording. Over time, these crowd-sourced questions become reliable study material.

---

## 2. Question Bank (PYQ System)

### What It Does

Transforms static PDF question papers into a richly tagged, filterable, trackable learning experience. Students who thoroughly work through PYQs cover ~80% of JEE Paper 2 and NATA syllabus.

### Key Concepts

- **Source tag** = factual origin. "This question appeared in JEE 2022 Shift 1." A question can have multiple sources if repeated across years.
- **Relevance tag** = editorial judgment. A JEE math question beyond NATA level → "JEE only." An aptitude question useful for both → "Both JEE & NATA."
- **Classroom-scoped**: QB is only visible to students in classrooms where the teacher has explicitly enabled it (see Section 4).

### User Roles

| Role | Can Do |
|------|--------|
| **Teacher/Admin** | Create, edit, delete questions. Enable/disable QB per classroom. View all question stats. |
| **Student** | Practice questions (submit answers), study questions (read solutions), track progress. Save filter presets. Only if enrolled in a QB-enabled classroom. |

### Student Screens

| Screen | URL | Description |
|--------|-----|-------------|
| QB Home | `/student/question-bank` | Stats overview, saved presets, exploration entry points |
| Question List | `/student/question-bank/questions` | Filtered, infinite-scroll question list with mode toggle |
| Question Detail | `/student/question-bank/questions/[id]` | Full question view with practice/study mode |

### Teacher Screens

| Screen | URL | Description |
|--------|-----|-------------|
| QB Dashboard | `/teacher/question-bank` | Overview stats, quick actions |
| Question List | `/teacher/question-bank/questions` | All questions with edit/delete actions |
| Create Question | `/teacher/question-bank/new` | Multi-step question creation wizard |
| Edit Question | `/teacher/question-bank/questions/[id]/edit` | Edit existing question |
| QB Toggle | `/teacher/classrooms/[id]` (Overview tab) | Switch to enable/disable QB for a classroom |

### Question Formats Supported

| Format | Description | Answer Type | Auto-Scored? |
|--------|-------------|-------------|:---:|
| **MCQ** | Multiple choice (4 options, text + optional images) | Option ID (a/b/c/d) | Yes |
| **NUMERICAL** | Numeric answer with tolerance | Number | Yes |
| **DRAWING_PROMPT** | Sketching/drawing prompt | Descriptive text | No (study mode only) |
| **IMAGE_BASED** | Image stimulus with question | Varies | Depends on type |

---

## 3. Question Sharing (Community Q&A)

### What It Does

A community-driven platform where students post NATA exam questions from memory after taking the test. Other students vote on accuracy, suggest improvements, and help reconstruct the question. Over time, the best version emerges.

### Why It Exists

NATA does not release official question papers. The only way to build a question bank for NATA preparation is through crowd-sourced memory. This feature facilitates that process with:
- **Confidence levels** (1-5) on each post — how sure is the poster?
- **Improvement suggestions** — other students propose better wording
- **Voting** — community validates accuracy
- **Teacher verification** — teachers can accept the best improvement as the canonical version

### Current Status

- **Database schema**: Fully created (tables, indexes, triggers, contribution tracking)
- **Query layer**: Implemented in `packages/database/src/queries/question-bank.ts`
- **API routes**: Basic route at `/api/questions/`
- **Student UI**: Page at `/student/questions/` — basic implementation
- **Teacher UI**: Page at `/teacher/questions/` — for verification/moderation
- **What's missing**: Full voting UI, improvement submission flow, contribution badges, progressive unlock system

### Tables

| Table | Purpose |
|-------|---------|
| `question_posts` | Main questions posted by students |
| `question_votes` | Up/down votes on questions |
| `question_comments` | Discussion threads on questions |
| `comment_votes` | Votes on comments |
| `question_improvements` | Suggested rewording/corrections |
| `improvement_votes` | Votes on improvements |
| `user_qb_stats` | Contribution tracking (questions posted, improvements, sessions reported) |

---

## 4. Classroom-Scoped Access Control

### How It Works

QB is NOT a global feature — it's gated per classroom. A teacher must explicitly enable QB for their classroom before students in that classroom can see or access it.

### Access Flow

```
Teacher enables QB for Classroom X
  → nexus_qb_classroom_links row created (classroom_id, is_active=true)
  → Students enrolled in Classroom X now see "Question Bank" in their sidebar
  → Students NOT in Classroom X (or in classrooms without QB) don't see it at all
```

### Implementation Layers

**Layer 1: Client-side nav visibility** (`useQBAccess` hook)
- File: `apps/nexus/src/hooks/useQBAccess.ts`
- Checks if QB is enabled for the student's active classroom
- Filters QB nav item from sidebar and bottom nav when not enabled
- Teachers/admins always see QB (they manage it)

**Layer 2: Page-level check** (student QB pages)
- Each student QB page checks `activeClassroom` before loading
- Shows "not available" message if QB not enabled

**Layer 3: API-level enforcement** (`verifyQBAccess` helper)
- File: `apps/nexus/src/lib/qb-auth.ts`
- Every student-facing QB API route calls `verifyQBAccess()`
- Verifies: valid MS token → user exists → teacher/admin (bypass) OR student enrolled + QB enabled
- Returns 403 if student is not enrolled or QB not enabled for their classroom

### Key Tables

| Table | Purpose |
|-------|---------|
| `nexus_qb_classroom_links` | Maps classroom_id → is_active (QB toggle) |
| `nexus_enrollments` | Maps user_id → classroom_id + role |

### Teacher Toggle

In the classroom detail page (`/teacher/classrooms/[id]`), the Overview tab has a "Question Bank" switch. Toggling it calls:
- **Enable**: `POST /api/question-bank/classroom-link` with `{ classroom_id, enabled: true }`
- **Disable**: `DELETE /api/question-bank/classroom-link` with `{ classroom_id }`

---

## 5. File Structure — Actual Implementation

### Student Pages
```
apps/nexus/src/app/(student)/student/
├── question-bank/
│   ├── page.tsx                          # QB home — stats, presets, explore
│   └── questions/
│       ├── page.tsx                      # Question list with filters + infinite scroll
│       └── [questionId]/
│           └── page.tsx                  # Question detail (practice/study mode)
└── questions/
    └── page.tsx                          # Question Sharing (community Q&A) — separate feature
```

### Teacher Pages
```
apps/nexus/src/app/(teacher)/teacher/
├── question-bank/
│   ├── page.tsx                          # QB dashboard
│   ├── new/
│   │   └── page.tsx                      # Create new question (wizard)
│   └── questions/
│       ├── page.tsx                      # Question list (teacher view)
│       └── [questionId]/
│           └── edit/
│               └── page.tsx              # Edit question
├── questions/
│   └── page.tsx                          # Question Sharing moderation — separate feature
└── classrooms/
    └── [id]/
        └── page.tsx                      # Classroom detail (has QB toggle in Overview tab)
```

### API Routes
```
apps/nexus/src/app/api/
├── question-bank/                        # QB API (PYQ system)
│   ├── questions/
│   │   ├── route.ts                      # GET (list) + POST (create)
│   │   └── [id]/
│   │       ├── route.ts                  # GET (detail) + PATCH + DELETE
│   │       ├── attempt/
│   │       │   └── route.ts              # POST (record attempt)
│   │       └── study-mark/
│   │           └── route.ts              # POST (toggle study mark)
│   ├── topics/
│   │   └── route.ts                      # GET (list topics)
│   ├── presets/
│   │   ├── route.ts                      # GET (list) + POST (create)
│   │   └── [id]/
│   │       └── route.ts                  # GET + PUT (individual preset)
│   ├── stats/
│   │   └── route.ts                      # GET (student progress stats)
│   └── classroom-link/
│       └── route.ts                      # GET/POST/DELETE (QB toggle per classroom)
└── questions/                            # Question Sharing API — separate feature
    └── route.ts                          # Community Q&A endpoints
```

### Components
```
apps/nexus/src/components/question-bank/
├── QuestionCard.tsx                       # Question preview in list view
├── QuestionDetail.tsx                     # Full question view with answer area
├── QuestionFormWizard.tsx                 # Multi-step form for creating/editing
├── FilterDrawer.tsx                       # Bottom sheet/drawer for filtering
├── FilterChips.tsx                        # Active filter chips with remove
├── MCQOptions.tsx                         # MCQ answer options display
├── SolutionSection.tsx                    # Solution/explanation expandable section
├── CategoryChips.tsx                      # Category badge display
├── DifficultyChip.tsx                     # Difficulty level indicator
├── PresetChips.tsx                        # Saved preset chips
├── SourceBadges.tsx                       # Exam source attribution badges
├── RepeatBadges.tsx                       # "Also appeared in" badges
├── AttemptIndicator.tsx                   # Student attempt status indicator
└── StatsRow.tsx                           # Statistics/metrics display
```

### Hooks
```
apps/nexus/src/hooks/
├── useQBAccess.ts                         # Classroom-scoped QB access check
└── useNexusAuth.tsx                       # Auth context (activeClassroom, getToken, etc.)
```

### Shared Auth
```
apps/nexus/src/lib/
├── qb-auth.ts                             # verifyQBAccess() — API enrollment guard
└── ms-verify.ts                           # MS token verification
```

### Database Queries
```
packages/database/src/queries/
├── nexus/
│   ├── question-bank.ts                   # Nexus QB queries (CRUD, search, attempts, study marks)
│   └── index.ts                           # Re-exports all nexus queries
├── question-bank.ts                       # Question Sharing queries (posts, votes, improvements)
└── qb-stats.ts                            # QB statistics/analytics
```

---

## 6. Database Schema — Question Bank

### Migration: `20260404_nexus_question_bank.sql`

This is the latest QB schema. Key tables:

### `nexus_qb_questions`
Main question table.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `content_text` | TEXT | Question text (Markdown) |
| `content_image_url` | TEXT | Question image URL |
| `question_format` | ENUM | MCQ / NUMERICAL / DRAWING_PROMPT / IMAGE_BASED |
| `correct_answer` | TEXT | Correct answer (option ID for MCQ, number for NUMERICAL) |
| `answer_tolerance` | NUMERIC | For NUMERICAL: acceptable deviation |
| `explanation_brief` | TEXT | Short explanation (required) |
| `explanation_detailed` | TEXT | Detailed explanation (optional) |
| `solution_image_url` | TEXT | Solution image URL |
| `solution_video_url` | TEXT | YouTube video URL |
| `difficulty` | ENUM | EASY / MEDIUM / HARD |
| `exam_relevance` | TEXT[] | Array: JEE, NATA, or both |
| `categories` | TEXT[] | e.g., GK, MATH, APTITUDE, DRAWING |
| `topic_id` | UUID | FK to `nexus_qb_topics` |
| `repeat_group_id` | UUID | Shared ID for repeated questions |
| `is_active` | BOOLEAN | Soft delete flag |
| `created_by` | UUID | Teacher/admin who created |

### `nexus_qb_question_options`
MCQ options (separate table, not JSONB).

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `question_id` | UUID | FK to questions |
| `option_key` | TEXT | a, b, c, d |
| `option_text` | TEXT | Option text |
| `option_image_url` | TEXT | Optional image |

### `nexus_qb_question_sources`
Links questions to exam appearances (supports repeat tracking).

| Column | Type | Description |
|--------|------|-------------|
| `question_id` | UUID | FK to questions |
| `exam_type` | TEXT | JEE_PAPER_2 / NATA |
| `exam_year` | INTEGER | e.g., 2023 |
| `exam_session` | TEXT | e.g., Shift 1 |
| `question_number` | INTEGER | Original Q number |

### `nexus_qb_student_attempts`
Records every practice attempt.

| Column | Type | Description |
|--------|------|-------------|
| `student_id` | UUID | Student who attempted |
| `question_id` | UUID | Question attempted |
| `selected_answer` | TEXT | Student's answer |
| `is_correct` | BOOLEAN | Whether answer was correct |
| `mode` | TEXT | practice / study |

### `nexus_qb_study_marks`
Tracks "Studied" toggle in study mode.

### `nexus_qb_saved_presets`
Student's saved filter presets (name + JSONB filter state).

### `nexus_qb_topics`
Hierarchical topic tree for categorization.

### `nexus_qb_classroom_links`
QB access control per classroom.

| Column | Type | Description |
|--------|------|-------------|
| `classroom_id` | UUID | FK to classroom |
| `is_active` | BOOLEAN | Whether QB is enabled |

---

## 7. Database Schema — Question Sharing

### Migrations
- `20260301_question_sharing.sql` — Base tables
- `20260302_question_bank_v2.sql` — Voting system, improvements, confidence levels
- `20260305_contribution_tracking.sql` — `user_qb_stats` for progressive unlock
- `20260307110000_question_moderation_callbacks.sql` — Moderation callbacks

### Key Tables

**`question_posts`** — Main questions posted by students
- `title`, `body`, `category` (NataQuestionCategory), `exam_type`, `exam_year`, `exam_session`
- `image_urls` (TEXT[]), `tags` (TEXT[])
- `vote_score`, `upvote_count`, `downvote_count`
- `status` (pending/approved/rejected/flagged)
- `confidence_level` (1-5)
- `is_admin_post` flag
- `improvement_count`, `best_improvement_id`

**`question_votes`** — Up/down voting
- Replaces older `question_likes` (deprecated)

**`question_improvements`** — Suggested corrections
- `is_accepted` flag for best improvement
- Own vote tracking

**`question_comments`** — Threaded discussion
- Supports `parent_id` for replies

**`user_qb_stats`** — Contribution tracking
- `questions_posted`, `improvements_posted`, `sessions_reported`, `comments_posted`
- `contribution_score` (computed)

---

## 8. API Routes Reference

### Question Bank API (all require auth, students need enrollment + QB enabled)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/question-bank/questions` | Student: enrollment + QB / Teacher: always | List questions with filters |
| POST | `/api/question-bank/questions` | Teacher/Admin only | Create new question |
| GET | `/api/question-bank/questions/[id]` | Student: enrollment + QB / Teacher: always | Get question detail |
| PATCH | `/api/question-bank/questions/[id]` | Teacher/Admin only | Update question |
| DELETE | `/api/question-bank/questions/[id]` | Teacher/Admin only | Delete question |
| POST | `/api/question-bank/questions/[id]/attempt` | Student: enrollment + QB | Record practice attempt |
| POST | `/api/question-bank/questions/[id]/study-mark` | Student: enrollment + QB | Toggle study mark |
| GET | `/api/question-bank/topics` | Any authenticated | List topics |
| GET | `/api/question-bank/presets` | Student: enrollment + QB | List saved presets |
| POST | `/api/question-bank/presets` | Student: enrollment + QB | Create preset |
| GET | `/api/question-bank/presets/[id]` | Student | Get preset detail |
| PUT | `/api/question-bank/presets/[id]` | Student | Update preset |
| GET | `/api/question-bank/stats` | Student: enrollment + QB | Get progress stats |
| GET | `/api/question-bank/classroom-link` | Any authenticated | Check if QB enabled for classroom |
| POST | `/api/question-bank/classroom-link` | Teacher/Admin | Enable QB for classroom |
| DELETE | `/api/question-bank/classroom-link` | Teacher/Admin | Disable QB for classroom |

### Question Sharing API

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET/POST | `/api/questions` | Enrolled students | List/create question posts |

---

## 9. Components Reference

| Component | Location | Purpose | Status |
|-----------|----------|---------|--------|
| `QuestionCard` | `components/question-bank/` | Question preview in list view | Built |
| `QuestionDetail` | `components/question-bank/` | Full question view with answer area | Built |
| `QuestionFormWizard` | `components/question-bank/` | Multi-step create/edit form | Built |
| `FilterDrawer` | `components/question-bank/` | Bottom sheet filter panel | Built |
| `FilterChips` | `components/question-bank/` | Active filter chips (removable) | Built |
| `MCQOptions` | `components/question-bank/` | MCQ option radio buttons | Built |
| `SolutionSection` | `components/question-bank/` | Expandable solution display | Built |
| `CategoryChips` | `components/question-bank/` | Category tag badges | Built |
| `DifficultyChip` | `components/question-bank/` | Color-coded difficulty | Built |
| `PresetChips` | `components/question-bank/` | Saved preset chips | Built |
| `SourceBadges` | `components/question-bank/` | Exam source badges | Built |
| `RepeatBadges` | `components/question-bank/` | "Also appeared in" badges | Built |
| `AttemptIndicator` | `components/question-bank/` | Attempt status icon | Built |
| `StatsRow` | `components/question-bank/` | Statistics display | Built |

---

## 10. Learning Modes

### Practice Mode (default)

| Aspect | Behavior |
|--------|----------|
| Answer input | Active — student selects/enters answer |
| Submit | Required before seeing correct answer |
| Feedback | Immediate correct/incorrect + brief explanation |
| Solution | Hidden until after submit, then expandable |
| Tracking | Every submit recorded in `nexus_qb_student_attempts` |
| Navigation | Sequential with prev/next within filtered set |
| Swipe | Horizontal swipe for prev/next (mobile, placeholder) |

### Study Mode

| Aspect | Behavior |
|--------|----------|
| Answer input | None — correct answer shown immediately |
| Submit | None |
| Feedback | Always visible |
| Solution | Expanded by default |
| Tracking | Manual "Studied" toggle only (`nexus_qb_study_marks`) |
| Navigation | Free browsing |

### Year Paper Mode (Planned — not yet built)

| Aspect | Behavior |
|--------|----------|
| Entry | Select specific exam year + session |
| Questions | Original order from the paper |
| Timer | Full exam duration timer |
| Feedback | Deferred until completing entire paper |
| Results | Score summary + per-category breakdown |

---

## 11. Filtering & Navigation

### Filter Dimensions (all implemented)

| Filter | Type | URL Param | DB Column |
|--------|------|-----------|-----------|
| Exam relevance | Single-select | `exam` | `exam_relevance` array |
| Exam years | Multi-select | `years` | JOIN `nexus_qb_question_sources` |
| Categories | Multi-select | `cat` | `categories` array |
| Difficulty | Multi-select | `diff` | `difficulty` |
| Question format | Multi-select | `fmt` | `question_format` |
| Attempt status | Single-select | `status` | JOIN `nexus_qb_student_attempts` |
| Search text | Free text | `q` | `content_text` ILIKE |
| Topic | Multi-select | `topics` | `topic_id` |

### URL Synchronization

All filter state is reflected in URL params for shareability:
```
/student/question-bank/questions?exam=JEE&years=2022,2023&cat=GK,APTITUDE&diff=HARD&status=unattempted
```

### Infinite Scroll

Question list uses `IntersectionObserver` with a sentinel element. Page size: 20. Loads next page when sentinel enters viewport (200px margin).

---

## 12. JEE vs NATA — Exam Differences

### JEE Paper 2 (Architecture)

| Aspect | Details |
|--------|---------|
| **Conducting body** | NTA (National Testing Agency) |
| **Papers released?** | Yes — official PDFs available after exam |
| **Question types** | MCQ + Numerical (Part I: Math, Aptitude) + Drawing (Part II) |
| **Marking scheme** | +4 correct, -1 wrong (MCQ), +4 correct/0 wrong (Numerical) |
| **Drawing** | 2 questions, manually evaluated (50 marks each) |
| **Shifts** | Multiple shifts per session (Shift 1, Shift 2) |
| **Answer key** | Official answer key published by NTA |
| **Our approach** | Digitize from official papers → verified questions with known answers |

### NATA (National Aptitude Test in Architecture)

| Aspect | Details |
|--------|---------|
| **Conducting body** | CoA (Council of Architecture) |
| **Papers released?** | NO — questions are NOT published |
| **Question types** | MCQ (Part A: Math, GK, Aptitude, Reasoning) + Drawing (Part B) |
| **Marking scheme** | Varies by section |
| **Tests per year** | Multiple test dates (Test 1, Test 2, Test 3) |
| **Answer key** | NOT published |
| **Our approach** | Students share from memory → community verification → Question Sharing feature |

### Answer Sheet Template Differences

**JEE Paper 2 Answer Sheet:**
- OMR-based (bubble sheet) for MCQ/Numerical sections
- Separate drawing sheet for Part II (usually A3/A4)
- Structured grid with question numbers

**NATA Answer Sheet:**
- Computer-based for Part A (online MCQ interface)
- Physical drawing sheet for Part B
- Drawing evaluated on composition, proportion, color sense, creativity

### How This Affects the App

| Feature | JEE | NATA |
|---------|-----|------|
| Question Bank source | Official papers (teacher uploads) | N/A (papers not available) |
| Question Sharing source | Not needed (official papers exist) | Primary source (student memory) |
| Auto-scoring | Yes (MCQ + Numerical) | Yes (MCQ only) |
| Drawing questions | Reference images provided | From student descriptions |
| Relevance tagging | JEE-only, NATA-only, or Both | Based on teacher judgment |

---

## 13. Bulk Upload Pipeline (Planned)

### Vision

Upload a complete question paper (e.g., "JEE 2026 Shift 1") and have it automatically analyzed, categorized, and added to the QB.

### Approach: AI-Assisted Digitization

```
Upload PDF/images of question paper
  → AI (Claude API) extracts individual questions
  → Each question auto-categorized (topic, difficulty, format)
  → Teacher reviews and corrects in a preview grid
  → Confirmed questions inserted into QB with source tags
```

### CSV Template (for manual bulk import)

```csv
content_text,question_format,option_a,option_b,option_c,option_d,correct_answer,explanation_brief,exam_type,exam_year,exam_session,question_number,difficulty,categories,topic_name
"Which Mughal emperor built Buland Darwaza?",MCQ,"Akbar","Shah Jahan","Humayun","Aurangzeb",a,"Akbar built it in 1576 at Fatehpur Sikri.",JEE_PAPER_2,2023,Shift 1,12,EASY,"GK,HISTORY_OF_ARCHITECTURE","History of Architecture"
```

### Import Flow (BulkImportWizard — not yet built)

1. **Upload** — CSV/JSON file + optional ZIP of images
2. **Validate** — Parse, check required fields, enum values, image references
3. **Preview** — Show first 10 questions rendered as they'll appear
4. **Confirm** — Progress bar, upload images, create records
5. **Post-Import** — Link to just-imported questions, prompt for solution videos

### AI Pipeline (future)

1. Upload PDF of question paper
2. Claude API extracts text + identifies question boundaries
3. OCR for image-based questions (diagrams, figures)
4. Auto-categorize: topic, difficulty, exam relevance
5. Teacher reviews in a spreadsheet-like UI
6. One-click import all approved questions

---

## 14. Implementation Status

### Question Bank (PYQ System)

| Feature | Status | Notes |
|---------|--------|-------|
| DB schema (tables, indexes) | Done | Migration: `20260404_nexus_question_bank.sql` |
| Question CRUD (API + teacher UI) | Done | Create, edit, delete, list |
| Question creation wizard | Done | `QuestionFormWizard.tsx` — multi-step form |
| Student question list | Done | Filters, infinite scroll, mode toggle |
| Student question detail | Done | Practice mode, study mode, solutions |
| Practice mode (attempt + scoring) | Done | MCQ auto-scored, attempt tracking |
| Study mode (studied toggle) | Done | Study marks, solutions expanded |
| Filter system | Done | 8 filter dimensions + URL sync |
| Saved presets | Done | Create, load, per-student |
| Classroom-scoped access | Done | Hook + API guard + teacher toggle |
| Source badges + repeat linking | Done | `SourceBadges`, `RepeatBadges` components |
| Solution section (text + image + video) | Done | `SolutionSection` component |
| Stats/progress | Done | API endpoint + `StatsRow` component |
| Year Paper Mode | Not started | Full paper simulation with timer |
| Bulk import (CSV) | Not started | Spec exists, needs implementation |
| AI-assisted import (PDF → questions) | Not started | Needs Claude API integration |
| Smart suggestions | Not started | Based on attendance/progress |
| Progress dashboard with charts | Not started | Needs charts library |
| Original paper PDF viewer | Not started | In-app PDF renderer |

### Question Sharing (Community Q&A)

| Feature | Status | Notes |
|---------|--------|-------|
| DB schema (all tables) | Done | 4 migrations |
| Query layer | Done | `packages/database/src/queries/question-bank.ts` |
| Student posting page | Basic | `/student/questions/` exists |
| Teacher moderation page | Basic | `/teacher/questions/` exists |
| Voting system (up/down) | Schema done | UI not complete |
| Improvement suggestions | Schema done | UI not complete |
| Contribution tracking | Schema done | `user_qb_stats` + triggers |
| Progressive unlock | Schema done | Based on contribution_score |
| Full voting + improvement UI | Not done | Needs frontend work |
| Contribution badges | Not done | Needs design + implementation |

### Classroom Access Control

| Feature | Status | Notes |
|---------|--------|-------|
| `useQBAccess` hook | Done | Client-side nav filtering |
| Student layout filtering | Done | QB nav hidden when not enabled |
| `verifyQBAccess` API guard | Done | All student QB APIs protected |
| Teacher QB toggle (classroom detail) | Done | Switch in Overview tab |
| `nexus_qb_classroom_links` table | Done | classroom_id → is_active |

---

## 15. Planned Features

### Priority 1 — Bulk Upload

Enable teachers to quickly add many questions at once instead of one-by-one through the wizard.

**Sub-features:**
1. CSV/JSON upload with validation
2. Image ZIP upload for question/solution images
3. Preview grid before confirming import
4. AI-assisted PDF extraction (Claude API)

### Priority 2 — Year Paper Mode

Simulate a full exam paper experience with timer, deferred feedback, and score summary.

**Requirements:**
- `nexus_qb_original_papers` table for paper metadata
- Timer based on exam duration
- Question palette (grid of Q numbers)
- Deferred feedback (show all results at end)
- Score breakdown by category

### Priority 3 — Question Sharing Completion

Complete the community Q&A feature for NATA questions.

**Requirements:**
- Full voting UI (upvote/downvote on questions and improvements)
- Improvement submission flow
- Teacher verification workflow (accept best improvement)
- Contribution badges and progressive unlock
- Session reporting (students report NATA test sessions)

### Priority 4 — Smart Suggestions Engine

Connect QB to attendance/curriculum for personalized study recommendations.

**Types:**
1. Topic-based: "You covered [Topic] yesterday — [N] PYQs available"
2. Gap-based: "You've attempted 0 [Category] questions"
3. Weakness-based: "You got [N] [Category] wrong — try again?"
4. Repeat-priority: "[N] questions from [Year] are repeats — high priority!"

### Priority 5 — Progress Dashboard

Visual analytics for student learning progress.

**Requirements:**
- Accuracy by category (bar chart)
- Attempts over time (line chart)
- Topic coverage (radar chart)
- Comparison with class average

---

> **End of implementation guide.** This document reflects the actual state of the codebase as of April 2026. Update this document when significant features are added or changed.
