import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { useStoredViewMode } from '@/hooks/useStoredViewMode';
import PaperListToolbar from './PaperListToolbar';
import PaperTable from './PaperTable';
import PaperGridCard from './PaperGridCard';
import PaperDetailedCard from './PaperDetailedCard';
import { toRows } from './paperFilters';
import { derivePaperStats } from './derivePaperStats';
import { PAPER_VIEWS, type PaperActionHandlers, type PaperWithBreakdown } from './paperTypes';

function makePaper(overrides: Partial<PaperWithBreakdown> = {}): PaperWithBreakdown {
  return {
    id: 'p1',
    exam_type: 'JEE_PAPER_2',
    year: 2024,
    session: null,
    shift: null,
    pdf_url: null,
    total_questions: null,
    total_marks: null,
    duration_minutes: null,
    uploaded_by: null,
    upload_status: 'parsed',
    questions_parsed: 90,
    questions_answer_keyed: 80,
    questions_complete: 70,
    active_count: 60,
    created_at: '2026-03-25T07:00:00.000Z',
    study_file_id: null,
    is_student_visible: false,
    paper_source: 'official',
    exam_date: null,
    contributor_summary: [],
    ...overrides,
  } as PaperWithBreakdown;
}

function makeActions(overrides: Partial<PaperActionHandlers> = {}): PaperActionHandlers {
  return {
    onOpen: vi.fn(),
    onActivate: vi.fn(),
    onDeactivate: vi.fn(),
    onSetVisibility: vi.fn(),
    onRequestDelete: vi.fn(),
    actionLoading: null,
    ...overrides,
  };
}

const formatDate = () => '25 Mar 2026';
const getCategoryLabel = (c: string) => c;

describe('useStoredViewMode', () => {
  function Probe() {
    const [view, setView] = useStoredViewMode('nexus:test:view', PAPER_VIEWS, 'table');
    return (
      <button onClick={() => setView('grid')} data-testid="probe">
        {view}
      </button>
    );
  }

  beforeEach(() => {
    window.localStorage.clear();
  });

  it('restores a stored value after mount', () => {
    window.localStorage.setItem('nexus:test:view', 'cards');
    render(<Probe />);
    expect(screen.getByTestId('probe').textContent).toBe('cards');
  });

  it('ignores a stored value that is no longer a valid mode', () => {
    // A build that renamed its modes must not leave the page rendering nothing.
    window.localStorage.setItem('nexus:test:view', 'kanban');
    render(<Probe />);
    expect(screen.getByTestId('probe').textContent).toBe('table');
  });

  it('writes the choice back', () => {
    render(<Probe />);
    fireEvent.click(screen.getByTestId('probe'));
    expect(window.localStorage.getItem('nexus:test:view')).toBe('grid');
  });

  it('survives localStorage throwing', () => {
    const getItem = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('SecurityError');
      });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded');
    });

    render(<Probe />);
    expect(screen.getByTestId('probe').textContent).toBe('table');
    // The click must still change the view even though persisting failed.
    fireEvent.click(screen.getByTestId('probe'));
    expect(screen.getByTestId('probe').textContent).toBe('grid');

    getItem.mockRestore();
    setItem.mockRestore();
  });
});

