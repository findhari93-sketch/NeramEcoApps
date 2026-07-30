# CI secrets for the E2E workflows

Set them with the `gh` CLI (an earlier version of this doc claimed they could not
be, which was wrong):

```bash
gh secret set E2E_TEST_TEACHER_PASSWORD          # reads the value from stdin
gh secret set FIREBASE_ADMIN_PRIVATE_KEY < key.pem
gh secret list                                   # names and dates only, never values
```

Values cannot be read back out of GitHub, so treat the local dotenv files as the
source of truth and GitHub as a write-only mirror.

Local equivalents live in `.env.test` (gitignored). Copy `.env.test.example` to
get started. In CI those dotenv files do not exist, so **every value must come
from the workflow `env:` block**, which is why this list matters.

## Which workflow needs what

| Workflow | Job | Needs |
|---|---|---|
| `ci.yml` | `E2E Smoke` | Supabase + Firebase web + Azure public IDs only. No test-account credentials, by design: the smoke suite has no auth so it cannot skip its way to green. |
| `e2e-full.yml` | `E2E shard N/4` | Everything below. |

## Status as of 2026-07-30

Every secret the E2E workflows reference is now set.

| Secret | Status | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | set | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | set | |
| `SUPABASE_SERVICE_ROLE_KEY` | set | |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | set | |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | set | |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | set | |
| `NEXT_PUBLIC_AZURE_AD_CLIENT_ID` | set | |
| `NEXT_PUBLIC_AZURE_AD_TENANT_ID` | set | |
| `E2E_TEST_STUDENT_EMAIL` / `_PASSWORD` | set | |
| `E2E_TEST_TEACHER_EMAIL` / `_PASSWORD` | set 2026-07-30 | From `.env.test`. Entra accounts, so the same values work against either environment. |
| `E2E_TEST_ADMIN_EMAIL` / `_PASSWORD` | set 2026-07-30 | Same account as the teacher, by design (`credentials.ts` falls back to it anyway). |
| `FIREBASE_ADMIN_CLIENT_EMAIL` / `_PRIVATE_KEY` | set 2026-07-30 | Service account for the **staging** project (`neram-staging`), taken from `.env.staging`. |
| `E2E_TEST_APP_EMAIL` / `_PASSWORD` | set 2026-07-30 | `e2etestingapp@neramclasses.com`, a Firebase email/password user created in `neram-staging` on 2026-07-30 (uid `N3oH7DOT5VMX3mnsAKJ5nUoKghD2`). |
| `E2E_TEST_PARENT_LOGIN_ID` / `_PASSWORD` | set 2026-07-30 | `e2e.parent`. Pinned to the same values `credentials.ts` already defaulted to. |
| `E2E_STAFF_SECRET` | set 2026-07-30 | Currently inert, see below. |
| `AZ_CLIENT_ID` / `AZ_CLIENT_SECRET` / `AZ_TENANT_ID` | set | Now actually passed to the suite, see below. |
| `RAZORPAY_KEY_ID` / `_SECRET` | **unset** | Referenced by `e2e-full.yml`. `.env.staging` holds `rzp_test_*` keys that would be safe to use. |

### Two naming bugs that made secrets do nothing

**`AZURE_AD_CLIENT_SECRET` was never read by any code.** `e2e-full.yml` used to
pass it, and this doc used to claim that leaving it unset meant "real Microsoft
OAuth unavailable". Neither was true. Graph app-only auth
(`packages/auth/src/graph.ts`, `apps/nexus/src/lib/graph-app-token.ts`) reads
`AZ_CLIENT_ID`, `AZ_CLIENT_SECRET` and `AZ_TENANT_ID`. Those three secrets were
already configured but were never passed to the test step. The workflow now
passes the `AZ_*` trio and no longer mentions `AZURE_AD_CLIENT_SECRET`. The name
still appears in `.env.example`, `.env.staging.example` and `turbo.json`
`globalEnv`, all of which are dead references worth cleaning up.

**`E2E_STAFF_SECRET` is read by nothing.** It appears only in
`.env.test.example`, the workflow and this doc. Its intended counterpart
`NERAM_STAFF_ADMIN_SECRET` is likewise read by no source file, though it is set
in `apps/marketing/.env.local`. So the old claim that "staff-admin specs
self-skip" without it was wrong: no spec consults it. The secret is set so the
value is in place, but it will change nothing until a spec or route actually
reads it.

