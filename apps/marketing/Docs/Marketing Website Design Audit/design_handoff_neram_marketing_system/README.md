# Handoff: Neram marketing site design system

## Overview
neramclasses.com (`apps/marketing`, Next.js 14, MUI v5, next-intl) currently runs six competing theme sources. These are `marketingLightTheme`, a nested `neramaiArchitekDarkTheme` on the homepage only, `neramaiArchitekLightTheme` in the apply shell, the `NX` palette, M3 tonal ramps in `nata/sections/*`, and `--neram-*` CSS vars. The homepage looks like a different site from every other page.

This handoff turns the homepage's navy/gold "aiArchitek" language into **one token set with two surfaces**, plus a set of shared components. It also defines a **single Site Header** that keeps one geometry across all eight account states, and **9 page templates plus 3 specific pages** that cover all 200+ routes.

## About the design files
The files in `designs/` are **design references built in HTML**. They are prototypes that show the intended look and behaviour, not production code. Recreate them inside the existing marketing app, using MUI v5 (`@neram/ui`), the existing data sources, i18n and SEO patterns. Do not ship the HTML. To view them, open any `.dc.html` file in a browser from the `designs/` folder; `support.js` must sit beside the files.

Start with `Marketing Site Index.dc.html`. It links every screen and lists the routes each one covers.

## Fidelity
**High fidelity.** The colours, type sizes, spacing, radii and copy are final. Some content is sample data and is marked as such on the screen: college rows, cutoffs, city facts, reviews, and testimonial stats. Wire that content to the existing data sources (`@neram/database`, `lib/college-hub/*`, `lib/seo/location-*`, `/api/testimonials`, `lib/tools/configs/*`).

---

## Design tokens (`neramTokens` in `@neram/ui`, the single source)

### Colour: dark surface (hero, header on dark pages, CTA band, footer)
| Token | Hex | Use |
|---|---|---|
| navy.900 | `#060d1f` | Dark ground, header (dark), footer, CTA band, icon tiles |
| navy.800 | `#0b1629` | Cards and inputs on dark, image fallbacks |
| navy.700 | `#122040` | Avatars, hover on dark buttons |
| paper | `#f5f0e8` | Text on dark |
| paper.muted | `rgba(245,240,232,0.72)` | Lede/body on dark |
| paper.subtle | `rgba(245,240,232,0.62)` | Breadcrumbs, stat labels on dark |
| line.dark | `rgba(255,255,255,0.08)` | Rules and borders on dark |
| gold.500 | `#e8a020` | **Primary action fill only**, eyebrows on dark, stat numbers |
| gold.300 | `#f4bf5a` | Primary hover, pill text on dark |
| gold.tint | `rgba(232,160,32,0.12)` bg + `rgba(232,160,32,0.35)` border | Pills/chips on dark |

### Colour: light surface (long-form body)
| Token | Hex | Use |
|---|---|---|
| ground | `#FAFBFC` | Page body |
| surface | `#ffffff` | Cards, alternate bands, header (light) |
| line | `#E1E5EB` | Card borders, row rules |
| line.strong | `#c5ccd4` | Input and outline-button borders |
| ink | `#1A2027` | Text |
| ink.muted | `#55606c` | Secondary text |
| gold.800 | `#8a5a05` | Eyebrows, check icons and gold text **on light** (passes 4.5:1) |
| success | `#2E7D32` | Verified, enrolment status, "Live" status rail only |
| status dots | amber `#f4bf5a`, blue `#5aa9ff`, green `#3fae5a` | Header application status |

**Remove** every other hex in `sx` props. Today there are 5 blues, 6 golds and 5 navies (listed in the audit). Add a lint rule that blocks hex literals in `sx`.

### Typography
Use Inter everywhere, plus one monospace stack `ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`. Museo stays for the wordmark only. Drop Poppins, Plus Jakarta Sans and the theme serif.

