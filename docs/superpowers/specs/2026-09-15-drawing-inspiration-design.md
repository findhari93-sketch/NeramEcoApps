# Inspiration + Sketchbook as the drawing hub (Nexus)

## Context

The teacher "Drawing Reviews" page is a separate queue that no longer earns its place. Drawing work now arrives through Assignments (drawing briefs) and Sketchbook (daily practice), and later through question bank drawing practice. Meanwhile the best drawing assets Neram owns sit locked in that queue:

- 165 teacher reference images (ChatGPT/Gemini-made corrected versions)
- 83 student works rated 4 stars and above
- 96 drawings by students who are now alumni

These were counted in production on 2026-09-15, out of 283 drawings.

The founder wants two outcomes:

1. **Inspiration.** A Pinterest-style, search-first drawing library inside Nexus. Students come with a need ("3D bag hat", "street view", "NATA 2025", "still life"), search, narrow with filters, study the reference and the best student attempts, then practise.
2. **Sketchbook becomes the one place for a student's drawing life.** Every drawing a student submits appears in their Sketchbook on that date: sketches, assignment drawings, practice from a reference, question bank practice. Consistency is what raises drawing marks, so a teacher checks one Sketchbook instead of several screens, using the same review screen everywhere.

## Product decisions (locked with founder)

| Topic | Decision |
|---|---|
| Credit | "Harshitaa T. · 2026 batch" / "Priya S. · Alumni 2025". Student opt-out "Show my drawings to others". Teacher feedback, stars and marks are never shown to other students. |
| What enters automatically | **Reference images:** in as soon as the review is done. **Student originals:** in when rated **4 stars and above** (or 80% and above of `max_marks` when an assignment uses marks), from any source. Teachers can show or hide any item by hand. |
| Practice review | **Optional.** Every Sketchbook drawing opens the same review screen used for assignments (stars, overlay, reference). Nothing is owed. Only assignment drawings and test drawings count as pending work. |
| Attempts under a reference | Each reference collects every attempt made from it. **Teachers** see all attempts. **Students** see the ones rated 4 stars and above, plus a line: "14 students drew this. 5 scored 4 stars and above." |
| Drawing Reviews | Remove the queue page, its nav item, its flag and its badge. Keep the review screen (`/teacher/drawing-reviews/[id]`), which Assignments already opens. |
| Layout | Search plus filter chips, not tabs per category. One Saved collection per student (no boards in v1). |

## Findings that shaped the design (from code + prod)

- **Every drawing is one row in `drawing_submissions`.** `source_type` is `question_bank|homework|free_practice|assignment|exam|sketchbook`. Reference image is `corrected_image_url`, overlay is `reviewed_image_url`, original is `original_image_url`.
  - Stars: `tutor_rating` 1 to 5. Marks: `tutor_marks`. No marks are in use yet.
  - All three image buckets are public.
- **There is already a gallery**, but students don't see it: `getGalleryFeed` in `packages/database/src/queries/nexus/drawing-gallery.ts`, and the flag `student.drawings` is OFF in prod. The `is_gallery_visible` flag was set by a default, not by teacher choice. The review screen always sends it OFF (`drawing-reviews/[id]/page.tsx:104`), and the sketchbook "feature" route sets it to true. So Inspiration must not rely on it.
- **Sketchbook queries only read sketchbook uploads.** `packages/database/src/queries/nexus/sketchbook.ts` filters `source_type='sketchbook'` at lines 58, 72, 83, 101, 165 and 299. The practice-day counter `nexus_drawing_days` already counts every upload.
- **The Drawing Reviews queue is the only way to reach three kinds of drawing:** question bank and free practice submissions, and **test drawings**. Test drawings finalise test scores (`queries/nexus/exam-drawings.ts`), so they need an owed home before the queue is retired.
- **Row-level security can't help here.** Nexus uses Microsoft sign-in, so `auth.uid()` is null. Enable RLS with no policies, and read and write through the admin client in API routes with explicit column lists (the sketchbook precedent).
- **Search patterns to copy:** `supabase/migrations/20260731090100_library_search_upgrade.sql` (`library_search`, `library_expand_query`, typo fallback) and the question bank search vectors (`20260903090100`, `20260903090200`). `pg_trgm` is enabled. pgvector is not needed at about 300 items.
- **The drawing type tree already exists** in `nexus_qb_tags`: 2D, 3D, kit, street_view, still_life, memory_drawing and more, with aliases. `drawing_tags` has 44 labels and 119 tagged drawings.
- **`drawing_submissions.prompt_id` is reserved** for the sketchbook daily prompt bank (spec D4), so it can't be reused here.

