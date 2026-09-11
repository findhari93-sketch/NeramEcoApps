# Nexus Students Phase 3 (create Microsoft accounts from Nexus) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a manager or admin create a student's @neramclasses.com Microsoft account from the Students screen (licensed, attached to the student's record, enrolled, added to the class Team), reset a student's password, and hand over the login with Copy or WhatsApp, shown once and never stored.

**Architecture:** Pure rules (`student-account-rules.ts`) decide login IDs, passwords, the WhatsApp message, Azure readiness and license detection. Graph calls live in a Nexus-local module (`entra-accounts.ts`) that never throws. The create and reset flows are ordered in `student-account-provisioning.ts` behind two ports, so the ordering is unit tested with fakes; `student-account-store.ts` supplies the real Supabase and Graph ports. Four thin routes, gated by a new capability, and three UI pieces (form, share card, reset sheet) plug into the Phase 2 Add sheet, row menu and profile header.

**Tech Stack:** Next.js 14 App Router route handlers, Microsoft Graph v1.0 app-only (client credentials), Supabase service client, MUI via `@neram/ui`, Vitest + React Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-10-nexus-students-management-design.md` (Phase 3, sections 3.0 to 3.4)

**Status:** executed inline on 2026-09-11. The code at the paths below is the implementation; each task lists the interfaces and the tests that pin them.

## Global Constraints

- Scope: `apps/nexus/**` and `tests/e2e/**` only. No `packages/` edits (a packages change redeploys all four apps). No migration and no new env vars: `nexus_settings` already exists, `AZ_CLIENT_ID/SECRET/TENANT_ID` are reused.
- Azure (once, by an admin, Application permissions with admin consent): `User.Create`, `LicenseAssignment.ReadWrite.All`, `LicenseAssignment.Read.All`, `User-PasswordProfile.ReadWrite.All`, optional `User-Mail.ReadWrite.All`, and `GroupMember.ReadWrite.All` only if students are licensed through a group. Broader roles already granted (`User.ReadWrite.All`, `Directory.ReadWrite.All`) count.
- Capability `structure.student.account`: managers and admins, never teachers.
- The temporary password is returned once with `Cache-Control: no-store`. Never persisted, never in the audit trail, never logged; request bodies carrying it are never logged.
- Never mint a second `users` row: an account is created for the record staff picked, or through `reconcileMsIdentity`, and the same-student question is asked server-side before anything is created.
- A license or Team failure keeps the account; nothing is deleted automatically.
- No em dashes or double dashes in user-visible copy. 48px touch targets, one field per row at 375px, 16px input text.
- E2E and manual checks never create an account or reset a password: local dev points at the production database and the real tenant.
- Unit tests: `pnpm test:run <path>` from the root. Type-check and lint without pipes.

## File Map

| File | Action | Responsibility |
|---|---|---|
| `apps/nexus/src/lib/student-account-rules.ts` (+ test) | Create | Login IDs, temp passwords, phones, share message, WhatsApp URL, token roles, readiness, license detection, SKU names, settings normalisation |
| `apps/nexus/src/lib/entra-accounts.ts` (+ test) | Create | Graph: roles, UPN availability, create user, assign license, group add, otherMails, reset password, subscribed SKUs, license states, UPN read |
| `apps/nexus/src/lib/student-account-defaults.ts` | Create | Read/save `nexus_settings['student_account_defaults']`; detect the student license from enrolled students |
| `apps/nexus/src/lib/student-account-provisioning.ts` (+ test) | Create | `createStudentAccount` and `resetStudentPassword` ordering behind ports |
| `apps/nexus/src/lib/student-account-store.ts` | Create | Real ports: Supabase records, candidates, enrollment, classification, Teams, audit; Graph port |
| `apps/nexus/src/lib/staff-capabilities.ts` (+ test) | Modify | `structure.student.account` in the union, `MANAGER_EXTRA`, `ALL_CAPABILITIES` |
| `apps/nexus/src/app/api/students/accounts/readiness/route.ts` | Create | GET setup state and license |
| `apps/nexus/src/app/api/students/accounts/preview/route.ts` | Create | POST login ID suggestion, availability, candidates, record contact |
| `apps/nexus/src/app/api/students/accounts/route.ts` | Create | POST create |
| `apps/nexus/src/app/api/students/[id]/reset-password/route.ts` | Create | POST reset |
| `apps/nexus/src/components/students/AccountShareCard.tsx` (+ test) | Create | Login ID and password, Copy, Copy message, Send on WhatsApp, steps, close guard; `UnsharedPasswordDialog` |
| `apps/nexus/src/components/students/CreateAccountForm.tsx` (+ test) | Create | Readiness gate, form, live login ID, license line, duplicate question, submit, result |
| `apps/nexus/src/components/students/ResetPasswordSheet.tsx` | Create | Confirm, reset, share card |
| `apps/nexus/src/components/students/AddStudentSheet.tsx` (+ test) | Modify | Creator as render function, `createOnly`, `title`, `guardClose` |
| `apps/nexus/src/components/students/profile/ProfileHeaderCard.tsx` | Modify | Create Microsoft account / Reset password action |
| `apps/nexus/src/app/(teacher)/teacher/students/page.tsx` | Modify | Row menu actions, sheets |
| `apps/nexus/src/app/(teacher)/teacher/students/[id]/page.tsx` | Modify | Profile entry points and sheets |
| `tests/e2e/students-accounts-nexus.spec.ts` | Create | Gate, validation, shapes, sheet and menu at 375px, read-only |

---

### Task 1: Account rules

**Files:** `apps/nexus/src/lib/student-account-rules.ts`, `student-account-rules.test.ts`

**Produces:**

```ts
export const STUDENT_ACCOUNT_DOMAIN = 'neramclasses.com';
export const DEFAULT_USAGE_LOCATION = 'IN';
export function normalizeUsername(raw: string | null | undefined): string;
export function suggestUsername(firstName: string | null | undefined, lastName: string | null | undefined): string; // First_Last
export function isValidUsername(username: string | null | undefined): boolean;
export function usernameWithSuffix(base: string, attempt: number): string; // base, base2, base3
export function upnFor(username: string, domain?: string): string;
export type RandomInt = (maxExclusive: number) => number;
export function generateTempPassword(randomInt: RandomInt): string; // 12 chars, all classes, no 0 O o 1 l I * _ ~ `
export function normalizeIndianMobile(raw: string | null | undefined): string | null; // 10 digits
export type ShareKind = 'welcome' | 'reset';
export function buildLoginMessage(input: { kind: ShareKind; firstName: string | null | undefined; upn: string; password: string }): string;
export function whatsAppShareUrl(message: string, phone?: string | null): string;
export type AccountAbility = 'create' | 'license' | 'group_license' | 'seats' | 'reset_password' | 'other_mails';
export const ABILITY_ROLES: Record<AccountAbility, readonly string[]>;
export function decodeTokenRoles(token: string | null | undefined): string[];
export function readinessFromRoles(roles: readonly string[], licenseMode?: 'direct' | 'group'): AccountReadiness;
export interface LicenseState { skuId: string; groupId: string | null }
export function pickMostCommonLicense(perStudent: readonly (readonly LicenseState[])[]): DetectedLicense | null;
export function skuDisplayName(partNumber: string | null | undefined): string;
export function freeSeats(sku: { enabled: number; consumed: number }): number;
export function describeLicenseFailure(raw: string | null | undefined): string | null;
export interface StudentAccountDefaults { domain; usage_location; sku_id; sku_part_number; license_mode: 'direct' | 'group'; license_group_id }
export function normalizeAccountDefaults(raw: unknown): StudentAccountDefaults;
export function isUuid(value: unknown): value is string;
```

- [x] Tests (22): First_Last for the hand-made accounts (Dhisha_Haribabu, Afrin_Banu, Anuvika_Stalin); accents and punctuation; normalisation and validity; suffix within 64 chars; 300 generated passwords all satisfy the policy; injected randomness only; phone formats; welcome and reset messages exactly as the spec, no dashes; addressed and unaddressed WhatsApp URLs; token role decoding; least-privilege missing list; broader role accepted; group licensing asks for GroupMember.ReadWrite.All; most common license keeps its group, ties prefer direct; SKU names and seats; license failure text; settings fallbacks.

### Task 2: Graph calls

**Files:** `apps/nexus/src/lib/entra-accounts.ts`, `entra-accounts.test.ts` (node environment, `@neram/auth` and `fetch` mocked)

**Produces:** `GraphResult<T> = { ok: true; value: T } | { ok: false; status: number; error: GraphErrorInfo }`, and `readAppRoles`, `isUpnAvailable(upn)`, `createEntraUser(input)` (accountEnabled, usageLocation, mobilePhone, `forceChangePasswordNextSignIn: true`), `isAlreadyExistsError(error)`, `assignLicense(userId, skuId, retry?)` (retries 404 while a new account appears), `addUserToGroup(groupId, userId, retry?)` (already a member counts), `setOtherMails`, `resetEntraPassword`, `listSubscribedSkus`, `readLicenseStates`, `readUserPrincipalName`. A 403 names the exact permission in `error.fix`.

- [x] Tests (14): roles without a Graph call; token failure reported; 404 means free; network error never throws; create body; 403 names User.Create; already-exists recognised; 404 retry then licensed; no-seats message; group already-member; reset body and permission; SKU mapping drops suspended; license states keep the group.

### Task 3: Ordering behind ports

**Files:** `apps/nexus/src/lib/student-account-provisioning.ts`, `student-account-provisioning.test.ts`

**Produces:** `AccountGraphPort`, `AccountStorePort`, `ResetPasswordPorts`, `createStudentAccount(graph, store, input)` returning `invalid | conflict (record_missing, not_a_student, already_linked, upn_taken) | possible_duplicate | graph_failed | created { upn, password, msOid, userId, firstName, phone, steps }`, and `resetStudentPassword(ports, { userId, password, actorId })` returning `conflict (record_missing, not_a_student, no_microsoft) | graph_failed | reset { upn, password, firstName, phone }`.

Order: validate, pick or question the record (no Graph call before this), UPN free, create, license (failure keeps going), otherMails, attach or reconcile (hints dropped after "a different student"), fill contact blanks, enroll, classify (failure keeps the enrollment), Team, audit without the password.

- [x] Tests (19): full order; audit never holds the password; duplicate question stops before Graph; confirmNew skips question and hints; attach links the picked record; refusal of missing, staff and already-linked records; UPN taken by lookup or by create; Azure refusal stops; license failure carries on; group licensing; no license; record failure stops after the account; enroll failure skips the Team; classify failure keeps enrollment; Team reason passed on; bad input; reset success, refusals and Azure failure.

### Task 4: Settings, store and capability

**Files:** `student-account-defaults.ts`, `student-account-store.ts`, `staff-capabilities.ts` (+ test)

- Defaults: `readStudentAccountDefaults(supabase)` never throws; `saveStudentAccountDefaults(supabase, defaults, actorId)`; `detectStudentLicense(supabase)` samples the ten most recently enrolled students with a Microsoft account.
- Store: candidates = this class's students without a Microsoft account plus non-staff records outside the class matching the phone or personal email, run through `findIdentityCandidates`; `linkMicrosoft` and `createOrMatchRecord` reuse the Phase 1 directory store (so `student_profiles.ms_teams_email` and the ms_oid history row are written); `fillContact` fills blanks and writes the globally unique phone separately; `enroll` uses `enrollUser` (catch-up backlog) and reactivates an inactive enrollment; `classify` writes stage, exam year, `lead_profiles.target_exam_year` and classification events; `syncTeams` uses `addStudentToClassroomTeams`.
- [x] Capability test: teacher false, manager and admin true; registry integrity still holds.

### Task 5: Routes

- `GET /api/students/accounts/readiness`: `{ ready, canResetPassword, connection, missing, optionalMissing, domain, license: { skuId, skuPartNumber, name, mode, groupId, free, source } | null, skus }`, no-store.
- `POST /api/students/accounts/preview`: `{ username, upn, valid, available, availabilityError, candidates, record }`; tries the suggestion then 2 to 6.
- `POST /api/students/accounts`: validates phone, class, exam year (not before the current batch) and the classroom (exists, not archived) before any Graph call; license from the body or the saved default; the license that worked becomes the default. 201 created, 409 `possible_duplicate` with candidates, 409 with `code`, 502 for Graph with `fix`, 400 invalid. `maxDuration = 60`, no-store.
- `POST /api/students/[id]/reset-password`: 200 reset, 404/409 with `code`, 502 Graph, no-store.

### Task 6: Screens

- `AccountShareCard`: login ID and password (monospace, copy buttons 48px), Send on WhatsApp (`#075E54`, addressed when the number is known), Copy message, steps with text status, "Shown only once", Done asks before closing when nothing was copied or sent. `UnsharedPasswordDialog` for swipe, backdrop and X.
- `CreateAccountForm`: readiness skeleton; setup notice naming the missing permissions with Check again and Add an existing Microsoft account instead; form with First name, Last name, Mobile (+91, numeric), Personal email, Class, Exam year (current and later only), Section; Login ID card with Edit and live availability; license line or selector; same-student card (Yes, same student / No, a different student); one Create account button; progress copy; result share card.
- `ResetPasswordSheet`: face and name, consequence copy, Reset password, share card.
- `AddStudentSheet`: `createAccount` may be a render function receiving `showExisting`; `createOnly` hides tabs; `guardClose` asks before closing.
- [x] Tests: share card (4), create form (5: setup notice, full create, same-student attach, bad phone blocked, exam year floor), add sheet (7).

### Task 7: Entry points

- Roster row menu: Create Microsoft account (no Microsoft account; opens the sheet in create-only mode for that record) or Reset password (has one), for `structure.student.account`, placed before Remove from class.
- Add student sheet Create tab uses the form; its setup notice links to the Existing tab.
- Profile header: the same single action on desktop and in the mobile menu. The profile reloads only after Done, because reloading swaps the page for its skeleton and would take the password off screen.

### Task 8: Verification

- [x] `pnpm test:run` for every new test file; full `apps/nexus` suite.
- [x] `pnpm --filter @neram/nexus type-check` and `lint` (clean for these files).
- [x] E2E at 375px, read-only, against the local dev server (staging database): `students-roster-nexus`, `students-accounts-nexus`, `students-search-nexus` and `student-stage-nexus-mobile` all pass (23 tests, then 13 and 14 on re-runs after the design review fixes).
- [x] Readiness probe, 2026-09-11: `ready: true`, `canResetPassword: true`, only `LicenseAssignment.Read.All` missing (seat counts and the license picker), and no student license detected from the staging roster.
- [ ] Before first real use: confirm the form's license line names the student license on production. Granting `LicenseAssignment.Read.All` adds seat counts and the picker.
- [ ] Only on the user's go: one live create with a throwaway student, then delete that Entra user and `users` row.

## Design review fixes (after screenshots at 375px and 1280px)

- The Needs attention card starts folded on phones (a remembered choice wins), because four open rows filled the first screen.
- The Existing tab reads "Existing account" on phones; the accessible name stays "Existing Microsoft account".
- Phone and email errors show once the field is left, not while typing.
- The roster search is the shared `PeopleSearchField` (one-tap clear, Escape clears, result count announced), and matched letters in names are marked with `MatchHighlight`.
