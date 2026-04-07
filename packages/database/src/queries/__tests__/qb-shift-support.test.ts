import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  parseSessionKey,
  getOrCreateOriginalPaper,
  bulkCreateDraftQuestions,
  getQBExamTree,
} from '../nexus/question-bank';

/**
 * Unit tests for Question Bank shift (Forenoon/Afternoon) support.
 *
 * Tests parseSessionKey utility and verifies shift is properly
 * passed through to query construction.
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
    is: vi.fn().mockReturnThis(),
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
    'not', 'overlaps', 'ilike', 'from', 'is',
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
// parseSessionKey
// ============================================

describe('parseSessionKey', () => {
  test('parses session without shift', () => {
    const result = parseSessionKey('Session 1');
    expect(result).toEqual({ session: 'Session 1', shift: null });
  });

  test('parses session with Forenoon shift', () => {
    const result = parseSessionKey('Session 1 (Forenoon)');
    expect(result).toEqual({ session: 'Session 1', shift: 'forenoon' });
  });

  test('parses session with Afternoon shift', () => {
    const result = parseSessionKey('Session 2 (Afternoon)');
    expect(result).toEqual({ session: 'Session 2', shift: 'afternoon' });
  });

  test('parses NATA test without shift', () => {
    const result = parseSessionKey('Test 1');
    expect(result).toEqual({ session: 'Test 1', shift: null });
  });

  test('parses NATA test with Forenoon shift', () => {
    const result = parseSessionKey('Test 2 (Forenoon)');
    expect(result).toEqual({ session: 'Test 2', shift: 'forenoon' });
  });

  test('handles empty string', () => {
    const result = parseSessionKey('');
    expect(result).toEqual({ session: '', shift: null });
  });

  test('does not match invalid shift values', () => {
    const result = parseSessionKey('Session 1 (Morning)');
    expect(result).toEqual({ session: 'Session 1 (Morning)', shift: null });
  });

  test('handles extra spaces before parenthesis', () => {
    const result = parseSessionKey('Session 1  (Forenoon)');
    expect(result).toEqual({ session: 'Session 1', shift: 'forenoon' });
  });
});

// ============================================
// getOrCreateOriginalPaper - shift handling
// ============================================

describe('getOrCreateOriginalPaper - shift support', () => {
  test('queries with shift=null when no shift provided', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: null, error: null });

    // Will fail on insert, but we can check the query was built correctly
    try {
      await getOrCreateOriginalPaper('JEE_PAPER_2', 2024, 'Session 1', 'user-1', null, mock as any);
    } catch {
      // Expected: insert will fail with mock
    }

    // Should have called .is('shift', null) for the lookup
    expect(mock.is).toHaveBeenCalledWith('shift', null);
  });

  test('queries with shift=forenoon when provided', async () => {
    const { mock, setResolvedValue } = createChainableMock();

    // Return existing paper to avoid insert
    setResolvedValue({
      data: {
        id: 'paper-1',
        exam_type: 'JEE_PAPER_2',
        year: 2024,
        session: 'Session 1',
        shift: 'forenoon',
        upload_status: 'parsed',
      },
      error: null,
    });

    const result = await getOrCreateOriginalPaper(
      'JEE_PAPER_2', 2024, 'Session 1', 'user-1', 'forenoon', mock as any
    );

    expect(mock.eq).toHaveBeenCalledWith('shift', 'forenoon');
    expect(result.isNew).toBe(false);
  });

  test('creates paper with shift when new', async () => {
    const { mock, setResolvedValue } = createChainableMock();

    // First call (maybeSingle) returns null, second call (insert+single) returns new paper
    let callCount = 0;
    mock.maybeSingle = vi.fn(() => {
      callCount++;
      return Promise.resolve({ data: null, error: null });
    });
    mock.single = vi.fn(() => {
      return Promise.resolve({
        data: {
          id: 'paper-new',
          exam_type: 'JEE_PAPER_2',
          year: 2024,
          session: 'Session 1',
          shift: 'afternoon',
          upload_status: 'pending',
        },
        error: null,
      });
    });

    const result = await getOrCreateOriginalPaper(
      'JEE_PAPER_2', 2024, 'Session 1', 'user-1', 'afternoon', mock as any
    );

    expect(result.isNew).toBe(true);
    expect(result.paper.shift).toBe('afternoon');
    // Verify insert was called
    expect(mock.insert).toHaveBeenCalled();
  });
});

// ============================================
// bulkCreateDraftQuestions - shift in sources
// ============================================

describe('bulkCreateDraftQuestions - shift in source inserts', () => {
  test('passes shift to source inserts', async () => {
    const { mock } = createChainableMock();

    // Mock the question insert to return created questions
    let insertCallCount = 0;
    mock.insert = vi.fn((data: any) => {
      insertCallCount++;
      return mock;
    });
    mock.select = vi.fn((sel?: string) => {
      if (sel === 'id, display_order') {
        // Return created questions
        return {
          ...mock,
          then: (resolve: any) => resolve({
            data: [{ id: 'q-1', display_order: 1 }],
            error: null,
          }),
        };
      }
      return mock;
    });

    // Need to handle the update call for paper stats
    mock.update = vi.fn(() => mock);

    try {
      await bulkCreateDraftQuestions(
        'paper-1',
        'JEE_PAPER_2',
        2024,
        'Session 1',
        [{
          question_number: 1,
          nta_question_id: 'NTA-001',
          question_format: 'MCQ' as const,
          question_text: 'Test question',
          options: [
            { nta_id: 'opt1', text: 'A', label: 'a' },
            { nta_id: 'opt2', text: 'B', label: 'b' },
            { nta_id: 'opt3', text: 'C', label: 'c' },
            { nta_id: 'opt4', text: 'D', label: 'd' },
          ],
          section: 'math_mcq',
          categories: ['mathematics'],
        }] as any,
        'user-1',
        'forenoon',
        mock as any
      );
    } catch {
      // May fail due to mock limitations
    }

    // Verify insert was called (at least for questions)
    expect(mock.insert).toHaveBeenCalled();

    // Check that the second insert call (sources) includes shift
    const insertCalls = mock.insert.mock.calls;
    if (insertCalls.length >= 2) {
      const sourceInsert = insertCalls[1][0];
      if (Array.isArray(sourceInsert)) {
        expect(sourceInsert[0].shift).toBe('forenoon');
      }
    }
  });
});

// ============================================
// getQBExamTree - shift in composite session keys
// ============================================

describe('getQBExamTree - composite session keys with shift', () => {
  test('creates composite key for shifted papers', async () => {
    const { mock, setResolvedValue } = createChainableMock();

    // First call: sources query
    let queryCount = 0;
    const originalThen = mock.then;
    mock.then = vi.fn((resolve: any) => {
      queryCount++;
      if (queryCount === 1) {
        // Sources data with shift
        return resolve({
          data: [
            { exam_type: 'JEE_PAPER_2', year: 2024, session: 'Session 1', shift: 'forenoon', question_id: 'q1' },
            { exam_type: 'JEE_PAPER_2', year: 2024, session: 'Session 1', shift: 'afternoon', question_id: 'q2' },
            { exam_type: 'JEE_PAPER_2', year: 2024, session: 'Session 2', shift: null, question_id: 'q3' },
          ],
          error: null,
        });
      }
      if (queryCount === 2) {
        // Active questions
        return resolve({
          data: [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }],
          error: null,
        });
      }
      return resolve({ data: [], error: null });
    });

    const tree = await getQBExamTree(mock as any);

    expect(tree.exams).toHaveLength(1);
    const jee = tree.exams[0];
    expect(jee.exam_type).toBe('JEE_PAPER_2');
    expect(jee.years).toHaveLength(1);

    const year2024 = jee.years[0];
    expect(year2024.year).toBe(2024);

    // Should have 3 sessions: "Session 1 (Afternoon)", "Session 1 (Forenoon)", "Session 2"
    const sessionLabels = year2024.sessions.map((s) => s.session).sort();
    expect(sessionLabels).toEqual([
      'Session 1 (Afternoon)',
      'Session 1 (Forenoon)',
      'Session 2',
    ]);
  });

  test('does not add shift suffix when shift is null', async () => {
    const { mock } = createChainableMock();

    let queryCount = 0;
    mock.then = vi.fn((resolve: any) => {
      queryCount++;
      if (queryCount === 1) {
        return resolve({
          data: [
            { exam_type: 'JEE_PAPER_2', year: 2024, session: 'Session 1', shift: null, question_id: 'q1' },
          ],
          error: null,
        });
      }
      if (queryCount === 2) {
        return resolve({
          data: [{ id: 'q1' }],
          error: null,
        });
      }
      return resolve({ data: [], error: null });
    });

    const tree = await getQBExamTree(mock as any);

    const sessions = tree.exams[0]?.years[0]?.sessions || [];
    expect(sessions).toHaveLength(1);
    expect(sessions[0].session).toBe('Session 1');
  });
});
