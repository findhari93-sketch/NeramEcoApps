# Neram Classes — Design System & Migration Plan
**From: neramclasses.com (current) → "aiArchitek Era" redesign**  
*Version 1.0 · March 2026 · Prepared by Claude*

---

## 0. TL;DR — What This Document Is

This is your **single source of truth** for the Neram Classes visual redesign. It covers:
- The complete MUI v5 theme (dark + light) with exact colour tokens
- A page-by-page migration roadmap so no live SEO/AEO is ever broken
- Hero section implementation guide (the prototype you approved)
- Mobile-responsive rules
- Answers to: "Will this break other pages?"

Read Section 1 first. Then implement Section 2 (theme). Then follow Section 4 (rollout).

---

## 1. Design Concept — "Neram = Time" Identity

### The Core Idea
**NERAM** means *Time* in Tamil. The redesign makes Time the visual metaphor:
- The **clock-compass** on the hero = time, precision, architecture, direction
- **Blueprint grid backgrounds** = architectural identity, technical credibility
- **Gold (amber) + Electric Blue** = warmth of tradition + coldness of AI technology
- **Deep Navy** base = premium, trustworthy, India's best

### Brand Personality
```
Professional · Technical · Warm · Aspirational · Tamil Pride
```

### What Makes This Different from the Current Site
| Current Site | aiArchitek Redesign |
|---|---|
| Flat blue background | Animated blueprint grid, radial glow |
| Generic coaching aesthetics | Architecture-inspired visual language |
| Plain colour hero | Living clock + floating tool cards |
| No AI differentiation | "India's First AI-Enabled NATA Platform" |
| Microsoft badge hidden | Microsoft Education prominently displayed |
| English only emphasis | Tamil tag + bilingual personality |

---

## 2. MUI v5 Theme — Complete Specification

### 2.1 Colour Tokens

These are the raw design tokens. Every colour in the entire site must come from here.

```typescript
// /packages/ui/src/theme/tokens.ts

export const neramTokens = {
  // ── CORE PALETTE ──
  navy: {
    950: '#030812',   // deepest bg (almost black)
    900: '#060d1f',   // primary dark bg  ← HERO BG
    800: '#0b1629',   // card bg in dark
    700: '#122040',   // elevated surface
    600: '#1a2d55',   // border in dark
    500: '#243b6e',   // muted interactive
  },

  gold: {
    400: '#f4bf5a',   // hover / light variant
    500: '#e8a020',   // PRIMARY GOLD  ← brand colour
    600: '#c47d10',   // pressed state
    700: '#9c5f08',   // dark accessible variant
  },

  blue: {
    300: '#7dd3fc',   // very light, tags
    400: '#3eb8ff',   // bright AI accent
    500: '#1a8fff',   // PRIMARY BLUE  ← AI colour
    600: '#0d6ecd',   // pressed state
    700: '#0a4f99',   // dark variant
  },

  // ── NEUTRAL ──
  cream: {
    50:  '#fdfcf9',   // white (light mode bg)
    100: '#f5f0e8',   // warm off-white  ← dark mode text
    200: '#e8e0d0',   // secondary text (light mode)
    300: '#c8bfaa',   // muted (light mode)
  },

  // ── SEMANTIC ──
  success: '#22c55e',
  error:   '#ef4444',
  warning: '#f59e0b',
  info:    '#3eb8ff',  // = blue.400
};
```

### 2.2 Dark Theme (Hero + Premium Pages)

