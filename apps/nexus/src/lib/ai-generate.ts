/**
 * Turn a class transcript into timestamped sections with MCQ checkpoints.
 *
 * Two things changed when this became the engine behind auto-published recaps
 * rather than a teacher-triggered preview:
 *
 * 1. It runs through generateGeminiText() instead of talking to
 *    @google/generative-ai directly. That client exists precisely to give every
 *    caller a model fallback chain and one shared vocabulary for rate limits,
 *    and this file had never adopted it. Pinned to a single model with no
 *    fallback, one bad afternoon for gemini-2.0-flash meant no recaps at all.
 *    That client now lives in @neram/ai and also meters what each call costs,
 *    which is why every caller has to say which feature it is spending for.
 *
 * 2. Questions are asked for in small batches, not all at once. A single
 *    response holding a whole class of segments at fifteen questions each
 *    truncates mid-JSON or degrades into invented filler, and a truncated
 *    response costs the same quota as a complete one.
 *
 * 3. Boundaries are no longer generated at all. recap-segments.ts computes them,
 *    which removed a call per recap, made the checkpoint count predictable, and
 *    made coverage exact instead of something to be scored. The model's only job
 *    now is to read one segment's transcript and write about it, which is the
 *    part it is actually good at.
 */

import { AiBlockedError, generateGeminiText, type AiFeatureId } from '@neram/ai';
import { planSegments, describeWindow } from './recap-segments';
import type { TranscriptEntry } from '@neram/database';

export interface GeneratedQuestion {
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: 'a' | 'b' | 'c' | 'd';
  explanation: string;
}

export interface GeneratedSection {
  title: string;
  description: string;
  start_timestamp_seconds: number;
  end_timestamp_seconds: number;
  questions: GeneratedQuestion[];
}

export interface GeneratedContent {
  sections: GeneratedSection[];
}

export interface GenerateOptions {
  /** Roughly how long each checkpoint segment should be. */
  targetSegmentSeconds?: number;
  /** How many questions to BANK per segment (more than are served). */
  poolPerSegment?: number;
  /** Known video length, used to size the segment count and sanity-check ends. */
  durationSeconds?: number;
  /**
   * Which AI feature is spending, for metering and for the per-feature
   * Auto/Manual/Off switch.
   *
   * Five routes and one cron share this function, and on the usage panel they
   * are five different things: a teacher pressing Generate is worth knowing
   * about separately from a nightly sweep. Defaults to the interactive recap
   * id, so an unmigrated caller still lands somewhere real.
   */
  feature?: AiFeatureId;
  /** users.id of the teacher who triggered this, when there is one. */
  actorId?: string | null;
}

const DEFAULTS = {
  /**
   * Fifteen minutes. A one hour class becomes four checkpoints, which is what
   * the teaching staff asked for and what a student can hold in their head.
   * Five minutes gave a sixty minute class twelve checkpoints and a ninety
   * minute class eighteen, which overran the call budget outright.
   */
  targetSegmentSeconds: 900,
  poolPerSegment: 15,
};

/**
 * Segments per call. ONE.
 *
 * This was four, and four is what emptied the checkpoints out of production.
 * Four segments at fifteen questions is sixty MCQs in a single response, which
 * overruns maxOutputTokens on a real class, truncates mid-object, and takes the
 * whole batch down with it: a recap that planned five checkpoints saved one.
 * From the outside that looked like a coverage problem, so the quality bar held
 * the recap for a fault that was never in the split.
 *
 * One segment per call is fifteen questions, which comes back whole, and a
 * failure now costs one checkpoint instead of four.
 */
const QUESTION_BATCH_SIZE = 1;

/**
 * Hard ceiling on Gemini calls for one recap. Shared key, metered quota.
 *
 * Sized for the longest class we actually teach (ninety minutes, six segments at
 * the fifteen minute target) plus a few retries for segments that came back
 * empty. It is a backstop against a runaway loop, not the working budget: a
 * typical hour-long class spends four.
 */
export const MAX_CALLS_PER_RECAP = 10;

const QUESTION_INSTRUCTION = `You write multiple-choice checkpoint questions for an architecture entrance exam course (NATA and JEE Paper 2).

You are given segments of one class, already split by time. For each segment you name it and write questions about it.

Rules:
1. Every question must be answerable from the transcript text of ITS OWN segment. Never test something the tutor did not say.
2. Test understanding rather than recall of a phrase. Mix conceptual and factual.
3. Exactly four options. Exactly one is correct. The three wrong options must be plausible to someone who half-followed the class, not obviously silly.
4. Vary which letter is correct. Do not make most answers the same letter.
5. Every question gets a one-sentence explanation of why the answer is right.
6. Questions must be distinct from one another. No rephrasings of the same fact.
7. The title is 3 to 8 words naming what this stretch of the class covered. The description is one or two sentences. Both describe the segment you were given; do not comment on the split itself.`;

/** Transcript lines inside one segment's window, for the questions pass. */
function sliceTranscript(entries: TranscriptEntry[], start: number, end: number): string {
  return entries
    .filter((e) => e.start >= start - 1 && e.start <= end + 1)
    .map((e) => e.text)
    .join(' ')
    .slice(0, 12000);
}

