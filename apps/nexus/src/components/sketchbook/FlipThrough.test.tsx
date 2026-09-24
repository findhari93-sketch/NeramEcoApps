import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';

const swr = vi.fn();
// vi.hoisted: this factory returns `api` directly (not a lazy closure over it like the
// swr mock below), so it is read at mock-registration time, before imports run. Without
// vi.hoisted, `api` would still be in its temporal dead zone at that point.
const api = vi.hoisted(() => ({ flipSketch: vi.fn(async () => ({ ok: true })), reactToSketch: vi.fn(async () => ({ reaction: 'fire' })), featureSketch: vi.fn(), unfeatureSketch: vi.fn() }));
const badges = vi.hoisted(() => ({ refreshBadges: vi.fn() }));
vi.mock('@/lib/nexus-swr', () => ({ useAuthSWR: (...a: unknown[]) => swr(...a) }));
vi.mock('./sketchbook-api', async (importOriginal) => ({ ...(await importOriginal<typeof import('./sketchbook-api')>()), ...api }));
vi.mock('@/hooks/useNexusAuth', () => ({
  useNexusAuthContext: () => ({
    getToken: async () => 't', getTeacherToken: async () => 'teacher-t',
    classrooms: [{ id: 'c1', name: 'Class 1' }], activeClassroom: { id: 'c1', name: 'Class 1' }, impersonation: null,
  }),
}));
vi.mock('@/components/NavBadgeProvider', () => ({ useNavBadges: () => ({ refreshBadges: badges.refreshBadges, getBadgeCount: () => 0 }) }));
vi.mock('@/components/students/StudentStageFactsProvider', () => ({ useStudentStageFacts: () => ({ factsFor: () => null, ready: true }) }));
// Renders the name as an aria-label rather than text content: the real card also
// shows the student's name in a sibling Typography, and a plain `<div>{name}</div>`
// mock would collide with `getByText('Asha Rao')` (two elements with that exact text).
vi.mock('@/components/students/StudentStageAvatar', () => ({ default: ({ name }: { name?: string | null }) => <div aria-label={name ? `Avatar for ${name}` : 'Avatar'} /> }));

import FlipThrough, { ADVANCE_AFTER_MS, SWIPE_MIN_PX, UNDO_WINDOW_MS } from './FlipThrough';

const row = (id: string, name = 'Asha Rao') => ({
  id, student_id: 's1', original_image_url: `https://x/${id}.jpg`, thumbnail_url: null, self_note: 'a chair',
  reaction: null, submitted_at: '2026-09-09T10:00:00.000Z', is_gallery_visible: false,
  source_type: 'sketchbook', status: 'completed', assignment_id: null, reviewed_at: null,
  student: { id: 's1', name, avatar_url: null, ms_oid: null },
  featured: [],
});

const inbox = (...ids: string[]) => ({ data: { sketches: ids.map((id) => row(id)), remaining: 0 }, isLoading: false, mutate: vi.fn() });
const reactCalls = () => api.reactToSketch.mock.calls as unknown[][];
const skips = () => (api.flipSketch.mock.calls as unknown[][]).filter((c) => c[2] === 'skipped');

