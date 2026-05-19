# AskSeniors Feature — Design Spec

**Date:** 2026-05-19
**Author:** Haribabu (via Claude Code brainstorming)
**Status:** Approved by user

---

## Context

Neram Classes runs an annual free online event called **#AskSeniors** every June/July, timed before TNEA counselling. Architecture aspirants (NATA/JEE Paper 2 students) can ask questions directly to current students from 50+ top architecture colleges, helping them make informed college choices before counselling.

The goal is to:
1. Add a teaser section on the marketing homepage to drive registrations
2. Build a dedicated `/ask-seniors` page with full event details and a registration form
3. Store registrations in Supabase with NATA scores and college preferences
4. Link every participating college chip to its dedicated college hub page

---

## 1. Database

### New table: `ask_seniors_events`

Tracks each annual edition of the event.

```sql
CREATE TABLE ask_seniors_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year           INTEGER NOT NULL,
  title          TEXT NOT NULL,           -- e.g. "AskSeniors 2026"
  event_date     DATE,                    -- nullable if TBD
  event_time     TIME,
  event_link     TEXT,                    -- Zoom/Meet/YouTube link
  status         TEXT NOT NULL DEFAULT 'upcoming'
                   CHECK (status IN ('upcoming', 'active', 'completed')),
  description    TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- Seed the 2026 event (date TBD, will be updated)
INSERT INTO ask_seniors_events (year, title, status)
VALUES (2026, 'AskSeniors 2026', 'upcoming');
```

### New table: `ask_seniors_registrations`

One row per student registration, linked to an event edition.

```sql
CREATE TABLE ask_seniors_registrations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            UUID NOT NULL REFERENCES ask_seniors_events(id),
  name                TEXT NOT NULL,
  phone               TEXT NOT NULL,
  email               TEXT NOT NULL,
  city                TEXT,
  state               TEXT,
  nata_attempts       INTEGER NOT NULL CHECK (nata_attempts IN (1, 2)),
  nata_score_1        NUMERIC(5,2) NOT NULL,        -- first attempt, 0-200
  nata_score_2        NUMERIC(5,2),                 -- second attempt, nullable
  board_score         NUMERIC(5,2) NOT NULL,         -- board exam percentage
  final_cutoff        NUMERIC(5,2),                  -- best NATA score (computed on insert)
  college_preferences UUID[],                        -- array of colleges.id the student wants
  registered_at       TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE ask_seniors_registrations ENABLE ROW LEVEL SECURITY;
-- Insert allowed without auth (public event)
CREATE POLICY "anyone can register" ON ask_seniors_registrations FOR INSERT WITH CHECK (true);
-- Only service role can read (admin use)
```

### Updated: `colleges` table

Add 18 missing colleges (3 already exist: SRM, VIT, Christ). All added via a SQL migration with:
- `slug`, `state_slug`, `city`, `name`, `short_name`
- `logo_url` pointing to `/images/ask-seniors/colleges/[filename].webp`
- `coa_approved = true`, `accepted_exams = ARRAY['NATA','JEE_PAPER_2']`
- `neram_tier = 'free'`

Colleges to add:
| College | Slug | State Slug | City |
|---|---|---|---|
| Anna University | anna-university-architecture | tamil-nadu | Chennai |
| NIT Trichy | nit-trichy-architecture | tamil-nadu | Tiruchirappalli |
| PSG College of Technology | psg-college-architecture | tamil-nadu | Coimbatore |
| SPA Delhi | spa-delhi-architecture | delhi | New Delhi |
| CEPT University | cept-university-architecture | gujarat | Ahmedabad |
| MEASI Academy | measi-academy-architecture | tamil-nadu | Chennai |
| M.S. Ramaiah | ms-ramaiah-architecture | karnataka | Bangalore |
| Dayananda Sagar | dayananda-sagar-architecture | karnataka | Bangalore |
| SPA Bhopal | spa-bhopal-architecture | madhya-pradesh | Bhopal |
| Thiagarajar College | thiagarajar-college-architecture | tamil-nadu | Madurai |
| Rathinam College | rathinam-college-architecture | tamil-nadu | Coimbatore |
| Karpagam Academy | karpagam-academy-architecture | tamil-nadu | Coimbatore |
| VNIT Nagpur | vnit-nagpur-architecture | maharashtra | Nagpur |
| SPA Vijayawada | spa-vijayawada-architecture | andhra-pradesh | Vijayawada |
| McGAN'S Ooty | mcgans-ooty-architecture | tamil-nadu | Ooty |
| PRIME Nagapattinam | prime-nagapattinam-architecture | tamil-nadu | Nagapattinam |
| Periyar University | periyar-university-architecture | tamil-nadu | Salem |
| PAPNI | papni-architecture | tamil-nadu | Tamil Nadu |

---

## 2. Image Assets

Download all 21 `.webp` college logos from the old GitHub repo and store locally:

**Destination:** `apps/marketing/public/images/ask-seniors/colleges/`

Source: `https://raw.githubusercontent.com/findhari93-sketch/NeramNewApp/23b7a9dc9f81cf1ea339892c3a76e2c3d3b5db04/public/images/asksenior/colleges/[filename].webp`

