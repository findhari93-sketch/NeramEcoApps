# Neram Nexus Gamification & Leaderboard Module -- Test Cases

> **Module:** Student Rewards, Badges, Leaderboards & Achievement Profiles
> **App:** Nexus PWA (nexus.neramclasses.com)
> **Version:** 1.0
> **Created:** 2026-03-27
> **Author:** QA Team
> **Spec Reference:** `apps/nexus/Docs/NEXUS-GAMIFICATION-LEADERBOARD-SPEC.md`
> **Total Test Cases:** 84

---

## Test Environment

| Item | Value |
|------|-------|
| **Staging URL** | https://staging-nexus.neramclasses.com |
| **Production URL** | https://nexus.neramclasses.com |
| **Auth** | Microsoft Entra ID (teacher accounts, student accounts) |
| **Database** | Supabase (staging ref: `hgxjavrsrvpihqrpezdh`, prod ref: `zdnypksjqnhtiblwdaic`) |
| **Mobile Viewports** | 375px (iPhone SE), 480px, 768px (tablet) |
| **Desktop Viewports** | 1024px, 1280px, 1440px |
| **Browsers** | Chrome (Android PWA primary), Safari (iOS), Edge (desktop) |

### Test Accounts Required

| Role | Account Description | Notes |
|------|--------------------|-------|
| Teacher | Microsoft Entra ID teacher account | `user_type = 'teacher'` in users table |
| Student A | Enrolled student with activity history | Has attendance, checklists, badges |
| Student B | Enrolled student with minimal activity | New student, few points |
| Student C | Enrolled student in a different batch | For cross-batch testing |
| Admin | Microsoft Entra ID admin account | `user_type = 'admin'` |
| Unauthenticated | No auth token | For security tests |

