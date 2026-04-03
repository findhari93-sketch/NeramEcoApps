# Course Plan Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a generic course plan system in Nexus where teachers create structured course plans, push sessions to timetable with Teams meetings, and students view plans, submit homework, practice drill questions, and access study resources.

**Architecture:** Course plan is an orchestration layer on top of existing Nexus tables (classrooms, topics, scheduled_classes, tests). 9 new database tables, ~18 API endpoints, 4 teacher pages, 4 student pages. The NATA 2026 Crash Course is seeded as the first plan.

**Tech Stack:** Next.js 14 App Router, Supabase (PostgreSQL + Storage), Microsoft Graph API (Teams), MUI v5, TypeScript

**Spec:** `docs/superpowers/specs/2026-04-03-course-plan-module-design.md`

---

## File Structure

### Database
- Create: `supabase/migrations/20260503_nexus_course_plans.sql` — all 9 tables + RLS policies
- Create: `packages/database/src/queries/nexus/course-plans.ts` — plan CRUD queries
- Create: `packages/database/src/queries/nexus/course-plan-homework.ts` — homework + submissions queries
- Create: `packages/database/src/queries/nexus/course-plan-drill.ts` — drill + progress queries

### API Routes (apps/nexus/src/app/api/)
- Create: `course-plans/route.ts` — GET list, POST create
- Create: `course-plans/[id]/route.ts` — GET detail, PUT update
- Create: `course-plans/[id]/sessions/route.ts` — GET list, POST create/update sessions
- Create: `course-plans/[id]/sessions/push/route.ts` — POST push single session to timetable
- Create: `course-plans/[id]/sessions/push-week/route.ts` — POST bulk push week
- Create: `course-plans/[id]/homework/route.ts` — GET list, POST create homework
- Create: `course-plans/[id]/homework/grid/route.ts` — GET grading grid
- Create: `course-plans/homework/[hwId]/submit/route.ts` — POST student submission
- Create: `course-plans/homework/[hwId]/review/route.ts` — POST teacher review
- Create: `course-plans/[id]/drill/route.ts` — GET/POST drill questions
- Create: `course-plans/[id]/drill/progress/route.ts` — GET/POST drill progress
- Create: `course-plans/[id]/tests/route.ts` — GET/POST tests
- Create: `course-plans/[id]/resources/route.ts` — GET/POST resources

### Teacher Pages (apps/nexus/src/app/(teacher)/)
- Create: `course-plans/page.tsx` — plan list
- Create: `course-plans/[planId]/page.tsx` — plan dashboard with tabs
- Create: `course-plans/[planId]/weeks/[weekId]/page.tsx` — week detail + push to timetable
- Create: `course-plans/[planId]/homework/page.tsx` — grading grid

### Student Pages (apps/nexus/src/app/(student)/)
- Create: `course-plan/page.tsx` — today's plan + weekly overview
- Create: `course-plan/homework/page.tsx` — homework list + submission
- Create: `course-plan/drill/page.tsx` — flashcard drill widget
- Create: `course-plan/tests/page.tsx` — test list + scores

### Components (apps/nexus/src/components/course-plan/)
- Create: `CoursePlanCard.tsx` — plan card for list view
- Create: `CreatePlanDialog.tsx` — create plan dialog
- Create: `WeekCard.tsx` — week summary card
- Create: `SessionCard.tsx` — session card with status indicator
- Create: `SessionEditDialog.tsx` — edit session (topic, teacher, description)
- Create: `PushToTimetableDialog.tsx` — confirm push with date/time
- Create: `PushWeekDialog.tsx` — bulk push week confirmation
- Create: `HomeworkCard.tsx` — homework item card (teacher view)
- Create: `HomeworkGradingGrid.tsx` — students × assignments matrix
- Create: `SubmissionReviewPanel.tsx` — slide-out for reviewing a submission
- Create: `HomeworkCreateDialog.tsx` — create/edit homework dialog
- Create: `StudentHomeworkCard.tsx` — homework card with submission UI
- Create: `HomeworkSubmitSheet.tsx` — bottom sheet for file upload + text
- Create: `TodaysPlanCard.tsx` — student today's plan hero widget
- Create: `WeeklyOverview.tsx` — week tabs + day list
- Create: `DrillFlashcard.tsx` — single flashcard component
- Create: `DrillWidget.tsx` — flashcard carousel with progress
- Create: `DrillManagerTable.tsx` — teacher drill question management
- Create: `TestCard.tsx` — test card for student view
- Create: `ResourceList.tsx` — resource links grouped by topic/session

### Navigation
- Modify: `apps/nexus/src/components/PanelProvider.tsx` — add Course Plans to teaching + management panels
- Modify: `apps/nexus/src/app/(student)/layout.tsx` — add Course Plan to Learn group + bottom nav

---

## Task 1: Database Migration — All 9 Tables + RLS

**Files:**
- Create: `supabase/migrations/20260503_nexus_course_plans.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- ============================================================
-- Course Plan Module — 9 tables + RLS
-- ============================================================

-- 1. Course Plans (master entity)
CREATE TABLE IF NOT EXISTS nexus_course_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID NOT NULL REFERENCES nexus_classrooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  duration_weeks INTEGER NOT NULL DEFAULT 1,
  days_per_week TEXT[] NOT NULL DEFAULT ARRAY['tue','wed','thu','fri','sat','sun'],
  sessions_per_day JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed')),
  teaching_team JSONB DEFAULT '[]'::jsonb,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_course_plans_classroom ON nexus_course_plans(classroom_id);
CREATE INDEX idx_course_plans_status ON nexus_course_plans(status);

-- 2. Course Plan Weeks
CREATE TABLE IF NOT EXISTS nexus_course_plan_weeks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES nexus_course_plans(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL,
  title TEXT,
  goal TEXT,
  start_date DATE,
  end_date DATE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(plan_id, week_number)
);

CREATE INDEX idx_plan_weeks_plan ON nexus_course_plan_weeks(plan_id);

-- 3. Course Plan Sessions
CREATE TABLE IF NOT EXISTS nexus_course_plan_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id UUID NOT NULL REFERENCES nexus_course_plan_weeks(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES nexus_course_plans(id) ON DELETE CASCADE,
  day_number INTEGER NOT NULL,
  day_of_week TEXT NOT NULL CHECK (day_of_week IN ('mon','tue','wed','thu','fri','sat','sun')),
  slot TEXT NOT NULL CHECK (slot IN ('am', 'pm')),
  topic_id UUID REFERENCES nexus_topics(id) ON DELETE SET NULL,
  teacher_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  scheduled_class_id UUID REFERENCES nexus_scheduled_classes(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'scheduled', 'completed', 'skipped')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_plan_sessions_week ON nexus_course_plan_sessions(week_id);
CREATE INDEX idx_plan_sessions_plan ON nexus_course_plan_sessions(plan_id);
CREATE INDEX idx_plan_sessions_scheduled ON nexus_course_plan_sessions(scheduled_class_id);

-- 4. Course Plan Homework
CREATE TABLE IF NOT EXISTS nexus_course_plan_homework (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES nexus_course_plan_sessions(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES nexus_course_plans(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'mixed' CHECK (type IN ('drawing', 'mcq', 'study', 'review', 'mixed')),
  max_points INTEGER,
  due_date DATE,
  estimated_minutes INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_plan_homework_session ON nexus_course_plan_homework(session_id);
CREATE INDEX idx_plan_homework_plan ON nexus_course_plan_homework(plan_id);

-- 5. Homework Submissions
CREATE TABLE IF NOT EXISTS nexus_homework_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  homework_id UUID NOT NULL REFERENCES nexus_course_plan_homework(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'reviewed', 'returned')),
  attachments JSONB DEFAULT '[]'::jsonb,
  text_response TEXT,
  points_earned INTEGER,
  teacher_feedback TEXT,
  reviewed_by UUID REFERENCES users(id),
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(homework_id, student_id)
);

CREATE INDEX idx_hw_submissions_homework ON nexus_homework_submissions(homework_id);
CREATE INDEX idx_hw_submissions_student ON nexus_homework_submissions(student_id);

-- 6. Course Plan Tests
CREATE TABLE IF NOT EXISTS nexus_course_plan_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES nexus_course_plans(id) ON DELETE CASCADE,
  week_id UUID NOT NULL REFERENCES nexus_course_plan_weeks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  question_count INTEGER,
  duration_minutes INTEGER,
  scope TEXT,
  test_id UUID REFERENCES nexus_tests(id) ON DELETE SET NULL,
  scheduled_date DATE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_plan_tests_plan ON nexus_course_plan_tests(plan_id);

-- 7. Course Plan Resources
CREATE TABLE IF NOT EXISTS nexus_course_plan_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES nexus_course_plans(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES nexus_topics(id) ON DELETE SET NULL,
  session_id UUID REFERENCES nexus_course_plan_sessions(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'reference' CHECK (type IN ('video', 'practice', 'reference', 'tool')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  CHECK (topic_id IS NOT NULL OR session_id IS NOT NULL)
);

CREATE INDEX idx_plan_resources_plan ON nexus_course_plan_resources(plan_id);
CREATE INDEX idx_plan_resources_topic ON nexus_course_plan_resources(topic_id);

-- 8. Course Plan Drill Questions
CREATE TABLE IF NOT EXISTS nexus_course_plan_drill (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES nexus_course_plans(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  answer_text TEXT NOT NULL,
  explanation TEXT,
  frequency_note TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_plan_drill_plan ON nexus_course_plan_drill(plan_id);

-- 9. Drill Progress (student tracking)
CREATE TABLE IF NOT EXISTS nexus_drill_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drill_id UUID NOT NULL REFERENCES nexus_course_plan_drill(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mastered BOOLEAN NOT NULL DEFAULT false,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempted_at TIMESTAMPTZ,
  UNIQUE(drill_id, student_id)
);

CREATE INDEX idx_drill_progress_student ON nexus_drill_progress(student_id);

-- ============================================================
-- RLS Policies
-- ============================================================

ALTER TABLE nexus_course_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_course_plan_weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_course_plan_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_course_plan_homework ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_homework_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_course_plan_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_course_plan_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_course_plan_drill ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_drill_progress ENABLE ROW LEVEL SECURITY;

-- Service role bypass (all tables)
CREATE POLICY "service_role_all" ON nexus_course_plans FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON nexus_course_plan_weeks FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON nexus_course_plan_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON nexus_course_plan_homework FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON nexus_homework_submissions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON nexus_course_plan_tests FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON nexus_course_plan_resources FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON nexus_course_plan_drill FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON nexus_drill_progress FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Homework submissions storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'homework-submissions',
  'homework-submissions',
  true,
  10485760, -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
) ON CONFLICT (id) DO NOTHING;

-- Storage policy: students upload to their own folder
CREATE POLICY "students_upload_homework" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'homework-submissions');

CREATE POLICY "anyone_read_homework" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'homework-submissions');
```

