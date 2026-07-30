/**
 * Turning a recorded class into a reviewable draft recap, without a human.
 *
 * The catch-up feature rests entirely on there being something gated to watch,
 * and on production there was not: nine classes taught, nine recordings, nine
 * stored transcripts, and zero published recaps. Building one by hand is a
 * five step job (create, generate, review, save, publish) and nobody was doing
 * it, so seventy-seven recorded absences had nowhere to go.
 *
 * This does the first four steps. Publishing stays a person's decision, because
 * an AI question that is wrong becomes an 85% wall a student cannot pass and
 * cannot appeal.
 *
 * Two cost rules shape everything here:
 *
 *   The transcript is read from `nexus_class_transcripts` and nowhere else. The
 *   full resolver ladder would fall through to Graph and SharePoint for a class
 *   whose stored copy is missing, which is a per-class network cost this sweep
 *   has no business paying. A class with no stored transcript is simply not a
 *   candidate; the transcript cron's job is to fix that.
 *
 *   There is ONE shared GEMINI_API_KEY across all four apps, so a burst here is
 *   not a slow cron, it is a 429 for marketing, admin and the student app at the
 *   same time. Hence the small per-run cap, the sequential loop, and the hard
 *   stop the moment Gemini says it has had enough.
 */
import {
  createRecapForClass,
  replaceRecapSections,
  type GeneratedRecapSection,
} from '@neram/database';
import { generateSectionsAndQuestions } from './ai-generate';
import { readStoredTranscript } from './transcript-resolver';

/**
 * Classes drafted per run.
 *
 * Deliberately small. A backlog clears over a few nights, which is fine for
 * material that is already weeks old, and the shared Gemini key stays usable by
 * everything else.
 */
export const MAX_DRAFTS_PER_RUN = 3;

/** How far back to look for candidates. Newest first: those matter most. */
export const SCAN_LIMIT = 80;

/**
 * A recap created but never generated is only picked up once it has clearly
 * been abandoned, so the sweep cannot overwrite a teacher who is mid-review.
 */
export const STALLED_DRAFT_HOURS = 24;

const CLASS_COLUMNS =
  'id, classroom_id, title, scheduled_date, start_time, recording_url, youtube_url';

export interface AutodraftCandidate {
  id: string;
  classroom_id: string | null;
  title: string | null;
  scheduled_date: string;
  /** Set when a stalled empty draft already exists, so we generate into it. */
  existing_recap_id: string | null;
}

export type AutodraftOutcome =
  | { ok: true; classId: string; recapId: string; sections: number; questions: number }
  | { ok: false; classId: string; reason: 'no_transcript' | 'no_sections' | 'error'; detail?: string }
  /** Gemini refused. The caller must stop the whole run, not just this class. */
  | { ok: false; classId: string; reason: 'rate_limited'; detail?: string };

/** Today in IST as YYYY-MM-DD. Crons run in UTC; classes are Indian evenings. */
function istToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

/**
 * Gemini's "come back later", in every shape it arrives in.
 *
 * Matched on the message rather than a status code because the SDK wraps the
 * HTTP error, and treating a quota refusal as an ordinary failure is what turns
 * one exhausted key into every app in the monorepo failing at once.
 */
export function isRateLimited(message: string): boolean {
  return (
    message.includes('429') ||
    message.includes('Too Many Requests') ||
    message.includes('quota') ||
    message.includes('RESOURCE_EXHAUSTED')
  );
}

/**
 * A checkpoint the gated player could not run.
 *
 * Same rule the teacher's own save path enforces in
 * PUT /api/class-recaps/[recapId]/sections. Applied here too, because an
 * unreviewed section with a zero length window would lock a student at a
 * checkpoint they can never reach the end of.
 */
export function isUsableSection(s: GeneratedRecapSection): boolean {
  return (
    !!s.title &&
    s.start_timestamp_seconds != null &&
    s.end_timestamp_seconds != null &&
    s.end_timestamp_seconds > s.start_timestamp_seconds &&
    (s.questions || []).length > 0
  );
}

/**
 * Past classes that have a recording and a stored transcript but no usable
 * recap yet.
 *
 * Three reads, batched, never a loop: this runs nightly over the whole term.
 */
