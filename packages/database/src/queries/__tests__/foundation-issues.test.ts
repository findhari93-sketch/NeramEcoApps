import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  createFoundationIssue,
  resolveFoundationIssue,
  confirmFoundationIssue,
  reopenFoundationIssue,
  cleanupIssueScreenshots,
  getExpiredAwaitingIssues,
  getStudentFoundationIssues,
  getAllFoundationIssues,
} from '../nexus/foundation';

/**
 * Unit tests for foundation issue query functions (enterprise ticket system).
 *
 * Uses a chainable mock Supabase client to verify that
 * each function builds the correct query and handles responses.
 */

// ─── Chainable Mock Supabase Client ───

function createChainableMock() {
  let resolvedValue: any = { data: null, error: null };

  const chain: any = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn(() => Promise.resolve(resolvedValue)),
    then: vi.fn((resolve: any) => resolve(resolvedValue)),
    storage: {
      from: vi.fn(() => ({
        remove: vi.fn(() => Promise.resolve({ error: null })),
        upload: vi.fn(() => Promise.resolve({ error: null })),
      })),
    },
  };

  // Make chainable methods return the chain
  for (const method of [
    'select', 'eq', 'lt', 'order', 'insert', 'update', 'delete',
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
// createFoundationIssue
// ============================================

describe('createFoundationIssue', () => {
  test('should insert with category, page_url, and screenshot_urls', async () => {
    const mockIssue = {
      id: 'issue-1',
      student_id: 'student-1',
      chapter_id: null,
      title: 'Bug report',
      description: 'Something broke',
      category: 'bug',
      page_url: '/student/library',
      screenshot_urls: ['student-1/123.jpg'],
      status: 'open',
      ticket_number: 'NXS-0001',
    };
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: mockIssue, error: null });

    const result = await createFoundationIssue(
      {
        student_id: 'student-1',
        title: 'Bug report',
        description: 'Something broke',
        category: 'bug',
        page_url: '/student/library',
        screenshot_urls: ['student-1/123.jpg'],
      },
      mock
    );

    // Verify it called .from('nexus_foundation_issues').insert(...)
    expect(mock.from).toHaveBeenCalledWith('nexus_foundation_issues');
    expect(mock.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        student_id: 'student-1',
        chapter_id: null,
        category: 'bug',
        page_url: '/student/library',
        screenshot_urls: ['student-1/123.jpg'],
      })
    );

    expect(result.id).toBe('issue-1');
    expect(result.category).toBe('bug');

    // Should also log creation activity
    expect(mock.from).toHaveBeenCalledWith('nexus_foundation_issue_activity');
  });

  test('should default category to "other" when not provided', async () => {
    const mockIssue = {
      id: 'issue-2',
      student_id: 'student-1',
      title: 'Test',
      description: '',
      category: 'other',
      status: 'open',
      ticket_number: 'NXS-0002',
    };
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: mockIssue, error: null });

    await createFoundationIssue(
      {
        student_id: 'student-1',
        title: 'Test',
        description: '',
      },
      mock
    );

    expect(mock.insert).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'other' })
    );
  });

  test('should allow chapter_id to be optional (standalone ticket)', async () => {
    const mockIssue = {
      id: 'issue-3',
      student_id: 'student-1',
      chapter_id: null,
      title: 'General issue',
      description: '',
      status: 'open',
    };
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: mockIssue, error: null });

    await createFoundationIssue(
      {
        student_id: 'student-1',
        title: 'General issue',
        description: '',
      },
      mock
    );

    expect(mock.insert).toHaveBeenCalledWith(
      expect.objectContaining({ chapter_id: null })
    );
  });
});

// ============================================
// resolveFoundationIssue
// ============================================

describe('resolveFoundationIssue', () => {
  test('should set status to awaiting_confirmation with auto_close_at', async () => {
    const mockIssue = {
      id: 'issue-1',
      status: 'awaiting_confirmation',
      resolution_note: 'Fixed it',
      resolved_by: 'teacher-1',
      auto_close_at: new Date(Date.now() + 3 * 86400000).toISOString(),
    };
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: mockIssue, error: null });

    const result = await resolveFoundationIssue(
      'issue-1',
      'teacher-1',
      'Fixed it',
      mock
    );

    expect(mock.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'awaiting_confirmation',
        resolution_note: 'Fixed it',
        resolved_by: 'teacher-1',
      })
    );

    // Should set auto_close_at ~3 days from now
    const updateCall = mock.update.mock.calls[0][0];
    expect(updateCall.auto_close_at).toBeDefined();
    const autoClose = new Date(updateCall.auto_close_at);
    const diffDays = (autoClose.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(2.9);
    expect(diffDays).toBeLessThan(3.1);

    // Should log activity with new_status: 'awaiting_confirmation'
    expect(mock.from).toHaveBeenCalledWith('nexus_foundation_issue_activity');
    expect(mock.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'resolved',
        new_status: 'awaiting_confirmation',
      })
    );
  });
});

// ============================================
// confirmFoundationIssue
// ============================================

describe('confirmFoundationIssue', () => {
  test('should set status to closed and clear auto_close_at', async () => {
    const mockIssue = {
      id: 'issue-1',
      status: 'closed',
      auto_close_at: null,
    };
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: mockIssue, error: null });

    const result = await confirmFoundationIssue('issue-1', 'student-1', mock);

    expect(mock.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'closed',
        auto_close_at: null,
      })
    );

    // Should log 'confirmed' activity
    expect(mock.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'confirmed',
        old_status: 'awaiting_confirmation',
        new_status: 'closed',
      })
    );
  });
});

