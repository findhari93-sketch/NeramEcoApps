/**
 * The four numbers behind every generated recap, and where they come from.
 *
 * Stored as one `nexus_settings` row under `recap_defaults`, the same shape and
 * table as `feature_flags`. A per-recap column overrides any of them, so the
 * settings row is a default and never a constraint.
 *
 * The pass mark is a PERCENTAGE, which is the point of this module. It used to
 * be an absolute count, and a count silently breaks whenever the number of
 * questions moves: a checkpoint that generated 8 usable questions instead of 10
 * still demanded "8 correct", which is every single one, with no retry that
 * could ever be easier than the first attempt.
 */

/** The settings key under which the defaults live in `nexus_settings`. */
export const RECAP_DEFAULTS_KEY = 'recap_defaults';

export interface RecapDefaults {
  /** Roughly how long one checkpoint segment should be. */
  target_segment_seconds: number;
  /** How many questions to BANK per segment. */
  question_pool_per_segment: number;
  /** How many of the bank to SERVE in one attempt. */
  questions_per_segment: number;
  /** Share of the served questions a student must get right, 1 to 100. */
  pass_percentage: number;
}

/**
 * Used when the settings row is missing or unreadable.
 *
 * Deliberately the same values the migration seeds, so a database that has not
 * run it yet behaves identically to one that has. Fifteen minute segments, a
 * bank of fifteen with ten served, and seven of those ten to pass.
 */
export const FALLBACK_RECAP_DEFAULTS: RecapDefaults = {
  target_segment_seconds: 900,
  question_pool_per_segment: 15,
  questions_per_segment: 10,
  pass_percentage: 70,
};

function int(value: unknown, fallback: number, lo: number, hi: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

/** Coerce whatever is in the JSONB into something the generator can rely on. */
export function normaliseRecapDefaults(raw: unknown): RecapDefaults {
  const v = (raw ?? {}) as Record<string, unknown>;
  const pool = int(
    v.question_pool_per_segment,
    FALLBACK_RECAP_DEFAULTS.question_pool_per_segment,
    1,
    40,
  );
  return {
    target_segment_seconds: int(
      v.target_segment_seconds,
      FALLBACK_RECAP_DEFAULTS.target_segment_seconds,
      60,
      1800,
    ),
    question_pool_per_segment: pool,
    // Never more than the bank holds. Serving the whole bank would make a retry
    // re-ask the same questions, which a student can beat by remembering
    // positions rather than rewatching.
    questions_per_segment: Math.min(
      pool,
      int(v.questions_per_segment, FALLBACK_RECAP_DEFAULTS.questions_per_segment, 1, 40),
    ),
    pass_percentage: int(v.pass_percentage, FALLBACK_RECAP_DEFAULTS.pass_percentage, 1, 100),
  };
}

/**
 * How many correct answers a percentage works out to.
 *
 * Rounded UP, so 70% of 10 is 7 and 70% of 8 is 6. At least one, and never more
 * than the number actually served: a pass mark a student cannot reach is a wall,
 * and this is exactly where the old absolute count produced them.
 */
export function questionsToPass(questionsServed: number, passPercentage: number): number {
  // Guarded rather than trusted. Math.round(NaN) is NaN and every operation
  // after it stays NaN, so an undefined column or a bad parse would write a NaN
  // pass mark straight into a checkpoint, where it compares false against every
  // score a student can get.
  const served = Number.isFinite(questionsServed) ? Math.max(1, Math.round(questionsServed)) : 1;
  const pct = Number.isFinite(passPercentage)
    ? Math.max(1, Math.min(100, Math.round(passPercentage)))
    : FALLBACK_RECAP_DEFAULTS.pass_percentage;
  return Math.max(1, Math.min(served, Math.ceil((served * pct) / 100)));
}

/** Read the classroom-wide defaults. Never throws; falls back on any problem. */
export async function readRecapDefaults(supabase: any): Promise<RecapDefaults> {
  try {
    const { data, error } = await supabase
      .from('nexus_settings')
      .select('value')
      .eq('key', RECAP_DEFAULTS_KEY)
      .maybeSingle();
    if (error || !data) return { ...FALLBACK_RECAP_DEFAULTS };
    return normaliseRecapDefaults(data.value);
  } catch {
    // A generation sweep must not die because a settings row is unreadable.
    return { ...FALLBACK_RECAP_DEFAULTS };
  }
}