- [ ] **Step 2: Apply migration to staging**

Run: Use `mcp__supabase-staging__apply_migration` with name `nexus_course_plans` and the SQL above.

Expected: Migration applied successfully.

- [ ] **Step 3: Apply migration to production**

Run: Use `mcp__supabase-prod__apply_migration` with the same SQL.

Expected: Migration applied successfully.

- [ ] **Step 4: Verify tables exist on staging**

Run: Use `mcp__supabase-staging__execute_sql` with:
```sql
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'nexus_course_plan%'
UNION
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('nexus_homework_submissions', 'nexus_drill_progress')
ORDER BY tablename;
```

Expected: 9 tables listed.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260503_nexus_course_plans.sql
git commit -m "feat(db): add course plan module tables and RLS policies

9 tables: course_plans, plan_weeks, plan_sessions, plan_homework,
homework_submissions, plan_tests, plan_resources, plan_drill,
drill_progress. Includes storage bucket for homework uploads."
```

---

## Task 2: Database Queries — Plan CRUD

**Files:**
- Create: `packages/database/src/queries/nexus/course-plans.ts`

- [ ] **Step 1: Write course plan query functions**

```typescript
import { getSupabaseAdminClient } from '../../client';

type TypedSupabaseClient = ReturnType<typeof getSupabaseAdminClient>;

// ── Plan CRUD ──

