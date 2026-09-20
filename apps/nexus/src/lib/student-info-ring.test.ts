import { describe, expect, it } from 'vitest';
import {
  INFO_RING_LABEL_RE,
  INFO_RING_NAME,
  INFO_RING_STATES,
  INFO_RING_TESTID,
  infoRingColor,
  infoRingLabel,
  infoRingSpeech,
} from './student-info-ring';
import { DORMANT_LABEL, STAGE_LABEL, STAGE_ORDER, stageColor } from './student-stage';

/**
 * The ring's vocabulary.
 *
 * Everything here is folded out of student-stage.ts rather than written down a
 * second time, so most of these tests are about the fold holding: a stage added
 * there must appear in the legend and in the regex without anyone remembering
 * to add it, because "remembering to" is exactly what did not happen the last
 * three times.
 */

describe('INFO_RING_STATES', () => {
  it('covers every stage plus paused, in legend order', () => {
    expect(INFO_RING_STATES.map((s) => s.key)).toEqual([...STAGE_ORDER, 'dormant']);
  });

  it('takes its labels from the stage table, never a second copy', () => {
    for (const state of INFO_RING_STATES) {
      const expected = state.key === 'dormant' ? DORMANT_LABEL : STAGE_LABEL[state.key];
      expect(state.label).toBe(expected);
    }
  });

  it('gives every state a line of its own to explain it', () => {
    for (const state of INFO_RING_STATES) {
      // The legend renders `meaning`, so that one has to be a sentence. The
      // tooltip's `explainer` is allowed to be terse ("Class 10." says it all).
      expect(state.meaning.length).toBeGreaterThan(10);
      expect(state.explainer.trim()).not.toBe('');
    }
  });

  it('tells the two greys apart by shape, so colour is never the only signal', () => {
    const byKey = Object.fromEntries(INFO_RING_STATES.map((s) => [s.key, s]));
    expect(byKey.unset.borderStyle).toBe('dotted');
    expect(byKey.dormant.borderStyle).toBe('dashed');
    expect(byKey.dormant.faded).toBe(true);
    // Every recorded stage is solid, so "has a border style of its own" reads as
    // "nobody has said" or "paused" and nothing else.
    for (const key of ['gap_year', '12th', '11th', '10th'] as const) {
      expect(byKey[key].borderStyle).toBe('solid');
      expect(byKey[key].faded).toBe(false);
    }
  });

  it('gives every state a glyph, because a ring colour alone fails a colour-blind reader', () => {
    const icons = INFO_RING_STATES.map((s) => s.icon);
    expect(icons.every(Boolean)).toBe(true);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it('paints each stage a colour of its own in both modes', () => {
    for (const mode of ['light', 'dark'] as const) {
      const colors = INFO_RING_STATES.map((s) => infoRingColor(s.key, mode));
      expect(new Set(colors).size).toBe(colors.length);
    }
  });

  it('draws the ring colour the avatar draws, not one of its own', () => {
    for (const mode of ['light', 'dark'] as const) {
      for (const key of STAGE_ORDER) {
        expect(infoRingColor(key, mode)).toBe(stageColor(key, mode));
      }
    }
  });
});

describe('infoRingLabel', () => {
  it('lets paused outrank the stage, because that is what the ring draws', () => {
    expect(infoRingLabel('12th', false)).toBe('Class 12');
    expect(infoRingLabel('12th', true)).toBe(DORMANT_LABEL);
  });
});

describe('infoRingSpeech', () => {
  it('starts with the stage and ends with the language', () => {
    const { ariaLabel } = infoRingSpeech({
      stage: '11th',
      dormant: false,
      languageSentence: 'Tamil.',
    });
    expect(ariaLabel.startsWith('Class 11: ')).toBe(true);
    expect(ariaLabel.endsWith(' Tamil.')).toBe(true);
  });

  it('separates the aria-label with a colon and the tooltip with a period', () => {
    // The colon is the only thing that tells a ring apart from the stage chip
    // beside it, for a screen reader and for every sweep that looks for a ring.
    const speech = infoRingSpeech({ stage: '10th', dormant: false, languageSentence: null });
    expect(speech.ariaLabel.startsWith('Class 10: ')).toBe(true);
    expect(speech.title.startsWith('Class 10. ')).toBe(true);
  });

  it('says nothing about language when there is nothing to say', () => {
    const { ariaLabel } = infoRingSpeech({ stage: '11th', dormant: false, languageSentence: null });
    expect(ariaLabel).not.toMatch(/Tamil|Hindi|Kannada|Malayalam/);
  });
});

describe('INFO_RING_LABEL_RE', () => {
  it('matches what every state actually speaks', () => {
    for (const state of INFO_RING_STATES) {
      const speech = infoRingSpeech({
        stage: state.key === 'dormant' ? 'unset' : state.key,
        dormant: state.key === 'dormant',
        languageSentence: null,
      });
      expect(speech.ariaLabel).toMatch(INFO_RING_LABEL_RE);
    }
  });

  it('does not match a bare stage name, which is how a chip labels itself', () => {
    expect('Class 11').not.toMatch(INFO_RING_LABEL_RE);
    expect('Class 11. Their exam is next year.').not.toMatch(INFO_RING_LABEL_RE);
  });

  it('carries no global flag, so a shared regex cannot keep state between callers', () => {
    expect(INFO_RING_LABEL_RE.global).toBe(false);
    const label = 'Class 12: Class 12: their exam is this year.';
    expect(INFO_RING_LABEL_RE.test(label)).toBe(true);
    expect(INFO_RING_LABEL_RE.test(label)).toBe(true);
  });
});

describe('the words a teacher reads', () => {
  it('names the thing', () => {
    expect(INFO_RING_NAME).toBe('Student info ring');
    expect(INFO_RING_TESTID).toBe('info-ring');
  });

  it('uses no em dashes anywhere, which is a house rule for every visible string', () => {
    const visible = [
      INFO_RING_NAME,
      ...INFO_RING_STATES.flatMap((s) => [s.label, s.meaning, s.explainer]),
    ];
    for (const text of visible) {
      expect(text).not.toMatch(/—|--|&mdash;/);
    }
  });
});
