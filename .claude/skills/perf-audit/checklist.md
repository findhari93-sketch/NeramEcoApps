# Performance, reliability and UX checklist

This file is parsed by `ledger.mjs`. Each check is a `### ID Title` heading followed by a backticked metadata line:

- `applies=` lists the unit kinds the check is run on: page, layout, route, meta, root, shared, pkg, config.
- `evidence=static` means the check is answered from code. It stays valid while the code is unchanged.
- `evidence=runtime ttl=N` means the check needs a measurement. It expires after N days, because the same code gets slower as tables grow.
- `v=` is the check's version. **Bump `v` whenever you change what a check asks.** Units already audited then rerun that check only. `verify` warns you if the wording changed and `v` did not.

Every finding records file:line and is labelled **measured** (you timed it, counted it or reproduced it) or **inferred** (read from code). A number you did not measure is written as "not measured".

## Evidence sources available in this repo

| Need | Tool |
|---|---|
| Slowest queries on prod | `mcp__supabase-prod__execute_sql`: `select query, calls, mean_exec_time, total_exec_time from pg_stat_statements order by total_exec_time desc limit 25` (read-only) |
| Index, RLS and FK advice | `mcp__supabase-prod__get_advisors` with type `performance`, and with type `security` |
| A query plan | `EXPLAIN (ANALYZE, BUFFERS)` on **staging only** (`mcp__supabase-staging__execute_sql`). Use plain `EXPLAIN` on prod. |
| API errors and latency | `mcp__supabase-prod__get_logs` (api, postgres). Vercel logs need the Vercel connector authorised, or `vercel logs` from `apps/<app>`. |
| Request counts and waterfall | A HAR or DevTools Network capture from the user. Authenticated Playwright is blocked by the Entra MFA wall, so do not burn time on it. |
| First-load JS per route | `pnpm build:nexus` output, **only** after confirming nothing listens on ports 3010 to 3013 (a build clobbers a running dev server's `.next`). |
| Full React error text | `pnpm dev:nexus`, then a **hard load** of the route. The dev overlay prints the whole hydration diff. |

## React production errors (installed React 18.3.1)

| Code | Meaning | What it tells you |
|---|---|---|
| #418 | Hydration failed: the first client render does not match the server HTML | A component rendered something different on the client than on the server |
| #423 | An error while hydrating, outside any Suspense boundary | React threw away the server HTML and re-rendered the **whole root** on the client, remounting every provider and effect |
| #425 | Text content does not match the server HTML | Usually a date, a number format or a count |
| #422 | Error while hydrating a Suspense boundary | Only that boundary re-rendered on the client, which is the contained version of #423 |

Hydration runs only on a hard load. A mismatch will not reproduce by soft-navigating to the route. Re-check the code against the installed React version (`apps/<app>/node_modules/react/package.json`) if it has moved on.

## ARCH: architecture

### ARCH-1 Architecture map is current
`applies=config evidence=static v=1`

Look for changes to any of the following:
- the framework, React, MUI or SWR versions;
- the router;
- the layout and provider tree;
- the data layer (fetch wrapper, SWR config, device caches);
- the auth flow;
- middleware;
- the runtime and region;
- polling.

When the map changes, update the app notes file (`nexus-notes.md`).

Done when the notes match the code.

## HYD: hydration

### HYD-1 Browser-only state read during the first render
`applies=page,layout,shared,pkg evidence=static v=1`

Look for these being read in render, in a `useState`/`useReducer` initializer, or in `useMemo` inside a component the server also renders:
- `window`, `document`, `localStorage`, `sessionStorage`, `navigator`, `matchMedia`, `location`;
- device caches (SWR persistent cache, auth or boot payload caches);
- MSAL account state;
- `typeof window !== 'undefined'` branches.

These render different trees on the server and the client.

Done when each such read is either in an effect, behind a mounted flag, or in a subtree that is verified client-only (for example `dynamic(..., { ssr: false })` with a stated reason). Suppressing it does not count.

### HYD-2 Time, locale or randomness in render
`applies=page,layout,shared,pkg evidence=static v=1`

Look for these in render output:
- `new Date()`, `Date.now()`;
- `toLocaleString`/`toLocaleDateString`, `Intl` without an explicit `timeZone`;
- relative times ("2 min ago");
- `Math.random`, `crypto.randomUUID`;
- ids generated without `useId`.

The server runs in UTC and the browser in IST. Done when the output is identical on both sides or is computed after mount.

### HYD-3 Invalid HTML nesting
`applies=page,layout,shared,pkg evidence=static v=1`

Look for:
- a block element inside a `<p>`, for example MUI `Typography` (which renders `p` by default) wrapping a `Box`, `div`, `Chip` or `List`;
- `<a>` inside `<a>`, for example a `Link` wrapping a card that holds a link;
- `<button>` inside `<button>`;
- `<div>` inside `<tbody>`/`<tr>`;
- `<li>` outside a list.

The browser repairs this markup, which breaks hydration. Done when every nesting on the unit is valid.

### HYD-4 Suspense containment
`applies=page,layout evidence=static v=1`

When a mismatch sits outside every Suspense boundary, React re-renders the whole root (#423). Every provider remounts, every effect and poller restarts, and in-flight requests are lost.

Look for large client subtrees with no `<Suspense>` boundary, in particular data-heavy pages under the shared shell.

Done when a hydration failure in page content cannot take the shell down with it.

## NAV: navigation

### NAV-1 Soft navigation behaves like a hard load
`applies=page,layout,shared evidence=static v=1`

Look for:
- state initialised only on mount that depends on route params: `useState(initialFromParams)` not reset when `[id]` changes, refs set once, `useEffect(..., [])` reading params;
- module-level singletons that remember the previous route;
- effects that assume a fresh page.

Done when navigating A to B to A shows correct data with no refresh.

### NAV-2 Waiting for an event that already happened
`applies=page,layout,shared evidence=static v=1`

Look for loading that ends only when an event or listener fires. For example: an auth-ready event, `tokenReady` flipping, or a message from a provider. On soft navigation that event fired before this page mounted, so the page waits forever.

Also look for effects that early-return when a dependency is not ready and whose dependency list omits that dependency, so they never run again.

This is the classic "stuck until refresh".

Done when every wait reads the current state, not a transition.

### NAV-3 Back, forward and restored pages
`applies=page evidence=static v=1`

Look for:
- stale lists after going back (an SWR key that ignores filters);
- a lost scroll position;
- dialogs reopening from URL state;
- data mutated elsewhere and shown stale.

Done when back and forward show current data without errors.

### NAV-4 Provider and poller lifetime across route groups
`applies=layout evidence=static v=1`

Moving between route groups, for example `(teacher)` and `(student)`, remounts their layouts. Look for the providers, pollers and caches that restart, and the requests each remount fires.

Done when a remount costs only what it must.

## LOAD: loading states

### LOAD-1 Every async view has loading, empty, error and retry
`applies=page,shared evidence=static v=1`

Look for:
- `setLoading(true)` with no `finally`;
- errors caught and dropped, leaving the skeleton up for ever;
- an empty result rendered as a skeleton;
- no retry control.

A skeleton with no way out is the most common infinite-loading bug.

Done when every async region has all four states, and a failed request ends in a message with a retry.

### LOAD-2 Non-critical data never blocks the screen
`applies=page,layout,shared evidence=static v=1`

Look for these gating the page or the shell:
- a notification count;
- badges;
- stage facts;
- analytics;
- feature flags;
- a global `loading` that waits on all of them.

Done when the primary content renders as soon as its own data arrives, and the optional parts fill in or fail on their own.

### LOAD-3 Skeleton shape and time limit
`applies=page,shared evidence=static v=1`

Look for skeletons that do not match the final layout (they cause layout shift, CLS), and skeletons with no timeout or error path.

Done when the skeleton matches the final layout and always resolves to content, empty or error.

## ERR: errors

### ERR-1 Route handlers return honest status codes
`applies=route evidence=static v=1`

Look for:
- auth failures that return 500 (a known Nexus pattern: `httpStatusForError` exists but many routes do not use it);
- errors swallowed into `200` with empty data;
- `catch` blocks that hide a `PostgrestError`, which is not an `Error` instance.

Done when 401, 403, 404, 400 and 500 are each returned where they belong.

### ERR-2 Clients survive non-2xx, network failure and timeouts
`applies=page,shared,pkg evidence=static v=1`

Look for:
- `res.json()` called without checking `res.ok`;
- no handling of `524`, `ERR_CONNECTION_CLOSED` or abort;
- unhandled promise rejections;
- expired tokens retried for ever, or never.

Done when each failure mode ends in a visible, recoverable state.

### ERR-3 Error boundaries exist and reset
`applies=layout evidence=static v=1`

Look for:
- route groups with no `error.tsx`;
- a boundary with no `reset`;
- a missing `global-error.tsx`;
- a boundary that loses the shell.

Done when a render error on one page leaves the navigation usable.

### ERR-4 Supabase results are checked
`applies=route,shared,pkg evidence=static v=1`

Look for:
- `{ data }` destructured without `error`;
- `.single()` on a result that can be empty;
- inserts and updates whose error is ignored;
- a `PostgrestError` rethrown as if it were an `Error`.

Done when every query's error path is handled.

## API: route handler performance

### API-1 Where the handler spends its time
`applies=route evidence=static v=1`

Break the handler into steps: auth verify, user lookup, each query, each external call, and the transform. Look for sequential awaits that are independent and could run in `Promise.all`, work repeated per request, and loops that issue queries (N+1).

Done when the step list and the fix for each slow step are written down.

### API-2 Measured latency
`applies=route evidence=runtime ttl=30 v=1`

Get p50 and p95 from logs, or time the handler locally against staging. Mark 524s and timeouts. Done when numbers are recorded, or the report says "not measured" and why.

### API-3 Payload and over-fetching
`applies=route evidence=static v=1`

Look for:
- `select('*')`;
- columns the client never reads;
- unbounded lists with no `limit` or range;
- nested selects that pull whole related tables;
- a count computed by fetching rows.

Done when each response returns only what the screen uses.

### API-4 External calls have deadlines
`applies=route,shared evidence=static v=1`

Look for these without `AbortSignal.timeout`:
- Microsoft Graph and Teams calls;
- Gemini and other AI calls;
- Resend;
- `fetch` to any third party.

Also look for missing `maxDuration` on routes that legitimately run long, and for work that could move to a cron or a queue. Cloudflare cuts a proxied request at 100s, which shows up as a 524.

Done when no request can hang past its deadline.

### API-5 Per-request auth cost
`applies=route,shared evidence=static v=1`

Look for:
- token verification that refetches signing keys (JWKS) per request;
- a user row looked up several times per request;
- a role or capabilities lookup repeated per call.

Done when each request resolves its user once, and the verification material is cached.

## DB: database

### DB-1 Query shape
`applies=route,shared,pkg evidence=static v=1`

Look for:
- filters and orders on columns that are probably unindexed;
- `count: 'exact'` on large tables, where `head: true` or an estimate would do;
- `ilike '%x%'` scans;
- a JSONB key filter with no GIN index;
- `order` with no `limit`;
- N+1 queries.

Done when each hot query is listed with the index it needs.

### DB-2 Plans and index evidence
`applies=route,pkg evidence=runtime ttl=30 v=1`

For the hot queries of this unit, run:
- `pg_stat_statements` (mean and total time);
- the Supabase performance advisors (unindexed foreign keys, unused or duplicate indexes);
- a staging `EXPLAIN ANALYZE`.

Done when each slow query has a plan and a recommended index or rewrite. **Recommend DB changes; do not apply them without the user's approval.**

### DB-3 RLS evaluation cost
`applies=route,pkg evidence=runtime ttl=30 v=1`

Look for policies that call functions per row (`auth.uid()` not wrapped as `(select auth.uid())`), policies that join large tables, and routes that could use the service client with an explicit check instead. Read the policies in `supabase/migrations/` and the advisor output.

Done when the RLS cost on the unit's hot tables is known. Never disable RLS.

## DUP: duplicate and redundant requests

### DUP-1 Request count per screen
`applies=page,layout evidence=static v=1`

List every request that fires on a hard load of this screen and on a soft navigation to it: shell requests plus page requests. Each endpoint should fire once.

Done when you have a table of endpoint, calls, expected calls and cause. Counts from a HAR are measured; counts read from code are inferred.

### DUP-2 Effect dependencies that refire
`applies=page,layout,shared,pkg evidence=static v=1`

Look for:
- effects keyed on a callback or object that is recreated every render (this loops; a test out-of-memory is the tell);
- missing dependencies masked by a disabled lint rule;
- effects that fetch on every render.

Done when every fetching effect runs only when its inputs change.

### DUP-3 One source per piece of data
`applies=page,layout,shared evidence=static v=1`

Look for the same endpoint fetched by several components, for example `/api/auth/me` from the gate, the guard and the auth hook. Also look for raw `fetch` where the app's SWR hook would dedupe, and for SWR keys that differ only by accident.

Done when shared data has one owner and the other readers subscribe to it.

### DUP-4 Polling discipline
`applies=layout,shared,pkg evidence=static v=1`

For each poller, check:
- its interval;
- whether it pauses when the tab is hidden;
- whether it backs off after errors;
- whether it runs as a single instance per app;
- whether it skips when a request is already in flight;
- whether it stops on sign-out.

Done when each poller is justified and bounded, and an erroring endpoint cannot be hammered every interval.

## NET: network waterfall

### NET-1 Chains that could be parallel
`applies=page,layout,shared evidence=static v=1`

Look for request chains, where each request waits for the one before: auth, then me, then classrooms, then page data, then details. Look for requests that wait on data they do not need, and for several page requests that one server call could serve.

Done when the critical path is the shortest the data allows.

### NET-2 Requests the current screen does not need
`applies=page,shared evidence=static v=1`

Look for:
- data loaded for hidden tabs, closed dialogs or collapsed panels on mount;
- prefetches that are never used;
- the same list fetched again for a detail view.

Done when every request on load serves what is visible.

## AUTH: authentication

### AUTH-1 Token acquisition is cached and coalesced
`applies=shared,pkg evidence=static v=1`

Look for:
- `acquireTokenSilent` per request with no reuse;
- parallel requests each triggering a token refresh;
- MSAL initialised more than once;
- interaction redirects started from inside effects.

Done when concurrent callers share one token acquisition.

### AUTH-2 Fetches wait for the right signal
`applies=page,layout,shared evidence=static v=1`

Look for:
- fetches gated on `authLoading`, which serialises them, instead of `tokenReady`;
- fetches that fire before a token exists and are never retried;
- guards that render nothing while they check, instead of the shell;
- redirect loops.

Done when data requests start as soon as a token can be issued, and only then.

### AUTH-3 Session expiry mid-use
`applies=shared,pkg evidence=static v=1`

Look for what happens on a 401 after the page has been open for an hour. A silent token reacquire should happen once, followed by a sign-in prompt, never an endless skeleton or a silent empty list.

Done when an expired session produces a recoverable prompt.

## RND: rendering cost

### RND-1 Context values are stable
`applies=layout,shared,pkg evidence=static v=1`

Look for providers that pass a new object or array on every render to many consumers, and for one big context that mixes fast-changing and slow-changing values.

Split or memoise only where the consumers are many and the re-renders are real. Done when the providers under the shell do not re-render the whole app on every tick.

### RND-2 Oversized components and lifted state
`applies=page,shared evidence=static v=1`

Look for:
- components over about 800 lines;
- dozens of `useState` calls;
- keystroke state held at page level, so the whole page re-renders per character;
- derived state kept in state.

Done when hot interactions re-render only the part that changes.

### RND-3 Expensive work in render
`applies=page,shared evidence=static v=1`

Look for sorting, filtering or grouping of large arrays, JSON parsing, markdown or KaTeX rendering, and date formatting in loops. Check these on every render, without memoisation, and only where the data can be large.

Do not add `useMemo`/`useCallback` without evidence that the work is costly. Done when heavy work runs once per real input change.

## TBL: large data

### TBL-1 Rows downloaded vs rows shown
`applies=page,route evidence=static v=1`

Look for a list endpoint that returns every row, with the client filtering and paginating. Flag any list that can exceed about 200 rows (students, questions, submissions, attendance) and does not paginate or filter on the server.

Done when large lists move only the rows that are shown.

### TBL-2 Grid and list rendering
`applies=page,shared evidence=static v=1`

Look for:
- long lists without virtualisation;
- `DataGrid` column definitions recreated every render;
- row components that re-render when any other row changes;
- images in lists without sizes or lazy loading.

Done when scrolling and editing a row stay smooth at realistic volumes.

## BND: bundle

### BND-1 First-load JS per route
`applies=page evidence=static v=1`

Read the route's first-load JS from `next build` output (see Evidence sources for the build precondition), and flag routes over about 300 kB. When no build was run, mark it "not measured" and use BND-2 to infer.

Done when heavy routes are named along with what makes them heavy.

### BND-2 Heavy libraries loaded eagerly
`applies=page,layout,shared evidence=static v=1`

Look for these imported at module top level:
- editors;
- charts;
- KaTeX and markdown;
- PDF and XLSX;
- canvas and drawing libraries;
- video players;
- the full icon set.

A library only a dialog or tab needs can be a `dynamic()` import loaded on open. Also check whether a layout pulls a library into every route.

Done when rarely used heavy code loads on demand.

### BND-3 Client boundary placement
`applies=page,layout,shared evidence=static v=1`

Look for:
- `'use client'` at the top of large trees that render mostly static content;
- server-only modules (admin clients, secrets) reachable from client code;
- large constant data bundled into the client.

Done when the client boundary sits as low as the interactivity allows.

## CACHE: caching

### CACHE-1 Route handler caching is deliberate
`applies=route evidence=static v=1`

Check each route's caching:
- whether it is dynamic or static;
- its `revalidate` setting;
- whether per-user data has `Cache-Control: private, no-store`;
- whether shared, non-sensitive data is cached (`s-maxage`, `unstable_cache`);
- whether `force-dynamic` is used where it is not needed.

Done when each response's caching matches who may see it and how often it changes. Never cache per-user or security-sensitive data publicly.

### CACHE-2 Client cache is correct and bounded
`applies=layout,shared,pkg evidence=static v=1`

Look for:
- the SWR `dedupingInterval` replaying reads made before a write;
- a persistent device cache not keyed by account and build;
- a device cache painted on the first render (see HYD-1);
- data the viewer can change served from cache after they change it.

Done when cached reads are safe and invalidate after writes.

### CACHE-3 Repeated lookups inside one request
`applies=route,shared evidence=static v=1`

Look for the same row or config fetched several times within one request or one render pass. `React.cache`, a request-scoped memo, or a TTL cache fixes it.

Done when each request fetches each fact once.

## MEM: resources

### MEM-1 Effects clean up after themselves
`applies=page,layout,shared,pkg evidence=static v=1`

Look for intervals, timeouts, listeners, observers, Supabase realtime channels, WebSockets and media streams with no cleanup, and fetches with no `AbortController` on unmount.

Done when unmounting releases everything the effect opened.

### MEM-2 Module-level caches are bounded
`applies=route,shared,pkg evidence=static v=1`

Look for module-level `Map`/object caches with no size limit or TTL, caches keyed by user with no eviction, and listeners attached at module load.

Done when every long-lived cache has a bound.

## RACE: concurrency

### RACE-1 A stale response cannot overwrite a newer one
`applies=page,shared evidence=static v=1`

Look for fetches keyed on params, filters or search with no abort and no request identity check. The classic case: open student A, then B, and A's response lands last.

Also look for `setState` after unmount.

Done when only the latest request can write state.

### RACE-2 Mutations are single-flight
`applies=page,shared evidence=static v=1`

Look for:
- double submits (the button stays enabled while saving);
- optimistic updates with no rollback;
- `mutate` ordering that shows old data after a save;
- autosave racing a manual save.

Done when a slow network cannot duplicate or reorder writes.

## UXP: perceived performance and accessibility of async UI

### UXP-1 Immediate feedback
`applies=page,shared evidence=static v=1`

Look for clicks with no pressed, disabled or progress state; actions over 1s with no progress indicator; and dead clicks while data loads.

Done when every action acknowledges within about 100ms and shows progress when slow.

### UXP-2 Async content is accessible
`applies=page,shared evidence=static v=1`

Look for:
- loading regions without `aria-busy`;
- errors that are not announced (no live region);
- focus lost after a dialog closes or the route changes;
- animations that ignore `prefers-reduced-motion`.

Done when a keyboard or screen-reader user can follow the loading and error flow.

### UXP-3 Phone layout of the audited screen
`applies=page evidence=static v=1`

At 375px, look for horizontal scroll, primary controls smaller than 44px, and content hidden behind fixed bars. For fixes, run `/ui-ux-pro-max`, which is mandatory for UI work in this repo.

Done when the screen works one-handed on a phone.

## OBS: observability

### OBS-1 Slow and failing requests are visible
`applies=config,route evidence=static v=1`

Look for:
- `Server-Timing` or structured duration logs on hot routes;
- a request id carried through to logs;
- client error capture;
- Web Vitals reporting;
- slow-query visibility.

Nothing sensitive (tokens, emails, phone numbers) may be logged.

Done when the next production slowdown can be located without guessing.

## PROD: production differences

### PROD-1 Runtime and platform configuration
`applies=config,route evidence=static v=1`

Check:
- the function region against the database region;
- `maxDuration` on long routes;
- the Node runtime version and the known crashes on it;
- the edge vs node runtime choice;
- whether a Cloudflare proxy sits in the request path (a 524 means it does);
- environment variables that differ between dev and prod.

Done when every production-only failure mode on the unit has been considered.

### PROD-2 Production-only client behaviour
`applies=config,layout evidence=static v=1`

Look for:
- service-worker caching (next-pwa) serving stale shells or chunks after a deploy;
- a build stamp not busting persistent caches;
- chunk-load errors after a deploy;
- minified errors that hide the cause.

When dev and prod differ, reproduce with `next build && next start` under the build precondition.

Done when a fresh deploy cannot strand a user on an old shell.
