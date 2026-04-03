# Course Plan Module — Design Spec

**Date:** 2026-04-03
**App:** Nexus (nexus.neramclasses.com)
**Status:** Approved for implementation

## Summary

A generic course plan system for Nexus that lets teachers create structured course plans (weeks, sessions, homework, tests, resources) and push them to the timetable with auto Teams meeting creation. Students get a focused view with today's plan, homework submissions, a quick-drill flashcard widget, and study resources. The NATA 2026 Crash Course is the first plan seeded into the system.

## Core Flow

```
Teacher creates Course Plan (weeks → sessions → homework/tests)
  → Assigns sessions to specific dates
  → Pushes to timetable (single or bulk week)
  → Scheduled class + Teams meeting auto-created
  → Students see it in their timetable + course plan view
  → Students submit homework in Nexus
  → Teams channel gets notification with link back to Nexus
  → Teachers grade in Nexus (grid view like Teams Assignments)
```

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Plan scope | Generic system, NATA as first plan | Reusable for JEE, Revit, future courses |
| Plan authoring | Structured template — co-created by admin + teachers | Teachers edit within structure, don't design from scratch. Will evolve based on real usage |
| Homework | Submission-based in Nexus | Full loop: assign → submit (photo/text) → grade → feedback |
| Homework notifications | Teams channel notification with Nexus link | Students get notified in Teams, work in one place |
| Weekly tests | Integrate with existing QB/Test system | Leverage 600+ recalled questions |
| Repeat drill | Standalone flashcard widget | Fast, frictionless — no need for full test flow |
| Study resources | Dual: topic-level + session-level | Permanent reference library + "study this tonight" |
| Timetable integration | Plan is source of truth, pushes to timetable | Sessions create scheduled_classes + Teams meetings |
| Push granularity | Single session or bulk by week | Flexibility for teachers |

## Database Schema

### 1. nexus_course_plans

The master plan entity, linked to a classroom.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| classroom_id | UUID FK → nexus_classrooms | One classroom can have multiple plans |
| name | TEXT NOT NULL | e.g. "NATA 2026 Crash Course" |
| description | TEXT | Course overview |
| duration_weeks | INT | e.g. 5 |
| days_per_week | TEXT[] | e.g. ['tue','wed','thu','fri','sat','sun'] |
| sessions_per_day | JSONB | e.g. [{slot:'am', start:'11:00', end:'12:00'}, {slot:'pm', start:'19:00', end:'20:00'}] |
| status | TEXT CHECK | 'draft' / 'active' / 'completed' |
| teaching_team | JSONB | [{user_id, name, subjects[], slot}] — overview metadata; actual teacher is assigned per-session |
| created_by | UUID FK → users | |
| created_at | TIMESTAMPTZ | DEFAULT now() |
| updated_at | TIMESTAMPTZ | DEFAULT now() |

### 2. nexus_course_plan_weeks

Weeks within a plan, each with a title and goal.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| plan_id | UUID FK → nexus_course_plans | ON DELETE CASCADE |
| week_number | INT | 1-based |
| title | TEXT | e.g. "Foundations" |
| goal | TEXT | e.g. "Build base knowledge in all areas" |
| start_date | DATE | Nullable — set when week is scheduled |
| end_date | DATE | Nullable |
| sort_order | INT | |

### 3. nexus_course_plan_sessions

Individual teaching sessions (AM/PM slots on a day). The bridge to the timetable via `scheduled_class_id`.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| week_id | UUID FK → nexus_course_plan_weeks | ON DELETE CASCADE |
| plan_id | UUID FK → nexus_course_plans | Denormalized for query efficiency |
| day_number | INT | 1-30 (absolute day in the plan) |
| day_of_week | TEXT | 'tue','wed','thu','fri','sat','sun' |
| slot | TEXT | 'am' / 'pm' |
| topic_id | UUID FK → nexus_topics | Nullable |
| teacher_id | UUID FK → users | Nullable |
| title | TEXT NOT NULL | Session title |
| description | TEXT | Detailed content description |
| scheduled_class_id | UUID FK → nexus_scheduled_classes | Nullable — set when pushed to timetable |
| status | TEXT CHECK | 'planned' / 'scheduled' / 'completed' / 'skipped' |
| notes | TEXT | Teacher notes |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

