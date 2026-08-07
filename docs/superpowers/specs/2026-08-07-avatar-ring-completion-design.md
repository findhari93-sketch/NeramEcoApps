# Finishing the cohort ring: every student face in Nexus wears it

Date: 2026-08-07
Status: approved, ready for planning

## The problem

The cohort ring was built on 2026-08-06 and adopted at roughly forty-five call
sites over two passes. It is still missing. A teacher opening
`/teacher/tests` and switching to the Student tests tab sees a column of bare
faces, and the same is true on the QB paper progress matrix, the catch-up
joiner list, the issues queue, the evaluate queue, the drawing gallery, the
exam-recall threads and eight other screens.

Two passes were done by hunting for screens. This one is done by enumerating
every avatar render in the app and justifying each one that stays plain, so the
answer is a closed list rather than a longer list.

The sweep found 87 avatar renders across 42 files in `apps/nexus/src`.
Twenty-two of them are student faces that should be ringed and are not.

## The important discovery

`StudentIdentityLine` was excluded from the last pass on the reasoning that it
already prints the stage as a text chip, so a ring would state the same fact
twice. That reasoning is now overruled. The chip and the ring do different
jobs: the chip is a label you read, the ring is a shape you scan. On a list of
thirty students a teacher scans, they do not read. Both stay.

This also means the exception list in the previous design was not a rule, it
was a guess. Hence the ESLint guard in this one.

## Scope

Nexus teacher zone only. `StudentStageFactsProvider` stays mounted in
`app/(teacher)/layout.tsx` and nowhere else, so student pages, the parent
portal and the admin app continue to render plain faces. Dormancy is a staff
judgement, and a classmate seeing who paused would be a real harm.

Mixed lists (comment threads, exam recall, admin users, device sessions) are in
scope. `StudentAvatar` returns a plain avatar for any id that is not a known
active student, so a teacher, an alumnus or a parent in those lists looks
exactly as they do today.

## Part A: the 22 call sites

Every payload already carries a user id. **No API route changes are needed.**

| # | File | Line | Current render | userId source |
|---|---|---|---|---|
| 1 | `components/students/StudentIdentityLine.tsx` | 64 | `UserAvatar` 24/30 | `student.id` |
| 2 | `components/question-bank/PaperProgressMatrix.tsx` | 100 | `UserAvatar` 28 | `row.student_id` |
| 3 | `components/question-bank/PaperProgressMatrix.tsx` | 229 | `UserAvatar` 36 | `row.student_id` |
| 4 | `app/(teacher)/teacher/course-plans/[planId]/catchup/page.tsx` | 151 | `Avatar` 38, gold | `j.user_id` |
| 5 | `app/(teacher)/teacher/course-plans/[planId]/catchup/page.tsx` | 186 | `Avatar` 44, gold | `selectedJoiner.user_id` |
| 6 | `app/(teacher)/teacher/issues/page.tsx` | 1178 | `Avatar` 32 | `issue.student_id` |
| 7 | `app/(teacher)/teacher/evaluate/page.tsx` | 204 | `Avatar` 40 | `sub.student.id` |
| 8 | `app/(teacher)/teacher/devices/page.tsx` | 127 | `Avatar` 40 | `student.user_id` |
| 9 | `app/(teacher)/teacher/devices/page.tsx` | 233 | `UserAvatar` 48 | `detail.user_id` |
| 10 | `app/(teacher)/teacher/admin/users/page.tsx` | 351 | `UserAvatar` 40 | `user.id` |
| 11 | `components/timetable/MeetingRecap.tsx` | 169 | `UserAvatar` 28 | `review.student.id` |
| 12 | `components/study-materials/StudyCommentPanel.tsx` | 151 | `UserAvatar` 32 | `c.author.id` |
| 13 | `components/study-materials/ChapterWorkspaceRail.tsx` | 370 | `Avatar` 32 | `r.student_id` |
| 14 | `components/drawings/GalleryCard.tsx` | 140 | `UserAvatar` sx 26/32 | `post.student.id` |
| 15 | `components/drawings/CommentSection.tsx` | 90 | `UserAvatar` 28 | `c.author.id` |
| 16 | `components/drawings/FeaturedSeniors.tsx` | 136 | `UserAvatar` sx 48 | `s.user_id` |
| 17 | `components/exam-recall/TipCard.tsx` | 73 | `UserAvatar` 32 | `tip.user.id` |
| 18 | `components/exam-recall/CommentThread.tsx` | 56 | `UserAvatar` 28 | `comment.user.id` |
| 19 | `components/exam-recall/VersionTimeline.tsx` | 119 | `UserAvatar` 28 | `version.author.id` |
| 20 | `app/(teacher)/teacher/exam-recall/thread/[id]/page.tsx` | 598 | `UserAvatar` 28 | `version.author.id` |
| 21 | `app/(teacher)/teacher/exam-recall/thread/[id]/page.tsx` | 808 | `UserAvatar` 32 | `confirm.user.id` |
| 22 | `app/(teacher)/teacher/exam-recall/page.tsx` | 513 | `Avatar` 32 | `thread.contributors[0].id` |

