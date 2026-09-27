# Enrolment shell and form (sub-project D-A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/apply` in all five locales becomes a focused four-step task (About you, Your course, Review, Pay and enrol) in its own shell, prefilled for returning users, saving every field it collects, with geolocation on demand only and funnel events firing.

**Architecture:** A client `SiteChrome` inside the existing `[locale]/layout.tsx` swaps the marketing chrome for a minimal `ApplicationShell` on `/apply`, `/pay` and `/enroll`. The wizard's validation and payload building move into a pure module so they are unit-tested without React; `FormContext` keeps state, draft persistence and prefill. The three old step components are renamed and edited in place rather than rewritten, a programme picker reads `fee_structures`, and the payment dialog's body is split into a `PaymentPanel` so step 4 can render it inline. One migration replaces the `create_lead_profile` RPC so the collected fields reach the database.

**Tech Stack:** Next.js 14 App Router, React 18, MUI v5 through `@neram/ui`, next-intl 3, Firebase auth through `@neram/auth`, Supabase through `@neram/database`, Vitest 1 (jsdom, root config), Playwright (`marketing-chrome`).

**Spec:** `docs/superpowers/specs/2026-09-26-enrolment-tools-ux-design.md` (Part B for the experience, Part C1 for the migration, Part D-A for scope).

## Global Constraints

- No em dashes, double dashes or `&mdash;` in any user-visible text (root `CLAUDE.md`). Use commas, colons, periods, parentheses.
- Mobile-first: design for 375 px, touch targets 48 px with 8 px spacing, base font 16 px, one field per row on phones, no horizontal scroll at 375, 768, 1024, 1440.
- Keep the `@neram/ui` MUI theme; import MUI components from `@neram/ui`, icons from `@mui/icons-material`. SVG icons only, never emoji.
- Never deploy, never push, never `git stash`, never `git add -A` (concurrent sessions share this working tree; 209 files are already uncommitted). Commit steps below stage only the listed paths, and run only if `git status --porcelain packages/database | grep -v "analytics\|types/index.ts\|queries/applications.ts"` is empty (the lifecycle work has been committed). Otherwise skip the commit step and continue.
- Do not read or edit `.pen` files. Do not run `next build` while a dev server is running.
- Type-check and lint without pipes: `pnpm --filter @neram/marketing type-check` (a pipe hides the exit code). Vitest from the repo root: `pnpm test:run <path>` (`pnpm test` is watch mode).
- Migrations sort after `20261015090000`; this plan adds exactly one: `20261016090000_lead_profiles_applicant_fields_and_fee.sql`. It is applied to staging by MCP (`mcp__supabase-staging__apply_migration`) in Task 16, never by `db push` from this session.
- Files this plan edits that are already dirty in `git status` (edit in place, never checkout): `apps/marketing/src/app/[locale]/layout.tsx`, `apps/marketing/src/components/apply/ChatAssistant.tsx` (not touched here), `apps/marketing/messages/*.json`, `apps/marketing/src/app/api/payment/*` (not touched here).
- Copy is written for students and parents on phones in the style of Google and Microsoft product teams: short, direct, says why a field is asked.

## Review Focus

Inputs the spec implies but no task's tests exercise directly; each has a test added to the owning task:

1. A draft saved by the old four-step wizard (`activeStep` 2 or 3, no `version`) must land on the right new step, never on the pay step (Task 5: `remapSavedStep`).
2. A signed-in Google user whose display name is "Arun Kumar" must NOT get "Kumar" as the father's name (Task 6 removes the guess; Task 15 E2E checks the field is empty).
3. A returning user with a submitted application and a phone already verified must not be shown the phone OTP modal again (Task 12: auto-prompt only when `!phoneVerified`; Task 15 E2E).
4. `/ta/apply` (a non-English locale) must get the application shell exactly like `/apply` (Task 1 regex; Task 15 E2E).
5. Submitting from Review while a draft save is still in flight must not create two applications (Task 12: the button is disabled while `isSavingDraft || isSubmitting`; Task 13 route test proves a second POST for the same user updates the existing draft rather than inserting).

---

### Task 1: Focused-route predicate

**Files:**
- Create: `apps/marketing/src/lib/focused-routes.ts`
- Test: `apps/marketing/src/lib/focused-routes.test.ts`

**Interfaces:**
- Produces: `isFocusedRoute(pathname: string | null | undefined): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/marketing/src/lib/focused-routes.test.ts
import { describe, it, expect } from 'vitest';
import { isFocusedRoute } from './focused-routes';

describe('isFocusedRoute', () => {
  it.each([
    ['/apply', true],
    ['/apply/', true],
    ['/ta/apply', true],
    ['/hi/apply', true],
    ['/kn/apply', true],
    ['/ml/apply', true],
    ['/en/apply', true],
    ['/pay', true],
    ['/pay?app=NERAM-2609-00012', true],
    ['/pay/link/abc123', true],
    ['/ta/pay', true],
    ['/enroll', true],
    ['/enroll?token=xyz', true],
    ['/ta/enroll', true],
  ])('%s is focused', (path, expected) => {
    expect(isFocusedRoute(path)).toBe(expected);
  });

  it.each([
    ['/', false],
    ['/apply-now', false],
    ['/applying', false],
    ['/fees', false],
    ['/ta', false],
    ['/ta/fees', false],
    ['/payments', false],
    ['/enrollment-guide', false],
    ['/colleges/apply', false],
    [null, false],
    [undefined, false],
    ['', false],
  ])('%s is not focused', (path, expected) => {
    expect(isFocusedRoute(path as string)).toBe(expected);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run apps/marketing/src/lib/focused-routes.test.ts`
Expected: FAIL with "Failed to resolve import ./focused-routes".

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/marketing/src/lib/focused-routes.ts
/**
 * Routes that render inside the application shell instead of the marketing
 * chrome: the apply flow, the public pay page (and its phone-OTP link), and
 * the direct-enrolment wizard. Any locale prefix, an optional trailing slash,
 * and any query string are accepted. `/apply-now` is a marketing page.
 */
const FOCUSED = /^\/(?:(?:en|ta|hi|kn|ml)\/)?(?:apply|pay|enroll)(?:\/|\?|$)/;

export function isFocusedRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return FOCUSED.test(pathname);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:run apps/marketing/src/lib/focused-routes.test.ts`
Expected: PASS, 25 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/marketing/src/lib/focused-routes.ts apps/marketing/src/lib/focused-routes.test.ts
git commit -m "feat(marketing): focused-route predicate for the application shell"
```

---

### Task 2: SiteChrome and ApplicationShell

**Files:**
- Create: `apps/marketing/src/components/SiteChrome.tsx`
- Create: `apps/marketing/src/components/apply/shell/ApplicationShell.tsx`
- Modify: `apps/marketing/src/app/[locale]/layout.tsx:12-14,169-178`
- Modify: `apps/marketing/messages/en.json` (`apply.shell` keys; the rest of the `apply` namespace is rewritten in Task 14)
- Test: `apps/marketing/src/components/SiteChrome.test.tsx`

**Interfaces:**
- Consumes: `isFocusedRoute` (Task 1).
- Produces: `<SiteChrome locale>{children}</SiteChrome>` (default export); `<ApplicationShell>{children}</ApplicationShell>` (default export). Later tasks (D-B) add a Nera trigger to the shell's Help menu; the `onHelp` prop is reserved for that and unused here.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/marketing/src/components/SiteChrome.test.tsx
import { render, screen, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, afterEach } from 'vitest';

let pathname = '/';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/components/Header', () => ({ default: () => <header data-testid="marketing-header" /> }));
vi.mock('@/components/Footer', () => ({ default: () => <footer data-testid="marketing-footer" /> }));
vi.mock('@/components/marketing-content', () => ({
  BroadcastBanner: () => <div data-testid="broadcast" />,
  ImportantDateBanner: () => <div data-testid="important-date" />,
  StickyAchievementWidget: () => <div data-testid="sticky-widget" />,
}));

import SiteChrome from './SiteChrome';

afterEach(() => cleanup());