```typescript
// /packages/ui/src/theme/darkTheme.ts
import { createTheme, alpha } from '@mui/material/styles';
import { neramTokens as t } from './tokens';

export const neramDarkTheme = createTheme({
  palette: {
    mode: 'dark',

    primary: {
      main:         t.gold[500],      // #e8a020
      light:        t.gold[400],      // #f4bf5a
      dark:         t.gold[600],      // #c47d10
      contrastText: t.navy[900],      // dark text on gold buttons
    },

    secondary: {
      main:         t.blue[500],      // #1a8fff
      light:        t.blue[400],      // #3eb8ff
      dark:         t.blue[700],      // #0a4f99
      contrastText: '#ffffff',
    },

    background: {
      default: t.navy[900],           // #060d1f  — page bg
      paper:   t.navy[800],           // #0b1629  — cards, modals
    },

    text: {
      primary:   t.cream[100],        // #f5f0e8  — main text
      secondary: 'rgba(245,240,232,0.55)', // muted
      disabled:  'rgba(245,240,232,0.25)',
    },

    divider: 'rgba(255,255,255,0.07)',

    // Custom tokens accessible via theme.palette.brand.*
    // (extend with TypeScript module augmentation)
  },

  typography: {
    fontFamily: '"DM Sans", "Noto Sans Tamil", system-ui, sans-serif',
    // Display / hero headings
    h1: {
      fontFamily: '"Cormorant Garamond", "Lora", Georgia, serif',
      fontWeight: 600,
      fontSize: 'clamp(48px, 5.5vw, 76px)',
      lineHeight: 1.05,
      letterSpacing: '-0.01em',
      color: t.cream[100],
    },
    h2: {
      fontFamily: '"Cormorant Garamond", "Lora", Georgia, serif',
      fontWeight: 600,
      fontSize: 'clamp(32px, 4vw, 52px)',
      lineHeight: 1.1,
      color: t.cream[100],
    },
    h3: {
      fontFamily: '"DM Sans", sans-serif',
      fontWeight: 700,
      fontSize: 'clamp(22px, 2.5vw, 32px)',
      lineHeight: 1.2,
    },
    h4: { fontWeight: 700, fontSize: '22px' },
    h5: { fontWeight: 600, fontSize: '18px' },
    h6: { fontWeight: 600, fontSize: '15px' },
    subtitle1: { fontSize: '16px', lineHeight: 1.7, fontWeight: 300 },
    subtitle2: { fontSize: '14px', fontWeight: 500, letterSpacing: '0.04em' },
    body1: { fontSize: '16px', lineHeight: 1.75 },
    body2: { fontSize: '14px', lineHeight: 1.65 },
    caption: {
      fontFamily: '"Space Mono", monospace',
      fontSize: '11px',
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
    },
    overline: {
      fontFamily: '"Space Mono", monospace',
      fontSize: '10px',
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      fontWeight: 700,
    },
  },

  shape: { borderRadius: 6 },

  components: {
    // ── BUTTON ──
    MuiButton: {
      styleOverrides: {
        root: {
          fontFamily: '"DM Sans", sans-serif',
          fontWeight: 600,
          textTransform: 'none',
          letterSpacing: '0.02em',
          borderRadius: 6,
          transition: 'all 0.25s ease',
        },
        containedPrimary: {
          background: t.gold[500],
          color: t.navy[900],
          '&:hover': {
            background: t.gold[400],
            transform: 'translateY(-2px)',
            boxShadow: `0 12px 40px ${alpha(t.gold[500], 0.35)}`,
          },
        },
        outlinedSecondary: {
          borderColor: alpha(t.cream[100], 0.2),
          color: t.cream[100],
          '&:hover': {
            borderColor: t.gold[500],
            color: t.gold[500],
            background: 'transparent',
          },
        },
      },
    },

    // ── CARD ──
    MuiCard: {
      styleOverrides: {
        root: {
          background: t.navy[800],
          border: `1px solid rgba(255,255,255,0.06)`,
          backdropFilter: 'blur(12px)',
          transition: 'transform 0.25s ease, box-shadow 0.25s ease',
          '&:hover': {
            transform: 'translateY(-4px)',
            boxShadow: `0 20px 60px rgba(0,0,0,0.4)`,
          },
        },
      },
    },

    // ── CHIP (for badges, tags) ──
    MuiChip: {
      styleOverrides: {
        root: {
          fontFamily: '"DM Sans", sans-serif',
          fontWeight: 500,
          fontSize: '12px',
          letterSpacing: '0.03em',
        },
        colorPrimary: {
          background: alpha(t.gold[500], 0.12),
          color: t.gold[400],
          border: `1px solid ${alpha(t.gold[500], 0.3)}`,
        },
        colorSecondary: {
          background: alpha(t.blue[500], 0.12),
          color: t.blue[400],
          border: `1px solid ${alpha(t.blue[500], 0.3)}`,
        },
      },
    },

    // ── APP BAR ──
    MuiAppBar: {
      styleOverrides: {
        root: {
          background: alpha(t.navy[900], 0.85),
          backdropFilter: 'blur(20px)',
          borderBottom: `1px solid rgba(255,255,255,0.06)`,
          boxShadow: 'none',
        },
      },
    },

    // ── TEXT FIELD ──
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 6,
            '& fieldset': { borderColor: 'rgba(255,255,255,0.12)' },
            '&:hover fieldset': { borderColor: alpha(t.gold[500], 0.5) },
            '&.Mui-focused fieldset': { borderColor: t.gold[500] },
          },
        },
      },
    },

    // ── DIVIDER ──
    MuiDivider: {
      styleOverrides: {
        root: { borderColor: 'rgba(255,255,255,0.06)' },
      },
    },

    // ── CSS BASELINE ──
    MuiCssBaseline: {
      styleOverrides: {
        ':root': {
          '--neram-gold':        t.gold[500],
          '--neram-gold-light':  t.gold[400],
          '--neram-blue':        t.blue[500],
          '--neram-blue-bright': t.blue[400],
          '--neram-navy':        t.navy[900],
          '--neram-navy-card':   t.navy[800],
          '--neram-cream':       t.cream[100],
        },
        // Blueprint grid (apply to hero section)
        '.neram-blueprint-bg': {
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(rgba(232,160,32,0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(232,160,32,0.05) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px, 40px 40px, 200px 200px, 200px 200px',
        },
        // Glass card utility
        '.neram-glass': {
          background: 'rgba(11,22,41,0.75)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: '8px',
        },
        // Scrollbar
        '::-webkit-scrollbar': { width: '6px' },
        '::-webkit-scrollbar-track': { background: t.navy[900] },
        '::-webkit-scrollbar-thumb': {
          background: alpha(t.gold[500], 0.3),
          borderRadius: '3px',
        },
      },
    },
  },

  // Breakpoints — keep MUI defaults, just documenting
  // xs: 0, sm: 600, md: 900, lg: 1200, xl: 1536
});
```

