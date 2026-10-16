# Handoff: Neram /apply flow on the unified marketing system

> Copied from the Claude Design project "Marketing Website Design Audit"
> (claude.ai/design/p/e64e277e-0654-4744-b1f0-5aee8cf37bb1), folder
> `design_handoff_neram_apply_flow/`, on 2026-10-16. The `.dc.html` references
> (`Apply Flow.dc.html`, `Nexus Showcase.dc.html`) live in that project.

## Overview
`/apply` (plus `/pay`, `/enroll`) runs its own theme today: `shellTheme` in `apps/marketing/src/components/apply/shell/ApplicationShell.tsx` (built on `neramaiArchitekLightTheme`, 0px radius, 2px ink `#14161b` borders, serif headings), `selectedCardSx` in `apply/styles.ts` (warm `#d9d6cf` / `#fff8e8`), the `NX` palette in `apply/showcase/palette.ts`, and MUI default greens/blues/oranges in `PaymentPanel.tsx` and `ApplicationDashboard.tsx`.

This handoff moves the whole flow onto the **same `neramTokens` system as the rest of the marketing site** (navy/gold/Inter, 8px radius) and redesigns the left-hand **NexusShowcase** animation so it is easier to follow. **Flow logic, validation, API calls, auth, analytics and i18n keys do not change.** Only presentation changes.

## About the design files
The two `.dc.html` files are **design references built in HTML**, prototypes showing intended look and behaviour, not production code. Recreate them in `apps/marketing` with MUI v5 (`@neram/ui`), the existing `FormContext`, `next-intl` messages (`messages/*.json` → `apply.*`) and the existing components' props. Do not ship the HTML. Its Tweaks panel switches `screen` (flow / dashboard / enrolled), `startStep` (0–3), `signedIn` and `annotations`.

## Fidelity
**High fidelity.** Colours, type, spacing, radii, copy and motion timings are final. Sample data is labelled "SAMPLE" in the design (programme fees, centres, payment amounts, application numbers, chapter counts, chat text, student count). Keep wiring these to the existing sources: `ProgrammePicker` / fee_structures, `/api/centers`, `/api/payment/details/[id]`, `submittedApplication`.

---

## Design tokens (all from `neramTokens` / `siteTokens`, no new values)
| Token | Hex | Use in this flow |
|---|---|---|
| navy.900 | `#060d1f` | Shell header, showcase panel, selected pills/cards (fill or 2px border), icon tiles, checkbox checked, help band |
| navy.800 | `#0b1629` | Showcase window chrome, image fallbacks |
| navy.700 | `#122040` | Avatar |
| paper | `#f5f0e8` | Text on navy |
| paper.muted | `rgba(245,240,232,0.72)` | Body copy on navy |
| paper.subtle | `rgba(245,240,232,0.62)` | Stat labels, inactive tour labels (0.55) |
| line.dark | `rgba(255,255,255,0.08)` | Rules on navy (window border 0.12, outline buttons 0.24) |
| gold.500 | `#e8a020` | **Primary button fill only**, step bar done/current, eyebrows on dark, selected-card top inset, highlight rails |
| gold.300 | `#f4bf5a` | Primary hover |
| gold.800 | `#8a5a05` | Eyebrows/check icons/savings text on white |
| ground | `#FAFBFC` | Page body, row hover, summary fills |
| surface | `#ffffff` | Form column |
| line | `#E1E5EB` | Card borders (2px on choice cards), row rules |
| line.strong | `#c5ccd4` | Input borders (1px), outline buttons |
| ink | `#1A2027` | Text, 1px "section top" rule on ruled lists |
| ink.muted | `#55606c` | Helper and secondary text |
| success | `#2E7D32` | **Only** "Verified", "PIN found", "Coupon applied", "Payment received" |
| error | `#c62828` | Field error text, 3px inset rail on the error summary |
| status dots | amber `#f4bf5a` draft, blue `#5aa9ff` submitted, green `#3fae5a` approved/enrolled/live | Dashboard status pills, live dot |

**Delete** from the apply folder: `INK #14161b`, `#d9d6cf`, `#a9a49a`, `#f4f3ef`, `#fff8e8`, `#fdebc4`, `#E8F5E9`, `#E3F2FD`, `#FFF3E0`, `#FFE0B2`, `#F57C00`, `#E65100`, `#FF0000`, the confetti colours, and the whole `NX` palette (map to the tokens above).

