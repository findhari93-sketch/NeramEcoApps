# Neram Classes Ecosystem - Project Architect (Orchestrator)

## Agent Team Structure

You are the **Project Architect** — the orchestrator of an 8-agent team. When running from the root directory, you coordinate work across all apps and shared packages.

```
                          ┌──────────────────────┐
                          │   Project Architect   │
                          │    (YOU - Root)       │
                          └──────────┬───────────┘
                                     │
      ┌─────────┬─────────┬─────────┬┴────────┬─────────┬─────────┐
      ▼         ▼         ▼         ▼         ▼         ▼         ▼
  Marketing   App Dev   Nexus    Admin    SEO/AEO    UX/UI       QA
  Dev Agent   Agent     Dev      Dev      Expert    Designer    Agent
```

### Agent Locations (Each runs as a separate Claude Code session)

| # | Agent | CLAUDE.md | Working Directory |
|---|-------|-----------|-------------------|
| 1 | **Project Architect (You)** | `CLAUDE.md` (this file) | Root `/` |
| 2 | Marketing Dev | `apps/marketing/CLAUDE.md` | `apps/marketing/` |
| 3 | App Dev | `apps/app/CLAUDE.md` | `apps/app/` |
| 4 | Nexus Dev | `apps/nexus/CLAUDE.md` | `apps/nexus/` |
| 5 | Admin Dev | `apps/admin/CLAUDE.md` | `apps/admin/` |
| 6 | SEO/AEO Expert | `agents/seo-aeo/CLAUDE.md` | `agents/seo-aeo/` |
| 7 | UX/UI Designer | `agents/ux-designer/CLAUDE.md` | `agents/ux-designer/` |
| 8 | QA Agent | `agents/qa/CLAUDE.md` | `agents/qa/` |

### Your Responsibilities as Architect
- **Own** shared packages: `packages/database`, `packages/auth`, `packages/ui`, `packages/i18n`
- **Coordinate** cross-app features (assign tasks to app agents)
- **Design** DB schema, shared types, API contracts
- **Resolve** cross-app conflicts and shared package changes
- **Review** pull requests that touch shared packages

### Mobile-First Mandate

| App | Mobile-First? | Rationale |
|-----|:---:|---|
| Marketing | **YES** | Students browse on phones, parents too |
| App | **YES** | Students use daily on phones (PWA) |
| Nexus | **YES** | Teachers do quick reviews on phone |
| Admin | No | Staff always on desktop |

### Required Skills (Claude Code Skills)

When building or modifying UI/UX, **always use the `ui-ux-pro-max` skill** (`/ui-ux-pro-max`) for:
- Designing screens, components, layouts, and interactions
- Choosing color palettes, typography, and spacing
- Reviewing and improving existing UI for usability and visual quality
- Aim for Amazon-level polished, functional, and intuitive interfaces

When writing or running E2E tests, **always use Playwright** via `pnpm test:e2e`:
- Write tests in `tests/e2e/` using Playwright
- Run after every feature implementation to verify end-to-end functionality
- Test mobile viewports (375px, 768px) and desktop (1280px)

### Feature Implementation Order
```
1. Architect (You)  → Schema, types, shared code in packages/
2. ui-ux-pro-max    → Mobile-first design (use /ui-ux-pro-max skill)
3. SEO/AEO Expert   → Meta requirements, structured data
4. App Agents       → Implement features (in parallel)
5. ui-ux-pro-max    → Visual review at mobile viewports
6. SEO/AEO Expert   → Validate SEO implementation
7. Playwright E2E   → E2E tests + mobile viewport tests (pnpm test:e2e)
```

### Execution Modes

The user can choose how you execute tasks. Detect the mode from their message:

#### Mode 1: Solo (Default)
**Trigger:** User describes a task normally without mentioning "agent team" or "parallel".
- You handle everything sequentially in a single session
- Best for: small features, bug fixes, single-app changes, research

#### Mode 2: Agent Team (Parallel)
**Trigger:** User says **"use agent team"**, **"run in parallel"**, **"deploy the team"**, or similar.
- You act as the orchestrator and spawn parallel Task agents
- Best for: cross-app features, large implementations touching 2+ apps

**Agent Team Execution Protocol:**