### Key API Endpoints Under Test

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/gamification/leaderboard` | GET | Leaderboard data (weekly/monthly/alltime) |
| `/api/gamification/points/award` | POST | Teacher manual point award |
| `/api/gamification/badges/catalog` | GET | Badge definitions + earned status |
| `/api/gamification/badges/my` | GET | Current user's earned badges |
| `/api/gamification/badges/feed` | GET | Recent classroom badge activity |
| `/api/gamification/profile/{studentId}` | GET | Student achievement profile |
| `/api/gamification/profile/me` | GET | Current user's own profile |
| `/api/gamification/dashboard` | GET | Dashboard widget data (top 3, rank, feed) |
| `/api/gamification/notifications/unread` | GET | Unnotified badge awards |
| `/api/gamification/notifications/mark-read` | POST | Mark badge notifications as read |

---

## Execution Legend

| Status | Meaning |
|--------|---------|
| **Not Run** | Test has not been executed yet |
| **Pass** | Test executed and all expected results confirmed |
| **Fail** | Test executed and one or more expected results not met |
| **Blocked** | Cannot run due to dependency or environment issue |
| **Skipped** | Intentionally skipped (document reason) |

---

## 1. Smoke Tests (P0)

These tests verify the most critical paths are operational. Run these first after every deployment.

---

### TC-GAM-001: Attendance marks trigger point recording
**Priority:** P0
**Type:** Smoke
**Preconditions:** Teacher logged in via Microsoft Entra ID. Student A enrolled in a classroom with scheduled classes today.
**Steps:**
1. Teacher navigates to the attendance page for today's class.
2. Teacher marks Student A as "present" and saves.
3. Query `gamification_point_events` table for Student A with `event_type = 'class_attended'` and `event_date = today`.
**Expected Result:** A `gamification_point_events` row exists with `points = 10`, `event_type = 'class_attended'`, and correct `student_id`, `classroom_id`, and `batch_id`. The student's streak is also updated via `update_student_streak()`.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-002: Leaderboard page loads successfully
**Priority:** P0
**Type:** Smoke
**Preconditions:** User (teacher or student) logged in. At least one classroom exists with enrolled students.
**Steps:**
1. Navigate to the leaderboard page (`/student/leaderboard` or `/teacher/leaderboard`).
2. Observe page load behavior.
**Expected Result:** Page loads within 3 seconds. Tab bar shows "Weekly", "Monthly", "All-Time" options. A batch/classroom filter is visible. If data exists, leaderboard rows render. If no data, an appropriate empty state message displays ("No activity this week yet"). No console errors.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-003: Badge catalog page loads successfully
**Priority:** P0
**Type:** Smoke
**Preconditions:** User logged in. Badge definitions seeded in `gamification_badge_definitions` table.
**Steps:**
1. Call `GET /api/gamification/badges/catalog`.
2. Verify the response structure.
**Expected Result:** Response contains `catalog` (array of all badge definitions) and `grouped` (object with keys: `attendance`, `checklist`, `growth`, `leaderboard`). Each badge has `id`, `display_name`, `description`, `criteria_description`, `category`, `rarity_tier`, `icon_svg_path`, `icon_locked_svg_path`, `is_active`, and an `earned` boolean flag. HTTP status 200.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-004: Dashboard gamification widget loads
**Priority:** P0
**Type:** Smoke
**Preconditions:** User logged in. At least one classroom_id available.
**Steps:**
1. Call `GET /api/gamification/dashboard?classroom_id={valid_id}`.
2. Verify response.
**Expected Result:** Response contains `top_performers` (array, up to 3 entries), `badge_feed` (array of recent badge awards), and `my_rank` (object with current user's rank or null). HTTP status 200.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-005: Manual teacher point award round-trip
**Priority:** P0
**Type:** Smoke
**Preconditions:** Teacher logged in. Student A enrolled in a classroom.
**Steps:**
1. Teacher calls `POST /api/gamification/points/award` with body: `{ "student_id": "<Student A ID>", "classroom_id": "<valid>", "points": 5, "reason": "Helped classmate" }`.
2. Verify response.
3. Query `gamification_point_events` for the new row.
**Expected Result:** Response: `{ "success": true, "points_awarded": 5 }`. A new row in `gamification_point_events` with `event_type = 'manual_teacher_award'`, `points = 5`, metadata containing the reason and `awarded_by` teacher ID. Student's activity log updated.
**Actual Result:**
**Status:** Not Run

---

## 2. Scoring Engine (P0/P1)

Tests covering the point system, normalization, idempotency, and caps.

---

### TC-GAM-006: Class attendance awards 10 points
**Priority:** P0
**Type:** Functional
**Preconditions:** Student A enrolled in a classroom. No attendance recorded today.
**Steps:**
1. Record attendance for Student A (mark present) via the attendance module.
2. Query `gamification_point_events` for `student_id = Student A` and `event_type = 'class_attended'` and `event_date = today`.
**Expected Result:** Exactly one row with `points = 10`. The `source_id` is unique and tied to the specific attendance record. The `batch_id` and `classroom_id` match the student's enrollment.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-007: Checklist item completion awards 5 points
**Priority:** P0
**Type:** Functional
**Preconditions:** Student A has a checklist assigned with at least 3 uncompleted items.
**Steps:**
1. Student A completes one checklist item via the checklist module.
2. Query `gamification_point_events` for `event_type = 'checklist_item_completed'`.
**Expected Result:** One new row with `points = 5`. Metadata contains the `checklist_id` and `item_id` of the completed item.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-008: Full checklist completion awards 15 bonus points
**Priority:** P0
**Type:** Functional
**Preconditions:** Student A has a checklist with 3 items. 2 items already completed.
**Steps:**
1. Student A completes the final (3rd) checklist item.
2. Query `gamification_point_events` for events from this action.
**Expected Result:** Two new rows created: (1) `checklist_item_completed` with `points = 5` for the individual item, and (2) `full_checklist_completed` with `points = 15` as the bonus. Total = 20 points from this action (5 + 15).
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-009: Drawing submission awards 20 points
**Priority:** P1
**Type:** Functional
**Preconditions:** Student A has a drawing assignment available.
**Steps:**
1. Student A submits a drawing assignment.
2. Query `gamification_point_events` for `event_type = 'drawing_submitted'`.
**Expected Result:** One new row with `points = 20`. Metadata references the assignment ID.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-010: Drawing reviewed awards 5 bonus points
**Priority:** P1
**Type:** Functional
**Preconditions:** Student A has submitted a drawing that has not yet been reviewed.
**Steps:**
1. Teacher reviews Student A's drawing submission (provides feedback/grade).
2. Query `gamification_point_events` for `event_type = 'drawing_reviewed'`.
**Expected Result:** One new row with `points = 5`. Metadata includes the teacher ID who reviewed and the assignment ID.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-011: Streak day awards 3 points
**Priority:** P1
**Type:** Functional
**Preconditions:** Student A has an active streak of at least 1 day (`last_active_date = yesterday`).
**Steps:**
1. Student A performs an activity today (e.g., attends class).
2. Query `gamification_point_events` for `event_type = 'streak_day'` and `event_date = today`.
**Expected Result:** One new row with `points = 3` for maintaining the streak. The `student_streaks` table shows `current_streak` incremented by 1.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-012: Streak milestone at 7 days awards 25 bonus points
**Priority:** P1
**Type:** Functional
**Preconditions:** Student A has `current_streak = 6` and `last_active_date = yesterday`.
**Steps:**
1. Student A performs an activity today, pushing streak to 7.
2. Query `gamification_point_events` for `event_type = 'streak_milestone'`.
**Expected Result:** A `streak_milestone` row with `points = 25` and metadata `{ "milestone": 7 }`. This is a one-time bonus -- if the streak continues past 7, this bonus is not repeated.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-013: Streak milestone at 30 days awards 100 bonus points
**Priority:** P1
**Type:** Functional
**Preconditions:** Student A has `current_streak = 29` and `last_active_date = yesterday`.
**Steps:**
1. Student A performs an activity today, pushing streak to 30.
2. Query `gamification_point_events` for `event_type = 'streak_milestone'` with metadata containing `"milestone": 30`.
**Expected Result:** A `streak_milestone` row with `points = 100`. This is additive with the daily streak_day 3 points.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-014: Streak milestone at 90 days awards 300 bonus points
**Priority:** P1
**Type:** Functional
**Preconditions:** Student A has `current_streak = 89` and `last_active_date = yesterday`.
**Steps:**
1. Student A performs an activity today, pushing streak to 90.
2. Query for `streak_milestone` event.
**Expected Result:** A `streak_milestone` row with `points = 300` and metadata `{ "milestone": 90 }`.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-015: Manual teacher award per-award cap (1-20 points)
**Priority:** P0
**Type:** Functional
**Preconditions:** Teacher logged in. Student A enrolled.
**Steps:**
1. Call `POST /api/gamification/points/award` with `points: 0`.
2. Call again with `points: 21`.
3. Call again with `points: -5`.
4. Call again with `points: 20` (valid maximum).
5. Call again with `points: 1` (valid minimum).
**Expected Result:** Steps 1-3 return HTTP 400 with error "Points must be between 1 and 20 per award". Steps 4 and 5 return HTTP 200 with success.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-016: Manual award weekly cap (50 points maximum)
**Priority:** P0
**Type:** Functional
**Preconditions:** Teacher logged in. Student A has 0 manual points awarded this week (Monday to Sunday).
**Steps:**
1. Award 20 points to Student A. (Total: 20/50)
2. Award 20 points again. (Total: 40/50)
3. Award 15 points. Should fail because 40+15 = 55 > 50.
4. Award 10 points. (Total: 50/50) Should succeed.
5. Award 1 more point. Should fail because 50+1 = 51 > 50.
**Expected Result:** Steps 1, 2, and 4 succeed. Steps 3 and 5 return HTTP 400 with error containing "Weekly manual points cap reached. Used X/50 this week."
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-017: Point idempotency -- same source_id does not double-count
**Priority:** P0
**Type:** Functional
**Preconditions:** Student A attended a class and has a point event with a specific `source_id`.
**Steps:**
1. Note the existing `source_id` from the attendance point event.
2. Attempt to insert another `gamification_point_events` row with the same `source_id`.
3. Query for all rows matching that `source_id`.
**Expected Result:** The duplicate insert is rejected (if UNIQUE constraint on source_id exists) or handled gracefully by the application logic. Only one point event row exists for that `source_id`. The student's total score does not increase from the duplicate attempt.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-018: Cross-batch normalization formula
**Priority:** P1
**Type:** Functional
**Preconditions:** Two batches exist. Batch A has 5 classes/week (max possible = 50 attendance pts + checklists). Batch B has 3 classes/week (max possible = 30 attendance pts + checklists). Student in each batch has different raw scores.
**Steps:**
1. Student X in Batch A earns 80 raw points out of 100 max possible.
2. Student Y in Batch B earns 55 raw points out of 70 max possible.
3. Query leaderboard with `scope = 'all_neram'`.
4. Verify normalized scores: Student X = (80/100) x 1000 = 800.00. Student Y = (55/70) x 1000 = 785.71.
**Expected Result:** In the "All Neram" cross-batch view, Student X ranks above Student Y because 800 > 785.71. Within-batch views still use raw scores.
**Actual Result:**
**Status:** Not Run

---

## 3. Streak System (P0/P1)

Tests covering streak creation, extension, reset, milestones, and edge cases.

---

### TC-GAM-019: First activity creates streak of 1
**Priority:** P0
**Type:** Functional
**Preconditions:** Student B has never performed any gamification activity. No row in `student_streaks` table for this student.
**Steps:**
1. Student B attends their first class (or completes any tracked activity).
2. Query `student_streaks` for Student B.
**Expected Result:** A new row is inserted: `current_streak = 1`, `longest_streak = 1`, `last_active_date = today`, `streak_started_date = today`.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-020: Consecutive day extends streak
**Priority:** P0
**Type:** Functional
**Preconditions:** Student A has `current_streak = 5`, `last_active_date = yesterday`.
**Steps:**
1. Student A performs an activity today.
2. Query `student_streaks` for Student A.
**Expected Result:** `current_streak = 6`, `last_active_date = today`. `longest_streak` is updated to `MAX(longest_streak, 6)`. `streak_started_date` remains unchanged.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-021: Gap day resets streak to 1
**Priority:** P0
**Type:** Functional
**Preconditions:** Student A has `current_streak = 10`, `last_active_date = 2 days ago` (not yesterday).
**Steps:**
1. Student A performs an activity today.
2. Query `student_streaks` for Student A.
**Expected Result:** `current_streak = 1` (reset), `last_active_date = today`, `streak_started_date = today`. `longest_streak` retains its previous value (not reset).
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-022: Same-day activity does not change streak
**Priority:** P0
**Type:** Functional
**Preconditions:** Student A has `current_streak = 7`, `last_active_date = today` (already active today).
**Steps:**
1. Student A performs another activity today (e.g., completes a second checklist item).
2. Query `student_streaks` for Student A.
**Expected Result:** `current_streak` remains 7. `last_active_date` remains today. No change to streak data. The function returns early.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-023: Longest streak is tracked independently
**Priority:** P1
**Type:** Functional
**Preconditions:** Student A previously had a 15-day streak (longest_streak = 15). Current streak was broken and is now at 3.
**Steps:**
1. Verify `longest_streak = 15` and `current_streak = 3`.
2. Student A continues daily activities until `current_streak = 16`.
3. Query `student_streaks`.
**Expected Result:** After step 2, `longest_streak = 16` (updated because 16 > 15). `current_streak = 16`.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-024: 7-day milestone triggers bonus (one-time)
**Priority:** P1
**Type:** Functional
**Preconditions:** Student A has `current_streak = 6`.
**Steps:**
1. Student A performs activity, streak becomes 7.
2. Check `gamification_point_events` for `streak_milestone` event.
3. Student A continues to day 8, 9, etc.
4. Check for additional 7-day milestone events.
**Expected Result:** Step 2: One `streak_milestone` event with 25 points and `"milestone": 7`. Step 4: No additional 7-day milestone events are created (bonus is one-time per streak cycle).
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-025: 30-day milestone triggers bonus (one-time)
**Priority:** P1
**Type:** Functional
**Preconditions:** Student A has `current_streak = 29`.
**Steps:**
1. Student A performs activity, streak becomes 30.
2. Check for `streak_milestone` event with 100 points.
**Expected Result:** One `streak_milestone` event with `points = 100` and `"milestone": 30`. This is separate from the daily `streak_day` 3 points.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-026: 90-day milestone triggers bonus (one-time)
**Priority:** P1
**Type:** Functional
**Preconditions:** Student A has `current_streak = 89`.
**Steps:**
1. Student A performs activity, streak becomes 90.
2. Check for `streak_milestone` event with 300 points.
**Expected Result:** One `streak_milestone` event with `points = 300` and `"milestone": 90`.
**Actual Result:**
**Status:** Not Run

---

## 4. Badge System (P1)

Tests covering badge awarding criteria, idempotency, display, and notifications.

---

### TC-GAM-027: first_step badge -- attend first class
**Priority:** P1
**Type:** Functional
**Preconditions:** Student B has never attended a class. No `first_step` badge in `gamification_student_badges`.
**Steps:**
1. Student B attends their first class.
2. Run the badge check function (or wait for nightly cron).
3. Query `gamification_student_badges` for Student B with `badge_id = 'first_step'`.
**Expected Result:** One row with `badge_id = 'first_step'`, `earned_at` set to the badge check time, `notified = false`.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-028: task_starter badge -- complete first checklist item
**Priority:** P1
**Type:** Functional
**Preconditions:** Student B has never completed a checklist item.
**Steps:**
1. Student B completes their first checklist item.
2. Run badge check function.
3. Query for `badge_id = 'task_starter'`.
**Expected Result:** Badge awarded. One row in `gamification_student_badges` with `badge_id = 'task_starter'`.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-029: never_miss badge -- 95%+ attendance in a month
**Priority:** P1
**Type:** Functional
**Preconditions:** Student A has attended 19 out of 20 classes this month (95%). Minimum 10 class days have occurred.
**Steps:**
1. Run badge check function.
2. Query for `badge_id = 'never_miss'` for Student A.
**Expected Result:** Badge awarded with `earned_context` containing `{ "month": "<current month>", "attendance_pct": 95 }`.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-030: never_miss badge NOT awarded below 95%
**Priority:** P1
**Type:** Functional (Negative)
**Preconditions:** Student B has attended 18 out of 20 classes this month (90%).
**Steps:**
1. Run badge check function.
2. Query for `badge_id = 'never_miss'` for Student B.
**Expected Result:** No badge row exists. 90% < 95% threshold.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-031: iron_streak badge -- 30-day streak
**Priority:** P1
**Type:** Functional
**Preconditions:** Student A has `current_streak = 30` in `student_streaks`.
**Steps:**
1. Run badge check function.
2. Query for `badge_id = 'iron_streak'`.
**Expected Result:** Badge awarded with `earned_context` containing `{ "streak_length": 30 }`.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-032: on_the_board badge -- reach top 15
**Priority:** P1
**Type:** Functional
**Preconditions:** Student B has never been in the top 15 of the weekly leaderboard. This week, Student B's weekly score puts them at rank 12.
**Steps:**
1. Compute the weekly leaderboard (or run the scheduled function).
2. Run badge check function.
3. Query for `badge_id = 'on_the_board'` for Student B.
**Expected Result:** Badge awarded. `earned_context` includes the week and rank.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-033: Badge NOT double-awarded (idempotency)
**Priority:** P0
**Type:** Functional
**Preconditions:** Student A already has `first_step` badge awarded.
**Steps:**
1. Run the badge check function again (simulating nightly cron).
2. Query `gamification_student_badges` for Student A and `badge_id = 'first_step'`.
**Expected Result:** Still exactly one row. The `UNIQUE(student_id, badge_id)` constraint prevents duplicates. The `ON CONFLICT DO NOTHING` clause in the badge award SQL ensures no error is thrown.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-034: Unearned badges show as locked in catalog
**Priority:** P1
**Type:** Functional
**Preconditions:** Student B has earned only `first_step` badge. Badge catalog has 20+ badges defined.
**Steps:**
1. Call `GET /api/gamification/badges/catalog?student_id=<Student B>`.
2. Inspect the response.
**Expected Result:** `first_step` badge has `earned: true`. All other badges have `earned: false`. Locked badges include `criteria_description` explaining how to earn them and `icon_locked_svg_path` for the greyed-out visual.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-035: Badge feed shows recent classroom badge awards
**Priority:** P1
**Type:** Functional
**Preconditions:** Multiple students have earned badges in the past 7 days within the same classroom.
**Steps:**
1. Call `GET /api/gamification/badges/feed?classroom_id=<valid>`.
2. Inspect the response.
**Expected Result:** Response is an array of recent badge awards, ordered by most recent first. Each entry includes `student_name`, `badge_display_name`, `rarity_tier`, `earned_at`. Feed is scoped to the classroom.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-036: Badge earned triggers unread notification
**Priority:** P1
**Type:** Functional
**Preconditions:** Student A just earned a new badge. The badge row has `notified = false`.
**Steps:**
1. Call `GET /api/gamification/notifications/unread` as Student A.
2. Inspect the response.
**Expected Result:** Response includes the newly earned badge in the `badges` array with badge details (display_name, rarity_tier, icon path). At least one unread badge notification exists.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-037: Mark badge notification as read
**Priority:** P1
**Type:** Functional
**Preconditions:** Student A has at least one unread badge notification.
**Steps:**
1. Call `POST /api/gamification/notifications/mark-read` with the badge IDs.
2. Call `GET /api/gamification/notifications/unread` again.
**Expected Result:** After step 1, response confirms success. After step 2, the previously unread badges no longer appear in the unread list. The `notified` column in `gamification_student_badges` is now `true`.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-038: Badge catalog returns all launch badges
**Priority:** P1
**Type:** Functional
**Preconditions:** Badge definitions seeded in the database.
**Steps:**
1. Call `GET /api/gamification/badges/catalog`.
2. Count badges by category.
**Expected Result:** Response includes badges across all 4 categories: `attendance` (at least 7: first_step, early_bird, never_miss, iron_streak, the_foundation, unbreakable, the_constant), `checklist` (at least 6: task_starter, all_clear, checklist_champion, sketch_master, century_club, completionist), `growth` (at least 4: rising_star, comeback_kid, level_up, most_improved), `leaderboard` (at least 5: on_the_board, weekly_warrior, podium_finish, hall_of_famer, batch_topper). All have `is_active = true`.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-039: Teacher can view any student's badges
**Priority:** P1
**Type:** Functional
**Preconditions:** Teacher logged in. Student A has earned multiple badges.
**Steps:**
1. Call `GET /api/gamification/badges/catalog?student_id=<Student A ID>` as teacher.
2. Inspect the response.
**Expected Result:** Returns the full badge catalog with correct `earned` status for Student A. Teacher can see all badges including locked ones with criteria descriptions. HTTP 200.
**Actual Result:**
**Status:** Not Run

---

## 5. Leaderboard (P0/P1)

Tests covering weekly/monthly/all-time views, filters, ranking, tiebreakers, and rank display.

---

### TC-GAM-040: Weekly leaderboard shows current week data
**Priority:** P0
**Type:** Functional
**Preconditions:** Multiple students have point events this week (Monday through today).
**Steps:**
1. Call `GET /api/gamification/leaderboard?period=weekly&classroom_id=<valid>`.
2. Inspect response.
**Expected Result:** Response includes `entries` array sorted by raw score descending. `period = 'weekly'`. `from` is this week's Monday. `to` is today. Each entry has `student_id`, `student_name`, `raw_score`, `streak_length`, `rank`. `myRank` shows the current user's position.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-041: Monthly leaderboard shows current month data
**Priority:** P0
**Type:** Functional
**Preconditions:** Multiple students have point events this month.
**Steps:**
1. Call `GET /api/gamification/leaderboard?period=monthly&classroom_id=<valid>`.
2. Inspect response.
**Expected Result:** Response includes entries aggregated from the 1st of the current month to today. `period = 'monthly'`. Scores are cumulative for the entire month.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-042: All-time leaderboard aggregates all historical data
**Priority:** P1
**Type:** Functional
**Preconditions:** Students have point events spanning multiple weeks/months.
**Steps:**
1. Call `GET /api/gamification/leaderboard?period=alltime&classroom_id=<valid>`.
2. Inspect response.
**Expected Result:** Response includes entries with total lifetime scores. `period = 'alltime'`. Scores match the sum of all `gamification_point_events` for each student.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-043: Batch filter narrows leaderboard results
**Priority:** P1
**Type:** Functional
**Preconditions:** Classroom has two batches: Batch A (5 students) and Batch B (3 students).
**Steps:**
1. Call leaderboard API with `batch_id = Batch A`.
2. Call leaderboard API with `batch_id = Batch B`.
3. Call leaderboard API without `batch_id`.
**Expected Result:** Step 1: Only Batch A students appear (max 5). Step 2: Only Batch B students appear (max 3). Step 3: All students from both batches appear.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-044: Cross-batch "All Neram" uses normalized scores
**Priority:** P1
**Type:** Functional
**Preconditions:** Students in different batches with different `max_possible_score` values.
**Steps:**
1. Call leaderboard API with `scope=all_neram`.
2. Verify that scores shown are on the 0-1000 normalized scale.
3. Compare ranking order with raw scores.
**Expected Result:** Entries use `normalized_score = (raw_score / max_possible_score) * 1000`. A student with 80/100 raw (normalized=800) ranks above a student with 90/120 raw (normalized=750) even though 90 > 80 in raw terms.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-045: Tiebreaker -- higher streak wins
**Priority:** P1
**Type:** Functional
**Preconditions:** Student X and Student Y in the same batch both have 150 raw points this week. Student X has a 10-day streak. Student Y has a 7-day streak.
**Steps:**
1. Compute or query the weekly leaderboard.
2. Check the relative ranking of X and Y.
**Expected Result:** Student X ranks above Student Y because they have the same score but X has a longer streak (10 > 7). Tiebreaker cascade: score (tie) -> streak (X wins).
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-046: "Your Rank" section shows correct position
**Priority:** P0
**Type:** Functional
**Preconditions:** Current user is a student with a rank outside the top 3.
**Steps:**
1. Call leaderboard API.
2. Inspect `myRank` in the response.
**Expected Result:** `myRank` contains the current user's `student_id`, `rank`, `raw_score`, and `streak_length`. If the user is rank 23, the rank is 23. The rank matches the user's position when all entries are sorted.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-047: Top 3 entries are distinguished in response
**Priority:** P1
**Type:** Functional
**Preconditions:** At least 5 students on the leaderboard.
**Steps:**
1. Call leaderboard API.
2. Inspect the first 3 entries vs. entries 4+.
**Expected Result:** All entries have a `rank` field. The top 3 entries have rank 1, 2, 3. The UI layer (tested separately) can distinguish them for gold/silver/bronze card rendering. The API includes all entries in a single sorted array.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-048: Motivational message for students below top 15
**Priority:** P1
**Type:** Functional
**Preconditions:** Current user (student) is ranked 23rd out of 30 students.
**Steps:**
1. Call leaderboard API.
2. Calculate the points needed to reach top 15 from the response data.
**Expected Result:** The `myRank` object contains the user's rank (23). The client can compute the gap: `entries[14].raw_score - myRank.raw_score` = points needed to reach top 15. The rank is never hidden -- it is always available for the motivational framing "You're #23 -- X points to reach Top 15!".
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-049: Rank change indicator from previous week
**Priority:** P1
**Type:** Functional
**Preconditions:** Student A was rank 8 last week and rank 5 this week.
**Steps:**
1. Query `gamification_weekly_leaderboard` for Student A's current and previous week.
2. Verify `rank_change` value.
**Expected Result:** `rank_change = 3` (positive = improved). The value is computed as `previous_rank - current_rank = 8 - 5 = 3`. Positive means the student moved up.
**Actual Result:**
**Status:** Not Run

---

## 6. Student Achievement Profile (P1)

Tests covering the tappable profile drawer/page with stats, badges, activity, and privacy.

---

### TC-GAM-050: Profile endpoint returns complete student data
**Priority:** P1
**Type:** Functional
**Preconditions:** Student A has activity history, badges, and enrollment data.
**Steps:**
1. Call `GET /api/gamification/profile/<Student A ID>`.
2. Inspect the response structure.
**Expected Result:** Response contains: `student_id`, `student_name`, `avatar_url`, `batch_name`, `classroom_name`, `streak` (object with current_streak, longest_streak, last_active_date), `attendance_pct` (number 0-100), `total_checklists_completed` (integer), `total_badges` (integer), `badges` (array of earned badges), `recent_activity` (array of activity items), `attendance_heatmap` (array of date/attended pairs).
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-051: Profile shows correct stats
**Priority:** P1
**Type:** Functional
**Preconditions:** Student A has: 12-day streak, 94% attendance, 127 checklists completed, 8 badges earned.
**Steps:**
1. Call profile endpoint for Student A.
2. Verify each stat value.
**Expected Result:** `streak.current_streak = 12`, `attendance_pct = 94`, `total_checklists_completed = 127`, `total_badges = 8`. Values match the aggregated data in the respective tables.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-052: Badge grid shows earned and locked badges
**Priority:** P1
**Type:** Functional
**Preconditions:** Student A has 8 earned badges. Total catalog has 22 badges.
**Steps:**
1. Call badge catalog for Student A.
2. Count earned vs locked.
**Expected Result:** 8 badges with `earned: true` (full color display), 14 badges with `earned: false` (greyed-out silhouette). Locked badges include `criteria_description` text.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-053: Activity feed shows recent actions
**Priority:** P1
**Type:** Functional
**Preconditions:** Student A has performed 5+ activities in the last 3 days.
**Steps:**
1. Call profile endpoint for Student A.
2. Inspect `recent_activity`.
**Expected Result:** Array of activity items ordered by `activity_date` descending (most recent first). Each item has `activity_type`, `title`, `metadata`, `activity_date`. Items span different types: class_attended, checklist_completed, badge_earned, etc. Maximum 20 items returned (as per the query limit).
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-054: Attendance heatmap shows current month
**Priority:** P1
**Type:** Functional
**Preconditions:** Current month has 15 class days so far. Student A attended 13, missed 2.
**Steps:**
1. Call profile endpoint for Student A.
2. Inspect `attendance_heatmap`.
**Expected Result:** Array of objects with `date` (ISO date string) and `attended` (boolean). 13 entries with `attended: true`, 2 with `attended: false`. Dates fall within the current month only (from the 1st to today).
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-055: Self-view shows extra data (points breakdown, rank history)
**Priority:** P1
**Type:** Functional
**Preconditions:** Student A viewing their own profile.
**Steps:**
1. Call `GET /api/gamification/profile/me` as Student A.
2. Inspect response for self-view fields.
**Expected Result:** Response includes all public fields PLUS: `is_self: true`, `points_breakdown` (object showing points per event_type for current week), `rank_history` (array of last 8 weeks with `week_start`, `rank_in_batch`, `raw_score`). `rank_history` is ordered chronologically (oldest first).
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-056: Privacy -- test scores NOT visible to batch-mates
**Priority:** P0
**Type:** Security
**Preconditions:** Student A views Student B's profile. Student B has quiz/test scores in the system.
**Steps:**
1. Student A calls `GET /api/gamification/profile/<Student B ID>`.
2. Inspect the response for any test/quiz score data.
**Expected Result:** Response does NOT contain actual test/quiz scores, teacher feedback/notes, detailed performance analytics, or points breakdown per action. Only public data is returned: name, avatar, batch, rank, streak, attendance%, checklists completed, badges, activity feed, attendance heatmap.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-057: Profile loads for any student in the classroom
**Priority:** P1
**Type:** Functional
**Preconditions:** Teacher logged in. 10 students enrolled across 2 batches.
**Steps:**
1. Call profile endpoint for each of the 10 student IDs.
2. Verify each returns valid data.
**Expected Result:** All 10 calls return HTTP 200 with valid profile data. No student is inaccessible. Students with no activity have zero-value stats (streak=0, attendance_pct=0, badges=0, empty activity feed) but still return a valid profile structure.
**Actual Result:**
**Status:** Not Run

---

## 7. Dashboard Widgets (P1)

Tests covering the "Hall of Fame" and "Badge Feed" dashboard components.

---

### TC-GAM-058: "Top Performers" widget shows top 3
**Priority:** P1
**Type:** Functional
**Preconditions:** At least 5 students with points this week. `classroom_id` is valid.
**Steps:**
1. Call `GET /api/gamification/dashboard?classroom_id=<valid>`.
2. Inspect `top_performers`.
**Expected Result:** `top_performers` is an array with exactly 3 entries (or fewer if less than 3 students have activity). Entries are sorted by score descending. Each entry includes: `student_name`, `raw_score`, `streak_length`, and top badges.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-059: "Badge Feed" widget shows recent badges
**Priority:** P1
**Type:** Functional
**Preconditions:** Multiple students have earned badges in the past 7 days.
**Steps:**
1. Call dashboard endpoint.
2. Inspect `badge_feed`.
**Expected Result:** `badge_feed` is an array of recent badge awards across the classroom. Each entry includes `student_name`, `badge_display_name`, `rarity_tier`, `earned_at`. Ordered by `earned_at` descending.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-060: "Your Rank" shown in dashboard widget
**Priority:** P1
**Type:** Functional
**Preconditions:** Current user is a student with a rank this week.
**Steps:**
1. Call dashboard endpoint.
2. Inspect `my_rank`.
**Expected Result:** `my_rank` object contains current user's `rank`, `raw_score`, and `rank_change` (vs last week). If the user is a teacher, `my_rank` may be null.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-061: Dashboard handles no activity gracefully
**Priority:** P1
**Type:** Functional (Edge Case)
**Preconditions:** A new classroom with enrolled students but zero gamification activity this week.
**Steps:**
1. Call dashboard endpoint for this classroom.
2. Inspect response.
**Expected Result:** `top_performers` is an empty array `[]`. `badge_feed` is an empty array `[]`. `my_rank` is null. HTTP 200 (not an error). The UI should display "No activity this week yet" based on these empty values.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-062: Dashboard classroom_id is required
**Priority:** P1
**Type:** Functional (Negative)
**Preconditions:** User logged in.
**Steps:**
1. Call `GET /api/gamification/dashboard` without `classroom_id` parameter.
**Expected Result:** HTTP 400 with error: "Missing classroom_id".
**Actual Result:**
**Status:** Not Run

---

## 8. Mobile Responsiveness (P1)

All tests in this section require a browser or device at the specified viewport width.

---

### TC-GAM-063: Leaderboard -- no horizontal scroll at 375px
**Priority:** P1
**Type:** Regression / Mobile
**Preconditions:** Leaderboard page loaded at 375px viewport width. At least 10 entries with data.
**Steps:**
1. Open the leaderboard page in Chrome DevTools at 375px width (iPhone SE).
2. Scroll vertically through all entries.
3. Attempt to scroll horizontally.
**Expected Result:** No horizontal scroll bar appears. All content fits within 375px. Rank number, avatar, name, score, and streak are all visible without horizontal scrolling. Badge icons may be truncated to 2-3 max per row if needed.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-064: Touch targets are 48px minimum
**Priority:** P1
**Type:** Accessibility / Mobile
**Preconditions:** Leaderboard page loaded on mobile viewport.
**Steps:**
1. Open Chrome DevTools, toggle device toolbar to 375px.
2. Inspect each interactive element: leaderboard rows, tab buttons (Weekly/Monthly/All-Time), batch filter dropdown, "View All" links.
3. Measure the touch target size using DevTools element inspection.
**Expected Result:** All interactive elements have a minimum clickable area of 48x48px (per Material 3 guidelines). Tab buttons, dropdown, leaderboard rows all meet this threshold. Spacing between adjacent interactive elements is at least 8px.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-065: Base font is 16px (no iOS auto-zoom)
**Priority:** P1
**Type:** Mobile
**Preconditions:** Any gamification page loaded on iOS Safari (or simulated).
**Steps:**
1. Open the leaderboard page on an iOS device (or Safari responsive mode).
2. Tap on any input field (if present, e.g., search/filter).
3. Observe if the page auto-zooms.
4. Inspect the body/root font size.
**Expected Result:** Base font size is 16px or larger. iOS Safari does not auto-zoom when focusing input fields (auto-zoom occurs when font-size < 16px). Body text is readable without manual zoom.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-066: Bottom navigation visible on mobile
**Priority:** P1
**Type:** Mobile
**Preconditions:** Mobile viewport (375px). User is on the leaderboard page.
**Steps:**
1. Load leaderboard at 375px.
2. Check for bottom navigation bar.
3. Verify leaderboard tab/icon is highlighted.
**Expected Result:** Bottom navigation bar is visible and fixed at the bottom of the viewport. Leaderboard icon/tab is highlighted as active. Navigation items are in the thumb-friendly zone (bottom 80px of screen).
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-067: Sidebar hidden on mobile
**Priority:** P1
**Type:** Mobile
**Preconditions:** Mobile viewport (375px).
**Steps:**
1. Load any gamification page at 375px.
2. Check for sidebar visibility.
**Expected Result:** Desktop sidebar navigation is completely hidden. No horizontal space is consumed by the sidebar. Full viewport width is available for content. Navigation is via bottom tab bar only.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-068: Top 3 cards stack vertically on mobile
**Priority:** P1
**Type:** Mobile
**Preconditions:** Leaderboard loaded at 375px with at least 3 students.
**Steps:**
1. Load leaderboard at 375px.
2. Observe the top 3 entries layout.
**Expected Result:** Top 3 highlighted cards are stacked vertically (single column). Each card spans the full width minus padding. Cards show rank medal (gold/silver/bronze), avatar, name, batch, score, streak, and top badges. No horizontal overflow.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-069: "Your Rank" section sticky at bottom on mobile
**Priority:** P1
**Type:** Mobile
**Preconditions:** Mobile viewport. User is ranked outside top 10. Leaderboard has 20+ entries.
**Steps:**
1. Load leaderboard at 375px.
2. Scroll through the leaderboard entries.
3. Observe the "Your Rank" section.
**Expected Result:** "Your Rank" section remains fixed/sticky at the bottom of the viewport while scrolling through the leaderboard. It does not scroll away. It shows the current user's rank, score, streak, and rank change indicator. A visual separator ("...") exists between the scrolling list and the sticky section.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-070: Profile drawer slides in from right on mobile
**Priority:** P1
**Type:** Mobile
**Preconditions:** Mobile viewport (375px). Leaderboard loaded with entries.
**Steps:**
1. Tap on a leaderboard row (any student).
2. Observe the transition.
3. Verify the profile content renders.
4. Tap "Back" or swipe right to close.
**Expected Result:** A full-screen slide-in animation from the right edge occurs (Fluent UI Drawer or Next.js page transition). The profile shows: avatar, name, batch, rank, stats row (streak, attendance%, tasks, badges), badge grid, recent activity, attendance heatmap. "Back" button or right-swipe returns to the leaderboard.
**Actual Result:**
**Status:** Not Run

---

## 9. Security (P1)

Tests covering authentication, authorization, rate limits, and data access controls.

---

### TC-GAM-071: API returns 401 without auth token
**Priority:** P1
**Type:** Security
**Preconditions:** No authentication headers set.
**Steps:**
1. Call `GET /api/gamification/leaderboard?classroom_id=xxx` without Authorization header.
2. Call `GET /api/gamification/badges/catalog` without Authorization header.
3. Call `POST /api/gamification/points/award` without Authorization header.
4. Call `GET /api/gamification/profile/me` without Authorization header.
5. Call `GET /api/gamification/dashboard?classroom_id=xxx` without Authorization header.
**Expected Result:** All 5 calls return HTTP 401 (Unauthorized). No gamification data is leaked in the error response. Error message is generic (e.g., "Authentication required" or "Invalid token").
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-072: Teacher-only endpoints reject student tokens
**Priority:** P1
**Type:** Security
**Preconditions:** Student A is logged in with a valid Microsoft token. Student A has `user_type = 'student'`.
**Steps:**
1. Student A calls `POST /api/gamification/points/award` with body `{ "student_id": "<other student>", "classroom_id": "<valid>", "points": 5, "reason": "test" }`.
**Expected Result:** HTTP 403 with error: "Only teachers can award points". The student token is valid but the endpoint checks `user_type` and rejects non-teacher/non-admin users. No point event is created.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-073: Manual points per-award capped at 20
**Priority:** P1
**Type:** Security
**Preconditions:** Teacher logged in.
**Steps:**
1. Call award endpoint with `points: 100`.
2. Call award endpoint with `points: 50`.
3. Call award endpoint with `points: 21`.
**Expected Result:** All three return HTTP 400 with "Points must be between 1 and 20 per award". No point events are created.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-074: Manual points weekly cap at 50 cannot be bypassed
**Priority:** P1
**Type:** Security
**Preconditions:** Teacher has already awarded 45 points to Student A this week across multiple requests.
**Steps:**
1. Award 5 points (total becomes 50/50) -- should succeed.
2. Award 1 more point -- should fail.
3. Try awarding via a different teacher account to the same student.
**Expected Result:** Step 1: Success. Step 2: HTTP 400, cap reached. Step 3: The weekly cap is per-student (not per-teacher), so this should also fail if the student already has 50 manual points this week from any source.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-075: RLS -- students can read but not write gamification tables
**Priority:** P1
**Type:** Security
**Preconditions:** Student A authenticated via Supabase RLS (using anon key + JWT).
**Steps:**
1. Using the Supabase client (not admin), attempt `SELECT * FROM gamification_weekly_leaderboard LIMIT 5` -- should succeed (public read).
2. Attempt `INSERT INTO gamification_point_events (...)` -- should fail.
3. Attempt `UPDATE gamification_student_badges SET notified = true WHERE student_id != <Student A>` -- should fail.
4. Attempt `DELETE FROM gamification_point_events WHERE student_id = <Student A>` -- should fail.
**Expected Result:** Step 1: Returns data (leaderboard is publicly readable). Steps 2-4: RLS denies the operation. Students cannot insert, update, or delete gamification data directly. All writes go through server-side API routes using the admin client.
**Actual Result:**
**Status:** Not Run

---

## 10. Edge Cases (P2)

Tests covering unusual or boundary conditions.

---

### TC-GAM-076: Student with zero activity has empty but valid leaderboard entry
**Priority:** P2
**Type:** Edge Case
**Preconditions:** Student B just enrolled, has zero gamification activity (no attendance, no checklists, no points).
**Steps:**
1. Call leaderboard API for Student B's classroom.
2. Look for Student B in the entries.
3. Call profile endpoint for Student B.
**Expected Result:** Student B may or may not appear in the leaderboard (depends on whether entries are only created for students with points). If they appear: `raw_score = 0`, `streak_length = 0`, ranked last. Profile endpoint returns: `streak.current_streak = 0`, `attendance_pct = 0`, `total_checklists_completed = 0`, `total_badges = 0`, `badges = []`, `recent_activity = []`, `attendance_heatmap = []`. No errors thrown.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-077: Student with no enrollment handles gracefully
**Priority:** P2
**Type:** Edge Case
**Preconditions:** A user exists in the `users` table but has no enrollment in `nexus_enrollments`.
**Steps:**
1. Call `GET /api/gamification/profile/<unenrolled user ID>`.
2. Inspect the response.
**Expected Result:** Response returns HTTP 200 (or 404) with graceful handling. If 200: `batch_name = null`, `classroom_name = null`, stats are all zero. If 404: clear error message "Student not found" or "No enrollment found". No 500 server error.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-078: Batch filter with zero students returns empty array
**Priority:** P2
**Type:** Edge Case
**Preconditions:** A batch exists but has no enrolled students (or all students are inactive).
**Steps:**
1. Call leaderboard API with `batch_id = <empty batch>`.
2. Inspect response.
**Expected Result:** `entries = []`, `totalStudents = 0`, `myRank = null`. HTTP 200 (not an error). The UI renders an empty state message.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-079: Very long student name does not break layout
**Priority:** P2
**Type:** Edge Case / UI
**Preconditions:** A student exists with a very long name (e.g., "Venkatanarasimharajuvaripeta Subramaniam Chandrasekhar" -- 55 characters).
**Steps:**
1. Load leaderboard page at 375px viewport.
2. Find the long-name student in the list.
3. Tap their row to open profile.
**Expected Result:** Name is truncated with ellipsis (`text-overflow: ellipsis`) in the leaderboard row. No horizontal overflow. No layout break. In the profile drawer, the full name wraps to multiple lines or truncates gracefully. Score and streak values remain visible and properly aligned.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-080: Concurrent point recording with same source_id does not duplicate
**Priority:** P2
**Type:** Edge Case / Concurrency
**Preconditions:** Test environment where two requests can be sent simultaneously.
**Steps:**
1. Prepare two identical `recordGamificationEvent` calls with the same `source_id` (e.g., simulating a double-click or retry).
2. Send both requests concurrently (within milliseconds of each other).
3. Query `gamification_point_events` for that `source_id`.
**Expected Result:** Only one row exists. The database's unique constraint (or application-level idempotency check) prevents the duplicate. The second request either silently succeeds (ON CONFLICT DO NOTHING) or returns an appropriate message. The student's total points are not inflated.
**Actual Result:**
**Status:** Not Run

---

## 11. Performance (P2)

Tests verifying response times and rendering performance under realistic load.

---

### TC-GAM-081: Leaderboard API responds within 2 seconds for 100 students
**Priority:** P2
**Type:** Performance
**Preconditions:** A classroom with 100 enrolled students, each with multiple weeks of point events. Database indexes exist on `gamification_point_events(student_id, event_date)` and `gamification_point_events(batch_id, event_date)`.
**Steps:**
1. Call `GET /api/gamification/leaderboard?period=weekly&classroom_id=<large classroom>`.
2. Measure the response time from request sent to response received.
3. Repeat 5 times and compute the average.
**Expected Result:** Average response time is under 2000ms (2 seconds). P95 response time is under 3000ms. Response includes all 100 students ranked correctly.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-082: Badge catalog API responds within 1 second
**Priority:** P2
**Type:** Performance
**Preconditions:** Badge catalog has 22+ badge definitions. Student has earned 10+ badges.
**Steps:**
1. Call `GET /api/gamification/badges/catalog?student_id=<active student>`.
2. Measure response time.
3. Repeat 5 times.
**Expected Result:** Average response time is under 1000ms (1 second). The catalog includes all badges with correct earned/locked status.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-083: Leaderboard page renders within 3 seconds on mobile
**Priority:** P2
**Type:** Performance
**Preconditions:** Mobile device or Chrome DevTools throttled to "Fast 3G" network profile and 4x CPU slowdown. Classroom with 30+ students.
**Steps:**
1. Open Chrome DevTools, set network throttling to "Fast 3G" and CPU to 4x slowdown.
2. Set viewport to 375px.
3. Navigate to the leaderboard page.
4. Measure time from navigation start to Largest Contentful Paint (LCP) using Performance tab.
**Expected Result:** LCP is under 3000ms. Skeleton loaders appear within 500ms. Leaderboard rows render progressively. No layout shifts after content loads (CLS < 0.1).
**Actual Result:**
**Status:** Not Run

---

## 12. Accessibility (P2)

Tests ensuring the module is usable by people with disabilities and meets WCAG 2.1 AA standards.

---

### TC-GAM-084: prefers-reduced-motion disables flame animation
**Priority:** P2
**Type:** Accessibility
**Preconditions:** Leaderboard loaded with students that have active streaks (flame icon visible).
**Steps:**
1. Open Chrome DevTools > Rendering > check "Emulate CSS media feature prefers-reduced-motion: reduce".
2. Load the leaderboard page.
3. Observe the streak flame icons.
4. Observe badge shimmer effects and rank change animations.
**Expected Result:** All CSS animations are disabled or reduced to a single static frame. The flame icon renders as a static icon (no flicker animation). Badge shimmer effects on legendary badges are disabled. Rank change indicators show without slide-in animation. The spec explicitly requires `prefers-reduced-motion` media query support.
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-085: Screen reader -- leaderboard rows have proper ARIA labels
**Priority:** P2
**Type:** Accessibility
**Preconditions:** Leaderboard loaded with data. Screen reader enabled (NVDA on Windows, VoiceOver on macOS/iOS).
**Steps:**
1. Focus the leaderboard list using keyboard navigation.
2. Navigate through rows using arrow keys.
3. Listen to the screen reader output for each row.
**Expected Result:** Each leaderboard row has an `aria-label` or equivalent that reads: "Rank [X], [Student Name], [Score] points, [Streak] day streak". The tab bar buttons have accessible labels ("Weekly leaderboard", "Monthly leaderboard", "All-time leaderboard"). The batch filter dropdown is labeled. The "Your Rank" section has a landmark or heading announcing it. Top 3 podium cards indicate their rank medal (gold, silver, bronze).
**Actual Result:**
**Status:** Not Run

---

### TC-GAM-086: Keyboard navigation through leaderboard rows
**Priority:** P2
**Type:** Accessibility
**Preconditions:** Leaderboard loaded on desktop browser. No mouse/touchpad used.
**Steps:**
1. Press Tab to focus the first interactive element on the leaderboard page.
2. Tab through: tab bar options, batch filter, leaderboard rows.
3. Press Enter on a leaderboard row.
4. In the profile panel, Tab through badge grid, activity feed.
5. Press Escape or Tab to "Back" and confirm return to leaderboard.
**Expected Result:** All interactive elements are reachable via Tab key. Focus order is logical (top to bottom, left to right). Focused elements have a visible focus ring/outline (not just color change). Enter/Space activates buttons and row clicks. Escape closes drawers/panels. No keyboard traps (focus never gets stuck in a component).
**Actual Result:**
**Status:** Not Run

---

## Test Execution Summary

| Section | Total | P0 | P1 | P2 | Pass | Fail | Blocked | Not Run |
|---------|-------|----|----|----|----|------|---------|---------|
| 1. Smoke Tests | 5 | 5 | 0 | 0 | | | | 5 |
| 2. Scoring Engine | 13 | 5 | 8 | 0 | | | | 13 |
| 3. Streak System | 8 | 4 | 4 | 0 | | | | 8 |
| 4. Badge System | 13 | 1 | 12 | 0 | | | | 13 |
| 5. Leaderboard | 10 | 2 | 8 | 0 | | | | 10 |
| 6. Student Profile | 8 | 1 | 7 | 0 | | | | 8 |
| 7. Dashboard Widgets | 5 | 0 | 5 | 0 | | | | 5 |
| 8. Mobile Responsiveness | 8 | 0 | 8 | 0 | | | | 8 |
| 9. Security | 5 | 0 | 5 | 0 | | | | 5 |
| 10. Edge Cases | 5 | 0 | 0 | 5 | | | | 5 |
| 11. Performance | 3 | 0 | 0 | 3 | | | | 3 |
| 12. Accessibility | 3 | 0 | 0 | 3 | | | | 3 |
| **TOTAL** | **86** | **18** | **57** | **11** | | | | **86** |

---

## Regression Test Suite (Run Before Every Release)

The following test cases form the minimum regression suite. Run all P0 tests plus selected P1 tests before every deployment:

**P0 Smoke (always run):**
TC-GAM-001, TC-GAM-002, TC-GAM-003, TC-GAM-004, TC-GAM-005

**P0 Scoring (always run):**
TC-GAM-006, TC-GAM-007, TC-GAM-008, TC-GAM-015, TC-GAM-016, TC-GAM-017

**P0 Streak (always run):**
TC-GAM-019, TC-GAM-020, TC-GAM-021, TC-GAM-022

**P0 Badge Idempotency (always run):**
TC-GAM-033

**P0 Leaderboard (always run):**
TC-GAM-040, TC-GAM-046

**P0 Security/Privacy (always run):**
TC-GAM-056

**Total Regression Suite: 18 test cases** (executable in ~45 minutes)

---

## Notes

1. **Database table names**: The implementation uses `gamification_` prefixed table names (e.g., `gamification_point_events`, `gamification_student_badges`, `gamification_badge_definitions`, `gamification_weekly_leaderboard`) while the spec uses unprefixed names. Tests reference the actual implementation table names.
2. **Badge check functions**: Some badges are awarded by nightly/weekly cron jobs (pg_cron). For testing, these functions can be invoked manually via `SELECT check_and_award_badges()` in the Supabase SQL editor.
3. **Streak updates**: The `update_student_streak()` function is called automatically when `recordGamificationEvent` processes a point event. For isolated testing, call it directly.
4. **Cross-batch normalization**: The `normalized_score` column is only computed during weekly leaderboard snapshot runs. Live leaderboard queries may compute normalization on-the-fly or may only use raw scores. Confirm behavior with the actual query implementation.
5. **Mobile tests**: Use Chrome DevTools device emulation for initial testing. Final validation should be on a real Android device (Samsung Galaxy A-series or equivalent mid-range) since PWA is the primary mobile experience.
