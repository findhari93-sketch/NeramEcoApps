/**
 * Draft a submitted drawing automatically: turn it upright, score it, tag it.
 *
 * Three callers, one path:
 *   - POST /api/drawing/submissions/[id]/auto-draft, fired by the student's
 *     phone right after submitting, so the draft is usually waiting before a
 *     teacher opens the sheet.
 *   - POST /api/drawing/evaluations/sweep, fired when a teacher opens the
 *     Drawing Reviews queue, for everything that arrived another way (exam
 *     drawings, a phone that went offline, sheets from before this existed).
 *   - POST /api/drawing/evaluations, "Draft again", with force.
 *
 * CLAIM FIRST. Two of those can reach one sheet at the same moment. So a run
 * inserts a 'running' drawing_evaluation row before spending anything, and the
 * unique index uq_drawing_evaluation_ai_live (one running or draft AI row per
 * submission) makes the second insert fail with 23505. The loser answers
 * 'busy' and pays nothing. A running row older than STALE_CLAIM_MS is a run
 * that died (a function timeout leaves no chance to clean up) and is
 * superseded and reclaimed once.
 *
 * Never throws. Every outcome is a state, because both automatic callers fire
 * and forget: a failure must leave the sheet exactly where it was, waiting for
 * a teacher, who can always review without a draft.
 */

import { AiBlockedError, checkBudget } from '@neram/ai';
import { getNexusSetting } from '@neram/database';
import { getSubmissionTags, listDrawingTags, setSubmissionTags } from '@neram/database/queries/nexus';

import { describeError, messageOf } from '@/lib/api-errors';
import { STALE_CLAIM_MS, isStaleClaim, supersedeAiDrafts } from '@/lib/drawing-eval/claim-state';
import { DRAWING_EVAL_FEATURE, evaluateSubmission } from '@/lib/drawing-eval/evaluate';
import { PROMPT_VERSION, type EvalMode } from '@/lib/drawing-eval/schema';
import { detectAndFixOrientation, type OrientationOutcome } from '@/lib/drawing-orientation';
import { heldSubmissionIds } from '@/lib/drawing-hold';
import { FEATURE_FLAGS_KEY, isFeatureEnabled, resolveFlags } from '@/lib/feature-flags';

export type AutoDraftState = 'drafted' | 'busy' | 'skipped' | 'blocked' | 'failed';

export interface AutoDraftResult {
  state: AutoDraftState;
  /**
   * A short code, never prose, except for 'failed' where it is the error.
   *  blocked: 'flag_off' | a BudgetReason ('feature_off', 'master_off', 'daily_cap', ...) | 'rate_limited'
   *  skipped: 'not_found' | 'sketchbook' | 'not_submitted' | 'already_drafted' | 'held'
   *  busy:    'running'
   */
  reason?: string;
  /** Clockwise degrees the sheet was turned before drafting, null when left as it was. */
  rotatedDeg?: number | null;
  /** Tags the draft chose. Already added to the sheet, never replacing a tag it had. */
  tags?: string[];
  evaluationId?: string;
  mode?: EvalMode;
}

export interface AutoDraftOptions {
  /** users.id to attribute the AI spend to. */
  actorId?: string | null;
  /** Replace an existing draft ("Draft again"). Staff only, enforced by the routes. */
  force?: boolean;
  /** Injected in tests. */
  now?: () => Date;
}

export { STALE_CLAIM_MS, isStaleClaim, supersedeAiDrafts };

/** AI rows that mean "this sheet already has a draft, or had one a teacher used". */
const SETTLED_AI_STATUSES = ['draft', 'reviewed', 'released'];

const UNIQUE_VIOLATION = '23505';

export type AutoDraftGate =
  | { allowed: true }
  | { allowed: false; reason: string; message: string };

/**
 * The two switches a draft needs, checked before anything is read or claimed:
 * the staff.drawing-eval flag, and the shared AI budget for nexus.drawing-eval.
 */
export async function autoDraftGate(): Promise<AutoDraftGate> {
  const setting = await getNexusSetting(FEATURE_FLAGS_KEY);
  const flags = resolveFlags((setting?.value as Record<string, boolean>) || {});
  if (!isFeatureEnabled('staff.drawing-eval', flags)) {
    return { allowed: false, reason: 'flag_off', message: 'AI drawing evaluation is switched off.' };
  }
  const verdict = await checkBudget(DRAWING_EVAL_FEATURE);
  if (!verdict.allowed) return { allowed: false, reason: verdict.reason, message: verdict.message };
  return { allowed: true };
}

