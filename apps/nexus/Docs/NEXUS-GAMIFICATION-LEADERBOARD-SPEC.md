# NEXUS GAMIFICATION & LEADERBOARD MODULE — Implementation Spec

> **Module:** Student Rewards, Badges, Leaderboards & Achievement Profiles
> **App:** Nexus PWA (nexus.neramclasses.com)
> **Stack:** Next.js 14+ App Router, Microsoft Fluent UI v9 (exclusively), Supabase (Postgres + RLS + Edge Functions), Microsoft Entra ID
> **Targets:** Mobile-first (Android PWA primary), Laptop, Large display
> **Author:** Hari, Senior UX Designer
> **Version:** 1.0 — March 2026

---

## 1. WHAT THIS MODULE DOES

This module adds a gamification layer to Nexus that rewards students for attendance, checklist completion, streaks, and assignment submissions. It includes:

- **Leaderboards** — Weekly, Monthly, and All-Time rankings scoped to batch and cross-batch
- **Badges** — Meaningful achievement badges across 4 categories with rarity tiers
- **Tappable Student Profiles** — Public achievement portfolio visible to batch-mates
- **Scoring Engine** — Composite point system with fairness normalization and tiebreakers
- **Rising Star Detection** — Automatic recognition of most-improved students

The goal is to encourage consistency and effort (not just talent) by making achievements visible and aspirational.

---

## 2. DESIGN PHILOSOPHY & AESTHETIC DIRECTION

### 2.1 Design Tone

**"Rewarding Warmth"** — Not gamified chaos like a mobile game, not sterile enterprise. Think of it as a clean, warm trophy shelf in a well-designed classroom. Celebratory but dignified. Students should feel proud, not like they're playing Candy Crush.

### 2.2 Visual Language

- **Primary palette:** Use Neram's existing design tokens — deep navy `#060d1f`, gold `#e8a020`, electric blue `#1a8fff`, warm cream `#f5f0e8`
- **Accent for gamification:** Introduce a "reward gold" gradient (`#e8a020` → `#f5c842`) for badges and rank highlights. A subtle warm glow, not flashy gaming gold
- **Badge rarity colors:**
  - Common — `#8B9DAF` (cool grey-blue)
  - Rare — `#1a8fff` (electric blue)
  - Epic — `#9B59B6` (rich purple)
  - Legendary — Gold gradient (`#e8a020` → `#f5c842`)
- **Dark theme by default** (Neram blueprint aesthetic), with `forceDark`/`forceLight` via `NeramThemeProvider`

### 2.3 Typography

Follow Neram's existing type system:
- **Display/Headings:** Cormorant Garamond (for rank numbers, badge titles, "Hall of Fame" headers)
- **Body:** DM Sans (for stats, descriptions, activity feeds)
- **Mono/Captions:** Space Mono (for point values, timestamps, streak counts)
- **Tamil support:** Noto Sans Tamil (if any bilingual badge descriptions needed)

### 2.4 Motion & Micro-interactions

- **Badge earned animation:** Scale-up with a soft gold particle burst (CSS keyframes, no heavy libraries). Badge icon scales from 0 → 1.1 → 1.0 with opacity fade-in. Gold radial glow pulses once behind the badge
- **Rank change indicator:** Smooth number counter animation when rank updates. Green arrow ↑ slides in for rank improvement, red arrow ↓ for drops
- **Leaderboard row tap:** Row expands slightly with a subtle elevation increase (Fluent UI shadow tokens) before navigating to profile
- **Streak flame:** CSS animated flame icon next to streak count — gentle flicker using `@keyframes` (2-3 frame loop, subtle, not distracting)
- **New badge unlock toast:** Slides in from bottom with the badge icon, name, and rarity glow. Auto-dismisses after 4 seconds. Tappable to view badge detail
- **Keep all animations under 300ms** for interactions, 500ms for celebratory reveals. Use `prefers-reduced-motion` media query to disable animations for accessibility

### 2.5 Responsive Breakpoints

| Breakpoint | Target | Layout Behavior |
|---|---|---|
| `< 480px` | Mobile (Android PWA) | Single column, bottom tab navigation, stacked cards |
| `480px – 768px` | Large phones / small tablets | Single column with wider cards |
| `768px – 1024px` | Tablets | Two-column layout for leaderboard + profile side panel |
| `> 1024px` | Laptop / Desktop | Three-column: nav + leaderboard + profile detail panel |
| `> 1440px` | Large displays (classroom projection) | Dashboard view with leaderboard + top achievers cards + live stats |

**Mobile-first implementation** — start with the single-column mobile layout and progressively enhance.

---

## 3. SCORING ENGINE

### 3.1 Point Values

| Action | Points | Notes |
|---|---|---|
| Class attended | 10 | Per session attended |
| Checklist item completed | 5 | Per individual item |
| Full checklist completed (all items) | 15 bonus | On top of individual item points |
| Drawing assignment submitted | 20 | Higher because drawings take more effort |
| Drawing assignment reviewed by teacher | 5 bonus | Encourages seeking feedback |
| Streak day maintained | 3 | Per consecutive day of activity |
| Streak milestone (7 days) | 25 bonus | One-time bonus at 7-day mark |
| Streak milestone (30 days) | 100 bonus | One-time bonus at 30-day mark |
| Streak milestone (90 days) | 300 bonus | One-time bonus at 90-day mark |
| Quiz/test completed | 10 | Participation credit, not score-based |
| Peer activity (helping classmate) | 5 | Teacher-awarded manual points |

### 3.2 Weekly Score Calculation

```
weekly_score = SUM(points earned this week)
```

But for **cross-batch fairness**, normalize by opportunity:

```
normalized_score = (actual_points / max_possible_points_this_week) × 1000
```

Where `max_possible_points_this_week` = total points a student COULD have earned if they attended every class, completed every checklist, submitted every assignment, etc. in their specific batch.

This means a student in a batch with 3 classes/week and a student in a batch with 5 classes/week are compared fairly on a 0-1000 scale.

**Within-batch leaderboards** use raw `weekly_score` (since all students in a batch have the same opportunities).

**Cross-batch (All Neram) leaderboards** use `normalized_score`.

### 3.3 Tiebreaker Cascade

