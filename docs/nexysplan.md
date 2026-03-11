# CLAUDE.md — Nexus Classroom Management Platform

## Project Overview

Nexus (nexus.neramclasses.com) is the classroom management PWA for Neram Classes, a B.Arch entrance exam coaching institute (NATA & JEE Paper 2). It replaces fragmented Microsoft Teams + WhatsApp workflows with a single, structured learning platform.

**Core problem:** Students enroll throughout the NATA season (not in fixed batches). Each student joins at a different time, writes exams on different dates, and has different preparation timelines (15 days to 2 months). The platform must track per-student topic completion, manage staggered enrollment, and provide structured learning paths.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js (React) — part of Neram monorepo (Turborepo) |
| UI Library | Microsoft Fluent UI React (`@fluentui/react-components`) |
| Styling | Fluent Design System — NO Tailwind, NO MUI. Use Fluent tokens and `makeStyles()` |
| Database | Supabase (PostgreSQL + Auth + Storage + RLS + Edge Functions) |
| Auth (Students/Teachers) | Microsoft Entra ID via NextAuth.js |
| Auth (Parents) | Firebase phone OTP / Google sign-in |
| Video/Meetings | Microsoft Teams via Microsoft Graph API |
| File Storage | Microsoft OneDrive (drawings, documents) + Supabase Storage (app assets) |
| Study Materials | Microsoft OneNote (linked, not reproduced) |
| Monorepo | Turborepo — shared packages: `@neram/ui`, `@neram/db`, `@neram/auth` |
| Deployment | Vercel (web) + TWA for Google Play Store |
| Package Manager | pnpm |

---

## App Location in Monorepo

```
neram-ecosystem/
├── apps/
│   ├── web/              # neramclasses.com (marketing)
│   ├── tools/            # app.neramclasses.com (student tools)
│   ├── nexus/            # nexus.neramclasses.com (THIS PROJECT)
│   └── admin/            # admin.neramclasses.com (admin panel)
├── packages/
│   ├── ui/               # Shared Fluent UI components
│   ├── db/               # Supabase types & client
│   ├── auth/             # Auth utilities
│   └── config/           # Shared configs (ESLint, TSConfig)
└── turbo.json
```

---

## Design System Rules

### CRITICAL: Microsoft Fluent Design System ONLY

- Use `@fluentui/react-components` v9 for ALL UI components
- Use Fluent tokens for colors, spacing, typography — NOT custom CSS variables
- Use `makeStyles()` from `@griffel/react` (bundled with Fluent) for custom styling
- Mobile-first: 95% of users are on phones. Design for 360px-width first, scale up
- Touch targets: minimum 44x44px
- Bottom navigation: 5 tabs (Home, Timetable, Checklist, Drawings, More)
- NO Tailwind, NO MUI, NO shadcn/ui, NO styled-components

### Color Direction (mapped to Fluent tokens)

- Primary: Deep navy (`colorBrandBackground`) — #1B2A4A
- Interactive: Blue (`colorBrandForeground1`) — #2E75B6
- Accent/Achievement: Gold — #D4A843
- Status: Green (complete), Orange (pending), Red (missing/overdue)
- Use Fluent's built-in semantic color tokens wherever possible

### Typography

- Segoe UI (Fluent default) — do NOT override
- Use Fluent's `typographyStyles` (title, subtitle, body, caption)

### Component Patterns

```tsx
// CORRECT — Use Fluent components
import { Card, Button, Badge, ProgressBar, Avatar } from '@fluentui/react-components';
import { makeStyles, tokens } from '@fluentui/react-components';

const useStyles = makeStyles({
  container: {
    padding: tokens.spacingVerticalM,
    backgroundColor: tokens.colorNeutralBackground1,
  },
});

// WRONG — Never do this
import { Box, Typography } from '@mui/material'; // NO MUI
className="p-4 bg-white" // NO TAILWIND
```

---

## User Roles & Access Hierarchy

