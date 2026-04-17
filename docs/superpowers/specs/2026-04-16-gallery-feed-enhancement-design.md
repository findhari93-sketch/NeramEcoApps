# Drawing Gallery Feed Enhancement: Side-by-Side Comparison + Teacher Gallery

## Context

The Drawing Gallery in Nexus (student LMS) currently shows a social feed of published student drawings with reactions and comments. However, it has two significant gaps:

1. **Teacher reference images are invisible in the gallery.** During review, teachers create corrected reference images (`corrected_image_url`) that are high-quality polished solutions. These are stored in the DB but never shown in the gallery. Students can only see them in their individual submission detail. This is a missed learning opportunity: students could study these references to improve.

2. **Teachers cannot browse the gallery.** Teachers can publish submissions to the gallery during review, but have no way to see what's published, manage it, or gauge engagement.

3. **Bug: Wrong image displayed.** The current gallery shows `reviewed_image_url` (the annotated overlay with arrows and circles) instead of the student's `original_image_url`. The overlay is feedback, not gallery material.

This enhancement transforms the gallery from a basic showcase into a learning tool with side-by-side student/teacher comparisons, and gives teachers visibility into published content.

## Scope

### In Scope
- Enhanced gallery cards with student vs teacher reference side-by-side comparison
- Mobile swipe-to-toggle for image comparison
- "Teacher Refs Only" filter toggle
- "Load More" pagination (12 per batch)
- Teacher Gallery tab in Drawing Reviews
- Fix: show `original_image_url` instead of `reviewed_image_url`

### Out of Scope
- Sorting (most recent, highest rated, most reactions): future enhancement
- Student "My Gallery" profile section: future enhancement
- Overlay/annotated image display in gallery: intentionally excluded
- Infinite scroll: explicit "Load More" chosen for mobile data efficiency

## Design

### Gallery Card Layout

Each gallery card is a smart component that adapts based on whether a teacher reference exists.

**Card with teacher reference (`corrected_image_url` present):**

```
Desktop (md+ / 900px+):
┌──────────────────────────────────────────┐
│ [Avatar] Student Name    2D Comp  ★★★★☆  │
├─────────────────┬────────────────────────┤
│  Student's      │  Teacher's             │
│  Drawing        │  Reference             │
│  (original)     │  (corrected)           │
│  [Student]      │  [✓ Teacher Ref]       │
├─────────────────┴────────────────────────┤
│ Q: 2D composition with 8 pentagons...    │
├──────────────────────────────────────────┤
│ ❤️12  👏5  🔥3  ⭐8          💬 4 comments │
└──────────────────────────────────────────┘

Mobile (< 900px):
┌────────────────────────┐
│ [Av] Name      2D ★★★★ │
├────────────────────────┤
│  ┌─[Student|Reference]─┐│
│  │                      ││
│  │  Full-width image    ││
│  │  (swipe to toggle)   ││
│  │                      ││
│  │ ← Swipe to compare → ││
│  └──────────────────────┘│
├────────────────────────┤
│ Q: 2D composition...   │
├────────────────────────┤
│ ❤️12 👏5 🔥3 ⭐8    💬4 │
└────────────────────────┘
```

**Card without teacher reference:**

Same layout on all viewports, single full-width `original_image_url`. No toggle, no comparison UI. Card adapts automatically.

### Mobile Image Toggle

Uses CSS `scroll-snap` for native-feeling swipe behavior:
- Horizontal scroll container with `scroll-snap-type: x mandatory`
- Two full-width panels: student image and teacher reference image
- Pill toggle overlay at top center ("Student | Reference") synced via `IntersectionObserver`
- Tapping a pill also scrolls to the corresponding image
- `loading="lazy"` on the reference image to save bandwidth
- Swipe hint text on first load: "Swipe to compare"

### Image Display Rules

| Field | What it is | Show in gallery? |
|-------|-----------|-----------------|
| `original_image_url` | Student's submitted drawing | Yes (always, as "Student") |
| `reviewed_image_url` | Teacher's annotated overlay (arrows, circles) | No (this is feedback, not gallery content) |
| `corrected_image_url` | Teacher's polished reference solution | Yes (when available, as "Teacher Ref") |

Fixed height container (250px desktop, 300px mobile) with `object-fit: contain` and neutral `#f5f5f5` background to handle varying aspect ratios.

### Feed Structure

**Top bar:**
- Category filter chips: All | 2D | 3D | Kit (existing)
- "Teacher Refs Only" toggle (new): compact icon toggle on mobile, Switch with label on desktop

**Feed:**
- Chronological (newest first by `reviewed_at`)
- 12 posts per batch
- "Load More" button at bottom (hidden when no more posts)
- Empty state: "No published drawings yet" (existing)

### Teacher Gallery Tab

Added as a fourth tab in the Drawing Reviews page:

```
[Pending] [Reviewed] [Completed] [Gallery]
```

When "Gallery" is selected:
- Renders the same `GalleryFeed` component with `teacherMode={true}`
- Each card shows an "Unpublish" icon button (visibility_off icon)
- Engagement stats shown prominently: total reactions, comment count
- Clicking "Unpublish" calls the existing publish API with `publish: false`, removes from feed

## Technical Design

### Database Changes