When two students have the same score:

1. **Longer active streak** wins (consistency is harder than bursts)
2. **Higher attendance percentage** wins (if streaks are equal)
3. **Earlier achievement timestamp** wins (whoever hit the score first in the week)
4. **Alphabetical by name** — absolute last resort, should almost never reach here

### 3.4 Rising Star Detection

Run a Supabase Edge Function every Sunday night:

```
improvement = current_week_rank - previous_week_rank
```

If `improvement >= 10` (jumped 10+ ranks), flag as "Rising Star" for the next week. Show a ⭐ badge next to their name on the leaderboard.

Also detect: If a student's attendance went from `< 60%` to `> 85%` in consecutive weeks → flag as "Comeback Kid" for the next week.

---

## 4. BADGE SYSTEM

### 4.1 Badge Rarity Tiers

| Tier | Color | Difficulty | Examples |
|---|---|---|---|
| **Common** | Grey-blue `#8B9DAF` | Achievable in 1-2 weeks | First attendance, first checklist |
| **Rare** | Electric blue `#1a8fff` | Achievable in 1-2 months | 30-day streak, 90%+ monthly attendance |
| **Epic** | Purple `#9B59B6` | Achievable in 3-6 months | 100 checklists completed, 90-day streak |
| **Legendary** | Gold gradient | Requires 6+ months of sustained effort | 6-month consistency, Hall of Famer |

### 4.2 Badge Catalog

#### Attendance & Consistency

| Badge Name | Tier | Criteria | Icon Concept |
|---|---|---|---|
| **First Step** | Common | Attended first class on Nexus | Footprint icon |
| **Early Bird** | Common | Joined 3 classes before scheduled start time in a week | Sunrise icon |
| **Never Miss** | Rare | 95%+ attendance in a calendar month | Shield with checkmark |
| **Iron Streak** | Rare | 30-day unbroken attendance streak | Flame with "30" |
| **The Foundation** | Rare | Completed first 30 days with 90%+ attendance | Building foundation icon |
| **Unbreakable** | Epic | 90-day unbroken attendance streak | Chain link icon |
| **The Constant** | Legendary | 3 consecutive months at 90%+ attendance | Diamond icon |

#### Task & Checklist Completion

| Badge Name | Tier | Criteria | Icon Concept |
|---|---|---|---|
| **Task Starter** | Common | Completed first checklist item | Checkbox icon |
| **All Clear** | Common | Completed every checklist item in a single week | Broom/sweep icon |
| **Checklist Champion** | Rare | Highest task completion rate in the batch for a month | Trophy with checklist |
| **Sketch Master** | Rare | Completed all drawing assignments in a month | Pencil with star |
| **Century Club** | Epic | 100 checklist items completed lifetime | "100" with laurel wreath |
| **Completionist** | Legendary | 500 checklist items completed lifetime | Crown icon |

#### Growth & Improvement

| Badge Name | Tier | Criteria | Icon Concept |
|---|---|---|---|
| **Rising Star** | Common | Improved rank by 10+ positions in one week | Star with upward arrow |
| **Comeback Kid** | Rare | Went from <60% to >85% attendance in consecutive weeks | Phoenix icon |
| **Level Up** | Rare | Moved up 10+ ranks in monthly leaderboard | Staircase with arrow |
| **Most Improved** | Epic | Largest positive rank change in the batch over a quarter | Rocket icon |

#### Leaderboard & Competition

| Badge Name | Tier | Criteria | Icon Concept |
|---|---|---|---|
| **On the Board** | Common | Appeared in top 15 of weekly leaderboard for the first time | Podium icon |
| **Weekly Warrior** | Rare | Finished in top 5 of weekly leaderboard 4 times in a month | Sword with calendar |
| **Podium Finish** | Rare | Finished rank 1, 2, or 3 in monthly leaderboard | Medal icon |
| **Hall of Famer** | Legendary | 6+ months of consistent top-10 monthly finishes | Pillar/column icon |
| **Batch Topper** | Epic | Rank 1 in monthly leaderboard | Gold crown icon |

### 4.3 Badge Award Rules

- Badges are awarded **automatically** by a Supabase Edge Function that runs nightly (for daily checks like streaks) and weekly (for leaderboard-based badges)
- Teacher can also award **manual badges** (like "Peer Helper" for students who help classmates)
- Each badge is earned only once (no duplicates), except "Weekly Warrior" which tracks count
- When a badge is earned, insert into `student_badges` table and trigger a push notification / in-app toast
- Unearned badges show as **greyed-out silhouettes** with a description of how to earn them — this is crucial for discoverability

### 4.4 Badge Visual Design Specs

Each badge should be designed as a **48×48px icon** (with @2x and @3x variants for retina) inside a shaped container:

- **Common:** Circle container, flat grey-blue background
- **Rare:** Circle container, subtle blue gradient background, thin glow border
- **Epic:** Hexagon container, purple gradient background, medium glow border
- **Legendary:** Hexagon container, gold gradient background, animated shimmer border (CSS `@keyframes shimmer`)

SVG format preferred for scalability. Store badge assets in `/public/badges/` directory. Each badge has:
- `badge_id` (e.g., `iron_streak`)
- `icon_svg` filename
- `icon_locked_svg` filename (greyed-out version)
- `rarity_tier` enum
- `display_name`
- `description`
- `criteria_description` (human-readable, shown on locked badges)

---

## 5. LEADERBOARD UI COMPONENTS

### 5.1 Leaderboard Page — Layout

**Mobile (< 768px):**