```
Admin (highest)
  ├── Full control of admin.neramclasses.com + Nexus
  ├── System configuration, role management, master checklist creation
  └── Can do everything a Teacher can

Teacher
  ├── Nexus only (no admin panel unless also an admin)
  ├── Create course plans, schedule classes, evaluate drawings
  ├── Approve checklist items, handle tickets, view all students
  └── Multiple teachers collaborate; NOT restricted by subject

Student
  ├── Attend classes, complete checklists, submit drawings
  ├── Upload documents, view own progress, raise tickets
  └── Prompted for exam profile during application window

Parent (lowest — read-only)
  ├── See child's progress, timetable (no join), drawing evaluations
  ├── Raise support tickets
  └── Linked to one or more students
```

### Auth Strategy

- Students & Teachers → Microsoft Entra ID (already in MS ecosystem)
- Parents → Phone OTP or Google sign-in (via Firebase Auth)
- Role stored in Supabase `user_profiles` table with RLS enforcement

---

## Database Schema (Supabase PostgreSQL)

### Core Tables

```sql
-- User profiles with role
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  entra_id TEXT UNIQUE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'teacher', 'student', 'parent')),
  phone TEXT,
  email TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Classrooms (multi-classroom architecture)
CREATE TABLE classrooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, -- 'NATA 2026', 'JEE Paper 2 2026', 'Revit Batch 1'
  type TEXT NOT NULL CHECK (type IN ('nata', 'jee', 'revit', 'other')),
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Classroom enrollments
CREATE TABLE enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES user_profiles(id),
  classroom_id UUID REFERENCES classrooms(id),
  role TEXT NOT NULL CHECK (role IN ('teacher', 'student')),
  enrolled_at TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN DEFAULT true,
  UNIQUE(user_id, classroom_id)
);

-- Parent-student linking
CREATE TABLE parent_student_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES user_profiles(id),
  student_id UUID REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(parent_id, student_id)
);

-- Student exam profile
CREATE TABLE exam_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES user_profiles(id),
  exam_type TEXT NOT NULL CHECK (exam_type IN ('nata_only', 'jee_only', 'both')),
  student_standard TEXT CHECK (student_standard IN ('10th', '11th', '12th', 'gap_year')),
  writing_year TEXT, -- '2026', '2027'
  nata_attempts INTEGER DEFAULT 0, -- 0-3
  nata_attempt_1_date DATE,
  nata_attempt_2_date DATE,
  nata_attempt_3_date DATE,
  jee_attempt_1_date DATE,
  jee_attempt_2_date DATE,
  application_receipt_url TEXT,
  hall_ticket_url TEXT,
  has_applied BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Course Planning & Timetable

```sql
-- Master topics (defined by admin in admin panel)
CREATE TABLE topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID REFERENCES classrooms(id),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT, -- 'mathematics', 'aptitude', 'drawing', 'architecture_awareness'
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Course plan (teacher maps topics to dates)
CREATE TABLE course_plan_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID REFERENCES classrooms(id),
  topic_id UUID REFERENCES topics(id),
  planned_date DATE NOT NULL,
  teacher_id UUID REFERENCES user_profiles(id),
  status TEXT DEFAULT 'planned' CHECK (status IN ('planned', 'completed', 'overrun', 'cancelled', 'rescheduled')),
  rescheduled_to DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Scheduled classes (weekly timetable entries)
CREATE TABLE scheduled_classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID REFERENCES classrooms(id),
  topic_id UUID REFERENCES topics(id),
  course_plan_entry_id UUID REFERENCES course_plan_entries(id),
  teacher_id UUID REFERENCES user_profiles(id),
  title TEXT NOT NULL,
  description TEXT,
  scheduled_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  teams_meeting_url TEXT,
  teams_meeting_id TEXT,
  recording_url TEXT,
  recording_duration_minutes INTEGER,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'completed', 'cancelled', 'rescheduled')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Attendance