Typography: Inter everywhere, mono `ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace` for eyebrows/numbers only, Museo for the wordmark only. Drop the serif in the showcase.
| Role | Spec |
|---|---|
| Step H1 | 800 · `clamp(2rem,4.5vw,3rem)` · lh 1.08 · ls −0.01em |
| Step subtitle | 400 · 17px · lh 1.55 · ink.muted |
| Section H2 (Your studies, A few more details) | 800 · 22px |
| Question label (h2) | 700 · 17px |
| Field label | 600 · 15px, 8px above the control |
| Input text | 16px (never smaller) |
| Helper | 13px · lh 1.45 · ink.muted |
| Eyebrow | mono 700 · 12px · ls 0.2em · uppercase · gold.800 (white) / gold.500 (navy) |
| Stat number | mono 700 · 22px · gold.500 |

Shape: radius **8px** inputs, buttons, cards, panels; **6px** inside the showcase window; **4px** tags/checkbox; **100px** pills. Shadows: none on white. Showcase window `0 24px 48px rgba(0,0,0,0.35)`. Help menu `0 24px 48px rgba(6,13,31,0.28)`. Focus everywhere: `outline 2px solid #e8a020; offset 2px`. Inputs on focus: border navy.900 + `0 0 0 3px rgba(232,160,32,0.35)`.

---

## Shell (`ApplicationShell.tsx`)
Replace `shellTheme` with the site theme; remove the `createTheme(neramaiArchitekLightTheme, …)` overrides (the components below carry their own styles).
- **Header**: sticky, navy.900, 64px, 1px line.dark bottom, `max-width 1680px`, padding 0 24px (matches `Site Header` geometry so the logo does not jump from "Join Now"). Slots left to right:
  - `BrandWordmark` (dark variant)
  - flexible spacer
  - "Secure application": `lock` 18px + 14px paper.muted, 1px `rgba(255,255,255,0.12)` right divider. Hidden < sm.
  - **"Need help?"** outline button: 44px, padding 0 14px, 1px `rgba(245,240,232,0.24)`, radius 8, 14px/600, `help` icon, hover border gold.500. Opens a menu: white, radius 8, 1px line, mega-menu shadow, 280px wide, 52px rows with 1px line separators, icons ink.muted. Rows: Call us +91 91761 37043 · Book a free demo class · Contact page.
  - "Log in" text button (44px, 14px/600, paper) while `useShellLogin` has a handler. Signed in: 40px avatar ring `rgba(255,255,255,0.16)` around a 32px navy.700 initial.
  - Drop "Have an account?".
- **Footer**: white, 1px line top, padding 8px 24px. Terms · Privacy · Refund policy as 44px-tall 14px ink.muted links; "© Neram Classes" right.

## Layout (`ApplyLayout.tsx`)
`display:flex; flex-wrap:wrap`.
- **Showcase aside**: `flex 1 1 420px`, navy.900 with the blueprint grid (white 0.035 @ 40px, gold 0.06 @ 200px). Inner box `position:sticky; top:64px`, padding `48px clamp(24px,4vw,56px) 40px`.
- **Form column**: `flex 1 1 560px`, white, content centred `max-width 720px`, padding `48px clamp(16px,4vw,48px) 56px`, gap 28px.
- Below ~1000px the aside wraps above the form. On phones keep the showcase above the form; consider collapsing it to the caption + window only.

## StepShell / StepIndicator
- Eyebrow "Apply · Neram Classes" (gold.800).
- **Step bar**: 4-column grid, 8px gap. Each step is a button with a 4px bar on top (radius 2; gold.500 if done or current, line otherwise), then mono 12px/700 "01" and a 14px label (700 current / 600 other). Labels: About you · Course · Review · Pay. Completed steps clickable; future disabled. `aria-current="step"` on the current one; the `<ol>` carries `aria-label="Step n of 4"`.
- H1 + subtitle from `apply.{step}.title/subtitle`. On Pay, add mono 14px/700 ink.muted "Application {number}".
- **Error summary** (validation fails on Continue): white, 1px line, `inset 3px 0 0 #c62828`, radius 8, padding 16×20. Title "A few things need your attention" 15px/700, then a bulleted 14px list of `errors.*` messages.
- **Action block**: 1px line top, 24px top padding.
  - Primary button: full width, 56px, radius 8, gold.500 fill, navy text, 16px/800, label left, `arrow_forward` right (`justify-content:space-between`), hover gold.300. Busy = spinner replaces the arrow.
  - Row below: "Back" (`arrow_back`, 15px/700, 44px) left; the 13px ink.muted note right.
  - Steps 1–2 also show `DemoNotSureLink` as an underlined 14px/600 link with a `videocam` icon.