## Experience design (ui-ux-pro-max, @neram/ui theme, mobile first)

### Student journeys and doors in

- **Nav:**
  - Classroom zone, Practice group: Tests, Sketchbook, **Inspiration** (replaces the dead Drawings item), Recall.
  - Study zone, Learn group: next to Library.
  - The bottom bars stay at 4 items; the More sheet picks it up automatically.
- **Contextual doors (the real traffic):**
  - Sketchbook home card: "Need an idea? Browse Inspiration".
  - Add-sketch sheet: "Draw from a reference".
  - Phase 2: "See examples" on an assignment drawing brief (filtered by its type), and "See reference drawings" on a question bank drawing question.

### Screens

1. **`/student/inspiration`: search home and results on one page.**
   - **URL state:** `?q&type&exam&by&year&sort`, deep-linkable, with scroll restored on Back.
   - **Top of page:** a sticky search field (16px font, `enterKeyHint=search`, 400ms debounce) with recent searches and type suggestions.
   - **Chip rows:**
     - Type (2D composition, 3D composition, Kit, Street view, Still life, Memory, ...), which opens in a bottom sheet on phones when there are more than 8
     - Exam (NATA, JEE Paper 2)
     - By (Reference, Current students, Alumni)
     - Year
     - Sort menu: Relevant, Newest, Most saved
     - Every chip shows its count, and chips with zero items are hidden.
   - **Empty query:** Featured row, then the newest grid.
   - **Grid:** `@mui/lab` Masonry with 2 columns on phones, then 3, 4 and 5. Each tile reserves its `aspect-ratio` so nothing shifts, uses a lazy-loaded thumbnail, has a 44px save heart, and a badge reading Reference or Alumni.
   - **Loading:** infinite scroll backed by a "Load more" button, with skeleton tiles.
   - **No results:** "Nothing matched exactly. Here is what is close." with fuzzy matches and suggested chips, never a blank page.
2. **`/student/inspiration/[itemId]`: detail page.**
   - **Layout:** full page on every screen; on desktop, image on the left and details on the right.
   - **Image:** a Reference / Student's drawing toggle (reuse `ImageToggleTabs`) and pinch-free zoom (reuse `ImageViewerDialog`).
   - **Details:** the brief, then exam, year and type chips that each open a filtered search, then the credit line.
   - **Actions:** Save, and the primary **Practise this**.
   - **Below:** **Drawn from this** (student attempts rated 4 stars and above, plus the count line), then **More like this**.
   - **Back** goes to the last results URL (stored in sessionStorage), falling back to `/student/inspiration`.
3. **`/student/inspiration/saved`:** Back goes to `/student/inspiration`.
4. **Practise this.** It opens `AddSketchSheet` / `DrawingSubmissionSheet` with the reference pinned (existing `referenceImageUrl` prop) and sends `inspiration_item_id`.
   - The sketch lands in the Sketchbook on today's date with a "Practised from" chip.
   - Done goes back to the item's detail page, with a toast: "Added to your Sketchbook".
5. **Student Sketchbook: every drawing on its date.**
   - **Source chips:** Sketch, Assignment, Practice, Question bank, Test.
   - **Once a teacher has reviewed a drawing,** its page shows the stars, feedback, and the Original / Overlay / Teacher reference toggle (reuse `GalleryImageViewer`).
   - **Delete** is only allowed for the student's own sketchbook uploads, and only while unreviewed.
6. **Profile / Sketchbook preferences:** a "Show my drawings to others" switch.

### Teacher journeys

- **Nav:**
  - The Student work group becomes Assignments, Sketchbooks, **Inspiration**.
  - The Teaching bottom bar slot `drawing-reviews` becomes `assignments`.
