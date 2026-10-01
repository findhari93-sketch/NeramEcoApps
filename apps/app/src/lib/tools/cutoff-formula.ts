/**
 * The B.Arch cutoff out of 400 used by state counselling such as TNEA: 12th
 * marks scaled to 200 plus the best valid NATA score out of 200. Shared by the
 * public demo and the full calculator so they can never disagree.
 */

export type BoardType =
  | 'CBSE'
  | 'ICSE'
  | 'TN_STATE'
  | 'KA_PUC'
  | 'AP_TS_IPE'
  | 'KERALA_HSE'
  | 'MAHARASHTRA_HSC'
  | 'WB_BOARD'
  | 'UP_BOARD'
  | 'BIHAR_BSEB'
  | 'RAJASTHAN_RBSE'
  | 'DIPLOMA'
  | 'OTHER';

export interface BoardConfig {
  label: string;
  maxMarks: number;
}

export const BOARD_CONFIG: Record<BoardType, BoardConfig> = {
  CBSE: { label: 'CBSE', maxMarks: 500 },
  ICSE: { label: 'ICSE / ISC', maxMarks: 500 },
  TN_STATE: { label: 'Tamil Nadu State Board', maxMarks: 600 },
  KA_PUC: { label: 'Karnataka PUC', maxMarks: 600 },
  AP_TS_IPE: { label: 'AP / Telangana (IPE)', maxMarks: 600 },
  KERALA_HSE: { label: 'Kerala HSE', maxMarks: 600 },
  MAHARASHTRA_HSC: { label: 'Maharashtra HSC', maxMarks: 650 },
  WB_BOARD: { label: 'West Bengal (WBCHSE)', maxMarks: 500 },
  UP_BOARD: { label: 'UP Board', maxMarks: 600 },
  BIHAR_BSEB: { label: 'Bihar (BSEB)', maxMarks: 500 },
  RAJASTHAN_RBSE: { label: 'Rajasthan (RBSE)', maxMarks: 500 },
  DIPLOMA: { label: '10+3 Diploma', maxMarks: 1000 },
  OTHER: { label: 'Other Board', maxMarks: 500 },
};

export interface NataAttempt {
  partA: string;
  partB: string;
}

export interface NataAttemptResult {
  total: number;
  isPartAEligible: boolean;
  isPartBEligible: boolean;
  isTotalEligible: boolean;
  isFullyEligible: boolean;
}

export function convertBoardMarks(marksSecured: number, maxMarks: number): number {
  if (maxMarks <= 0 || marksSecured < 0) return 0;
  return parseFloat(((marksSecured / maxMarks) * 200).toFixed(2));
}

export function checkBoardEligibility(marksSecured: number, maxMarks: number): boolean {
  if (maxMarks <= 0) return false;
  return (marksSecured / maxMarks) * 100 >= 45;
}

export function checkNataAttempt(partA: number, partB: number): NataAttemptResult {
  const total = partA + partB;
  // NATA 2026: No minimum raw score prescribed. Any non-zero score is valid.
  const isPartAEligible = partA > 0;
  const isPartBEligible = partB > 0;
  const isTotalEligible = total > 0;
  return {
    total,
    isPartAEligible,
    isPartBEligible,
    isTotalEligible,
    isFullyEligible: isPartAEligible && isPartBEligible && isTotalEligible,
  };
}

export function calculateBestNataScore(
  currentAttempts: NataAttempt[],
  hasPreviousYear: boolean,
  previousYearScore: number,
): { bestScore: number; explanation: string; prevYearInvalid: boolean } {
  const currentScores = currentAttempts.map(
    (a) => (parseFloat(a.partA) || 0) + (parseFloat(a.partB) || 0),
  );
  const validCurrentScores = currentScores.filter((s) => s > 0);
  const bestCurrentYear = validCurrentScores.length > 0 ? Math.max(...validCurrentScores) : 0;
  const numAttempts = currentAttempts.length;

  if (!hasPreviousYear || previousYearScore <= 0) {
    return {
      bestScore: bestCurrentYear,
      explanation:
        validCurrentScores.length > 1
          ? `Best of ${validCurrentScores.length} attempt(s) in current year`
          : 'Current year score',
      prevYearInvalid: false,
    };
  }

  if (numAttempts === 1) {
    const best = Math.max(previousYearScore, currentScores[0] || 0);
    return {
      bestScore: best,
      explanation: `Better of previous year (${previousYearScore}) and current year 1st attempt (${currentScores[0] || 0})`,
      prevYearInvalid: false,
    };
  } else if (numAttempts === 2) {
    const allScores = [previousYearScore, ...currentScores];
    const best = Math.max(...allScores);
    return {
      bestScore: best,
      explanation: `Best of 3 scores: previous year (${previousYearScore}) + 2 current year attempts`,
      prevYearInvalid: false,
    };
  } else {
    // NATA 2026: Max 2 attempts in Phase 1. If you appear in current year at all, previous year is invalid.
    return {
      bestScore: bestCurrentYear,
      explanation: `Best of ${validCurrentScores.length} attempt(s) in Phase 1. Previous year score becomes invalid when you take an attempt this year.`,
      prevYearInvalid: true,
    };
  }
}

/** Board marks plus one NATA attempt, out of 400: what the public demo shows. */
export function cutoffTotal(input: { marksSecured: number; maxMarks: number; partA: number; partB: number }): {
  boardOutOf200: number;
  nataOutOf200: number;
  total: number;
  boardPercent: number;
  boardEligible: boolean;
} {
  const boardOutOf200 = convertBoardMarks(input.marksSecured, input.maxMarks);
  const nataOutOf200 = Math.max(0, input.partA) + Math.max(0, input.partB);
  return {
    boardOutOf200,
    nataOutOf200,
    total: parseFloat((boardOutOf200 + nataOutOf200).toFixed(2)),
    boardPercent: input.maxMarks > 0 ? parseFloat(((input.marksSecured / input.maxMarks) * 100).toFixed(1)) : 0,
    boardEligible: checkBoardEligibility(input.marksSecured, input.maxMarks),
  };
}

/** What the demo hands to the full calculator after sign-in. */
export interface CutoffDemoInput {
  board?: string;
  maxMarks?: number;
  marksSecured?: number;
  partA?: number;
  partB?: number;
}

export function parseCutoffDemoInput(raw: Record<string, unknown> | null | undefined): CutoffDemoInput | null {
  if (!raw) return null;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);
  return {
    board: typeof raw.board === 'string' && raw.board in BOARD_CONFIG ? raw.board : undefined,
    maxMarks: num(raw.maxMarks),
    marksSecured: num(raw.marksSecured),
    partA: num(raw.partA),
    partB: num(raw.partB),
  };
}
