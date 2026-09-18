/**
 * Reading a transcript file a teacher brings in, whatever wrote it.
 *
 * parseVTT (vtt-parser.ts) is strict on purpose: it reads the WEBVTT that Teams
 * and Stream produce, and it is shared with the Teams class transcripts, so it
 * is left alone. The files teachers now bring are messier. Google AI Studio
 * writes cues without hours ("01:05.250"), wraps its answer in code fences and
 * sometimes a sentence of chatter; a Whisper app writes SRT with comma
 * milliseconds and index lines. parseVTT rejects the first outright and glues a
 * closing fence onto the last cue.
 *
 * So this reads loosely, then writes canonical WEBVTT (buildVtt) that parseVTT
 * reads back exactly. What gets stored and sent to the server is always the
 * canonical form, so nothing downstream ever sees the mess.
 *
 * A two-hour class is transcribed in AI Studio in two parts, so a teacher uploads
 * two files at once. mergeTranscriptFiles puts them in time order, drops the
 * stretch both parts transcribed, and moves a part whose clock restarted at zero
 * to where that part really begins.
 *
 * Pure TypeScript, no JSX and no next/* imports, so the page and the tests share
 * one definition.
 */

import type { TranscriptEntry } from '@neram/database';

/**
 * The largest transcript the page will send. A merged two-hour transcript is
 * about 200 KB, and Vercel refuses a request body over 4.5 MB with an error the
 * teacher could not act on.
 */
export const MAX_TRANSCRIPT_BYTES = 4_000_000;

/** A timestamp in any form seen so far: SS, MM:SS, H:MM:SS, with . or , fractions. */
const TIMESTAMP = String.raw`\d{1,3}(?::\d{1,2}){0,2}(?:[.,]\d{1,3})?`;
const CUE_LINE = new RegExp(String.raw`^\s*(${TIMESTAMP})\s*-->\s*(${TIMESTAMP})`);

function toSeconds(ts: string): number {
  const parts = ts.replace(',', '.').split(':');
  let seconds = 0;
  for (const part of parts) seconds = seconds * 60 + Number(part);
  return seconds;
}

/** Strip markup a chat answer or a caption file may carry around the words. */
function cleanLine(line: string): string {
  return line
    .replace(/\*\*/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\{[^}]+\}/g, '')
    .trim();
}

/**
 * Every cue in a transcript file, in the order written.
 *
 * Lines before the first cue are ignored (a WEBVTT header, a NOTE, or "Here is
 * the transcript"), as are code fences anywhere. A cue with no words is dropped.
 */
