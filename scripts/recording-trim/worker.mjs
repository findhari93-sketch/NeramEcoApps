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
 *   4. cut the kept stretches without re-encoding, join them, check the result
 *   5. upload the trimmed copy beside the original, tell Nexus it is there
 *
 * Usage: node scripts/recording-trim/worker.mjs [--max-jobs N] [--apply-ready]
 * Env:   NEXUS_URL, RECORDING_TRIM_TOKEN, RUNNER_TEMP (optional), GITHUB_RUN_ID
 */

import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { medianKeyframeGap, parseFreezes, parseKeyframes, parseSilences } from './ffmpeg-log.mjs';

const NEXUS = (process.env.NEXUS_URL || '').replace(/\/+$/, '');
const TOKEN = process.env.RECORDING_TRIM_TOKEN || '';
const WORK = join(process.env.RUNNER_TEMP || tmpdir(), 'recording-trim');
const RUN = `gha-${process.env.GITHUB_RUN_ID || 'local'}`;
const DEADLINE = Date.now() + 45 * 60_000;
/** A multiple of 320 KiB, as Graph upload sessions require. */
const CHUNK = 10 * 1024 * 1024;

const args = process.argv.slice(2);
const maxJobs = Number(args[args.indexOf('--max-jobs') + 1]) || 6;
const applyReadyOnly = args.includes('--apply-ready');

function mask(value) {
  if (value && process.env.GITHUB_ACTIONS) process.stdout.write(`::add-mask::${value}\n`);
}

function log(message) {
  console.log(`[recording-trim] ${message}`);
}

async function api(action, body = {}) {
  const res = await fetch(`${NEXUS}/api/internal/recording-trim`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
  });
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

async function download(url, file) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`download failed (${res.status})`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(file));
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
  const streams = await streamDurations(output);
  if (Number.isFinite(streams.audio) && Math.abs(streams.video - streams.audio) > 1) {
    throw Object.assign(new Error('AV_DESYNC'), { reason: 'AV_DESYNC' });
  }
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
      res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Length': String(end - offset), 'Content-Range': `bytes ${offset}-${end - 1}/${size}` },
        body: data.subarray(offset, end),
      }).catch(() => null);
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
      report: { duration: m.duration, silences: m.silences, freezes: m.freezes, keyframes: m.keyframes },
    });
    if (decision.skip) {
      log(`${job.job_id}: not cut (${decision.skip})`);
      return;
    }

    const { output, segments, outputDuration } = await cut(input, decision.keep, dir);
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
    log(`${job.job_id}: failed (${err.reason || 'WORKER_FAILED'})`);
    await api('fail', { job_id: job.job_id, reason: err.reason || 'WORKER_FAILED', detail: String(err.message).slice(0, 400) }).catch(() => {});
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main() {
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
