# Drawing Module V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing drawing learning-path system with a NATA question-bank model, add student browse/submit UI, and teacher sketch-over review panel with resource link sharing.

**Architecture:** Two new Supabase tables (`drawing_questions`, `drawing_submissions`) replace six old `nexus_drawing_*` tables. Student-facing pages under `/student/drawings` provide question browsing and submission. Teacher-facing pages under `/teacher/drawing-reviews` provide a review queue with an HTML5 Canvas sketch-over tool, star rating, text feedback, and Nexus library/YouTube resource links.

**Tech Stack:** Next.js 14 App Router, MUI v5, TypeScript, Supabase (PostgreSQL + Storage), HTML5 Canvas API, Microsoft Entra ID auth via `verifyMsToken`.

**Design spec:** `docs/superpowers/specs/2026-04-04-drawing-module-v2-design.md`

---

## Task 1: Database Migration — Drop Old Tables, Create New Schema

**Files:**
- Create: `supabase/migrations/20260504_drawing_module_v2.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260504_drawing_module_v2.sql
-- Drawing Module V2: Replace nexus_drawing_* with drawing_questions + drawing_submissions

-- ============================================================
-- 1. Drop old tables in FK dependency order
-- ============================================================
DROP TABLE IF EXISTS nexus_drawing_assignment_submissions CASCADE;
DROP TABLE IF EXISTS nexus_drawing_assignments CASCADE;
DROP TABLE IF EXISTS nexus_drawing_submissions CASCADE;
DROP TABLE IF EXISTS nexus_drawing_exercises CASCADE;
DROP TABLE IF EXISTS nexus_drawing_categories CASCADE;
DROP TABLE IF EXISTS nexus_drawing_levels CASCADE;

-- ============================================================
-- 2. Create drawing_questions
-- ============================================================
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

-- ============================================================
-- 3. Create drawing_submissions
-- ============================================================
CREATE TABLE drawing_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id UUID REFERENCES drawing_questions(id) ON DELETE SET NULL,
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

-- ============================================================
-- 4. Enable RLS
-- ============================================================
ALTER TABLE drawing_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE drawing_submissions ENABLE ROW LEVEL SECURITY;

-- Questions: readable by all authenticated users
CREATE POLICY "Questions readable by authenticated" ON drawing_questions
  FOR SELECT TO authenticated USING (is_active = true);

-- Questions: full access for service role (admin operations)
CREATE POLICY "Service role full access questions" ON drawing_questions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Submissions: students read own
CREATE POLICY "Students read own submissions" ON drawing_submissions
  FOR SELECT TO authenticated USING (student_id = auth.uid());

-- Submissions: students insert own
CREATE POLICY "Students create submissions" ON drawing_submissions
  FOR INSERT TO authenticated WITH CHECK (student_id = auth.uid());

-- Submissions: gallery items readable by all
CREATE POLICY "Gallery readable by all" ON drawing_submissions
  FOR SELECT TO authenticated USING (is_gallery_published = true);

-- Submissions: full access for service role (teacher operations via admin client)
CREATE POLICY "Service role full access submissions" ON drawing_submissions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 5. Create storage buckets
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('drawing-uploads', 'drawing-uploads', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  ('drawing-reviewed', 'drawing-reviewed', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('drawing-references', 'drawing-references', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'])
ON CONFLICT (id) DO NOTHING;

-- Storage policies: authenticated users can upload to drawing-uploads
CREATE POLICY "Authenticated upload drawings" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'drawing-uploads');

CREATE POLICY "Users read own drawing uploads" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'drawing-uploads');

-- Storage policies: service role manages reviewed images
CREATE POLICY "Service role manage reviewed" ON storage.objects
  FOR ALL TO service_role USING (bucket_id = 'drawing-reviewed') WITH CHECK (bucket_id = 'drawing-reviewed');

-- Storage policies: public read for references
CREATE POLICY "Public read references" ON storage.objects
  FOR SELECT TO anon USING (bucket_id = 'drawing-references');

CREATE POLICY "Authenticated read references" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'drawing-references');

-- ============================================================
-- 6. Updated_at trigger
-- ============================================================
CREATE TRIGGER set_drawing_questions_updated_at
  BEFORE UPDATE ON drawing_questions
  FOR EACH ROW
  EXECUTE FUNCTION update_nexus_updated_at();
```

- [ ] **Step 2: Apply migration to staging**

Run via Supabase MCP:
```
mcp__supabase-staging__apply_migration with name="drawing_module_v2" and the SQL above
```

Verify: `mcp__supabase-staging__execute_sql` with:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'drawing_%'
ORDER BY table_name;
```
Expected: `drawing_questions`, `drawing_submissions`

Also verify old tables are gone:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'nexus_drawing_%';
```
Expected: empty result

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260504_drawing_module_v2.sql
git commit -m "feat(db): replace nexus_drawing tables with drawing_questions and drawing_submissions"
```

---

## Task 2: TypeScript Types — Remove Old, Add New

**Files:**
- Modify: `packages/database/src/types/index.ts`

- [ ] **Step 1: Search for and remove old drawing type definitions**

Search for these patterns in `packages/database/src/types/index.ts` and remove them:
- Any interfaces starting with `NexusDrawingLevel`, `NexusDrawingCategory`, `NexusDrawingExercise`, `NexusDrawingSubmission`, `NexusDrawingAssignment`, `NexusDrawingAssignmentSubmission`
- Any joined types like `NexusDrawingExerciseWithCategory`, `NexusDrawingLevelWithCategories`, etc.

Use grep to locate them:
```bash
grep -n "NexusDrawing" packages/database/src/types/index.ts
```

Remove all matched interface/type definitions.

- [ ] **Step 2: Add new drawing types**

Add these at the end of the file (before any closing brackets):

```typescript
// ============================================================
// Drawing Module V2
// ============================================================

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

export interface DrawingSubmissionWithQuestion extends DrawingSubmission {
  question: DrawingQuestion | null;
}

export interface DrawingSubmissionWithDetails extends DrawingSubmission {
  question: DrawingQuestion | null;
  student: { id: string; name: string; email: string; avatar_url: string | null };
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd packages/database && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add packages/database/src/types/index.ts
git commit -m "feat(db): add DrawingQuestion and DrawingSubmission types, remove old nexus drawing types"
```

---

## Task 3: Query Functions — Rewrite drawings.ts

**Files:**
- Rewrite: `packages/database/src/queries/nexus/drawings.ts`

- [ ] **Step 1: Replace the entire file contents**

```typescript
import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import type {
  DrawingQuestion,
  DrawingSubmission,
  DrawingSubmissionWithQuestion,
  DrawingSubmissionWithDetails,
} from '../../types';

// ============================================================
// Drawing Questions
// ============================================================

export async function getDrawingQuestions(
  filters?: {
    category?: string;
    sub_type?: string;
    difficulty_tag?: string;
    year?: number;
    search?: string;
    limit?: number;
    offset?: number;
  },
  client?: TypedSupabaseClient
): Promise<{ data: DrawingQuestion[]; count: number }> {
  const supabase = client || getSupabaseAdminClient();

  let query = supabase
    .from('drawing_questions')
    .select('*', { count: 'exact' })
    .eq('is_active', true)
    .order('year', { ascending: false })
    .order('created_at', { ascending: false });

  if (filters?.category) query = query.eq('category', filters.category);
  if (filters?.sub_type) query = query.eq('sub_type', filters.sub_type);
  if (filters?.difficulty_tag) query = query.eq('difficulty_tag', filters.difficulty_tag);
  if (filters?.year) query = query.eq('year', filters.year);
  if (filters?.search) query = query.ilike('question_text', `%${filters.search}%`);

  const limit = filters?.limit || 20;
  const offset = filters?.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: (data as DrawingQuestion[]) || [], count: count || 0 };
}

export async function getDrawingQuestionById(
  id: string,
  client?: TypedSupabaseClient
): Promise<DrawingQuestion | null> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('drawing_questions')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data as DrawingQuestion;
}

export async function seedDrawingQuestions(
  questions: Omit<DrawingQuestion, 'id' | 'created_at' | 'updated_at' | 'is_active' | 'reference_images' | 'solution_images'>[],
  client?: TypedSupabaseClient
): Promise<number> {
  const supabase = client || getSupabaseAdminClient();

  const rows = questions.map((q) => ({
    year: q.year,
    session_date: q.session_date || null,
    source_student: q.source_student || null,
    category: q.category,
    sub_type: q.sub_type,
    question_text: q.question_text,
    objects: q.objects || [],
    color_constraint: q.color_constraint || null,
    design_principle: q.design_principle || null,
    difficulty_tag: q.difficulty_tag || 'medium',
    tags: q.tags || [],
    reference_images: [],
    solution_images: null,
    is_active: true,
  }));

  const { data, error } = await supabase
    .from('drawing_questions')
    .insert(rows)
    .select('id');

  if (error) throw error;
  return data?.length || 0;
}

// ============================================================
// Drawing Submissions — Student
// ============================================================

export async function createDrawingSubmission(
  data: {
    student_id: string;
    question_id?: string | null;
    source_type: string;
    original_image_url: string;
    self_note?: string | null;
  },
  client?: TypedSupabaseClient
): Promise<DrawingSubmission> {
  const supabase = client || getSupabaseAdminClient();

  const { data: submission, error } = await supabase
    .from('drawing_submissions')
    .insert({
      student_id: data.student_id,
      question_id: data.question_id || null,
      source_type: data.source_type,
      original_image_url: data.original_image_url,
      self_note: data.self_note || null,
      status: 'submitted',
    })
    .select('*')
    .single();

  if (error) throw error;
  return submission as DrawingSubmission;
}