Files to download (21 total):
- Anna_University_Logo.webp, National_Institute_of_Technology_Trichy_Logo.webp
- PSG_IAP_coimbatore.webp, SPA_Delhi.webp, Cept_Ahmedaba.webp
- SRM_CHENNAI.webp, VIT_Vellore.webp, MEASI_chennai.webp
- christ_bangalore.webp, ms_Ramaiah_bangalore.webp, DSU.webp
- SPA-Bhopal.webp, Thiagarajar_College_of_Engineering_logo_MADURAI.webp
- Rathinam_coimbatore.webp, karpagamcollege_Coimbatore.webp
- VNIT_logo_NAGPUR.webp, `School_of_Planning_and_Architecture,_Vijayawada_Logo.webp`
- McGAN'S_ooty.webp, PRIME_Nagapattinam.webp, periyar.webp, papni.webp

**In implementation:** Use `curl` or `node fetch` script to batch-download all 21 files.

---

## 3. Homepage Teaser Section

**Component:** `apps/marketing/src/components/ask-seniors/AskSeniorsSection.tsx`

**Position in `HomePageContent.tsx`:** After `StudentResultsTeaser`, before `SocialProofSection`. Loaded with `next/dynamic({ ssr: false })` to keep it out of SSR (has animation, below fold).

**Only rendered when** a current event exists with `status IN ('upcoming', 'active')`. Fetched server-side in `HomePageContent` via a cached query.

**Layout:**
```
[Label: FREE ONLINE EVENT]
[Title: #AskSeniors — gold gradient text]
[Desc: Real answers from current students at top B.Arch colleges. Before counselling.]

[Stats: 50+ Colleges · Free · Annual — June/July]

[Row 1: → → → college chips (32s)]
[Row 2: ← ← ← college chips (38s)]

[Hover hint: Hover any row to pause]

[Register for Free →]  [See All Colleges]  [● Free for all students]
```

**College Chip anatomy:**
- Circular avatar (36x36px, white bg, `object-fit: contain`, 3px padding)
- College name (13px, semibold)
- City (11px, muted)
- Border: `rgba(255,255,255,0.08)`, hover: `rgba(232,160,32,0.55)`
- `cursor: pointer`, click navigates to `/colleges/[state_slug]/[slug]`

**Scroll implementation:**
- CSS `@keyframes marquee` — `translateX(0)` to `translateX(-50%)`
- Reverse row: `animation-direction: reverse`
- `.scroll-track:hover { animation-play-state: paused }`
- Edge fade: `mask-image: linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)`
- Each row: duplicate the college set once (Set 1 + Set 2 = 2x items) for seamless loop

**Framer Motion:** Not needed. Pure CSS animation is lighter and sufficient.

---

## 4. Dedicated Page: `/ask-seniors`

**File:** `apps/marketing/src/app/[locale]/ask-seniors/page.tsx`

**Content component:** `apps/marketing/src/components/ask-seniors/AskSeniorsPageContent.tsx`

**Caching:** `export const revalidate = 3600` (ISR, 1 hour)

### Section 1: Hero

- Event name: `#AskSeniors 2026`
- Tagline: "Real students. Real answers. Before you decide."
- Date: "Coming June/July 2026" (or exact date once confirmed)
- Free badge (green pulse dot)
- Stats: 50+ colleges, Free, Annual
- CTA: "Register Now — It's Free →" (anchors to `#register`)

### Section 2: About

Short 2-3 paragraph explanation of:
- What is AskSeniors (who speaks, what students can ask)
- Why it matters (counselling is a one-shot decision, hear from real students)
- Who should attend (NATA/JEE Paper 2 aspirants, parents welcome)

### Section 3: Colleges Grid (`id="colleges"`)

**Component:** `CollegesGrid.tsx`

- Heading: "Participating Colleges"
- Grid: 4 columns desktop, 2 columns mobile
- Each card: logo (48x48px avatar) + college name + city + state
- Click: navigates to `/colleges/[state_slug]/[slug]`
- No filter/search needed at this stage (21 colleges, manageable)

### Section 4: Registration Form (`id="register"`)

**Component:** `RegistrationForm.tsx`

No Firebase auth required. Public form.
If user is logged in (Firebase), pre-fill name/phone/email from profile.

**Step 1 — Your NATA Scores**

| Field | Type | Validation |
|---|---|---|
| NATA attempts | Toggle (1 or 2) | Required |
| NATA Score — Attempt 1 | Number | 0-200, required |
| NATA Score — Attempt 2 | Number | 0-200, shown only if 2 attempts |
| Board Exam Score | Number | 0-100 (percentage), required |
| Final Cutoff (auto) | Read-only display | `= max(nata_score_1, nata_score_2)` |

The final cutoff display updates live as the user types. Shows as a highlighted result card below the inputs: "Your best NATA score: **162.5**"

**Step 2 — College Preferences**

- Heading: "Which colleges are you interested in?"
- Show all 21 participating colleges as selectable chips (logo + name)
- Multi-select, minimum 1
- Selected chips highlight in gold

