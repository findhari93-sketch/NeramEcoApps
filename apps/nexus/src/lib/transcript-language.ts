/**
 * Which script a transcript is written in, so a recording cannot be filed under
 * the wrong language in silence.
 *
 * THE MISTAKE THIS EXISTS FOR. A chapter that opened in English and then ran in
 * Tamil was attached to the English row. Its transcript was Tamil, so the
 * checkpoints Gemini cut from it were Tamil too, and every one of those artefacts
 * was internally consistent and correctly built. Nothing anywhere in the pipeline
 * looks at what language a transcript is in, so the only way to find out was a
 * student opening a recording labelled English and hearing Tamil.
 *
 * SCRIPT, NOT LANGUAGE, and the distinction is the whole limit of this file.
 * Counting characters in the Tamil Unicode block against Latin letters is exact,
 * free and needs no model, and it catches the case above completely, because
 * Stream transcribes Tamil speech into Tamil script. What it CANNOT catch is a
 * Tamil class transcribed into Latin letters ("vanakkam nanbargale"), which
 * counts as Latin and reads as English. Catching that needs the model. The cheap
 * route if it ever matters: lib/ai-generate.ts already sends the transcript to
 * Gemini, so a `detected_language` field on the first batch's JSON contract would
 * cost nothing extra. Deliberately not built until it is a real problem.
 *
 * Pure TypeScript, no JSX and no next/* imports, so the dialog, any future API
 * route and the tests all share one definition, matching lib/chapter-recordings.
 */

import { parseVTT } from './vtt-parser';

export type TranscriptScriptKind = 'tamil' | 'latin' | 'mixed' | 'unknown';

export interface TranscriptScript {
  /** Share of counted letters in the Tamil block, 0 to 100. */
  tamilPct: number;
  /** Share of counted letters in the Latin range, 0 to 100. */
  latinPct: number;
  kind: TranscriptScriptKind;
  /**
   * The track language this transcript most likely belongs to, or null when
   * there is not enough to say. Null is the value that means "do not warn".
   */
  likelyLanguage: 'ta' | 'en' | null;
  /** How many letters were counted, so a caller can say why it stayed silent. */
  letters: number;
}

/**
 * Below this there is nothing to conclude.
 *
 * A two-cue file, a transcript that is all timestamps, or a `.vtt` holding only
 * "[Music]" would otherwise produce a confident 100% on a handful of characters
 * and interrupt a teacher for no reason. Silence is the correct answer there.
 */
const MIN_LETTERS = 200;

/**
 * Both scripts present in real quantity, which is a genuine state rather than a
 * failure to decide: a class does get taught bilingually, and 'ta_en' is a
 * language an admin can offer. Warning that a mixed transcript is "really Tamil"
 * would be worse than saying nothing.
 */
const MIXED_FLOOR = 20;

/** The Tamil block. */
const TAMIL_START = 0x0b80;
const TAMIL_END = 0x0bff;

/**
 * Count the two scripts in one pass, by code point rather than by regex.
 *
 * A regex would need the Tamil range written as literal characters or as
 * escapes, and both have been quietly mangled before by an editor guessing at
 * this file's encoding. Numbers cannot be mangled. Latin stays ASCII-only on
 * purpose: no language Nexus offers is written in a third script, so anything
 * outside both ranges is punctuation, digits or markup and is correctly ignored.
 */
function countScripts(text: string): { tamil: number; latin: number } {
  let tamil = 0;
  let latin = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= TAMIL_START && c <= TAMIL_END) tamil++;
    else if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) latin++;
  }
  return { tamil, latin };
}

/**
 * Read the spoken text out of a `.vtt`.
 *
 * Through parseVTT rather than a hand-rolled strip, so the WEBVTT header, the
 * cue identifiers, the timestamps and any NOTE block never reach the counter.
 * Those are all Latin in every transcript ever produced, so counting them would
 * push a purely Tamil file towards "mixed" in proportion to how short it is.
 */
function spokenText(vtt: string): string {
  const entries = parseVTT(vtt);
  if (entries.length) return entries.map((e) => e.text).join(' ');

  // Not parseable as VTT. Someone pasting plain text is still worth reading, and
  // a wrong-format file is the upload's problem to report, not this function's.
  return vtt;
}

export function detectTranscriptScript(vtt: string): TranscriptScript {
  const { tamil, latin } = countScripts(spokenText(vtt || ''));
  const letters = tamil + latin;

  if (letters < MIN_LETTERS) {
    return { tamilPct: 0, latinPct: 0, kind: 'unknown', likelyLanguage: null, letters };
  }

  const tamilPct = Math.round((tamil / letters) * 100);
  const latinPct = 100 - tamilPct;

  if (tamilPct >= MIXED_FLOOR && latinPct >= MIXED_FLOOR) {
    return { tamilPct, latinPct, kind: 'mixed', likelyLanguage: null, letters };
  }

  return tamilPct > latinPct
    ? { tamilPct, latinPct, kind: 'tamil', likelyLanguage: 'ta', letters }
    : { tamilPct, latinPct, kind: 'latin', likelyLanguage: 'en', letters };
}

/**
 * Does this transcript contradict the language row it is being uploaded to?
 *
 * Only ever true when the detector is CONFIDENT and the row's language is one it
 * can speak about. Everything else is silence by design: an unknown or mixed
 * result, a short file, or a language the counter has no opinion on (Hindi,
 * Malayalam, anything an admin adds later) must not produce a warning, because a
 * warning a teacher learns to click past is worse than no warning at all.
 */
export function transcriptLanguageConflict(
  script: TranscriptScript,
  trackLanguage: string,
): boolean {
  if (!script.likelyLanguage) return false;
  if (trackLanguage !== 'ta' && trackLanguage !== 'en') return false;
  return script.likelyLanguage !== trackLanguage;
}