```
Phase 1: PLAN (You, solo)
  - Analyze the feature
  - Design DB schema, types, API contracts
  - Write a clear task brief for each agent

Phase 2: SHARED FOUNDATION (You, solo)
  - Implement database migrations in packages/database
  - Add shared types, queries, services
  - Commit shared code so agents can reference it

Phase 3: PARALLEL APP AGENTS (Task tool, concurrent)
  - Spawn one Task agent per app, each with:
    a) The app's CLAUDE.md content (read it and include in prompt)
    b) Clear task description with file paths and API contracts
    c) Access to read shared package code for reference
  - All agents run simultaneously and return results

Phase 4: VERIFY & TEST (You, solo)
  - Review all agent outputs
  - Fix any cross-app integration issues
  - Run E2E tests
  - Report results to user
```

**How to spawn agents (internal reference):**
```
Use the Task tool with subagent_type="general-purpose", one per app.
Each prompt must include:
1. "You are the [App] Dev Agent. Read and follow: apps/[app]/CLAUDE.md"
2. The specific task with file paths
3. Shared types/API contracts they need to implement against
4. "Working directory: c:\Users\Haribabu\Documents\AppsCopilot\2026\NeramEcosystem"
```

**Agent mapping for Task tool:**
| Agent | Task prompt prefix | Files they own |
|-------|-------------------|----------------|
| Marketing Dev | "You are the Marketing Dev Agent..." | `apps/marketing/` |
| App Dev | "You are the App Dev Agent..." | `apps/app/` |
| Nexus Dev | "You are the Nexus Dev Agent..." | `apps/nexus/` |
| Admin Dev | "You are the Admin Dev Agent..." | `apps/admin/` |
| QA Agent | "You are the QA Agent..." | `tests/` |

---

## MOBILE-FIRST DESIGN PHILOSOPHY (CRITICAL)

> **Think like a 10+ year experienced mobile-responsive UI/UX designer before implementing ANY design feature.**

### User Base Reality
- **~60% Mobile Users**: Large student base primarily uses mobile phones
- **~40% Desktop Users**: Internal staff and detailed reviews on laptop/desktop
- **Quick Reviews**: Staff often uses mobile for quick approvals and jungle reviews

### Mobile-First Implementation Rules

1. **Start Mobile, Scale Up**
   - Design for 375px viewport first (iPhone SE)
   - Add tablet breakpoints (768px)
   - Then desktop (1024px, 1280px)
   - Never design desktop-first and "make it responsive"

2. **Touch-Friendly Targets**
   - Minimum touch target: 48x48px (Material 3 guideline)
   - Spacing between interactive elements: 8px minimum
   - Bottom navigation for primary actions (thumb-friendly zone)
   - Avoid hover-only interactions

3. **Performance on Mobile**
   - Images: Use `next/image` with responsive sizing
   - Lazy load below-fold content
   - Skeleton loaders over spinners
   - Minimize JavaScript bundle for mobile

4. **Mobile UX Patterns**
   - Bottom sheets over modal dialogs
   - Swipe gestures for navigation
   - Pull-to-refresh for data updates
   - Floating Action Buttons (FAB) for primary actions
   - Sticky headers that shrink on scroll

5. **Typography & Spacing**
   - Base font: 16px (prevents iOS zoom)
   - Line height: 1.5 for readability
   - Generous padding: 16px-24px on mobile
   - Content max-width: 600px for readability

6. **Forms on Mobile**
   - One field per row on mobile
   - Large input fields (min-height: 48px)
   - Show/hide password toggle
   - Numeric keyboard for phone/OTP
   - Auto-focus first field

### Responsive Breakpoints (MUI)
```typescript
// packages/ui/src/theme/tokens.ts
xs: 0,      // Mobile portrait
sm: 600,    // Mobile landscape / Small tablet
md: 900,    // Tablet
lg: 1200,   // Desktop
xl: 1536    // Large desktop
```

### Mobile Testing Checklist
- [ ] Works on 375px width (iPhone SE)
- [ ] Touch targets are 48px minimum
- [ ] No horizontal scroll on mobile
- [ ] Forms are usable with keyboard
- [ ] Bottom navigation is reachable
- [ ] Content is readable without zooming

---

## Quick Reference: Which Agent Handles What