Line numbers are a starting point for the implementer, not an anchor. Locate by
the surrounding code.

Note that three of these files (`GalleryCard`, `CommentSection`,
`StudyCommentPanel`) are shared with the student zone. That is safe and needs no
conditional: with no provider mounted there, `factsFor` returns null for every
id and the plain avatar renders.

## Part B: StudentIdentityLine keeps its chips

`StudentIdentityLine` gains the ring and keeps both the dormant chip and the
stage chip. The `onClickStage` affordance stays, because on the tests screen it
is how a teacher sets a missing stage.

Its two densities are 24px (compact) and 30px (card). The glyph is suppressed
below 28px, so compact rows get ring only. That is acceptable here and only
here, because the chip beside it already carries the label in words. Do not
raise the compact size to force a glyph in; the 24px row height is deliberate.

The line's existing `sx={{ flexShrink: 0, opacity: dormant ? 0.6 : 1 }}` is
removed entirely, because after the swap every part of it is dead. The wrapper
sets `flexShrink: 0` itself. `StudentStageAvatar` spreads its dormant treatment
after the caller's `sx`, so its `opacity: 0.75` replaces the 0.6 rather than
compounding with it, and in the non-dormant case the value is 1, a no-op.
Leaving it in would read as a live rule that no longer does anything.

## Part C: seven raw MUI Avatars

Sites 4, 5, 6, 7, 8, 13 and 22 use a bare `<Avatar>` with hand-written initials
(`name.charAt(0)`, `name.slice(0,2)`) and a hardcoded `bgcolor`. Swapping them
to `StudentAvatar` replaces those with the shared deterministic initials and
colour from `getAvatarInitials` / `getAvatarColor`, and adds the long-press
photo viewer. That is a consistency win and is intended.

One exception: the catch-up joiner list (sites 4 and 5) uses gold `#F9A825`
throughout its design. Preserve it by passing
`sx={{ bgcolor: '#F9A825' }}`. `StudentStageAvatar` merges caller `sx` before
the dormant filter, so the gold cannot defeat the greyscale.

## Part D: layout, the actual risk

The ring wrapper is `size + 8` in both dimensions, and the unringed fallback
reserves the same box. Every swapped row therefore grows by 8px in each
direction. Two places measure the avatar column explicitly and will clip or
misalign:

- `PaperProgressMatrix.tsx:40`, `const NAME_W = 180`. The sticky name column
  holds a 28px avatar plus name and subtitle. Widen to 188.
- `MeetingRecap.tsx:168`, `<ListItemAvatar sx={{ minWidth: 36 }}>` around a
  28px avatar. The ringed box is 36px with no gap left. Widen to 44.

Sites 14 and 16 (`GalleryCard`, `FeaturedSeniors`) size themselves through
`sx={{ width, height }}` rather than the `size` prop. `StudentAvatar` sizes its
wrapper from `size`, so those must be converted to `size={...}` or the ring
will not match the face. `GalleryCard` is responsive (26 compact, 32 normal),
so it becomes `size={isCompact ? 26 : 32}`.

Every swapped screen needs a look at 375px for horizontal overflow, since 8px
per avatar is real on a phone.

## Part E: the ESLint guard

