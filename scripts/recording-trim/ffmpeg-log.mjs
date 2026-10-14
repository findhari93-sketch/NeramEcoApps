/**
 * Pure parsers for the ffmpeg output the recording-trim worker reads.
 *
 * Kept apart from worker.mjs so they are unit tested (ffmpeg-log.test.mjs)
 * without ffmpeg installed: the formats below are copied from real runs.
 */

/**
 * silencedetect, from ffmpeg's stderr:
 *   [silencedetect @ 0x55d] silence_start: 12.502
 *   [silencedetect @ 0x55d] silence_end: 56.78 | silence_duration: 44.278
 * A silence still open at the end of the file runs to `duration`.
 */
export function parseSilences(log, duration) {
  const spans = [];
  let open = null;
  for (const line of String(log).split(/\r?\n/)) {
    const start = /silence_start:\s*(-?[\d.]+)/.exec(line);
    if (start) {
      open = Math.max(0, Number(start[1]));
      continue;
    }
    const end = /silence_end:\s*([\d.]+)/.exec(line);
    if (end && open !== null) {
      spans.push([open, Number(end[1])]);
      open = null;
    }
  }
  if (open !== null && duration > open) spans.push([open, duration]);
  return spans.filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a);
}

/**
 * freezedetect, from ffmpeg's stderr:
 *   [freezedetect @ 0x55d] lavfi.freezedetect.freeze_start: 102.4
 *   [freezedetect @ 0x55d] lavfi.freezedetect.freeze_duration: 31.2
 *   [freezedetect @ 0x55d] lavfi.freezedetect.freeze_end: 133.6
 */
export function parseFreezes(log, duration) {
  const spans = [];
  let open = null;
  for (const line of String(log).split(/\r?\n/)) {
    const start = /freeze_start:\s*([\d.]+)/.exec(line);
    if (start) {
      open = Number(start[1]);
      continue;
    }
    const end = /freeze_end:\s*([\d.]+)/.exec(line);
    if (end && open !== null) {
      spans.push([open, Number(end[1])]);
      open = null;
    }
  }
  if (open !== null && duration > open) spans.push([open, duration]);
  return spans.filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a);
}

/**
 * Keyframe times from
 *   ffprobe -select_streams v:0 -show_entries packet=pts_time,flags -of csv=p=0
 * which prints one packet per line, "12.345000,K__" for a keyframe.
 */
export function parseKeyframes(csv) {
  const out = [];
  for (const line of String(csv).split(/\r?\n/)) {
    const [time, flags] = line.split(',');
    if (!flags || !flags.includes('K')) continue;
    const t = Number(time);
    if (Number.isFinite(t) && t >= 0) out.push(t);
  }
  return out.sort((a, b) => a - b);
}

/** The middle gap between keyframes, to choose how freezedetect may read the video. */
export function medianKeyframeGap(keyframes) {
  if (keyframes.length < 2) return Infinity;
  const gaps = [];
  for (let i = 1; i < keyframes.length; i++) gaps.push(keyframes[i] - keyframes[i - 1]);
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}
