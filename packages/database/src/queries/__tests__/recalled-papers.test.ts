import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  getQBRecalledSessionCards,
  getTopicIntelligence,
  promoteRecallToQB,
  refreshContributorSummary,
  refreshTopicSessionCounts,
} from '../nexus/question-bank';

/**
 * Unit tests for NATA Recalled Papers query functions.
 *
 * Uses a chainable mock Supabase client to verify correct
 * query construction and response handling.
 */

// ─── Chainable Mock Supabase Client ───

function createChainableMock() {
  let resolvedValue: any = { data: null, error: null, count: 0 };

  const chain: any = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    overlaps: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    single: vi.fn(() => Promise.resolve(resolvedValue)),
    maybeSingle: vi.fn(() => Promise.resolve(resolvedValue)),
    then: vi.fn((resolve: any) => resolve(resolvedValue)),
  };

  for (const method of [
    'range', 'select', 'eq', 'delete', 'limit', 'order',
    'upsert', 'insert', 'update', 'in', 'gte', 'lte', 'neq',
    'not', 'overlaps', 'ilike', 'from',
  ]) {
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

// ============================================
// getQBRecalledSessionCards
// ============================================

describe('getQBRecalledSessionCards', () => {
  test('should query papers with paper_source=recalled', async () => {
    const { mock, setResolvedValue } = createChainableMock();

    // Return empty papers → short circuits
    setResolvedValue({ data: [], error: null });

    const result = await getQBRecalledSessionCards(undefined, mock as any);

    expect(mock.from).toHaveBeenCalledWith('nexus_qb_original_papers');
    expect(mock.eq).toHaveBeenCalledWith('paper_source', 'recalled');
    expect(mock.order).toHaveBeenCalledWith('exam_date', { ascending: false });
    expect(result).toEqual([]);
  });

  test('should filter by year when provided', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: [], error: null });

    await getQBRecalledSessionCards(2025, mock as any);

    expect(mock.eq).toHaveBeenCalledWith('year', 2025);
  });

  test('should return empty array when no papers found', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: null, error: null });

    const result = await getQBRecalledSessionCards(undefined, mock as any);
    expect(result).toEqual([]);
  });

  test('should throw on database error', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: null, error: { message: 'DB error' } });

    await expect(getQBRecalledSessionCards(undefined, mock as any)).rejects.toEqual({ message: 'DB error' });
  });
});

// ============================================
// getTopicIntelligence
// ============================================

describe('getTopicIntelligence', () => {
  test('should query topics where priority is NOT NULL', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: [], error: null });

    const result = await getTopicIntelligence(mock as any);

    expect(mock.from).toHaveBeenCalledWith('nexus_qb_topics');
    expect(mock.not).toHaveBeenCalledWith('priority', 'is', null);
    expect(mock.eq).toHaveBeenCalledWith('is_active', true);
    expect(result).toEqual([]);
  });

  test('should return empty array when no topics found', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: null, error: null });

    const result = await getTopicIntelligence(mock as any);
    expect(result).toEqual([]);
  });

  test('should throw on database error', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: null, error: { message: 'Topic DB error' } });

    await expect(getTopicIntelligence(mock as any)).rejects.toEqual({ message: 'Topic DB error' });
  });
});

// ============================================
// refreshContributorSummary
// ============================================

describe('refreshContributorSummary', () => {
  test('should query contributors for given paper and update summary', async () => {
    const { mock, setResolvedValue } = createChainableMock();

    setResolvedValue({
      data: [
        { user_id: 'u1', display_name: 'Hari', question_count: 34, role: 'teacher' },
        { user_id: 'u2', display_name: 'Vedanth', question_count: 25, role: 'student' },
      ],
      error: null,
    });

    await refreshContributorSummary('paper-123', mock as any);

    expect(mock.from).toHaveBeenCalledWith('nexus_qb_paper_contributors');
    expect(mock.select).toHaveBeenCalledWith('user_id, display_name, question_count, role');
    expect(mock.eq).toHaveBeenCalledWith('paper_id', 'paper-123');

    // Should also update the paper
    expect(mock.from).toHaveBeenCalledWith('nexus_qb_original_papers');
    expect(mock.update).toHaveBeenCalledWith({
      contributor_summary: [
        { user_id: 'u1', name: 'Hari', question_count: 34, tier: 1 },
        { user_id: 'u2', name: 'Vedanth', question_count: 25, tier: 2 },
      ],
    });
  });

  test('should set tier=1 for teachers and tier=2 for students', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({
      data: [
        { user_id: 'u1', display_name: 'Admin', question_count: 10, role: 'teacher' },
        { user_id: 'u2', display_name: 'Student', question_count: 5, role: 'student' },
      ],
      error: null,
    });

    await refreshContributorSummary('p1', mock as any);

    expect(mock.update).toHaveBeenCalledWith({
      contributor_summary: expect.arrayContaining([
        expect.objectContaining({ name: 'Admin', tier: 1 }),
        expect.objectContaining({ name: 'Student', tier: 2 }),
      ]),
    });
  });
});

// ============================================
// refreshTopicSessionCounts
// ============================================

describe('refreshTopicSessionCounts', () => {
  test('should query recalled questions and update topic session counts', async () => {
    const { mock, setResolvedValue } = createChainableMock();

    // First call: get questions
    setResolvedValue({
      data: [
        { topic_id: 't1', original_paper_id: 'p1' },
        { topic_id: 't1', original_paper_id: 'p2' },
        { topic_id: 't2', original_paper_id: 'p1' },
      ],
      error: null,
    });

    await refreshTopicSessionCounts(mock as any);

    expect(mock.from).toHaveBeenCalledWith('nexus_qb_questions');
    expect(mock.not).toHaveBeenCalledWith('confidence_tier', 'is', null);
    expect(mock.not).toHaveBeenCalledWith('topic_id', 'is', null);
  });

  test('should handle no recalled questions gracefully', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: [], error: null });

    // Should not throw
    await refreshTopicSessionCounts(mock as any);
  });
});