export async function findAutodraftCandidates(
  supabase: any,
  limit: number = MAX_DRAFTS_PER_RUN,
): Promise<AutodraftCandidate[]> {
  const { data: classrooms } = await supabase
    .from('nexus_classrooms')
    .select('id')
    .eq('is_active', true)
    .eq('is_archived', false);

  const classroomIds = (classrooms || []).map((c: any) => c.id);
  if (classroomIds.length === 0) return [];

  // A draft class was never visible to a student, so nobody can have missed it.
  const { data: classes, error } = await supabase
    .from('nexus_scheduled_classes')
    .select(CLASS_COLUMNS)
    .in('classroom_id', classroomIds)
    .eq('publish_state', 'published')
    .neq('status', 'cancelled')
    .lt('scheduled_date', istToday())
    .or('recording_url.not.is.null,youtube_url.not.is.null')
    .order('scheduled_date', { ascending: false })
    .limit(SCAN_LIMIT);
  if (error) throw error;

  const rows = classes || [];
  if (rows.length === 0) return [];
  const classIds = rows.map((c: any) => c.id);

  const [{ data: recaps }, { data: transcripts }] = await Promise.all([
    supabase
      .from('nexus_class_recaps')
      .select('id, scheduled_class_id, status, generated_at, created_at')
      .in('scheduled_class_id', classIds),
    supabase
      .from('nexus_class_transcripts')
      .select('class_id')
      .in('class_id', classIds)
      .eq('status', 'ok'),
  ]);

  const recapByClass = new Map<string, any>(
    (recaps || []).map((r: any) => [r.scheduled_class_id, r]),
  );
  const hasTranscript = new Set<string>((transcripts || []).map((t: any) => t.class_id));
  const stalledBefore = Date.now() - STALLED_DRAFT_HOURS * 3_600_000;

  const candidates: AutodraftCandidate[] = [];
  for (const cls of rows) {
    if (candidates.length >= limit) break;
    if (!hasTranscript.has(cls.id)) continue;

    const recap = recapByClass.get(cls.id);
    if (recap) {
      // Anything with content, or on its way to being published, is a teacher's
      // work and is left alone. Only an empty draft that has sat untouched for a
      // day is treated as abandoned.
      if (recap.generated_at) continue;
      if (recap.status !== 'draft') continue;
      if (recap.created_at && Date.parse(recap.created_at) > stalledBefore) continue;
    }

    candidates.push({
      id: cls.id,
      classroom_id: cls.classroom_id,
      title: cls.title,
      scheduled_date: cls.scheduled_date,
      existing_recap_id: recap ? recap.id : null,
    });
  }

  return candidates;
}

/**
 * Draft one class. Never throws: the caller is a sweep, and one bad transcript
 * must not cost the other classes their turn.
 */
export async function autodraftRecapForClass(
  supabase: any,
  cls: AutodraftCandidate,
): Promise<AutodraftOutcome> {
  try {
    const transcript = await readStoredTranscript(supabase, cls.id);
    if (!transcript || transcript.length === 0) {
      return { ok: false, classId: cls.id, reason: 'no_transcript' };
    }

    // Idempotent, and returns the existing row rather than a duplicate, so a
    // rerun after a mid-loop failure picks up where it stopped.
    const recap = await createRecapForClass(cls.id, null, supabase);

    const generated = await generateSectionsAndQuestions(
      transcript,
      recap.title || cls.title || 'Class recap',
    );

    const sections = (generated.sections || []).filter(isUsableSection);
    if (sections.length === 0) {
      return { ok: false, classId: cls.id, reason: 'no_sections' };
    }

    await replaceRecapSections(recap.id, sections, supabase);

    return {
      ok: true,
      classId: cls.id,
      recapId: recap.id,
      sections: sections.length,
      questions: sections.reduce((n, s) => n + (s.questions || []).length, 0),
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'unknown error';
    if (isRateLimited(detail)) {
      return { ok: false, classId: cls.id, reason: 'rate_limited', detail };
    }
    return { ok: false, classId: cls.id, reason: 'error', detail };
  }
}

export interface AutodraftRunResult {
  scanned: number;
  drafted: number;
  skipped: number;
  /** True when Gemini refused and the run stopped early on purpose. */
  rateLimited: boolean;
  /** Classroom id to the number of recaps now waiting for review. */
  byClassroom: Map<string, number>;
  outcomes: AutodraftOutcome[];
}

/**
 * The whole sweep: find candidates, draft them one at a time, stop on a refusal.
 *
 * Sequential rather than parallel. Three concurrent Gemini calls is exactly the
 * burst that trips the shared key, and there is nothing time critical about
 * material that is already weeks old.
 */
export async function runRecapAutodraft(
  supabase: any,
  opts: { limit?: number } = {},
): Promise<AutodraftRunResult> {
  const candidates = await findAutodraftCandidates(supabase, opts.limit ?? MAX_DRAFTS_PER_RUN);

  const result: AutodraftRunResult = {
    scanned: candidates.length,
    drafted: 0,
    skipped: 0,
    rateLimited: false,
    byClassroom: new Map(),
    outcomes: [],
  };

  for (const cls of candidates) {
    const outcome = await autodraftRecapForClass(supabase, cls);
    result.outcomes.push(outcome);

    if (outcome.ok) {
      result.drafted += 1;
      if (cls.classroom_id) {
        result.byClassroom.set(
          cls.classroom_id,
          (result.byClassroom.get(cls.classroom_id) || 0) + 1,
        );
      }
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
