import { describe, test, expect, vi } from 'vitest';
import {
  listOnboardingStepDefinitions,
  initializeStudentOnboarding,
  getStudentOnboardingProgress,
  getStudentOnboardingProgressByUserId,
  markOnboardingStepComplete,
  markOnboardingStepIncomplete,
  getOnboardingOverview,
  bulkMarkOnboardingStepComplete,
} from '../post-enrollment-onboarding';

/**
 * Unit tests for post-enrollment onboarding query functions.
 *
 * Uses a chainable mock Supabase client to verify correct query construction.
 */

// ─── Chainable Mock ───

function createChainableMock() {
  let resolvedValue: any = { data: null, error: null, count: 0 };

  const chain: any = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn(() => Promise.resolve(resolvedValue)),
    maybeSingle: vi.fn(() => Promise.resolve(resolvedValue)),
    rpc: vi.fn(() => Promise.resolve(resolvedValue)),
    then: vi.fn((resolve: any) => resolve(resolvedValue)),
  };

  for (const method of ['range', 'select', 'eq', 'delete', 'limit', 'order', 'or', 'in', 'update']) {
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

// ─── Tests ───

describe('listOnboardingStepDefinitions', () => {
  test('should query onboarding_step_definitions ordered by display_order', async () => {
    const steps = [
      { id: '1', step_key: 'whatsapp', display_order: 1 },
      { id: '2', step_key: 'teams', display_order: 2 },
    ];
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: steps, error: null });

    const result = await listOnboardingStepDefinitions(mock as any);

    expect(mock.from).toHaveBeenCalledWith('onboarding_step_definitions');
    expect(mock.order).toHaveBeenCalledWith('display_order', { ascending: true });
    expect(result).toEqual(steps);
  });

  test('should filter active only when option set', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: [], error: null });

    await listOnboardingStepDefinitions(mock as any, { activeOnly: true });

    expect(mock.eq).toHaveBeenCalledWith('is_active', true);
  });

  test('should throw on error', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: null, error: { message: 'DB error' } });

    await expect(listOnboardingStepDefinitions(mock as any)).rejects.toEqual({
      message: 'DB error',
    });
  });
});

describe('initializeStudentOnboarding', () => {
  test('should call rpc with correct parameters', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: null, error: null });

    await initializeStudentOnboarding('sp-1', 'user-1', 'direct', mock as any);

    expect(mock.rpc).toHaveBeenCalledWith('initialize_student_onboarding', {
      p_student_profile_id: 'sp-1',
      p_user_id: 'user-1',
      p_enrollment_type: 'direct',
    });
  });

  test('should throw when rpc returns error', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: null, error: { message: 'RPC error' } });

    await expect(
      initializeStudentOnboarding('sp-1', 'user-1', 'direct', mock as any)
    ).rejects.toEqual({ message: 'RPC error' });
  });
});

describe('getStudentOnboardingProgress', () => {
  test('should query by student_profile_id with step definition join', async () => {
    const progress = [
      { id: 'p1', is_completed: false, step_definition: { display_order: 2 } },
      { id: 'p2', is_completed: true, step_definition: { display_order: 1 } },
    ];
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: progress, error: null });

    const result = await getStudentOnboardingProgress('sp-1', mock as any);

    expect(mock.from).toHaveBeenCalledWith('student_onboarding_progress');
    expect(mock.eq).toHaveBeenCalledWith('student_profile_id', 'sp-1');
    // Should sort by display_order — p2 (order 1) before p1 (order 2)
    expect(result[0].id).toBe('p2');
    expect(result[1].id).toBe('p1');
  });
});

describe('getStudentOnboardingProgressByUserId', () => {
  test('should query by user_id instead of student_profile_id', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: [], error: null });

    await getStudentOnboardingProgressByUserId('user-1', mock as any);

    expect(mock.eq).toHaveBeenCalledWith('user_id', 'user-1');
  });

  test('should sort results by display_order', async () => {
    const progress = [
      { id: 'p1', step_definition: { display_order: 3 } },
      { id: 'p2', step_definition: { display_order: 1 } },
    ];
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: progress, error: null });

    const result = await getStudentOnboardingProgressByUserId('user-1', mock as any);
    expect(result[0].id).toBe('p2');
  });
});

