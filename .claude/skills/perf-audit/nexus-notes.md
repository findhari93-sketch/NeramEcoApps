# Nexus notes (apps/nexus)

This is what an audit already knows, so it does not have to be rediscovered. It was last checked against the code on 2026-09-22 (config, all layouts, the top shared files). When the `config:nexus` unit or a layout is stale, re-verify it and update this file (check ARCH-1). The file names suspects, not verdicts: confirm each one before filing a finding.

## Stack
- Next 14.2.21 (App Router), React 18.3.1, SWR 2.4.2, MUI 5.18 through `@neram/ui` (which re-exports MUI with `export *`), and MUI X DataGrid 6.
- There is no `middleware.ts`, no `instrumentation.ts`, no Web Vitals reporting, no Sentry and no bundle analyzer. Server-Timing is set only in `api/study-materials/folders`.
- `next.config.js` has `typescript.ignoreBuildErrors: true`. Type errors never fail a build, so run `pnpm --filter @neram/nexus type-check --force` separately.
- `transpilePackages` covers `@neram/*`. `optimizePackageImports` covers `@neram/ui` and MUI.
- next-pwa is configured, but its service worker is **never registered** on App Router pages (it injects into the Pages Router `main.js` only), and its precache lists a file Next does not serve. There is no service worker in production (PERF-0039, measured 2026-09-22).
- Vercel region is `sin1`. There are 23 crons in `vercel.json`.
- Supabase traffic goes through the Cloudflare Worker at `db.neramclasses.com`.
- `nexus` and `staging-nexus` are DNS only in Cloudflare since 2026-09-22 (PERF-0007): the browser talks to Vercel directly, so there is no Cloudflare 100s cut-off. A 524 on Nexus after that date means the request did not come through these hosts.

## Shape
- 186 pages:
  - `(teacher)` 104, `(student)` 68, `(pad)` 6, `(parent)` 4, `(auth)` 3, root 1.
  - Largest areas: teacher/question-bank 19 pages, api/question-bank 72 routes.
- 599 route handlers, 598 of them under `src/app/api`.
- About 240 shared units. The top ones by fan-in:
  - `lib/parent-token`, `ms-verify`, `ttl-cache`, `teams-sso`, `impersonation-token`, each reached by about 580 units;
  - `staff-capabilities`;
  - `api-errors`;
  - `feature-flags`;
  - `hooks/useNexusAuth.tsx`.

## Layout and provider tree
- `app/layout.tsx` (server): Inter font, `NeramThemeProvider`, `Providers`, `EnvBadge`, the KaTeX CSS and the Material Icons stylesheet.
- `app/providers.tsx` (client) nests `SWRConfig`, `NexusAuthProvider`, `SidebarProvider` and `ImpersonationBanner` + `AccessGate`:
  - `SWRConfig` uses the persistent cache from `lib/swr-cache.ts`, with `revalidateOnFocus: false`, `dedupingInterval` 15s and `errorRetryCount` 2.
- `(teacher)/layout.tsx` nests `RoleGuard`, `PanelProvider`, `NavBadgeProvider` and `StudentStageFactsProvider`, then renders the `DesktopSidebar`, `TopBar` (holding the `NotificationBell`), `BottomNav` and `FeatureGate`.
- `(student)/layout.tsx` calls `usePublishedQBExams`, then nests `RoleGuard`, `NavBadgeProvider`, `StudentZoneProvider` and `StudentShell`:
  - `StudentShell` contains device registration, `WelcomeOrientation` and `ReportIssueFab`, and calls `installErrorCapture()`.