```sql
-- Attendance records (pulled from Teams + manual)
CREATE TABLE attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_class_id UUID REFERENCES scheduled_classes(id),
  student_id UUID REFERENCES user_profiles(id),
  attended BOOLEAN DEFAULT false,
  joined_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  source TEXT DEFAULT 'teams' CHECK (source IN ('teams', 'manual')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(scheduled_class_id, student_id)
);

-- Student topic completion (derived from attendance + checklist)
CREATE TABLE student_topic_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES user_profiles(id),
  topic_id UUID REFERENCES topics(id),
  classroom_id UUID REFERENCES classrooms(id),
  status TEXT DEFAULT 'not_started' CHECK (status IN ('not_started', 'attended', 'completed', 'skipped')),
  completed_at TIMESTAMPTZ,
  UNIQUE(student_id, topic_id)
);
```

### Theory Checklist

```sql
-- Master checklist items (defined by admin/teacher)
CREATE TABLE checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID REFERENCES classrooms(id),
  topic_id UUID REFERENCES topics(id),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Checklist item resources (linked study materials)
CREATE TABLE checklist_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_item_id UUID REFERENCES checklist_items(id),
  title TEXT NOT NULL,
  resource_type TEXT CHECK (resource_type IN ('pdf', 'image', 'youtube', 'onenote', 'link')),
  url TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Per-student checklist completion
CREATE TABLE student_checklist_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES user_profiles(id),
  checklist_item_id UUID REFERENCES checklist_items(id),
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  UNIQUE(student_id, checklist_item_id)
);
```

### Drawing Learning Path

```sql
-- Drawing levels (Basic/Foundation → Intermediate → Final)
CREATE TABLE drawing_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID REFERENCES classrooms(id),
  title TEXT NOT NULL, -- 'Basic Foundation', 'Intermediate', 'Final'
  sort_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Drawing categories within each level
CREATE TABLE drawing_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level_id UUID REFERENCES drawing_levels(id),
  title TEXT NOT NULL, -- '2D Composition', '3D Object Sketching', 'Perspective Drawing'
  description TEXT,
  sort_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Individual drawing exercises
CREATE TABLE drawing_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES drawing_categories(id),
  title TEXT NOT NULL,
  description TEXT,
  instructions TEXT,
  dos_and_donts TEXT,
  reference_images JSONB DEFAULT '[]', -- [{url, caption}]
  demo_video_url TEXT,
  sort_order INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Student drawing submissions
CREATE TABLE drawing_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id UUID REFERENCES drawing_exercises(id),
  student_id UUID REFERENCES user_profiles(id),
  submission_url TEXT NOT NULL, -- OneDrive URL
  correction_url TEXT, -- Teacher's corrected version URL
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'redo', 'graded')),
  grade TEXT, -- Optional grade/mark
  teacher_notes TEXT,
  evaluated_by UUID REFERENCES user_profiles(id),
  evaluated_at TIMESTAMPTZ,
  attempt_number INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Drawing class summaries (after each live drawing class)
CREATE TABLE drawing_class_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_class_id UUID REFERENCES scheduled_classes(id),
  summary_images JSONB DEFAULT '[]', -- [{url, caption}]
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Post-class drawing assignments
CREATE TABLE drawing_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_class_id UUID REFERENCES scheduled_classes(id),
  exercise_id UUID REFERENCES drawing_exercises(id),
  assigned_at TIMESTAMPTZ DEFAULT now(),
  due_date TIMESTAMPTZ
);

-- Assignment submission tracking
CREATE TABLE drawing_assignment_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID REFERENCES drawing_assignments(id),
  student_id UUID REFERENCES user_profiles(id),
  submission_id UUID REFERENCES drawing_submissions(id),
  submitted_at TIMESTAMPTZ,
  non_submission_reason TEXT, -- If student didn't submit, why
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'not_submitted', 'excused')),
  UNIQUE(assignment_id, student_id)
);
```

### Question Bank

