import { describe, it, expect } from 'vitest';
import { clock, describeTrimSaving } from './recap-trim-saving';

describe('describeTrimSaving', () => {
  it('says what the 14 Oct JEE class saved', () => {
    // 3231 s on the player, 714 s cut from the start.
    expect(describeTrimSaving(3231, 714)).toEqual({
      watch: '53:51',
      original: '1:05:45',
      savedMinutes: 12,
    });
  });

  it('says nothing for an untrimmed or barely trimmed class', () => {
    expect(describeTrimSaving(3231, null)).toBeNull();
    expect(describeTrimSaving(3231, 0)).toBeNull();
    expect(describeTrimSaving(3231, 59)).toBeNull();
  });

  it('says nothing when the recap length is unknown', () => {
    expect(describeTrimSaving(null, 714)).toBeNull();
    expect(describeTrimSaving(0, 714)).toBeNull();
  });
});

describe('clock', () => {
  it('matches the player under and over an hour', () => {
    expect(clock(59)).toBe('0:59');
    expect(clock(3231)).toBe('53:51');
    expect(clock(3600)).toBe('1:00:00');
    expect(clock(3945.34)).toBe('1:05:45');
  });
});