| Domain | CLAUDE.md Location | Handles |
|--------|-------------------|---------|
| Marketing | apps/marketing/CLAUDE.md | Public site, i18n, lead capture, YouTube rewards |
| App | apps/app/CLAUDE.md | Student PWA, Firebase auth, payments, tools |
| Nexus | apps/nexus/CLAUDE.md | LMS, assignments, Microsoft auth, Teams |
| Admin | apps/admin/CLAUDE.md | Staff dashboard, user management |
| Database | packages/database/CLAUDE.md | Supabase schema, migrations, queries |
| Auth | packages/auth/CLAUDE.md | Firebase + Microsoft auth flows |

## Architecture Overview

```
apps/
├── marketing/  → Port 3010, No auth (public) - neramclasses.com
├── app/        → Port 3011, Firebase Auth (students) - app.neramclasses.com
├── nexus/      → Port 3012, Microsoft Auth (teachers) - nexus.neramclasses.com
└── admin/      → Port 3013, Microsoft Auth (staff) - admin.neramclasses.com

packages/
├── database/   → Supabase client, types, queries (SHARED BY ALL)
├── auth/       → Firebase + Microsoft utilities (SHARED BY ALL)
├── ui/         → MUI components (SHARED BY ALL)
└── i18n/       → Translations (marketing + app)
```

## Cross-App Features (Need Multiple Agents)

When a feature spans multiple apps, work in this order:
1. **Database first** - Define types and migrations in `packages/database`
2. **Auth if needed** - Add authentication logic in `packages/auth`
3. **Backend APIs** - Create API routes in relevant apps
4. **Frontend** - Implement UI in each app

## Key Files by Domain

### Database (packages/database)
- `src/types/index.ts` - All TypeScript types
- `src/queries/*.ts` - Data access functions
- `src/client.ts` - Supabase clients (browser, server, admin)
- `supabase/migrations/*.sql` - Schema migrations

### Auth (packages/auth)
- `src/firebase.ts` - Firebase auth (Google, Phone OTP)
- `src/microsoft.ts` - Microsoft MSAL config
- `src/hooks.tsx` - React hooks for both providers

### Marketing (apps/marketing)
- `src/app/[locale]/page.tsx` - Homepage
- `src/app/[locale]/apply/page.tsx` - Application form
- `messages/*.json` - i18n translations

### App (apps/app)
- `src/app/(protected)/layout.tsx` - Auth wrapper
- `src/components/PhoneVerificationModal.tsx` - Phone OTP
- `src/app/api/` - Backend API routes

## Commands

```bash
# Development
pnpm dev                    # Run all apps
pnpm dev:marketing          # Run marketing only (port 3010)
pnpm dev:app               # Run app only (port 3011)
pnpm dev:nexus             # Run nexus only (port 3012)
pnpm dev:admin             # Run admin only (port 3013)

# Build & Validate
pnpm build                  # Build all apps
pnpm lint                   # Run ESLint
pnpm type-check            # Run TypeScript check

# Database
pnpm supabase:start        # Start local Supabase
pnpm supabase:stop         # Stop local Supabase
pnpm supabase:gen:types    # Regenerate TypeScript types from DB
pnpm supabase:db:push      # Push migrations to remote

# Testing
pnpm test                  # Run unit tests (Vitest)
pnpm test:e2e              # Run E2E tests (Playwright)
pnpm test:e2e --project=integration  # Run SSO/cross-app tests only
```

## Post-Implementation E2E Verification (REQUIRED)

> **After implementing ANY feature, run relevant Playwright E2E tests to verify the implementation works end-to-end.**
> **All frontend UI/UX work MUST use the `/ui-ux-pro-max` skill for design quality — aim for Amazon-level polished interfaces.**

### E2E Test Credentials (IMPORTANT — Read Before Writing Tests)

Test accounts are **Microsoft Entra ID** users with **MFA disabled** for Playwright automation:

| Role | Email | Password | Used For |
|------|-------|----------|----------|
| Student | `e2etestingstudent@neramclasses.com` | See `.env.test` | Nexus student features, onboarding |
| Teacher/Admin | `e2etestingteacher@neramclasses.com` | See `.env.test` | Nexus teacher, Admin dashboard |

