// @ts-nocheck - Reference file under apps/app/Docs/. Not part of the build.
// The active KEAM predictor lives in packages/database/src/queries/counseling.ts
// as predictCollegesFromKeamCutoffs.
/**
 * KEAM B.Arch college predictor — cutoff-based.
 *
 * Strategy:
 *  1) For a given student rank R and category C, look up the cutoff
 *     (opening_rank, closing_rank) for every (college, seat_type)
 *     they're eligible for in the selected phase dataset.
 *  2) Eligibility:
 *       - Everyone can compete on SM (State Merit).
 *       - Community students can compete on their own community seat_type
 *         (e.g. EZ, MU, BH, VK, LA, KN, DV, BX), reservation seats (SC, ST),
 *         and EWS where applicable. We list the eligible seat_types
 *         in CATEGORY_TO_SEAT_TYPES.
 *  3) Classify chance:
 *       - "Safe"        : rank ≤ closing_rank − safety_buffer
 *       - "Likely"      : closing_rank − safety_buffer < rank ≤ closing_rank
 *       - "Borderline"  : closing_rank < rank ≤ closing_rank + borderline_buffer
 *       - "Unlikely"    : rank > closing_rank + borderline_buffer
 *
 * PHASE STRATEGY (2025 data available in keam_cutoffs view):
 *  - Phase 2 (Final, 09-08-2025, 553 allotments) is the GROUND TRUTH for
 *    college prediction. Default phase = "Phase2".
 *  - Phase 1 (Provisional, 29-07-2025, 660 allotments) is the reference
 *    for "seat movement" analytics — showing how cutoffs shifted between
 *    rounds as candidates dropped/upgraded. Phase 1 closing ranks are
 *    typically TIGHTER (better) than Phase 2 closing ranks for the same
 *    seat — example: TVE/SM closed at rank 43 in Phase 1, 54 in Phase 2.
 *  - Phase 1 has 107 MORE entries than Phase 2 (660 vs 553) because some
 *    candidates dropped/upgraded between rounds. Useful for movement analytics
 *    but not for "is this seat available for me" predictions.
 *
 * CATEGORY SOURCE:
 *  - Phase 2 rows have `candidate_category` populated (the student's own
 *    category: GN, MU, EZ, VK, LA, EW, BX, BH, SC, ST, DV, KN, KU).
 *  - Phase 1 rows have candidate_category = NULL (the published PDF
 *    doesn't expose it). seat_type is always populated in both phases.
 *
 * IMPORTANT CAVEATS to disclose to students in the UI:
 *  - 2025 data — 2026 cutoffs may move ±10–20%.
 *  - Seat matrix may change (new colleges, closed colleges).
 *  - Use as guidance, not a guarantee.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type Category =
  | "GENERAL" | "EWS"
  | "EZHAVA" | "MUSLIM" | "BH" | "VISWAKARMA" | "LATIN_CATHOLIC" | "KUSAVAN" | "DHEEVARA" | "BX"
  | "SC" | "ST";

/** Which seat_types in the 2025 Phase-1 data each category can compete for. */
export const CATEGORY_TO_SEAT_TYPES: Record<Category, string[]> = {
  GENERAL:        ["SM"],
  EWS:            ["SM", "EW", "SM-EW", "FL-EW"],
  EZHAVA:         ["SM", "EZ", "SM-EZ", "FL-EZ"],
  MUSLIM:         ["SM", "MU", "SM-MU", "FL-MU"],
  BH:             ["SM", "BH", "SM-BH", "FL-BH"],
  VISWAKARMA:     ["SM", "VK", "SM-VK", "FL-VK"],
  LATIN_CATHOLIC: ["SM", "LA", "SM-LA", "FL-LA"],
  KUSAVAN:        ["SM", "KN"],
  DHEEVARA:       ["SM", "DV"],
  BX:             ["SM", "BX"],
  SC:             ["SM", "SC"],
  ST:             ["SM", "ST"],
};

export type Phase = "Phase1" | "Phase2";

export interface PredictorInput {
  rank: number;
  category: Category;
  /** Which allotment phase to query. Default "Phase2" (final allotment = ground truth for college prediction). */
  phase?: Phase;
  /** "Safe" cushion: how many positions below the closing rank to treat as a confident yes. */
  safetyBuffer?: number;       // default 50
  /** Borderline cushion: how many positions above closing rank we still consider a long-shot. */
  borderlineBuffer?: number;   // default 100
}

export type Chance = "Safe" | "Likely" | "Borderline" | "Unlikely";

export interface PredictorRow {
  college_code: string;
  college_name: string;
  town: string;
  district: string;
  college_type: string;
  seat_type: string;
  seat_type_meaning: string;
  seats_filled: number;
  opening_rank: number;
  closing_rank: number;
  chance: Chance;
}

function classify(rank: number, closing: number, safetyBuf: number, borderlineBuf: number): Chance {
  if (rank <= closing - safetyBuf) return "Safe";
  if (rank <= closing)             return "Likely";
  if (rank <= closing + borderlineBuf) return "Borderline";
  return "Unlikely";
}

/**
 * Run predictor against the Supabase `keam_cutoffs` view.
 * Filters to year=2025, phase=input.phase ?? "Phase2", course=Architecture.
 * Phase 2 is the final allotment and represents ground truth; pass
 * phase="Phase1" only for "seat movement" analytics or historical context.
 */
export async function predictColleges(
  supabase: SupabaseClient,
  input: PredictorInput
): Promise<PredictorRow[]> {
  const safetyBuf      = input.safetyBuffer ?? 50;
  const borderlineBuf  = input.borderlineBuffer ?? 100;
  const phase          = input.phase ?? "Phase2";
  const eligibleSeatTypes = CATEGORY_TO_SEAT_TYPES[input.category];

  const { data, error } = await supabase
    .from("keam_cutoffs")
    .select("*")
    .eq("year", 2025)
    .eq("phase", phase)
    .eq("course", "Architecture")
    .in("seat_type", eligibleSeatTypes);

  if (error) throw error;
  if (!data) return [];

  const rows: PredictorRow[] = data.map((r: any) => ({
    college_code:      r.college_code,
    college_name:      r.college_name,
    town:              r.town,
    district:          r.district,
    college_type:      r.college_type,
    seat_type:         r.seat_type,
    seat_type_meaning: r.seat_type_meaning,
    seats_filled:      r.seats_filled,
    opening_rank:      r.opening_rank,
    closing_rank:      r.closing_rank,
    chance:            classify(input.rank, r.closing_rank, safetyBuf, borderlineBuf),
  }));

  // Sort: Safe -> Likely -> Borderline -> Unlikely, then by closing_rank ascending (best colleges first)
  const order: Record<Chance, number> = { Safe: 0, Likely: 1, Borderline: 2, Unlikely: 3 };
  rows.sort((a, b) => order[a.chance] - order[b.chance] || a.closing_rank - b.closing_rank);

  return rows;
}