**Step 3 — Your Details**

| Field | Type | Validation |
|---|---|---|
| Full Name | Text | Min 2 chars, required |
| Phone | Tel (+91 prefix) | 10 digits, required |
| Email | Email | Valid format, required |
| City | Text | Optional |
| State | Dropdown (Indian states) | Optional |

**On Submit:**
- `POST /api/ask-seniors/register`
- API sends a confirmation email via Resend to the student's email with event details (or "coming soon" if date TBD)
- Success screen: "You're registered! Check your email for the event link."
- No redirect — success state shown inline

### Section 5: FAQ

5 questions:
1. What is AskSeniors?
2. Who can attend?
3. Is it really free?
4. Which colleges participate?
5. How will I get the event link?

Uses MUI `Accordion` (already in `@neram/ui`).

---

## 5. API Route

### `POST /api/ask-seniors/register`

**File:** `apps/marketing/src/app/api/ask-seniors/register/route.ts`

```typescript
// Request body
{
  name: string
  phone: string
  email: string
  city?: string
  state?: string
  nata_attempts: 1 | 2
  nata_score_1: number
  nata_score_2?: number
  board_score: number
  college_preferences: string[]  // array of college UUIDs
}

// Logic
// 1. Validate inputs (zod schema)
// 2. Get current upcoming/active event: SELECT id FROM ask_seniors_events WHERE status IN ('upcoming','active') ORDER BY year DESC LIMIT 1
// 3. Compute final_cutoff = max(nata_score_1, nata_score_2 ?? 0)
// 4. INSERT into ask_seniors_registrations
// 5. Return { success: true, registration_id }
```

**No auth header required** (public event). Use `createAdminClient()` server-side for the insert.

---

## 6. Query Functions

**File:** `packages/database/src/queries/ask-seniors.ts`

```typescript
getActiveAskSeniorsEvent()         // Returns current upcoming/active event or null
getAskSeniorsColleges()            // Returns the 21 participating colleges with logo_url + slug + state_slug
registerForAskSeniors(payload)     // Inserts registration row
```

---

## 7. File Structure

```
apps/marketing/
├── public/images/ask-seniors/colleges/
│   └── *.webp  (21 files)
├── src/app/[locale]/ask-seniors/
│   └── page.tsx
├── src/app/api/ask-seniors/register/
│   └── route.ts
├── src/components/ask-seniors/
│   ├── AskSeniorsSection.tsx        (homepage teaser, dynamic import)
│   ├── CollegeScrollStrip.tsx       (infinite marquee, used inside AskSeniorsSection)
│   ├── AskSeniorsPageContent.tsx    (full dedicated page)
│   ├── CollegesGrid.tsx             (all colleges grid, used on dedicated page)
│   ├── RegistrationForm.tsx         (3-step form)
│   └── AskSeniorsFAQ.tsx

packages/database/
├── supabase/migrations/
│   ├── [timestamp]_ask_seniors_tables.sql      (events + registrations tables)
│   └── [timestamp]_ask_seniors_colleges.sql    (18 new college rows)
└── src/queries/ask-seniors.ts
```

---

## 8. Homepage Integration

**`apps/marketing/src/app/[locale]/page.tsx`** (server component):
```typescript
// Fetch event at build/revalidation time alongside other server data
const askSeniorsEvent = await getActiveAskSeniorsEvent()
// Pass to HomePageContent as a new prop
return <HomePageContent ... askSeniorsEvent={askSeniorsEvent} />
```

**`apps/marketing/src/components/HomePageContent.tsx`** (client component):
```typescript
// Accept new prop
const AskSeniorsSection = dynamic(
  () => import('./ask-seniors/AskSeniorsSection'),
  { ssr: false }
)

// Render after StudentResultsTeaser, before SocialProofSection
// {askSeniorsEvent && <AskSeniorsSection event={askSeniorsEvent} />}
```

If `askSeniorsEvent` is `null` (no upcoming/active event in DB), the section is not rendered. No extra API call needed.

---

## 9. Vercel Cost Notes

- Homepage section: `ssr: false` dynamic import, zero extra function invocations
- `/ask-seniors` page: ISR `revalidate = 3600` — rebuilds at most once per hour
- Registration API: Only called on form submit, acceptable invocation cost
- College logos: Served from `public/` as static assets, no cost

---

## 10. Verification

1. **Homepage**: `pnpm dev:marketing` → scroll to AskSeniors section → verify dual-row scroll works, hover pauses, chips navigate to `/colleges/[state]/[slug]`
2. **Dedicated page**: Navigate to `http://localhost:3010/en/ask-seniors` → all 4 sections visible, colleges grid loads, form submits successfully
3. **Registration**: Submit a test registration → check Supabase `ask_seniors_registrations` table via MCP for the new row
4. **College pages**: Click a college chip → verify navigation to existing hub page (SRM, VIT, Christ) and to newly created pages for others
5. **No event**: Set event `status = 'completed'` in DB → homepage section disappears
6. **Mobile**: Test at 375px — no horizontal scroll, touch targets hit 48px, scroll strip works on touch
