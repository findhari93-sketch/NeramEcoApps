import { describe, it, expect } from 'vitest';
import { detectTranscriptScript, transcriptLanguageConflict } from './transcript-language';

/**
 * The case that produced this module: a Tamil recording filed under English.
 *
 * The tests that matter most here are the ones about staying SILENT. A warning
 * that fires on a short file, on a bilingual class or on a language the counter
 * has no opinion about is a warning teachers learn to click past, and then it
 * catches nothing at all.
 */

/** Tamil written out as code points, so no editor can re-encode the fixture. */
const TA = String.fromCharCode(
  0x0ba8, 0x0bbe, 0x0ba9, 0x0bcd, 0x0b95, 0x0bc1, // "நான்கு"
);
const TAMIL_WORD = `${TA} `;

function vtt(lines: string[]): string {
  const cues = lines
    .map((text, i) => {
      const start = `00:00:${String(i * 5).padStart(2, '0')}.000`;
      const end = `00:00:${String(i * 5 + 5).padStart(2, '0')}.000`;
      return `${start} --> ${end}\n${text}\n`;
    })
    .join('\n');
  return `WEBVTT\n\n${cues}`;
}

/** Enough letters to clear MIN_LETTERS, in one script. */
function repeat(word: string, times: number): string[] {
  return Array.from({ length: times }, () => word.repeat(8));
}

describe('detectTranscriptScript', () => {
  it('reads a Tamil transcript as Tamil', () => {
    const result = detectTranscriptScript(vtt(repeat(TAMIL_WORD, 8)));
    expect(result.kind).toBe('tamil');
    expect(result.likelyLanguage).toBe('ta');
    expect(result.tamilPct).toBeGreaterThan(90);
  });

  it('reads an English transcript as Latin', () => {
    const result = detectTranscriptScript(vtt(repeat('architecture history ', 8)));
    expect(result.kind).toBe('latin');
    expect(result.likelyLanguage).toBe('en');
    expect(result.latinPct).toBeGreaterThan(90);
  });

  it('calls a genuinely bilingual transcript mixed, and refuses to guess', () => {
    const half = [...repeat(TAMIL_WORD, 5), ...repeat('architecture history ', 5)];
    const result = detectTranscriptScript(vtt(half));
    expect(result.kind).toBe('mixed');
    expect(result.likelyLanguage).toBeNull();
  });

  it('stays silent on a transcript too short to judge', () => {
    const result = detectTranscriptScript(vtt(['Hello everyone', 'Welcome back']));
    expect(result.kind).toBe('unknown');
    expect(result.likelyLanguage).toBeNull();
  });

  it('stays silent on an empty or unparseable file', () => {
    expect(detectTranscriptScript('').kind).toBe('unknown');
    expect(detectTranscriptScript('WEBVTT\n\n').kind).toBe('unknown');
  });

  /**
   * The header, the cue ids and the timestamps are all Latin in every transcript
   * ever produced, so counting them would drag a purely Tamil file towards
   * "mixed" in proportion to how short it is. parseVTT is what keeps them out.
   */
  it('ignores the WEBVTT header, cue ids and timestamps', () => {
    const withNoise = [
      'WEBVTT',
      '',
      'NOTE this is a note that should not be counted at all',
      '',
      'cue-identifier-one',
      '00:00:00.000 --> 00:00:05.000',
      TAMIL_WORD.repeat(40),
      '',
      'cue-identifier-two',
      '00:00:05.000 --> 00:00:10.000',
      TAMIL_WORD.repeat(40),
      '',
    ].join('\n');
    const result = detectTranscriptScript(withNoise);
    expect(result.kind).toBe('tamil');
    expect(result.latinPct).toBeLessThan(5);
  });

  /**
   * The stated hole, pinned so nobody assumes it is covered: Tamil speech
   * transcribed into Latin letters counts as English. Catching it needs a model.
   */
  it('cannot tell transliterated Tamil from English (known limit)', () => {
    const result = detectTranscriptScript(vtt(repeat('vanakkam nanbargale ', 8)));
    expect(result.likelyLanguage).toBe('en');
  });
});

describe('transcriptLanguageConflict', () => {
  const tamilScript = detectTranscriptScript(vtt(repeat(TAMIL_WORD, 8)));
  const latinScript = detectTranscriptScript(vtt(repeat('architecture history ', 8)));

  it('flags a Tamil transcript on the English track', () => {
    expect(transcriptLanguageConflict(tamilScript, 'en')).toBe(true);
  });

  it('flags an English transcript on the Tamil track', () => {
    expect(transcriptLanguageConflict(latinScript, 'ta')).toBe(true);
  });

  it('says nothing when the transcript matches the track', () => {
    expect(transcriptLanguageConflict(tamilScript, 'ta')).toBe(false);
    expect(transcriptLanguageConflict(latinScript, 'en')).toBe(false);
  });

  /**
   * A language an admin adds later has no counter behind it, so the honest
   * answer is no opinion. Warning "this looks like English" on the Hindi row
   * would be wrong every single time.
   */
  it('says nothing about a language it cannot speak for', () => {
    expect(transcriptLanguageConflict(latinScript, 'hi')).toBe(false);
    expect(transcriptLanguageConflict(tamilScript, 'ta_en')).toBe(false);
  });

  it('says nothing when the detector was not confident', () => {
    const short = detectTranscriptScript(vtt(['Hello there']));
    expect(transcriptLanguageConflict(short, 'en')).toBe(false);
    expect(transcriptLanguageConflict(short, 'ta')).toBe(false);
  });
});
