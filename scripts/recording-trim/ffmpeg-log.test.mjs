import { describe, it, expect } from 'vitest';
import { cueSpans, parseSilences, parseFreezes, parseKeyframes, medianKeyframeGap } from './ffmpeg-log.mjs';

describe('parseSilences', () => {
  it('reads paired starts and ends, and runs an open one to the end of the file', () => {
    const log = [
      'Input #0, mov,mp4 ...',
      '[silencedetect @ 0x55d0] silence_start: 0',
      '[silencedetect @ 0x55d0] silence_end: 544.12 | silence_duration: 544.12',
      'size=N/A time=00:12:00.00',
      '[silencedetect @ 0x55d0] silence_start: 2000.5',
      '[silencedetect @ 0x55d0] silence_end: 2120 | silence_duration: 119.5',
      '[silencedetect @ 0x55d0] silence_start: 4370.2',
    ].join('\n');
    expect(parseSilences(log, 4383)).toEqual([
      [0, 544.12],
      [2000.5, 2120],
      [4370.2, 4383],
    ]);
  });

  it('clamps a slightly negative first start', () => {
    expect(parseSilences('silence_start: -0.0213\nsilence_end: 10 | x', 100)).toEqual([[0, 10]]);
  });
});

describe('parseFreezes', () => {
  it('reads freezedetect metadata lines', () => {
    const log = [
      '[freezedetect @ 0x1] lavfi.freezedetect.freeze_start: 102.4',
      '[freezedetect @ 0x1] lavfi.freezedetect.freeze_duration: 31.2',
      '[freezedetect @ 0x1] lavfi.freezedetect.freeze_end: 133.6',
      '[freezedetect @ 0x1] lavfi.freezedetect.freeze_start: 4300',
    ].join('\r\n');
    expect(parseFreezes(log, 4383)).toEqual([
      [102.4, 133.6],
      [4300, 4383],
    ]);
  });
});

describe('keyframes', () => {
  it('keeps only keyframe packets, sorted', () => {
    expect(parseKeyframes('4.000000,K__\n0.033000,___\n0.000000,K__\n2.000000,K_\nbad\n')).toEqual([0, 2, 4]);
  });

  it('finds the middle gap', () => {
    expect(medianKeyframeGap([0, 2, 4, 10])).toBe(2);
    expect(medianKeyframeGap([0])).toBe(Infinity);
  });
});

describe('cueSpans', () => {
  it('reads Teams cue times, with and without hours', () => {
    const vtt = [
      'WEBVTT',
      '',
      'a1/1',
      '00:11:59.080 --> 00:12:00.440',
      '<v Hari>Good evening, students.</v>',
      '',
      '12:44.480 --> 12:45.560',
      'Okay.',
      '',
      '01:05:19.780 --> 01:05:34.980',
      'Bye.',
    ].join('\n');
    expect(cueSpans(vtt)).toEqual([[719.08, 720.44], [764.48, 765.56], [3919.78, 3934.98]]);
  });
});