// ============================================
// reopenFoundationIssue
// ============================================

describe('reopenFoundationIssue', () => {
  test('should set status to open and clear resolution fields', async () => {
    const mockIssue = {
      id: 'issue-1',
      status: 'open',
      resolved_by: null,
      resolved_at: null,
      resolution_note: null,
      auto_close_at: null,
    };
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: mockIssue, error: null });

    await reopenFoundationIssue('issue-1', 'student-1', 'Still broken', mock);

    expect(mock.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'open',
        resolved_by: null,
        resolved_at: null,
        resolution_note: null,
        auto_close_at: null,
      })
    );

    // Should log 'reopened' activity with reason
    expect(mock.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'reopened',
        old_status: 'awaiting_confirmation',
        new_status: 'open',
        reason: 'Still broken',
      })
    );
  });
});

// ============================================
// cleanupIssueScreenshots
// ============================================

describe('cleanupIssueScreenshots', () => {
  test('should delete files from storage and clear screenshot_urls', async () => {
    const removeMock = vi.fn(() => Promise.resolve({ error: null }));
    const mockClient: any = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(() =>
        Promise.resolve({
          data: { screenshot_urls: ['student-1/a.jpg', 'student-1/b.jpg'] },
          error: null,
        })
      ),
      storage: {
        from: vi.fn(() => ({ remove: removeMock })),
      },
    };

    // Make eq chainable
    mockClient.eq = vi.fn().mockReturnValue(mockClient);
    mockClient.select = vi.fn().mockReturnValue(mockClient);
    mockClient.update = vi.fn().mockReturnValue(mockClient);
    mockClient.from = vi.fn().mockReturnValue(mockClient);

    await cleanupIssueScreenshots('issue-1', mockClient);

    // Should have called storage.from('issue-screenshots').remove(...)
    expect(mockClient.storage.from).toHaveBeenCalledWith('issue-screenshots');
    expect(removeMock).toHaveBeenCalledWith(['student-1/a.jpg', 'student-1/b.jpg']);
  });

  test('should skip cleanup when no screenshots exist', async () => {
    const removeMock = vi.fn();
    const mockClient: any = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(() =>
        Promise.resolve({
          data: { screenshot_urls: null },
          error: null,
        })
      ),
      storage: {
        from: vi.fn(() => ({ remove: removeMock })),
      },
    };
    mockClient.eq = vi.fn().mockReturnValue(mockClient);
    mockClient.select = vi.fn().mockReturnValue(mockClient);
    mockClient.from = vi.fn().mockReturnValue(mockClient);

    await cleanupIssueScreenshots('issue-1', mockClient);

    // Should NOT have called remove
    expect(removeMock).not.toHaveBeenCalled();
  });
});

// ============================================
// getExpiredAwaitingIssues
// ============================================

describe('getExpiredAwaitingIssues', () => {
  test('should query for awaiting_confirmation issues past auto_close_at', async () => {
    const mockIssues = [
      { id: 'issue-1', status: 'awaiting_confirmation', auto_close_at: '2026-03-28T00:00:00Z' },
      { id: 'issue-2', status: 'awaiting_confirmation', auto_close_at: '2026-03-29T00:00:00Z' },
    ];
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: mockIssues, error: null });

    const result = await getExpiredAwaitingIssues(mock);

    expect(mock.from).toHaveBeenCalledWith('nexus_foundation_issues');
    expect(mock.eq).toHaveBeenCalledWith('status', 'awaiting_confirmation');
    expect(mock.lt).toHaveBeenCalledWith('auto_close_at', expect.any(String));
    expect(result).toHaveLength(2);
  });
});

// ============================================
// getStudentFoundationIssues
// ============================================

describe('getStudentFoundationIssues', () => {
  test('should query issues for a specific student', async () => {
    const mockIssues = [
      {
        id: 'issue-1',
        student_id: 'student-1',
        ticket_number: 'NXS-0001',
        category: 'bug',
        student: { name: 'Test Student', avatar_url: null },
        chapter: { title: 'Ch 1', chapter_number: 1 },
        section: null,
        resolver: null,
        assignee: null,
        assigner: null,
      },
    ];
    const { mock, setResolvedValue } = createChainableMock();
    // Override then to return array (not single)
    mock.then = vi.fn((resolve: any) => resolve({ data: mockIssues, error: null }));

    const result = await getStudentFoundationIssues('student-1', mock);

    expect(mock.from).toHaveBeenCalledWith('nexus_foundation_issues');
    expect(mock.eq).toHaveBeenCalledWith('student_id', 'student-1');
    expect(mock.order).toHaveBeenCalledWith('created_at', { ascending: false });
  });
});

// ============================================
// getAllFoundationIssues
// ============================================

describe('getAllFoundationIssues', () => {
  test('should apply status filter when provided', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    mock.then = vi.fn((resolve: any) => resolve({ data: [], error: null }));

    await getAllFoundationIssues({ status: 'open' }, mock);

    expect(mock.from).toHaveBeenCalledWith('nexus_foundation_issues');
    expect(mock.eq).toHaveBeenCalledWith('status', 'open');
  });

  test('should apply assigned_to filter when provided', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    mock.then = vi.fn((resolve: any) => resolve({ data: [], error: null }));

    await getAllFoundationIssues({ assigned_to: 'teacher-1' }, mock);

    expect(mock.eq).toHaveBeenCalledWith('assigned_to', 'teacher-1');
  });
});
