# IIT B.Arch / AAT Pathway in the JoSAA Predictor: Design

Date: 2026-06-13
Status: Draft for review
Owner: App Dev (apps/app) + Marketing Dev (apps/marketing) + Database (shared)

## 1. Problem

The JoSAA B.Arch predictor at `app.neramclasses.com/tools/counseling/josaa-predictor`
takes a single input, the student's **JEE Main Paper 2A rank**, and compares it
against every closing rank in the dataset, tagging each Safe / Probable / Reach.

For the three IITs that offer B.Arch (Kharagpur, Roorkee, BHU Varanasi) this
comparison is invalid. Those institutes do not admit on JEE Main Paper 2A rank.
Their JoSAA closing ranks are **JEE Advanced All India Ranks**, and admission
also requires a **Pass in the AAT** (Architecture Aptitude Test), a separate
pass/fail test. The student's Paper 2A rank is a position on a completely
different exam's rank list, so a verdict like "IIT Kharagpur, Safe" is
meaningless and actively misleading.

Confirmed from the 2025 JoSAA archive (Gender-Neutral, OPEN, AI quota):

| IIT | JoSAA closing rank 2025 (= JEE Advanced AIR) |
|---|---|
| IIT Roorkee | 16,596 |
| IIT Kharagpur | 17,823 |
| IIT (BHU) Varanasi | 19,019 |

A Paper 2A rank of, say, 8,000 looks "Safe" against 17,823, but those two
numbers come from different exams and cannot be compared.

### Domain facts (authoritative)

- Only 3 IITs offer B.Arch: Kharagpur, Roorkee, BHU Varanasi.
- IIT B.Arch pipeline: JEE Main Paper 1 to qualify for JEE Advanced, clear JEE
  Advanced, register for and Pass AAT, then JoSAA seat allotment by JEE Advanced
  rank and category.
- AAT publishes no rank and no marks. It is Pass or Fail only. A Fail closes off
  every IIT B.Arch seat regardless of JEE Advanced rank.
- NITs, SPAs, and GFTIs admit B.Arch on JEE Main Paper 2A rank (NATA also used at
  some). No AAT involved.
- This is already stated correctly in `apps/marketing/.../concepts/aat-explained`
  and `apps/marketing/.../components/aat/data/aatContent.ts`. The predictor's
  output simply did not honor it.

## 2. Goals and non-goals

### Goals
1. Stop presenting IITs with a Safe/Probable/Reach verdict derived from a JEE
   Main Paper 2A rank.
2. Present IIT B.Arch as its own pathway (JEE Advanced rank + AAT Pass gate),
   reusing existing AAT content.
3. Let a student who has a JEE Advanced rank get a genuine, correctly-scaled
   IIT B.Arch prediction.
4. Keep marketing copy consistent with the corrected tool.
5. Correct the wrong AIR ranges in the `aat-explained` article.

### Non-goals
- No new data scraping. The IIT closing ranks already exist in the dataset.
- No B.Plan support (separate roadmap item).
- No change to the NIT/SPA/GFTI prediction logic, which is correct today.
- No database migration (the fix is in the UI/data layer).

## 3. Design

### 3.1 Two result zones

After the student submits their JEE Main Paper 2A rank, results render in two
clearly separated zones instead of one flat list.

**Zone 1: "Seats your JEE Main Paper 2A rank can win"**
NITs, SPAs, GFTIs. Existing Safe / Probable / Reach grouping, unchanged. These
institutes genuinely admit on Paper 2A rank.

**Zone 2: "IIT B.Arch, a separate exam pathway"**
The 3 IITs. No Safe/Probable/Reach tag derived from the Paper 2A rank. Instead:
- A header explaining the pathway in one line: IIT B.Arch is filled by JEE
  Advanced rank plus an AAT Pass, not your JEE Main Paper 2A rank.
- A compact 3-stage pipeline strip (Qualify JEE Advanced, Pass AAT, JoSAA
  allotment by Advanced rank).
- Each IIT card shows the previous-year closing rank, explicitly labeled as a
  JEE Advanced rank (for example, "JEE Advanced closing rank 2025: 17,823"). The
  number is shown for reference and is never compared to the student's Paper 2A
  number.
- A button linking to the existing `/counseling/concepts/aat-explained` and
  `/aat-2026` pages.

### 3.2 Optional JEE Advanced rank predictor

Add one optional field to the form: "Taken JEE Advanced? Enter your Advanced All
India Rank." It reuses the category and CRL/category rank-type the student has
already chosen (same category across both exams; only the rank number differs).

- If filled: Zone 2 becomes a real predictor. The Advanced rank is matched
  against the IIT closing ranks (correct comparison), producing Safe / Probable /
  Reach for the IITs, with a persistent reminder that every verdict is
  conditional on Passing AAT (Pass/Fail gate).
- If empty: Zone 2 stays in reference mode (closing ranks plus explainer). No
  verdict is shown for a student who only has a Paper 2A rank.

The AAT gate is presented as a stated prerequisite, not predicted. Copy in Zone 2
makes clear: without an AAT Pass, none of these seats are attainable regardless
of JEE Advanced rank.

