#!/usr/bin/env node
/**
 * Recording-trim worker. Runs on a GitHub Actions runner (.github/workflows/
 * recording-trim.yml), because cutting a 100 to 370 MB class recording needs
 * ffmpeg and minutes, and a Vercel function has neither.
 *
 * Holds no Microsoft or database credential. Everything comes from Nexus
 * through POST /api/internal/recording-trim with RECORDING_TRIM_TOKEN:
 * a short-lived download URL for the original, and an upload session that can
 * write only the trimmed copy. The repository is public, so every URL is
 * masked in the log the moment it arrives, and nothing but job ids, durations
 * and counts is ever printed.
 *
 * Per job:
 *   1. download the original
 *   2. measure: duration, keyframes, silences, frozen stretches
 *   3. ask Nexus for the cuts (it reads the transcript and applies the rules)
 *   4. cut: re-encode in one pass so a cut lands on any frame (reencode.mjs),
 *      or, when Nexus says 'copy', cut on keyframes without re-encoding and
 *      join the pieces; then check the result
 *   5. upload the trimmed copy beside the original, tell Nexus it is there
 *
 * Usage: node scripts/recording-trim/worker.mjs [--max-jobs N] [--apply-ready]
 *        node scripts/recording-trim/worker.mjs --local <in.mp4> --vtt <in.vtt> --out <out.mp4>
 *          A preview on this machine: plans with the same rules as Nexus
 *          (default params) and writes the trimmed file. Nothing is uploaded.
 * Env:   NEXUS_URL, RECORDING_TRIM_TOKEN, RUNNER_TEMP (optional), GITHUB_RUN_ID
 */

import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { cueSpans, medianKeyframeGap, parseFreezes, parseKeyframes, parseSilences } from './ffmpeg-log.mjs';
import { buildFilterScript, encodeArgs, pickFps, segmentsOf, snapToFrames } from './reencode.mjs';

const NEXUS = (process.env.NEXUS_URL || '').replace(/\/+$/, '');
const TOKEN = process.env.RECORDING_TRIM_TOKEN || '';
const WORK = join(process.env.RUNNER_TEMP || tmpdir(), 'recording-trim');
const RUN = `gha-${process.env.GITHUB_RUN_ID || 'local'}`;
// No new job after 30 minutes: a re-encode must finish inside the 55 minute job.
const DEADLINE = Date.now() + 30 * 60_000;
/** A multiple of 320 KiB, as Graph upload sessions require. */
const CHUNK = 10 * 1024 * 1024;

const args = process.argv.slice(2);
const argOf = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
// Re-encoding a class takes several minutes, so fewer jobs fit in a run.
const maxJobs = Number(argOf('--max-jobs')) || 2;
const applyReadyOnly = args.includes('--apply-ready');
const local = argOf('--local');
/** Video and audio may end this far apart after a re-encode (one frame plus slack). */
const REENCODE_AV_TOLERANCE = 0.3;

function mask(value) {
  if (value && process.env.GITHUB_ACTIONS) process.stdout.write(`::add-mask::${value}\n`);
}

function log(message) {
  console.log(`[recording-trim] ${message}`);
}

/** The network-level reason behind Node's bare "fetch failed". */
function describe(err) {
  const cause = err?.cause;
  return [err?.message, cause?.code, cause?.message].filter(Boolean).join(': ');
}

/**
 * fetch with retries for network-level failures. The first real run (2026-10-14)
 * lost 13 of 43 attempts to a bare "fetch failed" from the runner, on SharePoint
 * downloads and on calls back to Nexus alike, and most succeeded on a retry.
 * HTTP errors are not retried here: they are answers, not dropped connections.
 */
async function fetchRetry(url, init, label, attempts = 4) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      last = err;
      log(`${label}: network error (${describe(err)}), attempt ${i + 1} of ${attempts}`);
      await new Promise((r) => setTimeout(r, 3000 * (i + 1)));
    }
  }
  throw Object.assign(new Error(describe(last)), { reason: 'NETWORK' });
}

