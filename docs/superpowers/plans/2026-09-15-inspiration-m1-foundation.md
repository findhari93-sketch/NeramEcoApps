# Inspiration, Milestone 1 (Foundation and read-only library) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a searchable, Pinterest-style drawing library in Nexus. It fills itself from reviewed drawings and holds teacher exemplars. Students search it and save drawings. Teachers curate it.

**Architecture:**
- **Database:** one denormalized table, `nexus_inspiration_items`, with one row per image. Database triggers keep it in sync with `drawing_submissions`. A generated `is_visible` column holds the "auto, shown or hidden" rule.
- **Search:** plpgsql RPCs do weighted full-text search, fall back to any-word and then trigram matching, and return filter counts. Author details and opt-out are joined at read time.
- **API:** routes use the admin client (Nexus signs in with Microsoft, so RLS cannot see the caller). A presenter strips teacher-only fields before anything reaches a student.
- **UI:** one browser component and one item view serve both `/student/inspiration` and `/teacher/inspiration`.

**Tech Stack:**
- Supabase Postgres (pg_trgm, tsvector, plpgsql)
- Next.js 14 App Router route handlers
- MUI v5 via `@neram/ui`
- SWR (`swr`, `swr/infinite`)
- sharp
- Vitest and Playwright

**Spec:** `docs/superpowers/specs/2026-09-15-drawing-inspiration-design.md`. Milestone 1 only. Milestone 2 (Sketchbook hub, Practise this, attempts, review-screen switch, opt-out toggle UI) and Milestone 3 (retire Drawing Reviews) get their own plans.

**Scope notes for this milestone (small deviations from the spec, on purpose):**
- **Featured drawings lead the default grid** (browse sorts featured first) instead of a separate Featured row.
- **Saved is the search endpoint with `saved=1`**, not a separate route.
- **The backfill of thumbnails runs from the teacher page** (the maintenance route), not a one-off script.
- **Contextual doors** (the Sketchbook card, the assignment brief, question bank questions) come in Milestone 2 and Phase 2.

## Global Constraints

**Copy**
- Never use em dashes, `--` or `&mdash;` in any user-visible copy (labels, errors, empty states, alt text).

**UI**
- Invoke `ui-ux-pro-max` before Tasks 11 to 13, and review the built screens with it in Task 16.
- Touch targets are at least 44px with 8px gaps.
- Every interactive element has a visible focus ring.
- Text contrast is at least 4.5:1.
- Motion only inside `@media (prefers-reduced-motion: no-preference)`.
- Icons are MUI SVG icons only, never emoji.
- Show skeletons while async content loads.
- No horizontal page scroll at 375, 768, 1024 or 1440px.
- Colour, type and spacing come from the `@neram/ui` MUI theme. Import MUI primitives from `@neram/ui` and icons from `@mui/icons-material/<Name>`.
- Never call `useSearchParams` in shared components. Read and write the URL with `readSearch` / `patchQuery` from `apps/nexus/src/lib/list-url-state.ts`.

**Routes and data**
- Route files export only HTTP handlers plus Next config (`dynamic`, `maxDuration`). Put helpers in `apps/nexus/src/lib/`.
- A student response never contains `staff`, `score_pct`, `curation`, `tutor_*` or `author_id`.
- Drawings from `source_type = 'exam'` never become Inspiration items.
- Migrations go in root `supabase/migrations/`.
  - Apply to staging only with `mcp__supabase-staging__apply_migration`. Ask the user once, before the first staging apply.
  - Never touch prod.
  - `supabase db push` is not used here.

**Git and deploys**
- Commit locally at the end of each task. Stage only the explicit paths listed; other sessions share this tree.
- Never `git stash`, never push, never deploy.
- End every commit message with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

**Commands**
- Unit tests: `pnpm test:run <path>` from the repo root (`pnpm test` is watch mode).
- Type-check: `pnpm --filter @neram/nexus type-check`, which calls tsc directly and skips the Turbo cache.
- Never run a production build while a dev server is running.

**Rules the code must follow**
- **Visibility.**
  - A reference image enters once the review is done: `reviewed_at` set, and status `completed`, `reviewed` or `redo`.
  - A student original enters when also rated 4 stars or more (`tutor_rating / 5 >= 0.8`), or when `tutor_marks / max_marks >= 0.8`. Status must be `completed` or `reviewed`.
  - Teachers override with `curation` (`auto` | `shown` | `hidden`).
- **Opt-out.** For a student with `users.share_drawings_opt_out = true`:
  - their originals are hidden from students;
  - references made from their drawings stay, credited "Neram reference".
- **Credit lines** (exam year = academic-year start year + 1):
  - current student: `Harshitaa T. · 2026 batch`
  - alumni: `Priya S. · Alumni 2025`
  - reference: `Neram reference · from Harshitaa T.'s drawing`
  - exemplar or opted-out author: `Neram reference`

## File map

**Database**
- `supabase/migrations/20260920090000_nexus_inspiration_schema.sql`: tables, search-vector trigger, save counter, opt-out column.
- `supabase/migrations/20260920090100_nexus_inspiration_sync.sql`: type-slug mapping, sync function, triggers, backfill.
- `supabase/migrations/20260920090200_nexus_inspiration_search_rpc.sql`: base, search, facets, similar and get RPCs.
- `packages/database/src/queries/nexus/inspiration.ts` (+ `.test.ts`): types and data access. Exported from `packages/database/src/queries/nexus/index.ts`.

**Pure libs in `apps/nexus/src/lib/`** (each with a `.test.ts`)
- `inspiration-types.ts`: type labels, families, exam and source labels.
- `inspiration-rules.ts`: TypeScript mirror of the visibility rule, plus hidden reasons.
- `inspiration-credit.ts`: credit lines.
- `inspiration-present.ts`: turns a row into the card shape, with teacher fields only for staff.
- `inspiration-query.ts`: URL state, API query, filters, chips, back-link guard.
- `inspiration-patch.ts`: validates teacher edits and new exemplars.
- `inspiration-recent.ts`: recent searches in localStorage.
- `masonry-layout.ts`: column count and shortest-column placement.
- `inspiration-test-rows.ts`: a row factory for tests (no test file of its own).

**Server libs in `apps/nexus/src/lib/`**
- `inspiration-access.ts` (+ test): caller, staff check, feature flag, id guard.
- `inspiration-images.ts` (+ test): sharp aspect and thumbnail.

**API routes in `apps/nexus/src/app/api/inspiration/`**
- `search/route.ts` (+ `route.test.ts`)
- `items/[id]/route.ts` (+ `route.test.ts`)
- `items/[id]/save/route.ts`
- `exemplars/route.ts`
- `maintenance/images/route.ts`

**Components in `apps/nexus/src/components/inspiration/`**
- `inspiration-api.ts`, `inspiration-nav.ts`
- `InspirationTile.tsx`, `InspirationMasonry.tsx`
- `InspirationSearchBar.tsx`, `InspirationFilterChips.tsx`
- `InspirationBrowser.tsx`, `InspirationItemView.tsx`
- `InspirationCurationBar.tsx`, `AddExemplarSheet.tsx`

**Pages**
- `apps/nexus/src/app/(student)/student/inspiration/page.tsx`, `saved/page.tsx`, `[itemId]/page.tsx`
- `apps/nexus/src/app/(teacher)/teacher/inspiration/page.tsx`, `[itemId]/page.tsx`

**Modified**
- `apps/nexus/src/lib/feature-flags.ts` (+ test)
- `apps/nexus/src/lib/nav-config.tsx` (+ test)

**E2E**
- `tests/e2e/inspiration-nexus-mobile.spec.ts`
- `tests/e2e/inspiration-nexus.spec.ts`

## How the SQL tasks are tested

There is no local Supabase in use. Each SQL task has an assertion script: one `DO` block that inserts fixtures, checks behaviour, then ends with `RAISE EXCEPTION 'PASS: ...'`.
- The exception rolls every fixture back, so nothing persists on staging.
- Run it with `mcp__supabase-staging__execute_sql`.
- **Pass** means the error text is `PASS: ...`.
- **Fail** is any other error (`FAIL ...`, or "relation does not exist" before the migration is applied).

`drawing_submissions` has no other triggers, so the fixtures have no side effects.

---

### Task 0: Staging preflight

**Files:** none.

- [ ] **Step 1: Check staging has every dependency.** Run with `mcp__supabase-staging__execute_sql`:

```sql
select
  to_regprocedure('nexus_qb_normalize(text)') is not null          as has_normalize,
  to_regprocedure('library_expand_query(text)') is not null        as has_expand,
  to_regclass('nexus_qb_question_sources') is not null             as has_sources,
  exists(select 1 from information_schema.columns where table_name='drawing_submissions' and column_name='image_quality')          as has_image_quality,
  exists(select 1 from information_schema.columns where table_name='drawing_submissions' and column_name='thumbnail_url')          as has_thumbnail,
  exists(select 1 from information_schema.columns where table_name='nexus_class_assignments' and column_name='drawing_question_id') as has_assignment_brief,
  exists(select 1 from nexus_qb_tags where slug='street_view')     as has_drawing_types,
  exists(select 1 from pg_extension where extname='pg_trgm')       as has_trgm,
  exists(select 1 from users where user_type='student')            as has_student;
```

Expected: every column is `true`. If any is `false`, stop and tell the user which one; staging has drifted before (see memory "Staging QB drift"). Do not write catch-up migrations inside this plan.

- [ ] **Step 2: Ask the user** for permission to apply the three new migrations to staging during Tasks 1 to 3. Wait for a yes.

---

### Task 1: Schema migration

**Files:**
- Create: `supabase/migrations/20260920090000_nexus_inspiration_schema.sql`

**Interfaces:**
- **Produces:**
  - table `nexus_inspiration_items`, with the generated column `is_visible`, `search_vector` and `search_text_norm`
  - table `nexus_inspiration_saves` (with a trigger that maintains `save_count`)
  - column `users.share_drawings_opt_out`
- **Consumed by:** Tasks 2, 3, 5.

- [ ] **Step 1: Write the failing assertion.** Run it on staging now. Expected: an error saying `nexus_inspiration_items` does not exist.

```sql
DO $t$
DECLARE v_item uuid; v_student uuid;
BEGIN
  SELECT id INTO v_student FROM users WHERE user_type = 'student' LIMIT 1;

  INSERT INTO nexus_inspiration_items (source_kind, image_url, brief, type_slugs, exam_types, paper_years, auto_eligible)
  VALUES ('exemplar', 'https://example.com/x.jpg', 'A travel bag, a hat and a walking stick', '{3d_composition}', '{NATA}', '{2025}', true)
  RETURNING id INTO v_item;

  IF NOT (SELECT is_visible FROM nexus_inspiration_items WHERE id = v_item) THEN
    RAISE EXCEPTION 'FAIL 1: an eligible exemplar on auto should be visible';
  END IF;
  IF NOT (SELECT search_vector @@ websearch_to_tsquery('simple', '3d bag') FROM nexus_inspiration_items WHERE id = v_item) THEN
    RAISE EXCEPTION 'FAIL 2: search vector misses the type label or the brief';
  END IF;
  IF NOT (SELECT search_vector @@ websearch_to_tsquery('simple', 'nata 2025') FROM nexus_inspiration_items WHERE id = v_item) THEN
    RAISE EXCEPTION 'FAIL 3: search vector misses exam or year';
  END IF;

  UPDATE nexus_inspiration_items SET curation = 'hidden' WHERE id = v_item;
  IF (SELECT is_visible FROM nexus_inspiration_items WHERE id = v_item) THEN
    RAISE EXCEPTION 'FAIL 4: a hidden item is still visible';
  END IF;

  INSERT INTO nexus_inspiration_saves (user_id, item_id) VALUES (v_student, v_item);
  IF (SELECT save_count FROM nexus_inspiration_items WHERE id = v_item) <> 1 THEN
    RAISE EXCEPTION 'FAIL 5: save_count did not go up';
  END IF;
  DELETE FROM nexus_inspiration_saves WHERE user_id = v_student AND item_id = v_item;
  IF (SELECT save_count FROM nexus_inspiration_items WHERE id = v_item) <> 0 THEN
    RAISE EXCEPTION 'FAIL 6: save_count did not come down';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'share_drawings_opt_out') THEN
    RAISE EXCEPTION 'FAIL 7: users.share_drawings_opt_out missing';
  END IF;

  RAISE EXCEPTION 'PASS: inspiration schema';
END $t$;
```

- [ ] **Step 2: Write the migration.**

```sql
-- ============================================
-- INSPIRATION: the drawing library students search for ideas
--
-- One row per IMAGE, not per submission: a reviewed drawing can give a
-- teacher reference (corrected_image_url) and the student's own original,
-- and each is its own tile, its own save and its own curation.
--
-- Content columns are written by nexus_inspiration_sync_submission (next
-- migration). Curation columns (curation, is_featured, *_override) are only
-- ever written by teachers, so a re-sync never undoes a teacher's decision.
-- Who the author is, whether they graduated and whether they opted out are
-- joined from users at read time, so those changes apply instantly.
--
-- Spec: docs/superpowers/specs/2026-09-15-drawing-inspiration-design.md
-- Additive and idempotent.
-- ============================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS nexus_inspiration_items (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_kind                TEXT NOT NULL CHECK (source_kind IN ('submission_reference', 'submission_original', 'exemplar', 'qb_solution')),
  source_submission_id       UUID REFERENCES drawing_submissions(id) ON DELETE CASCADE,
  source_drawing_question_id UUID REFERENCES drawing_questions(id) ON DELETE SET NULL,
  source_qb_question_id      UUID REFERENCES nexus_qb_questions(id) ON DELETE SET NULL,

  image_url                  TEXT NOT NULL,
  thumbnail_url              TEXT,
  image_aspect               REAL CHECK (image_aspect IS NULL OR image_aspect BETWEEN 0.1 AND 10),

  brief                      TEXT,
  category                   TEXT,
  type_slugs                 TEXT[] NOT NULL DEFAULT '{}',
  tag_labels                 TEXT[] NOT NULL DEFAULT '{}',
  exam_types                 TEXT[] NOT NULL DEFAULT '{}',
  paper_years                SMALLINT[] NOT NULL DEFAULT '{}',
  author_id                  UUID REFERENCES users(id) ON DELETE SET NULL,
  score_pct                  REAL,
  source_created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  auto_eligible              BOOLEAN NOT NULL DEFAULT false,

  curation                   TEXT NOT NULL DEFAULT 'auto' CHECK (curation IN ('auto', 'shown', 'hidden')),
  curated_by                 UUID REFERENCES users(id) ON DELETE SET NULL,
  curated_at                 TIMESTAMPTZ,
  is_featured                BOOLEAN NOT NULL DEFAULT false,
  title_override             TEXT,
  brief_override             TEXT,
  created_by                 UUID REFERENCES users(id) ON DELETE SET NULL,

  is_visible                 BOOLEAN GENERATED ALWAYS AS (curation = 'shown' OR (curation = 'auto' AND auto_eligible)) STORED,
  save_count                 INTEGER NOT NULL DEFAULT 0,
  search_vector              TSVECTOR,
  search_text_norm           TEXT,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT nexus_inspiration_items_source_shape CHECK (
       (source_kind IN ('submission_reference', 'submission_original') AND source_submission_id IS NOT NULL)
    OR (source_kind = 'exemplar' AND source_submission_id IS NULL)
    OR (source_kind = 'qb_solution' AND source_qb_question_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_nexus_inspiration_items_submission
  ON nexus_inspiration_items (source_kind, source_submission_id)
  WHERE source_submission_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nexus_inspiration_items_visible_recent
  ON nexus_inspiration_items (is_visible, source_created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nexus_inspiration_items_search
  ON nexus_inspiration_items USING gin (search_vector);
CREATE INDEX IF NOT EXISTS idx_nexus_inspiration_items_trgm
  ON nexus_inspiration_items USING gin (search_text_norm gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_nexus_inspiration_items_types
  ON nexus_inspiration_items USING gin (type_slugs);
CREATE INDEX IF NOT EXISTS idx_nexus_inspiration_items_author
  ON nexus_inspiration_items (author_id);
CREATE INDEX IF NOT EXISTS idx_nexus_inspiration_items_question
  ON nexus_inspiration_items (source_drawing_question_id);

-- Weighted like library_videos: A = title, drawing types (with their aliases)
-- and tags; B = exam, year, category; C = the brief. Both 'simple' (keeps "3d"
-- and "2025" verbatim) and 'english' (stems "sketches" to "sketch").
CREATE OR REPLACE FUNCTION nexus_inspiration_refresh_search()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_title text := coalesce(NEW.title_override, '');
  v_brief text := coalesce(NEW.brief_override, NEW.brief, '');
  v_types text := coalesce((
    SELECT string_agg(t.label || ' ' || replace(t.slug, '_', ' ') || ' ' || array_to_string(coalesce(t.aliases, '{}'), ' '), ' ')
      FROM nexus_qb_tags t
     WHERE t.slug = ANY(NEW.type_slugs)
  ), '');
  v_head text;
  v_meta text;
BEGIN
  v_head := concat_ws(' ', v_title, v_types, array_to_string(NEW.tag_labels, ' '));
  v_meta := concat_ws(' ',
    CASE WHEN 'NATA' = ANY(NEW.exam_types) THEN 'NATA' END,
    CASE WHEN 'JEE_PAPER_2' = ANY(NEW.exam_types) THEN 'JEE Paper 2 BArch' END,
    array_to_string(NEW.paper_years, ' '),
    replace(coalesce(NEW.category, ''), '_', ' '),
    CASE WHEN NEW.source_kind <> 'submission_original' THEN 'reference' END);

  NEW.search_vector :=
       setweight(to_tsvector('simple',  v_head),  'A')
    || setweight(to_tsvector('english', v_head),  'A')
    || setweight(to_tsvector('simple',  v_meta),  'B')
    || setweight(to_tsvector('english', v_meta),  'B')
    || setweight(to_tsvector('simple',  v_brief), 'C')
    || setweight(to_tsvector('english', v_brief), 'C');
  NEW.search_text_norm := nexus_qb_normalize(concat_ws(' ', v_head, v_brief));
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_nexus_inspiration_refresh_search ON nexus_inspiration_items;
CREATE TRIGGER trg_nexus_inspiration_refresh_search
  BEFORE INSERT OR UPDATE ON nexus_inspiration_items
  FOR EACH ROW EXECUTE FUNCTION nexus_inspiration_refresh_search();

CREATE TABLE IF NOT EXISTS nexus_inspiration_saves (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id    UUID NOT NULL REFERENCES nexus_inspiration_items(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_nexus_inspiration_saves_user
  ON nexus_inspiration_saves (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nexus_inspiration_saves_item
  ON nexus_inspiration_saves (item_id);

CREATE OR REPLACE FUNCTION nexus_inspiration_count_saves()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE nexus_inspiration_items SET save_count = save_count + 1 WHERE id = NEW.item_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE nexus_inspiration_items SET save_count = greatest(save_count - 1, 0) WHERE id = OLD.item_id;
  END IF;
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_nexus_inspiration_count_saves ON nexus_inspiration_saves;
CREATE TRIGGER trg_nexus_inspiration_count_saves
  AFTER INSERT OR DELETE ON nexus_inspiration_saves
  FOR EACH ROW EXECUTE FUNCTION nexus_inspiration_count_saves();

-- A student may keep their drawings to themselves. Separate from
-- sketchbook_feature_opt_out, which is about Teams class posts.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS share_drawings_opt_out BOOLEAN NOT NULL DEFAULT false;

-- Service role only. MSAL means auth.uid() is always null in Nexus, so a
-- policy would be dead code; API routes read through the admin client.
ALTER TABLE nexus_inspiration_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_inspiration_saves ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 3: Apply to staging** with `mcp__supabase-staging__apply_migration`, name `nexus_inspiration_schema`, using the file contents.

- [ ] **Step 4: Re-run the Step 1 assertion.** Expected: the error text is `PASS: inspiration schema`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260920090000_nexus_inspiration_schema.sql
git commit -m "feat(nexus): inspiration items and saves schema

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Sync migration and backfill

**Files:**
- Create: `supabase/migrations/20260920090100_nexus_inspiration_sync.sql`

**Interfaces:**
- **Consumes:** Task 1 tables.
- **Produces:**
  - `nexus_inspiration_type_slug(text) returns text`
  - `nexus_inspiration_sync_submission(uuid) returns void`
  - `nexus_inspiration_resync_all() returns integer`
  - triggers on `drawing_submissions`, `drawing_submission_tags` and `drawing_questions`
- **Rule mirrored by:** `inspiration-rules.ts` (Task 4).

- [ ] **Step 1: Write the failing assertion.** Run it on staging. Expected: it fails, with `FAIL 1: no original item on insert` (no trigger exists yet).

```sql
DO $t$
DECLARE v_student uuid; v_q uuid; v_sub uuid; v_tag uuid; v_n int;
BEGIN
  SELECT id INTO v_student FROM users WHERE user_type = 'student' AND NOT is_alumni LIMIT 1;

  INSERT INTO drawing_questions (year, category, sub_type, question_text)
  VALUES (2024, '3d_composition', 'still_life', 'Draw a travel bag, a hat and a walking stick')
  RETURNING id INTO v_q;

  INSERT INTO drawing_submissions (student_id, source_type, original_image_url, question_id)
  VALUES (v_student, 'free_practice', 'https://example.com/o.jpg', v_q)
  RETURNING id INTO v_sub;

  -- 1. Unreviewed: an original item exists, is not eligible, carries types and year.
  IF NOT EXISTS (SELECT 1 FROM nexus_inspiration_items WHERE source_submission_id = v_sub AND source_kind = 'submission_original') THEN
    RAISE EXCEPTION 'FAIL 1: no original item on insert';
  END IF;
  IF (SELECT auto_eligible FROM nexus_inspiration_items WHERE source_submission_id = v_sub AND source_kind = 'submission_original') THEN
    RAISE EXCEPTION 'FAIL 1b: unreviewed original is eligible';
  END IF;
  IF NOT (SELECT type_slugs @> '{3d_composition,still_life}' AND paper_years @> '{2024}'
            FROM nexus_inspiration_items WHERE source_submission_id = v_sub AND source_kind = 'submission_original') THEN
    RAISE EXCEPTION 'FAIL 1c: types or year not synced';
  END IF;

  -- 2. Reviewed at 3 stars with a reference: reference in, original out.
  UPDATE drawing_submissions
     SET status = 'completed', reviewed_at = now(), tutor_rating = 3, corrected_image_url = 'https://example.com/r.jpg'
   WHERE id = v_sub;
  IF NOT coalesce((SELECT auto_eligible FROM nexus_inspiration_items WHERE source_submission_id = v_sub AND source_kind = 'submission_reference'), false) THEN
    RAISE EXCEPTION 'FAIL 2: reference not eligible after review';
  END IF;
  IF (SELECT auto_eligible FROM nexus_inspiration_items WHERE source_submission_id = v_sub AND source_kind = 'submission_original') THEN
    RAISE EXCEPTION 'FAIL 2b: a 3 star original is eligible';
  END IF;

  -- 3. 4 stars: the original goes in.
  UPDATE drawing_submissions SET tutor_rating = 4 WHERE id = v_sub;
  IF NOT (SELECT auto_eligible FROM nexus_inspiration_items WHERE source_submission_id = v_sub AND source_kind = 'submission_original') THEN
    RAISE EXCEPTION 'FAIL 3: a 4 star original is not eligible';
  END IF;

  -- 4. Redo keeps the teacher reference, drops the student original.
  UPDATE drawing_submissions SET status = 'redo' WHERE id = v_sub;
  IF NOT (SELECT auto_eligible FROM nexus_inspiration_items WHERE source_submission_id = v_sub AND source_kind = 'submission_reference') THEN
    RAISE EXCEPTION 'FAIL 4: redo dropped the reference';
  END IF;
  IF (SELECT auto_eligible FROM nexus_inspiration_items WHERE source_submission_id = v_sub AND source_kind = 'submission_original') THEN
    RAISE EXCEPTION 'FAIL 4b: redo kept the original';
  END IF;
  UPDATE drawing_submissions SET status = 'completed' WHERE id = v_sub;

  -- 5. A review tag maps onto a drawing type.
  SELECT id INTO v_tag FROM drawing_tags WHERE slug = 'street-view';
  IF v_tag IS NOT NULL THEN
    INSERT INTO drawing_submission_tags (submission_id, tag_id) VALUES (v_sub, v_tag);
    IF NOT (SELECT type_slugs @> '{street_view}' FROM nexus_inspiration_items WHERE source_submission_id = v_sub AND source_kind = 'submission_original') THEN
      RAISE EXCEPTION 'FAIL 5: street-view tag did not map to street_view';
    END IF;
  END IF;

  -- 6. A teacher decision survives a re-sync.
  UPDATE nexus_inspiration_items SET curation = 'hidden'
   WHERE source_submission_id = v_sub AND source_kind = 'submission_original';
  UPDATE drawing_submissions SET tutor_rating = 5 WHERE id = v_sub;
  IF (SELECT curation FROM nexus_inspiration_items WHERE source_submission_id = v_sub AND source_kind = 'submission_original') <> 'hidden' THEN
    RAISE EXCEPTION 'FAIL 6: re-sync overwrote curation';
  END IF;

  -- 7. Test drawings never become items.
  UPDATE drawing_submissions SET source_type = 'exam' WHERE id = v_sub;
  SELECT count(*) INTO v_n FROM nexus_inspiration_items WHERE source_submission_id = v_sub;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FAIL 7: an exam drawing still has % items', v_n;
  END IF;

  RAISE EXCEPTION 'PASS: inspiration sync';
END $t$;
```

- [ ] **Step 2: Write the migration.**

```sql
-- ============================================
-- INSPIRATION SYNC: drawing_submissions -> nexus_inspiration_items
--
-- Triggers, not app code: at least nine routes write the columns that decide
-- what a student may see (review, release, redo, gallery publish, sketchbook
-- feature, rotate, tags, auto-draft tags, delete). One function that
-- recomputes a submission's items from scratch catches all of them and cannot
-- drift. It never writes curation columns, and it swallows its own errors so
-- a sync problem can never fail a teacher's review save.
--
-- Rule (mirrored in apps/nexus/src/lib/inspiration-rules.ts):
--   reference eligible  reviewed_at set, status completed/reviewed/redo
--   original eligible   reviewed_at set, status completed/reviewed, score >= 0.8
--   score               tutor_rating / 5, else tutor_marks / assignment max_marks
--   exam drawings       never become items
-- ============================================

-- Drawing tags and question sub-types use their own spellings. Map them onto
-- the nexus_qb_tags drawing tree so one set of type chips covers everything.
CREATE OR REPLACE FUNCTION nexus_inspiration_type_slug(p_raw text)
RETURNS text
LANGUAGE sql
STABLE
AS $fn$
  WITH norm AS (SELECT replace(lower(btrim(coalesce(p_raw, ''))), '-', '_') AS s),
  mapped AS (
    SELECT CASE n.s
      WHEN 'perspective'      THEN 'perspective_drawing'
      WHEN 'portrait'         THEN 'portrait_figure'
      WHEN 'figure_study'     THEN 'portrait_figure'
      WHEN 'logo'             THEN 'logo_design'
      WHEN 'poster'           THEN 'poster_design'
      WHEN 'geometric_shapes' THEN 'shape_composition'
      WHEN 'product_surface'  THEN 'product_object'
      ELSE n.s
    END AS s
    FROM norm n
  ),
  drawing_root AS (SELECT id FROM nexus_qb_tags WHERE slug = 'drawing' LIMIT 1)
  SELECT c.slug
    FROM mapped m
    JOIN nexus_qb_tags c ON c.slug = m.s AND c.is_active
   WHERE m.s <> ''
     AND (c.parent_id = (SELECT id FROM drawing_root)
          OR c.parent_id IN (SELECT t.id FROM nexus_qb_tags t WHERE t.parent_id = (SELECT id FROM drawing_root)))
   LIMIT 1
$fn$;