function stripFences(raw: string): string {
  return raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
}

/**
 * The segment array, or null when the response is not valid JSON.
 *
 * Deliberately does not throw. A malformed response is the common failure here,
 * not the exceptional one, and the caller has a salvage path that works on the
 * raw text.
 */
function parseSegments(raw: string): any[] | null {
  try {
    const parsed = JSON.parse(stripFences(raw));
    const segments = parsed?.segments;
    return Array.isArray(segments) ? segments : null;
  } catch {
    return null;
  }
}

/**
 * Every complete `{...}` object in a string, innermost first, ignoring braces
 * inside string literals.
 *
 * This is what rescues a truncated response. The object the model was midway
 * through when it ran out of tokens never closes, so it is never emitted, while
 * every complete one before it comes back intact. The outer wrapper never closes
 * either, which is exactly why JSON.parse fails on the whole thing and this does
 * not.
 */
function scanJsonObjects(text: string): string[] {
  const out: string[] = [];
  const opens: number[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') opens.push(i);
    else if (ch === '}' && opens.length) out.push(text.slice(opens.pop()!, i + 1));
  }
  return out;
}

/** The first value of a top-level-ish string key, for a title we could not parse. */
function salvageString(raw: string, key: string): string {
  const m = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(raw);
  if (!m) return '';
  try {
    return JSON.parse(`"${m[1]}"`);
  } catch {
    return '';
  }
}

/**
 * Pull whatever complete questions a broken response still contains.
 *
 * Worth doing because a truncation at question twelve of fifteen used to cost
 * all twelve, and twelve grounded questions is a working checkpoint.
 */
function salvageQuestions(raw: string): GeneratedQuestion[] {
  const out: GeneratedQuestion[] = [];
  for (const chunk of scanJsonObjects(raw)) {
    if (!chunk.includes('"question_text"')) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(chunk);
    } catch {
      continue;
    }
    const q = sanitiseQuestion(parsed);
    if (q) out.push(q);
  }
  return out;
}

/**
 * Drop repeats of the same question.
 *
 * Duplicate text is a common degradation near the end of a long response, and a
 * duplicate inside a served draw looks like a bug to the student sitting it.
 */