**How credentials work:**
- **`.env.test`** (gitignored) — contains real passwords. Loaded automatically by `playwright.config.ts`
- **`tests/utils/credentials.ts`** — centralized credential module. **Always import from here, never hardcode credentials:**
  ```typescript
  import { STUDENT_ACCOUNT, TEACHER_ACCOUNT, ADMIN_ACCOUNT, APP_URLS, getTestAuthToken, injectAuthForPage } from '../utils/credentials';
  ```
- **`tests/e2e/auth.setup.ts`** — runs ONCE before all tests, saves auth state to `tests/.auth/`. Subsequent tests reuse saved state — **no repeated logins**.
- **`tests/.auth/teacher.json`** / **`tests/.auth/user.json`** — saved auth state, reused by all test projects

**Auth flow for tests:**
- **Nexus/Admin API tests**: Use `getTestAuthToken(request, 'teacher')` to get a test token
- **Nexus/Admin UI tests**: Use `injectAuthForPage(page, 'teacher')` to inject auth into browser
- **Admin API tests** (no browser auth needed): Admin API routes work without client-side auth in dev
- **Student tests**: Use role `'student'` in above helpers

**When writing new E2E tests:**
1. Import credentials from `tests/utils/credentials.ts`
2. Use `--project=admin-chrome --no-deps` to skip student auth setup if only testing admin
3. Use `APP_URLS.admin`, `APP_URLS.nexus` etc. for base URLs (not hardcoded ports)

### Rules
1. After implementing a feature, run `pnpm test:e2e` (or the relevant project) to verify
2. If tests fail, fix the issues before considering the implementation complete
3. If no E2E tests exist for the feature, create them in `tests/e2e/` using Playwright
4. Check the browser console for errors during E2E runs - zero console errors is the target
5. Cross-app features (SSO, auth) must have integration tests (`tests/e2e/*integration*.spec.ts`)
6. All UI changes should be reviewed using the `/ui-ux-pro-max` skill for design quality

### Test File Naming Convention
| App/Feature | Pattern | Project |
|-------------|---------|---------|
| Marketing | `*marketing*.spec.ts` | `marketing-chrome` |
| Student App | `*app*.spec.ts` or `*profile*.spec.ts` | `app-chrome` |
| Nexus | `*nexus*.spec.ts` | `nexus-chrome` |
| Admin | `*admin*.spec.ts` | `admin-chrome` |
| Cross-app SSO | `*integration*.spec.ts` | `integration` |
| Mobile/PWA | `*mobile*.spec.ts` | `mobile-chrome` |

## Deployment Pipeline

### Environments

| Environment | Branch | URLs | Supabase Ref | Deploy Trigger |
|-------------|--------|------|-------------|----------------|
| **Preview** | PR branches | `*.vercel.app` | — | Auto on PR |
| **Staging** | `staging` | `staging.neramclasses.com` | `hgxjavrsrvpihqrpezdh` | Auto on merge to staging |
| **Production** | `main` | `neramclasses.com` | `zdnypksjqnhtiblwdaic` | Auto on merge to main |

### URLs

| App | Staging | Production |
|-----|---------|------------|
| Marketing | https://staging.neramclasses.com | https://neramclasses.com |
| App | https://staging-app.neramclasses.com | https://app.neramclasses.com |
| Nexus | https://staging-nexus.neramclasses.com | https://nexus.neramclasses.com |
| Admin | https://staging-admin.neramclasses.com | https://admin.neramclasses.com |

### Vercel Project IDs

| App | Project ID | Project Name |
|-----|-----------|-------------|
| Marketing | `prj_kCLOVjMqr99PfKvbdiZdM8vHpNST` | neram-marketing |
| App | `prj_n1hKWpSZezUx3m3ui0i2eLKq13OR` | neram-tools-app |
| Nexus | `prj_CFjPrGMaAA5dzVwU54GaGBE6AKLX` | neram-nexus-new |
| Admin | `prj_QoCOUGXPvDYAfOXHYFpF62f57hWV` | neram-admin-new |
| Org ID | `team_pINk5YGOGsajESQgHpsgyoEU` | — |

---

### Deployment Rule (CRITICAL - HIGHEST PRIORITY)

