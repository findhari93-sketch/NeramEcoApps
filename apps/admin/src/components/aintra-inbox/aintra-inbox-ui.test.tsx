/**
 * Render tests for the Aintra Inbox review pieces: Mark resolved and Undo on a
 * question, the "Resolve all credits ran out" confirm, the gold ring for an
 * enrolled student, and the automatic sign-in status on a guest.
 */
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import Transcript from './Transcript';
import ConversationList from './ConversationList';
import PersonPanel from './PersonPanel';
import type { InboxConversation, InboxPerson, InboxTurn } from '@/lib/aintra-inbox/types';

const NOW = new Date('2026-10-17T06:00:00Z');

const conv = (over: Partial<InboxConversation> = {}): InboxConversation => ({
  id: 's1', personKey: 'a:anon', userId: null, anonymousId: 'anon_x', isGuest: true, name: 'Guest', guestTag: '#DFFB',
  initials: '', avatarUrl: null, enrolled: false, phone: null, startedAt: '2026-10-15T15:54:00Z', lastAt: '2026-10-15T15:54:00Z',
  bucket: 'week', place: 'Madurai, Tamil Nadu', stateName: 'Tamil Nadu', channel: null, device: null, source: 'general_chatbot',
  questions: ['What are class timings?'], turnStatuses: ['error'], lastQuestion: 'What are class timings?', turnCount: 1,
  intents: [], status: 'error', reviewCount: 0, errorCount: 1, creditErrorCount: 1, queueAt: ['2026-10-15T15:54:00Z'],
  gatedAt: null, ...over,
});

const turn = (over: Partial<InboxTurn> = {}): InboxTurn => ({
  id: 't1', at: '2026-10-15T15:54:00Z', question: 'What are class timings?', answer: null, error: 'CREDITS_DEPLETED',
  status: 'error', thumbsUp: null, correction: null, correctedByName: null, correctedAt: null, resolvedAt: null,
  resolvedByName: null, promotedToKb: false, aiReview: null, model: null, responseMs: null, tools: [], pageUrl: '/', ...over,
});

const person = (over: Partial<InboxPerson> = {}): InboxPerson => ({
  key: 'a:anon', userId: null, anonymousId: 'anon_x', isGuest: true, name: 'Guest', guestTag: '#DFFB', initials: '',
  phone: null, email: null, avatarUrl: null, enrolled: false, profileLabel: null, joinedAt: null, place: 'Madurai, Tamil Nadu',
  channel: null, device: null, visits: 1, firstSeen: '2026-10-15T15:54:00Z', lastAt: '2026-10-15T15:54:00Z',
  lastQuestion: 'What are class timings?', lastConversationId: 's1', intents: [], stage: 'Warm', nudge: null, gatedAt: null, ...over,
});

let fetchMock: Mock;