export async function getStudentDrawingSubmissions(
  studentId: string,
  filters?: {
    status?: string;
    question_id?: string;
    limit?: number;
    offset?: number;
  },
  client?: TypedSupabaseClient
): Promise<DrawingSubmissionWithQuestion[]> {
  const supabase = client || getSupabaseAdminClient();

  let query = supabase
    .from('drawing_submissions')
    .select('*, question:drawing_questions(*)')
    .eq('student_id', studentId)
    .order('submitted_at', { ascending: false });

  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.question_id) query = query.eq('question_id', filters.question_id);

  const limit = filters?.limit || 50;
  const offset = filters?.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error } = await query;
  if (error) throw error;
  return (data as DrawingSubmissionWithQuestion[]) || [];
}

export async function getDrawingSubmissionById(
  id: string,
  client?: TypedSupabaseClient
): Promise<DrawingSubmissionWithDetails | null> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('drawing_submissions')
    .select('*, question:drawing_questions(*), student:users!drawing_submissions_student_id_fkey(id, name, email, avatar_url)')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data as unknown as DrawingSubmissionWithDetails;
}

// ============================================================
// Drawing Submissions — Teacher
// ============================================================

export async function getDrawingReviewQueue(
  filters?: {
    status?: string;
    category?: string;
    student_id?: string;
    limit?: number;
    offset?: number;
  },
  client?: TypedSupabaseClient
): Promise<DrawingSubmissionWithDetails[]> {
  const supabase = client || getSupabaseAdminClient();

  let query = supabase
    .from('drawing_submissions')
    .select('*, question:drawing_questions(*), student:users!drawing_submissions_student_id_fkey(id, name, email, avatar_url)')
    .order('submitted_at', { ascending: true });

  const status = filters?.status || 'submitted';
  query = query.eq('status', status);

  if (filters?.student_id) query = query.eq('student_id', filters.student_id);

  const limit = filters?.limit || 50;
  const offset = filters?.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error } = await query;
  if (error) throw error;

  let results = (data as unknown as DrawingSubmissionWithDetails[]) || [];

  // Filter by category if specified (requires joining through question)
  if (filters?.category) {
    results = results.filter((s) => s.question?.category === filters.category);
  }

  return results;
}

