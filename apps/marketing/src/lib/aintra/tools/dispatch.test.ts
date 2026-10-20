import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./get-college', () => ({
  getCollegeTool: vi.fn(async () => ({ ok: true, data: { name: 'X' } })),
}));
vi.mock('./search-colleges', () => ({
  searchCollegesTool: vi.fn(async () => ({ ok: true, data: { count: 0, results: [] } })),
}));
vi.mock('./compare-colleges', () => ({
  compareCollegesTool: vi.fn(async () => ({ ok: true, data: [] })),
}));
vi.mock('./booking-tools', () => ({
  prepareDemoBookingTool: vi.fn(async (_args: unknown, ctx: { userId: string | null }) => ({ ok: true, data: { user: ctx.userId }, card: '[[book:demo]]' })),
  prepareDemoCancelTool: vi.fn(async () => ({ ok: false, error: 'no_active_demo' })),
  prepareCallbackTool: vi.fn(async () => ({ ok: true, data: {}, card: '[[book:callback]]' })),
  getMyStatusTool: vi.fn(async (ctx: { userId: string | null }) => ({ ok: true, data: { user: ctx.userId } })),
}));
vi.mock('./application-tools', () => ({
  saveApplicationDetailsTool: vi.fn(async (_a: unknown, ctx: { userId: string | null }) => ({ ok: true, data: { user: ctx.userId } })),
  prepareApplicationSubmitTool: vi.fn(async () => ({ ok: true, data: {}, card: '[[book:apply]]' })),
}));
vi.mock('./quick-forms', () => ({
  prepareCentreVisitTool: vi.fn(async () => ({ ok: true, data: {}, card: '[[book:visit]]' })),
  prepareCollegeEnquiryTool: vi.fn(async () => ({ ok: false, error: 'which_college' })),
  prepareMessageTool: vi.fn(async () => ({ ok: true, data: {}, card: '[[book:message]]' })),
}));

import { dispatchTool } from './dispatch';

describe('dispatchTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes get_college', async () => {
    const r = await dispatchTool('get_college', { slug: 'x' });
    expect(r.ok).toBe(true);
  });

  it('routes search_colleges', async () => {
    const r = await dispatchTool('search_colleges', { state: 'tamil-nadu' });
    expect(r.ok).toBe(true);
  });

  it('routes compare_colleges', async () => {
    const r = await dispatchTool('compare_colleges', { slugs: ['a', 'b'] });
    expect(r.ok).toBe(true);
  });

  it('hands the booking tools the verified visitor, and a guest when none is given', async () => {
    const ctx = { userId: 'user-1', name: 'Priya', phoneVerified: true };
    expect(await dispatchTool('prepare_demo_booking', {}, ctx)).toMatchObject({ ok: true, data: { user: 'user-1' }, card: '[[book:demo]]' });
    expect(await dispatchTool('get_my_status', {})).toMatchObject({ ok: true, data: { user: null } });
    expect(await dispatchTool('prepare_callback', {}, ctx)).toMatchObject({ card: '[[book:callback]]' });
    expect(await dispatchTool('prepare_demo_cancel', {}, ctx)).toMatchObject({ ok: false, error: 'no_active_demo' });
  });

  it('routes the application and short-form tools', async () => {
    const ctx = { userId: 'user-2', name: null, phoneVerified: false };
    expect(await dispatchTool('save_application_details', { student_name: 'A' }, ctx)).toMatchObject({ data: { user: 'user-2' } });
    expect(await dispatchTool('prepare_application_submit', {}, ctx)).toMatchObject({ card: '[[book:apply]]' });
    expect(await dispatchTool('prepare_centre_visit', {}, ctx)).toMatchObject({ card: '[[book:visit]]' });
    expect(await dispatchTool('prepare_college_enquiry', {}, ctx)).toMatchObject({ ok: false });
    expect(await dispatchTool('prepare_message', { message: 'x' }, ctx)).toMatchObject({ card: '[[book:message]]' });
  });

  it('returns unknown_tool for unrecognized name', async () => {
    const r = await dispatchTool('not_a_tool' as any, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('unknown_tool');
  });

  it('enforces 3-second timeout', async () => {
    const { getCollegeTool } = await import('./get-college');
    (getCollegeTool as any).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, data: {} }), 5000))
    );
    const r = await dispatchTool('get_college', { slug: 'x' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('timeout');
  }, 10000);
});