```
┌─────────────────────────────────┐
│  ← Leaderboard          [filter]│  ← Header with batch filter
├─────────────────────────────────┤
│  [Weekly] [Monthly] [All-Time]  │  ← Tab bar (Fluent UI TabList)
├─────────────────────────────────┤
│  🏆  #1  ┌──────────────────┐  │
│          │ 📷 Name          │  │  ← Top 3 get highlighted cards
│          │ Batch A · 🔥 45  │  │     with gold/silver/bronze accent
│          │ 892 pts  ⭐⭐⭐   │  │     Show top 2-3 badge icons
│          └──────────────────┘  │
│  🥈 #2  ┌──────────────────┐  │
│          │ 📷 Name          │  │
│          │ Batch B · 🔥 38  │  │
│          │ 845 pts  ⭐⭐     │  │
│          └──────────────────┘  │
│  🥉 #3  ...                    │
├─────────────────────────────────┤
│  #4  📷 Name    780 pts  🔥32  │  ← Regular rows (compact list)
│  #5  📷 Name    756 pts  🔥28  │
│  #6  📷 Name    721 pts  🔥25  │
│  ...                            │
├─────────────────────────────────┤
│  ─ ─ ─ YOUR RANK ─ ─ ─ ─ ─ ─  │  ← Sticky "Your rank" section
│  #14 📷 You     534 pts  🔥12  │     Always visible, highlighted
│       ↑3 from last week        │     with rank change indicator
└─────────────────────────────────┘
```

**Tablet (768px – 1024px):**

```
┌──────────────────────┬──────────────────┐
│   LEADERBOARD        │  STUDENT PROFILE │
│                      │  (shows when a   │
│   [Weekly][Monthly]  │   row is tapped) │
│   [All-Time]         │                  │
│                      │  📷 Name         │
│   #1 📷 Name  892pts│  Batch A         │
│   #2 📷 Name  845pts│  🔥 45-day streak│
│   #3 📷 Name  780pts│                  │
│   #4 📷 Name  756pts│  [Badges Grid]   │
│   ...                │  [Activity Feed] │
│                      │  [Monthly Stats] │
│   ── YOUR RANK ──    │                  │
│   #14 📷 You  534pts│                  │
└──────────────────────┴──────────────────┘
```

**Desktop/Laptop (> 1024px):**

```
┌────────┬────────────────────────┬───────────────────────────┐
│  NAV   │   LEADERBOARD          │   STUDENT PROFILE DETAIL  │
│        │                        │                           │
│  Home  │   [Weekly][Mo][All]    │   📷 Student Name         │
│  LB ●  │   [Batch ▾][All Neram] │   JEE 2026 — Batch A     │
│  Tasks │                        │   Rank #4 · 🔥 45 streak │
│  Draw  │   🏆 Top 3 podium     │                           │
│  Prof  │   cards (horizontal)   │   ┌─────────────────────┐ │
│        │                        │   │  BADGES  (12 earned) │ │
│        │   #4  Name   756 pts   │   │  🏅🏅🏅🏅🏅🏅        │ │
│        │   #5  Name   721 pts   │   │  🏅🏅🏅🏅🏅🏅        │ │
│        │   #6  Name   698 pts   │   │  [+3 locked badges]  │ │
│        │   ...                  │   └─────────────────────┘ │
│        │                        │   ┌─────────────────────┐ │
│        │   ── YOUR RANK ──      │   │  RECENT ACTIVITY     │ │
│        │   #14  You    534 pts  │   │  • Completed checklist│ │
│        │                        │   │  • Earned badge       │ │
│        │                        │   │  • 45-day streak!     │ │
│        │                        │   └─────────────────────┘ │
│        │                        │   ┌─────────────────────┐ │
│        │                        │   │  THIS MONTH          │ │
│        │                        │   │  ▓▓▓▓▓▓░▓▓▓▓▓▓░▓▓▓▓│ │
│        │                        │   │  Attendance heatmap   │ │
│        │                        │   └─────────────────────┘ │
└────────┴────────────────────────┴───────────────────────────┘
```

### 5.2 Leaderboard Row Component

**Fluent UI components to use:**
- `Avatar` (size 32 for list rows, size 56 for top 3 cards)
- `Badge` (Fluent UI CounterBadge for rank number)
- `Card` (for top 3 highlighted entries)
- `Text` (with weight/size variants for name, points, batch)
- `Tooltip` (on badge icons to show badge name on hover/long-press)

**Row structure (Fluent UI):**

```tsx
// PSEUDOCODE — Fluent UI v9 component structure
<div className="leaderboard-row" onClick={() => openProfile(student.id)}>
  <Text className="rank-number" weight="bold" font="monospace">
    #{rank}
  </Text>
  <Avatar
    image={{ src: student.profilePhotoUrl }}
    name={student.name}
    size={32}
    badge={student.isRisingStar ? { status: "available", icon: <StarIcon /> } : undefined}
  />
  <div className="row-info">
    <Text weight="semibold" size={300}>{student.name}</Text>
    <Text size={200} className="batch-label">{student.batchName}</Text>
  </div>
  <div className="row-stats">
    <Text font="monospace" weight="bold">{student.weeklyScore} pts</Text>
    <div className="streak-badge">
      <FlameIcon className="flame-animated" />
      <Text size={100}>{student.streakDays}</Text>
    </div>
  </div>
  <div className="row-badges">
    {student.topBadges.slice(0, 3).map(badge => (
      <Tooltip content={badge.name} key={badge.id}>
        <img src={badge.iconSvg} width={20} height={20} />
      </Tooltip>
    ))}
  </div>
  {student.rankChange !== 0 && (
    <div className={`rank-change ${student.rankChange > 0 ? 'up' : 'down'}`}>
      {student.rankChange > 0 ? '↑' : '↓'}{Math.abs(student.rankChange)}
    </div>
  )}
</div>
```

### 5.3 Leaderboard Filters

**Batch filter:** Dropdown (Fluent UI `Dropdown`) listing all active batches + "All Neram" option. Default = student's own batch.

**Time filter:** `TabList` with three tabs — Weekly (default), Monthly, All-Time.

**When "All Neram" + Weekly is selected:** Use `normalized_score` instead of raw `weekly_score`. Show batch label prominently on each row.

### 5.4 "Your Rank" Sticky Section

Always visible at the bottom of the leaderboard (on mobile) or in a highlighted row (on desktop). Shows:
- Current rank with rank change arrow
- Score and streak
- If the student is NOT in the top 15, there should be a visual separator ("...") between the visible list and "Your Rank" to make it clear they're not adjacent

**Important:** Never show a student's rank if they're below position 15 in a way that feels demoralizing. Instead, show: "You're #23 — 67 points to reach Top 15! 💪" — framing it as a goal, not a failure.

---

## 6. TAPPABLE STUDENT ACHIEVEMENT PROFILE

### 6.1 What Happens When You Tap a Leaderboard Row

