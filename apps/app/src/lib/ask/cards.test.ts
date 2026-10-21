import { describe, it, expect } from 'vitest';
import { cardSummary, redactForStorage, type AskCard } from './cards';

const feesCard: AskCard = {
  id: 'account-1',
  kind: 'account',
  href: '',
  data: {
    kind: 'links',
    title: 'Your fees',
    lines: [{ label: 'Balance', value: '₹12,000' }],
    links: [{ label: 'Pay now', href: 'https://neramclasses.com/enroll?token=SECRET123', primary: true }],
  },
};

const cutoffCard: AskCard = {
  id: 'cutoff-1',
  kind: 'cutoff',
  href: '/tools/nata/cutoff-calculator',
  data: { total: 300, board200: 180, nata: 120, boardPercent: 90, boardEligible: true, boardLabel: 'CBSE', marks: 450, boardMax: 500, nataExplanation: 'One attempt' },
};

describe('account cards (the in-app Aintra jobs)', () => {
  it('are stored with their type only, never a link or a figure', () => {
    const stored = redactForStorage([feesCard, cutoffCard]);
    expect(stored[0]).toEqual({ id: 'account-1', kind: 'account', data: { kind: 'links' }, redacted: true });
    expect(JSON.stringify(stored[0])).not.toContain('SECRET123');
    expect(JSON.stringify(stored[0])).not.toContain('12,000');
    // Other cards are kept whole.
    expect(stored[1]).toEqual(cutoffCard);
  });

  it('never repeat their contents in the history sent back to the model', () => {
    const line = cardSummary(feesCard);
    expect(line).toContain('Account card shown');
    expect(line).not.toContain('SECRET123');
    expect(line).not.toContain('12,000');
  });
});
