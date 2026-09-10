# Design: Nexus Students page fixes, redesign, and Microsoft account creation

**Status:** Approved 2026-09-10. Implementation starts with Phase 1.
**App:** `apps/nexus` only. No `packages/` edits, so a deploy touches one Vercel project.

## Context

The Nexus teacher Students page (`/teacher/students`) is where staff find a student and act on them. Six problems were reported. Every root cause below was verified against code and production data on 2026-09-10.

| # | Problem | Root cause |
|---|---|---|
| 1 | Searching "disha" shows nothing | The page filter is a plain substring match (`apps/nexus/src/app/(teacher)/teacher/students/page.tsx` lines 321-325). The student is "Dhisha Haribabu"; "disha" is not a substring of "dhisha". Search is also scoped to the active segment pill. |
| 2 | Afrin appears twice (Gmail + org) | 13 Aug: paid through the marketing link with Gmail, which enrolled a Gmail-only record. 14 Aug: someone pressed Add under "Not yet in class" for `Afrin_banu@neramclasses.com`. `apps/nexus/src/app/api/classrooms/[id]/enrollments/route.ts` (directory branch, lines 118-147) looks up by `ms_oid` only and inserts a new `users` row on a miss. It never calls `reconcileMsIdentity`, and the hand-made Entra account has no phone to match on. Side effect: the unusable Gmail record collected 11 false `no_show` absences and held her real catch-up journey, which she could never see. |
| 3 | "Not yet in class" lists old graduates | `available-students/route.ts` offers every enabled org Entra account except staff, `is_alumni=true`, and people already in this class. 25 past students were removed as `course_completed` but never graduated, so `is_alumni` is false and their Microsoft accounts are still enabled. |
| 4 | No photo seems to mean "not active" | 5 of 6 photo-less students never opened Nexus. The reliable signal is `users.nexus_first_login_at` / `nexus_last_login_at` (written by `/api/auth/me`). 6 of 42 never signed in; 5 not seen in 14+ days. |
| 5 | Need a way to mark a student dormant | Exists only inside Select mode (`BulkSelectBar.tsx`) and on the profile header. Undiscoverable from the list. |
| 6 | Sort by joining date; create students without the Microsoft admin portal | No sort control (`enrolled_at` already in the payload). No account creation anywhere. |

## Decisions

- Managers and admins can create Microsoft accounts (same tier as `structure.enrollment.add`).
- The temp password is shown once with Copy and Send on WhatsApp. Nothing is stored. Lost passwords use Reset password.
- Merge Afrin's two records now (production data fix, gated on explicit go).
- Compact list is the default row style.

## Approach

Three independently shippable phases. The structural fix for duplicates: an account is always created from, or attached to, the student's existing record in one request, so a second row cannot be minted.

Working tree note: `lib/people-search.ts`, `AvailableStudentsSection.tsx` and `api/users/search/route.ts` carry uncommitted edits from other work. Build on them; never stash or revert.

---

## Phase 1: Fix what is broken

### 1.1 Forgiving search with "Did you mean"

- Extend `apps/nexus/src/lib/people-search.ts` (pure, shared by every picker) with a new lowest tier `MatchTier.FUZZY = 5`.
  - `phoneticKey(text)`: lowercase, letters only, transliteration folds `dh→d, th→t, sh→s, kh→k, bh→b, ph→f, gh→g, zh→l`, long vowels `aa→a, ee→i, ii→i, oo→u, uu→u`, collapse doubled letters (`Nethrra→netra`).
  - A query token matches a name or email-local token (split with `wordStarts`, so camel humps split) when keys share a prefix, or Damerau-Levenshtein distance is at most 1 (4+ chars) or 2 (8+ chars).
- Students page: replace the inline `includes` filter with `rankPeople`. While a query is typed, search the whole roster (ignore the segment pill) and show "Searching all students".
- Empty result: up to 3 closest names as "Did you mean" chips.
- Tests: disha→Dhisha, keertana→Keerthana, nethra→Nethrra, arthi→Aarthi, "afrin banu"; "ram" must not match "Ananya"; existing tier order unchanged.

### 1.2 Stop duplicate records at the source

- New pure matcher `apps/nexus/src/lib/identity-candidates.ts`: given a directory account (name, UPN) and roster rows with no `ms_oid`, return likely same-person rows (first name token equal after `phoneticKey`, or phone/email match). Proposes only; a human confirms.
- Enrollments POST directory branch, new order:
  1. `link_user_id` present: attach `ms_oid` + `linked_classroom_email` onto that row (refuse a different `ms_oid`), set `student_profiles.ms_teams_email` if a profile exists, upsert the enrollment.
  2. Else `reconcileMsIdentity` with phone/email hints from `getUserProfile(ms_oid)`.
  3. Else, unless `confirm_new`, run the matcher over this classroom's students with no Microsoft account; any hit returns `409 { error: 'possible_duplicate', candidates }`.
  4. Else create through `reconcileMsIdentity(allowCreate: true)`.
