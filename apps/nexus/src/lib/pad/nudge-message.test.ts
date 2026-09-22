// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { nudgeMessage, nudgeResultMessage } from './nudge-message';

describe('nudgeMessage', () => {
  it('asks politely, says a guess is fine and shows the way out, with no dashes', () => {
    const { subject, plain } = nudgeMessage('Q.38');
    expect(subject).toBe('Q.38 is waiting for your answer');
    expect(plain).toBe(
      "Hi {firstName}, we're on Q.38 in class now. Please answer on the Answer Pad in the meeting. A guess is fine, or tap I can't answer and tell me why.",
    );
    expect(`${subject} ${plain}`).not.toMatch(/[–—]|--/);
  });
});

describe('nudgeResultMessage', () => {
  it('says how many were reached on the pad and how many by chat', () => {
    expect(nudgeResultMessage({ inPad: 4, chat: 3, chatDelivered: 3 })).toBe('Nudged 4 on their pad and 3 by Teams chat.');
    expect(nudgeResultMessage({ inPad: 2, chat: 0, chatDelivered: 0 })).toBe('Nudged 2 on their pad.');
    expect(nudgeResultMessage({ inPad: 0, chat: 1, chatDelivered: 1 })).toBe('Nudged 1 by Teams chat.');
  });

  it('owns up to chats that could not be sent, and says where those students hear instead', () => {
    expect(nudgeResultMessage({ inPad: 0, chat: 3, chatDelivered: 1 })).toBe(
      'Nudged 3 by Teams chat. 2 chats could not be sent, so they get a Nexus notification instead.',
    );
    expect(nudgeResultMessage({ inPad: 1, chat: 1, chatDelivered: 0 })).toBe(
      'Nudged 1 on their pad and 1 by Teams chat. 1 chat could not be sent, so that student gets a Nexus notification instead.',
    );
  });

  it('says when there was nobody left to nudge', () => {
    expect(nudgeResultMessage({ inPad: 0, chat: 0, chatDelivered: 0 })).toBe('Everyone has answered or said why not.');
  });
});
