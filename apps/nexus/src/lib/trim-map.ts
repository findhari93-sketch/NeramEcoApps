/**
 * Moving times between a recording and its trimmed copy.
 *
 * A trimmed recording is the original's kept stretches joined end to end. Every
 * time anything stored about the recording is a second on the original's
 * timeline: transcript cues, checkpoint start and end, YouTube chapters, each
 * student's resume point and the stretches they played. All of it has to move
 * to the trimmed timeline when the trimmed copy goes live, and back again if
 * staff choose "Use original".
 *
 * The cut map is the kept stretches with their MEASURED output lengths (the
 * worker cuts on keyframes without re-encoding, so a segment can come out a
 * frame or two longer or shorter than planned). Forward T(t): a time inside a
 * kept stretch lands at its place in the output; a time inside a cut lands at
 * the join where the cut was. Inverse O(t') goes back.
 *
 * Pure, so every rule is unit tested (trim-map.test.ts).
 */

export type Span = readonly [number, number];

export interface CutMapSegment {
  /** Where this kept stretch is in the original. */
  src_start: number;
  src_end: number;
  /** Where it is in the trimmed copy. */
  out_start: number;
  out_len: number;
}

/** Build a cut map from kept stretches and, when known, each one's measured length. */
export function buildCutMap(keep: ReadonlyArray<Span>, measured?: ReadonlyArray<number>): CutMapSegment[] {
  const map: CutMapSegment[] = [];
  let out = 0;
  keep.forEach(([a, b], i) => {
    const len = measured && Number.isFinite(measured[i]) && measured[i] > 0 ? measured[i] : b - a;
    map.push({ src_start: a, src_end: b, out_start: out, out_len: len });
    out += len;
  });
  return map;
}

export function outputDuration(map: ReadonlyArray<CutMapSegment>): number {
  const last = map[map.length - 1];
  return last ? last.out_start + last.out_len : 0;
}

/** Original time to trimmed time. */
export function toTrimmed(map: ReadonlyArray<CutMapSegment>, t: number): number {
  if (!map.length || !Number.isFinite(t)) return 0;
  for (const s of map) {
    if (t < s.src_start) return s.out_start; // inside the cut before this stretch
    if (t < s.src_end) return s.out_start + Math.min(t - s.src_start, s.out_len);
  }
  return outputDuration(map);
}

/** Trimmed time back to original time. */
export function toOriginal(map: ReadonlyArray<CutMapSegment>, t: number): number {
  if (!map.length || !Number.isFinite(t)) return 0;
  for (const s of map) {
    if (t < s.out_start + s.out_len) {
      return s.src_start + Math.max(0, Math.min(t - s.out_start, s.src_end - s.src_start));
    }
  }
  return map[map.length - 1].src_end;
}

/** Played stretches onto the trimmed timeline. Anything inside a cut simply goes. */
export function rangesToTrimmed(map: ReadonlyArray<CutMapSegment>, ranges: ReadonlyArray<Span>): [number, number][] {
  const pieces: [number, number][] = [];
  for (const [a, b] of ranges) {
    for (const s of map) {
      const lo = Math.max(a, s.src_start);
      const hi = Math.min(b, s.src_end);
      // Within its own segment, so a piece ending exactly at a join is not
      // read as the start of the next one.
      if (hi > lo) pieces.push([s.out_start + (lo - s.src_start), s.out_start + Math.min(hi - s.src_start, s.out_len)]);
    }
  }
  return mergeAdjacent(pieces);
}

/** And back. A stretch that was played on the trimmed copy maps to the same content in the original. */
export function rangesToOriginal(map: ReadonlyArray<CutMapSegment>, ranges: ReadonlyArray<Span>): [number, number][] {
  const pieces: [number, number][] = [];
  for (const [a, b] of ranges) {
    for (const s of map) {
      const lo = Math.max(a, s.out_start);
      const hi = Math.min(b, s.out_start + s.out_len);
      if (hi > lo) {
        const span = s.src_end - s.src_start;
        pieces.push([s.src_start + Math.min(lo - s.out_start, span), s.src_start + Math.min(hi - s.out_start, span)]);
      }
    }
  }
  return mergeAdjacent(pieces);
}

