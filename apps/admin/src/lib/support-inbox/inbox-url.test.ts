// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DEFAULT_INBOX_STATE, cleanTicketRef, inboxSearch, listApiQuery, parseInboxUrl } from './inbox-url';

describe('parseInboxUrl', () => {
  it('reads every field', () => {
    expect(parseInboxUrl('?queue=waiting&ticket=neram-tkt-00001&q=login&assignee=me&source=app&category=technical_issue&priority=high')).toEqual({
      queue: 'waiting',
      ticket: 'NERAM-TKT-00001',
      q: 'login',
      assignee: 'me',
      source: 'app',
      category: 'technical_issue',
      priority: 'high',
    });
  });

  it('falls back to defaults for unknown values', () => {
    expect(parseInboxUrl('?queue=bogus&assignee=root&source=x&category=y&priority=urgent&ticket=1;drop')).toEqual(DEFAULT_INBOX_STATE);
    expect(parseInboxUrl('')).toEqual(DEFAULT_INBOX_STATE);
  });

  it('still opens the bell\'s older ?highlight=<uuid> links', () => {
    expect(parseInboxUrl('highlight=11111111-2222-4333-8444-555555555555').ticket).toBe('11111111-2222-4333-8444-555555555555');
    expect(parseInboxUrl('ticket=NERAM-TKT-00002&highlight=11111111-2222-4333-8444-555555555555').ticket).toBe('NERAM-TKT-00002');
  });
});

describe('inboxSearch', () => {
  it('leaves defaults out', () => {
    expect(inboxSearch(DEFAULT_INBOX_STATE)).toBe('');
    expect(inboxSearch({ ...DEFAULT_INBOX_STATE, ticket: 'NERAM-TKT-00001' })).toBe('?ticket=NERAM-TKT-00001');
  });

  it('round-trips through parseInboxUrl', () => {
    const state = { queue: 'closed' as const, ticket: 'NERAM-TKT-00042', q: 'otp code', assignee: 'unassigned' as const, source: 'nexus', category: 'account_issue', priority: 'low' };
    expect(parseInboxUrl(inboxSearch(state))).toEqual(state);
  });
});

describe('listApiQuery', () => {
  it('always names the queue and page, counts only when asked', () => {
    const q = new URLSearchParams(listApiQuery({ ...DEFAULT_INBOX_STATE, q: ' pay ' }, 2, true));
    expect(q.get('queue')).toBe('new');
    expect(q.get('page')).toBe('2');
    expect(q.get('q')).toBe('pay');
    expect(q.get('counts')).toBe('1');
    expect(new URLSearchParams(listApiQuery(DEFAULT_INBOX_STATE, 1, false)).get('counts')).toBeNull();
  });
});

describe('cleanTicketRef', () => {
  it('accepts numbers and UUIDs only', () => {
    expect(cleanTicketRef(' NERAM-TKT-00001 ')).toBe('NERAM-TKT-00001');
    expect(cleanTicketRef('11111111-2222-4333-8444-55555555555A')).toBe('11111111-2222-4333-8444-55555555555a');
    expect(cleanTicketRef('TKT-1')).toBeNull();
    expect(cleanTicketRef(null)).toBeNull();
  });
});
