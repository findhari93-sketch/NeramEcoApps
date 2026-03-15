# Nexus Question Bank Module — Implementation Spec

> **Module:** Question Bank (PYQ Learning System)
> **App:** nexus.neramclasses.com
> **Stack:** Next.js (App Router) / Microsoft Fluent UI v9 / Supabase / Microsoft Entra ID
> **Version:** 1.0 — March 2026
> **Status:** Ready for Implementation

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture & File Structure](#2-architecture--file-structure)
3. [Supabase Schema](#3-supabase-schema)
4. [Enums & Constants](#4-enums--constants)
5. [Storage Buckets](#5-storage-buckets)
6. [Row Level Security (RLS)](#6-row-level-security-rls)
7. [Database Indexes](#7-database-indexes)
8. [API Layer — Server Actions & Queries](#8-api-layer--server-actions--queries)
9. [Admin & Teacher Screens](#9-admin--teacher-screens)
10. [Student-Facing Screens](#10-student-facing-screens)
11. [Learning Modes](#11-learning-modes)
12. [Filtering & Navigation System](#12-filtering--navigation-system)
13. [Saved Filter Presets](#13-saved-filter-presets)
14. [Repeat Question Linking](#14-repeat-question-linking)
15. [Solution Attachments](#15-solution-attachments)
16. [Attempt Tracking](#16-attempt-tracking)
17. [Original Paper PDF Viewer](#17-original-paper-pdf-viewer)
18. [Bulk Import Pipeline](#18-bulk-import-pipeline)
19. [Nexus Integration Points](#19-nexus-integration-points)
20. [Smart Suggestions Engine](#20-smart-suggestions-engine)
21. [Mobile-First UX Requirements](#21-mobile-first-ux-requirements)
22. [Performance & Caching](#22-performance--caching)
23. [Phased Build Plan](#23-phased-build-plan)
24. [Component Reference](#24-component-reference)
25. [Open Decisions](#25-open-decisions)

---

## 1. Overview

### What This Module Does

The Question Bank is a multi-dimensional previous-year question (PYQ) learning system. It transforms static PDF question papers into a richly tagged, filterable, trackable learning experience.

### Core Insight

Students who thoroughly work through PYQs cover ~80% of JEE Paper 2 and NATA syllabus. Many questions repeat across years. Currently this content is locked in flat PDFs with no intelligent navigation.

### Starting Scope

- **Exam:** JEE Paper 2 only (all available years, going back as far as possible)
- **Expand later:** NATA questions in Phase 4
- **Question formats:** Text, images (diagrams/figures/architectural drawings), and drawing prompts
- **Content entry:** Both manual (single question form) and bulk import (CSV/JSON)
- **Solution videos:** YouTube (public/unlisted) — embedded, not self-hosted
- **Content curators:** Admins and teachers (not students)

### Key Concepts

**Source tag** = factual origin. "This question appeared in JEE 2022 Shift 1." A question can have multiple sources if repeated.

**Relevance tag** = editorial judgment by admin/teacher. A JEE math question beyond NATA level → "JEE only." An aptitude question useful for both → "Both JEE & NATA."

When a student selects "Preparing for NATA," they see everything tagged NATA-relevant, regardless of original source. The source badge is always visible.

---

## 2. Architecture & File Structure

```
nexus.neramclasses.com/
├── src/
│   ├── app/
│   │   ├── (student)/
│   │   │   └── question-bank/
│   │   │       ├── page.tsx                    # QB home — stats, presets, exploration entry
│   │   │       ├── questions/
│   │   │       │   ├── page.tsx                # Question list with filters
│   │   │       │   └── [questionId]/
│   │   │       │       └── page.tsx            # Question detail view (Practice/Study mode)
│   │   │       ├── year-paper/
│   │   │       │   └── [examYear]/
│   │   │       │       └── page.tsx            # Full paper simulation mode
│   │   │       └── progress/
│   │   │           └── page.tsx                # Student progress analytics
│   │   │
│   │   ├── (admin)/
│   │   │   └── question-bank/
│   │   │       ├── page.tsx                    # Admin QB dashboard (stats, health metrics)
│   │   │       ├── questions/
│   │   │       │   ├── page.tsx                # Admin question list (editable)
│   │   │       │   ├── new/
│   │   │       │   │   └── page.tsx            # Manual question entry form
│   │   │       │   └── [questionId]/
│   │   │       │       └── edit/
│   │   │       │           └── page.tsx        # Edit existing question
│   │   │       ├── import/
│   │   │       │   └── page.tsx                # Bulk import pipeline UI
│   │   │       ├── papers/
│   │   │       │   └── page.tsx                # Original paper PDF management
│   │   │       └── repeat-groups/
│   │   │           └── page.tsx                # Manage repeat question links
│   │   │
│   │   └── api/
│   │       └── question-bank/
│   │           ├── questions/
│   │           │   └── route.ts                # Questions CRUD API
│   │           ├── attempts/
│   │           │   └── route.ts                # Student attempt recording
│   │           ├── import/
│   │           │   └── route.ts                # Bulk import processing
│   │           └── progress/
│   │               └── route.ts                # Progress analytics aggregation
│   │
│   ├── components/
│   │   └── question-bank/
│   │       ├── QuestionCard.tsx                 # Question card in list view
│   │       ├── QuestionDetail.tsx               # Full question view with answer area
│   │       ├── QuestionForm.tsx                 # Admin question entry/edit form
│   │       ├── FilterPanel.tsx                  # Slide-up filter panel
│   │       ├── FilterChips.tsx                  # Active filter chip display
│   │       ├── SavedPresetBar.tsx               # Horizontal preset chips bar
│   │       ├── PracticeModeView.tsx             # Practice mode wrapper
│   │       ├── StudyModeView.tsx                # Study mode wrapper
│   │       ├── YearPaperView.tsx                # Full paper simulation
│   │       ├── AttemptFeedback.tsx              # Correct/incorrect feedback display
│   │       ├── SolutionSection.tsx              # Expandable solution (video/image/text)
│   │       ├── RepeatBadges.tsx                 # "Also appeared in" badges
│   │       ├── AttemptHistory.tsx               # Student's attempt history on a question
│   │       ├── ProgressDashboard.tsx            # Progress charts and stats
│   │       ├── BulkImportWizard.tsx             # Multi-step import flow
│   │       ├── PaperPDFViewer.tsx               # In-app PDF renderer
│   │       ├── QuestionStats.tsx                # Quick stats display (total, attempted, accuracy)
│   │       ├── DifficultyBadge.tsx              # Color-coded difficulty indicator
│   │       ├── SourceBadge.tsx                  # Exam year/session badge
│   │       ├── CategoryChip.tsx                 # Category tag chip
│   │       └── ModeToggle.tsx                   # Practice/Study mode switch
│   │
│   ├── hooks/
│   │   └── question-bank/
│   │       ├── useQuestions.ts                  # Fetch questions with filters
│   │       ├── useQuestionDetail.ts             # Fetch single question with solutions
│   │       ├── useAttempt.ts                    # Submit and track attempts
│   │       ├── useProgress.ts                   # Fetch student progress data
│   │       ├── useFilterState.ts                # Filter state management + URL sync
│   │       ├── usePresets.ts                    # Saved preset CRUD
│   │       └── usePaperSimulation.ts            # Year paper mode state + timer
│   │
│   ├── lib/
│   │   └── question-bank/
│   │       ├── types.ts                        # TypeScript types and interfaces
│   │       ├── constants.ts                    # Enums, category lists, config
│   │       ├── filters.ts                      # Filter logic and URL param serialization
│   │       ├── scoring.ts                      # Answer checking logic
│   │       └── import-validator.ts             # Bulk import CSV/JSON validation
│   │
│   └── actions/
│       └── question-bank/
│           ├── questions.ts                    # Server actions for question CRUD
│           ├── attempts.ts                     # Server actions for attempt recording
│           ├── presets.ts                      # Server actions for preset management
│           └── import.ts                       # Server actions for bulk import
```

---

## 3. Supabase Schema

### 3.1 `qb_questions` table

```sql
CREATE TABLE qb_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Content
  content_text TEXT,                              -- Question text (Markdown supported)
  content_image_url TEXT,                         -- URL to question image in storage
  question_format question_format_enum NOT NULL,  -- MCQ | NUMERICAL | DRAWING_PROMPT | IMAGE_BASED

  -- Answer
  options JSONB,                                  -- For MCQ: [{id: "a", text: "...", image_url: "..."}, ...]
  correct_answer TEXT NOT NULL,                   -- Option ID for MCQ, numeric for NUMERICAL, descriptive for DRAWING
  answer_tolerance NUMERIC,                       -- For NUMERICAL: acceptable deviation (e.g., 0.01)

  -- Solutions
  explanation_brief TEXT NOT NULL,                -- Short explanation (always required, 2-3 sentences)
  explanation_detailed TEXT,                      -- Longer detailed explanation (optional)
  solution_image_url TEXT,                        -- URL to step-by-step solution image
  solution_video_url TEXT,                        -- YouTube video URL
  nexus_lesson_ref UUID,                         -- FK to Nexus curriculum lesson (nullable)

  -- Metadata
  difficulty difficulty_level_enum NOT NULL DEFAULT 'MEDIUM',
  exam_relevance exam_relevance_enum[] NOT NULL,  -- Array: {'JEE'} or {'NATA'} or {'JEE','NATA'}
  categories TEXT[] NOT NULL DEFAULT '{}',         -- ['GK', 'MATH', 'APTITUDE', 'DRAWING', etc.]
  topic_id UUID REFERENCES qb_topics(id),         -- FK to topics table
  sub_topic TEXT,                                  -- Optional sub-topic text

  -- Repeat tracking
  repeat_group_id UUID,                           -- Shared UUID for repeated/similar questions

  -- Paper context
  original_paper_id UUID REFERENCES qb_original_papers(id),
  original_paper_page INTEGER,                    -- Page number in original PDF
  display_order INTEGER,                          -- Order within the original paper

  -- System
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,                       -- Admin/teacher who created
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update updated_at
CREATE TRIGGER qb_questions_updated_at
  BEFORE UPDATE ON qb_questions
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);
```

### 3.2 `qb_question_sources` table (junction — links questions to exam appearances)

```sql
CREATE TABLE qb_question_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES qb_questions(id) ON DELETE CASCADE,
  exam_type exam_type_enum NOT NULL,              -- JEE_PAPER_2 | NATA
  exam_year INTEGER NOT NULL,                     -- e.g., 2023
  exam_session TEXT,                              -- e.g., "Shift 1", "Test 3", "Jan Attempt"
  question_number INTEGER,                        -- Original Q number in that paper
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(question_id, exam_type, exam_year, exam_session)
);
```

### 3.3 `qb_student_attempts` table

```sql
CREATE TABLE qb_student_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,                       -- References Nexus student profile
  question_id UUID NOT NULL REFERENCES qb_questions(id) ON DELETE CASCADE,
  selected_answer TEXT NOT NULL,                   -- Student's response
  is_correct BOOLEAN NOT NULL,
  time_spent_seconds INTEGER,                     -- How long spent on this question
  mode TEXT NOT NULL DEFAULT 'practice',           -- 'practice' | 'year_paper'
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3.4 `qb_saved_presets` table

```sql
CREATE TABLE qb_saved_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  preset_name TEXT NOT NULL,                      -- e.g., "My NATA Aptitude Practice"
  filters JSONB NOT NULL,                         -- Serialized filter state
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3.5 `qb_topics` table (curriculum alignment)

```sql
CREATE TABLE qb_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                             -- e.g., "History of Architecture — Ancient Period"
  parent_id UUID REFERENCES qb_topics(id),        -- Hierarchical: parent topic
  display_order INTEGER NOT NULL DEFAULT 0,
  nexus_curriculum_ref UUID,                      -- FK to Nexus curriculum topic if exists
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3.6 `qb_original_papers` table

```sql
CREATE TABLE qb_original_papers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_type exam_type_enum NOT NULL,
  exam_year INTEGER NOT NULL,
  exam_session TEXT,                              -- "Shift 1", "Shift 2", etc.
  pdf_url TEXT NOT NULL,                          -- URL to PDF in storage
  total_questions INTEGER,
  total_marks INTEGER,
  duration_minutes INTEGER,                       -- Exam duration (for Year Paper mode timer)
  uploaded_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(exam_type, exam_year, exam_session)
);
```

### 3.7 `qb_study_marks` table (for Study Mode "Studied" toggle)

```sql
CREATE TABLE qb_study_marks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  question_id UUID NOT NULL REFERENCES qb_questions(id) ON DELETE CASCADE,
  marked_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(student_id, question_id)
);
```

---

## 4. Enums & Constants

### 4.1 Database Enums

```sql
CREATE TYPE question_format_enum AS ENUM ('MCQ', 'NUMERICAL', 'DRAWING_PROMPT', 'IMAGE_BASED');
CREATE TYPE difficulty_level_enum AS ENUM ('EASY', 'MEDIUM', 'HARD');
CREATE TYPE exam_type_enum AS ENUM ('JEE_PAPER_2', 'NATA');
CREATE TYPE exam_relevance_enum AS ENUM ('JEE', 'NATA');
```

### 4.2 Category Constants (application-level)

```typescript
// lib/question-bank/constants.ts

export const QUESTION_CATEGORIES = [
  'GK',                        // General Knowledge
  'HISTORY_OF_ARCHITECTURE',   // History of Architecture
  'MATH',                      // Mathematics
  'APTITUDE',                  // Architectural Aptitude
  'DRAWING',                   // Drawing / Sketching
  'PUZZLE',                    // Puzzles & Logical Reasoning
  'IMAGE_BASED',               // Questions with image stimulus
  'PERSPECTIVE',               // Perspective Drawing
  'BUILDING_MATERIALS',        // Materials & Construction
  'BUILDING_SERVICES',         // Services (plumbing, electrical, etc.)
  'PLANNING',                  // Town Planning & Urban Design
  'SUSTAINABILITY',            // Green building, climate
  'FAMOUS_ARCHITECTS',         // Architects & their works
  'CURRENT_AFFAIRS',           // Architecture-related current affairs
  'VISUALIZATION_3D',          // 3D visualization, elevation, plan reading
] as const;

export type QuestionCategory = typeof QUESTION_CATEGORIES[number];

export const CATEGORY_LABELS: Record<QuestionCategory, string> = {
  GK: 'General Knowledge',
  HISTORY_OF_ARCHITECTURE: 'History of Architecture',
  MATH: 'Mathematics',
  APTITUDE: 'Aptitude',
  DRAWING: 'Drawing',
  PUZZLE: 'Puzzles & Logic',
  IMAGE_BASED: 'Image Based',
  PERSPECTIVE: 'Perspective',
  BUILDING_MATERIALS: 'Building Materials',
  BUILDING_SERVICES: 'Building Services',
  PLANNING: 'Planning & Urban Design',
  SUSTAINABILITY: 'Sustainability',
  FAMOUS_ARCHITECTS: 'Famous Architects',
  CURRENT_AFFAIRS: 'Current Affairs',
  VISUALIZATION_3D: '3D Visualization',
};

export const DIFFICULTY_COLORS = {
  EASY: '#22C55E',    // green
  MEDIUM: '#F59E0B',  // amber
  HARD: '#EF4444',    // red
} as const;

export const EXAM_BADGE_COLORS = {
  JEE_PAPER_2: '#3B82F6',  // blue
  NATA: '#8B5CF6',          // purple
} as const;
```

---

## 5. Storage Buckets

Create these Supabase Storage buckets:

| Bucket | Access | Purpose |
|--------|--------|---------|
| `qb-question-images` | Public read, admin/teacher write | Question content images (diagrams, figures, drawings) |
| `qb-solution-images` | Authenticated read, admin/teacher write | Solution step-by-step images |
| `qb-original-papers` | Authenticated read, admin write | Full exam PDF papers |
| `qb-import-temp` | Admin only | Temporary storage for bulk import files |

### Storage policies

```sql
-- qb-question-images: public read
CREATE POLICY "Public read question images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'qb-question-images');

-- qb-question-images: admin/teacher write
CREATE POLICY "Admin/teacher write question images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'qb-question-images'
    AND auth.role() IN ('admin', 'teacher')
  );

-- qb-solution-images: authenticated read
CREATE POLICY "Authenticated read solution images"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'qb-solution-images'
    AND auth.role() IS NOT NULL
  );

-- qb-original-papers: authenticated read
CREATE POLICY "Authenticated read original papers"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'qb-original-papers'
    AND auth.role() IS NOT NULL
  );
```

---

## 6. Row Level Security (RLS)

```sql
-- Enable RLS on all QB tables
ALTER TABLE qb_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE qb_question_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE qb_student_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE qb_saved_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE qb_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE qb_original_papers ENABLE ROW LEVEL SECURITY;
ALTER TABLE qb_study_marks ENABLE ROW LEVEL SECURITY;

-- ========== qb_questions ==========

-- Everyone authenticated can read active questions
CREATE POLICY "Read active questions"
  ON qb_questions FOR SELECT
  USING (is_active = true AND auth.role() IS NOT NULL);

-- Admin/teacher: full read (including inactive)
CREATE POLICY "Admin read all questions"
  ON qb_questions FOR SELECT
  USING (auth.role() IN ('admin', 'teacher'));

-- Admin/teacher: insert
CREATE POLICY "Admin insert questions"
  ON qb_questions FOR INSERT
  WITH CHECK (auth.role() IN ('admin', 'teacher'));

-- Admin/teacher: update
CREATE POLICY "Admin update questions"
  ON qb_questions FOR UPDATE
  USING (auth.role() IN ('admin', 'teacher'));

-- Admin only: delete (soft delete preferred — set is_active = false)
CREATE POLICY "Admin delete questions"
  ON qb_questions FOR DELETE
  USING (auth.role() = 'admin');

-- ========== qb_question_sources ==========

CREATE POLICY "Read question sources"
  ON qb_question_sources FOR SELECT
  USING (auth.role() IS NOT NULL);

CREATE POLICY "Admin manage question sources"
  ON qb_question_sources FOR ALL
  USING (auth.role() IN ('admin', 'teacher'));

-- ========== qb_student_attempts ==========

-- Students: read own attempts
CREATE POLICY "Student read own attempts"
  ON qb_student_attempts FOR SELECT
  USING (auth.uid() = student_id);

-- Students: insert own attempts
CREATE POLICY "Student insert own attempts"
  ON qb_student_attempts FOR INSERT
  WITH CHECK (auth.uid() = student_id);

-- Admin/teacher: read all attempts (for analytics)
CREATE POLICY "Admin read all attempts"
  ON qb_student_attempts FOR SELECT
  USING (auth.role() IN ('admin', 'teacher'));

-- Parent: read child's attempts (requires parent-child relationship check)
-- Implementation note: use a function that checks the parent_student_links table
CREATE POLICY "Parent read child attempts"
  ON qb_student_attempts FOR SELECT
  USING (
    auth.role() = 'parent'
    AND student_id IN (
      SELECT student_id FROM parent_student_links
      WHERE parent_id = auth.uid()
    )
  );

-- ========== qb_saved_presets ==========

CREATE POLICY "Student manage own presets"
  ON qb_saved_presets FOR ALL
  USING (auth.uid() = student_id);

-- ========== qb_topics ==========

CREATE POLICY "Read topics"
  ON qb_topics FOR SELECT
  USING (auth.role() IS NOT NULL);

CREATE POLICY "Admin manage topics"
  ON qb_topics FOR ALL
  USING (auth.role() IN ('admin', 'teacher'));

-- ========== qb_original_papers ==========

CREATE POLICY "Read original papers"
  ON qb_original_papers FOR SELECT
  USING (auth.role() IS NOT NULL);

CREATE POLICY "Admin manage original papers"
  ON qb_original_papers FOR ALL
  USING (auth.role() = 'admin');

-- ========== qb_study_marks ==========

CREATE POLICY "Student manage own study marks"
  ON qb_study_marks FOR ALL
  USING (auth.uid() = student_id);
```

> **Note:** Adjust `auth.role()` checks to match your actual Nexus role system. If roles are stored in a `user_profiles` table, replace with a function like `get_user_role(auth.uid())`.

---

## 7. Database Indexes

```sql
-- Questions: filtering performance
CREATE INDEX idx_qb_questions_topic ON qb_questions(topic_id) WHERE is_active = true;
CREATE INDEX idx_qb_questions_difficulty ON qb_questions(difficulty) WHERE is_active = true;
CREATE INDEX idx_qb_questions_format ON qb_questions(question_format) WHERE is_active = true;
CREATE INDEX idx_qb_questions_repeat_group ON qb_questions(repeat_group_id) WHERE repeat_group_id IS NOT NULL;
CREATE INDEX idx_qb_questions_active ON qb_questions(is_active, created_at DESC);

-- GIN indexes for array columns (critical for filter queries)
CREATE INDEX idx_qb_questions_exam_relevance ON qb_questions USING GIN(exam_relevance);
CREATE INDEX idx_qb_questions_categories ON qb_questions USING GIN(categories);

-- Question sources: lookup by question and by exam
CREATE INDEX idx_qb_sources_question ON qb_question_sources(question_id);
CREATE INDEX idx_qb_sources_exam ON qb_question_sources(exam_type, exam_year);
CREATE INDEX idx_qb_sources_year ON qb_question_sources(exam_year DESC);

-- Attempts: student lookup and analytics
CREATE INDEX idx_qb_attempts_student ON qb_student_attempts(student_id, attempted_at DESC);
CREATE INDEX idx_qb_attempts_question ON qb_student_attempts(question_id);
CREATE INDEX idx_qb_attempts_student_question ON qb_student_attempts(student_id, question_id);

-- Presets: student lookup
CREATE INDEX idx_qb_presets_student ON qb_saved_presets(student_id, is_pinned DESC);

-- Study marks
CREATE INDEX idx_qb_study_marks_student ON qb_study_marks(student_id);

-- Topics: hierarchy
CREATE INDEX idx_qb_topics_parent ON qb_topics(parent_id) WHERE is_active = true;
```

---

## 8. API Layer — Server Actions & Queries

### 8.1 TypeScript Types

```typescript
// lib/question-bank/types.ts

export interface Question {
  id: string;
  content_text: string | null;
  content_image_url: string | null;
  question_format: 'MCQ' | 'NUMERICAL' | 'DRAWING_PROMPT' | 'IMAGE_BASED';
  options: QuestionOption[] | null;
  correct_answer: string;
  answer_tolerance: number | null;
  explanation_brief: string;
  explanation_detailed: string | null;
  solution_image_url: string | null;
  solution_video_url: string | null;
  nexus_lesson_ref: string | null;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  exam_relevance: ('JEE' | 'NATA')[];
  categories: string[];
  topic_id: string | null;
  sub_topic: string | null;
  repeat_group_id: string | null;
  original_paper_id: string | null;
  original_paper_page: number | null;
  display_order: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;

  // Joined data (populated by queries)
  sources?: QuestionSource[];
  topic?: Topic;
  attempt_summary?: AttemptSummary;
  repeat_sources?: QuestionSource[];  // sources of other questions in same repeat group
}

export interface QuestionOption {
  id: string;       // "a", "b", "c", "d"
  text: string;
  image_url?: string;
}

export interface QuestionSource {
  id: string;
  question_id: string;
  exam_type: 'JEE_PAPER_2' | 'NATA';
  exam_year: number;
  exam_session: string | null;
  question_number: number | null;
}

export interface StudentAttempt {
  id: string;
  student_id: string;
  question_id: string;
  selected_answer: string;
  is_correct: boolean;
  time_spent_seconds: number | null;
  mode: 'practice' | 'year_paper';
  attempted_at: string;
}

export interface AttemptSummary {
  total_attempts: number;
  last_attempt_at: string | null;
  last_was_correct: boolean | null;
  best_result: boolean;  // ever got it correct?
}

export interface SavedPreset {
  id: string;
  student_id: string;
  preset_name: string;
  filters: FilterState;
  is_pinned: boolean;
  created_at: string;
}

export interface Topic {
  id: string;
  name: string;
  parent_id: string | null;
  display_order: number;
  children?: Topic[];
}

export interface OriginalPaper {
  id: string;
  exam_type: 'JEE_PAPER_2' | 'NATA';
  exam_year: number;
  exam_session: string | null;
  pdf_url: string;
  total_questions: number | null;
  total_marks: number | null;
  duration_minutes: number | null;
}

export interface FilterState {
  exam_relevance?: ('JEE' | 'NATA')[];
  exam_years?: number[];
  exam_sessions?: string[];
  topic_ids?: string[];
  categories?: string[];
  difficulty?: ('EASY' | 'MEDIUM' | 'HARD')[];
  question_format?: ('MCQ' | 'NUMERICAL' | 'DRAWING_PROMPT' | 'IMAGE_BASED')[];
  attempt_status?: 'all' | 'unattempted' | 'correct' | 'incorrect';
  search_text?: string;
}

export interface QuestionListResponse {
  questions: Question[];
  total_count: number;
  page: number;
  page_size: number;
  has_next: boolean;
}

export interface ProgressStats {
  total_questions: number;
  attempted_count: number;
  correct_count: number;
  incorrect_count: number;
  accuracy_percentage: number;
  by_category: Record<string, { attempted: number; correct: number; total: number }>;
  by_topic: Record<string, { attempted: number; correct: number; total: number }>;
  by_difficulty: Record<string, { attempted: number; correct: number; total: number }>;
  recent_activity: StudentAttempt[];
}

export interface YearPaperResult {
  paper: OriginalPaper;
  total_questions: number;
  attempted: number;
  correct: number;
  incorrect: number;
  skipped: number;
  score_percentage: number;
  time_taken_seconds: number;
  by_category: Record<string, { correct: number; total: number }>;
  questions: (Question & { student_answer?: string; was_correct?: boolean })[];
}
```

### 8.2 Key Query Patterns

```typescript
// hooks/question-bank/useQuestions.ts
// Main query: fetch questions with multi-axis filtering

/*
  Supabase query pattern:

  let query = supabase
    .from('qb_questions')
    .select(`
      *,
      sources:qb_question_sources(*),
      topic:qb_topics(id, name, parent_id)
    `)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  // Apply filters
  if (filters.exam_relevance?.length) {
    query = query.overlaps('exam_relevance', filters.exam_relevance);
  }
  if (filters.categories?.length) {
    query = query.overlaps('categories', filters.categories);
  }
  if (filters.difficulty?.length) {
    query = query.in('difficulty', filters.difficulty);
  }
  if (filters.question_format?.length) {
    query = query.in('question_format', filters.question_format);
  }
  if (filters.topic_ids?.length) {
    query = query.in('topic_id', filters.topic_ids);
  }

  // Year filter requires join with qb_question_sources
  // Use an RPC function for complex year/session filtering

  // Attempt status filter requires join with qb_student_attempts
  // Use an RPC function or database view
*/
```

### 8.3 Database Functions (RPC)

```sql
-- Function: get filtered questions with attempt status for a student
CREATE OR REPLACE FUNCTION qb_get_questions_with_status(
  p_student_id UUID,
  p_exam_relevance exam_relevance_enum[] DEFAULT NULL,
  p_exam_years INTEGER[] DEFAULT NULL,
  p_topic_ids UUID[] DEFAULT NULL,
  p_categories TEXT[] DEFAULT NULL,
  p_difficulty difficulty_level_enum[] DEFAULT NULL,
  p_formats question_format_enum[] DEFAULT NULL,
  p_attempt_status TEXT DEFAULT 'all',  -- 'all' | 'unattempted' | 'correct' | 'incorrect'
  p_search_text TEXT DEFAULT NULL,
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 20
)
RETURNS TABLE (
  question JSONB,
  sources JSONB,
  topic JSONB,
  attempt_summary JSONB,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_offset INTEGER := (p_page - 1) * p_page_size;
BEGIN
  RETURN QUERY
  WITH filtered_questions AS (
    SELECT q.*
    FROM qb_questions q
    WHERE q.is_active = true
      AND (p_exam_relevance IS NULL OR q.exam_relevance && p_exam_relevance)
      AND (p_categories IS NULL OR q.categories && p_categories)
      AND (p_difficulty IS NULL OR q.difficulty = ANY(p_difficulty))
      AND (p_formats IS NULL OR q.question_format = ANY(p_formats))
      AND (p_topic_ids IS NULL OR q.topic_id = ANY(p_topic_ids))
      AND (p_search_text IS NULL OR q.content_text ILIKE '%' || p_search_text || '%')
      AND (p_exam_years IS NULL OR EXISTS (
        SELECT 1 FROM qb_question_sources qs
        WHERE qs.question_id = q.id AND qs.exam_year = ANY(p_exam_years)
      ))
  ),
  with_attempts AS (
    SELECT
      fq.*,
      COALESCE(
        (SELECT jsonb_build_object(
          'total_attempts', COUNT(*),
          'last_attempt_at', MAX(sa.attempted_at),
          'last_was_correct', (
            SELECT sa2.is_correct FROM qb_student_attempts sa2
            WHERE sa2.student_id = p_student_id AND sa2.question_id = fq.id
            ORDER BY sa2.attempted_at DESC LIMIT 1
          ),
          'best_result', BOOL_OR(sa.is_correct)
        )
        FROM qb_student_attempts sa
        WHERE sa.student_id = p_student_id AND sa.question_id = fq.id
        ),
        '{"total_attempts": 0, "last_attempt_at": null, "last_was_correct": null, "best_result": false}'::jsonb
      ) AS attempt_info
    FROM filtered_questions fq
  ),
  status_filtered AS (
    SELECT wa.*
    FROM with_attempts wa
    WHERE
      CASE p_attempt_status
        WHEN 'unattempted' THEN (wa.attempt_info->>'total_attempts')::int = 0
        WHEN 'correct' THEN (wa.attempt_info->>'best_result')::boolean = true
        WHEN 'incorrect' THEN (wa.attempt_info->>'total_attempts')::int > 0
                              AND (wa.attempt_info->>'best_result')::boolean = false
        ELSE true  -- 'all'
      END
  ),
  counted AS (
    SELECT COUNT(*) AS cnt FROM status_filtered
  )
  SELECT
    to_jsonb(sf) - 'attempt_info' AS question,
    COALESCE(
      (SELECT jsonb_agg(to_jsonb(qs)) FROM qb_question_sources qs WHERE qs.question_id = sf.id),
      '[]'::jsonb
    ) AS sources,
    COALESCE(
      (SELECT to_jsonb(t) FROM qb_topics t WHERE t.id = sf.topic_id),
      'null'::jsonb
    ) AS topic,
    sf.attempt_info AS attempt_summary,
    (SELECT cnt FROM counted) AS total_count
  FROM status_filtered sf
  ORDER BY sf.created_at DESC
  LIMIT p_page_size
  OFFSET v_offset;
END;
$$;


-- Function: get student progress stats
CREATE OR REPLACE FUNCTION qb_get_student_progress(
  p_student_id UUID,
  p_exam_relevance exam_relevance_enum[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
  WITH base_questions AS (
    SELECT q.id, q.categories, q.topic_id, q.difficulty
    FROM qb_questions q
    WHERE q.is_active = true
      AND (p_exam_relevance IS NULL OR q.exam_relevance && p_exam_relevance)
  ),
  attempt_data AS (
    SELECT
      sa.question_id,
      sa.is_correct,
      sa.attempted_at,
      ROW_NUMBER() OVER (PARTITION BY sa.question_id ORDER BY sa.attempted_at DESC) AS rn
    FROM qb_student_attempts sa
    WHERE sa.student_id = p_student_id
      AND sa.question_id IN (SELECT id FROM base_questions)
  ),
  latest_attempts AS (
    SELECT * FROM attempt_data WHERE rn = 1
  )
  SELECT jsonb_build_object(
    'total_questions', (SELECT COUNT(*) FROM base_questions),
    'attempted_count', (SELECT COUNT(DISTINCT question_id) FROM attempt_data),
    'correct_count', (SELECT COUNT(*) FROM latest_attempts WHERE is_correct = true),
    'incorrect_count', (SELECT COUNT(*) FROM latest_attempts WHERE is_correct = false),
    'accuracy_percentage', CASE
      WHEN (SELECT COUNT(*) FROM latest_attempts) = 0 THEN 0
      ELSE ROUND(
        (SELECT COUNT(*) FROM latest_attempts WHERE is_correct = true)::numeric /
        (SELECT COUNT(*) FROM latest_attempts)::numeric * 100, 1
      )
    END
  ) INTO result;

  RETURN result;
END;
$$;
```

---

## 9. Admin & Teacher Screens

### 9.1 Admin Dashboard (`/admin/question-bank`)

**Purpose:** Overview of question bank health and content status.

**Content:**
- Total questions count (by exam type, by active/inactive)
- Questions by year (bar chart — shows content coverage gaps)
- Questions missing solutions (no video, no image, no detailed explanation)
- Questions with zero student attempts (unused content)
- Recently flagged questions (from support tickets)
- Quick actions: "Add Question", "Bulk Import", "Manage Papers"

**Fluent UI components:** `Card`, `DataGrid` (or simple table), `Badge`, `Button`, `CounterBadge`

### 9.2 Manual Question Entry (`/admin/question-bank/questions/new`)

**Purpose:** Single question creation form.

**Form flow (step-by-step, using Fluent UI `Wizard` or tabbed form):**

**Step 1 — Source & Format**
- Exam type: `Dropdown` (JEE Paper 2 / NATA)
- Exam year: `SpinButton` or `Dropdown`
- Exam session: `Input` (e.g., "Shift 1")
- Question number: `SpinButton`
- Question format: `RadioGroup` (MCQ / Numerical / Drawing Prompt / Image-based)
- Link to existing original paper: `Combobox` (auto-populated from qb_original_papers)

**Step 2 — Question Content**
- Question text: `Textarea` with Markdown support (render preview)
- Question image: `FileUpload` → upload to `qb-question-images` bucket
- For MCQ: 4 option rows, each with `Input` (text) + optional `FileUpload` (image) + `Radio` (mark correct)
- For Numerical: Correct answer `Input` (number) + tolerance `Input`
- For Drawing Prompt: Prompt text + reference/model answer image upload
- For Image-based: Primary image upload + text supplement

**Step 3 — Metadata**
- Topic: `TreeSelect` (hierarchical topic picker from qb_topics)
- Sub-topic: `Input` (optional free text)
- Categories: `TagPicker` (multi-select from QUESTION_CATEGORIES)
- Difficulty: `RadioGroup` (Easy / Medium / Hard)
- Exam relevance: `CheckboxGroup` (JEE / NATA / Both)

**Step 4 — Solutions**
- Brief explanation: `Textarea` (required, 2-3 sentences)
- Detailed explanation: `Textarea` (optional, Markdown)
- Solution image: `FileUpload` → `qb-solution-images` bucket
- YouTube video URL: `Input` with URL validation + embedded preview
- Nexus lesson link: `Combobox` (search Nexus curriculum lessons)

**Step 5 — Repeat Linking**
- "Is this a repeat of an existing question?": `Switch`
- If yes: Search existing questions → select → auto-assigns shared repeat_group_id
- If this is the first occurrence: leave empty (future repeats will link to this one)

**Step 6 — Review & Submit**
- Full preview of the question as students will see it
- Submit button → creates record in qb_questions + qb_question_sources

### 9.3 Edit Question (`/admin/question-bank/questions/[id]/edit`)

Same form as creation, pre-populated with existing data. Changes tracked via `updated_at`.

### 9.4 Admin Question List (`/admin/question-bank/questions`)

- DataGrid/AG Grid with columns: Q#, Preview, Source, Topic, Category, Difficulty, Solutions attached, Attempts count, Active status
- Inline actions: Edit, Deactivate, View as Student
- Filters: Same as student filters + active/inactive toggle
- Bulk actions: Activate/Deactivate selected, Assign topic, Assign category

---

## 10. Student-Facing Screens

### 10.1 Question Bank Home (`/question-bank`)

**Layout:**

```
┌─────────────────────────────────────┐
│  Question Bank                      │
│                                     │
│  [JEE Paper 2] [NATA] [All]       │  ← Exam selector (SegmentedControl)
│                                     │
│  ┌──────┐ ┌──────┐ ┌──────┐       │
│  │ 847  │ │ 234  │ │ 72%  │       │  ← Quick stats cards
│  │Total │ │Done  │ │Score │       │
│  └──────┘ └──────┘ └──────┘       │
│                                     │
│  ─── Saved Presets ───              │
│  [NATA Aptitude] [JEE GK Hard] [+] │  ← Horizontal scrollable chips
│                                     │
│  ─── Explore ───                    │
│  ┌──────────────────────┐           │
│  │ 📅 Browse by Year    │ →        │
│  ├──────────────────────┤           │
│  │ 📚 Browse by Topic   │ →        │
│  ├──────────────────────┤           │
│  │ 🏷️ Browse by Category│ →        │
│  ├──────────────────────┤           │
│  │ 📄 Full Year Paper   │ →        │  ← Year Paper Mode entry
│  └──────────────────────┘           │
│                                     │
│  ─── Suggested for You ───          │  ← Smart suggestions (Phase 3)
│  "You covered Ancient Arch          │
│   yesterday — 14 PYQs available"    │
└─────────────────────────────────────┘
```

### 10.2 Question List (`/question-bank/questions?...filters`)

**Layout:**

```
┌─────────────────────────────────────┐
│  ← Back   Questions (234)  🔍 ⚙️   │  ← Count + search + filter icon
│                                     │
│  [Practice Mode ↔ Study Mode]       │  ← Mode toggle
│                                     │
│  Active: [JEE ×] [2023 ×] [GK ×]  │  ← Active filter chips (removable)
│                                     │
│  ┌─────────────────────────────┐    │
│  │ Q.12 • JEE 2023 Shift 1    │    │  ← QuestionCard
│  │ Which Mughal emperor built  │    │
│  │ the Buland Darwaza...       │    │
│  │ [GK] [History] 🟢Easy  ✓   │    │  ← Categories, difficulty, attempt status
│  │ Also: JEE 2019             │    │  ← Repeat indicator
│  └─────────────────────────────┘    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │ Q.45 • JEE 2022 Shift 2    │    │
│  │ [image thumbnail]           │    │
│  │ Identify the perspective... │    │
│  │ [Aptitude] [Image] 🟡Med  ○│    │  ← Not attempted
│  └─────────────────────────────┘    │
│                                     │
│  ... (infinite scroll)              │
└─────────────────────────────────────┘
```

### 10.3 Question Detail — Practice Mode (`/question-bank/questions/[id]`)

```
┌─────────────────────────────────────┐
│  ← Back        Q.12 of 234    →    │  ← Navigation within filtered set
│                                     │
│  JEE 2023 Shift 1 • Q.12           │
│  Also: JEE 2019, NATA 2022 Test 2  │  ← RepeatBadges
│                                     │
│  ┌─────────────────────────────┐    │
│  │                             │    │
│  │   [Question image if any]   │    │  ← Pinch-to-zoom enabled
│  │                             │    │
│  └─────────────────────────────┘    │
│                                     │
│  Which of the following Mughal      │
│  structures features the tallest    │
│  gateway in India?                  │
│                                     │
│  ○ A) Taj Mahal                     │  ← Radio buttons (MCQ)
│  ○ B) Buland Darwaza                │
│  ○ C) Humayun's Tomb               │
│  ○ D) Jama Masjid                   │
│                                     │
│  [       Submit Answer       ]      │  ← Primary button, disabled until selected
│                                     │
│  ─── After Submit ───               │
│  ✅ Correct! (or ❌ Incorrect)      │
│                                     │
│  The Buland Darwaza at Fatehpur     │
│  Sikri, built by Akbar in 1576,    │
│  stands at 54 meters...             │  ← Brief explanation
│                                     │
│  ▼ See Detailed Solution            │  ← Expandable
│  ┌─────────────────────────────┐    │
│  │ 🎥 Watch Solution Video     │    │  ← YouTube embed
│  │ 📷 Solution Image           │    │
│  │ 📖 Related Nexus Lesson     │    │
│  └─────────────────────────────┘    │
│                                     │
│  ─── Your History ───               │
│  Attempted on 12 Mar 2026 — ❌      │
│  Attempted on 15 Mar 2026 — ✅      │  ← AttemptHistory
│                                     │
│  [GK] [History of Architecture]     │  ← Category chips
│  🟢 Easy • JEE & NATA relevant     │
│                                     │
│  [       Next Question →       ]    │
└─────────────────────────────────────┘
```

### 10.4 Question Detail — Study Mode

Same layout but:
- No answer input area or submit button
- Correct answer highlighted immediately
- Brief explanation visible by default
- Solution section expanded by default
- "Mark as Studied" toggle button instead of submit
- No attempt tracking (only study_marks table)

---

## 11. Learning Modes

### 11.1 Practice Mode

| Aspect | Behavior |
|--------|----------|
| Answer input | Active — student must select/enter answer |
| Submit | Required before seeing correct answer |
| Feedback | Immediate correct/incorrect with explanation |
| Solution visibility | Hidden until after submit |
| Attempt tracking | Every submit recorded in qb_student_attempts |
| Timer | Optional per-question timer (configurable) |
| Navigation | Sequential within filtered set (← →) |
| Swipe | Swipe right for next question (mobile) |

### 11.2 Study Mode

| Aspect | Behavior |
|--------|----------|
| Answer input | None — correct answer shown immediately |
| Submit | None |
| Feedback | Always visible |
| Solution visibility | Expanded by default |
| Attempt tracking | None — only manual "Studied" toggle (qb_study_marks) |
| Timer | None |
| Navigation | Free scroll through questions |
| Swipe | Standard scroll |

### 11.3 Year Paper Mode

| Aspect | Behavior |
|--------|----------|
| Entry | Select specific exam year + session |
| Question order | Original display_order from the paper |
| Answer input | Active — submit per question OR submit all at end |
| Feedback | Deferred — shown only after completing entire paper |
| Timer | Full exam timer (duration from qb_original_papers) |
| Navigation | Question palette (grid of Q numbers, color-coded by status) |
| Result | Score summary + per-category breakdown + review mode |
| Attempt tracking | All recorded as mode='year_paper' |

---

## 12. Filtering & Navigation System

### 12.1 Filter Dimensions

| Filter | Type | UI Component | DB Column/Join |
|--------|------|-------------|----------------|
| Exam relevance | Multi-select | SegmentedControl or Chips | `exam_relevance` array overlap |
| Exam year | Multi-select | Scrollable year chips | JOIN `qb_question_sources` |
| Exam session | Multi-select | Chips (conditional on year) | JOIN `qb_question_sources` |
| Topic | Tree select | Hierarchical picker | `topic_id` IN |
| Category | Multi-select | Chips/TagPicker | `categories` array overlap |
| Difficulty | Multi-select | Toggle chips | `difficulty` IN |
| Question format | Multi-select | Chips | `question_format` IN |
| Attempt status | Single-select | RadioGroup | JOIN `qb_student_attempts` |
| Search text | Free text | SearchBox | `content_text` ILIKE |

### 12.2 Filter Logic

- **Between dimensions:** AND (e.g., Year 2023 AND Category GK AND Difficulty Hard)
- **Within a dimension:** OR (e.g., Year 2022 OR 2023)
- **Result count:** Always shown in real-time as filters change

### 12.3 URL Synchronization

All filter state reflected in URL query params for shareability and browser history:

```
/question-bank/questions?exam=JEE&years=2022,2023&categories=GK,APTITUDE&difficulty=HARD&status=unattempted
```

```typescript
// lib/question-bank/filters.ts

export function serializeFilters(filters: FilterState): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.exam_relevance?.length) params.set('exam', filters.exam_relevance.join(','));
  if (filters.exam_years?.length) params.set('years', filters.exam_years.join(','));
  if (filters.topic_ids?.length) params.set('topics', filters.topic_ids.join(','));
  if (filters.categories?.length) params.set('categories', filters.categories.join(','));
  if (filters.difficulty?.length) params.set('difficulty', filters.difficulty.join(','));
  if (filters.question_format?.length) params.set('format', filters.question_format.join(','));
  if (filters.attempt_status && filters.attempt_status !== 'all') params.set('status', filters.attempt_status);
  if (filters.search_text) params.set('q', filters.search_text);
  return params;
}

export function deserializeFilters(params: URLSearchParams): FilterState {
  return {
    exam_relevance: params.get('exam')?.split(',') as FilterState['exam_relevance'],
    exam_years: params.get('years')?.split(',').map(Number),
    topic_ids: params.get('topics')?.split(','),
    categories: params.get('categories')?.split(','),
    difficulty: params.get('difficulty')?.split(',') as FilterState['difficulty'],
    question_format: params.get('format')?.split(',') as FilterState['question_format'],
    attempt_status: (params.get('status') as FilterState['attempt_status']) || 'all',
    search_text: params.get('q') || undefined,
  };
}
```

### 12.4 Filter Panel UX (Mobile)

- Opens as a **bottom sheet** (slide up from bottom) on mobile
- Opens as a **side drawer** on desktop/tablet
- Use Fluent UI `Drawer` component with `position="bottom"` on mobile
- "Apply Filters" button at bottom of panel
- "Reset All" link to clear filters
- Active filter count badge on the filter icon in the toolbar

---

## 13. Saved Filter Presets

### Behavior

- From any active filter state, student taps "Save as Preset" → names it → saved to `qb_saved_presets`
- Presets appear as horizontal scrollable chips at top of Question Bank home and Question List
- Up to 5 presets can be "pinned" for instant access
- Tapping a preset chip applies all its filters instantly
- Long-press (mobile) or right-click (desktop) to rename, delete, or toggle pin

### Data Structure

```typescript
// The filters JSONB column stores the complete FilterState
{
  "exam_relevance": ["NATA"],
  "categories": ["APTITUDE", "GK"],
  "difficulty": ["MEDIUM", "HARD"],
  "attempt_status": "unattempted"
}
```

---

## 14. Repeat Question Linking

### How It Works

- Questions share a `repeat_group_id` (UUID) when they are the same or substantially similar
- Admin assigns repeat groups during question entry or via the Repeat Groups management screen
- On the student-facing question detail, a `RepeatBadges` component shows: "This question also appeared in: JEE 2019, JEE 2021"
- Each badge is clickable — navigates to that specific instance of the question

### Query Pattern

```sql
-- Get all sources for questions in the same repeat group
SELECT qs.*
FROM qb_question_sources qs
JOIN qb_questions q ON q.id = qs.question_id
WHERE q.repeat_group_id = (
  SELECT repeat_group_id FROM qb_questions WHERE id = $current_question_id
)
AND q.id != $current_question_id
AND q.is_active = true;
```

---

## 15. Solution Attachments

### YouTube Video Embedding

- Store full YouTube URL in `solution_video_url` (e.g., `https://www.youtube.com/watch?v=XXXXX`)
- Extract video ID and render using `<iframe>` embed
- Use `youtube-nocookie.com` domain for privacy-enhanced mode
- Lazy-load: show thumbnail + play button, load iframe on tap

```typescript
// Extract YouTube video ID
function getYouTubeId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match?.[1] || null;
}

// Embed URL
function getEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1`;
}
```

### Solution Image

- Uploaded to `qb-solution-images` bucket
- Displayed in an expandable section with pinch-to-zoom
- Supports multiple images (for multi-step solutions) — store as JSON array in the future if needed

### Nexus Lesson Link

- References a lesson in the Nexus curriculum module
- Displayed as a clickable card: "📖 Related Lesson: Mughal Architecture — Fatehpur Sikri"
- Opens the lesson within Nexus (internal navigation)

---

## 16. Attempt Tracking

### Recording Attempts

```typescript
// actions/question-bank/attempts.ts

export async function recordAttempt(
  questionId: string,
  selectedAnswer: string,
  timeSpentSeconds: number | null,
  mode: 'practice' | 'year_paper'
) {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Check answer
  const { data: question } = await supabase
    .from('qb_questions')
    .select('correct_answer, answer_tolerance, question_format')
    .eq('id', questionId)
    .single();

  const isCorrect = checkAnswer(
    question.question_format,
    selectedAnswer,
    question.correct_answer,
    question.answer_tolerance
  );

  const { data, error } = await supabase
    .from('qb_student_attempts')
    .insert({
      student_id: user.id,
      question_id: questionId,
      selected_answer: selectedAnswer,
      is_correct: isCorrect,
      time_spent_seconds: timeSpentSeconds,
      mode,
    })
    .select()
    .single();

  return { attempt: data, isCorrect, error };
}
```

### Answer Checking Logic

```typescript
// lib/question-bank/scoring.ts

export function checkAnswer(
  format: string,
  studentAnswer: string,
  correctAnswer: string,
  tolerance: number | null
): boolean {
  switch (format) {
    case 'MCQ':
      return studentAnswer.toLowerCase() === correctAnswer.toLowerCase();

    case 'NUMERICAL':
      const student = parseFloat(studentAnswer);
      const correct = parseFloat(correctAnswer);
      const tol = tolerance || 0;
      return Math.abs(student - correct) <= tol;

    case 'DRAWING_PROMPT':
    case 'IMAGE_BASED':
      // These are not auto-scored — always return true (review-based)
      // Or implement a "self-assess" flow where student marks their own correctness
      return true;

    default:
      return false;
  }
}
```

### Attempt Summary on Question Card

```typescript
// Visual indicators on QuestionCard
// ○  Not attempted (empty circle)
// ✅ Last attempt correct (green checkmark)
// ❌ Attempted, last incorrect (red X)
// 🔄 Multiple attempts (shows count)
```

---

## 17. Original Paper PDF Viewer

### Requirements

- PDFs are stored in `qb-original-papers` Supabase Storage bucket
- Rendered in-app using a PDF viewer component (NOT downloadable)
- Use `react-pdf` or `pdfjs-dist` for rendering
- Disable right-click context menu and print shortcut on the viewer
- Show page numbers matching `original_paper_page` from question metadata
- Allow direct navigation to a specific page when coming from a question detail view

### Implementation Notes

```typescript
// Use @react-pdf-viewer/core for Fluent-compatible PDF rendering
// Load PDF from Supabase Storage signed URL (short-lived, prevents direct download)

const { data } = await supabase.storage
  .from('qb-original-papers')
  .createSignedUrl(pdfPath, 300); // 5-minute expiry
```

---

## 18. Bulk Import Pipeline

### CSV Template Structure

```csv
content_text,content_image_filename,question_format,option_a_text,option_a_image,option_b_text,option_b_image,option_c_text,option_c_image,option_d_text,option_d_image,correct_answer,explanation_brief,explanation_detailed,solution_image_filename,solution_video_url,exam_type,exam_year,exam_session,question_number,difficulty,exam_relevance,categories,topic_name,sub_topic
"Which Mughal emperor built the Buland Darwaza?",,MCQ,"Akbar",,"Shah Jahan",,"Humayun",,"Aurangzeb",,a,"Akbar built the Buland Darwaza at Fatehpur Sikri in 1576 to commemorate his victory in Gujarat.",,"buland_darwaza_solution.jpg","https://youtube.com/watch?v=XXX",JEE_PAPER_2,2023,Shift 1,12,EASY,"JEE,NATA","GK,HISTORY_OF_ARCHITECTURE","History of Architecture","Mughal Architecture"
```

### Import Flow (BulkImportWizard component)

**Step 1 — Upload**
- Upload CSV/JSON file + ZIP of images (if any)
- File size limits: CSV max 10MB, images ZIP max 100MB

**Step 2 — Validate**
- Parse CSV/JSON
- Validate each row: required fields present, enum values valid, image filenames exist in ZIP
- Display validation report: ✅ valid rows, ❌ errors with row numbers and field names

**Step 3 — Preview**
- Show first 10 questions as they'll appear (rendered QuestionCard preview)
- Total counts: X questions to import, Y images to upload

**Step 4 — Confirm & Import**
- Progress bar during import
- Upload images to storage → create question records → create source records
- Final report: X imported successfully, Y failed (with error details)

**Step 5 — Post-Import**
- Link to admin question list filtered to just-imported questions
- Prompt to add solution videos and repeat group links

### Validation Rules

```typescript
// lib/question-bank/import-validator.ts

export interface ValidationError {
  row: number;
  field: string;
  message: string;
}

export function validateImportRow(row: any, rowIndex: number): ValidationError[] {
  const errors: ValidationError[] = [];

  // Required fields
  if (!row.question_format) errors.push({ row: rowIndex, field: 'question_format', message: 'Required' });
  if (!row.correct_answer) errors.push({ row: rowIndex, field: 'correct_answer', message: 'Required' });
  if (!row.explanation_brief) errors.push({ row: rowIndex, field: 'explanation_brief', message: 'Required' });
  if (!row.exam_type) errors.push({ row: rowIndex, field: 'exam_type', message: 'Required' });
  if (!row.exam_year) errors.push({ row: rowIndex, field: 'exam_year', message: 'Required' });

  // Must have either text or image
  if (!row.content_text && !row.content_image_filename) {
    errors.push({ row: rowIndex, field: 'content_text', message: 'Question must have text or image' });
  }

  // Enum validation
  if (row.question_format && !['MCQ', 'NUMERICAL', 'DRAWING_PROMPT', 'IMAGE_BASED'].includes(row.question_format)) {
    errors.push({ row: rowIndex, field: 'question_format', message: `Invalid format: ${row.question_format}` });
  }
  if (row.difficulty && !['EASY', 'MEDIUM', 'HARD'].includes(row.difficulty)) {
    errors.push({ row: rowIndex, field: 'difficulty', message: `Invalid difficulty: ${row.difficulty}` });
  }

  // MCQ requires options
  if (row.question_format === 'MCQ') {
    if (!row.option_a_text) errors.push({ row: rowIndex, field: 'option_a_text', message: 'MCQ requires option A' });
    if (!row.option_b_text) errors.push({ row: rowIndex, field: 'option_b_text', message: 'MCQ requires option B' });
    if (!['a', 'b', 'c', 'd'].includes(row.correct_answer?.toLowerCase())) {
      errors.push({ row: rowIndex, field: 'correct_answer', message: 'MCQ answer must be a, b, c, or d' });
    }
  }

  // Year validation
  const year = parseInt(row.exam_year);
  if (isNaN(year) || year < 1990 || year > new Date().getFullYear() + 1) {
    errors.push({ row: rowIndex, field: 'exam_year', message: `Invalid year: ${row.exam_year}` });
  }

  return errors;
}
```

---

## 19. Nexus Integration Points

### 19.1 Topic-Level Curriculum

- `qb_topics` table mirrors or references the Nexus curriculum topic structure
- `topic_id` on questions maps to curriculum topics
- When a topic is taught (marked in attendance), the system knows which PYQs become relevant

### 19.2 Topic-Level Attendance → Smart Suggestions

```sql
-- Get recently taught topics for a student
SELECT DISTINCT t.id, t.name
FROM nexus_attendance a
JOIN nexus_lessons l ON l.id = a.lesson_id
JOIN qb_topics t ON t.nexus_curriculum_ref = l.topic_id
WHERE a.student_id = $student_id
  AND a.attended_at > now() - INTERVAL '7 days';

-- Then count available PYQs for those topics
SELECT t.id, t.name, COUNT(q.id) as pyq_count
FROM qb_topics t
JOIN qb_questions q ON q.topic_id = t.id
WHERE t.id = ANY($recently_taught_topic_ids)
  AND q.is_active = true
GROUP BY t.id, t.name;
```

### 19.3 Support Tickets

- "Report an Issue" button on question detail view
- Creates a support ticket with:
  - `question_id` pre-attached
  - Category auto-set to "Question Bank — Content Issue"
  - Student's description of the issue
- Admin can view flagged questions in the QB admin dashboard

### 19.4 Teams Integration

- Teachers can share question bank deep links in Teams channels
- Link format: `https://nexus.neramclasses.com/question-bank/questions?topics=X&categories=Y`
- Teams message card preview shows: "Practice 20 questions on [Topic]"

---

## 20. Smart Suggestions Engine

> **Phase 3 feature** — builds on attendance integration

### Suggestion Types

1. **Topic-based:** "You covered [Topic] yesterday — [N] PYQs available"
2. **Gap-based:** "You've attempted 0 [Category] questions — [N] in the bank"
3. **Repeat-priority:** "[N] questions from [Year] are repeats from earlier years — high priority!"
4. **Weakness-based:** "You got [N] [Category] questions wrong — try again?"
5. **Streak-based:** "You've practiced daily for [N] days — keep it up!"

### Implementation

```typescript
// hooks/question-bank/useSuggestions.ts

export function useSuggestions(studentId: string, examGoal: 'JEE' | 'NATA') {
  // 1. Fetch recently taught topics (last 7 days)
  // 2. Fetch student's attempt stats by category
  // 3. Fetch repeat question counts
  // 4. Generate ranked suggestion list
  // 5. Return top 3 suggestions

  // Each suggestion has:
  // - type: 'topic' | 'gap' | 'repeat' | 'weakness' | 'streak'
  // - title: string
  // - description: string
  // - action_url: string (deep link to filtered question list)
  // - question_count: number
}
```

---

## 21. Mobile-First UX Requirements

### Critical Constraints (95% mobile users)

- **Single-column layout** for all screens
- **Minimum tap target:** 44px × 44px for all interactive elements
- **Filter panel:** Bottom sheet (slide up) on mobile, side drawer on tablet+
- **Question navigation:** Swipe left/right between questions in Practice Mode
- **Image viewing:** Pinch-to-zoom on all question and solution images
- **Infinite scroll:** Virtualized list for question list view (no pagination buttons)
- **Lazy loading:** Images loaded on scroll with placeholder skeleton
- **Offline (PWA):** Cache recently viewed questions for offline review (Phase 4)

### Fluent UI v9 Components to Use

| Purpose | Component |
|---------|-----------|
| Exam selector | `TabList` or custom `SegmentedControl` |
| Filter chips | `Tag` / `InteractionTag` |
| Filter panel | `Drawer` with `position="bottom"` on mobile |
| Question list | Virtualized list with custom `Card` items |
| Mode toggle | `Switch` or `ToggleButton` |
| Answer options (MCQ) | `RadioGroup` with `Radio` |
| Difficulty badge | `Badge` with custom colors |
| Source badges | `Badge` with `appearance="outline"` |
| Category chips | `Tag` with `appearance="brand"` |
| Submit button | `Button` with `appearance="primary"` |
| Solution expand | `Accordion` / `AccordionItem` |
| Preset bar | Horizontal scrollable `TagGroup` |
| Topic picker | `Tree` / `TreeItem` |
| Progress charts | Recharts (already in monorepo?) or `@fluentui/react-charting` |
| PDF viewer | `react-pdf` or `@react-pdf-viewer/core` |
| Bulk import wizard | `Stepper` pattern with `Button` progression |
| Timer | Custom component with `CounterBadge` display |

---

## 22. Performance & Caching

### Query Optimization

- **Cursor-based pagination** (not offset) — use `created_at` + `id` as cursor
- **GIN indexes** on `exam_relevance` and `categories` array columns
- **Materialized view** for frequently accessed aggregations (question counts by topic/category)
- **Edge Functions** for complex progress calculations

### Client-Side Caching

```typescript
// Use SWR or React Query for data fetching with stale-while-revalidate

// Question list: cache per filter combination
const cacheKey = `qb-questions-${JSON.stringify(filters)}-page-${page}`;

// Student progress: cache with 5-minute revalidation
const { data: progress } = useSWR(
  `qb-progress-${studentId}`,
  fetchProgress,
  { refreshInterval: 300000 } // 5 min
);

// Topics and categories: cache indefinitely (rarely change)
const { data: topics } = useSWR('qb-topics', fetchTopics, { revalidateOnFocus: false });
```

### Image Optimization

- Upload: Admin uploads original resolution
- Storage: Supabase Image Transformation for on-the-fly resizing
- Delivery: WebP format with JPEG fallback
- Thumbnails: 200px wide for list view, full resolution for detail view
- Lazy loading: `loading="lazy"` on all images + Intersection Observer

---

## 23. Phased Build Plan

### Phase 1: Foundation (Weeks 1–3)

**Goal:** Core question bank with basic filtering. Ship and start using.

- [ ] Supabase migration: Create all tables, enums, indexes, RLS policies
- [ ] Storage buckets: Create and configure policies
- [ ] `qb_topics`: Seed initial topic hierarchy (map to existing curriculum)
- [ ] Types & constants: `types.ts`, `constants.ts`
- [ ] Admin: Manual question entry form (QuestionForm.tsx)
- [ ] Admin: Question list with basic CRUD
- [ ] Admin: Original paper PDF upload
- [ ] Student: Question Bank home page (QuestionStats, explore options)
- [ ] Student: Question list view with filtering (FilterPanel, FilterChips, QuestionCard)
- [ ] Student: Question detail view — Practice Mode only (QuestionDetail, PracticeModeView, AttemptFeedback)
- [ ] Answer checking logic (scoring.ts)
- [ ] Attempt recording (qb_student_attempts)
- [ ] URL-synced filter state (useFilterState.ts)
- [ ] **Content:** Digitize 1 complete JEE Paper 2 year as proof of concept

### Phase 2: Enrichment (Weeks 4–6)

**Goal:** Add solution depth, Study Mode, presets, and bulk import.

- [ ] YouTube video embedding in SolutionSection
- [ ] Solution image display with zoom
- [ ] Attempt history display on question detail (AttemptHistory)
- [ ] Study Mode implementation (StudyModeView, ModeToggle)
- [ ] Study marks (qb_study_marks) for "Studied" toggle
- [ ] Repeat question linking: admin UI + RepeatBadges component
- [ ] Saved filter presets: CRUD + SavedPresetBar
- [ ] Bulk import: CSV template, validator, BulkImportWizard
- [ ] **Content:** Bulk import 5+ years of JEE Paper 2

### Phase 3: Intelligence (Weeks 7–9)

**Goal:** Connect to Nexus ecosystem, add smart features.

- [ ] Attendance integration: "Practice PYQs on topics you covered today"
- [ ] Smart suggestions engine (useSuggestions)
- [ ] Student progress dashboard (ProgressDashboard) with charts
- [ ] Year Paper Mode (YearPaperView, usePaperSimulation)
- [ ] Support ticket integration ("Report an Issue" on question detail)
- [ ] Shareable deep links for teachers to share in Teams
- [ ] **Content:** 10+ years complete, solution videos linked for aptitude

### Phase 4: Scale & Expand (Weeks 10–12)

**Goal:** NATA expansion, polish, performance.

- [ ] NATA question support (additional formats, exam-specific UX)
- [ ] Admin review dashboard (content health metrics, gap analysis)
- [ ] Original paper PDF in-app viewer (PaperPDFViewer)
- [ ] Nexus lesson cross-reference links
- [ ] Teams deep link message cards
- [ ] Performance: virtualized lists, pagination optimization, image CDN
- [ ] PWA offline: cache recently viewed questions
- [ ] **Content:** All JEE Paper 2 years complete, first NATA batch entered

---

## 24. Component Reference

| Component | Purpose | Phase |
|-----------|---------|-------|
| `QuestionCard` | Question preview in list view | 1 |
| `QuestionDetail` | Full question view with answer area | 1 |
| `QuestionForm` | Admin question entry/edit form | 1 |
| `FilterPanel` | Slide-up/side filter panel | 1 |
| `FilterChips` | Active filter chip display with remove | 1 |
| `QuestionStats` | Quick stats (total, attempted, accuracy) | 1 |
| `DifficultyBadge` | Color-coded difficulty indicator | 1 |
| `SourceBadge` | Exam year/session badge | 1 |
| `CategoryChip` | Category tag chip | 1 |
| `PracticeModeView` | Practice mode wrapper with submit flow | 1 |
| `AttemptFeedback` | Correct/incorrect feedback display | 1 |
| `ModeToggle` | Practice/Study mode switch | 2 |
| `StudyModeView` | Study mode wrapper (solutions visible) | 2 |
| `SolutionSection` | Expandable solution (video/image/text) | 2 |
| `RepeatBadges` | "Also appeared in" year badges | 2 |
| `AttemptHistory` | Student's attempt history on a question | 2 |
| `SavedPresetBar` | Horizontal preset chips bar | 2 |
| `BulkImportWizard` | Multi-step import flow | 2 |
| `ProgressDashboard` | Progress charts and stats | 3 |
| `YearPaperView` | Full paper simulation with timer | 3 |
| `PaperPDFViewer` | In-app PDF renderer | 4 |

---

## 25. Open Decisions

These need resolution before or during implementation:

| # | Decision | Options | Impact |
|---|----------|---------|--------|
| 1 | Drawing question assessment | (a) Study Mode only — no scoring, (b) Self-assess — student marks own correctness, (c) Teacher reviews submitted photos | Affects attempt tracking for drawing questions |
| 2 | JEE Paper 2 format changes over years | (a) Track marking scheme per year, (b) Normalize all to current format | Affects Year Paper Mode scoring |
| 3 | AI-generated hints (future) | Add `hints JSONB` field to schema now for forward-compat? | Minor schema addition now saves migration later |
| 4 | Gamification | Streaks, badges, leaderboards — defer to post-Phase 4? | Adds engagement but increases scope |
| 5 | Offline cache depth | Cache all questions vs. recently viewed only | PWA storage budget on mobile |
| 6 | Question bank on app.neramclasses.com | Separate DB or shared Supabase with different RLS? | Architecture decision for standalone product |
| 7 | Teacher-assigned question sets | Build as part of QB or separate Assignments module? | Feature overlap with potential Assignments module |
| 8 | AI-assisted digitization | Use OCR + Claude API to semi-automate PDF → CSV extraction? | Could dramatically speed up content pipeline |

---

## Appendix: Migration Script Template

```sql
-- Run this in Supabase SQL Editor to set up the Question Bank module
-- Ensure you have the moddatetime extension enabled

CREATE EXTENSION IF NOT EXISTS moddatetime;

-- Enums
CREATE TYPE question_format_enum AS ENUM ('MCQ', 'NUMERICAL', 'DRAWING_PROMPT', 'IMAGE_BASED');
CREATE TYPE difficulty_level_enum AS ENUM ('EASY', 'MEDIUM', 'HARD');
CREATE TYPE exam_type_enum AS ENUM ('JEE_PAPER_2', 'NATA');
CREATE TYPE exam_relevance_enum AS ENUM ('JEE', 'NATA');

-- Tables (copy from Section 3 above)
-- Indexes (copy from Section 7 above)
-- RLS (copy from Section 6 above)
-- Functions (copy from Section 8.3 above)

-- Seed initial topics (customize based on your curriculum)
INSERT INTO qb_topics (name, display_order) VALUES
  ('Mathematics', 1),
  ('Aptitude', 2),
  ('Drawing', 3),
  ('General Knowledge', 4),
  ('History of Architecture', 5),
  ('Building Materials & Construction', 6),
  ('Building Services', 7),
  ('Planning & Urban Design', 8),
  ('Sustainability & Climate', 9),
  ('Famous Architects & Works', 10);

-- Add sub-topics
INSERT INTO qb_topics (name, parent_id, display_order) VALUES
  ('Ancient Architecture', (SELECT id FROM qb_topics WHERE name = 'History of Architecture'), 1),
  ('Medieval Architecture', (SELECT id FROM qb_topics WHERE name = 'History of Architecture'), 2),
  ('Mughal Architecture', (SELECT id FROM qb_topics WHERE name = 'History of Architecture'), 3),
  ('Colonial Architecture', (SELECT id FROM qb_topics WHERE name = 'History of Architecture'), 4),
  ('Modern Architecture', (SELECT id FROM qb_topics WHERE name = 'History of Architecture'), 5),
  ('Contemporary Architecture', (SELECT id FROM qb_topics WHERE name = 'History of Architecture'), 6),
  ('Perspective Drawing', (SELECT id FROM qb_topics WHERE name = 'Drawing'), 1),
  ('Elevation & Plan', (SELECT id FROM qb_topics WHERE name = 'Drawing'), 2),
  ('Sketching & Composition', (SELECT id FROM qb_topics WHERE name = 'Drawing'), 3),
  ('3D Visualization', (SELECT id FROM qb_topics WHERE name = 'Drawing'), 4),
  ('Algebra', (SELECT id FROM qb_topics WHERE name = 'Mathematics'), 1),
  ('Trigonometry', (SELECT id FROM qb_topics WHERE name = 'Mathematics'), 2),
  ('Geometry', (SELECT id FROM qb_topics WHERE name = 'Mathematics'), 3),
  ('Mensuration', (SELECT id FROM qb_topics WHERE name = 'Mathematics'), 4),
  ('Statistics & Probability', (SELECT id FROM qb_topics WHERE name = 'Mathematics'), 5),
  ('Logical Reasoning', (SELECT id FROM qb_topics WHERE name = 'Aptitude'), 1),
  ('Visual Reasoning', (SELECT id FROM qb_topics WHERE name = 'Aptitude'), 2),
  ('Puzzles', (SELECT id FROM qb_topics WHERE name = 'Aptitude'), 3),
  ('Pattern Recognition', (SELECT id FROM qb_topics WHERE name = 'Aptitude'), 4);
```

---

> **End of specification.** This document is designed to be handed to Claude Code for implementation. Start with Phase 1 — the Supabase migration, types, and admin question entry form. Every subsequent phase builds on the previous one without breaking changes.
