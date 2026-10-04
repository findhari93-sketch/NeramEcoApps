import { describe, it, expect, vi } from 'vitest';
import { leadTouchFields, saveLeadTouch } from './lead-touch';

const touch = { source: 'chatgpt.com', medium: 'referral', campaign: null, landing_page: '/coaching/x', referrer: 'https://chatgpt.com', channel: 'ai_chatgpt', ts: '2026-10-03T00:00:00Z' };

describe('leadTouchFields', () => {
  it('keeps valid touches, channel and page code', () => {
    const f = leadTouchFields({ first_touch: touch, last_touch: touch, channel: 'ai_chatgpt', landing_page: '/coaching/x', page_code: 'EN-MDU' });
    expect(f.first_touch?.channel).toBe('ai_chatgpt');
    expect(f.channel).toBe('ai_chatgpt');
    expect(f.page_code).toBe('EN-MDU');
  });

  it('drops anything malformed', () => {
    const f = leadTouchFields({ first_touch: 'x', last_touch: { ...touch, landing_page: 'https://evil.example' }, channel: 'spam', page_code: '<script>', landing_page: 'http://x' });
    expect(f).toEqual({ first_touch: null, last_touch: null, channel: null, landing_page: null, page_code: null });
  });
});

describe('saveLeadTouch', () => {
  it('updates only the fields it has and never throws', async () => {
    const eq = vi.fn().mockResolvedValue({ error: { message: 'column does not exist' } });
    const update = vi.fn(() => ({ eq }));
    const supabase = { from: vi.fn(() => ({ update })) } as never;
    await expect(saveLeadTouch(supabase, 'callback_requests', 'id-1', { channel: 'whatsapp' })).resolves.toBeUndefined();
    expect(update).toHaveBeenCalledWith({ channel: 'whatsapp' });
    expect(eq).toHaveBeenCalledWith('id', 'id-1');
  });

  it('skips the update when there is nothing to save', async () => {
    const supabase = { from: vi.fn() } as never;
    await saveLeadTouch(supabase, 'callback_requests', 'id-1', {});
    expect((supabase as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled();
  });
});
