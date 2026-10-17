/**
 * Frame-accurate cutting for the recording-trim worker: the pure part.
 *
 * Without re-encoding, a kept stretch can only start on a keyframe, which
 * Teams writes every 6 seconds, so most 3 to 10 second pauses could not be cut
 * (founder, 2026-10-16: tighten every wordless gap of 3s or more). Re-encoding
 * in one ffmpeg pass lets a cut land on any frame.
 *
 * How sync is kept exact across hundreds of cuts:
 *   - video is first made constant-rate (fps=F), so frame k is at k/F;
 *   - audio is cut into chunks of exactly one video frame (sampleRate/F
 *     samples), so a chunk starts wherever a frame does;
 *   - every kept boundary is snapped to that frame grid (start down, end up:
 *     a little more is kept, never less).
 * Video and audio are then cut at the same instants, each kept stretch comes
 * out exactly (end - start) long, and the cut map built from these segments
 * matches the file.
 *
 * Kept apart from worker.mjs so it is unit tested (reencode.test.mjs) without
 * ffmpeg installed.
 */

const RATES = [30, 25, 24, 20, 15, 12, 10];

/**
 * The output frame rate: the source's, capped at 30, from a set where one
 * frame is a whole number of audio samples. Teams writes 30 fps and 48 kHz.
 */
export function pickFps(sourceFps, sampleRate) {
  const src = Number.isFinite(sourceFps) && sourceFps > 0 ? sourceFps : 30;
  const fits = (f) => !sampleRate || Number.isInteger(sampleRate / f);
  return RATES.find((f) => f <= Math.round(src) + 0.5 && fits(f)) ?? RATES.find(fits) ?? 30;
}

/** Kept stretches as whole frames [startFrame, endFrame), merged where they touch. */
export function snapToFrames(keep, fps, duration) {
  const last = Math.floor(duration * fps);
  const frames = keep
    .map(([a, b]) => [Math.max(0, Math.floor(a * fps + 1e-6)), Math.min(last, Math.ceil(b * fps - 1e-6))])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const f of frames) {
    const prev = out[out.length - 1];
    if (prev && f[0] <= prev[1]) prev[1] = Math.max(prev[1], f[1]);
    else out.push([f[0], f[1]]);
  }
  return out;
}

/** The segments as the worker reports them to Nexus (CompleteReport.segments). */
export function segmentsOf(frames, fps) {
  return frames.map(([a, b]) => ({ src_start: a / fps, src_end: b / fps, out_len: (b - a) / fps }));
}

/**
 * "Is this frame kept": true for a frame whose time is in a kept stretch.
 * Compared half a frame early, so a frame at exactly k/F never falls on the
 * wrong side of a boundary through float rounding.
 */
function keepExpr(frames, fps) {
  const half = 0.5 / fps;
  const t = (frame) => (frame / fps - half).toFixed(6);
  return frames.map(([a, b]) => `gte(t,${t(a)})*lt(t,${t(b)})`).join('+');
}

/**
 * The -filter_complex_script for one pass. Outputs [v], and [a] when there is
 * audio. aresample=async=1 fills any hole in the recorded audio so its
 * timeline stays the video's.
 */
export function buildFilterScript(frames, fps, sampleRate) {
  const expr = keepExpr(frames, fps);
  const video = `[0:v:0]fps=${fps},select='${expr}',setpts=N/${fps}/TB[v]`;
  if (!sampleRate) return video;
  const chunk = sampleRate / fps;
  const audio = `[0:a:0]aresample=async=1:first_pts=0,asetnsamples=n=${chunk}:p=0,aselect='${expr}',asetpts=N/SR/TB[a]`;
  return `${video};\n${audio}`;
}

/** The ffmpeg arguments for the pass, given where the script and output live. */
export function encodeArgs({ input, scriptFile, output, fps, hasAudio }) {
  return [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', input,
    '-filter_complex_script', scriptFile,
    '-map', '[v]',
    ...(hasAudio ? ['-map', '[a]'] : []),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-pix_fmt', 'yuv420p',
    // A keyframe every 2 seconds: seeking in the player lands faster too.
    '-g', String(fps * 2), '-r', String(fps),
    ...(hasAudio ? ['-c:a', 'aac', '-b:a', '96k'] : []),
    '-movflags', '+faststart',
    output,
  ];
}