describe('SiteChrome', () => {
  it('renders the full marketing chrome on a marketing page', () => {
    pathname = '/fees';
    render(<SiteChrome locale="en"><p>page</p></SiteChrome>);
    expect(screen.getByTestId('marketing-header')).toBeTruthy();
    expect(screen.getByTestId('marketing-footer')).toBeTruthy();
    expect(screen.getByTestId('sticky-widget')).toBeTruthy();
    expect(screen.getByText('page')).toBeTruthy();
  });

  it('renders only the application shell on /apply', () => {
    pathname = '/apply';
    render(<SiteChrome locale="en"><p>form</p></SiteChrome>);
    expect(screen.queryByTestId('marketing-header')).toBeNull();
    expect(screen.queryByTestId('marketing-footer')).toBeNull();
    expect(screen.queryByTestId('sticky-widget')).toBeNull();
    expect(screen.getByRole('banner')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'shell.home' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'shell.help' })).toBeTruthy();
    expect(screen.getByText('form')).toBeTruthy();
  });

  it('renders the application shell on a localised pay page', () => {
    pathname = '/ta/pay';
    render(<SiteChrome locale="ta"><p>pay</p></SiteChrome>);
    expect(screen.queryByTestId('marketing-header')).toBeNull();
    expect(screen.getByRole('link', { name: 'shell.terms' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'shell.refund' })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run apps/marketing/src/components/SiteChrome.test.tsx`
Expected: FAIL with "Failed to resolve import ./SiteChrome".

- [ ] **Step 3: Write the shell**

```tsx
// apps/marketing/src/components/apply/shell/ApplicationShell.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Box, Button, Container, Menu, MenuItem, Typography } from '@neram/ui';
import { HelpOutline, PhoneOutlined, MailOutline } from '@mui/icons-material';
import { useTranslations } from 'next-intl';

const OFFICE_PHONE = '+91 91761 37043';
const OFFICE_TEL = 'tel:+919176137043';

interface ApplicationShellProps {
  children: React.ReactNode;
  /** Reserved for the Nera sheet (sub-project D-B). When set, Help opens it instead of the menu. */
  onHelp?: () => void;
}

/**
 * The focused shell for /apply, /pay and /enroll: a 56 px bar with the
 * wordmark and one Help button, the page, and a one-line legal strip. No
 * navigation, no footer, nothing floating. Step titles and progress live
 * inside the form (StepShell), so this component holds no form state.
 */
export default function ApplicationShell({ children, onHelp }: ApplicationShellProps) {
  const t = useTranslations('apply');
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);

  return (
    <Box sx={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', bgcolor: 'grey.50' }}>
      <Box
        component="header"
        role="banner"
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          bgcolor: 'background.paper',
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Container maxWidth="sm" sx={{ px: 2 }}>
          <Box sx={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Link
              href="/"
              aria-label={t('shell.home')}
              style={{ display: 'inline-flex', alignItems: 'center', minHeight: 48, minWidth: 48 }}
            >
              <Image src="/logo.png" alt="" width={112} height={32} priority />
            </Link>
            <Button
              variant="text"
              startIcon={<HelpOutline />}
              onClick={(e) => (onHelp ? onHelp() : setAnchor(e.currentTarget))}
              aria-haspopup={onHelp ? undefined : 'menu'}
              sx={{ minHeight: 48, px: 1.5 }}
            >
              {t('shell.help')}
            </Button>
            <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
              <MenuItem component="a" href={OFFICE_TEL} onClick={() => setAnchor(null)} sx={{ minHeight: 48 }}>
                <PhoneOutlined fontSize="small" sx={{ mr: 1.5 }} />
                {t('shell.callUs')} {OFFICE_PHONE}
              </MenuItem>
              <MenuItem component={Link} href="/contact" onClick={() => setAnchor(null)} sx={{ minHeight: 48 }}>
                <MailOutline fontSize="small" sx={{ mr: 1.5 }} />
                {t('shell.contactPage')}
              </MenuItem>
            </Menu>
          </Box>
        </Container>
      </Box>

      <Box component="main" sx={{ flex: 1 }}>
        {children}
      </Box>

      <Box component="footer" sx={{ py: 2, px: 2 }}>
        <Container maxWidth="sm" sx={{ px: 0 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Link href="/terms">{t('shell.terms')}</Link>
            <Link href="/privacy">{t('shell.privacy')}</Link>
            <Link href="/refund-policy">{t('shell.refund')}</Link>
          </Typography>
        </Container>
      </Box>
    </Box>
  );
}
```

Check the logo path before using it: `ls apps/marketing/public | grep -i logo`. If `/logo.png` does not exist, use the file the Header renders (search `apps/marketing/src/components/Header.tsx` for `/images/` near the "Logo + Microsoft Badge" comment at line 386) and keep the same `width`/`height` ratio.

```tsx
// apps/marketing/src/components/SiteChrome.tsx
'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { BroadcastBanner, ImportantDateBanner, StickyAchievementWidget } from '@/components/marketing-content';
import ApplicationShell from '@/components/apply/shell/ApplicationShell';
import { isFocusedRoute } from '@/lib/focused-routes';

const GeneralChatbot = dynamic(() => import('@/components/GeneralChatbot'), { ssr: false });
const ComparisonTray = dynamic(() => import('@/components/college-hub/ComparisonTray'), { ssr: false });

interface SiteChromeProps {
  locale: string;
  children: React.ReactNode;
}

/**
 * One switch for the page chrome. Marketing pages keep every banner, the
 * header, the footer and the floating widgets exactly as before. The apply,
 * pay and enrol routes get the application shell and nothing floating, so a
 * student on a phone sees one task and one primary button.
 *
 * A pathname check rather than route groups: moving 200 pages into a route
 * group in a working tree that other sessions share was the riskier change.
 */
export default function SiteChrome({ locale, children }: SiteChromeProps) {
  const pathname = usePathname();

  if (isFocusedRoute(pathname)) {
    return <ApplicationShell>{children}</ApplicationShell>;
  }

  return (
    <>
      <BroadcastBanner locale={locale} />
      <ImportantDateBanner locale={locale} />
      <Header />
      <main>{children}</main>
      <Footer />
      <StickyAchievementWidget locale={locale} />
      <ComparisonTray />
      <GeneralChatbot />
    </>
  );
}
```

- [ ] **Step 4: Wire the layout**

In `apps/marketing/src/app/[locale]/layout.tsx` replace lines 8 to 14:

```ts
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import AuthProvider from '@/components/AuthProvider';
import { BroadcastBanner, ImportantDateBanner, StickyAchievementWidget } from '@/components/marketing-content';
import dynamic from 'next/dynamic';
const GeneralChatbot = dynamic(() => import('@/components/GeneralChatbot'), { ssr: false });
const ComparisonTray = dynamic(() => import('@/components/college-hub/ComparisonTray'), { ssr: false });
```

with:

```ts
import AuthProvider from '@/components/AuthProvider';
import SiteChrome from '@/components/SiteChrome';
```

and replace lines 169 to 178:

```tsx
            <AuthProvider>
              <BroadcastBanner locale={locale} />
              <ImportantDateBanner locale={locale} />
              <Header />
              <main>{children}</main>
              <Footer />
              <StickyAchievementWidget locale={locale} />
              <ComparisonTray />
              <GeneralChatbot />
            </AuthProvider>
```

with:

```tsx
            <AuthProvider>
              <SiteChrome locale={locale}>{children}</SiteChrome>
            </AuthProvider>
```

- [ ] **Step 5: Add the shell keys to `messages/en.json`**

Inside the existing `"apply"` object add (Task 14 rewrites the whole namespace; keep these names):

```json
"shell": {
  "home": "Neram Classes home",
  "help": "Help",
  "callUs": "Call us",
  "contactPage": "Contact page",
  "terms": "Terms",
  "privacy": "Privacy",
  "refund": "Refund policy"
}
```

Add the same object with the same values to `ta.json`, `hi.json`, `kn.json` and `ml.json` under `apply` (Task 14 translates Tamil).

- [ ] **Step 6: Run the tests**

Run: `pnpm test:run apps/marketing/src/components/SiteChrome.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 7: Type-check**

Run: `pnpm --filter @neram/marketing type-check`
Expected: exit 0 (the layout no longer imports the removed names).

- [ ] **Step 8: Commit**

```bash
git add apps/marketing/src/components/SiteChrome.tsx apps/marketing/src/components/SiteChrome.test.tsx apps/marketing/src/components/apply/shell/ApplicationShell.tsx "apps/marketing/src/app/[locale]/layout.tsx" apps/marketing/messages/en.json apps/marketing/messages/ta.json apps/marketing/messages/hi.json apps/marketing/messages/kn.json apps/marketing/messages/ml.json
git commit -m "feat(marketing): application shell on apply, pay and enroll routes"
```

---

### Task 3: Migration: lead_profiles applicant fields, fee columns, RPC replacement

**Files:**
- Create: `supabase/migrations/20261016090000_lead_profiles_applicant_fields_and_fee.sql`

**Interfaces:**
- Produces: columns `lead_profiles.email`, `phone`, `gclid`, `wbraid`, `fee_structure_id`, `fee_source`; a `create_lead_profile(payload jsonb)` that also writes `first_name, email, phone, parent_phone, date_of_birth, gender, gclid, wbraid, form_step_completed, detected_location, fee_structure_id, fee_source`.

- [ ] **Step 1: Write the migration**

```sql
-- 20261016090000_lead_profiles_applicant_fields_and_fee.sql
--
-- The apply form has collected email, phone, date of birth, gender and a parent
-- phone since 2026-04, and the create_lead_profile RPC (20260217115613) has an
-- explicit column list that silently dropped every one of them, plus gclid,
-- wbraid, form_step_completed and detected_location. This replaces the RPC
-- with the full list and adds the columns the self-service fee path needs.
--
-- gclid/wbraid were added by packages/database/supabase/migrations/
-- 20260521120000_attribution_fields.sql, a folder CI never pushes; production
-- got them by hand. The IF NOT EXISTS below makes this file safe on both.

ALTER TABLE lead_profiles
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS gclid TEXT,
  ADD COLUMN IF NOT EXISTS wbraid TEXT,
  ADD COLUMN IF NOT EXISTS fee_structure_id UUID REFERENCES fee_structures(id),
  ADD COLUMN IF NOT EXISTS fee_source TEXT;

ALTER TABLE lead_profiles DROP CONSTRAINT IF EXISTS lead_profiles_fee_source_check;
ALTER TABLE lead_profiles
  ADD CONSTRAINT lead_profiles_fee_source_check
  CHECK (fee_source IS NULL OR fee_source IN ('standard', 'admin', 'link'));

COMMENT ON COLUMN lead_profiles.fee_source IS
  'Where final_fee came from: standard (fee_structures snapshot at order time), admin (approval screen), link (direct enrolment link). NULL until a fee is set.';

-- Backfill: every lead with a fee today got it from an admin or a direct link.
UPDATE lead_profiles SET fee_source = 'link'
  WHERE fee_source IS NULL AND source = 'direct_link' AND final_fee IS NOT NULL;
UPDATE lead_profiles SET fee_source = 'admin'
  WHERE fee_source IS NULL AND final_fee IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lead_profiles_fee_structure ON lead_profiles(fee_structure_id)
  WHERE fee_structure_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_lead_profile(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result lead_profiles%ROWTYPE;
BEGIN
  INSERT INTO lead_profiles (
    user_id,
    first_name,
    father_name,
    email,
    phone,
    parent_phone,
    date_of_birth,
    gender,
    country,
    city,
    state,
    district,
    pincode,
    address,
    latitude,
    longitude,
    location_source,
    detected_location,
    applicant_category,
    academic_data,
    caste_category,
    target_exam_year,
    interest_course,
    selected_course_id,
    selected_center_id,
    hybrid_learning_accepted,
    learning_mode,
    school_type,
    fee_structure_id,
    fee_source,
    status,
    phone_verified,
    phone_verified_at,
    source,
    utm_source,
    utm_medium,
    utm_campaign,
    referral_code,
    gclid,
    wbraid,
    form_step_completed
  )
  VALUES (
    (payload->>'user_id')::uuid,
    NULLIF(payload->>'first_name', ''),
    payload->>'father_name',
    NULLIF(payload->>'email', ''),
    NULLIF(payload->>'phone', ''),
    NULLIF(payload->>'parent_phone', ''),
    CASE WHEN payload->>'date_of_birth' ~ '^\d{4}-\d{2}-\d{2}$'
         THEN (payload->>'date_of_birth')::date ELSE NULL END,
    CASE WHEN payload->>'gender' IN ('male', 'female', 'other')
         THEN payload->>'gender' ELSE NULL END,
    COALESCE(payload->>'country', 'IN'),
    payload->>'city',
    payload->>'state',
    payload->>'district',
    payload->>'pincode',
    payload->>'address',
    (payload->>'latitude')::numeric,
    (payload->>'longitude')::numeric,
    payload->>'location_source',
    CASE WHEN jsonb_typeof(payload->'detected_location') = 'object'
         THEN payload->'detected_location' ELSE NULL END,
    (payload->>'applicant_category')::applicant_category,
    COALESCE(payload->'academic_data', '{}'::jsonb),
    payload->>'caste_category',
    (payload->>'target_exam_year')::integer,
    (payload->>'interest_course')::course_type,
    NULLIF(payload->>'selected_course_id', '')::uuid,
    NULLIF(payload->>'selected_center_id', '')::uuid,
    COALESCE((payload->>'hybrid_learning_accepted')::boolean, false),
    COALESCE((payload->>'learning_mode')::learning_mode, 'hybrid'),
    CASE WHEN payload->>'school_type' IS NOT NULL AND payload->>'school_type' != ''
         THEN (payload->>'school_type')::school_type
         ELSE NULL END,
    NULLIF(payload->>'fee_structure_id', '')::uuid,
    CASE WHEN payload->>'fee_source' IN ('standard', 'admin', 'link')
         THEN payload->>'fee_source' ELSE NULL END,
    COALESCE((payload->>'status')::application_status, 'draft'),
    COALESCE((payload->>'phone_verified')::boolean, false),
    (payload->>'phone_verified_at')::timestamptz,
    COALESCE((payload->>'source')::application_source, 'website_form'),
    payload->>'utm_source',
    payload->>'utm_medium',
    payload->>'utm_campaign',
    payload->>'referral_code',
    NULLIF(payload->>'gclid', ''),
    NULLIF(payload->>'wbraid', ''),
    COALESCE((payload->>'form_step_completed')::integer, 0)
  )
  RETURNING * INTO result;

  RETURN to_jsonb(result);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_lead_profile(jsonb) TO service_role;
REVOKE EXECUTE ON FUNCTION public.create_lead_profile(jsonb) FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Verify the SQL parses**

Run (read-only, staging): `mcp__supabase-staging__execute_sql` with

```sql
SELECT column_name, data_type FROM information_schema.columns
 WHERE table_name = 'lead_profiles' AND column_name IN ('first_name','date_of_birth','gender','parent_phone','form_step_completed','detected_location','gclid','wbraid','email','phone');
```

Expected: `first_name text`, `date_of_birth date`, `gender text`, `parent_phone text`, `form_step_completed integer`, `detected_location jsonb`; `gclid`, `wbraid`, `email`, `phone` may be absent (the migration adds them). If `gender` is an enum rather than `text`, change the gender CASE to cast `::gender_type` (use the enum's real name from `SELECT udt_name ...`).

The migration itself is applied in Task 16 after the code is green, so nothing on staging changes before the form can write the new keys.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20261016090000_lead_profiles_applicant_fields_and_fee.sql
git commit -m "feat(db): lead_profiles applicant fields, fee source, create_lead_profile with the full column list"
```

---

### Task 4: Shared types and event names (packages/database, types only)

**Files:**
- Modify: `packages/database/src/queries/applications.ts:27-69`
- Modify: `packages/database/src/types/index.ts` (the `LeadProfile` interface at line 414)
- Modify: `packages/database/src/analytics/index.ts:35-62`
- Test: `packages/database/src/analytics/index.test.ts` (extend)

**Interfaces:**
- Produces: `CreateApplicationInput` gains `first_name?, email?, phone?, parent_phone?, date_of_birth?, gender?, fee_structure_id?, fee_source?`; `LeadProfile` gains the same plus `gclid`, `wbraid`; `EVENT_TAXONOMY` gains `application_step_completed`, `course_selected`, `application_reviewed`, `autofill_selected`, `voice_started`, `voice_completed`, `document_upload_started`, `document_processed`, `manual_entry_started` (funnel `application`) and `enrollment_created`, `provisioning_step`, `onboarding_started`, `onboarding_viewed` (funnel `enrollment`).

- [ ] **Step 1: Write the failing test**

Append to `packages/database/src/analytics/index.test.ts` (read the file's existing imports first and reuse them; it already imports `EVENT_TAXONOMY`):

```ts
describe('EVENT_TAXONOMY: enrolment redesign names', () => {
  it('files the application step events under the application funnel', () => {
    for (const name of [
      'application_step_completed',
      'course_selected',
      'application_reviewed',
      'autofill_selected',
      'voice_started',
      'voice_completed',
      'document_upload_started',
      'document_processed',
      'manual_entry_started',
    ] as const) {
      expect(EVENT_TAXONOMY[name]).toBe('application');
    }
  });

  it('files the provisioning events under the enrollment funnel', () => {
    for (const name of ['enrollment_created', 'provisioning_step', 'onboarding_started', 'onboarding_viewed'] as const) {
      expect(EVENT_TAXONOMY[name]).toBe('enrollment');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run packages/database/src/analytics/index.test.ts`
Expected: FAIL (a TypeScript error on the unknown key, or `undefined` is not `'application'`).

- [ ] **Step 3: Add the names and the types**

In `packages/database/src/analytics/index.ts`, inside `EVENT_TAXONOMY`, replace

```ts
  // Application and enrollment
  application_started: 'application',
  application_completed: 'application',
  payment_started: 'enrollment',
  payment_completed: 'enrollment',
  payment_failed: 'enrollment',
  enrollment_completed: 'enrollment',
```

with

```ts
  // Application and enrollment
  application_started: 'application',
  application_step_completed: 'application',
  autofill_selected: 'application',
  voice_started: 'application',
  voice_completed: 'application',
  document_upload_started: 'application',
  document_processed: 'application',
  manual_entry_started: 'application',
  course_selected: 'application',
  application_reviewed: 'application',
  application_completed: 'application',
  payment_started: 'enrollment',
  payment_completed: 'enrollment',
  payment_failed: 'enrollment',
  enrollment_created: 'enrollment',
  provisioning_step: 'enrollment',
  enrollment_completed: 'enrollment',
  onboarding_started: 'enrollment',
  onboarding_viewed: 'enrollment',
```

In `packages/database/src/queries/applications.ts`, replace lines 27 to 31:

```ts
export interface CreateApplicationInput {
  user_id: string;
  // Personal info
  father_name?: string;
```

with

```ts
export interface CreateApplicationInput {
  user_id: string;
  // Personal info
  first_name?: string;
  father_name?: string;
  email?: string;
  phone?: string;
  parent_phone?: string;
  /** ISO date, YYYY-MM-DD */
  date_of_birth?: string;
  gender?: 'male' | 'female' | 'other';
  // Fee (self-service): the programme the applicant picked, and where the fee came from
  fee_structure_id?: string;
  fee_source?: 'standard' | 'admin' | 'link';
```

In `packages/database/src/types/index.ts`, inside `export interface LeadProfile extends Timestamps {` (line 414), add after the `application_number` line:

```ts
  // Applicant contact snapshot (users.* stays canonical)
  first_name: string | null;
  email: string | null;
  phone: string | null;
  parent_phone: string | null;
  date_of_birth: string | null;
  gender: 'male' | 'female' | 'other' | null;
  // Google Ads click ids (attribution)
  gclid: string | null;
  wbraid: string | null;
  // Self-service fee
  fee_structure_id: string | null;
  fee_source: 'standard' | 'admin' | 'link' | null;
```

If any of these names already exist further down the interface (grep the block for `parent_phone`, `gclid`), delete the older duplicate line rather than adding a second one.

- [ ] **Step 4: Run the tests and the package type-check**

Run: `pnpm test:run packages/database/src/analytics/index.test.ts`
Expected: PASS.

Run: `pnpm --filter @neram/database type-check`
Expected: exit 0. If the package has no `type-check` script, run `pnpm --filter @neram/database exec tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add packages/database/src/queries/applications.ts packages/database/src/types/index.ts packages/database/src/analytics/index.ts packages/database/src/analytics/index.test.ts
git commit -m "feat(database): applicant contact and fee fields on lead profiles, enrolment event names"
```

---

### Task 5: Pure form rules: steps, validation, payloads, draft remap

**Files:**
- Modify: `apps/marketing/src/components/apply/types.ts`
- Create: `apps/marketing/src/components/apply/validation.ts`
- Test: `apps/marketing/src/components/apply/validation.test.ts`

**Interfaces:**
- Produces (types.ts): `FormStep = 0 | 1 | 2 | 3`; `STEP_KEYS = ['aboutYou', 'yourCourse', 'review', 'pay'] as const`; `StepKey`; `PersonalInfoData.gender: 'male' | 'female' | 'other' | ''` (default `''`); `CourseSelectionData.feeStructureId: string | null`, `feeStructureLabel: string | null`, `programType: 'year_long' | 'crash_course' | null` (defaults null); `STEP_LABELS` removed.
- Produces (validation.ts): `validateAboutYou(data)`, `validateYourCourse(data)`, `validateReview(data)`, `validateStep(step, data)`, `buildDraftPayload(formData, stepCompleted)`, `buildSubmitPayload(formData)`, `remapSavedStep(saved: { activeStep: number; version?: number })`, `SAVED_STATE_VERSION = 2`. Error messages are i18n keys under `apply.errors.*`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/marketing/src/components/apply/validation.test.ts
import { describe, it, expect } from 'vitest';
import { DEFAULT_FORM_DATA, type ApplicationFormData } from './types';
import {
  validateAboutYou,
  validateYourCourse,
  validateReview,
  validateStep,
  buildDraftPayload,
  buildSubmitPayload,
  remapSavedStep,
  SAVED_STATE_VERSION,
} from './validation';

function complete(): ApplicationFormData {
  return {
    ...DEFAULT_FORM_DATA,
    personal: {
      firstName: 'Arun',
      fatherName: 'Rajendran',
      email: '',
      phone: '9876543210',
      parentPhone: '',
      phoneVerified: true,
      phoneVerifiedAt: '2026-09-26T10:00:00.000Z',
      dateOfBirth: '2008-03-12',
      gender: '',
    },
    location: { ...DEFAULT_FORM_DATA.location, pincode: '625001', city: 'Madurai', state: 'Tamil Nadu' },
    academic: {
      ...DEFAULT_FORM_DATA.academic,
      applicantCategory: 'school_student',
      targetExamYear: '2027-28',
      schoolStudentData: { current_class: '11', school_name: 'TVS School', board: 'CBSE' },
    },
    course: {
      ...DEFAULT_FORM_DATA.course,
      interestCourse: 'nata',
      feeStructureId: 'fs-1',
      feeStructureLabel: 'NATA 1 Year',
      programType: 'year_long',
    },
    termsAccepted: true,
  };
}

describe('validateAboutYou', () => {
  it('passes a complete step with optional fields empty', () => {
    expect(validateAboutYou(complete())).toEqual({ isValid: true, errors: [] });
  });

  it('does not require email or gender', () => {
    const data = complete();
    data.personal.email = '';
    data.personal.gender = '';
    expect(validateAboutYou(data).isValid).toBe(true);
  });

  it('rejects a malformed email when one is given', () => {
    const data = complete();
    data.personal.email = 'not-an-email';
    expect(validateAboutYou(data).errors.map((e) => e.field)).toEqual(['email']);
  });

  it('requires the phone to be verified', () => {
    const data = complete();
    data.personal.phoneVerified = false;
    expect(validateAboutYou(data).errors.map((e) => e.field)).toContain('phoneVerified');
  });

  it('requires name, father name, date of birth and location', () => {
    const data = complete();
    data.personal.firstName = 'A';
    data.personal.fatherName = '';
    data.personal.dateOfBirth = '';
    data.location.pincode = '';
    data.location.city = '';
    data.location.state = '';
    const fields = validateAboutYou(data).errors.map((e) => e.field);
    expect(fields).toEqual(['firstName', 'fatherName', 'dateOfBirth', 'pincode', 'city', 'state']);
  });

  it('uses i18n keys as messages', () => {
    const data = complete();
    data.personal.fatherName = '';
    expect(validateAboutYou(data).errors[0].message).toBe('errors.fatherName');
  });
});

describe('validateYourCourse', () => {
  it('passes a complete step', () => {
    expect(validateYourCourse(complete()).isValid).toBe(true);
  });

  it('requires a programme once a course is chosen', () => {
    const data = complete();
    data.course.feeStructureId = null;
    expect(validateYourCourse(data).errors.map((e) => e.field)).toEqual(['programme']);
  });

  it('does not require a programme for "not sure yet"', () => {
    const data = complete();
    data.course.interestCourse = 'not_sure';
    data.course.feeStructureId = null;
    expect(validateYourCourse(data).isValid).toBe(true);
  });

  it('requires the category and its fields, and the exam year, but not caste', () => {
    const data = complete();
    data.academic.casteCategory = null;
    expect(validateYourCourse(data).isValid).toBe(true);
    data.academic.schoolStudentData = { current_class: '', school_name: '', board: '' };
    data.academic.targetExamYear = '';
    expect(validateYourCourse(data).errors.map((e) => e.field)).toEqual([
      'examYear',
      'currentClass',
      'schoolName',
      'board',
    ]);
  });

  it('stops at the category when none is chosen', () => {
    const data = complete();
    data.academic.applicantCategory = null;
    expect(validateYourCourse(data).errors.map((e) => e.field)).toEqual(['category']);
  });
});

describe('validateReview and validateStep', () => {
  it('requires the terms', () => {
    const data = complete();
    data.termsAccepted = false;
    expect(validateReview(data).errors.map((e) => e.field)).toEqual(['terms']);
  });

  it('the pay step is always valid', () => {
    expect(validateStep(3, DEFAULT_FORM_DATA).isValid).toBe(true);
  });
});

describe('payloads', () => {
  it('the draft payload after step 0 carries the contact fields', () => {
    const p = buildDraftPayload(complete(), 0);
    expect(p).toMatchObject({
      status: 'draft',
      form_step_completed: 1,
      first_name: 'Arun',
      father_name: 'Rajendran',
      phone: '9876543210',
      date_of_birth: '2008-03-12',
      pincode: '625001',
    });
    expect(p).not.toHaveProperty('interest_course');
    expect(p.email).toBeUndefined();
    expect(p.gender).toBeUndefined();
  });

  it('the draft payload after step 1 carries studies, course and programme', () => {
    const p = buildDraftPayload(complete(), 1);
    expect(p).toMatchObject({
      form_step_completed: 2,
      applicant_category: 'school_student',
      target_exam_year: '2027-28',
      interest_course: 'nata',
      fee_structure_id: 'fs-1',
      learning_mode: 'hybrid',
    });
    expect(p.academic_data).toEqual({ current_class: '11', school_name: 'TVS School', board: 'CBSE' });
  });

  it('the submit payload carries every collected field and the click ids', () => {
    const data = complete();
    data.personal.email = 'arun@example.com';
    data.personal.gender = 'male';
    data.personal.parentPhone = '9123456789';
    data.gclid = 'g-1';
    data.wbraid = 'w-1';
    const p = buildSubmitPayload(data);
    expect(p).toMatchObject({
      status: 'submitted',
      first_name: 'Arun',
      father_name: 'Rajendran',
      email: 'arun@example.com',
      phone: '9876543210',
      parent_phone: '9123456789',
      date_of_birth: '2008-03-12',
      gender: 'male',
      phone_verified: true,
      fee_structure_id: 'fs-1',
      fee_source: 'standard',
      gclid: 'g-1',
      wbraid: 'w-1',
    });
  });

  it('the submit payload has no fee_source when no programme was chosen', () => {
    const data = complete();
    data.course.interestCourse = 'not_sure';
    data.course.feeStructureId = null;
    const p = buildSubmitPayload(data);
    expect(p.fee_structure_id).toBeNull();
    expect(p.fee_source).toBeUndefined();
  });
});

describe('remapSavedStep', () => {
  it('maps the old four-step wizard onto the new steps', () => {
    expect(remapSavedStep({ activeStep: 0 })).toBe(0);
    expect(remapSavedStep({ activeStep: 1 })).toBe(1);
    expect(remapSavedStep({ activeStep: 2 })).toBe(1);
    expect(remapSavedStep({ activeStep: 3 })).toBe(2);
  });

  it('keeps a current-version step, but never restores onto the pay step', () => {
    expect(remapSavedStep({ activeStep: 2, version: SAVED_STATE_VERSION })).toBe(2);
    expect(remapSavedStep({ activeStep: 3, version: SAVED_STATE_VERSION })).toBe(2);
  });

  it('clamps garbage', () => {
    expect(remapSavedStep({ activeStep: 9, version: SAVED_STATE_VERSION })).toBe(2);
    expect(remapSavedStep({ activeStep: -1 })).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run apps/marketing/src/components/apply/validation.test.ts`
Expected: FAIL with "Failed to resolve import ./validation".

- [ ] **Step 3: Update types.ts**

In `apps/marketing/src/components/apply/types.ts`:

Replace

```ts
  dateOfBirth: string;
  gender: 'male' | 'female' | 'other';
}
```

with

```ts
  dateOfBirth: string;
  /** Optional. Empty string means not given. */
  gender: 'male' | 'female' | 'other' | '';
}
```

Replace the `CourseSelectionData` interface with

```ts
export interface CourseSelectionData {
  interestCourse: CourseType | null;
  selectedCourseId: string | null;
  selectedCenterId: string | null;
  selectedCenterName: string | null;
  hybridLearningAccepted: boolean;
  learningMode: 'hybrid' | 'online_only';
  /** The fee_structures row the applicant picked on "Your course". */
  feeStructureId: string | null;
  feeStructureLabel: string | null;
  programType: 'year_long' | 'crash_course' | null;
}
```

In `DEFAULT_FORM_DATA` change `gender: 'male',` to `gender: '',` and extend `course:` with

```ts
    feeStructureId: null,
    feeStructureLabel: null,
    programType: null,
```

Replace

```ts
export type FormStep = 0 | 1 | 2 | 3;

export const STEP_LABELS = [
  'Personal Information',
  'Academic Details',
  'Course Selection',
  'Review & Submit',
] as const;
```

with

```ts
/** 0 About you, 1 Your course (with Your studies), 2 Review, 3 Pay and enrol. */
export type FormStep = 0 | 1 | 2 | 3;

/** i18n keys under apply.steps.* , in step order. */
export const STEP_KEYS = ['aboutYou', 'yourCourse', 'review', 'pay'] as const;
export type StepKey = (typeof STEP_KEYS)[number];
export const STEP_COUNT = STEP_KEYS.length;
```

Remove `GENDER_OPTIONS` only if nothing else imports it (`grep -rn GENDER_OPTIONS apps/marketing/src`); Task 7 stops using it.

- [ ] **Step 4: Write validation.ts**

```ts
// apps/marketing/src/components/apply/validation.ts
/**
 * The rules of the apply form, with no React in them: which step is valid,
 * what a draft or a submission sends, and how an old saved draft maps onto
 * the four new steps. Messages are i18n keys (apply.errors.*), so the same
 * rule reads right in Tamil.
 */
import type { ApplicationFormData, FormStep, StepValidation, ValidationError } from './types';
import { getCountryConfig } from './countryConfig';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function err(field: string, key: string): ValidationError {
  return { field, message: `errors.${key}` };
}

export function validateAboutYou(data: ApplicationFormData): StepValidation {
  const errors: ValidationError[] = [];
  const { personal, location } = data;
  const country = getCountryConfig(location.country);

  if (!personal.firstName || personal.firstName.trim().length < 2) errors.push(err('firstName', 'firstName'));
  if (!personal.fatherName || personal.fatherName.trim().length < 2) errors.push(err('fatherName', 'fatherName'));
  if (personal.email && !EMAIL.test(personal.email)) errors.push(err('email', 'email'));
  if (!personal.phoneVerified) {
    if (!personal.phone || !country.phonePattern.test(personal.phone)) errors.push(err('phone', 'phone'));
    errors.push(err('phoneVerified', 'phoneVerified'));
  }
  if (!personal.dateOfBirth) errors.push(err('dateOfBirth', 'dateOfBirth'));

  if (country.postalCode.required) {
    const format = country.postalCode.format;
    if (!location.pincode || (format && !format.test(location.pincode))) errors.push(err('pincode', 'pincode'));
  }
  if (country.locationFields.cityRequired && !location.city) errors.push(err('city', 'city'));
  if (country.locationFields.stateRequired && !location.state) errors.push(err('state', 'state'));

  return { isValid: errors.length === 0, errors };
}

export function validateYourCourse(data: ApplicationFormData): StepValidation {
  const errors: ValidationError[] = [];
  const { course, academic } = data;

  if (!course.interestCourse) errors.push(err('course', 'course'));
  else if (course.interestCourse !== 'not_sure' && !course.feeStructureId) errors.push(err('programme', 'programme'));

  if (!academic.applicantCategory) {
    errors.push(err('category', 'category'));
    return { isValid: false, errors };
  }
  if (!academic.targetExamYear) errors.push(err('examYear', 'examYear'));

  switch (academic.applicantCategory) {
    case 'school_student':
      if (!academic.schoolStudentData?.current_class) errors.push(err('currentClass', 'currentClass'));
      if (!academic.schoolStudentData?.school_name) errors.push(err('schoolName', 'schoolName'));
      if (!academic.schoolStudentData?.board) errors.push(err('board', 'board'));
      break;
    case 'diploma_student':
      if (!academic.diplomaStudentData?.college_name) errors.push(err('collegeName', 'collegeName'));
      if (!academic.diplomaStudentData?.department) errors.push(err('department', 'department'));
      if (!academic.diplomaStudentData?.completed_grade) errors.push(err('completedGrade', 'completedGrade'));
      break;
    case 'college_student':
      if (!academic.collegeStudentData?.college_name) errors.push(err('collegeName', 'collegeName'));
      if (!academic.collegeStudentData?.department) errors.push(err('department', 'department'));
      if (!academic.collegeStudentData?.year_of_study) errors.push(err('yearOfStudy', 'yearOfStudy'));
      if (!academic.collegeStudentData?.twelfth_year) errors.push(err('twelfthYear', 'twelfthYear'));
      break;
    case 'working_professional':
      if (!academic.workingProfessionalData?.twelfth_year) errors.push(err('twelfthYear', 'twelfthYear'));
      break;
  }

  return { isValid: errors.length === 0, errors };
}

export function validateReview(data: ApplicationFormData): StepValidation {
  const errors: ValidationError[] = [];
  if (!data.termsAccepted) errors.push(err('terms', 'terms'));
  return { isValid: errors.length === 0, errors };
}

export function validateStep(step: FormStep, data: ApplicationFormData): StepValidation {
  switch (step) {
    case 0:
      return validateAboutYou(data);
    case 1:
      return validateYourCourse(data);
    case 2:
      return validateReview(data);
    default:
      return { isValid: true, errors: [] };
  }
}

function academicDataFor(data: ApplicationFormData) {
  switch (data.academic.applicantCategory) {
    case 'school_student':
      return data.academic.schoolStudentData;
    case 'diploma_student':
      return data.academic.diplomaStudentData;
    case 'college_student':
      return data.academic.collegeStudentData;
    case 'working_professional':
      return data.academic.workingProfessionalData;
    default:
      return null;
  }
}

const orUndefined = (value: string | null | undefined) => (value ? value : undefined);

function contactFields(data: ApplicationFormData): Record<string, unknown> {
  const { personal } = data;
  return {
    first_name: orUndefined(personal.firstName),
    father_name: orUndefined(personal.fatherName),
    email: orUndefined(personal.email),
    phone: orUndefined(personal.phone),
    parent_phone: orUndefined(personal.parentPhone),
    date_of_birth: orUndefined(personal.dateOfBirth),
    gender: orUndefined(personal.gender),
    phone_verified: personal.phoneVerified,
    phone_verified_at: orUndefined(personal.phoneVerifiedAt),
  };
}

function locationFields(data: ApplicationFormData): Record<string, unknown> {
  const { location } = data;
  return {
    country: location.country || 'IN',
    city: orUndefined(location.city),
    state: orUndefined(location.state),
    district: orUndefined(location.district),
    pincode: orUndefined(location.pincode),
    address: orUndefined(location.address),
    latitude: location.latitude ?? undefined,
    longitude: location.longitude ?? undefined,
    location_source: orUndefined(location.locationSource),
    detected_location: location.detectedLocation || undefined,
  };
}

function studiesFields(data: ApplicationFormData): Record<string, unknown> {
  const { academic } = data;
  const academicData = academicDataFor(data);
  return {
    applicant_category: orUndefined(academic.applicantCategory),
    caste_category: orUndefined(academic.casteCategory),
    target_exam_year: orUndefined(academic.targetExamYear),
    school_type: orUndefined(academic.schoolType),
    ...(academicData ? { academic_data: academicData } : {}),
  };
}

function courseFields(data: ApplicationFormData): Record<string, unknown> {
  const { course } = data;
  return {
    interest_course: orUndefined(course.interestCourse),
    selected_course_id: orUndefined(course.selectedCourseId),
    selected_center_id: orUndefined(course.selectedCenterId),
    hybrid_learning_accepted: course.hybridLearningAccepted,
    learning_mode: course.learningMode || 'hybrid',
    fee_structure_id: course.feeStructureId,
    ...(course.feeStructureId ? { fee_source: 'standard' } : {}),
  };
}

function attributionFields(data: ApplicationFormData): Record<string, unknown> {
  return {
    utm_source: orUndefined(data.utmSource),
    utm_medium: orUndefined(data.utmMedium),
    utm_campaign: orUndefined(data.utmCampaign),
    referral_code: orUndefined(data.referralCode),
    gclid: orUndefined(data.gclid),
    wbraid: orUndefined(data.wbraid),
  };
}

/** What "Save and continue" sends after `stepCompleted` (0 = About you, 1 = Your course). */
export function buildDraftPayload(formData: ApplicationFormData, stepCompleted: number): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    status: 'draft',
    form_step_completed: stepCompleted + 1,
    ...contactFields(formData),
    ...locationFields(formData),
    ...attributionFields(formData),
  };
  if (stepCompleted >= 1) {
    Object.assign(payload, studiesFields(formData), courseFields(formData));
  }
  return payload;
}

/** What Review sends. Every field, status submitted. */
export function buildSubmitPayload(formData: ApplicationFormData): Record<string, unknown> {
  return {
    status: 'submitted',
    form_step_completed: 3,
    ...contactFields(formData),
    ...locationFields(formData),
    ...studiesFields(formData),
    ...courseFields(formData),
    ...attributionFields(formData),
  };
}

export const SAVED_STATE_VERSION = 2;

/**
 * Where a saved draft reopens. Version 1 drafts came from the four-step
 * wizard (Personal, Academic, Course, Review). Academic and Course both fold
 * into the new "Your course", and nothing ever reopens on the pay step: a
 * submitted application is reached through the dashboard instead.
 */
export function remapSavedStep(saved: { activeStep: number; version?: number }): FormStep {
  const step = Number.isFinite(saved.activeStep) ? Math.trunc(saved.activeStep) : 0;
  if (saved.version === SAVED_STATE_VERSION) {
    return Math.min(Math.max(step, 0), 2) as FormStep;
  }
  const legacy: Record<number, FormStep> = { 0: 0, 1: 1, 2: 1, 3: 2 };
  return legacy[Math.min(Math.max(step, 0), 3)] ?? 0;
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm test:run apps/marketing/src/components/apply/validation.test.ts`
Expected: PASS, 19 tests.

- [ ] **Step 6: Type-check (expect known breakage)**

Run: `pnpm --filter @neram/marketing type-check`
Expected: errors only in `ApplyFormWizard.tsx` and `FormContext.tsx` about `STEP_LABELS` and `gender`. Tasks 6 and 12 clear them. Do not commit yet.

---

### Task 6: FormContext rewiring

**Files:**
- Modify: `apps/marketing/src/components/apply/FormContext.tsx`

**Interfaces:**
- Consumes: Task 5 (`validateStep`, `buildDraftPayload`, `buildSubmitPayload`, `remapSavedStep`, `SAVED_STATE_VERSION`, `STEP_COUNT`).
- Produces on the context: everything it had, minus nothing, plus `submitApplication(): Promise<SubmitResult>`, `submittedApplication: { id: string; applicationNumber: string | null } | null`, `markApplicationStarted(): void`, `isLastStep` now means step 3. `SubmitResult = { ok: true; id: string; applicationNumber: string | null } | { ok: false; error: string }`.

- [ ] **Step 1: Replace the imports and the persistence block (lines 1 to 56)**

```tsx
'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type { ApplicationFormData, FormStep, StepValidation } from './types';
import { DEFAULT_FORM_DATA, STEP_COUNT } from './types';
import { useFirebaseAuth } from '@neram/auth';
import { getCountryConfig } from './countryConfig';
import { captureAttributionFromUrl } from '@/lib/attribution';
import { trackTaxonomyEvent } from '@/lib/funnel-tracker';
import {
  validateStep as validateStepData,
  buildDraftPayload,
  buildSubmitPayload,
  remapSavedStep,
  SAVED_STATE_VERSION,
} from './validation';

// ============================================
// LOCAL STORAGE PERSISTENCE
// ============================================

const STORAGE_KEY = 'neram_application_draft';
const STARTED_KEY = 'neram_application_started';

export interface SubmittedApplication {
  id: string;
  applicationNumber: string | null;
}

interface SavedFormState {
  version?: number;
  formData: ApplicationFormData;
  activeStep: FormStep;
  savedAt: string;
  submittedApplication?: SubmittedApplication | null;
}

function saveToStorage(
  formData: ApplicationFormData,
  activeStep: FormStep,
  submittedApplication: SubmittedApplication | null,
): void {
  try {
    const state: SavedFormState = {
      version: SAVED_STATE_VERSION,
      formData,
      activeStep,
      savedAt: new Date().toISOString(),
      submittedApplication,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage full or unavailable
  }
}

function loadFromStorage(): SavedFormState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const state: SavedFormState = JSON.parse(raw);
    // Expire after 7 days
    if (state.savedAt) {
      const age = Date.now() - new Date(state.savedAt).getTime();
      if (age > 7 * 24 * 60 * 60 * 1000) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
    }
    return state;
  } catch {
    return null;
  }
}

function clearStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
```

- [ ] **Step 2: Delete the old `buildDraftPayload` (lines 58 to 121) and the four validators (lines 178 to 320)**

Both now live in `validation.ts`. Delete from `// DRAFT PAYLOAD BUILDER` through the end of that function, and from `// VALIDATION HELPERS` through the end of `validateReview`.

- [ ] **Step 3: Extend the context type**

In `interface FormContextType`, after `refreshApplications: () => Promise<void>;` add:

```ts
  // Submission (Review step)
  submitApplication: () => Promise<SubmitResult>;
  submittedApplication: SubmittedApplication | null;

  // Analytics: fires application_started once per browser session
  markApplicationStarted: () => void;
```

and above the interface add:

```ts
export type SubmitResult =
  | { ok: true; id: string; applicationNumber: string | null }
  | { ok: false; error: string };
```

- [ ] **Step 4: Restore with the remap, save with the version**

Replace the restore effect body:

```ts
    const saved = loadFromStorage();
    if (saved) {
      // ...sanitize...
      setFormData(saved.formData);
      setActiveStepState(saved.activeStep);
    }
```

so that after the sanitising block it reads:

```ts
      // Older drafts have no feeStructureId etc.; merge over the defaults so
      // every key exists, then reopen on the remapped step.
      setFormData({
        ...DEFAULT_FORM_DATA,
        ...saved.formData,
        personal: { ...DEFAULT_FORM_DATA.personal, ...saved.formData.personal },
        location: { ...DEFAULT_FORM_DATA.location, ...saved.formData.location },
        academic: { ...DEFAULT_FORM_DATA.academic, ...saved.formData.academic },
        course: { ...DEFAULT_FORM_DATA.course, ...saved.formData.course },
      });
      if (saved.version === SAVED_STATE_VERSION && saved.submittedApplication) {
        // Reload during payment: keep the submitted application and reopen on Pay.
        setSubmittedApplication(saved.submittedApplication);
        setDraftId(saved.submittedApplication.id);
        setActiveStepState(3);
      } else {
        setActiveStepState(remapSavedStep(saved));
      }
```

Add the state next to `draftId`:

```ts
  const [submittedApplication, setSubmittedApplication] = useState<SubmittedApplication | null>(null);
```

Change the auto-save effect to:

```ts
  useEffect(() => {
    if (!hasRestoredRef.current) return;
    saveToStorage(formData, activeStep, submittedApplication);
  }, [formData, activeStep, submittedApplication]);
```

and `clearSavedForm` to also `setSubmittedApplication(null);`.

- [ ] **Step 5: Prefill: gender guard, no father-name guess**

Replace

```ts
          if (profile.gender) {
            setFormData((prev) => {
              if (prev.personal.gender && prev.personal.gender !== 'male') return prev;
              return { ...prev, personal: { ...prev.personal, gender: profile.gender } };
            });
            prefilled.add('gender');
          }
```

with

```ts
          if (profile.gender === 'male' || profile.gender === 'female' || profile.gender === 'other') {
            setFormData((prev) => {
              if (prev.personal.gender) return prev;
              return { ...prev, personal: { ...prev.personal, gender: profile.gender } };
            });
            prefilled.add('gender');
          }
```

Replace the whole "Fallback: use Google displayName" block with:

```ts
      // Fallback: the first word of the Google display name is a fair guess at
      // the student's first name. The rest of it is NOT the father's name
      // (it is usually a surname or an initial), so that guess is gone.
      if (user.name) {
        const firstName = user.name.trim().split(/\s+/)[0] || '';
        if (firstName && !prefilled.has('firstName')) {
          setFormData((prev) => (prev.personal.firstName ? prev : { ...prev, personal: { ...prev.personal, firstName } }));
          prefilled.add('firstName');
        }
      }
```

In the draft-restore block (`if (draft) {`), extend the `personal` merge with:

```ts
                  email: prev.personal.email || draft.email || '',
                  parentPhone: prev.personal.parentPhone || draft.parent_phone || '',
                  dateOfBirth: prev.personal.dateOfBirth || draft.date_of_birth || '',
                  gender: prev.personal.gender || draft.gender || '',
```

and the `course` merge with:

```ts
                  feeStructureId: prev.course.feeStructureId || draft.fee_structure_id || null,
```

and change `const dbStep = Math.min((draft.form_step_completed || 1) - 1, 3);` to

```ts
              // form_step_completed is 1-indexed and counts the OLD steps for
              // drafts saved before this release; remap the same way localStorage is.
              const dbStep = remapSavedStep({ activeStep: (draft.form_step_completed || 1) - 1 });
```

- [ ] **Step 6: Draft save, validation, navigation, submission**

`saveDraftToDb` keeps its body; it already calls `buildDraftPayload(formData, stepCompleted)`, which now comes from `validation.ts`. Remove the two `console.log` lines in it (`[Draft Save] Saving step` and `[Draft Save] Response`).

Replace `goToNextStep` with:

```ts
  const goToNextStep = useCallback(() => {
    setActiveStepState((prev) => Math.min(prev + 1, STEP_COUNT - 1) as FormStep);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);
```

Replace the `validateStep` callback and `stepValidations` with:

```ts
  const validateStep = useCallback((step: FormStep): StepValidation => validateStepData(step, formData), [formData]);

  const stepValidations: Record<FormStep, StepValidation> = {
    0: validateStep(0),
    1: validateStep(1),
    2: validateStep(2),
    3: validateStep(3),
  };
```

Add, after `removeApplication`:

```ts
  const markApplicationStarted = useCallback(() => {
    try {
      if (sessionStorage.getItem(STARTED_KEY)) return;
      sessionStorage.setItem(STARTED_KEY, '1');
    } catch {
      // sessionStorage unavailable: fire once per mount instead
    }
    trackTaxonomyEvent('application_started');
  }, []);

  /**
   * Review pressed "Continue to payment": write the application (POST, or
   * PATCH when editing a submitted one), remember what came back so the pay
   * step and a reload both find it, and leave the draft in localStorage until
   * payment succeeds or the user starts over.
   */
  const submitApplication = useCallback(async (): Promise<SubmitResult> => {
    setIsSubmitting(true);
    setSubmissionError(null);
    try {
      const idToken = await (user?.raw as any)?.getIdToken?.();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (idToken) headers.Authorization = `Bearer ${idToken}`;

      const isEditing = returnUserMode === 'edit' && draftId;
      const url = isEditing ? `/api/application?id=${draftId}` : '/api/application';
      const response = await fetch(url, {
        method: isEditing ? 'PATCH' : 'POST',
        headers,
        body: JSON.stringify(buildSubmitPayload(formData)),
      });
      const result = await response.json();
      if (!result?.success || !result.data?.id) {
        const error = result?.error || 'errors.submitFailed';
        setSubmissionError(error);
        return { ok: false, error };
      }
      const submitted = { id: result.data.id as string, applicationNumber: (result.data.application_number as string) || null };
      setSubmittedApplication(submitted);
      setDraftId(submitted.id);
      return { ok: true, ...submitted };
    } catch (error) {
      console.error('Submission error:', error);
      setSubmissionError('errors.submitFailed');
      return { ok: false, error: 'errors.submitFailed' };
    } finally {
      setIsSubmitting(false);
    }
  }, [user, returnUserMode, draftId, formData]);
```

Update the `value` object: `isLastStep: activeStep === STEP_COUNT - 1,` and add `submitApplication, submittedApplication, markApplicationStarted,`.

- [ ] **Step 7: Type-check**

Run: `pnpm --filter @neram/marketing type-check`
Expected: errors remain only in `ApplyFormWizard.tsx` (deleted in Task 12) and any step file still reading `STEP_LABELS`. Nothing in `FormContext.tsx`.

- [ ] **Step 8: Commit Tasks 5 and 6 together**

```bash
git add apps/marketing/src/components/apply/types.ts apps/marketing/src/components/apply/validation.ts apps/marketing/src/components/apply/validation.test.ts apps/marketing/src/components/apply/FormContext.tsx
git commit -m "feat(marketing): pure apply-form rules, four-step model, submission from the form context"
```

---

### Task 7: About you step

**Files:**
- Rename: `apps/marketing/src/components/apply/steps/PersonalInfoStep.tsx` → `apps/marketing/src/components/apply/steps/AboutYouStep.tsx` (`git mv`)
- Modify: the renamed file
- Modify: `apps/marketing/src/components/apply/steps/index.ts`
- Test: `apps/marketing/src/components/apply/steps/AboutYouStep.test.tsx`

**Interfaces:**
- Consumes: `useFormContext` (Task 6), i18n keys `apply.aboutYou.*` (Task 14 supplies the text; until then keys render as themselves, which the test relies on).
- Produces: `<AboutYouStep />` default export. Field names (for E2E): inputs get `name` attributes `firstName`, `fatherName`, `dateOfBirth`, `pincode`, `phone`, `parentPhone`, `email`, `city`, `state`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/marketing/src/components/apply/steps/AboutYouStep.test.tsx
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { ApplicationFormData } from '../types';
import { DEFAULT_FORM_DATA } from '../types';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join(',')}` : key,
}));

let formData: ApplicationFormData = structuredClone(DEFAULT_FORM_DATA);
const updateFormData = vi.fn((section: keyof ApplicationFormData, data: object) => {
  formData = { ...formData, [section]: { ...(formData[section] as object), ...data } } as ApplicationFormData;
});
const setShowPhoneVerification = vi.fn();
vi.mock('../FormContext', () => ({
  useFormContext: () => ({
    formData,
    updateFormData,
    isFieldPrefilled: () => false,
    setShowPhoneVerification,
  }),
}));

import AboutYouStep from './AboutYouStep';

const getCurrentPosition = vi.fn();

beforeEach(() => {
  formData = structuredClone(DEFAULT_FORM_DATA);
  updateFormData.mockClear();
  getCurrentPosition.mockClear();
  Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });
});
afterEach(() => cleanup());

describe('AboutYouStep', () => {
  it('never asks for the location on mount', () => {
    render(<AboutYouStep />);
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('asks for the location only when the student presses the button', () => {
    render(<AboutYouStep />);
    fireEvent.click(screen.getByRole('button', { name: 'aboutYou.useMyLocation' }));
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it('shows the PIN-code fallback copy when the browser refuses', () => {
    getCurrentPosition.mockImplementation((_ok: unknown, fail: (e: { message: string }) => void) => fail({ message: 'denied' }));
    render(<AboutYouStep />);
    fireEvent.click(screen.getByRole('button', { name: 'aboutYou.useMyLocation' }));
    expect(screen.getByRole('alert').textContent).toContain('aboutYou.locationFailed');
  });

  it('renders every field one per row with the parent phone and optional email', () => {
    const { container } = render(<AboutYouStep />);
    for (const name of ['firstName', 'fatherName', 'dateOfBirth', 'pincode', 'phone', 'parentPhone', 'email']) {
      expect(container.querySelector(`input[name="${name}"]`), name).not.toBeNull();
    }
    expect(container.querySelector('input[name="email"]')?.hasAttribute('required')).toBe(false);
  });

  it('shows the found city and state under the PIN code', () => {
    formData.location = { ...formData.location, pincode: '625001', city: 'Madurai', state: 'Tamil Nadu', locationSource: 'pincode' };
    render(<AboutYouStep />);
    expect(screen.getByText('aboutYou.pinFound:Madurai,Tamil Nadu')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run apps/marketing/src/components/apply/steps/AboutYouStep.test.tsx`
Expected: FAIL with "Failed to resolve import ./AboutYouStep".

- [ ] **Step 3: Rename and edit the step**

```bash
git mv apps/marketing/src/components/apply/steps/PersonalInfoStep.tsx apps/marketing/src/components/apply/steps/AboutYouStep.tsx
```

Edits to `AboutYouStep.tsx`:

1. Imports: add `import { useTranslations } from 'next-intl';`, add `ToggleButton, ToggleButtonGroup, Stack` to the `@neram/ui` import, remove `RadioGroup, FormControlLabel, Radio, FormLabel, FormControl` if no longer used after step 6 below (keep `FormControl`, `InputLabel`, `Select`, `MenuItem` for Country and State). Remove `GENDER_OPTIONS` from the `../types` import.
2. Rename the component: `export default function AboutYouStep()`, and add `const t = useTranslations('apply');` as its first line.
3. Delete the mount effect (lines 54 to 59, the `useEffect` that calls `requestGeolocation`).
4. In `requestGeolocation`, change the error branch to `setGeoError(t('aboutYou.locationFailed'));` and remove the `console.log`.
5. Replace the two header `Typography` blocks at the top of the returned JSX with:

```tsx
      <Typography variant="h5" component="h1" gutterBottom fontWeight={700}>
        {t('aboutYou.title')}
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        {t('aboutYou.subtitle')}
      </Typography>
```

6. Replace the `Grid container spacing={3}` and every `Grid item xs={12} sm={6}` with `Stack spacing={2.5}` and plain `Box` children (one field per row on every width; the column is 640 px wide at most). Concretely: change `<Grid container spacing={3}>` to `<Stack spacing={2.5}>`, its closing tag to `</Stack>`, and every `<Grid item ...>` / `</Grid>` pair to `<Box>` / `</Box>`.
7. First name field: `label={t('aboutYou.studentName')}`, `helperText={t('aboutYou.studentNameHelper')}`, `inputProps={{ minLength: 2, name: 'firstName', autoComplete: 'given-name' }}`, prefilled chip label `t('aboutYou.prefilled')`.
8. Father's name: `label={t('aboutYou.fatherName')}`, `helperText={t('aboutYou.fatherNameHelper')}`, `inputProps={{ minLength: 2, name: 'fatherName' }}`.
9. Move the Date of birth field directly after the father's name; `label={t('aboutYou.dateOfBirth')}`, `inputProps={{ max: ..., name: 'dateOfBirth' }}`.
10. Gender: replace the `FormControl required` / `RadioGroup` block with

```tsx
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }} id="gender-label">
            {t('aboutYou.gender')}
          </Typography>
          <ToggleButtonGroup
            exclusive
            fullWidth
            aria-labelledby="gender-label"
            value={formData.personal.gender || null}
            onChange={(_, value: 'male' | 'female' | 'other' | null) =>
              updateFormData('personal', { gender: value ?? '' })
            }
            sx={{ '& .MuiToggleButton-root': { minHeight: 48, textTransform: 'none' } }}
          >
            <ToggleButton value="male">{t('aboutYou.genderMale')}</ToggleButton>
            <ToggleButton value="female">{t('aboutYou.genderFemale')}</ToggleButton>
            <ToggleButton value="other">{t('aboutYou.genderOther')}</ToggleButton>
          </ToggleButtonGroup>
        </Box>
```

11. Location header: replace the header `Box` (the one with "Location" and the Detect Location button) with

```tsx
        <Box sx={{ mt: 1 }}>
          <Typography variant="h6" component="h2" fontWeight={600}>
            {t('aboutYou.location')}
          </Typography>
          {geoError && (
            <Alert severity="info" role="alert" sx={{ mt: 1 }}>
              {geoError}
            </Alert>
          )}
        </Box>
```

12. Country select: `label={t('aboutYou.country')}` (both `InputLabel` and `Select` `label` props).
13. Postal code field: `inputProps={{ inputMode: ..., maxLength: ..., name: 'pincode' }}`; replace `helperText={pincodeError || countryConfig.postalCode.helperText}` with

```tsx
            helperText={
              pincodeError ||
              (formData.location.city && formData.location.state && formData.location.locationSource === 'pincode'
                ? t('aboutYou.pinFound', { city: formData.location.city, state: formData.location.state })
                : countryConfig.postalCode.helperText)
            }
```

Directly after the postal code `TextField`, still inside its `Box`, add the secondary location button:

```tsx
          <Button
            variant="text"
            size="small"
            startIcon={isGeolocating ? <CircularProgress size={16} /> : <MyLocationOutlined />}
            onClick={requestGeolocation}
            disabled={isGeolocating}
            sx={{ mt: 1, minHeight: 44 }}
          >
            {isGeolocating ? t('aboutYou.detecting') : t('aboutYou.useMyLocation')}
          </Button>
```

14. City field: `label={t('aboutYou.city')}`, `inputProps={{ name: 'city' }}`. State text field: `inputProps={{ name: 'state' }}`. Address: `label={t('aboutYou.address')}`, `helperText={t('aboutYou.addressHelper')}`.
15. Phone field, moved to after Address: `label={t('aboutYou.phone')}`, `inputProps={{ inputMode: 'numeric', pattern: '[0-9]*', maxLength: countryConfig.phoneLength, name: 'phone', autoComplete: 'tel-national' }}`; Verify button text `t('aboutYou.verify')`, chip label `t('aboutYou.verified')`; helper:

```tsx
            helperText={
              !formData.personal.phoneVerified &&
              formData.personal.phone.length > 0 &&
              formData.personal.phone.length !== countryConfig.phoneLength
                ? t('aboutYou.phoneInvalid', { length: countryConfig.phoneLength })
                : !formData.personal.phoneVerified
                ? t('aboutYou.phoneHelper')
                : ''
            }
```

16. After the phone field add the parent phone:

```tsx
        <Box>
          <TextField
            fullWidth
            label={t('aboutYou.parentPhone')}
            value={formData.personal.parentPhone}
            onChange={(e) =>
              updateFormData('personal', { parentPhone: e.target.value.replace(/\D/g, '').slice(0, countryConfig.phoneLength) })
            }
            inputProps={{ inputMode: 'numeric', pattern: '[0-9]*', maxLength: countryConfig.phoneLength, name: 'parentPhone' }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start" sx={{ mr: 0.5 }}>
                  <Typography variant="body1" color="text.secondary" sx={{ whiteSpace: 'nowrap', fontSize: '0.875rem' }}>
                    {countryConfig.phonePrefix}
                  </Typography>
                </InputAdornment>
              ),
            }}
          />
        </Box>
```

17. Email, last: remove `required`, `label={t('aboutYou.email')}`, `inputProps={{ name: 'email', autoComplete: 'email' }}`.
18. Every `TextField` keeps `fullWidth`; add `sx={{ '& .MuiInputBase-root': { minHeight: 48 } }}` is unnecessary because the theme's default input height is 56 px; leave heights alone.

Update `steps/index.ts`:

```ts
export { default as AboutYouStep } from './AboutYouStep';
export { default as YourStudiesBlock } from './YourStudiesBlock';
export { default as YourCourseStep } from './YourCourseStep';
export { default as ReviewStep } from './ReviewStep';
export { default as PayAndEnrolStep } from './PayAndEnrolStep';
```

(The last three files arrive in Tasks 9 to 11; the barrel type-checks once they exist. Until then, keep the old lines for the files that still exist.)

- [ ] **Step 4: Run the tests**

Run: `pnpm test:run apps/marketing/src/components/apply/steps/AboutYouStep.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/marketing/src/components/apply/steps/AboutYouStep.tsx apps/marketing/src/components/apply/steps/AboutYouStep.test.tsx apps/marketing/src/components/apply/steps/index.ts
git commit -m "feat(marketing): About you step, location on request only, parent phone, optional email and gender"
```

---

### Task 8: Programme picker and inline fee card

**Files:**
- Create: `apps/marketing/src/components/apply/ProgrammePicker.tsx`
- Create: `apps/marketing/src/components/apply/FeeSummaryCard.tsx`
- Test: `apps/marketing/src/components/apply/ProgrammePicker.test.tsx`

**Interfaces:**
- Consumes: `GET /api/fee-structures?courseType=<nata|jee_paper2|both>&excludeHidden=true` → `{ feeStructures: FeeStructure[] }` (exists).
- Produces: `<ProgrammePicker courseType value onChange />` where `onChange(pick: { id: string; label: string; programType: 'year_long' | 'crash_course'; feeAmount: number; comboExtraFee: number } | null)`; `<FeeSummaryCard label feeAmount comboExtraFee hidden />`. Also exports `useProgrammes(courseType)` for the fee card and `formatRupees(n)`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/marketing/src/components/apply/ProgrammePicker.test.tsx
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join(',')}` : key,
}));

import ProgrammePicker, { formatRupees } from './ProgrammePicker';

const rows = [
  { id: 'fs-year', course_type: 'nata', program_type: 'year_long', display_name: 'NATA 1 Year', fee_amount: 24000, combo_extra_fee: 0, duration: '12 months', schedule_summary: 'Weekends', features: [] },
  { id: 'fs-crash', course_type: 'nata', program_type: 'crash_course', display_name: 'NATA Crash Course', fee_amount: 9000, combo_extra_fee: 0, duration: '6 weeks', schedule_summary: 'Daily', features: [] },
];

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: true,
    json: async () => ({ feeStructures: url.includes('courseType=both') ? [] : rows }),
  })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ProgrammePicker', () => {
  it('lists the programmes for the course with the standard fee', async () => {
    const onChange = vi.fn();
    render(<ProgrammePicker courseType="nata" value={null} onChange={onChange} />);
    await waitFor(() => expect(screen.getByText('NATA 1 Year')).toBeTruthy());
    expect(screen.getByText('yourCourse.standardFee:24,000')).toBeTruthy();
    expect(screen.getByText('12 months')).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith('/api/fee-structures?courseType=nata&excludeHidden=true');
  });

  it('reports the pick with its label, programme type and fee', async () => {
    const onChange = vi.fn();
    render(<ProgrammePicker courseType="nata" value={null} onChange={onChange} />);
    await waitFor(() => screen.getByText('NATA Crash Course'));
    fireEvent.click(screen.getByRole('radio', { name: /NATA Crash Course/ }));
    expect(onChange).toHaveBeenCalledWith({ id: 'fs-crash', label: 'NATA Crash Course', programType: 'crash_course', feeAmount: 9000, comboExtraFee: 0 });
  });

  it('shows the empty-state copy when no programme is open', async () => {
    render(<ProgrammePicker courseType="both" value={null} onChange={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('yourCourse.programmeEmpty')).toBeTruthy());
  });

  it('formats rupees the Indian way', () => {
    expect(formatRupees(24000)).toBe('24,000');
    expect(formatRupees(125000)).toBe('1,25,000');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run apps/marketing/src/components/apply/ProgrammePicker.test.tsx`
Expected: FAIL with "Failed to resolve import ./ProgrammePicker".

- [ ] **Step 3: Write the components**

```tsx
// apps/marketing/src/components/apply/ProgrammePicker.tsx
'use client';

import { useEffect, useState } from 'react';
import { Box, Card, CardActionArea, Skeleton, Stack, Typography, Alert } from '@neram/ui';
import { CheckCircleOutlined } from '@mui/icons-material';
import { useTranslations } from 'next-intl';

export interface ProgrammeRow {
  id: string;
  course_type: string;
  program_type: 'year_long' | 'crash_course';
  display_name: string;
  fee_amount: number;
  combo_extra_fee: number;
  duration: string;
  schedule_summary: string | null;
  features: string[];
}

export interface ProgrammePick {
  id: string;
  label: string;
  programType: 'year_long' | 'crash_course';
  feeAmount: number;
  comboExtraFee: number;
}

export function formatRupees(amount: number): string {
  return Math.round(amount).toLocaleString('en-IN');
}

/** The open programmes for a course, from the same route the fees page uses. */
export function useProgrammes(courseType: string | null) {
  const [rows, setRows] = useState<ProgrammeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!courseType || courseType === 'not_sure') {
      setRows([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    fetch(`/api/fee-structures?courseType=${courseType}&excludeHidden=true`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data) => {
        if (!cancelled) setRows(Array.isArray(data?.feeStructures) ? data.feeStructures : []);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [courseType]);

  return { rows, loading, failed };
}

interface ProgrammePickerProps {
  courseType: string | null;
  value: string | null;
  onChange: (pick: ProgrammePick | null) => void;
}

/**
 * "Choose your programme": one card per open fee_structures row for the
 * chosen course, with the duration and the standard fee on the card, so the
 * exact fee is visible two steps before payment. Radio semantics so a screen
 * reader hears one group with one selection.
 */
export default function ProgrammePicker({ courseType, value, onChange }: ProgrammePickerProps) {
  const t = useTranslations('apply');
  const { rows, loading, failed } = useProgrammes(courseType);

  if (!courseType || courseType === 'not_sure') return null;

  if (loading) {
    return (
      <Stack spacing={1.5} aria-busy="true" aria-label={t('yourCourse.programmeLoading')}>
        <Skeleton variant="rectangular" height={84} sx={{ borderRadius: 1 }} />
        <Skeleton variant="rectangular" height={84} sx={{ borderRadius: 1 }} />
      </Stack>
    );
  }

  if (failed || rows.length === 0) {
    return <Alert severity="info">{t('yourCourse.programmeEmpty')}</Alert>;
  }

  return (
    <Stack spacing={1.5} role="radiogroup" aria-label={t('yourCourse.programmeQuestion')}>
      {rows.map((row) => {
        const selected = value === row.id;
        return (
          <Card
            key={row.id}
            variant="outlined"
            sx={{
              borderColor: selected ? 'primary.main' : 'divider',
              borderWidth: selected ? 2 : 1,
              bgcolor: selected ? 'primary.50' : 'background.paper',
              transition: 'border-color 150ms',
            }}
          >
            <CardActionArea
              role="radio"
              aria-checked={selected}
              onClick={() =>
                onChange({
                  id: row.id,
                  label: row.display_name,
                  programType: row.program_type,
                  feeAmount: Number(row.fee_amount),
                  comboExtraFee: Number(row.combo_extra_fee) || 0,
                })
              }
              sx={{ p: 2, minHeight: 84, display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'space-between' }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="subtitle1" fontWeight={600}>
                  {row.display_name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {row.duration}
                  {row.schedule_summary ? ` · ${row.schedule_summary}` : ''}
                </Typography>
                <Typography variant="body2" fontWeight={600} sx={{ mt: 0.5 }}>
                  {t('yourCourse.standardFee', { amount: formatRupees(Number(row.fee_amount)) })}
                </Typography>
              </Box>
              {selected && <CheckCircleOutlined color="primary" aria-hidden />}
            </CardActionArea>
          </Card>
        );
      })}
    </Stack>
  );
}
```

```tsx
// apps/marketing/src/components/apply/FeeSummaryCard.tsx
'use client';

import { Box, Paper, Typography } from '@neram/ui';
import { CurrencyRupeeOutlined } from '@mui/icons-material';
import { useTranslations } from 'next-intl';
import { formatRupees } from './ProgrammePicker';

interface FeeSummaryCardProps {
  label: string | null;
  feeAmount: number | null;
  comboExtraFee?: number;
  /** Government-school applicants: the fee is confirmed after scholarship review. */
  scholarship?: boolean;
}

/** Inline, never floating: the programme and its standard fee, on the step that chose them. */
export default function FeeSummaryCard({ label, feeAmount, comboExtraFee = 0, scholarship = false }: FeeSummaryCardProps) {
  const t = useTranslations('apply');
  if (!label || feeAmount === null) return null;

  return (
    <Paper variant="outlined" sx={{ p: 2, display: 'flex', gap: 1.5, alignItems: 'flex-start', bgcolor: 'grey.50' }}>
      <CurrencyRupeeOutlined color="primary" aria-hidden sx={{ mt: 0.25 }} />
      <Box>
        <Typography variant="subtitle2" fontWeight={600}>
          {t('yourCourse.feeCardTitle')}: {label}
        </Typography>
        {scholarship ? (
          <Typography variant="body2" color="text.secondary">
            {t('yourCourse.feeCardScholarship')}
          </Typography>
        ) : (
          <>
            <Typography variant="body2">
              {t('yourCourse.standardFee', { amount: formatRupees(feeAmount) })}
            </Typography>
            {comboExtraFee > 0 && (
              <Typography variant="body2" color="text.secondary">
                {t('yourCourse.comboNote', { amount: formatRupees(comboExtraFee) })}
              </Typography>
            )}
            <Typography variant="body2" color="text.secondary">
              {t('yourCourse.feeCardBody')}
            </Typography>
          </>
        )}
      </Box>
    </Paper>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm test:run apps/marketing/src/components/apply/ProgrammePicker.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/marketing/src/components/apply/ProgrammePicker.tsx apps/marketing/src/components/apply/ProgrammePicker.test.tsx apps/marketing/src/components/apply/FeeSummaryCard.tsx
git commit -m "feat(marketing): programme picker from fee structures and inline fee card"
```

---

### Task 9: Your course step (course, programme, mode, centre, studies)

**Files:**
- Rename: `steps/AcademicDetailsStep.tsx` → `steps/YourStudiesBlock.tsx` (`git mv`), then edit
- Rename: `steps/CourseSelectionStep.tsx` → `steps/YourCourseStep.tsx` (`git mv`), then edit
- Modify: `apps/marketing/src/components/apply/steps/index.ts` (done in Task 7)

**Interfaces:**
- Consumes: `ProgrammePicker`, `FeeSummaryCard` (Task 8), `useFormContext`, i18n `apply.yourCourse.*`.
- Produces: `<YourCourseStep />`, `<YourStudiesBlock />` default exports. `YourCourseStep` fires `trackTaxonomyEvent('course_selected', { course, fee_structure_id })` when a programme is picked.

- [ ] **Step 1: Studies block**

```bash
git mv apps/marketing/src/components/apply/steps/AcademicDetailsStep.tsx apps/marketing/src/components/apply/steps/YourStudiesBlock.tsx
```

Edits to `YourStudiesBlock.tsx`:

1. Add `import { useTranslations } from 'next-intl';` and `Accordion, AccordionSummary, AccordionDetails, Alert` to the `@neram/ui` import; add `ExpandMoreOutlined, InfoOutlined` to the icons import.
2. Rename to `export default function YourStudiesBlock()` and add `const t = useTranslations('apply');`.
3. Replace the two header `Typography` blocks with:

```tsx
      <Typography variant="h6" component="h2" gutterBottom fontWeight={600}>
        {t('yourCourse.studiesTitle')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('yourCourse.studiesSubtitle')}
      </Typography>
```

4. The category question `Typography` becomes `{t('yourCourse.categoryQuestion')}`; the category grid stays `xs={6} sm={3}` (four cards, two per row on phones, 48 px tall minimum: add `sx={{ minHeight: 48 }}` to each `CardActionArea` if smaller).
5. Delete the "Your Details" `Typography` heading (keep the per-category `Grid` blocks). Inside the school-student block, remove the "Type of School" `Grid item` entirely (it moves into More details).
6. Replace the whole "Common Fields" `Box` (from `{/* Common Fields */}` to the end of the returned JSX) with:

```tsx
      {/* Exam year: always */}
      <Box sx={{ mt: 3 }}>
        <FormControl fullWidth required>
          <InputLabel>{t('yourCourse.examYear')}</InputLabel>
          <Select
            value={academic.targetExamYear || ''}
            onChange={(e) => updateFormData('academic', { targetExamYear: e.target.value as string })}
            label={t('yourCourse.examYear')}
            inputProps={{ name: 'targetExamYear' }}
          >
            {getExamYearOptions().map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {/* Caste category and school type: optional, folded away */}
      <Accordion disableGutters elevation={0} sx={{ mt: 2, border: 1, borderColor: 'divider', borderRadius: 1, '&:before': { display: 'none' } }}>
        <AccordionSummary expandIcon={<ExpandMoreOutlined />} sx={{ minHeight: 48 }}>
          <Typography variant="subtitle2">{t('yourCourse.moreDetails')}</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>{t('yourCourse.casteCategory')}</InputLabel>
                <Select
                  value={academic.casteCategory || ''}
                  onChange={(e) => updateFormData('academic', { casteCategory: (e.target.value || null) as typeof academic.casteCategory })}
                  label={t('yourCourse.casteCategory')}
                  inputProps={{ name: 'casteCategory' }}
                >
                  {CASTE_CATEGORY_OPTIONS.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            {academic.applicantCategory === 'school_student' && (
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>{t('yourCourse.schoolType')}</InputLabel>
                  <Select
                    value={academic.schoolType || ''}
                    onChange={(e) => updateFormData('academic', { schoolType: (e.target.value || null) as SchoolType | null })}
                    label={t('yourCourse.schoolType')}
                    inputProps={{ name: 'schoolType' }}
                  >
                    {SCHOOL_TYPE_OPTIONS.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            )}
            {academic.schoolType === 'government_school' && (
              <Grid item xs={12}>
                <Alert severity="info" icon={<InfoOutlined />}>
                  {t('yourCourse.scholarship')}
                </Alert>
              </Grid>
            )}
          </Grid>
        </AccordionDetails>
      </Accordion>
    </Box>
  );
}
```

- [ ] **Step 2: Course step**

```bash
git mv apps/marketing/src/components/apply/steps/CourseSelectionStep.tsx apps/marketing/src/components/apply/steps/YourCourseStep.tsx
```

Edits to `YourCourseStep.tsx`:

1. Imports: add `import { useTranslations } from 'next-intl';`, `import ProgrammePicker, { type ProgrammePick } from '../ProgrammePicker';`, `import FeeSummaryCard from '../FeeSummaryCard';`, `import YourStudiesBlock from './YourStudiesBlock';`. Remove `useMemo`'s unused imports only if the linter complains.
2. Replace `COURSE_OPTIONS` labels and descriptions with i18n lookups: change the array to carry keys, `{ value: 'nata', labelKey: 'yourCourse.nata', bodyKey: 'yourCourse.nataBody', icon }`, and so on for `jee_paper2` (`yourCourse.jee`, `yourCourse.jeeBody`), `both` (`yourCourse.both`, `yourCourse.bothBody`), `not_sure` (`yourCourse.notSure`, `yourCourse.notSureBody`). In the render, use `t(option.labelKey)` and `t(option.bodyKey)`.
3. Rename to `export default function YourCourseStep()` and add `const t = useTranslations('apply');`.
4. `handleCourseSelect` becomes:

```tsx
  const handleCourseSelect = (courseType: CourseType) => {
    updateFormData('course', {
      interestCourse: courseType,
      feeStructureId: null,
      feeStructureLabel: null,
      programType: null,
    });
  };

  const handleProgrammePick = (pick: ProgrammePick | null) => {
    updateFormData('course', {
      feeStructureId: pick?.id ?? null,
      feeStructureLabel: pick?.label ?? null,
      programType: pick?.programType ?? null,
    });
    setPickedFee(pick ? { amount: pick.feeAmount, combo: pick.comboExtraFee } : null);
    if (pick) trackTaxonomyEvent('course_selected', { course: course.interestCourse, fee_structure_id: pick.id });
  };
```

with `const [pickedFee, setPickedFee] = useState<{ amount: number; combo: number } | null>(null);` next to the other state.

5. Replace the two header `Typography` blocks with `t('yourCourse.title')` (variant `h5`, component `h1`) and `t('yourCourse.subtitle')`.
6. Delete the "Government School Scholarship Alert" block (it now lives inside More details).
7. Course cards: the question `Typography` becomes `{t('yourCourse.courseQuestion')}`; change the grid items to `xs={6}` (two cards per row on phones, four on `md`), `CardActionArea` padding `p: 2`, icon size 32, label variant `subtitle1`.
8. Directly after the course cards `Box` (before the first `Divider`), insert:

```tsx
      {course.interestCourse && course.interestCourse !== 'not_sure' && (
        <Box sx={{ mb: 4 }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            {t('yourCourse.programmeQuestion')} *
          </Typography>
          <ProgrammePicker courseType={course.interestCourse} value={course.feeStructureId} onChange={handleProgrammePick} />
        </Box>
      )}

      {course.interestCourse === 'not_sure' && (
        <Alert
          severity="info"
          sx={{ mb: 4 }}
          action={
            <Button color="inherit" size="small" onClick={() => { setCallbackError(null); setCallbackSuccess(false); setCallbackDialogOpen(true); }} sx={{ minHeight: 44 }}>
              {t('yourCourse.askUsToCall')}
            </Button>
          }
        >
          {t('yourCourse.notSureFee')}
        </Alert>
      )}
```

9. Learning mode: the question becomes `t('yourCourse.modeQuestion')`; the two card titles and bodies become `t('yourCourse.hybrid')`, `t('yourCourse.hybridBody')`, `t('yourCourse.online')`, `t('yourCourse.onlineBody')`. Delete the "AI-Powered Hybrid Learning Platform" info card and the "You've selected 100% online" alert (marketing copy; the shell is a task, not a pitch).
10. After the centre-selection block (after its closing `</>` and `)}`), insert the studies block and the fee card:

```tsx
      <Divider sx={{ my: 4 }} />
      <YourStudiesBlock />

      {course.feeStructureLabel && (
        <Box sx={{ mt: 4 }}>
          <FeeSummaryCard
            label={course.feeStructureLabel}
            feeAmount={pickedFee?.amount ?? null}
            comboExtraFee={course.interestCourse === 'both' ? pickedFee?.combo ?? 0 : 0}
            scholarship={formData.academic.applicantCategory === 'school_student' && formData.academic.schoolType === 'government_school'}
          />
        </Box>
      )}
```

If `pickedFee` is null because the draft restored a `feeStructureId` from storage, the card shows no amount; that is acceptable for D-A (D-C's quote route replaces the card's source).

11. The "Need more information?" callback box copy stays (it is already plain), but change its button text to `t('yourCourse.askUsToCall')`.

- [ ] **Step 3: Type-check**

Run: `pnpm --filter @neram/marketing type-check`
Expected: no errors in `YourCourseStep.tsx` or `YourStudiesBlock.tsx`; the remaining errors are in `ApplyFormWizard.tsx` and `ReviewStep.tsx` (`onEditStep` indices, next task).

- [ ] **Step 4: Commit**

```bash
git add apps/marketing/src/components/apply/steps/YourStudiesBlock.tsx apps/marketing/src/components/apply/steps/YourCourseStep.tsx
git commit -m "feat(marketing): Your course step with programme picker, compact studies block and inline fee card"
```

---

### Task 10: Review step

**Files:**
- Modify: `apps/marketing/src/components/apply/steps/ReviewStep.tsx`

**Interfaces:**
- Consumes: `LegalDrawer` (`@/components/legal/LegalDrawer`, props `open`, `onClose`, `initialTab` 0 Terms / 1 Refund), i18n `apply.review.*`.
- Produces: `<ReviewStep onEditStep />` where `onEditStep(step: 0 | 1)`.

- [ ] **Step 1: Edit the file**

1. Imports: add `import { useState } from 'react';`, `import { useTranslations } from 'next-intl';`, `import LegalDrawer from '@/components/legal/LegalDrawer';`; remove `Link from 'next/link'`, `Alert`, `Button`, `CheckCircleOutlined` only if unused after the edits below.
2. `ReviewSection`: keep, but make the edit control a text button with a 44 px target: replace the `IconButton` with

```tsx
          <Button size="small" startIcon={<EditOutlined fontSize="small" />} onClick={() => onEdit(stepIndex)} aria-label={t('review.edit', { section: title })} sx={{ minHeight: 44 }}>
            {t('review.editShort')}
          </Button>
```

and pass `t` into `ReviewSection` as a prop (`t: ReturnType<typeof useTranslations>`), or define `ReviewSection` inside `ReviewStep` so it closes over `t`. Choose the latter: move the `ReviewSection` function body inside `ReviewStep`.
3. Header: `t('review.title')` (variant `h5`, component `h1`) and `t('review.subtitle')`.
4. Three sections in this order, with these `stepIndex` values:
   - `t('review.aboutYou')`, `stepIndex={0}`: name, father's name, date of birth, gender (only when set), location line, PIN.
   - `t('review.yourCourse')`, `stepIndex={1}`: course label, `t('review.programme')` = `course.feeStructureLabel || '—'` (use the word `Not chosen` from `t('review.notChosen')` instead of a dash), learning mode chip, preferred centre, then the studies: category chip, the per-category items (`renderAcademicDetails()` unchanged), exam year, caste when set, school type when set.
   - `t('review.contact')`, `stepIndex={0}`: phone with the Verified chip, parent phone when set, email when set.
5. Delete the "Phone Verification Warning" alert and the "Submission Info" alert (the validators and the pay step own those messages now).
6. Terms: replace the `FormControlLabel` label with

```tsx
              <Typography variant="body2">
                {t.rich('review.terms', {
                  terms: (chunks) => (
                    <Box component="button" type="button" onClick={() => { setLegalTab(0); setLegalOpen(true); }} sx={{ all: 'unset', color: 'primary.main', textDecoration: 'underline', cursor: 'pointer' }}>
                      {chunks}
                    </Box>
                  ),
                  refund: (chunks) => (
                    <Box component="button" type="button" onClick={() => { setLegalTab(1); setLegalOpen(true); }} sx={{ all: 'unset', color: 'primary.main', textDecoration: 'underline', cursor: 'pointer' }}>
                      {chunks}
                    </Box>
                  ),
                })}
              </Typography>
```

with `const [legalOpen, setLegalOpen] = useState(false); const [legalTab, setLegalTab] = useState(0);` and `<LegalDrawer open={legalOpen} onClose={() => setLegalOpen(false)} initialTab={legalTab} />` rendered at the end. The checkbox input gets `inputProps={{ name: 'termsAccepted' }}`.

The i18n value for `review.terms` (Task 14) is `"I agree to the <terms>Terms</terms> and the <refund>Refund policy</refund>."`.

- [ ] **Step 2: Type-check**

Run: `pnpm --filter @neram/marketing type-check`
Expected: no errors in `ReviewStep.tsx`.

- [ ] **Step 3: Commit**

```bash
git add apps/marketing/src/components/apply/steps/ReviewStep.tsx
git commit -m "feat(marketing): Review step with three groups, per-group Edit and legal drawer"
```

---

### Task 11: PaymentPanel split and the Pay and enrol step

**Files:**
- Create: `apps/marketing/src/components/apply/PaymentPanel.tsx` (the body of `PaymentDialog.tsx`)
- Modify: `apps/marketing/src/components/apply/PaymentDialog.tsx` (becomes a thin shell)
- Create: `apps/marketing/src/components/apply/steps/PayAndEnrolStep.tsx`
- Test: `apps/marketing/src/components/apply/steps/PayAndEnrolStep.test.tsx`

**Interfaces:**
- Produces: `<PaymentPanel leadId active onPaymentComplete onStateChange />` where `onStateChange({ paymentSuccess: boolean; isProcessing: boolean })`; `<PayAndEnrolStep />` reading `submittedApplication` from the context.
- Sub-project D-C later replaces the details fetch inside `PaymentPanel` with the quote route and changes the button label; nothing else in this task changes then.

- [ ] **Step 1: Write the failing test for the step**

```tsx
// apps/marketing/src/components/apply/steps/PayAndEnrolStep.test.tsx
import { render, screen, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, afterEach } from 'vitest';
import { DEFAULT_FORM_DATA } from '../types';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join(',')}` : key,
}));
const panel = vi.fn(() => <div data-testid="payment-panel" />);
vi.mock('../PaymentPanel', () => ({ default: (props: unknown) => panel(props) }));

let submittedApplication: { id: string; applicationNumber: string | null } | null = null;
vi.mock('../FormContext', () => ({
  useFormContext: () => ({
    formData: {
      ...DEFAULT_FORM_DATA,
      course: { ...DEFAULT_FORM_DATA.course, interestCourse: 'nata', feeStructureLabel: 'NATA 1 Year', learningMode: 'online_only' },
    },
    submittedApplication,
    refreshApplications: vi.fn(),
  }),
}));

import PayAndEnrolStep from './PayAndEnrolStep';

afterEach(() => cleanup());

describe('PayAndEnrolStep', () => {
  it('shows the application number, the enrolment card, what happens after payment, and the panel', () => {
    submittedApplication = { id: 'lead-1', applicationNumber: 'NERAM-2609-00042' };
    render(<PayAndEnrolStep />);
    expect(screen.getByText('pay.applicationNumber:NERAM-2609-00042')).toBeTruthy();
    expect(screen.getByText('pay.yourEnrolment')).toBeTruthy();
    expect(screen.getByText('NATA 1 Year')).toBeTruthy();
    expect(screen.getByText('pay.whatHappens1')).toBeTruthy();
    expect(screen.getByTestId('payment-panel')).toBeTruthy();
    expect(panel).toHaveBeenCalledWith(expect.objectContaining({ leadId: 'lead-1', active: true }));
  });

  it('shows a retry message instead of the panel when nothing was submitted', () => {
    submittedApplication = null;
    render(<PayAndEnrolStep />);
    expect(screen.queryByTestId('payment-panel')).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain('pay.submitFailed');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run apps/marketing/src/components/apply/steps/PayAndEnrolStep.test.tsx`
Expected: FAIL with "Failed to resolve import ./PayAndEnrolStep".

- [ ] **Step 3: Split PaymentDialog into PaymentPanel and a shell**

Find the boundary line:

```bash
grep -n "Render as bottom sheet" apps/marketing/src/components/apply/PaymentDialog.tsx
```

Create `PaymentPanel.tsx` from everything above that line, then apply these edits to the new file:

1. Keep `// @ts-nocheck` and `'use client';` at the top (the source file is untyped; typing it is out of scope).
2. Remove `Dialog, DialogTitle, DialogContent, SwipeableDrawer, IconButton` and `CloseIcon` from the imports, and `useIsMobile`.
3. Replace the props interface and the signature:

```tsx
interface PaymentPanelProps {
  leadId: string | null;
  /** False while a dialog around the panel is closed: no fetches, no script load. */
  active?: boolean;
  onPaymentComplete?: () => void;
  onStateChange?: (state: { paymentSuccess: boolean; isProcessing: boolean }) => void;
}

export default function PaymentPanel({ leadId, active = true, onPaymentComplete, onStateChange }: PaymentPanelProps) {
```

4. Replace every remaining use of `open` with `active`: in `fetchPaymentDetails` (`if (!leadId || !active) return;` and the dependency array), in the reset effect (`if (active && leadId) {` and `[active, leadId]`), and in the Razorpay script loader (`if (!active) return;` and `[active]`).
5. Delete `handleClose` (the dialog owns closing). Add after the `paymentSuccess` state:

```tsx
  useEffect(() => {
    onStateChange?.({ paymentSuccess, isProcessing });
  }, [paymentSuccess, isProcessing, onStateChange]);
```

6. Replace the end of the file (everything from `// ── Render as bottom sheet` onward is not in this file) with:

```tsx
  return (
    <>
      {renderContent()}
      <YouTubeSubscribeModal
        open={youtubeModalOpen}
        onClose={() => setYoutubeModalOpen(false)}
        onSuccess={handleYouTubeSuccess}
      />
      <LegalDrawer open={legalDrawerOpen} onClose={() => setLegalDrawerOpen(false)} initialTab={legalDrawerTab} />
    </>
  );
}
```

Then rewrite `PaymentDialog.tsx` entirely:

```tsx
// @ts-nocheck
'use client';

import { useCallback, useState } from 'react';
import { Box, Typography, Divider, Dialog, DialogTitle, DialogContent, SwipeableDrawer, IconButton } from '@neram/ui';
import { CloseIcon } from '@neram/ui';
import { useIsMobile } from '@neram/ui/hooks';
import PaymentPanel from './PaymentPanel';

interface PaymentDialogProps {
  open: boolean;
  leadId: string | null;
  onClose: () => void;
  onPaymentComplete?: () => void;
}

/**
 * The returning-user "Pay" door from the applications dashboard: the same
 * PaymentPanel the Pay and enrol step renders inline, wrapped in a bottom
 * sheet on phones and a dialog on desktop.
 */
export default function PaymentDialog({ open, leadId, onClose, onPaymentComplete }: PaymentDialogProps) {
  const isMobile = useIsMobile();
  const [state, setState] = useState({ paymentSuccess: false, isProcessing: false });

  const handleClose = useCallback(() => {
    if (state.paymentSuccess) onPaymentComplete?.();
    onClose();
  }, [state.paymentSuccess, onPaymentComplete, onClose]);

  const title = state.paymentSuccess ? 'Payment complete' : 'Complete payment';
  const panel = (
    <PaymentPanel leadId={leadId} active={open} onPaymentComplete={onPaymentComplete} onStateChange={setState} />
  );

  if (isMobile) {
    return (
      <SwipeableDrawer
        anchor="bottom"
        open={open}
        onClose={handleClose}
        onOpen={() => {}}
        disableSwipeToOpen
        PaperProps={{ sx: { maxHeight: '92vh', borderTopLeftRadius: 16, borderTopRightRadius: 16, overflow: 'hidden' } }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1, pb: 0.5 }}>
          <Box sx={{ width: 36, height: 4, borderRadius: 1, bgcolor: 'grey.300' }} />
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 2, pb: 1 }}>
          <Typography variant="subtitle1" fontWeight={700}>{title}</Typography>
          <IconButton size="small" onClick={handleClose} aria-label="Close" sx={{ minWidth: 44, minHeight: 44 }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
        <Divider />
        <Box sx={{ overflow: 'auto', px: 2, pt: 2, pb: 3 }}>{panel}</Box>
      </SwipeableDrawer>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={state.isProcessing ? undefined : handleClose}
      maxWidth="sm"
      fullWidth
      scroll="paper"
      PaperProps={{ sx: { borderRadius: 1.5, maxHeight: '90vh' } }}
    >
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
        <Typography variant="h6" component="span" fontWeight={700}>{title}</Typography>
        <IconButton size="small" onClick={handleClose} disabled={state.isProcessing} aria-label="Close">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <Divider />
      <DialogContent sx={{ pt: 2.5 }}>{panel}</DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Write the step**

```tsx
// apps/marketing/src/components/apply/steps/PayAndEnrolStep.tsx
'use client';

import { Alert, Box, Paper, Stack, Typography } from '@neram/ui';
import { CheckCircleOutlined } from '@mui/icons-material';
import { useTranslations } from 'next-intl';
import { useFormContext } from '../FormContext';
import PaymentPanel from '../PaymentPanel';

const COURSE_KEYS: Record<string, string> = {
  nata: 'yourCourse.nata',
  jee_paper2: 'yourCourse.jee',
  both: 'yourCourse.both',
  not_sure: 'yourCourse.notSure',
};

/**
 * Step 4. The application is already written; this shows what is being
 * bought, what happens after paying, and the payment panel inline. The panel
 * owns the fee table, the scheme toggle, the coupon field and the pay button.
 */
export default function PayAndEnrolStep() {
  const t = useTranslations('apply');
  const { formData, submittedApplication, refreshApplications } = useFormContext();
  const { course } = formData;

  return (
    <Box>
      <Typography variant="h5" component="h1" gutterBottom fontWeight={700}>
        {t('pay.title')}
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 1 }}>
        {t('pay.subtitle')}
      </Typography>
      {submittedApplication?.applicationNumber && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3, fontFamily: 'monospace' }}>
          {t('pay.applicationNumber', { number: submittedApplication.applicationNumber })}
        </Typography>
      )}

      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>
          {t('pay.yourEnrolment')}
        </Typography>
        <Stack spacing={0.5}>
          <Typography variant="body2">{course.interestCourse ? t(COURSE_KEYS[course.interestCourse]) : ''}</Typography>
          {course.feeStructureLabel && <Typography variant="body2">{course.feeStructureLabel}</Typography>}
          <Typography variant="body2">{course.learningMode === 'online_only' ? t('yourCourse.online') : t('yourCourse.hybrid')}</Typography>
          <Typography variant="body2" color="text.secondary">{t('pay.included')}</Typography>
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2, mb: 3, bgcolor: 'grey.50' }}>
        <Typography variant="subtitle2" fontWeight={600} gutterBottom>
          {t('pay.whatHappensTitle')}
        </Typography>
        <Stack spacing={1}>
          {(['pay.whatHappens1', 'pay.whatHappens2', 'pay.whatHappens3', 'pay.whatHappens4'] as const).map((key) => (
            <Box key={key} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
              <CheckCircleOutlined fontSize="small" color="primary" aria-hidden sx={{ mt: 0.25 }} />
              <Typography variant="body2">{t(key)}</Typography>
            </Box>
          ))}
        </Stack>
      </Paper>

      {submittedApplication ? (
        <PaymentPanel leadId={submittedApplication.id} active onPaymentComplete={refreshApplications} />
      ) : (
        <Alert severity="error" role="alert">
          {t('pay.submitFailed')}
        </Alert>
      )}
    </Box>
  );
}
```

- [ ] **Step 5: Run the test and type-check**

Run: `pnpm test:run apps/marketing/src/components/apply/steps/PayAndEnrolStep.test.tsx`
Expected: PASS, 2 tests.

Run: `pnpm --filter @neram/marketing type-check`
Expected: the only remaining errors are in `ApplyFormWizard.tsx`.

- [ ] **Step 6: Commit**

```bash
git add apps/marketing/src/components/apply/PaymentPanel.tsx apps/marketing/src/components/apply/PaymentDialog.tsx apps/marketing/src/components/apply/steps/PayAndEnrolStep.tsx apps/marketing/src/components/apply/steps/PayAndEnrolStep.test.tsx
git commit -m "feat(marketing): payment panel shared by the dialog and the Pay and enrol step"
```

---

### Task 12: ApplyFlow, StepShell, EntryChoices, RecoveryFooter; retire the old wizard

**Files:**
- Create: `apps/marketing/src/components/apply/StepShell.tsx`
- Create: `apps/marketing/src/components/apply/EntryChoices.tsx`
- Create: `apps/marketing/src/components/apply/RecoveryFooter.tsx`
- Create: `apps/marketing/src/components/apply/ApplyFlow.tsx`
- Modify: `apps/marketing/src/components/ApplyPageContent.tsx` (rewrite)
- Modify: `apps/marketing/src/components/apply/ApplicationDashboard.tsx:552`
- Modify: `apps/marketing/src/components/apply/index.ts`
- Delete: `apps/marketing/src/components/apply/ApplyFormWizard.tsx`
- Test: `apps/marketing/src/components/apply/EntryChoices.test.tsx`

**Interfaces:**
- Consumes: everything above.
- Produces: `<ApplyFlow />` (default; must be inside `FormProvider`), `<StepShell step title>{children}</StepShell>`, `<EntryChoices onManual onSignIn onTalkToNera? onUploadDocument? />` (the two optional handlers are wired by D-B; when absent, those cards are not rendered), `<RecoveryFooter />`.

- [ ] **Step 1: Write the failing test for EntryChoices**

```tsx
// apps/marketing/src/components/apply/EntryChoices.test.tsx
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, afterEach } from 'vitest';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

