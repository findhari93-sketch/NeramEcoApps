# NATA Exam Schedule Dashboard — Design Spec

**Date:** 2026-04-05
**App:** Nexus (apps/nexus)
**Roles:** Student, Teacher

## Context

NATA exams run every Friday and Saturday during each phase. Currently, exam date data exists in `nexus_exam_dates` and individual student attempts in `nexus_student_exam_attempts`, but there is no consolidated view showing:

- Which students are writing on upcoming dates, grouped by city
- Which students haven't submitted their exam dates yet
- Who recently completed an exam (for recall follow-up)

Teachers need this visibility to coordinate preparation, send reminders, and trigger post-exam recall. Students benefit from seeing peers writing on the same dates and being nudged to submit their details.

This dashboard becomes the **exam coordination command center** — connecting the existing exam tracking pipeline to the exam recall system.

## Feature Overview

A new **Exam Schedule** page accessible to both students and teachers. Uses a **vertical timeline layout** showing upcoming exam dates with students grouped by city. Includes a "not submitted" alert section and a "recently completed" section linking to the existing exam recall flow.

## Pages & Routes

| Route | Role | Purpose |
|-------|------|---------|
| `/student/exam-schedule` | Student | View upcoming dates, peers, submit own date |
| `/teacher/exam-schedule` | Teacher | Same + full student lists, reminders, add dates |

Both routes render the same `ExamScheduleDashboard` component with role-aware behavior.

## Layout — Timeline View

### Page Structure (top to bottom)

1. **Header**: "NATA Exam Schedule" + Phase filter dropdown + Year filter
2. **Not Submitted Banner**: Alert card showing count of students who haven't submitted dates
   - Student: sees the banner if *they* haven't submitted; can tap to submit
   - Teacher: sees full list of non-submitters with individual "Send Reminder" and bulk "Remind All"
3. **Upcoming Exams Timeline**: Vertical list of date cards, nearest first
   - Each card: date, phase, attempt number, student count
   - Inside each card: students grouped by city, showing name + session (morning/afternoon)
   - Student: sees all peers in their classroom writing on each date; own entry highlighted
   - Teacher: sees all students; can click a student to view their full attempt details
4. **Recently Completed Section**: Students whose `exam_completed_at` is within the last 7 days
   - Grouped by completion date
   - Links to `/exam-recall/contribute` for recall nudge
   - Student: sees peers who completed + nudge to contribute if they completed too
   - Teacher: sees all recently completed students with recall status
5. **FAB (Student only)**: "Add My Exam Date" floating action button opens bottom sheet dialog

### Mobile (375px)
- Full-width vertical stack
- Date cards are stacked, city groups listed vertically inside each card
- FAB in bottom-right for students
- Not Submitted banner is collapsible (tap to expand list)

### Desktop (1280px)
- Two-column top section: Not Submitted (left, wider) + Recently Completed (right)
- Timeline cards below, full width
- City groups displayed as horizontal columns within each date card

## Database Changes

### Migration: Add columns to `nexus_student_exam_attempts`

```sql
ALTER TABLE nexus_student_exam_attempts
  ADD COLUMN IF NOT EXISTS exam_city TEXT,
  ADD COLUMN IF NOT EXISTS exam_session TEXT CHECK (exam_session IN ('morning', 'afternoon'));
```

No new tables needed — all data fits within the existing schema.

### Key Queries

**Upcoming exam dates with students:**
```sql
SELECT
  ed.id, ed.exam_date, ed.phase, ed.attempt_number, ed.label,
  sea.student_id, sea.exam_city, sea.exam_session, sea.state,
  u.first_name, u.last_name, u.name
FROM nexus_exam_dates ed
LEFT JOIN nexus_student_exam_attempts sea
  ON sea.exam_date_id = ed.id AND sea.classroom_id = $classroom_id
LEFT JOIN users u ON u.id = sea.student_id
WHERE ed.exam_type = 'nata'
  AND ed.year = $year
  AND ed.phase = $phase
  AND ed.is_active = true
  AND ed.exam_date >= CURRENT_DATE
ORDER BY ed.exam_date ASC;
```

**Students who haven't submitted dates:**
```sql
SELECT u.id, u.first_name, u.last_name, u.name
FROM nexus_enrollments ne
JOIN users u ON u.id = ne.user_id
WHERE ne.classroom_id = $classroom_id
  AND ne.role = 'student'
  AND ne.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM nexus_student_exam_attempts sea
    WHERE sea.student_id = ne.user_id
      AND sea.classroom_id = $classroom_id
      AND sea.exam_type = 'nata'
      AND sea.exam_date_id IS NOT NULL
  );
```