- `AvailableStudentsSection.tsx` and `AddStudentDialog.tsx` handle the 409 with a confirm: "Is Afrin banu the same student as Afrin (paid 13 Aug, afrinbanu20101@gmail.com)?" Yes, link them / No, different student.

### 1.3 "Not yet in class" shows only real candidates

- Route: add `createdDateTime` to the Graph `$select`; load past students (every student enrollment inactive), matched on `ms_oid` and every email column. Return `{ students, past, counts }`, new accounts newest first.
- Pure `splitAddableStudents` in `org-directory.ts` with tests.
- UI: new accounts with "Account created 2 days ago"; collapsed "Past students (25)" with last classroom, year, removal reason, and a note that they still hold active Microsoft accounts (link to Admin Graduate, no automatic offboarding).

### 1.4 Afrin data fix (production, only on explicit go)

| Record | Holds |
|---|---|
| Keep `2c53b9e3-4c20-49a3-b6e2-c19d84dcc300` "Afrin banu", `Afrin_banu@neramclasses.com` | All real Nexus activity: 8 attendance, 2 tests, 2 drawings, recaps, photo review, gamification, 1088 device logs |
| Merge in `61ede737-106c-4663-8c55-d720531da39d` "Afrin", `afrinbanu20101@gmail.com` | Fee record, 1 payment, phone, application, enrollment link, 16 `late_joiner` absences (3 Jul to 12 Aug) + active catch-up journey, 11 `no_show` absences (14 Aug to 9 Sep) |

1. Re-run `preview_user_merge` both directions and show the counts.
2. One transaction: delete the Gmail record's 11 `no_show` absences (8 on classes she attended, 3 duplicates; none carry a reason, excuse or watch), then `merge_user_records(winner 2c53b9e3, loser 61ede737, <admin users.id>)`.
3. Set `student_profiles.ms_teams_email = 'Afrin_banu@neramclasses.com'` and the enrollment `enrolled_at` back to 2026-08-13 12:45.
4. Post-checks: one `users` row; `ms_oid`, `firebase_uid`, phone set; one active enrollment; no `no_show` on attended classes; one Afrin on the Students page.

---

## Phase 2: Roster redesign

Rules (ui-ux-pro-max): search with suggestions, one primary action per screen, 48px targets, bottom sheets on mobile, progressive disclosure, status as text + icon, overflow menu, skeletons, persisted view/sort/filter.

### 2.1 Data

- `/api/students`: select `nexus_first_login_at, nexus_last_login_at`; rows gain `first_signed_in_at`, `last_seen_at`, `possible_duplicate_of`. Counts gain `neverSignedIn`, `notSeen14d` (non-dormant, has `ms_oid`).
- `studentRow.types.ts`: add the fields.

### 2.2 Layout at 375px

```
Students                                  [+ Add]
39 tracked · 3 dormant · Batch 2026-27        (i)
[ Search students                              ]
(Exam this year 15) (All active 39) (Class 11 10) …
[Filters · 1]   [Sort: Name A to Z]     [≡][▦][▤]
Needs attention                                 ˄
  ! 6 never signed in             Send login ›
  ! 14 have no class set           Set class ›
  ! 1 may have two records            Review ›
[DH] Dhisha Haribabu                        ⋮
     Class 12 · 2026-27
     Joined 18 Aug · Never signed in
```

- Header chips collapse to one caption line.
- Add: contained button at `sm`+, FAB on phones; hidden without `structure.enrollment.add`.
- "Not yet in class" moves into the Add sheet.

### 2.3 Rows

- Compact default. Status line: `Joined {date}` plus Never signed in / Seen {relative} (amber at 14+ days) / No Microsoft account. Attendance only when completed classes exist; Checklist only when items exist.
- Cards and Detailed hide zero-total meters.
- Never-signed-in avatars get a dashed ring.
- Row ⋮ menu gated by `can()`: Open profile, Copy email, View as student, Set class and exam year, Mark dormant / Bring back (existing `ClassifyDrawer`, with Undo), Remove from class; Phase 3 adds Create Microsoft account / Reset password.

### 2.4 Sort and filters

- Sort (persisted): Name A to Z (default), Newest joined, Oldest joined, Recently seen, Longest unseen, Lowest attendance.
- Filters sheet: Exam year, Section, Sign-in (Any, Never signed in, Not seen 14+ days, Active this week), Account (Any, No Microsoft account). Active filters as removable chips.

### 2.5 Needs attention card

- `NeedsAttentionCard.tsx` replaces `ClassYearIssues` usage, keeps its rows, adds never signed in and possible duplicates. Collapsible, remembered, zero rows hidden.

### 2.6 Add student sheet

- `AddStudentSheet.tsx`: tabs Create account (Phase 3) and Existing Microsoft account (the 1.3 list with duplicate confirm).

---

## Phase 3: Create Microsoft accounts from Nexus

### 3.0 Prerequisites (Azure, once, with admin consent; Application permissions)

