# Neram Assistant: who gets AI answers

Addendum to `2026-10-03-neram-assistant-design.md`. It changes how M2's free questions (Gemini) are rationed. The rest of the assistant is unchanged: the brief, the chips and the guided flows (cannot attend, remind me, add a sketch) use no model and cost nothing.

## Context

AI answers cost money per question, and how useful they are is unproven. The founder does not want students using them freely. The aim is to follow the pattern enterprise apps use for paid AI:
- per-user access;
- a visible per-user allowance;
- a pilot before wider rollout;
- per-user usage and cost for admins;
- an off switch.

The founder's idea, adopted here: AI answers are a reward for being caught up. A student has them while their catch-up is clear, loses them when it is not, and gets them back the moment it is.

## Decisions (founder, 2026-10-04)

| Question | Decision |
|---|---|
| Pilot | Only the Hari heera student test account, via the existing `nexus_settings.assistant_pilot_user_ids`. The rule below applies to that account too, so the drop and the return can be tested. |
| Basis of access | Live, from catch-up. No fixed 30-day grant. |
| A freshly missed class | Counts against access once its catch-up is ready (recording and recap published). It stops counting the moment the catch-up is done. A class whose catch-up is not ready yet, is excused, or has no recording never counts. |
| Late joiners (classes held before they enrolled) | Follow their existing catch-up pace (`weekly_quota`, default 2 a week). Access stays while they are on track and drops in any week they are behind. The message is the same sentence the catch-up page shows. |
| Overrides | Any teacher of the student's classroom can set Always on or Always off, with a required reason and an optional end date. Admins see all overrides. |
| Daily allowance | 10 AI questions a day per student, shown as "7 left today". Admins can change the number without a deploy. It replaces M2's fixed 20. |
| Telling the student | In the assistant only. No notification when access switches, because the catch-up reminders already chase missed classes. |

## The rule

`aiAccess(student, now)` returns `{ on: boolean, reason, detail }`. It is evaluated in this order:

1. **Pilot.** While `assistant_pilot_user_ids` is non-empty and the student is not in it: off, reason `not_in_pilot`. (The whole assistant is already hidden from them by the M1 gate, so this is defence in depth.)
2. **No classroom:** off, reason `no_classroom`.
3. **Override.** The newest override for the student whose `ends_on` is null or today or later:
   - `off`: off, reason `teacher_off`, with the teacher's reason.
   - `on`: on, reason `teacher_on`.
4. **Missed after joining.** Any item in `getCatchupBacklog(...).missed` whose status is `waiting` or `active` makes access off, reason `missed_class`. `detail` lists up to three of those classes (title and IST day) and the total count. Statuses `pending_teacher`, `blocked`, `excused` and `done` never count.
5. **Held before joining.** With a `journey`, compute `computeCatchupPace({ started_on, weekly_quota, total_items: totals.total, completed_items: totals.completed }, today)`. State `behind`: off, reason `behind_pace`, with `detail` = the deficit. The sentence is `describeCatchupPace`.
6. Otherwise: on, reason `caught_up`.

A `getCatchupBacklog` result of null means nothing to catch up on, which counts as caught up.

## Where it is checked

- **Before every model call** (stage 4 of the turn), together with the daily allowance.
  - Off: the reply is the access sentence plus a Catch-up link and the usual chips. There is no model call and the message is stored with `llm = false`.
  - On but the allowance is used up: the allowance sentence.
- **When the panel opens:** `GET /api/assistant/ai-status`. This is per-user, uncacheable, `force-dynamic` and `fetchCache = 'force-no-store'`. It returns `{ on, reason, sentence, link, left_today, daily_limit }`. It is not called on page loads, only when the student opens the assistant.

## What the student sees

- **A status line under the panel header:**
  - On: "AI answers: on, 7 left today".
  - Off for a missed class: "AI answers are off. Catch up on Perspective (Thu 2 Oct) to switch them back on." With more than one: "Catch up on 3 classes, starting with Perspective (Thu 2 Oct)". A Catch-up button links to `/student/catch-up`.
  - Off for pace: "AI answers are off. You are 2 classes behind on your earlier classes. Clear them this week to switch AI answers back on." With a Catch-up button.
  - Off by a teacher: "AI answers are off for your account. Ask your teacher if you think this is a mistake." The teacher's reason is not shown to the student.
- A typed free question while access is off gets the same sentence.
- The free features keep working.

## Teacher and admin controls

- **Teacher, on the student page `/teacher/students/[id]`:** an "AI answers" row.
  - It shows on or off, the reason in words, and the override if any (who, why, until when).
  - Actions: Always on, Always off, or Clear override. The reason is required and capped at 200 characters; the end date is optional.
  - Shown only while `student.assistant-chat` is on.
  - Scope check: `assertStaffSeesStudent` (`lib/sketchbook-access.ts`).
- **Admin, an Assistant section on `/teacher/admin/ai-usage`:**
  - the daily allowance field;
  - a table of students who used AI answers this month (name, access now and why, questions this month, cost this month from `nexus_assistant_messages.cost_usd`);
  - the list of active overrides.
  - Admin only, through the page's existing gate.

## Data

- New migration `20261102090200_nexus_assistant_ai_overrides.sql`:
  - `nexus_assistant_ai_overrides`:
    - `id uuid`;
    - `student_id uuid` (references `users`, on delete cascade);
    - `mode text`, check `on` or `off`;
    - `reason text not null`;
    - `set_by uuid` (references `users`);
    - `set_at timestamptz default now()`;
    - `ends_on date`;
    - `cleared_at timestamptz`;
    - `cleared_by uuid`.
  - Index on `(student_id, set_at desc)`.
  - RLS on, no policies (service role only).
  - An active override has `cleared_at` null and `ends_on` null or today or later. Clearing stamps `cleared_at` and `cleared_by`, so history is kept.
- `nexus_settings` key `assistant_ai_daily_limit`: an integer, default 10, clamped to 0 to 50. Zero means AI answers are off for everyone and the free features still work.
- Usage per student: `nexus_assistant_messages` (`role='assistant'`, `llm=true`) joined to threads by `user_id`. M2 already stores `cost_usd`, tokens and the model there.

## Cost

- **Estimate** (cheap tier, about 3 model calls a question): about ₹0.08 a question.
- **Worst case** at 10 a day: about ₹25 a student a month.
- **The $25 monthly cap** in `ai_controls` still stops every AI call app-wide when reached.
- **The pilot measures real cost:** the admin section shows it per student from day one.

## Testing

- **Unit tests for `aiAccess`:**
  - one test per reason;
  - each catch-up status counted or ignored as above;
  - an override that has ended is ignored;
  - a cleared override is ignored;
  - the newest override wins;
  - pace `behind` versus `on_track`;
  - a null backlog counts as caught up.
- **Turn tests:**
  - access off: no Gemini call, the access sentence, `llm = false`;
  - the allowance reached;
  - the allowance read from settings, with clamping.
- **Route tests:**
  - `ai-status` returns 404 while the flag is off;
  - the override routes enforce staff scope, the required reason and the 200-character cap;
  - a student cannot set an override.
- **E2E (nexus-mobile):**
  - the status line on and off states with stubbed responses;
  - the Catch-up button target;
  - no horizontal overflow at 375.
- **ui-ux-pro-max:** run before and after the panel status line and the teacher row.

## Out of scope

Notifications on a switch, rewards beyond catch-up (attendance streaks, sketchbook rhythm), and a student-facing history of their access.
