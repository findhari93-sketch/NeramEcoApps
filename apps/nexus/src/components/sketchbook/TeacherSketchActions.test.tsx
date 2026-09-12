import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const api = vi.hoisted(() => ({
  reactToSketch: vi.fn(async () => ({ reaction: 'fire' })),
  unfeatureSketch: vi.fn(async () => ({ ok: true, failures: [] })),
}));
vi.mock('./sketchbook-api', () => api);
vi.mock('@/hooks/useNexusAuth', () => ({
  useNexusAuthContext: () => ({
    getToken: async () => 't',
    classrooms: [{ id: 'c1', name: 'Class 1' }],
    activeClassroom: { id: 'c1', name: 'Class 1' },
    impersonation: null,
  }),
}));
vi.mock('./FeatureSheet', () => ({ default: () => null }));

import TeacherSketchActions from './TeacherSketchActions';

describe('TeacherSketchActions', () => {
  beforeEach(() => {
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
        selfNote={null}
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
    render(<TeacherSketchActions sketchId="a" reaction={null} featured={[]} selfNote={null} onChanged={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Feature' })).toBeTruthy();
    expect(screen.queryByText(/Featured in/)).toBeFalsy();
  });

  it('in compact mode hides the comment field until Comment is clicked, and reacting sends the trimmed comment', async () => {
    render(<TeacherSketchActions sketchId="a" reaction={null} featured={[]} selfNote={null} onChanged={vi.fn()} compact />);
    expect(screen.queryByLabelText('Comment')).toBeFalsy();

    fireEvent.click(screen.getByRole('button', { name: 'Comment' }));
    expect(screen.getByLabelText('Comment')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Great' }));
    await waitFor(() => expect(api.reactToSketch).toHaveBeenCalledWith(expect.any(Function), 'a', 'fire', undefined));
    expect(screen.getByText('Sent Great')).toBeTruthy();
  });
});
