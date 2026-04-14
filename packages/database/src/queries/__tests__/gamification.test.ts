import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  recordPointEvent,
  getStudentPoints,
  getStudentPointBreakdown,
  updateStudentStreak,
  getStudentStreak,
  checkStreakMilestones,
  logActivity,
  getStudentActivityLog,
  getAllBadgeDefinitions,
  getStudentBadges,
  getBadgeCatalogForStudent,
  awardBadge,
  getUnnotifiedBadges,
  markBadgesNotified,
  recordGamificationEvent,
} from '../nexus/gamification';

/**
 * Unit tests for gamification query functions.
 *
 * Uses a chainable mock Supabase client to verify that
 * each function builds the correct query and handles responses.
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
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn(() => Promise.resolve(resolvedValue)),
    maybeSingle: vi.fn(() => Promise.resolve(resolvedValue)),
    then: vi.fn((resolve: any) => resolve(resolvedValue)),
  };

  for (const method of [
    'range', 'select', 'eq', 'delete', 'limit', 'order',
    'upsert', 'insert', 'update', 'in', 'gte', 'lte', 'neq',
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
// recordPointEvent
// ============================================

describe('recordPointEvent', () => {
  test('should upsert into gamification_point_events with correct fields', async () => {
    const mockResult = { id: 'pe-1', student_id: 's1', points: 10 };
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: mockResult, error: null });

    const result = await recordPointEvent(
      {
        student_id: 's1',
        classroom_id: 'c1',
        batch_id: 'b1',
        event_type: 'class_attended',
        points: 10,
        source_id: 'att_s1_2026-03-27',
        metadata: { lesson: 'math' },
        event_date: '2026-03-27',
      },
      mock as any
    );

    expect(mock.from).toHaveBeenCalledWith('gamification_point_events');
    expect(mock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        student_id: 's1',
        classroom_id: 'c1',
        batch_id: 'b1',
        event_type: 'class_attended',
        points: 10,
        source_id: 'att_s1_2026-03-27',
        metadata: { lesson: 'math' },
        event_date: '2026-03-27',
      }),
      { onConflict: 'student_id,event_type,source_id', ignoreDuplicates: true }
    );
    expect(result).toEqual(mockResult);
  });

  test('should default batch_id to null and metadata to {} when not provided', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: { id: 'pe-2' }, error: null });

    await recordPointEvent(
      {
        student_id: 's1',
        classroom_id: 'c1',
        event_type: 'class_attended',
        points: 5,
        source_id: 'src-1',
      },
      mock as any
    );

    expect(mock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        batch_id: null,
        metadata: {},
      }),
      expect.any(Object)
    );
  });

  test('should silently ignore duplicate key errors (23505)', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key value' } });

    const result = await recordPointEvent(
      {
        student_id: 's1',
        classroom_id: 'c1',
        event_type: 'class_attended',
        points: 10,
        source_id: 'dup-source',
      },
      mock as any
    );

    // Should not throw, returns null
    expect(result).toBeNull();
  });

  test('should silently ignore errors with "duplicate" in message', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: null, error: { code: 'OTHER', message: 'duplicate entry found' } });

    const result = await recordPointEvent(
      {
        student_id: 's1',
        classroom_id: 'c1',
        event_type: 'class_attended',
        points: 10,
        source_id: 'dup-source',
      },
      mock as any
    );

    expect(result).toBeNull();
  });

  test('should throw on non-duplicate errors', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: null, error: { code: '42P01', message: 'relation does not exist' } });

    await expect(
      recordPointEvent(
        {
          student_id: 's1',
          classroom_id: 'c1',
          event_type: 'class_attended',
          points: 10,
          source_id: 'src-1',
        },
        mock as any
      )
    ).rejects.toEqual({ code: '42P01', message: 'relation does not exist' });
  });
});

// ============================================
// getStudentPoints
// ============================================

describe('getStudentPoints', () => {
  test('should sum all points for a student with no filters', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({
      data: [{ points: 10 }, { points: 25 }, { points: 5 }],
      error: null,
    });

    const total = await getStudentPoints('s1', undefined, mock as any);

    expect(mock.from).toHaveBeenCalledWith('gamification_point_events');
    expect(mock.select).toHaveBeenCalledWith('points');
    expect(mock.eq).toHaveBeenCalledWith('student_id', 's1');
    expect(total).toBe(40);
  });

  test('should apply date range filters when from/to provided', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: [{ points: 15 }], error: null });

    const total = await getStudentPoints(
      's1',
      { from: '2026-03-01', to: '2026-03-31' },
      mock as any
    );

    expect(mock.gte).toHaveBeenCalledWith('event_date', '2026-03-01');
    expect(mock.lte).toHaveBeenCalledWith('event_date', '2026-03-31');
    expect(total).toBe(15);
  });

  test('should apply classroom filter when classroomId provided', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: [{ points: 20 }], error: null });

    await getStudentPoints('s1', { classroomId: 'c1' }, mock as any);

    // eq called twice: once for student_id, once for classroom_id
    expect(mock.eq).toHaveBeenCalledWith('classroom_id', 'c1');
  });

  test('should return 0 when no point events exist', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: [], error: null });

    const total = await getStudentPoints('s1', undefined, mock as any);
    expect(total).toBe(0);
  });

  test('should return 0 when data is null', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: null, error: null });

    const total = await getStudentPoints('s1', undefined, mock as any);
    expect(total).toBe(0);
  });

  test('should throw on database error', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: null, error: { message: 'DB error' } });

    await expect(getStudentPoints('s1', undefined, mock as any)).rejects.toEqual({
      message: 'DB error',
    });
  });
});

// ============================================
// getStudentPointBreakdown
// ============================================

describe('getStudentPointBreakdown', () => {
  test('should aggregate points by event_type', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({
      data: [
        { event_type: 'class_attended', points: 10 },
        { event_type: 'class_attended', points: 10 },
        { event_type: 'checklist_item_completed', points: 5 },
        { event_type: 'class_attended', points: 10 },
        { event_type: 'checklist_item_completed', points: 5 },
      ],
      error: null,
    });

    const breakdown = await getStudentPointBreakdown('s1', '2026-03-01', '2026-03-31', mock as any);

    expect(mock.from).toHaveBeenCalledWith('gamification_point_events');
    expect(mock.eq).toHaveBeenCalledWith('student_id', 's1');
    expect(mock.gte).toHaveBeenCalledWith('event_date', '2026-03-01');
    expect(mock.lte).toHaveBeenCalledWith('event_date', '2026-03-31');

    expect(breakdown).toEqual(
      expect.arrayContaining([
        { event_type: 'class_attended', total_points: 30, count: 3 },
        { event_type: 'checklist_item_completed', total_points: 10, count: 2 },
      ])
    );
    expect(breakdown).toHaveLength(2);
  });

  test('should return empty array when no events exist', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: [], error: null });

    const breakdown = await getStudentPointBreakdown('s1', '2026-01-01', '2026-01-31', mock as any);
    expect(breakdown).toEqual([]);
  });

  test('should throw on database error', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: null, error: { message: 'timeout' } });

    await expect(
      getStudentPointBreakdown('s1', '2026-01-01', '2026-01-31', mock as any)
    ).rejects.toEqual({ message: 'timeout' });
  });
});

// ============================================
// updateStudentStreak
// ============================================

describe('updateStudentStreak', () => {
  test('first ever activity: should INSERT a new streak row with streak=1', async () => {
    const createdStreak = {
      student_id: 's1',
      current_streak: 1,
      longest_streak: 1,
      last_active_date: '2026-03-27',
      streak_started_date: '2026-03-27',
    };

    // First call (select existing) returns null, second call (insert) returns created
    let callCount = 0;
    const { mock } = createChainableMock();

    // Override single to return different values on successive calls
    mock.single = vi.fn(() => {
      callCount++;
      if (callCount === 1) {
        // No existing streak
        return Promise.resolve({ data: null, error: { code: 'PGRST116', message: 'Not found' } });
      }
      // Insert result
      return Promise.resolve({ data: createdStreak, error: null });
    });

    const result = await updateStudentStreak('s1', '2026-03-27', mock as any);

    expect(mock.from).toHaveBeenCalledWith('gamification_student_streaks');
    expect(mock.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        student_id: 's1',
        current_streak: 1,
        longest_streak: 1,
        last_active_date: '2026-03-27',
        streak_started_date: '2026-03-27',
      })
    );
    expect(result).toEqual(createdStreak);
  });

  test('consecutive day: should extend streak by 1', async () => {
    const existingStreak = {
      student_id: 's1',
      current_streak: 5,
      longest_streak: 10,
      last_active_date: '2026-03-26',
      streak_started_date: '2026-03-22',
    };
    const updatedStreak = {
      ...existingStreak,
      current_streak: 6,
      last_active_date: '2026-03-27',
    };

    let callCount = 0;
    const { mock } = createChainableMock();

    mock.single = vi.fn(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ data: existingStreak, error: null });
      }
      return Promise.resolve({ data: updatedStreak, error: null });
    });

    const result = await updateStudentStreak('s1', '2026-03-27', mock as any);

    expect(mock.update).toHaveBeenCalledWith(
      expect.objectContaining({
        current_streak: 6,
        longest_streak: 10, // existing longest is higher
        last_active_date: '2026-03-27',
        streak_started_date: '2026-03-22', // unchanged
      })
    );
    expect(result).toEqual(updatedStreak);
  });

  test('consecutive day: should update longest_streak if new streak exceeds it', async () => {
    const existingStreak = {
      student_id: 's1',
      current_streak: 10,
      longest_streak: 10,
      last_active_date: '2026-03-26',
      streak_started_date: '2026-03-17',
    };
    const updatedStreak = {
      ...existingStreak,
      current_streak: 11,
      longest_streak: 11,
      last_active_date: '2026-03-27',
    };

    let callCount = 0;
    const { mock } = createChainableMock();

    mock.single = vi.fn(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ data: existingStreak, error: null });
      }
      return Promise.resolve({ data: updatedStreak, error: null });
    });

    const result = await updateStudentStreak('s1', '2026-03-27', mock as any);

    expect(mock.update).toHaveBeenCalledWith(
      expect.objectContaining({
        current_streak: 11,
        longest_streak: 11,
      })
    );
    expect(result).toEqual(updatedStreak);
  });

  test('gap in activity: should reset streak to 1', async () => {
    const existingStreak = {
      student_id: 's1',
      current_streak: 5,
      longest_streak: 12,
      last_active_date: '2026-03-24', // 3-day gap to 2026-03-27
      streak_started_date: '2026-03-20',
    };
    const updatedStreak = {
      student_id: 's1',
      current_streak: 1,
      longest_streak: 12,
      last_active_date: '2026-03-27',
      streak_started_date: '2026-03-27',
    };

    let callCount = 0;
    const { mock } = createChainableMock();

    mock.single = vi.fn(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ data: existingStreak, error: null });
      }
      return Promise.resolve({ data: updatedStreak, error: null });
    });

    const result = await updateStudentStreak('s1', '2026-03-27', mock as any);

    expect(mock.update).toHaveBeenCalledWith(
      expect.objectContaining({
        current_streak: 1,
        longest_streak: 12, // unchanged, previous longest was higher
        last_active_date: '2026-03-27',
        streak_started_date: '2026-03-27', // reset to today
      })
    );
    expect(result).toEqual(updatedStreak);
  });

  test('same day (no-op): should return existing streak without update', async () => {
    const existingStreak = {
      student_id: 's1',
      current_streak: 3,
      longest_streak: 8,
      last_active_date: '2026-03-27',
      streak_started_date: '2026-03-25',
    };

    const { mock } = createChainableMock();

    mock.single = vi.fn(() =>
      Promise.resolve({ data: existingStreak, error: null })
    );

    const result = await updateStudentStreak('s1', '2026-03-27', mock as any);

    // Should NOT call insert or update — same day no-op
    expect(mock.insert).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
    expect(result).toEqual(existingStreak);
  });
});

// ============================================
// getStudentStreak
// ============================================

describe('getStudentStreak', () => {
  test('should return streak when found', async () => {
    const mockStreak = {
      student_id: 's1',
      current_streak: 5,
      longest_streak: 10,
      last_active_date: '2026-03-27',
    };
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: mockStreak, error: null });

    const result = await getStudentStreak('s1', mock as any);

    expect(mock.from).toHaveBeenCalledWith('gamification_student_streaks');
    expect(mock.eq).toHaveBeenCalledWith('student_id', 's1');
    expect(result).toEqual(mockStreak);
  });

  test('should return null when no streak exists (PGRST116)', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: null, error: { code: 'PGRST116', message: 'Not found' } });

    const result = await getStudentStreak('s-new', mock as any);
    expect(result).toBeNull();
  });

  test('should throw on non-PGRST116 errors', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: null, error: { code: '42P01', message: 'table not found' } });

    await expect(getStudentStreak('s1', mock as any)).rejects.toEqual({
      code: '42P01',
      message: 'table not found',
    });
  });
});

// ============================================
// checkStreakMilestones
// ============================================

describe('checkStreakMilestones', () => {
  test('should award 25 bonus points at 7-day milestone', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: { id: 'pe-m7' }, error: null });

    await checkStreakMilestones('s1', 'c1', 'b1', 7, mock as any);

    // Should call upsert for point event (recordPointEvent)
    expect(mock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        student_id: 's1',
        event_type: 'streak_milestone',
        points: 25,
        source_id: 'streak_7_s1',
        metadata: { streak_length: 7 },
      }),
      expect.any(Object)
    );
    // Should call insert for activity log (logActivity)
    expect(mock.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        student_id: 's1',
        activity_type: 'streak_milestone',
        title: 'Reached 7-day streak! (+25 bonus points)',
      })
    );
  });

  test('should award 100 bonus points at 30-day milestone', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: { id: 'pe-m30' }, error: null });

    await checkStreakMilestones('s1', 'c1', null, 30, mock as any);

    expect(mock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'streak_milestone',
        points: 100,
        source_id: 'streak_30_s1',
        metadata: { streak_length: 30 },
      }),
      expect.any(Object)
    );
  });

  test('should award 300 bonus points at 90-day milestone', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: { id: 'pe-m90' }, error: null });

    await checkStreakMilestones('s1', 'c1', null, 90, mock as any);

    expect(mock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'streak_milestone',
        points: 300,
        source_id: 'streak_90_s1',
      }),
      expect.any(Object)
    );
  });

  test('should NOT award any points for non-milestone streak values', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: null, error: null });

    await checkStreakMilestones('s1', 'c1', null, 5, mock as any);

    expect(mock.upsert).not.toHaveBeenCalled();
    expect(mock.insert).not.toHaveBeenCalled();
  });

  test('should NOT award points for streak=8 (only exact milestone match)', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: null, error: null });

    await checkStreakMilestones('s1', 'c1', null, 8, mock as any);

    expect(mock.upsert).not.toHaveBeenCalled();
  });
});

// ============================================
// logActivity
// ============================================

describe('logActivity', () => {
  test('should insert activity log with correct fields', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: null, error: null });

    await logActivity('s1', 'class_attended', 'Attended Math class', { lesson: 'algebra' }, mock as any);

    expect(mock.from).toHaveBeenCalledWith('gamification_student_activity_log');
    expect(mock.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        student_id: 's1',
        activity_type: 'class_attended',
        title: 'Attended Math class',
        metadata: { lesson: 'algebra' },
      })
    );
  });

  test('should default metadata to {} when not provided', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: null, error: null });

    await logActivity('s1', 'badge_earned', 'Earned a badge', undefined, mock as any);

    expect(mock.insert).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: {} })
    );
  });

  test('should throw on database error', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: null, error: { message: 'insert failed' } });

    await expect(
      logActivity('s1', 'class_attended', 'Test', undefined, mock as any)
    ).rejects.toEqual({ message: 'insert failed' });
  });
});

// ============================================
// getStudentActivityLog
// ============================================

describe('getStudentActivityLog', () => {
  test('should fetch activity log ordered by activity_date DESC with default limit', async () => {
    const mockLogs = [
      { id: 'a1', activity_type: 'class_attended', title: 'Math' },
      { id: 'a2', activity_type: 'badge_earned', title: 'First Step' },
    ];
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: mockLogs, error: null });

    const result = await getStudentActivityLog('s1', undefined, mock as any);

    expect(mock.from).toHaveBeenCalledWith('gamification_student_activity_log');
    expect(mock.eq).toHaveBeenCalledWith('student_id', 's1');
    expect(mock.order).toHaveBeenCalledWith('activity_date', { ascending: false });
    expect(mock.limit).toHaveBeenCalledWith(20); // default limit
    expect(result).toEqual(mockLogs);
  });

  test('should use custom limit when provided', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: [], error: null });

    await getStudentActivityLog('s1', 5, mock as any);

    expect(mock.limit).toHaveBeenCalledWith(5);
  });

  test('should throw on database error', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: null, error: { message: 'query failed' } });

    await expect(getStudentActivityLog('s1', 10, mock as any)).rejects.toEqual({
      message: 'query failed',
    });
  });
});

// ============================================
// getAllBadgeDefinitions
// ============================================

describe('getAllBadgeDefinitions', () => {
  test('should fetch active badge definitions ordered by sort_order', async () => {
    const mockBadges = [
      { id: 'first_step', display_name: 'First Step', sort_order: 1 },
      { id: 'never_miss', display_name: 'Never Miss', sort_order: 2 },
    ];
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: mockBadges, error: null });

    const result = await getAllBadgeDefinitions(mock as any);

    expect(mock.from).toHaveBeenCalledWith('gamification_badge_definitions');
    expect(mock.eq).toHaveBeenCalledWith('is_active', true);
    expect(mock.order).toHaveBeenCalledWith('sort_order');
    expect(result).toEqual(mockBadges);
  });

  test('should return empty array when no badges defined', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: null, error: null });

    const result = await getAllBadgeDefinitions(mock as any);
    expect(result).toEqual([]);
  });

  test('should throw on database error', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: null, error: { message: 'connection refused' } });

    await expect(getAllBadgeDefinitions(mock as any)).rejects.toEqual({
      message: 'connection refused',
    });
  });
});

// ============================================
// getStudentBadges
// ============================================

describe('getStudentBadges', () => {
  test('should fetch badges with joined badge definitions', async () => {
    const mockBadges = [
      { id: 'sb-1', badge_id: 'first_step', badge: { id: 'first_step', display_name: 'First Step' } },
    ];
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: mockBadges, error: null });

    const result = await getStudentBadges('s1', mock as any);

    expect(mock.from).toHaveBeenCalledWith('gamification_student_badges');
    expect(mock.select).toHaveBeenCalledWith(
      '*, badge:gamification_badge_definitions!gamification_student_badges_badge_id_fkey(*)'
    );
    expect(mock.eq).toHaveBeenCalledWith('student_id', 's1');
    expect(mock.order).toHaveBeenCalledWith('earned_at', { ascending: false });
    expect(result).toEqual(mockBadges);
  });

  test('should return empty array when student has no badges', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: [], error: null });

    const result = await getStudentBadges('s-new', mock as any);
    expect(result).toEqual([]);
  });
});

// ============================================
// getBadgeCatalogForStudent
// ============================================

describe('getBadgeCatalogForStudent', () => {
  test('should merge definitions with earned status', async () => {
    // getBadgeCatalogForStudent calls Promise.all([getAllBadgeDefinitions, getStudentBadges])
    // internally. Since both sub-functions share a single mock client with Promise.all,
    // we use separate mock clients — one per internal call — by creating a mock that
    // returns a new chainable per from() call.

    const definitions = [
      { id: 'first_step', display_name: 'First Step', sort_order: 1 },
      { id: 'never_miss', display_name: 'Never Miss', sort_order: 2 },
      { id: 'iron_streak', display_name: 'Iron Streak', sort_order: 3 },
    ];

    const earnedBadges = [
      { id: 'sb-1', badge_id: 'first_step', earned_at: '2026-03-15T10:00:00Z', badge: definitions[0] },
    ];

    // Build a proxy mock that returns a fresh chainable mock per from() call,
    // resolving with data based on the table name.
    function createTableAwareMock() {
      const tableDataMap: Record<string, any> = {
        gamification_badge_definitions: { data: definitions, error: null },
        gamification_student_badges: { data: earnedBadges, error: null },
      };

      const proxy: any = {
        from: vi.fn((table: string) => {
          const resolved = tableDataMap[table] || { data: null, error: null };
          const innerChain: any = {};
          const methods = ['select', 'eq', 'neq', 'in', 'gte', 'lte', 'or', 'order', 'limit', 'insert', 'update', 'upsert', 'delete'];
          for (const m of methods) {
            innerChain[m] = vi.fn(() => innerChain);
          }
          innerChain.single = vi.fn(() => Promise.resolve(resolved));
          innerChain.maybeSingle = vi.fn(() => Promise.resolve(resolved));
          innerChain.then = vi.fn((resolve: any) => resolve(resolved));
          return innerChain;
        }),
      };
      return proxy;
    }

    const mock = createTableAwareMock();

    const result = await getBadgeCatalogForStudent('s1', mock as any);

    // Should have 3 entries (one per definition)
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ id: 'first_step', earned: true, earned_at: '2026-03-15T10:00:00Z' });
    expect(result[1]).toMatchObject({ id: 'never_miss', earned: false, earned_at: null });
    expect(result[2]).toMatchObject({ id: 'iron_streak', earned: false, earned_at: null });
  });
});

// ============================================
// awardBadge
// ============================================

describe('awardBadge', () => {
  test('should return true when badge is newly awarded', async () => {
    // We need multiple from() calls:
    // 1. insert into gamification_student_badges (success)
    // 2. getAllBadgeDefinitions (for logging)
    // 3. logActivity insert
    let fromCallCount = 0;
    const { mock } = createChainableMock();

    const badgeDefs = [
      { id: 'first_step', display_name: 'First Step', rarity_tier: 'common' },
    ];

    mock.then = vi.fn((resolve: any) => {
      fromCallCount++;
      if (fromCallCount === 1) {
        // insert into student_badges — success
        return resolve({ data: null, error: null });
      }
      if (fromCallCount === 2) {
        // getAllBadgeDefinitions
        return resolve({ data: badgeDefs, error: null });
      }
      // logActivity insert
      return resolve({ data: null, error: null });
    });

    const result = await awardBadge('s1', 'first_step', { reason: 'attended' }, mock as any);

    expect(mock.from).toHaveBeenCalledWith('gamification_student_badges');
    expect(mock.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        student_id: 's1',
        badge_id: 'first_step',
        earned_context: { reason: 'attended' },
      })
    );
    expect(result).toBe(true);
  });

  test('should return false when badge already earned (duplicate 23505)', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key' } });

    const result = await awardBadge('s1', 'first_step', undefined, mock as any);

    expect(result).toBe(false);
  });

  test('should return false when badge already earned (duplicate message)', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: null, error: { code: 'OTHER', message: 'duplicate entry' } });

    const result = await awardBadge('s1', 'first_step', undefined, mock as any);

    expect(result).toBe(false);
  });

  test('should throw on non-duplicate errors', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: null, error: { code: '42P01', message: 'table missing' } });

    await expect(awardBadge('s1', 'bad_badge', undefined, mock as any)).rejects.toEqual({
      code: '42P01',
      message: 'table missing',
    });
  });
});

// ============================================
// getUnnotifiedBadges
// ============================================

describe('getUnnotifiedBadges', () => {
  test('should fetch badges where notified=false with joined definitions', async () => {
    const mockBadges = [
      { id: 'sb-1', badge_id: 'first_step', notified: false, badge: { display_name: 'First Step' } },
    ];
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: mockBadges, error: null });

    const result = await getUnnotifiedBadges('s1', mock as any);

    expect(mock.from).toHaveBeenCalledWith('gamification_student_badges');
    expect(mock.eq).toHaveBeenCalledWith('student_id', 's1');
    expect(mock.eq).toHaveBeenCalledWith('notified', false);
    expect(mock.order).toHaveBeenCalledWith('earned_at', { ascending: false });
    expect(result).toEqual(mockBadges);
  });

  test('should return empty array when all badges are notified', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: [], error: null });

    const result = await getUnnotifiedBadges('s1', mock as any);
    expect(result).toEqual([]);
  });
});

// ============================================
// markBadgesNotified
// ============================================

describe('markBadgesNotified', () => {
  test('should update notified=true for given badge_ids and student', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: null, error: null });

    await markBadgesNotified('s1', ['first_step', 'never_miss'], mock as any);

    expect(mock.from).toHaveBeenCalledWith('gamification_student_badges');
    expect(mock.update).toHaveBeenCalledWith({ notified: true });
    expect(mock.eq).toHaveBeenCalledWith('student_id', 's1');
    expect(mock.in).toHaveBeenCalledWith('badge_id', ['first_step', 'never_miss']);
  });

  test('should throw on database error', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: null, error: { message: 'update failed' } });

    await expect(
      markBadgesNotified('s1', ['first_step'], mock as any)
    ).rejects.toEqual({ message: 'update failed' });
  });
});

// ============================================
// recordGamificationEvent
// ============================================

describe('recordGamificationEvent', () => {
  test('should call recordPointEvent, updateStudentStreak, checkStreakMilestones, and logActivity', async () => {
    // This convenience function chains 4 operations.
    // We simulate all succeeding via the mock.
    let callIndex = 0;
    const { mock } = createChainableMock();

    const today = new Date().toISOString().split('T')[0];
    const streakData = {
      student_id: 's1',
      current_streak: 3,
      longest_streak: 5,
      last_active_date: today,
      streak_started_date: '2026-03-25',
    };

    mock.single = vi.fn(() => {
      callIndex++;
      if (callIndex === 1) {
        // recordPointEvent → upsert.select.single
        return Promise.resolve({ data: { id: 'pe-1' }, error: null });
      }
      if (callIndex === 2) {
        // updateStudentStreak → select existing streak
        return Promise.resolve({ data: streakData, error: null });
      }
      // Any subsequent single() calls
      return Promise.resolve({ data: null, error: null });
    });

    mock.then = vi.fn((resolve: any) => {
      // logActivity and checkStreakMilestones insert calls resolve via then
      return resolve({ data: null, error: null });
    });

    const result = await recordGamificationEvent(
      {
        student_id: 's1',
        classroom_id: 'c1',
        batch_id: 'b1',
        event_type: 'class_attended',
        points: 10,
        source_id: 'att_s1_2026-03-27',
        activity_type: 'class_attended',
        activity_title: 'Attended Math class',
        metadata: { lesson: 'algebra' },
      },
      mock as any
    );

    expect(result).toHaveProperty('points', 10);
    expect(result).toHaveProperty('streak');
    expect(result.streak.current_streak).toBe(3);

    // Verify the mock was called for multiple tables
    expect(mock.from).toHaveBeenCalledWith('gamification_point_events');
    expect(mock.from).toHaveBeenCalledWith('gamification_student_streaks');
    expect(mock.from).toHaveBeenCalledWith('gamification_student_activity_log');
  });
});
