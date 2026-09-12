# Student Sketchbook: practice rhythm, appreciation and class showcase

Date: 2026-09-11. Status: design for review, nothing built. App: Nexus (mobile-first).

## 1. Why

NATA and JEE Paper 2 need frequent drawing, not only the mandatory drawing assignments. In a physical classroom the teacher flips through each student's sketchbook and sees everything. Online, that sketchbook is invisible: Nexus only sees assignment submissions, which students treat as homework. Some students draw a lot on their own and nobody sees it. Others never draw between assignments.

The Sketchbook is a personal space in Nexus where a student drops any drawing, however small, as often as they like. Nexus tracks the rhythm of practice, the teacher flips through it the way they would in class, appreciates with one tap, and features great sketches to the whole class (Teams group plus Nexus), which is what motivates the rest of the class today when the teacher shares work by hand.

Production facts on 2026-09-11 that shape the design:

| Fact | Value |
|---|---|
| `student.drawings` flag | OFF in prod, so students see no drawing space today except assignments |
| Active students | 38, one classroom (JEE B.Arch Session 1) with a Teams team and group chat, no class channel id |
| Drawing submissions, last 90 days | 90, all `assignment`, from 27 students |
| `free_practice` submissions ever | 32 (before the flag went off) |
| Teacher reactions ever set on a submission | 8 |

At pilot scale, 38 students at 3 days a week is about 115 sketches a week for the teacher.

## 2. Decisions (assumed, override any of them)

| # | Decision | Why | Rejected |
|---|---|---|---|
| D1 | **Weekly rhythm goal, not a daily chain.** The goal is practice days out of 7 (Mon to Sun, IST), set by the teacher per classroom, default 3, raised to 4 or 5 once the class settles into it. Nexus shows this week's 7 dots, the run of consecutive weeks that met the goal, the best run, and total practice days. A missed day never resets anything visible. | A daily chain punishes hardest right after the best run (school exams, travel, one tired night) and most students quit after the first break. "Alternate days" is the same thing said as a goal: 3 to 4 days a week. Starting low and raising it lets the teacher ratchet the class up without a reset. | Daily streak; alternate-day chain with freezes; one global goal. |
| D2 | **Private plus featured.** Student, their teachers, staff and (later) parents see the whole sketchbook. Classmates see only sketches a teacher has featured, on a Featured shelf. Students can opt out of being featured. | Shy and weak students stop uploading when the class can browse everything. Featuring is the social proof that already works by hand. | Open class gallery; per-sketch share toggle. |
| D3 | **Teachers flip through, they do not grade.** One-tap reaction, optional short comment, feature. Students are told up front: the sketchbook is practice, not marked. | 115 a week at pilot, 350 at 100 students. Nobody reviews that. The physical peek is the value, and "your teacher saw this" costs nothing. | A comment on every sketch; AI note on every sketch. |
| D4 | **Free draw in v1, prompts later.** Schema keeps a nullable prompt reference. | A blank sketchbook ships in weeks. Prompts are a content project. | Daily prompt bank at launch. |
| D5 | **Reuse `drawing_submissions` with a new `source_type = 'sketchbook'`.** | Reactions, comments, tags, gallery visibility, Hall of Fame, AI evaluation and the teacher review UI already hang off this table. A separate table rebuilds all of it. | New `sketchbook_entries` table; re-shelling the whole Drawings section. |
| D6 | **No leaderboard, no ranking, no public streak counts.** Milestones (7, 30, 100 sketches) are private to the student and their teachers. | The value is comparing a student with their own past. Ranking demotivates the bottom half. | Weekly top sketchers. |
| D7 | **Nexus, behind flags, one-classroom pilot.** | Students live in Nexus for classes, assignments and Teams. The App PWA is tools and payments. | Building in the App. |

## 3. Vocabulary (UX writing)

