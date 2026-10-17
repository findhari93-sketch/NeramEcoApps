/**
 * Decides what to cut out of a class recording.
 *
 * Students asked for this: a class recording starts with the teacher waiting
 * for people to join, and has dead stretches in the middle, and catch-up makes
 * them sit through all of it. Across 30 recent classes, speech started 5 to 20
 * minutes in and 15 to 34% of each recording was silent.
 *
 * The founder's rule:
 *   - always cut the wait before the class really starts, and the dead tail
 *     after it ends (2026-10-14);
 *   - in the middle, with a transcript, tighten every gap of 3 seconds or more
 *     where nobody says a word down to about a second of quiet, whatever the
 *     screen does (2026-10-16). Students can still open any skipped part from
 *     the catch-up player, so a silent drawing demo is one tap away;
 *   - without a usable transcript, the older rule stays: cut only a stretch of
 *     30 seconds or more that is silent AND where the screen does not change.
 *
 * Inputs come from ffmpeg on the trim worker (silencedetect, freezedetect, the
 * keyframe list) plus the transcript's cue times, which say where speech is far
 * more reliably than an audio threshold. When there is a transcript it alone
 * decides who is speaking (founder, 2026-10-15); the audio level is only the
 * fallback for a class without one. Pure, so every rule is unit tested.
 *
 * When the worker cuts without re-encoding, cuts are snapped to keyframes: a
 * kept stretch can only begin on one. The snap always keeps a little more
 * video, never less. A re-encoding worker sends no keyframes, so cuts land
 * where the plan says.
 */

export type Span = readonly [number, number];

export interface TrimParams {
  /** Shortest mid-class stretch worth cutting. */
  minMidCut: number;
  /** Shortest lead-in worth cutting. */
  leadMinCut: number;
  /** Shortest tail worth cutting. */
  tailMinCut: number;
  /** Kept before the first words, so the class does not start mid-breath. */
  edgeMargin: number;
  /** Kept after the last words: goodbyes trail off. */
  tailMargin: number;
  /** Kept at each side of a mid-class cut. */
  midMargin: number;
  /** Speech "really starts" when this window holds at least sustainSpeech of it. */
  sustainWindow: number;
  sustainSpeech: number;
  /** Never remove more than this share of a recording. */
  maxRemovedRatio: number;
  /** Never leave less than this. */
  minKept: number;
  /** Below this in total, trimming is not worth a new file. */
  minWorth: number;
  /** At most this many mid-class cuts (the longest are kept). */
  maxMidCuts: number;
  /**
   * 'ignore': with a usable transcript, any wordless gap is a pause, whatever
   * the screen does. 'freeze': a pause must also have a still screen and last
   * minMidCut. Without a usable transcript, 'freeze' always applies.
   */
  screenRule: 'ignore' | 'freeze';
  /** Shortest wordless gap tightened under the transcript rule. */
  pauseMinGap: number;
  /** Quiet kept after the last word before a tightened gap. */
  keepAfterSpeech: number;
  /** Quiet kept before the first word after it (cues can start a little late). */
  keepBeforeSpeech: number;
  /**
   * Below this share of the class covered by cues, the transcript is not
   * trusted to say where nobody speaks (a wrong language, a dropped feed), and
   * pauses fall back to the 'freeze' rule. Real classes run 0.43 to 0.88.
   */
  minSpeechCoverage: number;
}

export const DEFAULT_TRIM_PARAMS: TrimParams = {
  minMidCut: 30,
  leadMinCut: 45,
  tailMinCut: 30,
  edgeMargin: 3,
  tailMargin: 8,
  midMargin: 1.5,
  sustainWindow: 120,
  sustainSpeech: 30,
  maxRemovedRatio: 0.6,
  minKept: 600,
  minWorth: 60,
  maxMidCuts: 600,
  screenRule: 'ignore',
  pauseMinGap: 3,
  keepAfterSpeech: 0.4,
  keepBeforeSpeech: 0.6,
  minSpeechCoverage: 0.35,
};

export interface TrimPlanInput {
  duration: number;
  /** Transcript cue spans. Empty when there is no transcript. */
  speech: ReadonlyArray<Span>;
  /** ffmpeg silencedetect spans. */
  silences: ReadonlyArray<Span>;
  /** ffmpeg freezedetect spans. */
  freezes: ReadonlyArray<Span>;
  /** Keyframe times, ascending. Empty means "do not snap". */
  keyframes: ReadonlyArray<number>;
  params?: Partial<TrimParams>;
}

export type CutKind = 'lead' | 'tail' | 'pause';