- `(parent)/layout.tsx`: `RoleGuard` with the navigation, and no badges or bell.
- Error boundaries: `(teacher)/error.tsx`, `(student)/error.tsx` and `global-error.tsx` only. There is no `app/error.tsx` and none for `(parent)`, `(pad)` or `(auth)` (PERF-0028).
- RoleGuard is the hydration shield: the server and the first client render both show its spinner, so nothing under it can mismatch. When /api/auth/me cannot be reached (`authUnavailable`), it shows "Could not reach Nexus" with Try again instead of redirecting to sign in.
- RoleGuard shows `NoClassroomWelcome` to any non-parent with zero classrooms, staff included. That is by design: staff need a classroom too (the user's decision, 2026-09-22). Staff get their own wording (PERF-0038). An admin adds a teacher in Classrooms, then the Teachers tab, then Add Teacher.

## Requests every page makes (shell)
| Request | Source | Cadence |
|---|---|---|
| `/api/auth/me` | `useNexusAuth`, `AccessGate`, `RoleGuard` (check whether they share one call) | on boot; answer cached in `lib/auth-cache.ts` |
| `/api/notifications?countOnly=true` | `packages/ui/src/hooks/useUserNotifications.ts`, through `components/NotificationBell.tsx` | 60s module-level poller, paused while hidden, with an in-flight guard; the list (`limit=15`) is fetched separately |
| `/api/nav-badges` | `components/NavBadgeProvider.tsx` (raw `fetch`, `cache: 'no-store'`) | 60s; the handler `api/nav-badges/route.ts` runs about 7 queries in 2 `Promise.all` batches |
| `/api/question-bank/published-exams` | `hooks/usePublishedQBExams.ts` | student layout |
| `/api/devices/register` | `hooks/useDeviceRegistration.ts` | student shell, once per tab session per account; never during View as Student (PERF-0035) |
| `/api/devices/heartbeat` | `hooks/useActiveTimeTracker.ts` | only for a visible minute with activity, plus an authenticated keepalive flush on tab hide; location only if already granted (PERF-0033 to 0036, fixed 2026-09-22) |
| `/api/students/stage-facts` | `StudentStageFactsProvider` | teacher layout; 0 on a warm hard load (PERF-0031) |
| `/api/graph/photo?self=true` | `GraphAvatar` in TopBar | per TopBar mount, cached publicly (PERF-0030) |

/api/auth/me has a 15s client deadline (`ME_TIMEOUT_MS`), and it returns `user.ms_oid`, which keys the device caches.

**401 means "sign in again" to the client** (useAuthFetch redirects, useNexusAuth ends View as Student). So an auth helper must throw a 401 message only when the session was really refused. An outage (Microsoft, Graph throttling, a failed DB read) throws `ApiError(..., 503)` instead: see `lib/ms-verify.ts` and `lib/parent-auth.ts` (PERF-0013, PERF-0014). A `{ data }` destructure with no `error` on an auth read is a finding.

**Background work takes `getTokenSilently`, never `getToken`** (PERF-0054). getToken redirects the whole page to Microsoft when the session needs interaction. The silent one sets `sessionExpired` instead, and `SessionExpiredPrompt` asks the user. Any new poller or timer that calls getToken is a finding.

**Chrome navigation goes through `components/NavigationProgress`** (PERF-0029): `NavLink` for rows (a real prefetched link) and `useNavigate()` for imperative pushes. Both run in one transition that drives the top progress bar. A bare `router.push` in chrome is a finding.

**Identity changes are fresh boots** (PERF-0055): starting or ending View as Student and parent sign-in call `beginIdentitySwitch`, and only the newest /me load may write state. Error boundaries: `app/error.tsx` (root, role-neutral), `(teacher)`, `(student)` and `(parent)/error.tsx`, with `global-error.tsx` as the last resort (PERF-0028).

## Data layer
- `lib/nexus-swr.ts`:
  - `fetchWithToken` throws a `NexusFetchError` on any non-2xx response.
  - `useNexusSWR(key, getToken)` and `useAuthSWR` wrap SWR.
  - 51 files use these hooks; about 233 call sites still use raw `fetch('/api…')`.
- `hooks/useNexusAuth.tsx` (about 950 lines) provides `getToken`, `tokenReady` and `loading` (which callers rename `authLoading`).
  - MSAL itself is in `packages/auth/src/microsoft.ts`.
- Server auth: `lib/ms-verify.ts` (`verifyMsToken`) and `getRequestUser` in `lib/study-materials.ts`.
- Errors: `lib/api-errors.ts` (`ApiError`, `errorResponse`); client error capture in `lib/error-buffer.ts`.
- **Never import `mutate` from 'swr'.** Providers gives SWR its own cache, and the exported `mutate` is bound to SWR's default cache, so it refetches nothing. Use `useSWRConfig().mutate`, a hook's bound `mutate`, `useRevalidateClass()` or `useRefreshStudentStageFacts()`. A test in `lib/swr-revalidate.test.tsx` fails on any such import.
- `@neram/auth` is imported through its barrel, which pulls the Firebase SDK into the root bundle (PERF-0053).

## Suspects to check first (not yet verified)
- **Device-cache first paint.** `useNexusAuth` seeds state from a boot payload (localStorage) inside `useState` initializers, and `lib/swr-cache.ts` feeds SWR from localStorage. The server renders the empty state, while a browser with a warm cache renders the real shell. That is a hydration mismatch (#418) on every page, followed by a whole-root client re-render (#423). Check this under HYD-1 on `shared:src/hooks/useNexusAuth.tsx` and `layout:.`.
- **Pages that fetch on `getToken` without waiting for `tokenReady`** (AUTH-2, NAV-2).
- **The 524 on the bell and badge endpoints.** A 524 is Cloudflare's 100s origin timeout. The Nexus host was proxied until 2026-09-22 (now DNS only, PERF-0007); what remains to check is whether the slow part is the handler or the Supabase Worker hop (API-2).

## Traps from past sessions (memory slugs)
| Trap | Memory |
|---|---|
| Gating fetches on `authLoading` serialises them; use `tokenReady` | `project_nexus_authloading_serializes_fetches` |
| 38 routes map every non-"Not authorized" error to 500 | `reference_nexus_route_500_not_401` |
| `useEffect(..., [load])` loops when the hook behind `load` stops memoising | `reference_effect_keyed_on_unstable_callback` |
| The SWR 15s dedupe plus the 24h device cache replay reads made before a write | `reference_swr_replays_pre_write_answers` |
| Heavy routes 500 on Node 24 with Next 14.2 (jest worker) | `project_node24_jest_worker_crash` |
| A prod build clobbers a running dev server's `.next` | `reference_never_build_while_dev_runs` |
| A Turbo cache hit hides type errors; pass `--force` | `reference_turbo_cache_hides_type_errors` |
| Local type-check reads other sessions' uncommitted work | `reference_local_typecheck_lies_shared_tree` |
| `getRequestUser`'s cache returns the first user in tests | `reference_getrequestuser_cache_breaks_tests` |
| Sidebar grids use window breakpoints and overflow | `reference_sidebar_grid_breakpoint_overflow` |
| `@ts-nocheck` hid a prod white-screen | `project_ts_nocheck_hides_runtime_crash` |
| Paint from device caches (instant boot) | `project_nexus_instant_boot` |
| A barrel in a workspace package ships everything it re-exports; add it to `optimizePackageImports` (done for `@neram/ui` and `@neram/auth`, PERF-0053) | `reference_perf_audit_system` |
| SWR cache conventions | `project_nexus_swr_cache` |
