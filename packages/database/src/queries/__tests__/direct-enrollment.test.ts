import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  createDirectEnrollmentLink,
  getDirectEnrollmentLinkByToken,
  getDirectEnrollmentLinkById,
  listDirectEnrollmentLinks,
  updateDirectEnrollmentLink,
  expireOldDirectEnrollmentLinks,
  deleteDirectEnrollmentLink,
  regenerateDirectEnrollmentLink,
  getActiveEnrollmentLinkForUser,
} from '../direct-enrollment';

/**
 * Unit tests for direct enrollment query functions.
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
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn(() => Promise.resolve(resolvedValue)),
    maybeSingle: vi.fn(() => Promise.resolve(resolvedValue)),
    rpc: vi.fn(() => Promise.resolve(resolvedValue)),
    // Allow the chain itself to resolve (for queries without .single())
    then: vi.fn((resolve: any) => resolve(resolvedValue)),
  };

  // Make range/select/update/delete also thenable
  for (const method of ['range', 'select', 'eq', 'delete', 'limit']) {
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

describe('createDirectEnrollmentLink', () => {
  test('should insert with correct fields and return the created link', async () => {
    const mockLink = { id: 'link-1', token: 'abc', student_name: 'Test', status: 'active' };
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: mockLink, error: null });

    const result = await createDirectEnrollmentLink(
      {
        token: 'abc',
        created_by: 'admin-1',
        student_name: 'Test',
        interest_course: 'nata' as any,
        total_fee: 25000,
        final_fee: 20000,
        amount_paid: 20000,
        payment_method: 'bank_transfer',
      },
      mock as any
    );

    expect(mock.from).toHaveBeenCalledWith('direct_enrollment_links');
    expect(mock.insert).toHaveBeenCalled();
    expect(result).toEqual(mockLink);
  });

  test('should throw when supabase returns an error', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: null, error: { message: 'DB error', code: '23505' } });

    await expect(
      createDirectEnrollmentLink(
        {
          token: 'abc',
          created_by: 'admin-1',
          student_name: 'Test',
          interest_course: 'nata' as any,
          total_fee: 25000,
          final_fee: 20000,
          amount_paid: 20000,
          payment_method: 'bank_transfer',
        },
        mock as any
      )
    ).rejects.toEqual({ message: 'DB error', code: '23505' });
  });
});

describe('getDirectEnrollmentLinkByToken', () => {
  test('should return link when token exists', async () => {
    const mockLink = { id: 'link-1', token: 'abc', student_name: 'Test' };
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: mockLink, error: null });

    const result = await getDirectEnrollmentLinkByToken('abc', mock as any);

    expect(mock.from).toHaveBeenCalledWith('direct_enrollment_links');
    expect(mock.eq).toHaveBeenCalledWith('token', 'abc');
    expect(result).toEqual(mockLink);
  });

  test('should return null when token not found (PGRST116)', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: null, error: { code: 'PGRST116', message: 'Not found' } });

    const result = await getDirectEnrollmentLinkByToken('missing', mock as any);
    expect(result).toBeNull();
  });

  test('should throw on non-PGRST116 errors', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: null, error: { code: '42P01', message: 'Table not found' } });

    await expect(getDirectEnrollmentLinkByToken('abc', mock as any)).rejects.toEqual({
      code: '42P01',
      message: 'Table not found',
    });
  });
});

describe('getDirectEnrollmentLinkById', () => {
  test('should return link when found', async () => {
    const mockLink = { id: 'link-1', token: 'abc' };
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: mockLink, error: null });

    const result = await getDirectEnrollmentLinkById('link-1', mock as any);
    expect(mock.eq).toHaveBeenCalledWith('id', 'link-1');
    expect(result).toEqual(mockLink);
  });

  test('should return null when not found', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: null, error: { code: 'PGRST116', message: 'Not found' } });

    const result = await getDirectEnrollmentLinkById('missing', mock as any);
    expect(result).toBeNull();
  });
});

describe('listDirectEnrollmentLinks', () => {
  test('should apply status filter when provided', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: [], error: null, count: 0 });

    await listDirectEnrollmentLinks({ status: 'active' as any }, mock as any);

    expect(mock.eq).toHaveBeenCalledWith('status', 'active');
  });

  test('should apply search filter with ilike', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: [], error: null, count: 0 });

    await listDirectEnrollmentLinks({ search: 'john' }, mock as any);

    expect(mock.or).toHaveBeenCalledWith(
      expect.stringContaining('student_name.ilike.%john%')
    );
  });

  test('should calculate correct offset from page and limit', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: [], error: null, count: 0 });

    await listDirectEnrollmentLinks({ page: 3, limit: 10 }, mock as any);

    // page 3, limit 10 → offset 20, range(20, 29)
    expect(mock.range).toHaveBeenCalledWith(20, 29);
  });

  test('should use default page=1, limit=20 when not provided', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: [], error: null, count: 0 });

    await listDirectEnrollmentLinks({}, mock as any);

    expect(mock.range).toHaveBeenCalledWith(0, 19);
  });

  test('should return empty data and total 0 when no results', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: null, error: null, count: 0 });

    const result = await listDirectEnrollmentLinks({}, mock as any);
    expect(result).toEqual({ data: [], total: 0 });
  });

  test('should throw on database error', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: null, error: { message: 'DB error' }, count: 0 });

    await expect(listDirectEnrollmentLinks({}, mock as any)).rejects.toEqual({
      message: 'DB error',
    });
  });
});

describe('updateDirectEnrollmentLink', () => {
  test('should update only the fields provided', async () => {
    const updated = { id: 'link-1', status: 'cancelled', admin_notes: 'Updated' };
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: updated, error: null });

    const result = await updateDirectEnrollmentLink(
      'link-1',
      { status: 'cancelled' as any, admin_notes: 'Updated' },
      mock as any
    );

    expect(mock.update).toHaveBeenCalledWith({ status: 'cancelled', admin_notes: 'Updated' });
    expect(mock.eq).toHaveBeenCalledWith('id', 'link-1');
    expect(result).toEqual(updated);
  });

  test('should throw when link not found', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: null, error: { message: 'Not found', code: 'PGRST116' } });

    await expect(
      updateDirectEnrollmentLink('missing', { status: 'cancelled' as any }, mock as any)
    ).rejects.toBeDefined();
  });

  test('should accept payment fields (student-provided)', async () => {
    const updated = {
      id: 'link-1',
      status: 'used',
      payment_method: 'upi_direct',
      payment_date: '2026-03-15',
      transaction_reference: 'UTR123456',
      payment_proof_url: 'https://storage.example.com/proof.jpg',
    };
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: updated, error: null });

    const result = await updateDirectEnrollmentLink(
      'link-1',
      {
        status: 'used' as any,
        payment_method: 'upi_direct',
        payment_date: '2026-03-15',
        transaction_reference: 'UTR123456',
        payment_proof_url: 'https://storage.example.com/proof.jpg',
      },
      mock as any
    );

    expect(mock.update).toHaveBeenCalledWith({
      status: 'used',
      payment_method: 'upi_direct',
      payment_date: '2026-03-15',
      transaction_reference: 'UTR123456',
      payment_proof_url: 'https://storage.example.com/proof.jpg',
    });
    expect(result).toEqual(updated);
  });

  test('should allow partial payment field updates', async () => {
    const updated = { id: 'link-1', payment_proof_url: 'https://storage.example.com/proof.pdf' };
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: updated, error: null });

    const result = await updateDirectEnrollmentLink(
      'link-1',
      { payment_proof_url: 'https://storage.example.com/proof.pdf' },
      mock as any
    );

    expect(mock.update).toHaveBeenCalledWith({
      payment_proof_url: 'https://storage.example.com/proof.pdf',
    });
    expect(result).toEqual(updated);
  });
});

describe('expireOldDirectEnrollmentLinks', () => {
  test('should update active links past expires_at to expired', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: [{ id: '1' }, { id: '2' }], error: null });

    const count = await expireOldDirectEnrollmentLinks(mock as any);

    expect(mock.update).toHaveBeenCalledWith({ status: 'expired' });
    expect(mock.eq).toHaveBeenCalledWith('status', 'active');
    expect(count).toBe(2);
  });

  test('should return 0 when no links to expire', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: [], error: null });

    const count = await expireOldDirectEnrollmentLinks(mock as any);
    expect(count).toBe(0);
  });
});

describe('deleteDirectEnrollmentLink', () => {
  test('should clear FK refs before deleting', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: null, error: null });

    await deleteDirectEnrollmentLink('link-1', mock as any);

    // Should call update twice (clear regenerated_from and regenerated_to)
    // then delete once
    const updateCalls = mock.update.mock.calls;
    expect(updateCalls.length).toBeGreaterThanOrEqual(2);
    expect(mock.delete).toHaveBeenCalled();
  });
});

describe('regenerateDirectEnrollmentLink', () => {
  test('should throw when old link not found', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    // getDirectEnrollmentLinkById will get null (PGRST116)
    setResolvedValue({ data: null, error: { code: 'PGRST116', message: 'Not found' } });

    await expect(
      regenerateDirectEnrollmentLink('missing', 'new-token', 'admin-1', mock as any)
    ).rejects.toThrow('Link not found');
  });
});

describe('getActiveEnrollmentLinkForUser', () => {
  test('should return link for matching email', async () => {
    const mockLink = { id: 'link-1', student_email: 'test@example.com', status: 'active' };
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: mockLink, error: null });

    const result = await getActiveEnrollmentLinkForUser('test@example.com', mock as any);

    expect(mock.eq).toHaveBeenCalledWith('status', 'active');
    expect(mock.eq).toHaveBeenCalledWith('student_email', 'test@example.com');
    expect(result).toEqual(mockLink);
  });

  test('should return null when no active link for email', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: null, error: null });

    const result = await getActiveEnrollmentLinkForUser('nobody@example.com', mock as any);
    expect(result).toBeNull();
  });
});