| Role | Spec |
|---|---|
| Display / H1 | 800 · `clamp(2rem, 5vw, 3.5rem)` · line-height 1.05 · letter-spacing −0.01em · `text-wrap: balance` |
| H1 (content pages, light header) | 800 · `clamp(2rem, 4.5vw, 3rem)` · 1.08 |
| H2 (section) | 800 · `clamp(1.75rem, 3.5vw, 2.5rem)` · 1.15 |
| H2 (in-article) | 800 · `clamp(1.5rem, 3vw, 2rem)` · 1.2 |
| H3 / card title | 700 · 17–22px · 1.25–1.3 |
| Lede | 400 · 17–18px · 1.55 |
| Body | 400 · 16px (never below 16 on mobile) · 1.55–1.7 |
| Small / meta | 13–15px |
| Eyebrow | mono 700 · 12px · letter-spacing 0.2em · uppercase · gold.800 on light, gold.500 on dark |
| Stat number | mono 700 · 22–26px · line-height 1 · gold.500 |
| Stat label | 12px · 0.05em · uppercase · paper.subtle |

### Shape, spacing and effects
- Radius: **8px** for cards, buttons, inputs and panels. **100px** for pills. Nothing else.
- Section padding: 56–80px vertical, 24px horizontal. Content max-width 1200px (articles 780px, FAQ and comparison 900px).
- Card padding: 20–28px. Grid gaps: 16–24px.
- Elevation: none on light (borders do the work). The hero booking/quick-check card uses `0 24px 48px rgba(0,0,0,0.35)`. The mega menu uses `0 24px 48px rgba(6,13,31,0.28)`.
- Blueprint grid (dark hero only): four stacked `linear-gradient` layers, white at 0.035 on a 40px grid and gold at 0.06 on a 200px grid.
- **No** glassmorphism, `backdropFilter`, radial-glow gradients or `translateY(-8px)` hovers. Hover = border turns gold.500.
- Focus: `outline: 2px solid #e8a020; outline-offset: 2px` everywhere. This replaces `#1976d2`.
- Icons: **Material Symbols Outlined**, the same family as the existing `@mui/icons-material/*Outlined`. **No emoji in UI.**
- Touch targets ≥ 44px (primary CTAs 48–56px).

---

## Shared components to build in `@neram/ui`

| Component | Props | Spec (see files) |
|---|---|---|
| `Surface` | `tone: 'dark' \| 'light' \| 'white'` | Section wrapper. Dark = navy.900 + optional `blueprint`. |
| `PageHero` | `tone='dark'`, `breadcrumb`, `eyebrow`, `title`, `lede`, `pills[]`, `actions`, `stats[]`, `aside` | `Unified Pages` (Home/Coaching), `T1`, `T3`, `T6`, `T7`, `Demo Class`. Two-column auto-fit `minmax(min(100%,420–440px),1fr)` when there's an `aside`. |
| `DocHeader` | `breadcrumb`, `eyebrow`, `title`, `lede`, `verified` | White band + 1px bottom line. Used by `T2`, `T4`, `T5`, `T9` legal. |
| `SectionHeader` | `eyebrow`, `title`, `lede`, `align: 'center' \| 'start'` | Centre on marketing pages, start on content/flow pages. Gap 12px. |
| `CtaButton` | `variant: 'primary' \| 'outline' \| 'link'`, `icon`, `tone` | Primary: gold fill, navy text, 700, 14–16px, padding 14×22, radius 8, trailing `arrow_forward` (or `north_east` for external). Outline: 1px line.strong (light) or `rgba(245,240,232,0.4)` (dark). Link: 1px bottom border. Labels flush left; arrows pushed to the edge with `justify-content: space-between` in full-width buttons. |
| `StatStrip` | `items[{value,label}]` | 1px line.dark grid, navy.800 @ 0.6 bg, mono gold numbers. |
| `FeatureCard` / `ToolCard` | `icon`, `title`, `body`, `href` | White card, 48px navy icon tile with gold glyph. |
| `ProgramCard` | `highlight` | Highlight = 3px gold top border + navy "Most Popular" pill. |
| `CtaBand` | `eyebrow`, `title`, `lede`, `actions` | Navy, centred, 80–96px padding, top border `rgba(232,160,32,0.15)`. |
| `FaqList` | `items` | Rules, not boxes: 1px ink top border, 1px line per row, 60px rows, chevron rotates 180°. Keep the existing FAQPage JSON-LD array as the source. |
| `GuideNav` | `items`, `current` | T2 left rail: 40px rows, active = white bg + `inset 3px 0 0 gold.500` + 1px line. Replaces the M3 tinted `SpokeNavSidebar`. Use a horizontal scroller or select on mobile. |
| `StatusBanner` | `status: live \| tbd \| coming-soon` | White card + 3px left status rail (green / amber / grey). Replaces the tinted fills in `CounsellingStatusBanner`. |
| `InlineCta` | | Navy box placed in the article flow, one per article. |
| Form controls | Pill, DayTile, WindowTile, Switch, TextInput, StepBar | From `Demo Class Page`. Selected = navy.900 fill + paper text. Unselected = white + 2px line. Inputs 48px, 16px text. Step bar 4px, gold for done. |