**Mobile:** Full-screen slide-in from right (Next.js page transition or Fluent UI `Drawer` component).

**Tablet:** Side panel opens on the right (Fluent UI `DrawerBody` with `position="end"`).

**Desktop:** Right column updates with the selected student's profile (no navigation, just content swap).

### 6.2 Profile Layout

```
┌──────────────────────────────────────┐
│  ← Back                              │
│                                       │
│         ┌──────┐                      │
│         │  📷  │  ← Profile photo     │
│         │      │    (Avatar size 96)  │
│         └──────┘                      │
│      Student Name                     │  ← Cormorant Garamond, large
│      JEE 2026 — Batch A              │  ← DM Sans, muted color
│      Rank #4 this week               │  ← With gold/blue accent
│                                       │
│  ┌──────┬──────┬──────┬──────┐       │
│  │  🔥  │  📊  │  ✅  │  🏅  │       │  ← Stats row
│  │  45  │ 94%  │ 127  │  12  │       │     streak, attend%,
│  │ days │ att. │tasks │badge │       │     checklists, badges
│  └──────┴──────┴──────┴──────┘       │
│                                       │
│  ┌───────────────────────────────┐   │
│  │  🏅 BADGES                    │   │
│  │                               │   │
│  │  ⬡🥇 ⬡🥈 ⬡🥉 ●🏅 ●🏅 ●🏅  │   │  ← Earned badges (full color)
│  │  ●🏅 ●🏅 ●🏅 ●🏅 ●🏅 ●🏅  │   │
│  │                               │   │
│  │  ○ ○ ○ ○ ○                    │   │  ← Locked badges (greyed out)
│  │  Tap to see what you can earn │   │     with silhouette
│  └───────────────────────────────┘   │
│                                       │
│  ┌───────────────────────────────┐   │
│  │  📋 RECENT ACTIVITY           │   │
│  │                               │   │
│  │  Today                        │   │
│  │  ✅ Completed "Perspective     │   │
│  │     Drawing" checklist         │   │
│  │  🔥 Maintained 45-day streak  │   │
│  │                               │   │
│  │  Yesterday                    │   │
│  │  🏅 Earned "Iron Streak"      │   │
│  │     badge (Rare)              │   │
│  │  ✅ Completed 3 checklist     │   │
│  │     items                     │   │
│  │                               │   │
│  │  Mar 23                       │   │
│  │  📐 Submitted drawing:        │   │
│  │     "Isometric Room"          │   │
│  └───────────────────────────────┘   │
│                                       │
│  ┌───────────────────────────────┐   │
│  │  📅 THIS MONTH's ATTENDANCE   │   │
│  │                               │   │
│  │  M  T  W  T  F  S  S         │   │
│  │  ▓  ▓  ▓  ▓  ▓  ░  ░         │   │  ← Heatmap grid
│  │  ▓  ▓  ▓  ░  ▓  ░  ░         │   │     ▓ = attended (green)
│  │  ▓  ▓  ▓  ▓  ▓  ░  ░         │   │     ░ = no class / missed
│  │  ▓  ▓  ▓  ▓  ·  ·  ·         │   │     · = future
│  │                               │   │
│  │  22/23 classes attended (96%) │   │
│  └───────────────────────────────┘   │
│                                       │
└──────────────────────────────────────┘
```

### 6.3 Privacy Rules — Public vs Private

| Data | Visible to batch-mates | Visible to teachers |
|---|---|---|
| Profile photo | ✅ | ✅ |
| Name | ✅ | ✅ |
| Batch name | ✅ | ✅ |
| Current rank | ✅ | ✅ |
| Streak count | ✅ | ✅ |
| Attendance % | ✅ | ✅ |
| Total checklists completed | ✅ | ✅ |
| Badges earned | ✅ | ✅ |
| Recent activity feed | ✅ | ✅ |
| Monthly attendance heatmap | ✅ | ✅ |
| Actual test/quiz scores | ❌ | ✅ |
| Teacher feedback/notes | ❌ | ✅ |
| Detailed performance analytics | ❌ | ✅ |
| Rank among bottom 50% (exact number) | ❌ (show "Keep going!") | ✅ |
| Points breakdown per action | ❌ | ✅ |

### 6.4 "View My Profile" — Self-View

Students can view their own profile via:
- Tapping their own row in the leaderboard
- A "My Achievements" link in the Nexus sidebar/bottom nav

Self-view shows everything the public sees PLUS:
- Points breakdown (where their points came from this week)
- A "Next badge" section showing the closest badge they can earn with progress bar
- Personal rank history chart (last 8 weeks trend line)

---

## 7. DASHBOARD INTEGRATION — "Hall of Fame" Widget

On the Nexus home dashboard, show a compact widget:

```
┌─────────────────────────────────────┐
│  🏆 THIS WEEK'S TOP PERFORMERS     │
│                                      │
│  #1 📷 Name  892pts  🔥45  🏅🏅🏅  │
│  #2 📷 Name  845pts  🔥38  🏅🏅    │
│  #3 📷 Name  780pts  🔥25  🏅      │
│                                      │
│  Your rank: #14 (↑3)  [View All →]  │
└─────────────────────────────────────┘
```

Also show a "Recently Earned Badges" feed:
```
┌─────────────────────────────────────┐
│  🏅 BADGE FEED                      │
│                                      │
│  📷 Ravi earned "Iron Streak" 🔥    │
│  📷 Priya earned "All Clear" ✅      │
│  📷 Karthik earned "Never Miss" 🛡  │
│                                      │
│  [View All Badges →]                 │
└─────────────────────────────────────┘
```

This badge feed creates social proof — students see their peers earning badges and want to earn their own.

---

## 8. SUPABASE DATABASE SCHEMA

### 8.1 Tables

