import { describe, expect, it } from 'vitest';
import { addRecent, readRecent, type KeyValueStore } from './inspiration-recent';

function memory(initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
}

describe('recent searches', () => {
  it('survives junk and a missing store', () => {
    expect(readRecent(memory({ 'inspiration:recent': '{not json' }))).toEqual([]);
    expect(readRecent(memory({ 'inspiration:recent': '[1, "bag"]' }))).toEqual(['bag']);
    expect(readRecent(null)).toEqual([]);
    expect(addRecent(null, 'bag')).toEqual(['bag']);
  });

  it('keeps the newest five, without case duplicates', () => {
    const store = memory();
    for (const q of ['one', 'two', 'three', 'four', 'five', 'six', 'TWO']) addRecent(store, q);
    expect(readRecent(store)).toEqual(['TWO', 'six', 'five', 'four', 'three']);
  });

  it('ignores blank searches', () => {
    const store = memory();
    expect(addRecent(store, '   ')).toEqual([]);
  });
});
