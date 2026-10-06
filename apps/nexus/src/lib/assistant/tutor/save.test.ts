import { describe, expect, it } from 'vitest';
import { buildLearningItem } from './save';
import { MCQ_PACK } from './testing/fixtures';

describe('buildLearningItem', () => {
  it('builds a formula, an explanation, a mistake and the solution from the pack', () => {
    expect(buildLearningItem(MCQ_PACK, 'formula:s1', null)).toEqual({
      kind: 'formula', title: 'Dot product in components', body_md: MCQ_PACK.steps[0].formula!.md, conceptSlugs: ['vector_algebra.dot_product'],
    });
    expect(buildLearningItem(MCQ_PACK, 'why:s1', null)?.body_md).toContain(MCQ_PACK.steps[0].why);
    const mistake = buildLearningItem(MCQ_PACK, 'mistake:0', 'Find a.b')!;
    expect(mistake.kind).toBe('mistake');
    expect(mistake.title).toBe('My mistake: sign slip');
    expect(mistake.body_md).toMatch(/^\*\*Question\.\*\* Find a\.b/);
    const sol = buildLearningItem(MCQ_PACK, 'solution', null)!;
    expect(sol.body_md).toContain(MCQ_PACK.final.md);
  });

  it('refuses refs that do not exist', () => {
    expect(buildLearningItem(MCQ_PACK, 'formula:s2', null)).toBeNull();
    expect(buildLearningItem(MCQ_PACK, 'mistake:9', null)).toBeNull();
    expect(buildLearningItem(MCQ_PACK, 'hint:1', null)).toBeNull();
  });
});