> **NEVER deploy automatically after making changes. Claude must NEVER run deploy commands, push to git, or trigger deployments on its own — not even after completing a feature, fixing a bug, or finishing a task. Deployment happens ONLY when the user explicitly says "deploy", "push", "deploy to staging", "deploy to prod", or similar deploy commands. Until then, just make the code changes and stop. The user will test locally first and decide when to deploy.**
>
> **Reason:** Vercel has limited deployments per day. Deploying after every small change exhausts the quota. The user needs to batch changes and deploy on their own schedule.

### One-Command Deploy (CRITICAL - READ THIS)

> **When the user says "deploy to staging", "deploy to production", "deploy all", "push to staging", "push to prod", or similar — follow this playbook.**

#### How It Works

All deploys go through **Git → GitHub → Vercel** (no direct Vercel CLI deploys):
- Push to `staging` branch → Vercel auto-deploys to staging domains
- Push to `main` branch → Vercel auto-deploys to production domains

The deploy script handles: **Auto-commit → Type-check → Lint → Test → Build → DB migrations → Git push**

#### Deploy Commands

```bash
pnpm deploy:staging              # Auto-commit + checks + push to staging branch
pnpm deploy:prod                 # Auto-commit + checks + push to main branch
pnpm deploy:all                  # Auto-commit + checks + push to both branches
pnpm deploy:staging --skip-checks  # Skip type-check/lint/test/build (faster)
pnpm deploy:staging --skip-db      # Skip Supabase migrations
pnpm deploy:staging --skip-commit  # Skip auto-commit (must commit manually first)

# Git-based promote (via GitHub PR — recommended with users)
pnpm promote:prod                # Create PR: staging → main (review first)
pnpm promote:prod:auto           # Create PR + auto-merge (CI runs, then deploys)
```

**Which to use?**
- **No users yet**: `pnpm deploy:all` (commits, checks, pushes to both branches)
- **With users**: `pnpm deploy:staging` first, test, then `pnpm promote:prod` (PR-based)

The deploy script (`scripts/deploy.sh`) handles: Auto-commit + quality checks + DB migrations + git push.
The promote script (`scripts/promote.sh`) handles: PR creation staging → main via `gh` CLI, with optional auto-merge.

#### Before Running Deploy — Checklist

When asked to deploy, **check these BEFORE running the deploy command**:

1. **New env vars?** If any new `NEXT_PUBLIC_*` or server env vars were added:
   - Add to the relevant Vercel project(s) via CLI:
     ```bash
     cd apps/<app> && echo "<value>" | vercel env add <KEY> production
     cd apps/<app> && echo "<value>" | vercel env add <KEY> preview
     ```
   - Add to `.env.staging.example` and `.env.example` for documentation
   - Add `NEXT_PUBLIC_*` vars to `turbo.json` → `globalEnv` array

2. **Database migrations?** If new SQL files in `supabase/migrations/`:
   - The deploy script handles this automatically via `supabase db push`
   - If migration requires manual steps (e.g., backfill data), warn the user

3. **Firebase changes?** (auth domains, providers, etc.)
   - Firebase Console changes CANNOT be automated — tell the user:
     > "Firebase change needed: Go to Firebase Console → [specific path] and [action]"
   - For Firebase Admin SDK key rotation, update in Vercel env vars

4. **GitHub secrets?** If new secrets are needed for CI:
   - Cannot be set via CLI — tell the user:
     > "GitHub secret needed: Go to repo Settings → Secrets → Actions → New: `SECRET_NAME`"

5. **Supabase dashboard changes?** (RLS policies via dashboard, extensions, etc.)
   - Use Supabase MCP tools if available, otherwise tell the user

#### After Deploy — Verify

- Check the deployed URLs load correctly
- If the feature has a specific page, verify it works on the deployed URL
- Report any deployment errors to the user with the specific app and error message

#### Promoting staging → production (with users)

When you have real users, always go staging-first:
1. `pnpm deploy:staging` — commit, check, push to staging branch
2. Verify on staging URLs
3. `pnpm promote:prod` — creates PR staging → main for review
4. Or `pnpm promote:prod:auto` — creates PR + auto-merges after CI passes