describe('PaperListToolbar', () => {
  const counts = { all: 26, live: 2, ready: 5, needsWork: 15, empty: 4 };

  function renderToolbar(overrides: Partial<React.ComponentProps<typeof PaperListToolbar>> = {}) {
    const props = {
      search: '',
      onSearchChange: vi.fn(),
      status: 'all' as const,
      onStatusChange: vi.fn(),
      counts,
      sort: 'recent' as const,
      onSortChange: vi.fn(),
      view: 'table' as const,
      onViewChange: vi.fn(),
      ...overrides,
    };
    render(<PaperListToolbar {...props} />);
    return props;
  }

  it('offers all three densities and reports the chosen one', () => {
    const props = renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: 'Grid view' }));
    expect(props.onViewChange).toHaveBeenCalledWith('grid');
  });

  it('does not clear the view when the active toggle is clicked again', () => {
    // ToggleButtonGroup reports null on de-select; one view must always be live.
    const props = renderToolbar({ view: 'table' });
    fireEvent.click(screen.getByRole('button', { name: 'Table view' }));
    expect(props.onViewChange).not.toHaveBeenCalled();
  });

  it('shows a count on every status chip, over all papers not the filtered set', () => {
    renderToolbar({ status: 'live' });
    expect(screen.queryByText('All 26')).not.toBeNull();
    expect(screen.queryByText('Live 2')).not.toBeNull();
    expect(screen.queryByText('Ready to publish 5')).not.toBeNull();
    expect(screen.queryByText('Needs work 15')).not.toBeNull();
    expect(screen.queryByText('Empty 4')).not.toBeNull();
  });

  it('reports a status chip click', () => {
    const props = renderToolbar();
    fireEvent.click(screen.getByText('Ready to publish 5'));
    expect(props.onStatusChange).toHaveBeenCalledWith('ready');
  });

  it('reports typing in the search box', () => {
    const props = renderToolbar();
    fireEvent.change(screen.getByLabelText('Search papers'), { target: { value: 'nata' } });
    expect(props.onSearchChange).toHaveBeenCalledWith('nata');
  });
});

describe('paper views share their behaviour', () => {
  const paper = makePaper();
  const stats = derivePaperStats(paper);

  it('opens the paper from a table row without the action cell doing so', () => {
    const actions = makeActions();
    render(<PaperTable rows={toRows([paper])} actions={actions} formatDate={formatDate} />);

    const row = screen.getByRole('button', { name: 'Open JEE Paper 2 2024' });
    fireEvent.click(row);
    expect(actions.onOpen).toHaveBeenCalledWith('p1');

    // Acting on a paper must not also navigate to it.
    (actions.onOpen as ReturnType<typeof vi.fn>).mockClear();
    fireEvent.click(within(row).getByRole('button', { name: /^Delete JEE Paper 2 2024$/ }));
    expect(actions.onRequestDelete).toHaveBeenCalled();
    expect(actions.onOpen).not.toHaveBeenCalled();
  });

  it('opens the paper from the keyboard, so a mouse is not the only way in', () => {
    const actions = makeActions();
    render(
      <PaperGridCard paper={paper} stats={stats} actions={actions} formatDate={formatDate} />,
    );
    fireEvent.keyDown(screen.getByRole('button', { name: 'Open JEE Paper 2 2024' }), { key: 'Enter' });
    expect(actions.onOpen).toHaveBeenCalledWith('p1');
  });

  it.each([
    ['grid', (a: PaperActionHandlers) => <PaperGridCard paper={blocked} stats={blockedStats} actions={a} formatDate={formatDate} />],
    ['cards', (a: PaperActionHandlers) => <PaperDetailedCard paper={blocked} stats={blockedStats} actions={a} getCategoryLabel={getCategoryLabel} formatDate={formatDate} />],
  ])('says why Publish is disabled in the %s view', (_name, renderView) => {
    render(renderView(makeActions()));
    expect((screen.getByRole('button', { name: /Publish to students/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText(/Nothing for students yet/)).not.toBeNull();
  });

  it('enables Publish once a paper has something to give', () => {
    const ready = makePaper({ active_count: 60 });
    render(
      <PaperDetailedCard
        paper={ready}
        stats={derivePaperStats(ready)}
        actions={makeActions()}
        getCategoryLabel={getCategoryLabel}
        formatDate={formatDate}
      />,
    );
    expect((screen.getByRole('button', { name: /Publish to students/ }) as HTMLButtonElement).disabled).toBe(false);
  });
});

/** A paper with questions but nothing active and no PDF: Publish must refuse. */
const blocked = makePaper({ id: 'blocked', active_count: 0, study_file_id: null });
const blockedStats = derivePaperStats(blocked);