async function api(action, body = {}) {
  const res = await fetchRetry(
    `${NEXUS}/api/internal/recording-trim`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...body }),
    },
    `nexus ${action}`,
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${action} failed (${res.status}): ${data.error || 'no detail'}`);
  return data;
}

/** Run a command, returning stdout and stderr. Rejects on a non-zero exit. */
function run(cmd, argv) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, argv, { stdio: ['ignore', 'pipe', 'pipe'] });
    const out = [];
    const err = [];
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => err.push(d));
    child.on('error', reject);
    child.on('close', (code) => {
      const stdout = Buffer.concat(out).toString();
      const stderr = Buffer.concat(err).toString();
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} exited ${code}: ${stderr.split('\n').slice(-3).join(' ')}`));
    });
  });
}

async function probeDuration(file) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return Number(stdout.trim());
}

async function streamDurations(file) {
  const { stdout } = await run('ffprobe', [
    '-v', 'error', '-show_entries', 'stream=codec_type,duration', '-of', 'json', file,
  ]);
  const streams = JSON.parse(stdout).streams || [];
  const of = (type) => Number(streams.find((s) => s.codec_type === type)?.duration);
  return { video: of('video'), audio: of('audio') };
}

/** Frame rate and audio sample rate, for the re-encode. */
async function streamInfo(file) {
  const { stdout } = await run('ffprobe', [
    '-v', 'error', '-show_entries', 'stream=codec_type,avg_frame_rate,r_frame_rate,sample_rate', '-of', 'json', file,
  ]);
  const streams = JSON.parse(stdout).streams || [];
  const video = streams.find((s) => s.codec_type === 'video') || {};
  const audio = streams.find((s) => s.codec_type === 'audio');
  const rate = (r) => {
    const [n, d] = String(r || '').split('/').map(Number);
    return d ? n / d : n;
  };
  const fps = rate(video.avg_frame_rate) || rate(video.r_frame_rate);
  return { fps, sampleRate: audio ? Number(audio.sample_rate) || 0 : 0 };
}

async function download(url, file) {
  // A connection dropped part way through a 200 MB download is retried whole.
  for (let i = 0; i < 3; i++) {
    const res = await fetchRetry(url, {}, 'download');
    if (!res.ok || !res.body) throw Object.assign(new Error(`download failed (${res.status})`), { reason: 'DOWNLOAD_FAILED' });
    try {
      await pipeline(Readable.fromWeb(res.body), createWriteStream(file));
      return;
    } catch (err) {
      log(`download interrupted (${describe(err)}), attempt ${i + 1} of 3`);
      if (i === 2) throw Object.assign(new Error(describe(err)), { reason: 'DOWNLOAD_FAILED' });
    }
  }
}

async function measure(file) {
  const duration = await probeDuration(file);
  const { stdout: packets } = await run('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=pts_time,flags', '-of', 'csv=p=0', file,
  ]);
  const keyframes = parseKeyframes(packets);

  const silence = run('ffmpeg', [
    '-hide_banner', '-nostats', '-i', file, '-map', '0:a:0', '-af', 'aresample=16000,silencedetect=noise=-45dB:d=2', '-f', 'null', '-',
  ]);
  // Keyframes only is fast and enough when they come every few seconds; a
  // recording with sparse keyframes is sampled once a second instead.
  const freezeFilter = 'scale=320:-2,freezedetect=n=0.003:d=20';
  const freeze =
    medianKeyframeGap(keyframes) <= 8
      ? run('ffmpeg', ['-hide_banner', '-nostats', '-skip_frame', 'nokey', '-i', file, '-map', '0:v:0', '-vf', freezeFilter, '-an', '-f', 'null', '-'])
      : run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-map', '0:v:0', '-vf', `fps=1,${freezeFilter}`, '-an', '-f', 'null', '-']);
  const [s, f] = await Promise.all([silence, freeze]);
  return {
    duration,
    keyframes,
    silences: parseSilences(s.stderr, duration),
    freezes: parseFreezes(f.stderr, duration),
  };
}