function mergeAdjacent(pieces: [number, number][]): [number, number][] {
  const sorted = pieces.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const out: [number, number][] = [];
  for (const p of sorted) {
    const last = out[out.length - 1];
    if (last && p[0] <= last[1] + 0.05) last[1] = Math.max(last[1], p[1]);
    else out.push([Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]);
  }
  return out.map(([a, b]) => [Math.round(a * 10) / 10, Math.round(b * 10) / 10]);
}

const STAMP = /(\d{1,2}:)?(\d{2}):(\d{2})\.(\d{3})/;
const TIMING = /^((?:\d{1,2}:)?\d{2}:\d{2}\.\d{3})\s+-->\s+((?:\d{1,2}:)?\d{2}:\d{2}\.\d{3})(.*)$/;

function parseStamp(stamp: string): number {
  const m = STAMP.exec(stamp);
  if (!m) return 0;
  const h = m[1] ? Number(m[1].slice(0, -1)) : 0;
  return h * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000;
}

function formatStamp(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const rest = ms % 1000;
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(rest, 3)}`;
}

/**
 * A WEBVTT transcript onto the trimmed timeline. Only timing lines change, so
 * speaker tags and everything else survive as they were. A cue said entirely
 * inside a cut is dropped: nobody will ever hear it.
 */
export function remapVtt(vtt: string, map: ReadonlyArray<CutMapSegment>): string {
  const blocks = vtt.replace(/\r\n/g, '\n').split(/\n{2,}/);
  const out: string[] = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    const at = lines.findIndex((l) => TIMING.test(l.trim()));
    if (at < 0) {
      out.push(block);
      continue;
    }
    const m = TIMING.exec(lines[at].trim())!;
    const start = parseStamp(m[1]);
    const end = parseStamp(m[2]);
    const overlaps = map.some((s) => Math.min(end, s.src_end) > Math.max(start, s.src_start));
    if (!overlaps) continue;
    const newStart = toTrimmed(map, start);
    const newEnd = Math.max(toTrimmed(map, end), newStart + 0.2);
    lines[at] = `${formatStamp(newStart)} --> ${formatStamp(newEnd)}${m[3]}`;
    out.push(lines.join('\n'));
  }
  return out.join('\n\n');
}

export interface TimedSection {
  id: string;
  start_timestamp_seconds: number;
  end_timestamp_seconds: number;
}

/** Checkpoints onto a timeline. `move` is toTrimmed or toOriginal bound to a map. */
export function moveSections<T extends TimedSection>(sections: ReadonlyArray<T>, move: (t: number) => number): T[] {
  return sections.map((s) => ({
    ...s,
    start_timestamp_seconds: Math.round(move(s.start_timestamp_seconds) * 10) / 10,
    end_timestamp_seconds: Math.round(move(s.end_timestamp_seconds) * 10) / 10,
  }));
}

export interface Chapter {
  t: number;
  label: string;
}

/**
 * YouTube chapters onto a timeline. YouTube wants the first at 0:00 and each
 * at least ten seconds after the last, so a chapter that a cut squeezed up
 * against its neighbour is dropped rather than rejected by YouTube.
 */
export function moveChapters(chapters: ReadonlyArray<Chapter>, move: (t: number) => number): Chapter[] {
  const out: Chapter[] = [];
  for (const c of [...chapters].sort((a, b) => a.t - b.t)) {
    const t = out.length === 0 ? 0 : Math.round(move(c.t));
    if (out.length && t - out[out.length - 1].t < 10) continue;
    out.push({ t, label: c.label });
  }
  return out;
}
