import { describe, it, expect } from 'vitest';
import { parseVTT } from './vtt-parser';
import {
  buildVtt,
  coverageWarning,
  mergeTranscriptFiles,
  normaliseTranscriptText,
  parseTranscriptText,
  summariseCoverage,
} from './transcript-file';

describe('parseTranscriptText', () => {
  it('reads a standard WEBVTT file the same way parseVTT does', () => {
    const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:04.500\nGet into the history of architecture.\n\n00:00:05.000 --> 00:00:08.000\nWhere did it evolve?\n';
    expect(parseTranscriptText(vtt)).toEqual(parseVTT(vtt));
  });

  it('accepts cues written without hours, as AI Studio often writes them', () => {
    const entries = parseTranscriptText('WEBVTT\n\n01:05.250 --> 01:09.000\nThe stretcher face is the long side.\n');
    expect(entries).toEqual([{ start: 65.25, end: 69, text: 'The stretcher face is the long side.' }]);
  });

  it('accepts minutes above 59 in a cue without hours', () => {
    const entries = parseTranscriptText('75:00.000 --> 75:04.000\nDravidian temples.\n');
    expect(entries[0].start).toBe(4500);
  });

  it('accepts one hour digit, missing milliseconds and short fractions', () => {
    const entries = parseTranscriptText('1:02:03 --> 1:02:07.5\nShore Temple at Mahabalipuram.\n');
    expect(entries[0]).toEqual({ start: 3723, end: 3727.5, text: 'Shore Temple at Mahabalipuram.' });
  });

  it('reads SRT, dropping the index lines and the comma milliseconds', () => {
    const srt = '1\n00:00:01,000 --> 00:00:03,000\nHeader face.\n\n2\n00:00:03,500 --> 00:00:06,000\nFrog or indent.\n';
    expect(parseTranscriptText(srt)).toEqual([
      { start: 1, end: 3, text: 'Header face.' },
      { start: 3.5, end: 6, text: 'Frog or indent.' },
    ]);
  });

  it('drops an SRT index even when the blank line before it is missing', () => {
    const srt = '1\n00:00:01,000 --> 00:00:03,000\nHeader face.\n2\n00:00:03,500 --> 00:00:06,000\nFrog.\n';
    expect(parseTranscriptText(srt).map((e) => e.text)).toEqual(['Header face.', 'Frog.']);
  });

  it('ignores code fences, a byte order mark and chatter before the first cue', () => {
    const raw = String.fromCharCode(0xfeff) + 'Here is the transcript you asked for:\n\n```vtt\nWEBVTT\n\n00:00:01.000 --> 00:00:02.000\nArris or edge.\n```\n';
    expect(parseTranscriptText(raw)).toEqual([{ start: 1, end: 2, text: 'Arris or edge.' }]);
  });

  it('drops cue settings and markdown bold', () => {
    const raw = '**00:00:01.000 --> 00:00:02.000 align:start position:10%**\n**Bed face.**\n';
    expect(parseTranscriptText(raw)).toEqual([{ start: 1, end: 2, text: 'Bed face.' }]);
  });

  it('keeps Tamil text as it is', () => {
    const entries = parseTranscriptText('00:00:01.000 --> 00:00:02.000\nவணக்கம், today we start architecture.\n');
    expect(entries[0].text).toBe('வணக்கம், today we start architecture.');
  });

  it('skips a cue with no words and a cue that ends before it starts is given its start', () => {
    const raw = '00:00:01.000 --> 00:00:02.000\n\n00:00:05.000 --> 00:00:04.000\nClay bricks.\n';
    expect(parseTranscriptText(raw)).toEqual([{ start: 5, end: 5, text: 'Clay bricks.' }]);
  });

  it('returns nothing for a file with no timestamps', () => {
    expect(parseTranscriptText('just some notes about the class')).toEqual([]);
    expect(parseTranscriptText('')).toEqual([]);
  });
});

