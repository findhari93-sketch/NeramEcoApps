import { describe, it, expect } from 'vitest';
import { parseTeamsChatId, parseTeamsChannelId } from './teams-ids';

describe('parseTeamsChatId', () => {
  it('returns a raw group-chat thread id unchanged', () => {
    expect(parseTeamsChatId('19:ffc6d50b68c94eeb99b53ffefc79092f@thread.v2')).toBe(
      '19:ffc6d50b68c94eeb99b53ffefc79092f@thread.v2'
    );
  });

  it('extracts the id from a plain chat deep link', () => {
    const link =
      'https://teams.microsoft.com/l/chat/19:ffc6d50b68c94eeb99b53ffefc79092f@thread.v2/0?tenantId=abc';
    expect(parseTeamsChatId(link)).toBe('19:ffc6d50b68c94eeb99b53ffefc79092f@thread.v2');
  });

  it('extracts the id from a percent-encoded deep link', () => {
    const link =
      'https://teams.microsoft.com/l/chat/19%3Affc6d50b68c94eeb99b53ffefc79092f%40thread.v2/0';
    expect(parseTeamsChatId(link)).toBe('19:ffc6d50b68c94eeb99b53ffefc79092f@thread.v2');
  });

  it('trims surrounding whitespace', () => {
    expect(parseTeamsChatId('  19:abc@thread.v2  ')).toBe('19:abc@thread.v2');
  });

  it('returns null for input with no thread id', () => {
    expect(parseTeamsChatId('not a chat link')).toBeNull();
    expect(parseTeamsChatId('')).toBeNull();
    expect(parseTeamsChatId(null)).toBeNull();
    expect(parseTeamsChatId(undefined)).toBeNull();
  });
});

describe('parseTeamsChannelId', () => {
  it('extracts a tacv2 channel id from a channel deep link', () => {
    const link =
      'https://teams.microsoft.com/l/channel/19%3A6ccb315ce0c547beaeff58ecf16dafea%40thread.tacv2/Class%20Meeting%20Details?groupId=7e3b262b';
    expect(parseTeamsChannelId(link)).toBe('19:6ccb315ce0c547beaeff58ecf16dafea@thread.tacv2');
  });

  it('returns a raw channel id unchanged', () => {
    expect(parseTeamsChannelId('19:6ccb315ce0c547beaeff58ecf16dafea@thread.tacv2')).toBe(
      '19:6ccb315ce0c547beaeff58ecf16dafea@thread.tacv2'
    );
  });
});