- **Sketchbooks (the hub):** flip-through and per-student views now show every source, each with a review state chip (Not reviewed, or its stars). Tapping any drawing opens **the one review screen**: `/teacher/drawing-reviews/[id]?from=sketchbook&student=<id>`.
- **Review screen, sketchbook mode (marking optional):**
  - The top row keeps the quick flip-through actions: react, seen, feature to class (moved over from `TeacherSketchActions`).
  - The full evaluation panel (stars, feedback, overlay and reference slots) is there, but nothing forces Complete. The primary action is **Next**.
  - Back returns to the Sketchbook view the teacher came from.
  - Next follows the flip-through order.
  - The "Show in gallery" switch becomes **"Show in Inspiration"**. Helper text: "On automatically for 4 stars and above". Changing it saves a manual override.
- **`/teacher/inspiration`:** the same components with a curation layer:
  - Show, Hide or Feature
  - Edit title, brief and tags (reuse `TagEditor`)
  - Add exemplar (`ImageUploadField`, brief, type, exam, year)
  - A "Hidden" filter chip
  - "Hide all from this student", since alumni can't sign in to opt out
- **Teacher detail page:** "Drawn from this" lists **all** attempts, with stars and review state; each opens the review screen.
- **Owed work stays with its parent:**
  - Assignment drawings stay on Assignments, with a nav badge.
  - Test drawings get a "Drawings to mark (n)" section on the teacher test results page, which opens the review screen with `?from=test`.

### UX rules applied throughout

- Touch targets 44 to 48px with 8px gaps
- Visible focus rings
- 4.5:1 contrast
- SVG MUI icons only
- `prefers-reduced-motion` respected on tile entrance and hover
- Alt text: "Reference drawing: 3D composition with travel bag and hat"
- No horizontal scroll at 375, 768, 1024 or 1440px (chip rows scroll inside their own container)
- `useNexusSWR` for all reads
- No em dashes or double dashes in any copy

## Data model (new migrations in root `supabase/migrations/`, after 20260919090000)

### `20260920090000_nexus_inspiration_schema.sql`

**`nexus_inspiration_items`:** one row per image.

- **Source:**
  - `id`
  - `source_kind` CHECK IN (`submission_reference`, `submission_original`, `exemplar`, `qb_solution`)
  - `source_submission_id` FK `drawing_submissions` ON DELETE CASCADE, with a partial unique index on (kind, submission)
  - `source_drawing_question_id`
  - `source_qb_question_id`
- **Image:** `image_url`, `thumbnail_url`, `image_aspect real`.
- **Synced content:** `brief`, `category`, `type_slugs text[]` (drawing slugs from `nexus_qb_tags`), `tag_labels text[]`, `exam_types text[]`, `paper_years smallint[]`, `author_id`, `score_pct real`, `source_created_at`.
- **`auto_eligible boolean`:** computed by sync, see the rules below.
- **Curation (sync never writes these):**
  - `curation` CHECK IN (`auto`, `shown`, `hidden`), default `auto`
  - `curated_by`, `curated_at`
  - `is_featured`, `title_override`, `brief_override`, `created_by`
- **Visibility:** `curation='shown' OR (curation='auto' AND auto_eligible)`. Items from test drawings are never visible, which protects tests other students have not taken yet.
- **Search and counters:** `save_count`, `search_vector tsvector` (weighted: A = title, types, tags; B = exam labels, years, category; C = brief; `simple` and `english` configs), `search_text_norm` (trigram), timestamps.
- **Indexes:** GIN on the vector, the trigram column and `type_slugs`, plus (visibility columns, `source_created_at DESC`).

**`nexus_inspiration_saves`:** (`user_id`, `item_id`) primary key, `created_at`. A trigger maintains `save_count`.

**`drawing_submissions`:** add `inspiration_item_id uuid` FK items, ON DELETE SET NULL. This is the practice link.

**`users`:** add `share_drawings_opt_out boolean default false`. It is separate from `sketchbook_feature_opt_out`, which covers Teams class posts.

**Author details** (name, alumni status, academic year, opt-out) are **joined from `users` at read time**. Graduation and opt-out then take effect instantly.

### `20260920090100_nexus_inspiration_sync.sql`: database triggers, not app code

At least nine code paths write these columns: review route branches, release, sketchbook feature, gallery publish, image rotate, the tags route, auto-draft tags, and deletes. One recompute-from-scratch function catches all of them and can't drift.

**`nexus_inspiration_sync_submission(id)`** is `SECURITY DEFINER`, wrapped in `EXCEPTION WHEN OTHERS THEN RAISE WARNING` so it can never block a review save.

