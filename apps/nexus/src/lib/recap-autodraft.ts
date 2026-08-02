/**
 * Turning a recorded class into a reviewable draft recap, without a human.
 *
 * The catch-up feature rests entirely on there being something gated to watch,
 * and on production there was not: nine classes taught, nine recordings, nine
 * stored transcripts, and zero published recaps. Building one by hand is a
 * five step job (create, generate, review, save, publish) and nobody was doing
 * it, so seventy-seven recorded absences had nowhere to go.
 *
 * This does all five. Publishing is automatic when the generation clears every
 * check in recap-quality; anything short of that is HELD for a tutor and the
 * teaching staff are told, because an AI question that is wrong becomes a wall a
 * student cannot pass and cannot appeal.
 *
 * A held recap is loud on purpose. A FAILED one has to be just as loud: a throw
 * mid-generation used to leave the recap row it had already created sitting
 * there empty, with the `readiness` column at its 'ready' default, no hold
 * reason and nobody told. Three of those were sitting in production, looking
 * from the teacher's screen exactly like a draft somebody had started.
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
  setRecapReadiness,
  createUserNotification,
  type GeneratedRecapSection,
  type NexusClassRecap,
} from '@neram/database';
import { generateSectionsAndQuestions } from './ai-generate';
import { readStoredTranscript } from './transcript-resolver';
import { preflight, scoreRecapGeneration } from './recap-quality';
import { readRecapDefaults, questionsToPass } from './recap-defaults';

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

/**
 * Generation attempts before a class is left alone.
 *
 * Matters because a failure now HOLDS the recap instead of abandoning it, and a
 * held recap with no `generated_at` is a candidate again tomorrow. Without a
 * ceiling, one class whose transcript can never produce ten questions per
 * segment would spend Gemini calls on the shared key every night forever. Four
 * nights is enough for a late transcript or a transient outage to resolve; past
 * that it is a real problem and it is already in the tutor's review queue.
 */