| Permission | Why |
|---|---|
| `User.Create` | Create the account (`User.ReadWrite.All` also covers it) |
| `LicenseAssignment.ReadWrite.All` | Assign the student license |
| `LicenseAssignment.Read.All` | Read license seats |
| `User-PasswordProfile.ReadWrite.All` | Reset password |
| `User-Mail.ReadWrite.All` (optional) | Save personal Gmail in `otherMails` |

No new env vars.

### 3.1 Readiness and license defaults

- `GET /api/students/accounts/readiness`: decode the app-only token `roles` claim; read `/subscribedSkus` for seats; report missing permissions.
- `lib/student-account-defaults.ts` stores `nexus_settings['student_account_defaults']` = `{ domain, usage_location: 'IN', sku_id, sku_part_number, license_mode, license_group_id? }`; never throws.
- First run auto-detects the most common SKU among up to 10 current students (`getUserAssignedLicenses`), including group vs direct; admin confirms once. Group licensing adds the user to the group (needs `GroupMember.ReadWrite.All`).

### 3.2 Graph helpers (`apps/nexus/src/lib/entra-accounts.ts`)

- `suggestUsername(first, last)` pure, `First_Last`, numeric suffix on collision.
- `generateTempPassword()` pure, `crypto.randomInt`, 12 chars, all four classes, no look-alikes.
- `isUpnAvailable`, `createEntraUser` (`usageLocation: 'IN'`, `mobilePhone`, force change), `assignStudentLicense`, `setOtherMails`, `resetEntraPassword`, `listSubscribedSkus`, `readTokenRoles`, `detectStudentLicense`. All return `{ ok, error }`.

### 3.3 API (capability `structure.student.account`)

- Add to `Capability`, `MANAGER_EXTRA`, `ALL_CAPABILITIES`.
- `POST /api/students/accounts/preview`: UPN suggestion + availability, duplicate candidates (phone, email, fuzzy name).
- `POST /api/students/accounts`: re-check → create → license (failure keeps account, Retry) → otherMails → attach or reconcile (never duplicate) → enrollment + class/year → Teams (pending + Retry) → `recordUserHistory`. Password returned once, `Cache-Control: no-store`, never persisted or logged; retry idempotent by `ms_oid`.
- `POST /api/students/[id]/reset-password`: students only.

### 3.4 UI

- `CreateAccountForm.tsx`: First, Last, Phone (+91, tel), Personal email, Class, Exam year, Section; live login ID line; license line; duplicate card; single Create account button.
- Step progress (account, license, classroom, Team) with Retry.
- `AccountShareCard.tsx`: login ID and password with Copy, Copy message, Send on WhatsApp; "Shown only once"; confirm before closing uncopied.
- Message:

```
Hi {first}, welcome to Neram Classes!

Your student account is ready.
Login ID: {upn}
Temporary password: {password}

1. Open https://nexus.neramclasses.com and sign in with this login ID.
2. Choose a new password when asked.
3. Install Microsoft Authenticator when it asks you to secure your account.
4. Install Microsoft Teams and sign in with the same login ID for live classes.

Please keep this password private.
```

- Entry points: Add sheet; row ⋮ Create Microsoft account (prefilled, `attachToUserId`); ⋮ and profile header Reset password; Needs attention Send login.

---

## Reuse

- `rankPeople`, `escapeIlike`, `normalizeQuery`, `wordStarts` (people-search.ts)
- `reconcileMsIdentity` (packages/database ms-identity.ts), `getUserByPhone` (users.ts), `recordUserHistory` (crm.ts)
- `getAppOnlyToken`, `classifyGraphError`, `getUserProfile`, `getUserAssignedLicenses`, `addStudentToClassroomTeams` (packages/auth graph.ts)
- `buildEnrollmentBlocklist`, `isOrgPersonAccount` (org-directory.ts), `isAwaitingMicrosoft` (microsoft-account.ts)
- `ClassifyDrawer`, `BulkSelectBar`, `StudentRowShell`, `StudentRowChips`, `StudentStageAvatar`, `PATCH /api/students/classification`
- `readRecapDefaults` pattern for `nexus_settings`
- RPCs `preview_user_merge`, `merge_user_records`

## Verification

- Unit (`pnpm test:run`): fuzzy search, `splitAddableStudents`, identity candidates, username/password helpers, capability matrix, account orchestration with Graph mocked.
- Types and lint for `@neram/nexus` with `--force`, no pipes.
- E2E: extend `students-nexus.spec.ts`, `student-stage-nexus-mobile.spec.ts`; new `students-add-account-nexus.spec.ts`. No real account creation in E2E.
- One manual live create with a throwaway student after approval (local dev hits the production DB and tenant), then clean up.
- Never run `next build` while the dev server runs.

## Out of scope

- Offboarding the 25 past students with enabled Microsoft accounts (count surfaced only).
- Dhisha's separate Gmail lead record (`dhisha.201@gmail.com`).
- Admin `sync-entra` / `refresh-entra` matching.