- **Original item:** upserted for every submission.
  - `auto_eligible` = `reviewed_at` is set, and status is `completed` or `reviewed`, and source is not `exam`, and `score_pct >= 0.8`.
  - `score_pct` = `tutor_rating/5`, else `tutor_marks/max_marks` of the parent assignment.
- **Reference item:** upserted when `corrected_image_url` is set.
  - `auto_eligible` = `reviewed_at` is set, and status is `completed`, `reviewed` or `redo`, and source is not `exam`.
- **Content:**
  - Brief, category and year come from `drawing_questions`.
  - Exam and year also come from `nexus_qb_question_sources` via `qb_question_id`, falling back to `exam_relevance`.
  - Type slugs map `drawing_tags` onto `nexus_qb_tags` slugs, plus the category family.
  - Originals take aspect from `image_quality->>'aspect'`.
  - A changed image URL clears the aspect and thumbnail.
- **Triggers:**
  - `drawing_submissions` AFTER INSERT or UPDATE OF the relevant columns
  - `drawing_submission_tags` INSERT/DELETE
  - `drawing_questions` UPDATE of text, category or year
- **Repair:** `nexus_inspiration_resync_all()`.
- **Backfill (same file):** sync every submission. This **ignores the old `is_gallery_visible`**, which was a default, not a teacher decision. Copy `alumni_featured` into `is_featured`.
- **Mirror in TypeScript:** `apps/nexus/src/lib/inspiration-rules.ts` holds the same rules, for unit tests and for the review screen's "Why isn't this in Inspiration?" hint.

### `20260920090200_nexus_inspiration_search_rpc.sql`

All functions are granted to `service_role` only.

- **`nexus_inspiration_search(q, types[], exam, by, year, sort, scope, viewer_id, limit, offset)`:**
  - **Search stages:**
    1. browse when there is no query
    2. `websearch_to_tsquery` in both configs, OR'd with `library_expand_query` aliases
    3. if page 1 is empty, an any-word query (so "3D bag hat" works)
    4. then trigram `word_similarity >= 0.4`
  - **Filters:**
    - Drop originals whose author opted out, and blank the author on references by opted-out students.
    - `by`: `reference` covers references, exemplars and future `qb_solution` items; `current` and `alumni` split originals by `users.is_alumni`.
  - **Sort:** Relevant is rank, then featured, then newest.
  - **Paging:** offset, 30 per page.
  - **Returns:** display fields, author fields, `is_saved`, `attempt_count`, `match_kind` and `total_count`.
- **`nexus_inspiration_facets(...)`:** per-chip counts, each computed with the other filters applied. Called only for the first page.
- **`nexus_inspiration_similar(item_id, viewer_id, limit)`:** same source question, shared type slugs, then tag rank.
- **`nexus_inspiration_attempts(item_id, viewer_id, staff boolean)`:** attempts are submissions where `inspiration_item_id` is this item, **or** that share the item's source question (the historical attempts), excluding the item's own submission.
  - Staff get all attempts, with stars and state.
  - Students get only attempts whose original is a visible item, plus the total count.

## Queries and API

**`packages/database/src/queries/nexus/inspiration.ts`:**
- `searchInspiration`, `getInspirationFacets`, `getInspirationItem` (plus the pair: the other image from the same submission), `getSimilarInspiration`, `listInspirationAttempts`
- `toggleInspirationSave`, `listSavedInspiration`
- `setItemCuration`, `updateInspirationItem`, `createExemplar`, `deleteExemplar`, `hideAllByAuthor`
- `get/setShareDrawingsOptOut`, `setItemImageMeta`

**Routes under `apps/nexus/src/app/api/inspiration/`.** Student requests check the `student.inspiration` flag and are forced to the visible scope, and no response ever contains `tutor_*` fields for another student.

| Route | Methods | Notes |
|---|---|---|
| `search/route.ts` | GET | Returns items, total, `matchKind`, plus facets on the first page |
| `items/[id]/route.ts` | GET, PATCH, DELETE | GET: item, pair, similar, attempts. PATCH (staff): curation, feature, text, tags. DELETE: exemplars only. |
| `items/[id]/save/route.ts` | POST, DELETE | |
| `saved/route.ts` | GET | |
| `exemplars/route.ts` | POST (staff) | `sharp` measures the image and makes the thumbnail |
| `maintenance/images/route.ts` | POST (staff) | Fills missing aspect and thumbnails, up to 20 per call. Fired once when the teacher page loads. |