```sql
-- ============================================
-- BADGE DEFINITIONS (admin-managed catalog)
-- ============================================
CREATE TABLE badge_definitions (
  id TEXT PRIMARY KEY,                    -- e.g., 'iron_streak'
  display_name TEXT NOT NULL,             -- e.g., 'Iron Streak'
  description TEXT NOT NULL,              -- e.g., '30-day unbroken attendance streak'
  criteria_description TEXT NOT NULL,     -- Human-readable, shown on locked badges
  category TEXT NOT NULL CHECK (category IN (
    'attendance', 'checklist', 'growth', 'leaderboard'
  )),
  rarity_tier TEXT NOT NULL CHECK (rarity_tier IN (
    'common', 'rare', 'epic', 'legendary'
  )),
  icon_svg_path TEXT NOT NULL,            -- e.g., '/badges/iron_streak.svg'
  icon_locked_svg_path TEXT NOT NULL,     -- e.g., '/badges/iron_streak_locked.svg'
  points_bonus INTEGER DEFAULT 0,        -- Bonus points awarded when badge is earned
  sort_order INTEGER DEFAULT 0,          -- For display ordering within category
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- STUDENT BADGES (earned badges per student)
-- ============================================
CREATE TABLE student_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id TEXT NOT NULL REFERENCES badge_definitions(id),
  earned_at TIMESTAMPTZ DEFAULT now(),
  earned_context JSONB,                   -- Optional: { "streak_length": 30, "week": "2026-W13" }
  notified BOOLEAN DEFAULT false,         -- Has the student been notified?
  UNIQUE(student_id, badge_id)            -- Each badge earned only once
);

-- ============================================
-- POINT EVENTS (every point-earning action)
-- ============================================
CREATE TABLE point_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL,                 -- FK to batches table
  event_type TEXT NOT NULL CHECK (event_type IN (
    'class_attended', 'checklist_item_completed', 'full_checklist_completed',
    'drawing_submitted', 'drawing_reviewed', 'streak_day', 'streak_milestone',
    'quiz_completed', 'peer_help', 'badge_bonus', 'manual_teacher_award'
  )),
  points INTEGER NOT NULL,
  metadata JSONB,                         -- e.g., { "checklist_id": "...", "item_id": "..." }
  event_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for fast leaderboard queries
CREATE INDEX idx_point_events_student_date ON point_events(student_id, event_date);
CREATE INDEX idx_point_events_batch_date ON point_events(batch_id, event_date);
CREATE INDEX idx_point_events_date ON point_events(event_date);

-- ============================================
-- WEEKLY LEADERBOARD SNAPSHOTS (computed weekly)
-- ============================================
CREATE TABLE weekly_leaderboard (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL,
  week_start DATE NOT NULL,               -- Monday of the week
  raw_score INTEGER NOT NULL DEFAULT 0,
  normalized_score NUMERIC(7,2) DEFAULT 0, -- 0-1000 scale for cross-batch
  max_possible_score INTEGER NOT NULL DEFAULT 0,
  rank_in_batch INTEGER,
  rank_all_neram INTEGER,
  streak_length INTEGER DEFAULT 0,
  attendance_pct NUMERIC(5,2) DEFAULT 0,
  rank_change INTEGER DEFAULT 0,          -- vs previous week (positive = improved)
  is_rising_star BOOLEAN DEFAULT false,
  is_comeback_kid BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, week_start)
);

CREATE INDEX idx_weekly_lb_batch_week ON weekly_leaderboard(batch_id, week_start);
CREATE INDEX idx_weekly_lb_week_rank ON weekly_leaderboard(week_start, rank_in_batch);

-- ============================================
-- MONTHLY LEADERBOARD SNAPSHOTS (computed monthly)
-- ============================================
CREATE TABLE monthly_leaderboard (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL,
  month_start DATE NOT NULL,              -- 1st of the month
  raw_score INTEGER NOT NULL DEFAULT 0,
  normalized_score NUMERIC(7,2) DEFAULT 0,
  rank_in_batch INTEGER,
  rank_all_neram INTEGER,
  streak_length INTEGER DEFAULT 0,
  attendance_pct NUMERIC(5,2) DEFAULT 0,
  badges_earned_this_month INTEGER DEFAULT 0,
  rank_change INTEGER DEFAULT 0,          -- vs previous month
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, month_start)
);

-- ============================================
-- STUDENT ACTIVITY LOG (for the "Recent Activity" feed)
-- ============================================
CREATE TABLE student_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'class_attended', 'checklist_completed', 'checklist_item_completed',
    'drawing_submitted', 'badge_earned', 'streak_milestone',
    'rank_achieved', 'quiz_completed'
  )),
  title TEXT NOT NULL,                    -- e.g., 'Completed "Perspective Drawing" checklist'
  metadata JSONB,                         -- Additional context
  activity_date TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_activity_student_date ON student_activity_log(student_id, activity_date DESC);

-- ============================================
-- STUDENT STREAKS (current streak tracking)
-- ============================================
CREATE TABLE student_streaks (
  student_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  last_active_date DATE,
  streak_started_date DATE,
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 8.2 Row-Level Security (RLS)

```sql
-- Students can read leaderboard data for their own batch + all-neram
ALTER TABLE weekly_leaderboard ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Students can view weekly leaderboard"
  ON weekly_leaderboard FOR SELECT
  USING (true);  -- Leaderboards are public to all authenticated users

-- Students can only see their own point events
ALTER TABLE point_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Students see own points"
  ON point_events FOR SELECT
  USING (auth.uid() = student_id);

-- Teachers can see all point events in their batches
CREATE POLICY "Teachers see batch points"
  ON point_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM batch_teachers
      WHERE batch_teachers.batch_id = point_events.batch_id
      AND batch_teachers.teacher_id = auth.uid()
    )
  );

-- Student badges are publicly viewable (for profile)
ALTER TABLE student_badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Badges are public"
  ON student_badges FOR SELECT
  USING (true);

-- Activity log: students see their own + batch-mates' public activities
ALTER TABLE student_activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Activity log visible to authenticated users"
  ON student_activity_log FOR SELECT
  USING (true);  -- Public feed

-- Badge definitions are public
ALTER TABLE badge_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Badge catalog is public"
  ON badge_definitions FOR SELECT
  USING (true);

-- Streaks are publicly viewable
ALTER TABLE student_streaks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Streaks are public"
  ON student_streaks FOR SELECT
  USING (true);
```

### 8.3 Key Database Functions

```sql
-- ============================================
-- FUNCTION: Calculate weekly leaderboard
-- Run via pg_cron every Sunday 11:59 PM IST
-- ============================================
CREATE OR REPLACE FUNCTION compute_weekly_leaderboard(target_week_start DATE)
RETURNS void AS $$
DECLARE
  batch_rec RECORD;
