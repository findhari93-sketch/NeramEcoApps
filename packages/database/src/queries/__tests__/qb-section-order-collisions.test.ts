import { describe, test, expect, vi, beforeEach } from 'vitest';
import { findSectionOrderCollisions, resolveSectionOrderCollisions } from '../nexus/question-bank';

function createChainableMock() {
  let resolvedValue: any = { data: null, error: null };

  const chain: any = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    range: vi.fn(() => Promise.resolve(resolvedValue)),
    then: vi.fn((resolve: any) => resolve(resolvedValue)),
  };

  for (const method of ['from', 'select', 'update', 'eq', 'not']) {
    const original = chain[method];
    chain[method] = vi.fn((...args: any[]) => {
      original(...args);
      return chain;
    });
  }

  return {
    mock: chain,
    setResolvedValue: (val: any) => { resolvedValue = val; },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('findSectionOrderCollisions', () => {
  test('groups by paper + section + display_order and drops singletons', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({
      data: [
        { id: 'q1', original_paper_id: 'p1', section: 'math_mcq', display_order: 1, question_text: 'a', question_format: 'MCQ', categories: ['mathematics'] },
        { id: 'q2', original_paper_id: 'p1', section: 'math_mcq', display_order: 12, question_text: 'b', question_format: 'MCQ', categories: ['differential_equations'] },
        { id: 'q3', original_paper_id: 'p1', section: 'math_mcq', display_order: 12, question_text: 'c', question_format: 'MCQ', categories: ['aptitude'] },
        { id: 'q4', original_paper_id: 'p1', section: 'aptitude', display_order: 1, question_text: 'd', question_format: 'MCQ', categories: ['aptitude'] },
      ],
      error: null,
    });

    const groups = await findSectionOrderCollisions(mock);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ original_paper_id: 'p1', section: 'math_mcq', display_order: 12 });
    expect(groups[0].candidates.map((c) => c.id).sort()).toEqual(['q2', 'q3']);
  });

  test('returns nothing when no paper has a collision', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({
      data: [
        { id: 'q1', original_paper_id: 'p1', section: 'math_mcq', display_order: 1, question_text: 'a', question_format: 'MCQ', categories: [] },
      ],
      error: null,
    });

    const groups = await findSectionOrderCollisions(mock);
    expect(groups).toEqual([]);
  });

  test('throws on a query error rather than returning a partial result', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(findSectionOrderCollisions(mock)).rejects.toBeTruthy();
  });
});

describe('resolveSectionOrderCollisions', () => {
  test('writes section, section_order and display_order per resolution, scoped to the paper', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: [{ id: 'q3' }], error: null });

    const result = await resolveSectionOrderCollisions(
      'p1',
      [{ question_id: 'q3', section: 'aptitude', display_order: 51 }],
      mock,
    );

    expect(result).toEqual({ updated: 1 });
    expect(mock.update).toHaveBeenCalledWith(
      expect.objectContaining({ section: 'aptitude', section_order: 3, display_order: 51 }),
    );
    expect(mock.eq).toHaveBeenCalledWith('original_paper_id', 'p1');
  });

  test('returns updated: 0 for an empty resolution list without querying', async () => {
    const { mock } = createChainableMock();
    const result = await resolveSectionOrderCollisions('p1', [], mock);
    expect(result).toEqual({ updated: 0 });
    expect(mock.from).not.toHaveBeenCalled();
  });
});
