import { describe, it, expect } from 'vitest';
import { blockReasons } from './whatsapp-block';

describe('blockReasons', () => {
  it('pulls the entity reasons out of a health-check block', () => {
    const block =
      "WA_ACCOUNT_BLOCKED: Meta's health check says this WhatsApp account cannot send (WABA #141008: The WABA status is not active.). Queued messages are held until WhatsApp Manager shows it as active.";
    expect(blockReasons(block)).toBe('WABA #141008: The WABA status is not active.');
  });

  it('falls back to the text after the prefix for other shapes', () => {
    expect(blockReasons('WA_ACCOUNT_BLOCKED: not registered (Meta #133010)')).toBe('not registered (Meta #133010)');
  });
});