type ClaimOutcome =
  | { kind: 'claimed'; id: string }
  | { kind: 'busy' }
  | { kind: 'already_drafted' }
  | { kind: 'error'; message: string };

async function insertClaim(admin: any, submissionId: string, actorId: string | null) {
  return admin
    .from('drawing_evaluation')
    .insert({
      submission_id: submissionId,
      source: 'ai',
      status: 'running',
      provider: 'gemini',
      // Required by the table. Replaced with the real version when the draft lands.
      prompt_version: PROMPT_VERSION,
      created_by: actorId,
    })
    .select('id')
    .single();
}

async function claim(admin: any, submissionId: string, actorId: string | null, now: Date): Promise<ClaimOutcome> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const { data, error } = await insertClaim(admin, submissionId, actorId);
    if (!error && data?.id) return { kind: 'claimed', id: data.id as string };
    if (error?.code !== UNIQUE_VIOLATION) {
      return { kind: 'error', message: describeError(error ?? 'The claim returned no row.') };
    }

    // Someone holds the sheet. Find out who.
    const { data: live } = await admin
      .from('drawing_evaluation')
      .select('id, status, created_at')
      .eq('submission_id', submissionId)
      .eq('source', 'ai')
      .in('status', ['running', 'draft'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (live?.status === 'draft') return { kind: 'already_drafted' };
    if (live?.status === 'running' && !isStaleClaim(live.created_at, now)) return { kind: 'busy' };
    if (attempt === 2) return { kind: 'busy' };

    if (live?.status === 'running') {
      // A run that died. Retire it, guarded so a run that finishes at this
      // very moment keeps its draft, then try once more.
      await admin
        .from('drawing_evaluation')
        .update({ status: 'superseded', error: 'Abandoned: the run did not finish within ten minutes.' })
        .eq('id', live.id)
        .eq('status', 'running');
    }
  }
  return { kind: 'busy' };
}

async function releaseClaim(admin: any, claimId: string): Promise<void> {
  // Deleted, not marked: a refusal cost nothing and should leave no trace that
  // would keep the sweep from trying again once AI is switched back on.
  const { error } = await admin.from('drawing_evaluation').delete().eq('id', claimId).eq('status', 'running');
  if (error) console.error('drawing-auto-draft: could not release claim', claimId, describeError(error));
}

async function failClaim(admin: any, claimId: string, message: string): Promise<void> {
  const { error } = await admin
    .from('drawing_evaluation')
    .update({ status: 'needs_manual', error: message })
    .eq('id', claimId)
    .eq('status', 'running');
  if (error) console.error('drawing-auto-draft: could not record failure on', claimId, describeError(error));
}

/** The labels the model may choose from: the seeded tags, which teachers already filter by. */
async function loadTagLabels(admin: any): Promise<string[]> {
  try {
    const tags = await listDrawingTags(admin);
    return tags.filter((t) => t.is_seed).map((t) => t.label);
  } catch {
    return [];
  }
}

const slugOf = (label: string) =>
  label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * Add the draft's tags to the sheet without removing any it already has.
 *
 * setSubmissionTags replaces the whole set, so the existing labels are read
 * first and sent back with the new ones. When nothing is new the set is not
 * rewritten at all, and when the existing set cannot be read nothing is
 * written, because a write from a failed read would wipe a teacher's tags.
 */
export async function addTagsToSubmission(
  admin: any,
  submissionId: string,
  labels: readonly string[],
  actorId: string | null,
): Promise<void> {
  if (labels.length === 0) return;
  try {
    const existing = await getSubmissionTags(submissionId, admin);
    const have = new Set(existing.map((t) => t.slug || slugOf(t.label)));
    const added = labels.filter((l) => !have.has(slugOf(l)));
    if (added.length === 0) return;
    await setSubmissionTags(submissionId, [...existing.map((t) => t.label), ...added], actorId, admin);
  } catch (err) {
    console.error('drawing-auto-draft: could not tag', submissionId, describeError(err));
  }
}

/** Whether an earlier AI row already checked the orientation of this exact image. */
function orientationAlreadyChecked(priorRows: Array<{ raw_response?: any }>, imageUrl: string): boolean {
  return priorRows.some((r) => {
    const o = r.raw_response?.orientation;
    return !!o && (o.checkedUrl === imageUrl || o.imageUrl === imageUrl);
  });
}

