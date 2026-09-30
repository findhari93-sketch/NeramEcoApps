import { describe, expect, it } from 'vitest';
import {
  LEVEL_BARS,
  LEVEL_KEYS,
  SETTABLE_SKILLS,
  SKILLS,
  countLevels,
  levelSentence,
  matchesLevelFilter,
  overallLevel,
  parseLevelWrite,
  skillLevelLabel,
} from './student-level';

describe('student levels', () => {
  it('orders strongest first and fills 3, 2, 1 bars', () => {
    expect(LEVEL_KEYS).toEqual(['top', 'mid', 'needs_practice']);
    expect(LEVEL_KEYS.map((k) => LEVEL_BARS[k])).toEqual([3, 2, 1]);
  });

  it('only drawing is settable today; maths counts for JEE only', () => {
    expect(SETTABLE_SKILLS).toEqual(['drawing']);
    expect(SKILLS.find((s) => s.key === 'maths')?.exams).toEqual(['jee']);
    expect(SKILLS.find((s) => s.key === 'aptitude')?.exams).toEqual(['jee', 'nata']);
  });

  it('overall is the drawing level until other skills are measured', () => {
    expect(overallLevel({ drawing: 'mid' })).toBe('mid');
    expect(overallLevel({})).toBeNull();
    expect(overallLevel({ drawing: null })).toBeNull();
  });

  it('says nothing extra for an unrated face', () => {
    expect(levelSentence(null)).toBeNull();
    expect(levelSentence('top')).toBe('Overall level: Top (drawing).');
    expect(skillLevelLabel('drawing', null)).toBe('Drawing: Not rated');
    expect(skillLevelLabel('drawing', 'needs_practice')).toBe('Drawing: Needs practice');
  });

  it('filters and counts, with unrated as its own bucket', () => {
    expect(matchesLevelFilter('top', [])).toBe(true);
    expect(matchesLevelFilter(null, ['unrated'])).toBe(true);
    expect(matchesLevelFilter('mid', ['top', 'unrated'])).toBe(false);
    expect(countLevels(['top', 'top', null, 'mid', undefined])).toEqual({
      top: 2,
      mid: 1,
      needs_practice: 0,
      unrated: 2,
    });
  });

  describe('parseLevelWrite', () => {
    it('accepts a level, a clear and a trimmed note', () => {
      expect(parseLevelWrite({ skill: 'drawing', level: 'top', source: 'sort', note: '  steady lines ' })).toEqual({
        ok: true,
        value: { skill: 'drawing', level: 'top', note: 'steady lines', source: 'sort' },
      });
      expect(parseLevelWrite({ skill: 'drawing', level: null, source: 'flip' })).toMatchObject({
        ok: true,
        value: { level: null, note: null },
      });
    });

    it('rejects an untracked skill, an unknown level, source or an overlong note', () => {
      expect(parseLevelWrite({ skill: 'maths', level: 'top', source: 'sort' }).ok).toBe(false);
      expect(parseLevelWrite({ skill: 'drawing', level: 'great', source: 'sort' }).ok).toBe(false);
      expect(parseLevelWrite({ skill: 'drawing', level: 'top', source: 'elsewhere' }).ok).toBe(false);
      expect(parseLevelWrite({ skill: 'drawing', level: 'top', source: 'sort', note: 'x'.repeat(281) }).ok).toBe(false);
      expect(parseLevelWrite(null).ok).toBe(false);
    });
  });
});
