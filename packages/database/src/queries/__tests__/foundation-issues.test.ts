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
  addIssueComment,
  getIssueActivityLog,
  markIssueSeen,
  startFoundationIssue,
  requestIssueInfo,
  resumeFoundationIssue,
  closeFoundationIssueByStaff,
  getExpiredAutoCloseIssues,
  assignFoundationIssue,
  WAITING_AUTO_CLOSE_DAYS,
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
    in: vi.fn().mockReturnThis(),
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
    'select', 'eq', 'lt', 'in', 'order', 'insert', 'update', 'delete',
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

  // A column the database may not have yet.
  //
  // `context` arrived with result disputes and lives in its own migration. While
  // that migration was unapplied, EVERY ticket creation answered 500, including
  // the report button that has nothing to do with disputes, because the insert
  // named the column whether or not the caller had anything to put in it.
  // PostgREST refuses an unknown column outright (PGRST204), so one feature's
  // pending migration took the whole reporting flow down with it.
  //
  // Naming a key only when there is a value to put in it keeps each optional
  // column's blast radius to the callers that actually use it.
  test('omits context when the caller passes none', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: { id: 'issue-4', status: 'open' }, error: null });

    await createFoundationIssue(
      {
        student_id: 'student-1',
        title: 'Report a problem',
        description: 'The page is blank',
      },
      mock
    );

    // The first insert is the ticket itself; the second is its activity row.
    const payload = mock.insert.mock.calls[0][0];
    expect(Object.keys(payload)).not.toContain('context');
  });

  test('sends context when the caller supplies it', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: { id: 'issue-5', status: 'open' }, error: null });

    await createFoundationIssue(
      {
        student_id: 'student-1',
        title: 'Result query',
        description: 'My percentage looks wrong',
        category: 'result_dispute',
        context: { exam_id: 'exam-1', facts: { marks: 42 } },
      },
      mock
    );

    expect(mock.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        context: { exam_id: 'exam-1', facts: { marks: 42 } },
      })
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
    // One mock value answers both the state read and the update, so this is
    // the ticket as it stands BEFORE the reopen: unowned, awaiting confirmation.
    const mockIssue = {
      id: 'issue-1',
      status: 'awaiting_confirmation',
      assigned_to: null,
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

  test('goes back to the same assignee as in_progress, not to the queue', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: { id: 'issue-1', status: 'closed', assigned_to: 'teacher-1' }, error: null });

    await reopenFoundationIssue('issue-1', 'student-1', 'Back again', mock);

    expect(mock.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'in_progress' }));
    expect(mock.insert).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'reopened', old_status: 'closed', new_status: 'in_progress' })
    );
  });

  test('names resolution_code only when there is one to clear', async () => {
    const withoutCode = createChainableMock();
    withoutCode.setResolvedValue({ data: { id: 'i', status: 'awaiting_confirmation', assigned_to: null }, error: null });
    await reopenFoundationIssue('i', 's', 'x', withoutCode.mock);
    expect(withoutCode.mock.update.mock.calls[0][0]).not.toHaveProperty('resolution_code');

    const withCode = createChainableMock();
    withCode.setResolvedValue({ data: { id: 'i', status: 'closed', assigned_to: null, resolution_code: 'fixed' }, error: null });
    await reopenFoundationIssue('i', 's', 'x', withCode.mock);
    expect(withCode.mock.update.mock.calls[0][0]).toHaveProperty('resolution_code', null);
  });
});

// ============================================
// lifecycle moves
// ============================================

describe('startFoundationIssue', () => {
  test('claims an unowned ticket and tells the student in their thread', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: { id: 'issue-1', status: 'open', assigned_to: null }, error: null });

    await startFoundationIssue('issue-1', 'teacher-1', mock);

    expect(mock.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'in_progress', assigned_to: 'teacher-1', assigned_by: 'teacher-1' })
    );
    expect(mock.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'accepted',
        old_status: 'open',
        new_status: 'in_progress',
        visible_to_student: true,
      })
    );
  });

  test('keeps an existing assignee', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: { id: 'issue-1', status: 'open', assigned_to: 'teacher-2' }, error: null });

    await startFoundationIssue('issue-1', 'teacher-1', mock);

    expect(mock.update.mock.calls[0][0]).not.toHaveProperty('assigned_to');
  });
});