### 2.3 Light Theme (Blog, FAQ, City Pages — SEO content pages)

```typescript
// /packages/ui/src/theme/lightTheme.ts
import { createTheme, alpha } from '@mui/material/styles';
import { neramTokens as t } from './tokens';

export const neramLightTheme = createTheme({
  palette: {
    mode: 'light',

    primary: {
      main:         t.gold[500],
      light:        t.gold[400],
      dark:         t.gold[600],
      contrastText: '#ffffff',
    },

    secondary: {
      main:         t.blue[500],
      light:        t.blue[400],
      dark:         t.blue[700],
      contrastText: '#ffffff',
    },

    background: {
      default: t.cream[50],           // #fdfcf9 — warm white
      paper:   '#ffffff',
    },

    text: {
      primary:   '#1a1a2e',           // near-black, not pure black
      secondary: '#4a5068',
      disabled:  '#a0a8c0',
    },

    divider: 'rgba(0,0,0,0.07)',
  },

  // Typography inherits same family, different colour defaults
  typography: {
    fontFamily: '"DM Sans", "Noto Sans Tamil", system-ui, sans-serif',
    h1: {
      fontFamily: '"Cormorant Garamond", Georgia, serif',
      fontWeight: 600,
      color: '#1a1a2e',
    },
    h2: {
      fontFamily: '"Cormorant Garamond", Georgia, serif',
      fontWeight: 600,
      color: '#1a1a2e',
    },
  },

  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          border: '1px solid rgba(0,0,0,0.06)',
          boxShadow: '0 2px 20px rgba(0,0,0,0.06)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          letterSpacing: '0.02em',
          borderRadius: 6,
        },
        containedPrimary: {
          background: t.gold[500],
          color: '#ffffff',
          '&:hover': {
            background: t.gold[600],
          },
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          background: alpha('#fdfcf9', 0.9),
          backdropFilter: 'blur(20px)',
          boxShadow: '0 1px 0 rgba(0,0,0,0.08)',
          color: '#1a1a2e',
        },
      },
    },
  },
});
```

### 2.4 Theme Provider Setup (Turborepo)

```typescript
// /packages/ui/src/theme/ThemeProvider.tsx
'use client';
import { ThemeProvider as MuiThemeProvider, CssBaseline } from '@mui/material';
import { neramDarkTheme } from './darkTheme';
import { neramLightTheme } from './lightTheme';

interface Props {
  children: React.ReactNode;
  forceDark?: boolean;   // for hero, premium pages
  forceLight?: boolean;  // for city SEO pages, blog
}

export function NeramThemeProvider({ children, forceDark, forceLight }: Props) {
  // Default: dark. Individual pages can override.
  const theme = forceLight ? neramLightTheme : neramDarkTheme;
  return (
    <MuiThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </MuiThemeProvider>
  );
}
```

### 2.5 Google Fonts to Import

Add to your `apps/web/src/app/layout.tsx` (or `_document.tsx`):