CREATE OR REPLACE FUNCTION nexus_inspiration_sync_submission(p_submission_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  s              drawing_submissions%ROWTYPE;
  v_q_id         uuid;
  v_q_text       text;
  v_q_category   text;
  v_q_sub_type   text;
  v_q_year       integer;
  v_qb_id        uuid;
  v_max_marks    numeric;
  v_assign_title text;
  v_brief        text;
  v_types        text[];
  v_labels       text[];
  v_exams        text[];
  v_years        smallint[];
  v_score_num    numeric;
  v_reviewed     boolean;
  v_aspect       real;
BEGIN
  SELECT * INTO s FROM drawing_submissions WHERE id = p_submission_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- A classmate may be about to sit the same paper.
  IF s.source_type = 'exam' THEN
    DELETE FROM nexus_inspiration_items WHERE source_submission_id = s.id;
    RETURN;
  END IF;

  SELECT ca.max_marks, ca.title, ca.drawing_question_id
    INTO v_max_marks, v_assign_title, v_q_id
    FROM nexus_class_assignments ca
   WHERE ca.id = s.assignment_id;

  SELECT dq.id, dq.question_text, dq.category, dq.sub_type, dq.year, dq.qb_question_id
    INTO v_q_id, v_q_text, v_q_category, v_q_sub_type, v_q_year, v_qb_id
    FROM drawing_questions dq
   WHERE dq.id = coalesce(s.question_id, v_q_id);

  v_brief := coalesce(nullif(btrim(v_q_text), ''), nullif(btrim(v_assign_title), ''), nullif(btrim(s.self_note), ''));

  v_score_num := CASE
    WHEN s.tutor_rating IS NOT NULL THEN s.tutor_rating / 5.0
    WHEN s.tutor_marks IS NOT NULL AND v_max_marks > 0 THEN s.tutor_marks / v_max_marks
  END;

  SELECT coalesce(array_agg(DISTINCT CASE WHEN src.exam_type ILIKE 'JEE%' THEN 'JEE_PAPER_2' ELSE 'NATA' END)
                    FILTER (WHERE src.exam_type IS NOT NULL), '{}'),
         coalesce(array_agg(DISTINCT src.year::smallint) FILTER (WHERE src.year IS NOT NULL), '{}')
    INTO v_exams, v_years
    FROM nexus_qb_question_sources src
   WHERE src.question_id = v_qb_id;

  IF cardinality(v_exams) = 0 AND v_qb_id IS NOT NULL THEN
    SELECT CASE q.exam_relevance
             WHEN 'JEE'  THEN ARRAY['JEE_PAPER_2']
             WHEN 'NATA' THEN ARRAY['NATA']
             WHEN 'BOTH' THEN ARRAY['NATA', 'JEE_PAPER_2']
           END
      INTO v_exams
      FROM nexus_qb_questions q
     WHERE q.id = v_qb_id;
    v_exams := coalesce(v_exams, '{}');
  END IF;

  -- An assignment brief's hidden question carries the year it was written,
  -- not a past paper year, so only real practice questions lend their year.
  IF cardinality(v_years) = 0 AND v_q_year IS NOT NULL AND coalesce(v_q_sub_type, '') <> 'assignment' THEN
    v_years := ARRAY[v_q_year::smallint];
  END IF;

  v_types := ARRAY(
    SELECT DISTINCT m.slug FROM (
      SELECT nexus_inspiration_type_slug(dt.slug) AS slug
        FROM drawing_submission_tags st
        JOIN drawing_tags dt ON dt.id = st.tag_id
       WHERE st.submission_id = s.id
      UNION ALL SELECT nexus_inspiration_type_slug(v_q_category)
      UNION ALL SELECT nexus_inspiration_type_slug(v_q_sub_type)
    ) m
    WHERE m.slug IS NOT NULL);

  -- A leaf type ("Street View") also files under its family ("2D Composition").
  v_types := ARRAY(
    SELECT DISTINCT x.slug FROM (
      SELECT unnest(v_types) AS slug
      UNION ALL
      SELECT p.slug
        FROM nexus_qb_tags c
        JOIN nexus_qb_tags p ON p.id = c.parent_id
       WHERE c.slug = ANY(v_types) AND p.slug <> 'drawing'
    ) x
    ORDER BY x.slug);

  v_labels := ARRAY(
    SELECT DISTINCT l.label FROM (
      SELECT dt.label AS label
        FROM drawing_submission_tags st
        JOIN drawing_tags dt ON dt.id = st.tag_id
       WHERE st.submission_id = s.id
         AND dt.slug NOT LIKE 'e2e-%'
         AND nexus_inspiration_type_slug(dt.slug) IS NULL
      UNION ALL
      SELECT initcap(replace(v_q_sub_type, '_', ' '))
       WHERE v_q_sub_type IS NOT NULL
         AND v_q_sub_type <> 'assignment'
         AND nexus_inspiration_type_slug(v_q_sub_type) IS NULL
    ) l
    WHERE l.label IS NOT NULL
    ORDER BY l.label);

  v_reviewed := s.reviewed_at IS NOT NULL;
  v_aspect := CASE WHEN (s.image_quality ->> 'aspect') ~ '^[0-9]*\.?[0-9]+$'
                   THEN (s.image_quality ->> 'aspect')::real END;
  IF v_aspect IS NOT NULL AND (v_aspect < 0.1 OR v_aspect > 10) THEN
    v_aspect := NULL;
  END IF;

  INSERT INTO nexus_inspiration_items AS i (
    source_kind, source_submission_id, source_drawing_question_id, source_qb_question_id,
    image_url, thumbnail_url, image_aspect, brief, category, type_slugs, tag_labels,
    exam_types, paper_years, author_id, score_pct, source_created_at, auto_eligible)
  VALUES (
    'submission_original', s.id, v_q_id, v_qb_id,
    s.original_image_url, s.thumbnail_url, v_aspect, v_brief, v_q_category, v_types, v_labels,
    v_exams, v_years, s.student_id, v_score_num::real, coalesce(s.submitted_at, now()),
    v_reviewed AND s.status IN ('completed', 'reviewed') AND coalesce(v_score_num, 0) >= 0.8)
  ON CONFLICT (source_kind, source_submission_id) WHERE source_submission_id IS NOT NULL
  DO UPDATE SET
    source_drawing_question_id = EXCLUDED.source_drawing_question_id,
    source_qb_question_id      = EXCLUDED.source_qb_question_id,
    thumbnail_url = CASE WHEN i.image_url = EXCLUDED.image_url THEN coalesce(EXCLUDED.thumbnail_url, i.thumbnail_url) ELSE EXCLUDED.thumbnail_url END,
    image_aspect  = CASE WHEN i.image_url = EXCLUDED.image_url THEN coalesce(EXCLUDED.image_aspect, i.image_aspect) ELSE EXCLUDED.image_aspect END,
    image_url         = EXCLUDED.image_url,
    brief             = EXCLUDED.brief,
    category          = EXCLUDED.category,
    type_slugs        = EXCLUDED.type_slugs,
    tag_labels        = EXCLUDED.tag_labels,
    exam_types        = EXCLUDED.exam_types,
    paper_years       = EXCLUDED.paper_years,
    author_id         = EXCLUDED.author_id,
    score_pct         = EXCLUDED.score_pct,
    source_created_at = EXCLUDED.source_created_at,
    auto_eligible     = EXCLUDED.auto_eligible;

  IF s.corrected_image_url IS NOT NULL THEN
    INSERT INTO nexus_inspiration_items AS i (
      source_kind, source_submission_id, source_drawing_question_id, source_qb_question_id,
      image_url, thumbnail_url, image_aspect, brief, category, type_slugs, tag_labels,
      exam_types, paper_years, author_id, score_pct, source_created_at, auto_eligible)
    VALUES (
      'submission_reference', s.id, v_q_id, v_qb_id,
      s.corrected_image_url, NULL, NULL, v_brief, v_q_category, v_types, v_labels,
      v_exams, v_years, s.student_id, NULL, coalesce(s.reviewed_at, s.submitted_at, now()),
      v_reviewed AND s.status IN ('completed', 'reviewed', 'redo'))
    ON CONFLICT (source_kind, source_submission_id) WHERE source_submission_id IS NOT NULL
    DO UPDATE SET
      source_drawing_question_id = EXCLUDED.source_drawing_question_id,
      source_qb_question_id      = EXCLUDED.source_qb_question_id,
      thumbnail_url = CASE WHEN i.image_url = EXCLUDED.image_url THEN i.thumbnail_url ELSE NULL END,
      image_aspect  = CASE WHEN i.image_url = EXCLUDED.image_url THEN i.image_aspect ELSE NULL END,
      image_url         = EXCLUDED.image_url,
      brief             = EXCLUDED.brief,
      category          = EXCLUDED.category,
      type_slugs        = EXCLUDED.type_slugs,
      tag_labels        = EXCLUDED.tag_labels,
      exam_types        = EXCLUDED.exam_types,
      paper_years       = EXCLUDED.paper_years,
      author_id         = EXCLUDED.author_id,
      source_created_at = EXCLUDED.source_created_at,
      auto_eligible     = EXCLUDED.auto_eligible;
  ELSE
    -- Keep the row (saves and curation survive); just take it off the shelf.
    UPDATE nexus_inspiration_items
       SET auto_eligible = false
     WHERE source_kind = 'submission_reference'
       AND source_submission_id = s.id
       AND auto_eligible;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'nexus_inspiration_sync_submission(%): % %', p_submission_id, SQLSTATE, SQLERRM;
END;
$fn$;

CREATE OR REPLACE FUNCTION nexus_inspiration_on_submission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM nexus_inspiration_sync_submission(NEW.id);
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_nexus_inspiration_submission ON drawing_submissions;
CREATE TRIGGER trg_nexus_inspiration_submission
  AFTER INSERT OR UPDATE OF status, reviewed_at, tutor_rating, tutor_marks, corrected_image_url,
    original_image_url, thumbnail_url, question_id, assignment_id, image_quality, self_note, source_type
  ON drawing_submissions
  FOR EACH ROW EXECUTE FUNCTION nexus_inspiration_on_submission();

CREATE OR REPLACE FUNCTION nexus_inspiration_on_submission_tag()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM nexus_inspiration_sync_submission(COALESCE(NEW.submission_id, OLD.submission_id));
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_nexus_inspiration_submission_tag ON drawing_submission_tags;
CREATE TRIGGER trg_nexus_inspiration_submission_tag
  AFTER INSERT OR UPDATE OR DELETE ON drawing_submission_tags
  FOR EACH ROW EXECUTE FUNCTION nexus_inspiration_on_submission_tag();

CREATE OR REPLACE FUNCTION nexus_inspiration_on_question()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT ds.id
      FROM drawing_submissions ds
     WHERE ds.question_id = NEW.id
        OR ds.assignment_id IN (SELECT ca.id FROM nexus_class_assignments ca WHERE ca.drawing_question_id = NEW.id)
  LOOP
    PERFORM nexus_inspiration_sync_submission(r.id);
  END LOOP;
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_nexus_inspiration_question ON drawing_questions;
CREATE TRIGGER trg_nexus_inspiration_question
  AFTER UPDATE OF question_text, category, sub_type, year, qb_question_id ON drawing_questions
  FOR EACH ROW EXECUTE FUNCTION nexus_inspiration_on_question();

-- Repair: re-derive every item. Also the backfill below.
CREATE OR REPLACE FUNCTION nexus_inspiration_resync_all()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r record;
  n integer := 0;
BEGIN
  FOR r IN SELECT id FROM drawing_submissions LOOP
    PERFORM nexus_inspiration_sync_submission(r.id);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$fn$;

REVOKE ALL ON FUNCTION nexus_inspiration_sync_submission(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION nexus_inspiration_resync_all() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nexus_inspiration_sync_submission(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION nexus_inspiration_resync_all() TO service_role;

-- Backfill. The old is_gallery_visible flag is deliberately ignored: it was set
-- by a default, not by a teacher, and the new rule is the 4 star threshold.
SELECT nexus_inspiration_resync_all();

-- Curators already pinned some alumni work in the Hall of Fame.
UPDATE nexus_inspiration_items i
   SET is_featured = true
  FROM drawing_submissions s
 WHERE s.id = i.source_submission_id
   AND s.alumni_featured;
```

- [ ] **Step 3: Apply to staging** (`mcp__supabase-staging__apply_migration`, name `nexus_inspiration_sync`).

- [ ] **Step 4: Re-run the Step 1 assertion.** Expected: `PASS: inspiration sync`.

- [ ] **Step 5: Check the backfill counts on staging.**

```sql
select source_kind, count(*) as items, count(*) filter (where is_visible) as visible
from nexus_inspiration_items group by source_kind order by source_kind;
```

Expected: `submission_original` rows equal the count of non-exam `drawing_submissions`. The visible counts roughly follow staging's data; prod had about 165 references and about 83 originals. Record the numbers in the commit message body.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260920090100_nexus_inspiration_sync.sql
git commit -m "feat(nexus): sync reviewed drawings into inspiration items

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Search, facets, similar and get RPCs

**Files:**
- Create: `supabase/migrations/20260920090200_nexus_inspiration_search_rpc.sql`

**Interfaces:**
- **Consumes:** Task 1 table and `library_expand_query(text)`, `nexus_qb_normalize(text)`.
- **Produces:** the RPCs below. Every row-returning one returns the **same 32 columns**:
  - `id, source_kind, source_submission_id, source_drawing_question_id, image_url, thumbnail_url, image_aspect, title_override, brief, category, type_slugs, tag_labels, exam_types, paper_years, is_featured, is_visible, curation, auto_eligible, score_pct, save_count, source_created_at, author_id, author_name, author_first_name, author_last_name, author_is_alumni, author_academic_year, author_opted_out, is_saved`
  - then `rank real, match_kind text, total_count bigint`.
- **The RPCs:**
  - `nexus_inspiration_search(p_query text, p_types text[], p_exam text, p_by text, p_year smallint, p_sort text, p_scope text, p_viewer_id uuid, p_saved_only boolean, p_limit int, p_offset int)`. `match_kind` is `browse`, `text`, `any` or `fuzzy`.
  - `nexus_inspiration_facets(p_query text, p_types text[], p_exam text, p_by text, p_year smallint, p_scope text, p_viewer_id uuid)` returns `(facet text, value text, label text, item_count bigint)`.
  - `nexus_inspiration_similar(p_item_id uuid, p_viewer_id uuid, p_limit int)`. `match_kind` is `similar`.
  - `nexus_inspiration_get(p_item_id uuid, p_viewer_id uuid, p_scope text)`. `match_kind` is `item` or `pair`.
- **Scopes:**
  - `visible`: what students see (`is_visible`, and not an opted-out author's original).
  - `hidden`: everything not visible that a teacher could sensibly show, which excludes never-rated originals.
  - `all`: no visibility filter.
- **Output flags:** `is_visible` is already adjusted for opt-out. `author_*` is null when the author opted out.

- [ ] **Step 1: Write the failing assertion.** Run it on staging. Expected: `function nexus_inspiration_search(...) does not exist`.

```sql
DO $t$
DECLARE v_a uuid; v_b uuid; v_c uuid; v_n int; v_kind text;
BEGIN
  INSERT INTO nexus_inspiration_items (source_kind, image_url, brief, type_slugs, exam_types, paper_years, auto_eligible)
  VALUES ('exemplar', 'https://example.com/a.jpg', 'Zqxj travel bag with a floppy hat', '{3d_composition}', '{NATA}', '{2023}', true)
  RETURNING id INTO v_a;
  INSERT INTO nexus_inspiration_items (source_kind, image_url, brief, type_slugs, exam_types, paper_years, auto_eligible)
  VALUES ('exemplar', 'https://example.com/b.jpg', 'Zqxj crowded market lane', '{2d_composition,street_view}', '{JEE_PAPER_2}', '{2024}', true)
  RETURNING id INTO v_b;
  INSERT INTO nexus_inspiration_items (source_kind, image_url, brief, type_slugs, exam_types, paper_years, auto_eligible)
  VALUES ('exemplar', 'https://example.com/c.jpg', 'Zqxj temple entrance', '{street_view}', '{NATA}', '{2024}', true)
  RETURNING id INTO v_c;

  -- 1. every word must match
  SELECT count(*) INTO v_n FROM nexus_inspiration_search('zqxj bag hat') s WHERE s.id IN (v_a, v_b, v_c);
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL 1: all-words search returned % of ours', v_n; END IF;

  -- 2. type labels, exam and year are searchable
  SELECT count(*) INTO v_n FROM nexus_inspiration_search('zqxj street view') s WHERE s.id IN (v_b, v_c);
  IF v_n <> 2 THEN RAISE EXCEPTION 'FAIL 2: type label search returned %', v_n; END IF;
  SELECT count(*) INTO v_n FROM nexus_inspiration_search('zqxj nata 2023') s WHERE s.id = v_a;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL 3: exam and year search missed'; END IF;

  -- 3. no item has every word: fall back to any word
  SELECT max(s.match_kind), count(*) FILTER (WHERE s.id IN (v_a, v_b, v_c))
    INTO v_kind, v_n FROM nexus_inspiration_search('zqxj qqunmatchedqq') s;
  IF v_kind <> 'any' OR v_n <> 3 THEN RAISE EXCEPTION 'FAIL 4: any-word fallback gave % (%)', v_n, v_kind; END IF;

  -- 4. typo tolerance
  SELECT max(s.match_kind) INTO v_kind FROM nexus_inspiration_search('zqxjj') s WHERE s.id IN (v_a, v_b, v_c);
  IF v_kind IS DISTINCT FROM 'fuzzy' THEN RAISE EXCEPTION 'FAIL 5: fuzzy fallback gave %', v_kind; END IF;

  -- 5. filters
  SELECT count(*) INTO v_n FROM nexus_inspiration_search('zqxj', '{street_view}') s WHERE s.id IN (v_a, v_b, v_c);
  IF v_n <> 2 THEN RAISE EXCEPTION 'FAIL 6: type filter returned %', v_n; END IF;
  SELECT count(*) INTO v_n FROM nexus_inspiration_search('zqxj', NULL, 'JEE_PAPER_2') s WHERE s.id IN (v_a, v_b, v_c);
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL 7: exam filter returned %', v_n; END IF;
  SELECT count(*) INTO v_n FROM nexus_inspiration_search('zqxj', NULL, NULL, 'reference', 2024::smallint) s WHERE s.id IN (v_a, v_b, v_c);
  IF v_n <> 2 THEN RAISE EXCEPTION 'FAIL 8: by + year filter returned %', v_n; END IF;

  -- 6. hidden items leave the visible scope and appear in the hidden scope
  UPDATE nexus_inspiration_items SET curation = 'hidden' WHERE id = v_a;
  SELECT count(*) INTO v_n FROM nexus_inspiration_search('zqxj') s WHERE s.id = v_a;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL 9: hidden item still searchable by students'; END IF;
  SELECT count(*) INTO v_n FROM nexus_inspiration_search('zqxj', NULL, NULL, NULL, NULL, 'relevant', 'hidden') s WHERE s.id = v_a;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL 10: hidden scope missed the hidden item'; END IF;
  SELECT count(*) INTO v_n FROM nexus_inspiration_get(v_a, NULL, 'visible');
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL 11: get returned a hidden item in the visible scope'; END IF;

  -- 7. facets count with the other filters applied
  SELECT item_count INTO v_n FROM nexus_inspiration_facets('zqxj', NULL, NULL, NULL, NULL, 'visible', NULL) f
   WHERE f.facet = 'type' AND f.value = 'street_view';
  IF v_n IS DISTINCT FROM 2 THEN RAISE EXCEPTION 'FAIL 12: street_view facet count %', v_n; END IF;

  -- 8. similar shares a type, never returns itself
  SELECT count(*) INTO v_n FROM nexus_inspiration_similar(v_b, NULL, 1000) s WHERE s.id = v_c;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL 13: similar missed a street view sibling'; END IF;
  SELECT count(*) INTO v_n FROM nexus_inspiration_similar(v_b, NULL, 1000) s WHERE s.id = v_b;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL 14: similar returned the item itself'; END IF;

  RAISE EXCEPTION 'PASS: inspiration search';
END $t$;
```

- [ ] **Step 2: Write the migration.**

```sql
-- ============================================
-- INSPIRATION SEARCH
--
-- nexus_inspiration_base is the one place that decides who sees what:
-- visibility, the opt-out rule, filters and "saved". Every other function
-- reads through it, so a student can never reach a row the base refuses.
--
-- Search order, copied from library_search:
--   no query      browse (featured first, then newest)
--   every word    weighted full text, with tag aliases folded in
--   any word      when nothing has every word ("3D bag hat")
--   typo          word_similarity >= 0.4, first page only
-- ============================================

CREATE OR REPLACE FUNCTION nexus_inspiration_base(
  p_types      text[],
  p_exam       text,
  p_by         text,
  p_year       smallint,
  p_scope      text,
  p_viewer_id  uuid,
  p_saved_only boolean
)
RETURNS TABLE (
  id uuid, source_kind text, source_submission_id uuid, source_drawing_question_id uuid,
  image_url text, thumbnail_url text, image_aspect real, title_override text, brief text,
  category text, type_slugs text[], tag_labels text[], exam_types text[], paper_years smallint[],
  is_featured boolean, is_visible boolean, curation text, auto_eligible boolean, score_pct real,
  save_count integer, source_created_at timestamptz, search_vector tsvector, search_text_norm text,
  author_id uuid, author_name text, author_first_name text, author_last_name text,
  author_is_alumni boolean, author_academic_year text, author_opted_out boolean, is_saved boolean
)
LANGUAGE sql
STABLE
AS $fn$
  WITH item_rows AS (
    SELECT i.*,
           coalesce(u.share_drawings_opt_out, false) AS opted_out,
           u.name AS u_name, u.first_name AS u_first, u.last_name AS u_last,
           coalesce(u.is_alumni, false) AS u_alumni, u.academic_year AS u_year,
           (i.is_visible AND NOT (i.source_kind = 'submission_original' AND coalesce(u.share_drawings_opt_out, false))) AS student_visible
      FROM nexus_inspiration_items i
      LEFT JOIN users u ON u.id = i.author_id
  )
  SELECT r.id, r.source_kind, r.source_submission_id, r.source_drawing_question_id,
         r.image_url, r.thumbnail_url, r.image_aspect, r.title_override, coalesce(r.brief_override, r.brief),
         r.category, r.type_slugs, r.tag_labels, r.exam_types, r.paper_years,
         r.is_featured, r.student_visible, r.curation, r.auto_eligible, r.score_pct,
         r.save_count, r.source_created_at, r.search_vector, r.search_text_norm,
         CASE WHEN r.opted_out THEN NULL ELSE r.author_id END,
         CASE WHEN r.opted_out THEN NULL ELSE r.u_name END,
         CASE WHEN r.opted_out THEN NULL ELSE r.u_first END,
         CASE WHEN r.opted_out THEN NULL ELSE r.u_last END,
         r.u_alumni,
         CASE WHEN r.opted_out THEN NULL ELSE r.u_year END,
         r.opted_out,
         EXISTS (SELECT 1 FROM nexus_inspiration_saves sv WHERE sv.item_id = r.id AND sv.user_id = p_viewer_id)
    FROM item_rows r
   WHERE (CASE coalesce(p_scope, 'visible')
            WHEN 'all' THEN true
            WHEN 'hidden' THEN NOT r.student_visible
                           AND (r.curation = 'hidden' OR r.score_pct IS NOT NULL OR r.source_kind <> 'submission_original')
            ELSE r.student_visible
          END)
     AND (p_types IS NULL OR cardinality(p_types) = 0 OR r.type_slugs && p_types)
     AND (p_exam IS NULL OR p_exam = ANY(r.exam_types))
     AND (p_year IS NULL OR p_year = ANY(r.paper_years))
     AND (p_by IS NULL
          OR (p_by = 'reference' AND r.source_kind <> 'submission_original')
          OR (p_by = 'current'   AND r.source_kind = 'submission_original' AND NOT r.u_alumni)
          OR (p_by = 'alumni'    AND r.source_kind = 'submission_original' AND r.u_alumni))
     AND (NOT coalesce(p_saved_only, false)
          OR EXISTS (SELECT 1 FROM nexus_inspiration_saves sv WHERE sv.item_id = r.id AND sv.user_id = p_viewer_id))
$fn$;

CREATE OR REPLACE FUNCTION nexus_inspiration_search(
  p_query      text     DEFAULT NULL,
  p_types      text[]   DEFAULT NULL,
  p_exam       text     DEFAULT NULL,
  p_by         text     DEFAULT NULL,
  p_year       smallint DEFAULT NULL,
  p_sort       text     DEFAULT 'relevant',
  p_scope      text     DEFAULT 'visible',
  p_viewer_id  uuid     DEFAULT NULL,
  p_saved_only boolean  DEFAULT false,
  p_limit      int      DEFAULT 30,
  p_offset     int      DEFAULT 0
)
RETURNS TABLE (
  id uuid, source_kind text, source_submission_id uuid, source_drawing_question_id uuid,
  image_url text, thumbnail_url text, image_aspect real, title_override text, brief text,
  category text, type_slugs text[], tag_labels text[], exam_types text[], paper_years smallint[],
  is_featured boolean, is_visible boolean, curation text, auto_eligible boolean, score_pct real,
  save_count integer, source_created_at timestamptz,
  author_id uuid, author_name text, author_first_name text, author_last_name text,
  author_is_alumni boolean, author_academic_year text, author_opted_out boolean, is_saved boolean,
  rank real, match_kind text, total_count bigint
)
LANGUAGE plpgsql
STABLE
AS $fn$
#variable_conflict use_column
DECLARE
  v_q     text := btrim(coalesce(p_query, ''));
  v_norm  text := nexus_qb_normalize(p_query);
  v_label text;
  v_tsq   tsquery;
  v_any   tsquery;
  v_hits  bigint := 0;
BEGIN
  IF v_q = '' THEN
    RETURN QUERY
    SELECT b.id, b.source_kind, b.source_submission_id, b.source_drawing_question_id,
           b.image_url, b.thumbnail_url, b.image_aspect, b.title_override, b.brief,
           b.category, b.type_slugs, b.tag_labels, b.exam_types, b.paper_years,
           b.is_featured, b.is_visible, b.curation, b.auto_eligible, b.score_pct,
           b.save_count, b.source_created_at,
           b.author_id, b.author_name, b.author_first_name, b.author_last_name,
           b.author_is_alumni, b.author_academic_year, b.author_opted_out, b.is_saved,
           0::real, 'browse'::text, count(*) OVER ()
      FROM nexus_inspiration_base(p_types, p_exam, p_by, p_year, p_scope, p_viewer_id, p_saved_only) b
     ORDER BY
       CASE WHEN p_sort = 'saved' THEN b.save_count END DESC NULLS LAST,
       CASE WHEN p_sort = 'relevant' THEN b.is_featured END DESC NULLS LAST,
       b.source_created_at DESC
     LIMIT p_limit OFFSET p_offset;
    RETURN;
  END IF;

  v_tsq := websearch_to_tsquery('english', v_q) || websearch_to_tsquery('simple', v_q);
  FOREACH v_label IN ARRAY library_expand_query(v_q) LOOP
    v_tsq := v_tsq || phraseto_tsquery('simple', v_label);
  END LOOP;

  RETURN QUERY
  SELECT x.id, x.source_kind, x.source_submission_id, x.source_drawing_question_id,
         x.image_url, x.thumbnail_url, x.image_aspect, x.title_override, x.brief,
         x.category, x.type_slugs, x.tag_labels, x.exam_types, x.paper_years,
         x.is_featured, x.is_visible, x.curation, x.auto_eligible, x.score_pct,
         x.save_count, x.source_created_at,
         x.author_id, x.author_name, x.author_first_name, x.author_last_name,
         x.author_is_alumni, x.author_academic_year, x.author_opted_out, x.is_saved,
         x.rnk, 'text'::text, count(*) OVER ()
    FROM (SELECT b.*, ts_rank_cd(b.search_vector, v_tsq)::real AS rnk
            FROM nexus_inspiration_base(p_types, p_exam, p_by, p_year, p_scope, p_viewer_id, p_saved_only) b
           WHERE b.search_vector @@ v_tsq) x
   ORDER BY
     CASE WHEN p_sort = 'saved' THEN x.save_count END DESC NULLS LAST,
     CASE WHEN p_sort = 'relevant' THEN x.rnk END DESC NULLS LAST,
     CASE WHEN p_sort = 'relevant' THEN x.is_featured END DESC NULLS LAST,
     x.source_created_at DESC
   LIMIT p_limit OFFSET p_offset;

  GET DIAGNOSTICS v_hits = ROW_COUNT;
  IF v_hits > 0 OR p_offset > 0 THEN
    RETURN;
  END IF;

  -- Nothing has every word. "3D bag hat" should still find the bag drawings.
  v_any := nullif(replace(plainto_tsquery('simple', v_q)::text, ' & ', ' | '), '')::tsquery;
  IF v_any IS NOT NULL THEN
    v_any := v_any || coalesce(nullif(replace(plainto_tsquery('english', v_q)::text, ' & ', ' | '), '')::tsquery, v_any);

    RETURN QUERY
    SELECT x.id, x.source_kind, x.source_submission_id, x.source_drawing_question_id,
           x.image_url, x.thumbnail_url, x.image_aspect, x.title_override, x.brief,
           x.category, x.type_slugs, x.tag_labels, x.exam_types, x.paper_years,
           x.is_featured, x.is_visible, x.curation, x.auto_eligible, x.score_pct,
           x.save_count, x.source_created_at,
           x.author_id, x.author_name, x.author_first_name, x.author_last_name,
           x.author_is_alumni, x.author_academic_year, x.author_opted_out, x.is_saved,
           x.rnk, 'any'::text, count(*) OVER ()
      FROM (SELECT b.*, ts_rank_cd(b.search_vector, v_any)::real AS rnk
              FROM nexus_inspiration_base(p_types, p_exam, p_by, p_year, p_scope, p_viewer_id, p_saved_only) b
             WHERE b.search_vector @@ v_any) x
     ORDER BY x.rnk DESC, x.is_featured DESC, x.source_created_at DESC
     LIMIT p_limit;

    GET DIAGNOSTICS v_hits = ROW_COUNT;
    IF v_hits > 0 THEN
      RETURN;
    END IF;
  END IF;

  -- Typos. word_similarity scores the query against its best matching stretch
  -- of the document, which is what makes a one-word typo clear 0.4.
  RETURN QUERY
  SELECT x.id, x.source_kind, x.source_submission_id, x.source_drawing_question_id,
         x.image_url, x.thumbnail_url, x.image_aspect, x.title_override, x.brief,
         x.category, x.type_slugs, x.tag_labels, x.exam_types, x.paper_years,
         x.is_featured, x.is_visible, x.curation, x.auto_eligible, x.score_pct,
         x.save_count, x.source_created_at,
         x.author_id, x.author_name, x.author_first_name, x.author_last_name,
         x.author_is_alumni, x.author_academic_year, x.author_opted_out, x.is_saved,
         x.rnk, 'fuzzy'::text, count(*) OVER ()
    FROM (SELECT b.*, word_similarity(v_norm, b.search_text_norm)::real AS rnk
            FROM nexus_inspiration_base(p_types, p_exam, p_by, p_year, p_scope, p_viewer_id, p_saved_only) b
           WHERE v_norm <> '' AND word_similarity(v_norm, b.search_text_norm) >= 0.4) x
   ORDER BY x.rnk DESC, x.source_created_at DESC
   LIMIT p_limit;
END;
$fn$;

-- Chip counts. Each facet is counted with every OTHER filter applied, so a
-- chip always says how many drawings tapping it would show.
CREATE OR REPLACE FUNCTION nexus_inspiration_facets(
  p_query     text,
  p_types     text[],
  p_exam      text,
  p_by        text,
  p_year      smallint,
  p_scope     text,
  p_viewer_id uuid
)
RETURNS TABLE (facet text, value text, label text, item_count bigint)
LANGUAGE sql
STABLE
AS $fn$
  WITH
  t AS (SELECT s.id FROM nexus_inspiration_search(p_query, NULL,    p_exam, p_by, p_year, 'newest', p_scope, p_viewer_id, false, 10000, 0) s),
  e AS (SELECT s.id FROM nexus_inspiration_search(p_query, p_types, NULL,   p_by, p_year, 'newest', p_scope, p_viewer_id, false, 10000, 0) s),
  b AS (SELECT s.id FROM nexus_inspiration_search(p_query, p_types, p_exam, NULL, p_year, 'newest', p_scope, p_viewer_id, false, 10000, 0) s),
  y AS (SELECT s.id FROM nexus_inspiration_search(p_query, p_types, p_exam, p_by, NULL,   'newest', p_scope, p_viewer_id, false, 10000, 0) s)
  -- count(DISTINCT i.id) everywhere: a slug repeated in the tag registry must
  -- never double a chip's count.
  SELECT 'type'::text, ts.slug,
         (SELECT max(tg.label) FROM nexus_qb_tags tg WHERE tg.slug = ts.slug),
         count(DISTINCT i.id)
    FROM t JOIN nexus_inspiration_items i ON i.id = t.id
    CROSS JOIN LATERAL unnest(i.type_slugs) AS ts(slug)
   GROUP BY ts.slug
  UNION ALL
  SELECT 'exam'::text, ex.v, CASE ex.v WHEN 'NATA' THEN 'NATA' ELSE 'JEE Paper 2' END, count(DISTINCT i.id)
    FROM e JOIN nexus_inspiration_items i ON i.id = e.id
    CROSS JOIN LATERAL unnest(i.exam_types) AS ex(v)
   GROUP BY ex.v
  UNION ALL
  SELECT 'by'::text, k.v, NULL::text, count(DISTINCT i.id)
    FROM b JOIN nexus_inspiration_items i ON i.id = b.id
    LEFT JOIN users u ON u.id = i.author_id
    CROSS JOIN LATERAL (SELECT CASE WHEN i.source_kind <> 'submission_original' THEN 'reference'
                                    WHEN coalesce(u.is_alumni, false) THEN 'alumni'
                                    ELSE 'current' END AS v) k
   GROUP BY k.v
  UNION ALL
  SELECT 'year'::text, yr.v::text, yr.v::text, count(DISTINCT i.id)
    FROM y JOIN nexus_inspiration_items i ON i.id = y.id
    CROSS JOIN LATERAL unnest(i.paper_years) AS yr(v)
   GROUP BY yr.v
$fn$;

CREATE OR REPLACE FUNCTION nexus_inspiration_similar(
  p_item_id   uuid,
  p_viewer_id uuid,
  p_limit     int DEFAULT 12
)
RETURNS TABLE (
  id uuid, source_kind text, source_submission_id uuid, source_drawing_question_id uuid,
  image_url text, thumbnail_url text, image_aspect real, title_override text, brief text,
  category text, type_slugs text[], tag_labels text[], exam_types text[], paper_years smallint[],
  is_featured boolean, is_visible boolean, curation text, auto_eligible boolean, score_pct real,
  save_count integer, source_created_at timestamptz,
  author_id uuid, author_name text, author_first_name text, author_last_name text,
  author_is_alumni boolean, author_academic_year text, author_opted_out boolean, is_saved boolean,
  rank real, match_kind text, total_count bigint
)
LANGUAGE sql
STABLE
AS $fn$
  WITH me AS (
    SELECT i.id, i.source_submission_id, i.source_drawing_question_id, i.type_slugs
      FROM nexus_inspiration_items i
     WHERE i.id = p_item_id
  ),
  scored AS (
    SELECT b.*,
           ((CASE WHEN me.source_drawing_question_id IS NOT NULL
                   AND b.source_drawing_question_id = me.source_drawing_question_id THEN 3 ELSE 0 END)
            + 2 * cardinality(ARRAY(SELECT unnest(b.type_slugs) INTERSECT SELECT unnest(me.type_slugs))))::real AS rnk
      FROM me,
           nexus_inspiration_base(NULL, NULL, NULL, NULL, 'visible', p_viewer_id, false) b
     WHERE b.id <> me.id
       AND (me.source_submission_id IS NULL OR b.source_submission_id IS DISTINCT FROM me.source_submission_id)
  )
  SELECT s.id, s.source_kind, s.source_submission_id, s.source_drawing_question_id,
         s.image_url, s.thumbnail_url, s.image_aspect, s.title_override, s.brief,
         s.category, s.type_slugs, s.tag_labels, s.exam_types, s.paper_years,
         s.is_featured, s.is_visible, s.curation, s.auto_eligible, s.score_pct,
         s.save_count, s.source_created_at,
         s.author_id, s.author_name, s.author_first_name, s.author_last_name,
         s.author_is_alumni, s.author_academic_year, s.author_opted_out, s.is_saved,
         s.rnk, 'similar'::text, count(*) OVER ()
    FROM scored s
   WHERE s.rnk > 0
   ORDER BY s.rnk DESC, s.is_featured DESC, s.source_created_at DESC
   LIMIT p_limit
$fn$;

-- One item plus its pair (the other image of the same submission), in the
-- caller's scope. A student asking for a hidden item gets zero rows.
CREATE OR REPLACE FUNCTION nexus_inspiration_get(
  p_item_id   uuid,
  p_viewer_id uuid,
  p_scope     text DEFAULT 'visible'
)
RETURNS TABLE (
  id uuid, source_kind text, source_submission_id uuid, source_drawing_question_id uuid,
  image_url text, thumbnail_url text, image_aspect real, title_override text, brief text,
  category text, type_slugs text[], tag_labels text[], exam_types text[], paper_years smallint[],
  is_featured boolean, is_visible boolean, curation text, auto_eligible boolean, score_pct real,
  save_count integer, source_created_at timestamptz,
  author_id uuid, author_name text, author_first_name text, author_last_name text,
  author_is_alumni boolean, author_academic_year text, author_opted_out boolean, is_saved boolean,
  rank real, match_kind text, total_count bigint
)
LANGUAGE sql
STABLE
AS $fn$
  SELECT b.id, b.source_kind, b.source_submission_id, b.source_drawing_question_id,
         b.image_url, b.thumbnail_url, b.image_aspect, b.title_override, b.brief,
         b.category, b.type_slugs, b.tag_labels, b.exam_types, b.paper_years,
         b.is_featured, b.is_visible, b.curation, b.auto_eligible, b.score_pct,
         b.save_count, b.source_created_at,
         b.author_id, b.author_name, b.author_first_name, b.author_last_name,
         b.author_is_alumni, b.author_academic_year, b.author_opted_out, b.is_saved,
         0::real,
         CASE WHEN b.id = p_item_id THEN 'item' ELSE 'pair' END,
         1::bigint
    FROM nexus_inspiration_base(NULL, NULL, NULL, NULL, p_scope, p_viewer_id, false) b
   WHERE b.id = p_item_id
      OR (b.source_submission_id IS NOT NULL
          AND b.source_submission_id = (SELECT i.source_submission_id FROM nexus_inspiration_items i WHERE i.id = p_item_id))
$fn$;

REVOKE ALL ON FUNCTION nexus_inspiration_base(text[], text, text, smallint, text, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION nexus_inspiration_search(text, text[], text, text, smallint, text, text, uuid, boolean, int, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION nexus_inspiration_facets(text, text[], text, text, smallint, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION nexus_inspiration_similar(uuid, uuid, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION nexus_inspiration_get(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nexus_inspiration_base(text[], text, text, smallint, text, uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION nexus_inspiration_search(text, text[], text, text, smallint, text, text, uuid, boolean, int, int) TO service_role;
GRANT EXECUTE ON FUNCTION nexus_inspiration_facets(text, text[], text, text, smallint, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION nexus_inspiration_similar(uuid, uuid, int) TO service_role;
GRANT EXECUTE ON FUNCTION nexus_inspiration_get(uuid, uuid, text) TO service_role;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 3: Apply to staging** (`mcp__supabase-staging__apply_migration`, name `nexus_inspiration_search_rpc`).

- [ ] **Step 4: Re-run the Step 1 assertion.** Expected: `PASS: inspiration search`.

If FAIL 5 (fuzzy) fires because real staging rows match `zqxjj` in an earlier stage, look at the reported `match_kind`. Change only the nonsense token, to another unused string such as `vbnqz` and `vbnqzz`, in both the fixtures and the query. Never lower the 0.4 threshold.

- [ ] **Step 5: Try real queries on staging** and paste the counts into the commit body. None may error:
  - `select match_kind, count(*) from nexus_inspiration_search('street view') group by 1;`
  - the same query with `'3D bag hat'`, `'NATA 2025'` and `'prespective'`

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260920090200_nexus_inspiration_search_rpc.sql
git commit -m "feat(nexus): inspiration search, facets, similar and item RPCs

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Query layer in `@neram/database`

**Files:**
- Create: `packages/database/src/queries/nexus/inspiration.ts`
- Create: `packages/database/src/queries/nexus/inspiration.test.ts`
- Modify: `packages/database/src/queries/nexus/index.ts`. Add `export * from './inspiration';` after the line `export * from './sketchbook';`.

**Interfaces:**
- **Consumes:** the Task 3 RPCs and the Task 1 tables.
- **Produces** (exact names used by later tasks):
  - **Types:** `InspirationSourceKind`, `InspirationCuration`, `InspirationBy`, `InspirationSort`, `InspirationScope`, `InspirationExam`, `InspirationMatchKind`, `InspirationRow`, `InspirationFilters`, `InspirationSearchResult`, `InspirationFacet`, `InspirationItemPatch`, `ExemplarInput`, `ItemImageWork`
  - **Functions:**

| Function | Returns |
|---|---|
| `toSearchArgs(filters, viewerId)` | the RPC argument object |
| `searchInspiration(filters, viewerId, client?)` | `Promise<InspirationSearchResult>` |
| `getInspirationFacets(filters, viewerId, client?)` | `Promise<InspirationFacet[]>` |
| `getInspirationItem(itemId, viewerId, scope, client?)` | `Promise<{ item: InspirationRow \| null; pair: InspirationRow \| null }>` |
| `getSimilarInspiration(itemId, viewerId, limit?, client?)` | `Promise<InspirationRow[]>` |
| `setInspirationSave(itemId, userId, saved, client?)` | `Promise<void>` |
| `updateInspirationItem(itemId, patch, actorId, client?)` | `Promise<void>` |
| `hideInspirationByAuthor(authorId, actorId, client?)` | `Promise<void>` |
| `createExemplar(input, actorId, client?)` | `Promise<string>` |
| `deleteExemplar(itemId, client?)` | `Promise<boolean>` |
| `listItemsNeedingImages(limit, client?)` | `Promise<{ items: ItemImageWork[]; remaining: number }>` |
| `setItemImageMeta(itemId, meta, client?)` | `Promise<void>` |

- [ ] **Step 1: Write the failing test** `packages/database/src/queries/nexus/inspiration.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import {
  getInspirationItem,
  searchInspiration,
  setInspirationSave,
  toSearchArgs,
  type InspirationRow,
} from './inspiration';

/** A client whose query builder records every call and resolves to `result`. */
function fakeClient(result: { data: unknown; error: unknown; count?: number }) {
  const calls: Array<[string, unknown[]]> = [];
  const chain: any = new Proxy(
    {},
    {
      get: (_t, prop: string) => {
        if (prop === 'then') return (resolve: (v: unknown) => void) => resolve(result);
        return (...args: unknown[]) => {
          calls.push([prop, args]);
          return chain;
        };
      },
    },
  );
  const client: any = {
    rpc: (...args: unknown[]) => {
      calls.push(['rpc', args]);
      return Promise.resolve(result);
    },
    from: (...args: unknown[]) => {
      calls.push(['from', args]);
      return chain;
    },
  };
  return { client, calls };
}

const row = (over: Partial<InspirationRow>): InspirationRow =>
  ({ id: 'a', match_kind: 'text', total_count: 7, ...over }) as InspirationRow;

describe('toSearchArgs', () => {
  it('turns an empty query and empty types into nulls and clamps the page size', () => {
    expect(toSearchArgs({ query: '   ', types: [], limit: 500, offset: -4 }, 'viewer')).toEqual({
      p_query: null,
      p_types: null,
      p_exam: null,
      p_by: null,
      p_year: null,
      p_sort: 'relevant',
      p_scope: 'visible',
      p_viewer_id: 'viewer',
      p_saved_only: false,
      p_limit: 60,
      p_offset: 0,
    });
  });

  it('passes filters through', () => {
    const args = toSearchArgs(
      { query: ' bag ', types: ['street_view'], exam: 'NATA', by: 'alumni', year: 2024, sort: 'saved', scope: 'hidden', savedOnly: true, limit: 30, offset: 30 },
      'v',
    );
    expect(args).toMatchObject({ p_query: 'bag', p_types: ['street_view'], p_exam: 'NATA', p_by: 'alumni', p_year: 2024, p_sort: 'saved', p_scope: 'hidden', p_saved_only: true, p_limit: 30, p_offset: 30 });
  });
});

describe('searchInspiration', () => {
  it('reads the total and match kind off the first row', async () => {
    const { client, calls } = fakeClient({ data: [row({ id: 'a' }), row({ id: 'b' })], error: null });
    const out = await searchInspiration({ query: 'bag' }, 'v', client);
    expect(calls[0][0]).toBe('rpc');
    expect(calls[0][1][0]).toBe('nexus_inspiration_search');
    expect(out).toMatchObject({ total: 7, matchKind: 'text' });
    expect(out.rows.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('answers zero for an empty page', async () => {
    const { client } = fakeClient({ data: [], error: null });
    expect(await searchInspiration({}, 'v', client)).toEqual({ rows: [], total: 0, matchKind: null });
  });

  it('throws the database error', async () => {
    const { client } = fakeClient({ data: null, error: new Error('boom') });
    await expect(searchInspiration({}, 'v', client)).rejects.toThrow('boom');
  });
});

describe('getInspirationItem', () => {
  it('splits the item from its pair', async () => {
    const { client } = fakeClient({ data: [row({ id: 'p', match_kind: 'pair' }), row({ id: 'i', match_kind: 'item' })], error: null });
    const out = await getInspirationItem('i', 'v', 'visible', client);
    expect(out.item?.id).toBe('i');
    expect(out.pair?.id).toBe('p');
  });
});

describe('setInspirationSave', () => {
  it('upserts without failing on a second save', async () => {
    const { client, calls } = fakeClient({ data: null, error: null });
    await setInspirationSave('item', 'user', true, client);
    const upsert = calls.find(([name]) => name === 'upsert');
    expect(upsert?.[1]).toEqual([{ user_id: 'user', item_id: 'item' }, { onConflict: 'user_id,item_id', ignoreDuplicates: true }]);
  });

  it('deletes by user and item when unsaving', async () => {
    const { client, calls } = fakeClient({ data: null, error: null });
    await setInspirationSave('item', 'user', false, client);
    expect(calls.map(([name]) => name)).toEqual(['from', 'delete', 'eq', 'eq']);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test:run packages/database/src/queries/nexus/inspiration.test.ts`
Expected: FAIL, `Failed to resolve import "./inspiration"`.

- [ ] **Step 3: Write `packages/database/src/queries/nexus/inspiration.ts`**

```ts
/**
 * Inspiration: the drawing library students search for ideas.
 *
 * Every read goes through a nexus_inspiration_* RPC, so ranking, visibility and
 * the opt-out rule live in SQL in exactly one place (nexus_inspiration_base).
 * Callers are API routes on the admin client: Nexus signs in with Microsoft, so
 * RLS cannot see the caller and there are no policies to lean on.
 *
 * Spec: docs/superpowers/specs/2026-09-15-drawing-inspiration-design.md
 */
import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';

export type InspirationSourceKind = 'submission_reference' | 'submission_original' | 'exemplar' | 'qb_solution';
export type InspirationCuration = 'auto' | 'shown' | 'hidden';
export type InspirationBy = 'reference' | 'current' | 'alumni';
export type InspirationSort = 'relevant' | 'newest' | 'saved';
export type InspirationScope = 'visible' | 'hidden' | 'all';
export type InspirationExam = 'NATA' | 'JEE_PAPER_2';
export type InspirationMatchKind = 'browse' | 'text' | 'any' | 'fuzzy' | 'similar' | 'item' | 'pair';

export interface InspirationRow {
  id: string;
  source_kind: InspirationSourceKind;
  source_submission_id: string | null;
  source_drawing_question_id: string | null;
  image_url: string;
  thumbnail_url: string | null;
  image_aspect: number | null;
  title_override: string | null;
  brief: string | null;
  category: string | null;
  type_slugs: string[];
  tag_labels: string[];
  exam_types: string[];
  paper_years: number[];
  is_featured: boolean;
  /** Already adjusted for the author's opt-out. */
  is_visible: boolean;
  curation: InspirationCuration;
  auto_eligible: boolean;
  /** Tutor score as a fraction. Staff only: never send it to a student. */
  score_pct: number | null;
  save_count: number;
  source_created_at: string;
  /** Null when the author opted out. */
  author_id: string | null;
  author_name: string | null;
  author_first_name: string | null;
  author_last_name: string | null;
  author_is_alumni: boolean;
  author_academic_year: string | null;
  author_opted_out: boolean;
  is_saved: boolean;
  rank: number;
  match_kind: InspirationMatchKind;
  total_count: number;
}

export interface InspirationFilters {
  query?: string;
  types?: string[];
  exam?: InspirationExam;
  by?: InspirationBy;
  year?: number;
  sort?: InspirationSort;
  scope?: InspirationScope;
  savedOnly?: boolean;
  limit?: number;
  offset?: number;
}

export interface InspirationSearchResult {
  rows: InspirationRow[];
  total: number;
  matchKind: InspirationMatchKind | null;
}

export interface InspirationFacet {
  facet: 'type' | 'exam' | 'by' | 'year';
  value: string;
  label: string | null;
  item_count: number;
}

export interface InspirationItemPatch {
  curation?: InspirationCuration;
  is_featured?: boolean;
  title_override?: string | null;
  brief_override?: string | null;
  /** Exemplars only: a student drawing's types come from its review. */
  type_slugs?: string[];
  exam_types?: string[];
  paper_years?: number[];
}

export interface ExemplarInput {
  image_url: string;
  title: string | null;
  brief: string | null;
  type_slugs: string[];
  exam_types: string[];
  paper_years: number[];
}

export interface ItemImageWork {
  id: string;
  image_url: string;
  thumbnail_url: string | null;
  image_aspect: number | null;
}

const MAX_PAGE = 60;

// The generated Database type predates these tables and functions.
function db(client?: TypedSupabaseClient): any {
  return client || getSupabaseAdminClient();
}

export function toSearchArgs(filters: InspirationFilters, viewerId: string) {
  return {
    p_query: filters.query?.trim() || null,
    p_types: filters.types && filters.types.length > 0 ? filters.types : null,
    p_exam: filters.exam ?? null,
    p_by: filters.by ?? null,
    p_year: filters.year ?? null,
    p_sort: filters.sort ?? 'relevant',
    p_scope: filters.scope ?? 'visible',
    p_viewer_id: viewerId,
    p_saved_only: filters.savedOnly ?? false,
    p_limit: Math.min(Math.max(filters.limit ?? 30, 1), MAX_PAGE),
    p_offset: Math.max(filters.offset ?? 0, 0),
  };
}

export async function searchInspiration(
  filters: InspirationFilters,
  viewerId: string,
  client?: TypedSupabaseClient,
): Promise<InspirationSearchResult> {
  const { data, error } = await db(client).rpc('nexus_inspiration_search', toSearchArgs(filters, viewerId));
  if (error) throw error;
  const rows = (data || []) as InspirationRow[];
  return {
    rows,
    // The RPC repeats the windowed total on every row, so an empty page means zero.
    total: rows.length ? Number(rows[0].total_count) : 0,
    matchKind: rows.length ? rows[0].match_kind : null,
  };
}

export async function getInspirationFacets(
  filters: InspirationFilters,
  viewerId: string,
  client?: TypedSupabaseClient,
): Promise<InspirationFacet[]> {
  const a = toSearchArgs(filters, viewerId);
  const { data, error } = await db(client).rpc('nexus_inspiration_facets', {
    p_query: a.p_query,
    p_types: a.p_types,
    p_exam: a.p_exam,
    p_by: a.p_by,
    p_year: a.p_year,
    p_scope: a.p_scope,
    p_viewer_id: viewerId,
  });
  if (error) throw error;
  return ((data || []) as InspirationFacet[]).map((f) => ({ ...f, item_count: Number(f.item_count) }));
}

export async function getInspirationItem(
  itemId: string,
  viewerId: string,
  scope: InspirationScope,
  client?: TypedSupabaseClient,
): Promise<{ item: InspirationRow | null; pair: InspirationRow | null }> {
  const { data, error } = await db(client).rpc('nexus_inspiration_get', {
    p_item_id: itemId,
    p_viewer_id: viewerId,
    p_scope: scope,
  });
  if (error) throw error;
  const rows = (data || []) as InspirationRow[];
  return {
    item: rows.find((r) => r.match_kind === 'item') ?? null,
    pair: rows.find((r) => r.match_kind === 'pair') ?? null,
  };
}

export async function getSimilarInspiration(
  itemId: string,
  viewerId: string,
  limit = 12,
  client?: TypedSupabaseClient,
): Promise<InspirationRow[]> {
  const { data, error } = await db(client).rpc('nexus_inspiration_similar', {
    p_item_id: itemId,
    p_viewer_id: viewerId,
    p_limit: limit,
  });
  if (error) throw error;
  return (data || []) as InspirationRow[];
}

export async function setInspirationSave(
  itemId: string,
  userId: string,
  saved: boolean,
  client?: TypedSupabaseClient,
): Promise<void> {
  const table = db(client).from('nexus_inspiration_saves');
  const { error } = saved
    ? await table.upsert({ user_id: userId, item_id: itemId }, { onConflict: 'user_id,item_id', ignoreDuplicates: true })
    : await table.delete().eq('user_id', userId).eq('item_id', itemId);
  if (error) throw error;
}

export async function updateInspirationItem(
  itemId: string,
  patch: InspirationItemPatch,
  actorId: string,
  client?: TypedSupabaseClient,
): Promise<void> {
  const row: Record<string, unknown> = { ...patch };
  if (patch.curation !== undefined) {
    row.curated_by = actorId;
    row.curated_at = new Date().toISOString();
  }
  const { error } = await db(client).from('nexus_inspiration_items').update(row).eq('id', itemId);
  if (error) throw error;
}

/** Hides a student's originals AND the references made from their drawings. */
export async function hideInspirationByAuthor(
  authorId: string,
  actorId: string,
  client?: TypedSupabaseClient,
): Promise<void> {
  const { error } = await db(client)
    .from('nexus_inspiration_items')
    .update({ curation: 'hidden', curated_by: actorId, curated_at: new Date().toISOString() })
    .eq('author_id', authorId);
  if (error) throw error;
}

export async function createExemplar(
  input: ExemplarInput,
  actorId: string,
  client?: TypedSupabaseClient,
): Promise<string> {
  const { data, error } = await db(client)
    .from('nexus_inspiration_items')
    .insert({
      source_kind: 'exemplar',
      image_url: input.image_url,
      title_override: input.title,
      brief: input.brief,
      type_slugs: input.type_slugs,
      exam_types: input.exam_types,
      paper_years: input.paper_years,
      // A teacher chose it, so it is on the shelf from the start.
      auto_eligible: true,
      created_by: actorId,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function deleteExemplar(itemId: string, client?: TypedSupabaseClient): Promise<boolean> {
  const { data, error } = await db(client)
    .from('nexus_inspiration_items')
    .delete()
    .eq('id', itemId)
    .eq('source_kind', 'exemplar')
    .select('id');
  if (error) throw error;
  return (data || []).length > 0;
}

/** Visible items still missing a thumbnail or a shape, newest first. */
export async function listItemsNeedingImages(
  limit: number,
  client?: TypedSupabaseClient,
): Promise<{ items: ItemImageWork[]; remaining: number }> {
  const { data, error, count } = await db(client)
    .from('nexus_inspiration_items')
    .select('id, image_url, thumbnail_url, image_aspect', { count: 'exact' })
    .eq('is_visible', true)
    .or('thumbnail_url.is.null,image_aspect.is.null')
    .order('source_created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return { items: (data || []) as ItemImageWork[], remaining: count ?? 0 };
}

export async function setItemImageMeta(
  itemId: string,
  meta: { thumbnail_url?: string; image_aspect?: number },
  client?: TypedSupabaseClient,
): Promise<void> {
  const { error } = await db(client).from('nexus_inspiration_items').update(meta).eq('id', itemId);
  if (error) throw error;
}
```

- [ ] **Step 4: Add the export** to `packages/database/src/queries/nexus/index.ts`, right after `export * from './sketchbook';`:

```ts
export * from './inspiration';
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `pnpm test:run packages/database/src/queries/nexus/inspiration.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/database/src/queries/nexus/inspiration.ts packages/database/src/queries/nexus/inspiration.test.ts packages/database/src/queries/nexus/index.ts
git commit -m "feat(database): inspiration query layer

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Labels, rules, credit and the card presenter

**Files:**
- Create: `apps/nexus/src/lib/inspiration-types.ts`
- Create: `apps/nexus/src/lib/inspiration-rules.ts`, `apps/nexus/src/lib/inspiration-rules.test.ts`
- Create: `apps/nexus/src/lib/inspiration-credit.ts`, `apps/nexus/src/lib/inspiration-credit.test.ts`
- Create: `apps/nexus/src/lib/inspiration-present.ts`, `apps/nexus/src/lib/inspiration-present.test.ts`
- Create: `apps/nexus/src/lib/inspiration-test-rows.ts`

**Interfaces:**
- **Consumes:** types from Task 4 (`import type ... from '@neram/database/queries/nexus'`), and `examYearOf` from `apps/nexus/src/lib/student-stage.ts`.
- **Produces:**
  - `inspiration-types.ts`: `INSPIRATION_TYPE_LABELS: Record<string, string>`, `INSPIRATION_FAMILIES: Set<string>`, `EXAM_LABELS`, `BY_LABELS`, `typeLabel(slug): string`
  - `inspiration-rules.ts`:
    - `ORIGINAL_SCORE_THRESHOLD = 0.8`
    - `SubmissionFacts`, `scorePct(f)`, `originalEligible(f)`, `referenceEligible(f)`
    - `HiddenReason`, `hiddenReason(input)`, `HIDDEN_REASON_LABEL`
  - `inspiration-credit.ts`: `CreditInput`, `shortName(first, last, full)`, `formatInspirationCredit(input)`
  - `inspiration-present.ts`: `InspirationCard`, `InspirationCardStaff`, `displayTitle(row)`, `presentRow(row, { staff })`
  - `inspiration-test-rows.ts`: `makeRow(over?)`

- [ ] **Step 1: Write the test row factory** `apps/nexus/src/lib/inspiration-test-rows.ts`

```ts
import type { InspirationRow } from '@neram/database/queries/nexus';

/** A realistic visible row for unit tests. Override only what a test is about. */
export function makeRow(over: Partial<InspirationRow> = {}): InspirationRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    source_kind: 'submission_original',
    source_submission_id: '22222222-2222-4222-8222-222222222222',
    source_drawing_question_id: null,
    image_url: 'https://example.com/original.jpg',
    thumbnail_url: null,
    image_aspect: 0.75,
    title_override: null,
    brief: 'Make a 3D composition using a travel bag, a hat, a walking stick and a water bottle',
    category: '3d_composition',
    type_slugs: ['3d_composition'],
    tag_labels: [],
    exam_types: ['NATA'],
    paper_years: [2025],
    is_featured: false,
    is_visible: true,
    curation: 'auto',
    auto_eligible: true,
    score_pct: 0.8,
    save_count: 0,
    source_created_at: '2026-09-01T10:00:00Z',
    author_id: '33333333-3333-4333-8333-333333333333',
    author_name: 'Harshitaa Thiyagu',
    author_first_name: 'Harshitaa',
    author_last_name: 'Thiyagu',
    author_is_alumni: false,
    author_academic_year: '2025-26',
    author_opted_out: false,
    is_saved: false,
    rank: 0,
    match_kind: 'text',
    total_count: 1,
    ...over,
  };
}
```

- [ ] **Step 2: Write `apps/nexus/src/lib/inspiration-types.ts`.** No test; the other tests exercise it.

```ts
/**
 * Labels for the drawing type tree (nexus_qb_tags under "drawing"), so chips on
 * a deep-linked page render before any facet counts arrive. Facets from the
 * server carry the registry label and win when present.
 */
export const INSPIRATION_TYPE_LABELS: Record<string, string> = {
  '2d_composition': '2D Composition',
  '3d_composition': '3D Composition',
  kit_sculpture: 'Kit Sculpture',
  memory_drawing: 'Memory Drawing',
  building_exterior: 'Building Exterior',
  colour_composition: 'Colour Composition',
  free_form_sculpture: 'Free-form Sculpture',
  given_kit_assembly: 'Given Kit Assembly',
  interior_view: 'Interior View',
  logo_design: 'Logo Design',
  pattern_motif: 'Pattern and Motif',
  perspective_drawing: 'Perspective Drawing',
  portrait_figure: 'Portrait and Figure',
  poster_design: 'Poster Design',
  product_object: 'Product and Object',
  shape_composition: 'Shape Composition',
  still_life: 'Still Life',
  street_view: 'Street View',
  typography_composition: 'Typography Composition',
};

/** The four top-level families. A leaf type is the more specific, better title. */
export const INSPIRATION_FAMILIES = new Set(['2d_composition', '3d_composition', 'kit_sculpture', 'memory_drawing']);

export const EXAM_LABELS: Record<string, string> = { NATA: 'NATA', JEE_PAPER_2: 'JEE Paper 2' };

export const BY_LABELS: Record<string, string> = {
  reference: 'Reference',
  current: 'Current students',
  alumni: 'Alumni',
};

export function typeLabel(slug: string): string {
  return INSPIRATION_TYPE_LABELS[slug] ?? slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
```

- [ ] **Step 3: Write the failing tests** `apps/nexus/src/lib/inspiration-rules.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { hiddenReason, originalEligible, referenceEligible, scorePct, type SubmissionFacts } from './inspiration-rules';

/**
 * The TypeScript mirror of nexus_inspiration_sync_submission. If one of these
 * changes, the SQL in 20260920090100_nexus_inspiration_sync.sql changes with it.
 */
const reviewed = (over: Partial<SubmissionFacts> = {}): SubmissionFacts => ({
  source_type: 'question_bank',
  status: 'completed',
  reviewed_at: '2026-09-01T10:00:00Z',
  tutor_rating: 4,
  tutor_marks: null,
  max_marks: null,
  corrected_image_url: 'https://example.com/r.jpg',
  ...over,
});

describe('scorePct', () => {
  it('reads stars out of five first, then marks out of the assignment total', () => {
    expect(scorePct(reviewed({ tutor_rating: 4 }))).toBe(0.8);
    expect(scorePct(reviewed({ tutor_rating: null, tutor_marks: 8, max_marks: 10 }))).toBe(0.8);
    expect(scorePct(reviewed({ tutor_rating: null, tutor_marks: 8, max_marks: 0 }))).toBeNull();
    expect(scorePct(reviewed({ tutor_rating: null }))).toBeNull();
  });
});

describe('originalEligible', () => {
  it('lets 4 stars and above in and keeps 3 stars out', () => {
    expect(originalEligible(reviewed({ tutor_rating: 4 }))).toBe(true);
    expect(originalEligible(reviewed({ tutor_rating: 5 }))).toBe(true);
    expect(originalEligible(reviewed({ tutor_rating: 3 }))).toBe(false);
  });

  it('counts 80 percent of the marks the same as 4 stars', () => {
    expect(originalEligible(reviewed({ tutor_rating: null, tutor_marks: 8, max_marks: 10 }))).toBe(true);
    expect(originalEligible(reviewed({ tutor_rating: null, tutor_marks: 7.5, max_marks: 10 }))).toBe(false);
  });

  it('needs a finished review and never lets a test drawing in', () => {
    expect(originalEligible(reviewed({ reviewed_at: null }))).toBe(false);
    expect(originalEligible(reviewed({ status: 'redo' }))).toBe(false);
    expect(originalEligible(reviewed({ source_type: 'exam', tutor_rating: 5 }))).toBe(false);
  });
});

describe('referenceEligible', () => {
  it('lets a finished review in, including a redo, whatever the stars', () => {
    expect(referenceEligible(reviewed({ tutor_rating: 1 }))).toBe(true);
    expect(referenceEligible(reviewed({ status: 'redo' }))).toBe(true);
  });

  it('needs an image, a review, and never a test drawing', () => {
    expect(referenceEligible(reviewed({ corrected_image_url: null }))).toBe(false);
    expect(referenceEligible(reviewed({ reviewed_at: null }))).toBe(false);
    expect(referenceEligible(reviewed({ source_type: 'exam' }))).toBe(false);
  });
});

describe('hiddenReason', () => {
  const base = { kind: 'submission_original' as const, curation: 'auto' as const, visible: false, scorePct: 0.6, authorOptedOut: false };

  it('says nothing for a visible drawing', () => {
    expect(hiddenReason({ ...base, visible: true })).toBeNull();
  });

  it('names the reason a teacher can act on', () => {
    expect(hiddenReason({ ...base, curation: 'hidden' })).toBe('hidden_by_teacher');
    expect(hiddenReason({ ...base, curation: 'shown', authorOptedOut: true })).toBe('opted_out');
    expect(hiddenReason({ ...base, scorePct: null })).toBe('not_rated');
    expect(hiddenReason(base)).toBe('below_threshold');
    expect(hiddenReason({ ...base, kind: 'submission_reference', scorePct: null })).toBe('review_not_finished');
  });
});
```

`apps/nexus/src/lib/inspiration-credit.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { formatInspirationCredit, shortName, type CreditInput } from './inspiration-credit';

const input = (over: Partial<CreditInput> = {}): CreditInput => ({
  kind: 'submission_original',
  firstName: 'Harshitaa',
  lastName: 'Thiyagu',
  fullName: 'Harshitaa Thiyagu',
  isAlumni: false,
  examYear: 2026,
  optedOut: false,
  ...over,
});

describe('shortName', () => {
  it('uses the first name and the surname initial', () => {
    expect(shortName('Harshitaa', 'Thiyagu', null)).toBe('Harshitaa T.');
    expect(shortName('Harshitaa', null, null)).toBe('Harshitaa');
  });

  it('falls back to the full name', () => {
    expect(shortName(null, null, 'priya  s kumar')).toBe('priya K.');
    expect(shortName(null, null, 'Kavin')).toBe('Kavin');
    expect(shortName(null, null, '  ')).toBeNull();
  });
});

describe('formatInspirationCredit', () => {
  it('credits a current student with their batch', () => {
    expect(formatInspirationCredit(input())).toBe('Harshitaa T. · 2026 batch');
    expect(formatInspirationCredit(input({ examYear: null }))).toBe('Harshitaa T.');
  });

  it('credits an alumnus with their year', () => {
    expect(formatInspirationCredit(input({ isAlumni: true, examYear: 2025 }))).toBe('Harshitaa T. · Alumni 2025');
    expect(formatInspirationCredit(input({ isAlumni: true, examYear: null }))).toBe('Harshitaa T. · Alumni');
  });

  it('names whose drawing a reference was made from', () => {
    expect(formatInspirationCredit(input({ kind: 'submission_reference' }))).toBe("Neram reference · from Harshitaa T.'s drawing");
  });

  it('never names a student who opted out, and exemplars have no student', () => {
    expect(formatInspirationCredit(input({ kind: 'submission_reference', optedOut: true }))).toBe('Neram reference');
    expect(formatInspirationCredit(input({ kind: 'exemplar', firstName: null, lastName: null, fullName: null }))).toBe('Neram reference');
    expect(formatInspirationCredit(input({ optedOut: true }))).toBe('Neram student');
  });

  it('never uses an em dash or a double dash', () => {
    const all = [
      input(),
      input({ isAlumni: true }),
      input({ kind: 'submission_reference' }),
      input({ kind: 'exemplar' }),
      input({ optedOut: true }),
    ].map(formatInspirationCredit);
    for (const line of all) expect(line).not.toMatch(/—|--/);
  });
});
```

`apps/nexus/src/lib/inspiration-present.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { displayTitle, presentRow } from './inspiration-present';
import { makeRow } from './inspiration-test-rows';

describe('displayTitle', () => {
  it('prefers a teacher title, then the most specific type', () => {
    expect(displayTitle(makeRow({ title_override: ' Bag, hat and stick ' }))).toBe('Bag, hat and stick');
    expect(displayTitle(makeRow({ type_slugs: ['3d_composition', 'still_life'] }))).toBe('Still Life');
    expect(displayTitle(makeRow({ type_slugs: ['3d_composition'] }))).toBe('3D Composition');
    expect(displayTitle(makeRow({ type_slugs: [], category: null }))).toBe('Drawing');
  });
});

describe('presentRow', () => {
  it('gives a student the card and nothing a teacher sees', () => {
    const card = presentRow(makeRow({ score_pct: 0.6 }), { staff: false });
    expect(card.staff).toBeUndefined();
    expect(card.credit).toBe('Harshitaa T. · 2026 batch');
    expect(card.badge).toBeNull();
    expect(card.alt).toBe('Student drawing: 3D Composition');
    const json = JSON.stringify(card);
    expect(json).not.toMatch(/score|curation|author_id|authorId|tutor/i);
  });

  it('badges references and alumni work', () => {
    expect(presentRow(makeRow({ source_kind: 'submission_reference' }), { staff: false })).toMatchObject({
      badge: 'reference',
      credit: "Neram reference · from Harshitaa T.'s drawing",
      alt: 'Reference drawing: 3D Composition',
    });
    expect(presentRow(makeRow({ author_is_alumni: true }), { staff: false })).toMatchObject({
      badge: 'alumni',
      credit: 'Harshitaa T. · Alumni 2026',
    });
  });

  it('tells a teacher why a drawing is not on the shelf', () => {
    const card = presentRow(makeRow({ is_visible: false, auto_eligible: false, score_pct: 0.6 }), { staff: true });
    expect(card.staff).toMatchObject({ visible: false, curation: 'auto', hiddenReason: 'Below 4 stars' });
  });
});
```

- [ ] **Step 4: Run them and watch them fail**

Run: `pnpm test:run apps/nexus/src/lib/inspiration-rules.test.ts apps/nexus/src/lib/inspiration-credit.test.ts apps/nexus/src/lib/inspiration-present.test.ts`
Expected: FAIL, the modules cannot be resolved.

- [ ] **Step 5: Write `apps/nexus/src/lib/inspiration-rules.ts`**

```ts
import type { InspirationCuration, InspirationSourceKind } from '@neram/database/queries/nexus';

/**
 * Which drawings students may see without a teacher deciding. The database
 * applies this in nexus_inspiration_sync_submission; this copy exists so the
 * rule is unit tested and so screens can explain it. Change both together.
 */
export const ORIGINAL_SCORE_THRESHOLD = 0.8;

export interface SubmissionFacts {
  source_type: string;
  status: string;
  reviewed_at: string | null;
  tutor_rating: number | null;
  tutor_marks: number | null;
  max_marks: number | null;
  corrected_image_url: string | null;
}

export function scorePct(f: SubmissionFacts): number | null {
  if (f.tutor_rating != null) return f.tutor_rating / 5;
  if (f.tutor_marks != null && f.max_marks != null && f.max_marks > 0) return f.tutor_marks / f.max_marks;
  return null;
}

export function originalEligible(f: SubmissionFacts): boolean {
  return (
    f.source_type !== 'exam' &&
    !!f.reviewed_at &&
    (f.status === 'completed' || f.status === 'reviewed') &&
    (scorePct(f) ?? 0) >= ORIGINAL_SCORE_THRESHOLD
  );
}

export function referenceEligible(f: SubmissionFacts): boolean {
  return (
    f.source_type !== 'exam' &&
    !!f.corrected_image_url &&
    !!f.reviewed_at &&
    ['completed', 'reviewed', 'redo'].includes(f.status)
  );
}

export type HiddenReason = 'hidden_by_teacher' | 'opted_out' | 'not_rated' | 'below_threshold' | 'review_not_finished' | null;

export const HIDDEN_REASON_LABEL: Record<Exclude<HiddenReason, null>, string> = {
  hidden_by_teacher: 'Hidden by a teacher',
  opted_out: 'Student chose not to share',
  not_rated: 'Not rated yet',
  below_threshold: 'Below 4 stars',
  review_not_finished: 'Review not finished',
};

export function hiddenReason(input: {
  kind: InspirationSourceKind;
  curation: InspirationCuration;
  visible: boolean;
  scorePct: number | null;
  authorOptedOut: boolean;
}): HiddenReason {
  if (input.visible) return null;
  if (input.curation === 'hidden') return 'hidden_by_teacher';
  if (input.kind === 'submission_original' && input.authorOptedOut) return 'opted_out';
  if (input.kind === 'submission_original') return input.scorePct == null ? 'not_rated' : 'below_threshold';
  return 'review_not_finished';
}
```

- [ ] **Step 6: Write `apps/nexus/src/lib/inspiration-credit.ts`**

```ts
import type { InspirationSourceKind } from '@neram/database/queries/nexus';

export interface CreditInput {
  kind: InspirationSourceKind;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  isAlumni: boolean;
  /** The year the student sits (or sat) the exam, from their academic year. */
  examYear: number | null;
  optedOut: boolean;
}

/** "Harshitaa T.": enough to be proud of, not enough to find someone by. */
export function shortName(first: string | null, last: string | null, full: string | null): string | null {
  const f = (first ?? '').trim();
  const l = (last ?? '').trim();
  if (f) return l ? `${f} ${l[0].toUpperCase()}.` : f;
  const parts = (full ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0];
}

export function formatInspirationCredit(c: CreditInput): string {
  const name = c.optedOut ? null : shortName(c.firstName, c.lastName, c.fullName);
  if (c.kind !== 'submission_original') {
    return c.kind === 'submission_reference' && name ? `Neram reference · from ${name}'s drawing` : 'Neram reference';
  }
  if (!name) return 'Neram student';
  if (c.isAlumni) return c.examYear ? `${name} · Alumni ${c.examYear}` : `${name} · Alumni`;
  return c.examYear ? `${name} · ${c.examYear} batch` : name;
}
```

- [ ] **Step 7: Write `apps/nexus/src/lib/inspiration-present.ts`**

```ts
import type { InspirationCuration, InspirationRow, InspirationSourceKind } from '@neram/database/queries/nexus';
import { examYearOf } from '@/lib/student-stage';
import { formatInspirationCredit } from '@/lib/inspiration-credit';
import { HIDDEN_REASON_LABEL, hiddenReason } from '@/lib/inspiration-rules';
import { INSPIRATION_FAMILIES, typeLabel } from '@/lib/inspiration-types';

/** Teacher-only fields. presentRow adds this block for staff and never for students. */
export interface InspirationCardStaff {
  submissionId: string | null;
  curation: InspirationCuration;
  visible: boolean;
  hiddenReason: string | null;
  titleOverride: string | null;
  authorId: string | null;
}

/** The one shape every Inspiration screen renders. */
export interface InspirationCard {
  id: string;
  kind: InspirationSourceKind;
  imageUrl: string;
  thumbnailUrl: string | null;
  aspect: number | null;
  title: string;
  alt: string;
  brief: string | null;
  credit: string;
  badge: 'reference' | 'alumni' | null;
  typeSlugs: string[];
  tagLabels: string[];
  examTypes: string[];
  years: number[];
  featured: boolean;
  saved: boolean;
  saveCount: number;
  createdAt: string;
  staff?: InspirationCardStaff;
}

export function displayTitle(row: Pick<InspirationRow, 'title_override' | 'type_slugs' | 'category'>): string {
  const override = row.title_override?.trim();
  if (override) return override;
  const slugs = row.type_slugs ?? [];
  const leaf = slugs.find((s) => !INSPIRATION_FAMILIES.has(s));
  if (leaf) return typeLabel(leaf);
  const family = slugs.find((s) => INSPIRATION_FAMILIES.has(s)) ?? row.category;
  return family ? typeLabel(family) : 'Drawing';
}

export function presentRow(row: InspirationRow, opts: { staff: boolean }): InspirationCard {
  const title = displayTitle(row);
  const isOriginal = row.source_kind === 'submission_original';
  const badge: InspirationCard['badge'] = isOriginal ? (row.author_is_alumni ? 'alumni' : null) : 'reference';

  const card: InspirationCard = {
    id: row.id,
    kind: row.source_kind,
    imageUrl: row.image_url,
    thumbnailUrl: row.thumbnail_url,
    aspect: row.image_aspect == null ? null : Number(row.image_aspect),
    title,
    alt: `${isOriginal ? 'Student drawing' : 'Reference drawing'}: ${title}`,
    brief: row.brief,
    credit: formatInspirationCredit({
      kind: row.source_kind,
      firstName: row.author_first_name,
      lastName: row.author_last_name,
      fullName: row.author_name,
      isAlumni: row.author_is_alumni,
      examYear: examYearOf(row.author_academic_year),
      optedOut: row.author_opted_out,
    }),
    badge,
    typeSlugs: row.type_slugs ?? [],
    tagLabels: row.tag_labels ?? [],
    examTypes: row.exam_types ?? [],
    years: (row.paper_years ?? []).map(Number),
    featured: row.is_featured,
    saved: row.is_saved,
    saveCount: Number(row.save_count ?? 0),
    createdAt: row.source_created_at,
  };

  if (opts.staff) {
    const reason = hiddenReason({
      kind: row.source_kind,
      curation: row.curation,
      visible: row.is_visible,
      scorePct: row.score_pct,
      authorOptedOut: row.author_opted_out,
    });
    card.staff = {
      submissionId: row.source_submission_id,
      curation: row.curation,
      visible: row.is_visible,
      hiddenReason: reason ? HIDDEN_REASON_LABEL[reason] : null,
      titleOverride: row.title_override,
      authorId: row.author_id,
    };
  }
  return card;
}
```

- [ ] **Step 8: Run the tests and watch them pass**

Run: `pnpm test:run apps/nexus/src/lib/inspiration-rules.test.ts apps/nexus/src/lib/inspiration-credit.test.ts apps/nexus/src/lib/inspiration-present.test.ts`
Expected: PASS.

If the present test's forbidden-word check trips on the brief text, the fixture brief contains one of the words. Change the fixture brief; never loosen the regex.

- [ ] **Step 9: Commit**

```bash
git add apps/nexus/src/lib/inspiration-types.ts apps/nexus/src/lib/inspiration-rules.ts apps/nexus/src/lib/inspiration-rules.test.ts apps/nexus/src/lib/inspiration-credit.ts apps/nexus/src/lib/inspiration-credit.test.ts apps/nexus/src/lib/inspiration-present.ts apps/nexus/src/lib/inspiration-present.test.ts apps/nexus/src/lib/inspiration-test-rows.ts
git commit -m "feat(nexus): inspiration rules, credit lines and card presenter

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: URL state, edit validation, recent searches, masonry layout

**Files:**
- Create: `apps/nexus/src/lib/inspiration-query.ts`, `apps/nexus/src/lib/inspiration-query.test.ts`
- Create: `apps/nexus/src/lib/inspiration-patch.ts`, `apps/nexus/src/lib/inspiration-patch.test.ts`
- Create: `apps/nexus/src/lib/inspiration-recent.ts`, `apps/nexus/src/lib/inspiration-recent.test.ts`
- Create: `apps/nexus/src/lib/masonry-layout.ts`, `apps/nexus/src/lib/masonry-layout.test.ts`

**Interfaces:**
- **Consumes:** Task 4 types and Task 5 `INSPIRATION_TYPE_LABELS`.
- **Produces:**
  - `inspiration-query.ts`:
    - `InspirationQueryState`, `EMPTY_QUERY`, `SORT_LABELS`
    - `parseInspirationQuery(search: string)`, `toQueryPatch(state)`, `toApiQuery(state, opts)`
    - `parseScope(v)`, `toFilters(state, opts)`, `hasActiveFilters(state)`
    - `ChipFacet`, `chipsFor(facets, selected, max?)`, `pickBackHref(stored, base)`
  - `inspiration-patch.ts`: `parseItemPatch(body, kind)` returns `{ patch, hideAllByAuthor }`; `parseExemplarInput(body)` returns `ExemplarInput`. Both throw `ApiError(400)`.
  - `inspiration-recent.ts`: `KeyValueStore`, `readRecent(store)`, `addRecent(store, q)`, `safeLocalStorage()`
  - `masonry-layout.ts`: `columnsForWidth(width)`, `layoutMasonry(items, columns, aspectOf)`

- [ ] **Step 1: Write the failing tests**

`apps/nexus/src/lib/inspiration-query.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import {
  EMPTY_QUERY,
  chipsFor,
  hasActiveFilters,
  parseInspirationQuery,
  parseScope,
  pickBackHref,
  toApiQuery,
  toFilters,
  toQueryPatch,
} from './inspiration-query';

describe('parseInspirationQuery', () => {
  it('reads a full query string', () => {
    expect(parseInspirationQuery('?q=bag%20hat&type=still_life,street_view&exam=NATA&by=alumni&year=2024&sort=newest')).toEqual({
      q: 'bag hat',
      types: ['still_life', 'street_view'],
      exam: 'NATA',
      by: 'alumni',
      year: 2024,
      sort: 'newest',
    });
  });

  it('drops anything it does not recognise', () => {
    expect(parseInspirationQuery('?type=../etc,DROP TABLE&exam=GATE&by=everyone&year=99999&sort=random')).toEqual(EMPTY_QUERY);
  });

  it('caps the query length and the number of types', () => {
    const long = 'a'.repeat(300);
    const state = parseInspirationQuery(`?q=${long}&type=a1,b2,c3,d4,e5,f6,g7`);
    expect(state.q).toHaveLength(100);
    expect(state.types).toHaveLength(6);
  });
});

describe('toQueryPatch and toApiQuery', () => {
  it('round-trips through the URL and leaves defaults out', () => {
    const state = { ...EMPTY_QUERY, q: 'bag', types: ['still_life'], year: 2025 };
    const patch = toQueryPatch(state);
    expect(patch).toEqual({ q: 'bag', type: 'still_life', exam: null, by: null, year: '2025', sort: null });
    const qs = toApiQuery(state, { offset: 0 });
    expect(qs).toBe('q=bag&type=still_life&year=2025');
    expect(parseInspirationQuery(`?${qs}`)).toEqual(state);
  });

  it('adds paging, scope and saved only when they differ from the default', () => {
    expect(toApiQuery(EMPTY_QUERY, { offset: 30, scope: 'hidden', savedOnly: true })).toBe('offset=30&scope=hidden&saved=1');
    expect(toApiQuery(EMPTY_QUERY, { offset: 0, scope: 'visible' })).toBe('');
  });
});

describe('parseScope, toFilters, hasActiveFilters', () => {
  it('only accepts known scopes', () => {
    expect(parseScope('hidden')).toBe('hidden');
    expect(parseScope('all')).toBe('all');
    expect(parseScope('everything')).toBe('visible');
    expect(parseScope(null)).toBe('visible');
  });

  it('builds query filters', () => {
    expect(toFilters({ ...EMPTY_QUERY, q: 'bag', exam: 'NATA' }, { offset: 30, limit: 30, scope: 'visible', savedOnly: false })).toEqual({
      query: 'bag', types: [], exam: 'NATA', by: undefined, year: undefined, sort: 'relevant', scope: 'visible', savedOnly: false, limit: 30, offset: 30,
    });
  });

  it('knows when a filter is on', () => {
    expect(hasActiveFilters(EMPTY_QUERY)).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_QUERY, sort: 'newest' })).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_QUERY, year: 2024 })).toBe(true);
  });
});

describe('chipsFor', () => {
  const facets = [
    { value: 'still_life', label: 'Still Life', item_count: 3 },
    { value: 'street_view', label: 'Street View', item_count: 9 },
    { value: 'logo_design', label: 'Logo Design', item_count: 1 },
  ];

  it('puts selected chips first, even at zero, then the biggest', () => {
    expect(chipsFor(facets, ['poster_design'], 3).map((c) => [c.value, c.item_count])).toEqual([
      ['poster_design', 0],
      ['street_view', 9],
      ['still_life', 3],
    ]);
  });

  it('never cuts a selected chip to stay under the limit', () => {
    expect(chipsFor(facets, ['logo_design', 'still_life'], 1).map((c) => c.value)).toEqual(['logo_design', 'still_life']);
  });
});

describe('pickBackHref', () => {
  it('returns the stored results page for the same surface', () => {
    expect(pickBackHref('/student/inspiration?q=bag&type=still_life', '/student/inspiration')).toBe('/student/inspiration?q=bag&type=still_life');
    expect(pickBackHref('/student/inspiration/saved', '/student/inspiration')).toBe('/student/inspiration/saved');
  });

  it('refuses item pages, the other surface and anything else', () => {
    const base = '/student/inspiration';
    expect(pickBackHref('/student/inspiration/11111111-1111-4111-8111-111111111111', base)).toBe(base);
    expect(pickBackHref('/teacher/inspiration?q=bag', base)).toBe(base);
    expect(pickBackHref('https://evil.example/student/inspiration', base)).toBe(base);
    expect(pickBackHref(null, base)).toBe(base);
  });
});
```

`apps/nexus/src/lib/inspiration-patch.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { parseExemplarInput, parseItemPatch } from './inspiration-patch';

/** The HTTP status an ApiError carries, or undefined when nothing was thrown. */
function statusOf(fn: () => unknown): number | undefined {
  try {
    fn();
  } catch (err) {
    return (err as { status?: number }).status;
  }
  return undefined;
}

describe('parseItemPatch', () => {
  it('accepts curation, feature and text edits and trims empties to null', () => {
    expect(parseItemPatch({ curation: 'hidden', is_featured: true, title_override: '  ', brief_override: ' A bag ' }, 'submission_original')).toEqual({
      patch: { curation: 'hidden', is_featured: true, title_override: null, brief_override: 'A bag' },
      hideAllByAuthor: false,
    });
  });

  it('rejects bad values with a 400', () => {
    expect(statusOf(() => parseItemPatch({ curation: 'published' }, 'exemplar'))).toBe(400);
    expect(statusOf(() => parseItemPatch({ is_featured: 'yes' }, 'exemplar'))).toBe(400);
    expect(statusOf(() => parseItemPatch({ title_override: 'x'.repeat(121) }, 'exemplar'))).toBe(400);
    expect(statusOf(() => parseItemPatch({}, 'exemplar'))).toBe(400);
  });

  it('lets only exemplars carry their own types, exams and years', () => {
    expect(statusOf(() => parseItemPatch({ type_slugs: ['still_life'] }, 'submission_original'))).toBe(400);
    expect(parseItemPatch({ type_slugs: ['still_life'], exam_types: ['NATA'], paper_years: [2024] }, 'exemplar').patch).toEqual({
      type_slugs: ['still_life'], exam_types: ['NATA'], paper_years: [2024],
    });
    expect(statusOf(() => parseItemPatch({ type_slugs: ['not_a_type'] }, 'exemplar'))).toBe(400);
    expect(statusOf(() => parseItemPatch({ paper_years: [1990] }, 'exemplar'))).toBe(400);
  });

  it('allows hide-all on its own', () => {
    expect(parseItemPatch({ hide_all_by_author: true }, 'submission_original')).toEqual({ patch: {}, hideAllByAuthor: true });
  });
});

describe('parseExemplarInput', () => {
  const ok = { image_url: 'https://example.com/a.jpg', title: 'Bag and hat', brief: '', type_slugs: ['3d_composition'], exam_types: ['NATA'], paper_years: [2025] };

  it('accepts a complete exemplar', () => {
    expect(parseExemplarInput(ok)).toEqual({ image_url: 'https://example.com/a.jpg', title: 'Bag and hat', brief: null, type_slugs: ['3d_composition'], exam_types: ['NATA'], paper_years: [2025] });
  });

  it('needs an https image, a type, and a title or a brief', () => {
    expect(statusOf(() => parseExemplarInput({ ...ok, image_url: 'http://example.com/a.jpg' }))).toBe(400);
    expect(statusOf(() => parseExemplarInput({ ...ok, type_slugs: [] }))).toBe(400);
    expect(statusOf(() => parseExemplarInput({ ...ok, title: '', brief: '' }))).toBe(400);
  });
});
```

`apps/nexus/src/lib/inspiration-recent.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { addRecent, readRecent, type KeyValueStore } from './inspiration-recent';

function memory(initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
}

describe('recent searches', () => {
  it('survives junk and a missing store', () => {
    expect(readRecent(memory({ 'inspiration:recent': '{not json' }))).toEqual([]);
    expect(readRecent(memory({ 'inspiration:recent': '[1, "bag"]' }))).toEqual(['bag']);
    expect(readRecent(null)).toEqual([]);
    expect(addRecent(null, 'bag')).toEqual(['bag']);
  });

  it('keeps the newest five, without case duplicates', () => {
    const store = memory();
    for (const q of ['one', 'two', 'three', 'four', 'five', 'six', 'TWO']) addRecent(store, q);
    expect(readRecent(store)).toEqual(['TWO', 'six', 'five', 'four', 'three']);
  });

  it('ignores blank searches', () => {
    const store = memory();
    expect(addRecent(store, '   ')).toEqual([]);
  });
});
```

`apps/nexus/src/lib/masonry-layout.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { columnsForWidth, layoutMasonry } from './masonry-layout';

describe('columnsForWidth', () => {
  it('gives phones two columns and wide screens five', () => {
    expect(columnsForWidth(343)).toBe(2);
    expect(columnsForWidth(600)).toBe(3);
    expect(columnsForWidth(900)).toBe(4);
    expect(columnsForWidth(1300)).toBe(5);
  });
});

describe('layoutMasonry', () => {
  const aspect = (x: { a: number | null }) => x.a;

  it('drops each item into the shortest column', () => {
    const items = [{ a: 1 }, { a: 0.5 }, { a: 1 }, { a: 1 }];
    const cols = layoutMasonry(items, 2, aspect);
    expect(cols.map((c) => c.map((x) => items.indexOf(x)))).toEqual([[0, 2], [1, 3]]);
  });

  it('keeps earlier placements when a page is appended', () => {
    const first = Array.from({ length: 10 }, (_, i) => ({ a: [0.7, 1, 1.4][i % 3] }));
    const more = [...first, { a: 0.6 }, { a: 1.2 }];
    const before = layoutMasonry(first, 3, aspect);
    const after = layoutMasonry(more, 3, aspect);
    before.forEach((col, i) => expect(after[i].slice(0, col.length)).toEqual(col));
  });

  it('treats a missing shape as a 3 by 4 portrait and never returns zero columns', () => {
    expect(layoutMasonry([{ a: null }], 0, aspect)).toEqual([[{ a: null }]]);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm test:run apps/nexus/src/lib/inspiration-query.test.ts apps/nexus/src/lib/inspiration-patch.test.ts apps/nexus/src/lib/inspiration-recent.test.ts apps/nexus/src/lib/masonry-layout.test.ts`
Expected: FAIL, the modules cannot be resolved.

- [ ] **Step 3: Write `apps/nexus/src/lib/inspiration-query.ts`**

```ts
import type {
  InspirationBy,
  InspirationExam,
  InspirationFilters,
  InspirationScope,
  InspirationSort,
} from '@neram/database/queries/nexus';

/**
 * The Inspiration search state lives in the URL, so a search can be shared,
 * reloaded and returned to with Back. The API route parses its own query string
 * with the same function, so the page and the server can never disagree.
 */
export interface InspirationQueryState {
  q: string;
  types: string[];
  exam: InspirationExam | null;
  by: InspirationBy | null;
  year: number | null;
  sort: InspirationSort;
}

export const EMPTY_QUERY: InspirationQueryState = { q: '', types: [], exam: null, by: null, year: null, sort: 'relevant' };

export const SORT_LABELS: Record<InspirationSort, string> = { relevant: 'Best match', newest: 'Newest', saved: 'Most saved' };

const EXAMS: readonly string[] = ['NATA', 'JEE_PAPER_2'];
const BYS: readonly string[] = ['reference', 'current', 'alumni'];
const SORTS: readonly string[] = ['relevant', 'newest', 'saved'];
const SLUG = /^[a-z0-9_]{2,40}$/;
const MAX_QUERY = 100;
const MAX_TYPES = 6;

export function parseInspirationQuery(search: string): InspirationQueryState {
  const p = new URLSearchParams(search);
  const q = (p.get('q') ?? '').trim().slice(0, MAX_QUERY);
  const types = [...new Set((p.get('type') ?? '').split(',').map((t) => t.trim()).filter((t) => SLUG.test(t)))].slice(0, MAX_TYPES);
  const examRaw = p.get('exam') ?? '';
  const byRaw = p.get('by') ?? '';
  const yearRaw = p.get('year') ?? '';
  const sortRaw = p.get('sort') ?? '';
  const yearNum = Number(yearRaw);
  return {
    q,
    types,
    exam: EXAMS.includes(examRaw) ? (examRaw as InspirationExam) : null,
    by: BYS.includes(byRaw) ? (byRaw as InspirationBy) : null,
    year: /^\d{4}$/.test(yearRaw) && yearNum >= 2000 && yearNum <= 2100 ? yearNum : null,
    sort: SORTS.includes(sortRaw) ? (sortRaw as InspirationSort) : 'relevant',
  };
}

/** For patchQuery: null removes a key, so defaults never clutter the URL. */
export function toQueryPatch(s: InspirationQueryState): Record<string, string | null> {
  return {
    q: s.q || null,
    type: s.types.length ? s.types.join(',') : null,
    exam: s.exam,
    by: s.by,
    year: s.year ? String(s.year) : null,
    sort: s.sort === 'relevant' ? null : s.sort,
  };
}

export function toApiQuery(
  s: InspirationQueryState,
  opts: { offset: number; scope?: InspirationScope; savedOnly?: boolean },
): string {
  const p = new URLSearchParams();
  for (const [key, value] of Object.entries(toQueryPatch(s))) {
    if (value !== null) p.set(key, value);
  }
  if (opts.offset > 0) p.set('offset', String(opts.offset));
  if (opts.scope && opts.scope !== 'visible') p.set('scope', opts.scope);
  if (opts.savedOnly) p.set('saved', '1');
  return p.toString();
}

export function parseScope(v: string | null): InspirationScope {
  return v === 'hidden' || v === 'all' ? v : 'visible';
}

export function toFilters(
  s: InspirationQueryState,
  opts: { offset: number; limit: number; scope: InspirationScope; savedOnly: boolean },
): InspirationFilters {
  return {
    query: s.q || undefined,
    types: s.types,
    exam: s.exam ?? undefined,
    by: s.by ?? undefined,
    year: s.year ?? undefined,
    sort: s.sort,
    scope: opts.scope,
    savedOnly: opts.savedOnly,
    limit: opts.limit,
    offset: opts.offset,
  };
}

export function hasActiveFilters(s: InspirationQueryState): boolean {
  return Boolean(s.q || s.types.length || s.exam || s.by || s.year);
}

export interface ChipFacet {
  value: string;
  label: string | null;
  item_count: number;
}

/**
 * Chips to render: selected values first (kept even at zero, so a student can
 * always untick what they ticked), then the biggest, up to `max`.
 */
export function chipsFor(facets: ChipFacet[], selected: string[], max = Number.POSITIVE_INFINITY): ChipFacet[] {
  const byValue = new Map(facets.map((f) => [f.value, f]));
  const chosen = selected.map((v) => byValue.get(v) ?? { value: v, label: null, item_count: 0 });
  const rest = facets
    .filter((f) => !selected.includes(f.value))
    .sort((a, b) => b.item_count - a.item_count || (a.label ?? a.value).localeCompare(b.label ?? b.value));
  return [...chosen, ...rest].slice(0, Math.max(max, chosen.length));
}

const LIST_URL = /^\/(student|teacher)\/inspiration(\/saved)?\/?(\?.*)?$/;

/** Back from an item returns to the results it was opened from, and only those. */
export function pickBackHref(stored: string | null, base: string): string {
  if (stored && stored.startsWith(base) && LIST_URL.test(stored)) return stored;
  return base;
}
```

- [ ] **Step 4: Write `apps/nexus/src/lib/inspiration-patch.ts`**

```ts
import type { ExemplarInput, InspirationItemPatch, InspirationSourceKind } from '@neram/database/queries/nexus';
import { ApiError } from '@/lib/api-errors';
import { INSPIRATION_TYPE_LABELS } from '@/lib/inspiration-types';

const CURATIONS = new Set(['auto', 'shown', 'hidden']);
const EXAMS = new Set(['NATA', 'JEE_PAPER_2']);
const TITLE_MAX = 120;
const BRIEF_MAX = 600;

function asObject(body: unknown): Record<string, unknown> {
  return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

function optionalText(value: unknown, max: number, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') throw new ApiError(`${field} must be text.`, 400);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new ApiError(`${field} can be ${max} characters at most.`, 400);
  return trimmed || null;
}

function typeSlugs(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string' || !(v in INSPIRATION_TYPE_LABELS))) {
    throw new ApiError('Pick drawing types from the list.', 400);
  }
  const unique = [...new Set(value as string[])];
  if (unique.length > 6) throw new ApiError('Pick up to 6 drawing types.', 400);
  return unique;
}

function examTypes(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string' || !EXAMS.has(v))) {
    throw new ApiError('Exam must be NATA or JEE Paper 2.', 400);
  }
  return [...new Set(value as string[])];
}

function paperYears(value: unknown): number[] {
  if (!Array.isArray(value) || value.some((v) => !Number.isInteger(v) || (v as number) < 2000 || (v as number) > 2100)) {
    throw new ApiError('Years must be between 2000 and 2100.', 400);
  }
  const unique = [...new Set(value as number[])];
  if (unique.length > 5) throw new ApiError('Add up to 5 years.', 400);
  return unique;
}

export function parseItemPatch(
  body: unknown,
  kind: InspirationSourceKind,
): { patch: InspirationItemPatch; hideAllByAuthor: boolean } {
  const b = asObject(body);
  const patch: InspirationItemPatch = {};

  if (b.curation !== undefined) {
    if (typeof b.curation !== 'string' || !CURATIONS.has(b.curation)) {
      throw new ApiError('curation must be auto, shown or hidden.', 400);
    }
    patch.curation = b.curation as InspirationItemPatch['curation'];
  }
  if (b.is_featured !== undefined) {
    if (typeof b.is_featured !== 'boolean') throw new ApiError('is_featured must be true or false.', 400);
    patch.is_featured = b.is_featured;
  }
  const title = optionalText(b.title_override, TITLE_MAX, 'Title');
  if (title !== undefined) patch.title_override = title;
  const brief = optionalText(b.brief_override, BRIEF_MAX, 'Brief');
  if (brief !== undefined) patch.brief_override = brief;

  const ownTags = b.type_slugs !== undefined || b.exam_types !== undefined || b.paper_years !== undefined;
  if (ownTags && kind !== 'exemplar') {
    throw new ApiError("A student drawing's types, exam and year come from its review. Change them there.", 400);
  }
  if (b.type_slugs !== undefined) patch.type_slugs = typeSlugs(b.type_slugs);
  if (b.exam_types !== undefined) patch.exam_types = examTypes(b.exam_types);
  if (b.paper_years !== undefined) patch.paper_years = paperYears(b.paper_years);

  const hideAllByAuthor = b.hide_all_by_author === true;
  if (!hideAllByAuthor && Object.keys(patch).length === 0) throw new ApiError('Nothing to change.', 400);
  return { patch, hideAllByAuthor };
}

export function parseExemplarInput(body: unknown): ExemplarInput {
  const b = asObject(body);
  const imageUrl = typeof b.image_url === 'string' ? b.image_url.trim() : '';
  if (!/^https:\/\/\S+$/.test(imageUrl) || imageUrl.length > 1000) {
    throw new ApiError('Upload the drawing first.', 400);
  }
  const title = optionalText(b.title, TITLE_MAX, 'Title') ?? null;
  const brief = optionalText(b.brief, BRIEF_MAX, 'Brief') ?? null;
  if (!title && !brief) throw new ApiError('Add a title or a brief so students can find it.', 400);
  const types = typeSlugs(b.type_slugs ?? []);
  if (types.length === 0) throw new ApiError('Pick at least one drawing type.', 400);
  return {
    image_url: imageUrl,
    title,
    brief,
    type_slugs: types,
    exam_types: examTypes(b.exam_types ?? []),
    paper_years: paperYears(b.paper_years ?? []),
  };
}
```

- [ ] **Step 5: Write `apps/nexus/src/lib/inspiration-recent.ts`**

```ts
/** Recent Inspiration searches, per device. A nicety: every failure returns []. */
const KEY = 'inspiration:recent';
const MAX = 5;

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readRecent(store: KeyValueStore | null): string[] {
  if (!store) return [];
  try {
    const parsed: unknown = JSON.parse(store.getItem(KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string').slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function addRecent(store: KeyValueStore | null, query: string): string[] {
  const clean = query.trim().slice(0, 100);
  if (!clean) return readRecent(store);
  const next = [clean, ...readRecent(store).filter((r) => r.toLowerCase() !== clean.toLowerCase())].slice(0, MAX);
  try {
    store?.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode or a full quota: the list simply is not remembered.
  }
  return next;
}

export function safeLocalStorage(): KeyValueStore | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}
```

- [ ] **Step 6: Write `apps/nexus/src/lib/masonry-layout.ts`**

```ts
/**
 * Pinterest-style placement without a layout library.
 *
 * Columns follow the grid's own width (measured with ResizeObserver), never the
 * window: inside the Nexus sidebar a window breakpoint over-counts columns and
 * overflows. Placement is greedy and in order, so appending a page never moves
 * a tile that is already on screen.
 */
const DEFAULT_ASPECT = 0.75;
/** The one-line caption under every tile, as a fraction of tile width. */
const CAPTION = 0.15;

export function columnsForWidth(width: number): number {
  if (width < 560) return 2;
  if (width < 840) return 3;
  if (width < 1120) return 4;
  return 5;
}

export function layoutMasonry<T>(items: T[], columns: number, aspectOf: (item: T) => number | null): T[][] {
  const count = Math.max(1, Math.floor(columns));
  const cols: T[][] = Array.from({ length: count }, () => []);
  const heights = new Array<number>(count).fill(0);
  for (const item of items) {
    const aspect = aspectOf(item);
    const height = 1 / (aspect && aspect > 0 ? aspect : DEFAULT_ASPECT) + CAPTION;
    let target = 0;
    for (let i = 1; i < count; i++) {
      if (heights[i] < heights[target] - 1e-9) target = i;
    }
    cols[target].push(item);
    heights[target] += height;
  }
  return cols;
}
```

- [ ] **Step 7: Run the tests and watch them pass**

Run: `pnpm test:run apps/nexus/src/lib/inspiration-query.test.ts apps/nexus/src/lib/inspiration-patch.test.ts apps/nexus/src/lib/inspiration-recent.test.ts apps/nexus/src/lib/masonry-layout.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/nexus/src/lib/inspiration-query.ts apps/nexus/src/lib/inspiration-query.test.ts apps/nexus/src/lib/inspiration-patch.ts apps/nexus/src/lib/inspiration-patch.test.ts apps/nexus/src/lib/inspiration-recent.ts apps/nexus/src/lib/inspiration-recent.test.ts apps/nexus/src/lib/masonry-layout.ts apps/nexus/src/lib/masonry-layout.test.ts
git commit -m "feat(nexus): inspiration URL state, edit validation and masonry layout

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Feature flags and the access helper

**Files:**
- Modify: `apps/nexus/src/lib/feature-flags.ts`
  - Student entry goes after the `student.sketchbook-featured-shelf` entry (line ~94).
  - Staff entry goes after the `staff.sketchbook` entry (line ~143).
- Modify: `apps/nexus/src/lib/feature-flags.test.ts` (append a describe block).
- Create: `apps/nexus/src/lib/inspiration-access.ts`, `apps/nexus/src/lib/inspiration-access.test.ts`

**Interfaces:**
- **Consumes:**
  - `getRequestUser`, `isStaff`, `RequestUser` from `@/lib/study-materials`
  - `ApiError` from `@/lib/api-errors`
  - `FEATURE_FLAGS_KEY`, `resolveFlags`, `isFeatureEnabled`, `allFeaturesEnabled`, `FlagMap` from `@/lib/feature-flags`
- **Produces:**
  - `InspirationCaller = { user: RequestUser; staff: boolean }`
  - `resolveInspirationCaller(authHeader: string | null): Promise<InspirationCaller>`: 404 when the caller's flag is off.
  - `assertInspirationStaff(caller)`: 403 for students.
  - `parseItemId(raw: string): string`: 404 unless it is a UUID.

- [ ] **Step 1: Write the failing tests.** Append to `apps/nexus/src/lib/feature-flags.test.ts`:

```ts
describe('inspiration flags', () => {
  it('ships the student library dark and keeps the teacher page on', () => {
    expect(resolveFlags({})['student.inspiration']).toBe(false);
    expect(resolveFlags({})['staff.inspiration']).toBe(true);
  });

  it('owns the Inspiration routes, including item pages', () => {
    expect(featureForPath('/student/inspiration')?.id).toBe('student.inspiration');
    expect(featureForPath('/student/inspiration/11111111-1111-4111-8111-111111111111')?.id).toBe('student.inspiration');
    expect(featureForPath('/teacher/inspiration/saved')?.id).toBe('staff.inspiration');
  });
});
```

Create `apps/nexus/src/lib/inspiration-access.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getRequestUser: vi.fn(),
  flags: null as Record<string, boolean> | null,
}));

vi.mock('@/lib/study-materials', () => ({
  getRequestUser: (h: string | null) => mocks.getRequestUser(h),
  isStaff: (u: { user_type: string }) => u.user_type === 'teacher' || u.user_type === 'admin',
}));

vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: mocks.flags ? { value: mocks.flags } : null, error: null }),
        }),
      }),
    }),
  }),
}));

