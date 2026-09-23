import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PeerAttempts from './PeerAttempts';

/**
 * "See how others drew this", and the gate in front of it.
 *
 * The founder's shape: in the exam a student gets a question they have never
 * seen, so drawing blind is the skill. But a student who has never seen what a
 * good answer looks like may never start. So the door is open, it sits behind
 * their own upload, and going through it early is recorded rather than refused.
 *
 * The count is shown while locked and the drawings are not. "Four people have
 * drawn this" is an invitation; a drawing is somebody's work.
 */

const card = (id: string) => ({
  id,
  kind: 'submission_original',
  imageUrl: `https://cdn/${id}.jpg`,
  thumbnailUrl: null,
  aspect: null,
  title: 'Street View',
  alt: `Student drawing: ${id}`,
  brief: null,
  credit: 'Priya, 2027',
  badge: null,
  typeSlugs: [],
  tagLabels: [],
  examTypes: [],
  years: [],
  featured: false,
  saved: false,
  saveCount: 0,
  createdAt: '2026-09-01T00:00:00Z',
});

function serve(payload: { locked: boolean; total: number; items: unknown[] }) {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ data: payload }),
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const getToken = async () => 't';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PeerAttempts', () => {
  it('fetches nothing until the student asks', () => {
    const fetchMock = serve({ locked: true, total: 3, items: [] });

    render(
      <PeerAttempts questionId="q81" unlocked={false} onReveal={vi.fn()} getToken={getToken} />,
    );

    // Most drawing questions are opened and never compared. A call per opened
    // question would be a function invocation per question read.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('counts the drawings without showing one while locked', async () => {
    serve({ locked: true, total: 3, items: [card('a'), card('b')] });

    render(
      <PeerAttempts questionId="q81" unlocked={false} onReveal={vi.fn()} getToken={getToken} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'See how others drew this' }));

    expect(await screen.findByText('3 students have drawn this')).not.toBeNull();
    // The server sends no images while locked. If it ever did, this is where
    // it would leak.
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('records the choice to look first', async () => {
    serve({ locked: true, total: 3, items: [] });
    const onReveal = vi.fn();

    render(
      <PeerAttempts questionId="q81" unlocked={false} onReveal={onReveal} getToken={getToken} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'See how others drew this' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Show me anyway' }));

    expect(onReveal).toHaveBeenCalled();
  });

  it('shows the drawings once it is open', async () => {
    serve({ locked: false, total: 2, items: [card('a'), card('b')] });

    render(
      <PeerAttempts questionId="q81" unlocked onReveal={vi.fn()} getToken={getToken} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'See how others drew this' }));

    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(2));
    expect(screen.getAllByText('Priya, 2027')).toHaveLength(2);
  });

  it('invites the student to be the first when nobody has drawn it', async () => {
    serve({ locked: false, total: 0, items: [] });

    render(
      <PeerAttempts questionId="q81" unlocked onReveal={vi.fn()} getToken={getToken} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'See how others drew this' }));

    expect(await screen.findByText('Nobody has drawn this one yet')).not.toBeNull();
  });

  it('asks for the one option the student is practising', async () => {
    const fetchMock = serve({ locked: false, total: 0, items: [] });

    render(
      <PeerAttempts questionId="q81" partKey="b" unlocked onReveal={vi.fn()} getToken={getToken} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'See how others drew this' }));

    // Peers of 81B are the people who drew 81B, not the people who drew 81A.
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String((fetchMock.mock.calls[0] as unknown as string[])[0])).toContain('part=b');
  });
});
