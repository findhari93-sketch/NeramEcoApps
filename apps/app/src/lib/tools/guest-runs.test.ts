import { describe, it, expect } from 'vitest';
import { guestRunState, recordGuestRun } from './guest-runs';

function memoryStore() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

const TOOL = 'nata-cutoff-calculator';

describe('guest free runs', () => {
  it('allows two settled calculations, then locks a third new one', () => {
    const store = memoryStore();
    expect(guestRunState(TOOL, 'a', store)).toMatchObject({ available: true, used: 0, remaining: 2, locked: false });
    expect(recordGuestRun(TOOL, 'a', store)).toMatchObject({ used: 1, remaining: 1, locked: false });
    expect(recordGuestRun(TOOL, 'b', store)).toMatchObject({ used: 2, remaining: 0, locked: false });
    expect(guestRunState(TOOL, 'c', store)).toMatchObject({ used: 2, locked: true });
    // Recording a locked run changes nothing.
    expect(recordGuestRun(TOOL, 'c', store)).toMatchObject({ used: 2, locked: true });
  });

  it('never charges twice for the same inputs, so going back to them stays free', () => {
    const store = memoryStore();
    recordGuestRun(TOOL, 'a', store);
    recordGuestRun(TOOL, 'a', store);
    expect(guestRunState(TOOL, null, store)).toMatchObject({ used: 1, remaining: 1 });
    recordGuestRun(TOOL, 'b', store);
    expect(guestRunState(TOOL, 'a', store).locked).toBe(false);
    expect(guestRunState(TOOL, 'b', store).locked).toBe(false);
  });

  it('is not locked while nothing is entered', () => {
    const store = memoryStore();
    recordGuestRun(TOOL, 'a', store);
    recordGuestRun(TOOL, 'b', store);
    expect(guestRunState(TOOL, null, store).locked).toBe(false);
  });

  it('reports unavailable when storage is missing or throws, so the page keeps the demo', () => {
    expect(guestRunState(TOOL, 'a', null).available).toBe(false);
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    // A read that throws looks like no runs yet; the write failing marks it unavailable.
    expect(recordGuestRun(TOOL, 'a', throwing).available).toBe(false);
  });

  it('ignores garbage in storage', () => {
    const store = memoryStore();
    store.setItem('neram_tool_trial:' + TOOL, '{not json');
    expect(guestRunState(TOOL, 'a', store)).toMatchObject({ used: 0, locked: false });
  });

  it('has no trial for tools without a limit', () => {
    expect(guestRunState('nata-image-crop', 'a', memoryStore()).available).toBe(false);
  });
});
