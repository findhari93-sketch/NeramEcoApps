/**
 * Wrapping a class up after it ends, without a human.
 *
 * "Generate from the class" has worked for months, but only when a teacher opened
 * the panel and pressed it, and then pressed Save. Nobody did, so production
 * classes kept the Teams meeting subject as their title ("Class by Ar Hari Babu"),
 * carried no brief, no bullets and no tags, and a student revising three weeks
 * later had no way to tell one evening from another or to search for the one about
 * perspective.
 *
 * This runs the same generator against the transcript the cron just stored and
 * saves the result, so the class is described to students the same night.
 *
 * The candidate rule is one column: `content_edited_at IS NULL`.
 *
 *   a teacher has saved something  the stamp is set, with content_edited_by set
 *   the machine has drafted it     the stamp is set, content_edited_by is NULL
 *   nobody has touched it          NULL, and it is a candidate
 *
 * That single check does both jobs: a human's words are never overwritten, and the
 * machine never redrafts its own work. The NULL-author convention is the same one
 * `nexus_class_video_meta.generated_by` already uses for "the machine wrote this".
 *
 * Two cost rules, inherited from lib/recap-autodraft and just as binding:
 *
 *   The transcript is read from `nexus_class_transcripts` and nowhere else. The
 *   full resolver ladder would fall through to Graph and SharePoint for a class
 *   whose stored copy is missing, a per-class network cost this sweep has no
 *   business paying, and it would burn that class's transcript attempt cap on top.
 *
 *   There is ONE shared GEMINI_API_KEY across all four apps, so a burst here is
 *   not a slow cron, it is a 429 for marketing, admin and the student app at the
 *   same time. The recap sweep runs in the same request and spends against the
 *   same key, which is why the caller passes a REMAINING budget rather than this
 *   module choosing its own.
 */
import { istToday } from './class-absences';
import { readStoredTranscript } from './transcript-resolver';
import { buildWrapUpDraft, loadClassImages, loadTagRegistry } from './class-wrapup-draft';
import { applyWrapUp } from './class-wrapup-write';
import { isRateLimited } from './recap-autodraft';
import type { RegistryTag } from './tag-resolver';

/**
 * Classes drafted per run.
 *
 * Deliberately small, and shared with the recap sweep by the caller. A backlog
 * clears over a few nights, which is fine for material that is already old, and
 * the shared Gemini key stays usable by everything else.
 */
export const MAX_WRAPUPS_PER_RUN = 3;

/** How far back to look for candidates. Newest first: those matter most. */
export const SCAN_LIMIT = 80;

const CLASS_COLUMNS =
  'id, classroom_id, title, description, scheduled_date, meeting_group_id, content_edited_at';

export interface WrapUpCandidate {
  id: string;
  classroom_id: string | null;
  title: string | null;
  description: string | null;
  scheduled_date: string;
  meeting_group_id: string | null;
}

export type WrapUpOutcome =
  | { ok: true; classId: string; title: string; bullets: number; tags: number }
  | { ok: false; classId: string; reason: 'no_transcript' | 'empty_draft' | 'error'; detail?: string }
  /** Gemini refused. The caller must stop the whole run, not just this class. */
  | { ok: false; classId: string; reason: 'rate_limited'; detail?: string };

/**
 * Past classes with a stored transcript that nobody, human or machine, has
 * described yet.
 *
 * Three reads, batched, never a loop: this runs twice a night over the whole term.
 */
export async function findWrapUpCandidates(
  supabase: any,
  limit: number = MAX_WRAPUPS_PER_RUN,
  opts: { classIds?: string[] } = {},
): Promise<WrapUpCandidate[]> {
  // Event path: a transcript just landed for these classes, so draft exactly them
  // rather than sweeping. An explicitly empty list means there is nothing to do,
  // which is different from "no filter".
  const only = opts.classIds;
  if (only && only.length === 0) return [];
  if (limit <= 0) return [];

  let query = supabase
    .from('nexus_scheduled_classes')
    .select(CLASS_COLUMNS)
    .is('content_edited_at', null)
    .eq('publish_state', 'published')
    .neq('status', 'cancelled');

  if (only) {
    // No date floor on the event path: the class whose transcript just arrived is
    // TODAY's, and a "before today" rule would exclude the very thing we were
    // told about.
    query = query.in('id', only);
  } else {
    query = query.lte('scheduled_date', istToday());
  }

  const { data: classes, error } = await query
    .order('scheduled_date', { ascending: false })
    .order('start_time', { ascending: false })
    .limit(SCAN_LIMIT);
  if (error) throw error;

  const rows = (classes || []) as WrapUpCandidate[];
  if (rows.length === 0) return [];

  // PostgREST has no anti-join, so this is one extra round trip rather than
  // something clever. Same shape as transcript-sync and youtube-backup-sync.
  const { data: transcripts } = await supabase
    .from('nexus_class_transcripts')
    .select('class_id')
    .in('class_id', rows.map((r) => r.id))
    .eq('status', 'ok');

  const hasTranscript = new Set<string>((transcripts || []).map((t: any) => t.class_id));
  return rows.filter((c) => hasTranscript.has(c.id)).slice(0, limit);
}

