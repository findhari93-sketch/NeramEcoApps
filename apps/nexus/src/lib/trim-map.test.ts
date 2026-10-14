import { describe, it, expect } from 'vitest';
import {
  buildCutMap,
  outputDuration,
  toTrimmed,
  toOriginal,
  rangesToTrimmed,
  rangesToOriginal,
  remapVtt,
  moveSections,
  moveChapters,
} from './trim-map';

// Recap 68f14d40's shape: a 541s lead-in cut, a 120s pause cut at 2000, and a tail.
const MAP = buildCutMap([
  [541, 2000],
  [2120, 4370],
]);

describe('cut map', () => {
  it('lays the kept stretches end to end', () => {
    expect(MAP).toEqual([
      { src_start: 541, src_end: 2000, out_start: 0, out_len: 1459 },
      { src_start: 2120, src_end: 4370, out_start: 1459, out_len: 2250 },
    ]);
    expect(outputDuration(MAP)).toBe(3709);
  });

  it('uses the measured length of each piece when the worker reports one', () => {
    const map = buildCutMap([[0, 100], [200, 300]], [100.4, 99.8]);
    expect(map[1].out_start).toBe(100.4);
    expect(outputDuration(map)).toBeCloseTo(200.2);
  });

  it('moves a time inside a kept stretch, and a time inside a cut to its join', () => {
    expect(toTrimmed(MAP, 600)).toBe(59);
    expect(toTrimmed(MAP, 300)).toBe(0); // in the lead-in
    expect(toTrimmed(MAP, 2050)).toBe(1459); // in the pause
    expect(toTrimmed(MAP, 4383)).toBe(3709); // in the tail
  });

  it('goes back again', () => {
    for (const t of [541, 600, 1999, 2120, 3000, 4369]) expect(toOriginal(MAP, toTrimmed(MAP, t))).toBeCloseTo(t);
    expect(toOriginal(MAP, 99999)).toBe(4370);
  });
});

describe('student progress', () => {
  it('moves played stretches, dropping what lay in a cut', () => {
    // Watched the lead-in and into the class, then across the pause.
    expect(rangesToTrimmed(MAP, [[0, 900], [1900, 2300]])).toEqual([
      [0, 359],
      [1359, 1639],
    ]);
  });

  it('joins stretches the cut has made touch', () => {
    expect(rangesToTrimmed(MAP, [[1900, 2000], [2120, 2200]])).toEqual([[1359, 1539]]);
  });

  it('round-trips stretches played on the trimmed copy', () => {
    const back = rangesToOriginal(MAP, [[1359, 1539]]);
    expect(back).toEqual([
      [1900, 2000],
      [2120, 2200],
    ]);
  });
});

describe('transcripts, checkpoints and chapters', () => {
  const vtt = [
    'WEBVTT',
    '',
    '1',
    '00:05:00.000 --> 00:05:04.000',
    '<v Hari>Can everyone hear me?</v>',
    '',
    '2',
    '00:10:00.000 --> 00:10:05.500',
    '<v Hari>Let us start with proportions.</v>',
    '',
    '00:33:30.000 --> 00:33:35.000',
    'during the pause',
  ].join('\n');

  it('moves cue times, keeps speaker tags, drops cues said inside a cut', () => {
    const out = remapVtt(vtt, MAP);
    expect(out).not.toContain('Can everyone hear me');
    expect(out).not.toContain('during the pause');
    expect(out).toContain('00:00:59.000 --> 00:01:04.500');
    expect(out).toContain('<v Hari>Let us start with proportions.</v>');
    expect(out.startsWith('WEBVTT')).toBe(true);
  });

  it('moves checkpoint times both ways', () => {
    const sections = [{ id: 's1', start_timestamp_seconds: 0, end_timestamp_seconds: 909, title: 'x' }];
    const moved = moveSections(sections, (t) => toTrimmed(MAP, t));
    expect(moved[0]).toMatchObject({ start_timestamp_seconds: 0, end_timestamp_seconds: 368, title: 'x' });
    const back = moveSections(moved, (t) => toOriginal(MAP, t));
    expect(back[0].end_timestamp_seconds).toBe(909);
  });

  it('keeps YouTube chapters valid: first at 0, at least ten seconds apart', () => {
    const chapters = [
      { t: 0, label: 'Waiting' },
      { t: 545, label: 'Proportions' },
      { t: 2010, label: 'Break' },
      { t: 2125, label: 'Architects' },
    ];
    expect(moveChapters(chapters, (t) => toTrimmed(MAP, t))).toEqual([
      { t: 0, label: 'Waiting' },
      { t: 1459, label: 'Break' },
    ]);
  });
});
