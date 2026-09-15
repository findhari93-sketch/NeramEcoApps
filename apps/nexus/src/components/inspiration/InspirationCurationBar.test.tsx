import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { presentRow } from '@/lib/inspiration-present';
import { makeRow } from '@/lib/inspiration-test-rows';

const api = vi.hoisted(() => ({ patchItem: vi.fn(), deleteExemplarItem: vi.fn() }));
vi.mock('./inspiration-api', () => api);
vi.mock('@/hooks/useNexusAuth', () => ({ useNexusAuthContext: () => ({ getToken: async () => 't' }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import InspirationCurationBar from './InspirationCurationBar';

const showButton = () => screen.getByRole('button', { name: 'Show to students' });

describe('InspirationCurationBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.patchItem.mockResolvedValue({ item: null });
  });

  it("will not show an opted-out student's own drawing, and says why", () => {
    // The base nulls author fields for an opted-out author.
    const card = presentRow(makeRow({ is_visible: false, author_opted_out: true, author_id: null, score_pct: 1 }), { staff: true });
    render(<InspirationCurationBar card={card} base="/teacher/inspiration" onChanged={vi.fn()} />);

    expect((showButton() as HTMLButtonElement).disabled).toBe(true);
    const help = screen.getByText('This student chose not to share their drawings.');
    expect(showButton().getAttribute('aria-describedby')).toBe(help.id);
    expect(screen.queryByRole('button', { name: 'Hide all from this student' })).toBeNull();
  });

  it('lets a teacher show a drawing that is only below the threshold', () => {
    const card = presentRow(makeRow({ is_visible: false, score_pct: 0.6 }), { staff: true });
    render(<InspirationCurationBar card={card} base="/teacher/inspiration" onChanged={vi.fn()} />);

    expect((showButton() as HTMLButtonElement).disabled).toBe(false);
    expect(showButton().getAttribute('aria-describedby')).toBeNull();
    expect(screen.queryByText('This student chose not to share their drawings.')).toBeNull();
  });

  it('asks before stopping a student sharing, and explains that references stay', async () => {
    const onChanged = vi.fn();
    const card = presentRow(makeRow({ is_visible: true, score_pct: 1, author_id: 'student-9' }), { staff: true });
    render(<InspirationCurationBar card={card} base="/teacher/inspiration" onChanged={onChanged} />);

    fireEvent.click(screen.getByRole('button', { name: 'Hide all from this student' }));
    const dialog = await screen.findByRole('dialog', { name: "Stop showing this student's drawings?" });
    expect(dialog.textContent).toContain(
      'Their own drawings are hidden from students. References made from their work stay, credited Neram reference. An admin can turn sharing back on.',
    );
    expect(dialog.textContent).not.toMatch(/—|--/);

    fireEvent.click(screen.getByRole('button', { name: 'Stop showing' }));
    await waitFor(() => expect(api.patchItem).toHaveBeenCalledWith(expect.any(Function), card.id, { hide_all_by_author: true }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
});