describe('markOnboardingStepComplete', () => {
  test('should set is_completed, completed_at, completed_by fields', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: { id: 'p1', is_completed: true }, error: null });

    await markOnboardingStepComplete('p1', 'student', 'user-1', mock as any);

    expect(mock.update).toHaveBeenCalledWith(
      expect.objectContaining({
        is_completed: true,
        completed_by_type: 'student',
        completed_by_user_id: 'user-1',
      })
    );
    expect(mock.eq).toHaveBeenCalledWith('id', 'p1');
  });

  test('should include admin_notes when provided', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: { id: 'p1' }, error: null });

    await markOnboardingStepComplete('p1', 'admin', 'admin-1', mock as any, 'Verified by admin');

    expect(mock.update).toHaveBeenCalledWith(
      expect.objectContaining({
        admin_notes: 'Verified by admin',
      })
    );
  });

  test('should not include admin_notes when undefined', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: { id: 'p1' }, error: null });

    await markOnboardingStepComplete('p1', 'student', 'user-1', mock as any);

    const updateArg = mock.update.mock.calls[0][0];
    expect(updateArg).not.toHaveProperty('admin_notes');
  });
});

describe('markOnboardingStepIncomplete', () => {
  test('should reset completed fields to null/false', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: { id: 'p1', is_completed: false }, error: null });

    await markOnboardingStepIncomplete('p1', mock as any);

    expect(mock.update).toHaveBeenCalledWith({
      is_completed: false,
      completed_at: null,
      completed_by_type: null,
      completed_by_user_id: null,
    });
  });
});

describe('getOnboardingOverview', () => {
  test('should query student_profiles with joins', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: [], error: null, count: 0 });

    await getOnboardingOverview(mock as any);

    expect(mock.from).toHaveBeenCalledWith('student_profiles');
    expect(mock.select).toHaveBeenCalledWith(expect.stringContaining('onboarding_progress'), expect.anything());
  });

  test('should apply batchId filter', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: [], error: null, count: 0 });

    await getOnboardingOverview(mock as any, { batchId: 'batch-1' });

    expect(mock.eq).toHaveBeenCalledWith('batch_id', 'batch-1');
  });

  test('should apply search filter', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: [], error: null, count: 0 });

    await getOnboardingOverview(mock as any, { search: 'john' });

    expect(mock.or).toHaveBeenCalledWith(expect.stringContaining('john'));
  });

  test('should compute total_steps and completed_steps per student', async () => {
    const students = [{
      id: 'sp-1',
      onboarding_progress: [
        { id: 'p1', is_completed: true },
        { id: 'p2', is_completed: false },
        { id: 'p3', is_completed: true },
      ],
    }];
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: students, error: null, count: 1 });

    const result = await getOnboardingOverview(mock as any);

    expect(result.data[0].total_steps).toBe(3);
    expect(result.data[0].completed_steps).toBe(2);
    expect(result.data[0].is_fully_complete).toBe(false);
  });

  test('should filter complete students when completionFilter=complete', async () => {
    const students = [
      { id: 'sp-1', onboarding_progress: [{ is_completed: true }] },
      { id: 'sp-2', onboarding_progress: [{ is_completed: false }] },
    ];
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: students, error: null, count: 2 });

    const result = await getOnboardingOverview(mock as any, { completionFilter: 'complete' });

    expect(result.data.length).toBe(1);
    expect(result.data[0].id).toBe('sp-1');
  });

  test('should filter incomplete students when completionFilter=incomplete', async () => {
    const students = [
      { id: 'sp-1', onboarding_progress: [{ is_completed: true }] },
      { id: 'sp-2', onboarding_progress: [{ is_completed: false }] },
    ];
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: students, error: null, count: 2 });

    const result = await getOnboardingOverview(mock as any, { completionFilter: 'incomplete' });

    expect(result.data.length).toBe(1);
    expect(result.data[0].id).toBe('sp-2');
  });
});

describe('bulkMarkOnboardingStepComplete', () => {
  test('should update multiple student progress rows', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: [{ id: 'p1' }, { id: 'p2' }], error: null });

    const result = await bulkMarkOnboardingStepComplete(
      ['sp-1', 'sp-2'],
      'step-def-1',
      'admin-1',
      mock as any
    );

    expect(mock.in).toHaveBeenCalledWith('student_profile_id', ['sp-1', 'sp-2']);
    expect(mock.eq).toHaveBeenCalledWith('step_definition_id', 'step-def-1');
    expect(mock.update).toHaveBeenCalledWith(
      expect.objectContaining({
        is_completed: true,
        completed_by_type: 'admin',
        completed_by_user_id: 'admin-1',
      })
    );
    expect(result).toHaveLength(2);
  });
});