---

## Site Header (`Site Header.dc.html`, board: `Header States.dc.html`)

**Four fixed slots:** Brand | Nav | Actions (outline secondary + gold primary) | Account (Log in, or bell + 40px avatar). The geometry is identical for every visitor; only labels change. **Remove** the colour-flipping `HeaderCtaPill` / `toneSx` and the approved pulse.

**Surface:** navy `#060d1f` on pages with a dark `PageHero`. White `#fff` + 1px `#E1E5EB` bottom on pages with a `DocHeader` (`T2`, `T4`, `T5`, legal). Height 64px desktop, 56px mobile.

**State map** (one table replaces `getCtaConfig` + `ctaTone`):
| state | secondary | primary (full / short) | dot | account |
|---|---|---|---|---|
| guest | Free demo (videocam) | Join Now / Join | none | Log in |
| signedIn | Free demo | Join Now | none | bell + avatar |
| demoBooked | My demo · {day} (event_available) | Join Now | none | bell + avatar |
| draft | Free demo | Continue application / Continue | amber | bell + avatar |
| submitted / under_review / pending_verification | Free demo | Track application / Track | blue | bell + avatar |
| approved | hidden | Pay & join / Pay | green | bell (unread) + avatar |
| enrolled / partial_payment | My enrollment (badge) | Go to App (north_east) / App | green | bell + avatar with solid gold.500 ring |
| on /apply | hidden | Need help? (outline) | none | as signed in |

