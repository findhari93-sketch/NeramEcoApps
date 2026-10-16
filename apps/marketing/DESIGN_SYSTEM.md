# Marketing design system

One token set, two surfaces. Every page opens dark (a `PageHero`) or light (a `DocHeader`), reads light, and closes dark (`CtaBand`, then the footer).

- **Spec:** `Docs/Marketing Website Design Audit/design_handoff_neram_marketing_system/README.md`. Start with `designs/Marketing Site Index.dc.html` in a browser.
- **Rendered reference:** `/design-system`, available on local and staging only (404 on production).
- **Tokens:** `packages/ui/src/theme/site-tokens.ts` (`siteTokens`), the single source of truth.
- **Themes:** `packages/ui/src/theme/site-2026.ts` (`siteLightTheme`, `siteDarkTheme`). `marketingLightTheme` and `neramaiArchitekDarkTheme` are aliases of these.
- **Components:** `src/design-system/`. Import from `@/design-system`.

## Rules

1. **No hex in `sx` or `style`, anywhere in the app.** Use `tokens` from `@/design-system` (server code: `siteTokens` from `@neram/ui/site-tokens`). Other companies' brand colours (WhatsApp, YouTube) and the one error red come from `brandColors` / `errorColor` in `design-system/brand-colors.ts`. ESLint enforces this for every file in `src` (`.eslintrc.json`, `no-restricted-syntax`).
2. **Gold fill is for the primary action only** (`CtaButton variant="primary"`). Gold text on white fails contrast. On light, gold text is `tokens.gold800`.
3. **Inter everywhere, plus one mono stack** (`tokens.fontMono`) for eyebrows and stats. Museo is for the wordmark only. Poppins, Plus Jakarta Sans, Cormorant, DM Sans and Space Mono are banned by lint. Tracked mono labels that show translated text spread `indicLabelSx` (already inside `eyebrowSx`): Tamil, Hindi, Kannada and Malayalam fall apart under letter-spacing, so on those pages the label drops to Inter at 13px with normal spacing.
4. **Shape:**
   - Radius is 8px for cards, buttons, inputs and panels, and 100px for pills. Nothing else.
   - On light surfaces, use borders instead of shadows.
   - No glass, no `backdropFilter`, no radial glows, no lift on hover.
   - Hover means the border turns `gold500`.
5. **Icons:** `@mui/icons-material/*Outlined` only. No emoji in the UI.
6. **Focus:** a 2px `gold500` outline with a 2px offset. `globals.css` and the components already apply it, so don't remove it.
7. **Mobile first:**
   - Lay out with `auto-fit` / `flex-wrap`.
   - Touch targets are at least 44px; primary CTAs are 48 to 56px.
   - Body text is never below 16px on phones.
8. **Motion:** respect `prefers-reduced-motion`. No ambient animation (pulse, float, blink).
9. **Copy:** no em dashes or `--` in visible text. For an unloaded stat, show a skeleton (`StatStrip` with `value: null`), not a dash.

## Which component for which pattern

