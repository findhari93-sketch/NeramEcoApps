import { describe, it, expect, beforeEach, vi } from 'vitest';

// --- Mock the Resend send wrapper (no real emails) -------------------------
const sendMock = vi.fn();
vi.mock('@/lib/college-outreach/send', () => ({
  sendOutreachEmail: (args: any) => sendMock(args),
}));

// --- Mock the Supabase admin client ----------------------------------------
// A tiny chainable query builder. Each `.from(table)` records the table + op,
// and awaiting the chain resolves via resolveQuery() below. The real templates
// module is NOT mocked, so renderOutreachEmail runs for real.
let collegeRow: any;
let suppressedRows: any[];
let lastSuppressionInVals: string[] | null;
let loggedRow: any;
let updatedPayload: any;

function resolveQuery(state: any) {
  if (state.table === 'colleges' && state.op === 'select') {
    return { data: collegeRow, error: null };
  }
  if (state.table === 'colleges' && state.op === 'update') {
    updatedPayload = state.payload;
    return {
      data: {
        contact_status: state.payload.contact_status,
        outreach_count: state.payload.outreach_count,
      },
      error: null,
    };
  }
  if (state.table === 'email_suppression_list') {
    lastSuppressionInVals = state.inVals ?? null;
    return { data: suppressedRows, error: null };
  }
  if (state.table === 'college_outreach_log' && state.op === 'insert') {
    loggedRow = state.payload;
    return { data: { id: 'log-1' }, error: null };
  }
  return { data: null, error: null };
}

function makeBuilder(table: string) {
  const state: any = { table, op: 'select', payload: null, inVals: null };
  const builder: any = {
    select: vi.fn(() => builder),
    insert: vi.fn((p: any) => { state.op = 'insert'; state.payload = p; return builder; }),
    update: vi.fn((p: any) => { state.op = 'update'; state.payload = p; return builder; }),
    eq: vi.fn(() => builder),
    in: vi.fn((_col: string, vals: string[]) => { state.inVals = vals; return builder; }),
    single: vi.fn(() => builder),
    maybeSingle: vi.fn(() => builder),
    then: (onF: any, onR: any) => Promise.resolve(resolveQuery(state)).then(onF, onR),
  };
  return builder;
}

const supabaseMock = { from: vi.fn((table: string) => makeBuilder(table)) };

vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => supabaseMock,
}));

import { POST } from './route';

function makeReq(body: any) {
  return {
    json: async () => body,
    headers: new Headers({ 'x-staff-name': 'Test Staff', 'x-staff-email': 'staff@neramclasses.com' }),
  } as any;
}

const BASE_COLLEGE = {
  id: 'col-1',
  name: 'Test College of Architecture',
  slug: 'test-college',
  state: 'Tamil Nadu',
  state_slug: 'tamil-nadu',
  city: 'Coimbatore',
  contact_status: 'never_contacted',
  last_outreach_at: null,
  outreach_count: 0,
  unsubscribe_token: 'tok-123',
  admissions_email: 'admissions@testcollege.edu',
  email: 'info@testcollege.edu',
};

beforeEach(() => {
  sendMock.mockReset();
  sendMock.mockImplementation(async ({ to }: any) => ({ success: true, messageId: `msg-${to}` }));
  collegeRow = { ...BASE_COLLEGE };
  suppressedRows = [];
  lastSuppressionInVals = null;
  loggedRow = null;
  updatedPayload = null;
  supabaseMock.from.mockClear();
});