/** Video and audio stream lengths must agree, within tolerance. */
async function checkSync(output, tolerance) {
  const streams = await streamDurations(output);
  if (Number.isFinite(streams.audio) && Math.abs(streams.video - streams.audio) > tolerance) {
    throw Object.assign(new Error(`AV_DESYNC ${streams.video} vs ${streams.audio}`), { reason: 'AV_DESYNC' });
  }
}

/**
 * One re-encoding pass that keeps only the kept stretches, cut on any frame.
 * See reencode.mjs for how sync stays exact.
 */
async function cutReencode(file, keep, dir, duration) {
  const info = await streamInfo(file);
  const fps = pickFps(info.fps, info.sampleRate);
  const frames = snapToFrames(keep, fps, duration);
  const segments = segmentsOf(frames, fps);
  const scriptFile = join(dir, 'graph.txt');
  await writeFile(scriptFile, buildFilterScript(frames, fps, info.sampleRate));
  const output = join(dir, 'trimmed.mp4');
  const started = Date.now();
  await run('ffmpeg', encodeArgs({ input: file, scriptFile, output, fps, hasAudio: info.sampleRate > 0 }));
  log(`re-encoded ${segments.length} pieces at ${fps} fps in ${Math.round((Date.now() - started) / 1000)}s`);

  const total = segments.reduce((sum, s) => sum + s.out_len, 0);
  const outputDuration = await probeDuration(output);
  if (Math.abs(outputDuration - total) > Math.max(1, total * 0.002)) {
    throw Object.assign(new Error(`DURATION_MISMATCH ${outputDuration} vs ${total}`), { reason: 'DURATION_MISMATCH' });
  }
  await checkSync(output, REENCODE_AV_TOLERANCE);
  return { output, segments, outputDuration };
}

async function cut(file, keep, dir) {
  const segments = [];
  const list = [];
  for (let i = 0; i < keep.length; i++) {
    const [a, b] = keep[i];
    const out = join(dir, `seg_${String(i).padStart(3, '0')}.mp4`);
    await run('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y', '-ss', String(a), '-i', file, '-t', String(b - a),
      '-map', '0:v:0', '-map', '0:a:0?', '-c', 'copy', '-avoid_negative_ts', 'make_zero', out,
    ]);
    segments.push({ src_start: a, src_end: b, out_len: await probeDuration(out) });
    list.push(`file '${out.replace(/'/g, "'\\''")}'`);
  }
  const listFile = join(dir, 'segments.txt');
  await writeFile(listFile, list.join('\n'));
  const output = join(dir, 'trimmed.mp4');
  await run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', '-movflags', '+faststart', output,
  ]);

  const total = segments.reduce((sum, s) => sum + s.out_len, 0);
  const outputDuration = await probeDuration(output);
  if (Math.abs(outputDuration - total) > 1) throw Object.assign(new Error('DURATION_MISMATCH'), { reason: 'DURATION_MISMATCH' });
  await checkSync(output, 1);
  return { output, segments, outputDuration };
}

async function upload(file, uploadUrl) {
  const size = (await stat(file)).size;
  const data = await readFile(file);
  let item = null;
  for (let offset = 0; offset < size; offset += CHUNK) {
    const end = Math.min(offset + CHUNK, size);
    let res = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetchRetry(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Length': String(end - offset), 'Content-Range': `bytes ${offset}-${end - 1}/${size}` },
        body: data.subarray(offset, end),
      }, 'upload').catch(() => null);
      if (res && (res.status === 200 || res.status === 201 || res.status === 202)) break;
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
    if (!res || ![200, 201, 202].includes(res.status)) throw Object.assign(new Error('UPLOAD_FAILED'), { reason: 'UPLOAD_FAILED' });
    if (res.status === 200 || res.status === 201) item = await res.json();
  }
  if (!item?.id) throw Object.assign(new Error('UPLOAD_FAILED'), { reason: 'UPLOAD_FAILED' });
  return { id: item.id, driveId: item.parentReference?.driveId };
}

