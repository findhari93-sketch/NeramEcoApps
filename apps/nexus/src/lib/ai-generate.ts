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

import { generateGeminiText } from './gemini-client';
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

/** Questions for at most this many segments per call, so JSON comes back whole. */
const QUESTION_BATCH_SIZE = 4;
/** Hard ceiling on Gemini calls for one recap. Shared key, metered quota. */
export const MAX_CALLS_PER_RECAP = 5;

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

function parseJson<T>(raw: string, what: string): T {
  const text = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`AI returned invalid JSON for ${what}`);
  }
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
    parts: [{ text: prompt }],
    systemInstruction: QUESTION_INSTRUCTION,
    temperature: 0.7,
    // Generous: this is the call that truncates, and a truncated response costs
    // the same quota as a complete one.
    maxOutputTokens: 16384,
    responseMimeType: 'application/json',
  });

  const parsed = parseJson<{ segments: any[] }>(raw, 'questions');
  const out: Record<number, SegmentDraft> = {};
  for (const seg of parsed.segments || []) {
    const idx = Number(seg?.index);
    if (!Number.isFinite(idx)) continue;

    const questions = (seg.questions || [])
      .map(sanitiseQuestion)
      .filter(Boolean) as GeneratedQuestion[];

    // Duplicate question text is a common degradation near the end of a long
    // response, and a duplicate in a served draw looks like a bug to a student.
    const seen = new Set<string>();
    out[idx] = {
      title: typeof seg.title === 'string' ? seg.title.trim() : '',
      description: typeof seg.description === 'string' ? seg.description.trim() : '',
      questions: questions.filter((q) => {
        const key = q.question_text.toLowerCase().replace(/\s+/g, ' ').trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }),
    };
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
  for (let i = 0; i < planned.length; i += QUESTION_BATCH_SIZE) {
    if (callsUsed >= MAX_CALLS_PER_RECAP) break;
    // The index travels with the segment so the model's reply maps back to the
    // right one even when a batch comes back partial or out of order.
    const batch = planned
      .slice(i, i + QUESTION_BATCH_SIZE)
      .map((p, j) => ({ index: i + j, start: p.start, end: p.end }));
    callsUsed++;
    try {
      const byIndex = await draftSegments(batch, transcript, itemTitle, poolPerSegment);
      for (const b of batch) {
        const draft = byIndex[b.index];
        if (!draft) continue;
        if (draft.title) sections[b.index].title = draft.title;
        if (draft.description) sections[b.index].description = draft.description;
        sections[b.index].questions = draft.questions;
      }
    } catch (err) {
      // One failed batch must not cost the batches that worked. The quality bar
      // holds the recap if too little came back.
      console.error(
        '[ai-generate] question batch failed:',
        err instanceof Error ? err.message : err,
      );
    }
  }

  return { sections };
}
