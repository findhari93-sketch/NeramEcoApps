import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TestMessageDialog from './TestMessageDialog';

/**
 * The reopen sheet, after 11 Sept.
 *
 * That day a Reopen button used three days nobody picked and told students only
 * through the bell, then a separate Message said "Reached nobody 3" about three
 * students skipped on purpose. These pin the one sheet that replaced both.
 */

vi.mock('@/components/students/StudentStageFactsProvider', () => ({
  useStudentStageFacts: () => ({
    ready: true,
    factsFor: (id: string | null | undefined) => (id === 'dhriti' ? { dormant: true } : null),
  }),
}));

const RECEIPT = {
  counts: { total: 2, chat: 0, teams: 0, inapp: 1, email: 0, failed: 1, skipped: 1, unreached: 0 },
  results: [
    { studentId: 'asha', name: 'Asha Kumar', chat: false, teams: false, inapp: true, email: false, ok: true, channel: 'inapp' },
    { studentId: 'dhriti', name: 'Dhriti', chat: false, teams: false, inapp: false, email: false, ok: false, channel: 'dormant' },
  ],
  reopened: 1,
  closes_at: '2026-09-14T18:29:59.000Z',
  skipped_dormant: [{ id: 'dhriti', name: 'Dhriti' }],
  reasons: {
    chat: [{ reason: 'Could not start the chat (403 Forbidden)', count: 1 }],
    teams: [],
    email: [],
  },
};

function mount(props: Record<string, unknown> = {}) {
  const authFetch = vi.fn(async () => ({ data: RECEIPT }));
  const onSent = vi.fn();
  render(
    <TestMessageDialog
      open
      onClose={() => {}}
      mode="reopen"
      placementId="run-1"
      recipients={[
        { id: 'asha', name: 'Asha Kumar' },
        { id: 'dhriti', name: 'Dhriti' },
      ]}
      testTitle="Indus Valley"
      passMark={80}
      dueLabel="18 Aug"
      initialTemplate="missed"
      authFetch={authFetch as never}
      onSent={onSent}
      {...props}
    />,
  );
  return { authFetch, onSent };
}

async function sendIt() {
  fireEvent.click(screen.getByRole('button', { name: 'Review' }));
  fireEvent.click(await screen.findByRole('button', { name: /Reopen and send/ }));
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('TestMessageDialog in reopen mode', () => {
  it('opens on 3 days and says when it closes', () => {
    mount();
    expect(screen.getByRole('button', { name: '3 days' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getAllByText(/^Open until /).length).toBeGreaterThan(0);
  });

  it('names the dormant student and includes them unless switched off', () => {
    mount();
    expect(screen.getByText(/1 is marked dormant: Dhriti\./)).not.toBeNull();
    const include = screen.getByRole('checkbox', { name: 'Include them' }) as HTMLInputElement;
    expect(include.checked).toBe(true);
  });

  it('puts the deadline into the message itself', () => {
    mount();
    expect(screen.getByText(/It is open until .*, so please finish it before then\./)).not.toBeNull();
  });

  it('sends the reopen, its deadline, the dormant choice and the class post in one request', async () => {
    const { authFetch } = mount();
    await sendIt();

    await waitFor(() => expect(authFetch).toHaveBeenCalled());
    const [url, init] = authFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/tests/runs/run-1/message');
    const body = JSON.parse(String(init.body));
    expect(body.also_reopen).toBe(true);
    expect(body.closes_at).toMatch(/T18:29:59\.000Z$/);
    expect(body.include_dormant).toBe(true);
    expect(body.channels.group).toBe(true);
    expect(body.template).toBe('missed');
    expect(body.student_ids).toEqual(['asha', 'dhriti']);
  });

  it('remembers a class post the teacher switched off', async () => {
    window.localStorage.setItem('nexus.reopen.groupPost', 'false');
    const { authFetch } = mount();
    await sendIt();

    await waitFor(() => expect(authFetch).toHaveBeenCalled());
    const body = JSON.parse(String((authFetch.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.channels.group).toBe(false);
  });

  it('reports a dormant skip as a skip, says why Teams chat failed, and hands back a summary', async () => {
    const { onSent } = mount();
    await sendIt();

    expect(await screen.findByText('Skipped (dormant) 1')).not.toBeNull();
    expect(screen.queryByText(/Reached nobody/)).toBeNull();
    expect(screen.getByText(/Teams chat did not send for 1: Could not start the chat/)).not.toBeNull();
    expect(onSent).toHaveBeenCalledWith(
      expect.objectContaining({ reopened: 1, closesAt: '2026-09-14T18:29:59.000Z', skipped: 1 }),
    );
  });
});

describe('TestMessageDialog in message mode', () => {
  it('does not reopen or ask for a date unless switched on', async () => {
    const { authFetch } = mount({ mode: 'message', initialTemplate: 'redo' });
    expect(screen.queryByRole('button', { name: '3 days' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    fireEvent.click(await screen.findByRole('button', { name: /Send it/ }));

    await waitFor(() => expect(authFetch).toHaveBeenCalled());
    const body = JSON.parse(String((authFetch.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.also_reopen).toBe(false);
    expect(body.closes_at).toBeUndefined();
  });
});