describe('requestIssueInfo', () => {
  test(`waits on the student, closes in ${WAITING_AUTO_CLOSE_DAYS} days, and lights their unread dot`, async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: { id: 'issue-1', status: 'in_progress', assigned_to: 'teacher-1' }, error: null });

    await requestIssueInfo('issue-1', 'teacher-1', 'Which browser?', mock);

    const update = mock.update.mock.calls[0][0];
    expect(update.status).toBe('waiting_on_student');
    expect(update.last_reply_at).toBeDefined();
    const days = (new Date(update.auto_close_at).getTime() - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(WAITING_AUTO_CLOSE_DAYS - 0.1);
    expect(days).toBeLessThan(WAITING_AUTO_CLOSE_DAYS + 0.1);

    expect(mock.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'info_requested',
        reason: 'Which browser?',
        new_status: 'waiting_on_student',
        visible_to_student: true,
      })
    );
  });
});

describe('resumeFoundationIssue', () => {
  test('a student reply hands it back to the assignee and stops the clock', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: { id: 'issue-1', status: 'waiting_on_student', assigned_to: 'teacher-1' }, error: null });

    await resumeFoundationIssue('issue-1', 'student-1', { byStudent: true }, mock);

    expect(mock.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'in_progress', auto_close_at: null }));
    expect(mock.insert).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'student_replied', old_status: 'waiting_on_student', visible_to_student: true })
    );
  });

  test('staff pressing Resume is logged as their move', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: { id: 'issue-1', status: 'waiting_on_student', assigned_to: 'teacher-1' }, error: null });

    await resumeFoundationIssue('issue-1', 'teacher-1', { byStudent: false }, mock);

    expect(mock.insert).toHaveBeenCalledWith(expect.objectContaining({ action: 'marked_in_progress' }));
  });
});

describe('closeFoundationIssueByStaff', () => {
  test('closes with the outcome and note, and no confirmation clock', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: { id: 'issue-1', status: 'in_progress', assigned_to: 'teacher-1' }, error: null });

    await closeFoundationIssueByStaff('issue-1', 'teacher-1', 'duplicate', 'Same as NXS-0100', mock);

    expect(mock.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'closed',
        resolution_code: 'duplicate',
        resolution_note: 'Same as NXS-0100',
        resolved_by: 'teacher-1',
        auto_close_at: null,
      })
    );
    expect(mock.insert).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'closed_by_staff', old_status: 'in_progress', new_status: 'closed' })
    );
  });
});

describe('assignFoundationIssue', () => {
  test('logs the real old status, visible to the student', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: { id: 'issue-1', status: 'waiting_on_student', assigned_to: null }, error: null });

    await assignFoundationIssue('issue-1', 'teacher-2', 'teacher-1', mock);

    expect(mock.insert).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'assigned', old_status: 'waiting_on_student', visible_to_student: true })
    );
  });
});

describe('resolveFoundationIssue outcome', () => {
  test('writes resolution_code when given and the real previous status', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: { id: 'issue-1', status: 'waiting_on_student', assigned_to: 't' }, error: null });

    await resolveFoundationIssue('issue-1', 't', 'Answered on call', mock, 'answered');

    expect(mock.update.mock.calls[0][0]).toHaveProperty('resolution_code', 'answered');
    expect(mock.insert).toHaveBeenCalledWith(expect.objectContaining({ old_status: 'waiting_on_student' }));
  });

  test('never names resolution_code when not given, so an unmigrated database still accepts it', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: { id: 'issue-1', status: 'in_progress', assigned_to: 't' }, error: null });

    await resolveFoundationIssue('issue-1', 't', 'Fixed', mock);

    expect(mock.update.mock.calls[0][0]).not.toHaveProperty('resolution_code');
  });
});

