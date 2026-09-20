import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const api = vi.hoisted(() => ({
  featureSketch: vi.fn(async () => ({
    feature: { classroom_id: 'c1', featured_at: '2026-09-19T00:00:00.000Z' },
    teams: { channel: true, chat: true, errors: [] as string[] },
    shelved: true,
  })),
}));
vi.mock('./sketchbook-api', () => api);

const auth = vi.hoisted(() => ({
  value: {
    getToken: async () => 't',
    classrooms: [{ id: 'c1', name: 'JEE B.Arch Session 1' }],
    activeClassroom: { id: 'c1', name: 'JEE B.Arch Session 1' },
    impersonation: null as unknown,
  },
}));
vi.mock('@/hooks/useNexusAuth', () => ({ useNexusAuthContext: () => auth.value }));

import FeatureSheet from './FeatureSheet';

const open = (props: Partial<React.ComponentProps<typeof FeatureSheet>> = {}) =>
  render(
    <FeatureSheet
      open
      onClose={() => {}}
      sketchId="s1"
      studentName="Anuvika Stalin Prem"
      onFeatured={() => {}}
      {...props}
    />,
  );

describe('FeatureSheet', () => {
  beforeEach(() => {
    api.featureSketch.mockClear();
    auth.value.impersonation = null;
  });

  /**
   * The complaint that started this work, made mechanical. A teacher opened
   * this sheet to praise a drawing and was asked to choose a classroom (there
   * is one) and write a caption (there is no right answer).
   */
  it('asks for nothing: no classroom picker and no caption box', () => {
    open();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByLabelText(/caption/i)).toBeNull();
  });

  it('says what one tap will do, including who gets told', () => {
    open();
    expect(screen.getByText(/Posted to JEE B.Arch Session 1 on Teams/)).toBeTruthy();
    expect(screen.getByText(/Added to Inspiration/)).toBeTruthy();
    expect(screen.getByText(/Anuvika is told/)).toBeTruthy();
  });

  it('features without sending a classroom, letting the server resolve it', async () => {
    const onFeatured = vi.fn();
    open({ onFeatured });
    fireEvent.click(screen.getByRole('button', { name: 'Feature this work' }));
    await waitFor(() => expect(api.featureSketch).toHaveBeenCalledWith(expect.any(Function), 's1', undefined));
    await waitFor(() =>
      expect(onFeatured).toHaveBeenCalledWith({
        classroom_id: 'c1',
        classroom_name: 'JEE B.Arch Session 1',
        featured_at: '2026-09-19T00:00:00.000Z',
      }),
    );
    expect(await screen.findByText(/on the Inspiration shelf now/)).toBeTruthy();
  });

  it('says plainly when the drawing stays off the shelf', async () => {
    api.featureSketch.mockResolvedValueOnce({
      feature: { classroom_id: 'c1', featured_at: '2026-09-19T00:00:00.000Z' },
      teams: { channel: true, chat: true, errors: [] },
      shelved: false,
    });
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Feature this work' }));
    // A teacher who is not told would believe the gallery half worked.
    expect(await screen.findByText(/keeps their drawings out of it/)).toBeTruthy();
  });

  it('asks which classroom only after the server says there is a choice', async () => {
    api.featureSketch.mockRejectedValueOnce(
      new Error('You teach this student in more than one classroom. Choose which one to feature in.'),
    );
    open();
    expect(screen.queryByRole('combobox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Feature this work' }));
    expect(await screen.findByRole('combobox')).toBeTruthy();
  });

  it('is off while viewing as a student, because the post needs a real sign-in', () => {
    auth.value.impersonation = { userId: 'x' };
    open();
    expect(screen.getByRole('button', { name: 'Feature this work' }).hasAttribute('disabled')).toBe(true);
  });
});