| Pattern | Component |
|---|---|
| A full-width band | `Surface tone="dark" \| "light" \| "white"` (dark scopes the dark MUI theme) |
| A band with the standard container and padding | `Section` (`width`: page 1200, narrow 900, article 780, legal 700) |
| Dark page opener with stats or an aside | `PageHero` |
| Light opener for long-form pages (guides, colleges, counselling, legal) | `DocHeader` |
| Eyebrow + h2 + lede | `SectionHeader` (or `Section header={...}`) |
| Any button or CTA link | `CtaButton` (`primary`, `outline`, `navy`, `link`) |
| Gold numbers on dark | `StatStrip` |
| Icon tile + title + body | `FeatureCard`; `ToolCard` when the whole card links |
| Coaching programme | `ProgramCard` (`highlight` adds the gold top and "Most Popular") |
| Course with an image | `CourseCard` |
| FAQ | `FaqList`, fed the same array as the page's FAQPage JSON-LD |
| Breadcrumb | `Breadcrumb` (keep the page's BreadcrumbList JSON-LD) |
| Closing band | `CtaBand` |
| Light card inside a dark band (hero aside) | `LightScope variant="card"` |
| Course detail / city page body with a sticky side card | `AsideLayout` (T1, T6) |
| Fee or plan card, course aside | `FeeCard` |
| Facts as label/value rows (hero aside, city facts) | `FactsCard` |
| Curriculum subject, topic group | `TopicCard` |
| "Features as a ruled list", short tick lists | `CheckList` (`ruled` or `compact`) |
| Faculty and team | `PersonCard` (initials on navy700 when there is no photo) |
| Navy box in the page or article flow | `InlineCta` |
| Empty, signed-out or "not yet" state | `EmptyState` |
| Filter or option pills | `Pill` (selected = navy fill, `aria-pressed`) |
| Hero-aside quick check (tool pages) | `QuickCheck` + `QuickCheckResult` (navy result block) |
| "How it works" numbered cards | `StepList` |
| Compact row link (related tools, nearby cities, also read) | `LinkTile` |
| Row card with a code or icon tile (syllabus parts, steps, documents) | `InfoCard` |
| One article block (h2 + intro + content) | `ArticleSection` |
| Note, caution or confirmed fact in an article | `Callout` (`tone="success"` for green) |
| A "don't" list | `CheckList tone="no"` |
| Counselling or exam status | `StatusBanner` (`live`, `tbd`, `coming-soon`) |
| Schedule with done / now / next | `Timeline` |
| At-a-glance facts as a grid | `FactGrid` (`FactsCard` is the stacked aside version) |
| Tables | `DataTable` (scrolls inside itself on phones) |
| Side rail of links (related guides) | `NavCard` |
| Guide rail (desktop column, phone pill scroller) | `GuideNav` |
| Hub card (icon, badge, title, description, action line) | `HubCard` |
| Reviews masonry | `ReviewWall` + `ReviewCard` |
| Sticky filter strip under a hero | `FilterBar` + `FilterSelect` |

## Templates

| Template | Component | Used by |
|---|---|---|
| T1 Course detail | `AsideLayout` | `/courses/[slug]`, `/fees` |
| T2 Exam guide article | `GuideArticle` (DocHeader + `GuideNav` rail + 780px article) | NATA, AAT and PGETA spokes, counselling concepts, blog posts |
| T3 Hub index | `HubIndex` (client: search + category tabs on the hero edge) | `/tools`, `/counseling`, `/blog` and other hubs |
| T5 Counselling detail | `DocHeader` + `DocLayout` (end rail) | `CounsellingHubPage` (26 bodies), `CounsellingSpokeShell` (TNEA, KEAM) |
| T6 City coaching | `PageHero` + `AsideLayout` with a `LeadCard` | `components/coaching-location/*`, Chennai areas |
| T7 Tool page | `components/tools/ToolLandingPage` (QuickCheck in the hero aside) | 13 `/tools/[slug]` pages |
| T8 Social proof | `PageHero` stats + `FilterBar` + `ReviewWall` | testimonials, reviews, achievements, alumni |
| T9 Legal | `LegalPage` (policy pill switcher, "On this page" rail, 700px) | `/terms`, `/privacy`, `/refund-policy` |

### Apply flow (`/apply`, `/pay`, `/enroll`)

Spec: `Docs/Marketing Website Design Audit/design_handoff_neram_apply_flow/` (README + `nexus-showcase-reference.md`).

- `components/apply/shell/applyTheme.ts` is the flow's theme. It is the site light theme plus the form pieces, so plain MUI controls already match the design:
  - inputs are 48px with a 1px lineStrong border and a navy border with a gold ring on focus
  - ToggleButtons are separate pills with a navy fill when selected
  - checkboxes and radios turn navy when checked
  - Alerts are a white card with a 3px coloured inset rail (never a tinted fill)
  - contained success and warning buttons render as the gold primary
- `ApplicationShell` gives /apply, /pay and /enroll the navy 64px header: wordmark, "Secure application", the "Need help?" menu, then "Log in" or the initial.
- `components/apply/styles.ts` holds the shared pieces: `selectedCardSx` (2px line, selected = navy border plus a 3px gold top inset), `iconTile40Sx`, `railCardSx(color)`, `outlineButtonSx`, `applyEyebrowSx`.
- `ApplyLayout` places the navy blueprint showcase aside (`flex 1 1 420px`, sticky) next to the white form column (`flex 1 1 560px`, max 720px). They wrap below about 1000px.

### Site Header and Footer

- **State map:** `components/header/header-state.ts` (`getHeaderState`). One table decides the secondary button (Free demo, My demo, My enrollment), the gold primary (Join Now, Continue application, Track application, Pay & join, Go to App, Need help?), the status dot (`statusDraft`, `statusReview`, `statusDone`) and the gold avatar ring. Add a state there, never colours in `Header.tsx`. Tests: `components/header/header.test.ts`.
- **Width tiers:** `components/header/header-tier.ts`. These are CSS container queries on the header container (`fromTier('compact')`), so there's no flash on load.
  - 1240px and up: everything in full.
  - 1060 to 1239px: Free demo goes icon-only and the primary drops " application".
  - 900 to 1059px: Counseling, About and Free Tools fold into **More**.
  - Below 900px (viewport `md`): the phone bar.
- **Surface:** `components/header/header-tone.ts`. The header is white with a 1px line on DocHeader pages (`/colleges/**`, exam guide spokes, `/counseling/*`, blog posts, legal, `/support/track`) and navy everywhere else. When you add a light page template, add its route there.
- **Nav data:** `components/nav/nav-groups.tsx` (`NAV_GROUPS`; `inMore` marks the groups that fold into More). Panels: `nav/MegaMenuPanel.tsx`.
- **Account:** `AuthButton` (Log in, or the 40px avatar ring and menu; it reserves 92px while auth loads) and `UserNotificationBell` (44px, gold unread dot). The drawer's "Log in" calls `requestLogin()`.
- **Broadcast banner:** gold500 with navy text, for every broadcast style.
- **Footer:** `components/Footer.tsx` has five auto-fit columns (About, Quick Links, Resources, Top Cities + Top States, B.Arch Counselling), then the Nexus promo row and the legal row. Every link is kept for internal linking.

`DocLayout` is the shared body of the light long-form templates: `asideAt="start"` for a guide rail, `"end"` for related links, `articleWidth="legal"` for the 700px measure.

Surface-aware colours: `Surface` sets CSS variables (`--ds-fg`, `--ds-muted`, `--ds-eyebrow`, `--ds-line`, …) and components read them through `v` in `tokens.ts`. The same component therefore works on dark and light bands without theme callbacks, which keeps it usable from server components.

## Gotchas

- `CtaButton`, `Breadcrumb`, `FeatureCard` and `FaqList` use the locale-aware `Link` from next-intl. Outside `[locale]`, wrap the route in a client `NextIntlClientProvider` (see `src/app/design-system/EnglishIntl.tsx`). The server provider runs the `[locale]` request config and 404s.
- `@neram/ui`'s barrel is a client module. In server code, import tokens from `@neram/ui/site-tokens`, not `@neram/ui`.
- Translated pages (About, Fees, Scholarship, and anything using `useTranslations`): never hard-code an English eyebrow, breadcrumb or button label. Use a translated key, or leave the eyebrow out. Labels already translated elsewhere can be passed in with `ClientIntl namespaces={['about', 'header.freeDemoClass']}`.
- `CtaButton` with an href starting `#`, `tel:` or `mailto:` renders a plain `<a>`. Use `variant="success"` only for "Go to App" (enrolment status).
- Light theme: `primary.main` is navy900 (selected states, app bars, fills) and `secondary.main` is gold800 (gold text). Contained primary MUI buttons are overridden to the gold fill.

## Rollout status

| Phase | Scope | State |
|---|---|---|
| 1 | Tokens, themes, `globals.css`, Poppins removed | Done |
| 2 | Components, `/design-system`, Home | Done |
| 3 | Site Header state map + width tiers + light/dark tone, mega menu, broadcast banner, Site Footer | Built locally |
| 4 | Coaching, Courses, Fees, About, Demo class, Premium, Scholarship, NATA online / entrance coaching | Done |
| 5 | Templates T2 to T9, then the hex lint rule site-wide | Built locally: T2, T3, T5, T6, T7, T8, T9; T4 (college hub) is a token-only pass so its approved canvas layouts stay. Last hex pass (counselling, guides, chat, social proof, OG images, error pages) done; the lint rule now covers all of `src` |
| Apply | `/apply` flow, showcase, dashboard, pay and success (Apply Flow handoff) | Built locally |
