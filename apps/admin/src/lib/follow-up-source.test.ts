import { describe, it, expect } from 'vitest';
import { aintraSessionFromNotes, examYearLabel, followUpKindLabel, followUpSourceLabel } from './follow-up-source';

describe('follow-up source', () => {
  it('names the request in words', () => {
    expect(followUpKindLabel(null)).toBe('Callback');
    expect(followUpKindLabel('post_demo')).toBe('After demo');
    expect(followUpKindLabel('b_arch_counselling')).toBe('B.Arch counselling');
    expect(followUpKindLabel('aintra_chat')).toBe('Callback');
    expect(followUpKindLabel('some_new_kind')).toBe('Some new kind');
  });

  it('says where it came from', () => {
    expect(followUpSourceLabel({ query_type: 'aintra_chat', source: 'aintra' })).toBe('Aintra chat');
    expect(followUpSourceLabel({ query_type: 'keam_arch_counselling', source: 'website_form' })).toBe('Counselling page form');
    expect(followUpSourceLabel({ query_type: 'application_help', source: 'website_form' })).toBe('Apply chat');
    expect(followUpSourceLabel({ query_type: 'demo_rebook', source: null })).toBe('Demo class desk');
    expect(followUpSourceLabel({ query_type: null, source: 'website_form' })).toBe('Website form');
    expect(followUpSourceLabel({ query_type: null, source: null, assigned_by_staff: true })).toBe('Scheduled by staff');
    expect(followUpSourceLabel({ query_type: null, source: null })).toBeNull();
  });

  it('marks an estimated exam year', () => {
    expect(examYearLabel(2027, 'stated')).toBe('2027 exam');
    expect(examYearLabel(2027, 'signup')).toBe('2027 exam (est.)');
    expect(examYearLabel(null, 'signup')).toBeNull();
  });

  it('finds the Aintra chat behind a callback', () => {
    expect(aintraSessionFromNotes('Aintra chat: chat_17293_abc. Fees question')).toBe('chat_17293_abc');
    expect(aintraSessionFromNotes('Called twice')).toBeNull();
    expect(aintraSessionFromNotes(null)).toBeNull();
  });
});
