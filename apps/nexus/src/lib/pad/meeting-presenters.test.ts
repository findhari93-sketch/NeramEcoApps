import { describe, expect, it } from 'vitest';
import { stateOf } from './meeting-presenters';

describe('pad presenter state', () => {
  it('treats organizer-only and teachers-only as locked', () => {
    expect(stateOf('organizer')).toBe('locked');
    expect(stateOf('roleIsPresenter')).toBe('locked');
  });

  it('treats everyone and the whole organization as open, since students are in the organization', () => {
    expect(stateOf('everyone')).toBe('open');
    expect(stateOf('organization')).toBe('open');
  });

  it('is unknown when the meeting could not be read', () => {
    expect(stateOf(null)).toBe('unknown');
  });
});