| Term | Meaning | Never say |
|---|---|---|
| Sketchbook | The student's personal space. One per student, across classrooms. | Gallery, portfolio, practice log |
| Sketch | One uploaded drawing. Photo plus optional one-line caption. | Submission, entry, upload |
| Practice day | A calendar day (IST) with at least one sketch. Several sketches in a day count once. | Streak day |
| Rhythm | This week's practice days against the goal. | Streak, chain |
| Run | Consecutive weeks that met the goal. | Streak |
| Flip through | The teacher's inbox of new sketches. | Review, grade, evaluate |
| Seen | A teacher opened the sketch (the physical peek). Shown to the student as "Seen by Hari". | Viewed, read |
| Featured | A teacher posted the sketch to the class. | Published, shared, promoted |

Copy samples (no em dashes anywhere):
- Empty sketchbook: "Your sketchbook is empty. Draw anything for ten minutes and add it here. Small sketches count."
- Rhythm card: "2 of 3 days this week." / "3 of 3 days. Good rhythm, 4 weeks running."
- After upload: "Added to your sketchbook. Day 2 of 3 this week."
- Seen: "Seen by Hari" (teacher first name).
- Reaction: "Hari reacted to your sketch." with the reaction glyph.
- Featured (to student): "Your sketch was featured in JEE B.Arch Session 1."
- Teams card: "Featured sketch: {Student} drew this in their sketchbook. {caption}" plus the image and "Open in Nexus".
- Teacher inbox empty: "You have flipped through everything. 14 sketches this week from 9 students."

## 4. Journeys

Entry and Back are explicit hrefs, never dead ends.

**Student, add a sketch (mobile)**
1. Dashboard card "Draw something today" (or "2 of 3 days this week") tap opens `/student/sketchbook`. Back returns to `/student/dashboard`.
2. Sketchbook home: rhythm card, then-and-now (once eligible), month grid. FAB "Add a sketch" opens a bottom sheet (camera / gallery / paste, rotate, optional caption). Done closes the sheet, the new sketch animates into the grid, toast "Added. Day 2 of 3 this week."
3. Tap a sketch opens `/student/sketchbook/[id]`: full image, caption, date, Seen by, reaction, comment, Featured ribbon. Back returns to `/student/sketchbook`.