describe('buildVtt', () => {
  it('writes canonical WEBVTT that parseVTT reads back exactly', () => {
    const entries = [
      { start: 0.5, end: 4.25, text: 'Get into the history of architecture.' },
      { start: 3725.125, end: 3730, text: 'Pallava dynasty.' },
    ];
    const vtt = buildVtt(entries);
    expect(vtt.startsWith('WEBVTT\n\n00:00:00.500 --> 00:00:04.250\n')).toBe(true);
    expect(vtt).toContain('01:02:05.125 --> 01:02:10.000');
    expect(parseVTT(vtt)).toEqual(entries);
  });

  it('keeps a cue arrow or a line break inside the text from breaking the file', () => {
    const vtt = buildVtt([{ start: 1, end: 2, text: 'A --> B\nC' }]);
    expect(parseVTT(vtt)).toEqual([{ start: 1, end: 2, text: 'A -> B C' }]);
  });
});

describe('normaliseTranscriptText', () => {
  it('turns a messy AI Studio answer into WEBVTT the stored-transcript reader accepts', () => {
    const raw = '```\n00:01.000 --> 00:03.000\nStretcher.\n```';
    expect(parseVTT(normaliseTranscriptText(raw))).toEqual([{ start: 1, end: 3, text: 'Stretcher.' }]);
  });
});

describe('summariseCoverage', () => {
  it('reports the first start, the last end, and every silence over three minutes', () => {
    const entries = [
      { start: 2, end: 10, text: 'a' },
      { start: 20, end: 30, text: 'b' },
      { start: 400, end: 410, text: 'c' },
    ];
    expect(summariseCoverage(entries, 900)).toEqual({
      firstStart: 2,
      lastEnd: 410,
      gaps: [
        { from: 30, to: 400 },
        { from: 410, to: 900 },
      ],
    });
  });

  it('does not report a gap at the end when the duration is unknown', () => {
    expect(summariseCoverage([{ start: 0, end: 5, text: 'a' }], 0).gaps).toEqual([]);
  });
});

function vttOf(cues: Array<[number, number, string]>): string {
  return buildVtt(cues.map(([start, end, text]) => ({ start, end, text })));
}

