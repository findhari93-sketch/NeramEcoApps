# Foundation Checklist + Object Library — Design Spec

> **Date:** 2026-04-06 | **Scope:** Phase 4 + Phase 5 of Drawing Module
> **Platform:** nexus.neramclasses.com | **Status:** Approved

---

## Phase 4: Foundation Checklist

### What
A structured skill progression tracker for drawing foundations (Week 1-3 curriculum). 9 categories, ~60 skill items. Students self-mark progress, tutors verify.

### Database

**`drawing_checklist_items`** (seeded once, ~60 rows):
```sql
CREATE TABLE drawing_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  skill_name TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

Categories: `hand_practice`, `shapes_2d`, `color_theory`, `forms_3d`, `shading_techniques`, `textures`, `composition`, `design_principles`, `special_topics`

**`drawing_checklist_progress`** (per student):
```sql
CREATE TABLE drawing_checklist_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  checklist_item_id UUID NOT NULL REFERENCES drawing_checklist_items(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'completed')),
  student_marked_at TIMESTAMPTZ,
  tutor_verified BOOLEAN DEFAULT false,
  tutor_verified_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, checklist_item_id)
);
```

### Seed Data (9 categories, ~60 items)

| Category | Items |
|----------|-------|
| hand_practice | Straight lines (H/V/D), Curved lines and arcs, Freehand circles, Spiral drawing, Pressure control |
| shapes_2d | Circle, Square, Rectangle, Triangle, Pentagon, Hexagon, Parallelogram, Trapezoid, Semicircle, Ellipse |
| color_theory | Primary colors, Secondary colors mixing, Analogous colors, Complementary colors, Warm vs Cool, Monochromatic shading |
| forms_3d | Sphere with shading, Cube with perspective, Cylinder, Cone, Pyramid, Combined forms |
| shading_techniques | Hatching, Cross-hatching, Blending/smudging, Stippling, Light direction, Cast shadow, Reflected light |
| textures | Smooth surface (glass/metal), Rough surface (wood/stone), Organic (fruit skin), Woven/fabric, Transparent/translucent |
| composition | Rule of thirds, Overlapping objects, Size variation for depth, Negative space, Visual balance |
| design_principles | Symmetry, Emphasis, Contrast, Rhythm, Repetition, Dynamism, Movement, Flow, Balance |
| special_topics | Human figure basics, Hand drawing, Tree and nature, 1-point perspective, 2-point perspective, Lettering, Anthropometry basics |

### Student UI
- New "Foundation" tab inside drawings page (alongside All/2D/3D/Kit)
- Grouped accordion by category with overall progress bar at top
- Each item: skill name + 3-state toggle (grey=not started, yellow=in progress, green=completed)
- Tap to cycle: not_started -> in_progress -> completed -> not_started
- Tutor-verified items show a checkmark badge

### Teacher UI
- New "Skills" tab in Drawing Reviews page (alongside Pending/Reviewed/Completed)
- Class heatmap: category x students grid showing completion %
- Can verify individual student skill completions

### API Routes
- `GET /api/drawing/checklist` — get all items with student progress
- `PATCH /api/drawing/checklist/[itemId]` — toggle item status
- `GET /api/drawing/checklist/heatmap` — teacher: class-wide completion data
- `PATCH /api/drawing/checklist/[itemId]/verify` — teacher: verify student completion
- `POST /api/drawing/checklist/seed` — seed checklist items (admin only, one-time)

### Query Functions
- `getDrawingChecklistWithProgress(studentId)` — all items with student progress
- `updateDrawingChecklistProgress(studentId, itemId, status)` — toggle status
- `getDrawingChecklistHeatmap()` — class-wide completion percentages
- `verifyDrawingChecklistItem(studentId, itemId)` — teacher verify

---

## Phase 5: Object Library

### What
A standalone browseable reference library of ~70 objects organized by family, each with 3-level reference images. Students practice drawing individual objects.

### Database

**`drawing_objects`** (seeded once, ~70 rows):
```sql
CREATE TABLE drawing_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_name TEXT NOT NULL,
  family TEXT NOT NULL CHECK (family IN (
    'fruits', 'kitchen', 'travel', 'lighting', 'sports',
    'stationery', 'toiletries', 'nature', 'misc'
  )),
  reference_images JSONB NOT NULL DEFAULT '[]',
  basic_form TEXT,
  difficulty TEXT NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  tips TEXT,
  video_url TEXT,
  tags TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Seed Data (~70 objects across 8 families)
From the spec: fruits (11), kitchen (10), travel (9), lighting (7), sports (10), stationery (7), toiletries (8), nature/misc (remaining).

### Student UI
- New "Objects" tab inside drawings page
- Family filter tabs (All, Fruits, Kitchen, Travel, Lighting, Sports, Stationery, Toiletries)
- Card grid: object name, difficulty badge, basic form label
- Search bar for quick lookup
- Tap card -> expand dialog: 3-level reference image toggle, drawing tips, basic form
- "Practice This Object" -> opens submission sheet (free_practice mode)

### API Routes
- `GET /api/drawing/objects` — list with family/difficulty/search filters
- `GET /api/drawing/objects/[id]` — single object detail
- `POST /api/drawing/objects/seed` — seed objects (admin only)

### Query Functions
- `getDrawingObjects(filters?)` — list with filters
- `getDrawingObjectById(id)` — single object
- `seedDrawingObjects(objects[])` — bulk insert

---

## Implementation Summary

### Migration: `20260506_drawing_checklist_and_objects.sql`
- Create `drawing_checklist_items` + `drawing_checklist_progress` + `drawing_objects`
- Indexes, RLS policies, triggers
- Seed ~60 checklist items + ~70 objects in the same migration

### Files to create/modify (~15 files)
- 1 migration + types + queries
- 5 API routes (checklist CRUD + seed, objects list + detail + seed)
- 2 new components (ChecklistAccordion, ObjectCard)
- Modify drawings page (add Foundation + Objects tabs)
- Modify teacher drawing reviews page (add Skills heatmap tab)