## Step 1 · About you (`AboutYouStep.tsx`, `fields/*`)
- **GoogleCard**: full-width button, min-height 76px, padding 14×20, 1px line.strong, radius 8, hover border gold.500. 40px G tile (1px line, radius 8), title 17px/700 + body 14px muted, `arrow_forward`.
- **OrDivider**: 1px line rules either side of a mono 12px/700 0.2em uppercase label in ink.muted.
- Welcome-back alert: white, 1px line, `inset 3px 0 0 #2E7D32`, 15px.
- Field grids: `repeat(auto-fit,minmax(min(100%,240px),1fr))`, gap 20px × 16px.
- **TextField**: 48px, 1px line.strong, radius 8, padding 0 14px, 16px, white; placeholder `#6b7480`. Replaces the 2px ink border.
- **Phone**: one 48px bordered group: +91 prefix segment (ground fill, 1px line right, 16px/700, `expand_more`), the input, a trailing slot with "Verify" (underlined 15px/700) once 10 digits, or a green `verified` "Verified" label.
- **Segmented** ("I'm currently in", Gender, category, exam year): grid `repeat(auto-fit,minmax(120px,1fr))`, gap 8px (no joined borders). Pills 48px, radius 8, 15px/600. Unselected = white + 2px line; selected = navy.900 fill + 2px navy border + paper text. `role="radio"`.
- **PlaceField**: H2 "Where you live" 17px/700, PIN input (max-width 280px). Found: green `check_circle` + **City, State, India** 15px/700 + "Edit place" underlined button. Below, two 44px text buttons: `my_location` "Don't know your PIN? Use my location", `public` "Live outside India?".

## Step 2 · Your course (`YourCourseStep.tsx`, `ProgrammePicker`, `YourStudiesBlock`, `FeeSummaryCard`, `styles.ts`)
**Rewrite `selectedCardSx`**:
- Base: white, `2px solid #E1E5EB`, radius 8, padding 16×18, content **left-aligned** (no centred cards).
- Selected: `2px solid #060d1f` + `box-shadow: inset 0 3px 0 #e8a020`, navy `check_circle` 22px top right.
- No tint fill.

Sections separated by 1px line top + 28px padding.
- **Exam cards**: grid `minmax(min(100%,140px),1fr)`. 40px navy icon tile with gold glyph (`architecture`, `school`, `join`, `help`), 17px/700 label, 13px muted body.
- **ProgrammePicker**: ruled radio list (1px ink top rule). Rows min 64px, 1px line bottom: 20px radio (2px line.strong, selected 2px navy with 10px navy dot), label 16px/700 + note 14px muted, fee 15px/700 right. Selected row: ground fill + `inset 3px 0 0 gold.500`.
- "Not sure" notice: white card, gold 3px inset rail, outline "Ask us to call you" button.
- **Learning mode**: 2 cards (`groups` Hybrid, `laptop` Online only), grid `minmax(min(100%,220px),1fr)`.
- **Centres** (hybrid only): same cards with name 16px/700, `location_on` + city 14px muted. Toggle to deselect. "View all centres with directions" underlined 14px/600 link opens the existing dialog, restyled with the same tokens.
- **Your studies**: H2 22px/800 + subtitle. Category as segmented pills. School name + board (inputs/selects at the 48px spec), exam year as pills (min-width 96px). "More details (optional)" disclosure row (56px, 1px line top/bottom, `expand_more`) holding school type + category selects.
- **FeeSummaryCard**: white, 1px line, **3px gold top border**, radius 8, padding 20×24. Mono "YOUR FEE" eyebrow, programme 17px/700, amount 26px/800 right, "Installments available. Coupons at payment." 14px muted.
- **Callback band**: navy.900, radius 8, padding 20×24. "Need more information?" 17px/700 + 14px paper.muted body. Outline button `phone_callback` "Ask us to call you" (1px `rgba(245,240,232,0.4)`, hover gold). Opens the existing callback dialog, restyled.

