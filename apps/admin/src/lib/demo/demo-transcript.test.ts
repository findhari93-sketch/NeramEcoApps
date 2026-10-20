import { describe, it, expect } from 'vitest';
import { cueClock, demoTranscriptStats, parseDemoVtt } from './demo-transcript';

const VTT = `WEBVTT

0f6c1a2e-1/17-0
00:00:03.120 --> 00:00:05.600
<v Hari Babu>Hello, can you hear me?</v>

0f6c1a2e-1/17-1
00:00:05.700 --> 00:00:07.000
<v Hari Babu>Good morning.</v>

0f6c1a2e-1/18-0
00:00:09.000 --> 00:00:12.500
<v Hari Heera>Yes sir, I can hear you &amp; see the screen.</v>

NOTE a comment Teams sometimes writes

0f6c1a2e-1/19-0
00:16:01.000 --> 00:16:04.000
<v Hari Babu>So the drawing test has three parts.</v>
`;

describe('parseDemoVtt', () => {
  it('reads speakers and words, joins back-to-back cues of one speaker, skips non-cues', () => {
    const cues = parseDemoVtt(VTT);
    expect(cues).toHaveLength(3);
    expect(cues[0]).toEqual({ start: 3.12, end: 7, speaker: 'Hari Babu', text: 'Hello, can you hear me? Good morning.' });
    expect(cues[1]).toMatchObject({ speaker: 'Hari Heera', text: 'Yes sir, I can hear you & see the screen.' });
    expect(cues[2].start).toBe(961);
  });
  it('copes with CRLF, missing hours and no voice tag', () => {
    const cues = parseDemoVtt('WEBVTT\r\n\r\n01:05.250 --> 01:07.000\r\nPlain words\r\n');
    expect(cues).toEqual([{ start: 65.25, end: 67, speaker: null, text: 'Plain words' }]);
  });
});

describe('demoTranscriptStats', () => {
  it('splits words between the team and the student', () => {
    const s = demoTranscriptStats(parseDemoVtt(VTT), ['hari babu']);
    expect(s).toMatchObject({ minutes: 16, cues: 3, staffWords: 14, guestWords: 10 });
    expect(s.speakers[0]).toMatchObject({ name: 'Hari Babu', staff: true });
  });
});

describe('cueClock', () => {
  it('formats times', () => {
    expect(cueClock(754.2)).toBe('12:34');
    expect(cueClock(3725)).toBe('1:02:05');
  });
});