**Extend existing routes:**
- `sketchbook/entries` POST accepts `inspiration_item_id`.
- `sketchbook/preferences` gains the opt-out.
- `drawing/submissions/[id]/review` accepts `inspiration_curation`, and its `next` for `from=sketchbook` follows flip-through order.

**Image preparation:**
- One-off script `apps/nexus/scripts/inspiration-prepare-images.ts`, using `sharp` metadata and writing 400px JPEGs to `drawing-references/inspiration-thumbs/`.
- After each review, the review route runs the same preparation best-effort.

## Sketchbook becomes the hub

- **`packages/database/src/queries/nexus/sketchbook.ts`:**
  - Widen the read queries (student timeline, per-student teacher view, flip-through unflipped list, latest sketches) from `source_type='sketchbook'` to all sources except unreleased test drawings, and return `source_type`, `assignment_id`, `inspiration_item_id`, `tutor_rating` and `reviewed_at`.
  - **Writes stay scoped** to sketchbook uploads (line ~485, delete and caption).
  - Update the `nexus_latest_sketches` function if it filters by source.
- **Components in `apps/nexus/src/components/sketchbook/`:**
  - `SketchGrid` and `SketchPageView` gain a source chip, a review chip and a "Practised from" link.
  - `FlipThrough` tiles open the review screen.
- **Old teacher detail page:** `app/(teacher)/teacher/sketchbook/[studentId]/[sketchId]/page.tsx` becomes a redirect to `/teacher/drawing-reviews/[id]?from=sketchbook&student=...`.
- **The review screen** (`app/(teacher)/teacher/drawing-reviews/[id]/page.tsx`) gains a sketchbook mode:
  - quick actions row (react, seen, feature)
  - optional marking with Next as the primary action
  - `from` / `student`-aware Back link and breadcrumb
  - "Practised from" card filling the reference pane
  - "Show in Inspiration" switch
  - Also verify it renders sketchbook-source rows that have no question.
- **Student notification:** when a teacher gives stars on a non-assignment drawing, reuse the existing review notification path through `sendNudge` (bell, plus Teams chat per the standing rule). Add a guard test if a new event type is needed.

## Retiring Drawing Reviews (last milestone, after the hub works)

- **`apps/nexus/src/lib/nav-config.tsx`:** remove the item at line 191 and add Inspiration after Sketchbooks. In `bottomNavPaths` at line 201, `/teacher/drawing-reviews` becomes `/teacher/assignments`. On the student side, Drawings becomes Inspiration (Classroom zone) and Inspiration is added to the Study zone's Learn group.
- **`apps/nexus/src/lib/feature-flags.ts:142`:** remove `staff.drawing-reviews`. The review screen must never be switchable off. Add `student.inspiration` (default false) and `staff.inspiration`, and switch both off in prod before deploy so it launches dark.
- **Badges:**
  - `components/NavBadgeProvider.tsx:29`: remove the `drawing-reviews` mapping.
  - `app/api/nav-badges/route.ts` (lines 66 to 85): split the existing query into `assignment_drawings` (the Assignments badge) and `test_drawings` (the Tests badge). Practice drawings are never counted.
- **Redirects:**
  - `teacher/drawing-reviews/page.tsx` and `teacher/evaluate/page.tsx` redirect to `/teacher/sketchbook`.
  - The default Back in `drawing-reviews/[id]/page.tsx` (lines 75 and 598) and `drawing-reviews/profile/page.tsx:113` becomes `/teacher/sketchbook`.
  - `student/drawings/page.tsx` redirects to `/student/inspiration`. Keep its `[questionId]` and `submissions` sub-routes.
- **Keep:** the `[id]` and `profile` routes, the Assignments links at `assignments/[id]/page.tsx:731,797`, and `RubricScorePanel` / `TeachingMomentCard`.
- **Test drawings:** add a "Drawings to mark" section on the teacher test results page, using `exam-drawings.ts` data.
- **Left for Phase 2 cleanup:** `GalleryFeed`, `ReferenceLibrary` and the `api/drawing/gallery/*` routes, deleted once nothing imports them.

## Delivery plan

**Before coding:** save this design as `docs/superpowers/specs/2026-09-15-drawing-inspiration-design.md`, then write the step-by-step implementation plan (writing-plans skill).

