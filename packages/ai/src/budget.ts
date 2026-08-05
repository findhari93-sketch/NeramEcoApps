/**
 * The gate every Gemini call passes through before it costs anything.
 *
 * This is the part that makes the difference between "we can see what we spent"
 * and "we cannot spend more than this". Google's own project spend cap is the
 * outer backstop and should also be set, but it is all-or-nothing: when it
 * trips, every feature dies at once with no warning and no attribution. This
 * gate refuses the right feature, records what it refused, and hands the user a
 * prompt to run by hand instead.
 *
 * Order matters, cheapest and most decisive check first:
 *
 *   1. master kill switch
 *   2. feature mode (off / manual)
 *   3. month-to-date cap
 *   4. today's cap
 *   5. that feature's own daily call cap
 *   6. one visitor's hourly cap (public chatbots)
 *
 * Deliberately fails OPEN on a database error. If Supabase is unreachable the
 * choice is between blocking every AI feature in the ecosystem and risking a
 * few unmetered calls; Google's project cap still bounds the damage, and a
 * teacher mid-lesson should not be stopped by a monitoring outage. The failure
 * is logged loudly.
 */

import {
  countAiCallsForClient,
  getAiSpend,
  getAiSpendForFeature,
  getNexusSetting,
  utcDay,
  utcMonthStart,
} from '@neram/database';

import {
  AI_CONTROLS_KEY,
  AiControls,
  DEFAULT_AI_CONTROLS,
  featureById,
  modeFor,
  resolveControls,
} from './features';

export type BudgetReason =
  | 'auto'
  | 'manual'
  | 'feature_off'
  | 'master_off'
  | 'unknown_feature'
  | 'monthly_cap'
  | 'daily_cap'
  | 'feature_cap'
  | 'client_cap';

export interface BudgetVerdict {
  allowed: boolean;
  reason: BudgetReason;
  /** Shown to the user, so it says what to do next rather than what went wrong. */
  message: string;
  controls: AiControls;
}

/**
 * How long a controls read and a spend read are reused within one process.
 *
 * Short on purpose. Fifteen seconds of staleness on a $2 daily cap is worth at
 * most a few cents of overshoot, and it keeps two round trips off the front of
 * every AI request. Do not raise it far: the master kill switch is only as fast
 * as this number, and the whole point of a kill switch is that it is immediate.
 */
const CACHE_TTL_MS = 15_000;

interface Cached<T> {
  value: T;
  at: number;
}

let controlsCache: Cached<AiControls> | null = null;
let spendCache: Cached<{ today: number; month: number }> | null = null;

/** Drops the caches. Used by the settings PATCH route and by tests. */
export function clearBudgetCache(): void {
  controlsCache = null;
  spendCache = null;
}

/** The current controls, from nexus_settings, merged over the defaults. */
export async function getAiControls(): Promise<AiControls> {
  const now = Date.now();
  if (controlsCache && now - controlsCache.at < CACHE_TTL_MS) return controlsCache.value;

  try {
    const row = await getNexusSetting(AI_CONTROLS_KEY);
    const value = resolveControls(row?.value);
    controlsCache = { value, at: now };
    return value;
  } catch (err) {
    console.error('[ai-budget] could not read ai_controls, using defaults:', err);
    return { ...DEFAULT_AI_CONTROLS };
  }
}

export async function checkBudget(
  featureId: string,
  /** Salted hash of one anonymous visitor. Public chatbots only. */
  clientKey?: string | null
): Promise<BudgetVerdict> {
  const controls = await getAiControls();

  if (!controls.masterEnabled) {
    return {
      allowed: false,
      reason: 'master_off',
      message: 'AI is switched off for the whole site. Turn it back on in Admin, AI usage.',
      controls,
    };
  }

  const def = featureById(featureId);
  if (!def) {
    // Not a real feature id. Refusing rather than billing an untracked call is
    // the safer half of the tradeoff, and it surfaces the bug immediately.
    return {
      allowed: false,
      reason: 'unknown_feature',
      message: `Unknown AI feature "${featureId}". It needs an entry in packages/ai/src/features.ts.`,
      controls,
    };
  }

  const mode = modeFor(featureId, controls);
  if (mode === 'off') {
    return {
      allowed: false,
      reason: 'feature_off',
      message: `"${def.label}" is switched off.`,
      controls,
    };
  }
  if (mode === 'manual') {
    return {
      allowed: false,
      reason: 'manual',
      message: `"${def.label}" is set to manual. Copy the prompt below and run it yourself.`,
      controls,
    };
  }

  try {
    const { today, month } = await getSpend();

    if (month >= controls.monthlyCapUsd) {
      return {
        allowed: false,
        reason: 'monthly_cap',
        message: `This month's AI budget of $${controls.monthlyCapUsd} is used up. Raise it in Admin, AI usage, or run this one by hand.`,
        controls,
      };
    }

    if (today >= controls.dailyCapUsd) {
      return {
        allowed: false,
        reason: 'daily_cap',
        message: `Today's AI budget of $${controls.dailyCapUsd} is used up. It resets at midnight UTC.`,
        controls,
      };
    }

    if (def.dailyCallCap) {
      const featureToday = await getAiSpendForFeature(featureId, utcDay(), utcDay());
      if (featureToday.calls >= def.dailyCallCap) {
        return {
          allowed: false,
          reason: 'feature_cap',
          message: `"${def.label}" has hit its limit of ${def.dailyCallCap} runs today.`,
          controls,
        };
      }
    }

    // Rule 6: one visitor cannot spend everyone else's budget. Checked last
    // because it is the only rule that costs a query per caller rather than a
    // cached one, and the cheaper rules above will already have refused most
    // of the traffic worth refusing.
    if (def.perClientHourlyCap && clientKey) {
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const used = await countAiCallsForClient(clientKey, since);
      if (used >= def.perClientHourlyCap) {
        return {
          allowed: false,
          reason: 'client_cap',
          message: 'You have asked a lot of questions in the last hour. Please try again shortly.',
          controls,
        };
      }
    }
  } catch (err) {
    // Fail open. See the note at the top of the file.
    console.error('[ai-budget] spend lookup failed, allowing the call:', err);
  }

  return { allowed: true, reason: 'auto', message: '', controls };
}

async function getSpend(): Promise<{ today: number; month: number }> {
  const now = Date.now();
  if (spendCache && now - spendCache.at < CACHE_TTL_MS) return spendCache.value;

  const day = utcDay();
  const [todayTotals, monthTotals] = await Promise.all([
    getAiSpend(day, day),
    getAiSpend(utcMonthStart(), day),
  ]);

  const value = { today: todayTotals.costUsd, month: monthTotals.costUsd };
  spendCache = { value, at: now };
  return value;
}

/**
 * Adds a just-finished call to the cached spend.
 *
 * Without this, a burst inside one cache window would all see the same stale
 * total and sail past the cap together. The rollup in Postgres is still the
 * source of truth; this only stops the cache from being optimistic.
 */
export function noteSpend(usd: number | null): void {
  if (!spendCache || !usd) return;
  spendCache.value = {
    today: spendCache.value.today + usd,
    month: spendCache.value.month + usd,
  };
}
