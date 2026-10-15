// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({ rows: [] as any[], health: vi.fn() }));

vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({
    from: () => {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        gte: () => Promise.resolve({ data: db.rows, error: null }),
      };
      return chain;
    },
  }),
  getWhatsAppSendBlock: (...a: unknown[]) => db.health(...a),
}));

import { GET } from './route';

const BLOCK =
  "WA_ACCOUNT_BLOCKED: Meta's health check says this WhatsApp account cannot send (WABA #141008: The WABA status is not active.). Queued messages are held until WhatsApp Manager shows it as active.";

describe('GET /api/admin/whatsapp-health', () => {
  beforeEach(() => {
    db.health.mockReset();
    delete process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  });

  it('adds the live Meta reason and the account link when sends are held as blocked', async () => {
    process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = '1246354014369613';
    db.rows = Array.from({ length: 3 }, () => ({ delivery_status: 'pending', error_message: BLOCK }));
    db.health.mockResolvedValue(BLOCK);
    const body = await (await GET()).json();
    expect(body.failed).toBe(3);
    expect(body.primaryErrorPrefix).toBe('WA_ACCOUNT_BLOCKED');
    expect(body.liveBlock).toBe('WABA #141008: The WABA status is not active.');
    expect(body.managerUrl).toContain('asset_id=1246354014369613');
  });

  it('returns no live reason once Meta allows sending again', async () => {
    db.rows = Array.from({ length: 3 }, () => ({ delivery_status: 'pending', error_message: BLOCK }));
    db.health.mockResolvedValue(null);
    const body = await (await GET()).json();
    expect(body.liveBlock).toBeNull();
    expect(body.managerUrl).toBeNull();
  });

  it('does not ask Meta when the top error is something else', async () => {
    db.rows = [{ delivery_status: 'failed', error_message: 'WA_RATE_LIMIT: slow down' }];
    const body = await (await GET()).json();
    expect(db.health).not.toHaveBeenCalled();
    expect(body.liveBlock).toBeNull();
  });
});