## Step 3 · Review (`ReviewStep.tsx`)
- "A few more details": DOB (date input), parent mobile (+91 prefix group), gender pills (3 columns, max-width 420px), address textarea (2 rows, same border spec) + helper.
- **Summary groups** are rules, not cards: 1px ink top border, 16px/20px padding. Header: H2 17px/700 + outline "Edit" button (`edit`, 44px, 1px line.strong, hover navy fill/paper text; aria-label "Edit {section}"). `<dl>` grid `minmax(min(100%,200px),1fr)`: dt 13px muted, dd 15px/600. Verified phone: green `verified` "Verified" 12px/700.
- **Terms**: full-width checkbox row, ground fill, 1px line, radius 8, padding 16×20. 24px box radius 4, 2px line.strong; checked = navy fill with paper `check`. Copy `review.terms`; links stay underlined 600 and open `LegalDrawer`.

## Step 4 · Pay (`PayAndEnrolStep.tsx`, `PaymentPanel.tsx`)
- **Enrolment row**: 1px ink top rule. "Your enrolment" 13px muted, programme 17px/700, "{mode} · Includes Neram Nexus, Microsoft Teams and study materials" 14px muted. Outline "Change details" button right (hidden once payment is locked).
- **Plan cards** use the same `selectedCardSx`.
  - Full: "Pay in full" + navy pill "BEST VALUE" (gold text, 11px/700, ls 0.08em). Amount 28px/800, struck base 15px muted, "You save ₹X" 14px/700 gold.800.
  - Installment: "2 interest-free parts", amount 28px/800 + "now", "+ ₹X in N days".
- **Coupon**: label, 48px input (uppercase) + outline "Apply" button (1px ink, hover navy fill). Success: green `check_circle` "Coupon applied. You save ₹X." The "special coupon" notice becomes a 13px muted line, not a blue alert.
- **YouTube save**: white, 1px line, radius 8. 40px navy tile with gold `smart_display`, title 15px/700 + 13px note, outline "Subscribe" button. **No red YouTube styling.** Applied = note changes, button hides.
- **Fee summary**: ruled `<dl>` (1px ink top, 1px line rows, 15px dt muted / dd 600). Discounts read "− ₹X" in ink, not green. Final row "Amount to pay" / "Pay now (first part)" with amount 24px/800.
- **Payment method**: radio rows, min 64px, radius 8, 2px line (selected 2px navy), radio + muted icon (`credit_card`, `account_balance`) + title 15px/700 + body 13px. Direct transfer shows a ground info box (UPI ID, amount).
- Deadline/errors use the white card + 3px inset rail pattern (amber `#f4bf5a` deadline, error red errors).
- "What happens after payment": 15px/700 title, 14px rows with gold.800 `check`.
- **Pay button**: standard primary (gold, 56px, `lock` icon right), label "Pay ₹X". Direct transfer disables it at 50% opacity with label "Contact support to confirm a transfer". **Not green.** 13px muted terms line below.
- **Remove** `canvas-confetti` and the bouncing savings banner; the inline green "Coupon applied" line replaces them.

## Enrolled / success state (PaymentPanel success branch)
1. 56px navy tile with gold `verified` icon.
2. Eyebrow "PAYMENT RECEIVED" (success green).
3. H1 "You're enrolled, {firstName}".
4. Muted line.
5. Ruled `<dl>`: Receipt (mono 700), Course, Date, Total paid (18px/800).
6. "What happens next": ordered list with 24px navy circles holding gold numbers.
7. Primary "Go to the student app" with `north_east`.
8. Outline "Download receipt" with `download` (`ReceiptDownload`).
9. 13px muted refund line with "Request a refund" link (`RefundRequestButton`).

## Returning-user dashboard (`ApplicationDashboard.tsx`)
- Eyebrow "YOUR APPLICATIONS", H1 "Welcome back, {name}", muted line.
- **Application card**: white, 1px line, radius 8, hover border gold.500.
  - Body (padding 20×24): mono 14px/700 number left; status pill right (100px radius, 1px line, ground fill, 13px/700, **8px status dot**: amber draft, blue submitted/under review/pending, green approved/enrolled).
  - Course 19px/700 + 14px muted meta line.
  - Approved adds a 1px-rule block with fee (24px/800, struck base, gold.800 savings).
  - Footer: ground fill, 1px line top, padding 12×24. Approved: primary "Pay and join". Draft: outline "Continue"; submitted/draft/pending: "Edit". Outline "View", spacer, "Delete" as underlined muted text button (**not a red outlined button**).
