# Runbook: merge the duplicate-student orphans (2026-06-28)

A handful of students have two `users` rows, an `@neramclasses.com` row (usually
`ms_oid` NULL) and a personal-Gmail row that holds the real `ms_oid`. This is the
Google↔Microsoft dual-identity gap. The merge keeps the `@neramclasses.com`
identity, folds the Gmail into `users.personal_email`, repoints every reference,
and hard-deletes the leftover row. Functions: `merge_user_records(winner, loser)`
and `preview_user_merge(loser)` (migration `20260628141000_merge_user_records.sql`).

> Prerequisite: both migrations (`..140000_user_personal_email`, `..141000_merge_user_records`)
> applied to the target environment. Verified end-to-end on staging with a
> synthetic pair (loser deleted, email=@neram, personal_email=gmail, ms_oid +
> firebase_uid consolidated, child rows repointed, 1:1 alumni profile COALESCE-merged).

## 1. Find the orphan candidates

```sql
SELECT id, name, email, ms_oid, firebase_uid
FROM users
WHERE user_type='student'
  AND ms_oid IS NULL
  AND (email ILIKE '%@neramclasses.com' OR email ILIKE '%@neram.co.in')
ORDER BY name;
```

For each candidate (the **winner** = the `@neram` row), resolve the real `ms_oid`
from Microsoft and find the **loser** (the row that holds it):

- Resolve via Graph: `findUserOidByEmail(<neram email>)` (see `packages/auth/src/graph.ts`).
- `SELECT id, email, ms_oid, firebase_uid FROM users WHERE ms_oid = '<resolved oid>';`

The matched row (a Gmail email holding that `ms_oid`) is the **loser**.

## 2. Preview, then merge (per pair)

Preferred path is the admin UI (`/alumni/<winnerId>` → "Possible duplicate" →
"Review & merge"), which re-detects server-side and refuses unsafe merges. The
equivalent direct calls (admin / MCP) for each confirmed pair:

```sql
-- what will move
SELECT * FROM preview_user_merge('<loserId>');

-- merge (atomic). winner = @neram row, loser = gmail+oid row
SELECT * FROM merge_user_records('<winnerId>', '<loserId>', '<adminUserId-or-NULL>');
```

The merge route also disables/offboards nothing, it only consolidates the record.
(Microsoft sign-in disable, if still needed, is handled separately via the alumni
profile "Remove license & disable" button.)

## 3. Verify each merge

```sql
SELECT count(*) FROM users WHERE id='<loserId>';                 -- expect 0
SELECT email, personal_email, ms_oid, firebase_uid,
       metadata->'merged_from'
FROM users WHERE id='<winnerId>';                                -- @neram email, gmail in personal_email, ms_oid + firebase_uid set
```

Login parity: the survivor must resolve by **both** `ms_oid` (Nexus/admin) and
`firebase_uid` (app). Spot-check that reference counts moved (e.g. drawings,
payments now under the winner; none left under the loser).

## Known pairs (fill in when run on prod)

| Winner (@neram) | Loser (gmail) | Merged on |
|---|---|---|
| _adhvika_selvamuthukumar@neramclasses.com_ | _adhvika01@gmail.com_ | |
| _sanjeevraj_ramesh@neramclasses.com_ | _sanjay1128a@gmail.com_ | |
| _Sienna_Christopher@neramclasses.com_ | _(holder of oid 1636ace4…)_ | |
| _vaishnavi@neramclasses.com_ | _(case-dup Vaishnavi@neramclasses.com)_ | |
| _(5th candidate from step 1)_ | | |

> Note: a couple of these "loser" rows carry a different `@neramclasses.com`
> (case-variant) email rather than a Gmail. The detection is by `ms_oid`, not by
> email shape, so it still finds them. Review each pair in the dialog before merging.