describe('college-outreach send route — multiple recipients', () => {
  it('sends one PRIVATE copy per recipient (each To is a single address)', async () => {
    const res = await POST(makeReq({
      college_id: 'col-1',
      override_to_email: 'a@x.com, b@y.com; c@z.com',
    }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.sent_count).toBe(3);
    expect(json.sent_to).toEqual(['a@x.com', 'b@y.com', 'c@z.com']);

    // Three separate sends, each with exactly one `to` (never an array / joined).
    expect(sendMock).toHaveBeenCalledTimes(3);
    const tos = sendMock.mock.calls.map((c) => c[0].to).sort();
    expect(tos).toEqual(['a@x.com', 'b@y.com', 'c@z.com']);
    for (const call of sendMock.mock.calls) {
      expect(typeof call[0].to).toBe('string');
      expect(call[0].to).not.toContain(',');
    }
  });

  it('logs ONE summary row and advances the college once', async () => {
    await POST(makeReq({ college_id: 'col-1', override_to_email: 'a@x.com, b@y.com' }));

    // one log insert, sent_to is the joined list
    expect(loggedRow).toBeTruthy();
    expect(loggedRow.sent_to).toBe('a@x.com, b@y.com');
    expect(loggedRow.status).toBe('sent');

    // college advanced exactly once: never_contacted -> emailed_v1, count +1 (not +2)
    expect(updatedPayload.contact_status).toBe('emailed_v1');
    expect(updatedPayload.outreach_count).toBe(1);
  });

  it('de-dupes addresses case-insensitively', async () => {
    const res = await POST(makeReq({
      college_id: 'col-1',
      override_to_email: 'Dup@X.com, dup@x.com, b@y.com',
    }));
    const json = await res.json();
    expect(json.sent_count).toBe(2);
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it('skips suppressed recipients but still sends to the rest', async () => {
    suppressedRows = [{ email: 'b@y.com', reason: 'unsubscribe' }];
    const res = await POST(makeReq({
      college_id: 'col-1',
      override_to_email: 'a@x.com, B@Y.com, c@z.com',
    }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.sent_count).toBe(2);
    expect(json.skipped).toEqual([{ email: 'B@Y.com', reason: 'unsubscribe' }]);
    expect(sendMock).toHaveBeenCalledTimes(2);
    const tos = sendMock.mock.calls.map((c) => c[0].to).sort();
    expect(tos).toEqual(['a@x.com', 'c@z.com']);
    // suppression query lowercases for comparison
    expect(lastSuppressionInVals).toEqual(['a@x.com', 'b@y.com', 'c@z.com']);
  });

  it('returns 403 when EVERY recipient is suppressed (and sends nothing)', async () => {
    suppressedRows = [
      { email: 'a@x.com', reason: 'unsubscribe' },
      { email: 'b@y.com', reason: 'bounce' },
    ];
    const res = await POST(makeReq({ college_id: 'col-1', override_to_email: 'a@x.com, b@y.com' }));
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.suppressed).toBe(true);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('returns 422 when over the recipient cap', async () => {
    const many = Array.from({ length: 11 }, (_, i) => `u${i}@x.com`).join(', ');
    const res = await POST(makeReq({ college_id: 'col-1', override_to_email: many }));
    expect(res.status).toBe(422);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('returns 422 when no valid recipient at all', async () => {
    collegeRow = { ...BASE_COLLEGE, admissions_email: null, email: null };
    const res = await POST(makeReq({ college_id: 'col-1', override_to_email: 'junk, @nope' }));
    expect(res.status).toBe(422);
  });

  it('partial failure still succeeds (200) and records the failure', async () => {
    sendMock.mockImplementation(async ({ to }: any) =>
      to === 'b@y.com'
        ? { success: false, error: 'mailbox full' }
        : { success: true, messageId: `msg-${to}` },
    );
    const res = await POST(makeReq({ college_id: 'col-1', override_to_email: 'a@x.com, b@y.com' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.sent_count).toBe(1);
    expect(json.failed).toHaveLength(1);
    expect(json.failed[0].email).toBe('b@y.com');
    // college still advanced (at least one delivered)
    expect(updatedPayload.outreach_count).toBe(1);
    // log row records the failure note
    expect(loggedRow.error_message).toContain('b@y.com');
  });

  it('returns 502 and does NOT advance the college when all sends fail', async () => {
    sendMock.mockImplementation(async () => ({ success: false, error: 'resend down' }));
    const res = await POST(makeReq({ college_id: 'col-1', override_to_email: 'a@x.com, b@y.com' }));
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.success).toBe(false);
    expect(updatedPayload).toBeNull(); // colleges.update never called
    expect(loggedRow.status).toBe('failed');
  });

  it('honours plain_text_only by omitting the HTML part', async () => {
    await POST(makeReq({
      college_id: 'col-1',
      override_to_email: 'a@x.com',
      plain_text_only: true,
    }));
    expect(sendMock.mock.calls[0][0].html).toBeUndefined();
    expect(sendMock.mock.calls[0][0].text).toBeTruthy();
  });

  it('always attaches one-click List-Unsubscribe headers', async () => {
    await POST(makeReq({ college_id: 'col-1', override_to_email: 'a@x.com' }));
    const headers = sendMock.mock.calls[0][0].headers;
    expect(headers['List-Unsubscribe']).toContain('tok-123');
    expect(headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });
});