- **Remove** the green/orange tinted status panels and green/orange buttons. Partial payment: amber dot + standard primary "Complete remaining payment" + 6px progress bar (gold on line).
- "Start another application": 52px dashed 1px line.strong button with `add`.

---

## NexusShowcase redesign (`showcase/NexusShowcase.tsx` + `scenes/*`)
Reference `Nexus Showcase.dc.html`. Keep: pause button, prev/next, pause while tab hidden or panel off-screen, `prefers-reduced-motion` = no autoplay and every scene in its final state, `videoSrc` override. Restyle and re-script the scenes.

**Panel** (top to bottom, gap 22px):
1. Eyebrow "Inside the Nexus app" (gold). No blinking square.
2. Headline: Inter 800 `clamp(1.75rem,3vw,2.5rem)` lh 1.12; "architecture entrance." in gold.500 (not italic serif).
3. **Scene caption** (`aria-live="polite"`, min-height 60px): mono 26px/700 gold "01" left, then scene title 13px/700 uppercase paper.subtle and caption 18px/600 lh 1.4.
4. **App window**: radius 8, 1px `rgba(255,255,255,0.12)`, navy.800 chrome, shadow as above.
   - 40px chrome: "Nexus" 14px/800, tabs Studio · Question bank · Library · Sketchbook · Live (12px/600, active = paper + `inset 0 -2px 0 gold`, inactive 0.55), Teams badge right.
   - Content area **white**, `aspect-ratio 16/10`.
5. **Controls row**: 44px play/pause; a 7-column grid of clickable segments (12px label + 3px bar: done 0.55 paper, current gold filling over the scene, future 0.2); 44px prev/next. All three buttons 1px 0.24 outline, radius 8, hover gold.
6. StatStrip: AIR 1 · 10,000+ · Global (site `StatStrip` component).

**Timing**: 7s per scene (prop `sceneSeconds`, 4–12) + 0.6s hold, then advance and loop. Jumping restarts the scene. Easing ease-out cubic `1-(1-x)^3` everywhere. "Appear" = opacity 0→1 + translateY 8px→0 over 0.45s. "Pop" = opacity + scale 0.6→1 over 0.35s. Line drawing uses `pathLength="1"` + `stroke-dasharray:1` with dashoffset 1→0. Times are seconds from scene start for a 7s scene; scale proportionally for other lengths.

