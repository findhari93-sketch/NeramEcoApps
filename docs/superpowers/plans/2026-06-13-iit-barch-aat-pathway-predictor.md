# IIT B.Arch / AAT Pathway in the JoSAA Predictor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the JoSAA B.Arch predictor from giving IITs a Safe/Probable/Reach verdict based on a JEE Main Paper 2A rank, and instead present IIT B.Arch as its own pathway (JEE Advanced rank + AAT Pass), with an optional JEE Advanced rank input that produces a correct IIT prediction.

**Architecture:** Pure helper functions split prediction rows into two zones by `institute_type`. The existing predictor page renders Zone 1 (NIT/SPA/GFTI, unchanged verdict) and a new Zone 2 component for IITs (reference cutoffs labeled as JEE Advanced ranks, an AAT-gate banner, and an optional verdict when the student supplies a JEE Advanced rank via a second call to the same `predict_colleges_v2` RPC). No database migration. Marketing copy and the `aat-explained` article are aligned to match.

**Tech Stack:** Next.js 14 App Router, React client component, MUI v5 (`@neram/ui`), Supabase RPC, Vitest (unit), Playwright (E2E).

**Spec:** `docs/superpowers/specs/2026-06-13-iit-barch-aat-pathway-predictor-design.md`

---

## File Structure

- Create: `apps/app/src/lib/josaa-zones.ts` — pure, framework-free zone-partition helpers.
- Create: `apps/app/src/lib/josaa-zones.test.ts` — Vitest unit tests for the helpers.
- Modify: `apps/app/src/app/(protected)/tools/counseling/josaa-predictor/page.tsx` — partition rows, render Zone 2, add the optional JEE Advanced rank field and second fetch.
- Modify: `apps/marketing/src/lib/tools/configs/josaa-barch-predictor.ts` — subtitle + one FAQ.
- Modify: `apps/marketing/src/app/[locale]/counseling/concepts/aat-explained/page.tsx` — correct the wrong AIR ranges.
- Create: `tests/e2e/iit-aat-pathway-app.spec.ts` — unauthenticated-renderable assertions + mobile layout.

Canonical page URL: `/tools/counseling/josaa-predictor` (`/tools/josaa-predictor` 301-redirects to it via `apps/app/next.config.js:31`).

---

## Task 1: Pure zone-partition helpers (TDD)

**Files:**
- Create: `apps/app/src/lib/josaa-zones.ts`
- Test: `apps/app/src/lib/josaa-zones.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/app/src/lib/josaa-zones.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { partitionByIit, dedupeIitByInstitute } from './josaa-zones';

const rows = [
  { institute: 'NIT Trichy', institute_type: 'NIT', closing_rank: 5000, nirf_rank: 9 },
  { institute: 'IIT Kharagpur', institute_type: 'IIT', closing_rank: 17823, nirf_rank: 5 },
  { institute: 'IIT Kharagpur', institute_type: 'IIT', closing_rank: 2817, nirf_rank: 5 },
  { institute: 'IIT Roorkee', institute_type: 'IIT', closing_rank: 16596, nirf_rank: 1 },
  { institute: 'SPA Delhi', institute_type: 'SPA', closing_rank: 1200, nirf_rank: 2 },
];

describe('partitionByIit', () => {
  it('routes IIT rows to iit and the rest to nonIit', () => {
    const { nonIit, iit } = partitionByIit(rows);
    expect(iit.map((r) => r.institute)).toEqual(['IIT Kharagpur', 'IIT Kharagpur', 'IIT Roorkee']);
    expect(nonIit.map((r) => r.institute)).toEqual(['NIT Trichy', 'SPA Delhi']);
  });

  it('never lets an IIT leak into nonIit (the core bug guard)', () => {
    const { nonIit } = partitionByIit(rows);
    expect(nonIit.some((r) => r.institute_type === 'IIT')).toBe(false);
  });

  it('handles an empty list', () => {
    expect(partitionByIit([])).toEqual({ nonIit: [], iit: [] });
  });
});

describe('dedupeIitByInstitute', () => {
  it('keeps the lowest closing rank per institute and sorts by NIRF', () => {
    const { iit } = partitionByIit(rows);
    const deduped = dedupeIitByInstitute(iit);
    expect(deduped.map((r) => r.institute)).toEqual(['IIT Roorkee', 'IIT Kharagpur']);
    expect(deduped.find((r) => r.institute === 'IIT Kharagpur')?.closing_rank).toBe(2817);
  });

  it('sorts null closing ranks last within an institute and null nirf last overall', () => {
    const deduped = dedupeIitByInstitute([
      { institute: 'IIT BHU', institute_type: 'IIT', closing_rank: null, nirf_rank: null },
      { institute: 'IIT Roorkee', institute_type: 'IIT', closing_rank: 16596, nirf_rank: 1 },
    ]);
    expect(deduped.map((r) => r.institute)).toEqual(['IIT Roorkee', 'IIT BHU']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run josaa-zones`
