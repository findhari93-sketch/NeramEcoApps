import { describe, it, expect } from 'vitest';
import { parseRecipientList } from './templates';

describe('parseRecipientList', () => {
  it('splits comma / semicolon / whitespace / newline and trims', () => {
    expect(parseRecipientList('a@x.com, b@y.com; c@z.com')).toEqual([
      'a@x.com',
      'b@y.com',
      'c@z.com',
    ]);
    expect(parseRecipientList('a@x.com\n b@y.com')).toEqual(['a@x.com', 'b@y.com']);
  });

  it('dedupes case-insensitively, keeping first-seen casing', () => {
    expect(parseRecipientList('Info@X.com, info@x.com, INFO@x.com')).toEqual(['Info@X.com']);
  });

  it('drops junk and empties', () => {
    expect(parseRecipientList('a@x.com, notanemail, , @nope, b@y.com')).toEqual([
      'a@x.com',
      'b@y.com',
    ]);
  });

  it('handles null / blank / single', () => {
    expect(parseRecipientList(null)).toEqual([]);
    expect(parseRecipientList(undefined)).toEqual([]);
    expect(parseRecipientList('   ')).toEqual([]);
    expect(parseRecipientList('one@two.com')).toEqual(['one@two.com']);
  });
});
