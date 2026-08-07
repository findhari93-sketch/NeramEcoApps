# Avatar Ring Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every student face rendered anywhere in the Nexus teacher zone wears the cohort ring, and an ESLint rule stops the next new screen from missing it.

**Architecture:** `StudentAvatar` already resolves stage and dormancy from a session-wide lookup keyed by `users.id`, and falls back to a plain avatar for anyone it does not recognise. This work is therefore 22 mechanical call-site swaps plus two fixed-width column corrections, followed by a lint rule that makes the remaining plain avatars an explicit, justified allowlist.

**Tech Stack:** Next.js 14 App Router, MUI v5, `@neram/ui` (`UserAvatar`), Vitest + Testing Library, Playwright, ESLint `no-restricted-syntax` with esquery selectors.

## Global Constraints

- **No em dashes (`—`), double dashes (`--`), or `&mdash;`** in any user-visible content, comment, or commit message. Use commas, colons, periods, or parentheses.
- **Never deploy, push, or run deploy scripts.** Code changes and local commits only.
- **Mobile-first.** Every touched screen must be checked at 375px with no horizontal overflow.
- The provider stays mounted in `apps/nexus/src/app/(teacher)/layout.tsx` **only**. Do not mount it in the student or parent zone.
- `StudentAvatar` import path from a component: `@/components/students/StudentAvatar`.
- `StudentAvatar` sizes its wrapper from the `size` **prop**, never from `sx.width`. Any call site currently sizing through `sx={{ width, height }}` must be converted to `size={...}`.
- Do not change `StudentStageAvatar`'s visual design, `/api/students/stage-facts`, or the vocabulary in `apps/nexus/src/lib/student-stage.ts`.

**Spec:** `docs/superpowers/specs/2026-08-07-avatar-ring-completion-design.md`

**The swap, in general form.** Every task below is an instance of this:

```tsx
// before
<UserAvatar src={x.avatar_url} name={x.name} size={28} />
// after
<StudentAvatar userId={x.id} src={x.avatar_url} name={x.name} size={28} />
```

and for a raw MUI Avatar carrying hand-written initials:

```tsx
// before
<Avatar src={x.avatar_url || undefined} sx={{ width: 32, height: 32, fontSize: '0.75rem' }}>
  {x.name?.charAt(0) || 'S'}
</Avatar>
// after
<StudentAvatar userId={x.id} src={x.avatar_url} name={x.name} size={32} />
```

The initials and the fallback colour come from `getAvatarInitials` / `getAvatarColor` after the swap. That is intended. Drop the `fontSize` override, which existed only to size hand-written initials.

---

### Task 1: StudentIdentityLine, the screen in the bug report

**Files:**
- Modify: `apps/nexus/src/components/students/StudentIdentityLine.tsx:25,64-71`
- Test: `apps/nexus/src/components/students/StudentIdentityLine.test.tsx` (create)

**Interfaces:**
- Consumes: `StudentAvatar` from `@/components/students/StudentAvatar`, props `{ userId, src, name, size }`.
- Produces: nothing new. `StudentIdentityLineProps` is unchanged; `StudentIdentity.id` was already required.

This is the component behind `/teacher/tests` → Student tests. It keeps both chips: the chip is a label you read, the ring is a shape you scan, and on a list of thirty students a teacher scans.

- [ ] **Step 1: Write the failing test**