export async function saveDrawingReview(
  submissionId: string,
  review: {
    tutor_rating: number;
    tutor_feedback?: string | null;
    reviewed_image_url?: string | null;
    tutor_resources?: Array<{ type: string; url: string; title: string }>;
  },
  client?: TypedSupabaseClient
): Promise<DrawingSubmission> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('drawing_submissions')
    .update({
      tutor_rating: review.tutor_rating,
      tutor_feedback: review.tutor_feedback || null,
      reviewed_image_url: review.reviewed_image_url || null,
      tutor_resources: review.tutor_resources || [],
      status: 'reviewed',
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', submissionId)
    .select('*')
    .single();

  if (error) throw error;
  return data as DrawingSubmission;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd packages/database && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add packages/database/src/queries/nexus/drawings.ts
git commit -m "feat(db): rewrite drawing query functions for question-bank model"
```

---

## Task 4: Seed Data JSON File

**Files:**
- Create: `packages/database/src/data/nata_2025_drawing_questions.json`

- [ ] **Step 1: Create the seed data file**

Copy the 96-question JSON from the conversation attachment (`nata_2025_drawing_questions.json`) into `packages/database/src/data/nata_2025_drawing_questions.json`. The structure already matches the `drawing_questions` columns.

- [ ] **Step 2: Commit**

```bash
git add packages/database/src/data/nata_2025_drawing_questions.json
git commit -m "feat(db): add NATA 2025 drawing questions seed data (96 questions)"
```

---

## Task 5: Delete Old API Routes and Pages

**Files:**
- Delete: `apps/nexus/src/app/api/drawings/route.ts`
- Delete: `apps/nexus/src/app/api/drawings/upload/route.ts`
- Delete: `apps/nexus/src/app/api/drawings/submissions/route.ts`
- Delete: `apps/nexus/src/app/api/drawings/evaluate/route.ts`
- Delete: `apps/nexus/src/app/(teacher)/teacher/evaluate/page.tsx`

- [ ] **Step 1: Delete old files**

```bash
rm -rf apps/nexus/src/app/api/drawings/
rm -f apps/nexus/src/app/\(teacher\)/teacher/evaluate/page.tsx
```

- [ ] **Step 2: Commit**

```bash
git add -A apps/nexus/src/app/api/drawings/ apps/nexus/src/app/\(teacher\)/teacher/evaluate/
git commit -m "chore(nexus): remove old drawing API routes and evaluate page"
```

---

## Task 6: API Routes — Questions

**Files:**
- Create: `apps/nexus/src/app/api/drawing/questions/route.ts`
- Create: `apps/nexus/src/app/api/drawing/questions/[id]/route.ts`
- Create: `apps/nexus/src/app/api/drawing/questions/seed/route.ts`

- [ ] **Step 1: Create GET /api/drawing/questions**

```typescript
// apps/nexus/src/app/api/drawing/questions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getDrawingQuestions } from '@neram/database/queries/nexus';

export async function GET(request: NextRequest) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));

    const params = request.nextUrl.searchParams;
    const filters = {
      category: params.get('category') || undefined,
      sub_type: params.get('sub_type') || undefined,
      difficulty_tag: params.get('difficulty_tag') || undefined,
      year: params.get('year') ? parseInt(params.get('year')!) : undefined,
      search: params.get('search') || undefined,
      limit: params.get('limit') ? parseInt(params.get('limit')!) : 20,
      offset: params.get('offset') ? parseInt(params.get('offset')!) : 0,
    };

    const { data, count } = await getDrawingQuestions(filters);
    return NextResponse.json({ questions: data, total: count });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load questions';
    console.error('Drawing questions GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
```

- [ ] **Step 2: Create GET /api/drawing/questions/[id]**

```typescript
// apps/nexus/src/app/api/drawing/questions/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getDrawingQuestionById } from '@neram/database/queries/nexus';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));
    const { id } = await params;

    const question = await getDrawingQuestionById(id);
    if (!question) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }

    return NextResponse.json({ question });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load question';
    console.error('Drawing question GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
```

- [ ] **Step 3: Create POST /api/drawing/questions/seed**

```typescript
// apps/nexus/src/app/api/drawing/questions/seed/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { seedDrawingQuestions } from '@neram/database/queries/nexus';

export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));

    // Verify user is teacher/admin
    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user || !['teacher', 'admin'].includes(user.user_type)) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const body = await request.json();
    const questions = Array.isArray(body) ? body : body.questions;

    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json({ error: 'No questions provided' }, { status: 400 });
    }

    const count = await seedDrawingQuestions(questions);
    return NextResponse.json({ seeded: count }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Seed failed';
    console.error('Drawing seed error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/nexus/src/app/api/drawing/questions/
git commit -m "feat(nexus): add drawing questions API routes (list, detail, seed)"
```

---

## Task 7: API Routes — Submissions & Upload

**Files:**
- Create: `apps/nexus/src/app/api/drawing/upload/route.ts`
- Create: `apps/nexus/src/app/api/drawing/submissions/route.ts`
- Create: `apps/nexus/src/app/api/drawing/submissions/my/route.ts`
- Create: `apps/nexus/src/app/api/drawing/submissions/review-queue/route.ts`
- Create: `apps/nexus/src/app/api/drawing/submissions/[id]/route.ts`
- Create: `apps/nexus/src/app/api/drawing/submissions/[id]/review/route.ts`

- [ ] **Step 1: Create POST /api/drawing/upload**

```typescript
// apps/nexus/src/app/api/drawing/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const bucket = (formData.get('bucket') as string) || 'drawing-uploads';

    if (!file) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const ext = file.name.split('.').pop() || 'png';
    const timestamp = Date.now();
    const filePath = `${user.id}/${timestamp}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath);

    return NextResponse.json({ url: urlData.publicUrl, path: filePath });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    console.error('Drawing upload error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create POST /api/drawing/submissions**

```typescript
// apps/nexus/src/app/api/drawing/submissions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { createDrawingSubmission } from '@neram/database/queries/nexus';
import { recordGamificationEvent } from '@neram/database/queries/nexus';

export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const body = await request.json();
    const { question_id, source_type, original_image_url, self_note } = body;

    if (!original_image_url || !source_type) {
      return NextResponse.json(
        { error: 'Missing required fields: original_image_url, source_type' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const submission = await createDrawingSubmission({
      student_id: user.id,
      question_id: question_id || null,
      source_type,
      original_image_url,
      self_note: self_note || null,
    });

    // Record gamification points (non-critical)
    try {
      const { data: enrollment } = await supabase
        .from('nexus_enrollments')
        .select('classroom_id, batch_id')
        .eq('user_id', user.id)
        .eq('role', 'student')
        .limit(1)
        .single();

      if (enrollment) {
        recordGamificationEvent({
          student_id: user.id,
          classroom_id: (enrollment as any).classroom_id,
          batch_id: (enrollment as any).batch_id || null,
          event_type: 'drawing_submitted',
          points: 5,
          source_id: `draw_${submission.id}`,
          activity_type: 'drawing_submitted',
          activity_title: 'Submitted a drawing practice',
          metadata: { question_id, submission_id: submission.id },
        }).catch(() => {});
      }
    } catch {
      // Non-critical
    }

    return NextResponse.json({ submission }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create submission';
    console.error('Drawing submission POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Create GET /api/drawing/submissions/my**

```typescript
// apps/nexus/src/app/api/drawing/submissions/my/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getStudentDrawingSubmissions } from '@neram/database/queries/nexus';

export async function GET(request: NextRequest) {
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

    const params = request.nextUrl.searchParams;
    const filters = {
      status: params.get('status') || undefined,
      question_id: params.get('question_id') || undefined,
      limit: params.get('limit') ? parseInt(params.get('limit')!) : 50,
      offset: params.get('offset') ? parseInt(params.get('offset')!) : 0,
    };

    const submissions = await getStudentDrawingSubmissions(user.id, filters);
    return NextResponse.json({ submissions });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load submissions';
    console.error('My submissions GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
```

- [ ] **Step 4: Create GET /api/drawing/submissions/review-queue**

```typescript
// apps/nexus/src/app/api/drawing/submissions/review-queue/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getDrawingReviewQueue } from '@neram/database/queries/nexus';

export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user || !['teacher', 'admin'].includes(user.user_type)) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const params = request.nextUrl.searchParams;
    const filters = {
      status: params.get('status') || 'submitted',
      category: params.get('category') || undefined,
      student_id: params.get('student_id') || undefined,
      limit: params.get('limit') ? parseInt(params.get('limit')!) : 50,
      offset: params.get('offset') ? parseInt(params.get('offset')!) : 0,
    };

    const submissions = await getDrawingReviewQueue(filters);
    return NextResponse.json({ submissions });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load review queue';
    console.error('Review queue GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
```

- [ ] **Step 5: Create GET /api/drawing/submissions/[id]**

```typescript
// apps/nexus/src/app/api/drawing/submissions/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getDrawingSubmissionById } from '@neram/database/queries/nexus';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));
    const { id } = await params;

    const submission = await getDrawingSubmissionById(id);
    if (!submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    return NextResponse.json({ submission });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load submission';
    console.error('Submission GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
```

- [ ] **Step 6: Create PATCH /api/drawing/submissions/[id]/review**

```typescript
// apps/nexus/src/app/api/drawing/submissions/[id]/review/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { saveDrawingReview, getDrawingSubmissionById } from '@neram/database/queries/nexus';
import { recordGamificationEvent } from '@neram/database/queries/nexus';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const { id } = await params;

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user || !['teacher', 'admin'].includes(user.user_type)) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const body = await request.json();
    const { tutor_rating, tutor_feedback, reviewed_image_url, tutor_resources } = body;

    if (!tutor_rating || tutor_rating < 1 || tutor_rating > 5) {
      return NextResponse.json({ error: 'Rating must be between 1 and 5' }, { status: 400 });
    }

    const submission = await saveDrawingReview(id, {
      tutor_rating,
      tutor_feedback,
      reviewed_image_url,
      tutor_resources,
    });

    // Record gamification for student (non-critical)
    try {
      const { data: enrollment } = await supabase
        .from('nexus_enrollments')
        .select('classroom_id, batch_id')
        .eq('user_id', submission.student_id)
        .eq('role', 'student')
        .limit(1)
        .single();

      if (enrollment) {
        recordGamificationEvent({
          student_id: submission.student_id,
          classroom_id: (enrollment as any).classroom_id,
          batch_id: (enrollment as any).batch_id || null,
          event_type: 'drawing_reviewed',
          points: 3,
          source_id: `review_${submission.id}`,
          activity_type: 'drawing_reviewed',
          activity_title: 'Drawing reviewed by tutor',
          metadata: { submission_id: submission.id, rating: tutor_rating },
        }).catch(() => {});
      }
    } catch {
      // Non-critical
    }

    return NextResponse.json({ submission });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save review';
    console.error('Drawing review PATCH error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 7: Commit**

```bash
git add apps/nexus/src/app/api/drawing/
git commit -m "feat(nexus): add drawing submissions and upload API routes"
```

---

## Task 8: Shared Drawing Components

**Files:**
- Create: `apps/nexus/src/components/drawings/CategoryBadge.tsx`
- Create: `apps/nexus/src/components/drawings/DifficultyChip.tsx`
- Create: `apps/nexus/src/components/drawings/ReferenceImageToggle.tsx`

- [ ] **Step 1: Create CategoryBadge**

```typescript
// apps/nexus/src/components/drawings/CategoryBadge.tsx
'use client';

import { Chip } from '@neram/ui';

const CATEGORY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  '2d_composition': { label: '2D', color: '#1565c0', bg: '#e3f2fd' },
  '3d_composition': { label: '3D', color: '#2e7d32', bg: '#e8f5e9' },
  'kit_sculpture': { label: 'Kit', color: '#6a1b9a', bg: '#f3e5f5' },
};

export default function CategoryBadge({ category }: { category: string }) {
  const config = CATEGORY_CONFIG[category] || { label: category, color: '#666', bg: '#f5f5f5' };
  return (
    <Chip
      label={config.label}
      size="small"
      sx={{
        color: config.color,
        bgcolor: config.bg,
        fontWeight: 600,
        fontSize: '0.7rem',
        height: 22,
      }}
    />
  );
}
```

- [ ] **Step 2: Create DifficultyChip**

```typescript
// apps/nexus/src/components/drawings/DifficultyChip.tsx
'use client';

import { Chip } from '@neram/ui';

const DIFFICULTY_CONFIG: Record<string, { color: string; bg: string }> = {
  easy: { color: '#2e7d32', bg: '#e8f5e9' },
  medium: { color: '#e65100', bg: '#fff3e0' },
  hard: { color: '#c62828', bg: '#ffebee' },
};

export default function DifficultyChip({ difficulty }: { difficulty: string }) {
  const config = DIFFICULTY_CONFIG[difficulty] || { color: '#666', bg: '#f5f5f5' };
  return (
    <Chip
      label={difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
      size="small"
      sx={{
        color: config.color,
        bgcolor: config.bg,
        fontWeight: 500,
        fontSize: '0.7rem',
        height: 22,
      }}
    />
  );
}
```

- [ ] **Step 3: Create ReferenceImageToggle**

```typescript
// apps/nexus/src/components/drawings/ReferenceImageToggle.tsx
'use client';

import { useState } from 'react';
import { Box, ToggleButton, ToggleButtonGroup, Typography } from '@neram/ui';

interface ReferenceImage {
  level: number;
  url: string;
  alt_text?: string;
}

export default function ReferenceImageToggle({ images }: { images: ReferenceImage[] }) {
  const [level, setLevel] = useState(1);

  if (!images || images.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
        No reference images available yet
      </Typography>
    );
  }

  const currentImage = images.find((img) => img.level === level) || images[0];

  return (
    <Box>
      <ToggleButtonGroup
        value={level}
        exclusive
        onChange={(_, v) => v !== null && setLevel(v)}
        size="small"
        sx={{ mb: 1.5 }}
      >
        <ToggleButton value={1} sx={{ textTransform: 'none', px: 2 }}>Beginner</ToggleButton>
        <ToggleButton value={2} sx={{ textTransform: 'none', px: 2 }}>Intermediate</ToggleButton>
        <ToggleButton value={3} sx={{ textTransform: 'none', px: 2 }}>Advanced</ToggleButton>
      </ToggleButtonGroup>
      {currentImage && (
        <Box
          component="img"
          src={currentImage.url}
          alt={currentImage.alt_text || `Level ${level} reference`}
          sx={{
            width: '100%',
            maxHeight: 400,
            objectFit: 'contain',
            borderRadius: 1,
            bgcolor: 'grey.50',
          }}
        />
      )}
    </Box>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/nexus/src/components/drawings/
git commit -m "feat(nexus): add shared drawing components (CategoryBadge, DifficultyChip, ReferenceImageToggle)"
```

---

## Task 9: Student Pages — Question Bank Browse & Detail

**Files:**
- Rewrite: `apps/nexus/src/app/(student)/student/drawings/page.tsx`
- Create: `apps/nexus/src/app/(student)/student/drawings/[questionId]/page.tsx`
- Create: `apps/nexus/src/components/drawings/DrawingQuestionCard.tsx`
- Create: `apps/nexus/src/components/drawings/DrawingSubmissionSheet.tsx`

- [ ] **Step 1: Create DrawingQuestionCard**

```typescript
// apps/nexus/src/components/drawings/DrawingQuestionCard.tsx
'use client';

import { Card, CardContent, Typography, Box, CardActionArea } from '@neram/ui';
import CategoryBadge from './CategoryBadge';
import DifficultyChip from './DifficultyChip';
import type { DrawingQuestion } from '@neram/database/types';

export default function DrawingQuestionCard({
  question,
  onClick,
}: {
  question: DrawingQuestion;
  onClick: () => void;
}) {
  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardActionArea onClick={onClick} sx={{ height: '100%', p: 0 }}>
        <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Box sx={{ display: 'flex', gap: 0.5, mb: 1, flexWrap: 'wrap' }}>
            <CategoryBadge category={question.category} />
            <DifficultyChip difficulty={question.difficulty_tag} />
          </Box>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 500,
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              lineHeight: 1.4,
              fontSize: '0.82rem',
            }}
          >
            {question.question_text}
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, mt: 1, flexWrap: 'wrap' }}>
            {question.objects.slice(0, 3).map((obj) => (
              <Typography
                key={obj}
                variant="caption"
                sx={{ color: 'text.secondary', bgcolor: 'grey.100', px: 0.75, py: 0.25, borderRadius: 0.5 }}
              >
                {obj}
              </Typography>
            ))}
            {question.objects.length > 3 && (
              <Typography variant="caption" color="text.secondary">
                +{question.objects.length - 3}
              </Typography>
            )}
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            NATA {question.year}
          </Typography>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
```

- [ ] **Step 2: Create DrawingSubmissionSheet**

```typescript
// apps/nexus/src/components/drawings/DrawingSubmissionSheet.tsx
'use client';

import { useState, useRef } from 'react';
import {
  Box, Button, Typography, TextField, Paper, IconButton,
  LinearProgress, Drawer,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import CameraAltOutlinedIcon from '@mui/icons-material/CameraAltOutlined';
import PhotoLibraryOutlinedIcon from '@mui/icons-material/PhotoLibraryOutlined';

interface DrawingSubmissionSheetProps {
  open: boolean;
  onClose: () => void;
  questionId?: string;
  sourceType: 'question_bank' | 'free_practice';
  getToken: () => Promise<string | null>;
  onSubmitted: () => void;
}

export default function DrawingSubmissionSheet({
  open, onClose, questionId, sourceType, getToken, onSubmitted,
}: DrawingSubmissionSheetProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [selfNote, setSelfNote] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    if (!selected.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }
    if (selected.size > 10 * 1024 * 1024) {
      setError('Image must be under 10MB');
      return;
    }
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
    setError('');
  };

  const handleSubmit = async () => {
    if (!file) return;
    setUploading(true);
    setProgress(10);

    try {
      const token = await getToken();

      // 1. Upload image
      const formData = new FormData();
      formData.append('file', file);
      formData.append('bucket', 'drawing-uploads');
      setProgress(30);

      const uploadRes = await fetch('/api/drawing/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!uploadRes.ok) throw new Error('Upload failed');
      const { url } = await uploadRes.json();
      setProgress(60);

      // 2. Create submission
      const submitRes = await fetch('/api/drawing/submissions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question_id: questionId || null,
          source_type: sourceType,
          original_image_url: url,
          self_note: selfNote || null,
        }),
      });

      if (!submitRes.ok) throw new Error('Submission failed');
      setProgress(100);

      // Reset and close
      setFile(null);
      setPreview(null);
      setSelfNote('');
      onSubmitted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <Drawer anchor="bottom" open={open} onClose={onClose}>
      <Paper sx={{ p: 2, maxHeight: '90vh', overflow: 'auto' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Typography variant="subtitle1" fontWeight={600} sx={{ flex: 1 }}>
            Submit Your Drawing
          </Typography>
          <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
        </Box>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />

        {!preview ? (
          <Box sx={{ display: 'flex', gap: 1.5, mb: 2 }}>
            <Button
              variant="outlined"
              startIcon={<CameraAltOutlinedIcon />}
              onClick={() => { if (fileRef.current) { fileRef.current.capture = 'environment'; fileRef.current.click(); } }}
              sx={{ flex: 1, minHeight: 48, textTransform: 'none' }}
            >
              Camera
            </Button>
            <Button
              variant="outlined"
              startIcon={<PhotoLibraryOutlinedIcon />}
              onClick={() => { if (fileRef.current) { fileRef.current.removeAttribute('capture'); fileRef.current.click(); } }}
              sx={{ flex: 1, minHeight: 48, textTransform: 'none' }}
            >
              Gallery
            </Button>
          </Box>
        ) : (
          <Box sx={{ mb: 2 }}>
            <Box
              component="img"
              src={preview}
              alt="Preview"
              sx={{ width: '100%', maxHeight: 300, objectFit: 'contain', borderRadius: 1, bgcolor: 'grey.50' }}
            />
            <Button size="small" onClick={() => { setFile(null); setPreview(null); }} sx={{ mt: 0.5 }}>
              Change image
            </Button>
          </Box>
        )}

        <TextField
          label="Self-reflection note (optional)"
          placeholder="e.g., I struggled with the shadow direction..."
          multiline
          rows={2}
          fullWidth
          value={selfNote}
          onChange={(e) => setSelfNote(e.target.value)}
          sx={{ mb: 2 }}
        />

        {uploading && <LinearProgress variant="determinate" value={progress} sx={{ mb: 1 }} />}
        {error && <Typography color="error" variant="caption" sx={{ mb: 1, display: 'block' }}>{error}</Typography>}

        <Button
          variant="contained"
          fullWidth
          disabled={!file || uploading}
          onClick={handleSubmit}
          sx={{ minHeight: 48, textTransform: 'none' }}
        >
          {uploading ? 'Submitting...' : 'Submit Drawing'}
        </Button>
      </Paper>
    </Drawer>
  );
}
```

- [ ] **Step 3: Rewrite student drawings browse page**

```typescript
// apps/nexus/src/app/(student)/student/drawings/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box, Typography, Tabs, Tab, TextField, Skeleton, Grid,
  InputAdornment, Chip, Button,
} from '@neram/ui';
import SearchIcon from '@mui/icons-material/Search';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import DrawingQuestionCard from '@/components/drawings/DrawingQuestionCard';
import type { DrawingQuestion } from '@neram/database/types';

const CATEGORIES = [
  { value: '', label: 'All' },
  { value: '2d_composition', label: '2D Composition' },
  { value: '3d_composition', label: '3D Objects' },
  { value: 'kit_sculpture', label: 'Kit / Sculpture' },
];

const DIFFICULTIES = ['easy', 'medium', 'hard'];

export default function StudentDrawingsPage() {
  const router = useRouter();
  const { getToken } = useNexusAuthContext();
  const [questions, setQuestions] = useState<DrawingQuestion[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams();
      if (category) params.set('category', category);
      if (difficulty) params.set('difficulty_tag', difficulty);
      if (search) params.set('search', search);
      params.set('limit', String(limit));
      params.set('offset', String(offset));

      const res = await fetch(`/api/drawing/questions?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setQuestions(data.questions || []);
      setTotal(data.total || 0);
    } catch {
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  }, [getToken, category, difficulty, search, offset]);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  // Reset offset when filters change
  useEffect(() => {
    setOffset(0);
  }, [category, difficulty, search]);

  return (
    <Box sx={{ px: { xs: 2, sm: 3 }, py: 2, maxWidth: 1200, mx: 'auto' }}>
      <Typography variant="h6" fontWeight={700} gutterBottom>
        Drawing Question Bank
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {total} NATA drawing questions to practice
      </Typography>

      {/* Category tabs */}
      <Tabs
        value={category}
        onChange={(_, v) => setCategory(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ mb: 1.5, minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0.5, textTransform: 'none' } }}
      >
        {CATEGORIES.map((c) => (
          <Tab key={c.value} value={c.value} label={c.label} />
        ))}
      </Tabs>

      {/* Filters row */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          placeholder="Search questions..."
          size="small"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18 }} /></InputAdornment>
            ),
          }}
          sx={{ flex: 1, minWidth: 180 }}
        />
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          {DIFFICULTIES.map((d) => (
            <Chip
              key={d}
              label={d.charAt(0).toUpperCase() + d.slice(1)}
              size="small"
              variant={difficulty === d ? 'filled' : 'outlined'}
              color={difficulty === d ? 'primary' : 'default'}
              onClick={() => setDifficulty(difficulty === d ? '' : d)}
              sx={{ cursor: 'pointer' }}
            />
          ))}
        </Box>
      </Box>

      {/* My Submissions link */}
      <Button
        variant="text"
        size="small"
        onClick={() => router.push('/student/drawings/submissions')}
        sx={{ mb: 2, textTransform: 'none' }}
      >
        View My Submissions &rarr;
      </Button>

      {/* Question grid */}
      {loading ? (
        <Grid container spacing={1.5}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Grid item xs={6} sm={4} md={3} key={i}>
              <Skeleton variant="rounded" height={160} />
            </Grid>
          ))}
        </Grid>
      ) : questions.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography color="text.secondary">No questions match your filters</Typography>
        </Box>
      ) : (
        <>
          <Grid container spacing={1.5}>
            {questions.map((q) => (
              <Grid item xs={6} sm={4} md={3} key={q.id}>
                <DrawingQuestionCard
                  question={q}
                  onClick={() => router.push(`/student/drawings/${q.id}`)}
                />
              </Grid>
            ))}
          </Grid>
          {questions.length < total && (
            <Box sx={{ textAlign: 'center', mt: 3 }}>
              <Button
                variant="outlined"
                onClick={() => setOffset((prev) => prev + limit)}
                sx={{ textTransform: 'none' }}
              >
                Load more
              </Button>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
```

- [ ] **Step 4: Create question detail page**

```typescript
// apps/nexus/src/app/(student)/student/drawings/[questionId]/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Box, Typography, Paper, Fab, Skeleton, Chip, IconButton, Divider,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import CategoryBadge from '@/components/drawings/CategoryBadge';
import DifficultyChip from '@/components/drawings/DifficultyChip';
import ReferenceImageToggle from '@/components/drawings/ReferenceImageToggle';
import DrawingSubmissionSheet from '@/components/drawings/DrawingSubmissionSheet';
import type { DrawingQuestion, DrawingSubmissionWithQuestion } from '@neram/database/types';

export default function QuestionDetailPage() {
  const { questionId } = useParams<{ questionId: string }>();
  const router = useRouter();
  const { getToken } = useNexusAuthContext();
  const [question, setQuestion] = useState<DrawingQuestion | null>(null);
  const [submissions, setSubmissions] = useState<DrawingSubmissionWithQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const [qRes, sRes] = await Promise.all([
        fetch(`/api/drawing/questions/${questionId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/drawing/submissions/my?question_id=${questionId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      const qData = await qRes.json();
      const sData = await sRes.json();
      setQuestion(qData.question || null);
      setSubmissions(sData.submissions || []);
    } catch {
      setQuestion(null);
    } finally {
      setLoading(false);
    }
  }, [getToken, questionId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <Box sx={{ px: { xs: 2, sm: 3 }, py: 2 }}>
        <Skeleton height={40} width={200} />
        <Skeleton height={120} sx={{ mt: 2 }} />
        <Skeleton height={300} sx={{ mt: 2 }} />
      </Box>
    );
  }

  if (!question) {
    return (
      <Box sx={{ px: 2, py: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">Question not found</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ px: { xs: 2, sm: 3 }, py: 2, maxWidth: 800, mx: 'auto', pb: 10 }}>
      <IconButton onClick={() => router.back()} sx={{ mb: 1 }}>
        <ArrowBackIcon />
      </IconButton>

      <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
        <CategoryBadge category={question.category} />
        <DifficultyChip difficulty={question.difficulty_tag} />
        <Chip label={`NATA ${question.year}`} size="small" variant="outlined" />
      </Box>

      <Typography variant="h6" fontWeight={600} sx={{ mb: 2, lineHeight: 1.4 }}>
        {question.question_text}
      </Typography>

      {/* Objects */}
      {question.objects.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" fontWeight={600} color="text.secondary" gutterBottom>
            OBJECTS
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
            {question.objects.map((obj) => (
              <Chip key={obj} label={obj} size="small" variant="outlined" />
            ))}
          </Box>
        </Box>
      )}

      {/* Color constraint */}
      {question.color_constraint && (
        <Paper variant="outlined" sx={{ p: 1.5, mb: 2, bgcolor: 'warning.50' }}>
          <Typography variant="caption" fontWeight={600}>Color Constraint</Typography>
          <Typography variant="body2">{question.color_constraint.replace(/_/g, ' ')}</Typography>
        </Paper>
      )}

      {/* Design principle */}
      {question.design_principle && (
        <Paper variant="outlined" sx={{ p: 1.5, mb: 2, bgcolor: 'info.50' }}>
          <Typography variant="caption" fontWeight={600}>Design Principle</Typography>
          <Typography variant="body2">{question.design_principle.replace(/_/g, ' ')}</Typography>
        </Paper>
      )}

      {/* Reference images */}
      {question.reference_images.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" fontWeight={600} gutterBottom>
            Reference Images
          </Typography>
          <ReferenceImageToggle images={question.reference_images} />
        </Box>
      )}

      <Divider sx={{ my: 3 }} />

      {/* My submissions for this question */}
      <Typography variant="subtitle2" fontWeight={600} gutterBottom>
        My Submissions ({submissions.length})
      </Typography>
      {submissions.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
          You haven&apos;t practiced this question yet. Tap the button below to submit your drawing!
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {submissions.map((s) => (
            <Paper
              key={s.id}
              variant="outlined"
              sx={{ p: 1.5, cursor: 'pointer' }}
              onClick={() => router.push(`/student/drawings/submissions/${s.id}`)}
            >
              <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                <Box
                  component="img"
                  src={s.original_image_url}
                  alt="Submission"
                  sx={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 1 }}
                />
                <Box sx={{ flex: 1 }}>
                  <Chip
                    label={s.status}
                    size="small"
                    color={s.status === 'reviewed' ? 'success' : s.status === 'submitted' ? 'warning' : 'default'}
                    sx={{ mb: 0.5 }}
                  />
                  {s.tutor_rating && (
                    <Typography variant="caption" display="block">
                      Rating: {'★'.repeat(s.tutor_rating)}{'☆'.repeat(5 - s.tutor_rating)}
                    </Typography>
                  )}
                  <Typography variant="caption" color="text.secondary">
                    {new Date(s.submitted_at).toLocaleDateString()}
                  </Typography>
                </Box>
              </Box>
            </Paper>
          ))}
        </Box>
      )}

      {/* Practice FAB */}
      <Fab
        color="primary"
        variant="extended"
        onClick={() => setSheetOpen(true)}
        sx={{
          position: 'fixed',
          bottom: { xs: 80, sm: 24 },
          right: { xs: 16, sm: 24 },
          textTransform: 'none',
        }}
      >
        <BrushOutlinedIcon sx={{ mr: 1 }} />
        Practice This
      </Fab>

      <DrawingSubmissionSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        questionId={questionId}
        sourceType="question_bank"
        getToken={getToken}
        onSubmitted={fetchData}
      />
    </Box>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/nexus/src/components/drawings/DrawingQuestionCard.tsx apps/nexus/src/components/drawings/DrawingSubmissionSheet.tsx apps/nexus/src/app/\(student\)/student/drawings/
git commit -m "feat(nexus): add student question bank browse and detail pages"
```

---

## Task 10: Student Pages — My Submissions

**Files:**
- Create: `apps/nexus/src/app/(student)/student/drawings/submissions/page.tsx`
- Create: `apps/nexus/src/app/(student)/student/drawings/submissions/[id]/page.tsx`

- [ ] **Step 1: Create my submissions list page**

```typescript
// apps/nexus/src/app/(student)/student/drawings/submissions/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box, Typography, Chip, Paper, Skeleton, IconButton, Tabs, Tab,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import CategoryBadge from '@/components/drawings/CategoryBadge';
import type { DrawingSubmissionWithQuestion } from '@neram/database/types';

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'submitted', label: 'Pending' },
  { value: 'reviewed', label: 'Reviewed' },
];

export default function MySubmissionsPage() {
  const router = useRouter();
  const { getToken } = useNexusAuthContext();
  const [submissions, setSubmissions] = useState<DrawingSubmissionWithQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      const res = await fetch(`/api/drawing/submissions/my?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setSubmissions(data.submissions || []);
    } catch {
      setSubmissions([]);
    } finally {
      setLoading(false);
    }
  }, [getToken, status]);

  useEffect(() => { fetch_(); }, [fetch_]);

  return (
    <Box sx={{ px: { xs: 2, sm: 3 }, py: 2, maxWidth: 800, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton onClick={() => router.push('/student/drawings')} size="small">
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h6" fontWeight={700}>My Submissions</Typography>
      </Box>

      <Tabs
        value={status}
        onChange={(_, v) => setStatus(v)}
        sx={{ mb: 2, minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0.5, textTransform: 'none' } }}
      >
        {STATUS_TABS.map((t) => (
          <Tab key={t.value} value={t.value} label={t.label} />
        ))}
      </Tabs>

      {loading ? (
        Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={80} sx={{ mb: 1 }} />)
      ) : submissions.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography color="text.secondary">No submissions yet</Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {submissions.map((s) => (
            <Paper
              key={s.id}
              variant="outlined"
              sx={{ p: 1.5, cursor: 'pointer' }}
              onClick={() => router.push(`/student/drawings/submissions/${s.id}`)}
            >
              <Box sx={{ display: 'flex', gap: 1.5 }}>
                <Box
                  component="img"
                  src={s.original_image_url}
                  alt="Drawing"
                  sx={{ width: 70, height: 70, objectFit: 'cover', borderRadius: 1 }}
                />
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ display: 'flex', gap: 0.5, mb: 0.5 }}>
                    {s.question && <CategoryBadge category={s.question.category} />}
                    <Chip
                      label={s.status}
                      size="small"
                      color={s.status === 'reviewed' ? 'success' : 'warning'}
                    />
                  </Box>
                  <Typography variant="body2" sx={{
                    display: '-webkit-box', WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: '0.82rem',
                  }}>
                    {s.question?.question_text || 'Free Practice'}
                  </Typography>
                  {s.tutor_rating && (
                    <Typography variant="caption">
                      {'★'.repeat(s.tutor_rating)}{'☆'.repeat(5 - s.tutor_rating)}
                    </Typography>
                  )}
                  <Typography variant="caption" color="text.secondary" display="block">
                    {new Date(s.submitted_at).toLocaleDateString()}
                  </Typography>
                </Box>
              </Box>
            </Paper>
          ))}
        </Box>
      )}
    </Box>
  );
}
```

- [ ] **Step 2: Create submission detail page**

```typescript
// apps/nexus/src/app/(student)/student/drawings/submissions/[id]/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Box, Typography, ToggleButton, ToggleButtonGroup, Paper,
  IconButton, Skeleton, Rating, Chip, Divider,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import type { DrawingSubmissionWithDetails, TutorResource } from '@neram/database/types';

export default function SubmissionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { getToken } = useNexusAuthContext();
  const [submission, setSubmission] = useState<DrawingSubmissionWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'original' | 'feedback'>('original');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/drawing/submissions/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setSubmission(data.submission || null);
    } catch {
      setSubmission(null);
    } finally {
      setLoading(false);
    }
  }, [getToken, id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return <Box sx={{ p: 2 }}><Skeleton height={400} /></Box>;
  }

  if (!submission) {
    return <Box sx={{ p: 2, textAlign: 'center' }}><Typography color="text.secondary">Not found</Typography></Box>;
  }

  const hasReview = submission.status === 'reviewed' || submission.status === 'published';

  return (
    <Box sx={{ px: { xs: 2, sm: 3 }, py: 2, maxWidth: 800, mx: 'auto' }}>
      <IconButton onClick={() => router.back()} sx={{ mb: 1 }}><ArrowBackIcon /></IconButton>

      {/* Toggle between views */}
      {hasReview && (
        <ToggleButtonGroup
          value={view}
          exclusive
          onChange={(_, v) => v && setView(v)}
          size="small"
          sx={{ mb: 2 }}
        >
          <ToggleButton value="original" sx={{ textTransform: 'none', px: 2 }}>
            My Drawing
          </ToggleButton>
          <ToggleButton value="feedback" sx={{ textTransform: 'none', px: 2 }}>
            Tutor Feedback
          </ToggleButton>
        </ToggleButtonGroup>
      )}

      {/* Image */}
      <Box
        component="img"
        src={view === 'feedback' && submission.reviewed_image_url
          ? submission.reviewed_image_url
          : submission.original_image_url}
        alt="Drawing"
        sx={{ width: '100%', borderRadius: 1, bgcolor: 'grey.50', mb: 2 }}
      />

      {/* Self note */}
      {view === 'original' && submission.self_note && (
        <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
          <Typography variant="caption" fontWeight={600}>My Note</Typography>
          <Typography variant="body2">{submission.self_note}</Typography>
        </Paper>
      )}

      {/* Tutor feedback section */}
      {view === 'feedback' && hasReview && (
        <>
          {submission.tutor_rating && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <Typography variant="subtitle2">Rating:</Typography>
              <Rating value={submission.tutor_rating} readOnly size="small" />
            </Box>
          )}

          {submission.tutor_feedback && (
            <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
              <Typography variant="caption" fontWeight={600}>Tutor Feedback</Typography>
              <Typography variant="body2" sx={{ mt: 0.5 }}>{submission.tutor_feedback}</Typography>
            </Paper>
          )}

          {/* Resource links */}
          {submission.tutor_resources && submission.tutor_resources.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                Recommended Resources
              </Typography>
              {submission.tutor_resources.map((r: TutorResource, i: number) => (
                <Paper
                  key={i}
                  variant="outlined"
                  sx={{ p: 1.5, mb: 1, cursor: 'pointer' }}
                  onClick={() => {
                    if (r.type === 'youtube') {
                      window.open(r.url, '_blank');
                    } else {
                      router.push(r.url);
                    }
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <PlayCircleOutlineIcon sx={{ color: r.type === 'youtube' ? '#ff0000' : 'primary.main' }} />
                    <Box>
                      <Typography variant="body2" fontWeight={500}>{r.title}</Typography>
                      <Chip
                        label={r.type === 'youtube' ? 'YouTube' : 'Class Recording'}
                        size="small"
                        variant="outlined"
                        sx={{ mt: 0.25 }}
                      />
                    </Box>
                  </Box>
                </Paper>
              ))}
            </Box>
          )}
        </>
      )}

      <Divider sx={{ my: 2 }} />
      <Typography variant="caption" color="text.secondary">
        Submitted {new Date(submission.submitted_at).toLocaleDateString()}
        {submission.reviewed_at && ` · Reviewed ${new Date(submission.reviewed_at).toLocaleDateString()}`}
      </Typography>
    </Box>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/nexus/src/app/\(student\)/student/drawings/submissions/
git commit -m "feat(nexus): add student submissions list and detail pages with feedback view"
```

---

## Task 11: Teacher — Sketch-Over Canvas Component

**Files:**
- Create: `apps/nexus/src/components/drawings/SketchOverCanvas.tsx`

- [ ] **Step 1: Create the enhanced SketchOverCanvas**

This is based on the existing `SketchpadOverlay.tsx` with added redo support and blob export:

```typescript
// apps/nexus/src/components/drawings/SketchOverCanvas.tsx
'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import {
  Box, Button, IconButton, Slider, ToggleButton, ToggleButtonGroup,
  Typography, Paper,
} from '@neram/ui';
import UndoOutlinedIcon from '@mui/icons-material/UndoOutlined';
import RedoOutlinedIcon from '@mui/icons-material/RedoOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import CloseIcon from '@mui/icons-material/Close';
import CreateOutlinedIcon from '@mui/icons-material/CreateOutlined';
import CircleOutlinedIcon from '@mui/icons-material/CircleOutlined';

interface SketchOverCanvasProps {
  imageUrl: string;
  onSave: (blob: Blob) => void;
  onClose: () => void;
}

type DrawTool = 'pen' | 'eraser';

interface DrawPath {
  points: { x: number; y: number }[];
  color: string;
  width: number;
  tool: DrawTool;
}

const COLORS = ['#FF0000', '#0066FF', '#00AA00', '#FF6600', '#9933FF', '#000000'];

export default function SketchOverCanvas({ imageUrl, onSave, onClose }: SketchOverCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<DrawTool>('pen');
  const [color, setColor] = useState('#FF0000');
  const [lineWidth, setLineWidth] = useState(3);
  const [paths, setPaths] = useState<DrawPath[]>([]);
  const [redoStack, setRedoStack] = useState<DrawPath[]>([]);
  const [currentPath, setCurrentPath] = useState<DrawPath | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setBgImage(img);
      if (containerRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        const scale = containerWidth / img.width;
        setCanvasSize({ width: containerWidth, height: img.height * scale });
      }
    };
    img.src = imageUrl;
  }, [imageUrl]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bgImage) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);

    const allPaths = currentPath ? [...paths, currentPath] : paths;
    for (const path of allPaths) {
      if (path.points.length < 2) continue;
      ctx.beginPath();
      ctx.strokeStyle = path.tool === 'eraser' ? '#FFFFFF' : path.color;
      ctx.lineWidth = path.tool === 'eraser' ? path.width * 3 : path.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalCompositeOperation = path.tool === 'eraser' ? 'destination-out' : 'source-over';
      ctx.moveTo(path.points[0].x, path.points[0].y);
      for (let i = 1; i < path.points.length; i++) {
        ctx.lineTo(path.points[i].x, path.points[i].y);
      }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }, [bgImage, paths, currentPath]);

  useEffect(() => { redraw(); }, [redraw]);

  const getCanvasPoint = (e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      const touch = e.touches[0] || e.changedTouches[0];
      return { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const handleStart = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    const point = getCanvasPoint(e);
    setIsDrawing(true);
    setCurrentPath({ points: [point], color, width: lineWidth, tool });
  };

  const handleMove = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    if (!isDrawing || !currentPath) return;
    const point = getCanvasPoint(e);
    setCurrentPath({ ...currentPath, points: [...currentPath.points, point] });
  };

  const handleEnd = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    if (!isDrawing || !currentPath) return;
    setIsDrawing(false);
    setPaths((prev) => [...prev, currentPath]);
    setRedoStack([]); // Clear redo on new stroke
    setCurrentPath(null);
  };

  const handleUndo = () => {
    setPaths((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setRedoStack((r) => [...r, last]);
      return prev.slice(0, -1);
    });
  };

  const handleRedo = () => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setPaths((p) => [...p, last]);
      return prev.slice(0, -1);
    });
  };

  const handleClear = () => {
    setPaths([]);
    setRedoStack([]);
  };

  const handleSave = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true);
    canvas.toBlob((blob) => {
      if (blob) onSave(blob);
      setSaving(false);
    }, 'image/png');
  };

  return (
    <Box sx={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1400, bgcolor: 'background.default', display: 'flex', flexDirection: 'column' }}>
      <Paper elevation={2} sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.5, borderRadius: 0 }}>
        <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
        <Typography variant="body2" fontWeight={600} sx={{ flex: 1 }}>Draw Corrections</Typography>
        <IconButton onClick={handleUndo} disabled={paths.length === 0} size="small"><UndoOutlinedIcon /></IconButton>
        <IconButton onClick={handleRedo} disabled={redoStack.length === 0} size="small"><RedoOutlinedIcon /></IconButton>
        <IconButton onClick={handleClear} disabled={paths.length === 0} size="small"><DeleteOutlineIcon /></IconButton>
        <Button variant="contained" size="small" startIcon={<SaveOutlinedIcon />} onClick={handleSave} disabled={saving} sx={{ textTransform: 'none', minHeight: 36 }}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </Paper>

      <Box ref={containerRef} sx={{ flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center', bgcolor: 'grey.100', touchAction: 'none' }}>
        {canvasSize.width > 0 && (
          <canvas
            ref={canvasRef}
            width={canvasSize.width * 2}
            height={canvasSize.height * 2}
            style={{ width: canvasSize.width, height: canvasSize.height, cursor: 'crosshair' }}
            onMouseDown={handleStart}
            onMouseMove={handleMove}
            onMouseUp={handleEnd}
            onMouseLeave={handleEnd}
            onTouchStart={handleStart}
            onTouchMove={handleMove}
            onTouchEnd={handleEnd}
          />
        )}
      </Box>

      <Paper elevation={4} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1, borderRadius: 0, flexWrap: 'wrap' }}>
        <ToggleButtonGroup value={tool} exclusive onChange={(_, v) => v && setTool(v)} size="small">
          <ToggleButton value="pen" sx={{ px: 1.5 }}><CreateOutlinedIcon sx={{ fontSize: 18 }} /></ToggleButton>
          <ToggleButton value="eraser" sx={{ px: 1.5 }}><CircleOutlinedIcon sx={{ fontSize: 18 }} /></ToggleButton>
        </ToggleButtonGroup>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          {COLORS.map((c) => (
            <Box
              key={c}
              onClick={() => { setColor(c); setTool('pen'); }}
              sx={{ width: 24, height: 24, borderRadius: '50%', bgcolor: c, cursor: 'pointer', border: color === c && tool === 'pen' ? '3px solid' : '2px solid', borderColor: color === c && tool === 'pen' ? 'primary.main' : 'divider' }}
            />
          ))}
        </Box>
        <Slider value={lineWidth} onChange={(_, v) => setLineWidth(v as number)} min={1} max={8} step={1} size="small" sx={{ width: 80 }} />
      </Paper>
    </Box>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/nexus/src/components/drawings/SketchOverCanvas.tsx
git commit -m "feat(nexus): add SketchOverCanvas with redo support and blob export"
```

---

## Task 12: Teacher — Resource Link Search & Review Panel

**Files:**
- Create: `apps/nexus/src/components/drawings/ResourceLinkSearch.tsx`
- Create: `apps/nexus/src/components/drawings/DrawingReviewPanel.tsx`

- [ ] **Step 1: Create ResourceLinkSearch**

```typescript
// apps/nexus/src/components/drawings/ResourceLinkSearch.tsx
'use client';

import { useState } from 'react';
import {
  Box, TextField, Button, Chip, Typography, Paper, IconButton,
  ToggleButton, ToggleButtonGroup, CircularProgress, InputAdornment,
} from '@neram/ui';
import SearchIcon from '@mui/icons-material/Search';
import LinkIcon from '@mui/icons-material/Link';
import CloseIcon from '@mui/icons-material/Close';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import type { TutorResource } from '@neram/database/types';

interface ResourceLinkSearchProps {
  resources: TutorResource[];
  onChange: (resources: TutorResource[]) => void;
  getToken: () => Promise<string | null>;
}

interface LibraryVideo {
  id: string;
  title: string;
}

export default function ResourceLinkSearch({ resources, onChange, getToken }: ResourceLinkSearchProps) {
  const [mode, setMode] = useState<'library' | 'youtube'>('library');
  const [query, setQuery] = useState('');
  const [ytUrl, setYtUrl] = useState('');
  const [ytTitle, setYtTitle] = useState('');
  const [results, setResults] = useState<LibraryVideo[]>([]);
  const [searching, setSearching] = useState(false);

  const searchLibrary = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/library/videos?search=${encodeURIComponent(query)}&limit=5`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setResults((data.videos || []).map((v: any) => ({ id: v.id, title: v.title })));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const addLibraryVideo = (video: LibraryVideo) => {
    if (resources.some((r) => r.url.includes(video.id))) return;
    onChange([...resources, {
      type: 'nexus_video',
      url: `/student/library/${video.id}`,
      title: video.title,
    }]);
    setResults([]);
    setQuery('');
  };

  const isYouTubeUrl = (url: string) => /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(url);

  const addYouTubeLink = () => {
    if (!isYouTubeUrl(ytUrl) || !ytTitle.trim()) return;
    onChange([...resources, { type: 'youtube', url: ytUrl, title: ytTitle }]);
    setYtUrl('');
    setYtTitle('');
  };

  const removeResource = (index: number) => {
    onChange(resources.filter((_, i) => i !== index));
  };

  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={600} gutterBottom>
        Resource Links
      </Typography>

      {/* Current resources */}
      {resources.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mb: 1.5 }}>
          {resources.map((r, i) => (
            <Chip
              key={i}
              icon={<PlayCircleOutlineIcon sx={{ fontSize: 16 }} />}
              label={r.title}
              onDelete={() => removeResource(i)}
              variant="outlined"
              sx={{ justifyContent: 'flex-start', maxWidth: '100%' }}
            />
          ))}
        </Box>
      )}

      <ToggleButtonGroup value={mode} exclusive onChange={(_, v) => v && setMode(v)} size="small" sx={{ mb: 1.5 }}>
        <ToggleButton value="library" sx={{ textTransform: 'none', px: 2 }}>Search Library</ToggleButton>
        <ToggleButton value="youtube" sx={{ textTransform: 'none', px: 2 }}>YouTube URL</ToggleButton>
      </ToggleButtonGroup>

      {mode === 'library' ? (
        <Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              placeholder="Search class recordings..."
              size="small"
              fullWidth
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchLibrary()}
              InputProps={{
                startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18 }} /></InputAdornment>,
              }}
            />
            <Button variant="outlined" size="small" onClick={searchLibrary} disabled={searching} sx={{ minWidth: 80 }}>
              {searching ? <CircularProgress size={16} /> : 'Search'}
            </Button>
          </Box>
          {results.length > 0 && (
            <Paper variant="outlined" sx={{ mt: 1 }}>
              {results.map((v) => (
                <Box
                  key={v.id}
                  sx={{ p: 1, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' }, borderBottom: '1px solid', borderColor: 'divider' }}
                  onClick={() => addLibraryVideo(v)}
                >
                  <Typography variant="body2">{v.title}</Typography>
                </Box>
              ))}
            </Paper>
          )}
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <TextField
            placeholder="https://youtube.com/watch?v=..."
            size="small"
            fullWidth
            value={ytUrl}
            onChange={(e) => setYtUrl(e.target.value)}
            InputProps={{
              startAdornment: <InputAdornment position="start"><LinkIcon sx={{ fontSize: 18 }} /></InputAdornment>,
            }}
            error={ytUrl.length > 0 && !isYouTubeUrl(ytUrl)}
            helperText={ytUrl.length > 0 && !isYouTubeUrl(ytUrl) ? 'Invalid YouTube URL' : ''}
          />
          <TextField
            placeholder="Video title"
            size="small"
            fullWidth
            value={ytTitle}
            onChange={(e) => setYtTitle(e.target.value)}
          />
          <Button
            variant="outlined"
            size="small"
            onClick={addYouTubeLink}
            disabled={!isYouTubeUrl(ytUrl) || !ytTitle.trim()}
            sx={{ alignSelf: 'flex-start', textTransform: 'none' }}
          >
            Add Link
          </Button>
        </Box>
      )}
    </Box>
  );
}
```

- [ ] **Step 2: Create DrawingReviewPanel**

```typescript
// apps/nexus/src/components/drawings/DrawingReviewPanel.tsx
'use client';

import { useState } from 'react';
import {
  Box, Typography, Button, TextField, Rating, Paper, Divider,
} from '@neram/ui';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import SketchOverCanvas from './SketchOverCanvas';
import ResourceLinkSearch from './ResourceLinkSearch';
import CategoryBadge from './CategoryBadge';
import type { DrawingSubmissionWithDetails, TutorResource } from '@neram/database/types';

interface DrawingReviewPanelProps {
  submission: DrawingSubmissionWithDetails;
  getToken: () => Promise<string | null>;
  onReviewSaved: () => void;
}

export default function DrawingReviewPanel({
  submission, getToken, onReviewSaved,
}: DrawingReviewPanelProps) {
  const [sketchOpen, setSketchOpen] = useState(false);
  const [reviewedImageUrl, setReviewedImageUrl] = useState<string | null>(
    submission.reviewed_image_url
  );
  const [rating, setRating] = useState<number>(submission.tutor_rating || 0);
  const [feedback, setFeedback] = useState(submission.tutor_feedback || '');
  const [resources, setResources] = useState<TutorResource[]>(
    submission.tutor_resources || []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSketchSave = async (blob: Blob) => {
    try {
      const token = await getToken();
      const formData = new FormData();
      formData.append('file', blob, 'review.png');
      formData.append('bucket', 'drawing-reviewed');

      const res = await fetch('/api/drawing/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) throw new Error('Upload failed');
      const { url } = await res.json();
      setReviewedImageUrl(url);
      setSketchOpen(false);
    } catch (err) {
      setError('Failed to save sketch');
    }
  };

  const handleSaveReview = async () => {
    if (rating < 1) {
      setError('Please provide a rating');
      return;
    }
    setSaving(true);
    setError('');

    try {
      const token = await getToken();
      const res = await fetch(`/api/drawing/submissions/${submission.id}/review`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tutor_rating: rating,
          tutor_feedback: feedback || null,
          reviewed_image_url: reviewedImageUrl,
          tutor_resources: resources,
        }),
      });

      if (!res.ok) throw new Error('Failed to save review');
      onReviewSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      {/* Student info */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Typography variant="subtitle1" fontWeight={600}>
          {submission.student?.name || 'Student'}
        </Typography>
        {submission.question && <CategoryBadge category={submission.question.category} />}
      </Box>

      {/* Question text */}
      {submission.question && (
        <Paper variant="outlined" sx={{ p: 1.5, mb: 2, bgcolor: 'grey.50' }}>
          <Typography variant="body2">{submission.question.question_text}</Typography>
        </Paper>
      )}

      {/* Student's drawing */}
      <Box
        component="img"
        src={reviewedImageUrl || submission.original_image_url}
        alt="Student drawing"
        sx={{ width: '100%', borderRadius: 1, bgcolor: 'grey.50', mb: 1.5 }}
      />

      {/* Draw over button */}
      <Button
        variant="outlined"
        startIcon={<BrushOutlinedIcon />}
        onClick={() => setSketchOpen(true)}
        fullWidth
        sx={{ mb: 2, minHeight: 48, textTransform: 'none' }}
      >
        {reviewedImageUrl ? 'Edit Sketch-Over' : 'Draw Over Image'}
      </Button>

      {/* Self note */}
      {submission.self_note && (
        <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
          <Typography variant="caption" fontWeight={600}>Student&apos;s Note</Typography>
          <Typography variant="body2">{submission.self_note}</Typography>
        </Paper>
      )}

      <Divider sx={{ my: 2 }} />

      {/* Rating */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle2" fontWeight={600} gutterBottom>Rating</Typography>
        <Rating
          value={rating}
          onChange={(_, v) => setRating(v || 0)}
          size="large"
        />
      </Box>

      {/* Feedback */}
      <TextField
        label="Written Feedback"
        placeholder="Share constructive feedback about their drawing..."
        multiline
        rows={3}
        fullWidth
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        sx={{ mb: 2 }}
      />

      {/* Resource links */}
      <ResourceLinkSearch
        resources={resources}
        onChange={setResources}
        getToken={getToken}
      />

      <Divider sx={{ my: 2 }} />

      {error && (
        <Typography color="error" variant="caption" sx={{ mb: 1, display: 'block' }}>{error}</Typography>
      )}

      <Button
        variant="contained"
        fullWidth
        onClick={handleSaveReview}
        disabled={saving || rating < 1}
        sx={{ minHeight: 48, textTransform: 'none' }}
      >
        {saving ? 'Saving Review...' : 'Save Review'}
      </Button>

      {/* Sketch overlay */}
      {sketchOpen && (
        <SketchOverCanvas
          imageUrl={submission.original_image_url}
          onSave={handleSketchSave}
          onClose={() => setSketchOpen(false)}
        />
      )}
    </Box>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/nexus/src/components/drawings/ResourceLinkSearch.tsx apps/nexus/src/components/drawings/DrawingReviewPanel.tsx
git commit -m "feat(nexus): add ResourceLinkSearch and DrawingReviewPanel for teacher review"
```

---

## Task 13: Teacher Pages — Review Queue & Review Detail

**Files:**
- Create: `apps/nexus/src/app/(teacher)/teacher/drawing-reviews/page.tsx`
- Create: `apps/nexus/src/app/(teacher)/teacher/drawing-reviews/[id]/page.tsx`

- [ ] **Step 1: Create review queue page**

```typescript
// apps/nexus/src/app/(teacher)/teacher/drawing-reviews/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box, Typography, Paper, Skeleton, Tabs, Tab, Avatar, Chip,
} from '@neram/ui';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import CategoryBadge from '@/components/drawings/CategoryBadge';
import type { DrawingSubmissionWithDetails } from '@neram/database/types';

const STATUS_TABS = [
  { value: 'submitted', label: 'Pending' },
  { value: 'reviewed', label: 'Reviewed' },
];

export default function DrawingReviewsPage() {
  const router = useRouter();
  const { getToken } = useNexusAuthContext();
  const [submissions, setSubmissions] = useState<DrawingSubmissionWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('submitted');

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/drawing/submissions/review-queue?status=${status}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setSubmissions(data.submissions || []);
    } catch {
      setSubmissions([]);
    } finally {
      setLoading(false);
    }
  }, [getToken, status]);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  return (
    <Box sx={{ px: { xs: 2, sm: 3 }, py: 2, maxWidth: 900, mx: 'auto' }}>
      <Typography variant="h6" fontWeight={700} gutterBottom>
        Drawing Reviews
      </Typography>

      <Tabs
        value={status}
        onChange={(_, v) => setStatus(v)}
        sx={{ mb: 2, minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0.5, textTransform: 'none' } }}
      >
        {STATUS_TABS.map((t) => (
          <Tab key={t.value} value={t.value} label={t.label} />
        ))}
      </Tabs>

      {loading ? (
        Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={80} sx={{ mb: 1 }} />)
      ) : submissions.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography color="text.secondary">
            {status === 'submitted' ? 'No pending reviews' : 'No reviewed submissions'}
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {submissions.map((s) => (
            <Paper
              key={s.id}
              variant="outlined"
              sx={{ p: 1.5, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
              onClick={() => router.push(`/teacher/drawing-reviews/${s.id}`)}
            >
              <Box sx={{ display: 'flex', gap: 1.5 }}>
                <Box
                  component="img"
                  src={s.original_image_url}
                  alt="Drawing"
                  sx={{ width: 70, height: 70, objectFit: 'cover', borderRadius: 1 }}
                />
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <Avatar
                      src={s.student?.avatar_url || undefined}
                      sx={{ width: 24, height: 24, fontSize: '0.7rem' }}
                    >
                      {s.student?.name?.charAt(0) || '?'}
                    </Avatar>
                    <Typography variant="body2" fontWeight={600}>{s.student?.name || 'Student'}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 0.5, mb: 0.5 }}>
                    {s.question && <CategoryBadge category={s.question.category} />}
                    {s.tutor_rating && (
                      <Chip label={`${'★'.repeat(s.tutor_rating)}`} size="small" color="success" />
                    )}
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{
                    display: '-webkit-box', WebkitLineClamp: 1,
                    WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: '0.8rem',
                  }}>
                    {s.question?.question_text || 'Free Practice'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {new Date(s.submitted_at).toLocaleDateString()}
                  </Typography>
                </Box>
              </Box>
            </Paper>
          ))}
        </Box>
      )}
    </Box>
  );
}
```

- [ ] **Step 2: Create review detail page**

```typescript
// apps/nexus/src/app/(teacher)/teacher/drawing-reviews/[id]/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Box, IconButton, Skeleton, Typography } from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import DrawingReviewPanel from '@/components/drawings/DrawingReviewPanel';
import type { DrawingSubmissionWithDetails } from '@neram/database/types';