```html
<!-- CRITICAL: preconnect first for performance -->
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />

<!-- Display serif for H1/H2 (hero, section titles) -->
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&display=swap" rel="stylesheet" />

<!-- Body / UI font -->
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet" />

<!-- Monospace for captions, code, stats -->
<link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />

<!-- Tamil support -->
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Tamil:wght@400;600;700&display=swap" rel="stylesheet" />
```

**Performance tip:** Use `font-display: swap` in font CSS and subset to Latin+Tamil only.

---

## 3. "Will This Break Other Pages?" — Isolation Strategy

### Short Answer: No, if you follow this pattern.

### The Scope Guard Pattern

The new theme is **opt-in per page**. Your existing pages remain on the current theme until you explicitly migrate them. Use a `HeroThemeScope` wrapper:

```typescript
// /apps/web/src/app/en/page.tsx  ← only this page gets the new theme
import { NeramThemeProvider } from '@neram/ui/theme';

export default function HomePage() {
  return (
    <NeramThemeProvider forceDark>   {/* ← scoped to this page */}
      <HeroSection />
      <AboutSection />
      {/* ... */}
    </NeramThemeProvider>
  );
}

// /apps/web/src/app/en/nata-coaching/page.tsx  ← old page, untouched
export default function NataCoachingPage() {
  // Old MUI theme still active here
  return <OldLayout> ... </OldLayout>;
}
```

### Risk Matrix

| Page Type | Risk | Strategy |
|---|---|---|
| Hero / Home | Low — you're replacing it | Migrate first |
| Course detail pages | Low — isolated | Migrate Phase 2 |
| City SEO pages (Chennai, Trichy…) | **Medium** — high SEO value | Light theme only, migrate carefully |
| FAQ / Blog / NATA-2026 spoke pages | Low | New pages, start fresh with dark |
| Student login / classroom (nexus) | **None** — separate app | Do not touch |
| Admin panel | **None** — separate app | Do not touch |

---

## 4. Migration Roadmap — Page by Page

### Phase 0 — Foundation (Before Any UI Change) ✅ Do This First

```
[ ] Add neramTokens to /packages/ui/src/theme/tokens.ts
[ ] Create darkTheme.ts and lightTheme.ts
[ ] Create NeramThemeProvider component
[ ] Add Google Fonts to layout.tsx
[ ] Create global CSS classes (neram-blueprint-bg, neram-glass)
[ ] Verify no existing page breaks (smoke test all routes)
```
**Time: 1 day. Risk: Zero (additive only)**

---

### Phase 1 — Hero Section (neramclasses.com/en)

**Goal:** Transform the current flat-blue hero into the clock-compass aiArchitek design.

#### Hero Section Component Structure

```tsx
// /apps/web/src/components/hero/HeroSection.tsx
<Box component="section" sx={heroStyles}>
  <BlueprintBackground />        {/* animated grid + glow SVGs */}
  <HeroNav />                    {/* logo + links + CTA */}
  <aiArchitekBadge />                {/* top-right "Introducing aiArchitek" pill */}

  <Grid container sx={{ minHeight: '100vh', pt: '120px', pb: '80px' }}>
    <Grid item xs={12} md={6}>
      <HeroLeft />               {/* text, stats, CTAs */}
    </Grid>
    <Grid item xs={12} md={6}>
      <HeroRight />              {/* Clock canvas + floating badges */}
    </Grid>
  </Grid>

  <HeroBottomStrip />            {/* scroll + URL strip */}
</Box>
```

#### Sections to Keep Below Hero (Don't Remove for SEO)

Based on research of neramclasses.com, these sections must remain but get restyled:

| Section | Current | Redesign |
|---|---|---|
| **Why Neram** (15yr, Microsoft, IIT/NIT faculty) | Plain cards | Dark glass cards, gold numbers |
| **Courses** (NATA, JEE, Crash) | Basic listing | Feature cards with animated border |
| **Results / Rankers** (AIR 1&2, 189 rankers) | Text section | Dramatic stat display, monospace numbers |
| **aiArchitek Tools Intro** | ❌ Doesn't exist | **NEW: 6-card tool grid** |
| **Testimonials** | Basic cards | Dark carousel, gold quote marks |
| **Centers / Locations** | Text list | Map + city chip grid |
| **FAQ** | Accordion | Styled MUI accordion (dark) |
| **Footer** | Basic | Redesigned with logo, links, Tamil tagline |