**Key:** When status changes from 'planned' → 'scheduled', it means a `nexus_scheduled_class` was created and `scheduled_class_id` is populated.

### 4. nexus_course_plan_homework

Homework assignments tied to a session.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| session_id | UUID FK → nexus_course_plan_sessions | ON DELETE CASCADE |
| plan_id | UUID FK → nexus_course_plans | Denormalized |
| title | TEXT NOT NULL | e.g. "Draw 2 colour wheels" |
| description | TEXT | Detailed instructions |
| type | TEXT CHECK | 'drawing' / 'mcq' / 'study' / 'review' / 'mixed' |
| max_points | INT | Nullable — null means ungraded |
| due_date | DATE | Nullable — auto-set relative to session date |
| estimated_minutes | INT | e.g. 20 |
| sort_order | INT | |
| created_at | TIMESTAMPTZ | |

### 5. nexus_homework_submissions

Student submissions for homework, with grading.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| homework_id | UUID FK → nexus_course_plan_homework | ON DELETE CASCADE |
| student_id | UUID FK → users | |
| status | TEXT CHECK | 'pending' / 'submitted' / 'reviewed' / 'returned' |
| attachments | JSONB | Array of {url, type, name, size} |
| text_response | TEXT | Nullable — for text-based homework |
| points_earned | INT | Nullable |
| teacher_feedback | TEXT | Nullable |
| reviewed_by | UUID FK → users | Nullable |
| submitted_at | TIMESTAMPTZ | Nullable |
| reviewed_at | TIMESTAMPTZ | Nullable |
| created_at | TIMESTAMPTZ | DEFAULT now() |

**Unique constraint:** (homework_id, student_id) — one submission per student per homework.

### 6. nexus_course_plan_tests

Weekly tests linked to the existing QB test system.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| plan_id | UUID FK → nexus_course_plans | ON DELETE CASCADE |
| week_id | UUID FK → nexus_course_plan_weeks | |
| title | TEXT NOT NULL | e.g. "Week 1 Mini Test" |
| description | TEXT | |
| question_count | INT | e.g. 30 |
| duration_minutes | INT | e.g. 40 |
| scope | TEXT | e.g. "Week 1 topics only" |
| test_id | UUID | Nullable FK — links to QB test system (exact table TBD at implementation — verify existing test/assessment tables) |
| scheduled_date | DATE | Nullable |
| sort_order | INT | |
| created_at | TIMESTAMPTZ | |

### 7. nexus_course_plan_resources

Study material links attached to topics or sessions.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| plan_id | UUID FK → nexus_course_plans | ON DELETE CASCADE |
| topic_id | UUID FK → nexus_topics | Nullable — for topic-level resources |
| session_id | UUID FK → nexus_course_plan_sessions | Nullable — for session-level resources |
| title | TEXT NOT NULL | e.g. "Khan Academy - Geometry" |
| url | TEXT NOT NULL | |
| type | TEXT CHECK | 'video' / 'practice' / 'reference' / 'tool' |
| sort_order | INT | |
| created_at | TIMESTAMPTZ | |

**Constraint:** At least one of topic_id or session_id must be set (CHECK constraint).

### 8. nexus_course_plan_drill

Standalone repeat questions widget — not part of the QB.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| plan_id | UUID FK → nexus_course_plans | ON DELETE CASCADE |
| question_text | TEXT NOT NULL | e.g. "Nobel Peace Prize 2024?" |
| answer_text | TEXT NOT NULL | e.g. "Nihon Hidankyo" |
| explanation | TEXT | Nullable — why this answer |
| frequency_note | TEXT | e.g. "6+ sessions" |
| sort_order | INT | |
| is_active | BOOLEAN | DEFAULT true |
| created_at | TIMESTAMPTZ | |

### 9. nexus_drill_progress (student tracking)

Tracks which drill questions a student has mastered.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| drill_id | UUID FK → nexus_course_plan_drill | ON DELETE CASCADE |
| student_id | UUID FK → users | |
| mastered | BOOLEAN | DEFAULT false |
| attempts | INT | DEFAULT 0 |
| last_attempted_at | TIMESTAMPTZ | |