| # | Scene | Tab | Caption | Script |
|---|---|---|---|---|
| 01 | Review | Studio | Your teacher marks up your drawing and explains each fix. | Grid 1.6fr / 1fr. **Left:** `drawing-1215` cover + SVG overlay (viewBox 1215×680, slice). Gold 7px strokes draw: line 1 at 0.4–1.3, the two corner strokes 2.0–2.9, the ellipse (cx748 cy372 rx118 ry102) 3.6–4.6. Numbered markers (r30 navy, gold 4px stroke, 34px paper numeral) pop at 1.1 / 2.7 / 4.4. **Right:** HB avatar + "Ar. Hari Babu / Reviewing your plate", then three numbered notes appearing at 1.2 / 2.8 / 4.4; the newest note gets ground fill + 3px gold inset. Voice bar: 4px navy fill 0→100% over 6.4s, timer 0:00→0:24. |
| 02 | Revise | Studio | Fix it, resubmit, and watch your score climb. | Grid 1.2fr / 1fr. Drawing + "Revision 2" tag; gold "Resubmitted ✓" chip at 0.5. Right: "Your score" 26px/800 counts 4.3→5.0. Four rubric rows, 6px bars (before value grey `#55606c`, turning gold at 5) filling from 1.4 with 0.5s stagger, 0.7s each. Navy "Full marks · Fixed in one revision" banner at 4.4. |
| 03 | Predict | Question bank | AI ranks the chapters most likely to appear this year. | **Replaces the unlabelled scatter plot.** Header "Most likely chapters · 2027 / JEE Paper 2A · from 17 years of papers" + navy "AI PREDICTOR" tag. Five ranked rows (30px): 3D geometry 16, Sequences & series 15, Probability 13, Applications of derivatives 11, Mensuration 9. Rows appear at 0.3 + 0.4i. Each 8px bar fills to n/17 (gold for top 3, `#8792a0` for the rest) with a counting "n/17". At 4.4 the top 3 get gold tint `rgba(232,160,32,0.12)` + 3px inset rail; footnote "Start with the top 3…" at 4.6. |
| 04 | AI tutor | Question bank | Stuck on a question? Ask the tutor, step by step. | Left: question card (mono eyebrow, 13px/600 question, Video / Image / **AI tutor** tabs) + "Answer 24" card with gold rail appearing at 3.5. Right (ground): chat bubbles. Student (navy, right) at 0.4 and 3.3. Tutor (white, 1px line, left) **types character by character** at 1.2 for 1.6s and at 4.2 for 1.0s, with a ▍ caret. Input stub at bottom. |
| 05 | Library | Library | 3,000+ recorded classes, searchable by topic. | Search field types "3D geometry" over 0.6–1.8 with navy caret. Count changes "3,000+ classes" → "48 classes found" at 2.1. 3×2 grid of thumbnails (lib-1…6, duration badge, 11px title) appears staggered. At 2.1 non-matching thumbs fade to 25% and matches get a 2px gold outline. |
| 06 | Sketchbook | Sketchbook | Sketch digitally, with inspiration for every drawing question. | Left: "Your sketchbook · Page 12" dot-grid canvas. Two-point-perspective block draws: ink box 0.3–1.9, gold vanishing lines 2.0–2.8, openings 2.8–3.8. Right: "Inspiration for this question" 2×2 (insp-1…4) appearing from 3.4 with 0.3s stagger. |
| 07 | Live | Live | Live classes in Microsoft Teams, with answer pads. | `live-1360` cover. Pill "● LIVE · NATA drawing class" (green dot pulsing in opacity, not scale). Student count rises 96→128 over 0.2–1.8. Answer pad card (white, radius 8) rises in at 0.8 with options A–D: C selected (navy) at 2.0, status "Submitted ✓" at 3.0, result "Class chose C 72%" with gold bar filling 4.0–4.8. |

Implementation note: drive each scene from one `elapsed` value (rAF) or CSS animations with the delays above. CSS `@keyframes` with `animation-delay`, as the current scenes do, is fine and cheaper. Keep `data-motion="paused|off"` for pause and reduced-motion. Minimum text size inside the window is 11px. Remove the `blink`, `ring` and `wave` loops and the orange/red strokes.

---

## State (unchanged)
Everything stays in `FormContext` / `ApplyFlow`: `activeStep`, `formData.{personal,academic,course,location}`, `termsAccepted`, `showPhoneVerification`, `submittedApplication`, `returnUserMode`, and PaymentPanel's `selectedScheme`, `paymentMethod`, `couponCode/Applied`, `youtubeCouponApplied`. The showcase owns `scene`, `paused` and `elapsed`. The prototype's simulated pieces (Google fills sample data, Verify marks the phone verified instantly, NERAM10 = ₹1,000, Pay goes straight to enrolled) stand in for the real `LoginModal`, OTP, `/api/coupon` and Razorpay flows.

## Rollout
1. Swap `shellTheme` for the site theme. Rewrite `selectedCardSx`, `Field`, `Segmented`, `GoogleCard`, `OrDivider`, `StepIndicator`, `StepShell`. This alone fixes most of steps 1–3.
2. YourCourseStep cards/ProgrammePicker/FeeSummaryCard and the callback band, then ReviewStep groups and terms.
3. PaymentPanel + PayAndEnrolStep + the success state. Remove confetti.
4. ApplicationDashboard, plus `PaymentDialog`, `ViewApplicationDialog`, `RefundRequestDialog` and `LegalDrawer` with the same tokens (8px radius, navy title, gold primary).
5. NexusShowcase scenes. Delete `palette.ts` `NX` and update `keyframes.ts`.
6. Add the hex-literal lint rule to `components/apply/**`. Keep `ApplyFlow.test.tsx`, `StepIndicator.test.tsx` and `NexusShowcase.test.tsx` passing; their labels and aria are unchanged.

## Assets
- `assets/apply/*.webp` are copies of `public/images/apply/nexus/` (drawing-680, live-680, lib-1…6, insp-1…4). In code use the existing `img()` helper with the srcSets.
- Icons: Material Symbols Outlined in the prototype; use the matching `@mui/icons-material/*Outlined`.
