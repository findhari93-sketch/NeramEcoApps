import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const swr = vi.fn();
// vi.hoisted: this factory returns `api` directly (not a lazy closure over it like the
// swr mock below), so it is read at mock-registration time, before imports run. Without
// vi.hoisted, `api` would still be in its temporal dead zone at that point.
const api = vi.hoisted(() => ({ flipSketch: vi.fn(async () => ({ ok: true })), reactToSketch: vi.fn(async () => ({ reaction: 'fire' })), featureSketch: vi.fn(), unfeatureSketch: vi.fn() }));
vi.mock('@/lib/nexus-swr', () => ({ useAuthSWR: (...a: unknown[]) => swr(...a) }));
vi.mock('./sketchbook-api', () => api);
vi.mock('@/hooks/useNexusAuth', () => ({ useNexusAuthContext: () => ({ getToken: async () => 't', classrooms: [{ id: 'c1', name: 'Class 1' }], activeClassroom: { id: 'c1', name: 'Class 1' }, impersonation: null }) }));
vi.mock('@/components/NavBadgeProvider', () => ({ useNavBadges: () => ({ refreshBadges: vi.fn(), getBadgeCount: () => 0 }) }));
vi.mock('@/components/students/StudentStageFactsProvider', () => ({ useStudentStageFacts: () => ({ factsFor: () => null, ready: true }) }));
// Renders the name as an aria-label rather than text content: the real card also
// shows the student's name in a sibling Typography, and a plain `<div>{name}</div>`
// mock would collide with `getByText('Asha Rao')` (two elements with that exact text).
vi.mock('@/components/students/StudentStageAvatar', () => ({ default: ({ name }: { name?: string | null }) => <div aria-label={name ? `Avatar for ${name}` : 'Avatar'} /> }));

import FlipThrough from './FlipThrough';

const row = (id: string) => ({
  id, student_id: 's1', original_image_url: `https://x/${id}.jpg`, thumbnail_url: null, self_note: 'a chair',
  reaction: null, submitted_at: '2026-09-09T10:00:00.000Z', is_gallery_visible: false,
  student: { id: 's1', name: 'Asha Rao', avatar_url: null, ms_oid: null },
});

describe('FlipThrough', () => {
  beforeEach(() => { api.flipSketch.mockClear(); api.reactToSketch.mockClear(); });

  it('shows the first sketch with the student name and three reaction buttons', () => {
    swr.mockReturnValue({ data: { sketches: [row('a'), row('b')], remaining: 0 }, isLoading: false, mutate: vi.fn() });
    render(<FlipThrough classroomId="c1" />);
    expect(screen.getByText('Asha Rao')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Nice' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Great' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Wow' })).toBeTruthy();
    expect(screen.getByText('1 of 2')).toBeTruthy();
  });

  it('records a skip and advances on Next', async () => {
    swr.mockReturnValue({ data: { sketches: [row('a'), row('b')], remaining: 0 }, isLoading: false, mutate: vi.fn() });
    render(<FlipThrough classroomId="c1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(api.flipSketch).toHaveBeenCalledWith(expect.any(Function), 'a', 'skipped'));
    expect(await screen.findByText('2 of 2')).toBeTruthy();
  });

  it('sends a reaction and shows it as sent', async () => {
    swr.mockReturnValue({ data: { sketches: [row('a')], remaining: 0 }, isLoading: false, mutate: vi.fn() });
    render(<FlipThrough classroomId="c1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Great' }));
    await waitFor(() => expect(api.reactToSketch).toHaveBeenCalledWith(expect.any(Function), 'a', 'fire', undefined));
    expect(screen.getByText('Sent Great')).toBeTruthy();
  });

  it('says when everything has been flipped', () => {
    swr.mockReturnValue({ data: { sketches: [], remaining: 0 }, isLoading: false, mutate: vi.fn() });
    render(<FlipThrough classroomId="c1" />);
    expect(screen.getByText('You have flipped through everything.')).toBeTruthy();
  });
});