**Parent credentials were never load-bearing either.** `PARENT_ACCOUNT` in
`tests/utils/credentials.ts` defaults to `e2e.parent` / `e2e-parent-pass1`, and
`injectParentAuthForPage` provisions the parent on the fly through
`/api/auth/parent/test-login` with `reset: true`. The parent specs skip on that
route being unavailable, not on a missing env var.

## Why unset secrets show up as passing runs

Most specs guard themselves with `test.skip(true, '<reason>')` when the
environment is not ready. There are around 240 such guards, so a run can report
success while executing very little. Filling in the secrets above is what
converts those skips into real coverage.

`tests/e2e/auth.setup.ts` used to degrade silently on top of that: it caught
sign-in failures, logged them, and saved whatever storage state the context held.
The `setup` project therefore passed while writing an empty
`tests/.auth/user.json`, and every downstream spec ran unauthenticated. It now
throws instead, and asserts that the saved state actually carries credentials.

## Student sign-in: resolved 2026-07-30

`neram-staging` used to have only Phone enabled as a sign-in provider, so
`E2E_TEST_APP_EMAIL` existed as a user but could not sign in, and `--project=setup`
failed with:

```
Firebase: Error (auth/operation-not-allowed).
```

Email/Password was enabled in the console on 2026-07-30 and the student setup now
passes, writing a storage state that really carries a Firebase session (2 cookies,
6 localStorage entries and 2 IndexedDB databases across ports 3010 and 3011).
Current providers on `neram-staging`: Email/Password, Phone, Google, all enabled.

If this regresses, the toggle is at **Firebase console > `neram-staging` >
Authentication > Sign-in method > Email/Password**. The state can be read without
the console using the Identity Toolkit Admin v2 API
(`GET admin/v2/projects/neram-staging/config`, `signIn.email.enabled`) with the
`FIREBASE_ADMIN_*` service account from `.env.staging`.

### Two things that were wrong in the student setup, now fixed

1. **The selector never matched.** It used
   `getByLabel('Email', { exact: true })`, but the field is a MUI `TextField`
   marked `required`, so MUI appends an asterisk span inside the `<label>` and the
   label's text content is `Email *`. The exact-match lookup timed out every time.
   It now targets `input[type="email"]` / `input[type="password"]`.
2. **The saved state could never contain a Firebase session.** Firebase Auth v9+
   persists to IndexedDB (`firebaseLocalStorageDb`), which
   `context.storageState()` does not capture by default. Even a perfect sign-in
   wrote `{"cookies":[],"origins":[]}`. The save now passes `indexedDB: true`,
   which needs Playwright >= 1.51. The root manifest declared `^1.42.0` while
   1.58.1 was installed, so a clean install could legally have resolved to a
   version without the flag and silently gone back to writing empty state. The
   declared floor is now `^1.51.0`.

### Why the `setup` project gets 180s

The 30s default was never survivable, but the reason is bigger than one slow
route. Student sign-in is not a single page load: the app bounces through
marketing's SSO check before the form is reachable.

```
3011/login  ->  3010/sso?redirect=...  ->  3011/login?sso=none
```

So the student setup cold-compiles three routes across two dev servers, and it
cannot start until both are up. Measured: 33s warm, 54s on a cold run, and over
120s when the servers were compiling under load, with `/sso` alone taking 31s.
`timeout: 180 * 1000` matches what the `webServer` entries already allow a dev
server to take, for exactly the same reason.

Both navigations in the setup also use `waitUntil: 'domcontentloaded'` rather
than the default `load`. Waiting for `load` waits on every subresource of a page
the flow is about to navigate away from, which is how a working teacher sign-in
burned the entire budget on a `page.goto` that had already arrived.

The practical consequence: **the student setup depends on the marketing app**, not
just the student app. If marketing is broken, student auth fails in a way that
looks nothing like a marketing problem.

## The root test layer could not import Supabase