```sql
-- Raw question submissions from students (post-exam)
CREATE TABLE question_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES user_profiles(id),
  classroom_id UUID REFERENCES classrooms(id),
  exam_date DATE NOT NULL,
  exam_type TEXT CHECK (exam_type IN ('nata', 'jee')),
  question_text TEXT NOT NULL,
  question_type TEXT CHECK (question_type IN ('mcq', 'multi_select', 'numerical', 'drawing')),
  options JSONB, -- For MCQ: [{text, is_correct}]
  image_url TEXT,
  submitted_at TIMESTAMPTZ DEFAULT now()
);

-- Unified/verified questions (teacher-curated)
CREATE TABLE verified_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID REFERENCES classrooms(id),
  question_text TEXT NOT NULL,
  question_type TEXT CHECK (question_type IN ('mcq', 'multi_select', 'numerical', 'drawing')),
  options JSONB,
  correct_answer TEXT,
  explanation TEXT,
  image_url TEXT,
  topic_tags JSONB DEFAULT '[]',
  difficulty TEXT CHECK (difficulty IN ('easy', 'medium', 'hard')),
  source_exam_dates JSONB DEFAULT '[]', -- Dates this question appeared
  linked_submissions JSONB DEFAULT '[]', -- IDs of raw submissions that contributed
  verified_by UUID REFERENCES user_profiles(id),
  verified_at TIMESTAMPTZ,
  visibility TEXT DEFAULT 'nexus_only' CHECK (visibility IN ('nexus_only', 'public')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Test/Exam Engine

```sql
-- Tests created by teachers
CREATE TABLE tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID REFERENCES classrooms(id),
  title TEXT NOT NULL,
  description TEXT,
  test_type TEXT NOT NULL CHECK (test_type IN ('untimed', 'timed', 'per_question_timer', 'drawing', 'model_test')),
  created_by UUID REFERENCES user_profiles(id),
  -- Timed test config
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  per_question_seconds INTEGER, -- For per_question_timer type
  total_marks INTEGER,
  is_published BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Test questions (linked to verified questions or custom)
CREATE TABLE test_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID REFERENCES tests(id),
  verified_question_id UUID REFERENCES verified_questions(id),
  custom_question_text TEXT, -- If not from verified bank
  custom_options JSONB,
  custom_image_url TEXT,
  marks INTEGER DEFAULT 1,
  sort_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Student test attempts
CREATE TABLE test_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID REFERENCES tests(id),
  student_id UUID REFERENCES user_profiles(id),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  total_score INTEGER,
  max_score INTEGER,
  answers JSONB, -- [{question_id, answer, is_correct, marks_awarded}]
  status TEXT DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Support Tickets

```sql
CREATE TABLE tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID REFERENCES user_profiles(id),
  classroom_id UUID REFERENCES classrooms(id),
  category TEXT, -- 'technical', 'material_access', 'onboarding', 'scheduling', 'general'
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  screenshots JSONB DEFAULT '[]', -- [{url, caption}]
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'assigned', 'in_progress', 'resolved', 'closed')),
  assigned_to UUID REFERENCES user_profiles(id),
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Ticket audit trail
CREATE TABLE ticket_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES tickets(id),
  actor_id UUID REFERENCES user_profiles(id),
  event_type TEXT NOT NULL, -- 'created', 'assigned', 'transferred', 'status_changed', 'commented', 'resolved'
  from_value TEXT,
  to_value TEXT,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Student Documents

```sql
CREATE TABLE student_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES user_profiles(id),
  document_type TEXT NOT NULL, -- 'aadhaar', 'passport_photo', '10th_marksheet', '12th_marksheet', 'nata_scorecard', 'jee_scorecard', 'hall_ticket', 'application_form'
  file_url TEXT NOT NULL,
  file_name TEXT,
  status TEXT DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'approved', 'rejected', 'not_yet_available')),
  reviewed_by UUID REFERENCES user_profiles(id),
  reviewed_at TIMESTAMPTZ,
  available_after DATE, -- For time-dependent docs (12th marksheet, scorecards)
  notes TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT now()
);
```

### Resource Library

```sql
CREATE TABLE resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID REFERENCES classrooms(id),
  title TEXT NOT NULL,
  description TEXT,
  resource_type TEXT CHECK (resource_type IN ('youtube', 'pdf', 'image', 'onenote', 'link')),
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  topic_tags JSONB DEFAULT '[]',
  category TEXT,
  uploaded_by UUID REFERENCES user_profiles(id),
  is_library_item BOOLEAN DEFAULT false, -- true = curated library, false = quick share
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### External Review Tracking