describe('mergeTranscriptFiles', () => {
  const parts = [
    { start: 0, end: 3732 },
    { start: 3672, end: 7463 },
  ];

  it('puts two parts with whole-video timestamps in order, whatever order they were chosen in', () => {
    const part1 = vttOf([
      [0, 5, 'Get into the history of architecture.'],
      [3700, 3710, 'Mauryan pillars.'],
    ]);
    const part2 = vttOf([
      [3700, 3710, 'Mauryan pillars.'],
      [7400, 7410, 'Khajuraho.'],
    ]);

    const out = mergeTranscriptFiles(
      [
        { name: 'part2.vtt', text: part2 },
        { name: 'part1.vtt', text: part1 },
      ],
      { durationSeconds: 7463, parts },
    );

    expect(out.errors).toEqual([]);
    expect(out.shiftedParts).toEqual([]);
    // The overlap was transcribed twice; the repeat is dropped.
    expect(out.entries.map((e) => e.text)).toEqual([
      'Get into the history of architecture.',
      'Mauryan pillars.',
      'Khajuraho.',
    ]);
    expect(parseVTT(out.vtt)).toEqual(out.entries);
  });

  it('moves a later part that restarted its clock at zero to where that part begins', () => {
    const part1 = vttOf([[0, 5, 'Indus Valley.'], [3600, 3610, 'Lion capital.']]);
    // AI Studio ignored "from the start of the whole video" and counted from 0.
    const part2 = vttOf([[10, 20, 'Rock-cut caves.'], [3700, 3710, 'Khajuraho.']]);

    const out = mergeTranscriptFiles(
      [
        { name: 'History part 1.vtt', text: part1 },
        { name: 'History part 2.vtt', text: part2 },
      ],
      { durationSeconds: 7463, parts },
    );

    expect(out.shiftedParts).toEqual([{ name: 'History part 2.vtt', bySeconds: 3672 }]);
    expect(out.entries.map((e) => e.start)).toEqual([0, 3600, 3682, 7372]);
  });

  it('does not shift anything when only one file is chosen', () => {
    const out = mergeTranscriptFiles([{ name: 'a.vtt', text: vttOf([[0, 5, 'Only part.']]) }], {
      durationSeconds: 7463,
      parts,
    });
    expect(out.shiftedParts).toEqual([]);
    expect(out.entries).toHaveLength(1);
  });

  it('keeps a phrase repeated inside one file', () => {
    const out = mergeTranscriptFiles(
      [{ name: 'a.vtt', text: vttOf([[1, 2, 'Okay.'], [5, 6, 'Okay.']]) }],
      { durationSeconds: 60 },
    );
    expect(out.entries).toHaveLength(2);
  });

  it('names a file that holds no timestamps and still merges the rest', () => {
    const out = mergeTranscriptFiles(
      [
        { name: 'notes.txt', text: 'nothing here' },
        { name: 'part1.vtt', text: vttOf([[0, 5, 'Bricks.']]) },
      ],
      { durationSeconds: 60 },
    );
    expect(out.errors).toEqual(['notes.txt']);
    expect(out.entries).toHaveLength(1);
  });

  it('reports coverage so the page can ask whether a part is missing', () => {
    const out = mergeTranscriptFiles(
      [{ name: 'part1.vtt', text: vttOf([[0, 5, 'a'], [3700, 3732, 'b']]) }],
      { durationSeconds: 7463, parts },
    );
    expect(out.coverage.lastEnd).toBe(3732);
    expect(out.coverage.gaps.at(-1)).toEqual({ from: 3732, to: 7463 });
  });
});

describe('coverageWarning', () => {
  const entries = (cues: Array<[number, number]>) => cues.map(([start, end]) => ({ start, end, text: 'words' }));

  it('says nothing when the transcript runs the length of the video', () => {
    const merged = mergeTranscriptFiles([{ name: 'a.vtt', text: buildVtt(entries([[0, 10], [150, 7400]])) }], {
      durationSeconds: 7463,
    });
    expect(coverageWarning(merged, 7463, 2)).toBeNull();
  });

  it('asks whether a part is missing when the transcript stops early', () => {
    const merged = mergeTranscriptFiles([{ name: 'part 1.txt', text: buildVtt(entries([[0, 10], [100, 3732]])) }], {
      durationSeconds: 7463,
    });
    expect(coverageWarning(merged, 7463, 2)).toBe(
      'This transcript covers 0:00 to 1:02:12, and the video is 2:04:23 long. Did you upload every part?',
    );
  });

  it('points at a long silence in the middle', () => {
    const merged = mergeTranscriptFiles([{ name: 'a.vtt', text: buildVtt(entries([[0, 600], [1500, 1790]])) }], {
      durationSeconds: 1800,
    });
    expect(coverageWarning(merged, 1800, 1)).toBe('This transcript has nothing from 10:00 to 25:00.');
  });

  it('names a file that was left out for having no timestamps', () => {
    const merged = mergeTranscriptFiles(
      [
        { name: 'a.vtt', text: buildVtt(entries([[0, 1790]])) },
        { name: 'notes.txt', text: 'no cues' },
      ],
      { durationSeconds: 1800 },
    );
    expect(coverageWarning(merged, 1800, 1)).toBe('notes.txt has no timestamps, so it was left out.');
  });

  it('does not guess when the video length is unknown', () => {
    const merged = mergeTranscriptFiles([{ name: 'a.vtt', text: buildVtt(entries([[0, 60]])) }], { durationSeconds: 0 });
    expect(coverageWarning(merged, 0, 1)).toBeNull();
  });
});
