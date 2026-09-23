import { describe, it, expect } from 'vitest';
import { drewWithHelp, helpUsedWords, readHelpUsed } from './qb-help-used';

/**
 * What a student had open while they drew.
 *
 * The founder's requirement is that a teacher can always tell the difference
 * between a drawing made from nothing, one made with the answer on screen, and
 * one made after looking at what classmates did, because the same sheet means
 * three different things in those three cases.
 *
 * The wording is deliberately flat. None of these is cheating, and a chip that
 * reads like an accusation teaches students to avoid the door rather than to
 * use it honestly.
 */

describe('readHelpUsed', () => {
  it('survives anything the column might hold', () => {
    expect(readHelpUsed(null)).toEqual([]);
    expect(readHelpUsed(undefined)).toEqual([]);
    expect(readHelpUsed('solution')).toEqual([]);
    expect(readHelpUsed([])).toEqual([]);
  });

  it('keeps a fixed order whichever way round they were recorded', () => {
    expect(readHelpUsed(['peers', 'solution'])).toEqual(['solution', 'peers']);
    expect(readHelpUsed(['solution', 'peers'])).toEqual(['solution', 'peers']);
  });

  it('drops a kind it does not know and does not repeat one', () => {
    expect(readHelpUsed(['solution', 'solution', 'ouija'])).toEqual(['solution']);
  });
});

describe('helpUsedWords', () => {
  it('says so plainly for each case', () => {
    expect(helpUsedWords([])).toBe('Drawn without help');
    expect(helpUsedWords(['solution'])).toBe('Drawn with the solution open');
    expect(helpUsedWords(['peers'])).toBe('Drawn after seeing other students');
    expect(helpUsedWords(['solution', 'peers'])).toBe(
      'Drawn after seeing the solution and other students',
    );
  });

  it('treats a row from before the column existed as unaided', () => {
    // Nothing was recorded because there was nothing recording. Claiming help
    // that was never observed would be worse than claiming none.
    expect(helpUsedWords(null)).toBe('Drawn without help');
  });
});

describe('drewWithHelp', () => {
  it('is the tone switch for the chip', () => {
    expect(drewWithHelp([])).toBe(false);
    expect(drewWithHelp(null)).toBe(false);
    expect(drewWithHelp(['peers'])).toBe(true);
  });
});