import { assertInspirationStaff, parseItemId, resolveInspirationCaller } from './inspiration-access';

const student = { id: 's1', user_type: 'student' };
const teacher = { id: 't1', user_type: 'teacher' };

describe('resolveInspirationCaller', () => {
  beforeEach(() => {
    mocks.getRequestUser.mockReset();
    mocks.flags = null;
  });

  it('keeps students out while student.inspiration is off, which is the default', async () => {
    mocks.getRequestUser.mockResolvedValue(student);
    await expect(resolveInspirationCaller('Bearer real')).rejects.toMatchObject({ status: 404 });
  });

  it('lets students in once the flag is on', async () => {
    mocks.getRequestUser.mockResolvedValue(student);
    mocks.flags = { 'student.inspiration': true };
    await expect(resolveInspirationCaller('Bearer real')).resolves.toMatchObject({ staff: false, user: student });
  });

  it('lets staff in by default and keeps them out when switched off', async () => {
    mocks.getRequestUser.mockResolvedValue(teacher);
    await expect(resolveInspirationCaller('Bearer real')).resolves.toMatchObject({ staff: true });
    mocks.flags = { 'staff.inspiration': false };
    await expect(resolveInspirationCaller('Bearer real')).rejects.toMatchObject({ status: 404 });
  });

  it('treats a local test token as every feature on, like the E2E client does', async () => {
    mocks.getRequestUser.mockResolvedValue(student);
    await expect(resolveInspirationCaller('Bearer test_abc')).resolves.toMatchObject({ staff: false });
  });
});