#### Mobile-Responsive Hero Fixes (from prototype)

The prototype HTML file is desktop-only. For the Next.js component, these MUI breakpoints fix it:

```typescript
// CLOCK: On mobile, canvas shrinks to 280px and moves below text
const clockSize = { xs: 280, sm: 340, md: 460 };

// HERO GRID: Stack on mobile
<Grid container direction={{ xs: 'column', md: 'row' }}>

// HEADLINE: Use clamp (already done) + reduce padding on mobile
sx={{ px: { xs: 3, sm: 4, md: 8 } }}

// RANK BAR: Scroll horizontally on mobile
sx={{ overflowX: { xs: 'auto', md: 'visible' }, flexWrap: { md: 'wrap' } }}

// FLOATING BADGES: Hide on xs screens (they overlap on small screens)
sx={{ display: { xs: 'none', lg: 'flex' } }}

// NAV: Hamburger menu on mobile
// Use MuiDrawer for mobile nav
```

**Time: 3-4 days. Includes mobile fixes.**

---

### Phase 2 — Course & Results Pages

```
[ ] Courses listing page → dark theme, card grid
[ ] NATA-2026 spoke page → new layout, aiArchitek tools grid
[ ] Results / Rankers page → dramatic stat-heavy dark design
[ ] Faculty page → profile cards, dark theme
```
**Time: 1 week**

---

### Phase 3 — City SEO Pages (Light Theme)

> ⚠️ These pages are high SEO value. Use **light theme only**. Minimal visual change.

```
[ ] /en/coaching/nata-coaching/nata-coaching-centers-in-chennai → light theme wrapper
[ ] /en/coaching/nata-coaching/nata-coaching-centers-in-coimbatore → same
[ ] /en/coaching/nata-coaching/nata-coaching-centers-in-trichy → same
[ ] ... (all 20+ city pages)
```

Strategy: Wrap in `<NeramThemeProvider forceLight>` — MUI components instantly pick up gold/blue palette without touching content. SEO text stays 100% identical.

**Time: 2 days (mostly wrapping, not content change)**

---

### Phase 4 — Blog / FAQ / NATA-2026 Hub

```
[ ] /nata-2026 hub page (new) → dark theme, full aiArchitek branding
[ ] Blog → light theme (readability)
[ ] FAQ → dark theme accordion
```
**Time: 1 week**

---

## 5. SEO & AEO Protection Rules

### Never Break These

```
1. NEVER change <h1> text on existing pages
2. NEVER remove FAQ schema (JSON-LD)
3. NEVER change URL slugs
4. NEVER remove existing text content (hide visually if needed, not remove from DOM)
5. NEVER put hero text inside canvas (must remain in real DOM for crawling)
```

### AEO (AI Engine Optimization) — Keep These

Your `llms.txt` and structured content are already good. With the new design:

```
✅ Keep "AIR 1 & 2, 2024 & 2025" as text in DOM (not just in canvas)
✅ Keep "India's First AI-Enabled NATA Platform" in <h1> or prominent <p>
✅ Keep Microsoft Education mention as text
✅ Add structured data for new aiArchitek tools section:
   "@type": "SoftwareApplication", "name": "aiArchitek Drawing Evaluator" etc.
✅ Keep FAQ schema for NATA/JEE questions
```

### Performance Budget (New Design)

| Asset | Target |
|---|---|
| Blueprint grid | CSS only — 0 KB image cost |
| Clock animation | Canvas API — ~3 KB JS |
| Google Fonts | Preload subset — target < 40 KB total |
| Hero bundle | < 120 KB JS for hero |
| LCP target | < 2.5s (clock canvas should not block LCP text) |
| CLS | 0 (reserve canvas dimensions statically) |

**Key fix:** The clock canvas must have `width` and `height` attributes set statically so it doesn't cause layout shift.

```tsx
<canvas
  width={460}
  height={460}
  style={{ width: '100%', maxWidth: 460, height: 'auto' }}
/>
```

---

## 6. aiArchitek Tools Section — New Homepage Block

This is new content that doesn't exist yet. Add it below the hero.

### 6 Free Tools to Feature

| Tool | Icon | Description |
|---|---|---|
| NATA Drawing Evaluator | ✏️ | Upload drawing → AI scores it |
| Image Crop & Resize | ✂️ | NATA-spec image formatter |
| Eligibility Checker | ✅ | Am I eligible for NATA 2026? |
| Fee Calculator | 💰 | NATA + coaching fee estimator |
| Exam Center Locator | 📍 | Find nearest NATA center |
| AI Study Chatbot | 🤖 | RAG on NATA 2026 brochure |