Create `apps/nexus/src/components/students/StudentIdentityLine.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import StudentIdentityLine from './StudentIdentityLine';
import * as facts from './StudentStageFactsProvider';

/**
 * The line was left plain in the first two adoption passes on the reasoning
 * that its chip already prints the stage. A teacher scanning thirty rows does
 * not read chips, so both signals stay and this test pins that decision down.
 */
describe('StudentIdentityLine', () => {
  it('wears the ring and keeps the chip', () => {
    vi.spyOn(facts, 'useStudentStageFacts').mockReturnValue({
      ready: true,
      factsFor: (id) => (id === 's1' ? { stage: '11th' as const, dormant: false } : null),
    });

    render(
      <StudentIdentityLine student={{ id: 's1', name: 'Nithya Raman', current_standard: '11th' }} />
    );

    // The ring, from StudentStageAvatar's aria-label.
    expect(screen.getByLabelText(/Class 11/)).toBeTruthy();
    // The chip, still there.
    expect(screen.getAllByText(/Class 11/).length).toBeGreaterThan(0);
  });

  it('stays plain for someone who is not a tracked student', () => {
    vi.restoreAllMocks();
    render(<StudentIdentityLine student={{ id: 'teacher-1', name: 'A Teacher' }} />);
    expect(screen.queryByLabelText(/Class 1[12]|Break Year|Dormant/)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/nexus && npx vitest run src/components/students/StudentIdentityLine.test.tsx`
Expected: FAIL on `getByLabelText(/Class 11/)`, because the line renders a bare `UserAvatar` with no aria-label.

- [ ] **Step 3: Swap the avatar**

In `StudentIdentityLine.tsx`, change the import on line 25 from

```tsx
import { Box, Typography, UserAvatar } from '@neram/ui';
```

to

```tsx
import { Box, Typography } from '@neram/ui';
import StudentAvatar from './StudentAvatar';
```

and replace lines 64 to 71:

```tsx
      <StudentAvatar
        userId={student.id}
        name={name}
        src={student.avatar_url || undefined}
        size={density === 'compact' ? 24 : 30}
      />
```

The old `sx={{ flexShrink: 0, opacity: dormant ? 0.6 : 1 }}` goes away entirely. The wrapper sets `flexShrink: 0` itself, and `StudentStageAvatar` spreads its dormant treatment after the caller's `sx`, so `opacity: 0.75` would replace the `0.6` rather than compound with it. Leaving it would read as a live rule that does nothing.

- [ ] **Step 4: Update the component's header comment**

The comment block at the top explains the chips. Add a paragraph after the "two chips are separate components" paragraph:

```
 * The avatar carries the same two facts as a ring, which is deliberate
 * duplication. A chip is a label you read; a ring is a shape you scan. On a
 * list of thirty students a teacher scans, and the two densities here (24px
 * and 30px) both sit below the size where a glyph is legible, so the chip is
 * what makes the state readable once you stop scanning and start reading.
```

- [ ] **Step 5: Run the test and the neighbouring one**

Run: `cd apps/nexus && npx vitest run src/components/students/`
Expected: PASS, including the existing `StudentAvatar.test.tsx`.

- [ ] **Step 6: Type-check and commit**

```bash
pnpm type-check --filter=@neram/nexus
git add apps/nexus/src/components/students/StudentIdentityLine.tsx apps/nexus/src/components/students/StudentIdentityLine.test.tsx
git commit -m "fix(nexus): give the student tests list the cohort ring it was missing"
```

---

### Task 2: The two fixed-width columns

**Files:**
- Modify: `apps/nexus/src/components/question-bank/PaperProgressMatrix.tsx:32,40,100,229`
- Modify: `apps/nexus/src/components/timetable/MeetingRecap.tsx:168-173`

**Interfaces:**
- Consumes: `StudentAvatar` from `@/components/students/StudentAvatar`.
- Produces: nothing. `NAME_W` stays a module-private constant.

These two are separated from the rest because they are the only sites where the ring's extra 8px collides with a hardcoded width. Getting them wrong clips a student's name, which is worse than no ring at all.

- [ ] **Step 1: PaperProgressMatrix, widen the sticky name column**

Line 40 currently reads `const NAME_W = 180;`. The comment above it describes `CELL_W`, not this. Change to:

```tsx
const NAME_W = 188;
```

and add above it:

```tsx
/** 180 for the name, plus the 8px the cohort ring adds to the avatar box. */
```

- [ ] **Step 2: PaperProgressMatrix, swap both avatars**

Change the import on line 32: remove `UserAvatar` from the `@neram/ui` import list, and add after the `PaperFacePips` import:

```tsx
import StudentAvatar from '@/components/students/StudentAvatar';
```

Line 100 (desktop table row):

```tsx
                  <StudentAvatar userId={row.student_id} name={row.student_name} src={row.avatar_url} size={28} />
```

Line 229 (mobile card):

```tsx
              <StudentAvatar userId={row.student_id} name={row.student_name} src={row.avatar_url} size={36} />
```

- [ ] **Step 3: MeetingRecap, widen the list avatar slot and swap**

Add the import:

```tsx
import StudentAvatar from '@/components/students/StudentAvatar';
```

and remove `UserAvatar` from the `@neram/ui` import list if it is otherwise unused in the file.

Replace lines 168 to 174:

```tsx
                  {/* 36 fits a bare 28px avatar. The ring makes the box 36, so
                      the slot needs 44 or the name loses its gap. */}
                  <ListItemAvatar sx={{ minWidth: 44 }}>
                    <StudentAvatar
                      userId={review.student.id}
                      src={review.student.avatar_url}
                      name={review.student.name}
                      size={28}
                    />
                  </ListItemAvatar>
```

- [ ] **Step 4: Type-check**

Run: `pnpm type-check --filter=@neram/nexus`
Expected: no errors. If `UserAvatar` is reported as unused, remove it from the import.

- [ ] **Step 5: Commit**

```bash
git add apps/nexus/src/components/question-bank/PaperProgressMatrix.tsx apps/nexus/src/components/timetable/MeetingRecap.tsx
git commit -m "fix(nexus): ring the paper matrix and meeting recap, and widen the columns that measured a bare face"
```

---

### Task 3: Teacher pages built on raw MUI Avatars

**Files:**
- Modify: `apps/nexus/src/app/(teacher)/teacher/course-plans/[planId]/catchup/page.tsx:151-153,186-188`
- Modify: `apps/nexus/src/app/(teacher)/teacher/issues/page.tsx:1178-1183`
- Modify: `apps/nexus/src/app/(teacher)/teacher/evaluate/page.tsx:204-209`
- Modify: `apps/nexus/src/app/(teacher)/teacher/devices/page.tsx:127-132,233`
- Modify: `apps/nexus/src/app/(teacher)/teacher/admin/users/page.tsx:351-358`

**Interfaces:**
- Consumes: `StudentAvatar` from `@/components/students/StudentAvatar`.
- Produces: nothing.

Seven of these render `<Avatar>{initials}</Avatar>` with a hardcoded `bgcolor`. After the swap, initials and colour come from the shared deterministic helpers and the long-press photo viewer comes for free.

- [ ] **Step 1: catch-up joiners, both faces, keeping the gold**

`catchup/page.tsx` already imports from MUI. Add:

```tsx
import StudentAvatar from '@/components/students/StudentAvatar';
```

Line 151, inside the joiner list:

```tsx
                    <StudentAvatar
                      userId={j.user_id}
                      src={j.user?.avatar_url}
                      name={j.user?.name}
                      size={38}
                      // This screen is gold throughout. StudentStageAvatar merges
                      // caller sx before the dormant filter, so the colour cannot
                      // defeat the greyscale.
                      sx={{ bgcolor: '#F9A825' }}
                    />
```

Line 186, the header card:

```tsx
                        <StudentAvatar
                          userId={selectedJoiner?.user_id}
                          src={selectedJoiner?.user?.avatar_url}
                          name={selectedJoiner?.user?.name}
                          size={44}
                          sx={{ bgcolor: '#F9A825', fontWeight: 800 }}
                        />
```

- [ ] **Step 2: issues queue row**

`issues/page.tsx` already imports `StudentAvatar` (it is used at line 626). Replace lines 1178 to 1183:

```tsx
                <StudentAvatar
                  userId={issue.student_id}
                  src={issue.student_avatar}
                  name={issue.student_name}
                  size={32}
                  sx={{ mt: 0.25 }}
                />
```