**None.** All required fields already exist on `drawing_submissions`:
- `original_image_url` (student's drawing)
- `corrected_image_url` (teacher's reference)
- `is_gallery_published` (boolean)
- `tutor_rating`, `tutor_feedback`

### DB Query Changes

**File:** `packages/database/src/queries/nexus/drawing-gallery.ts`

Modify `getGalleryFeed()`:
- Add `hasReference?: boolean` to the filters parameter
- When `hasReference` is true: `.not('corrected_image_url', 'is', null)`
- Ensure `original_image_url` and `corrected_image_url` are included in the select (they already are via `select('*')`)

### API Changes

**File:** `apps/nexus/src/app/api/drawing/gallery/route.ts`

- Parse `hasReference` from query params
- Pass to `getGalleryFeed()`
- No new endpoints needed

### New Components

**`apps/nexus/src/components/drawings/GalleryCard.tsx`**

Extracted from inline rendering in `GalleryFeed.tsx`. Props:
- `post: GalleryPost`
- `currentUserId: string`
- `onReaction: (submissionId: string, type: GalleryReactionType) => void`
- `onToggleComments: (submissionId: string) => void`
- `commentsExpanded: boolean`
- `teacherMode?: boolean`
- `onUnpublish?: (submissionId: string) => void`

**`apps/nexus/src/components/drawings/ImageCompareToggle.tsx`**

Handles responsive image display. Props:
- `originalImageUrl: string`
- `correctedImageUrl: string | null`

Logic:
- If `correctedImageUrl` is null: render single full-width image
- If `correctedImageUrl` exists:
  - Desktop (useMediaQuery md+): two images side-by-side in flex container
  - Mobile: CSS scroll-snap container with pill toggle and IntersectionObserver sync

### Modified Components

**`apps/nexus/src/components/drawings/GalleryFeed.tsx`**

- Replace inline card rendering with `<GalleryCard />`
- Add `hasReference` state and toggle UI
- Add pagination: `offset` state, `hasMore` state, "Load More" button
- Change default limit from 20 to 12
- Accept `teacherMode?: boolean` prop
- Fix image source: use `original_image_url` not `reviewed_image_url`

**`apps/nexus/src/app/(teacher)/teacher/drawing-reviews/page.tsx`**

- Add `{ value: 'gallery', label: 'Gallery' }` to status tabs
- When gallery tab active: render `<GalleryFeed teacherMode={true} />`

### Component Tree

```
GalleryFeed
├── Filter bar (category chips + hasReference toggle)
├── GalleryCard (repeated)
│   ├── Card header (avatar, name, timestamp, category, rating)
│   ├── ImageCompareToggle
│   │   ├── Desktop: side-by-side flex layout
│   │   └── Mobile: scroll-snap container + pill toggle
│   ├── Question text
│   ├── Reactions bar
│   ├── [teacherMode] Unpublish button + stats
│   └── CommentSection (expandable, existing)
└── Load More button
```

### Known Gotchas

1. **Category filtering is client-side.** The current `getGalleryFeed()` filters by category in JavaScript after fetching, because Supabase join filtering is limited. With pagination, this means a request for 12 posts may return fewer if some are filtered out. Mitigation: over-fetch (fetch 36, filter, return first 12) or accept that some pages may have fewer items. Over-fetching with a 3x multiplier is the pragmatic fix.

2. **Image aspect ratio mismatch.** Student photos (phone camera) and teacher references (AI-generated) have different aspect ratios. Fixed-height containers with `object-fit: contain` and neutral background handle this cleanly.

3. **IntersectionObserver cleanup.** The mobile scroll-snap toggle uses IntersectionObserver. Must disconnect on unmount via useEffect cleanup.

4. **Lazy loading second image.** Use `loading="lazy"` on the reference image in the scroll-snap container to avoid loading both images upfront for every card.

## Verification

### Manual Testing

1. **Student Gallery with references:**
   - Open Nexus as student at `/student/drawings`, click Gallery tab
   - Verify published posts with teacher references show side-by-side on desktop
   - Resize to mobile width: verify swipe toggle appears and works
   - Verify posts without teacher reference show single image (no toggle)
   - Click "Teacher Refs Only" toggle: verify only posts with references remain

2. **Pagination:**
   - Ensure 12 posts load initially
   - Click "Load More": verify 12 more append
   - When all posts loaded: verify "Load More" button disappears

3. **Teacher Gallery tab:**
   - Open as teacher at `/teacher/drawing-reviews`
   - Click "Gallery" tab
   - Verify published posts appear
   - Click "Unpublish" on a post: verify it's removed from feed
   - Switch to student view: verify unpublished post is gone

4. **Image correctness:**
   - For a published post that has all three images (original, reviewed, corrected)
   - Verify gallery shows `original_image_url` (student) and `corrected_image_url` (reference)
   - Verify `reviewed_image_url` (annotated overlay) is NOT shown

### Mobile Testing
- Test on 375px viewport (iPhone SE)
- Touch targets minimum 48px
- No horizontal overflow
- Swipe gesture works smoothly
- Pill toggle is responsive to taps
- Reactions bar doesn't overflow

### Cross-Browser
- Chrome, Safari, Firefox on mobile
- Verify CSS scroll-snap works on all three