**Recently completed (last 7 days):**
```sql
SELECT sea.*, u.first_name, u.last_name, u.name, sea.exam_completed_at
FROM nexus_student_exam_attempts sea
JOIN users u ON u.id = sea.student_id
WHERE sea.classroom_id = $classroom_id
  AND sea.exam_type = 'nata'
  AND sea.state IN ('completed', 'scorecard_uploaded')
  AND sea.exam_completed_at >= NOW() - INTERVAL '7 days'
ORDER BY sea.exam_completed_at DESC;
```

## API Routes

### `GET /api/exam-schedule`

**Query params:** `classroom_id`, `exam_type=nata`, `year=2026`, `phase`

**Response:**
```typescript
{
  upcoming: Array<{
    exam_date: ExamDate;
    students_by_city: Record<string, Array<{
      student_id: string;
      name: string;
      session: 'morning' | 'afternoon' | null;
      state: string;
    }>>;
    total_students: number;
  }>;
  not_submitted: Array<{
    id: string;
    name: string;
  }>;
  recently_completed: Array<{
    student_id: string;
    name: string;
    exam_date: string;
    completed_at: string;
    city: string | null;
  }>;
}
```

### `POST /api/exam-schedule/my-date` (Student only)

**Body:**
```typescript
{
  exam_date_id: string;    // UUID from nexus_exam_dates
  exam_city: string;       // City name
  exam_session: 'morning' | 'afternoon';
}
```

Creates or updates the student's `nexus_student_exam_attempts` record for that date. Sets `state` to `'applied'` if currently `'planning'`.

### `POST /api/exam-schedule/remind` (Teacher only)

**Body:**
```typescript
{
  student_ids: string[];   // UUIDs to remind (or empty for all)
  classroom_id: string;
}
```

Creates a `nexus_exam_broadcasts` record of type `'registration_reminder'` and could trigger a notification (future enhancement).

## Components

| Component | File | Purpose |
|-----------|------|---------|
| `ExamScheduleDashboard` | `components/exam-schedule/ExamScheduleDashboard.tsx` | Main page component, fetches data, renders sections |
| `NotSubmittedBanner` | `components/exam-schedule/NotSubmittedBanner.tsx` | Alert with student list, remind buttons (teacher) |
| `ExamDateCard` | `components/exam-schedule/ExamDateCard.tsx` | Single date card with city-grouped students |
| `CityStudentGroup` | `components/exam-schedule/CityStudentGroup.tsx` | City header + student list within a date card |
| `RecentlyCompletedSection` | `components/exam-schedule/RecentlyCompletedSection.tsx` | Completed students grouped by date, recall link |
| `AddExamDateDialog` | `components/exam-schedule/AddExamDateDialog.tsx` | Bottom sheet for students to submit date/city/session |

## Navigation Changes

**Student sidebar** (`(student)/layout.tsx`):
- Add "Exam Schedule" under the "Manage" group, with a calendar icon
- Position after "Exams" and before "My Issues"

**Teacher sidebar** (`(teacher)/layout.tsx`):
- Add "Exam Schedule" under "Teaching Panel"
- Position after "Attendance" or "Leaderboard"

## Role-Based Behavior

| Feature | Student | Teacher |
|---------|---------|---------|
| View upcoming dates | All dates in their classroom | All dates in selected classroom |
| See students per date | All peers in classroom | All students in classroom |
| Own entry highlighted | Yes | N/A |
| "Not submitted" banner | Shown if they haven't submitted | Full list + remind buttons |
| Add/update exam date | Yes (for themselves) | No (students self-serve) |
| Send reminders | No | Yes (individual + bulk) |
| Recently completed | Peers + self | All students |
| Recall link | Shown if they completed | Always shown |
| Add exam dates | No | Yes (via existing ExamDateManager) |

## Verification Plan

1. **Database**: Run migration on staging, verify columns added to `nexus_student_exam_attempts`
2. **API**: Test `/api/exam-schedule` returns correct groupings with test data
3. **Student flow**: Navigate to exam schedule, see upcoming dates, tap FAB, submit date/city/session, verify it appears in the timeline
4. **Teacher flow**: Navigate to exam schedule, see all students, see not-submitted list, click "Send Reminder"
5. **Recently completed**: Mark a test attempt as completed, verify it appears in the section with recall link
6. **Mobile**: Test on 375px viewport — no horizontal overflow, FAB is reachable, cards are readable
7. **Empty states**: Test with no exam dates, no students registered, no recently completed
