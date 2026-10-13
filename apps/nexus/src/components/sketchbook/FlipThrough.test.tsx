import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';

const swr = vi.fn();
// vi.hoisted: this factory returns `api` directly (not a lazy closure over it like the
// swr mock below), so it is read at mock-registration time, before imports run. Without
// vi.hoisted, `api` would still be in its temporal dead zone at that point.
const api = vi.hoisted(() => ({
  flipSketch: vi.fn(async () => ({ ok: true })),
  saveEvaluation: vi.fn(async () => ({ reaction: 'fire', grade: null, evaluated: false })),
  featureSketch: vi.fn(),
  unfeatureSketch: vi.fn(),
}));
const badges = vi.hoisted(() => ({ refreshBadges: vi.fn() }));
vi.mock('@/lib/nexus-swr', () => ({ useAuthSWR: (...a: unknown[]) => swr(...a) }));
vi.mock('./sketchbook-api', async (importOriginal) => ({ ...(await importOriginal<typeof import('./sketchbook-api')>()), ...api }));
vi.mock('@/hooks/useNexusAuth', () => ({
  useNexusAuthContext: () => ({
    getToken: async () => 't', getTeacherToken: async () => 'teacher-t', can: () => false,
    classrooms: [{ id: 'c1', name: 'Class 1' }], activeClassroom: { id: 'c1', name: 'Class 1' }, impersonation: null,
  }),
}));
vi.mock('@/components/NavBadgeProvider', () => ({ useNavBadges: () => ({ refreshBadges: badges.refreshBadges, getBadgeCount: () => 0 }) }));
vi.mock('@/components/students/StudentStageFactsProvider', () => ({ useStudentStageFacts: () => ({ factsFor: () => null, ready: true }) }));
// Renders the name as an aria-label rather than text content: the real card also
// shows the student's name in a sibling Typography, and a plain `<div>{name}</div>`
// mock would collide with `getByText('Asha Rao')` (two elements with that exact text).
vi.mock('@/components/students/StudentStageAvatar', () => ({ default: ({ name }: { name?: string | null }) => <div aria-label={name ? `Avatar for ${name}` : 'Avatar'} /> }));

import FlipThrough, { SWIPE_MIN_PX, UNDO_WINDOW_MS, describeChange } from './FlipThrough';

const row = (id: string, name = 'Asha Rao') => ({
  id, student_id: 's1', original_image_url: `https://x/${id}.jpg`, thumbnail_url: null, self_note: 'a chair',
  reaction: null, drawing_grade: null, evaluated_at: null, submitted_at: '2026-09-09T10:00:00.000Z', is_gallery_visible: false,
  source_type: 'sketchbook', status: 'completed', assignment_id: null, reviewed_at: null,
  student: { id: 's1', name, avatar_url: null, ms_oid: null },
  featured: [],
});

const inbox = (...ids: string[]) => ({ data: { sketches: ids.map((id) => row(id)), remaining: 0 }, isLoading: false, mutate: vi.fn() });
const saves = () => api.saveEvaluation.mock.calls as unknown[][];
const skips = () => (api.flipSketch.mock.calls as unknown[][]).filter((c) => c[2] === 'skipped');