import EntryChoices from './EntryChoices';

afterEach(() => cleanup());

describe('EntryChoices', () => {
  it('shows only the manual path and sign-in until the assistant handlers exist', () => {
    const onManual = vi.fn();
    const onSignIn = vi.fn();
    render(<EntryChoices onManual={onManual} onSignIn={onSignIn} />);
    expect(screen.queryByRole('button', { name: /entryNera/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /entryDocument/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /aboutYou.entryManual/ }));
    expect(onManual).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'aboutYou.signIn' }));
    expect(onSignIn).toHaveBeenCalled();
  });

  it('shows the three cards when the assistant handlers are given', () => {
    const onTalkToNera = vi.fn();
    const onUploadDocument = vi.fn();
    render(<EntryChoices onManual={vi.fn()} onSignIn={vi.fn()} onTalkToNera={onTalkToNera} onUploadDocument={onUploadDocument} />);
    fireEvent.click(screen.getByRole('button', { name: /aboutYou.entryNera/ }));
    fireEvent.click(screen.getByRole('button', { name: /aboutYou.entryDocument/ }));
    expect(onTalkToNera).toHaveBeenCalled();
    expect(onUploadDocument).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run apps/marketing/src/components/apply/EntryChoices.test.tsx`
Expected: FAIL with "Failed to resolve import ./EntryChoices".

- [ ] **Step 3: Write the four components**

```tsx
// apps/marketing/src/components/apply/StepShell.tsx
'use client';

import { Box, Container, LinearProgress, Typography } from '@neram/ui';
import { useTranslations } from 'next-intl';
import { STEP_COUNT, STEP_KEYS, type FormStep } from './types';

interface StepShellProps {
  step: FormStep;
  children: React.ReactNode;
  /** The sticky action bar (Back, Continue). Omitted on the pay step. */
  actions?: React.ReactNode;
}

/** "Step 2 of 4, Your course" plus a thin progress bar, then the step, then the actions. */
export default function StepShell({ step, children, actions }: StepShellProps) {
  const t = useTranslations('apply');
  const progress = ((step + 1) / STEP_COUNT) * 100;

  return (
    <Container maxWidth="sm" sx={{ px: 2, pt: 2, pb: actions ? 12 : 4 }}>
      <Box sx={{ mb: 2 }} aria-live="polite">
        <Typography variant="overline" color="text.secondary" component="p">
          {t('progress', { current: step + 1, total: STEP_COUNT })} · {t(`steps.${STEP_KEYS[step]}`)}
        </Typography>
        <LinearProgress
          variant="determinate"
          value={progress}
          aria-label={t('progress', { current: step + 1, total: STEP_COUNT })}
          sx={{ height: 4, borderRadius: 2, mt: 0.5, '@media (prefers-reduced-motion: reduce)': { transition: 'none' } }}
        />
      </Box>

      <Box sx={{ bgcolor: 'background.paper', borderRadius: 2, p: { xs: 2, sm: 3 }, boxShadow: { xs: 0, sm: 1 } }}>
        {children}
      </Box>

      {actions && (
        <Box
          sx={{
            position: { xs: 'fixed', sm: 'static' },
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 10,
            bgcolor: 'background.paper',
            borderTop: { xs: 1, sm: 0 },
            borderColor: 'divider',
            px: 2,
            py: 1.5,
            mt: { sm: 3 },
            pb: { xs: 'max(12px, env(safe-area-inset-bottom))', sm: 0 },
          }}
        >
          <Container maxWidth="sm" sx={{ px: 0, display: 'flex', gap: 1.5, justifyContent: 'space-between' }}>
            {actions}
          </Container>
        </Box>
      )}
    </Container>
  );
}
```

```tsx
// apps/marketing/src/components/apply/EntryChoices.tsx
'use client';

import { Box, Button, Card, CardActionArea, Stack, Typography } from '@neram/ui';
import { MicNoneOutlined, UploadFileOutlined, EditNoteOutlined } from '@mui/icons-material';
import { useTranslations } from 'next-intl';

interface EntryChoicesProps {
  onManual: () => void;
  onSignIn: () => void;
  /** Supplied by the Nera sheet (sub-project D-B). Hidden until then. */
  onTalkToNera?: () => void;
  onUploadDocument?: () => void;
}

interface ChoiceCardProps {
  icon: React.ReactNode;
  title: string;
  body?: string;
  onClick: () => void;
}

function ChoiceCard({ icon, title, body, onClick }: ChoiceCardProps) {
  return (
    <Card variant="outlined">
      <CardActionArea onClick={onClick} sx={{ p: 2, minHeight: 64, display: 'flex', gap: 2, alignItems: 'center', justifyContent: 'flex-start' }}>
        <Box sx={{ color: 'primary.main', display: 'flex' }} aria-hidden>
          {icon}
        </Box>
        <Box>
          <Typography variant="subtitle1" fontWeight={600}>
            {title}
          </Typography>
          {body && (
            <Typography variant="body2" color="text.secondary">
              {body}
            </Typography>
          )}
        </Box>
      </CardActionArea>
    </Card>
  );
}

/** How would you like to fill this in? Nera, a document, or by hand. */
export default function EntryChoices({ onManual, onSignIn, onTalkToNera, onUploadDocument }: EntryChoicesProps) {
  const t = useTranslations('apply');

  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="subtitle1" fontWeight={600} gutterBottom>
        {t('aboutYou.entryTitle')}
      </Typography>
      <Stack spacing={1.5}>
        {onTalkToNera && (
          <ChoiceCard icon={<MicNoneOutlined />} title={t('aboutYou.entryNera')} body={t('aboutYou.entryNeraBody')} onClick={onTalkToNera} />
        )}
        {onUploadDocument && (
          <ChoiceCard icon={<UploadFileOutlined />} title={t('aboutYou.entryDocument')} body={t('aboutYou.entryDocumentBody')} onClick={onUploadDocument} />
        )}
        <ChoiceCard icon={<EditNoteOutlined />} title={t('aboutYou.entryManual')} onClick={onManual} />
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
        {t('aboutYou.haveAccount')}{' '}
        <Button variant="text" size="small" onClick={onSignIn} sx={{ minHeight: 44, textTransform: 'none' }}>
          {t('aboutYou.signIn')}
        </Button>
      </Typography>
    </Box>
  );
}
```

```tsx
// apps/marketing/src/components/apply/RecoveryFooter.tsx
'use client';

import Link from 'next/link';
import { Box, Button, Typography } from '@neram/ui';
import { useTranslations } from 'next-intl';

/** The exit that is not a dead end: Tools for someone not ready for coaching. */
export default function RecoveryFooter() {
  const t = useTranslations('apply');
  return (
    <Box sx={{ mt: 4, textAlign: 'center' }}>
      <Typography variant="subtitle2">{t('recovery.title')}</Typography>
      <Typography variant="body2" color="text.secondary">
        {t('recovery.body')}
      </Typography>
      <Button component={Link} href="/tools" variant="text" sx={{ mt: 0.5, minHeight: 44 }}>
        {t('recovery.cta')}
      </Button>
    </Box>
  );
}
```

```tsx
// apps/marketing/src/components/apply/ApplyFlow.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Skeleton, Snackbar, Typography } from '@neram/ui';
import { KeyboardArrowLeft, KeyboardArrowRight } from '@mui/icons-material';
import { LoginModal } from '@neram/ui';
import { useFirebaseAuth } from '@neram/auth';
import { useTranslations } from 'next-intl';
import { useFormContext } from './FormContext';
import type { FormStep } from './types';
import StepShell from './StepShell';
import EntryChoices from './EntryChoices';
import RecoveryFooter from './RecoveryFooter';
import ApplicationDashboard from './ApplicationDashboard';
import AboutYouStep from './steps/AboutYouStep';
import YourCourseStep from './steps/YourCourseStep';
import ReviewStep from './steps/ReviewStep';
import PayAndEnrolStep from './steps/PayAndEnrolStep';
import { trackTaxonomyEvent } from '@/lib/funnel-tracker';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3011';

function fireSignupConversion(transactionId: string | undefined, formData: ReturnType<typeof useFormContext>['formData']) {
  if (typeof window === 'undefined' || !(window as any).gtag) return;
  const adsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
  const signupLabel = process.env.NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL;
  if (!adsId || !signupLabel) return;
  (window as any).gtag('event', 'conversion', {
    send_to: `${adsId}/${signupLabel}`,
    transaction_id: transactionId,
    utm_source: formData.utmSource || undefined,
    utm_medium: formData.utmMedium || undefined,
    utm_campaign: formData.utmCampaign || undefined,
    gclid: formData.gclid || undefined,
    wbraid: formData.wbraid || undefined,
  });
}

/**
 * The four steps. Step 0 opens with the entry choices for a new visitor and
 * with a welcome line for a signed-in one; Review writes the application and
 * moves to Pay; Pay renders the payment panel and has no Continue of its own.
 */
export default function ApplyFlow() {
  const t = useTranslations('apply');
  const { user } = useFirebaseAuth();
  const {
    formData,
    activeStep,
    setActiveStep,
    goToNextStep,
    goToPreviousStep,
    validateStep,
    showPhoneVerification,
    setShowPhoneVerification,
    onPhoneVerified,
    isSubmitting,
    submissionError,
    setSubmissionError,
    saveDraftToDb,
    isSavingDraft,
    isAuthenticated,
    isAuthLoading,
    isReturningUser,
    returnUserMode,
    returningUserCheckComplete,
    submitApplication,
    markApplicationStarted,
    prefilledFields,
  } = useFormContext();

  const [entryChosen, setEntryChosen] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  const [saveSnackbar, setSaveSnackbar] = useState<{ open: boolean; success: boolean }>({ open: false, success: false });
  const autoPromptedRef = useRef(false);

  const currentValidation = validateStep(activeStep);
  const showEntryChoices = activeStep === 0 && !isAuthenticated && !entryChosen;

  // A signed-in user whose phone is not verified is asked once, after the form renders.
  useEffect(() => {
    if (isAuthenticated && returningUserCheckComplete && activeStep === 0 && !formData.personal.phoneVerified && !autoPromptedRef.current) {
      autoPromptedRef.current = true;
      const timer = setTimeout(() => setShowPhoneVerification(true), 500);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, returningUserCheckComplete, activeStep, formData.personal.phoneVerified, setShowPhoneVerification]);

  const handleContinue = async () => {
    if (activeStep === 0 && !formData.personal.phoneVerified) {
      setShowPhoneVerification(true);
      return;
    }
    if (!currentValidation.isValid) {
      setShowValidationErrors(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setShowValidationErrors(false);

    if (activeStep === 2) {
      trackTaxonomyEvent('application_reviewed');
      const result = await submitApplication();
      if (!result.ok) return;
      trackTaxonomyEvent('application_completed', { application_id: result.id, edited: returnUserMode === 'edit' });
      fireSignupConversion(result.id, formData);
      setActiveStep(3);
      return;
    }

    if (isAuthenticated) {
      try {
        const saved = await saveDraftToDb(activeStep);
        setSaveSnackbar({ open: true, success: saved });
      } catch {
        setSaveSnackbar({ open: true, success: false });
      }
    }
    trackTaxonomyEvent('application_step_completed', { step: activeStep });
    goToNextStep();
  };

  if (isAuthLoading || (isAuthenticated && !returningUserCheckComplete)) {
    return (
      <StepShell step={0}>
        <Skeleton variant="text" width="60%" height={40} sx={{ mb: 1 }} />
        <Skeleton variant="text" width="80%" height={24} sx={{ mb: 3 }} />
        <Skeleton variant="rectangular" height={56} sx={{ borderRadius: 1, mb: 2 }} />
        <Skeleton variant="rectangular" height={56} sx={{ borderRadius: 1, mb: 2 }} />
        <Skeleton variant="rectangular" height={48} sx={{ borderRadius: 1 }} />
      </StepShell>
    );
  }

  if (isReturningUser && returnUserMode === 'dashboard') {
    return (
      <StepShell step={0}>
        <ApplicationDashboard />
      </StepShell>
    );
  }

  const firstName = formData.personal.firstName || user?.name?.split(' ')[0] || '';
  const welcomeLine =
    isAuthenticated && activeStep === 0 && prefilledFields.size > 0
      ? firstName
        ? t('aboutYou.welcomeBack', { name: firstName })
        : t('aboutYou.welcomeBackGeneric')
      : null;

  const actions =
    activeStep === 3 ? undefined : (
      <>
        <Button
          variant="outlined"
          onClick={goToPreviousStep}
          disabled={activeStep === 0 || isSubmitting || isSavingDraft}
          startIcon={<KeyboardArrowLeft />}
          sx={{ minHeight: 48, flex: { xs: 1, sm: 'unset' } }}
        >
          {t('actions.back')}
        </Button>
        <Button
          variant="contained"
          onClick={handleContinue}
          disabled={isSubmitting || isSavingDraft}
          endIcon={isSubmitting || isSavingDraft ? <CircularProgress size={16} color="inherit" /> : <KeyboardArrowRight />}
          sx={{ minHeight: 48, flex: { xs: 2, sm: 'unset' }, minWidth: { sm: 220 } }}
        >
          {isSavingDraft
            ? t('actions.saving')
            : isSubmitting
            ? t('actions.submitting')
            : activeStep === 2
            ? returnUserMode === 'edit'
              ? t('actions.updateApplication')
              : t('actions.continueToPayment')
            : t('actions.continue')}
        </Button>
      </>
    );

  return (
    <>
      <StepShell step={activeStep} actions={actions}>
        {welcomeLine && (
          <Alert severity="success" icon={false} sx={{ mb: 2 }}>
            {welcomeLine}
          </Alert>
        )}

        {submissionError && (
          <Alert severity="error" role="alert" sx={{ mb: 2 }} onClose={() => setSubmissionError(null)}>
            {submissionError.startsWith('errors.') ? t(submissionError) : submissionError}
          </Alert>
        )}

        {showValidationErrors && !currentValidation.isValid && (
          <Alert severity="warning" role="alert" sx={{ mb: 2 }}>
            <Typography variant="body2" fontWeight={600}>
              {t('errors.heading')}
            </Typography>
            <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
              {currentValidation.errors.map((err) => (
                <li key={err.field}>{t(err.message)}</li>
              ))}
            </ul>
          </Alert>
        )}

        {showEntryChoices && (
          <>
            <Typography variant="h5" component="h1" gutterBottom fontWeight={700}>
              {t('aboutYou.title')}
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
              {t('aboutYou.subtitle')}
            </Typography>
            <EntryChoices
              onManual={() => {
                markApplicationStarted();
                trackTaxonomyEvent('manual_entry_started');
                setEntryChosen(true);
              }}
              onSignIn={() => setShowLoginModal(true)}
            />
          </>
        )}

        {!showEntryChoices && activeStep === 0 && <AboutYouStep />}
        {activeStep === 1 && <YourCourseStep />}
        {activeStep === 2 && <ReviewStep onEditStep={(step) => setActiveStep(step as FormStep)} />}
        {activeStep === 3 && <PayAndEnrolStep />}

        {activeStep < 3 && <RecoveryFooter />}
      </StepShell>

      <LoginModal
        open={showPhoneVerification}
        onClose={() => setShowPhoneVerification(false)}
        allowClose={false}
        initialPhone={formData.personal.phone}
        onAuthenticated={async (verifiedPhone) => {
          setShowPhoneVerification(false);
          let phone = verifiedPhone || '';
          if (!phone) {
            const { getFirebaseAuth } = await import('@neram/auth');
            phone = getFirebaseAuth().currentUser?.phoneNumber || user?.phone || formData.personal.phone || '';
          }
          onPhoneVerified(phone);
        }}
        apiBaseUrl={APP_URL}
        phoneOnly={true}
      />

      <LoginModal
        open={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        allowClose={true}
        onAuthenticated={() => {
          setShowLoginModal(false);
          setEntryChosen(true);
          markApplicationStarted();
        }}
        apiBaseUrl={APP_URL}
      />

      <Snackbar
        open={saveSnackbar.open}
        autoHideDuration={2000}
        onClose={() => setSaveSnackbar((prev) => ({ ...prev, open: false }))}
        message={saveSnackbar.success ? t('actions.saved') : t('actions.saveFailed')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </>
  );
}
```

Also call `markApplicationStarted()` when a signed-in user first edits a field: in `AboutYouStep.tsx` add `markApplicationStarted` to the destructured context and call it inside the first-name `onChange` before `updateFormData` (it is idempotent per session). Update the `AboutYouStep.test.tsx` context mock with `markApplicationStarted: vi.fn()`.

- [ ] **Step 4: Rewrite ApplyPageContent, fix the dashboard, update the barrel, delete the wizard**

```tsx
// apps/marketing/src/components/ApplyPageContent.tsx
'use client';

import { FormProvider } from '@/components/apply/FormContext';
import ApplyFlow from '@/components/apply/ApplyFlow';

/** The apply page body. The shell around it comes from SiteChrome. */
export default function ApplyPageContent() {
  return (
    <FormProvider>
      <ApplyFlow />
    </FormProvider>
  );
}
```

In `ApplicationDashboard.tsx` line 552 change `setActiveStep(2 as FormStep);` to `setActiveStep(1 as FormStep);` (Add another course now lands on Your course).

Update `apps/marketing/src/components/apply/index.ts`:

```ts
export { default as ApplyFlow } from './ApplyFlow';
export { FormProvider, useFormContext } from './FormContext';
export * from './types';
export * from './steps';
```

Delete the wizard and check nothing else imports it:

```bash
git rm apps/marketing/src/components/apply/ApplyFormWizard.tsx
grep -rn "ApplyFormWizard\|ChatAssistant\|QuickInfoPanel" apps/marketing/src --include=*.ts --include=*.tsx
```

Expected: no `ApplyFormWizard` references. `ChatAssistant.tsx` and `QuickInfoPanel.tsx` still exist but nothing on the apply page imports them (D-B deletes `ChatAssistant.tsx`; `QuickInfoPanel.tsx` can be deleted here if the grep shows no other importer).

- [ ] **Step 5: Run the tests and type-check**

Run: `pnpm test:run apps/marketing/src/components/apply`
Expected: PASS (validation, AboutYouStep, ProgrammePicker, PayAndEnrolStep, EntryChoices).

Run: `pnpm --filter @neram/marketing type-check`
Expected: exit 0.

Run: `pnpm --filter @neram/marketing lint`
Expected: no new warnings in the apply files (pre-existing warnings elsewhere are not this task's).

- [ ] **Step 6: Commit**

```bash
git add apps/marketing/src/components/apply apps/marketing/src/components/ApplyPageContent.tsx
git commit -m "feat(marketing): four-step ApplyFlow with entry choices, step shell, recovery footer; retire the old wizard"
```

---

### Task 13: Application API route: persist the new fields

**Files:**
- Modify: `apps/marketing/src/app/api/application/route.ts`
- Test: `apps/marketing/src/app/api/application/route.test.ts`

**Interfaces:**
- Consumes: `CreateApplicationInput` (Task 4), the RPC (Task 3).
- Produces: POST persists `first_name, email, phone, parent_phone, date_of_birth, gender, fee_structure_id, fee_source`; PATCH whitelists them; `users.date_of_birth`, `users.gender` are mirrored, `users.email` and `users.phone` only when null.

- [ ] **Step 1: Write the failing route test**

```ts
// @vitest-environment node
// apps/marketing/src/app/api/application/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls: Array<{ table: string; op: string; payload?: unknown; filters: unknown[] }> = [];
let existingApplications: any[] = [];

function chain(table: string) {
  const record = { table, op: '', payload: undefined as unknown, filters: [] as unknown[] };
  calls.push(record);
  const api: any = {
    update: (payload: unknown) => { record.op = 'update'; record.payload = payload; return api; },
    select: () => api,
    eq: (...args: unknown[]) => { record.filters.push(['eq', ...args]); return api; },
    is: (...args: unknown[]) => { record.filters.push(['is', ...args]); return api; },
    single: async () => ({ data: { id: existingApplications[0]?.id || 'lead-new', application_number: 'NERAM-2609-00042' }, error: null }),
    maybeSingle: async () => ({ data: null, error: null }),
    then: undefined,
  };
  return api;
}

const supabase = { from: (table: string) => chain(table) };

vi.mock('@neram/database', () => ({
  createAdminClient: () => supabase,
  sendTemplateEmail: vi.fn(async () => undefined),
  notifyNewApplication: vi.fn(async () => undefined),
  parseExamYearAnswer: (v: unknown) => ({ examYear: typeof v === 'string' ? Number(v.slice(0, 4)) : null, academicYear: typeof v === 'string' ? v : null }),
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const createApplication = vi.fn(async (_client: unknown, input: any) => ({ id: 'lead-new', ...input }));
const submitApplication = vi.fn(async (_client: unknown, id: string) => ({ id, application_number: 'NERAM-2609-00042', interest_course: 'nata' }));
vi.mock('@neram/database/queries', () => ({
  createApplication: (...args: unknown[]) => createApplication(...(args as [unknown, unknown])),
  getApplicationsByUserId: async () => existingApplications,
  submitApplication: (...args: unknown[]) => submitApplication(...(args as [unknown, string])),
  hasExistingApplication: async () => existingApplications.length > 0,
  deleteApplication: vi.fn(),
}));

vi.mock('../_lib/auth', () => ({
  verifyFirebaseToken: async () => ({ userId: 'user-1', email: 'arun@example.com', name: 'Arun', phone: '+919876543210' }),
}));

import { POST, PATCH } from './route';

function request(method: string, body: unknown, url = 'http://localhost/api/application') {
  return new Request(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) as any;
}

const submitBody = {
  status: 'submitted',
  first_name: 'Arun',
  father_name: 'Rajendran',
  email: 'arun@example.com',
  phone: '9876543210',
  parent_phone: '9123456789',
  date_of_birth: '2008-03-12',
  gender: 'male',
  phone_verified: true,
  applicant_category: 'school_student',
  interest_course: 'nata',
  fee_structure_id: 'fs-1',
  fee_source: 'standard',
  target_exam_year: '2027-28',
  gclid: 'g-1',
};

beforeEach(() => {
  calls.length = 0;
  existingApplications = [];
  createApplication.mockClear();
  submitApplication.mockClear();
});

describe('POST /api/application', () => {
  it('passes the contact, fee and click-id fields to createApplication', async () => {
    const res = await POST(request('POST', submitBody));
    expect(res.status).toBe(201);
    const input = createApplication.mock.calls[0][1];
    expect(input).toMatchObject({
      user_id: 'user-1',
      first_name: 'Arun',
      email: 'arun@example.com',
      phone: '9876543210',
      parent_phone: '9123456789',
      date_of_birth: '2008-03-12',
      gender: 'male',
      fee_structure_id: 'fs-1',
      fee_source: 'standard',
      gclid: 'g-1',
      status: 'submitted',
    });
  });

  it('mirrors date of birth and gender onto users, and email or phone only when null', async () => {
    await POST(request('POST', submitBody));
    const userUpdates = calls.filter((c) => c.table === 'users' && c.op === 'update');
    const profileUpdate = userUpdates.find((c) => (c.payload as any).date_of_birth);
    expect(profileUpdate?.payload).toMatchObject({ first_name: 'Arun', date_of_birth: '2008-03-12', gender: 'male' });
    const emailUpdate = userUpdates.find((c) => (c.payload as any).email);
    expect(emailUpdate?.filters).toContainEqual(['is', 'email', null]);
    const phoneUpdate = userUpdates.find((c) => (c.payload as any).phone);
    expect(phoneUpdate?.filters).toContainEqual(['is', 'phone', null]);
  });

  it('rejects an invalid gender or fee_source instead of forwarding it', async () => {
    await POST(request('POST', { ...submitBody, gender: 'x', fee_source: 'gift' }));
    const input = createApplication.mock.calls[0][1];
    expect(input.gender).toBeUndefined();
    expect(input.fee_source).toBeUndefined();
  });

  it('updates the existing draft rather than inserting a second application', async () => {
    existingApplications = [{ id: 'lead-draft', status: 'draft' }];
    await POST(request('POST', submitBody));
    expect(createApplication).not.toHaveBeenCalled();
    const update = calls.find((c) => c.table === 'lead_profiles' && c.op === 'update');
    expect(update?.filters).toContainEqual(['eq', 'id', 'lead-draft']);
    expect(submitApplication).toHaveBeenCalledWith(supabase, 'lead-draft');
  });
});

describe('PATCH /api/application', () => {
  it('whitelists the new fields', async () => {
    existingApplications = [{ id: 'lead-1', user_id: 'user-1', status: 'submitted' }];
    calls.length = 0;
    const single = async () => ({ data: { id: 'lead-1', user_id: 'user-1', status: 'submitted' }, error: null });
    supabase.from = (table: string) => { const c = chain(table); c.single = single; return c; };
    const res = await PATCH(request('PATCH', { email: 'new@example.com', parent_phone: '9000000000', fee_structure_id: 'fs-2', status: 'enrolled', assigned_fee: 1 }, 'http://localhost/api/application?id=lead-1'));
    expect(res.status).toBe(200);
    const update = calls.find((c) => c.table === 'lead_profiles' && c.op === 'update');
    expect(update?.payload).toMatchObject({ email: 'new@example.com', parent_phone: '9000000000', fee_structure_id: 'fs-2' });
    expect(update?.payload).not.toHaveProperty('status');
    expect(update?.payload).not.toHaveProperty('assigned_fee');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run apps/marketing/src/app/api/application/route.test.ts`
Expected: FAIL on the first assertion (`first_name` missing from the create input) and on the users mirror.

- [ ] **Step 3: Edit the route**

In `POST`, replace the start of `const raw: CreateApplicationInput = {`:

```ts
    const raw: CreateApplicationInput = {
      user_id: auth.userId,
      father_name: body.father_name,
```

with

```ts
    const GENDERS = ['male', 'female', 'other'];
    const FEE_SOURCES = ['standard', 'admin', 'link'];
    const digits = (value: unknown) => (typeof value === 'string' ? value.replace(/\D/g, '') : '');
    const isoDate = (value: unknown) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined);

    const raw: CreateApplicationInput = {
      user_id: auth.userId,
      first_name: body.first_name || undefined,
      father_name: body.father_name,
      email: typeof body.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) ? body.email.trim().toLowerCase() : undefined,
      phone: digits(body.phone) || undefined,
      parent_phone: digits(body.parent_phone) || undefined,
      date_of_birth: isoDate(body.date_of_birth),
      gender: GENDERS.includes(body.gender) ? body.gender : undefined,
      fee_structure_id: body.fee_structure_id || undefined,
      fee_source: body.fee_structure_id && FEE_SOURCES.includes(body.fee_source) ? body.fee_source : undefined,
```

Replace the "Update user's first_name if provided" block in `POST` with:

```ts
    // Mirror the applicant's own details onto users. first_name, date of birth
    // and gender always (the form is the freshest source); email and phone only
    // into an empty column, because both are unique and a Google sign-in may
    // already own a different value. Never blocks the application.
    try {
      const profile: Record<string, unknown> = {};
      if (raw.first_name) profile.first_name = raw.first_name;
      if (raw.date_of_birth) profile.date_of_birth = raw.date_of_birth;
      if (raw.gender) profile.gender = raw.gender;
      if (Object.keys(profile).length) {
        await (supabase.from('users') as any).update(profile).eq('id', auth.userId);
      }
      if (raw.email) {
        await (supabase.from('users') as any).update({ email: raw.email }).eq('id', auth.userId).is('email', null);
      }
      if (raw.phone) {
        await (supabase.from('users') as any).update({ phone: raw.phone }).eq('id', auth.userId).is('phone', null);
      }
    } catch (mirrorErr) {
      console.error('[Application API] users mirror failed:', mirrorErr);
    }
```

In `PATCH`, extend `ALLOWED_FIELDS`:

```ts
    const ALLOWED_FIELDS = [
      'first_name', 'father_name', 'email', 'phone', 'parent_phone', 'date_of_birth', 'gender',
      'country', 'city', 'state', 'district', 'pincode', 'address',
      'latitude', 'longitude', 'location_source', 'detected_location',
      'applicant_category', 'caste_category', 'target_exam_year', 'school_type',
      'interest_course', 'selected_course_id', 'selected_center_id',
      'hybrid_learning_accepted', 'learning_mode', 'fee_structure_id',
    ];
```

and after the loop add `if (updateData.fee_structure_id) updateData.fee_source = 'standard';` and the same gender/date guards as POST (`if (updateData.gender && !GENDERS.includes(updateData.gender as string)) delete updateData.gender;`, `if (updateData.date_of_birth && !isoDate(updateData.date_of_birth)) delete updateData.date_of_birth;`). Hoist `GENDERS`, `FEE_SOURCES`, `digits`, `isoDate` to module scope so both handlers share them.

In `sendSubmissionEmails`' caller, replace `const studentPhone = auth.phone || body.phone || body.parent_phone || '';` with `const studentPhone = raw.phone || auth.phone || raw.parent_phone || '';`.

- [ ] **Step 4: Run the tests**

Run: `pnpm test:run apps/marketing/src/app/api/application/route.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/marketing/src/app/api/application/route.ts apps/marketing/src/app/api/application/route.test.ts
git commit -m "feat(marketing): application API persists contact, fee and click-id fields"
```

---

### Task 14: Copy in five locales

**Files:**
- Modify: `apps/marketing/messages/en.json` (replace the `apply` object)
- Modify: `apps/marketing/messages/ta.json` (replace the `apply` object)
- Modify: `apps/marketing/messages/hi.json`, `kn.json`, `ml.json` (copy `apply` from `en.json`)

**Interfaces:**
- Produces every key referenced by Tasks 2, 7, 9, 10, 11, 12.

- [ ] **Step 1: English**

Replace the whole `"apply": { ... }` object in `en.json` with:

```json
"apply": {
  "title": "Apply to Neram Classes",
  "subtitle": "Takes about 2 to 3 minutes.",
  "shell": {
    "home": "Neram Classes home",
    "help": "Help",
    "callUs": "Call us",
    "contactPage": "Contact page",
    "terms": "Terms",
    "privacy": "Privacy",
    "refund": "Refund policy"
  },
  "progress": "Step {current} of {total}",
  "steps": {
    "aboutYou": "About you",
    "yourCourse": "Your course",
    "review": "Review",
    "pay": "Pay and enrol"
  },
  "actions": {
    "back": "Back",
    "continue": "Continue",
    "continueToPayment": "Continue to payment",
    "updateApplication": "Update application",
    "saving": "Saving",
    "submitting": "Submitting",
    "saved": "Progress saved",
    "saveFailed": "Could not save to the server. Your answers are kept on this device."
  },
  "aboutYou": {
    "title": "About you",
    "subtitle": "Takes about 2 to 3 minutes.",
    "welcomeBack": "Welcome back, {name}. We filled in what we already know. Check it and continue.",
    "welcomeBackGeneric": "Welcome back. We filled in what we already know. Check it and continue.",
    "entryTitle": "How would you like to fill this in?",
    "entryNera": "Talk to Nera",
    "entryNeraBody": "Say your details in your language. Nera fills the form. You check everything before it is saved.",
    "entryDocument": "Upload a document",
    "entryDocumentBody": "A marksheet, school ID or Aadhaar. Read once to fill the form, never stored.",
    "entryManual": "Type it myself",
    "haveAccount": "Already have a Neram account?",
    "signIn": "Sign in",
    "studentName": "Student name",
    "studentNameHelper": "As it should appear on your Neram records.",
    "fatherName": "Father's name",
    "fatherNameHelper": "Used to tell apart students with the same name, and on your records.",
    "dateOfBirth": "Date of birth",
    "gender": "Gender (optional)",
    "genderMale": "Male",
    "genderFemale": "Female",
    "genderOther": "Other",
    "location": "Where you live",
    "country": "Country",
    "pinFound": "{city}, {state}",
    "useMyLocation": "Use my current location",
    "detecting": "Finding your location",
    "locationFailed": "We couldn't access your location. Enter your PIN code instead.",
    "city": "City",
    "address": "Address (optional)",
    "addressHelper": "Helps us if you want to visit a centre.",
    "phone": "Mobile number",
    "phoneHelper": "We'll text you a code. This also creates your Neram account, so you can come back to this application.",
    "phoneInvalid": "Enter a valid {length}-digit number.",
    "verify": "Verify",
    "verified": "Verified",
    "parentPhone": "Parent or guardian mobile (optional)",
    "email": "Email (optional)",
    "prefilled": "Pre-filled"
  },
  "yourCourse": {
    "title": "Your course",
    "subtitle": "Choose your exam and programme. The fee shows before you pay.",
    "courseQuestion": "Which exam are you preparing for?",
    "nata": "NATA",
    "nataBody": "National Aptitude Test in Architecture",
    "jee": "JEE Paper 2",
    "jeeBody": "JEE Main, the B.Arch paper",
    "both": "Both",
    "bothBody": "NATA and JEE Paper 2 together",
    "notSure": "Not sure yet",
    "notSureBody": "We'll help you decide",
    "programmeQuestion": "Choose your programme",
    "programmeLoading": "Loading programmes",
    "programmeEmpty": "No programme is open for this course right now. Ask us to call you.",
    "standardFee": "Standard fee ₹{amount}",
    "comboNote": "Includes both exams. ₹{amount} extra for the second exam.",
    "notSureFee": "Choose a course to see the fee, or ask us to call you.",
    "askUsToCall": "Ask us to call you",
    "modeQuestion": "How would you like to learn?",
    "hybrid": "Hybrid",
    "hybridBody": "Live online classes plus sessions at a centre near you",
    "online": "Online only",
    "onlineBody": "Live classes from anywhere",
    "studiesTitle": "Your studies",
    "studiesSubtitle": "Two or three quick questions so we place you in the right batch.",
    "categoryQuestion": "Which best describes you?",
    "examYear": "Planning to write the exam in",
    "moreDetails": "More details (optional)",
    "casteCategory": "Category",
    "schoolType": "Type of school",
    "scholarship": "Government school students may qualify for a scholarship. The fee is confirmed after review.",
    "feeCardTitle": "Your fee",
    "feeCardBody": "Installments available. Coupons at payment.",
    "feeCardScholarship": "Your fee will be confirmed after scholarship review."
  },
  "review": {
    "title": "Review",
    "subtitle": "Check everything once. Use Edit to change a section.",
    "aboutYou": "About you",
    "yourCourse": "Your course",
    "contact": "Contact",
    "edit": "Edit {section}",
    "editShort": "Edit",
    "course": "Course",
    "programme": "Programme",
    "notChosen": "Not chosen",
    "mode": "Learning mode",
    "centre": "Preferred centre",
    "terms": "I agree to the <terms>Terms</terms> and the <refund>Refund policy</refund>."
  },
  "pay": {
    "title": "Pay and enrol",
    "subtitle": "Enrolment is confirmed after payment verification.",
    "applicationNumber": "Application {number}",
    "yourEnrolment": "Your enrolment",
    "included": "Included: Neram Nexus, Microsoft Teams, study materials",
    "whatHappensTitle": "What happens after payment",
    "whatHappens1": "Enrolment is confirmed after payment verification.",
    "whatHappens2": "Your student account is created.",
    "whatHappens3": "Nexus and Microsoft Teams access are set up automatically.",
    "whatHappens4": "Your Student ID and next steps appear here.",
    "submitFailed": "We could not save your application. Go back to Review and try again."
  },
  "recovery": {
    "title": "Not ready for coaching?",
    "body": "Start with Neram Tools and prepare on your own.",
    "cta": "Explore Neram Tools"
  },
  "errors": {
    "heading": "A few things need your attention",
    "submitFailed": "We could not save your application. Try again.",
    "firstName": "Enter the student's name (at least 2 letters).",
    "fatherName": "Enter the father's name (at least 2 letters).",
    "email": "That email does not look right.",
    "phone": "Enter a valid mobile number.",
    "phoneVerified": "Verify your mobile number to continue.",
    "dateOfBirth": "Enter the date of birth.",
    "pincode": "Enter a valid PIN code.",
    "city": "Enter your city.",
    "state": "Choose your state.",
    "course": "Choose the exam you are preparing for.",
    "programme": "Choose a programme.",
    "category": "Tell us which best describes you.",
    "examYear": "Choose the year you plan to write the exam.",
    "currentClass": "Choose your current class.",
    "schoolName": "Enter your school name.",
    "board": "Choose your board.",
    "collegeName": "Enter your college name.",
    "department": "Enter your department.",
    "completedGrade": "Choose what you completed before the diploma.",
    "yearOfStudy": "Choose your year of study.",
    "twelfthYear": "Choose the year you completed 12th.",
    "terms": "Please agree to the Terms and the Refund policy."
  }
}
```

Keep the existing `applicationDashboard` and `callback` objects untouched.

- [ ] **Step 2: Tamil**

Replace the `"apply"` object in `ta.json` with the same structure and these values (keys identical to English):

```json
"apply": {
  "title": "நேரம் கிளாசஸில் விண்ணப்பிக்கவும்",
  "subtitle": "சுமார் 2 முதல் 3 நிமிடங்கள் ஆகும்.",
  "shell": { "home": "நேரம் கிளாசஸ் முகப்பு", "help": "உதவி", "callUs": "எங்களை அழைக்கவும்", "contactPage": "தொடர்பு பக்கம்", "terms": "விதிமுறைகள்", "privacy": "தனியுரிமை", "refund": "பணத்திரும்பக் கொள்கை" },
  "progress": "படி {current} / {total}",
  "steps": { "aboutYou": "உங்களைப் பற்றி", "yourCourse": "உங்கள் பாடநெறி", "review": "சரிபார்க்கவும்", "pay": "பணம் செலுத்தி சேரவும்" },
  "actions": { "back": "பின்", "continue": "தொடரவும்", "continueToPayment": "பணம் செலுத்த தொடரவும்", "updateApplication": "விண்ணப்பத்தைப் புதுப்பிக்கவும்", "saving": "சேமிக்கிறது", "submitting": "சமர்ப்பிக்கிறது", "saved": "முன்னேற்றம் சேமிக்கப்பட்டது", "saveFailed": "சேவையகத்தில் சேமிக்க முடியவில்லை. உங்கள் பதில்கள் இந்தச் சாதனத்தில் உள்ளன." },
  "aboutYou": {
    "title": "உங்களைப் பற்றி",
    "subtitle": "சுமார் 2 முதல் 3 நிமிடங்கள் ஆகும்.",
    "welcomeBack": "மீண்டும் வருக, {name}. எங்களுக்குத் தெரிந்தவற்றை நிரப்பியுள்ளோம். சரிபார்த்து தொடரவும்.",
    "welcomeBackGeneric": "மீண்டும் வருக. எங்களுக்குத் தெரிந்தவற்றை நிரப்பியுள்ளோம். சரிபார்த்து தொடரவும்.",
    "entryTitle": "இதை எப்படி நிரப்ப விரும்புகிறீர்கள்?",
    "entryNera": "நேராவிடம் பேசுங்கள்",
    "entryNeraBody": "உங்கள் மொழியில் உங்கள் விவரங்களைச் சொல்லுங்கள். நேரா படிவத்தை நிரப்பும். சேமிப்பதற்கு முன் நீங்கள் எல்லாவற்றையும் சரிபார்க்கலாம்.",
    "entryDocument": "ஆவணத்தைப் பதிவேற்றவும்",
    "entryDocumentBody": "மதிப்பெண் பட்டியல், பள்ளி அடையாள அட்டை அல்லது ஆதார். படிவத்தை நிரப்ப ஒருமுறை மட்டும் படிக்கப்படும், சேமிக்கப்படாது.",
    "entryManual": "நானே தட்டச்சு செய்கிறேன்",
    "haveAccount": "ஏற்கனவே நேரம் கணக்கு உள்ளதா?",
    "signIn": "உள்நுழைக",
    "studentName": "மாணவர் பெயர்",
    "studentNameHelper": "உங்கள் நேரம் பதிவுகளில் இருக்க வேண்டியபடி.",
    "fatherName": "தந்தையின் பெயர்",
    "fatherNameHelper": "ஒரே பெயருள்ள மாணவர்களை வேறுபடுத்தவும், உங்கள் பதிவுகளுக்கும் பயன்படும்.",
    "dateOfBirth": "பிறந்த தேதி",
    "gender": "பாலினம் (விருப்பத்திற்குரியது)",
    "genderMale": "ஆண்",
    "genderFemale": "பெண்",
    "genderOther": "மற்றவை",
    "location": "நீங்கள் வசிக்கும் இடம்",
    "country": "நாடு",
    "pinFound": "{city}, {state}",
    "useMyLocation": "எனது தற்போதைய இடத்தைப் பயன்படுத்து",
    "detecting": "உங்கள் இடத்தைக் கண்டறிகிறது",
    "locationFailed": "உங்கள் இடத்தை அணுக முடியவில்லை. அதற்குப் பதிலாக பின் குறியீட்டை உள்ளிடவும்.",
    "city": "நகரம்",
    "address": "முகவரி (விருப்பத்திற்குரியது)",
    "addressHelper": "நீங்கள் ஒரு மையத்திற்கு வர விரும்பினால் உதவும்.",
    "phone": "கைபேசி எண்",
    "phoneHelper": "ஒரு குறியீட்டை SMS செய்வோம். இது உங்கள் நேரம் கணக்கையும் உருவாக்கும், அதனால் இந்த விண்ணப்பத்திற்கு மீண்டும் வரலாம்.",
    "phoneInvalid": "சரியான {length} இலக்க எண்ணை உள்ளிடவும்.",
    "verify": "சரிபார்",
    "verified": "சரிபார்க்கப்பட்டது",
    "parentPhone": "பெற்றோர் அல்லது பாதுகாவலர் கைபேசி (விருப்பத்திற்குரியது)",
    "email": "மின்னஞ்சல் (விருப்பத்திற்குரியது)",
    "prefilled": "முன்பே நிரப்பப்பட்டது"
  },
  "yourCourse": {
    "title": "உங்கள் பாடநெறி",
    "subtitle": "உங்கள் தேர்வையும் திட்டத்தையும் தேர்வு செய்யுங்கள். பணம் செலுத்தும் முன் கட்டணம் காட்டப்படும்.",
    "courseQuestion": "எந்தத் தேர்வுக்குத் தயாராகிறீர்கள்?",
    "nata": "NATA",
    "nataBody": "கட்டிடக்கலை தேசிய திறனாய்வுத் தேர்வு",
    "jee": "JEE தாள் 2",
    "jeeBody": "JEE மெயின், B.Arch தாள்",
    "both": "இரண்டும்",
    "bothBody": "NATA மற்றும் JEE தாள் 2 சேர்ந்து",
    "notSure": "இன்னும் உறுதியில்லை",
    "notSureBody": "முடிவு செய்ய உதவுவோம்",
    "programmeQuestion": "உங்கள் திட்டத்தைத் தேர்வு செய்யுங்கள்",
    "programmeLoading": "திட்டங்கள் ஏற்றப்படுகின்றன",
    "programmeEmpty": "இந்தப் பாடநெறிக்கு இப்போது திட்டம் எதுவும் திறக்கப்படவில்லை. எங்களை அழைக்கச் சொல்லுங்கள்.",
    "standardFee": "நிலையான கட்டணம் ₹{amount}",
    "comboNote": "இரண்டு தேர்வுகளும் அடங்கும். இரண்டாவது தேர்வுக்கு ₹{amount} கூடுதல்.",
    "notSureFee": "கட்டணத்தைப் பார்க்க ஒரு பாடநெறியைத் தேர்வு செய்யுங்கள், அல்லது எங்களை அழைக்கச் சொல்லுங்கள்.",
    "askUsToCall": "எங்களை அழைக்கச் சொல்லுங்கள்",
    "modeQuestion": "எப்படிக் கற்க விரும்புகிறீர்கள்?",
    "hybrid": "ஹைப்ரிட்",
    "hybridBody": "நேரலை ஆன்லைன் வகுப்புகளுடன் உங்களருகில் உள்ள மையத்தில் அமர்வுகள்",
    "online": "ஆன்லைன் மட்டும்",
    "onlineBody": "எங்கிருந்தும் நேரலை வகுப்புகள்",
    "studiesTitle": "உங்கள் படிப்பு",
    "studiesSubtitle": "சரியான குழுவில் உங்களைச் சேர்க்க இரண்டு மூன்று சிறு கேள்விகள்.",
    "categoryQuestion": "உங்களை எது சிறப்பாக விவரிக்கிறது?",
    "examYear": "தேர்வு எழுத திட்டமிடும் ஆண்டு",
    "moreDetails": "மேலும் விவரங்கள் (விருப்பத்திற்குரியது)",
    "casteCategory": "பிரிவு",
    "schoolType": "பள்ளி வகை",
    "scholarship": "அரசுப் பள்ளி மாணவர்கள் உதவித்தொகைக்குத் தகுதி பெறலாம். சரிபார்ப்புக்குப் பின் கட்டணம் உறுதி செய்யப்படும்.",
    "feeCardTitle": "உங்கள் கட்டணம்",
    "feeCardBody": "தவணைகள் உண்டு. பணம் செலுத்தும்போது கூப்பன்கள்.",
    "feeCardScholarship": "உதவித்தொகை சரிபார்ப்புக்குப் பின் உங்கள் கட்டணம் உறுதி செய்யப்படும்."
  },
  "review": {
    "title": "சரிபார்க்கவும்",
    "subtitle": "எல்லாவற்றையும் ஒருமுறை சரிபார்க்கவும். ஒரு பகுதியை மாற்ற Edit ஐப் பயன்படுத்தவும்.",
    "aboutYou": "உங்களைப் பற்றி",
    "yourCourse": "உங்கள் பாடநெறி",
    "contact": "தொடர்பு",
    "edit": "{section} திருத்து",
    "editShort": "திருத்து",
    "course": "பாடநெறி",
    "programme": "திட்டம்",
    "notChosen": "தேர்வு செய்யப்படவில்லை",
    "mode": "கற்றல் முறை",
    "centre": "விருப்ப மையம்",
    "terms": "<terms>விதிமுறைகள்</terms> மற்றும் <refund>பணத்திரும்பக் கொள்கை</refund>க்கு ஒப்புக்கொள்கிறேன்."
  },
  "pay": {
    "title": "பணம் செலுத்தி சேரவும்",
    "subtitle": "பணம் சரிபார்க்கப்பட்ட பின் சேர்க்கை உறுதி செய்யப்படும்.",
    "applicationNumber": "விண்ணப்பம் {number}",
    "yourEnrolment": "உங்கள் சேர்க்கை",
    "included": "அடங்கும்: நேரம் நெக்ஸஸ், மைக்ரோசாஃப்ட் டீம்ஸ், படிப்புப் பொருட்கள்",
    "whatHappensTitle": "பணம் செலுத்திய பின் என்ன நடக்கும்",
    "whatHappens1": "பணம் சரிபார்க்கப்பட்ட பின் சேர்க்கை உறுதி செய்யப்படும்.",
    "whatHappens2": "உங்கள் மாணவர் கணக்கு உருவாக்கப்படும்.",
    "whatHappens3": "நெக்ஸஸ் மற்றும் மைக்ரோசாஃப்ட் டீம்ஸ் அணுகல் தானாக அமைக்கப்படும்.",
    "whatHappens4": "உங்கள் மாணவர் அடையாள எண்ணும் அடுத்த படிகளும் இங்கே தோன்றும்.",
    "submitFailed": "உங்கள் விண்ணப்பத்தைச் சேமிக்க முடியவில்லை. சரிபார்ப்புக்குத் திரும்பி மீண்டும் முயற்சிக்கவும்."
  },
  "recovery": {
    "title": "பயிற்சிக்குத் தயாராக இல்லையா?",
    "body": "நேரம் டூல்ஸுடன் தொடங்கி நீங்களே தயாராகுங்கள்.",
    "cta": "நேரம் டூல்ஸைப் பாருங்கள்"
  },
  "errors": {
    "heading": "சில விஷயங்களுக்கு உங்கள் கவனம் தேவை",
    "submitFailed": "உங்கள் விண்ணப்பத்தைச் சேமிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்.",
    "firstName": "மாணவரின் பெயரை உள்ளிடவும் (குறைந்தது 2 எழுத்துகள்).",
    "fatherName": "தந்தையின் பெயரை உள்ளிடவும் (குறைந்தது 2 எழுத்துகள்).",
    "email": "அந்த மின்னஞ்சல் சரியாகத் தெரியவில்லை.",
    "phone": "சரியான கைபேசி எண்ணை உள்ளிடவும்.",
    "phoneVerified": "தொடர உங்கள் கைபேசி எண்ணைச் சரிபார்க்கவும்.",
    "dateOfBirth": "பிறந்த தேதியை உள்ளிடவும்.",
    "pincode": "சரியான பின் குறியீட்டை உள்ளிடவும்.",
    "city": "உங்கள் நகரத்தை உள்ளிடவும்.",
    "state": "உங்கள் மாநிலத்தைத் தேர்வு செய்யவும்.",
    "course": "நீங்கள் தயாராகும் தேர்வைத் தேர்வு செய்யவும்.",
    "programme": "ஒரு திட்டத்தைத் தேர்வு செய்யவும்.",
    "category": "உங்களை எது சிறப்பாக விவரிக்கிறது என்று சொல்லுங்கள்.",
    "examYear": "தேர்வு எழுத திட்டமிடும் ஆண்டைத் தேர்வு செய்யவும்.",
    "currentClass": "உங்கள் தற்போதைய வகுப்பைத் தேர்வு செய்யவும்.",
    "schoolName": "உங்கள் பள்ளியின் பெயரை உள்ளிடவும்.",
    "board": "உங்கள் போர்டைத் தேர்வு செய்யவும்.",
    "collegeName": "உங்கள் கல்லூரியின் பெயரை உள்ளிடவும்.",
    "department": "உங்கள் துறையை உள்ளிடவும்.",
    "completedGrade": "டிப்ளோமாவுக்கு முன் முடித்ததைத் தேர்வு செய்யவும்.",
    "yearOfStudy": "உங்கள் படிப்பு ஆண்டைத் தேர்வு செய்யவும்.",
    "twelfthYear": "12ஆம் வகுப்பை முடித்த ஆண்டைத் தேர்வு செய்யவும்.",
    "terms": "விதிமுறைகள் மற்றும் பணத்திரும்பக் கொள்கைக்கு ஒப்புக்கொள்ளவும்."
  }
}
```

- [ ] **Step 3: Hindi, Kannada, Malayalam carry English**

Run from the repo root:

```bash
node -e "
const fs=require('fs');
const en=JSON.parse(fs.readFileSync('apps/marketing/messages/en.json','utf8'));
for (const l of ['hi','kn','ml']) {
  const p='apps/marketing/messages/'+l+'.json';
  const m=JSON.parse(fs.readFileSync(p,'utf8'));
  m.apply=en.apply; // English until translated; every key must exist so next-intl never renders a key name
  fs.writeFileSync(p, JSON.stringify(m,null,2)+'\n');
}
console.log('ok');
"
```

Check the files keep their original indentation style (`git diff --stat apps/marketing/messages`): if the diff rewrites every line, the file used a different indent; re-run with the matching indent (`JSON.stringify(m, null, <n>)`).

- [ ] **Step 4: Verify every referenced key exists**

```bash
node -e "
const fs=require('fs');const path=require('path');
const en=JSON.parse(fs.readFileSync('apps/marketing/messages/en.json','utf8')).apply;
const has=(k)=>k.split('.').reduce((o,p)=>o&&o[p],en)!==undefined;
const files=[];(function walk(d){for(const f of fs.readdirSync(d)){const p=path.join(d,f);fs.statSync(p).isDirectory()?walk(p):/\.tsx?$/.test(f)&&!/test\.tsx?$/.test(f)&&files.push(p)}})('apps/marketing/src/components/apply');
files.push('apps/marketing/src/components/SiteChrome.tsx');
const missing=new Set();
for(const f of files){const s=fs.readFileSync(f,'utf8');for(const m of s.matchAll(/t(?:\.rich)?\(\s*'([a-zA-Z0-9_.]+)'/g)){if(!has(m[1]))missing.add(m[1]+'  <- '+f)}}
console.log(missing.size?[...missing].join('\n'):'all keys present');
"
```

Expected: `all keys present`. Dynamic keys (`steps.${...}`, `COURSE_KEYS[...]`, `err.message`) are not matched by the regex; they are covered by the `steps.*`, `yourCourse.*` and `errors.*` objects above.

- [ ] **Step 5: Commit**

```bash
git add apps/marketing/messages/en.json apps/marketing/messages/ta.json apps/marketing/messages/hi.json apps/marketing/messages/kn.json apps/marketing/messages/ml.json
git commit -m "feat(marketing): apply copy in English and Tamil; other locales carry English"
```

---

### Task 15: Playwright specs

**Files:**
- Create: `tests/e2e/apply-shell-marketing.spec.ts`
- Create: `tests/e2e/apply-wizard-marketing.spec.ts`
- Modify: `tests/e2e/application-marketing.spec.ts`

**Interfaces:**
- Consumes: `tests/utils/mobile-helpers.ts` (`assertNoHorizontalOverflow`, `assertTouchTargetSize`). Both specs run on the `marketing-chrome` project (its `testMatch` is `/.*marketing.*\.spec\.ts/`); the phone viewport is set per describe, because the repo's `mobile-chrome` project targets the student app.

- [ ] **Step 1: Write the shell spec**

```ts
// tests/e2e/apply-shell-marketing.spec.ts
import { test, expect } from '@playwright/test';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

const MARKETING_URL = process.env.E2E_MARKETING_URL || 'http://localhost:3010';

test.describe('Application shell', () => {
  test('the home page keeps the marketing chrome', async ({ page }) => {
    await page.goto(`${MARKETING_URL}/`);
    await expect(page.locator('header nav').first()).toBeVisible();
    await expect(page.locator('footer').first()).toBeVisible();
  });

  for (const path of ['/apply', '/ta/apply']) {
    test(`${path} renders inside the application shell`, async ({ page }) => {
      await page.goto(`${MARKETING_URL}${path}`);
      await expect(page.getByRole('banner')).toBeVisible();
      await expect(page.locator('header nav')).toHaveCount(0);
      await expect(page.locator('footer nav')).toHaveCount(0);
      await expect(page.getByRole('button', { name: /course info|fees/i })).toHaveCount(0);
      await expect(page.locator('[aria-label*="Aintra" i], [aria-label*="chat" i]')).toHaveCount(0);
      const fixed = await page.evaluate(() =>
        Array.from(document.querySelectorAll('button, a')).filter((el) => getComputedStyle(el).position === 'fixed').length,
      );
      expect(fixed, 'no floating buttons in the shell').toBe(0);
      await expect(page.getByRole('link', { name: /terms/i })).toBeVisible();
      await expect(page.getByRole('link', { name: /refund/i })).toBeVisible();
    });
  }

  test('/pay?app= renders inside the application shell', async ({ page }) => {
    await page.goto(`${MARKETING_URL}/pay?app=NERAM-0000-00000`);
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.locator('header nav')).toHaveCount(0);
  });

  test('Help opens a menu with a phone number and the contact page', async ({ page }) => {
    await page.goto(`${MARKETING_URL}/apply`);
    await page.getByRole('button', { name: /help/i }).click();
    await expect(page.getByRole('menuitem', { name: /call us/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /contact/i })).toBeVisible();
  });
});

test.describe('Application shell on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('no horizontal overflow and 44 px targets', async ({ page }) => {
    await page.goto(`${MARKETING_URL}/apply`);
    await page.getByRole('button', { name: /type it myself/i }).click();
    await assertNoHorizontalOverflow(page);
    await assertTouchTargetSize(page, 'button:visible, a[href]:visible', 44);
  });

  test('exactly one primary button per step', async ({ page }) => {
    await page.goto(`${MARKETING_URL}/apply`);
    await page.getByRole('button', { name: /type it myself/i }).click();
    await expect(page.locator('button.MuiButton-contained:visible')).toHaveCount(1);
  });
});
```

- [ ] **Step 2: Write the wizard spec**

```ts
// tests/e2e/apply-wizard-marketing.spec.ts
import { test, expect } from '@playwright/test';

const MARKETING_URL = process.env.E2E_MARKETING_URL || 'http://localhost:3010';

test.describe('Apply wizard', () => {
  test.beforeEach(async ({ page }) => {
    // Count geolocation calls without ever prompting.
    await page.addInitScript(() => {
      (window as any).__geoCalls = 0;
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          getCurrentPosition: (_ok: unknown, fail: (e: { message: string }) => void) => {
            (window as any).__geoCalls += 1;
            fail({ message: 'denied' });
          },
        },
      });
    });
    await page.route('**/api/pincode/625001*', (route) =>
      route.fulfill({ json: { success: true, data: { city: 'Madurai', district: 'Madurai', state: 'Tamil Nadu' } } }),
    );
    await page.route('**/api/funnel-events', (route) => route.fulfill({ json: { ok: true } }));
  });

  test('step 1 shows the entry choices, then the fields, and never asks for location on its own', async ({ page }) => {
    await page.goto(`${MARKETING_URL}/apply`);
    await expect(page.getByRole('heading', { name: /about you/i })).toBeVisible();
    await expect(page.getByText(/step 1 of 4/i)).toBeVisible();
    await page.getByRole('button', { name: /type it myself/i }).click();
    expect(await page.evaluate(() => (window as any).__geoCalls)).toBe(0);

    await page.getByRole('button', { name: /use my current location/i }).click();
    expect(await page.evaluate(() => (window as any).__geoCalls)).toBe(1);
    await expect(page.getByRole('alert')).toContainText(/enter your pin code/i);
  });

  test('a PIN code fills City and State, which stay editable', async ({ page }) => {
    await page.goto(`${MARKETING_URL}/apply`);
    await page.getByRole('button', { name: /type it myself/i }).click();
    await page.locator('input[name="pincode"]').fill('625001');
    await expect(page.locator('input[name="city"]')).toHaveValue('Madurai');
    await expect(page.locator('input[name="state"]')).toHaveValue('Tamil Nadu');
    await expect(page.getByText('Madurai, Tamil Nadu')).toBeVisible();
    await page.getByRole('button', { name: /edit/i }).first().click();
    await expect(page.locator('input[name="city"]')).toBeEditable();
  });

  test('Continue asks for phone verification before leaving step 1', async ({ page }) => {
    await page.goto(`${MARKETING_URL}/apply`);
    await page.getByRole('button', { name: /type it myself/i }).click();
    await page.locator('input[name="firstName"]').fill('Arun');
    await page.locator('input[name="fatherName"]').fill('Rajendran');
    await page.getByRole('button', { name: /^continue$/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText(/step 1 of 4/i)).toBeVisible();
  });

  test('the father name field is empty for a new visitor (no display-name guess)', async ({ page }) => {
    await page.goto(`${MARKETING_URL}/apply`);
    await page.getByRole('button', { name: /type it myself/i }).click();
    await expect(page.locator('input[name="fatherName"]')).toHaveValue('');
  });

  test('choosing the manual path records application_started and manual_entry_started', async ({ page }) => {
    const events: string[] = [];
    await page.route('**/api/funnel-events', async (route) => {
      const body = route.request().postDataJSON();
      for (const e of body?.events || [body]) if (e?.event) events.push(e.event);
      await route.fulfill({ json: { ok: true } });
    });
    await page.goto(`${MARKETING_URL}/apply`);
    await page.getByRole('button', { name: /type it myself/i }).click();
    await page.locator('input[name="firstName"]').fill('A');
    await page.waitForTimeout(3500); // the tracker batches
    expect(events).toContain('application_started');
    expect(events).toContain('manual_entry_started');
  });

  test('an old four-step draft reopens on Your course, not on Pay', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'neram_application_draft',
        JSON.stringify({
          activeStep: 2,
          savedAt: new Date().toISOString(),
          formData: {
            personal: { firstName: 'Arun', fatherName: 'Rajendran', email: '', phone: '9876543210', parentPhone: '', phoneVerified: true, phoneVerifiedAt: new Date().toISOString(), dateOfBirth: '2008-03-12', gender: 'male' },
            location: { country: 'IN', pincode: '625001', city: 'Madurai', state: 'Tamil Nadu', district: '', address: '', latitude: null, longitude: null, locationSource: 'pincode', detectedLocation: null },
            academic: { applicantCategory: 'school_student', casteCategory: null, targetExamYear: '2027-28', schoolType: null, schoolStudentData: { current_class: '11', school_name: 'TVS', board: 'CBSE' }, diplomaStudentData: null, collegeStudentData: null, workingProfessionalData: null },
            course: { interestCourse: null, selectedCourseId: null, selectedCenterId: null, selectedCenterName: null, hybridLearningAccepted: false, learningMode: 'hybrid' },
            payment: { paymentDate: '2026-09-26', paymentType: 'full', installmentNumber: 1, paymentMethod: '', transactionReference: '', paymentProofUrl: null, paymentProofFileName: null },
            termsAccepted: false, utmSource: null, utmMedium: null, utmCampaign: null, referralCode: null, gclid: null, wbraid: null,
          },
        }),
      );
    });
    await page.goto(`${MARKETING_URL}/apply`);
    await expect(page.getByText(/step 2 of 4/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: /your course/i })).toBeVisible();
  });

  test('the recovery link points to Tools', async ({ page }) => {
    await page.goto(`${MARKETING_URL}/apply`);
    await expect(page.getByRole('link', { name: /explore neram tools/i })).toHaveAttribute('href', /\/tools$/);
  });
});
```

- [ ] **Step 3: Update the existing spec's selectors**

In `tests/e2e/application-marketing.spec.ts`:
- Replace both `page.getByText(/personal information/i).first()` with `page.getByRole('heading', { name: /about you/i })`.
- In the `beforeEach` and the "Field Rendering" and "Mobile Responsiveness" tests, click the manual card before asserting fields: after `page.goto(...)`, add `await page.getByRole('button', { name: /type it myself/i }).click();` (the country and PIN fields appear only after an entry is chosen).
- Replace `page.getByRole('button', { name: /next/i })` with `page.getByRole('button', { name: /^continue$/i })` (three places). The "Back button disabled" test stays.
- The "validation warning" test: keep; the phone dialog still opens.
- Delete the "should show mobile step counter instead of stepper" test's regex assumption? No: `Step 1 of 4` still renders, keep it.

- [ ] **Step 4: Run the specs**

Start the marketing dev server in the background if it is not running (`pnpm dev:marketing`, wait for "Ready"), then:

```bash
pnpm test:e2e tests/e2e/apply-shell-marketing.spec.ts tests/e2e/apply-wizard-marketing.spec.ts tests/e2e/application-marketing.spec.ts --project=marketing-chrome --workers=1
```

Expected: all pass. `--workers=1` because parallel workers against one marketing dev server time out on `page.goto` (recorded in memory).

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/apply-shell-marketing.spec.ts tests/e2e/apply-wizard-marketing.spec.ts tests/e2e/application-marketing.spec.ts
git commit -m "test(e2e): application shell and wizard on marketing"
```

---

### Task 16: Gates, migration to staging, visual review

**Files:** none new.

- [ ] **Step 1: Full gates**

```bash
pnpm --filter @neram/marketing type-check
pnpm --filter @neram/marketing lint
pnpm --filter @neram/database exec tsc --noEmit
pnpm test:run apps/marketing packages/database/src/analytics
```

Expected: every command exits 0; no new lint warnings in files this plan touched.

- [ ] **Step 2: Apply the migration to staging by MCP**

`mcp__supabase-staging__apply_migration` with `name: 20261016090000_lead_profiles_applicant_fields_and_fee` and the SQL from Task 3. Then verify:

```sql
SELECT proname FROM pg_proc WHERE proname = 'create_lead_profile';
SELECT column_name FROM information_schema.columns WHERE table_name = 'lead_profiles' AND column_name IN ('email','phone','fee_structure_id','fee_source','gclid','wbraid');
SELECT fee_source, count(*) FROM lead_profiles GROUP BY 1;
```

Expected: the function exists, six columns present, counts show `link`, `admin` and `NULL`. Stamp the ledger row with the filename version the same way the lifecycle migrations were stamped (see `docs/audits/lifecycle/ROLLOUT.md`). Production waits for the batch deploy (spec Part E).

- [ ] **Step 3: Walk the flow against staging data**

With `apps/marketing/.env.local` pointing at staging, open `http://localhost:3010/apply` and complete step 1 with a test phone (NEXT_PUBLIC_E2E_TEST_MODE numbers per `docs` memory), step 2 with a programme, Review, then confirm on staging:

```sql
SELECT first_name, email, phone, parent_phone, date_of_birth, gender, fee_structure_id, fee_source, status, application_number
  FROM lead_profiles ORDER BY created_at DESC LIMIT 1;
```

Expected: every column filled from the form; `fee_source = 'standard'`; `status = 'submitted'`; step 4 shows the payment panel (it will say the fee is not assigned yet until D-C lands; that is expected here).

- [ ] **Step 4: ui-ux-pro-max review at 375 and 1280**

Run the skill (`/ui-ux-pro-max review the apply flow`) and screenshot each step at both widths:

```bash
node -e "
const { chromium } = require('@playwright/test');
(async () => {
  const b = await chromium.launch();
  for (const [w,h,tag] of [[375,812,'phone'],[1280,900,'desktop']]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.goto('http://localhost:3010/apply');
    await p.screenshot({ path: 'C:/Users/Haribabu/AppData/Local/Temp/claude/apply-step1-'+tag+'.png', fullPage: true });
    await p.getByRole('button', { name: /type it myself/i }).click();
    await p.screenshot({ path: 'C:/Users/Haribabu/AppData/Local/Temp/claude/apply-step1-fields-'+tag+'.png', fullPage: true });
  }
  await b.close();
})();
"
```

Review against Part B of the spec: 48 px targets with 8 px gaps, visible focus rings (tab through the form), 4.5:1 contrast on helper text (`text.secondary` on `grey.50` passes in the marketing theme; confirm with the browser's contrast tool), one primary button, no floating elements, no horizontal scroll, `prefers-reduced-motion` respected on the progress bar. Fix anything found in the component that owns it, re-run the affected unit test, and re-screenshot.

- [ ] **Step 5: Record the result**

Append to `docs/superpowers/specs/2026-09-26-enrolment-tools-ux-design.md` under Part D-A a line: `Status: built 2026-MM-DD, migration on staging, not deployed.` and commit:

```bash
git add docs/superpowers/specs/2026-09-26-enrolment-tools-ux-design.md
git commit -m "docs: D-A status"
```

No deploy. The founder decides when the batch ships.