BEGIN
  -- For each batch, compute scores
  FOR batch_rec IN SELECT DISTINCT batch_id FROM point_events
    WHERE event_date BETWEEN target_week_start AND target_week_start + INTERVAL '6 days'
  LOOP
    -- Insert/update weekly scores per student in this batch
    INSERT INTO weekly_leaderboard (student_id, batch_id, week_start, raw_score, max_possible_score, streak_length, attendance_pct)
    SELECT
      pe.student_id,
      pe.batch_id,
      target_week_start,
      COALESCE(SUM(pe.points), 0) as raw_score,
      -- max_possible_score calculated from batch schedule
      (SELECT calculate_max_weekly_points(pe.batch_id, target_week_start)),
      COALESCE(ss.current_streak, 0),
      -- attendance_pct from attendance records
      COALESCE(
        (SELECT COUNT(*) FILTER (WHERE attended = true)::NUMERIC / NULLIF(COUNT(*), 0) * 100
         FROM attendance_records ar
         WHERE ar.student_id = pe.student_id
         AND ar.attendance_date BETWEEN target_week_start AND target_week_start + INTERVAL '6 days'),
        0
      )
    FROM point_events pe
    LEFT JOIN student_streaks ss ON ss.student_id = pe.student_id
    WHERE pe.batch_id = batch_rec.batch_id
    AND pe.event_date BETWEEN target_week_start AND target_week_start + INTERVAL '6 days'
    GROUP BY pe.student_id, pe.batch_id, ss.current_streak
    ON CONFLICT (student_id, week_start) DO UPDATE SET
      raw_score = EXCLUDED.raw_score,
      max_possible_score = EXCLUDED.max_possible_score,
      streak_length = EXCLUDED.streak_length,
      attendance_pct = EXCLUDED.attendance_pct;

    -- Calculate normalized scores
    UPDATE weekly_leaderboard
    SET normalized_score = CASE
      WHEN max_possible_score > 0
      THEN (raw_score::NUMERIC / max_possible_score) * 1000
      ELSE 0
    END
    WHERE batch_id = batch_rec.batch_id AND week_start = target_week_start;

    -- Rank within batch (using tiebreaker cascade)
    WITH ranked AS (
      SELECT id,
        ROW_NUMBER() OVER (
          ORDER BY raw_score DESC,
                   streak_length DESC,
                   attendance_pct DESC,
                   created_at ASC  -- earlier achiever wins
        ) as batch_rank
      FROM weekly_leaderboard
      WHERE batch_id = batch_rec.batch_id AND week_start = target_week_start
    )
    UPDATE weekly_leaderboard wl
    SET rank_in_batch = ranked.batch_rank
    FROM ranked WHERE wl.id = ranked.id;
  END LOOP;

  -- Rank across all Neram (using normalized scores)
  WITH all_ranked AS (
    SELECT id,
      ROW_NUMBER() OVER (
        ORDER BY normalized_score DESC,
                 streak_length DESC,
                 attendance_pct DESC,
                 created_at ASC
      ) as neram_rank
    FROM weekly_leaderboard
    WHERE week_start = target_week_start
  )
  UPDATE weekly_leaderboard wl
  SET rank_all_neram = all_ranked.neram_rank
  FROM all_ranked WHERE wl.id = all_ranked.id;

  -- Calculate rank changes from previous week
  UPDATE weekly_leaderboard curr
  SET rank_change = prev.rank_in_batch - curr.rank_in_batch  -- positive = improved
  FROM weekly_leaderboard prev
  WHERE curr.student_id = prev.student_id
  AND curr.week_start = target_week_start
  AND prev.week_start = target_week_start - INTERVAL '7 days';

  -- Detect Rising Stars (improved 10+ ranks)
  UPDATE weekly_leaderboard
  SET is_rising_star = true
  WHERE week_start = target_week_start
  AND rank_change >= 10;

  -- Detect Comeback Kids (attendance jumped from <60% to >85%)
  UPDATE weekly_leaderboard curr
  SET is_comeback_kid = true
  FROM weekly_leaderboard prev
  WHERE curr.student_id = prev.student_id
  AND curr.week_start = target_week_start
  AND prev.week_start = target_week_start - INTERVAL '7 days'
  AND prev.attendance_pct < 60
  AND curr.attendance_pct > 85;

END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FUNCTION: Check and award badges (nightly)
-- ============================================
CREATE OR REPLACE FUNCTION check_and_award_badges()
RETURNS void AS $$
DECLARE
  student_rec RECORD;
BEGIN
  FOR student_rec IN SELECT * FROM student_streaks
  LOOP
    -- Iron Streak: 30-day streak
    IF student_rec.current_streak >= 30 THEN
      INSERT INTO student_badges (student_id, badge_id, earned_context)
      VALUES (student_rec.student_id, 'iron_streak', jsonb_build_object('streak_length', student_rec.current_streak))
      ON CONFLICT (student_id, badge_id) DO NOTHING;
    END IF;

    -- Unbreakable: 90-day streak
    IF student_rec.current_streak >= 90 THEN
      INSERT INTO student_badges (student_id, badge_id, earned_context)
      VALUES (student_rec.student_id, 'unbreakable', jsonb_build_object('streak_length', student_rec.current_streak))
      ON CONFLICT (student_id, badge_id) DO NOTHING;
    END IF;

    -- Add more badge checks here following the same pattern...
  END LOOP;

  -- Never Miss: 95%+ attendance in current month
  INSERT INTO student_badges (student_id, badge_id, earned_context)
  SELECT
    ar.student_id,
    'never_miss',
    jsonb_build_object('month', DATE_TRUNC('month', CURRENT_DATE), 'attendance_pct', pct)
  FROM (
    SELECT student_id,
      COUNT(*) FILTER (WHERE attended = true)::NUMERIC / NULLIF(COUNT(*), 0) * 100 as pct
    FROM attendance_records
    WHERE attendance_date >= DATE_TRUNC('month', CURRENT_DATE)
    GROUP BY student_id
    HAVING COUNT(*) >= 10  -- Minimum 10 class days to qualify
  ) ar
  WHERE ar.pct >= 95
  ON CONFLICT (student_id, badge_id) DO NOTHING;

  -- Century Club: 100 checklist items completed
  INSERT INTO student_badges (student_id, badge_id, earned_context)
  SELECT
    student_id,
    'century_club',
    jsonb_build_object('total_items', cnt)
  FROM (
    SELECT student_id, COUNT(*) as cnt
    FROM point_events
    WHERE event_type = 'checklist_item_completed'
    GROUP BY student_id
    HAVING COUNT(*) >= 100
  ) sub
  ON CONFLICT (student_id, badge_id) DO NOTHING;

