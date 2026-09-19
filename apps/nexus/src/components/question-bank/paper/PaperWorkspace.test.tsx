import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { NexusQBQuestion } from '@neram/database';
import PaperWorkspace, { imagesPatchBody } from './PaperWorkspace';

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
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/question-bank/questions/bulk-update');
    expect(JSON.parse(init.body)).toEqual({ action: 'deactivate', question_ids: ['q2'] });
  });

  const hidden = questions.map((q) => ({ ...q, is_active: false, status: 'draft' })) as NexusQBQuestion[];

  it('names the questions held back for want of a key, and flips only the rest', async () => {
    const onOptimisticPatch = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { updated: 1, blocked: ['q2'] } }) }),
    );

    render(<PaperWorkspace {...base} questions={hidden} onOptimisticPatch={onOptimisticPatch} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select question 1' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select question 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }));

    await screen.findByText('1 of 2 activated. 1 still needs an answer key.');
    expect(onOptimisticPatch).toHaveBeenCalledWith('q1', { is_active: true, status: 'active' });
    expect(onOptimisticPatch).not.toHaveBeenCalledWith('q2', expect.anything());
  });

  /**
   * The pane's own Activate, for a teacher who opened the hidden question and
   * looked for the switch there. It must take the same route as the bar.
   */
  it('activates the open question from its pane through the same endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { updated: 1, blocked: [] } }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<PaperWorkspace {...base} questions={hidden} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open question 3' }));
    expect(screen.getByText('Hidden from students')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/question-bank/questions/bulk-update');
    expect(JSON.parse(init.body)).toEqual({ action: 'activate', question_ids: ['q3'] });
    await screen.findByText('1 question activated');
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

  it('offers one paste slot per part on a split drawing', () => {
    // One dropzone for a two-part question would put part B's paste into part
    // A's column, because the question's own solution_image_url is only a
    // mirror of the first part that has one.
    const drawings = [
      {
        ...questions[0],
        question_format: 'DRAWING_PROMPT',
        section: 'drawing',
        options: null,
        correct_answer: null,
        drawing_parts: {
          mode: 'any_one',
          items: [
            { id: 'a', label: 'A', text: 'Draw a balloon seller.', solution_image_url: null },
            { id: 'b', label: 'B', text: 'Draw women at a handpump.', solution_image_url: null },
          ],
        },
      },
    ] as unknown as NexusQBQuestion[];

    render(<PaperWorkspace {...base} mode="images" questions={drawings} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open question 1' }));
    expect(screen.getByText('Solution for A')).not.toBeNull();
    expect(screen.getByText('Solution for B')).not.toBeNull();
    expect(screen.queryByText('Solution Image')).toBeNull();
  });
});

/**
 * The routing, pinned. Every slot the builder does not name falls through to
 * option_images, and the route merges that by option id, so a part solution
 * sent there is dropped on the floor while the toast still says it saved.
 */
describe('imagesPatchBody', () => {
  const img = (url: string) => ({ url, uploaded: true });

  it('sends a part solution as part_solution_images, never as an option image', () => {
    const body = imagesPatchBody([{ slot: 'solution-b', image: img('https://x/b.png') }]);
    expect(body).toEqual({ part_solution_images: { b: 'https://x/b.png' } });
    expect(body.option_images).toBeUndefined();
  });

  it('keeps the three older slots exactly where they were', () => {
    expect(
      imagesPatchBody([
        { slot: 'question', image: img('https://x/q.png') },
        { slot: 'solution', image: img('https://x/s.png') },
        { slot: 'a', image: img('https://x/a.png') },
      ]),
    ).toEqual({
      question_image_url: 'https://x/q.png',
      solution_image_url: 'https://x/s.png',
      option_images: { a: 'https://x/a.png' },
    });
  });

  it('sends null for a removed image so the column is cleared', () => {
    expect(imagesPatchBody([{ slot: 'solution-a', image: null }])).toEqual({
      part_solution_images: { a: null },
    });
  });

  it('omits the keys nothing was pasted into', () => {
    expect(imagesPatchBody([])).toEqual({});
  });
});