export async function runAutoDraft(
  admin: any,
  submissionId: string,
  opts: AutoDraftOptions = {},
): Promise<AutoDraftResult> {
  const now = opts.now ?? (() => new Date());
  const actorId = opts.actorId ?? null;
  const force = opts.force === true;

  let claimId: string | null = null;
  try {
    const gate = await autoDraftGate();
    if (!gate.allowed) return { state: 'blocked', reason: gate.reason };

    const { data: submission, error: submissionError } = await admin
      .from('drawing_submissions')
      .select('id, student_id, status, source_type, original_image_url')
      .eq('id', submissionId)
      .maybeSingle();
    if (submissionError) return { state: 'failed', reason: describeError(submissionError) };
    if (!submission) return { state: 'skipped', reason: 'not_found' };
    if (submission.source_type === 'sketchbook') return { state: 'skipped', reason: 'sketchbook' };
    if (submission.status !== 'submitted') return { state: 'skipped', reason: 'not_submitted' };
    // A finished review waiting to be handed back keeps status 'submitted'. The
    // teacher has already judged it; a draft now would only spend.
    if ((await heldSubmissionIds(admin, [submissionId])).has(submissionId)) {
      return { state: 'skipped', reason: 'held' };
    }

    const { data: prior } = await admin
      .from('drawing_evaluation')
      .select('id, status, created_at, raw_response')
      .eq('submission_id', submissionId)
      .eq('source', 'ai')
      .order('created_at', { ascending: false })
      .limit(20);
    const priorRows = (Array.isArray(prior) ? prior : []) as Array<{ id: string; status: string; raw_response?: any }>;

    if (force) {
      await supersedeAiDrafts(admin, submissionId, { statuses: ['draft'] });
    } else if (priorRows.some((r) => SETTLED_AI_STATUSES.includes(r.status))) {
      return { state: 'skipped', reason: 'already_drafted' };
    }

    const claimed = await claim(admin, submissionId, actorId, now());
    if (claimed.kind === 'busy') return { state: 'busy', reason: 'running' };
    if (claimed.kind === 'already_drafted') return { state: 'skipped', reason: 'already_drafted' };
    if (claimed.kind === 'error') return { state: 'failed', reason: claimed.message };
    claimId = claimed.id;

    let orientation: OrientationOutcome | null = null;
    if (!orientationAlreadyChecked(priorRows, submission.original_image_url)) {
      orientation = await detectAndFixOrientation(
        admin,
        { id: submission.id, student_id: submission.student_id, original_image_url: submission.original_image_url },
        { actorId },
      );
    }

    const tagLabels = await loadTagLabels(admin);

    const outcome = await evaluateSubmission({
      supabase: admin,
      submissionId,
      actorId,
      claimedEvaluationId: claimId,
      tagLabels,
      extraRaw: orientation
        ? {
            orientation: {
              checkedUrl: orientation.checkedUrl,
              imageUrl: orientation.imageUrl,
              rotatedDeg: orientation.rotatedDeg,
              exifApplied: orientation.exifApplied,
              answer: orientation.answer,
              reason: orientation.reason ?? null,
            },
          }
        : undefined,
    });

    const rotatedDeg = orientation?.rotatedDeg ?? null;

    if (outcome.ok) {
      await addTagsToSubmission(admin, submissionId, outcome.result.tags, actorId);
      return {
        state: 'drafted',
        rotatedDeg,
        tags: outcome.result.tags,
        evaluationId: outcome.evaluationId,
        mode: outcome.mode,
      };
    }

    switch (outcome.kind) {
      case 'blocked':
        await releaseClaim(admin, claimId);
        return { state: 'blocked', reason: outcome.blockedReason ?? 'feature_off', rotatedDeg };
      case 'rate_limited':
        await releaseClaim(admin, claimId);
        return { state: 'blocked', reason: 'rate_limited', rotatedDeg };
      case 'not_found':
        await releaseClaim(admin, claimId);
        return { state: 'skipped', reason: 'not_found' };
      default:
        // evaluateSubmission already wrote needs_manual onto the claim. Repeated
        // here, guarded, in case that write was the thing that failed.
        await failClaim(admin, claimId, outcome.error);
        return { state: 'failed', reason: outcome.error, rotatedDeg };
    }
  } catch (err) {
    if (err instanceof AiBlockedError) {
      if (claimId) await releaseClaim(admin, claimId);
      return { state: 'blocked', reason: err.reason };
    }
    const message = messageOf(err, 'The draft could not run.');
    console.error('drawing-auto-draft: failed for', submissionId, describeError(err));
    if (claimId) await failClaim(admin, claimId, message);
    return { state: 'failed', reason: message };
  }
}

