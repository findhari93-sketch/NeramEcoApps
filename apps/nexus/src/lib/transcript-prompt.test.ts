import { describe, it, expect } from 'vitest';
import {
  buildAiStudioPrompt,
  formatClock,
  planAiStudioParts,
  transcriptRules,
} from './transcript-prompt';

describe('planAiStudioParts', () => {
  it('splits a two hour class into two overlapping parts', () => {
    expect(planAiStudioParts(7463)).toEqual([
      { index: 0, start: 0, end: 3732 },
      { index: 1, start: 3672, end: 7463 },
    ]);
  });

  it('keeps a class of up to 65 minutes in one part', () => {
    expect(planAiStudioParts(3900)).toEqual([{ index: 0, start: 0, end: 3900 }]);
  });

  it('uses three parts for a three hour class', () => {
    const parts = planAiStudioParts(10800);
    expect(parts).toHaveLength(3);
    expect(parts[0].start).toBe(0);
    expect(parts[2].end).toBe(10800);
    // Every boundary overlaps by a minute, so no sentence falls between parts.
    expect(parts[1].start).toBe(parts[0].end - 60);
    expect(parts[2].start).toBe(parts[1].end - 60);
  });

  it('gives one part with no range when the length is unknown', () => {
    expect(planAiStudioParts(0)).toEqual([{ index: 0, start: 0, end: 0 }]);
  });
});

describe('formatClock', () => {
  it('writes HH:MM:SS the way the video player shows it', () => {
    expect(formatClock(0)).toBe('00:00:00');
    expect(formatClock(3672)).toBe('01:01:12');
    expect(formatClock(7462.8)).toBe('02:04:23');
  });
});

describe('transcriptRules', () => {
  it('asks for an English transcript that keeps technical terms and does not summarise', () => {
    const rules = transcriptRules({ spokenLanguage: 'ta', timestamps: 'video' });
    expect(rules).toMatch(/Tamil mixed with English/);
    expect(rules).toMatch(/in English/);
    expect(rules).toMatch(/technical/);
    expect(rules).toMatch(/Do not summarise/);
    expect(rules).toMatch(/WEBVTT/);
    expect(rules).toMatch(/HH:MM:SS\.mmm counted from the start of the whole video/);
  });

  it('describes an English class differently but still asks for English', () => {
    const rules = transcriptRules({ spokenLanguage: 'en', timestamps: 'video' });
    expect(rules).not.toMatch(/Tamil mixed with English/);
    expect(rules).toMatch(/in English/);
  });
});

describe('buildAiStudioPrompt', () => {
  const parts = planAiStudioParts(7463);

  it('names the part and the exact stretch of video to transcribe', () => {
    const first = buildAiStudioPrompt({ part: parts[0], parts, durationSeconds: 7463, spokenLanguage: 'ta' });
    const second = buildAiStudioPrompt({ part: parts[1], parts, durationSeconds: 7463, spokenLanguage: 'ta' });

    expect(first).toContain('This is part 1 of 2. The video is 02:04:23 long.');
    expect(first).toContain('Transcribe only from 00:00:00 to 01:02:12.');
    expect(second).toContain('This is part 2 of 2.');
    expect(second).toContain('Transcribe only from 01:01:12 to the end of the video.');
  });

  it('asks for the whole video when there is one part', () => {
    const one = planAiStudioParts(1800);
    const prompt = buildAiStudioPrompt({ part: one[0], parts: one, durationSeconds: 1800, spokenLanguage: 'ta' });
    expect(prompt).toContain('Transcribe the whole video.');
    expect(prompt).not.toContain('part 1 of 1');
  });

  it('never uses an em dash or a double dash other than the cue arrow', () => {
    // The prompt is copy a teacher reads and pastes, so it follows the site's
    // punctuation rule.
    for (const part of parts) {
      const prompt = buildAiStudioPrompt({ part, parts, durationSeconds: 7463, spokenLanguage: 'ta' });
      expect(prompt).not.toContain('—');
      expect(prompt.replace(/-->/g, '')).not.toContain('--');
    }
  });
});
