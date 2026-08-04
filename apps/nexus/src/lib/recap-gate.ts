/**
 * How many questions a checkpoint serves, and how many must be right.
 *
 * One definition, used by the write (PUT /sections) and by the read (the
 * student quiz route), so the two can never disagree about what passing means.
 *
 * The reason this exists as its own module: both columns are NULLable, and NULL
 * is not "unset" for either of them. The quiz route used to read them as
 *
 *   serve     = questions_to_serve ?? pool.length      // every question
 *   minToPass = min_questions_to_pass ?? totalCount    // every one correct
 *
 * so a checkpoint saved without a gate silently demanded a perfect score on the
 * whole bank of fifteen. Nothing surfaced it: the recap looked published and
 * healthy, and the wall only appeared once a student had watched the segment and
 * answered. Rows in exactly that state were written by the editor's Save before
 * the gate was stamped at the write, and they are still in the database, so
 * fixing the writer alone would not have made them passable.
 *
 * Treating a missing value as the classroom default is the safe reading. It can
 * make a checkpoint easier than someone intended, which a teacher can see and
 * correct, rather than harder than anyone intended, which reads to a student as
 * the feature being broken.
 */

import {
  FALLBACK_RECAP_DEFAULTS,
  questionsToPass,
  normaliseRecapDefaults,
  RECAP_DEFAULTS_KEY,
  type RecapDefaults,
} from './recap-defaults';

/** The two columns, as they come back from the database. */
export interface SectionGateColumns {
  questions_to_serve?: number | null;
  min_questions_to_pass?: number | null;
}

/** What a missing column falls back to. */
export interface GateSettings {
  /** How many of the bank to serve in one attempt. */
  questionsPerSegment: number;
  /** Share of the served questions that must be right, 1 to 100. */
  passPercentage: number;
}

export interface ResolvedGate {
  /** How many questions this attempt draws. Always at least 1. */
  serve: number;
  /** How many of those must be correct. Never more than `serve`. */
  minToPass: number;
}

/** The settings a recap with no overrides of its own falls back to. */
export const FALLBACK_GATE_SETTINGS: GateSettings = {
  questionsPerSegment: FALLBACK_RECAP_DEFAULTS.questions_per_segment,
  passPercentage: FALLBACK_RECAP_DEFAULTS.pass_percentage,
};

function positiveInt(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  return rounded > 0 ? rounded : null;
}

/**
 * Work out the gate for one checkpoint.
 *
 * `available` is how many questions the checkpoint actually holds. Serving is
 * capped by it, because a checkpoint that promises ten from a bank of four
 * cannot draw them, and a pass mark computed against ten it cannot serve is a
 * wall of exactly the kind this module exists to prevent.
 *
 * A value the teacher set explicitly is honoured as-is. Only a missing or
 * nonsensical one is derived.
 */
export function resolveSectionGate(
  section: SectionGateColumns | null | undefined,
  available: number,
  settings: GateSettings = FALLBACK_GATE_SETTINGS,
): ResolvedGate {
  const pool = Number.isFinite(available) ? Math.max(0, Math.round(available)) : 0;
  const wanted = positiveInt(settings.questionsPerSegment) ?? FALLBACK_GATE_SETTINGS.questionsPerSegment;

  const declaredServe = positiveInt(section?.questions_to_serve);
  // At least 1 even for an empty bank, so callers never divide by zero. A
  // checkpoint with no questions is caught earlier, by the route.
  const serve = Math.max(1, Math.min(pool || 1, declaredServe ?? wanted));

  const declaredPass = positiveInt(section?.min_questions_to_pass);
  const minToPass = declaredPass
    ? Math.min(serve, declaredPass)
    : questionsToPass(serve, settings.passPercentage);

  return { serve, minToPass };
}

/** True when this row needs the recap's settings to be read to fill a blank. */
export function gateIsIncomplete(section: SectionGateColumns | null | undefined): boolean {
  return positiveInt(section?.questions_to_serve) === null || positiveInt(section?.min_questions_to_pass) === null;
}

/**
 * Read the settings a blank column falls back to: the recap's own overrides
 * first, then the classroom defaults.
 *
 * Only worth calling when `gateIsIncomplete` says a column is missing. A
 * checkpoint the pipeline stamped carries both numbers already, so the common
 * path costs no extra query.
 */
export async function readGateSettings(
  supabase: any,
  recapId: string | null | undefined,
): Promise<GateSettings> {
  let defaults: RecapDefaults = { ...FALLBACK_RECAP_DEFAULTS };
  try {
    const { data } = await supabase
      .from('nexus_settings')
      .select('value')
      .eq('key', RECAP_DEFAULTS_KEY)
      .maybeSingle();
    if (data) defaults = normaliseRecapDefaults(data.value);
  } catch {
    // A student mid-quiz must not see an error because a settings row was
    // unreadable. The fallback is the same shape the migration seeds.
  }

  let recap: { questions_per_segment?: number | null; pass_percentage?: number | null } | null = null;
  if (recapId) {
    try {
      const { data } = await supabase
        .from('nexus_class_recaps')
        .select('questions_per_segment, pass_percentage')
        .eq('id', recapId)
        .maybeSingle();
      recap = data ?? null;
    } catch {
      // Same reasoning: fall back rather than fail the attempt.
    }
  }

  return {
    questionsPerSegment: positiveInt(recap?.questions_per_segment) ?? defaults.questions_per_segment,
    passPercentage: positiveInt(recap?.pass_percentage) ?? defaults.pass_percentage,
  };
}