describe('FlipThrough', () => {
  beforeEach(() => {
    api.flipSketch.mockClear();
    api.reactToSketch.mockReset();
    api.reactToSketch.mockResolvedValue({ reaction: 'fire' });
    badges.refreshBadges.mockClear();
  });

  it('shows the first sketch with the student name and three reaction buttons', () => {
    swr.mockReturnValue(inbox('a', 'b'));
    render(<FlipThrough classroomId="c1" />);
    expect(screen.getByText('Asha Rao')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Nice' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Great' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Wow' })).toBeTruthy();
    expect(screen.getByText('1 of 2')).toBeTruthy();
  });

  it('Next moves on at once and records the skip in the background', async () => {
    swr.mockReturnValue(inbox('a', 'b'));
    render(<FlipThrough classroomId="c1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('2 of 2')).toBeTruthy();
    await waitFor(() => expect(skips()).toHaveLength(1));
    expect(skips()[0]).toEqual([expect.any(Function), 'a', 'skipped', { keepalive: true }]);
  });

  it('swiping left on the sketch flips to the next one, right goes back', () => {
    swr.mockReturnValue(inbox('a', 'b'));
    render(<FlipThrough classroomId="c1" />);
    const sketch = screen.getByTestId('flip-sketch');
    const swipe = (fromX: number, toX: number, dy = 0) => {
      fireEvent.touchStart(sketch, { touches: [{ clientX: fromX, clientY: 300 }] });
      fireEvent.touchMove(sketch, { touches: [{ clientX: toX, clientY: 300 + dy }] });
      fireEvent.touchEnd(sketch, { changedTouches: [{ clientX: toX, clientY: 300 + dy }] });
    };
    swipe(300, 300 - SWIPE_MIN_PX - 10);
    expect(screen.getByText('2 of 2')).toBeTruthy();
    swipe(100, 100 + SWIPE_MIN_PX + 10);
    expect(screen.getByText('1 of 2')).toBeTruthy();
    // Short or mostly vertical moves are page scrolls, not flips.
    swipe(300, 280);
    swipe(300, 200, 200);
    expect(screen.getByText('1 of 2')).toBeTruthy();
  });

  it('the dock labels every tool and Previous is off on the first card', () => {
    swr.mockReturnValue(inbox('a', 'b'));
    render(<FlipThrough classroomId="c1" />);
    for (const name of ['Previous', 'Comment', 'Feature', 'Next']) expect(screen.getByRole('button', { name })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Previous' }) as HTMLButtonElement).disabled).toBe(true);
    // No "Sent" line or chip in the dock: the card moves on and the Undo bar says it.
    expect(screen.queryByText(/^Sent /)).toBeNull();
  });

  it('says when everything has been flipped', () => {
    swr.mockReturnValue(inbox());
    render(<FlipThrough classroomId="c1" />);
    expect(screen.getByText('You have flipped through everything.')).toBeTruthy();
  });

  it('opens the full review for the card on screen', () => {
    swr.mockReturnValue({ data: { sketches: [row('11111111-1111-4111-8111-111111111111')], remaining: 0 }, isLoading: false, mutate: vi.fn() });
    render(<FlipThrough classroomId="22222222-2222-4222-8222-222222222222" />);
    expect(screen.getByRole('link', { name: 'Open review' }).getAttribute('href')).toBe(
      '/teacher/drawing-reviews/11111111-1111-4111-8111-111111111111?from=flip&classroom=22222222-2222-4222-8222-222222222222',
    );
  });

  // The inbox 500'd against production for days and this component answered with
  // a full-height grey skeleton: `isLoading || !data` is still true when a
  // fetch REJECTS, because fetchWithToken throws by design and SWR settles with
  // data undefined. No message, no retry, nothing in the console a teacher
  // could act on. ClassRhythmList has had this branch all along; this one did not.
  it('offers a retry when the inbox could not be loaded', () => {
    const mutate = vi.fn();
    swr.mockReturnValue({ data: undefined, error: new Error('boom'), isLoading: false, mutate });
    render(<FlipThrough classroomId="c1" />);
    expect(screen.getByText('Could not load the flip through')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mutate).toHaveBeenCalled();
  });

  it('still shows the skeleton while loading, with no error on screen', () => {
    swr.mockReturnValue({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() });
    render(<FlipThrough classroomId="c1" />);
    expect(screen.queryByText('Could not load the flip through')).toBeNull();
  });

  describe('instant reactions', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    const tick = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

    it('a reaction moves to the next sketch at once and sends after the undo window', async () => {
      swr.mockReturnValue(inbox('a', 'b'));
      render(<FlipThrough classroomId="c1" />);
      fireEvent.click(screen.getByRole('button', { name: 'Great' }));
      await tick(ADVANCE_AFTER_MS);
      expect(screen.getByText('2 of 2')).toBeTruthy();
      expect(screen.getByTestId('flip-status').textContent).toContain('Great for Asha');
      expect(api.reactToSketch).not.toHaveBeenCalled();

      await tick(UNDO_WINDOW_MS);
      expect(reactCalls()).toHaveLength(1);
      expect(reactCalls()[0].slice(1)).toEqual(['a', 'fire', undefined, { keepalive: true }]);
      const getter = reactCalls()[0][0] as () => Promise<string>;
      expect(await getter()).toBe('teacher-t');
      expect(badges.refreshBadges).toHaveBeenCalled();
      expect(screen.queryByTestId('flip-status')).toBeNull();
    });

    it('Undo inside the window sends nothing and returns to that sketch', async () => {
      swr.mockReturnValue(inbox('a', 'b'));
      render(<FlipThrough classroomId="c1" />);
      fireEvent.click(screen.getByRole('button', { name: 'Wow' }));
      await tick(ADVANCE_AFTER_MS);
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      expect(screen.getByText('1 of 2')).toBeTruthy();
      await tick(UNDO_WINDOW_MS * 2);
      expect(api.reactToSketch).not.toHaveBeenCalled();
      // The card no longer shows Wow as chosen.
      expect(screen.getByRole('button', { name: 'Wow' }).className).not.toMatch(/contained/i);
    });

    it('1, 2 and 3 react from the keyboard', async () => {
      swr.mockReturnValue(inbox('a', 'b', 'c'));
      render(<FlipThrough classroomId="c1" />);
      fireEvent.keyDown(window, { key: '3' });
      await tick(ADVANCE_AFTER_MS);
      expect(screen.getByText('2 of 3')).toBeTruthy();
      fireEvent.keyDown(window, { key: '1' });
      await tick(ADVANCE_AFTER_MS + UNDO_WINDOW_MS);
      expect(reactCalls().map((c) => [c[1], c[2]])).toEqual([['a', 'wow'], ['b', 'heart']]);
    });

    it('keeps Undo reachable after reacting to the last sketch', async () => {
      swr.mockReturnValue(inbox('a'));
      render(<FlipThrough classroomId="c1" />);
      fireEvent.click(screen.getByRole('button', { name: 'Nice' }));
      await tick(ADVANCE_AFTER_MS);
      expect(screen.getByText('You have flipped through everything.')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      expect(screen.getByText('1 of 1')).toBeTruthy();
    });

    it('a failed send says so and Retry sends it again', async () => {
      api.reactToSketch.mockRejectedValueOnce(new Error('offline'));
      swr.mockReturnValue(inbox('a', 'b'));
      render(<FlipThrough classroomId="c1" />);
      fireEvent.click(screen.getByRole('button', { name: 'Great' }));
      await tick(ADVANCE_AFTER_MS + UNDO_WINDOW_MS);
      expect(screen.getByTestId('flip-status').textContent).toContain('Could not send Great to Asha');
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      await tick(0);
      expect(reactCalls()).toHaveLength(2);
      expect(reactCalls()[1].slice(1)).toEqual(['a', 'fire', undefined, { keepalive: true }]);
    });

    it('a comment on its own goes through the same window and moves on', async () => {
      swr.mockReturnValue(inbox('a', 'b'));
      render(<FlipThrough classroomId="c1" />);
      fireEvent.click(screen.getByRole('button', { name: 'Comment' }));
      fireEvent.change(screen.getByLabelText('Comment'), { target: { value: 'Softer shadow' } });
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
      await tick(ADVANCE_AFTER_MS);
      expect(screen.getByText('2 of 2')).toBeTruthy();
      await tick(UNDO_WINDOW_MS);
      expect(reactCalls()[0].slice(1)).toEqual(['a', undefined, 'Softer shadow', { keepalive: true }]);
    });

    it('leaving the screen sends what is held instead of dropping it', async () => {
      swr.mockReturnValue(inbox('a', 'b'));
      const { unmount } = render(<FlipThrough classroomId="c1" />);
      fireEvent.click(screen.getByRole('button', { name: 'Wow' }));
      unmount();
      await tick(0);
      expect(reactCalls()).toHaveLength(1);
      expect(reactCalls()[0][1]).toBe('a');
    });

    it('answering one photo of a sheet takes its twin off the stack, and Undo puts it back', async () => {
      const twinA = { ...row('a'), twin_ids: ['c'] };
      const twinC = { ...row('c'), twin_ids: ['a'] };
      swr.mockReturnValue({ data: { sketches: [twinA, row('b'), twinC], remaining: 0 }, isLoading: false, mutate: vi.fn() });
      render(<FlipThrough classroomId="c1" />);
      fireEvent.click(screen.getByRole('button', { name: 'Wow' }));
      await tick(ADVANCE_AFTER_MS);
      expect(screen.getByText('2 of 2')).toBeTruthy(); // c is gone, b is next
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      expect(screen.getByText('1 of 3')).toBeTruthy();
    });

    it('the list does not shrink under the teacher when the inbox refetches mid-flip', async () => {
      swr.mockReturnValue(inbox('a', 'b', 'c'));
      const { rerender } = render(<FlipThrough classroomId="c1" />);
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      expect(screen.getByText('2 of 3')).toBeTruthy();
      swr.mockReturnValue(inbox('c'));
      rerender(<FlipThrough classroomId="c1" />);
      expect(screen.getByText('2 of 3')).toBeTruthy();
    });
  });
});