Expected: FAIL with a module-not-found / "partitionByIit is not a function" error (file does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `apps/app/src/lib/josaa-zones.ts`:

```ts
/**
 * Pure helpers that split JoSAA predictor rows into two admission "zones":
 *  - Zone 1 (Paper-2A): NIT / SPA / GFTI rows, predicted from a JEE Main Paper 2A rank.
 *  - Zone 2 (IIT): IIT rows, which admit via JEE Advanced rank plus an AAT Pass and
 *    must NOT carry a Safe/Probable/Reach verdict derived from a Paper-2A rank.
 *
 * Kept framework-free so they are unit-testable without React or Supabase.
 */

export const IIT_INSTITUTE_TYPE = 'IIT';

export interface ZonePartition<T> {
  nonIit: T[];
  iit: T[];
}

/** Split rows by institute_type: IIT rows go to `iit`, everything else to `nonIit`. */
export function partitionByIit<T extends { institute_type: string }>(rows: T[]): ZonePartition<T> {
  const nonIit: T[] = [];
  const iit: T[] = [];
  for (const r of rows) {
    if (r.institute_type === IIT_INSTITUTE_TYPE) iit.push(r);
    else nonIit.push(r);
  }
  return { nonIit, iit };
}

/**
 * Collapse multiple seat rows per IIT into one representative row (the lowest
 * closing rank, i.e. the headline cutoff). Result is sorted by NIRF rank ascending
 * so the strongest IITs lead. Null closing/nirf ranks sort last.
 */
export function dedupeIitByInstitute<
  T extends { institute: string; closing_rank: number | null; nirf_rank: number | null }
>(rows: T[]): T[] {
  const best = new Map<string, T>();
  for (const r of rows) {
    const cur = best.get(r.institute);
    if (!cur) {
      best.set(r.institute, r);
      continue;
    }
    const rRank = r.closing_rank ?? Number.POSITIVE_INFINITY;
    const curRank = cur.closing_rank ?? Number.POSITIVE_INFINITY;
    if (rRank < curRank) best.set(r.institute, r);
  }
  return Array.from(best.values()).sort(
    (a, b) => (a.nirf_rank ?? 9999) - (b.nirf_rank ?? 9999),
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run josaa-zones`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/lib/josaa-zones.ts apps/app/src/lib/josaa-zones.test.ts
git commit -m "feat(app): pure helpers to split JoSAA predictions into NIT vs IIT zones"
```

---

## Task 2: Render Zone 1 (non-IIT) + Zone 2 reference in the predictor page

**Files:**
- Modify: `apps/app/src/app/(protected)/tools/counseling/josaa-predictor/page.tsx`

This task keeps the single-year results path. Zone 1 uses non-IIT rows; a new `IITPathwayZone` component renders IIT rows in reference mode (no verdict yet, that arrives in Task 4).

- [ ] **Step 1: Add the helper import**

Below the existing `import { AuthGate } from '@/components/AuthGate';` line (around line 45), add:

```ts
import { partitionByIit, dedupeIitByInstitute } from '@/lib/josaa-zones';
```

- [ ] **Step 2: Add the IIT marketing link constants**

Below the existing `MARKETING_BASE_URL` block (ends around line 99), add:

```ts
const IIT_AAT_GUIDE_URL = `${MARKETING_BASE_URL}/counseling/concepts/aat-explained`;
const IIT_AAT_HUB_URL = `${MARKETING_BASE_URL}/aat-2026`;
```

- [ ] **Step 3: Make Zone 1 use only non-IIT rows**

Replace the existing `grouped` useMemo (around lines 245-252):

```ts
  const grouped = useMemo(() => {
    if (!predictions) return null;
    return {
      safe: predictions.filter((p) => p.chance === 'safe'),
      probable: predictions.filter((p) => p.chance === 'probable'),
      reach: predictions.filter((p) => p.chance === 'reach'),
    };
  }, [predictions]);
```

with:

```ts
  const grouped = useMemo(() => {
    if (!predictions) return null;
    const { nonIit } = partitionByIit(predictions);
    return {
      safe: nonIit.filter((p) => p.chance === 'safe'),
      probable: nonIit.filter((p) => p.chance === 'probable'),
      reach: nonIit.filter((p) => p.chance === 'reach'),
    };
  }, [predictions]);

  // IIT rows for the separate AAT pathway zone (single-year path). One headline
  // row per IIT, verdict stripped (it is invalid against a Paper-2A rank).
  const iitReference = useMemo(() => {
    if (!predictions) return null;
    const { iit } = partitionByIit(predictions);
    return dedupeIitByInstitute(iit);
  }, [predictions]);
```

- [ ] **Step 4: Render Zone 2 in the single-year results block**

In the single-year results, immediately AFTER the `FlatTableView` block and BEFORE the empty-state `Alert` (around lines 515-523), insert the Zone 2 render. The surrounding code currently reads:

```tsx
          {grouped && viewMode === 'table' && (
            <FlatTableView predictions={predictions!} homeState={homeState} />
          )}

          {predictions && predictions.length === 0 && (
```

Change it to:

```tsx
          {grouped && viewMode === 'table' && (
            <FlatTableView predictions={predictions!} homeState={homeState} />
          )}

          {iitReference && iitReference.length > 0 && (
            <IITPathwayZone rows={iitReference} verdict={null} yearLabel={year || 'latest'} />
          )}

          {predictions && predictions.length === 0 && (
```

- [ ] **Step 5: Add the IITPathwayZone component**

Add this component definition just before `function CompareResultsTable(` (around line 648), so it sits with the other view components:

```tsx
function IITPathwayZone({
  rows,
  verdict,
  yearLabel,
}: {
  rows: JosaaPrediction[];
  verdict?: Record<string, JosaaPrediction> | null;
  yearLabel?: string | number;
}) {
  return (
    <Box>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
        🏛️ IIT B.Arch, a separate exam pathway
      </Typography>
      <Alert severity="warning" icon={<InfoOutlinedIcon />} sx={{ mb: 1.5 }}>
        IIT B.Arch (Kharagpur, Roorkee, BHU Varanasi) is <b>not</b> filled from your
        JEE Main Paper 2A rank. Seats go by your <b>JEE Advanced rank</b>, and only
        after you <b>Pass the AAT</b> (Architecture Aptitude Test, a Pass/Fail gate).
        The closing ranks below are JEE Advanced ranks, shown for reference.
      </Alert>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 1.5 }}>
        {['1. Qualify JEE Advanced', '2. Pass AAT (Pass/Fail)', '3. JoSAA seat by Advanced rank'].map((s) => (
          <Chip key={s} label={s} size="small" variant="outlined" />
        ))}
      </Stack>

      <Stack spacing={1.5}>
        {rows.map((p) => {
          const v = verdict ? verdict[p.institute] : null;
          return (
            <Card key={p.institute} variant="outlined">
              <CardContent sx={{ '&:last-child': { pb: 2 } }}>
                <Stack direction="row" spacing={1} alignItems="flex-start" justifyContent="space-between">
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      {p.institute}
                    </Typography>
                    <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                      <Chip label="IIT" size="small" variant="outlined" />
                      {p.state && <Chip label={p.state} size="small" variant="outlined" />}
                      {p.nirf_rank != null && (
                        <Chip label={`NIRF ${p.nirf_rank}`} size="small" color="info" variant="outlined" />
                      )}
                    </Stack>
                  </Box>
                  {v ? (
                    <ChanceChip chance={v.chance} />
                  ) : (
                    <Chip
                      label="JEE Advanced + AAT"
                      size="small"
                      sx={{ bgcolor: '#ECEFF1', color: '#455A64', fontWeight: 600 }}
                    />
                  )}
                </Stack>
                <Divider sx={{ my: 1 }} />
                <Stack direction="row" spacing={2} justifyContent="space-between" alignItems="center" flexWrap="wrap">
                  <Typography variant="caption" color="text.secondary">
                    JEE Advanced closing rank{yearLabel ? ` (${yearLabel})` : ''}: <b>{p.closing_rank ?? '—'}</b>
                    {v && (
                      <>
                        {' · '}Your margin: <b>{v.margin > 0 ? `+${v.margin}` : v.margin}</b>
                      </>
                    )}
                  </Typography>
                  <CollegeLink p={p} />
                </Stack>
              </CardContent>
            </Card>
          );
        })}
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} flexWrap="wrap">
        <Button size="small" variant="outlined" href={IIT_AAT_GUIDE_URL} target="_blank" rel="noopener" endIcon={<OpenInNewIcon />}>
          How AAT works
        </Button>
        <Button size="small" variant="text" href={IIT_AAT_HUB_URL} target="_blank" rel="noopener" endIcon={<OpenInNewIcon />}>
          AAT 2026 guide
        </Button>
      </Stack>
    </Box>
  );
}
```

- [ ] **Step 6: Verify it builds and renders**

Run: `pnpm --filter @neram/tools-app dev` (or `pnpm dev:app`), open `http://localhost:3011/tools/counseling/josaa-predictor`, sign in, enter a Paper-2A rank (for example 8000), submit.
Expected: NITs/SPAs/GFTIs appear under Safe/Probable/Reach; the 3 IITs appear in a separate "IIT B.Arch, a separate exam pathway" block with the warning banner, a "JEE Advanced + AAT" chip (no green Safe tag), and "JEE Advanced closing rank" labels. No IIT appears in the Safe/Probable/Reach groups.

- [ ] **Step 7: Commit**

```bash
git add apps/app/src/app/(protected)/tools/counseling/josaa-predictor/page.tsx
git commit -m "feat(app): split JoSAA predictor results into Paper-2A zone and IIT AAT pathway zone"
```

---

## Task 3: Separate IITs out of compare-across-years mode

**Files:**
- Modify: `apps/app/src/app/(protected)/tools/counseling/josaa-predictor/page.tsx`

Compare mode builds `compareRows` and renders `CompareResultsTable`. IITs must leave that table and render in the same Zone 2 component (reference mode) below it.

- [ ] **Step 1: Exclude IITs from the compare table and collect them separately**

Replace the existing `compareRows` useMemo (around lines 255-279). The current body builds a single `byInstitute` map over all predictions. Replace the whole useMemo with:

```ts
  // For compare mode: union of institutes across years, ordered by best chance + nirf.
  // IITs are pulled out into a separate reference list (different admission pathway).
  const compareRows = useMemo(() => {
    if (!byYear) return null;
    const years = Object.keys(byYear).map((y) => parseInt(y, 10)).sort((a, b) => b - a);
    const byInstitute = new Map<string, { institute: string; institute_type: string; state: string | null; nirf_rank: number | null; college_slug: string | null; state_slug: string | null; city_slug: string | null; perYear: Record<number, JosaaPrediction | null> }>();
    const iitByInstitute = new Map<string, JosaaPrediction>();
    for (const y of years) {
      for (const p of byYear[y].predictions) {
        if (p.institute_type === 'IIT') {
          const cur = iitByInstitute.get(p.institute);
          const pr = p.closing_rank ?? Number.POSITIVE_INFINITY;
          const cr = cur?.closing_rank ?? Number.POSITIVE_INFINITY;
          if (!cur || pr < cr) iitByInstitute.set(p.institute, p);
          continue;
        }
        const key = p.institute;
        if (!byInstitute.has(key)) {
          byInstitute.set(key, {
            institute: p.institute,
            institute_type: p.institute_type,
            state: p.state,
            nirf_rank: p.nirf_rank,
            college_slug: p.college_slug,
            state_slug: p.state_slug,
            city_slug: p.city_slug,
            perYear: {},
          });
        }
        const row = byInstitute.get(key)!;
        if (!row.perYear[y]) row.perYear[y] = p; // keep first (best) chance row per year
      }
    }
    return {
      years,
      rows: Array.from(byInstitute.values()).sort((a, b) => (a.nirf_rank ?? 999) - (b.nirf_rank ?? 999)),
      iitRows: dedupeIitByInstitute(Array.from(iitByInstitute.values())),
    };
  }, [byYear]);
```

- [ ] **Step 2: Render Zone 2 under the compare table**

Find the compare-mode render line (around line 509):

```tsx
          {compareRows && <CompareResultsTable rows={compareRows.rows} years={compareRows.years} homeState={homeState} />}
```

Replace it with:

```tsx
          {compareRows && <CompareResultsTable rows={compareRows.rows} years={compareRows.years} homeState={homeState} />}
          {compareRows && compareRows.iitRows.length > 0 && (
            <IITPathwayZone rows={compareRows.iitRows} verdict={null} yearLabel={compareRows.years[0]} />
          )}
```

- [ ] **Step 3: Verify in dev**

With the dev server running, on the predictor check "Compare across years", select 2025 and 2024, submit.
Expected: the compare table shows only NIT/SPA/GFTI rows; the 3 IITs render below in the IIT pathway zone with their latest-year JEE Advanced closing rank. No IIT row inside the compare table.

- [ ] **Step 4: Commit**

```bash
git add apps/app/src/app/(protected)/tools/counseling/josaa-predictor/page.tsx
git commit -m "feat(app): keep IITs out of the compare table, show them in the AAT pathway zone"
```

---

## Task 4: Optional JEE Advanced rank field that produces a real IIT verdict

**Files:**
- Modify: `apps/app/src/app/(protected)/tools/counseling/josaa-predictor/page.tsx`

A second call to the same RPC with the student's JEE Advanced rank yields a correct IIT verdict. Single-year path only (compare mode keeps reference cutoffs).

- [ ] **Step 1: Add state for the Advanced rank and the verdict map**

After the existing `const [rank, setRank] = useState('');` line (around line 125), add:

```ts
  const [advancedRank, setAdvancedRank] = useState('');
```

After the existing `const [predictions, setPredictions] = ...` / `const [counts, setCounts] = ...` block (around lines 141-142), add:

```ts
  const [iitVerdict, setIitVerdict] = useState<Record<string, JosaaPrediction> | null>(null);
```

- [ ] **Step 2: Add the optional input field to the form**

Immediately AFTER the rank `TextField` block (the one whose `label` is `Your ... rank`, closing tag around line 352) and BEFORE the Home state `FormControl` (around line 355), insert:

```tsx
          {/* Optional JEE Advanced rank, powers the IIT B.Arch pathway prediction */}
          <TextField
            label="JEE Advanced rank (optional, for IIT B.Arch)"
            placeholder="e.g. 14500"
            type="number"
            value={advancedRank}
            onChange={(e) => setAdvancedRank(e.target.value)}
            inputProps={{ min: 1, max: 250000, inputMode: 'numeric', pattern: '[0-9]*' }}
            fullWidth
            helperText={
              <Stack direction="row" spacing={0.5} alignItems="flex-start" sx={{ mt: 0.25 }}>
                <InfoOutlinedIcon sx={{ fontSize: 16, mt: 0.25 }} />
                <Box component="span">
                  Only the 3 IITs (Kharagpur, Roorkee, BHU) use this. Leave blank if you did not sit JEE Advanced. IIT seats also require passing the AAT.
                </Box>
              </Stack>
            }
          />
```

- [ ] **Step 3: Reset and populate the verdict in handleSubmit**

In `handleSubmit`, after the existing reset calls `setByYear(null);` (around line 180), add:

```ts
    setIitVerdict(null);
```

Then, in the single-year success branch, locate this existing block (around lines 227-232):

```ts
      if (compareMode && json.byYear) {
        setByYear(json.byYear);
      } else {
        setPredictions(json.predictions || []);
        setCounts(json.counts || { safe: 0, probable: 0, reach: 0 });
      }
```

Replace it with:

```ts
      if (compareMode && json.byYear) {
        setByYear(json.byYear);
      } else {
        setPredictions(json.predictions || []);
        setCounts(json.counts || { safe: 0, probable: 0, reach: 0 });

        // Optional: second call with the JEE Advanced rank to predict IIT B.Arch.
        const advNum = parseInt(advancedRank, 10);
        if (Number.isFinite(advNum) && advNum >= 1) {
          try {
            const advRes = await fetch('/api/tools/josaa-predictor', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ ...body, rank: advNum }),
            });
            const advJson = await advRes.json();
            if (advRes.ok && Array.isArray(advJson.predictions)) {
              const map: Record<string, JosaaPrediction> = {};
              for (const p of advJson.predictions as JosaaPrediction[]) {
                if (p.institute_type !== 'IIT') continue;
                const cur = map[p.institute];
                if (!cur || (p.closing_rank ?? Infinity) < (cur.closing_rank ?? Infinity)) {
                  map[p.institute] = p;
                }
              }
              setIitVerdict(map);
            }
          } catch {
            // Non-fatal: IIT zone simply stays in reference mode.
          }
        }
      }
```

Then add `advancedRank` to the `handleSubmit` dependency array (the array ending around line 238, currently `[rank, rankType, category, pwd, gender, homeState, year, roundNo, compareMode, compareYears, user]`):

```ts
  }, [rank, advancedRank, rankType, category, pwd, gender, homeState, year, roundNo, compareMode, compareYears, user]);
```

- [ ] **Step 4: Pass the verdict to Zone 2 (single-year render)**

Update the single-year Zone 2 render added in Task 2 (around the `iitReference` block):

```tsx
          {iitReference && iitReference.length > 0 && (
            <IITPathwayZone rows={iitReference} verdict={null} yearLabel={year || 'latest'} />
          )}
```

to:

```tsx
          {iitReference && iitReference.length > 0 && (
            <IITPathwayZone rows={iitReference} verdict={iitVerdict} yearLabel={year || 'latest'} />
          )}
```

- [ ] **Step 5: Verify in dev**

With the dev server running and signed in, enter a Paper-2A rank (8000) AND a JEE Advanced rank (for example 14500), submit.
Expected: Zone 2 IIT cards now show a Safe/Probable/Reach chip computed against the IIT JEE Advanced closing ranks, plus a "Your margin" figure, while the warning banner still states the AAT Pass requirement. Leaving the Advanced rank blank reverts Zone 2 to reference mode (the "JEE Advanced + AAT" chip).

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/app/(protected)/tools/counseling/josaa-predictor/page.tsx
git commit -m "feat(app): optional JEE Advanced rank input yields a real IIT B.Arch verdict"
```

---

## Task 5: Align the marketing predictor copy

**Files:**
- Modify: `apps/marketing/src/lib/tools/configs/josaa-barch-predictor.ts`

- [ ] **Step 1: Update the subtitle's closing clause**

In the `subtitle` field, replace this exact trailing sentence:

```
The predictor handles CRL vs category rank disambiguation, applies your home-state quota correctly to NIT seats, and groups results into Safe / Probable / Reach so you know where to spend your JoSAA preferences.
```

with:

```
The predictor handles CRL vs category rank disambiguation, applies your home-state quota correctly to NIT seats, and groups NIT, SPA and GFTI results into Safe / Probable / Reach. The 3 IITs (Kharagpur, Roorkee, BHU) are shown in a separate section, because they admit through your JEE Advanced rank plus a Pass in the AAT, not your JEE Main Paper 2A rank.
```

- [ ] **Step 2: Update the Safe/Probable/Reach FAQ**

In the `faqs` array, find the question `'How are Safe, Probable, and Reach calculated?'` and replace its `answer` value:

```
Each institute\'s seat is tagged based on how far your rank is from its closing rank. Safe = your rank gives you at least 20% margin below closing rank. Probable = you\'re within the closing rank but margin under 20%. Reach = your rank is above the closing rank by up to 30% — still worth filling as a stretch preference.
```

with (note: no em dash, per content rules):

```
Each NIT, SPA or GFTI seat is tagged based on how far your JEE Main Paper 2A rank is from its closing rank. Safe means your rank gives you at least 20% margin below the closing rank. Probable means you are within the closing rank but margin under 20%. Reach means your rank is above the closing rank by up to 30%, still worth filling as a stretch preference. The 3 IITs are not tagged this way: they admit on JEE Advanced rank plus an AAT Pass, so they appear in a separate IIT B.Arch section with their JEE Advanced closing ranks for reference.
```

- [ ] **Step 3: Verify type-check passes**

Run: `pnpm --filter @neram/marketing type-check`
Expected: PASS (no type errors introduced).

- [ ] **Step 4: Commit**

```bash
git add apps/marketing/src/lib/tools/configs/josaa-barch-predictor.ts
git commit -m "docs(marketing): clarify IITs are a separate AAT pathway in JoSAA predictor copy"
```

---

## Task 6: Correct the wrong AIR ranges in the aat-explained article

**Files:**
- Modify: `apps/marketing/src/app/[locale]/counseling/concepts/aat-explained/page.tsx`

The article lists IIT Roorkee "1,500 to 2,800" and Kharagpur "2,000 to 3,500", but the real JoSAA closing ranks (= JEE Advanced ranks) are far higher. Pull accurate ranges from the dataset, then rewrite the bullets.

- [ ] **Step 1: Get the real OPEN Gender-Neutral closing ranks per year**

Use the Supabase MCP (production) to read the live cutoffs the tool itself uses. Run each (rank 1 forces every row to qualify, so all IIT OPEN GN rows are returned with their closing_rank):

```sql
-- 2023
select institute, closing_rank
from predict_colleges_v2(1, 'CRL', 'OPEN', false, 'Gender-Neutral', null, 2023, null)
where institute_type = 'IIT' order by institute;
-- 2024
select institute, closing_rank
from predict_colleges_v2(1, 'CRL', 'OPEN', false, 'Gender-Neutral', null, 2024, null)
where institute_type = 'IIT' order by institute;
-- 2025
select institute, closing_rank
from predict_colleges_v2(1, 'CRL', 'OPEN', false, 'Gender-Neutral', null, 2025, null)
where institute_type = 'IIT' order by institute;
```

Tool calls: `mcp__supabase-prod__execute_sql` with each query. For each IIT, take the min and max closing_rank across 2023 to 2025 to form a range. Known 2025 values for a sanity check: Roorkee 16,596, Kharagpur 17,823, BHU 19,019.

- [ ] **Step 2: Rewrite the IIT B.Arch bullets**

Replace the existing list (around lines 140-144):

```tsx
      <Typography component="ul">
        <Box component="li"><strong>IIT Roorkee:</strong> JEE Advanced AIR range 1,500 to 2,800 (Open)</Box>
        <Box component="li"><strong>IIT Kharagpur:</strong> JEE Advanced AIR range 2,000 to 3,500 (Open)</Box>
        <Box component="li"><strong>IIT BHU:</strong> Smaller intake, ranges vary</Box>
      </Typography>
```

with (substitute `<MIN>`/`<MAX>` with the rounded values from Step 1, OPEN Gender-Neutral, latest-round, across 2023 to 2025):

```tsx
      <Typography component="ul">
        <Box component="li"><strong>IIT Roorkee:</strong> JEE Advanced AIR roughly <MIN_ROORKEE> to <MAX_ROORKEE> (Open, Gender-Neutral, 2023 to 2025)</Box>
        <Box component="li"><strong>IIT Kharagpur:</strong> JEE Advanced AIR roughly <MIN_KGP> to <MAX_KGP> (Open, Gender-Neutral, 2023 to 2025)</Box>
        <Box component="li"><strong>IIT (BHU) Varanasi:</strong> JEE Advanced AIR roughly <MIN_BHU> to <MAX_BHU> (Open, Gender-Neutral, 2023 to 2025)</Box>
      </Typography>
      <Typography component="p" sx={{ fontSize: 14, color: 'text.secondary' }}>
        These are JEE Advanced ranks (not JEE Main Paper 2A ranks). Reserved-category closing ranks are lower. Check the live JoSAA B.Arch predictor for current cutoffs.
      </Typography>
```

The content rule forbids em dashes; use the wording above verbatim (commas/parentheses only).

- [ ] **Step 3: Verify type-check passes**

Run: `pnpm --filter @neram/marketing type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "apps/marketing/src/app/[locale]/counseling/concepts/aat-explained/page.tsx"
git commit -m "fix(marketing): correct IIT B.Arch JEE Advanced AIR ranges in aat-explained"
```

---

## Task 7: E2E coverage for the new field and Zone 2 (unauthenticated-safe)

**Files:**
- Create: `tests/e2e/iit-aat-pathway-app.spec.ts`

The student app uses Firebase auth which the suite cannot automate, so authenticated result rendering is not asserted here (the Zone partition logic is covered by the Task 1 unit tests). These E2E tests cover what renders before sign-in: the new optional field, and mobile layout.

- [ ] **Step 1: Write the test**

Create `tests/e2e/iit-aat-pathway-app.spec.ts`:

```ts
/**
 * IIT B.Arch / AAT pathway in the JoSAA predictor — E2E (unauthenticated-safe).
 *
 * The student app uses Firebase auth, not automated in this suite, so result
 * rendering (Zone 1 / Zone 2 cards) is covered by unit tests on the partition
 * helpers (apps/app/src/lib/josaa-zones.test.ts). Here we assert the form,
 * including the new optional JEE Advanced rank field, renders and is mobile-safe.
 */

import { test, expect } from '@playwright/test';
import { APP_URLS } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

const PAGE_PATH = '/tools/counseling/josaa-predictor';

test.use({ baseURL: APP_URLS.student });

test.describe('JoSAA Predictor — IIT/AAT pathway field', () => {
  test('renders the optional JEE Advanced rank field', async ({ page }) => {
    await page.goto(PAGE_PATH);
    await expect(page.getByRole('heading', { name: /JoSAA B\.Arch Predictor/i })).toBeVisible();
    await expect(page.getByLabel(/JEE Advanced rank \(optional/i)).toBeVisible();
  });

  test('Advanced rank field accepts numeric input', async ({ page }) => {
    await page.goto(PAGE_PATH);
    const adv = page.getByLabel(/JEE Advanced rank \(optional/i);
    await adv.fill('14500');
    await expect(adv).toHaveValue('14500');
  });
});

test.describe('JoSAA Predictor — IIT/AAT field mobile layout', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('no horizontal overflow with the new field on 375px', async ({ page }) => {
    await page.goto(PAGE_PATH);
    await page.getByRole('heading', { name: /JoSAA B\.Arch Predictor/i }).waitFor();
    await assertNoHorizontalOverflow(page);
  });

  test('Advanced rank field is at least 44px tall on mobile', async ({ page }) => {
    await page.goto(PAGE_PATH);
    const box = await page.getByLabel(/JEE Advanced rank \(optional/i).boundingBox();
    expect(box, 'advanced rank input must have a bounding box').not.toBeNull();
    if (box) expect(box.height).toBeGreaterThanOrEqual(44);
  });
});
```

- [ ] **Step 2: Run the test**

Run: `pnpm test:e2e tests/e2e/iit-aat-pathway-app.spec.ts --project=app-chrome --no-deps`
Expected: PASS (4 tests). If the app is not running locally, start it first with `pnpm dev:app` or rely on the Playwright `webServer` config.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/iit-aat-pathway-app.spec.ts
git commit -m "test(e2e): assert JoSAA predictor renders the optional JEE Advanced rank field"
```

---

## Final verification

- [ ] **Run the unit tests**

Run: `pnpm vitest run josaa-zones`
Expected: PASS.

- [ ] **Run the app type-check**

Run: `pnpm --filter @neram/tools-app type-check`
Expected: PASS. (The page is `// @ts-nocheck`, so the meaningful type safety is in `josaa-zones.ts`, which is type-checked.)

- [ ] **Manual smoke (signed in, single year):** Paper-2A rank only → IITs appear only in Zone 2 with the AAT banner and no Safe/Probable tag. Add a JEE Advanced rank → Zone 2 gains a real verdict.

- [ ] **Manual smoke (compare mode):** IITs leave the compare table and render in Zone 2.

- [ ] **Do NOT deploy.** Per project rules, stop after the code changes and tests. The user deploys on their own schedule.

---

## Notes / known constraints
- The pre-existing `tests/e2e/josaa-predictor-app.spec.ts` targets the old path `/tools/josaa-predictor` (301-redirects) and a stale label `JEE Main Paper 2 Rank`; it appears already out of date with the current form. This plan does not modify it to avoid scope creep. Flag separately if you want it refreshed.
- The optional Advanced-rank verdict makes a second API call only when the student fills that field (opt-in), so function-invocation cost stays proportional to genuine use.
- IIT verdict in compare mode is intentionally out of scope; compare mode shows IIT reference cutoffs for the latest selected year.
```