Line 1067 is the staff assignee picker. It carries a `src`, so the lint rule in Task 6 will catch it. Convert it too: a staff member simply falls back to a plain face, and on the rare row where the assignee is a student the ring is useful.

```tsx
            <StudentAvatar userId={option.id} src={option.avatar_url} name={option.name} size={28} />
```

Leave line 499 alone. It is an activity glyph with no `src` and no person behind it.

- [ ] **Step 3: evaluate queue row**

`evaluate/page.tsx` already imports `StudentAvatar` (used at line 256). Replace lines 204 to 209:

```tsx
              <StudentAvatar
                userId={sub.student.id}
                src={sub.student.avatar_url}
                name={sub.student.name}
                size={40}
              />
```

- [ ] **Step 4: devices, card and detail**

Add the import to `devices/page.tsx`:

```tsx
import StudentAvatar from '@/components/students/StudentAvatar';
```

Replace lines 127 to 132:

```tsx
          <StudentAvatar
            userId={student.user_id}
            src={student.user_avatar}
            name={student.user_name}
            size={40}
          />
```

Replace line 233:

```tsx
              <StudentAvatar userId={detail.user_id} src={detail.user_avatar} name={detail.user_name} size={48} />
```

- [ ] **Step 5: admin users list**

Replace lines 351 to 358 in `admin/users/page.tsx`, keeping whatever `sx` the current call carries other than colour overrides that only styled hand-written initials:

```tsx
                  <StudentAvatar
                    userId={user.id}
                    src={user.avatar_url}
                    name={user.name}
                    size={40}
                  />
```

Remove `UserAvatar` from the `@neram/ui` import if unused, and add the `StudentAvatar` import.

This list mixes staff and students. Staff fall back to the plain face they have today, which is the whole point of the fallback.

- [ ] **Step 6: Pin the `sx` passthrough that the gold depends on**

The catch-up screens pass `sx={{ bgcolor: '#F9A825' }}` through `StudentAvatar` into `StudentStageAvatar`, which must merge it BEFORE the dormant greyscale so a caller's colour cannot undo the dimming. Add to `apps/nexus/src/components/students/StudentAvatar.test.tsx`, inside the existing `describe` block:

```tsx
  it('passes sx through to a ringed avatar, and the dormant filter still wins', () => {
    stub({ 's3': { stage: '12th', dormant: true } });
    const { container } = render(
      <StudentAvatar userId="s3" name="Gold Person" sx={{ bgcolor: '#F9A825' }} />
    );
    const avatar = container.querySelector('.MuiAvatar-root') as HTMLElement;
    const style = getComputedStyle(avatar);
    expect(style.filter).toContain('grayscale');
    expect(style.backgroundColor).not.toBe('');
  });
```

- [ ] **Step 7: Type-check and lint**

Run: `pnpm type-check --filter=@neram/nexus && pnpm lint --filter=@neram/nexus`
Expected: no errors. Unused `Avatar` / `UserAvatar` imports must be removed.

Run: `cd apps/nexus && npx vitest run src/components/students/`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add "apps/nexus/src/app/(teacher)/teacher" apps/nexus/src/components/students/StudentAvatar.test.tsx
git commit -m "feat(nexus): ring the student faces on catch-up, issues, evaluate, devices and admin users"
```

---

### Task 4: Drawings and study materials

**Files:**
- Modify: `apps/nexus/src/components/drawings/GalleryCard.tsx:140-144`
- Modify: `apps/nexus/src/components/drawings/CommentSection.tsx:90-95`
- Modify: `apps/nexus/src/components/drawings/FeaturedSeniors.tsx:136`
- Modify: `apps/nexus/src/components/study-materials/StudyCommentPanel.tsx:151`
- Modify: `apps/nexus/src/components/study-materials/ChapterWorkspaceRail.tsx:370-372`

**Interfaces:**
- Consumes: `StudentAvatar` from `@/components/students/StudentAvatar`.
- Produces: nothing.

Three of these files also render in the student zone. That needs no conditional: with no provider mounted there, `factsFor` returns null for every id and the plain avatar renders. Do not add a zone check.

- [ ] **Step 1: GalleryCard, converting sx sizing to the size prop**

Replace lines 140 to 144:

```tsx
        <StudentAvatar
          userId={post.student?.id}
          src={post.student?.avatar_url}
          name={post.student?.name}
          size={isCompact ? 26 : 32}
        />