export interface TrimCut {
  from: number;
  to: number;
  kind: CutKind;
}

/** Which rule decided the mid-class pauses, stored with the plan so a result can be explained later. */
export type PauseRule = 'transcript' | 'freeze' | 'freeze_low_coverage';

export type TrimPlan =
  | { kind: 'cut'; cuts: TrimCut[]; keep: Span[]; removedSeconds: number; pauseRule: PauseRule }
  | { kind: 'skip'; reason: 'NO_CUTS' | 'NOT_WORTH_IT' | 'GUARD_RATIO' | 'NO_DURATION' | 'NO_SPEECH' };

function merge(spans: ReadonlyArray<Span>): [number, number][] {
  const sorted = spans
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a)
    .map(([a, b]) => [a, b] as [number, number])
    .sort((x, y) => x[0] - y[0]);
  const out: [number, number][] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
    else out.push([s[0], s[1]]);
  }
  return out;
}

function coverage(spans: ReadonlyArray<Span>, from: number, to: number): number {
  let total = 0;
  for (const [a, b] of spans) {
    const lo = Math.max(a, from);
    const hi = Math.min(b, to);
    if (hi > lo) total += hi - lo;
  }
  return total;
}

function complement(spans: ReadonlyArray<Span>, duration: number): [number, number][] {
  const out: [number, number][] = [];
  let cursor = 0;
  for (const [a, b] of merge(spans)) {
    if (a > cursor) out.push([cursor, Math.min(a, duration)]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < duration) out.push([cursor, duration]);
  return out.filter(([a, b]) => b > a);
}

function intersect(a: ReadonlyArray<Span>, b: ReadonlyArray<Span>): [number, number][] {
  const out: [number, number][] = [];
  const A = merge(a);
  const B = merge(b);
  let i = 0;
  let j = 0;
  while (i < A.length && j < B.length) {
    const lo = Math.max(A[i][0], B[j][0]);
    const hi = Math.min(A[i][1], B[j][1]);
    if (hi > lo) out.push([lo, hi]);
    if (A[i][1] < B[j][1]) i++;
    else j++;
  }
  return out;
}

/** Where the class really starts: the first speech followed by a sustained run of it. */
function sustainedStart(speech: [number, number][], p: TrimParams): number | null {
  for (const [a] of speech) {
    if (coverage(speech, a, a + p.sustainWindow) >= p.sustainSpeech) return a;
  }
  return null;
}

/** Where it really ends: the last speech preceded by a sustained run of it. */
function sustainedEnd(speech: [number, number][], p: TrimParams): number | null {
  for (let i = speech.length - 1; i >= 0; i--) {
    const b = speech[i][1];
    if (coverage(speech, b - p.sustainWindow, b) >= p.sustainSpeech) return b;
  }
  return null;
}

/** The latest keyframe at or before t, or t itself when there are none. */
function keyframeAtOrBefore(keyframes: ReadonlyArray<number>, t: number): number {
  if (!keyframes.length) return t;
  let lo = 0;
  let hi = keyframes.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (keyframes[mid] <= t + 1e-6) {
      best = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return best >= 0 ? keyframes[best] : 0;
}

function minFor(kind: CutKind, p: TrimParams, rule: PauseRule): number {
  if (kind === 'lead') return p.leadMinCut;
  if (kind === 'tail') return p.tailMinCut;
  return rule === 'transcript'
    ? p.pauseMinGap - p.keepAfterSpeech - p.keepBeforeSpeech
    : p.minMidCut - 2 * p.midMargin;
}

function finish(
  cuts: TrimCut[],
  duration: number,
  p: TrimParams,
  keyframes: ReadonlyArray<number>,
  rule: PauseRule,
): TrimPlan {
  // Snap each cut's end back to a keyframe: the kept stretch after it starts
  // there. A tail cut runs to the end of the file and needs no snap.
  const snapped: TrimCut[] = [];
  for (const cut of cuts) {
    const to = cut.kind === 'tail' ? duration : keyframeAtOrBefore(keyframes, cut.to);
    if (to - cut.from >= minFor(cut.kind, p, rule) - 1e-6) snapped.push({ ...cut, to });
  }
  if (!snapped.length) return { kind: 'skip', reason: 'NO_CUTS' };

  const keep: [number, number][] = [];
  let cursor = 0;
  for (const cut of snapped.sort((a, b) => a.from - b.from)) {
    if (cut.from > cursor) keep.push([cursor, cut.from]);
    cursor = Math.max(cursor, cut.to);
  }
  if (cursor < duration) keep.push([cursor, duration]);
  // A sliver of a second between two cuts is not worth its own segment.
  const kept = keep.filter(([a, b]) => b - a >= 1);
  const keptSeconds = kept.reduce((sum, [a, b]) => sum + (b - a), 0);
  const removedSeconds = duration - keptSeconds;

  if (removedSeconds > p.maxRemovedRatio * duration || keptSeconds < p.minKept) {
    return { kind: 'skip', reason: 'GUARD_RATIO' };
  }
  if (removedSeconds < p.minWorth) return { kind: 'skip', reason: 'NOT_WORTH_IT' };
  return { kind: 'cut', cuts: snapped, keep: kept, removedSeconds, pauseRule: rule };
}

/** The share of [from, to] covered by speech. */
function speechShare(speech: ReadonlyArray<Span>, from: number, to: number): number {
  return to > from ? coverage(speech, from, to) / (to - from) : 0;
}

/** The longest n spans, back in time order. */
function longest(spans: [number, number][], n: number): [number, number][] {
  if (spans.length <= n) return spans;
  return [...spans]
    .sort((x, y) => y[1] - y[0] - (x[1] - x[0]))
    .slice(0, n)
    .sort((x, y) => x[0] - y[0]);
}

export function planTrim(input: TrimPlanInput): TrimPlan {
  const p: TrimParams = { ...DEFAULT_TRIM_PARAMS, ...(input.params ?? {}) };
  const D = input.duration;
  if (!(D > 0)) return { kind: 'skip', reason: 'NO_DURATION' };

  // Speech from the transcript when there is one, else whatever is not silent.
  const speech = input.speech.length
    ? merge(input.speech)
    : complement(input.silences, D).filter(([a, b]) => b - a >= 20);
  const start = sustainedStart(speech, p);
  const end = sustainedEnd(speech, p);
  if (start === null || end === null || end <= start) return { kind: 'skip', reason: 'NO_SPEECH' };

  const cuts: TrimCut[] = [];
  const leadEnd = Math.max(0, start - p.edgeMargin);
  if (leadEnd >= p.leadMinCut) cuts.push({ from: 0, to: leadEnd, kind: 'lead' });
  const tailStart = Math.min(D, end + p.tailMargin);
  if (D - tailStart >= p.tailMinCut) cuts.push({ from: tailStart, to: D, kind: 'tail' });

  const hasTranscript = input.speech.length > 0;
  const trusted = hasTranscript && speechShare(speech, start, end) >= p.minSpeechCoverage;
  const rule: PauseRule = !hasTranscript
    ? 'freeze'
    : !trusted
      ? 'freeze_low_coverage'
      : p.screenRule === 'ignore'
        ? 'transcript'
        : 'freeze';

  if (rule === 'transcript') {
    // Every wordless gap of pauseMinGap or more between the class's first and
    // last words shrinks to about a second of quiet. The 14 Oct JEE class kept
    // a 39s pause after the greetings under the freeze rule because a tile in
    // the Teams gallery changed (founder, 2026-10-16).
    const gaps = complement(speech, D).filter(([a, b]) => a >= start && b <= end && b - a >= p.pauseMinGap);
    for (const [a, b] of longest(gaps, p.maxMidCuts)) {
      cuts.push({ from: a + p.keepAfterSpeech, to: b - p.keepBeforeSpeech, kind: 'pause' });
    }
  } else {
    // Nobody speaking AND nothing moving on screen. With a transcript, "nobody
    // speaking" means no words in it, not an audio level: open student mics keep
    // the level above the silence threshold through a pause nobody talks in
    // (founder, 2026-10-15). A transcript too thin to trust leaves it to audio.
    const quiet = rule === 'freeze' && hasTranscript ? complement(speech, D) : input.silences;
    const idle = intersect(quiet, input.freezes)
      .map(([a, b]) => [Math.max(a, leadEnd), Math.min(b, tailStart)] as [number, number])
      .filter(([a, b]) => b - a >= p.minMidCut)
      // Speech inside an idle span (a quiet voice under the threshold) wins.
      .filter(([a, b]) => coverage(speech, a + p.midMargin, b - p.midMargin) < 1);
    for (const [a, b] of longest(idle, p.maxMidCuts)) {
      cuts.push({ from: a + p.midMargin, to: b - p.midMargin, kind: 'pause' });
    }
  }

  const plan = finish(cuts, D, p, input.keyframes, rule);
  // Too much for the guards: fall back to just the edges, which are the part
  // everyone agrees on.
  if (plan.kind === 'skip' && plan.reason === 'GUARD_RATIO') {
    return finish(cuts.filter((c) => c.kind !== 'pause'), D, p, input.keyframes, rule);
  }
  return plan;
}
