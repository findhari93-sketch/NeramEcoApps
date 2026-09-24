import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EditPaperDetailsDialog from './EditPaperDetailsDialog';

const PAPER = { id: 'p1', exam_type: 'JEE_PAPER_2', year: 2019, session: 'Session 1', shift: 'forenoon' };

function renderDialog(over: Partial<Parameters<typeof EditPaperDetailsDialog>[0]> = {}) {
  const props = {
    open: true,
    paper: PAPER,
    onClose: vi.fn(),
    getToken: async () => 'token',
    onSaved: vi.fn(),
    ...over,
  };
  render(<EditPaperDetailsDialog {...props} />);
  return props;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('EditPaperDetailsDialog', () => {
  it('starts on the paper as saved, with Save off until something changes', () => {
    renderDialog();
    expect(screen.getByTestId('paper-details-preview').textContent).toBe('JEE Paper 2 2019 Session 1 (FN)');
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('saves a forenoon paper as the afternoon one', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { ...PAPER, shift: 'afternoon' } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const props = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Afternoon (AN)' }));
    expect(screen.getByTestId('paper-details-preview').textContent).toBe('JEE Paper 2 2019 Session 1 (AN)');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(props.onSaved).toHaveBeenCalledWith(expect.objectContaining({ shift: 'afternoon' })));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/question-bank/papers/p1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ year: 2019, session: 'Session 1', shift: 'afternoon' });
    expect(init.headers.Authorization).toBe('Bearer token');
    expect(props.onClose).toHaveBeenCalled();
  });

  it('shows the reason when another paper already has that name, and stays open', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Another paper is already saved as this year, session and shift.' }),
      }),
    );
    const props = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Afternoon (AN)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect((await screen.findByRole('alert')).textContent).toContain('already saved');
    expect(props.onSaved).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('keeps an old session value it does not list, instead of changing it on open', () => {
    renderDialog({ paper: { ...PAPER, exam_type: 'NATA', year: 2025, session: 'april-9', shift: null } });
    expect(screen.getByTestId('paper-details-preview').textContent).toBe('NATA 2025 april-9');
  });
});