```

`StudentAvatar` sizes its wrapper from `size`, so the old `sx={{ width, height }}` form would leave the ring the wrong size around the face.

- [ ] **Step 2: CommentSection**

Replace lines 90 to 95:

```tsx
            <StudentAvatar
              userId={c.author?.id}
              src={c.author?.avatar_url}
              name={c.author?.name}
              size={28}
              sx={{ mt: 0.25 }}
            />
```

- [ ] **Step 3: FeaturedSeniors, also sx-sized**

Replace line 136:

```tsx
                <StudentAvatar userId={s.user_id} src={s.avatar_url} name={s.name} size={48} />
```

Most seniors here are alumni and are not in the active-student map, so this usually renders plain. It is swapped anyway because the feed can showcase a current Class 12 student, and because leaving one lone `UserAvatar` in the drawings folder is exactly how the last two passes left work behind.

- [ ] **Step 4: StudyCommentPanel**

Replace line 151:

```tsx
                <StudentAvatar userId={c.author?.id} src={c.author?.avatar_url} name={c.author?.name} size={32} sx={{ mt: 0.25 }} />
```

- [ ] **Step 5: ChapterWorkspaceRail**

Replace lines 370 to 372:

```tsx
              <StudentAvatar userId={r.student_id} src={r.avatar_url} name={r.name} size={32} />
```

The old call had `flexShrink: 0` in its `sx`; the wrapper sets that itself, so it goes.

- [ ] **Step 6: Add the imports, remove the dead ones, type-check**

Each of the five files needs `import StudentAvatar from '@/components/students/StudentAvatar';`. Remove `UserAvatar` from `@neram/ui` imports and `Avatar` from MUI imports where they become unused.

Run: `pnpm type-check --filter=@neram/nexus && pnpm lint --filter=@neram/nexus`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/nexus/src/components/drawings apps/nexus/src/components/study-materials
git commit -m "feat(nexus): ring student faces in the drawing gallery and study material comments"
```

---

### Task 5: Exam recall

**Files:**
- Modify: `apps/nexus/src/components/exam-recall/TipCard.tsx:73-77`
- Modify: `apps/nexus/src/components/exam-recall/CommentThread.tsx:56-61`
- Modify: `apps/nexus/src/components/exam-recall/VersionTimeline.tsx:119-123`
- Modify: `apps/nexus/src/app/(teacher)/teacher/exam-recall/thread/[id]/page.tsx:598-602,808-812`
- Modify: `apps/nexus/src/app/(teacher)/teacher/exam-recall/page.tsx:513-519`

**Interfaces:**
- Consumes: `StudentAvatar` from `@/components/students/StudentAvatar`.
- Produces: nothing.

Every payload here types its person as `Pick<User, 'id' | 'name' | 'avatar_url'>`, so the id is already present in all five files.

- [ ] **Step 1: TipCard**

```tsx
          <StudentAvatar
            userId={tip.user.id}
            src={tip.user.avatar_url}
            name={tip.user.name}
            size={32}
          />
```

- [ ] **Step 2: CommentThread**

```tsx
        <StudentAvatar
          userId={comment.user.id}
          src={comment.user.avatar_url}
          name={comment.user.name}
          size={28}
          sx={{ mt: 0.25 }}
        />
```

- [ ] **Step 3: VersionTimeline**

```tsx
        <StudentAvatar
          userId={version.author.id}
          src={version.author.avatar_url}
          name={version.author.name}
          size={28}
        />
```

- [ ] **Step 4: thread/[id]/page.tsx, both faces**

Line 598, the version author:

```tsx
                        <StudentAvatar
                          userId={version.author.id}
                          src={version.author.avatar_url}
                          name={version.author.name}
                          size={28}
                        />
```

Line 808, a confirmation:

```tsx
                  <StudentAvatar
                    userId={confirm.user.id}
                    src={confirm.user.avatar_url}
                    name={confirm.user.name}
                    size={32}
                  />
```

- [ ] **Step 5: exam-recall/page.tsx, the lead contributor**

Replace lines 513 to 519:

```tsx
                  <StudentAvatar
                    userId={thread.contributors[0].id}
                    src={thread.contributors[0].avatar_url}
                    name={thread.contributors[0].name}
                    size={32}
                  />
```

This is a single face, not a stacked group. `ThreadCard.tsx:192` is inside an `AvatarGroup` and stays as it is.

- [ ] **Step 6: Imports, type-check, lint**

Run: `pnpm type-check --filter=@neram/nexus && pnpm lint --filter=@neram/nexus`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/nexus/src/components/exam-recall "apps/nexus/src/app/(teacher)/teacher/exam-recall"
git commit -m "feat(nexus): ring the student faces across exam recall threads and tips"
```

---

### Task 6: The ESLint guard and its allowlist

**Files:**
- Modify: `apps/nexus/.eslintrc.json`
- Test: `apps/nexus/src/components/students/avatar-allowlist.test.ts` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks at runtime. It depends on every earlier task having landed, or lint fails.
- Produces: nothing importable.

This is the reason there will not be a fourth pass.

- [ ] **Step 1: Add the three selectors**

Append to the existing `no-restricted-syntax` array in `apps/nexus/.eslintrc.json`, after the Gemini entry:

```json
      {
        "selector": "JSXOpeningElement[name.name='UserAvatar']",
        "message": "Show a person through StudentAvatar (src/components/students/StudentAvatar). It resolves the cohort ring from the user id, and falls back to exactly this plain avatar for staff, alumni and anyone else it does not recognise, so it is safe in a mixed list. If this face genuinely must stay plain, add the file to the allowlist in the overrides block below and say why."
      },
      {
        "selector": "JSXOpeningElement[name.name='GraphAvatar']",
        "message": "Show a person through StudentAvatar (src/components/students/StudentAvatar) and pass msOid to keep the live Graph photo. Calling GraphAvatar directly is how a screen ends up with faces that carry no cohort."
      },
      {
        "selector": "JSXOpeningElement[name.name='Avatar']:has(JSXAttribute[name.name='src'])",
        "message": "An Avatar with a src is a photograph of a person, so it belongs to StudentAvatar (src/components/students/StudentAvatar). A bare Avatar with no src is an icon badge and stays legal. StudentAvatar also brings the shared initials, the deterministic fallback colour and the long-press photo viewer, which hand-written initials do not."
      }