describe('assertInspirationStaff and parseItemId', () => {
  it('refuses students', () => {
    expect(() => assertInspirationStaff({ user: student as never, staff: false })).toThrow('Only teachers can change Inspiration.');
    expect(() => assertInspirationStaff({ user: teacher as never, staff: true })).not.toThrow();
  });

  it('accepts only a UUID', () => {
    expect(parseItemId('11111111-1111-4111-8111-111111111111')).toBe('11111111-1111-4111-8111-111111111111');
    expect(() => parseItemId('../../etc')).toThrow('Drawing not found');
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm test:run apps/nexus/src/lib/feature-flags.test.ts apps/nexus/src/lib/inspiration-access.test.ts`
Expected: FAIL. The flags are undefined and `./inspiration-access` cannot be resolved.

- [ ] **Step 3: Register the flags** in `apps/nexus/src/lib/feature-flags.ts`.

After the `student.sketchbook-featured-shelf` line:

```ts
  // Peer-visible drawing library: teacher references, and student work rated 4
  // stars and above, credited by name unless the student opted out. Enforced
  // server side in /api/inspiration/*, which answers 404 while this is off.
  { id: 'student.inspiration', label: 'Inspiration', surface: 'student', group: 'Practice', paths: ['/student/inspiration'], defaultEnabled: false },
```

After the `staff.sketchbook` line:

```ts
  { id: 'staff.inspiration', label: 'Inspiration', surface: 'staff', group: 'Teaching', paths: ['/teacher/inspiration'], defaultEnabled: true },
```

- [ ] **Step 4: Write `apps/nexus/src/lib/inspiration-access.ts`**

```ts
import { getSupabaseAdminClient } from '@neram/database';
import { ApiError } from '@/lib/api-errors';
import {
  FEATURE_FLAGS_KEY,
  allFeaturesEnabled,
  isFeatureEnabled,
  resolveFlags,
  type FlagMap,
} from '@/lib/feature-flags';
import { getRequestUser, isStaff, type RequestUser } from '@/lib/study-materials';

/**
 * Who is asking, and may they use Inspiration at all.
 *
 * The flag is checked here, server side, because Inspiration is peer-visible:
 * with the switch off, no drawing or name leaves the server, rather than a
 * hidden menu item over a route that still answers.
 */
export interface InspirationCaller {
  user: RequestUser;
  staff: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadFlags(authHeader: string | null): Promise<FlagMap> {
  // Test tokens are only honoured outside production (see ms-verify), and the
  // E2E client already runs with every feature on. Match it here.
  if (process.env.NODE_ENV !== 'production' && /^Bearer test_/.test(authHeader ?? '')) {
    return allFeaturesEnabled();
  }
  const { data } = await (getSupabaseAdminClient() as any)
    .from('nexus_settings')
    .select('value')
    .eq('key', FEATURE_FLAGS_KEY)
    .maybeSingle();
  return resolveFlags((data?.value as FlagMap) || {});
}

export async function resolveInspirationCaller(authHeader: string | null): Promise<InspirationCaller> {
  const user = await getRequestUser(authHeader);
  const staff = isStaff(user);
  const flags = await loadFlags(authHeader);
  if (!isFeatureEnabled(staff ? 'staff.inspiration' : 'student.inspiration', flags)) {
    throw new ApiError('Inspiration is not available yet.', 404);
  }
  return { user, staff };
}

export function assertInspirationStaff(caller: InspirationCaller): void {
  if (!caller.staff) throw new ApiError('Only teachers can change Inspiration.', 403);
}

export function parseItemId(raw: string): string {
  if (!UUID.test(raw)) throw new ApiError('Drawing not found', 404);
  return raw;
}
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `pnpm test:run apps/nexus/src/lib/feature-flags.test.ts apps/nexus/src/lib/inspiration-access.test.ts`
Expected: PASS. This includes the existing registry test "defaults student features off and staff features on", which the new entries must satisfy.

- [ ] **Step 6: Commit**

```bash
git add apps/nexus/src/lib/feature-flags.ts apps/nexus/src/lib/feature-flags.test.ts apps/nexus/src/lib/inspiration-access.ts apps/nexus/src/lib/inspiration-access.test.ts
git commit -m "feat(nexus): inspiration feature flags and server-side access check

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Search route and save route

**Files:**
- Create: `apps/nexus/src/app/api/inspiration/search/route.ts`, `apps/nexus/src/app/api/inspiration/search/route.test.ts`
- Create: `apps/nexus/src/app/api/inspiration/items/[id]/save/route.ts`

**Interfaces:**
- **Consumes:**
  - `resolveInspirationCaller`, `parseItemId` (Task 7)
  - `parseInspirationQuery`, `parseScope`, `toFilters` (Task 6)
  - `presentRow` (Task 5)
  - `searchInspiration`, `getInspirationFacets`, `getInspirationItem`, `setInspirationSave` (Task 4)
- **Produces:**
  - `GET /api/inspiration/search?q&type&exam&by&year&sort&offset&scope&saved=1` returns `{ items: InspirationCard[]; total: number; matchKind: string | null; facets: InspirationFacet[] | null; hasMore: boolean }`. The page size is 30. Facets come only on the first page and never with `saved=1`. `scope` is honoured for staff only.
  - `POST` and `DELETE /api/inspiration/items/[id]/save` return `{ saved: boolean }`. Students may only save visible items.

- [ ] **Step 1: Write the failing route test** `apps/nexus/src/app/api/inspiration/search/route.test.ts`

```ts
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-errors';
import { makeRow } from '@/lib/inspiration-test-rows';

const mocks = vi.hoisted(() => ({
  resolveCaller: vi.fn(),
  searchInspiration: vi.fn(),
  getInspirationFacets: vi.fn(),
}));

vi.mock('@/lib/inspiration-access', () => ({
  resolveInspirationCaller: (h: string | null) => mocks.resolveCaller(h),
}));
vi.mock('@neram/database/queries/nexus', () => ({
  searchInspiration: (...a: unknown[]) => mocks.searchInspiration(...a),
  getInspirationFacets: (...a: unknown[]) => mocks.getInspirationFacets(...a),
}));

import { GET } from './route';

const request = (qs: string) =>
  new NextRequest(`http://localhost/api/inspiration/search?${qs}`, { headers: { Authorization: 'Bearer token' } });

describe('GET /api/inspiration/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchInspiration.mockResolvedValue({
      rows: [makeRow({ is_visible: false, auto_eligible: false, score_pct: 0.6 })],
      total: 31,
      matchKind: 'text',
    });
    mocks.getInspirationFacets.mockResolvedValue([{ facet: 'type', value: 'still_life', label: 'Still Life', item_count: 4 }]);
  });

  it('holds a student to the visible scope and sends nothing a teacher sees', async () => {
    mocks.resolveCaller.mockResolvedValue({ user: { id: 's1' }, staff: false });
    const res = await GET(request('q=bag&type=still_life&scope=hidden'));
    expect(res.status).toBe(200);
    expect(mocks.searchInspiration).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'bag', types: ['still_life'], scope: 'visible', savedOnly: false, limit: 30, offset: 0 }),
      's1',
    );
    const body = await res.json();
    expect(body.items[0].staff).toBeUndefined();
    expect(JSON.stringify(body.items)).not.toMatch(/score|curation|authorId|author_id|tutor/i);
    expect(body).toMatchObject({ total: 31, matchKind: 'text', hasMore: true });
    expect(body.facets).toHaveLength(1);
  });

  it('gives staff the hidden scope and the reason a drawing is hidden', async () => {
    mocks.resolveCaller.mockResolvedValue({ user: { id: 't1' }, staff: true });
    const body = await (await GET(request('scope=hidden'))).json();
    expect(mocks.searchInspiration.mock.calls[0][0]).toMatchObject({ scope: 'hidden' });
    expect(body.items[0].staff).toMatchObject({ hiddenReason: 'Below 4 stars' });
  });

  it('skips facets after the first page and for Saved', async () => {
    mocks.resolveCaller.mockResolvedValue({ user: { id: 's1' }, staff: false });
    const later = await (await GET(request('offset=30'))).json();
    const saved = await (await GET(request('saved=1'))).json();
    expect(mocks.getInspirationFacets).not.toHaveBeenCalled();
    expect(later.facets).toBeNull();
    expect(saved.facets).toBeNull();
    expect(mocks.searchInspiration.mock.calls[1][0]).toMatchObject({ savedOnly: true });
  });

  it('answers 404 while the feature is off', async () => {
    mocks.resolveCaller.mockRejectedValue(new ApiError('Inspiration is not available yet.', 404));
    const res = await GET(request(''));
    expect(res.status).toBe(404);
    expect(mocks.searchInspiration).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test:run apps/nexus/src/app/api/inspiration/search/route.test.ts`
Expected: FAIL, `./route` cannot be resolved.

- [ ] **Step 3: Write `apps/nexus/src/app/api/inspiration/search/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getInspirationFacets, searchInspiration } from '@neram/database/queries/nexus';
import { resolveInspirationCaller } from '@/lib/inspiration-access';
import { presentRow } from '@/lib/inspiration-present';
import { parseInspirationQuery, parseScope, toFilters } from '@/lib/inspiration-query';
import { errorResponse } from '@/lib/api-errors';

const PAGE = 30;
const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * GET /api/inspiration/search?q=&type=&exam=&by=&year=&sort=&offset=&scope=&saved=1
 *
 * All ranking and every visibility rule live in nexus_inspiration_search. This
 * route decides only what the caller may ask for (a student is held to the
 * visible scope whatever the query string says) and what the answer may carry
 * (presentRow adds teacher fields for staff only).
 */
export async function GET(request: NextRequest) {
  try {
    const caller = await resolveInspirationCaller(request.headers.get('Authorization'));
    const params = request.nextUrl.searchParams;
    const state = parseInspirationQuery(request.nextUrl.search);
    const offset = Math.max(Math.floor(Number(params.get('offset')) || 0), 0);
    const savedOnly = params.get('saved') === '1';
    const scope = caller.staff && !savedOnly ? parseScope(params.get('scope')) : 'visible';
    const filters = toFilters(state, { offset, limit: PAGE, scope, savedOnly });

    const [result, facets] = await Promise.all([
      searchInspiration(filters, caller.user.id),
      offset === 0 && !savedOnly ? getInspirationFacets(filters, caller.user.id) : Promise.resolve(null),
    ]);

    return NextResponse.json(
      {
        items: result.rows.map((row) => presentRow(row, { staff: caller.staff })),
        total: result.total,
        matchKind: result.matchKind,
        facets,
        hasMore: offset + result.rows.length < result.total,
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    return errorResponse(err, 'Could not search Inspiration');
  }
}
```

- [ ] **Step 4: Write `apps/nexus/src/app/api/inspiration/items/[id]/save/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getInspirationItem, setInspirationSave } from '@neram/database/queries/nexus';
import { parseItemId, resolveInspirationCaller } from '@/lib/inspiration-access';
import { ApiError, errorResponse } from '@/lib/api-errors';

const NO_STORE = { 'Cache-Control': 'no-store' };

/** POST saves, DELETE unsaves. Both are idempotent. A student can only save what they can see. */
async function save(request: NextRequest, rawId: string, saved: boolean) {
  const caller = await resolveInspirationCaller(request.headers.get('Authorization'));
  const id = parseItemId(rawId);
  const { item } = await getInspirationItem(id, caller.user.id, caller.staff ? 'all' : 'visible');
  if (!item) throw new ApiError('Drawing not found', 404);
  await setInspirationSave(id, caller.user.id, saved);
  return NextResponse.json({ saved }, { headers: NO_STORE });
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    return await save(request, params.id, true);
  } catch (err) {
    return errorResponse(err, 'Could not save this drawing');
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    return await save(request, params.id, false);
  } catch (err) {
    return errorResponse(err, 'Could not remove this drawing from saved');
  }
}
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `pnpm test:run apps/nexus/src/app/api/inspiration/search/route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/nexus/src/app/api/inspiration/search "apps/nexus/src/app/api/inspiration/items/[id]/save"
git commit -m "feat(nexus): inspiration search and save routes

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Image shapes and thumbnails

**Files:**
- Create: `apps/nexus/src/lib/inspiration-images.ts`, `apps/nexus/src/lib/inspiration-images.test.ts`
- Create: `apps/nexus/src/app/api/inspiration/maintenance/images/route.ts`

**Interfaces:**
- **Consumes:** `setItemImageMeta`, `listItemsNeedingImages`, `ItemImageWork` (Task 4); `resolveInspirationCaller`, `assertInspirationStaff` (Task 7).
- **Produces:**
  - `orientedAspect(meta: { width?: number; height?: number; orientation?: number }): number | null`
  - `prepareItemImage(item: ItemImageWork): Promise<void>`. It fills whichever of the aspect and the thumbnail is missing. On any failure it parks the item (aspect 0.75, thumbnail = the full image), then rethrows.
  - `POST /api/inspiration/maintenance/images` (staff) returns `{ processed: number; remaining: number }` and handles at most 10 items per call.

- [ ] **Step 1: Write the failing test** `apps/nexus/src/lib/inspiration-images.test.ts`

```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';

/** Real sharp on a generated image; storage, the database and fetch are mocked. */
const mocks = vi.hoisted(() => ({ upload: vi.fn(), setItemImageMeta: vi.fn() }));

vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({
    storage: {
      from: () => ({
        upload: (...a: unknown[]) => mocks.upload(...a),
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.example/${path}` } }),
      }),
    },
  }),
}));
vi.mock('@neram/database/queries/nexus', () => ({
  setItemImageMeta: (...a: unknown[]) => mocks.setItemImageMeta(...a),
}));

import { orientedAspect, prepareItemImage } from './inspiration-images';

describe('orientedAspect', () => {
  it('divides width by height, rounded to three places', () => {
    expect(orientedAspect({ width: 300, height: 600 })).toBe(0.5);
    expect(orientedAspect({ width: 800, height: 1200 })).toBe(0.667);
  });

  it('swaps for a photo stored sideways', () => {
    expect(orientedAspect({ width: 600, height: 300, orientation: 6 })).toBe(0.5);
  });

  it('gives up on missing or absurd sizes', () => {
    expect(orientedAspect({ width: 0, height: 10 })).toBeNull();
    expect(orientedAspect({ width: 1, height: 1000 })).toBeNull();
  });
});

describe('prepareItemImage', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.upload.mockResolvedValue({ error: null });
    mocks.setItemImageMeta.mockResolvedValue(undefined);
    const png = await sharp({ create: { width: 800, height: 1200, channels: 3, background: '#ffffff' } }).png().toBuffer();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(png, { status: 200 })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stores the shape and a 400px JPEG thumbnail', async () => {
    await prepareItemImage({ id: 'item-1', image_url: 'https://example.com/a.png', thumbnail_url: null, image_aspect: null });
    const [path, body, options] = mocks.upload.mock.calls[0];
    expect(path).toBe('inspiration-thumbs/item-1.jpg');
    expect(options).toMatchObject({ contentType: 'image/jpeg', upsert: true });
    expect((await sharp(body as Buffer).metadata()).width).toBe(400);
    expect(mocks.setItemImageMeta).toHaveBeenCalledWith('item-1', {
      image_aspect: 0.667,
      thumbnail_url: 'https://cdn.example/inspiration-thumbs/item-1.jpg',
    });
  });

  it('only fills what is missing', async () => {
    await prepareItemImage({ id: 'item-2', image_url: 'https://example.com/a.png', thumbnail_url: 'https://example.com/t.jpg', image_aspect: null });
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.setItemImageMeta).toHaveBeenCalledWith('item-2', { image_aspect: 0.667 });
  });

  it('parks an image it cannot read, so the next batch moves on', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('gone', { status: 404 })));
    await expect(
      prepareItemImage({ id: 'item-3', image_url: 'https://example.com/gone.png', thumbnail_url: null, image_aspect: null }),
    ).rejects.toThrow('Image fetch failed (404)');
    expect(mocks.setItemImageMeta).toHaveBeenCalledWith('item-3', { image_aspect: 0.75, thumbnail_url: 'https://example.com/gone.png' });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test:run apps/nexus/src/lib/inspiration-images.test.ts`
Expected: FAIL, `./inspiration-images` cannot be resolved.

- [ ] **Step 3: Write `apps/nexus/src/lib/inspiration-images.ts`**

```ts
import sharp from 'sharp';
import { getSupabaseAdminClient } from '@neram/database';
import { setItemImageMeta, type ItemImageWork } from '@neram/database/queries/nexus';

/**
 * A grid of full-size drawing photos is slow on a phone, and a tile that learns
 * its height only after the image loads makes the whole grid jump. So every
 * visible item gets a 400px thumbnail and a stored width-to-height ratio.
 */
const BUCKET = 'drawing-references';
const THUMB_WIDTH = 400;
const FALLBACK_ASPECT = 0.75;

export function orientedAspect(meta: { width?: number; height?: number; orientation?: number }): number | null {
  if (!meta.width || !meta.height) return null;
  // EXIF orientations 5 to 8 store the picture turned a quarter.
  const sideways = (meta.orientation ?? 1) >= 5;
  const aspect = sideways ? meta.height / meta.width : meta.width / meta.height;
  if (aspect < 0.1 || aspect > 10) return null;
  return Math.round(aspect * 1000) / 1000;
}

export async function prepareItemImage(item: ItemImageWork): Promise<void> {
  try {
    const res = await fetch(item.image_url);
    if (!res.ok) throw new Error(`Image fetch failed (${res.status})`);
    const buffer = Buffer.from(await res.arrayBuffer());

    const patch: { thumbnail_url?: string; image_aspect?: number } = {};
    if (item.image_aspect == null) {
      patch.image_aspect = orientedAspect(await sharp(buffer).metadata()) ?? FALLBACK_ASPECT;
    }
    if (!item.thumbnail_url) {
      const thumb = await sharp(buffer)
        .rotate()
        .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
        .jpeg({ quality: 78, mozjpeg: true })
        .toBuffer();
      const path = `inspiration-thumbs/${item.id}.jpg`;
      const storage = getSupabaseAdminClient().storage.from(BUCKET);
      const { error } = await storage.upload(path, thumb, { contentType: 'image/jpeg', upsert: true });
      if (error) throw error;
      patch.thumbnail_url = storage.getPublicUrl(path).data.publicUrl;
    }
    if (Object.keys(patch).length > 0) await setItemImageMeta(item.id, patch);
  } catch (err) {
    // Park it. The tile falls back to the full image in a portrait box, and the
    // next batch does not spend itself retrying the same broken link.
    await setItemImageMeta(item.id, {
      image_aspect: item.image_aspect ?? FALLBACK_ASPECT,
      thumbnail_url: item.thumbnail_url ?? item.image_url,
    }).catch(() => undefined);
    throw err;
  }
}
```

- [ ] **Step 4: Write `apps/nexus/src/app/api/inspiration/maintenance/images/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { listItemsNeedingImages } from '@neram/database/queries/nexus';
import { assertInspirationStaff, resolveInspirationCaller } from '@/lib/inspiration-access';
import { prepareItemImage } from '@/lib/inspiration-images';
import { errorResponse } from '@/lib/api-errors';

export const maxDuration = 60;

const BATCH = 10;
const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * POST /api/inspiration/maintenance/images   (staff)
 *
 * Fills missing thumbnails and shapes, ten visible items per call. The teacher
 * Inspiration page calls it in a short loop on load, which is how the backfill
 * of existing drawings happens without a script or a cron.
 */
export async function POST(request: NextRequest) {
  try {
    const caller = await resolveInspirationCaller(request.headers.get('Authorization'));
    assertInspirationStaff(caller);

    const { items, remaining } = await listItemsNeedingImages(BATCH);
    let processed = 0;
    for (const item of items) {
      try {
        await prepareItemImage(item);
      } catch (err) {
        console.warn(`[inspiration] image prep failed for ${item.id}:`, err instanceof Error ? err.message : err);
      }
      // A parked item has left the queue too.
      processed += 1;
    }

    return NextResponse.json({ processed, remaining: Math.max(remaining - processed, 0) }, { headers: NO_STORE });
  } catch (err) {
    return errorResponse(err, 'Could not prepare images');
  }
}
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `pnpm test:run apps/nexus/src/lib/inspiration-images.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/nexus/src/lib/inspiration-images.ts apps/nexus/src/lib/inspiration-images.test.ts apps/nexus/src/app/api/inspiration/maintenance
git commit -m "feat(nexus): inspiration thumbnails and image shapes

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Item route and exemplar route

**Files:**
- Create: `apps/nexus/src/app/api/inspiration/items/[id]/route.ts`, `apps/nexus/src/app/api/inspiration/items/[id]/route.test.ts`
- Create: `apps/nexus/src/app/api/inspiration/exemplars/route.ts`

**Interfaces:**
- **Consumes:**
  - Task 4: `getInspirationItem`, `getSimilarInspiration`, `updateInspirationItem`, `hideInspirationByAuthor`, `deleteExemplar`, `createExemplar`
  - Task 7: `resolveInspirationCaller`, `assertInspirationStaff`, `parseItemId`
  - Task 6: `parseItemPatch`, `parseExemplarInput`
  - Task 5: `presentRow`
  - Task 9: `prepareItemImage`
- **Produces:**
  - `GET /api/inspiration/items/[id]` returns `{ item: InspirationCard; pair: InspirationCard | null; similar: InspirationCard[] }`. Students get 404 for anything not visible.
  - `PATCH /api/inspiration/items/[id]` (staff) takes a body of `{ curation?, is_featured?, title_override?, brief_override?, type_slugs?, exam_types?, paper_years?, hide_all_by_author? }` and returns `{ item: InspirationCard | null }`.
  - `DELETE /api/inspiration/items/[id]` (staff, exemplars only) returns `{ deleted: true }`.
  - `POST /api/inspiration/exemplars` (staff) takes an `ExemplarInput` body and returns `{ id }` with status 201.

- [ ] **Step 1: Write the failing test** `apps/nexus/src/app/api/inspiration/items/[id]/route.test.ts`

```ts
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeRow } from '@/lib/inspiration-test-rows';

const ID = '11111111-1111-4111-8111-111111111111';

const mocks = vi.hoisted(() => ({
  resolveCaller: vi.fn(),
  getInspirationItem: vi.fn(),
  getSimilarInspiration: vi.fn(),
  updateInspirationItem: vi.fn(),
  hideInspirationByAuthor: vi.fn(),
  deleteExemplar: vi.fn(),
}));

vi.mock('@/lib/inspiration-access', async () => {
  const { ApiError } = await import('@/lib/api-errors');
  return {
    resolveInspirationCaller: (h: string | null) => mocks.resolveCaller(h),
    assertInspirationStaff: (c: { staff: boolean }) => {
      if (!c.staff) throw new ApiError('Only teachers can change Inspiration.', 403);
    },
    parseItemId: (raw: string) => {
      if (!/^[0-9a-f-]{36}$/i.test(raw)) throw new ApiError('Drawing not found', 404);
      return raw;
    },
  };
});
vi.mock('@neram/database/queries/nexus', () => ({
  getInspirationItem: (...a: unknown[]) => mocks.getInspirationItem(...a),
  getSimilarInspiration: (...a: unknown[]) => mocks.getSimilarInspiration(...a),
  updateInspirationItem: (...a: unknown[]) => mocks.updateInspirationItem(...a),
  hideInspirationByAuthor: (...a: unknown[]) => mocks.hideInspirationByAuthor(...a),
  deleteExemplar: (...a: unknown[]) => mocks.deleteExemplar(...a),
}));

import { DELETE, GET, PATCH } from './route';

const ctx = { params: { id: ID } };
const get = () => new NextRequest(`http://localhost/api/inspiration/items/${ID}`, { headers: { Authorization: 'Bearer t' } });
const patch = (body: unknown) =>
  new NextRequest(`http://localhost/api/inspiration/items/${ID}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const student = { user: { id: 's1' }, staff: false };
const teacher = { user: { id: 't1' }, staff: true };

describe('/api/inspiration/items/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSimilarInspiration.mockResolvedValue([]);
    mocks.getInspirationItem.mockResolvedValue({ item: makeRow(), pair: makeRow({ id: 'pair', source_kind: 'submission_reference' }) });
  });

  it('asks for the visible scope for a student and answers 404 when the item is hidden', async () => {
    mocks.resolveCaller.mockResolvedValue(student);
    mocks.getInspirationItem.mockResolvedValue({ item: null, pair: null });
    const res = await GET(get(), ctx);
    expect(mocks.getInspirationItem).toHaveBeenCalledWith(ID, 's1', 'visible');
    expect(res.status).toBe(404);
  });

  it('gives staff every scope and the teacher block', async () => {
    mocks.resolveCaller.mockResolvedValue(teacher);
    const body = await (await GET(get(), ctx)).json();
    expect(mocks.getInspirationItem).toHaveBeenCalledWith(ID, 't1', 'all');
    expect(body.item.staff).toBeDefined();
    expect(body.pair.badge).toBe('reference');
  });

  it('refuses edits from a student', async () => {
    mocks.resolveCaller.mockResolvedValue(student);
    const res = await PATCH(patch({ curation: 'hidden' }), ctx);
    expect(res.status).toBe(403);
    expect(mocks.updateInspirationItem).not.toHaveBeenCalled();
  });

  it('hides a drawing for a teacher', async () => {
    mocks.resolveCaller.mockResolvedValue(teacher);
    const res = await PATCH(patch({ curation: 'hidden' }), ctx);
    expect(res.status).toBe(200);
    expect(mocks.updateInspirationItem).toHaveBeenCalledWith(ID, { curation: 'hidden' }, 't1');
  });

  it("keeps a student drawing's types tied to its review", async () => {
    mocks.resolveCaller.mockResolvedValue(teacher);
    const res = await PATCH(patch({ type_slugs: ['still_life'] }), ctx);
    expect(res.status).toBe(400);
    expect(mocks.updateInspirationItem).not.toHaveBeenCalled();
  });

  it('refuses hide-all when the drawing has no student, and changes nothing', async () => {
    mocks.resolveCaller.mockResolvedValue(teacher);
    mocks.getInspirationItem.mockResolvedValue({ item: makeRow({ author_id: null }), pair: null });
    const res = await PATCH(patch({ curation: 'shown', hide_all_by_author: true }), ctx);
    expect(res.status).toBe(400);
    expect(mocks.updateInspirationItem).not.toHaveBeenCalled();
    expect(mocks.hideInspirationByAuthor).not.toHaveBeenCalled();
  });

  it('deletes only exemplars', async () => {
    mocks.resolveCaller.mockResolvedValue(teacher);
    mocks.deleteExemplar.mockResolvedValue(false);
    const res = await DELETE(get(), ctx);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test:run "apps/nexus/src/app/api/inspiration/items/[id]/route.test.ts"`
Expected: FAIL, `./route` cannot be resolved.

- [ ] **Step 3: Write `apps/nexus/src/app/api/inspiration/items/[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import {
  deleteExemplar,
  getInspirationItem,
  getSimilarInspiration,
  hideInspirationByAuthor,
  updateInspirationItem,
} from '@neram/database/queries/nexus';
import { assertInspirationStaff, parseItemId, resolveInspirationCaller } from '@/lib/inspiration-access';
import { parseItemPatch } from '@/lib/inspiration-patch';
import { presentRow } from '@/lib/inspiration-present';
import { ApiError, errorResponse } from '@/lib/api-errors';

const NO_STORE = { 'Cache-Control': 'no-store' };
type Ctx = { params: { id: string } };

/** GET: one drawing, the other image of the same submission, and more like it. */
export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const caller = await resolveInspirationCaller(request.headers.get('Authorization'));
    const id = parseItemId(params.id);
    const [{ item, pair }, similar] = await Promise.all([
      getInspirationItem(id, caller.user.id, caller.staff ? 'all' : 'visible'),
      getSimilarInspiration(id, caller.user.id, 12),
    ]);
    if (!item) throw new ApiError('Drawing not found', 404);
    const opts = { staff: caller.staff };
    return NextResponse.json(
      {
        item: presentRow(item, opts),
        pair: pair ? presentRow(pair, opts) : null,
        similar: similar.map((row) => presentRow(row, opts)),
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    return errorResponse(err, 'Could not load this drawing');
  }
}

/** PATCH (staff): show, hide, feature, retitle, or hide everything by one student. */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const caller = await resolveInspirationCaller(request.headers.get('Authorization'));
    assertInspirationStaff(caller);
    const id = parseItemId(params.id);

    const { item } = await getInspirationItem(id, caller.user.id, 'all');
    if (!item) throw new ApiError('Drawing not found', 404);

    const { patch, hideAllByAuthor } = parseItemPatch(await request.json().catch(() => ({})), item.source_kind);
    // Validate everything before writing anything.
    if (hideAllByAuthor && !item.author_id) {
      throw new ApiError('This drawing is not linked to a student.', 400);
    }
    if (Object.keys(patch).length > 0) await updateInspirationItem(id, patch, caller.user.id);
    if (hideAllByAuthor && item.author_id) await hideInspirationByAuthor(item.author_id, caller.user.id);

    const { item: fresh } = await getInspirationItem(id, caller.user.id, 'all');
    return NextResponse.json({ item: fresh ? presentRow(fresh, { staff: true }) : null }, { headers: NO_STORE });
  } catch (err) {
    return errorResponse(err, 'Could not change this drawing');
  }
}

/** DELETE (staff): exemplars only. A student's drawing is hidden, never deleted from here. */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  try {
    const caller = await resolveInspirationCaller(request.headers.get('Authorization'));
    assertInspirationStaff(caller);
    const id = parseItemId(params.id);
    const deleted = await deleteExemplar(id);
    if (!deleted) throw new ApiError('Only exemplars added by a teacher can be deleted.', 400);
    return NextResponse.json({ deleted: true }, { headers: NO_STORE });
  } catch (err) {
    return errorResponse(err, 'Could not delete this exemplar');
  }
}
```

- [ ] **Step 4: Write `apps/nexus/src/app/api/inspiration/exemplars/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createExemplar } from '@neram/database/queries/nexus';
import { assertInspirationStaff, resolveInspirationCaller } from '@/lib/inspiration-access';
import { prepareItemImage } from '@/lib/inspiration-images';
import { parseExemplarInput } from '@/lib/inspiration-patch';
import { errorResponse } from '@/lib/api-errors';

export const maxDuration = 30;

const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * POST /api/inspiration/exemplars   (staff)
 * body { image_url, title, brief, type_slugs, exam_types, paper_years }
 *
 * The image is already uploaded (POST /api/drawing/upload, bucket
 * drawing-references). Visible to students at once: a teacher chose it.
 */
export async function POST(request: NextRequest) {
  try {
    const caller = await resolveInspirationCaller(request.headers.get('Authorization'));
    assertInspirationStaff(caller);
    const input = parseExemplarInput(await request.json().catch(() => ({})));
    const id = await createExemplar(input, caller.user.id);
    // Best effort: a failure parks the item, and the maintenance batch never retries forever.
    await prepareItemImage({ id, image_url: input.image_url, thumbnail_url: null, image_aspect: null }).catch((err) =>
      console.warn(`[inspiration] exemplar image prep failed for ${id}:`, err instanceof Error ? err.message : err),
    );
    return NextResponse.json({ id }, { status: 201, headers: NO_STORE });
  } catch (err) {
    return errorResponse(err, 'Could not add the exemplar');
  }
}
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `pnpm test:run "apps/nexus/src/app/api/inspiration/items/[id]/route.test.ts"`
Expected: PASS (7 tests).

- [ ] **Step 6: Type-check the server half**

Run: `pnpm --filter @neram/nexus type-check`
Expected: no errors in the new `inspiration` files. If errors elsewhere predate this work, note them and do not fix them here.

- [ ] **Step 7: Commit**

```bash
git add "apps/nexus/src/app/api/inspiration/items/[id]/route.ts" "apps/nexus/src/app/api/inspiration/items/[id]/route.test.ts" apps/nexus/src/app/api/inspiration/exemplars
git commit -m "feat(nexus): inspiration item, curation and exemplar routes

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: UI building blocks (client helpers, tile, masonry, search bar, filter chips)

**Before writing any UI: invoke the `ui-ux-pro-max` skill** (project rule). Apply its rules, but keep the `@neram/ui` theme; do not adopt its palettes or fonts.

**Files:**
- Create in `apps/nexus/src/components/inspiration/`:
  - `inspiration-api.ts`, `inspiration-nav.ts`
  - `InspirationTile.tsx`, `InspirationMasonry.tsx`
  - `InspirationSearchBar.tsx`, `InspirationFilterChips.tsx`

**Interfaces:**
- **Consumes:**
  - Task 5: `InspirationCard`, `typeLabel`, `EXAM_LABELS`, `BY_LABELS`
  - Task 6: `InspirationQueryState`, `SORT_LABELS`, `chipsFor`, `pickBackHref`, `readRecent`, `addRecent`, `safeLocalStorage`, `columnsForWidth`, `layoutMasonry`
  - `GetToken` from `@/lib/nexus-swr`
- **Produces:**
  - `inspiration-api.ts`:
    - `setSaved(getToken, itemId, saved)`
    - `patchItem(getToken, itemId, patch)`
    - `deleteExemplarItem(getToken, itemId)`
    - `createExemplar(getToken, body)` returns `{ id }`
    - `prepareImages(getToken)` returns `{ processed, remaining }`
    - `uploadInspirationImage(getToken, file)` returns `{ url, path? }`
  - `inspiration-nav.ts`: `InspirationMode = 'student' | 'staff'`, `inspirationBase(mode)`, `rememberListUrl()`, `backHrefFor(mode)`
  - Components:
    - `<InspirationTile card href onOpen? onToggleSave? />` and `<InspirationTileSkeleton aspect? />`
    - `<InspirationMasonry cards renderTile loading? />`
    - `<InspirationSearchBar value onChange />`
    - `<InspirationFilterChips state facets onChange scope? onScopeChange? />`

These are thin UI components with no unit tests. Tasks 12 and 13 exercise them, and so do the E2E specs in Task 15.

- [ ] **Step 1: Write `inspiration-api.ts`**

```ts
import type { GetToken } from '@/lib/nexus-swr';

async function send<T>(getToken: GetToken, url: string, method: string, body?: unknown): Promise<T> {
  const token = await getToken();
  const res = await fetch(url, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error || `Request failed (${res.status})`);
  return json as T;
}

export function setSaved(getToken: GetToken, itemId: string, saved: boolean) {
  return send<{ saved: boolean }>(getToken, `/api/inspiration/items/${itemId}/save`, saved ? 'POST' : 'DELETE');
}

export function patchItem(getToken: GetToken, itemId: string, patch: Record<string, unknown>) {
  return send<{ item: unknown }>(getToken, `/api/inspiration/items/${itemId}`, 'PATCH', patch);
}

export function deleteExemplarItem(getToken: GetToken, itemId: string) {
  return send<{ deleted: boolean }>(getToken, `/api/inspiration/items/${itemId}`, 'DELETE');
}

export function createExemplar(getToken: GetToken, body: Record<string, unknown>) {
  return send<{ id: string }>(getToken, '/api/inspiration/exemplars', 'POST', body);
}

export function prepareImages(getToken: GetToken) {
  return send<{ processed: number; remaining: number }>(getToken, '/api/inspiration/maintenance/images', 'POST');
}

export async function uploadInspirationImage(getToken: GetToken, file: File): Promise<{ url: string; path?: string }> {
  const token = await getToken();
  const form = new FormData();
  form.append('file', file);
  form.append('bucket', 'drawing-references');
  const res = await fetch('/api/drawing/upload', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error || 'Upload failed');
  return json as { url: string; path?: string };
}
```

- [ ] **Step 2: Write `inspiration-nav.ts`**

```ts
import { pickBackHref } from '@/lib/inspiration-query';

export type InspirationMode = 'student' | 'staff';

const LIST_KEY = 'inspiration:list';

export function inspirationBase(mode: InspirationMode): string {
  return mode === 'staff' ? '/teacher/inspiration' : '/student/inspiration';
}

/** Called as a tile is opened, so Back returns to these exact results. */
export function rememberListUrl(): void {
  try {
    sessionStorage.setItem(LIST_KEY, `${window.location.pathname}${window.location.search}`);
  } catch {
    // Private mode: Back falls back to the Inspiration home.
  }
}

export function backHrefFor(mode: InspirationMode): string {
  const base = inspirationBase(mode);
  try {
    return pickBackHref(sessionStorage.getItem(LIST_KEY), base);
  } catch {
    return base;
  }
}
```

- [ ] **Step 3: Write `InspirationTile.tsx`**

```tsx
'use client';

import Link from 'next/link';
import { Box, IconButton, Skeleton, Typography } from '@neram/ui';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import type { InspirationCard } from '@/lib/inspiration-present';

export interface InspirationTileProps {
  card: InspirationCard;
  href: string;
  onOpen?: () => void;
  onToggleSave?: (card: InspirationCard) => void;
}

/**
 * One drawing in the grid. The box takes the image's real shape before the
 * image arrives (aspect-ratio), so the grid never jumps while it loads. The
 * heart is a 44px target sitting on a light disc so it reads on any drawing.
 */
export default function InspirationTile({ card, href, onOpen, onToggleSave }: InspirationTileProps) {
  return (
    <Box component="article" data-testid="inspiration-tile" sx={{ position: 'relative', minWidth: 0 }}>
      <Box
        component={Link}
        href={href}
        onClick={onOpen}
        sx={{
          display: 'block',
          borderRadius: 2,
          overflow: 'hidden',
          bgcolor: 'grey.100',
          '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 2 },
          '@media (prefers-reduced-motion: no-preference)': {
            transition: 'transform 150ms ease-out',
            '&:hover': { transform: 'translateY(-2px)' },
          },
        }}
      >
        <Box
          component="img"
          src={card.thumbnailUrl ?? card.imageUrl}
          alt={card.alt}
          loading="lazy"
          decoding="async"
          sx={{
            display: 'block',
            width: '100%',
            aspectRatio: String(card.aspect ?? 0.75),
            objectFit: card.aspect ? 'cover' : 'contain',
          }}
        />
      </Box>

      {card.badge && (
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            top: 8,
            left: 8,
            px: 1,
            py: 0.25,
            borderRadius: 1,
            bgcolor: 'rgba(0, 0, 0, 0.72)',
            color: 'common.white',
            fontSize: 12,
            fontWeight: 600,
            lineHeight: 1.6,
            pointerEvents: 'none',
          }}
        >
          {card.badge === 'reference' ? 'Reference' : 'Alumni'}
        </Box>
      )}

      {onToggleSave && (
        <IconButton
          aria-label={card.saved ? `Remove ${card.title} from saved` : `Save ${card.title}`}
          aria-pressed={card.saved}
          onClick={() => onToggleSave(card)}
          sx={{
            position: 'absolute',
            top: 4,
            right: 4,
            width: 44,
            height: 44,
            bgcolor: 'rgba(255, 255, 255, 0.92)',
            '&:hover': { bgcolor: 'common.white' },
            '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main' },
          }}
        >
          {card.saved ? <FavoriteIcon sx={{ color: 'error.main' }} /> : <FavoriteBorderIcon />}
        </IconButton>
      )}

      <Typography variant="body2" noWrap title={card.title} sx={{ mt: 0.75, fontWeight: 600 }}>
        {card.title}
      </Typography>
      {card.staff && !card.staff.visible && card.staff.hiddenReason && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {card.staff.hiddenReason}
        </Typography>
      )}
    </Box>
  );
}

export function InspirationTileSkeleton({ aspect = 0.75 }: { aspect?: number }) {
  return (
    <Box aria-hidden>
      <Skeleton variant="rounded" sx={{ width: '100%', height: 'auto', aspectRatio: String(aspect), borderRadius: 2 }} />
      <Skeleton variant="text" sx={{ width: '60%', mt: 0.75 }} />
    </Box>
  );
}
```

- [ ] **Step 4: Write `InspirationMasonry.tsx`**

```tsx
'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Box } from '@neram/ui';
import { columnsForWidth, layoutMasonry } from '@/lib/masonry-layout';
import type { InspirationCard } from '@/lib/inspiration-present';
import { InspirationTileSkeleton } from './InspirationTile';

const SKELETON_ASPECTS = [0.75, 1, 0.66, 1.33, 0.8, 1.1];

export interface InspirationMasonryProps {
  cards: InspirationCard[];
  renderTile: (card: InspirationCard) => ReactNode;
  loading?: boolean;
}

/** Columns follow the grid's own width, never the window (see masonry-layout.ts). */
export default function InspirationMasonry({ cards, renderTile, loading = false }: InspirationMasonryProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(2);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setColumns(columnsForWidth(el.clientWidth));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const laidOut = layoutMasonry(cards, columns, (card) => card.aspect);

  return (
    <Box
      ref={ref}
      aria-busy={loading}
      sx={{ display: 'flex', alignItems: 'flex-start', gap: { xs: 1.5, sm: 2 }, width: '100%', minWidth: 0 }}
    >
      {laidOut.map((column, i) => (
        <Box
          key={i}
          data-testid="masonry-column"
          sx={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', gap: { xs: 1.5, sm: 2 } }}
        >
          {column.map((card) => (
            <Box key={card.id}>{renderTile(card)}</Box>
          ))}
          {loading &&
            [0, 1].map((k) => (
              <InspirationTileSkeleton key={`skeleton-${k}`} aspect={SKELETON_ASPECTS[(i + k) % SKELETON_ASPECTS.length]} />
            ))}
        </Box>
      ))}
    </Box>
  );
}
```

- [ ] **Step 5: Write `InspirationSearchBar.tsx`**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { Box, Chip, IconButton, InputAdornment, TextField, alpha, useTheme } from '@neram/ui';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import HistoryIcon from '@mui/icons-material/History';
import { addRecent, readRecent, safeLocalStorage } from '@/lib/inspiration-recent';

export interface InspirationSearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * The hero of the page: one box that searches everything. It sticks to the top
 * while the grid scrolls, and offers the student's recent searches when empty.
 */
export default function InspirationSearchBar({ value, onChange }: InspirationSearchBarProps) {
  const theme = useTheme();
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    setRecent(readRecent(safeLocalStorage()));
  }, []);

  // Remember a search once the student has paused on it, not every keystroke.
  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) return;
    const timer = setTimeout(() => setRecent(addRecent(safeLocalStorage(), q)), 1500);
    return () => clearTimeout(timer);
  }, [value]);

  return (
    <Box sx={{ position: 'sticky', top: 0, zIndex: 2, bgcolor: 'background.default', py: 1 }}>
      <TextField
        inputRef={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder="Search drawings, like 3D bag and hat"
        fullWidth
        size="small"
        inputProps={{ 'aria-label': 'Search Inspiration', enterKeyHint: 'search', maxLength: 100 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon sx={{ color: 'text.secondary', fontSize: 22 }} />
            </InputAdornment>
          ),
          endAdornment: value ? (
            <InputAdornment position="end">
              <IconButton
                aria-label="Clear search"
                onClick={() => {
                  onChange('');
                  inputRef.current?.focus();
                }}
                sx={{ width: 44, height: 44 }}
              >
                <ClearIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </InputAdornment>
          ) : null,
        }}
        sx={{
          '& .MuiInputBase-input': { fontSize: 16 },
          '& .MuiOutlinedInput-root': {
            minHeight: 48,
            borderRadius: 3,
            bgcolor: alpha(theme.palette.text.primary, 0.04),
            '& fieldset': { border: 'none' },
            '&.Mui-focused fieldset': { border: `2px solid ${theme.palette.primary.main}` },
          },
        }}
      />
      {focused && !value && recent.length > 0 && (
        <Box role="group" aria-label="Recent searches" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
          {recent.map((r) => (
            <Chip
              key={r}
              icon={<HistoryIcon />}
              label={r}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onChange(r)}
              sx={{ height: 44 }}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}
```

- [ ] **Step 6: Write `InspirationFilterChips.tsx`**

```tsx
'use client';

import { useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Chip,
  Drawer,
  List,
  ListItemButton,
  ListItemText,
  Menu,
  MenuItem,
  Typography,
} from '@neram/ui';
import TuneIcon from '@mui/icons-material/Tune';
import SortIcon from '@mui/icons-material/Sort';
import type { InspirationFacet, InspirationSort } from '@neram/database/queries/nexus';
import { SORT_LABELS, chipsFor, type InspirationQueryState } from '@/lib/inspiration-query';
import { BY_LABELS, EXAM_LABELS, typeLabel } from '@/lib/inspiration-types';

export interface InspirationFilterChipsProps {
  state: InspirationQueryState;
  facets: InspirationFacet[];
  onChange: (patch: Partial<InspirationQueryState>) => void;
  /** Staff only: the Hidden chip. */
  scope?: 'visible' | 'hidden';
  onScopeChange?: (scope: 'visible' | 'hidden') => void;
}

const TYPE_CHIPS_INLINE = 8;
const SORTS: InspirationSort[] = ['relevant', 'newest', 'saved'];

const rowSx = {
  display: 'flex',
  gap: 1,
  overflowX: 'auto',
  py: 0.5,
  scrollbarWidth: 'none',
  '&::-webkit-scrollbar': { display: 'none' },
} as const;

const chipSx = { height: 44, flexShrink: 0, fontWeight: 600 } as const;

/**
 * Filters as chips, with counts, so a student narrows a search without leaving
 * it. Each row scrolls inside itself, so the page never scrolls sideways.
 */
export default function InspirationFilterChips({ state, facets, onChange, scope, onScopeChange }: InspirationFilterChipsProps) {
  const [typesOpen, setTypesOpen] = useState(false);
  const [sortAnchor, setSortAnchor] = useState<HTMLElement | null>(null);

  const of = (facet: InspirationFacet['facet']) => facets.filter((f) => f.facet === facet);
  const allTypes = chipsFor(of('type'), state.types);
  const inlineTypes = chipsFor(of('type'), state.types, TYPE_CHIPS_INLINE);
  const toggleType = (slug: string) =>
    onChange({ types: state.types.includes(slug) ? state.types.filter((t) => t !== slug) : [...state.types, slug] });

  const single = <T extends string | number>(label: string, on: boolean, count: number, next: () => void, key: T) => (
    <Chip
      key={String(key)}
      label={`${label} (${count})`}
      color={on ? 'primary' : 'default'}
      variant={on ? 'filled' : 'outlined'}
      aria-pressed={on}
      onClick={next}
      sx={chipSx}
    />
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mb: 2, minWidth: 0 }}>
      <Box role="group" aria-label="Drawing type" sx={rowSx}>
        {inlineTypes.map((f) =>
          single(f.label ?? typeLabel(f.value), state.types.includes(f.value), f.item_count, () => toggleType(f.value), f.value),
        )}
        {allTypes.length > inlineTypes.length && (
          <Chip icon={<TuneIcon />} label="All types" variant="outlined" onClick={() => setTypesOpen(true)} sx={chipSx} />
        )}
      </Box>

      <Box role="group" aria-label="Exam, drawn by and year" sx={rowSx}>
        {chipsFor(of('exam'), state.exam ? [state.exam] : []).map((f) =>
          single(EXAM_LABELS[f.value] ?? f.value, state.exam === f.value, f.item_count, () =>
            onChange({ exam: state.exam === f.value ? null : (f.value as InspirationQueryState['exam']) }), f.value),
        )}
        {chipsFor(of('by'), state.by ? [state.by] : []).map((f) =>
          single(BY_LABELS[f.value] ?? f.value, state.by === f.value, f.item_count, () =>
            onChange({ by: state.by === f.value ? null : (f.value as InspirationQueryState['by']) }), f.value),
        )}
        {chipsFor(of('year'), state.year ? [String(state.year)] : [])
          .sort((a, b) => Number(b.value) - Number(a.value))
          .map((f) =>
            single(f.value, state.year === Number(f.value), f.item_count, () =>
              onChange({ year: state.year === Number(f.value) ? null : Number(f.value) }), f.value),
          )}
        {onScopeChange && (
          <Chip
            label="Hidden"
            color={scope === 'hidden' ? 'primary' : 'default'}
            variant={scope === 'hidden' ? 'filled' : 'outlined'}
            aria-pressed={scope === 'hidden'}
            onClick={() => onScopeChange(scope === 'hidden' ? 'visible' : 'hidden')}
            sx={chipSx}
          />
        )}
        <Chip
          icon={<SortIcon />}
          label={`Sort: ${SORT_LABELS[state.sort]}`}
          variant="outlined"
          aria-haspopup="menu"
          onClick={(e) => setSortAnchor(e.currentTarget)}
          sx={chipSx}
        />
      </Box>

      <Menu anchorEl={sortAnchor} open={Boolean(sortAnchor)} onClose={() => setSortAnchor(null)}>
        {SORTS.map((s) => (
          <MenuItem
            key={s}
            selected={state.sort === s}
            onClick={() => {
              onChange({ sort: s });
              setSortAnchor(null);
            }}
            sx={{ minHeight: 48 }}
          >
            {SORT_LABELS[s]}
          </MenuItem>
        ))}
      </Menu>

      <Drawer
        anchor="bottom"
        open={typesOpen}
        onClose={() => setTypesOpen(false)}
        PaperProps={{ sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '80dvh' } }}
      >
        <Box sx={{ px: 2, pt: 2 }}>
          <Typography variant="h6" component="h2">
            Drawing types
          </Typography>
        </Box>
        <List>
          {allTypes.map((f) => {
            const on = state.types.includes(f.value);
            const id = `inspiration-type-${f.value}`;
            return (
              <ListItemButton key={f.value} onClick={() => toggleType(f.value)} sx={{ minHeight: 48 }}>
                <Checkbox edge="start" checked={on} tabIndex={-1} disableRipple inputProps={{ 'aria-labelledby': id }} />
                <ListItemText
                  id={id}
                  primary={f.label ?? typeLabel(f.value)}
                  secondary={`${f.item_count} ${f.item_count === 1 ? 'drawing' : 'drawings'}`}
                />
              </ListItemButton>
            );
          })}
        </List>
        <Box sx={{ p: 2, pt: 0 }}>
          <Button fullWidth variant="contained" onClick={() => setTypesOpen(false)} sx={{ minHeight: 48 }}>
            Done
          </Button>
        </Box>
      </Drawer>
    </Box>
  );
}
```

- [ ] **Step 7: Type-check**

Run: `pnpm --filter @neram/nexus type-check`
Expected: no errors in `components/inspiration/`.

- [ ] **Step 8: Commit**

```bash
git add apps/nexus/src/components/inspiration/inspiration-api.ts apps/nexus/src/components/inspiration/inspiration-nav.ts apps/nexus/src/components/inspiration/InspirationTile.tsx apps/nexus/src/components/inspiration/InspirationMasonry.tsx apps/nexus/src/components/inspiration/InspirationSearchBar.tsx apps/nexus/src/components/inspiration/InspirationFilterChips.tsx
git commit -m "feat(nexus): inspiration tile, masonry grid, search bar and filter chips

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: The browser and the student search and Saved pages

**Files:**
- Create: `apps/nexus/src/components/inspiration/InspirationBrowser.tsx`
- Create: `apps/nexus/src/app/(student)/student/inspiration/page.tsx`
- Create: `apps/nexus/src/app/(student)/student/inspiration/saved/page.tsx`

**Interfaces:**
- **Consumes:**
  - Task 11 components and helpers
  - `fetchWithToken` from `@/lib/nexus-swr`, `useNexusAuthContext` from `@/hooks/useNexusAuth`
  - `readSearch`, `patchQuery` from `@/lib/list-url-state`
  - `PageHeader` from `@/components/PageHeader`
  - `EMPTY_QUERY`, `parseInspirationQuery`, `toApiQuery`, `toQueryPatch`, `hasActiveFilters` (Task 6)
  - `AddExemplarSheet` (Task 13). **Build order:** this task references it for staff mode. Create a temporary stub `AddExemplarSheet.tsx` exporting `export default function AddExemplarSheet(_: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) { return null; }`. Task 13 replaces it.
- **Produces:** `<InspirationBrowser mode savedOnly? />`, used by both student pages and the teacher page.

**User journey:**
- Nav, the sidebar or the More sheet, opens `/student/inspiration`.
- A tile opens `/student/inspiration/[id]`. Back returns to the exact results.
- The Saved button opens `/student/inspiration/saved`. Back returns to `/student/inspiration`.

- [ ] **Step 1: Create the temporary `AddExemplarSheet.tsx` stub** (as above) so this task type-checks on its own.

- [ ] **Step 2: Write `InspirationBrowser.tsx`**

```tsx
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWRInfinite from 'swr/infinite';
import { Alert, Box, Button, EmptyState, Typography } from '@neram/ui';
import AddPhotoAlternateOutlinedIcon from '@mui/icons-material/AddPhotoAlternateOutlined';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import ImageSearchOutlinedIcon from '@mui/icons-material/ImageSearchOutlined';
import type { InspirationFacet, InspirationMatchKind } from '@neram/database/queries/nexus';
import PageHeader from '@/components/PageHeader';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { fetchWithToken } from '@/lib/nexus-swr';
import { patchQuery, readSearch } from '@/lib/list-url-state';
import {
  EMPTY_QUERY,
  hasActiveFilters,
  parseInspirationQuery,
  toApiQuery,
  toQueryPatch,
  type InspirationQueryState,
} from '@/lib/inspiration-query';
import type { InspirationCard } from '@/lib/inspiration-present';
import AddExemplarSheet from './AddExemplarSheet';
import InspirationFilterChips from './InspirationFilterChips';
import InspirationMasonry from './InspirationMasonry';
import InspirationSearchBar from './InspirationSearchBar';
import InspirationTile from './InspirationTile';
import { prepareImages, setSaved } from './inspiration-api';
import { inspirationBase, rememberListUrl, type InspirationMode } from './inspiration-nav';

const PAGE = 30;

interface SearchPage {
  items: InspirationCard[];
  total: number;
  matchKind: InspirationMatchKind | null;
  facets: InspirationFacet[] | null;
  hasMore: boolean;
}

export interface InspirationBrowserProps {
  mode: InspirationMode;
  savedOnly?: boolean;
}

/**
 * Search home and results on one page. The state lives in the URL (read after
 * mount, written with replaceState), so a search survives reload, sharing and
 * Back. Teachers get the same page with a Hidden filter and Add exemplar.
 */
export default function InspirationBrowser({ mode, savedOnly = false }: InspirationBrowserProps) {
  const router = useRouter();
  const { getToken } = useNexusAuthContext();
  const base = inspirationBase(mode);
  const sentinel = useRef<HTMLDivElement>(null);

  const [ready, setReady] = useState(false);
  const [state, setState] = useState<InspirationQueryState>(EMPTY_QUERY);
  const [input, setInput] = useState('');
  const [scope, setScope] = useState<'visible' | 'hidden'>('visible');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const search = readSearch();
    const initial = parseInspirationQuery(search);
    setState(initial);
    setInput(initial.q);
    setScope(mode === 'staff' && new URLSearchParams(search).get('scope') === 'hidden' ? 'hidden' : 'visible');
    setReady(true);
  }, [mode]);

  // Typing settles for 400ms before it becomes a search.
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      setState((s) => (s.q === input.trim() ? s : { ...s, q: input.trim() }));
    }, 400);
    return () => clearTimeout(timer);
  }, [input, ready]);

  useEffect(() => {
    if (!ready || savedOnly) return;
    patchQuery({ ...toQueryPatch(state), scope: scope === 'hidden' ? 'hidden' : null });
  }, [state, scope, ready, savedOnly]);

  const getKey = useCallback(
    (index: number, previous: SearchPage | null) => {
      if (!ready) return null;
      if (previous && !previous.hasMore) return null;
      const qs = toApiQuery(savedOnly ? EMPTY_QUERY : state, { offset: index * PAGE, scope, savedOnly });
      return `/api/inspiration/search${qs ? `?${qs}` : ''}`;
    },
    [ready, state, scope, savedOnly],
  );

  const { data, error, size, setSize, isLoading, isValidating, mutate } = useSWRInfinite<SearchPage>(
    getKey,
    (url: string) => fetchWithToken<SearchPage>(url, getToken),
    { revalidateFirstPage: false },
  );

  const cards = useMemo(() => (data ?? []).flatMap((page) => page.items), [data]);
  const first = data?.[0];
  const hasMore = Boolean(data?.[data.length - 1]?.hasMore);
  const loadingMore = isValidating && size > (data?.length ?? 0);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void setSize((s) => s + 1);
      },
      { rootMargin: '600px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, setSize, cards.length]);

  // Teachers: fill missing thumbnails a batch at a time while the page is open.
  useEffect(() => {
    if (mode !== 'staff') return;
    let cancelled = false;
    (async () => {
      let last = Number.POSITIVE_INFINITY;
      for (let i = 0; i < 10 && !cancelled; i++) {
        try {
          const { processed, remaining } = await prepareImages(getToken);
          if (processed === 0 || remaining === 0 || remaining >= last) break;
          last = remaining;
        } catch {
          break;
        }
      }
      if (!cancelled) void mutate();
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, getToken, mutate]);

  const toggleSave = useCallback(
    async (card: InspirationCard) => {
      const next = !card.saved;
      const apply = (pages?: SearchPage[]) =>
        pages?.map((page) => ({
          ...page,
          items:
            savedOnly && !next
              ? page.items.filter((c) => c.id !== card.id)
              : page.items.map((c) => (c.id === card.id ? { ...c, saved: next } : c)),
        }));
      await mutate(apply(data), { revalidate: false });
      try {
        await setSaved(getToken, card.id, next);
      } catch {
        await mutate();
      }
    },
    [data, getToken, mutate, savedOnly],
  );

  const clearAll = () => {
    setInput('');
    setState(EMPTY_QUERY);
  };

  const filtered = hasActiveFilters(state) || scope === 'hidden';
  const empty = ready && !error && !isLoading && cards.length === 0;

  return (
    <Box sx={{ pb: 10 }}>
      <PageHeader
        title={savedOnly ? 'Saved' : 'Inspiration'}
        subtitle={
          savedOnly
            ? 'Drawings you kept for later'
            : mode === 'staff'
              ? 'What students see when they look for ideas'
              : 'Search drawings by Neram teachers, classmates and alumni'
        }
        backHref={savedOnly ? base : undefined}
        breadcrumbs={savedOnly ? [{ label: 'Inspiration', href: base }] : undefined}
        action={
          savedOnly ? undefined : mode === 'staff' ? (
            <Button variant="contained" startIcon={<AddPhotoAlternateOutlinedIcon />} onClick={() => setAdding(true)} sx={{ minHeight: 44 }}>
              Add exemplar
            </Button>
          ) : (
            <Button component={Link} href={`${base}/saved`} variant="outlined" startIcon={<FavoriteBorderIcon />} sx={{ minHeight: 44 }}>
              Saved
            </Button>
          )
        }
      />

      <Box sx={{ px: { xs: 2, sm: 3 }, maxWidth: 1440, mx: 'auto', minWidth: 0 }}>
        {!savedOnly && (
          <>
            <InspirationSearchBar value={input} onChange={setInput} />
            <InspirationFilterChips
              state={state}
              facets={first?.facets ?? []}
              onChange={(patch) => setState((s) => ({ ...s, ...patch }))}
              scope={mode === 'staff' ? scope : undefined}
              onScopeChange={mode === 'staff' ? setScope : undefined}
            />
          </>
        )}

        {first && cards.length > 0 && !savedOnly && (
          <Typography variant="body2" color="text.secondary" aria-live="polite" sx={{ mb: 1.5 }}>
            {first.matchKind === 'fuzzy'
              ? `Nothing matched "${state.q}" exactly. Here is what is close.`
              : first.matchKind === 'any'
                ? `No drawing has every word of "${state.q}". These match some of them.`
                : `${first.total} ${first.total === 1 ? 'drawing' : 'drawings'}`}
          </Typography>
        )}

        {error && (
          <Alert
            severity="error"
            action={
              <Button color="inherit" onClick={() => mutate()} sx={{ minHeight: 44 }}>
                Try again
              </Button>
            }
            sx={{ mb: 2 }}
          >
            Could not load drawings. Check your connection and try again.
          </Alert>
        )}

        {empty ? (
          savedOnly ? (
            <EmptyState
              icon={<FavoriteBorderIcon />}
              title="Nothing saved yet"
              description="Tap the heart on any drawing to keep it here."
              action={
                <Button component={Link} href={base} variant="contained" sx={{ minHeight: 48 }}>
                  Browse Inspiration
                </Button>
              }
            />
          ) : filtered ? (
            <EmptyState
              icon={<ImageSearchOutlinedIcon />}
              title={state.q ? `Nothing found for "${state.q}"` : 'Nothing matches these filters'}
              description="Try fewer words, or clear the filters."
              action={
                <Button variant="contained" onClick={clearAll} sx={{ minHeight: 48 }}>
                  Clear search and filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<ImageSearchOutlinedIcon />}
              title="No drawings yet"
              description="Drawings appear here once teachers finish reviewing them."
            />
          )
        ) : (
          <InspirationMasonry
            cards={cards}
            loading={!ready || isLoading || loadingMore}
            renderTile={(card) => (
              <InspirationTile card={card} href={`${base}/${card.id}`} onOpen={rememberListUrl} onToggleSave={toggleSave} />
            )}
          />
        )}

        <div ref={sentinel} aria-hidden />
        {hasMore && !loadingMore && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
            <Button variant="outlined" onClick={() => setSize(size + 1)} sx={{ minHeight: 48 }}>
              Load more
            </Button>
          </Box>
        )}
      </Box>

      {mode === 'staff' && (
        <AddExemplarSheet
          open={adding}
          onClose={() => setAdding(false)}
          onCreated={(id) => {
            setAdding(false);
            router.push(`${base}/${id}`);
          }}
        />
      )}
    </Box>
  );
}
```

- [ ] **Step 3: Write the student pages**

`apps/nexus/src/app/(student)/student/inspiration/page.tsx`

```tsx
'use client';

import InspirationBrowser from '@/components/inspiration/InspirationBrowser';

export default function StudentInspirationPage() {
  return <InspirationBrowser mode="student" />;
}
```

`apps/nexus/src/app/(student)/student/inspiration/saved/page.tsx`

```tsx
'use client';

import InspirationBrowser from '@/components/inspiration/InspirationBrowser';

export default function StudentInspirationSavedPage() {
  return <InspirationBrowser mode="student" savedOnly />;
}
```

- [ ] **Step 4: Type-check**

Run: `pnpm --filter @neram/nexus type-check`
Expected: no errors in the new files.

- [ ] **Step 5: See it work.** Run `pnpm dev:nexus` and open `http://localhost:3012/student/inspiration` as a student, using test mode or impersonation. Check:
  - the grid loads and the chips show counts;
  - typing "street view" narrows the results;
  - the URL gains `?q=street+view`;
  - a heart toggles;
  - `/student/inspiration/saved` lists what was saved.

  Take screenshots at 375px and 1280px. Stop the dev server before any build.

- [ ] **Step 6: Commit**

```bash
git add apps/nexus/src/components/inspiration/InspirationBrowser.tsx apps/nexus/src/components/inspiration/AddExemplarSheet.tsx "apps/nexus/src/app/(student)/student/inspiration/page.tsx" "apps/nexus/src/app/(student)/student/inspiration/saved/page.tsx"
git commit -m "feat(nexus): inspiration search page and saved drawings for students

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Drawing detail, teacher controls, exemplar sheet, remaining pages

**Files:**
- Create in `apps/nexus/src/components/inspiration/`: `InspirationItemView.tsx`, `InspirationCurationBar.tsx`
- Replace the stub: `apps/nexus/src/components/inspiration/AddExemplarSheet.tsx`
- Create: `apps/nexus/src/app/(student)/student/inspiration/[itemId]/page.tsx`
- Create: `apps/nexus/src/app/(teacher)/teacher/inspiration/page.tsx`
- Create: `apps/nexus/src/app/(teacher)/teacher/inspiration/[itemId]/page.tsx`

**Interfaces:**
- **Consumes:**
  - Task 11 components and helpers
  - `useAuthSWR` from `@/lib/nexus-swr`
  - `ImageViewerDialog`, `ImageUploadField` from `@neram/ui`
  - `EXAM_LABELS`, `typeLabel`, `INSPIRATION_TYPE_LABELS` (Task 5)
- **Produces:**
  - `<InspirationItemView mode itemId />`
  - `<InspirationCurationBar card base onChanged />`
  - `<AddExemplarSheet open onClose onCreated />`

**User journey:**
- **Student:** a tile opens the detail page. Back goes to the stored results URL, else `/student/inspiration`. A chip opens a filtered search. "More like this" tiles open other items, and Back still returns to the original results.
- **Teacher:** `/teacher/inspiration` opens the same browser with Hidden and Add exemplar.
  - A tile opens `/teacher/inspiration/[id]` with teacher controls.
  - "Open review" goes to `/teacher/drawing-reviews/[submissionId]`.
  - Deleting an exemplar returns to `/teacher/inspiration`.

- [ ] **Step 1: Write `InspirationItemView.tsx`**

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Box,
  Button,
  Chip,
  EmptyState,
  ImageViewerDialog,
  Skeleton,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@neram/ui';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import ZoomInOutlinedIcon from '@mui/icons-material/ZoomInOutlined';
import ImageNotSupportedOutlinedIcon from '@mui/icons-material/ImageNotSupportedOutlined';
import PageHeader from '@/components/PageHeader';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useAuthSWR } from '@/lib/nexus-swr';
import { EXAM_LABELS, typeLabel } from '@/lib/inspiration-types';
import type { InspirationCard } from '@/lib/inspiration-present';
import InspirationCurationBar from './InspirationCurationBar';
import InspirationMasonry from './InspirationMasonry';
import InspirationTile from './InspirationTile';
import { setSaved } from './inspiration-api';
import { backHrefFor, inspirationBase, type InspirationMode } from './inspiration-nav';

interface ItemResponse {
  item: InspirationCard;
  pair: InspirationCard | null;
  similar: InspirationCard[];
}

const chipSx = { height: 44 } as const;

export default function InspirationItemView({ mode, itemId }: { mode: InspirationMode; itemId: string }) {
  const { getToken } = useNexusAuthContext();
  const base = inspirationBase(mode);
  const [backHref, setBackHref] = useState(base);
  const [view, setView] = useState<'reference' | 'original' | null>(null);
  const [zoom, setZoom] = useState(false);
  const { data, error, isLoading, mutate } = useAuthSWR<ItemResponse>(`/api/inspiration/items/${itemId}`);

  useEffect(() => setBackHref(backHrefFor(mode)), [mode]);
  useEffect(() => setView(null), [itemId]);

  const item = data?.item ?? null;
  const pair = data?.pair ?? null;
  const reference = item ? (item.kind === 'submission_original' ? pair : item) : null;
  const original = item ? (item.kind === 'submission_original' ? item : pair) : null;
  const activeView = view ?? (item?.kind === 'submission_original' ? 'original' : 'reference');
  const shown = (activeView === 'original' ? original : reference) ?? item;

  const toggleSave = useCallback(
    async (card: InspirationCard) => {
      const next = !card.saved;
      const apply = (d?: ItemResponse) =>
        d && {
          ...d,
          item: d.item.id === card.id ? { ...d.item, saved: next } : d.item,
          similar: d.similar.map((c) => (c.id === card.id ? { ...c, saved: next } : c)),
        };
      await mutate(apply(data), { revalidate: false });
      try {
        await setSaved(getToken, card.id, next);
      } catch {
        await mutate();
      }
    },
    [data, getToken, mutate],
  );

  const header = (title: string) => (
    <PageHeader title={title} backHref={backHref} breadcrumbs={[{ label: 'Inspiration', href: base }]} />
  );

  if (error) {
    const gone = error.status === 404;
    return (
      <Box sx={{ pb: 10 }}>
        {header('Inspiration')}
        <EmptyState
          icon={<ImageNotSupportedOutlinedIcon />}
          title={gone ? 'This drawing is no longer in Inspiration' : 'Could not load this drawing'}
          description={gone ? 'A teacher may have taken it down.' : 'Check your connection and try again.'}
          action={
            gone ? (
              <Button component={Link} href={base} variant="contained" sx={{ minHeight: 48 }}>
                Browse Inspiration
              </Button>
            ) : (
              <Button variant="contained" onClick={() => mutate()} sx={{ minHeight: 48 }}>
                Try again
              </Button>
            )
          }
        />
      </Box>
    );
  }

  return (
    <Box sx={{ pb: 10 }}>
      {header(item?.title ?? 'Inspiration')}
      <Box sx={{ px: { xs: 2, sm: 3 }, maxWidth: 1200, mx: 'auto', containerType: 'inline-size', minWidth: 0 }}>
        <Box
          sx={{
            display: 'grid',
            gap: 3,
            gridTemplateColumns: 'minmax(0, 1fr)',
            '@container (min-width: 760px)': { gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)', alignItems: 'start' },
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            {isLoading || !shown ? (
              <Skeleton variant="rounded" sx={{ width: '100%', height: 'auto', aspectRatio: '3 / 4', borderRadius: 2 }} />
            ) : (
              <Box
                component="button"
                type="button"
                onClick={() => setZoom(true)}
                aria-label="View full size"
                sx={{
                  position: 'relative',
                  display: 'block',
                  width: '100%',
                  p: 0,
                  border: 0,
                  borderRadius: 2,
                  overflow: 'hidden',
                  bgcolor: 'grey.100',
                  cursor: 'zoom-in',
                  '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                }}
              >
                <Box
                  component="img"
                  src={shown.imageUrl}
                  alt={shown.alt}
                  sx={{ display: 'block', width: '100%', maxHeight: '75dvh', objectFit: 'contain' }}
                />
                <ZoomInOutlinedIcon
                  aria-hidden
                  sx={{ position: 'absolute', right: 12, bottom: 12, color: 'common.white', bgcolor: 'rgba(0, 0, 0, 0.6)', borderRadius: '50%', p: 0.75, fontSize: 36 }}
                />
              </Box>
            )}
            {reference && original && (
              <ToggleButtonGroup
                exclusive
                value={activeView}
                onChange={(_, value: 'reference' | 'original' | null) => value && setView(value)}
                aria-label="Which image to show"
                sx={{ mt: 1.5, display: 'flex' }}
              >
                <ToggleButton value="reference" sx={{ flex: 1, minHeight: 44 }}>
                  Reference
                </ToggleButton>
                <ToggleButton value="original" sx={{ flex: 1, minHeight: 44 }}>
                  Student&apos;s drawing
                </ToggleButton>
              </ToggleButtonGroup>
            )}
          </Box>

          <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {!item ? (
              <>
                <Skeleton variant="text" sx={{ width: '50%' }} />
                <Skeleton variant="rounded" sx={{ height: 96 }} />
              </>
            ) : (
              <>
                <Typography variant="body2" color="text.secondary">
                  {shown?.credit ?? item.credit}
                </Typography>
                {item.brief && (
                  <Typography variant="body1" sx={{ whiteSpace: 'pre-line', lineHeight: 1.6 }}>
                    {item.brief}
                  </Typography>
                )}
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {item.typeSlugs.map((slug) => (
                    <Chip key={slug} component={Link} href={`${base}?type=${slug}`} clickable label={typeLabel(slug)} sx={chipSx} />
                  ))}
                  {item.examTypes.map((exam) => (
                    <Chip key={exam} component={Link} href={`${base}?exam=${exam}`} clickable variant="outlined" label={EXAM_LABELS[exam] ?? exam} sx={chipSx} />
                  ))}
                  {item.years.map((year) => (
                    <Chip key={year} component={Link} href={`${base}?year=${year}`} clickable variant="outlined" label={String(year)} sx={chipSx} />
                  ))}
                  {item.tagLabels.map((tag) => (
                    <Chip key={tag} component={Link} href={`${base}?q=${encodeURIComponent(tag)}`} clickable variant="outlined" label={tag} sx={chipSx} />
                  ))}
                </Box>
                <Button
                  variant={item.saved ? 'contained' : 'outlined'}
                  startIcon={item.saved ? <FavoriteIcon /> : <FavoriteBorderIcon />}
                  aria-pressed={item.saved}
                  onClick={() => toggleSave(item)}
                  sx={{ minHeight: 48, alignSelf: 'flex-start' }}
                >
                  {item.saved ? 'Saved' : 'Save'}
                </Button>
                {mode === 'staff' && item.staff && (
                  <InspirationCurationBar card={item} base={base} onChanged={() => void mutate()} />
                )}
              </>
            )}
          </Box>
        </Box>

        {data && data.similar.length > 0 && (
          <Box component="section" aria-labelledby="inspiration-more-like-this" sx={{ mt: 5 }}>
            <Typography id="inspiration-more-like-this" variant="h6" component="h2" sx={{ mb: 1.5, fontWeight: 700 }}>
              More like this
            </Typography>
            <InspirationMasonry
              cards={data.similar}
              renderTile={(card) => <InspirationTile card={card} href={`${base}/${card.id}`} onToggleSave={toggleSave} />}
            />
          </Box>
        )}
      </Box>

      {shown && (
        <ImageViewerDialog open={zoom} onClose={() => setZoom(false)} src={shown.imageUrl} alt={shown.alt} name={item?.title} />
      )}
    </Box>
  );
}
```

- [ ] **Step 2: Write `InspirationCurationBar.tsx`**

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from '@neram/ui';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import StarIcon from '@mui/icons-material/Star';
import StarOutlineIcon from '@mui/icons-material/StarOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import PersonOffOutlinedIcon from '@mui/icons-material/PersonOffOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import type { InspirationCard } from '@/lib/inspiration-present';
import { deleteExemplarItem, patchItem } from './inspiration-api';

export interface InspirationCurationBarProps {
  card: InspirationCard;
  base: string;
  onChanged: () => void;
}

const actionSx = { minHeight: 44 } as const;

/** Teacher controls on a drawing. Every change is reversible except deleting an exemplar. */
export default function InspirationCurationBar({ card, base, onChanged }: InspirationCurationBarProps) {
  const { getToken } = useNexusAuthContext();
  const router = useRouter();
  const staff = card.staff!;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<'author' | 'delete' | null>(null);
  const [title, setTitle] = useState(staff.titleOverride ?? '');
  const [brief, setBrief] = useState(card.brief ?? '');

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the change');
    } finally {
      setBusy(false);
    }
  };

  const status = staff.visible
    ? staff.curation === 'shown'
      ? 'Shown to students (a teacher added it)'
      : 'Shown to students'
    : staff.hiddenReason ?? 'Not shown to students';

  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography variant="subtitle2" component="h2">
        Teacher controls
      </Typography>
      <Typography variant="body2" color="text.secondary" aria-live="polite">
        {status}
      </Typography>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {staff.visible ? (
          <Button variant="outlined" color="inherit" startIcon={<VisibilityOffOutlinedIcon />} disabled={busy} onClick={() => run(() => patchItem(getToken, card.id, { curation: 'hidden' }))} sx={actionSx}>
            Hide from students
          </Button>
        ) : (
          <Button variant="contained" startIcon={<VisibilityOutlinedIcon />} disabled={busy} onClick={() => run(() => patchItem(getToken, card.id, { curation: 'shown' }))} sx={actionSx}>
            Show to students
          </Button>
        )}
        {staff.curation !== 'auto' && (
          <Button color="inherit" startIcon={<RestartAltIcon />} disabled={busy} onClick={() => run(() => patchItem(getToken, card.id, { curation: 'auto' }))} sx={actionSx}>
            Use the automatic rule
          </Button>
        )}
        <Button variant="outlined" color="inherit" startIcon={card.featured ? <StarIcon /> : <StarOutlineIcon />} disabled={busy} onClick={() => run(() => patchItem(getToken, card.id, { is_featured: !card.featured }))} sx={actionSx}>
          {card.featured ? 'Unfeature' : 'Feature'}
        </Button>
        <Button variant="outlined" color="inherit" startIcon={<EditOutlinedIcon />} onClick={() => setEditing(true)} sx={actionSx}>
          Edit title and brief
        </Button>
        {staff.submissionId && (
          <Button component={Link} href={`/teacher/drawing-reviews/${staff.submissionId}`} color="inherit" startIcon={<RateReviewOutlinedIcon />} sx={actionSx}>
            Open review
          </Button>
        )}
        {card.kind !== 'exemplar' && staff.authorId && (
          <Button color="inherit" startIcon={<PersonOffOutlinedIcon />} onClick={() => setConfirm('author')} sx={actionSx}>
            Hide all from this student
          </Button>
        )}
        {card.kind === 'exemplar' && (
          <Button color="error" startIcon={<DeleteOutlineIcon />} onClick={() => setConfirm('delete')} sx={actionSx}>
            Delete exemplar
          </Button>
        )}
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      <Dialog open={editing} onClose={() => setEditing(false)} fullWidth maxWidth="sm" aria-labelledby="inspiration-edit-title">
        <DialogTitle id="inspiration-edit-title">Edit title and brief</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
          <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} inputProps={{ maxLength: 120 }} helperText="Leave empty to use the drawing type" fullWidth />
          <TextField label="Brief" value={brief} onChange={(e) => setBrief(e.target.value)} inputProps={{ maxLength: 600 }} helperText="Use the words a student would search for" multiline minRows={3} fullWidth />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditing(false)} sx={actionSx}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={busy}
            sx={actionSx}
            onClick={() =>
              run(async () => {
                await patchItem(getToken, card.id, {
                  title_override: title,
                  // Only send the brief when it changed, so a synced brief keeps following its question.
                  ...(brief !== (card.brief ?? '') ? { brief_override: brief } : {}),
                });
                setEditing(false);
              })
            }
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirm !== null} onClose={() => setConfirm(null)} aria-labelledby="inspiration-confirm-title">
        <DialogTitle id="inspiration-confirm-title">
          {confirm === 'delete' ? 'Delete this exemplar?' : 'Hide every drawing by this student?'}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {confirm === 'delete'
              ? 'Students stop seeing it, and anyone who saved it loses it. This cannot be undone.'
              : 'Their drawings and the references made from them are hidden from students. You can show any of them again later.'}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirm(null)} sx={actionSx}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={busy}
            sx={actionSx}
            onClick={() =>
              confirm === 'delete'
                ? run(async () => {
                    await deleteExemplarItem(getToken, card.id);
                    router.push(base);
                  })
                : run(async () => {
                    await patchItem(getToken, card.id, { hide_all_by_author: true });
                    setConfirm(null);
                  })
            }
          >
            {confirm === 'delete' ? 'Delete' : 'Hide all'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
```

- [ ] **Step 3: Replace the stub with the real `AddExemplarSheet.tsx`**

```tsx
'use client';

import { useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  ImageUploadField,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { INSPIRATION_TYPE_LABELS, typeLabel } from '@/lib/inspiration-types';
import { createExemplar, uploadInspirationImage } from './inspiration-api';

const TYPE_OPTIONS = Object.keys(INSPIRATION_TYPE_LABELS);

export interface AddExemplarSheetProps {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}

/** A teacher adds a drawing of their own. Full screen on a phone, a dialog on a laptop. */
export default function AddExemplarSheet({ open, onClose, onCreated }: AddExemplarSheetProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const { getToken } = useNexusAuthContext();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [types, setTypes] = useState<string[]>([]);
  const [exams, setExams] = useState<string[]>([]);
  const [year, setYear] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setImageUrl(null);
    setTitle('');
    setBrief('');
    setTypes([]);
    setExams([]);
    setYear('');
    setError(null);
  };

  const close = () => {
    const dirty = Boolean(imageUrl || title.trim() || brief.trim());
    if (dirty && !window.confirm('Discard this exemplar?')) return;
    reset();
    onClose();
  };

  const canSave = Boolean(imageUrl) && types.length > 0 && Boolean(title.trim() || brief.trim()) && !saving;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const { id } = await createExemplar(getToken, {
        image_url: imageUrl,
        title,
        brief,
        type_slugs: types,
        exam_types: exams,
        paper_years: /^\d{4}$/.test(year) ? [Number(year)] : [],
      });
      reset();
      onCreated(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the exemplar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={close} fullScreen={fullScreen} fullWidth maxWidth="sm" aria-labelledby="add-exemplar-title">
      <DialogTitle id="add-exemplar-title">Add an exemplar</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
        <ImageUploadField
          value={imageUrl}
          onChange={setImageUrl}
          upload={(file) => uploadInspirationImage(getToken, file)}
          label="Drawing"
          helperText="A clear photo or scan. You can paste an image too."
          maxSizeMB={10}
          previewable
          required
        />
        <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} inputProps={{ maxLength: 120 }} fullWidth />
        <TextField
          label="Brief"
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          inputProps={{ maxLength: 600 }}
          helperText="The question or idea, in the words a student would search for"
          multiline
          minRows={3}
          fullWidth
        />
        <Autocomplete
          multiple
          options={TYPE_OPTIONS}
          value={types}
          onChange={(_, value) => setTypes(value.slice(0, 6))}
          getOptionLabel={typeLabel}
          renderInput={(params) => <TextField {...params} label="Drawing types" required helperText="Pick at least one" />}
        />
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }} id="exemplar-exam-label">
            Exam (optional)
          </Typography>
          <ToggleButtonGroup value={exams} onChange={(_, value: string[]) => setExams(value)} aria-labelledby="exemplar-exam-label">
            <ToggleButton value="NATA" sx={{ minHeight: 44, px: 2 }}>
              NATA
            </ToggleButton>
            <ToggleButton value="JEE_PAPER_2" sx={{ minHeight: 44, px: 2 }}>
              JEE Paper 2
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
        <TextField
          label="Past paper year (optional)"
          value={year}
          onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
          inputProps={{ inputMode: 'numeric', pattern: '[0-9]*' }}
          sx={{ maxWidth: 240 }}
        />
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={close} sx={{ minHeight: 44 }}>
          Cancel
        </Button>
        <Button variant="contained" onClick={save} disabled={!canSave} sx={{ minHeight: 44 }}>
          {saving ? 'Adding' : 'Add to Inspiration'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

- [ ] **Step 4: Write the three remaining pages**

`apps/nexus/src/app/(student)/student/inspiration/[itemId]/page.tsx`

```tsx
'use client';

import { useParams } from 'next/navigation';
import InspirationItemView from '@/components/inspiration/InspirationItemView';

export default function StudentInspirationItemPage() {
  const { itemId } = useParams<{ itemId: string }>();
  return <InspirationItemView mode="student" itemId={itemId} />;
}
```

`apps/nexus/src/app/(teacher)/teacher/inspiration/page.tsx`

```tsx
'use client';

import InspirationBrowser from '@/components/inspiration/InspirationBrowser';

export default function TeacherInspirationPage() {
  return <InspirationBrowser mode="staff" />;
}
```

`apps/nexus/src/app/(teacher)/teacher/inspiration/[itemId]/page.tsx`

```tsx
'use client';

import { useParams } from 'next/navigation';
import InspirationItemView from '@/components/inspiration/InspirationItemView';

export default function TeacherInspirationItemPage() {
  const { itemId } = useParams<{ itemId: string }>();
  return <InspirationItemView mode="staff" itemId={itemId} />;
}
```

- [ ] **Step 5: Type-check**

Run: `pnpm --filter @neram/nexus type-check`
Expected: no errors in the new files. If `Chip component={Link}` does not type-check, wrap each chip instead: `<Link href=... passHref legacyBehavior><Chip component="a" clickable ... /></Link>`. Do not use `as any`.

- [ ] **Step 6: See it work.** With `pnpm dev:nexus`:
  - **As a teacher**, at `/teacher/inspiration`:
    1. Add an exemplar with a unique title.
    2. Confirm it opens on its detail page.
    3. Hide it, then check its status line reads "Hidden by a teacher".
    4. Set it back to the automatic rule.
    5. Delete it; the page returns to the grid.
  - **As a student**, open a reference drawing that has a pair:
    1. The toggle switches images.
    2. A type chip opens a filtered search.
    3. Back from the detail page returns to the same results.

  Take screenshots at 375px and 1280px, then stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add apps/nexus/src/components/inspiration/InspirationItemView.tsx apps/nexus/src/components/inspiration/InspirationCurationBar.tsx apps/nexus/src/components/inspiration/AddExemplarSheet.tsx "apps/nexus/src/app/(student)/student/inspiration/[itemId]/page.tsx" "apps/nexus/src/app/(teacher)/teacher/inspiration/page.tsx" "apps/nexus/src/app/(teacher)/teacher/inspiration/[itemId]/page.tsx"
git commit -m "feat(nexus): inspiration drawing detail, teacher curation and exemplars

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Navigation

**Files:**
- Modify: `apps/nexus/src/lib/nav-config.tsx`
- Modify: `apps/nexus/src/lib/nav-config.test.ts` (append a describe block)

**Interfaces:**
- **Consumes:** existing `PANELS`, `ZONES`, `panelBottomNav`, `panelOverflow`, `zoneOverflow`.
- **Produces:** `export const INSPIRATION_PATH = '/student/inspiration'`, plus three nav items:
  - **Classroom zone**, Practice group: after Sketchbook.
  - **Study zone**, Study group: after Library.
  - **Teaching panel**, Student work group: after Sketchbooks.
- The bottom bars stay unchanged at 4 items. The More sheet derives the new items automatically. The old Drawings item and the Drawing Reviews item stay until Milestone 3.

- [ ] **Step 1: Write the failing test.** Append to `apps/nexus/src/lib/nav-config.test.ts`:

```ts
describe('nav-config: Inspiration', () => {
  it('is reachable on a phone from both student zones', () => {
    for (const zone of ZONES) {
      const mobile = [...paths(zone.bottomNavItems), ...paths(zoneOverflow(zone))];
      expect(mobile, `${zone.id} zone`).toContain('/student/inspiration');
    }
  });

  it('sits with student work in the Teaching panel, reachable on a phone', () => {
    const teaching = PANELS.find((p) => p.id === 'teaching')!;
    const item = teaching.sidebarItems.find((i) => i.path === '/teacher/inspiration');
    expect(item?.group).toBe('Student work');
    expect([...paths(panelBottomNav(teaching)), ...paths(panelOverflow(teaching))]).toContain('/teacher/inspiration');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test:run apps/nexus/src/lib/nav-config.test.ts`
Expected: FAIL, the Inspiration path is not in the arrays.

- [ ] **Step 3: Edit `apps/nexus/src/lib/nav-config.tsx`**

Add with the other icon imports:

```tsx
import CollectionsOutlinedIcon from '@mui/icons-material/CollectionsOutlined';
```

Add next to `export const RESOURCES_PATH = '/student/resources';`:

```tsx
export const INSPIRATION_PATH = '/student/inspiration';
```

In the Teaching panel `sidebarItems`, after the Sketchbooks line:

```tsx
      { label: 'Inspiration', path: '/teacher/inspiration', icon: <CollectionsOutlinedIcon />, group: 'Student work' },
```

In `CLASSROOM.navGroups`, Practice items, after Sketchbook:

```tsx
        { label: 'Inspiration', path: INSPIRATION_PATH, icon: <CollectionsOutlinedIcon /> },
```

In `STUDY.navGroups`, Study items, after Library:

```tsx
        { label: 'Inspiration', path: INSPIRATION_PATH, icon: <CollectionsOutlinedIcon /> },
```

- [ ] **Step 4: Run the whole nav and flag suite and watch it pass**

Run: `pnpm test:run apps/nexus/src/lib/nav-config.test.ts apps/nexus/src/lib/feature-flags.test.ts`
Expected: PASS. The existing "no sidebar item is missing from the bottom bar or the More sheet" cases must stay green.

- [ ] **Step 5: Check the teacher panel resolves.** `PanelProvider.detectPanelFromPath('/teacher/inspiration/<id>')` falls through to the prefix loop over sidebar paths and returns `teaching`. No change is needed. Confirm by opening a teacher item page in the dev server: the Teaching panel is highlighted.

- [ ] **Step 6: Commit**

```bash
git add apps/nexus/src/lib/nav-config.tsx apps/nexus/src/lib/nav-config.test.ts
git commit -m "feat(nexus): Inspiration in the student zones and the Teaching panel

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: End-to-end tests

**Files:**
- Create: `tests/e2e/inspiration-nexus-mobile.spec.ts` (Playwright project `nexus-mobile`)
- Create: `tests/e2e/inspiration-nexus.spec.ts` (Playwright project `nexus-chrome`)

**Interfaces:**
- **Consumes:** `APP_URLS`, `STUDENT_ACCOUNT`, `TEACHER_ACCOUNT`, `injectAuthForPage` from `tests/utils/credentials`; `assertNoHorizontalOverflow` from `tests/utils/mobile-helpers`; `POST /api/auth/test-login`; every route from Tasks 8 to 10.
- The Nexus dev server must be running against a database with the Task 1 to 3 migrations. Every case self-skips with a clear reason when the server, the migrations or the flag are missing, following `tests/e2e/sketchbook-nexus-mobile.spec.ts`.

- [ ] **Step 1: Write `tests/e2e/inspiration-nexus-mobile.spec.ts`**

```ts
import { test, expect, type Page } from '@playwright/test';
import { APP_URLS, STUDENT_ACCOUNT, TEACHER_ACCOUNT, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * Inspiration on a phone.
 *
 * API half (serial): a teacher adds an exemplar; a student finds it by search,
 * sees no teacher fields, saves it and finds it in Saved; a student cannot edit;
 * the teacher hides it and the student can no longer open it. The exemplar is
 * deleted in afterAll. Test tokens run with every feature on (see
 * inspiration-access.ts), so the flag does not gate this half.
 *
 * UI half: the search home and a drawing page fit 375px with thumb-sized
 * targets, and Back from a drawing returns to the results.
 */

const NEXUS = APP_URLS.nexus;
const UNIQUE = `Vbnqz exemplar ${Date.now()}`;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

let studentToken = '';
let teacherToken = '';
let exemplarId = '';
let ready = true;

test.describe('Inspiration API', () => {
  test.describe.configure({ mode: 'serial' });

  test('setup: tokens and a migration probe', async ({ request }) => {
    const s = await request.post(`${NEXUS}/api/auth/test-login`, { data: { email: STUDENT_ACCOUNT.email, role: 'student' } });
    test.skip(s.status() !== 200, 'Nexus dev server or test-login not available');
    studentToken = (await s.json()).testToken;
    const t = await request.post(`${NEXUS}/api/auth/test-login`, { data: { email: TEACHER_ACCOUNT.email, role: 'teacher' } });
    teacherToken = (await t.json()).testToken;

    const probe = await request.get(`${NEXUS}/api/inspiration/search`, { headers: auth(teacherToken), failOnStatusCode: false });
    if (probe.status() !== 200) {
      ready = false;
      console.log(`[inspiration probe] ${probe.status()}: ${await probe.text()}`);
    }
  });

  test('a teacher adds an exemplar and a student finds it by search', async ({ request }) => {
    test.skip(!ready || !teacherToken, 'inspiration migrations not applied to this database');
    const create = await request.post(`${NEXUS}/api/inspiration/exemplars`, {
      headers: auth(teacherToken),
      data: {
        image_url: 'https://placehold.co/600x800.png',
        title: UNIQUE,
        brief: 'A travel bag and a hat, drawn for the end to end run',
        type_slugs: ['3d_composition'],
        exam_types: ['NATA'],
        paper_years: [2025],
      },
    });
    expect(create.status()).toBe(201);
    exemplarId = (await create.json()).id;

    const found = await request.get(`${NEXUS}/api/inspiration/search?q=${encodeURIComponent(UNIQUE)}`, { headers: auth(studentToken) });
    expect(found.status()).toBe(200);
    const body = await found.json();
    const hit = body.items.find((i: { id: string }) => i.id === exemplarId);
    expect(hit).toBeTruthy();
    expect(hit.staff).toBeUndefined();
    expect(hit.credit).toBe('Neram reference');
    expect(JSON.stringify(body.items)).not.toMatch(/score_pct|curation|authorId|tutor_/);
  });

  test('a student saves it and finds it in Saved', async ({ request }) => {
    test.skip(!exemplarId, 'no exemplar was created');
    const save = await request.post(`${NEXUS}/api/inspiration/items/${exemplarId}/save`, { headers: auth(studentToken) });
    expect(save.status()).toBe(200);
    const saved = await (await request.get(`${NEXUS}/api/inspiration/search?saved=1`, { headers: auth(studentToken) })).json();
    expect(saved.items.map((i: { id: string }) => i.id)).toContain(exemplarId);
  });

  test('a student cannot change Inspiration or ask for hidden drawings', async ({ request }) => {
    test.skip(!exemplarId, 'no exemplar was created');
    const edit = await request.patch(`${NEXUS}/api/inspiration/items/${exemplarId}`, { headers: auth(studentToken), data: { curation: 'hidden' } });
    expect(edit.status()).toBe(403);
    const hidden = await (await request.get(`${NEXUS}/api/inspiration/search?scope=hidden`, { headers: auth(studentToken) })).json();
    for (const item of hidden.items) expect(item.staff).toBeUndefined();
  });

  test('a teacher hides it and the student can no longer open it', async ({ request }) => {
    test.skip(!exemplarId, 'no exemplar was created');
    const hide = await request.patch(`${NEXUS}/api/inspiration/items/${exemplarId}`, { headers: auth(teacherToken), data: { curation: 'hidden' } });
    expect(hide.status()).toBe(200);
    expect((await hide.json()).item.staff.hiddenReason).toBe('Hidden by a teacher');
    const open = await request.get(`${NEXUS}/api/inspiration/items/${exemplarId}`, { headers: auth(studentToken), failOnStatusCode: false });
    expect(open.status()).toBe(404);
  });

  test.afterAll(async ({ request }) => {
    if (exemplarId && teacherToken) {
      await request.delete(`${NEXUS}/api/inspiration/items/${exemplarId}`, { headers: auth(teacherToken), failOnStatusCode: false });
    }
  });
});

test.describe('Inspiration on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  async function open(page: Page, path: string): Promise<'ok' | 'off' | 'down'> {
    const ok = await injectAuthForPage(page, 'student');
    if (!ok) return 'down';
    await page.goto(`${NEXUS}${path}`, { waitUntil: 'domcontentloaded' });
    const shell = page.locator('button[aria-label="Open profile menu"]');
    try {
      await shell.waitFor({ timeout: 90_000 });
    } catch {
      return 'down';
    }
    const skip = page.getByRole('button', { name: 'Skip' });
    if (await skip.isVisible().catch(() => false)) await skip.click();
    if (await page.getByText(/is coming soon|getting this ready for you/i).first().isVisible().catch(() => false)) return 'off';
    return 'ok';
  }

  test('search home fits the screen with thumb-sized targets', async ({ page }) => {
    test.setTimeout(120_000);
    const state = await open(page, '/student/inspiration');
    test.skip(state === 'down', 'Nexus not running');
    test.skip(state === 'off', 'student.inspiration is off in this environment');

    await expect(page.getByRole('heading', { name: 'Inspiration', exact: true })).toBeVisible();
    const search = page.getByRole('textbox', { name: 'Search Inspiration' });
    await expect(search).toBeVisible();
    expect(await search.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    await assertNoHorizontalOverflow(page);

    const saved = await page.getByRole('link', { name: 'Saved' }).boundingBox();
    expect(saved && saved.height >= 44).toBe(true);
  });

  test('a drawing opens, fits, and Back returns to the same results', async ({ page }) => {
    test.setTimeout(120_000);
    const state = await open(page, '/student/inspiration?sort=newest');
    test.skip(state !== 'ok', 'Nexus not running or flag off');

    const tile = page.getByTestId('inspiration-tile').first();
    test.skip(!(await tile.isVisible({ timeout: 20_000 }).catch(() => false)), 'no visible drawings in this environment');
    const heart = await tile.getByRole('button').boundingBox();
    expect(heart && heart.height >= 44 && heart.width >= 44).toBe(true);

    await tile.getByRole('link').click();
    await expect(page).toHaveURL(/\/student\/inspiration\/[0-9a-f-]{36}/);
    await expect(page.getByRole('button', { name: /^(Save|Saved)$/ })).toBeVisible();
    await assertNoHorizontalOverflow(page);

    await page.getByRole('link', { name: 'Back to Inspiration' }).click();
    await expect(page).toHaveURL(/\/student\/inspiration\?sort=newest$/);
  });
});
```

- [ ] **Step 2: Write `tests/e2e/inspiration-nexus.spec.ts`**

```ts
import { test, expect, type Page } from '@playwright/test';
import { APP_URLS, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/** Teacher Inspiration on a laptop: the grid spreads out, Hidden toggles, Add exemplar opens. */
const NEXUS = APP_URLS.nexus;

test.describe('Teacher Inspiration on a laptop', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  async function open(page: Page): Promise<boolean> {
    const ok = await injectAuthForPage(page, 'teacher');
    if (!ok) return false;
    await page.goto(`${NEXUS}/teacher/inspiration`, { waitUntil: 'domcontentloaded' });
    try {
      await page.locator('button[aria-label="Open profile menu"]').waitFor({ timeout: 90_000 });
    } catch {
      return false;
    }
    return true;
  }

  test('the grid uses the width and nothing scrolls sideways', async ({ page }) => {
    test.setTimeout(120_000);
    test.skip(!(await open(page)), 'Nexus not running');
    await expect(page.getByRole('heading', { name: 'Inspiration', exact: true })).toBeVisible();
    await expect(page.getByTestId('masonry-column').first()).toBeVisible();
    expect(await page.getByTestId('masonry-column').count()).toBeGreaterThanOrEqual(3);
    await assertNoHorizontalOverflow(page);
  });

  test('Hidden is a filter that lives in the URL', async ({ page }) => {
    test.setTimeout(120_000);
    test.skip(!(await open(page)), 'Nexus not running');
    await page.getByRole('button', { name: 'Hidden' }).click();
    await expect(page).toHaveURL(/scope=hidden/);
    await page.getByRole('button', { name: 'Hidden' }).click();
    await expect(page).not.toHaveURL(/scope=hidden/);
  });

  test('Add exemplar opens a form that will not save without a drawing and a type', async ({ page }) => {
    test.setTimeout(120_000);
    test.skip(!(await open(page)), 'Nexus not running');
    await page.getByRole('button', { name: 'Add exemplar' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add an exemplar' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Title').fill('Only a title');
    await expect(dialog.getByRole('button', { name: 'Add to Inspiration' })).toBeDisabled();
  });
});
```

- [ ] **Step 3: Run them**

Start `pnpm dev:nexus` in a separate terminal first, and let it compile. Then:

Run: `pnpm test:e2e tests/e2e/inspiration-nexus-mobile.spec.ts tests/e2e/inspiration-nexus.spec.ts --project=nexus-mobile --project=nexus-chrome --no-deps`
Expected: every case passes, or self-skips with one of the reasons written above. A skip for "migrations not applied" is acceptable only when the dev server points at a database without Tasks 1 to 3. Say so explicitly in the report.

Also check the browser console for errors on the Inspiration pages. The target is zero.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/inspiration-nexus-mobile.spec.ts tests/e2e/inspiration-nexus.spec.ts
git commit -m "test(nexus): inspiration end to end on a phone and a laptop

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: Verification and design review

**Files:** only what the review finds.

- [ ] **Step 1: Run the whole unit suite for the touched areas**

Run: `pnpm test:run apps/nexus/src/lib packages/database/src/queries/nexus apps/nexus/src/app/api/inspiration`
Expected: PASS. The guard suites must also be green: `nav-config`, `feature-flags`, `dormant-guard`, `notification-door-guard` and `full-bleed-routes`.

- [ ] **Step 2: Type-check and lint Nexus**

Run: `pnpm --filter @neram/nexus type-check` and then `pnpm --filter @neram/nexus lint`
Expected: no new errors. Paste any pre-existing ones separately in the report.

- [ ] **Step 3: Copy check.** Search the new files for forbidden dashes:

Run: `git grep -nE "—|&mdash;| -- " -- apps/nexus/src/components/inspiration apps/nexus/src/lib/inspiration-*.ts "apps/nexus/src/app/api/inspiration" "apps/nexus/src/app/(student)/student/inspiration" "apps/nexus/src/app/(teacher)/teacher/inspiration"`
Expected: no matches in user-visible strings.

- [ ] **Step 4: Design review with `ui-ux-pro-max`.** Run the skill's review on `/student/inspiration`, a student drawing page, `/student/inspiration/saved`, and `/teacher/inspiration` plus a teacher drawing page, at 375px and 1280px (dev server screenshots). Check each of these:
  - touch targets are at least 44px;
  - focus rings show on tiles, chips, the heart and the toggle;
  - contrast holds for the badge and the caption;
  - reduced motion is honoured;
  - skeletons show while loading, and there is no layout shift;
  - the empty and no-results states are right;
  - Back goes to the right place;
  - nothing scrolls sideways at 375, 768, 1024 and 1440px.

  Fix what it finds within these files, re-run Steps 1 and 2, and commit the fixes as `fix(nexus): inspiration review fixes`.

- [ ] **Step 5: Report to the user.** Include:
  - what shipped;
  - the staging backfill counts from Task 2;
  - the search spot checks from Task 3;
  - test results;
  - screenshots;
  - that both flags ship as `student.inspiration` OFF and `staff.inspiration` ON. Recommend switching `staff.inspiration` off in prod from `/teacher/admin/features` before deploying, if teachers should not see it yet.

  Say plainly that nothing was deployed and prod was not touched. Next up are the Milestone 2 and 3 plans.