**Width tiers** (measure the header container with ResizeObserver; don't rely on viewport queries):
- **≥1240px**: everything shown in full.
- **1060–1239px**: secondary goes icon-only (label in `title`/`aria-label`). Primary drops " application".
- **900–1059px**: nav shows Colleges + Exam Hub plus a **More** menu holding Counseling, About and Free Tools.
- **<900px**: mobile bar with wordmark, search, short primary and menu. Nav links are never clipped.

**Nav item:** 44px tall, padding 0 10px, 15px. Weight 600 when active or open (500 otherwise), opacity 0.82 when inactive. Active = `inset 0 -2px 0 #e8a020`. Open = tinted bg (`rgba(255,255,255,0.08)` dark / `#F1F3F6` light) and the chevron rotates 180°.

**Mega menu:** white, 8px radius, 1px line. Three link columns with gold.800 mono eyebrows, plus a `#FAFBFC` aside of navy-tile tool cards and a footer row. Keep the existing `NAV_GROUPS` data, `MegaMenuPanel` focus handling, Esc, click-away and inline search.

**Broadcast banner:** gold.500 background, navy text, 14px/600, `campaign` icon, 40px dismiss target. This replaces the Material blue.

**Phone drawer:** account card first (avatar, name, status dot + sentence), then full-width primary and secondary, then nav groups as 52px rows, then language and sign out.

**Loading:** reserve 92px for the account slot so the bar doesn't jump.

## Site Footer (`Site Footer.dc.html`)
navy.900, 64px top padding. Five auto-fit columns `minmax(170px,1fr)`: About, Quick Links, Resources, Top Cities, B.Arch Counselling. Below them, a Nexus promo row (1px `rgba(232,160,32,0.25)` border, outline + gold buttons) and a legal row. Links are 14px `rgba(245,240,232,0.72)`. Remove `#030812`, `#f0b040` and the footer's own grid overlay.

---

## Screens

Every screen follows the same order: Site Header → `PageHero` (dark) or `DocHeader` (light) → light body sections alternating `#FAFBFC` / `#fff` with 1px `#E1E5EB` top borders → `CtaBand` (dark) → Site Footer.

| File | Covers | Notes |
|---|---|---|
| `Unified Pages.dc.html` → Home | `/` | Keeps the dark hero (ClockCanvas unchanged, emoji badges replaced by icon badges, 16px CTA, 17px subhead). Featured Courses and Learning Tools move to a light body. The lazy sections (Announcements, Results, Testimonials, Social proof, YouTube) take the same `Surface` + `SectionHeader`. The **Tokens** tab is the visual token sheet. |
| `Unified Pages.dc.html` → Coaching | `/coaching`, online/entrance coaching, `/premium`, `/scholarship` | Indigo gradient → dark `PageHero` with stats inside it. ProgramCards. Emoji "Why choose" → FeatureCards. |
| `Demo Class Page.dc.html` | `/demo-class/*` | Booking card in the hero aside. Interactive prototype of `DemoBookingCard` steps 1–2 and the booked state. The comparison is a table everywhere (decide whether to keep the phone card fallback). |
| `T1 Course Detail` | `/courses`, `/courses/[slug]`, `/fees` | Flex wrap: main `1 1 560px`, sticky fee aside `1 1 300px` max 400 with a 3px gold top. |
| `T2 Exam Guide Article` | `nata-2026/*`, `aat-2026/*`, `pgeta-2026/*`, guides, blog posts, concepts | Light header. `GuideNav` `0 1 240px` sticky + article max 780. |
| `T3 Hub Index` | `/tools` and all hub pages | Hero has a search input + category tabs that sit on the hero's bottom edge (active tab = `#FAFBFC`, flush with the body). |
| `T4 College Directory` | `/colleges/**` | List: sticky filter aside + cards + compare bar. Detail: KPI strip, section tabs (gold underline), white section cards, navy help card. |
| `T5 Counseling Detail` | 28 counselling pages | `StatusBanner`, schedule as a ruled timeline (done = green dot, now = gold dot + halo, next = hollow), callback drawer, Aintra panel. |
| `T6 City Coaching` | city and state coaching pages | Facts as a ruled `dl`, sticky lead form aside, nearby-city link grid. |
| `T7 Tool Page` | `/tools/[slug]` | Quick check in the hero aside (prototype computes board×2 + A + B / 400). Then steps, features as a ruled list, related tools. |
| `T8 Social Proof` | testimonials, reviews, achievements, alumni, ask-seniors | Hero stats show real counts only ("—" until loaded). Sticky white filter bar. CSS columns masonry. |
| `T9 Company and Legal` | `/about`, `/careers`, `/contact`, `/terms`, `/privacy`, `/refund-policy`, `/support` | About: dark hero + stats, story, Mission/Vision as a ruled 2-up, team cards (initials fallback in navy.700, replacing the random `AVATAR_COLORS`). Legal: light header, policy pill switcher, "On this page" rail, 700px measure. |

**Out of scope:** the `/apply` ApplicationShell step layouts (take the tokens and the "Need help?" header state only) and the college dashboard/update partner tools.

## Interactions and behaviour
- Hover: cards change border to gold.500. Primary buttons go gold.500 → gold.300. Outline buttons on light fill navy with paper text.
- FAQ accordion: one open at a time, chevron `transform 200ms`.
- Header hides on scroll down and shows on scroll up (unchanged). Ctrl/⌘K opens search.
- Respect `prefers-reduced-motion`. Remove ambient animations (pulse, float, line-blink). Keep the hero fade-up only if the LCP text isn't faded.
- Mobile: everything reflows through `auto-fit`/`flex-wrap`. Day tiles scroll horizontally. Sticky asides become in-flow.

## Rollout order
1. Tokens + `globals.css` (spinner, focus, selection, remove dark-only utilities). Delete `*.tsx.tmp.*` and `HeroLegacy.tsx`.
2. Build the shared components and refactor Home onto them (visual diff should be limited to the light body).
3. Site Header state map + width tiers. Site Footer.
4. Top-traffic pages: Coaching, Courses, Fees, About, Demo class.
5. Templates T2–T8 (shared layouts update hundreds of URLs). Add the hex-literal lint rule.

## Assets
- `designs/assets/fonts/Museo300-Regular.woff`, `Museo700-Regular.woff` (from `public/fonts`).
- `designs/assets/courses/*` (from `public/images/courses`).
- `designs/assets/header-today.png`: screenshot of the current header for comparison.
- Icons: Material Symbols Outlined (Google Fonts) in the prototypes. In code, use the matching `@mui/icons-material/*Outlined`.
- `designs/_ds/`: styles only for the two documentation pages (Audit, Index). It is **not** part of the site's visual system.

## Files
`designs/Marketing Site Index.dc.html` (start here) · `Marketing Design Audit.dc.html` · `Site Header.dc.html` · `Header States.dc.html` · `Site Footer.dc.html` · `Unified Pages.dc.html` · `Demo Class Page.dc.html` · `T1`–`T9 *.dc.html` · `support.js`