export const MAX_GENERATION_ATTEMPTS = 4;

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
  | {
      ok: true;
      classId: string;
      recapId: string;
      sections: number;
      questions: number;
      /** Cleared the quality bar and went straight to students. */
      published?: boolean;
      /** Generated but waiting on a tutor. Students see "being prepared". */
      held?: boolean;
      holdReason?: string;
      score?: number;
    }
  | {
      ok: false;
      classId: string;
      reason: 'no_transcript' | 'no_sections' | 'has_attempts' | 'error';
      detail?: string;
    }
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
  opts: { classIds?: string[] } = {},
): Promise<AutodraftCandidate[]> {
  // Event path: a transcript just landed for these classes, so generate for
  // exactly them rather than sweeping. An explicitly empty list means there is
  // nothing to do, which is different from "no filter".
  const only = opts.classIds;
  if (only && only.length === 0) return [];

  const { data: classrooms } = await supabase
    .from('nexus_classrooms')
    .select('id')
    .eq('is_active', true)
    .eq('is_archived', false);

  const classroomIds = (classrooms || []).map((c: any) => c.id);
  if (classroomIds.length === 0) return [];

  // A draft class was never visible to a student, so nobody can have missed it.
  let query = supabase
    .from('nexus_scheduled_classes')
    .select(CLASS_COLUMNS)
    .in('classroom_id', classroomIds)
    .eq('publish_state', 'published')
    .neq('status', 'cancelled')
    .or('recording_url.not.is.null,youtube_url.not.is.null');

  if (only) {
    // No date floor on the event path: the class whose transcript just arrived
    // is TODAY's, and the sweep's "before today" rule would exclude the very
    // thing we were told about.
    query = query.in('id', only);
  } else {
    query = query.lt('scheduled_date', istToday());
  }

  const { data: classes, error } = await query
    .order('scheduled_date', { ascending: false })
    .limit(SCAN_LIMIT);
  if (error) throw error;

  const rows = classes || [];
  if (rows.length === 0) return [];
  const classIds = rows.map((c: any) => c.id);

  const [{ data: recaps }, { data: transcripts }] = await Promise.all([
    supabase
      .from('nexus_class_recaps')
      .select(
        'id, scheduled_class_id, status, readiness, generated_at, created_at, generation_attempts',
      )
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
      // work and is left alone.
      if (recap.generated_at) continue;
      if (recap.status !== 'draft') continue;
      if ((recap.generation_attempts ?? 0) >= MAX_GENERATION_ATTEMPTS) continue;

      // 'pending' means the row was inserted and generation never finished, so
      // there is no review in progress to protect and no reason to wait out
      // STALLED_DRAFT_HOURS. That delay exists for a draft a teacher created by
      // hand and may be mid-way through; it should never strand a class behind a
      // crash for a day, which is what it did.
      const neverGenerated = recap.readiness === 'pending';
      if (
        !neverGenerated &&
        recap.created_at &&
        Date.parse(recap.created_at) > stalledBefore
      ) {
        continue;
      }
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
 * Park a recap for the tutor. Best-effort: failing to WRITE the hold is not a
 * reason to throw out of a sweep, and the recap stays a draft either way, which
 * is already invisible to students.
 */
async function holdRecap(
  supabase: any,
  recap: { id: string; generation_attempts?: number | null },
  reason: string | null,
  detail: string,
): Promise<void> {
  try {
    await setRecapReadiness(
      recap.id,
      {
        readiness: 'held',
        hold_reason: reason,
        hold_detail: detail,
        bumpAttempts: true,
        currentAttempts: recap.generation_attempts ?? 0,
      },
      supabase,
    );
  } catch (err) {
    console.error('[recap] could not record hold:', err instanceof Error ? err.message : err);
  }
  await notifyHeld(supabase, recap.id, detail);
}

/**
 * Tell the teaching staff a recap is stuck.
 *
 * A hold blocks a real student from catching up, so it cannot be silent. Written
 * to user_notifications, which is the TopBar bell on every page, rather than the
 * timetable table that only renders on one screen for one classroom.
 *
 * Best-effort throughout: a missing notification is worse than none at all only
 * if it takes the generation down with it, and it must not.
 */
async function notifyHeld(supabase: any, recapId: string, detail: string): Promise<void> {
  try {
    const { data: staff } = await supabase
      .from('users')
      .select('id')
      .eq('user_type', 'teacher')
      .eq('is_active', true)
      .limit(25);

    for (const s of staff || []) {
      await createUserNotification(
        {
          user_id: s.id,
          event_type: 'recap_needs_review' as any,
          title: 'A class recap needs a look',
          message: detail
            ? `It generated but did not clear the automatic checks. ${detail}`
            : 'It generated but did not clear the automatic checks.',
          metadata: { recap_id: recapId, href: '/teacher/catch-up?tab=classes' },
        },
        supabase,
      );
    }
  } catch (err) {
    console.error('[recap] hold notification failed:', err instanceof Error ? err.message : err);
  }
}

/**
 * Draft one class. Never throws: the caller is a sweep, and one bad transcript
 * must not cost the other classes their turn.
 */
export async function autodraftRecapForClass(
  supabase: any,
  cls: AutodraftCandidate,
): Promise<AutodraftOutcome> {
  /**
   * Held outside the try so the catch can park the row.
   *
   * Everything after the insert can throw, and the throw we actually see is
   * Gemini's. Without a handle out here that leaves a recap nobody generated,
   * nobody held and nobody heard about.
   */
  let recap: NexusClassRecap | null = null;

  try {
    const transcript = await readStoredTranscript(supabase, cls.id);
    if (!transcript || transcript.length === 0) {
      return { ok: false, classId: cls.id, reason: 'no_transcript' };
    }

    // Idempotent, and returns the existing row rather than a duplicate, so a
    // rerun after a mid-loop failure picks up where it stopped. 'pending' marks
    // it as ours and unfinished until the readiness call below settles it.
    recap = await createRecapForClass(cls.id, null, supabase, { readiness: 'pending' });

    // Per-recap columns win; the classroom settings row fills the gaps.
    const defaults = await readRecapDefaults(supabase);
    const targetSegmentSeconds = recap.target_segment_seconds ?? defaults.target_segment_seconds;
    const poolPerSegment = recap.question_pool_per_segment ?? defaults.question_pool_per_segment;
    const questionsToServe = Math.min(
      poolPerSegment,
      recap.questions_per_segment ?? defaults.questions_per_segment,
    );
    const passPercentage = recap.pass_percentage ?? defaults.pass_percentage;
    const durationSeconds =
      recap.video_duration_seconds ?? transcript[transcript.length - 1]?.end ?? 0;

    // Before spending a single Gemini call. A three-minute clip or a transcript
    // that is mostly "can everyone hear me" cannot produce a real checkpoint
    // quiz, and the shared key is metered.
    const pre = preflight(transcript, durationSeconds);
    if (!pre.ok) {
      await holdRecap(supabase, recap, pre.reason, pre.detail);
      return { ok: false, classId: cls.id, reason: 'no_transcript', detail: pre.detail };
    }

    const generated = await generateSectionsAndQuestions(
      transcript,
      // Class first: the recap's copy of the title was taken when its row was
      // created and does not follow a rename, so it can still be the Teams
      // meeting subject. The generator writes checkpoints about this topic, so
      // handing it "Class by Ar Hari Babu" costs real quality.
      cls.title || recap.title || 'Class recap',
      { targetSegmentSeconds, poolPerSegment, durationSeconds },
    );

    const sections = (generated.sections || []).filter(isUsableSection);
    if (sections.length === 0) {
      await holdRecap(supabase, recap, 'generation_failed', 'The model returned no usable segments.');
      return { ok: false, classId: cls.id, reason: 'no_sections' };
    }

    // Stamp the gate onto every checkpoint. Both of these were being left NULL,
    // and NULL is not "unset" here: a NULL questions_to_serve serves the whole
    // bank of fifteen, and a NULL min_questions_to_pass then demands all fifteen
    // correct. Every recap this sweep produced would have been unpassable.
    const graded = sections.map((s) => ({
      ...s,
      questions_to_serve: Math.min(questionsToServe, (s.questions || []).length),
      min_questions_to_pass: questionsToPass(
        Math.min(questionsToServe, (s.questions || []).length),
        passPercentage,
      ),
    }));

    await replaceRecapSections(recap.id, graded, supabase);

    // Nobody reads these before a student does, so the bar is what stands
    // between a bad generation and a teenager being asked to pass it.
    const verdict = scoreRecapGeneration({
      sections,
      transcript,
      durationSeconds,
      targetSegmentSeconds,
      questionsToServe,
    });

    await setRecapReadiness(
      recap.id,
      {
        readiness: verdict.publish ? 'ready' : 'held',
        publish: verdict.publish,
        hold_reason: verdict.holdReason,
        hold_detail: verdict.summary,
        quality_score: Number(verdict.score.toFixed(2)),
        quality_report: { checks: verdict.checks, summary: verdict.summary },
        bumpAttempts: true,
        currentAttempts: recap.generation_attempts ?? 0,
      },
      supabase,
    );

    // Held by the quality bar rather than by a pre-flight failure, but it blocks
    // a student just the same, so it gets the same alert.
    if (!verdict.publish) await notifyHeld(supabase, recap.id, verdict.summary);

    return {
      ok: true,
      classId: cls.id,
      recapId: recap.id,
      sections: sections.length,
      questions: sections.reduce((n, s) => n + (s.questions || []).length, 0),
      published: verdict.publish,
      held: !verdict.publish,
      holdReason: verdict.holdReason ?? undefined,
      score: verdict.score,
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'unknown error';

    // Transient, and the caller stops the whole run on it. Deliberately NOT
    // held: an exhausted key says nothing about this class, and holding would
    // spend the attempts counter and alert every teacher over a queue that will
    // drain by itself. The row stays 'pending', which the candidate query treats
    // as retryable on the next run.
    if (isRateLimited(detail)) {
      return { ok: false, classId: cls.id, reason: 'rate_limited', detail };
    }

    // Students have already worked through this recap's checkpoints, so the
    // sweep refused to overwrite it. Correct behaviour, not a failure: a stalled
    // draft that students have since started belongs to them now, and any change
    // has to go through the teacher's diffing editor.
    if (detail === 'RECAP_HAS_ATTEMPTS') {
      return { ok: false, classId: cls.id, reason: 'has_attempts', detail };
    }

    // Anything else is a real failure on a row that already exists. Park it and
    // say so, or it sits in the teacher's list looking like work in progress.
    if (recap) await holdRecap(supabase, recap, 'generation_failed', detail);

    return { ok: false, classId: cls.id, reason: 'error', detail };
  }
}

export interface AutodraftRunResult {
  scanned: number;
  drafted: number;
  skipped: number;
  /** True when Gemini refused and the run stopped early on purpose. */
  rateLimited: boolean;
  /**
   * Classroom id to the number of recaps that went live to students this run.
   *
   * Published only. A HELD recap already raises its own alert on the TopBar bell
   * through notifyHeld, and counting it here too produced a second message
   * telling teachers to go and publish something that was in fact stuck.
   */
  publishedByClassroom: Map<string, number>;
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
  opts: { limit?: number; classIds?: string[] } = {},
): Promise<AutodraftRunResult> {
  const candidates = await findAutodraftCandidates(supabase, opts.limit ?? MAX_DRAFTS_PER_RUN, {
    classIds: opts.classIds,
  });

  const result: AutodraftRunResult = {
    scanned: candidates.length,
    drafted: 0,
    skipped: 0,
    rateLimited: false,
    publishedByClassroom: new Map(),
    outcomes: [],
  };

  for (const cls of candidates) {
    const outcome = await autodraftRecapForClass(supabase, cls);
    result.outcomes.push(outcome);

    if (outcome.ok) {
      result.drafted += 1;
      if (cls.classroom_id && outcome.published) {
        result.publishedByClassroom.set(
          cls.classroom_id,
          (result.publishedByClassroom.get(cls.classroom_id) || 0) + 1,
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