export function parseTranscriptText(raw: string): TranscriptEntry[] {
  // A byte order mark needs no handling: trim() and \s both treat it as space.
  const lines = (raw || '')
    .replace(/\r\n?/g, '\n')
    .split('\n');

  const entries: TranscriptEntry[] = [];
  let current: { start: number; end: number; text: string[] } | null = null;

  const close = () => {
    if (!current) return;
    const text = current.text.join(' ').replace(/\s+/g, ' ').trim();
    if (text) {
      entries.push({ start: current.start, end: Math.max(current.start, current.end), text });
    }
    current = null;
  };

  for (const rawLine of lines) {
    if (/^\s*```/.test(rawLine)) continue;
    const line = cleanLine(rawLine);

    const cue = CUE_LINE.exec(line);
    if (cue) {
      // An SRT index written straight under the previous cue's words, with the
      // blank line missing, is not part of what was said.
      const pending = current as { text: string[] } | null;
      if (pending && pending.text.length && /^\d+$/.test(pending.text[pending.text.length - 1])) {
        pending.text.pop();
      }
      close();
      current = { start: toSeconds(cue[1]), end: toSeconds(cue[2]), text: [] };
      continue;
    }

    if (!line) {
      close();
      continue;
    }
    if (current) (current as { text: string[] }).text.push(line);
  }
  close();

  return entries.filter((e) => Number.isFinite(e.start) && Number.isFinite(e.end));
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

function formatVttTime(seconds: number): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(totalMs / 3_600_000);
  const m = Math.floor((totalMs % 3_600_000) / 60_000);
  const s = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}.${pad(ms, 3)}`;
}

/** Canonical WEBVTT, which parseVTT reads back to the same entries. */
export function buildVtt(entries: TranscriptEntry[]): string {
  const cues = entries.map((e) => {
    const text = e.text.replace(/-->/g, '->').replace(/\s*\n\s*/g, ' ').trim();
    return `${formatVttTime(e.start)} --> ${formatVttTime(e.end)}\n${text}`;
  });
  return `WEBVTT\n\n${cues.join('\n\n')}\n`;
}

export function normaliseTranscriptText(raw: string): string {
  return buildVtt(parseTranscriptText(raw));
}

export interface TranscriptCoverage {
  firstStart: number;
  lastEnd: number;
  /** Silences longer than GAP_SECONDS, including the stretch after the last cue. */
  gaps: Array<{ from: number; to: number }>;
}

/**
 * Longer than any pause in a real class, so a gap this size is a missing part
 * or a transcript that stopped early, which is worth asking the teacher about.
 */
const GAP_SECONDS = 180;

export function summariseCoverage(entries: TranscriptEntry[], durationSeconds: number): TranscriptCoverage {
  const sorted = [...entries].sort((a, b) => a.start - b.start);
  const gaps: Array<{ from: number; to: number }> = [];
  let reached = 0;
  for (const e of sorted) {
    if (e.start - reached > GAP_SECONDS) gaps.push({ from: reached, to: e.start });
    reached = Math.max(reached, e.end);
  }
  if (durationSeconds > 0 && durationSeconds - reached > GAP_SECONDS) {
    gaps.push({ from: reached, to: durationSeconds });
  }
  return {
    firstStart: sorted.length ? sorted[0].start : 0,
    lastEnd: reached,
    gaps,
  };
}

export interface MergeResult {
  vtt: string;
  entries: TranscriptEntry[];
  coverage: TranscriptCoverage;
  /** Parts whose clock restarted at zero and were moved, so the page can say so. */
  shiftedParts: Array<{ name: string; bySeconds: number }>;
  /** Names of files that held no timestamps at all. */
  errors: string[];
}

/** A part that starts this close to zero was counted from the start of its own clip. */
const RESTARTED_CLOCK_SECONDS = 60;
/** How far apart two parts' copies of the same words can be. */
const DUPLICATE_WINDOW_SECONDS = 20;

function comparable(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function sameWords(a: string, b: string): boolean {
  const x = comparable(a);
  const y = comparable(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

export function mergeTranscriptFiles(
  files: Array<{ name: string; text: string }>,
  options: {
    durationSeconds: number;
    /** The AI Studio parts the teacher was given prompts for, in order. */
    parts?: Array<{ start: number; end: number }>;
  },
): MergeResult {
  const errors: string[] = [];
  const shiftedParts: Array<{ name: string; bySeconds: number }> = [];

  const parsed = [...files]
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
    .map((file) => ({ name: file.name, entries: parseTranscriptText(file.text) }))
    .filter((file) => {
      if (file.entries.length) return true;
      errors.push(file.name);
      return false;
    });

  // Files that start at the very beginning. The first is part 1; any after it
  // restarted their clock and belong where their part begins.
  const parts = options.parts || [];
  if (parsed.length > 1) {
    const fromZero = parsed.filter((f) => f.entries[0].start < RESTARTED_CLOCK_SECONDS);
    fromZero.forEach((file, k) => {
      const part = parts[k];
      if (k === 0 || !part) return;
      const lastEnd = Math.max(...file.entries.map((e) => e.end));
      if (lastEnd > part.end - part.start + 120) return;
      file.entries = file.entries.map((e) => ({ ...e, start: e.start + part.start, end: e.end + part.start }));
      shiftedParts.push({ name: file.name, bySeconds: part.start });
    });
  }

  const tagged = parsed
    .flatMap((file, fileIndex) => file.entries.map((entry) => ({ entry, fileIndex })))
    .sort((a, b) => a.entry.start - b.entry.start);

  // Where parts overlap, both transcribed the same words. Only a copy from a
  // DIFFERENT file is dropped: a tutor saying "okay" twice in one part is real.
  const kept: typeof tagged = [];
  for (const cue of tagged) {
    const repeat = kept.some(
      (k) =>
        k.fileIndex !== cue.fileIndex &&
        Math.abs(k.entry.start - cue.entry.start) <= DUPLICATE_WINDOW_SECONDS &&
        sameWords(k.entry.text, cue.entry.text),
    );
    if (!repeat) kept.push(cue);
  }

  const entries = kept.map((k) => k.entry);
  return {
    vtt: buildVtt(entries),
    entries,
    coverage: summariseCoverage(entries, options.durationSeconds),
    shiftedParts,
    errors,
  };
}

/** A position the way a teacher reads it on a player: 0:00, 25:00, 2:04:23. */
function readableClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/**
 * One sentence asking the teacher to check an upload, or null when it looks whole.
 *
 * The usual mistake with a long class is uploading only the first AI Studio part,
 * which would quietly give the second hour no checkpoints at all. Asked, not
 * refused: a class that really did end early is the teacher's call.
 */
export function coverageWarning(merged: MergeResult, durationSeconds: number, partCount: number): string | null {
  if (merged.errors.length) {
    const names = merged.errors.join(' and ');
    return merged.errors.length === 1
      ? `${names} has no timestamps, so it was left out.`
      : `${names} have no timestamps, so they were left out.`;
  }
  if (!(durationSeconds > 0) || !merged.entries.length) return null;

  const { firstStart, lastEnd, gaps } = merged.coverage;
  if (firstStart > GAP_SECONDS || durationSeconds - lastEnd > GAP_SECONDS) {
    return `This transcript covers ${readableClock(firstStart)} to ${readableClock(lastEnd)}, and the video is ${readableClock(
      durationSeconds,
    )} long. ${partCount > 1 ? 'Did you upload every part?' : 'Is it the whole class?'}`;
  }
  const middle = gaps.find((g) => g.from > 0 && g.to < durationSeconds);
  return middle
    ? `This transcript has nothing from ${readableClock(middle.from)} to ${readableClock(middle.to)}.`
    : null;
}
