import { describe, it, expect, beforeEach } from 'vitest';
import { savePendingInput, consumePendingInput, PENDING_INPUT_TTL_MS } from './pending-input';

describe('pending tool input', () => {
  beforeEach(() => sessionStorage.clear());

  it('returns what the demo saved, once', () => {
    savePendingInput('nata-cutoff-calculator', { boardPercent: 82, nataScore: 120 }, 1000);
    expect(consumePendingInput('nata-cutoff-calculator', 2000)).toEqual({ boardPercent: 82, nataScore: 120 });
    expect(consumePendingInput('nata-cutoff-calculator', 2000)).toBeNull();
  });

  it('keeps tools apart', () => {
    savePendingInput('nata-exam-centers', { state: 'kerala' }, 1000);
    expect(consumePendingInput('counseling-college-predictor', 1000)).toBeNull();
    expect(consumePendingInput('nata-exam-centers', 1000)).toEqual({ state: 'kerala' });
  });

  it('drops input older than 30 minutes', () => {
    savePendingInput('nata-exam-centers', { state: 'kerala' }, 0);
    expect(consumePendingInput('nata-exam-centers', PENDING_INPUT_TTL_MS + 1)).toBeNull();
  });

  it('ignores tampered or nested values', () => {
    sessionStorage.setItem('neram_tool_pending:x', JSON.stringify({ v: 1, ts: 0, input: { a: { b: 1 } } }));
    expect(consumePendingInput('x', 0)).toBeNull();
    sessionStorage.setItem('neram_tool_pending:y', 'not json');
    expect(consumePendingInput('y', 0)).toBeNull();
    sessionStorage.setItem('neram_tool_pending:z', JSON.stringify({ v: 2, ts: 0, input: {} }));
    expect(consumePendingInput('z', 0)).toBeNull();
  });
});
