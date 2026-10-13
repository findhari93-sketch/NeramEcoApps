# Flip through: a grade per drawing, saved on swipe

Date: 2026-10-10
Status: approved in chat, awaiting spec review
Apps: Nexus (teacher flip through, review screen, student sketchbook), packages/database

## Why

A teacher on a phone wants to grade a practice drawing, react to it and maybe
comment, then swipe to the next one, with everything saved together. Today a
reaction tap sends at once and moves the card on, a comment used to move it on
too, and there is no per-drawing grade at all. The "Drawing: Not rated" chip on
the card is the student's overall level (one per student, managers only), not a
grade for this sheet.

## Decisions (from the founder)

1. Each drawing gets its own grade: Top, Mid or Needs practice. Any teacher who
   can see the student can set it. The student's overall level stays as it is.
2. The student sees the grade, on their sketchbook and in the message.
3. A drawing is **evaluated** when it has a grade **and** a reaction. The
   comment is optional. Feature is optional.
4. Swiping on a half done card saves what was given and moves on. The drawing
   stays in the flip through list until it is evaluated.

## The card (phone first)

Header: avatar, name, date, the student's overall level chip (read only
context, unchanged), the "n of N" counter, and a status chip for this drawing:
`Needs grade`, `Needs reaction` or `Evaluated`.

Body: the sketch, the student's note, then "Your comment" lines (as built on
2026-10-10).

Dock, top to bottom:
1. **Grade row (new):** label "Grade", three equal toggle buttons Top / Mid /
   Needs practice, 44px tall, one selected at a time, tap again to clear.
2. **Reactions:** Nice / Great / Wow, as today.
3. **Tools:** Previous, Comment, Feature, Review, Next, as today.

The sketch's max height on a phone drops by the grade row's height
(`calc(100dvh - 320px)` becomes about `calc(100dvh - 372px)`, keeping the
280px floor).

### What a tap does

Nothing leaves the device on a tap. Grade, reaction and comment build a
**draft** for this card; tapping again changes it. The status chip updates live
from the draft.

### What leaving the card does

Next, Previous, swipe left or swipe right:
- If the draft is empty, it is a skip (Next) or plain navigation (Previous), as
  today.
- Otherwise the draft is **held for 4 seconds** (`UNDO_WINDOW_MS`) and the card
  changes at once. The status bar reads, for example,
  "Sent to Anuvika: Mid, Wow and comment" with **Undo**. Undo cancels the send,
  returns to that card and restores the draft. After the window it is sent as
  one request. Leaving the screen or hiding the tab flushes held sends (as today).
- The 1/2/3 keys set the reaction; a new Q/W/E is **not** added (YAGNI).

This replaces the "a reaction moves on after 250 ms" behaviour and the
comment-only hold from earlier today; both become the one draft. Twin photos of
the same sheet are taken off the stack when the draft is sent with a grade and
a reaction (evaluated), and put back by Undo.

## Data

Migration `supabase/migrations/20261118090000_drawing_grade.sql`:

```sql
alter table drawing_submissions
  add column if not exists drawing_grade text
    check (drawing_grade in ('top', 'mid', 'needs_practice')),
  add column if not exists graded_at timestamptz,
  add column if not exists graded_by uuid references users(id),
  add column if not exists evaluated_at timestamptz;

-- Everything a teacher already answered stays answered: no flood of old
-- sketches coming back as "Needs grade".
update drawing_submissions
   set evaluated_at = coalesce(reviewed_at, now())
 where evaluated_at is null
   and assignment_id is null
   and (reaction is not null or reviewed_at is not null);

create index if not exists drawing_submissions_unevaluated_idx
  on drawing_submissions (submitted_at desc)
  where evaluated_at is null and assignment_id is null;
```

`evaluated_at` is the single rule every reader uses. The server sets it the
first time a drawing has both `drawing_grade` and `reaction`, and clears it if
either is cleared. Types: `packages/database/src/types` gains
`DrawingGrade = 'top' | 'mid' | 'needs_practice'` and the four columns
(regenerate with `pnpm supabase:gen:types`).

## API

`POST /api/sketchbook/entries/[id]/react` (the existing save route) accepts
`{ grade?: DrawingGrade | null, reaction?: SketchbookReaction | null, comment?: string }`.
Absent fields are left as they are. It writes grade (with `graded_at`,
`graded_by`), reaction and comment, recomputes `evaluated_at`, records the flip
as `seen`, and sends **one** sendNudge message when anything changed. Response:
`{ reaction, grade, evaluated }`.

The review screen's save (`PATCH /api/drawing/submissions/[id]/review`) accepts
`drawing_grade` too and applies the same `evaluated_at` rule.

## The list and badges

`listUnflipped` (`packages/database/src/queries/nexus/sketchbook.ts`) changes
its candidate filter from `reaction is null and reviewed_at is null` to
`evaluated_at is null`, and stops treating a comment or a live feature as
"answered". A drawing this teacher already flipped past with nothing given
(no grade, no reaction) stays hidden from that teacher, as today. A half done
drawing (a grade or a reaction, not both) shows to every teacher, including
the one who started it, whatever their flips say. (Built this way because a
`seen` flip is recorded automatically after 1.5 s on screen, so "only a skip
hides it" would have brought back every drawing a teacher glanced at.) Each
row also carries `drawing_grade` so the card can show `Needs grade` or
`Needs reaction` on a returning drawing.
The nav badge (`/api/nav-badges`) uses the same query, so it follows.

## What the student gets

Message, built from what changed in that save (`lib/sketchbook-messages.ts`):
- Subject: "Hari reacted to your sketch" when a reaction is in it, otherwise
  "Hari graded your sketch", otherwise "Hari commented on your sketch".
- Body: the reaction line, then "Grade: Mid.", then "Hari wrote: ..." for a
  comment, each only when present.

Sketchbook page (`SketchPageView.tsx`): a grade chip ("Grade: Mid") beside the
reaction chip. Needs practice reads "Grade: Needs practice", in the same neutral
style as the others (no red).

## Review screen

`/teacher/drawing-reviews/[id]` shows the same grade row above the reactions
(via `TeacherSketchActions`). Its existing one-send rule
(`lib/practice-review-changes.ts`) counts a grade change as a change, so Send &
next carries it.

## Out of scope

Grades on assignment or exam drawings (they have their own review and rubric),
reports or charts of grades, changing the student's overall level from grades.

## Tests

- Unit: `evaluated_at` rule (grade only, reaction only, both, clearing one);
  message wording for every combination; `listUnflipped` keeps half done and
  drops evaluated and own-skipped drawings.
- Component (`FlipThrough.test.tsx`): taps do not move the card; Next and both
  swipes send one request with grade, reaction and comment; Undo restores the
  card and draft; an empty Next is a skip; status chip text.
- E2E (Playwright, 375px and 1280px): grade, react, comment, swipe; the
  drawing leaves the list; a reaction-only drawing comes back as Needs grade;
  no horizontal overflow; touch targets at least 44px.
- ui-ux-pro-max review of the card at 375px and desktop before calling it done.

## Rollout

The migration ships in the normal deploy. No env vars, no flags. Staging first.
