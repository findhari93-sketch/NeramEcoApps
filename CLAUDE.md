# Neram Classes Ecosystem - Orchestrator Guide

## 📱 MOBILE-FIRST DESIGN PHILOSOPHY (CRITICAL)

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