```sql
CREATE TABLE review_platforms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, -- 'Google Business', 'Justdial'
  url TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE student_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES user_profiles(id),
  platform_id UUID REFERENCES review_platforms(id),
  screenshot_url TEXT,
  verified BOOLEAN DEFAULT false,
  verified_by UUID REFERENCES user_profiles(id),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## Row Level Security (RLS) Patterns

ALL tables must have RLS enabled. Key patterns:

```sql
-- Students see only their own data
CREATE POLICY "students_own_data" ON student_checklist_progress
  FOR ALL USING (student_id = auth.uid());

-- Teachers see all students in their classrooms
CREATE POLICY "teachers_classroom_data" ON student_checklist_progress
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM enrollments
      WHERE enrollments.user_id = auth.uid()
      AND enrollments.classroom_id = (
        SELECT classroom_id FROM checklist_items WHERE id = checklist_item_id
      )
      AND enrollments.role = 'teacher'
    )
  );

-- Parents see only linked student's data
CREATE POLICY "parents_linked_students" ON student_checklist_progress
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM parent_student_links
      WHERE parent_student_links.parent_id = auth.uid()
      AND parent_student_links.student_id = student_checklist_progress.student_id
    )
  );

-- Admins see everything
CREATE POLICY "admin_all_access" ON student_checklist_progress
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
```

---

## Content Protection Implementation

### Android (PWA/TWA)
```kotlin
// In TWA launcher activity
window.setFlags(
  WindowManager.LayoutParams.FLAG_SECURE,
  WindowManager.LayoutParams.FLAG_SECURE
)
```

### Web (Best Effort)
```css
/* Prevent text selection on content areas */
.protected-content {
  user-select: none;
  -webkit-user-select: none;
}

