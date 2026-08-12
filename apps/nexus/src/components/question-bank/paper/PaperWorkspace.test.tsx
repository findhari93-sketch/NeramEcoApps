import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { NexusQBQuestion } from '@neram/database';
import PaperWorkspace from './PaperWorkspace';

const questions = [1, 2, 3].map((n) => ({
  id: `q${n}`, question_text: `Question ${n}`, question_format: 'MCQ',
  options: [{ id: 'a', text: 'A' }], correct_answer: 'a', display_order: n,
  section: 'math_mcq', status: 'active', is_active: true, categories: [],
})) as unknown as NexusQBQuestion[];

const base = {
  questions,
  mode: 'edit' as const,
  onModeChange: vi.fn(),
  needsFilter: 'all' as const,
  onNeedsFilterChange: vi.fn(),
  sectionFilter: null,
  onSectionFilterChange: vi.fn(),
  getToken: async () => 'token',
  onSaved: () => {},
  onChangeSections: vi.fn().mockResolvedValue(undefined),
  onOptimisticPatch: vi.fn(),
};

/** The needs-image verdicts live in the selection bar's overflow menu now. */
function clickNeedsImageOverflow(label: 'Needs a figure' | 'No figure needed') {
  fireEvent.click(screen.getByLabelText('More actions for the selected questions'));
  fireEvent.click(screen.getByRole('menuitem', { name: label }));
}

describe('PaperWorkspace', () => {
  /**
   * The right pane used to always mount, showing "Select a question to edit
   * it" and permanently occupying about half the screen. It only mounts once
   * a question is open now, so the list gets the full width until then.
   */
  it('opens with nothing selected, and mounts no detail pane at all', () => {
    render(<PaperWorkspace {...base} />);
    expect(screen.queryByText('Select a question to edit it')).toBeNull();
    expect(screen.queryByText(/of 3/)).toBeNull();
  });

  it('loads a clicked question into the pane', () => {
    render(<PaperWorkspace {...base} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open question 2' }));
    expect(screen.getByText('2 of 3')).not.toBeNull();
  });

  it('walks the paper with j and k', () => {
    render(<PaperWorkspace {...base} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open question 1' }));
    fireEvent.keyDown(window, { key: 'j' });
    expect(screen.getByText('2 of 3')).not.toBeNull();
    fireEvent.keyDown(window, { key: 'k' });
    expect(screen.getByText('1 of 3')).not.toBeNull();
  });

  it('ignores j and k while the teacher is typing in a field', () => {
    render(<PaperWorkspace {...base} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open question 1' }));
    const field = screen.getByLabelText('Question text');
    field.focus();
    fireEvent.keyDown(field, { key: 'j' });
    expect(screen.getByText('1 of 3')).not.toBeNull();
  });

  it('closes the pane on Escape, unmounting it rather than showing an empty state', () => {
    render(<PaperWorkspace {...base} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open question 1' }));
    expect(screen.getByText('1 of 3')).not.toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText(/of 3/)).toBeNull();
  });

  /**
   * Position counts paper order, not display_order. A paper with a gap in its
   * numbering would otherwise claim '5 of 3'.
   */
  it('counts position by paper order, not by the printed question number', () => {
    const gappy = [
      { ...questions[0], display_order: 7 },
      { ...questions[1], display_order: 42 },
    ] as NexusQBQuestion[];
    render(<PaperWorkspace {...base} questions={gappy} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open question 42' }));
    expect(screen.getByText('2 of 2')).not.toBeNull();
  });
});

/**
 * setNeedsImageOne/bulkSetNeedsImage used to await fetch() and call onSaved()
 * unconditionally without checking res.ok, so a rejected write (auth,
 * validation, a dropped connection) refetched the same unchanged row and
 * looked identical to the click doing nothing. This pins the fix: an
 * optimistic patch that rolls itself back and surfaces a toast on failure,
 * and stays applied (no rollback, onSaved fires) on success.
 */
describe('PaperWorkspace needs-image bulk action', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rolls back the optimistic patch and shows a toast when the write fails', async () => {
    const onOptimisticPatch = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Forbidden' }) }));

    render(<PaperWorkspace {...base} onOptimisticPatch={onOptimisticPatch} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select question 1' }));
    clickNeedsImageOverflow('No figure needed');

    await screen.findByText('Forbidden');
    expect(onOptimisticPatch).toHaveBeenCalledWith('q1', { needs_image: false });
    expect(onOptimisticPatch).toHaveBeenCalledWith('q1', { needs_image: null });
  });

  it('patches optimistically and saves, with no rollback, on success', async () => {
    const onOptimisticPatch = vi.fn();
    const onSaved = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

    render(<PaperWorkspace {...base} onOptimisticPatch={onOptimisticPatch} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select question 1' }));
    clickNeedsImageOverflow('No figure needed');

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onOptimisticPatch).toHaveBeenCalledWith('q1', { needs_image: false });
    expect(onOptimisticPatch).not.toHaveBeenCalledWith('q1', { needs_image: null });
  });
});

/**
 * The paper header's permanently armed "Deactivate 90" moved onto the selection
 * bar. It goes through the same bulk-update endpoint every other batch action
 * uses, so the only thing worth pinning is that it sends the ticked ids and the
 * right action.
 */
describe('PaperWorkspace activate/deactivate from the selection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('deactivates only the ticked questions', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { updated: 1 } }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<PaperWorkspace {...base} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select question 2' }));
    fireEvent.click(screen.getByRole('button', { name: /Hide the selected questions from students/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/question-bank/questions/bulk-update');
    expect(JSON.parse(init.body)).toEqual({ action: 'deactivate', question_ids: ['q2'] });
  });

  it('says how many activated when some had no answer key', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { updated: 1 } }) }),
    );

    render(<PaperWorkspace {...base} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select question 1' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select question 2' }));
    fireEvent.click(screen.getByLabelText('More actions for the selected questions'));
    fireEvent.click(screen.getByRole('menuitem', { name: /Activate/ }));

    await screen.findByText('1 of 2 activated, the rest have no answer key yet');
  });
});

/**
 * A worked solution is a maths question's real answer, and it used to be four
 * clicks away in the Edit form. It is a slot in the paste assembly line now, so
 * saving has to route it to its own column rather than into option_images.
 */
describe('PaperWorkspace solution images', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('offers a Solution paste slot on a maths question in Images mode', () => {
    render(<PaperWorkspace {...base} mode="images" />);
    fireEvent.click(screen.getByRole('button', { name: 'Open question 1' }));
    expect(screen.getByText('Solution Image')).not.toBeNull();
    expect(screen.getByText('required for maths')).not.toBeNull();
  });

  it('offers no Solution slot on an aptitude question', () => {
    const aptitude = questions.map((q) => ({ ...q, section: 'aptitude' })) as NexusQBQuestion[];
    render(<PaperWorkspace {...base} mode="images" questions={aptitude} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open question 1' }));
    expect(screen.queryByText('Solution Image')).toBeNull();
  });
});