```

- [ ] **Step 2: Add the allowlist as overrides**

Append to the existing `overrides` array. Each entry carries its reason in a `_reason` key, which ESLint ignores and a reader does not:

```json
    {
      "_reason": "The three components the rule points everyone at. They are the ones allowed to render a bare avatar.",
      "files": [
        "src/components/students/StudentAvatar.tsx",
        "src/components/students/StudentStageAvatar.tsx",
        "src/components/GraphAvatar.tsx"
      ],
      "rules": { "no-restricted-syntax": "off" }
    },
    {
      "_reason": "The signed-in person's own face. You do not need a ring to tell you what you are.",
      "files": [
        "src/components/TopBar.tsx",
        "src/components/DesktopSidebar.tsx",
        "src/components/profile/ProfileHero.tsx",
        "src/components/PhotoRequiredGate.tsx",
        "src/components/WelcomeOrientation.tsx",
        "src/components/NoClassroomWelcome.tsx",
        "src/components/AlumniAccessEnded.tsx",
        "src/app/(teacher)/teacher/course-plans/page.tsx"
      ],
      "rules": { "no-restricted-syntax": "off" }
    },
    {
      "_reason": "Stacked AvatarGroup strips. MUI needs bare Avatar children for its overlap margins, and StudentAvatar's size + 8 wrapper breaks them. A ring is illegible at 24px under a stack anyway.",
      "files": [
        "src/components/exam-schedule/RecentlyCompletedStrip.tsx",
        "src/components/question-bank/ContributorAvatars.tsx",
        "src/components/exam-recall/ThreadCard.tsx"
      ],
      "rules": { "no-restricted-syntax": "off" }
    },
    {
      "_reason": "Always a staff face, and the payload carries no user id. Threading one in would buy nothing.",
      "files": [
        "src/components/timetable/views/UpNextHero.tsx",
        "src/components/timetable/class-panel/ClassTab.tsx"
      ],
      "rules": { "no-restricted-syntax": "off" }
    },
    {
      "_reason": "Entra directory entries, not users. These people have no users.id yet, so there is nothing to look up.",
      "files": ["src/components/AvailableStudentsSection.tsx"],
      "rules": { "no-restricted-syntax": "off" }
    },
    {
      "_reason": "No StudentStageFactsProvider is mounted in these zones, deliberately: dormancy is a staff judgement and a classmate must never see it. A ring could never render here, so the rule would only make noise.",
      "files": ["src/app/(student)/**", "src/app/(parent)/**"],
      "rules": { "no-restricted-syntax": "off" }
    }
```

Note: the existing `src/components/video/**` override already sets `no-restricted-syntax: off`, and the `src/components/video/controls/**` override replaces the rule with its own selectors. Neither renders an avatar, so leave both untouched.

`src/components/students/StudentIdentityLine.tsx` is deliberately NOT on this list. It was fixed in Task 1, not excused.

- [ ] **Step 3: Write the allowlist-freshness test**

Create `apps/nexus/src/components/students/avatar-allowlist.test.ts`:

```ts
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import eslintrc from '../../../.eslintrc.json';

/**
 * An allowlist entry naming a file that no longer exists is a dead exception.
 * It does not fail lint, it does not fail the build, and it quietly makes the
 * list look considered when it is stale. Two adoption passes were lost to
 * exactly that kind of silent drift, so the list gets a test.
 */

const APP_ROOT = join(__dirname, '..', '..', '..');

function allowlistedFiles(): string[] {
  const overrides = (eslintrc.overrides || []) as Array<{
    files: string[];
    rules?: Record<string, unknown>;
  }>;
  return overrides
    .filter((o) => o.rules && o.rules['no-restricted-syntax'] === 'off')
    .flatMap((o) => o.files)
    // Globs cover a whole zone and cannot be existence-checked file by file.
    .filter((f) => !f.includes('*'));
}