**Teacher, flip through (mobile)**
1. Teaching panel item "Sketchbooks" opens `/teacher/sketchbook` (bottom nav overflow, badge = unflipped count scoped to the teacher's classrooms).
2. Flip-through: one sketch per screen, student name and avatar (stage ring via stage facts), caption, date, "3rd this week". Actions: reaction chips (Nice, Great, Wow) as 48px targets, "Comment", "Feature", "Next". Swiping is a convenience, buttons are the contract.
3. "Feature" opens a sheet: classroom (preselected when the student has one), caption prefilled from the student's caption, preview of the Teams card, Confirm. Done returns to the flip with a "Featured" chip.
4. Tab "Class rhythm": roster sorted quiet-first, each row: avatar, name, this week's 7 dots, last sketch "4 days ago". Tap opens that student's sketchbook at `/teacher/sketchbook/[studentId]`. Back returns to `/teacher/sketchbook`.

**Teacher, peek from a profile**
`/teacher/students/[id]` gains a "Sketchbook" section (accordion, headline number = practice days in 30 days) next to "Assignments and tests". "Open sketchbook" goes to `/teacher/sketchbook/[studentId]`. Back returns to the profile.

**Class, featured shelf**
Student Sketchbook home gets a "Featured in class" strip (server-gated by flag) showing featured sketches from classmates. Tap opens a read-only sketch page with reactions from the existing gallery reaction set. Back returns to `/student/sketchbook`.

**Parent (phase 2)**
`/parent/sketchbook`: read-only rhythm and grid for the linked child. Gated by `parent.sketchbook`, child-scoped through `assertParentOf`.

## 5. Screens (mobile first, then desktop)

All screens: 48px touch targets with 8px gaps, visible focus rings, 4.5:1 text, `prefers-reduced-motion`, SVG icons from MUI, skeletons for every async region, no horizontal scroll at 375, 768, 1024, 1440. Theme from `@neram/ui` only.

1. **Sketchbook home** `/student/sketchbook`
   - Header: PageHeader "Sketchbook", back to dashboard.
   - Rhythm card: 7 dots (Mon to Sun) with today outlined, "2 of 3 days this week", run line "4 weeks running, best 6". Dots are 20px glyphs inside a 48px row; not tappable.
   - Then-and-now card (only when 8 or more sketches and 30 or more days apart): first sketch beside latest, "Then, 12 Jul" / "Now, 9 Sep".
   - Featured strip (flag): horizontal card row, 2.2 cards visible at 375px, each 44px+ tap area.
   - Month grid: 3 columns on phone (square thumbnails, `aspect-ratio: 1`, `loading="lazy"`), 4 on tablet, 6 on desktop. Month header rows "September, 7 sketches, 5 practice days". Newest first. Page size 30 with "Load older".
   - FAB "Add a sketch" bottom right above the bottom nav, 56px, extended label on desktop.
   - Empty state from `@neram/ui` EmptyState with the copy above and the FAB as the action.

2. **Add a sketch** bottom sheet: reuse `DrawingSubmissionSheet` with `sourceType="sketchbook"`. Caption field label "One line about this sketch (optional)", 80 chars. Progress bar during upload. Errors under the field with retry.

3. **Sketch page** `/student/sketchbook/[id]`: image at full width, pinch to zoom (new, see 7), caption, date, "Seen by Hari", reaction row, comment thread (existing `CommentSection`), Featured ribbon with classroom name. Overflow menu: Delete (own, not featured, confirm dialog).

4. **Dashboard card** on `/student/dashboard`, in the slot between the Next-Up hero and the stats strip: "Draw something today" or "2 of 3 days this week", 7 dots inline, tap opens the sketchbook. Uses `useAuthSWR` on `/api/sketchbook/me?summary=1` so the 900-line dashboard fetch is untouched.

5. **Flip-through** `/teacher/sketchbook`: top tabs "Flip through (12)" and "Class rhythm" (one tab level). Card fills the viewport height minus chrome; image `object-fit: contain`; bottom action bar sticky with safe-area padding. Keyboard: arrow keys next/previous, 1/2/3 react, F feature.

6. **Feature sheet**: classroom select (only classrooms where the student is enrolled and the teacher has access), caption (editable), card preview, "Feature to class" primary, Cancel. Disabled with a reason when the classroom has no Teams team or the teacher's Microsoft token is not a real Graph token.

7. **Class rhythm** list: a goal row at the top, "Weekly goal: 3 days" with an Edit button (48px) that opens a small sheet with a 1 to 7 segmented control and the note "Applies from this week. Past weeks keep their goal." Then `PeopleSearchField`, rows 56px, quiet-first sort, chips "Quiet 9 days". Desktop: same list, wider.

8. **Teacher view of a sketchbook** `/teacher/sketchbook/[studentId]`: the student's home screen, read-only, plus the reaction and feature actions on each sketch page.

## 6. Architecture: reuse map

| Need | Reuse (do not rebuild) |
|---|---|
| Upload, camera, paste, rotate, compress | `apps/nexus/src/components/drawings/DrawingSubmissionSheet.tsx`, `apps/nexus/src/utils/imageCompression.ts`, `POST /api/drawing/upload` (bucket `drawing-uploads`, public, 10 MB) |
| Submission record, comments, tags | `createDrawingSubmissionWithThread`, `addDrawingSubmissionComment`, `setSubmissionTags` in `packages/database/src/queries/nexus/drawings.ts` |
| Teacher reaction | `drawing_submissions.reaction` (`heart, clap, fire, star, wow`), set by the existing review save |
| Classmate reactions on featured sketches | `drawing_gallery_reactions`, `toggleGalleryReaction`, `POST /api/drawing/gallery/[id]/react` |
| Gallery / Hall of Fame visibility | `drawing_submissions.is_gallery_visible`, `setGalleryVisibility`, `setAlumniFeatured` |
| Student notifications (bell, Teams activity, chat, email backstop) | `sendNudge` in `apps/nexus/src/lib/nudge-delivery.ts`. The only door. |
| Class Teams post | `postGroupMessage` in `apps/nexus/src/lib/teams-group-post.ts` plus `escapeMessageHtml`, `cardHash`, `removeTeamsAnnouncements` (soft delete) in `apps/nexus/src/lib/teams-class-announcements.ts` |
| Auth in routes | `getRequestUser`, `assertStaff`, `assertCapability` in `apps/nexus/src/lib/study-materials.ts`; `errorResponse` in `apps/nexus/src/lib/api-errors.ts` |
| "May this teacher see this student" | `getUserEnrollment` and `resolveClassStaffAccess`, never the roster |
| "All students in the class" | `loadClassroomRoster`, `filterTrackedStudentIds` in `packages/database/src/queries/nexus/roster.ts` |
| Avatars with stage ring | `StudentStageAvatar` plus `useStudentStageFacts` (teacher layout only) |
| Month grid of days | `apps/nexus/src/components/gamification/AttendanceHeatmap.tsx` (`getMonthGrid`, `DAY_LABELS`) |
| Client fetching | `useAuthSWR` in `apps/nexus/src/lib/nexus-swr.ts` |
| Points | `recordGamificationEvent` with the existing `drawing_submitted` event type |
| Flags | `apps/nexus/src/lib/feature-flags.ts`, `FeatureGate`, `nexus_settings['feature_flags']` |
| Nav | `apps/nexus/src/lib/nav-config.tsx` (one item makes it reachable on phone; `nav-config.test.ts` guards it) |
| Page header, empty state, skeletons, people search | `PageHeader`, `@neram/ui` `EmptyState`, MUI `Skeleton`, `PeopleSearchField` |
| Public celebration pattern | `apps/nexus/src/app/api/catchup/celebrate/route.ts` header: server re-derives recipients, client can only narrow, delegated token precheck, no cron variant |

Genuinely new: the rhythm engine, the flip-through UI, a pinch-zoom viewer, a thumbnail at upload, an image inside a Teams post, four small tables and a few columns.

## 7. Data model

One migration file per concern, following the house pattern (tiny, additive, idempotent). The enum change is its own file because `ALTER TYPE ... ADD VALUE` cannot share a transaction with code that uses it.

**7.1 `drawing_submissions`**
- `source_type` CHECK gains `'sketchbook'` (pattern: `supabase/migrations/20260827090600_nexus_exam_drawing_submissions.sql`).
- `thumbnail_url TEXT NULL`: a 400px JPEG the client uploads beside the original (second call to the upload route). Grids load thumbnails only. Benefits every drawing list.
- `prompt_id UUID NULL` (no FK yet, D4). Reserved.
- Sketchbook rows insert with `status = 'completed'` so they never count as pending reviews. The nav badge query in `apps/nexus/src/app/api/nav-badges/route.ts` also excludes `source_type = 'sketchbook'` (a badge counting a wider population than its screen is unclearable).

**7.2 `nexus_sketchbook_practice_days`** (materialised, keeps the rhythm query proportional to days, not sketches)
```
student_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
practice_date        DATE NOT NULL          -- Asia/Kolkata calendar date of submitted_at
sketch_count         INTEGER NOT NULL DEFAULT 1
first_submission_id  UUID REFERENCES drawing_submissions(id) ON DELETE SET NULL
PRIMARY KEY (student_id, practice_date)
```
Maintained in the create and delete routes (upsert on insert; decrement or delete on delete). No backfill: the sketchbook starts empty for everyone, and the 32 old `free_practice` rows stay where they are in the Drawings module, since a practice day with no visible sketch behind it would be a lie in the grid.

**7.3 `nexus_sketchbook_flips`** (the physical peek, and the inbox cursor)
```
id             UUID PK
teacher_id     UUID NOT NULL REFERENCES users(id)
submission_id  UUID NOT NULL REFERENCES drawing_submissions(id) ON DELETE CASCADE
action         TEXT NOT NULL CHECK (action IN ('seen','skipped'))
created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
UNIQUE (teacher_id, submission_id)
```
"Seen by Hari" reads the earliest `seen` row. The inbox is sketchbook rows in the teacher's classrooms with no flip row by this teacher.

**7.4 `nexus_sketchbook_features`** (featuring is per classroom and reversible)
```
id                            UUID PK
submission_id                 UUID NOT NULL REFERENCES drawing_submissions(id) ON DELETE CASCADE
classroom_id                  UUID NOT NULL REFERENCES nexus_classrooms(id) ON DELETE CASCADE
featured_by                   UUID NOT NULL REFERENCES users(id)
caption                       TEXT
teams_channel_id              TEXT NULL
teams_channel_message_id      TEXT NULL
teams_group_chat_message_id   TEXT NULL
card_hash                     TEXT NULL
featured_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
unfeatured_at                 TIMESTAMPTZ NULL
UNIQUE (submission_id, classroom_id)
```
Featuring also sets `is_gallery_visible = true` so the existing gallery and Hall of Fame pick it up.

**7.5 `users.sketchbook_feature_opt_out BOOLEAN NOT NULL DEFAULT false`** (D2). The feature route refuses with a clear reason when set.

**7.6 `notification_event_type`** gains `sketch_reaction`, `sketch_featured`, `sketch_rhythm_nudge`, `sketch_milestone`. Own file, `ADD VALUE IF NOT EXISTS`.

**7.7 `nexus_classrooms.sketchbook_weekly_goal INTEGER NOT NULL DEFAULT 3 CHECK (sketchbook_weekly_goal BETWEEN 1 AND 7)`** (D1). The teacher changes it from the Class rhythm tab. A change applies from the current week onward; past weeks keep the goal they were judged against, so raising the goal never erases a run. To make that true, `nexus_sketchbook_practice_days` is not enough on its own: the rhythm engine takes a list of `{ weekStart, goal }` overrides read from `nexus_sketchbook_goal_history` (`classroom_id, goal, effective_from DATE, set_by, created_at`), one row appended on every change, seeded with the default when the classroom first appears.

RLS: service-role only, like the rest of the Nexus teacher surface. Every route checks access in code.

## 8. API contracts

All routes: `getRequestUser` (fails closed on parent tokens except the parent route), `errorResponse`, `Cache-Control: no-store`, JSON `{ error }` on failure. Prefix `/api/sketchbook`.

| Method and path | Who | Body / query | Returns and behaviour |
|---|---|---|---|
| `POST /entries` | student | `{ original_image_url, thumbnail_url?, caption? }` (image already uploaded via `/api/drawing/upload`) | `{ sketch, rhythm }`. Inserts `drawing_submissions` (source `sketchbook`, status `completed`), upserts the practice day, awards `drawing_submitted` +2 once per day (`source_id = sketch_day_<date>`), returns the fresh rhythm so the toast can say "Day 2 of 3". |
| `DELETE /entries/[id]` | student (own) | | 204. Refused 409 when featured. Repairs the practice day. |
| `GET /me?month=YYYY-MM&summary=1` | student | | `{ rhythm, thenAndNow, months: [{ month, practiceDays, sketches: [...] }] }`. `summary=1` returns only `rhythm`. |
| `GET /students/[id]?month=` | staff with enrollment overlap, or parent of | same shape | Access via `getUserEnrollment` against the caller's classrooms; parents via `assertParentOf`. |
| `GET /featured?classroom=` | student enrolled there, staff | | `{ features: [...] }`. Returns `[]` when `student.sketchbook-featured-shelf` is off (server-enforced, like `catchup-wall`). |
| `GET /inbox?classroom=` | staff | | `{ sketches: [...], remaining }` newest first, unflipped by this teacher, limit 20. |
| `POST /entries/[id]/flip` | staff | `{ action: 'seen' \| 'skipped' }` | Upserts the flip row. Called when the card has been on screen for 1.5 s (seen) or on Next without a reaction (skipped). |
| `POST /entries/[id]/react` | staff | `{ reaction: 'heart' \| 'fire' \| 'wow' \| null, comment? }` | Sets `reaction`, adds a comment when present, `sendNudge` to the student (`sketch_reaction`). Idempotent per teacher and value. |
| `POST /entries/[id]/feature` | staff with `moderate.gallery`, real Graph token | `{ classroom_id, caption }` | Inserts the feature row, `is_gallery_visible = true`, posts the Teams card via `postGroupMessage` (with image, see 10), `sendNudge` (`sketch_featured`). Refuses when opted out, when no Teams team, when the token is `test_`, `imp_` or `par_`. |
| `DELETE /entries/[id]/feature?classroom=` | staff | | Soft-deletes the Teams messages via `removeTeamsAnnouncements`, sets `unfeatured_at`, clears `is_gallery_visible` if no other live feature. |
| `GET /class-rhythm?classroom=` | staff | | `{ goal, students: [{ userId, name, week: boolean[7], run, lastPracticeDate, quietDays }] }` from `loadClassroomRoster` plus practice days in the last 8 weeks. |
| `PATCH /settings?classroom=` | staff with class access (`resolveClassStaffAccess`) | `{ weekly_goal: 1..7 }` | Updates `nexus_classrooms.sketchbook_weekly_goal`, appends a `nexus_sketchbook_goal_history` row effective from the current week's Monday, returns `{ goal }`. |
| `GET /api/nav-badges` | existing | | Gains `sketchbook_inbox` (unflipped count in the teacher's classrooms, 0 when the flag is off). |

Cron (phase 2): `GET /api/cron/sketchbook-rhythm-nudge`, Fridays 12:30 UTC (18:00 IST), `assertCronRequest`, one `sendNudge` per student who is 2 or more days short of the goal with 2 days left, `respectDormancy` default. Never to students who have never uploaded (they get the dashboard card, not a nudge).

## 9. Rhythm engine

`apps/nexus/src/lib/sketchbook-rhythm.ts`, pure, injected `today`, fully unit tested.

```
istDate(iso): 'YYYY-MM-DD'                      // Asia/Kolkata calendar date
weekStart(date): Monday of that ISO week (IST)
goalForWeek(weekStart, history: { effectiveFrom, goal }[]): number   // latest row at or before the week start, else 3
computeRhythm(practiceDates: string[], today: string, history): {
  week: { start, days: boolean[7], count, goal, met }
  run: number          // consecutive completed weeks ending last week, plus this week once met
  bestRun: number
  totalDays: number
  lastPracticeDate: string | null
  quietDays: number    // days since last practice, 0 today
}
thenAndNow(sketches): { first, latest } | null   // 8+ sketches and 30+ days apart
milestoneReached(totalSketches): 7 | 30 | 100 | null
```
Rules: this week never counts against the run until it ends; a week with zero days ends the run; each past week is judged against the goal that was in force at its start (section 7.7); a student with no sketches has `run 0` and no dots filled, and the copy says "Start your rhythm", not "0 of 3". Goal resolution for a student: the classroom of their newest active enrollment (the same "newest wins" rule as `foldStudentFacts`).

## 10. Notifications and the Teams card

- Every student message goes through `sendNudge` with an `eventType` from 7.6. `sketch_reaction` and `sketch_featured` pass `respectDormancy: false` (the student asked for it by uploading); the rhythm nudge keeps the default so dormant students are never chased.
- The featured card: `buildFeaturedSketchHtml({ studentName, caption, imageUrl, nexusUrl })` in `apps/nexus/src/lib/teams-class-announcements.ts`, next to `buildWrapUpHtml`. Body: heading "Featured sketch", the image, one line of caption, "Open in Nexus" link. `cardHash` stored on the feature row so a retry never double-posts.
- Image in the post: two options, decided by a 30-minute spike before phase 1 ends. (a) an `img` tag pointing at the public `drawing-uploads` URL in the HTML body, zero new Graph code. (b) `hostedContents` with the bytes inline (`temporaryId` plus a `hostedContents/<id>/$value` reference), about 40 lines in `postGraphMessage`. Prefer (a) if Teams renders it on phone and desktop; fall back to (b).
- The card goes to both the class group chat and the class channel, which is what `postGroupMessage` does today (assignment channel, else class channel, else the meeting channel). The feature sheet says so: "Posts to the class group chat and channel."
- The post needs the teacher's delegated Graph token (app-only cannot post channel or chat messages), so featuring is always a button press, never a cron.

## 11. Flags, nav, capabilities

Flags in `apps/nexus/src/lib/feature-flags.ts` (ids are persisted, never rename):
- `student.sketchbook`, surface student, group Practice, paths `['/student/sketchbook']`, default OFF.
- `student.sketchbook-featured-shelf`, surface student, paths `[]`, default OFF, enforced in `GET /featured`.
- `staff.sketchbook`, surface staff, group Teaching, paths `['/teacher/sketchbook']`, default ON.
- `parent.sketchbook` (phase 2), default OFF.

Nav in `apps/nexus/src/lib/nav-config.tsx`:
- Student Classroom zone, Practice group: "Sketchbook" (`AutoStoriesOutlinedIcon`). Not promoted to the bottom bar; the dashboard card is the daily door.
- Teacher Teaching panel: "Sketchbooks" after Drawing Reviews, badge key `sketchbook_inbox` in `NavBadgeProvider.PATH_TO_BADGE_KEY`.
- Teacher profile `/teacher/students/[id]`: `SketchbookSection` in the section stack, id `profile-sketchbook`, hung off the lazy `performance` fetch.

Capabilities: react and flip use `assertStaff` plus enrollment overlap; feature uses `assertCapability('moderate.gallery')`. No new capability.

## 12. Edge cases and anti-gaming

| Case | Rule |
|---|---|
| Several sketches in one day | All stored, one practice day, one points award. |
| Upload at 00:10 IST | Counts for the new day (IST, never UTC). |
| Backdating | Not in v1. The date is the upload date. |
| Blank page, duplicate photo, screenshot | v1: nothing automatic; the teacher sees it in the flip and can skip. Phase 3: perceptual-hash duplicate flag and a "looks like a drawing" check on the photo-check pattern; flags only, never blocks. |
| Delete | Own sketch, not featured, confirm dialog with the image. Practice day repaired. Featured sketches need unfeature first (teacher). |
| Opt out of featuring | `users.sketchbook_feature_opt_out`, toggled from the Sketchbook home overflow menu ("Do not feature my sketches"). Feature route refuses with "This student has asked not to be featured." |
| Two classrooms (returning student) | Sketchbook is per student. Feature sheet asks which classroom. The weekly goal comes from the newest active enrollment's classroom. |
| Teacher raises the goal mid-run | Applies from the current week's Monday. Earlier weeks keep the goal they were judged against, so the run survives. |
| Dormant student | Keeps the sketchbook and uploads; appears in class rhythm greyed with the stage ring; gets reaction and featured messages, no rhythm nudges. |
| Teacher without a real Graph token (test, impersonation) | Feature button disabled with the reason; reaction still works. |
| Classroom without a Teams team | Feature still records the feature row and shelf; the Teams part reports "unconfigured" (existing `postGroupMessage` shape). |
| Slow network | Thumbnails only in grids, lazy images, skeleton grid, upload progress bar, retry on failure with the file kept. |
| Offline | Upload button explains "You are offline. Your sketch stays here until you reconnect." (file kept in memory; no queue in v1). |
| HEIC from iPhone | Already handled by `compressImage` (re-encodes as JPEG). |
| 100+ sketches | Month sections paged 30 at a time; `thumbnail_url` keeps the grid light. |

## 13. Phases

**Phase 1, pilot core (one classroom, flags on for it)**
1. Migrations 7.1 to 7.7; types via `pnpm supabase:gen:types`.
2. `sketchbook-rhythm.ts` with tests, including a goal raised mid-run.
3. Queries in `packages/database/src/queries/nexus/sketchbook.ts`: `listSketchbookMonth`, `upsertPracticeDay`, `repairPracticeDay`, `listUnflipped`, `recordFlip`, `featureSketch`, `unfeatureSketch`, `listFeatured`, `classRhythmFacts`, `getGoalHistory`, `setWeeklyGoal`.
4. Routes in section 8 except the cron.
5. Student: home, add sheet (extend `DrawingSubmissionSheet.sourceType` with `'sketchbook'` and pass `submitUrl`), sketch page, dashboard card, profile opt-out toggle.
6. Teacher: flip-through with react and feature, class rhythm tab, student sketchbook view, profile section.
7. Teams card builder plus the image spike.
8. Flags, nav, badge.
9. Tests (section 14) and a ui-ux-pro-max review at 375 and 1280.

**Phase 2, keep them going**
Weekly rhythm nudge cron, monthly recap through `sendNudge`, milestones 7/30/100, then-and-now, featured shelf for classmates, parent portal page.

**Phase 3, depth**
Prompt bank (teacher-curated, optional daily prompt on the dashboard card), duplicate and blank flags, optional metered AI note behind `staff.drawing-eval`, pinch-zoom viewer shared with drawing reviews.

## 14. Testing

- Unit (colocated Vitest): `sketchbook-rhythm.test.ts` (IST week edges, goal met mid-week, run ending, empty history), `RhythmCard.test.tsx`, `SketchGrid.test.tsx` (month sections, thumbnail fallback), `FlipThrough.test.tsx` (keyboard, disabled Feature reasons), `featured-card.test.ts` (`cardHash` stability), route tests for access (student cannot read another student, parent cannot read a non-child, teacher without enrollment overlap gets 403). Assert on DOM values, not jest-dom matchers.
- Query tests: `sketchbook.test.ts` for `upsertPracticeDay` idempotence and `repairPracticeDay`.
- E2E `tests/e2e/sketchbook-nexus-mobile.spec.ts` (Pixel 5, `injectAuthForPage`): student sees the empty state, adds a sketch from a fixture PNG, sees "Day 1 of 3", the sketch appears in the grid; teacher opens Sketchbooks, sees the sketch, reacts, the student's page shows the reaction; `assertNoHorizontalOverflow` on every screen; touch targets 44px+; roles: student denied `/teacher/sketchbook`, parent denied until phase 2.
- Manual on staging: feature to a classroom with a Teams team and confirm the image renders on Teams mobile and desktop; unfeature and confirm the soft delete.

## 15. Pilot metrics (4 weeks, one classroom)

- Share of active students with 3 or more practice days a week (target: 40 percent by week 4).
- Median practice days per student per month.
- Sketches per week, and the share flipped by a teacher within 3 days (target: 90 percent).
- Featured posts per week and the reply and reaction count on the Teams card.
- Drop-off: students who uploaded in week 1 and not in week 4.

## 16. Resolved with the user on 2026-09-12

1. Weekly goal: 3 to start, the teacher raises it to 4 or 5 per classroom later (sections 7.7, 9, screen 7).
2. Reactions: three, Nice, Great, Wow, stored as `heart`, `fire`, `wow` in the existing column.
3. Teams card: both the class group chat and the class channel.
4. Points: keep the +2 once a day through `drawing_submitted`.
