import { describe, it, expect } from 'vitest';
import { mapWithConcurrency, deadline } from './concurrency';

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

describe('mapWithConcurrency', () => {
  it('visits every item exactly once', async () => {
    const items = Array.from({ length: 25 }, (_, i) => i);
    const seen: number[] = [];

    await mapWithConcurrency(items, 4, async (n) => {
      await tick();
      seen.push(n);
    });

    expect(seen).toHaveLength(items.length);
    expect([...seen].sort((a, b) => a - b)).toEqual(items);
  });

  it('never exceeds the concurrency limit', async () => {
    let inFlight = 0;
    let peak = 0;

    await mapWithConcurrency(Array.from({ length: 30 }, (_, i) => i), 5, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await tick(1);
      inFlight--;
    });

    expect(peak).toBeLessThanOrEqual(5);
    // Guards against a "limit" that silently serialises: a real pool should
    // saturate on 30 items, and a regression to one-at-a-time would read 1.
    expect(peak).toBeGreaterThan(1);
  });

  it('spawns no more workers than there are items', async () => {
    let started = 0;
    await mapWithConcurrency([1, 2], 10, async () => {
      started++;
      await tick();
    });
    expect(started).toBe(2);
  });

  it('handles an empty list without hanging', async () => {
    await expect(mapWithConcurrency([], 4, async () => {})).resolves.toBeUndefined();
  });

  it('propagates a rejection rather than swallowing it', async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error('boom');
      })
    ).rejects.toThrow('boom');
  });
});

describe('deadline', () => {
  it('is not expired immediately', () => {
    expect(deadline(1_000).expired()).toBe(false);
  });

  it('expires once the budget is spent', async () => {
    const clock = deadline(10);
    await tick(25);
    expect(clock.expired()).toBe(true);
  });

  it('reports elapsed time that only moves forward', async () => {
    const clock = deadline(1_000);
    const first = clock.elapsedMs();
    await tick(5);
    expect(clock.elapsedMs()).toBeGreaterThanOrEqual(first);
  });

  it('treats a zero budget as already spent, so a caller cannot loop forever', () => {
    expect(deadline(0).expired()).toBe(true);
  });
});