describe('avatar allowlist', () => {
  it('names only files that still exist', () => {
    const missing = allowlistedFiles().filter((f) => !existsSync(join(APP_ROOT, f)));
    expect(missing).toEqual([]);
  });

  it('does not excuse StudentIdentityLine, which was fixed rather than exempted', () => {
    expect(allowlistedFiles()).not.toContain('src/components/students/StudentIdentityLine.tsx');
  });
});
```

- [ ] **Step 4: Run the test**

Run: `cd apps/nexus && npx vitest run src/components/students/avatar-allowlist.test.ts`
Expected: PASS. If `resolveJsonModule` is not enabled, read the file with `readFileSync` and `JSON.parse` instead of importing it.

- [ ] **Step 5: Run lint over the whole app, which is the real proof**

Run: `pnpm lint --filter=@neram/nexus`
Expected: **zero** `no-restricted-syntax` errors. Any error here is a call site Tasks 1 to 5 missed. Fix it by swapping, not by widening the allowlist, unless it falls into one of the five documented categories.

- [ ] **Step 6: Commit**

```bash
git add apps/nexus/.eslintrc.json apps/nexus/src/components/students/avatar-allowlist.test.ts
git commit -m "feat(nexus): make a plain student face a lint error, with a justified allowlist"
```

---

### Task 7: Mobile E2E

**Files:**
- Create: `tests/e2e/nexus-avatar-ring-mobile.spec.ts`

**Interfaces:**
- Consumes: `injectAuthForPage`, `APP_URLS` from `tests/utils/credentials`; `assertNoHorizontalOverflow` from `tests/utils/mobile-helpers`.
- Produces: nothing.

The ring costs 8px per avatar. On a 375px phone, across a list, that is real.

- [ ] **Step 1: Write the spec**

Create `tests/e2e/nexus-avatar-ring-mobile.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { APP_URLS, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * The ring exists so a teacher can tell a Class 11 student from one sitting the
 * exam in three months without reading a word. These screens each lost it once:
 * the tests list because its chip was thought to be enough, the evaluate queue
 * because it drew its own Avatar with hand-written initials.
 *
 * The ring's aria-label comes from StudentStageAvatar and reads
 * "{label}: {explanation}", e.g. "Class 11: ...".
 */

const RING = /Class 11:|Class 12:|Break Year:|Class 10:|Not set:|Dormant:/;

// A generous timeout: these Nexus routes are slow to first paint on a cold dev
// server, and the 30s default is the usual cause of a false red here.
test.describe.configure({ timeout: 90_000 });

test.describe('cohort ring on mobile', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuthForPage(page, 'teacher');
    await page.setViewportSize({ width: 375, height: 812 });
  });

  test('student tests list wears the ring', async ({ page }) => {
    await page.goto(`${APP_URLS.nexus}/teacher/tests`);
    await page.getByRole('tab', { name: /student tests/i }).click();
    await expect(page.getByLabel(RING).first()).toBeVisible({ timeout: 30_000 });
  });

  test('student tests list does not scroll sideways', async ({ page }) => {
    await page.goto(`${APP_URLS.nexus}/teacher/tests`);
    await page.getByRole('tab', { name: /student tests/i }).click();
    await page.getByLabel(RING).first().waitFor({ timeout: 30_000 });
    await assertNoHorizontalOverflow(page);
  });

  test('evaluate queue wears the ring and does not overflow', async ({ page }) => {
    await page.goto(`${APP_URLS.nexus}/teacher/evaluate`);
    await expect(page.getByLabel(RING).first()).toBeVisible({ timeout: 30_000 });
    await assertNoHorizontalOverflow(page);
  });

  test('the signed-in teacher keeps a plain face in the top bar', async ({ page }) => {
    await page.goto(`${APP_URLS.nexus}/teacher/tests`);
    const header = page.locator('header').first();
    await expect(header).toBeVisible({ timeout: 30_000 });
    await expect(header.getByLabel(RING)).toHaveCount(0);
  });
});
```

- [ ] **Step 2: Run it**

Run: `pnpm test:e2e tests/e2e/nexus-avatar-ring-mobile.spec.ts --project=nexus-mobile`
Expected: PASS. If the ring assertions fail because the seeded students have no enrolment, check `/api/students/stage-facts` returns a non-empty `facts` map for the classroom the test account belongs to, and note the finding rather than weakening the assertion.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/nexus-avatar-ring-mobile.spec.ts
git commit -m "test(nexus): pin the cohort ring on the two lists that kept losing it"
```

---

### Task 8: Full verification

- [ ] **Step 1: Unit tests**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 2: Types**

Run: `pnpm type-check`
Expected: no errors.

- [ ] **Step 3: Lint, the completeness proof**

Run: `pnpm lint`
Expected: zero `no-restricted-syntax` avatar errors across `apps/nexus`.

- [ ] **Step 4: Report**

Report exactly which commands were run and their real output. Do not claim a screen was verified visually unless it was opened. Do not deploy.

## Deliberately out of scope

- Mounting `StudentStageFactsProvider` in the student or parent zone.
- The admin app, which has its own avatar components and no stage-facts route.
- Any change to `/api/students/stage-facts` or to `StudentStageAvatar`'s design.
- Deploying. Local commits only.