### 3.3 Why two zones, not a warning badge

A student doing architecture faces two distinct admission ladders: Paper 2A /
NATA to NIT/SPA/GFTI, and JEE Advanced + AAT to the 3 IITs. Flattening both into
one ranked list hides that structure and produces the false verdict. Separating
them makes the real decision visible and turns the data issue into accurate
guidance.

## 4. Implementation approach (UI/data layer, no migration)

The prediction rows already carry `institute_type: 'IIT'`, so:

1. From the existing single prediction call (Paper 2A rank), partition rows:
   - `institute_type !== 'IIT'` to Zone 1 (keep verdict).
   - `institute_type === 'IIT'` to Zone 2 (strip verdict, relabel rank as JEE
     Advanced closing rank, attach AAT note). Zero extra cost.
2. The optional Advanced-rank field, when filled, triggers a second call to the
   same `predict_colleges_v2` RPC with `rank = advancedRank` and the same
   category / rankType / pwd / gender. Keep only `institute_type === 'IIT'` rows
   from that response for Zone 2 verdicts. No new RPC, no schema change.

Notes:
- IITs only have an AI (All India) quota, so home-state quota inference is
  irrelevant for Zone 2. The RPC already returns AI rows for IITs.
- IIT OPEN closing ranks are JEE Advanced CRL; IIT reserved-category closing
  ranks are JEE Advanced category ranks. Reusing the student's existing
  category / rankType selection keeps this correct.

### Files likely touched
- `apps/app/src/app/(protected)/tools/counseling/josaa-predictor/page.tsx`
  (partition logic, Zone 1 / Zone 2 rendering, optional Advanced-rank field,
  second fetch).
- `apps/app/src/app/api/tools/josaa-predictor/route.ts` (accept an optional
  `advancedRank` and return IIT verdicts, OR keep the second call client-side;
  decide in the plan. Leaning client-side second call to avoid touching the
  route.)
- `apps/marketing/src/lib/tools/configs/josaa-barch-predictor.ts` (subtitle and
  the Safe/Probable/Reach FAQ).
- `apps/marketing/src/app/[locale]/counseling/concepts/aat-explained/page.tsx`
  (correct the AIR ranges to match the JoSAA archive).
- `tests/e2e/*app*.spec.ts` (new assertions).

## 5. Content changes

### 5.1 Marketing predictor config
- Subtitle: keep the "all 21 institutes" framing but make explicit that the 3
  IITs are shown as a separate JEE Advanced + AAT pathway, not folded into the
  Paper 2A Safe/Probable/Reach grouping.
- FAQ "How are Safe, Probable, and Reach calculated": add that IITs are excluded
  from this grouping because they admit on JEE Advanced rank + AAT, and are shown
  in a dedicated section.
- `contextContent` already says IITs admit through JEE Advanced. Light touch only.

### 5.2 aat-explained article correction
Replace the inaccurate AIR ranges (Roorkee "1,500 to 2,800", Kharagpur "2,000 to
3,500") with ranges derived from the actual JoSAA 2023 to 2025 closing ranks
(OPEN Gender-Neutral approximately 16k to 19k, with reserved-category ranks
lower). Exact replacement numbers to be pulled from the dataset during
implementation so the article and the tool agree.

## 6. Edge cases
- No IIT rows returned for the rank: Zone 2 still renders in reference mode with
  the 3 IITs and their latest closing ranks plus the AAT explainer.
- Female-only seats: handled by the existing gender toggle, applies to both zones.
- Reserved category with PwD: existing seat-type variant logic applies to the
  Advanced-rank call unchanged.
- Compare-across-years mode: Zone 2 reference cutoffs should respect the selected
  years; IIT verdicts (if Advanced rank entered) compare per year like Zone 1.
- Student enters an obviously-wrong Advanced rank (for example a Paper 2A rank by
  mistake): we cannot detect intent, but the AAT-gate copy and the "JEE Advanced"
  field label reduce the risk. Validate range 1 to 250,000.

## 7. Tests (per CLAUDE.md testing mandate)
- IITs never appear in the Zone 1 Safe/Probable/Reach groups for a Paper 2A rank.
- Zone 2 renders with the AAT pathway note and labeled JEE Advanced closing ranks.
- Entering a JEE Advanced rank produces an IIT verdict in Zone 2, with the AAT
  Pass caveat present.
- Mobile viewport 375px: no horizontal overflow, touch targets >= 44px.
- Empty-state: rank that matches no NIT/SPA/GFTI still shows Zone 2 reference.

## 8. Rollout and risk
- UI/data-layer only, no DB migration, so Vercel/Supabase cost stays flat.
- Reversible: zoning is presentation logic over existing data.
- The only cross-app coordination is the marketing copy, which is independent of
  the app change and can ship together or separately.

## 9. Decisions (resolved 2026-06-13)
1. Full build now: 2 zones plus the optional JEE Advanced rank predictor. Approved.
2. AAT acknowledgement: persistent AAT-gate banner only, no separate toggle.
   Approved.
3. Scope is B.Arch only. B.Plan stays out (already a non-goal). Confirmed.
