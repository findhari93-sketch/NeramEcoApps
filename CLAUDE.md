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

### Feature Implementation Order
```
1. Architect (You)  → Schema, types, shared code in packages/
2. UX Designer      → Mobile-first design specs
3. SEO/AEO Expert   → Meta requirements, structured data
4. App Agents       → Implement features (in parallel)
5. UX Designer      → Visual review at mobile viewports
6. SEO/AEO Expert   → Validate SEO implementation
7. QA Agent         → E2E tests + mobile viewport tests
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

### Rules
1. After implementing a feature, run `pnpm test:e2e` (or the relevant project) to verify
2. If tests fail, fix the issues before considering the implementation complete
3. If no E2E tests exist for the feature, create them in `tests/e2e/`
4. Check the browser console for errors during E2E runs - zero console errors is the target
5. Cross-app features (SSO, auth) must have integration tests (`tests/e2e/*integration*.spec.ts`)

### Test File Naming Convention
| App/Feature | Pattern | Project |
|-------------|---------|---------|
| Marketing | `*marketing*.spec.ts` | `marketing-chrome` |
| Student App | `*app*.spec.ts` or `*profile*.spec.ts` | `app-chrome` |
| Cross-app SSO | `*integration*.spec.ts` | `integration` |
| Mobile/PWA | `*mobile*.spec.ts` | `mobile-chrome` |

## Deployment Pipeline

### Environments

| Environment | Branch | URLs | Deploy Trigger |
|-------------|--------|------|----------------|
| **Preview** | PR branches | `*.vercel.app` | Auto on PR |
| **Staging** | `staging` | `staging.neramclasses.com` | Auto on merge |
| **Production** | `main` | `neramclasses.com` | Manual approval |

### Deployment Workflow

```
feature/* → PR to staging → staging branch → PR to main → production
            (auto tests)    (QA testing)    (manual approval)
```

1. **Create feature branch** from `staging`
2. **Open PR** to `staging` → Preview deployment + tests run
3. **Merge to staging** → Auto-deploys to staging environment
4. **QA testing** on staging URLs
5. **Open PR** from `staging` to `main` → Tests run
6. **Manual approval** in GitHub Actions → Production deploy

### Staging URLs

| App | Staging URL |
|-----|-------------|
| Marketing | https://staging.neramclasses.com |
| App | https://staging-app.neramclasses.com |
| Nexus | https://staging-nexus.neramclasses.com |
| Admin | https://staging-admin.neramclasses.com |

### Production URLs

| App | Production URL |
|-----|----------------|
| Marketing | https://neramclasses.com |
| App | https://app.neramclasses.com |
| Nexus | https://nexus.neramclasses.com |
| Admin | https://admin.neramclasses.com |

### Backend Environments

- **Staging**: Separate Supabase + Firebase projects (see `.env.staging.example`)
- **Production**: Production Supabase + Firebase projects

### Manual Deployment Commands

```bash
# Deploy to staging manually
pnpm vercel:deploy

# Deploy to production manually (use with caution)
pnpm vercel:deploy:prod
```

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