export default function DrawingReviewDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { getToken } = useNexusAuthContext();
  const [submission, setSubmission] = useState<DrawingSubmissionWithDetails | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/drawing/submissions/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setSubmission(data.submission || null);
    } catch {
      setSubmission(null);
    } finally {
      setLoading(false);
    }
  }, [getToken, id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <Box sx={{ p: 2 }}><Skeleton height={400} /></Box>;
  if (!submission) return <Box sx={{ p: 2 }}><Typography color="text.secondary">Submission not found</Typography></Box>;

  return (
    <Box sx={{ px: { xs: 2, sm: 3 }, py: 2, maxWidth: 800, mx: 'auto' }}>
      <IconButton onClick={() => router.push('/teacher/drawing-reviews')} sx={{ mb: 1 }}>
        <ArrowBackIcon />
      </IconButton>

      <DrawingReviewPanel
        submission={submission}
        getToken={getToken}
        onReviewSaved={() => router.push('/teacher/drawing-reviews')}
      />
    </Box>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/nexus/src/app/\(teacher\)/teacher/drawing-reviews/
git commit -m "feat(nexus): add teacher drawing review queue and detail pages"
```

---

## Task 14: Teacher Navigation — Add Drawing Reviews

**Files:**
- Modify: `apps/nexus/src/components/PanelProvider.tsx`

- [ ] **Step 1: Add BrushOutlinedIcon import**

Add after the existing icon imports (around line 24):
```typescript
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
```

- [ ] **Step 2: Replace "Evaluate" with "Drawing Reviews" in teaching panel sidebarItems**

In the `sidebarItems` array of the `teaching` panel (line 64), replace:
```typescript
      { label: 'Evaluate', path: '/teacher/evaluate', icon: <RateReviewOutlinedIcon /> },
```
with:
```typescript
      { label: 'Drawing Reviews', path: '/teacher/drawing-reviews', icon: <BrushOutlinedIcon /> },
```

- [ ] **Step 3: Replace "Evaluate" in bottomNavItems**

In the `bottomNavItems` array of the `teaching` panel (line 73), replace:
```typescript
      { label: 'Evaluate', path: '/teacher/evaluate', icon: <RateReviewOutlinedIcon /> },
```
with:
```typescript
      { label: 'Drawings', path: '/teacher/drawing-reviews', icon: <BrushOutlinedIcon /> },
```

- [ ] **Step 4: Add path-to-panel mapping**

In the `detectPanelFromPath` function (after line 163), add:
```typescript
  if (pathname.startsWith('/teacher/drawing-reviews')) return 'teaching';
```

- [ ] **Step 5: Commit**

```bash
git add apps/nexus/src/components/PanelProvider.tsx
git commit -m "feat(nexus): add Drawing Reviews to teacher teaching panel navigation"
```

---

## Task 15: Seed NATA Questions & Verify

- [ ] **Step 1: Start dev server and seed data**

```bash
pnpm dev:nexus
```

Then in another terminal, seed the questions using the API:
```bash
# Read the JSON file and POST to seed endpoint
# The teacher must be logged in - use the test teacher account
curl -X POST http://localhost:3012/api/drawing/questions/seed \
  -H "Authorization: Bearer <teacher-token>" \
  -H "Content-Type: application/json" \
  -d @packages/database/src/data/nata_2025_drawing_questions.json
```

Alternatively, create a quick seed script or use the Nexus UI with browser devtools to call the API.

Expected response: `{ "seeded": 96 }`

- [ ] **Step 2: Verify data in Supabase**

```sql
SELECT category, count(*) FROM drawing_questions GROUP BY category;
```

Expected:
```
2d_composition  | 33
3d_composition  | 32
kit_sculpture   | 31
```

- [ ] **Step 3: Verify student browse page**

Navigate to `http://localhost:3012/student/drawings` as a student. Verify:
- Card grid displays with 2 columns on mobile viewport (375px)
- Category tabs filter correctly
- Difficulty chips filter correctly
- Clicking a card navigates to question detail

- [ ] **Step 4: Verify teacher review flow**

Navigate to `http://localhost:3012/teacher/drawing-reviews` as a teacher. Verify:
- Review queue shows pending submissions
- Clicking a submission opens the review panel
- Sketch-over canvas opens and drawing works
- Rating + feedback + resource links save correctly

- [ ] **Step 5: Apply migration to production (when ready)**

```
mcp__supabase-prod__apply_migration with name="drawing_module_v2" and the SQL from Task 1
```