function dedupe(questions: GeneratedQuestion[]): GeneratedQuestion[] {
  const seen = new Set<string>();
  return questions.filter((q) => {
    const key = q.question_text.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sanitiseQuestion(q: any): GeneratedQuestion | null {
  if (!q || typeof q.question_text !== 'string' || q.question_text.trim().length < 10) return null;
  const opts = ['option_a', 'option_b', 'option_c', 'option_d'].map((k) =>
    typeof q[k] === 'string' ? q[k].trim() : '',
  );
  if (opts.some((o) => !o)) return null;
  if (new Set(opts.map((o) => o.toLowerCase())).size !== 4) return null;

  const correct = String(q.correct_option || '').toLowerCase();
  return {
    question_text: q.question_text.trim(),
    option_a: opts[0],
    option_b: opts[1],
    option_c: opts[2],
    option_d: opts[3],
    correct_option: (['a', 'b', 'c', 'd'].includes(correct) ? correct : 'a') as 'a' | 'b' | 'c' | 'd',
    explanation: typeof q.explanation === 'string' ? q.explanation.trim() : '',
  };
}

/** What the model returns for one segment: what to call it, and its questions. */
interface SegmentDraft {
  title: string;
  description: string;
  questions: GeneratedQuestion[];
}

/**
 * Name and question a batch of segments whose boundaries are already fixed.
 *
 * Batched rather than one call for everything, because a single response holding
 * a whole class at fifteen questions a segment reliably truncates.
 */
async function draftSegments(
  batch: Array<{ index: number; start: number; end: number }>,
  transcript: TranscriptEntry[],
  itemTitle: string,
  poolPerSegment: number,
  feature: AiFeatureId,
  actorId: string | null,
): Promise<Record<number, SegmentDraft>> {
  const prompt = `Class: "${itemTitle}"

For EACH segment below, write a title, a description, and exactly ${poolPerSegment} questions, using only that segment's transcript.

${batch
  .map(
    (s) =>
      `--- SEGMENT ${s.index} (${describeWindow(s.start, s.end)}) ---\n${sliceTranscript(
        transcript,
        s.start,
        s.end,
      )}`,
  )
  .join('\n\n')}

Return JSON:
{"segments":[{"index":${batch[0]?.index ?? 0},"title":"...","description":"...","questions":[{"question_text":"...","option_a":"...","option_b":"...","option_c":"...","option_d":"...","correct_option":"a","explanation":"..."}]}]}`;

  const raw = await generateGeminiText({
    feature,
    actorId,
    parts: [{ text: prompt }],
    systemInstruction: QUESTION_INSTRUCTION,
    temperature: 0.7,
    // Generous: this is the call that truncates, and a truncated response costs
    // the same quota as a complete one.
    maxOutputTokens: 16384,
    responseMimeType: 'application/json',
  });

  const out: Record<number, SegmentDraft> = {};
  for (const seg of parseSegments(raw) || []) {
    const idx = Number(seg?.index);
    if (!Number.isFinite(idx)) continue;

    const questions = ((seg.questions || []) as unknown[])
      .map(sanitiseQuestion)
      .filter(Boolean) as GeneratedQuestion[];

    out[idx] = {
      title: typeof seg.title === 'string' ? seg.title.trim() : '',
      description: typeof seg.description === 'string' ? seg.description.trim() : '',
      questions: dedupe(questions),
    };
  }

  // The response did not parse, but a truncated one still holds every question
  // written before the cut. With one segment per call there is no ambiguity
  // about which segment they belong to, so they are worth rescuing rather than
  // spending another call on the shared key to ask again.
  if (Object.keys(out).length === 0 && batch.length === 1) {
    const questions = dedupe(salvageQuestions(raw));
    if (questions.length > 0) {
      out[batch[0].index] = {
        title: salvageString(raw, 'title'),
        description: salvageString(raw, 'description'),
        questions,
      };
    }
  }

  return out;
}

/**
 * Generate sections and their question pools.
 *
 * Never throws for a partial result: a segment whose questions failed comes back
 * with an empty array, and the quality bar downstream decides whether that is
 * publishable. Throwing here would discard the segments too.
 */
export async function generateSectionsAndQuestions(
  transcript: TranscriptEntry[],
  itemTitle: string,
  options: GenerateOptions = {},
): Promise<GeneratedContent> {
  const targetSegmentSeconds = options.targetSegmentSeconds || DEFAULTS.targetSegmentSeconds;
  const poolPerSegment = options.poolPerSegment || DEFAULTS.poolPerSegment;
  const feature = options.feature || 'nexus.recap-questions';
  const actorId = options.actorId ?? null;
  const durationSeconds =
    options.durationSeconds || (transcript.length ? transcript[transcript.length - 1].end : 0);

  const planned = planSegments(transcript, durationSeconds, targetSegmentSeconds);
  if (!planned.length) throw new Error('Class has no usable duration to split');

  // Named up front so a segment whose batch fails still has a title a teacher
  // can recognise in the editor, rather than an empty string.
  const sections: GeneratedSection[] = planned.map((p, i) => ({
    title: `Part ${i + 1}: ${describeWindow(p.start, p.end)}`,
    description: '',
    start_timestamp_seconds: p.start,
    end_timestamp_seconds: p.end,
    questions: [],
  }));

  let callsUsed = 0;

  /**
   * One call for one batch, writing whatever came back onto `sections`.
   *
   * Returns false when nothing usable arrived, which is what the retry pass
   * reads. Never throws: one failed batch must not cost the batches that worked,
   * and the quality bar downstream decides whether what survived is publishable.
   */
  const runBatch = async (
    batch: Array<{ index: number; start: number; end: number }>,
  ): Promise<boolean> => {
    callsUsed++;
    try {
      const byIndex = await draftSegments(
        batch,
        transcript,
        itemTitle,
        poolPerSegment,
        feature,
        actorId,
      );
      let got = false;
      for (const b of batch) {
        const draft = byIndex[b.index];
        if (!draft || draft.questions.length === 0) continue;
        if (draft.title) sections[b.index].title = draft.title;
        if (draft.description) sections[b.index].description = draft.description;
        sections[b.index].questions = draft.questions;
        got = true;
      }
      return got;
    } catch (err) {
      // A refusal from the budget guard is not a bad batch. Swallowing it would
      // spend the remaining nine attempts re-asking a question already answered
      // with no, and hand the teacher an empty recap instead of telling them the
      // feature is in manual mode or the cap is reached.
      if (err instanceof AiBlockedError) throw err;

      // A rate limit is the caller's business, not this loop's: swallowing it
      // would spend the remaining budget on a key that has already said no, and
      // the sweep upstream stops its whole run on it.
      const message = err instanceof Error ? err.message : String(err);
      if (/429|Too Many Requests|quota|RESOURCE_EXHAUSTED/.test(message)) throw err;
      console.error('[ai-generate] question batch failed:', message);
      return false;
    }
  };

  for (let i = 0; i < planned.length; i += QUESTION_BATCH_SIZE) {
    if (callsUsed >= MAX_CALLS_PER_RECAP) break;
    // The index travels with the segment so the model's reply maps back to the
    // right one even when a batch comes back partial or out of order.
    await runBatch(
      planned
        .slice(i, i + QUESTION_BATCH_SIZE)
        .map((p, j) => ({ index: i + j, start: p.start, end: p.end })),
    );
  }

  // Second pass over the segments that came back with nothing. A single retry,
  // because the usual causes (a truncated response, a transient refusal) clear
  // on the next attempt and the ones that do not are a transcript problem no
  // number of retries will fix. Bounded by the same call budget, so a recap with
  // many empty segments retries the earliest ones and stops.
  for (let i = 0; i < sections.length; i++) {
    if (callsUsed >= MAX_CALLS_PER_RECAP) break;
    if (sections[i].questions.length > 0) continue;
    await runBatch([
      { index: i, start: planned[i].start, end: planned[i].end },
    ]);
  }

  return { sections };
}
