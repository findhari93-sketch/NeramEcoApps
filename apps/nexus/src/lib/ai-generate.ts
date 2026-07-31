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
 * 2. Generation is TWO calls, not one. Asking for "18 sections of 15 questions"
 *    in a single response either truncates mid-JSON or degrades into invented
 *    filler around question 60. Splitting boundaries from questions keeps each
 *    response small enough to come back whole, and has the useful side effect
 *    that a questions failure does not cost us the section structure.
 */

import { generateGeminiText } from './gemini-client';
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
  targetSegmentSeconds: 300,
  poolPerSegment: 15,
};

/** Questions for at most this many segments per call, so JSON comes back whole. */
const QUESTION_BATCH_SIZE = 4;
/** Hard ceiling on Gemini calls for one recap. Shared key, metered quota. */
export const MAX_CALLS_PER_RECAP = 5;

const BOUNDARY_INSTRUCTION = `You split lecture transcripts into logical checkpoint segments for an architecture entrance exam course (NATA and JEE Paper 2).

Rules:
1. Split at genuine topic changes, not at fixed intervals. A boundary mid-explanation is worse than a segment slightly off the target length.
2. Timestamps MUST come from the transcript. Use the start of the first relevant line and the end of the last.
3. Segments must not overlap, must not leave gaps longer than about three minutes, and together must cover essentially the whole session.
4. Titles are 3 to 8 words. Descriptions are one or two sentences saying what the segment covers.
5. Return ONLY segments, no questions.`;

const QUESTION_INSTRUCTION = `You write multiple-choice checkpoint questions for an architecture entrance exam course (NATA and JEE Paper 2).

Rules:
1. Every question must be answerable from the transcript text of ITS OWN segment. Never test something the tutor did not say.
2. Test understanding rather than recall of a phrase. Mix conceptual and factual.
3. Exactly four options. Exactly one is correct. The three wrong options must be plausible to someone who half-followed the class, not obviously silly.
4. Vary which letter is correct. Do not make most answers the same letter.
5. Every question gets a one-sentence explanation of why the answer is right.
6. Questions must be distinct from one another. No rephrasings of the same fact.`;

function formatTranscript(entries: TranscriptEntry[]): string {
  return entries
    .map((e) => {
      const mm = Math.floor(e.start / 60);
      const ss = Math.floor(e.start % 60);
      return `[${mm}:${ss.toString().padStart(2, '0')}] ${e.text}`;
    })
    .join('\n');
}

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

/**
 * Pass 1: where the segments are.
 * Small output even for a two hour class, so it is the call least likely to truncate.
 */
async function generateBoundaries(
  transcript: TranscriptEntry[],
  itemTitle: string,
  opts: Required<Pick<GenerateOptions, 'targetSegmentSeconds'>> & { durationSeconds: number },
): Promise<Array<Omit<GeneratedSection, 'questions'>>> {
  const target = opts.targetSegmentSeconds;
  const duration =
    opts.durationSeconds || (transcript.length ? transcript[transcript.length - 1].end : 0);
  const wanted = Math.max(2, Math.round(duration / target) || 3);

  const prompt = `Class: "${itemTitle}"
Approximate length: ${Math.round(duration)} seconds.
Aim for about ${wanted} segments of roughly ${target} seconds each. One more or one fewer is fine if it lands on a better topic boundary.

Transcript:
${formatTranscript(transcript)}

Return JSON:
{"sections":[{"title":"...","description":"...","start_timestamp_seconds":0,"end_timestamp_seconds":300}]}`;

  const raw = await generateGeminiText({
    parts: [{ text: prompt }],
    systemInstruction: BOUNDARY_INSTRUCTION,
    temperature: 0.4,
    maxOutputTokens: 4096,
    responseMimeType: 'application/json',
  });

  const parsed = parseJson<{ sections: any[] }>(raw, 'segments');
  const sections = (parsed.sections || [])
    .filter(
      (s) =>
        s &&
        typeof s.title === 'string' &&
        Number.isFinite(Number(s.start_timestamp_seconds)) &&
        Number.isFinite(Number(s.end_timestamp_seconds)) &&
        Number(s.end_timestamp_seconds) > Number(s.start_timestamp_seconds),
    )
    .map((s) => ({
      title: String(s.title).trim(),
      description: typeof s.description === 'string' ? s.description.trim() : '',
      start_timestamp_seconds: Math.max(0, Math.round(Number(s.start_timestamp_seconds))),
      end_timestamp_seconds: Math.round(Number(s.end_timestamp_seconds)),
    }))
    .sort((a, b) => a.start_timestamp_seconds - b.start_timestamp_seconds);

  if (!sections.length) throw new Error('AI returned no usable segments');
  return sections;
}

/**
 * Pass 2: questions for a batch of segments.
 * Batched rather than one call for everything, because a single response holding
 * 18 segments x 15 questions reliably truncates.
 */
async function generateQuestionsFor(
  batch: Array<Omit<GeneratedSection, 'questions'>>,
  transcript: TranscriptEntry[],
  poolPerSegment: number,
): Promise<Record<number, GeneratedQuestion[]>> {
  const segments = batch.map((s, i) => ({
    index: i,
    title: s.title,
    transcript: sliceTranscript(transcript, s.start_timestamp_seconds, s.end_timestamp_seconds),
  }));

  const prompt = `Write exactly ${poolPerSegment} questions for EACH segment below, using only that segment's transcript.

${segments
  .map((s) => `--- SEGMENT ${s.index} : ${s.title} ---\n${s.transcript}`)
  .join('\n\n')}

Return JSON:
{"segments":[{"index":0,"questions":[{"question_text":"...","option_a":"...","option_b":"...","option_c":"...","option_d":"...","correct_option":"a","explanation":"..."}]}]}`;

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
  const out: Record<number, GeneratedQuestion[]> = {};
  for (const seg of parsed.segments || []) {
    const idx = Number(seg?.index);
    if (!Number.isFinite(idx)) continue;
    const questions = (seg.questions || [])
      .map(sanitiseQuestion)
      .filter(Boolean) as GeneratedQuestion[];
    // Duplicate question text is a common degradation near the end of a long
    // response, and a duplicate in a served draw looks like a bug to a student.
    const seen = new Set<string>();
    out[idx] = questions.filter((q) => {
      const key = q.question_text.toLowerCase().replace(/\s+/g, ' ').trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
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

  const boundaries = await generateBoundaries(transcript, itemTitle, {
    targetSegmentSeconds,
    durationSeconds,
  });

  const sections: GeneratedSection[] = boundaries.map((b) => ({ ...b, questions: [] }));

  let callsUsed = 1;
  for (let i = 0; i < boundaries.length; i += QUESTION_BATCH_SIZE) {
    if (callsUsed >= MAX_CALLS_PER_RECAP) break;
    const batch = boundaries.slice(i, i + QUESTION_BATCH_SIZE);
    callsUsed++;
    try {
      const byIndex = await generateQuestionsFor(batch, transcript, poolPerSegment);
      batch.forEach((_, j) => {
        sections[i + j].questions = byIndex[j] || [];
      });
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