export async function getCoursePlansByClassroom(
  classroomId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_course_plans')
    .select(`
      *,
      weeks:nexus_course_plan_weeks(count),
      sessions:nexus_course_plan_sessions(count)
    `)
    .eq('classroom_id', classroomId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getCoursePlanById(
  planId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_course_plans')
    .select(`
      *,
      weeks:nexus_course_plan_weeks(
        *,
        sessions:nexus_course_plan_sessions(
          *,
          topic:nexus_topics(id, title, category),
          teacher:users!nexus_course_plan_sessions_teacher_id_fkey(id, full_name, avatar_url),
          homework:nexus_course_plan_homework(count)
        )
      ),
      tests:nexus_course_plan_tests(*),
      drill:nexus_course_plan_drill(count)
    `)
    .eq('id', planId)
    .single();
  if (error) throw error;
  return data;
}

export async function createCoursePlan(
  data: {
    classroom_id: string;
    name: string;
    description?: string;
    duration_weeks: number;
    days_per_week: string[];
    sessions_per_day: Array<{ slot: string; start: string; end: string }>;
    teaching_team?: Array<{ user_id: string; name: string; subjects: string[]; slot: string }>;
    created_by: string;
  },
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();

  // 1. Create the plan
  const { data: plan, error: planError } = await supabase
    .from('nexus_course_plans')
    .insert({
      classroom_id: data.classroom_id,
      name: data.name,
      description: data.description || null,
      duration_weeks: data.duration_weeks,
      days_per_week: data.days_per_week,
      sessions_per_day: data.sessions_per_day,
      teaching_team: data.teaching_team || [],
      created_by: data.created_by,
      status: 'draft',
    })
    .select()
    .single();
  if (planError) throw planError;

  // 2. Auto-generate week shells
  const weeks = [];
  for (let w = 1; w <= data.duration_weeks; w++) {
    weeks.push({
      plan_id: plan.id,
      week_number: w,
      title: `Week ${w}`,
      sort_order: w,
    });
  }
  const { data: createdWeeks, error: weeksError } = await supabase
    .from('nexus_course_plan_weeks')
    .insert(weeks)
    .select();
  if (weeksError) throw weeksError;

  // 3. Auto-generate session shells per week
  const sessions = [];
  let dayCounter = 0;
  for (const week of createdWeeks) {
    for (const dayOfWeek of data.days_per_week) {
      dayCounter++;
      for (const slotDef of data.sessions_per_day) {
        sessions.push({
          week_id: week.id,
          plan_id: plan.id,
          day_number: dayCounter,
          day_of_week: dayOfWeek,
          slot: slotDef.slot,
          title: `Day ${dayCounter} - ${slotDef.slot.toUpperCase()} Session`,
          status: 'planned',
        });
      }
    }
  }
  if (sessions.length > 0) {
    const { error: sessError } = await supabase
      .from('nexus_course_plan_sessions')
      .insert(sessions);
    if (sessError) throw sessError;
  }

  return plan;
}

export async function updateCoursePlan(
  planId: string,
  updates: Partial<{
    name: string;
    description: string;
    status: string;
    teaching_team: unknown[];
  }>,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_course_plans')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', planId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Sessions ──

export async function getSessionsByPlan(
  planId: string,
  weekId?: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  let query = supabase
    .from('nexus_course_plan_sessions')
    .select(`
      *,
      topic:nexus_topics(id, title, category),
      teacher:users!nexus_course_plan_sessions_teacher_id_fkey(id, full_name, avatar_url),
      homework:nexus_course_plan_homework(*),
      scheduled_class:nexus_scheduled_classes(id, teams_meeting_url, status)
    `)
    .eq('plan_id', planId)
    .order('day_number', { ascending: true })
    .order('slot', { ascending: true });

  if (weekId) {
    query = query.eq('week_id', weekId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function updateSession(
  sessionId: string,
  updates: Partial<{
    topic_id: string | null;
    teacher_id: string | null;
    title: string;
    description: string;
    notes: string;
    status: string;
    scheduled_class_id: string | null;
  }>,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_course_plan_sessions')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', sessionId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Week date assignment ──

export async function updateWeekDates(
  weekId: string,
  startDate: string,
  endDate: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_course_plan_weeks')
    .update({ start_date: startDate, end_date: endDate })
    .eq('id', weekId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Tests ──

export async function getTestsByPlan(planId: string, client?: TypedSupabaseClient) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_course_plan_tests')
    .select('*, week:nexus_course_plan_weeks(week_number, title)')
    .eq('plan_id', planId)
    .order('sort_order');
  if (error) throw error;
  return data;
}

export async function createPlanTest(
  data: {
    plan_id: string;
    week_id: string;
    title: string;
    description?: string;
    question_count?: number;
    duration_minutes?: number;
    scope?: string;
    scheduled_date?: string;
    sort_order?: number;
  },
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data: test, error } = await supabase
    .from('nexus_course_plan_tests')
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return test;
}

// ── Resources ──

export async function getResourcesByPlan(
  planId: string,
  filters?: { topic_id?: string; session_id?: string },
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  let query = supabase
    .from('nexus_course_plan_resources')
    .select('*')
    .eq('plan_id', planId)
    .order('sort_order');

  if (filters?.topic_id) query = query.eq('topic_id', filters.topic_id);
  if (filters?.session_id) query = query.eq('session_id', filters.session_id);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function createResource(
  data: {
    plan_id: string;
    topic_id?: string;
    session_id?: string;
    title: string;
    url: string;
    type: string;
    sort_order?: number;
  },
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data: resource, error } = await supabase
    .from('nexus_course_plan_resources')
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return resource;
}
```

- [ ] **Step 2: Export from queries index**

Check if `packages/database/src/queries/nexus/index.ts` exists. If so, add:
```typescript
export * from './course-plans';
export * from './course-plan-homework';
export * from './course-plan-drill';
```

If there's no index file, check how other nexus queries are exported (likely from `packages/database/src/index.ts` or similar) and follow the same pattern.

- [ ] **Step 3: Commit**

```bash
git add packages/database/src/queries/nexus/course-plans.ts
git commit -m "feat(db): add course plan CRUD query functions

Plan, session, week, test, and resource queries for the course plan module."
```

---

## Task 3: Database Queries — Homework & Drill

**Files:**
- Create: `packages/database/src/queries/nexus/course-plan-homework.ts`
- Create: `packages/database/src/queries/nexus/course-plan-drill.ts`

- [ ] **Step 1: Write homework query functions**

```typescript
// packages/database/src/queries/nexus/course-plan-homework.ts
import { getSupabaseAdminClient } from '../../client';

type TypedSupabaseClient = ReturnType<typeof getSupabaseAdminClient>;

export async function getHomeworkByPlan(
  planId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_course_plan_homework')
    .select(`
      *,
      session:nexus_course_plan_sessions(id, title, day_number, slot, day_of_week)
    `)
    .eq('plan_id', planId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createHomework(
  data: {
    session_id: string;
    plan_id: string;
    title: string;
    description?: string;
    type?: string;
    max_points?: number;
    due_date?: string;
    estimated_minutes?: number;
    sort_order?: number;
  },
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data: hw, error } = await supabase
    .from('nexus_course_plan_homework')
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return hw;
}

export async function getHomeworkGradingGrid(
  planId: string,
  classroomId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();

  // Get all homework for this plan
  const { data: homework, error: hwError } = await supabase
    .from('nexus_course_plan_homework')
    .select('id, title, max_points, due_date, session:nexus_course_plan_sessions(day_number)')
    .eq('plan_id', planId)
    .order('created_at', { ascending: true });
  if (hwError) throw hwError;

  // Get all students enrolled in this classroom
  const { data: enrollments, error: enError } = await supabase
    .from('nexus_enrollments')
    .select('user_id, users:users!nexus_enrollments_user_id_fkey(id, full_name, avatar_url)')
    .eq('classroom_id', classroomId)
    .eq('role', 'student')
    .eq('is_active', true);
  if (enError) throw enError;

  // Get all submissions for this plan's homework
  const hwIds = (homework || []).map((h: { id: string }) => h.id);
  let submissions: Array<Record<string, unknown>> = [];
  if (hwIds.length > 0) {
    const { data: subs, error: subError } = await supabase
      .from('nexus_homework_submissions')
      .select('*')
      .in('homework_id', hwIds);
    if (subError) throw subError;
    submissions = subs || [];
  }

  return { homework, students: enrollments, submissions };
}

export async function submitHomework(
  homeworkId: string,
  studentId: string,
  data: {
    attachments?: Array<{ url: string; type: string; name: string; size: number }>;
    text_response?: string;
  },
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data: submission, error } = await supabase
    .from('nexus_homework_submissions')
    .upsert(
      {
        homework_id: homeworkId,
        student_id: studentId,
        status: 'submitted',
        attachments: data.attachments || [],
        text_response: data.text_response || null,
        submitted_at: new Date().toISOString(),
      },
      { onConflict: 'homework_id,student_id' }
    )
    .select()
    .single();
  if (error) throw error;
  return submission;
}

export async function reviewHomework(
  submissionId: string,
  reviewerId: string,
  data: {
    points_earned?: number;
    teacher_feedback?: string;
    status: 'reviewed' | 'returned';
  },
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data: submission, error } = await supabase
    .from('nexus_homework_submissions')
    .update({
      ...data,
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', submissionId)
    .select()
    .single();
  if (error) throw error;
  return submission;
}

export async function getStudentHomework(
  planId: string,
  studentId: string,
  statusFilter?: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  let query = supabase
    .from('nexus_course_plan_homework')
    .select(`
      *,
      session:nexus_course_plan_sessions(id, title, day_number, slot),
      submission:nexus_homework_submissions!inner(*)
    `)
    .eq('plan_id', planId)
    .eq('nexus_homework_submissions.student_id', studentId);

  if (statusFilter && statusFilter !== 'all') {
    query = query.eq('nexus_homework_submissions.status', statusFilter);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  // If inner join returns nothing for pending, do a left join approach
  if (error || !data) {
    // Fallback: get all homework + check submissions separately
    const { data: allHw, error: hwErr } = await supabase
      .from('nexus_course_plan_homework')
      .select('*, session:nexus_course_plan_sessions(id, title, day_number, slot)')
      .eq('plan_id', planId)
      .order('created_at', { ascending: false });
    if (hwErr) throw hwErr;

    const { data: subs } = await supabase
      .from('nexus_homework_submissions')
      .select('*')
      .eq('student_id', studentId)
      .in('homework_id', (allHw || []).map((h: { id: string }) => h.id));

    const subMap = new Map((subs || []).map((s: { homework_id: string }) => [s.homework_id, s]));
    return (allHw || []).map((hw: { id: string }) => ({
      ...hw,
      submission: subMap.get(hw.id) || null,
    }));
  }

  return data;
}
```

- [ ] **Step 2: Write drill query functions**

```typescript
// packages/database/src/queries/nexus/course-plan-drill.ts
import { getSupabaseAdminClient } from '../../client';

type TypedSupabaseClient = ReturnType<typeof getSupabaseAdminClient>;

export async function getDrillQuestions(
  planId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_course_plan_drill')
    .select('*')
    .eq('plan_id', planId)
    .eq('is_active', true)
    .order('sort_order');
  if (error) throw error;
  return data;
}

export async function getAllDrillQuestions(
  planId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_course_plan_drill')
    .select('*')
    .eq('plan_id', planId)
    .order('sort_order');
  if (error) throw error;
  return data;
}

export async function createDrillQuestion(
  data: {
    plan_id: string;
    question_text: string;
    answer_text: string;
    explanation?: string;
    frequency_note?: string;
    sort_order?: number;
  },
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data: drill, error } = await supabase
    .from('nexus_course_plan_drill')
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return drill;
}

export async function updateDrillQuestion(
  drillId: string,
  updates: Partial<{
    question_text: string;
    answer_text: string;
    explanation: string;
    frequency_note: string;
    sort_order: number;
    is_active: boolean;
  }>,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_course_plan_drill')
    .update(updates)
    .eq('id', drillId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getDrillProgress(
  planId: string,
  studentId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_drill_progress')
    .select('*, drill:nexus_course_plan_drill(*)')
    .eq('drill.plan_id', planId)
    .eq('student_id', studentId);
  if (error) throw error;
  return data;
}

export async function updateDrillProgress(
  drillId: string,
  studentId: string,
  mastered: boolean,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_drill_progress')
    .upsert(
      {
        drill_id: drillId,
        student_id: studentId,
        mastered,
        attempts: 1, // Will increment via RPC if needed
        last_attempted_at: new Date().toISOString(),
      },
      { onConflict: 'drill_id,student_id' }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getDrillMasteryStats(
  planId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  // Get all drill questions with their progress counts
  const { data: drills, error: dErr } = await supabase
    .from('nexus_course_plan_drill')
    .select('id, question_text, sort_order')
    .eq('plan_id', planId)
    .eq('is_active', true)
    .order('sort_order');
  if (dErr) throw dErr;

  const drillIds = (drills || []).map((d: { id: string }) => d.id);
  if (drillIds.length === 0) return [];

  const { data: progress, error: pErr } = await supabase
    .from('nexus_drill_progress')
    .select('drill_id, mastered')
    .in('drill_id', drillIds);
  if (pErr) throw pErr;

  // Aggregate per drill
  const statsMap = new Map<string, { total: number; mastered: number }>();
  for (const p of (progress || [])) {
    const rec = p as { drill_id: string; mastered: boolean };
    const existing = statsMap.get(rec.drill_id) || { total: 0, mastered: 0 };
    existing.total++;
    if (rec.mastered) existing.mastered++;
    statsMap.set(rec.drill_id, existing);
  }

  return (drills || []).map((d: { id: string; question_text: string; sort_order: number }) => ({
    ...d,
    stats: statsMap.get(d.id) || { total: 0, mastered: 0 },
  }));
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/database/src/queries/nexus/course-plan-homework.ts packages/database/src/queries/nexus/course-plan-drill.ts
git commit -m "feat(db): add homework submission and drill progress queries

Homework: create, submit, review, grading grid, student homework list.
Drill: CRUD questions, progress tracking, mastery stats."
```

---

## Task 4: API Routes — Plan CRUD + Sessions

**Files:**
- Create: `apps/nexus/src/app/api/course-plans/route.ts`
- Create: `apps/nexus/src/app/api/course-plans/[id]/route.ts`
- Create: `apps/nexus/src/app/api/course-plans/[id]/sessions/route.ts`

- [ ] **Step 1: Write plan list + create API**

```typescript
// apps/nexus/src/app/api/course-plans/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import {
  getCoursePlansByClassroom,
  createCoursePlan,
} from '@neram/database/src/queries/nexus/course-plans';

export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const classroomId = request.nextUrl.searchParams.get('classroom_id');
    if (!classroomId) return NextResponse.json({ error: 'classroom_id required' }, { status: 400 });

    // Verify enrollment
    const { data: enrollment } = await supabase
      .from('nexus_enrollments')
      .select('role')
      .eq('user_id', user.id)
      .eq('classroom_id', classroomId)
      .eq('is_active', true)
      .single();
    if (!enrollment) return NextResponse.json({ error: 'Not enrolled' }, { status: 403 });

    const plans = await getCoursePlansByClassroom(classroomId, supabase);

    // Students only see active plans
    const filtered = enrollment.role === 'student'
      ? plans?.filter((p: { status: string }) => p.status === 'active')
      : plans;

    return NextResponse.json(filtered);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await request.json();
    const { classroom_id, name, description, duration_weeks, days_per_week, sessions_per_day, teaching_team } = body;

    if (!classroom_id || !name || !duration_weeks) {
      return NextResponse.json({ error: 'classroom_id, name, and duration_weeks required' }, { status: 400 });
    }

    // Verify teacher role
    const { data: enrollment } = await supabase
      .from('nexus_enrollments')
      .select('role')
      .eq('user_id', user.id)
      .eq('classroom_id', classroom_id)
      .eq('is_active', true)
      .single();
    if (!enrollment || enrollment.role === 'student') {
      return NextResponse.json({ error: 'Only teachers can create plans' }, { status: 403 });
    }

    const plan = await createCoursePlan({
      classroom_id,
      name,
      description,
      duration_weeks,
      days_per_week: days_per_week || ['tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      sessions_per_day: sessions_per_day || [
        { slot: 'am', start: '11:00', end: '12:00' },
        { slot: 'pm', start: '19:00', end: '20:00' },
      ],
      teaching_team,
      created_by: user.id,
    }, supabase);

    return NextResponse.json(plan, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Write plan detail + update API**

```typescript
// apps/nexus/src/app/api/course-plans/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getCoursePlanById, updateCoursePlan } from '@neram/database/src/queries/nexus/course-plans';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const plan = await getCoursePlanById(id, supabase);
    if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 });

    // Verify enrollment in the plan's classroom
    const { data: enrollment } = await supabase
      .from('nexus_enrollments')
      .select('role')
      .eq('user_id', user.id)
      .eq('classroom_id', plan.classroom_id)
      .eq('is_active', true)
      .single();
    if (!enrollment) return NextResponse.json({ error: 'Not enrolled' }, { status: 403 });

    return NextResponse.json(plan);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Verify plan exists and user is teacher
    const plan = await getCoursePlanById(id, supabase);
    if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 });

    const { data: enrollment } = await supabase
      .from('nexus_enrollments')
      .select('role')
      .eq('user_id', user.id)
      .eq('classroom_id', plan.classroom_id)
      .eq('is_active', true)
      .single();
    if (!enrollment || enrollment.role === 'student') {
      return NextResponse.json({ error: 'Only teachers can update plans' }, { status: 403 });
    }

    const body = await request.json();
    const updated = await updateCoursePlan(id, body, supabase);
    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Write sessions list + update API**

```typescript
// apps/nexus/src/app/api/course-plans/[id]/sessions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getSessionsByPlan, updateSession } from '@neram/database/src/queries/nexus/course-plans';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const weekId = request.nextUrl.searchParams.get('week_id') || undefined;
    const sessions = await getSessionsByPlan(id, weekId, supabase);
    return NextResponse.json(sessions);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await params; // consume params
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await request.json();
    const { session_id, ...updates } = body;

    if (!session_id) {
      return NextResponse.json({ error: 'session_id required' }, { status: 400 });
    }

    const updated = await updateSession(session_id, updates, supabase);
    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/nexus/src/app/api/course-plans/
git commit -m "feat(nexus): add course plan CRUD and sessions API routes

GET/POST /api/course-plans — list and create plans
GET/PUT /api/course-plans/[id] — plan detail and update
GET/POST /api/course-plans/[id]/sessions — list and update sessions"
```

---

## Task 5: API Routes — Push to Timetable

**Files:**
- Create: `apps/nexus/src/app/api/course-plans/[id]/sessions/push/route.ts`
- Create: `apps/nexus/src/app/api/course-plans/[id]/sessions/push-week/route.ts`

- [ ] **Step 1: Write single session push API**

This is the key integration point. It creates a `nexus_scheduled_class`, optionally creates a Teams meeting, and updates the session's `scheduled_class_id` and status.

```typescript
// apps/nexus/src/app/api/course-plans/[id]/sessions/push/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken, extractBearerToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { createScheduledClass } from '@neram/database/src/queries/nexus/timetable';
import { updateSession } from '@neram/database/src/queries/nexus/course-plans';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: planId } = await params;
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const token = extractBearerToken(request.headers.get('Authorization'))!;
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await request.json();
    const { session_id, scheduled_date, start_time, end_time, create_teams_meeting } = body;

    if (!session_id || !scheduled_date) {
      return NextResponse.json({ error: 'session_id and scheduled_date required' }, { status: 400 });
    }

    // Get the session details
    const { data: session } = await supabase
      .from('nexus_course_plan_sessions')
      .select('*, plan:nexus_course_plans(classroom_id, sessions_per_day)')
      .eq('id', session_id)
      .single();
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    if (session.scheduled_class_id) {
      return NextResponse.json({ error: 'Session already pushed to timetable' }, { status: 400 });
    }

    // Determine time from slot if not explicitly provided
    const plan = session.plan as { classroom_id: string; sessions_per_day: Array<{ slot: string; start: string; end: string }> };
    const slotDef = plan.sessions_per_day?.find(
      (s: { slot: string }) => s.slot === session.slot
    );
    const finalStartTime = start_time || slotDef?.start || '11:00';
    const finalEndTime = end_time || slotDef?.end || '12:00';

    // Create scheduled class
    const scheduledClass = await createScheduledClass({
      classroom_id: plan.classroom_id,
      title: session.title,
      description: session.description || null,
      scheduled_date,
      start_time: finalStartTime,
      end_time: finalEndTime,
      teacher_id: session.teacher_id || user.id,
      topic_id: session.topic_id || null,
      status: 'scheduled',
      target_scope: 'classroom',
    }, supabase);

    // Update session with scheduled_class_id
    await updateSession(session_id, {
      scheduled_class_id: scheduledClass.id,
      status: 'scheduled',
    }, supabase);

    // Optionally create Teams meeting
    let teamsData = null;
    if (create_teams_meeting !== false) {
      // Get classroom's Teams ID
      const { data: classroom } = await supabase
        .from('nexus_classrooms')
        .select('ms_team_id')
        .eq('id', plan.classroom_id)
        .single();

      if (classroom?.ms_team_id) {
        try {
          // Create online meeting via Graph API
          const meetingRes = await fetch('https://graph.microsoft.com/v1.0/me/onlineMeetings', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              subject: session.title,
              startDateTime: `${scheduled_date}T${finalStartTime}:00`,
              endDateTime: `${scheduled_date}T${finalEndTime}:00`,
              lobbyBypassSettings: { scope: 'organization' },
            }),
          });

          if (meetingRes.ok) {
            const meeting = await meetingRes.json();
            teamsData = { joinUrl: meeting.joinWebUrl, meetingId: meeting.id };

            // Update scheduled class with Teams info
            await supabase
              .from('nexus_scheduled_classes')
              .update({
                teams_meeting_url: meeting.joinWebUrl,
                teams_meeting_id: meeting.id,
              })
              .eq('id', scheduledClass.id);
          }
        } catch {
          // Teams meeting creation is best-effort — don't fail the push
          console.error('Teams meeting creation failed');
        }
      }
    }

    return NextResponse.json({
      scheduled_class: scheduledClass,
      teams: teamsData,
      session_id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Write bulk week push API**

```typescript
// apps/nexus/src/app/api/course-plans/[id]/sessions/push-week/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken, extractBearerToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { createScheduledClass } from '@neram/database/src/queries/nexus/timetable';
import { updateSession, updateWeekDates } from '@neram/database/src/queries/nexus/course-plans';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: planId } = await params;
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const token = extractBearerToken(request.headers.get('Authorization'))!;
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await request.json();
    const { week_id, start_date, create_teams_meetings } = body;

    if (!week_id || !start_date) {
      return NextResponse.json({ error: 'week_id and start_date required' }, { status: 400 });
    }

    // Get plan details
    const { data: plan } = await supabase
      .from('nexus_course_plans')
      .select('classroom_id, days_per_week, sessions_per_day')
      .eq('id', planId)
      .single();
    if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 });

    // Get all unpushed sessions for this week
    const { data: sessions } = await supabase
      .from('nexus_course_plan_sessions')
      .select('*')
      .eq('week_id', week_id)
      .eq('status', 'planned')
      .order('day_number')
      .order('slot');

    if (!sessions || sessions.length === 0) {
      return NextResponse.json({ error: 'No unpushed sessions in this week' }, { status: 400 });
    }

    // Map day_of_week to offset from start_date
    const dayMap: Record<string, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };
    const startDow = new Date(start_date).getDay(); // 0=Sun
    const startDowStr = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][startDow];
    const startOffset = dayMap[startDowStr] || 0;

    // Get classroom Teams ID for meetings
    const { data: classroom } = await supabase
      .from('nexus_classrooms')
      .select('ms_team_id')
      .eq('id', plan.classroom_id)
      .single();

    const results = [];
    let lastDate = start_date;

    for (const session of sessions) {
      // Calculate actual date for this session
      const sessionDayOffset = dayMap[session.day_of_week] - startOffset;
      const adjustedOffset = sessionDayOffset < 0 ? sessionDayOffset + 7 : sessionDayOffset;
      const sessionDate = new Date(start_date);
      sessionDate.setDate(sessionDate.getDate() + adjustedOffset);
      const dateStr = sessionDate.toISOString().split('T')[0];
      lastDate = dateStr > lastDate ? dateStr : lastDate;

      // Get time from slot
      const slotDef = (plan.sessions_per_day as Array<{ slot: string; start: string; end: string }>)
        ?.find(s => s.slot === session.slot);
      const startTime = slotDef?.start || '11:00';
      const endTime = slotDef?.end || '12:00';

      // Create scheduled class
      const scheduledClass = await createScheduledClass({
        classroom_id: plan.classroom_id,
        title: session.title,
        description: session.description || null,
        scheduled_date: dateStr,
        start_time: startTime,
        end_time: endTime,
        teacher_id: session.teacher_id || user.id,
        topic_id: session.topic_id || null,
        status: 'scheduled',
        target_scope: 'classroom',
      }, supabase);

      // Update session
      await updateSession(session.id, {
        scheduled_class_id: scheduledClass.id,
        status: 'scheduled',
      }, supabase);

      // Create Teams meeting if requested
      let teamsUrl = null;
      if (create_teams_meetings !== false && classroom?.ms_team_id) {
        try {
          const meetingRes = await fetch('https://graph.microsoft.com/v1.0/me/onlineMeetings', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              subject: session.title,
              startDateTime: `${dateStr}T${startTime}:00`,
              endDateTime: `${dateStr}T${endTime}:00`,
              lobbyBypassSettings: { scope: 'organization' },
            }),
          });
          if (meetingRes.ok) {
            const meeting = await meetingRes.json();
            teamsUrl = meeting.joinWebUrl;
            await supabase
              .from('nexus_scheduled_classes')
              .update({ teams_meeting_url: meeting.joinWebUrl, teams_meeting_id: meeting.id })
              .eq('id', scheduledClass.id);
          }
        } catch {
          console.error('Teams meeting failed for session', session.id);
        }
      }

      results.push({ session_id: session.id, scheduled_class_id: scheduledClass.id, date: dateStr, teams_url: teamsUrl });
    }

    // Update week dates
    await updateWeekDates(week_id, start_date, lastDate, supabase);

    return NextResponse.json({ pushed: results.length, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/nexus/src/app/api/course-plans/[id]/sessions/push/ apps/nexus/src/app/api/course-plans/[id]/sessions/push-week/
git commit -m "feat(nexus): add push-to-timetable API routes

Single session push and bulk week push. Creates scheduled classes,
optionally creates Teams meetings, updates session status."
```

---

## Task 6: API Routes — Homework, Drill, Tests, Resources

**Files:**
- Create: `apps/nexus/src/app/api/course-plans/[id]/homework/route.ts`
- Create: `apps/nexus/src/app/api/course-plans/[id]/homework/grid/route.ts`
- Create: `apps/nexus/src/app/api/course-plans/homework/[hwId]/submit/route.ts`
- Create: `apps/nexus/src/app/api/course-plans/homework/[hwId]/review/route.ts`
- Create: `apps/nexus/src/app/api/course-plans/[id]/drill/route.ts`
- Create: `apps/nexus/src/app/api/course-plans/[id]/drill/progress/route.ts`
- Create: `apps/nexus/src/app/api/course-plans/[id]/tests/route.ts`
- Create: `apps/nexus/src/app/api/course-plans/[id]/resources/route.ts`

This task has many files but they all follow the same auth pattern from Task 4. The implementing agent should:

- [ ] **Step 1: Write homework list + create API** (`[id]/homework/route.ts`)

Follow the same auth pattern as Task 4. GET returns `getHomeworkByPlan(planId)`. POST calls `createHomework(body)` — teacher only.

- [ ] **Step 2: Write homework grading grid API** (`[id]/homework/grid/route.ts`)

GET returns `getHomeworkGradingGrid(planId, classroomId)` — teacher only. The `classroomId` comes from querying the plan first.

- [ ] **Step 3: Write homework submit API** (`homework/[hwId]/submit/route.ts`)

POST accepts multipart form data. Upload files to Supabase Storage bucket `homework-submissions` at path `{classroom_id}/{homework_id}/{student_id}/{filename}`. Then call `submitHomework(hwId, studentId, { attachments, text_response })`.

File upload pattern (from existing avatar upload):
```typescript
const supabase = getSupabaseAdminClient();
const formData = await request.formData();
const files = formData.getAll('files') as File[];
const textResponse = formData.get('text_response') as string | null;

const attachments = [];
for (const file of files) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const filename = `${classroomId}/${hwId}/${studentId}/${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabase.storage
    .from('homework-submissions')
    .upload(filename, buffer, { contentType: file.type, upsert: false });
  if (!uploadError) {
    const { data: urlData } = supabase.storage
      .from('homework-submissions')
      .getPublicUrl(filename);
    attachments.push({ url: urlData.publicUrl, type: file.type, name: file.name, size: file.size });
  }
}
```

- [ ] **Step 4: Write homework review API** (`homework/[hwId]/review/route.ts`)

POST accepts `{ submission_id, points_earned, teacher_feedback, status }`. Calls `reviewHomework()`. Teacher only.

- [ ] **Step 5: Write drill CRUD API** (`[id]/drill/route.ts`)

GET returns `getDrillQuestions(planId)` for students, `getAllDrillQuestions(planId)` for teachers. POST calls `createDrillQuestion()` or `updateDrillQuestion()` depending on whether `drill_id` is present in body.

- [ ] **Step 6: Write drill progress API** (`[id]/drill/progress/route.ts`)

GET returns `getDrillProgress(planId, studentId)`. POST calls `updateDrillProgress(drillId, studentId, mastered)`.

- [ ] **Step 7: Write tests CRUD API** (`[id]/tests/route.ts`)

GET returns `getTestsByPlan(planId)`. POST calls `createPlanTest(body)` — teacher only.

- [ ] **Step 8: Write resources CRUD API** (`[id]/resources/route.ts`)

GET returns `getResourcesByPlan(planId, filters)`. POST calls `createResource(body)` — teacher only. Supports query params `?topic_id=X` and `?session_id=X` for filtering.

- [ ] **Step 9: Commit**

```bash
git add apps/nexus/src/app/api/course-plans/
git commit -m "feat(nexus): add homework, drill, tests, and resources API routes

Homework: list, create, grading grid, submit (with file upload), review.
Drill: CRUD questions, student progress tracking.
Tests: list and create with QB link.
Resources: list and create with topic/session filtering."
```

---

## Task 7: Navigation — Add Course Plans to Sidebars

**Files:**
- Modify: `apps/nexus/src/components/PanelProvider.tsx`
- Modify: `apps/nexus/src/app/(student)/layout.tsx`

- [ ] **Step 1: Add Course Plans to teacher panels**

In `apps/nexus/src/components/PanelProvider.tsx`:

1. Add import at top:
```typescript
import PlaylistAddCheckOutlinedIcon from '@mui/icons-material/PlaylistAddCheckOutlined';
```

2. In the `teaching` panel's `sidebarItems` array, add after the Timetable item:
```typescript
{ label: 'Course Plans', path: '/teacher/course-plans', icon: <PlaylistAddCheckOutlinedIcon /> },
```

3. In the `management` panel's `sidebarItems` array, add after Classrooms:
```typescript
{ label: 'Course Plans', path: '/teacher/course-plans', icon: <PlaylistAddCheckOutlinedIcon /> },
```

- [ ] **Step 2: Add Course Plan to student sidebar and bottom nav**

In `apps/nexus/src/app/(student)/layout.tsx`:

1. Add import:
```typescript
import PlaylistPlayOutlinedIcon from '@mui/icons-material/PlaylistPlayOutlined';
```

2. In the `Learn` group of `allStudentNavGroups`, add after Library:
```typescript
{ label: 'Course Plan', path: '/student/course-plan', icon: <PlaylistPlayOutlinedIcon /> },
```

3. In `allBottomNavItems`, add after Timetable (shifting Library to overflow):
```typescript
{ label: 'Plan', path: '/student/course-plan', icon: <PlaylistPlayOutlinedIcon /> },
```

- [ ] **Step 3: Commit**

```bash
git add apps/nexus/src/components/PanelProvider.tsx apps/nexus/src/app/\(student\)/layout.tsx
git commit -m "feat(nexus): add Course Plans to teacher and student navigation

Teacher: Course Plans in teaching + management sidebar panels.
Student: Course Plan in Learn group + mobile bottom nav."
```

---

## Task 8: Teacher Pages — Plan List + Plan Dashboard

**Files:**
- Create: `apps/nexus/src/app/(teacher)/course-plans/page.tsx`
- Create: `apps/nexus/src/app/(teacher)/course-plans/[planId]/page.tsx`
- Create: `apps/nexus/src/components/course-plan/CoursePlanCard.tsx`
- Create: `apps/nexus/src/components/course-plan/CreatePlanDialog.tsx`

- [ ] **Step 1: Create CoursePlanCard component**

A card showing plan name, status badge, duration, session count, and progress. Follow existing card patterns in the codebase (like `ClassroomCard.tsx` or `ClassCard.tsx`). Use MUI Card, Chip for status, Typography for details.

- [ ] **Step 2: Create CreatePlanDialog component**

Dialog with form fields: name (TextField), description (TextField multiline), duration_weeks (number), days_per_week (multi-select chips: Mon-Sun), sessions_per_day (dynamic list of slot name + start/end time). Submit button calls POST `/api/course-plans`.

- [ ] **Step 3: Create plan list page**

```typescript
// apps/nexus/src/app/(teacher)/course-plans/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Button, Grid, Skeleton } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useNexusAuth } from '@/hooks/useNexusAuth';
import CoursePlanCard from '@/components/course-plan/CoursePlanCard';
import CreatePlanDialog from '@/components/course-plan/CreatePlanDialog';

export default function CoursePlansPage() {
  const { activeClassroom, getTeacherToken } = useNexusAuth();
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const fetchPlans = useCallback(async () => {
    if (!activeClassroom) return;
    try {
      const token = await getTeacherToken();
      const res = await fetch(`/api/course-plans?classroom_id=${activeClassroom.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setPlans(await res.json());
    } finally {
      setLoading(false);
    }
  }, [activeClassroom, getTeacherToken]);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200, mx: 'auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>Course Plans</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
          Create Plan
        </Button>
      </Box>

      {loading ? (
        <Grid container spacing={2}>
          {[1, 2].map(i => (
            <Grid item xs={12} sm={6} md={4} key={i}>
              <Skeleton variant="rounded" height={180} />
            </Grid>
          ))}
        </Grid>
      ) : plans.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography color="text.secondary">No course plans yet. Create one to get started.</Typography>
        </Box>
      ) : (
        <Grid container spacing={2}>
          {plans.map(plan => (
            <Grid item xs={12} sm={6} md={4} key={plan.id}>
              <CoursePlanCard plan={plan} />
            </Grid>
          ))}
        </Grid>
      )}

      <CreatePlanDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        classroomId={activeClassroom?.id || ''}
        onCreated={() => { setCreateOpen(false); fetchPlans(); }}
      />
    </Box>
  );
}
```

- [ ] **Step 4: Create plan dashboard page with tabs**

`apps/nexus/src/app/(teacher)/course-plans/[planId]/page.tsx` — fetches plan by ID, shows tabs for Overview (week cards with progress), Weeks, Homework, Tests, Drill, Resources. Each tab can be a separate component loaded lazily.

The Overview tab shows:
- Plan name, status, duration
- WeekCard per week showing: week title, goal, session count, scheduled/completed counts
- Click a week → navigates to `/teacher/course-plans/[planId]/weeks/[weekId]`

Implement with MUI Tabs component. The homework tab links to the homework page. Other tabs can render inline components.

- [ ] **Step 5: Commit**

```bash
git add apps/nexus/src/app/\(teacher\)/course-plans/ apps/nexus/src/components/course-plan/
git commit -m "feat(nexus): add teacher course plans list and dashboard pages

Plan list with create dialog, plan dashboard with tabs for
overview, weeks, homework, tests, drill, resources."
```

---

## Task 9: Teacher Pages — Week Detail + Push to Timetable

**Files:**
- Create: `apps/nexus/src/app/(teacher)/course-plans/[planId]/weeks/[weekId]/page.tsx`
- Create: `apps/nexus/src/components/course-plan/SessionCard.tsx`
- Create: `apps/nexus/src/components/course-plan/SessionEditDialog.tsx`
- Create: `apps/nexus/src/components/course-plan/PushToTimetableDialog.tsx`
- Create: `apps/nexus/src/components/course-plan/PushWeekDialog.tsx`

- [ ] **Step 1: Create SessionCard component**

Shows: day number, day of week, slot (AM/PM), title, teacher name, topic, status badge (planned=grey, scheduled=blue, completed=green). Click opens SessionEditDialog. "Push" button if status is 'planned'.

- [ ] **Step 2: Create SessionEditDialog**

Edit session: title (TextField), description (TextField multiline), topic (select from classroom topics), teacher (select from teaching team / enrolled teachers), notes. Save calls POST `/api/course-plans/[id]/sessions`.

- [ ] **Step 3: Create PushToTimetableDialog**

Confirm push: shows session title, lets teacher pick date (DatePicker) and optionally adjust time. Checkbox "Create Teams meeting" (default checked). Submit calls POST `/api/course-plans/[id]/sessions/push`.

- [ ] **Step 4: Create PushWeekDialog**

Bulk push: shows all unpushed sessions in the week. DatePicker for week start date. Preview grid showing which date each session will land on. Checkbox "Create Teams meetings". Submit calls POST `/api/course-plans/[id]/sessions/push-week`.

- [ ] **Step 5: Create week detail page**

```typescript
// apps/nexus/src/app/(teacher)/course-plans/[planId]/weeks/[weekId]/page.tsx
'use client';
// Page that:
// 1. Fetches sessions for this week via GET /api/course-plans/[planId]/sessions?week_id=[weekId]
// 2. Shows week title, goal, date range at top
// 3. Groups sessions by day_number
// 4. Each day shows AM and PM SessionCards side by side (stacked on mobile)
// 5. "Push Entire Week" button at top opens PushWeekDialog
// 6. Individual "Push" buttons on each planned SessionCard open PushToTimetableDialog
// 7. "Edit" button on each SessionCard opens SessionEditDialog
```

The implementing agent should build this following the patterns from the plan list page (Task 8), using the same auth hook and fetch pattern.

- [ ] **Step 6: Commit**

```bash
git add apps/nexus/src/app/\(teacher\)/course-plans/[planId]/weeks/ apps/nexus/src/components/course-plan/
git commit -m "feat(nexus): add week detail page with push-to-timetable

Session cards with edit and push actions. Single session push
and bulk week push with Teams meeting creation."
```

---

## Task 10: Teacher Pages — Homework Grading Grid

**Files:**
- Create: `apps/nexus/src/app/(teacher)/course-plans/[planId]/homework/page.tsx`
- Create: `apps/nexus/src/components/course-plan/HomeworkGradingGrid.tsx`
- Create: `apps/nexus/src/components/course-plan/SubmissionReviewPanel.tsx`
- Create: `apps/nexus/src/components/course-plan/HomeworkCreateDialog.tsx`

- [ ] **Step 1: Create HomeworkGradingGrid component**

A matrix table (like the Teams Assignments screenshot the user showed):
- Rows: students (with avatar + name + overall %)
- Columns: homework assignments (title + date + max points)
- Cells: points earned / status text
- Click cell → opens SubmissionReviewPanel
- Class average row at top
- Mobile: `overflow-x: auto` with `position: sticky` on first column (student name)
- Use MUI Table or a custom grid (not MUI X DataGrid — too heavy for this)

- [ ] **Step 2: Create SubmissionReviewPanel component**

Slide-out drawer (MUI Drawer from right, or bottom sheet on mobile):
- Student name + avatar
- Submission status
- Attachments displayed as thumbnails (images) or download links (PDFs)
- Text response if any
- Points input (number field, max = homework max_points)
- Feedback textarea
- "Return" and "Mark Reviewed" buttons
- Calls POST `/api/course-plans/homework/[hwId]/review`

- [ ] **Step 3: Create HomeworkCreateDialog**

Dialog for creating homework on a session:
- Session selector (dropdown of sessions)
- Title, description, type (select: drawing/mcq/study/review/mixed)
- Max points (optional number)
- Estimated minutes
- Due date (auto-set to session date + 1 by default)
- Calls POST `/api/course-plans/[id]/homework`

- [ ] **Step 4: Create homework page**

Fetches grading grid data from GET `/api/course-plans/[id]/homework/grid`. Renders HomeworkGradingGrid. "Add Homework" button opens HomeworkCreateDialog.

- [ ] **Step 5: Commit**

```bash
git add apps/nexus/src/app/\(teacher\)/course-plans/[planId]/homework/ apps/nexus/src/components/course-plan/
git commit -m "feat(nexus): add homework grading grid for teachers

Matrix view of students × assignments, submission review panel
with attachment viewer and grading form, homework creation dialog."
```

---

## Task 11: Student Pages — Course Plan Overview + Today's Plan

**Files:**
- Create: `apps/nexus/src/app/(student)/course-plan/page.tsx`
- Create: `apps/nexus/src/components/course-plan/TodaysPlanCard.tsx`
- Create: `apps/nexus/src/components/course-plan/WeeklyOverview.tsx`
- Create: `apps/nexus/src/components/course-plan/WeekCard.tsx`

- [ ] **Step 1: Create TodaysPlanCard component**

Hero card at top of student course plan page:
- "Today's Plan" heading
- AM session card: time, topic, teacher name, "Join Meeting" button if Teams URL exists
- PM session card: same layout
- Homework due today listed below with status badges
- If no sessions today (e.g. Monday off): "No classes today — review your notes!"
- Mobile-first: full width, large touch targets for Join Meeting button (48px min height)

Logic: find sessions where the `scheduled_class` date matches today. If not pushed yet, show from plan based on day_of_week matching today.

- [ ] **Step 2: Create WeeklyOverview component**

- Horizontal tabs for Week 1-5 (swipeable on mobile)
- Under each tab: list of days, each day shows AM + PM session cards
- Session status indicators: planned (grey dot), scheduled (blue dot), completed (green check), skipped (red X)
- Compact cards: just title, teacher, topic — not full detail

- [ ] **Step 3: Create student course plan page**

```typescript
// apps/nexus/src/app/(student)/course-plan/page.tsx
'use client';
// Page that:
// 1. Fetches active course plan for student's classroom
//    GET /api/course-plans?classroom_id=X (returns active plans only for students)
// 2. If no active plan → "No course plan active" empty state
// 3. Fetches full plan with sessions: GET /api/course-plans/[planId]
// 4. Renders:
//    a) TodaysPlanCard at top (today's sessions with meeting links)
//    b) Quick action cards row: "Homework (3 pending)" | "Drill (14/20)" | "Next Test (Sun)"
//    c) WeeklyOverview below with week tabs
//    d) Study Resources section at bottom (today's session resources + topic resources)
// 5. Quick action cards link to /student/course-plan/homework, /drill, /tests
```

- [ ] **Step 4: Commit**

```bash
git add apps/nexus/src/app/\(student\)/course-plan/page.tsx apps/nexus/src/components/course-plan/
git commit -m "feat(nexus): add student course plan overview page

Today's Plan hero card, quick action links, weekly overview
with week tabs and session status indicators."
```

---

## Task 12: Student Pages — Homework Submission

**Files:**
- Create: `apps/nexus/src/app/(student)/course-plan/homework/page.tsx`
- Create: `apps/nexus/src/components/course-plan/StudentHomeworkCard.tsx`
- Create: `apps/nexus/src/components/course-plan/HomeworkSubmitSheet.tsx`

- [ ] **Step 1: Create StudentHomeworkCard component**

Card for each homework item:
- Title, type badge (drawing/mcq/study), due date, max points
- Status badge: pending (orange), submitted (blue), reviewed (green), returned (red)
- If reviewed: shows points earned and teacher feedback
- "Submit" button if pending/returned → opens HomeworkSubmitSheet
- Mobile-first: cards stack vertically, large touch targets

- [ ] **Step 2: Create HomeworkSubmitSheet component**

Bottom sheet (MUI Drawer anchor="bottom" on mobile, side drawer on desktop):
- Homework title and description at top
- File upload area: drag & drop on desktop, camera button + gallery button on mobile
- Show uploaded file previews (image thumbnails)
- Text response textarea (optional, for non-drawing homework)
- "Submit" button
- Calls POST `/api/course-plans/homework/[hwId]/submit` with FormData
- Shows success state after submission

- [ ] **Step 3: Create homework page**

```typescript
// apps/nexus/src/app/(student)/course-plan/homework/page.tsx
'use client';
// Page that:
// 1. Gets active plan ID (same as course-plan/page.tsx)
// 2. Fetches student's homework with submissions
// 3. Filter tabs: All | Pending | Submitted | Reviewed
// 4. Renders StudentHomeworkCard list
// 5. Each card's "Submit" opens HomeworkSubmitSheet
// 6. After submission, refreshes the list
```

- [ ] **Step 4: Commit**

```bash
git add apps/nexus/src/app/\(student\)/course-plan/homework/ apps/nexus/src/components/course-plan/
git commit -m "feat(nexus): add student homework submission page

Homework list with filter tabs, submission bottom sheet with
camera/gallery upload and text response."
```

---

## Task 13: Student Pages — Drill Flashcards

**Files:**
- Create: `apps/nexus/src/app/(student)/course-plan/drill/page.tsx`
- Create: `apps/nexus/src/components/course-plan/DrillFlashcard.tsx`
- Create: `apps/nexus/src/components/course-plan/DrillWidget.tsx`

- [ ] **Step 1: Create DrillFlashcard component**

A single flashcard:
- Front: question text in large font, frequency note as small badge
- Tap/click → flip animation (CSS transform rotateY) → reveals answer + explanation
- After flip: two buttons at bottom: "Got it" (green, marks mastered) and "Need practice" (orange)
- Full-width card on mobile, max-width 500px on desktop
- Min-height 200px for comfortable reading

- [ ] **Step 2: Create DrillWidget component**

Flashcard carousel:
- Progress bar at top: "14/20 mastered" with linear progress
- Current card number: "Question 5 of 20"
- Shows one DrillFlashcard at a time
- Left/right navigation arrows (or swipe on mobile)
- Prioritizes unmastered questions (show them first, then mastered ones)
- Calls POST `/api/course-plans/[id]/drill/progress` on "Got it" / "Need practice"
- Celebration state when all 20 are mastered

- [ ] **Step 3: Create drill page**

```typescript
// apps/nexus/src/app/(student)/course-plan/drill/page.tsx
'use client';
// Page that:
// 1. Gets active plan ID
// 2. Fetches drill questions: GET /api/course-plans/[id]/drill
// 3. Fetches student progress: GET /api/course-plans/[id]/drill/progress
// 4. Merges: marks each question as mastered or not
// 5. Renders DrillWidget with merged data
// 6. Title: "Quick Drill — Repeat Questions"
// 7. Subtitle: "These exact questions appeared 3+ times. Master them for free marks!"
```

- [ ] **Step 4: Commit**

```bash
git add apps/nexus/src/app/\(student\)/course-plan/drill/ apps/nexus/src/components/course-plan/
git commit -m "feat(nexus): add drill flashcard widget for students

Swipeable flashcards with flip animation, mastery tracking,
progress bar, and prioritized display of unmastered questions."
```

---

## Task 14: Student Pages — Tests

**Files:**
- Create: `apps/nexus/src/app/(student)/course-plan/tests/page.tsx`
- Create: `apps/nexus/src/components/course-plan/TestCard.tsx`

- [ ] **Step 1: Create TestCard component**

Card for each test:
- Title, week label, scheduled date
- Question count, duration
- Scope description
- If linked to QB test (test_id exists): "Start Test" button → links to `/student/tests/[testId]`
- If not linked yet: "Coming soon" disabled state
- Past tests (scheduled_date < today): show score if available

- [ ] **Step 2: Create tests page**

```typescript
// apps/nexus/src/app/(student)/course-plan/tests/page.tsx
'use client';
// Page that:
// 1. Gets active plan ID
// 2. Fetches tests: GET /api/course-plans/[id]/tests
// 3. Splits into upcoming and past
// 4. "Upcoming Tests" section with TestCards
// 5. "Past Tests" section with scores
// 6. Empty state if no tests
```

- [ ] **Step 3: Commit**

```bash
git add apps/nexus/src/app/\(student\)/course-plan/tests/ apps/nexus/src/components/course-plan/
git commit -m "feat(nexus): add student tests page for course plan

Test cards with QB integration links, upcoming/past sections."
```

---

## Task 15: Teacher — Drill Manager + Resource Manager

**Files:**
- Create: `apps/nexus/src/components/course-plan/DrillManagerTable.tsx`
- Create: `apps/nexus/src/components/course-plan/ResourceList.tsx`

These are rendered as tabs within the plan dashboard page (Task 8).

- [ ] **Step 1: Create DrillManagerTable**

Table/list of drill questions with:
- Sort order (drag handle or up/down buttons)
- Question text, answer text (truncated)
- Frequency note
- Active/inactive toggle switch
- Edit button → inline edit or dialog
- "Add Question" button at bottom
- Mastery stats column: "14/20 students mastered"
- Uses GET/POST `/api/course-plans/[id]/drill`

- [ ] **Step 2: Create ResourceList**

Grouped list of resources:
- Group by topic (topic-level resources) or session (session-level)
- Each resource: title, URL (clickable), type badge (video/practice/reference/tool)
- "Add Resource" button → dialog with title, URL, type, and topic/session selector
- Delete button per resource
- Uses GET/POST `/api/course-plans/[id]/resources`

- [ ] **Step 3: Integrate into plan dashboard tabs**

Update the plan dashboard page (`apps/nexus/src/app/(teacher)/course-plans/[planId]/page.tsx`) to render DrillManagerTable in the "Drill" tab and ResourceList in the "Resources" tab.

- [ ] **Step 4: Commit**

```bash
git add apps/nexus/src/components/course-plan/
git commit -m "feat(nexus): add drill manager and resource list for teachers

Drill: sortable question list with mastery stats and active toggle.
Resources: grouped by topic/session with add/delete."
```

---

## Task 16: NATA 2026 Seed Data

**Files:**
- Create: `apps/nexus/src/app/api/course-plans/seed/route.ts`

This is a one-time API route that seeds the NATA 2026 course plan data from the markdown doc. It can be called manually by the admin.

- [ ] **Step 1: Create seed API route**

```typescript
// apps/nexus/src/app/api/course-plans/seed/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

// NATA 2026 course plan data extracted from NATA_2026_COURSE_PLAN.md
const NATA_PLAN = {
  name: 'NATA 2026 Crash Course',
  description: '5-week intensive crash course for NATA 2026. 60 sessions (30 days × 2/day). Online via Microsoft Teams.',
  duration_weeks: 5,
  days_per_week: ['tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
  sessions_per_day: [
    { slot: 'am', start: '11:00', end: '12:00' },
    { slot: 'pm', start: '19:00', end: '20:00' },
  ],
};

const WEEKS = [
  { number: 1, title: 'Foundations', goal: 'Build base knowledge in all areas. Students go from zero to exam-aware.' },
  { number: 2, title: 'Core Exam Topics', goal: 'Cover all HIGH frequency topics. Students can recognize most NATA question types.' },
  { number: 3, title: 'Advanced & Emerging Topics', goal: 'Cover MEDIUM frequency topics + new 2026 predictions. Fill remaining gaps.' },
  { number: 4, title: 'Mastery & Speed', goal: 'Build speed (43 sec/question target). Cover remaining topics. Polish drawing skills.' },
  { number: 5, title: 'Final Polish & Exam Readiness', goal: 'Confidence building, weak area targeting, exam simulation.' },
];

// Drill questions from "Confirmed Repeat Questions" section
const DRILL_QUESTIONS = [
  { q: 'Two equilateral triangles (side 20cm) placed adjacent — count right-angled/total triangles', a: 'Count systematically using the combined figure', note: '4+ sessions' },
  { q: 'Price increase 20% then 10% discount — net profit?', a: '8% net profit', note: '5+ sessions' },
  { q: 'Nobel Peace Prize 2024?', a: 'Nihon Hidankyo', note: '6+ sessions' },
  { q: 'Lok Sabha seats (old / new parliament)?', a: '543 old / 888 new', note: '5+ sessions' },
  { q: 'Clock angle at 4:30?', a: '45°', note: '4+ sessions' },
  { q: 'Scalene triangle axes of symmetry?', a: '0', note: '4+ sessions' },
  { q: 'Words from R, T, A?', a: 'RAT, TAR, ART (3 words)', note: '4+ sessions' },
  { q: 'Series: 1, 3, 9, ?, 81', a: '27', note: '3+ sessions' },
  { q: 'Matri Mandir shape?', a: 'Spherical', note: '3+ sessions' },
  { q: 'Kala Pani / Cellular Jail location?', a: 'Andaman & Nicobar', note: '3+ sessions' },
  { q: 'If P is 40% of Q, what is 15% of P?', a: '0.06Q', note: '3+ sessions' },
  { q: 'Sum of factors of 20?', a: '42', note: '3+ sessions' },
  { q: '"Architecture is frozen music" — who said it?', a: 'Goethe', note: '3+ sessions' },
  { q: 'Shirdi location?', a: 'Maharashtra', note: '3+ sessions' },
  { q: 'Olympic logo — correct colour sequence?', a: 'Blue, Yellow, Black, Green, Red (left to right)', note: '4+ sessions' },
  { q: 'Draupadi Murmu — odd one out by position?', a: 'President (others are not)', note: '3+ sessions' },
  { q: 'Sanchi Stupa dome (Anda) represents?', a: 'Cycle of life and death', note: '3+ sessions' },
  { q: 'Wooden stilt houses found in?', a: 'Assam', note: '3+ sessions' },
  { q: 'Houses with sloped roofs indicate?', a: 'Heavy rainfall areas', note: '3+ sessions' },
  { q: 'WC stands for?', a: 'Water Closet', note: '4+ sessions' },
];

const WEEKLY_TESTS = [
  { week: 1, title: 'Week 1 Mini Test', questions: 30, duration: 40, scope: 'Week 1 topics only' },
  { week: 2, title: 'Week 2 Progress Test', questions: 40, duration: 45, scope: 'Weeks 1-2' },
  { week: 3, title: 'Week 3 Half Mock', questions: 50, duration: 50, scope: 'Weeks 1-3, exam-style' },
  { week: 4, title: 'Week 4 Full Mock', questions: 75, duration: 60, scope: 'All topics' },
  { week: 5, title: 'Final Mock', questions: 100, duration: 70, scope: 'Full exam simulation' },
];

const RESOURCES = [
  { title: 'Khan Academy — Geometry', url: 'https://www.khanacademy.org', type: 'practice' },
  { title: 'IndiaBIX — Reasoning & Aptitude', url: 'https://www.indiabix.com', type: 'practice' },
  { title: 'Drawabox — Drawing Fundamentals', url: 'https://drawabox.com', type: 'practice' },
  { title: 'Proko — Figure Drawing & Shading', url: 'https://www.youtube.com/@Proko', type: 'video' },
  { title: 'Inshorts — Daily Current Affairs', url: 'https://inshorts.com', type: 'reference' },
  { title: 'Leonardo da Vinci — 10 Famous Artworks', url: 'https://www.britannica.com/list/10-famous-artworks-by-leonardo-davinci', type: 'reference' },
];

export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase.from('users').select('id').eq('ms_oid', msUser.oid).single();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { classroom_id } = await request.json();
    if (!classroom_id) return NextResponse.json({ error: 'classroom_id required' }, { status: 400 });

    // Create plan
    const { data: plan, error: pErr } = await supabase
      .from('nexus_course_plans')
      .insert({ ...NATA_PLAN, classroom_id, created_by: user.id, status: 'active' })
      .select().single();
    if (pErr) throw pErr;

    // Create weeks
    const weekRows = WEEKS.map(w => ({ plan_id: plan.id, week_number: w.number, title: w.title, goal: w.goal, sort_order: w.number }));
    const { data: weeks, error: wErr } = await supabase.from('nexus_course_plan_weeks').insert(weekRows).select();
    if (wErr) throw wErr;

    const weekMap = new Map(weeks.map((w: { week_number: number; id: string }) => [w.week_number, w.id]));

    // Create session shells (60 sessions: 30 days × 2 slots)
    const sessions = [];
    let day = 0;
    for (let w = 1; w <= 5; w++) {
      for (const dow of NATA_PLAN.days_per_week) {
        day++;
        for (const slot of NATA_PLAN.sessions_per_day) {
          sessions.push({
            week_id: weekMap.get(w),
            plan_id: plan.id,
            day_number: day,
            day_of_week: dow,
            slot: slot.slot,
            title: `Day ${day} - ${slot.slot.toUpperCase()} Session`,
            status: 'planned',
          });
        }
      }
    }
    const { error: sErr } = await supabase.from('nexus_course_plan_sessions').insert(sessions);
    if (sErr) throw sErr;

    // Create drill questions
    const drillRows = DRILL_QUESTIONS.map((d, i) => ({
      plan_id: plan.id, question_text: d.q, answer_text: d.a, frequency_note: d.note, sort_order: i + 1,
    }));
    const { error: dErr } = await supabase.from('nexus_course_plan_drill').insert(drillRows);
    if (dErr) throw dErr;

    // Create weekly tests
    const testRows = WEEKLY_TESTS.map((t, i) => ({
      plan_id: plan.id, week_id: weekMap.get(t.week), title: t.title,
      question_count: t.questions, duration_minutes: t.duration, scope: t.scope, sort_order: i + 1,
    }));
    const { error: tErr } = await supabase.from('nexus_course_plan_tests').insert(testRows);
    if (tErr) throw tErr;

    // Create resources (plan-level, no topic/session — use topic_id=null workaround)
    // These are general resources, so we set session_id to the first session as a workaround
    // for the CHECK constraint. In practice, the teacher will reassign them to proper topics.
    const { data: firstSession } = await supabase
      .from('nexus_course_plan_sessions')
      .select('id')
      .eq('plan_id', plan.id)
      .order('day_number')
      .limit(1)
      .single();

    if (firstSession) {
      const resRows = RESOURCES.map((r, i) => ({
        plan_id: plan.id, session_id: firstSession.id, title: r.title, url: r.url, type: r.type, sort_order: i + 1,
      }));
      const { error: rErr } = await supabase.from('nexus_course_plan_resources').insert(resRows);
      if (rErr) throw rErr;
    }

    return NextResponse.json({
      plan_id: plan.id,
      sessions_created: sessions.length,
      drill_questions: DRILL_QUESTIONS.length,
      tests: WEEKLY_TESTS.length,
      resources: RESOURCES.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/nexus/src/app/api/course-plans/seed/
git commit -m "feat(nexus): add NATA 2026 course plan seed API

One-time seed route that creates the full NATA 2026 plan with
60 sessions, 20 drill questions, 5 weekly tests, and study resources."
```

---

## Task 17: Final Integration + Polish

- [ ] **Step 1: Verify all imports resolve**

Run: `cd apps/nexus && npx tsc --noEmit`

Fix any TypeScript errors — typically missing imports or type mismatches between query functions and API routes.

- [ ] **Step 2: Verify dev server starts**

Run: `cd apps/nexus && pnpm dev`

Navigate to `/teacher/course-plans` and `/student/course-plan` to verify pages load without crashes.

- [ ] **Step 3: Test seed API**

Using the browser or curl, call POST `/api/course-plans/seed` with `{ "classroom_id": "<your-nata-classroom-id>" }` to seed the NATA plan. Verify:
- Plan appears in teacher plan list
- 60 sessions created across 5 weeks
- 20 drill questions visible
- 5 weekly tests visible

- [ ] **Step 4: Test push to timetable**

From the week detail page, push a single session. Verify:
- Scheduled class appears in timetable
- Session status changes to 'scheduled'
- Teams meeting created (if classroom has ms_team_id)

- [ ] **Step 5: Test student views**

Log in as a student enrolled in the NATA classroom. Verify:
- Course Plan appears in sidebar and bottom nav
- Today's Plan card shows correct sessions
- Homework page shows assignments
- Drill flashcards work with flip and mastery tracking

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat(nexus): course plan module — complete implementation

Generic course plan system with NATA 2026 as first plan.
Teachers: create plans, push to timetable + Teams, grade homework.
Students: today's plan, homework submission, drill flashcards, tests."
```