END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FUNCTION: Update streak on daily activity
-- Called when a student performs any activity
-- ============================================
CREATE OR REPLACE FUNCTION update_student_streak(p_student_id UUID)
RETURNS void AS $$
DECLARE
  last_date DATE;
  curr_streak INTEGER;
BEGIN
  SELECT last_active_date, current_streak
  INTO last_date, curr_streak
  FROM student_streaks
  WHERE student_id = p_student_id;

  IF NOT FOUND THEN
    -- First ever activity
    INSERT INTO student_streaks (student_id, current_streak, longest_streak, last_active_date, streak_started_date)
    VALUES (p_student_id, 1, 1, CURRENT_DATE, CURRENT_DATE);
    RETURN;
  END IF;

  IF last_date = CURRENT_DATE THEN
    -- Already logged today, no change
    RETURN;
  ELSIF last_date = CURRENT_DATE - INTERVAL '1 day' THEN
    -- Consecutive day — extend streak
    UPDATE student_streaks
    SET current_streak = current_streak + 1,
        longest_streak = GREATEST(longest_streak, current_streak + 1),
        last_active_date = CURRENT_DATE,
        updated_at = now()
    WHERE student_id = p_student_id;
  ELSE
    -- Streak broken — reset
    UPDATE student_streaks
    SET current_streak = 1,
        last_active_date = CURRENT_DATE,
        streak_started_date = CURRENT_DATE,
        updated_at = now()
    WHERE student_id = p_student_id;
  END IF;
END;
$$ LANGUAGE plpgsql;
```

### 8.4 Scheduled Jobs (pg_cron)

```sql
-- Nightly: Check and award badges at 11:30 PM IST
SELECT cron.schedule('award-badges-nightly', '0 18 * * *', 'SELECT check_and_award_badges()');
-- Note: 18:00 UTC = 11:30 PM IST

-- Weekly: Compute weekly leaderboard every Sunday 11:59 PM IST
SELECT cron.schedule('weekly-leaderboard', '29 18 * * 0', $$SELECT compute_weekly_leaderboard(DATE_TRUNC('week', CURRENT_DATE)::DATE)$$);

-- Monthly: Compute monthly leaderboard on 1st of each month at midnight IST
SELECT cron.schedule('monthly-leaderboard', '30 18 1 * *', $$SELECT compute_monthly_leaderboard(DATE_TRUNC('month', CURRENT_DATE)::DATE)$$);
```

---

## 9. API ENDPOINTS (Next.js API Routes)

```
GET  /api/leaderboard/weekly?batch_id=xxx&week=2026-W13
GET  /api/leaderboard/monthly?batch_id=xxx&month=2026-03
GET  /api/leaderboard/alltime?batch_id=xxx
GET  /api/leaderboard/all-neram?period=weekly&week=2026-W13

GET  /api/profile/:studentId/achievements
     → Returns: badges, stats, activity feed, attendance heatmap

GET  /api/profile/me/achievements
     → Returns: same as above + points breakdown + next badge progress + rank history

GET  /api/badges/catalog
     → Returns: all badge definitions with earned/locked status for current user

GET  /api/dashboard/hall-of-fame
     → Returns: top 3 this week + badge feed + current user rank

POST /api/points/award
     → Body: { student_id, event_type, points, metadata }
     → Used by other modules (attendance, checklists) to log point events
     → Also triggers update_student_streak()
