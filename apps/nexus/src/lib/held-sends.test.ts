import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHeldSends } from './held-sends';

describe('createHeldSends: an outward message with an undo window', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  type Commit = (key: string, payload: { reaction: string }) => Promise<void>;
  const setup = (commit = vi.fn<Parameters<Commit>, ReturnType<Commit>>(async () => {})) => {
    const onError = vi.fn();
    const onCommitted = vi.fn();
    const sends = createHeldSends<{ reaction: string }>({ holdMs: 4000, commit, onError, onCommitted });
    return { sends, commit, onError, onCommitted };
  };

  it('sends nothing during the window, then sends once', async () => {
    const { sends, commit, onCommitted } = setup();
    sends.hold('a', { reaction: 'wow' });
    await vi.advanceTimersByTimeAsync(3999);
    expect(commit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith('a', { reaction: 'wow' });
    expect(onCommitted).toHaveBeenCalledWith('a', { reaction: 'wow' });
    expect(sends.isHeld('a')).toBe(false);
  });

  it('undo inside the window means the student is never messaged', async () => {
    const { sends, commit } = setup();
    sends.hold('a', { reaction: 'wow' });
    expect(sends.undo('a')).toEqual({ reaction: 'wow' });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(commit).not.toHaveBeenCalled();
    expect(sends.undo('a')).toBeNull();
  });

  it('a second tap on the same sketch replaces the first, so a mis-tap sends nothing', async () => {
    const { sends, commit } = setup();
    sends.hold('a', { reaction: 'heart' });
    await vi.advanceTimersByTimeAsync(2000);
    sends.hold('a', { reaction: 'wow' });
    await vi.advanceTimersByTimeAsync(2000);
    expect(commit).not.toHaveBeenCalled(); // the window restarted
    await vi.advanceTimersByTimeAsync(2000);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith('a', { reaction: 'wow' });
  });

  it('keeps different sketches independent', async () => {
    const { sends, commit } = setup();
    sends.hold('a', { reaction: 'heart' });
    sends.hold('b', { reaction: 'fire' });
    sends.undo('a');
    await vi.advanceTimersByTimeAsync(4000);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith('b', { reaction: 'fire' });
  });

  it('flush sends everything held at once, for a teacher closing the tab', async () => {
    const { sends, commit } = setup();
    sends.hold('a', { reaction: 'heart' });
    sends.hold('b', { reaction: 'fire' });
    sends.flush();
    expect(commit).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(commit).toHaveBeenCalledTimes(2); // the timers were cancelled, no double send
  });

  it('reports a failed send with its payload, so the screen can offer Retry', async () => {
    const boom = new Error('offline');
    const { sends, onError, onCommitted } = setup(vi.fn<Parameters<Commit>, ReturnType<Commit>>(async () => { throw boom; }));
    sends.hold('a', { reaction: 'wow' });
    await vi.advanceTimersByTimeAsync(4000);
    expect(onError).toHaveBeenCalledWith('a', { reaction: 'wow' }, boom);
    expect(onCommitted).not.toHaveBeenCalled();
  });

  it('sendNow skips the window, for Retry', async () => {
    const { sends, commit } = setup();
    sends.hold('a', { reaction: 'heart' });
    sends.sendNow('a', { reaction: 'fire' });
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith('a', { reaction: 'fire' });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('dispose cancels quietly without sending', async () => {
    const { sends, commit } = setup();
    sends.hold('a', { reaction: 'heart' });
    sends.dispose();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(commit).not.toHaveBeenCalled();
  });
});