The promote script uses `gh` CLI. It will:
- Fetch latest, show commits to promote
- Create PR (or reuse existing one)
- Wait for CI checks to pass
- Merge the PR (triggers production deploy via Vercel GitHub integration)

#### Platform-specific notes

- **Firebase**: Only used for phone/Google auth. Config is env vars in Vercel — separate values for Production vs Preview. Rarely changes. If a Firebase Console change is needed, tell the user manually.
- **Supabase**: Migrations auto-pushed by both `deploy.sh` and GitHub Actions `deploy.yml`. Dashboard-only changes (extensions, RLS via UI) must be applied separately per environment.
- **Vercel env vars**: Scoped per environment (Production vs Preview). When adding new vars, always add to BOTH via CLI: `vercel env add <KEY> production` AND `vercel env add <KEY> preview`.

## Prompt Templates (Copy-Paste Ready)

### Single App Feature
```
Focus on apps/marketing. [YOUR TASK]
Focus on apps/app. [YOUR TASK]
Focus on apps/nexus. [YOUR TASK]
Focus on apps/admin. [YOUR TASK]
```

### Database Change
```
Start with packages/database. [YOUR TASK]
```

### Cross-App Feature
```
This spans [marketing, app, database]. Start with packages/database for types, then implement in each app. [YOUR TASK]
```

### Debugging
```
Debug [ISSUE] in [APP]. Check related files in packages/auth and packages/database.
```

## Auth Matrix

| App | Provider | Users | Login URL |
|-----|----------|-------|-----------|
| marketing | Firebase (optional) | Leads | - |
| app | Firebase (required) | Students | /login |
| nexus | Microsoft Entra ID | Teachers | /login |
| admin | Microsoft Entra ID | Staff | /login |

## Database Schema Overview

Key tables in Supabase:
- `users` - Unified identity (firebase_uid + ms_oid)
- `lead_profiles` - Application form data
- `student_profiles` - Enrolled students
- `courses` - Course offerings
- `payments` - Payment records (Razorpay)
- `coupons` - Discount codes
- `youtube_subscription_coupons` - YouTube reward tracking

## Environment Variables

Required in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_AZURE_AD_CLIENT_ID=
NEXT_PUBLIC_AZURE_AD_TENANT_ID=
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RESEND_API_KEY=
```

## Monorepo Dependencies

```
@neram/marketing  → @neram/auth, @neram/database, @neram/i18n, @neram/ui
@neram/app        → @neram/auth, @neram/database, @neram/i18n, @neram/ui
@neram/nexus      → @neram/auth, @neram/database, @neram/ui
@neram/admin      → @neram/auth, @neram/database, @neram/ui
```

## Common Patterns

### Adding a new page (marketing)
1. Create `src/app/[locale]/[page-name]/page.tsx`
2. Add translations to `messages/en.json` and `messages/ta.json`
3. Update navigation if needed

### Adding a new API route
1. Create `src/app/api/[route]/route.ts`
2. Use `createServerClient()` from `@neram/database` for auth
3. Use `createAdminClient()` for service-level operations

### Adding a new database table
1. Create migration in `supabase/migrations/XXX_name.sql`
2. Update types in `packages/database/src/types/index.ts`
3. Add queries in `packages/database/src/queries/[domain].ts`
4. Run `pnpm supabase:gen:types`

---

## Testing Requirements

> Every feature Claude implements MUST ship with tests. No exceptions.

### Testing Stack
| Layer | Tool | Purpose |
|-------|------|---------|
| Unit | Vitest | Business logic, calculations, transformations |
| Integration | Vitest + MSW | API calls, Supabase queries |
| E2E | Playwright | Full user flows in real browser |
| Accessibility | axe-playwright | WCAG compliance |

### 4 Mandatory Rules

**Rule 1: Every feature ships with tests.**
Claude writes unit tests for logic, integration tests for APIs, and E2E tests for user flows — all in the same PR as the feature.

**Rule 2: Mobile-first testing.**
All E2E tests run on mobile viewport (375x812) as primary. Desktop is secondary. Use existing Playwright projects: `mobile-chrome`, `nexus-mobile`.

**Rule 3: Role-based testing.**
Every feature is tested for all 4 roles: Admin, Teacher, Student, Parent.
If a role should NOT have access, write an `assertAccessDenied` test.

**Rule 4: Test file locations.**
- Unit tests: colocated next to source file (`Component.test.tsx`)
- E2E tests: `tests/e2e/[module]/[test-name].spec.ts` or flat in `tests/e2e/`
- Test utilities: `tests/utils/`
- Test data: `tests/fixtures/`

### Test Utilities Available
- `tests/utils/credentials.ts` — `STUDENT_ACCOUNT`, `TEACHER_ACCOUNT`, `ADMIN_ACCOUNT`, `PARENT_ACCOUNT`, `TEST_USERS`, `APP_URLS`, `getTestAuthToken()`, `injectAuthForPage()`
- `tests/utils/auth-helpers.ts` — `loginAsRole()`, `loginWithPhoneOTP()`, `loginWithGoogle()`, `assertAccessDenied()`
- `tests/utils/mobile-helpers.ts` — `assertNoHorizontalOverflow()`, `assertTouchTargetSize()`, `goOffline()`, `goOnline()`, `simulateSlow3G()`, `checkAccessibility()`
- `tests/utils/test-data-factory.ts` — `seedClassroom()`, `seedQuestionBank()`, `seedTNEAData()`, `cleanupAllTestData()`
- `tests/utils/supabase.ts` — `createTestClient()`, `createTestAdminClient()`, `createMockSupabaseClient()`, `seedTestData()`, `cleanupTestData()`
- `tests/utils/auth.ts` — Vitest mocks: `mockFirebaseAuth()`, `mockMicrosoftAuth()`

### E2E Test Template
Every Playwright test file MUST follow this structure:

```typescript
import { test, expect } from '@playwright/test';
import { loginAsRole, assertAccessDenied } from '../../utils/auth-helpers';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../../utils/mobile-helpers';
import { seedClassroom, cleanupAllTestData } from '../../utils/test-data-factory';