describe('FlipThrough', () => {
  beforeEach(() => {
    api.flipSketch.mockClear();
    api.saveEvaluation.mockReset();
    api.saveEvaluation.mockResolvedValue({ reaction: 'fire', grade: null, evaluated: false });
    badges.refreshBadges.mockClear();
  });

  it('shows the first sketch with the student name, the grade row and three reaction buttons', () => {
    swr.mockReturnValue(inbox('a', 'b'));
    render(<FlipThrough classroomId="c1" />);
    expect(screen.getByText('Asha Rao')).toBeTruthy();
    for (const name of ['Top', 'Mid', 'Needs practice', 'Nice', 'Great', 'Wow']) expect(screen.getByRole('button', { name })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Grade for this drawing' })).toBeTruthy();
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

  it('describes a save in plain words', () => {
    expect(describeChange({ grade: 'mid', reaction: 'wow', comment: 'x' })).toBe('Mid, Wow and comment');
    expect(describeChange({ reaction: 'heart' })).toBe('Nice');
    expect(describeChange({ grade: 'needs_practice', comment: 'x' })).toBe('Needs practice and comment');
  });

  describe('save on move', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    const tick = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
    const tap = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
    const comment = (text: string) => {
      tap('Comment');
      fireEvent.change(screen.getByLabelText('Comment'), { target: { value: text } });
      tap('Add');
    };

    it('a grade or a reaction marks the card and never moves it or sends', async () => {
      swr.mockReturnValue(inbox('a', 'b'));
      render(<FlipThrough classroomId="c1" />);
      tap('Mid');
      tap('Wow');
      await tick(UNDO_WINDOW_MS * 3);
      expect(screen.getByText('1 of 2')).toBeTruthy();
      expect(api.saveEvaluation).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Mid' }).getAttribute('aria-pressed')).toBe('true');
      expect(screen.getByRole('button', { name: 'Wow' }).getAttribute('aria-pressed')).toBe('true');
    });

    it('the status chip says what is missing until both are given', () => {
      swr.mockReturnValue(inbox('a', 'b'));
      render(<FlipThrough classroomId="c1" />);
      expect(screen.getByTestId('flip-evaluation').textContent).toBe('Not evaluated');
      tap('Great');
      expect(screen.getByTestId('flip-evaluation').textContent).toBe('Needs grade');
      tap('Top');
      expect(screen.getByTestId('flip-evaluation').textContent).toBe('Evaluated');
      tap('Great'); // a second tap takes the reaction back
      expect(screen.getByTestId('flip-evaluation').textContent).toBe('Needs reaction');
    });

    it('Next sends grade, reaction and comment as one save after the undo window', async () => {
      swr.mockReturnValue(inbox('a', 'b'));
      render(<FlipThrough classroomId="c1" />);
      tap('Mid');
      tap('Wow');
      comment('Softer shadow');
      expect(screen.getByTestId('flip-comments').textContent).toContain('Softer shadow');
      tap('Next');
      expect(screen.getByText('2 of 2')).toBeTruthy();
      expect(screen.getByTestId('flip-status').textContent).toContain('Sending to Asha: Mid, Wow and comment');
      expect(api.saveEvaluation).not.toHaveBeenCalled();
      await tick(UNDO_WINDOW_MS);
      expect(saves()).toHaveLength(1);
      expect(saves()[0].slice(1)).toEqual(['a', { grade: 'mid', reaction: 'wow', comment: 'Softer shadow' }, { keepalive: true }]);
      expect(await (saves()[0][0] as () => Promise<string>)()).toBe('teacher-t');
      expect(skips()).toHaveLength(0);
      expect(badges.refreshBadges).toHaveBeenCalled();
    });

    it('swiping either way saves the card too', async () => {
      swr.mockReturnValue(inbox('a', 'b'));
      render(<FlipThrough classroomId="c1" />);
      const swipe = (fromX: number, toX: number) => {
        const sketch = screen.getByTestId('flip-sketch');
        fireEvent.touchStart(sketch, { touches: [{ clientX: fromX, clientY: 300 }] });
        fireEvent.touchEnd(sketch, { changedTouches: [{ clientX: toX, clientY: 300 }] });
      };
      tap('Top');
      swipe(300, 300 - SWIPE_MIN_PX - 10);
      expect(screen.getByText('2 of 2')).toBeTruthy();
      tap('Nice');
      swipe(100, 100 + SWIPE_MIN_PX + 10);
      expect(screen.getByText('1 of 2')).toBeTruthy();
      await tick(UNDO_WINDOW_MS);
      expect(saves().map((c) => [c[1], c[2]])).toEqual([['a', { grade: 'top' }], ['b', { reaction: 'heart' }]]);
    });

    it('Undo returns to the card with the choices still made, and sends nothing', async () => {
      swr.mockReturnValue(inbox('a', 'b'));
      render(<FlipThrough classroomId="c1" />);
      tap('Mid');
      tap('Wow');
      tap('Next');
      tap('Undo');
      expect(screen.getByText('1 of 2')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Mid' }).getAttribute('aria-pressed')).toBe('true');
      expect(screen.getByRole('button', { name: 'Wow' }).getAttribute('aria-pressed')).toBe('true');
      await tick(UNDO_WINDOW_MS * 2);
      expect(api.saveEvaluation).not.toHaveBeenCalled();
    });

    it('Next with nothing given is a skip and sends nothing', async () => {
      swr.mockReturnValue(inbox('a', 'b'));
      render(<FlipThrough classroomId="c1" />);
      tap('Wow');
      tap('Wow'); // changed their mind
      tap('Next');
      await tick(UNDO_WINDOW_MS);
      expect(api.saveEvaluation).not.toHaveBeenCalled();
      expect(skips()).toHaveLength(1);
      expect(screen.queryByTestId('flip-status')).toBeNull();
    });

    it('1, 2 and 3 set the reaction from the keyboard without moving on', async () => {
      swr.mockReturnValue(inbox('a', 'b'));
      render(<FlipThrough classroomId="c1" />);
      fireEvent.keyDown(window, { key: '3' });
      expect(screen.getByText('1 of 2')).toBeTruthy();
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      await tick(UNDO_WINDOW_MS);
      expect(saves()[0].slice(1, 3)).toEqual(['a', { reaction: 'wow' }]);
    });

    it('keeps Undo reachable after the last sketch', async () => {
      swr.mockReturnValue(inbox('a'));
      render(<FlipThrough classroomId="c1" />);
      tap('Nice');
      tap('Next');
      expect(screen.getByText('You have flipped through everything.')).toBeTruthy();
      tap('Undo');
      expect(screen.getByText('1 of 1')).toBeTruthy();
    });

    it('a failed send says so and Retry sends it again', async () => {
      api.saveEvaluation.mockRejectedValueOnce(new Error('offline'));
      swr.mockReturnValue(inbox('a', 'b'));
      render(<FlipThrough classroomId="c1" />);
      tap('Great');
      tap('Next');
      await tick(UNDO_WINDOW_MS);
      expect(screen.getByTestId('flip-status').textContent).toContain('Could not send to Asha');
      tap('Retry');
      await tick(0);
      expect(saves()).toHaveLength(2);
      expect(saves()[1].slice(1, 3)).toEqual(['a', { reaction: 'fire' }]);
    });

    it('coming back inside the window folds a new choice into the same save', async () => {
      swr.mockReturnValue(inbox('a', 'b'));
      render(<FlipThrough classroomId="c1" />);
      tap('Wow');
      tap('Next');
      tap('Previous');
      tap('Mid');
      tap('Next');
      await tick(UNDO_WINDOW_MS);
      expect(saves()).toHaveLength(1);
      expect(saves()[0].slice(1, 3)).toEqual(['a', { reaction: 'wow', grade: 'mid' }]);
    });

    it('leaving the screen sends the card on screen and anything held', async () => {
      swr.mockReturnValue(inbox('a', 'b'));
      const { unmount } = render(<FlipThrough classroomId="c1" />);
      tap('Wow');
      tap('Next');
      tap('Top');
      unmount();
      await tick(0);
      expect(saves().map((c) => c[1]).sort()).toEqual(['a', 'b']);
    });

    it('an evaluated photo takes its twin off the stack, and Undo puts it back', async () => {
      const twinA = { ...row('a'), twin_ids: ['c'] };
      const twinC = { ...row('c'), twin_ids: ['a'] };
      swr.mockReturnValue({ data: { sketches: [twinA, row('b'), twinC], remaining: 0 }, isLoading: false, mutate: vi.fn() });
      render(<FlipThrough classroomId="c1" />);
      tap('Mid');
      tap('Wow');
      tap('Next');
      expect(screen.getByText('2 of 2')).toBeTruthy(); // c is gone, b is next
      tap('Undo');
      expect(screen.getByText('1 of 3')).toBeTruthy();
    });

    it('the list does not shrink under the teacher when the inbox refetches mid-flip', async () => {
      swr.mockReturnValue(inbox('a', 'b', 'c'));
      const { rerender } = render(<FlipThrough classroomId="c1" />);
      tap('Next');
      expect(screen.getByText('2 of 3')).toBeTruthy();
      swr.mockReturnValue(inbox('c'));
      rerender(<FlipThrough classroomId="c1" />);
      expect(screen.getByText('2 of 3')).toBeTruthy();
    });
  });
});