async function processJob(job) {
  mask(job.original.download_url);
  const dir = join(WORK, job.job_id);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const started = Date.now();
  try {
    const input = join(dir, 'original.mp4');
    await download(job.original.download_url, input);
    const m = await measure(input);
    log(`${job.job_id}: ${Math.round(m.duration)}s, ${m.keyframes.length} keyframes, ${m.silences.length} silences, ${m.freezes.length} freezes`);

    const decision = await api('plan', {
      job_id: job.job_id,
      report: {
        duration: m.duration, silences: m.silences, freezes: m.freezes, keyframes: m.keyframes,
        cut_methods: ['copy', 'reencode'],
      },
    });
    if (decision.skip) {
      log(`${job.job_id}: not cut (${decision.skip})`);
      return;
    }

    const { output, segments, outputDuration } =
      decision.cut_method === 'reencode'
        ? await cutReencode(input, decision.keep, dir, m.duration)
        : await cut(input, decision.keep, dir);
    log(`${job.job_id}: cut to ${Math.round(outputDuration)}s in ${segments.length} pieces`);
    const { upload_url } = await api('upload', { job_id: job.job_id });
    mask(upload_url);
    const item = await upload(output, upload_url);
    const done = await api('complete', {
      job_id: job.job_id,
      report: { segments, output_duration: outputDuration, item },
    });
    log(`${job.job_id}: ${done.status} after ${Math.round((Date.now() - started) / 1000)}s`);
  } catch (err) {
    log(`${job.job_id}: failed (${err.reason || 'WORKER_FAILED'}: ${err?.cause?.code || 'no code'})`);
    await api('fail', { job_id: job.job_id, reason: err.reason || 'WORKER_FAILED', detail: describe(err).slice(0, 400) }).catch(() => {});
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * --local: trim a recording on this machine to watch the result before the
 * rules change for everyone. Needs ffmpeg and Node 23.6+ (it imports the
 * planner's TypeScript directly, so the rules are exactly Nexus's).
 */
async function preview() {
  const vttFile = argOf('--vtt');
  const out = argOf('--out') || 'trimmed-preview.mp4';
  if (!vttFile) throw new Error('--vtt <transcript.vtt> is required with --local');
  const { planTrim } = await import(new URL('../../apps/nexus/src/lib/recording-trim-plan.ts', import.meta.url).href);
  const dir = join(WORK, 'preview');
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  try {
    const m = await measure(local);
    const speech = cueSpans(await readFile(vttFile, 'utf8'));
    const plan = planTrim({ duration: m.duration, speech, silences: m.silences, freezes: m.freezes, keyframes: [] });
    if (plan.kind !== 'cut') {
      log(`not cut (${plan.reason})`);
      return;
    }
    const pauses = plan.cuts.filter((c) => c.kind === 'pause').length;
    log(`plan (${plan.pauseRule}): ${plan.cuts.length} cuts, ${pauses} pauses, ${Math.round(plan.removedSeconds)}s removed of ${Math.round(m.duration)}s`);
    const { output, outputDuration } = await cutReencode(local, plan.keep, dir, m.duration);
    await writeFile(out, await readFile(output));
    await writeFile(`${out}.cuts.json`, JSON.stringify(plan.cuts, null, 1));
    log(`wrote ${out} (${Math.round(outputDuration)}s) and ${out}.cuts.json`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main() {
  if (local) return preview();
  if (!NEXUS || !TOKEN) throw new Error('NEXUS_URL and RECORDING_TRIM_TOKEN are required');
  if (applyReadyOnly) {
    const result = await api('apply_ready');
    log(`applied ${result.applied}, failed ${result.failed}`);
    return;
  }
  for (let n = 0; n < maxJobs && Date.now() < DEADLINE; n++) {
    const { job } = await api('claim', { run: RUN });
    if (!job) {
      log('no more jobs');
      break;
    }
    await processJob(job);
  }
}

main().catch((err) => {
  log(`stopped: ${err.message}`);
  process.exit(1);
});