// Sweep ---------------------------------------------------------------------

/** Sheets one sweep drafts. Each can take a minute, and the route has five. */
export const SWEEP_LIMIT = 6;
export const SWEEP_CONCURRENCY = 2;

/** A sheet whose draft failed is not retried by a sweep for this long. "Draft again" still can. */
export const NEEDS_MANUAL_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const SWEEP_PAGE = 200;
const SWEEP_MAX_PAGES = 5;

/**
 * The oldest waiting sheets that have no draft, no run in progress, and no
 * failed draft in the last day. Oldest first, because those are the students
 * who have waited longest for feedback.
 */
export async function pickSweepCandidates(admin: any, limit: number, now: Date): Promise<string[]> {
  const picked: string[] = [];

  for (let page = 0; page < SWEEP_MAX_PAGES && picked.length < limit; page += 1) {
    const from = page * SWEEP_PAGE;
    const { data: subs, error } = await admin
      .from('drawing_submissions')
      .select('id, submitted_at')
      .eq('status', 'submitted')
      .neq('source_type', 'sketchbook')
      .order('submitted_at', { ascending: true })
      .range(from, from + SWEEP_PAGE - 1);
    if (error) throw error;
    const rows = (Array.isArray(subs) ? subs : []) as Array<{ id: string }>;
    if (rows.length === 0) break;

    const ids = rows.map((r) => r.id);
    const { data: evals, error: evalError } = await admin
      .from('drawing_evaluation')
      .select('submission_id, status, created_at')
      .in('submission_id', ids)
      .eq('source', 'ai')
      .in('status', ['running', ...SETTLED_AI_STATUSES, 'needs_manual']);
    if (evalError) throw evalError;

    const taken = await heldSubmissionIds(admin, ids);
    for (const e of (Array.isArray(evals) ? evals : []) as Array<{ submission_id: string; status: string; created_at: string }>) {
      if (SETTLED_AI_STATUSES.includes(e.status)) taken.add(e.submission_id);
      // A stale running row is a dead run: leave the sheet eligible so
      // runAutoDraft can reclaim it.
      else if (e.status === 'running' && !isStaleClaim(e.created_at, now)) taken.add(e.submission_id);
      else if (e.status === 'needs_manual' && now.getTime() - Date.parse(e.created_at) < NEEDS_MANUAL_COOLDOWN_MS) {
        taken.add(e.submission_id);
      }
    }

    for (const id of ids) {
      if (!taken.has(id)) picked.push(id);
      if (picked.length >= limit) break;
    }
    if (rows.length < SWEEP_PAGE) break;
  }

  return picked;
}

export interface SweepResult {
  processed: number;
  results: Array<{ id: string; state: AutoDraftState }>;
  blocked: boolean;
}

/**
 * Draft up to SWEEP_LIMIT waiting sheets, SWEEP_CONCURRENCY at a time.
 *
 * Stops starting new ones after the first 'blocked': the budget ran out or AI
 * was switched off, and every further call would be refused the same way.
 */
export async function runSweep(
  admin: any,
  opts: { actorId?: string | null; limit?: number; concurrency?: number; now?: () => Date } = {},
): Promise<SweepResult> {
  const now = opts.now ?? (() => new Date());

  const gate = await autoDraftGate();
  if (!gate.allowed) return { processed: 0, results: [], blocked: true };

  const ids = await pickSweepCandidates(admin, opts.limit ?? SWEEP_LIMIT, now());
  const results: Array<{ id: string; state: AutoDraftState }> = [];
  let blocked = false;
  let cursor = 0;

  const workers = Array.from({ length: Math.min(opts.concurrency ?? SWEEP_CONCURRENCY, ids.length) }, async () => {
    while (!blocked && cursor < ids.length) {
      const id = ids[cursor++];
      const result = await runAutoDraft(admin, id, { actorId: opts.actorId ?? null, now });
      results.push({ id, state: result.state });
      if (result.state === 'blocked') blocked = true;
    }
  });
  await Promise.all(workers);

  return { processed: results.length, results, blocked };
}
