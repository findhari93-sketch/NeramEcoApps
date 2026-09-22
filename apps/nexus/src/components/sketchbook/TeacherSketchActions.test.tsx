import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const api = vi.hoisted(() => ({
  reactToSketch: vi.fn(async () => ({ reaction: 'fire' })),
  unfeatureSketch: vi.fn(async () => ({ ok: true, failures: [] })),
}));
vi.mock('./sketchbook-api', async (importOriginal) => ({ ...(await importOriginal<typeof import('./sketchbook-api')>()), ...api }));
const teacherToken = vi.hoisted(() => ({ value: 'teacher-t' as string | null }));
vi.mock('@/hooks/useNexusAuth', () => ({
  useNexusAuthContext: () => ({
    getToken: async () => 't',
    getTeacherToken: async () => teacherToken.value,
    classrooms: [{ id: 'c1', name: 'Class 1' }],
    activeClassroom: { id: 'c1', name: 'Class 1' },
    impersonation: null,
  }),
}));
vi.mock('./FeatureSheet', () => ({ default: () => null }));

import TeacherSketchActions from './TeacherSketchActions';

describe('TeacherSketchActions', () => {
  beforeEach(() => {
    teacherToken.value = 'teacher-t';
    api.reactToSketch.mockClear();
    api.unfeatureSketch.mockClear();
  });

  it('shows Un-feature and the chip when featured, and un-featuring clears it', async () => {
    const onChanged = vi.fn();
    render(
      <TeacherSketchActions
        sketchId="a"
        reaction={null}
        featured={[{ classroom_id: 'c1', classroom_name: 'Class 1', featured_at: '2026-09-01T00:00:00.000Z' }]}
        studentName="Anuvika Stalin Prem"
        onChanged={onChanged}
      />,
    );
    expect(screen.getByRole('button', { name: 'Un-feature' })).toBeTruthy();
    expect(screen.getByText('Featured in Class 1')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Un-feature' }));
    await waitFor(() => expect(api.unfeatureSketch).toHaveBeenCalledWith(expect.any(Function), 'a', 'c1'));
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith({ featured: [] }));
  });

  it('shows Feature and no chip when not featured', () => {
    render(<TeacherSketchActions sketchId="a" reaction={null} featured={[]} studentName="Anuvika Stalin Prem" onChanged={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Feature' })).toBeTruthy();
    expect(screen.queryByText(/Featured in/)).toBeFalsy();
  });

  it('in compact mode hides the comment field until Comment is clicked, and reacting sends the trimmed comment', async () => {
    render(<TeacherSketchActions sketchId="a" reaction={null} featured={[]} studentName="Anuvika Stalin Prem" onChanged={vi.fn()} compact />);
    expect(screen.queryByLabelText('Comment')).toBeFalsy();

    fireEvent.click(screen.getByRole('button', { name: 'Comment' }));
    expect(screen.getByLabelText('Comment')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Great' }));
    await waitFor(() => expect(api.reactToSketch).toHaveBeenCalledWith(expect.any(Function), 'a', 'fire', undefined));
    expect(screen.getByText('Sent Great')).toBeTruthy();
  });

  it('sends a reaction with the chat-scoped teacher token, because it becomes a Teams chat', async () => {
    render(<TeacherSketchActions sketchId="a" reaction={null} featured={[]} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Wow' }));
    await waitFor(() => expect(api.reactToSketch).toHaveBeenCalled());
    const getter = (api.reactToSketch.mock.calls[0] as unknown[])[0] as () => Promise<string>;
    expect(await getter()).toBe('teacher-t');
  });

  it('falls back to the session token when the teacher token cannot be had, rather than failing', async () => {
    teacherToken.value = null;
    render(<TeacherSketchActions sketchId="a" reaction={null} featured={[]} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Nice' }));
    await waitFor(() => expect(api.reactToSketch).toHaveBeenCalled());
    const getter = (api.reactToSketch.mock.calls[0] as unknown[])[0] as () => Promise<string>;
    expect(await getter()).toBe('t');
    expect(await screen.findByText('Sent Nice')).toBeTruthy();
  });

  it('with onReact, hands the tap to the parent at once and sends nothing itself', () => {
    const onReact = vi.fn();
    render(<TeacherSketchActions sketchId="a" reaction={null} featured={[]} onChanged={vi.fn()} compact onReact={onReact} onComment={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Comment' }));
    fireEvent.change(screen.getByLabelText('Comment'), { target: { value: '  Good hatching  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Wow' }));
    expect(onReact).toHaveBeenCalledWith('wow', 'Good hatching');
    expect(api.reactToSketch).not.toHaveBeenCalled();
    expect(screen.getByText('Sent Wow')).toBeTruthy();
  });

  it('with onComment, Send posts the comment alone and is off while the box is empty', () => {
    const onComment = vi.fn();
    render(<TeacherSketchActions sketchId="a" reaction="heart" featured={[]} onChanged={vi.fn()} compact onReact={vi.fn()} onComment={onComment} />);
    fireEvent.click(screen.getByRole('button', { name: 'Comment' }));
    const send = screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Comment'), { target: { value: 'Watch the ellipse' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onComment).toHaveBeenCalledWith('Watch the ellipse');
    expect(api.reactToSketch).not.toHaveBeenCalled();
  });
});