describe('getExpiredAutoCloseIssues', () => {
  test('finds both student-turn statuses past their clock', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: [{ id: 'a' }, { id: 'b' }], error: null });

    const result = await getExpiredAutoCloseIssues(mock);

    expect(mock.in).toHaveBeenCalledWith('status', ['awaiting_confirmation', 'waiting_on_student']);
    expect(mock.lt).toHaveBeenCalledWith('auto_close_at', expect.any(String));
    expect(result).toHaveLength(2);
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

// ============================================
// addIssueComment (the conversation)
// ============================================

describe('addIssueComment', () => {
  test('is visible to the student by default, because a comment is a message', async () => {
    const { mock } = createChainableMock();

    await addIssueComment('issue-1', 'teacher-1', 'Try it again now', undefined, mock);

    expect(mock.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        issue_id: 'issue-1',
        actor_id: 'teacher-1',
        action: 'comment',
        reason: 'Try it again now',
        visible_to_student: true,
      }),
    );
  });

  test('an internal note is written staff-only', async () => {
    const { mock } = createChainableMock();

    await addIssueComment('issue-1', 'teacher-1', 'Same as NXS-0119', { visibleToStudent: false }, mock);

    expect(mock.insert).toHaveBeenCalledWith(
      expect.objectContaining({ visible_to_student: false }),
    );
  });

  test('a visible comment stamps last_reply_at, which is what the badge reads', async () => {
    const { mock } = createChainableMock();

    await addIssueComment('issue-1', 'teacher-1', 'Fixed now', undefined, mock);

    const stamped = mock.update.mock.calls.find((c: any[]) => 'last_reply_at' in (c[0] || {}));
    expect(stamped).toBeTruthy();
    expect(typeof stamped[0].last_reply_at).toBe('string');
  });

  test('an internal note does not stamp last_reply_at: nobody is waiting on it', async () => {
    const { mock } = createChainableMock();

    await addIssueComment('issue-1', 'teacher-1', 'internal', { visibleToStudent: false }, mock);

    const stamped = mock.update.mock.calls.find((c: any[]) => 'last_reply_at' in (c[0] || {}));
    expect(stamped).toBeUndefined();
  });
});

// ============================================
// getIssueActivityLog
// ============================================

describe('getIssueActivityLog', () => {
  test('serves staff the whole log', async () => {
    const { mock } = createChainableMock();
    mock.then = vi.fn((resolve: any) => resolve({ data: [], error: null }));

    await getIssueActivityLog('issue-1', undefined, mock);

    expect(mock.eq).toHaveBeenCalledWith('issue_id', 'issue-1');
    expect(mock.eq).not.toHaveBeenCalledWith('visible_to_student', true);
  });

  test('filters internal rows out of a student payload in the DATABASE, not the UI', async () => {
    const { mock } = createChainableMock();
    mock.then = vi.fn((resolve: any) => resolve({ data: [], error: null }));

    await getIssueActivityLog('issue-1', { visibleToStudentOnly: true }, mock);

    expect(mock.eq).toHaveBeenCalledWith('visible_to_student', true);
  });
});

// ============================================
// markIssueSeen
// ============================================

describe('markIssueSeen', () => {
  test('clears the student mark without touching the staff one', async () => {
    const { mock } = createChainableMock();

    await markIssueSeen('issue-1', 'student', mock);

    const [payload] = mock.update.mock.calls[0];
    expect(payload).toHaveProperty('student_seen_at');
    expect(payload).not.toHaveProperty('staff_seen_at');
    // Reading a ticket is not a change to it.
    expect(payload).not.toHaveProperty('updated_at');
  });

  test('clears the staff mark without touching the student one', async () => {
    const { mock } = createChainableMock();

    await markIssueSeen('issue-1', 'staff', mock);

    const [payload] = mock.update.mock.calls[0];
    expect(payload).toHaveProperty('staff_seen_at');
    expect(payload).not.toHaveProperty('student_seen_at');
  });
});