```

---

## 10. FLUENT UI v9 COMPONENT TREE

```
src/
├── features/
│   └── gamification/
│       ├── components/
│       │   ├── LeaderboardPage.tsx          — Main leaderboard page with tabs & filters
│       │   ├── LeaderboardTabBar.tsx        — Weekly / Monthly / All-Time tabs
│       │   ├── LeaderboardBatchFilter.tsx   — Batch dropdown + "All Neram" toggle
│       │   ├── LeaderboardTopThree.tsx      — Podium cards for rank 1-3
│       │   ├── LeaderboardRow.tsx           — Individual row with avatar, score, badges
│       │   ├── LeaderboardYourRank.tsx      — Sticky "Your Rank" section
│       │   ├── StudentProfileDrawer.tsx     — Side panel / full screen profile view
│       │   ├── StudentProfileHeader.tsx     — Photo, name, batch, rank
│       │   ├── StudentStatsRow.tsx          — Streak, attendance%, tasks, badges count
│       │   ├── BadgeGrid.tsx                — Grid of earned + locked badges
│       │   ├── BadgeCard.tsx                — Individual badge with icon, name, rarity glow
│       │   ├── BadgeCatalogPage.tsx         — Full catalog of all badges with filters
│       │   ├── ActivityFeed.tsx             — Recent activity list with icons
│       │   ├── ActivityFeedItem.tsx         — Single activity entry
│       │   ├── AttendanceHeatmap.tsx        — Monthly calendar heatmap
│       │   ├── RankChangeIndicator.tsx      — ↑3 / ↓2 with green/red coloring
│       │   ├── StreakFlame.tsx              — Animated flame icon component
│       │   ├── BadgeEarnedToast.tsx         — Toast notification for new badges
│       │   ├── NextBadgeProgress.tsx        — "Next badge" card with progress bar (self-view)
│       │   ├── RankHistoryChart.tsx         — 8-week rank trend line (self-view)
│       │   └── DashboardHallOfFame.tsx      — Home dashboard widget
│       │
│       ├── hooks/
│       │   ├── useLeaderboard.ts            — Fetch & cache leaderboard data
│       │   ├── useStudentProfile.ts         — Fetch student achievement profile
│       │   ├── useBadgeCatalog.ts           — Fetch badge definitions + earned status
│       │   ├── useMyAchievements.ts         — Fetch current user's full achievement data
│       │   ├── usePointEvents.ts            — Log point events from other modules
│       │   └── useStreakStatus.ts            — Current streak info
│       │
│       ├── utils/
│       │   ├── scoreCalculation.ts          — Client-side score display helpers
│       │   ├── badgeHelpers.ts              — Badge rarity colors, icon paths, sorting
│       │   ├── rankFormatting.ts            — Rank display, tiebreaker labels
│       │   └── dateHelpers.ts               — Week start/end, month calculations
│       │
│       ├── types/
│       │   └── gamification.ts              — TypeScript interfaces for all entities
│       │
│       └── styles/
│           ├── leaderboard.module.css       — Leaderboard-specific styles
│           ├── badges.module.css            — Badge grid, glow effects, shimmer
│           ├── profile.module.css           — Profile drawer styles
│           └── animations.module.css        — Flame, rank-change, badge-unlock animations
│
├── app/
│   └── (nexus)/
│       ├── leaderboard/
│       │   └── page.tsx                     — Leaderboard route
│       ├── badges/
│       │   └── page.tsx                     — Badge catalog route
│       └── profile/
│           └── [studentId]/
│               └── achievements/
│                   └── page.tsx             — Student achievement profile route
```

---

## 11. INTEGRATION POINTS WITH EXISTING NEXUS MODULES

This module does NOT work in isolation. It depends on and integrates with:

| Existing Module | Integration |
|---|---|
| **Attendance** | When attendance is marked, call `POST /api/points/award` with `event_type: 'class_attended'`. Also updates streak via `update_student_streak()` |
| **Checklists** | When a checklist item is completed, log `checklist_item_completed` (5 pts). When all items done, log `full_checklist_completed` (15 bonus pts) |
| **Drawing Assignments** | When a drawing is submitted, log `drawing_submitted` (20 pts). When teacher reviews, log `drawing_reviewed` (5 bonus pts) |
| **Student Onboarding** | New students get their `student_streaks` row created. Profile photo synced from Entra ID |
| **Microsoft Entra ID** | Profile photos (from Graph API), student name, batch assignment, jobTitle → role mapping |
| **Supabase Auth** | RLS policies use `auth.uid()` for access control |

### Implementation Order (Prerequisites)

1. ✅ Attendance module must be live (provides attendance data for scoring)
2. ✅ Checklist module must be live (provides task completion data)
3. ▶️ **This module** (depends on 1 and 2)
4. Drawing assignments module (optional, adds more point sources when ready)

---

## 12. EDGE CASES & GUARD RAILS

| Scenario | Handling |
|---|---|
| Student joins mid-week | Their max_possible_score is prorated to only the days since joining. They compete fairly |
| Student is in multiple batches | Pick primary batch for default leaderboard. Show batch switcher |
| Batch has < 5 students | Don't show ranked leaderboard (too small, feels exposed). Instead show personal stats only |
| Student has 0 activity for 2+ weeks | Don't show them on the leaderboard at all (avoid a wall of zeros). Show a "Welcome back" prompt when they return |
| Teacher manually awards too many points | Cap manual awards at 50 pts/student/week. Alert admin if exceeded |
| Two batches have very different schedules | normalized_score handles this for cross-batch comparisons |
| Student deactivated/left | Soft-delete from leaderboard, retain badge history |
| Badge criteria changes mid-year | Grandfather existing badge holders. New criteria applies only going forward |
| Internet connectivity issues (PWA) | Cache last leaderboard state in IndexedDB. Show "Last updated: X" timestamp. Queue point events for sync when online |

---

## 13. CLASSROOM PROJECTION MODE

For teachers projecting on a large screen during class, add a "Projection Mode" toggle:

- Hides student batch labels (everyone in the room is same batch)
- Increases font sizes by 1.5x
- Shows only top 10 + "Rising Star" of the week
- Adds a subtle animated background (navy gradient with slow-moving geometric shapes — Neram blueprint aesthetic)
- Auto-refreshes every 60 seconds
- Accessible via: `/leaderboard?mode=projection`

---

## 14. FUTURE ENHANCEMENTS (Not in v1)

- **Team/Group leaderboards** — groups of 4-5 students compete as a team (when batch sizes grow)
- **Seasonal badges** — special time-limited badges for exam seasons, festivals
- **Parent view** — simplified achievement summary visible to parents via Firebase auth portal
- **WhatsApp weekly digest** — automated weekly rank + badge summary sent to student + parent WhatsApp
- **Badge sharing** — generate a shareable image card of a badge for social media (Instagram story format)
- **Reward redemption** — physical rewards (Neram merchandise, book vouchers) at point thresholds

---

## 15. IMPLEMENTATION NOTES FOR CLAUDE CODE

1. **Stack enforcement:** Fluent UI v9 ONLY. No MUI, no Tailwind, no Chakra. Import from `@fluentui/react-components`
2. **No TypeScript `any`:** Use the interfaces defined in `types/gamification.ts` everywhere
3. **Supabase client:** Use `@supabase/supabase-js` v2. Use the existing Nexus Supabase client instance
4. **Auth:** All API routes must verify Entra ID session. Use existing auth middleware
5. **Data fetching:** Use SWR or React Query (whichever Nexus already uses) for leaderboard data with 60-second revalidation
6. **CSS approach:** CSS Modules (`.module.css`) co-located with components. Use Fluent UI tokens for spacing, colors, shadows where available. Custom CSS only for animations and badge-specific effects
7. **Accessibility:** All interactive elements need `aria-label`. Leaderboard rows need `role="row"` within `role="table"`. Badge images need `alt` text. Color is never the only indicator (always pair with text/icon)
8. **Testing:** Write unit tests for `scoreCalculation.ts`, `badgeHelpers.ts`, and the streak logic. Integration tests for the leaderboard computation function
9. **Mobile PWA:** Test on Chrome Android. Ensure touch targets are minimum 44×44px. Swipe gestures for tab switching on leaderboard
10. **Performance:** Leaderboard should render < 500ms. Use virtual scrolling (Fluent UI `VirtualizedList` or similar) if batch size > 50 students
