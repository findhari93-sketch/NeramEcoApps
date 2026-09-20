import { describe, test, expect, vi } from 'vitest';
import {
  DETAIL_REQUEST_TTL_DAYS,
  mintDetailRequestToken,
  getDetailRequestByToken,
  createOrReuseDetailRequest,
  detailRequestProgress,
  type StudentDetailRequest,
} from '../student-detail-requests';

/**
 * These links are the only credential guarding a minor's date of birth and address,
 * so the tests that matter here are the refusals: an expired, cancelled or unknown
 * token must never come back as usable.
 */

function makeRequest(over: Partial<StudentDetailRequest> = {}): StudentDetailRequest {
  return {
    id: 'req-1',
    user_id: 'user-1',
    token: 'tok',
    status: 'active',
    created_by: 'staff-1',
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    sent_at: null,
    sent_by: null,
    opened_at: null,
    answered_at: null,
    updated_at: null,
    lead_profile_id: null,
    open_count: 0,
    cancelled_by: null,
    cancelled_at: null,
    ...over,
  };
}

/** A mock that answers the token lookup and swallows the lazy-expiry update. */
function mockClientReturning(row: StudentDetailRequest | null) {
  const chain: any = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(() => Promise.resolve({ data: row, error: null })),
    single: vi.fn(() => Promise.resolve({ data: row, error: null })),
    then: vi.fn((resolve: any) => resolve({ data: [], error: null })),
  };
  return chain;
}

describe('mintDetailRequestToken', () => {
  test('is URL safe, so it survives being pasted into a chat', () => {
    for (let i = 0; i < 50; i++) {
      expect(mintDetailRequestToken()).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  test('carries enough entropy that guessing is not a threat model', () => {
    // 32 bytes base64url is 43 characters.
    expect(mintDetailRequestToken().length).toBeGreaterThanOrEqual(43);
  });

  test('never repeats across ten thousand draws', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) seen.add(mintDetailRequestToken());
    expect(seen.size).toBe(10_000);
  });
});

describe('getDetailRequestByToken refuses', () => {
  test('an unknown token', async () => {
    const result = await getDetailRequestByToken('nope', mockClientReturning(null));
    expect(result).toEqual({ refusal: 'not_found' });
  });

  test('an empty or non-string token without touching the database', async () => {
    const client = mockClientReturning(makeRequest());
    expect(await getDetailRequestByToken('', client)).toEqual({ refusal: 'not_found' });
    expect(await getDetailRequestByToken(null as any, client)).toEqual({ refusal: 'not_found' });
    expect(client.from).not.toHaveBeenCalled();
  });

  test('a cancelled link, even though the row still exists', async () => {
    const row = makeRequest({ status: 'cancelled' });
    expect(await getDetailRequestByToken('tok', mockClientReturning(row))).toEqual({
      refusal: 'cancelled',
    });
  });

  test('a link already marked expired', async () => {
    const row = makeRequest({ status: 'expired' });
    expect(await getDetailRequestByToken('tok', mockClientReturning(row))).toEqual({
      refusal: 'expired',
    });
  });

  test('a link one millisecond past its time that the sweep has not caught', async () => {
    // The status still says active. The clock is the authority, not the column.
    const row = makeRequest({ status: 'active', expires_at: new Date(Date.now() - 1).toISOString() });
    expect(await getDetailRequestByToken('tok', mockClientReturning(row))).toEqual({
      refusal: 'expired',
    });
  });
});

describe('getDetailRequestByToken allows', () => {
  test('a live link', async () => {
    const row = makeRequest();
    const result = await getDetailRequestByToken('tok', mockClientReturning(row));
    expect('request' in result && result.request.id).toBe('req-1');
  });

  test('a link the student already answered, so a mistyped answer can be corrected', async () => {
    const row = makeRequest({ status: 'answered', answered_at: new Date().toISOString() });
    const result = await getDetailRequestByToken('tok', mockClientReturning(row));
    expect('request' in result).toBe(true);
  });
});

describe('createOrReuseDetailRequest', () => {
  test('reuses a live link, so pressing the button twice does not break the one already sent', async () => {
    const existing = makeRequest();
    const client = mockClientReturning(existing);
    const { request, reused } = await createOrReuseDetailRequest(
      { userId: 'user-1', createdBy: 'staff-1' },
      client,
    );
    expect(reused).toBe(true);
    expect(request.token).toBe('tok');
    expect(client.insert).not.toHaveBeenCalled();
  });

  test('cancels the old link before inserting, which the partial unique index requires', async () => {
    const existing = makeRequest();
    const client = mockClientReturning(existing);
    const order: string[] = [];
    client.update.mockImplementation((payload: any) => {
      if (payload?.status === 'cancelled') order.push('cancel');
      return client;
    });
    client.insert.mockImplementation(() => {
      order.push('insert');
      return client;
    });

    await createOrReuseDetailRequest({ userId: 'user-1', createdBy: 'staff-1', regenerate: true }, client);

    expect(order).toEqual(['cancel', 'insert']);
  });

  test('gives the link a fortnight, long enough to survive a weekend and an exam week', () => {
    expect(DETAIL_REQUEST_TTL_DAYS).toBe(14);
  });
});

describe('detailRequestProgress', () => {
  test('reads nothing as not asked', () => {
    expect(detailRequestProgress(null)).toBe('not_asked');
    expect(detailRequestProgress(undefined)).toBe('not_asked');
  });

  test('reads a fresh link as asked', () => {
    expect(detailRequestProgress(makeRequest())).toBe('asked');
  });

  test('reads an opened but unfinished link as opened', () => {
    expect(detailRequestProgress(makeRequest({ opened_at: new Date().toISOString() }))).toBe('opened');
  });

  test('reads an answered link as answered, whatever else happened', () => {
    const row = makeRequest({
      opened_at: new Date().toISOString(),
      answered_at: new Date().toISOString(),
    });
    expect(detailRequestProgress(row)).toBe('answered');
  });
});