**MVP, in three milestones, each shippable behind flags:**

1. **Foundation and read-only Inspiration:** the migrations, backfill, image script, queries, and the search, item and saved routes. Student search home, detail and Saved pages. Teacher curation page and exemplar upload.
2. **Sketchbook hub and practice:**
   - timeline widened to every source
   - "Practise this" with the practice link
   - "Drawn from this" attempts
   - review screen sketchbook mode with optional marking and the "Show in Inspiration" switch
   - students see their feedback
   - opt-out switch
3. **Retire Drawing Reviews:** nav, flags, badges, redirects, and the test "Drawings to mark" section. Update the e2e specs that hit the old routes.

**Phase 2:**
- desktop dialog over the grid (intercepting routes)
- contextual doors from assignment briefs and question bank drawing questions
- search log and a zero-result report for curators
- Gemini auto-tagging of exemplars (new id in `packages/ai/src/features.ts`)
- bell notification when a student's work is featured
- rename the review route to `/teacher/drawings/[id]` with a redirect
- delete the old gallery code

**Phase 3:**
- `qb_solution` source, once question bank drawing prompts have solution images (no search changes needed)
- multiple boards
- teacher collections set as homework
- daily prompt drawn from Inspiration (`prompt_id`)

## Verification

**Unit tests (vitest, run with `pnpm test:run` from the root):**
- `lib/inspiration-rules.test.ts`: 4 stars in, 3 stars out, 80% marks in, test drawings never shown, redo keeps the reference, `shown`/`hidden` overrides
- `lib/inspiration-credit.test.ts`: every credit case, opt-out, and a check for no em dashes
- `lib/inspiration-query.test.ts`: URL state round trip
- route tests: no `tutor_*` leaks, students can't use the hidden scope, flag off returns nothing, saving is idempotent, practice POST links the item
- sketchbook query tests: reads widened, writes still scoped
- `nav-config.test.ts`: no `/teacher/drawing-reviews` or `/student/drawings` nav items, Inspiration reachable on a phone
- `feature-flags` test
- dormant, notification-door and full-bleed guard tests still pass

**Database:**
- Apply the migrations to **staging** through `mcp__supabase-staging__apply_migration` (`db push` no-ops here).
- Check the backfill counts: about 165 references visible, and about 83 originals with 4 stars and above minus opt-outs.
- Run sample searches ("street view", "3D bag hat", "NATA 2025", a typo) through `execute_sql`.
- Apply to prod only when the founder says deploy.

**Type-check:** `pnpm type-check --force` for Nexus, since the Turbo cache can hide errors. Never build while dev servers are running.

**Playwright:**
- `tests/e2e/inspiration-nexus-mobile.spec.ts` at 375x812: search, chips, detail, image toggle, save, Saved, Practise this into Sketchbook, and `assertNoHorizontalOverflow` / `assertTouchTargetSize`.
- `inspiration-nexus.spec.ts` at 1280: teacher hide, feature, exemplar, and all attempts.
- `sketchbook-hub-nexus-mobile.spec.ts`: an assignment drawing appears in the Sketchbook; review screen sketchbook mode with Back and Next.
- Update `drawing-reviews-redesign-nexus`, `gallery-feed-nexus`, `alumni-gallery-nexus`, `assignment-back-nav-nexus` and the nexus mobile specs.
- Use `injectAuthForPage`, because Entra MFA blocks password login.

**Design review:** a final ui-ux-pro-max review of every new screen at 375px and 1280px before calling it done. No deploy until the founder asks.

## Risks and edge cases

- **Opted-out students:** their references stay, with credit shown as "Neram reference". Their originals are hidden. Alumni can't sign in, so teachers use "Hide all from this student".
- **Widening Sketchbook** changes the teacher flip-through volume, since assignment drawings now appear. Mitigation: a source filter chip, with assignment drawings marked as already owed elsewhere.
- **Test integrity:** test drawings never enter Inspiration, and appear in the student's own Sketchbook only after they submit.
- **Year filter:** all 96 drawing questions are from 2025, so it shows a single chip until more past papers are linked.
- **Sync failures** only raise a warning and are repaired with `resync_all`. A review can never fail because of Inspiration.
- **Hidden or deleted items:** a deep link returns "This drawing is no longer in Inspiration". A practice sketch whose source item was deleted shows "Practice (drawing removed)".