Extend the existing `no-restricted-syntax` block in
`apps/nexus/.eslintrc.json`, which already bans bare `<video>` and hand-built
Gemini URLs in the same style.

Three selectors:

```
JSXOpeningElement[name.name='UserAvatar']
JSXOpeningElement[name.name='GraphAvatar']
JSXOpeningElement[name.name='Avatar']:has(JSXAttribute[name.name='src'])
```

The third selector is the careful one. A bare `<Avatar>` with no `src` is an
icon badge, not a face: the welcome screen's 92px accent circle, the course
plan shell's header glyph, the issues activity dot. Those stay legal. An
`<Avatar>` carrying a `src` is showing a photograph of a person, and that is
what the rule is for.

Message text, in the house style of the existing rules: state what to use
instead and why the rule exists, so the next person does not have to find this
document.

### The allowlist, as `overrides` entries with `no-restricted-syntax: off`

Each entry needs a comment saying why. The categories:

**The components themselves** (they are what everyone else must call):
`src/components/students/StudentAvatar.tsx`,
`src/components/students/StudentStageAvatar.tsx`,
`src/components/GraphAvatar.tsx`.

**The signed-in person's own face.** You do not need a ring to tell you what
you are: `src/components/TopBar.tsx`, `src/components/DesktopSidebar.tsx`,
`src/components/profile/ProfileHero.tsx`,
`src/components/PhotoRequiredGate.tsx`,
`src/components/WelcomeOrientation.tsx`,
`src/components/NoClassroomWelcome.tsx`,
`src/components/AlumniAccessEnded.tsx`,
`src/app/(teacher)/teacher/course-plans/page.tsx`.

**Stacked `AvatarGroup` strips.** MUI needs bare `Avatar` children for its
overlap margins, and the `size + 8` wrapper breaks them. A ring is illegible at
24px under a stack anyway: `src/components/exam-schedule/RecentlyCompletedStrip.tsx`,
`src/components/question-bank/ContributorAvatars.tsx`,
`src/components/exam-recall/ThreadCard.tsx`.

**Always a staff face, with no user id in the payload.** Threading one in would
buy nothing: `src/components/timetable/views/UpNextHero.tsx` (the class tutor),
`src/components/timetable/class-panel/ClassTab.tsx` (a labelled role row).

**No `users.id` exists yet.** These are Entra directory entries, not users:
`src/components/AvailableStudentsSection.tsx`.

**Zones with no provider**, where a ring would never render and the rule would
only generate noise: `src/app/(student)/**`, `src/app/(parent)/**`.

`src/components/students/StudentIdentityLine.tsx` is deliberately NOT on this
list. It is being fixed, not excused.

## Part F: tests

**Unit.** Extend `src/components/students/StudentAvatar.test.tsx` for the props
this work exercises: `sx` passthrough surviving alongside the dormant filter,
and the `size + 8` reservation holding when `factsFor` returns null.

**Lint as a test.** A check that the allowlist has not rotted: for every path
in the `overrides` allowlist, assert the file still exists. A renamed file
leaves a dead entry and silently re-permits nothing, but a deleted one hides
that the exception is gone. This is a small Vitest file reading
`.eslintrc.json`.

**E2E.** A Playwright spec at 375px following the mandatory template
(`tests/e2e/`, `nexus-mobile` project):

- A teacher opens `/teacher/tests`, switches to Student tests, and a known
  seeded student row renders an element with the ring `aria-label`
  (`StudentStageAvatar` already emits `"{label}: {tooltip}"`).
- `assertNoHorizontalOverflow()` on that page.
- The same two assertions on `/teacher/evaluate` and on the QB paper progress
  matrix, as representatives of the raw-`Avatar` swap and the fixed-width
  column fix.
- A negative case: the signed-in teacher's own avatar in the top bar carries no
  ring `aria-label`.

**Lint must pass**, which is itself the proof that no swap was missed.

## Out of scope

- Mounting the provider in the student or parent zone.
- The admin app, which has its own avatar components and no stage-facts route.
- Any change to `/api/students/stage-facts`, to `StudentStageAvatar`'s visual
  design, or to the vocabulary in `lib/student-stage.ts`.
- Deployment. Code changes only, per the standing rule.
