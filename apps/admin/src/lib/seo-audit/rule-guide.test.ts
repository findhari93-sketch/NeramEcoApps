import { describe, expect, it } from 'vitest';
import { ruleOwner, RULES } from './rule-guide';

describe('ruleOwner', () => {
  it('sends every rule the autofix job may change to Claude Code', () => {
    for (const [id, rule] of Object.entries(RULES)) {
      expect(ruleOwner(id) === 'code', id).toBe(rule.autofix);
    }
  });

  it('leaves Google-side states to Google and judgement calls to you', () => {
    expect(ruleOwner('I4')).toBe('google');
    expect(ruleOwner('I8')).toBe('google');
    expect(ruleOwner('P4')).toBe('you');
    expect(ruleOwner('O8')).toBe('you');
    expect(ruleOwner('S1')).toBe('code');
  });

  it('treats an unknown rule as yours', () => {
    expect(ruleOwner('Z9')).toBe('you');
  });
});