Nine spec files plus two core helpers (`tests/utils/supabase.ts`,
`tests/utils/auth-helpers.ts`) import `@supabase/supabase-js` at the top level,
but the root `package.json` never declared it. pnpm only links declared
dependencies, so Node's walk-up from `tests/e2e/` found nothing:

```
require.resolve('@supabase/supabase-js', {paths: ['./tests/e2e']})
  -> MODULE_NOT_FOUND
```

A top-level import that cannot resolve fails the whole file at load, so those
specs could never run whatever the credentials said. Fixed by declaring
`@supabase/supabase-js: ^2.39.0` in root `devDependencies`, matching
`packages/database` exactly, so it resolves to the same 2.89.0 and does not
introduce a second copy. `playwright test --list` now collects 2420 tests in 137
files cleanly.

Watch for this shape generally: anything under `tests/` may only import packages
the **root** manifest declares. Importing something that merely exists inside an
app or package works on nobody's machine.

### A note on `tsc -p tsconfig.json`

It reports around 44,000 errors and is not a usable gate. Per-package
`pnpm type-check` is the real check. Do not read a clean grep of the root tsc
output as "the repo type-checks".

### Known gap: `E2E_PROD_SERVERS` is wired but unused

`playwright.config.ts` can serve any app from a production build via
`E2E_PROD_SERVERS`, and only `marketing` is safe for it (the others need
`next dev` for the test-login routes and to keep the PWA service worker off).
Neither `ci.yml` nor `e2e-full.yml` sets it, so today every app runs `next dev`
in CI and pays a cold compile. Left as-is deliberately: turning it on means
adding a `pnpm build:marketing` step, and the PR gate is meant to stay in single
digit minutes. The test budgets below assume dev servers.

### Verified 2026-07-30

| Check | Result |
|---|---|
| `--project=setup --project=smoke` | **8 passed**: teacher 44.3s, student 52.9s, nexus smoke 31.5s |
| `tests/.auth/user.json` contents | 2 cookies, 6 localStorage entries, 2 IndexedDB databases |
| `vitest run tests/guardrails` | **5 passed** |
| `playwright test --list` | 2420 tests in 137 files, no load errors |
| Production server on the Nexus port | fails with the PID and command line named |

The nexus smoke check took 31.5s, just past the old 30s default, so that budget
was load-bearing rather than cosmetic.

## The reused-server trap

`playwright.config.ts` sets `reuseExistingServer: !process.env.CI`, so off CI
Playwright adopts whatever already holds a port instead of starting its own
server. It only probes that the port answers, never that it answers with the
right kind of server.

This bit immediately after the Firebase fix: a leftover `next start -p 3012`
(a **production** build) was holding the Nexus port, and
`/api/auth/test-login` answers 404 by design when `NODE_ENV === 'production'`
([route.ts:59-61](../apps/nexus/src/app/api/auth/test-login/route.ts#L59-L61)).
The teacher setup, which had been passing, started failing with a bare 404.

Two mitigations are in place:

1. The 404 branch of `auth.setup.ts` now says the route is production-gated and
   shells out to name the process holding the port, so the message reads
   `Port 3012 is held by PID 37408: next start -p 3012` rather than leaving you
   to work out why a route vanished.
2. `auth.setup.ts` no longer hardcodes `localhost:3011` / `localhost:3012`. It
   uses `APP_URLS` from `tests/utils/credentials.ts`, the same resolution the
   specs use, so `E2E_APP_URL` and `E2E_NEXUS_URL` now steer setup too. Before
   this, overriding the URL moved the tests but left setup authenticating
   against the wrong server.

Practical note for local runs: a production build on an app port silently changes
test semantics. Check with
`curl -s -o /dev/null -w '%{http_code}' -X POST localhost:3012/api/auth/test-login -d '{}'`,
where 400 means a dev server and 404 means production.

### Firebase project alignment

The `FIREBASE_ADMIN_*` values are for `neram-staging`, so they only line up if
`NEXT_PUBLIC_FIREBASE_PROJECT_ID` and `NEXT_PUBLIC_FIREBASE_API_KEY` also point at
staging. GitHub will not reveal what those hold. If a run fails with a project
mismatch, re-set the whole group from `.env.staging`. Locally
`apps/app/.env.local` is already on `neram-staging`, which is how the diagnosis
above was made.
