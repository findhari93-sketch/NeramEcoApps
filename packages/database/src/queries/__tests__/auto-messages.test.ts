import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  createAutoMessage,
  getPendingAutoMessages,
  getFailedAutoMessages,
  updateAutoMessageResult,
  getAutoMessagesForUser,
  getAutoMessageStats,
} from '../auto-messages';

/**
 * Unit tests for auto-messages query functions.
 *
 * Uses a chainable mock Supabase client to verify that
 * each function builds the correct query and handles responses.
 */

// ─── Chainable Mock Supabase Client ───

function createChainableMock() {
  let resolvedValue: any = { data: null, error: null };

  const chain: any = {};

  const methods = [
    'from', 'select', 'insert', 'update', 'upsert', 'delete',
    'eq', 'neq', 'in', 'gte', 'lte', 'lt', 'not', 'or',
    'order', 'limit', 'single', 'maybeSingle',
  ];

  for (const method of methods) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }

  // Terminal methods resolve
  chain.single = vi.fn(() => Promise.resolve(resolvedValue));
  chain.maybeSingle = vi.fn(() => Promise.resolve(resolvedValue));
  chain.then = vi.fn((resolve: any) => resolve(resolvedValue));

  return {
    mock: chain,
    setResolvedValue: (val: any) => { resolvedValue = val; },
    setData: (data: any) => { resolvedValue = { data, error: null }; },
    setError: (error: any) => { resolvedValue = { data: null, error }; },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================
// createAutoMessage
// ============================================

describe('createAutoMessage', () => {
  test('should upsert into auto_messages with correct fields', async () => {
    const record = {
      id: 'msg-1',
      user_id: 'user-1',
      message_type: 'first_touch',
      channel: 'whatsapp',
      template_name: 'first_touch_quick_question',
      delivery_status: 'pending',
      send_after: '2026-05-01T10:30:00Z',
      metadata: { user_name: 'Test User' },
    };
    const { mock, setData } = createChainableMock();
    setData(record);

    const result = await createAutoMessage({
      user_id: 'user-1',
      channel: 'whatsapp',
      template_name: 'first_touch_quick_question',
      send_after: '2026-05-01T10:30:00Z',
      metadata: { user_name: 'Test User' },
    }, mock as any);

    expect(mock.from).toHaveBeenCalledWith('auto_messages');
    expect(mock.upsert).toHaveBeenCalled();
    expect(result).toEqual(record);
  });

  test('should return null if duplicate (unique violation)', async () => {
    const { mock, setError } = createChainableMock();
    setError({ code: '23505', message: 'unique_violation' });

    // Should not throw for unique violations
    const result = await createAutoMessage({
      user_id: 'user-1',
      channel: 'whatsapp',
      template_name: 'first_touch_quick_question',
      send_after: '2026-05-01T10:30:00Z',
    }, mock as any);

    expect(result).toBeNull();
  });

  test('should default message_type to first_touch', async () => {
    const { mock, setData } = createChainableMock();
    setData({ id: 'msg-2', message_type: 'first_touch' });

    await createAutoMessage({
      user_id: 'user-1',
      channel: 'email',
      template_name: 'first_touch_quick_question',
      send_after: '2026-05-01T10:30:00Z',
    }, mock as any);

    const upsertCall = mock.upsert.mock.calls[0][0];
    expect(upsertCall.message_type).toBe('first_touch');
  });
});

// ============================================
// getPendingAutoMessages
// ============================================

describe('getPendingAutoMessages', () => {
  test('should query pending messages with send_after <= now', async () => {
    const pending = [
      {
        id: 'msg-1',
        user_id: 'u1',
        delivery_status: 'pending',
        channel: 'whatsapp',
        template_name: 'first_touch_quick_question',
        users: { name: 'Alice', phone: '+919876543210', email: 'alice@test.com' },
      },
    ];
    const { mock, setData } = createChainableMock();
    setData(pending);

    const result = await getPendingAutoMessages(mock as any);

    expect(mock.from).toHaveBeenCalledWith('auto_messages');
    expect(mock.eq).toHaveBeenCalledWith('delivery_status', 'pending');
    expect(result).toHaveLength(1);
    expect(result[0].user_name).toBe('Alice');
    expect(result[0].user_phone).toBe('+919876543210');
    expect(result[0].users).toBeUndefined(); // cleaned up
  });

  test('should return empty array when no pending messages', async () => {
    const { mock, setData } = createChainableMock();
    setData([]);

    const result = await getPendingAutoMessages(mock as any);
    expect(result).toEqual([]);
  });
});

// ============================================
// getFailedAutoMessages
// ============================================

describe('getFailedAutoMessages', () => {
  test('should query failed messages with retry_count < maxRetries', async () => {
    const failed = [
      {
        id: 'msg-2',
        delivery_status: 'failed',
        retry_count: 1,
        users: { name: 'Bob', phone: '+91111222333', email: null },
      },
    ];
    const { mock, setData } = createChainableMock();
    setData(failed);

    const result = await getFailedAutoMessages(3, mock as any);

    expect(mock.eq).toHaveBeenCalledWith('delivery_status', 'failed');
    expect(mock.lt).toHaveBeenCalledWith('retry_count', 3);
    expect(result).toHaveLength(1);
    expect(result[0].user_name).toBe('Bob');
  });
});

// ============================================
// updateAutoMessageResult
// ============================================

describe('updateAutoMessageResult', () => {
  test('should update status to sent on success', async () => {
    const { mock, setData } = createChainableMock();
    setData(null);

    await updateAutoMessageResult('msg-1', {
      success: true,
      externalMessageId: 'wa-msg-123',
    }, mock as any);

    expect(mock.from).toHaveBeenCalledWith('auto_messages');
    expect(mock.update).toHaveBeenCalled();
    const updateArg = mock.update.mock.calls[0][0];
    expect(updateArg.delivery_status).toBe('sent');
    expect(updateArg.external_message_id).toBe('wa-msg-123');
    expect(updateArg.sent_at).toBeDefined();
  });

  test('should update status to failed and increment retry_count on failure', async () => {
    const { mock } = createChainableMock();
    // Mock the retry_count read
    mock.single = vi.fn()
      .mockResolvedValueOnce({ data: { retry_count: 1 }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });

    await updateAutoMessageResult('msg-1', {
      success: false,
      error: 'API rate limited',
    }, mock as any);

    expect(mock.update).toHaveBeenCalled();
    const updateArg = mock.update.mock.calls[0][0];
    expect(updateArg.delivery_status).toBe('failed');
    expect(updateArg.error_message).toBe('API rate limited');
    expect(updateArg.retry_count).toBe(2); // incremented from 1
  });
});

// ============================================
// getAutoMessagesForUser
// ============================================

describe('getAutoMessagesForUser', () => {
  test('should query by user_id and return in desc order', async () => {
    const messages = [
      { id: 'msg-1', user_id: 'u1', message_type: 'first_touch', delivery_status: 'sent' },
    ];
    const { mock, setData } = createChainableMock();
    setData(messages);

    const result = await getAutoMessagesForUser('u1', mock as any);

    expect(mock.from).toHaveBeenCalledWith('auto_messages');
    expect(mock.eq).toHaveBeenCalledWith('user_id', 'u1');
    expect(mock.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(result).toHaveLength(1);
  });
});

// ============================================
// getAutoMessageStats
// ============================================

describe('getAutoMessageStats', () => {
  test('should count messages by delivery status', async () => {
    const rows = [
      { delivery_status: 'sent' },
      { delivery_status: 'sent' },
      { delivery_status: 'failed' },
      { delivery_status: 'pending' },
      { delivery_status: 'delivered' },
    ];
    const { mock, setData } = createChainableMock();
    setData(rows);

    const result = await getAutoMessageStats(undefined, undefined, mock as any);

    expect(result.total).toBe(5);
    expect(result.sent).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.pending).toBe(1);
    expect(result.delivered).toBe(1);
    expect(result.read).toBe(0);
  });

  test('should filter by date range when provided', async () => {
    const { mock, setData } = createChainableMock();
    setData([]);

    await getAutoMessageStats('2026-05-01', '2026-05-31', mock as any);

    expect(mock.gte).toHaveBeenCalledWith('created_at', '2026-05-01');
    expect(mock.lte).toHaveBeenCalledWith('created_at', '2026-05-31');
  });
});