### Section Design

```
Dark section, same blueprint background at 30% opacity
Section title: "Meet aiArchitek — Your Free AI Prep Companion"
Tamil subtitle: "இலவசமாக படியுங்கள்"
6 cards in 3x2 grid (2x3 on mobile)
Each card: Tool icon, name, 1-line description, "Try Free →" button
Bottom: "All tools are free. No sign-up required for most tools."
Powered by aiArchitek badge
```

---

## 7. Component Library — New Components to Build

Add these to `/packages/ui/src/components/`:

```
BlueprintBackground/     → animated grid + glow, reusable across pages
ClockCanvas/             → the living clock, accepts size prop
AnnounceBadge/           → "NEW · India's First..." pill
RankBar/                 → stat strip (AIR 1, 189 rankers, etc.)
GlassCard/               → backdrop-blur card, reusable
FloatingToolBadge/       → the floating "aiArchitek Tool" cards
aiArchitekPill/              → "Introducing aiArchitek" top-right badge
MicrosoftBadge/          → MS Education badge with logo
TamilTag/                → bilingual label component
SectionDivider/          → architectural line divider between sections
```

---

## 8. Implementation Checklist

### For Your Claude Code / Cursor Session

```bash
# Step 1: Create theme files
touch packages/ui/src/theme/tokens.ts
touch packages/ui/src/theme/darkTheme.ts
touch packages/ui/src/theme/lightTheme.ts
touch packages/ui/src/theme/NeramThemeProvider.tsx

# Step 2: Add fonts to layout
# Edit: apps/web/src/app/layout.tsx

# Step 3: Build BlueprintBackground component
touch packages/ui/src/components/BlueprintBackground/index.tsx

# Step 4: Build ClockCanvas component
touch packages/ui/src/components/ClockCanvas/index.tsx

# Step 5: Build HeroSection
touch apps/web/src/components/sections/HeroSection.tsx

# Step 6: Replace old hero in page.tsx
# Edit: apps/web/src/app/en/page.tsx

# Step 7: Test mobile at xs, sm, md, lg breakpoints

# Step 8: Lighthouse audit (target 90+ performance)
```

---

## 9. CLAUDE.md Additions for This Project

Add to your root `CLAUDE.md` so Claude Code remembers this context:

```markdown
## Design System
- Theme file: packages/ui/src/theme/
- Dark theme for: home, NATA-2026, tools, results pages
- Light theme for: city SEO pages, blog, FAQ
- Primary brand colour: #e8a020 (gold) — DO NOT use blue as primary
- Secondary accent: #1a8fff (electric blue) — used for AI features only
- Background: #060d1f (deep navy)
- Fonts: Cormorant Garamond (headings) + DM Sans (body) + Space Mono (captions)

## Design Concept
- "Neram" = Time. Clock-compass is our hero visual identity.
- Blueprint grid background = architectural credibility
- Gold = tradition, warmth, Tamil identity
- Blue = AI, technology, Microsoft

## aiArchitek
- Brand name for our free AI tools platform
- Lives at app.neramclasses.com/tools
- Introduced via hero badge: "Introducing aiArchitek · Free"
- Always show aiArchitek as electric blue (#1a8fff)

## SEO Rules (NEVER break)
- Never change <h1> text on existing pages
- Never change URL slugs
- Never remove FAQ JSON-LD schema
- Hero text MUST be in real DOM, not canvas
```

---

## 10. Quick Reference — Colour Usage Guide

```
Gold  (#e8a020) → Primary CTA buttons, numbers/stats, brand accents, hover states
Blue  (#1a8fff) → AI features, aiArchitek branding, second-hand of clock, links
Navy  (#060d1f) → Page background, button text on gold
Navy2 (#0b1629) → Cards, elevated surfaces
Cream (#f5f0e8) → Primary text on dark
Space Mono      → Stats, captions, Tamil "நேரம்" tag, technical labels

NEVER use:
✗ Pure white (#ffffff) as text on dark bg — use cream
✗ Purple gradients — not in our palette
✗ Inter or Roboto as display font — use Cormorant Garamond
✗ Generic blue (#2196f3) — use our specific blue (#1a8fff)
```

---

*This document should live at: `docs/DESIGN_SYSTEM.md` in your Neram monorepo.*  
*Update after each phase is complete.*