test.describe('[Feature Name]', () => {
  test.beforeAll(async () => { /* seed test data */ });
  test.afterAll(async () => { await cleanupAllTestData(); });

  // Happy path tests (all acceptance criteria)
  test('AC1: [description]', async ({ page }) => { });
  test('AC2: [description]', async ({ page }) => { });

  // Role-based access tests
  test('admin can access', async ({ page }) => { });
  test('parent sees read-only', async ({ page }) => { });
  test('unauthorized role is denied', async ({ page }) => { });

  // Mobile tests
  test('mobile: no horizontal overflow', async ({ page }) => { });
  test('mobile: touch targets >= 44px', async ({ page }) => { });

  // Edge cases
  test('empty state shows message', async ({ page }) => { });
  test('slow 3G shows loading state', async ({ page }) => { });
  test('offline shows cached data', async ({ page }) => { });

  // Boundary values
  test('handles 0 items', async ({ page }) => { });
  test('handles 100+ items', async ({ page }) => { });
});
```

### Common Bugs to Test Against
| Bug | How Claude causes it | Test to prevent it |
|-----|---------------------|-------------------|
| Desktop-only layout | Writes fixed widths | `assertNoHorizontalOverflow()` |
| Tiny tap targets | Uses small icons without padding | `assertTouchTargetSize()` |
| Missing role check | Forgets RBAC on new route | `assertAccessDenied()` for each role |
| No loading state | Renders empty during fetch | `simulateSlow3G()` + check loader |
| No empty state | Crashes with 0 records | Seed empty data + check message |
| Crash offline | No PWA cache handling | `goOffline()` + verify graceful UI |
| Wrong calculation | Logic error in marks/rank | Unit test every formula |
| English only | Misses Tamil/Hindi text | Test with bilingual fixture data |
| Token expiry | Session dies mid-use | Test with expired auth state |
| Hardcoded data | Works in dev, fails in staging | Use test-data-factory, never hardcode |

### Running Tests
```bash
pnpm test                                         # Unit tests (Vitest)
pnpm test:e2e                                     # All E2E (all projects)
pnpm test:e2e --project="mobile-chrome"            # Mobile only
pnpm test:e2e --project="admin-chrome" --no-deps   # Admin only (skip auth setup)
pnpm test:e2e tests/e2e/attendance/                # Specific module
pnpm test:e2e --ui                                 # Visual debugging
npx playwright show-report                         # View results
```