/**
 * Draft and save one class. Never throws: the caller is a sweep, and one bad
 * transcript must not cost the other classes their turn.
 */
export async function autodraftWrapUpForClass(
  supabase: any,
  cls: WrapUpCandidate,
  registry?: RegistryTag[],
): Promise<WrapUpOutcome> {
  try {
    const transcript = await readStoredTranscript(supabase, cls.id);
    if (!transcript || transcript.length === 0) {
      return { ok: false, classId: cls.id, reason: 'no_transcript' };
    }

    // Board photos matter for a drawing class, where the transcript alone says
    // very little ("now look at this one"). Capped at four by loadClassImages, and
    // only ever attempted for a class that already cleared the transcript check.
    const images = await loadClassImages(supabase, cls.id);

    const draft = await buildWrapUpDraft(supabase, {
      transcript,
      images,
      fallbackTitle: cls.title || 'Untitled class',
      registry,
    });

    const title = (draft.suggested_title || '').trim();
    if (!title) {
      // A draft with no title would either fail the writer's own validation or
      // replace a real Teams subject with nothing. Leave the class alone so a
      // later run, or a teacher, can try again.
      return { ok: false, classId: cls.id, reason: 'empty_draft' };
    }

    // editorUserId null is what marks this machine-written, which is what keeps
    // the class out of the next run's candidates while still locking the Teams
    // reconciler out of the title.
    const saved = await applyWrapUp(
      supabase,
      cls,
      {
        title,
        description: draft.short_description,
        notes: draft.detailed_description,
        summary_bullets: draft.bullets,
        tag_ids: draft.matched.map((t) => t.id),
      },
      null,
    );

    if (!saved.ok) {
      return { ok: false, classId: cls.id, reason: 'error', detail: saved.error };
    }

    return {
      ok: true,
      classId: cls.id,
      title,
      bullets: draft.bullets.length,
      tags: draft.matched.length,
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'unknown error';
    if (isRateLimited(detail)) {
      return { ok: false, classId: cls.id, reason: 'rate_limited', detail };
    }
    return { ok: false, classId: cls.id, reason: 'error', detail };
  }
}

export interface WrapUpAutodraftResult {
  scanned: number;
  drafted: number;
  skipped: number;
  /** True when Gemini refused and the run stopped early on purpose. */
  rateLimited: boolean;
  outcomes: WrapUpOutcome[];
}

/**
 * The whole sweep: find candidates, draft them one at a time, stop on a refusal.
 *
 * Sequential rather than parallel, for the same reason recap-autodraft is: three
 * concurrent Gemini calls is exactly the burst that trips the shared key, and
 * nothing here is time critical to the minute.
 */
export async function runWrapUpAutodraft(
  supabase: any,
  opts: { limit?: number; classIds?: string[] } = {},
): Promise<WrapUpAutodraftResult> {
  const result: WrapUpAutodraftResult = {
    scanned: 0,
    drafted: 0,
    skipped: 0,
    rateLimited: false,
    outcomes: [],
  };

  const limit = opts.limit ?? MAX_WRAPUPS_PER_RUN;
  if (limit <= 0) return result;

  const candidates = await findWrapUpCandidates(supabase, limit, { classIds: opts.classIds });
  result.scanned = candidates.length;
  if (candidates.length === 0) return result;

  // Read the tag vocabulary ONCE for the run rather than per class. It is the same
  // for every class and it is the largest read in this loop.
  const registry = await loadTagRegistry(supabase);

  for (const cls of candidates) {
    const outcome = await autodraftWrapUpForClass(supabase, cls, registry);
    result.outcomes.push(outcome);

    if (outcome.ok) {
      result.drafted += 1;
      continue;
    }

    if (outcome.reason === 'rate_limited') {
      // Stop the whole run. Trying the next class would spend another call on a
      // key that has already said no, and every app shares it.
      result.rateLimited = true;
      break;
    }

    result.skipped += 1;
  }

  return result;
}