/* Hide content during print */
@media print {
  .protected-content { display: none; }
  body::after { content: "Printing is not allowed"; }
}
```

```typescript
// Disable right-click on content areas
document.addEventListener('contextmenu', (e) => e.preventDefault());
// Disable keyboard shortcuts for screenshots
document.addEventListener('keydown', (e) => {
  if (e.key === 'PrintScreen') e.preventDefault();
});
```

### Auth Gating
- ALL content routes require valid Entra ID session
- Supabase RLS enforces enrollment-based access
- Shared links redirect to login if unauthenticated

---

## Microsoft Graph API Integration Points

### Teams Meetings
```typescript
// Create scheduled meeting
POST /me/onlineMeetings
{
  subject: "NATA Drawing Class - Perspective",
  startDateTime: "2026-03-15T10:00:00",
  endDateTime: "2026-03-15T11:30:00"
}
// Response includes joinWebUrl → stored in scheduled_classes.teams_meeting_url
```

### Teams Attendance
```typescript
// Get attendance report after meeting
GET /me/onlineMeetings/{meetingId}/attendanceReports
// Returns: attendees with join/leave times → stored in attendance table
```

### OneDrive Storage
```typescript
// Upload drawing submission
PUT /me/drive/root:/NexusUploads/{studentId}/{exerciseId}/{filename}:/content
// Returns: download URL → stored in drawing_submissions.submission_url
```

### OneNote Access
```typescript
// Share notebook with enrolled student
POST /groups/{groupId}/onenote/notebooks/{notebookId}/sectionGroups
// Auto-triggered on enrollment
```

---

## Folder Structure (nexus app)

```
apps/nexus/
├── public/
│   ├── manifest.json          # PWA manifest
│   ├── sw.js                  # Service worker
│   └── icons/
├── src/
│   ├── app/                   # Next.js App Router
│   │   ├── layout.tsx         # Root layout with Fluent provider
│   │   ├── page.tsx           # Landing/login redirect
│   │   ├── (auth)/
│   │   │   ├── login/
│   │   │   └── callback/
│   │   ├── (student)/
│   │   │   ├── home/          # Student dashboard
│   │   │   ├── timetable/     # Weekly schedule
│   │   │   ├── checklist/     # Theory checklist
│   │   │   ├── drawings/      # Drawing learning path
│   │   │   ├── questions/     # Question bank
│   │   │   ├── library/       # Resource library
│   │   │   ├── exams/         # Test/exam taking
│   │   │   ├── progress/      # Progress dashboard
│   │   │   ├── documents/     # Document uploads
│   │   │   ├── tickets/       # Support tickets
│   │   │   └── profile/       # Exam profile & settings
│   │   ├── (teacher)/
│   │   │   ├── dashboard/     # Teacher command center
│   │   │   ├── evaluate/      # Drawing evaluation with sketchpad
│   │   │   ├── planner/       # Course planner
│   │   │   ├── timetable/     # Timetable management
│   │   │   ├── students/      # Student overview & progress
│   │   │   ├── attendance/    # Attendance dashboard
│   │   │   ├── questions/     # Question unification
│   │   │   ├── tests/         # Test creation & management
│   │   │   └── tickets/       # Ticket handling
│   │   └── (parent)/
│   │       ├── dashboard/     # Parent overview
│   │       ├── timetable/     # View-only timetable
│   │       └── tickets/       # Parent tickets
│   ├── components/
│   │   ├── layout/
│   │   │   ├── BottomNav.tsx
│   │   │   ├── TopBar.tsx
│   │   │   ├── Sidebar.tsx    # Laptop only
│   │   │   └── RoleGuard.tsx
│   │   ├── timetable/
│   │   │   ├── WeekView.tsx
│   │   │   ├── ClassCard.tsx
│   │   │   └── JoinButton.tsx
│   │   ├── checklist/
│   │   │   ├── ChecklistGroup.tsx
│   │   │   ├── ChecklistItem.tsx
│   │   │   └── ProgressHeader.tsx
│   │   ├── drawings/
│   │   │   ├── LevelPath.tsx
│   │   │   ├── ExerciseCard.tsx
│   │   │   ├── SubmissionUpload.tsx
│   │   │   ├── SketchpadOverlay.tsx  # Teacher correction tool
│   │   │   └── CorrectionView.tsx    # Side-by-side original + corrected
│   │   ├── questions/
│   │   │   ├── QuestionCard.tsx
│   │   │   ├── SubmitQuestionForm.tsx
│   │   │   └── UnifyQuestions.tsx     # Teacher deduplication tool
│   │   ├── tests/
│   │   │   ├── TestConfig.tsx
│   │   │   ├── TestTaker.tsx
│   │   │   ├── QuestionRenderer.tsx
│   │   │   └── TimerDisplay.tsx
│   │   ├── tickets/
│   │   │   ├── TicketCard.tsx
│   │   │   ├── CreateTicket.tsx
│   │   │   └── TicketTimeline.tsx
│   │   ├── progress/
│   │   │   ├── ProgressRing.tsx
│   │   │   ├── StudentProgressCard.tsx
│   │   │   └── ClassOverview.tsx
│   │   └── shared/
│   │       ├── FileUpload.tsx
│   │       ├── ImageViewer.tsx
│   │       ├── StatusBadge.tsx
│   │       ├── EmptyState.tsx
│   │       └── ProtectedContent.tsx  # Content protection wrapper
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useClassroom.ts
│   │   ├── useAttendance.ts
│   │   ├── useProgress.ts
│   │   ├── useTeamsIntegration.ts
│   │   └── useOneDrive.ts
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts
│   │   │   ├── server.ts
│   │   │   └── middleware.ts
│   │   ├── microsoft/
│   │   │   ├── graph.ts       # Microsoft Graph API client
│   │   │   ├── teams.ts       # Teams meeting helpers
│   │   │   ├── onedrive.ts    # OneDrive upload/download
│   │   │   └── onenote.ts     # OneNote access management
│   │   └── utils/
│   │       ├── content-protection.ts
│   │       └── date-helpers.ts
│   └── types/
│       ├── database.ts        # Generated from Supabase
│       ├── microsoft.ts
│       └── app.ts
├── next.config.js
├── package.json
└── tsconfig.json
```

---

## Phase 1 Execution Plan (Weeks 1-4)

### Week 1: Project Setup & Auth
- [ ] Initialize Next.js app in monorepo at `apps/nexus/`
- [ ] Install and configure `@fluentui/react-components` v9
- [ ] Set up Fluent theme provider with Neram brand tokens
- [ ] Configure Microsoft Entra ID auth with NextAuth.js
- [ ] Create Supabase tables: `user_profiles`, `classrooms`, `enrollments`
- [ ] Set up RLS policies for role-based access
- [ ] Build login page and auth callback
- [ ] Build RoleGuard component for route protection
- [ ] Create bottom navigation (Home, Timetable, Checklist, Drawings, More)
- [ ] PWA manifest and service worker setup

### Week 2: Student Onboarding & Timetable
- [ ] Build student onboarding flow (exam type, standard, year)
- [ ] Create exam profile page with NATA attempt configuration
- [ ] Build file upload component (for receipts, hall tickets)
- [ ] Create `scheduled_classes` table and timetable APIs
- [ ] Build WeekView timetable component (mobile list + laptop grid)
- [ ] Build ClassCard with status badges and Join button
- [ ] Integrate Teams meeting creation via Graph API
- [ ] Build daily exam application prompt (skippable, persistent)

### Week 3: Course Planner & Basic Classes
- [ ] Create `topics`, `course_plan_entries` tables
- [ ] Build teacher course planner (drag topics to dates)
- [ ] Build class scheduling flow (link to course plan)
- [ ] Implement reschedule/cancel with timetable reflection
- [ ] Build Teams recording URL auto-fetch after class completion
- [ ] Attach recordings to completed class entries
- [ ] Build teacher dashboard shell

### Week 4: Content Protection & Polish
- [ ] Implement FLAG_SECURE for TWA wrapper
- [ ] Add web-level screenshot prevention (CSS + JS)
- [ ] Auth-gate all content routes
- [ ] Build parent auth flow (phone OTP)
- [ ] Build parent timetable view (read-only)
- [ ] End-to-end testing of auth → onboarding → timetable → join class flow
- [ ] Responsive testing (360px mobile, 1024px laptop)
- [ ] Deploy to Vercel staging

---

## Phase 2 Execution Plan (Weeks 5-8)

### Week 5: Attendance & Checklist
- [ ] Build Teams attendance report fetcher (Graph API)
- [ ] Create attendance table and auto-populate after each class
- [ ] Build attendance dashboard (good/poor/non-attendee view)
- [ ] Create checklist tables and APIs
- [ ] Build ChecklistGroup and ChecklistItem components
- [ ] Build ProgressHeader with completion bar

### Week 6: Drawing Learning Path
- [ ] Create drawing tables (levels, categories, exercises, submissions)
- [ ] Build LevelPath visualization (vertical timeline)
- [ ] Build ExerciseCard (unlocked/locked states)
- [ ] Build SubmissionUpload with OneDrive integration
- [ ] Build SketchpadOverlay for teacher corrections (canvas-based)
- [ ] Build CorrectionView (side-by-side original + corrected)
- [ ] Implement sequential unlock logic

### Week 7: Teacher Tools
- [ ] Build teacher task queue (pending evaluations, approvals)
- [ ] Build drawing evaluation flow (queue → review → approve/redo/grade)
- [ ] Build student overview page (all students, filterable)
- [ ] Build individual student detail page (tabs: checklist, drawings, attendance)
- [ ] Build drawing assignment tracking (submitted/not-submitted counts)
- [ ] Build student-facing pending exercise alerts

### Week 8: Progress Dashboard
- [ ] Build student progress dashboard (rings, charts, countdown)
- [ ] Build teacher class overview (aggregate progress)
- [ ] Build parent dashboard (read-only child progress)
- [ ] Topic-level gap analysis per student
- [ ] Connect all progress data sources

---

## Phase 3 Execution Plan (Weeks 9-12)

### Week 9: Tickets & Documents
- [ ] Create ticket tables with audit trail
- [ ] Build CreateTicket form (categories, screenshots)
- [ ] Build TicketTimeline component (full lifecycle view)
- [ ] Build ticket assignment and transfer flow (admin)
- [ ] Create student documents table
- [ ] Build document upload page with time-aware availability
- [ ] Build admin document review dashboard

### Week 10: Question Bank & Tests
- [ ] Create question tables (raw submissions, verified)
- [ ] Build post-exam question submission prompt
- [ ] Build question deduplication/linking interface (teacher)
- [ ] Build question unification workflow
- [ ] Create test engine tables
- [ ] Build TestConfig (select type: untimed/timed/per-question/drawing/model)
- [ ] Build TestTaker with timer and question navigation

### Week 11: Resource Library & OneNote
- [ ] Build resource library (searchable, filterable, categorized)
- [ ] YouTube embed player (in-app, protected)
- [ ] PDF viewer (in-app, no download)
- [ ] OneNote notebook auto-provisioning on enrollment
- [ ] OneNote link integration in resource zone

### Week 12: Reviews, Revit & Polish
- [ ] Build external review collection flow
- [ ] Build review completion tracker
- [ ] Set up multi-classroom architecture
- [ ] Build Revit classroom with self-learning mode
- [ ] Build Revit onboarding (software installation check)
- [ ] Build video lesson player with transcripts
- [ ] Final responsive testing and accessibility audit
- [ ] Play Store TWA build and submission

---

## Code Style & Conventions

- **TypeScript** for all files (strict mode)
- **Fluent UI v9** for all components — no exceptions
- **Server Components** by default, `'use client'` only when needed
- **Supabase client** via `@supabase/ssr` for server/client split
- **File naming**: kebab-case for files, PascalCase for components
- **API routes**: `/api/[resource]/route.ts` pattern
- **No any types** — define proper interfaces in `types/`
- **Error boundaries** on every route group
- **Loading states** using Fluent Spinner/Skeleton components
- **Empty states** for all lists/views when no data

---

## Key Decisions Log

| Decision | Choice | Reason |
|---|---|---|
| UI Framework | Fluent UI v9 | Users already in MS ecosystem; feels native |
| Storage for drawings | OneDrive | Seamless with MS ecosystem; handles scale |
| Auth for parents | Firebase phone OTP | Parents unlikely to have MS accounts |
| Video platform | Keep Teams | Already in use; Graph API for integration |
| Study materials | OneNote integration | Teachers already create content there |
| PWA vs native | PWA + TWA | One codebase, Play Store presence, web access |
| Screenshot protection | FLAG_SECURE + CSS | Hardware-level on Android; best-effort on web |
| Question deduplication | Manual by teachers + AI assist | Full auto too risky; teacher verification essential |

---

## Important Context

- NATA exam: runs every Friday/Saturday across 4-5 months, up to 3 attempts per student
- JEE Paper 2: exactly 2 attempts/year (January + March/April), single nationwide date each
- 95% of users are on mobile phones — every design decision prioritizes mobile
- Students are 10th/11th/12th standard + rare gap year — mostly teenagers
- Parents are decision-makers and payers — their visibility builds trust
- Drawing skills are strictly sequential — no skipping ahead
- NATA doesn't release question papers — crowd-sourced bank is a massive competitive advantage
- The existing Microsoft 365 Education plan with neramclasses.com domain is the foundation
- Content protection is critical — all materials are proprietary
