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
    impersonation: { active: false } as { active: boolean },
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
    // The real hook always returns an object; `active` is the only signal.
    auth.value.impersonation = { active: false };
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

  it('says a teacher hid it, rather than blaming the student, when the shelf was refused for that', async () => {
    api.featureSketch.mockResolvedValueOnce({
      feature: { classroom_id: 'c1', featured_at: '2026-09-19T00:00:00.000Z' },
      teams: { channel: true, chat: true, errors: [] },
      shelved: false,
      hiddenByTeacher: true,
    } as any);
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Feature this work' }));
    expect(await screen.findByText(/a teacher hid it from students/)).toBeTruthy();
    expect(screen.queryByText(/keeps their drawings out of it/)).toBeNull();
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
    auth.value.impersonation = { active: true };
    open();
    expect(screen.getByRole('button', { name: 'Feature this work' }).hasAttribute('disabled')).toBe(true);
  });

  /**
   * The bug that kept featuring dead for every teacher: the sheet treated the
   * always-present impersonation object as "viewing as a student".
   */
  it('stays on for a teacher who is not viewing as a student', () => {
    open();
    expect(screen.getByRole('button', { name: 'Feature this work' }).hasAttribute('disabled')).toBe(false);
    expect(screen.queryByText(/off while viewing as a student/)).toBeNull();
  });
});