**Unique constraint:** (drill_id, student_id)

## Routes

### Teacher Routes

| Route | Purpose |
|-------|---------|
| `/teacher/course-plans` | List all plans for active classroom |
| `/teacher/course-plans/[planId]` | Plan dashboard — tabs: Overview, Weeks, Homework, Tests, Drill, Resources |
| `/teacher/course-plans/[planId]/weeks/[weekId]` | Week detail — sessions list, assign dates, push to timetable |
| `/teacher/course-plans/[planId]/homework` | Homework grading grid (students × assignments matrix) |

### Student Routes

| Route | Purpose |
|-------|---------|
| `/student/course-plan` | Active plan — Today's Plan hero, week tabs, quick links |
| `/student/course-plan/homework` | Homework list with submission — filter by pending/submitted/reviewed |
| `/student/course-plan/drill` | Flashcard drill — swipe/flip, self-mark mastery |
| `/student/course-plan/tests` | Upcoming + past tests, scores, link to QB test system |

### API Routes

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/course-plans` | List plans for classroom |
| POST | `/api/course-plans` | Create plan |
| GET | `/api/course-plans/[id]` | Get plan with weeks, session counts |
| PUT | `/api/course-plans/[id]` | Update plan |
| GET | `/api/course-plans/[id]/sessions` | List sessions (filterable by week) |
| POST | `/api/course-plans/[id]/sessions` | Create/update session |
| POST | `/api/course-plans/[id]/sessions/push` | Push single session to timetable + Teams |
| POST | `/api/course-plans/[id]/sessions/push-week` | Bulk push entire week |
| GET | `/api/course-plans/[id]/homework` | List homework |
| POST | `/api/course-plans/[id]/homework` | Create homework |
| GET | `/api/course-plans/[id]/homework/grid` | Grading grid (students × assignments) |
| POST | `/api/course-plans/homework/[hwId]/submit` | Student submit (multipart for files) |
| POST | `/api/course-plans/homework/[hwId]/review` | Teacher grade + feedback |
| GET/POST | `/api/course-plans/[id]/drill` | CRUD drill questions |
| GET | `/api/course-plans/[id]/drill/progress` | Student drill progress |
| POST | `/api/course-plans/[id]/drill/progress` | Update drill mastery |
| GET/POST | `/api/course-plans/[id]/tests` | CRUD weekly tests |
| GET/POST | `/api/course-plans/[id]/resources` | CRUD study resources |

## Navigation Placement

### Teacher
- **Sidebar:** "Course Plans" between Timetable and Classrooms (in the main nav group)
- **Icon:** Assignment/clipboard icon

### Student
- **Sidebar:** "Course Plan" in the "Learn" group, between Library and Question Bank
- **Mobile Bottom Nav:** "Plan" replaces "Library" slot when an active course plan exists
- **Dashboard:** "Today's Plan" widget on student dashboard homepage

## Teacher Features

### Plan Builder
- Create plan: name, classroom, duration, schedule pattern (days/week, slots/day), teaching team
- Auto-generates week and session shells based on pattern
- Teacher fills in: topic, description, teacher assignment per session
- Attach homework items to each session

### Week Scheduler
- View all sessions for a week in a calendar-like layout
- Set week start date — sessions auto-map to correct days of the week
- **Push single session:** Pick session → confirm date/time → creates `nexus_scheduled_class` + Teams meeting → updates `scheduled_class_id` and status to 'scheduled'
- **Push entire week:** Review all sessions → confirm → bulk create scheduled classes + Teams meetings
- Default Teams channel: common classroom channel (all students can attend)

### Homework Grading Grid
- Matrix view: rows = students, columns = homework assignments
- Each cell shows: points earned / max points, or status (Viewed, Submitted, Returned)
- Click cell → slide-out panel with submission details, attachments, feedback form
- Class average row at top
- Sort by student name or score
- Mobile: horizontal scroll with sticky student name column

### Drill Manager
- Add/edit/reorder repeat questions
- Toggle active/inactive
- View student mastery stats per question

## Student Features

### Today's Plan Card
- Shows AM and PM sessions for today
- Teacher name, topic, time
- "Join Meeting" button if session is pushed to timetable and has Teams link
- Homework due today listed below

### Weekly Overview
- Tab per week (Week 1-5)
- Day-by-day list showing sessions with completion indicators
- Color-coded status: planned (grey), scheduled (blue), completed (green), skipped (red)

### Homework Submission
- List view with filters: All / Pending / Submitted / Reviewed
- Each homework card: title, type, due date, points, status badge
- Tap to expand → upload photos (camera or gallery), write text response, submit
- After submission: see teacher feedback and points when reviewed
- Notification via Teams when homework is assigned

### Quick Drill (Flashcard Widget)
- Swipeable flashcard interface
- Front: question text
- Tap/flip: reveal answer + explanation
- Self-mark: "Got it" (mastered) or "Need practice"
- Progress bar: X/20 mastered
- Spaced repetition: unmastered questions appear more frequently

### Tests
- Upcoming tests: title, date, question count, duration, scope
- "Start Test" links to QB test system
- Past tests: score, date taken
- Week-over-week score progression chart

### Study Resources
- Organized by topic (topic-level resources always visible)
- Session-level resources shown under today's plan
- Link types distinguished by icon: video, practice, reference, tool

## Teams Integration

### When session is pushed to timetable:
1. Create `nexus_scheduled_class` with session details
2. Create Teams meeting via Graph API in the classroom's Teams channel
3. Store `teams_meeting_url` and `teams_meeting_id` on the scheduled class
4. Update session status to 'scheduled' and set `scheduled_class_id`

### When homework is assigned:
1. Post a message to the Teams channel: "New homework assigned: [title] — Due [date]. Submit in Nexus: [link]"
2. Uses existing Teams integration patterns from timetable module

## File Storage

Homework submissions (photos, drawings) stored in Supabase Storage:
- Bucket: `homework-submissions`
- Path: `{classroom_id}/{homework_id}/{student_id}/{filename}`
- Max file size: 10MB per file, 5 files per submission
- Accepted types: image/jpeg, image/png, image/webp, application/pdf

## Seed Data: NATA 2026 Crash Course

The NATA 2026 course plan from `apps/nexus/Docs/NATA_2026_COURSE_PLAN.md` will be seeded as the first course plan:

- **Plan:** NATA 2026 Crash Course, 5 weeks, Tue-Sun, AM (11-12) + PM (7-8)
- **Teaching team:** Sudarshini (AM), Sivaram (PM), Hari (flexible/drawing)
- **30 sessions per week slot** (60 total) — pre-populated from the markdown
- **Homework** per session as described in the plan
- **5 weekly tests** with question counts and durations
- **20 repeat drill questions** from the "Confirmed Repeat Questions" section
- **Study resources** from the "Study Material Links" section

Seed script: `packages/database/src/seeds/nata-2026-course-plan.ts`

## RLS Policies

| Table | Teachers | Students |
|-------|----------|----------|
| course_plans | CRUD for own classroom | Read active plans for enrolled classroom |
| plan_weeks | CRUD via plan ownership | Read |
| plan_sessions | CRUD via plan ownership | Read |
| plan_homework | CRUD via plan ownership | Read |
| homework_submissions | Read all for classroom, update (grade) | CRUD own submissions only |
| plan_tests | CRUD via plan ownership | Read |
| plan_resources | CRUD via plan ownership | Read |
| plan_drill | CRUD via plan ownership | Read |
| drill_progress | Read all for classroom | CRUD own progress only |

## Mobile-First Considerations

- **Today's Plan card:** Full-width, prominent on mobile, touch-friendly action buttons
- **Homework submission:** Camera integration for drawing photos, large upload target areas
- **Drill flashcards:** Full-screen swipeable cards, large text, easy flip gesture
- **Grading grid (teacher):** Horizontal scroll with sticky first column (student names)
- **Week tabs:** Swipeable horizontal tabs on mobile
- **All touch targets:** 48px minimum per Material 3 guidelines
- **Bottom sheet:** Used for session detail, homework detail on mobile instead of modals