beforeEach(() => {
  fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}'));
    return {
      ok: true,
      json: async () => ({
        data: {
          thumbs_up: null, admin_correction: null, corrected_by_name: null, corrected_at: null, promoted_to_kb: false,
          resolved_at: body.resolved ? NOW.toISOString() : null,
          resolved_by_name: body.resolved ? 'Hari Babu' : null,
        },
      }),
    };
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Transcript: Mark resolved', () => {
  it('resolves an unanswered question, and Undo puts it back', async () => {
    const onTurnChange = vi.fn();
    const { rerender } = render(
      <Transcript conversation={conv()} turns={[turn()]} loading={false} error={null} onTurnChange={onTurnChange} notify={vi.fn()} />
    );
    expect(screen.getByText('No answer delivered: credits ran out')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Mark resolved' }));
    await waitFor(() => expect(onTurnChange).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ resolved: true });
    const resolved = onTurnChange.mock.calls[0][0] as InboxTurn;
    expect(resolved.status).toBe('resolved');
    expect(resolved.resolvedByName).toBe('Hari Babu');

    rerender(<Transcript conversation={conv()} turns={[resolved]} loading={false} error={null} onTurnChange={onTurnChange} notify={vi.fn()} />);
    expect(screen.getByText(/Resolved: credits ran out, no answer needed/)).toBeTruthy();
    expect(screen.queryByText('No answer delivered: credits ran out')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mark resolved' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(onTurnChange).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ resolved: false });
    expect((onTurnChange.mock.calls[1][0] as InboxTurn).status).toBe('error');
  });

  it('a guest asked to sign in shows that, with no review buttons', () => {
    render(
      <Transcript
        conversation={conv({ status: 'gated', turnStatuses: ['gated'], errorCount: 0, creditErrorCount: 0, queueAt: [] })}
        turns={[turn({ error: 'SIGNUP_REQUIRED', status: 'gated' })]}
        loading={false}
        error={null}
        onTurnChange={vi.fn()}
        notify={vi.fn()}
      />
    );
    expect(screen.getByText('Asked to sign in first')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Mark resolved' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Write answer' })).toBeNull();
  });

  it('an enrolled student gets the gold ring and the Enrolled student pill', () => {
    const { container } = render(
      <Transcript
        conversation={conv({ isGuest: false, userId: 'u1', name: 'Kunisetty Radhika', initials: 'KR', enrolled: true, avatarUrl: 'https://x/r.jpg' })}
        turns={[]}
        loading={false}
        error={null}
        onTurnChange={vi.fn()}
        notify={vi.fn()}
      />
    );
    expect(screen.getByText('Enrolled student')).toBeTruthy();
    expect(container.querySelector('[title="Enrolled student"]')).toBeTruthy();
  });
});

describe('ConversationList: Resolve all credits ran out', () => {
  it('asks first, then resolves', async () => {
    const onResolveCredits = vi.fn(async () => undefined);
    render(
      <ConversationList
        loading={false}
        conversations={[conv(), conv({ id: 's2', creditErrorCount: 2, errorCount: 2 })]}
        segment="all"
        onSegment={vi.fn()}
        status="error"
        onStatus={vi.fn()}
        query=""
        onQuery={vi.fn()}
        selectedId={null}
        onSelect={vi.fn()}
        now={NOW}
        onResolveCredits={onResolveCredits}
      />
    );
    expect(screen.getByText(/3 questions got no answer while AI credits were out/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Resolve all' }));
    expect(onResolveCredits).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Resolve 3' }));
    await waitFor(() => expect(onResolveCredits).toHaveBeenCalledTimes(1));
  });

  it('shows no banner on other filters', () => {
    render(
      <ConversationList loading={false} conversations={[conv()]} segment="all" onSegment={vi.fn()} status="all" onStatus={vi.fn()}
        query="" onQuery={vi.fn()} selectedId={null} onSelect={vi.fn()} now={NOW} onResolveCredits={vi.fn()} />
    );
    expect(screen.queryByRole('button', { name: 'Resolve all' })).toBeNull();
  });
});

describe('PersonPanel: sign-in is automatic', () => {
  it('a first-day guest: no manual button, says what will happen', () => {
    render(<PersonPanel person={person()} conversation={conv()} notify={vi.fn()} />);
    expect(screen.getByText(/Aintra is free on their first day/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Ask to sign up/ })).toBeNull();
  });

  it('a guest who came back was asked to sign in', () => {
    render(<PersonPanel person={person({ gatedAt: '2026-10-16T05:00:00Z' })} conversation={conv()} notify={vi.fn()} />);
    expect(screen.getByText('Asked to sign in')).toBeTruthy();
    expect(screen.getByText(/Came back on 16 Oct/)).toBeTruthy();
  });

  it('an enrolled student says so', () => {
    render(
      <PersonPanel
        person={person({ isGuest: false, userId: 'u1', name: 'Kunisetty Radhika', initials: 'KR', enrolled: true, stage: 'Enrolled' })}
        conversation={conv({ isGuest: false, userId: 'u1' })}
        notify={vi.fn()}
      />
    );
    expect(screen.getByText('Enrolled Neram student')).toBeTruthy();
  });
});
