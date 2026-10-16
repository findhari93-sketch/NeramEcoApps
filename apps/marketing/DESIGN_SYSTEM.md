# Marketing design system

One token set, two surfaces. Every page opens dark (a `PageHero`) or light (a `DocHeader`), reads light, and closes dark (`CtaBand`, then the footer).

- **Spec:** `Docs/Marketing Website Design Audit/design_handoff_neram_marketing_system/README.md`. Start with `designs/Marketing Site Index.dc.html` in a browser.
- **Rendered reference:** `/design-system`, available on local and staging only (404 on production).
- **Tokens:** `packages/ui/src/theme/site-tokens.ts` (`siteTokens`), the single source of truth.
- **Themes:** `packages/ui/src/theme/site-2026.ts` (`siteLightTheme`, `siteDarkTheme`). `marketingLightTheme` and `neramaiArchitekDarkTheme` are aliases of these.
- **Components:** `src/design-system/`. Import from `@/design-system`.

## Rules

1. **No hex in `sx` or `style`.** Use `tokens` from `@/design-system`. ESLint enforces this on migrated files: the `overrides` list in `.eslintrc.json`. When you move a page onto the design system, add its path there.
2. **Gold fill is for the primary action only** (`CtaButton variant="primary"`). Gold text on white fails contrast. On light, gold text is `tokens.gold800`.
3. **Inter everywhere, plus one mono stack** (`tokens.fontMono`) for eyebrows and stats. Museo is for the wordmark only. Poppins, Plus Jakarta Sans, Cormorant, DM Sans and Space Mono are banned by lint.
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
| 3 | Site Header state map + width tiers, Site Footer | Waits for the in-progress header/nav work to land |
| 4 | Coaching, Courses, Fees, About, Demo class, Premium, Scholarship, NATA online / entrance coaching | Done |
| 5 | Templates T2 to T9 | To do |
