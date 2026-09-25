import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FilterMenu, { ActiveFilterChips, FilterChipRow, activeFilterCount, type FilterSection } from './FilterMenu';
import StudentListToolbar from './StudentListToolbar';
import type { StudentListView } from './useStudentListView';

/**
 * The one Filter button that stands in for rows of chips where space is tight.
 * What matters:
 *  - it says how many filters are on, and every option carries its count;
 *  - single sections pick one or none, multi sections tick several;
 *  - what is on is never hidden: it shows as removable chips under the toolbar;
 *  - the shared toolbar folds into it by the width of ITS box, not the window,
 *    so a list in a 480px drawer on a laptop is compact too.
 */

function section(over: Partial<FilterSection> = {}): FilterSection {
  return {
    id: 'state',
    title: 'Follow-up',
    mode: 'single',
    allLabel: 'Everyone',
    options: [
      { key: 'needs_call', label: 'Needs a call', count: 6, color: '#d32f2f' },
      { key: 'catching_up', label: 'Catching up', count: 10, color: '#ed6c02' },
      { key: 'caught_up', label: 'Caught up', count: 0 },
    ],
    value: [],
    onToggle: vi.fn(),
    onClear: vi.fn(),
    ...over,
  };
}

describe('FilterMenu', () => {
  it('shows a plain Filter button when nothing is on', () => {
    render(<FilterMenu sections={[section()]} />);
    const button = screen.getByRole('button', { name: 'Filter' });
    expect(button).toBeTruthy();
  });

  it('counts what is on in its accessible name', () => {
    render(<FilterMenu sections={[section({ value: ['needs_call'] }), section({ id: 'stage', mode: 'multi', value: ['a', 'b'] })]} />);
    expect(screen.getByRole('button', { name: 'Filter: 3 on' })).toBeTruthy();
    expect(activeFilterCount([section({ value: ['x'] })])).toBe(1);
  });

  it('opens the options with their counts, and a tap toggles one', () => {
    const s = section();
    render(<FilterMenu sections={[s]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    const group = screen.getByRole('radiogroup', { name: 'Follow-up' });
    const needs = within(group).getByRole('radio', { name: 'Needs a call, 6' });
    expect(needs.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(needs);
    expect(s.onToggle).toHaveBeenCalledWith('needs_call');
    // The "no filter" row clears.
    fireEvent.click(within(group).getByRole('radio', { name: /^Everyone/ }));
    expect(s.onClear).toHaveBeenCalled();
  });

  it('hides zero-count options only when asked, and never the one that is on', () => {
    render(<FilterMenu sections={[section({ hideEmpty: true })]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    expect(screen.queryByRole('radio', { name: /^Caught up/ })).toBeNull();
  });

  it('clears every section from Clear all', () => {
    const a = section({ value: ['needs_call'] });
    const b = section({ id: 'stage', mode: 'multi', value: ['x'] });
    render(<FilterMenu sections={[a, b]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Filter: 2 on' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(a.onClear).toHaveBeenCalled();
    expect(b.onClear).toHaveBeenCalled();
  });
});

describe('ActiveFilterChips', () => {
  it('takes no room when nothing is on', () => {
    const { container } = render(<ActiveFilterChips sections={[section()]} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows what is on as a chip that removes itself', () => {
    const s = section({ value: ['needs_call'] });
    render(<ActiveFilterChips sections={[s]} />);
    const chip = screen.getByRole('button', { name: 'Follow-up: Needs a call. Remove' });
    expect(chip).toBeTruthy();
    fireEvent.click(chip.querySelector('.MuiChip-deleteIcon')!);
    expect(s.onToggle).toHaveBeenCalledWith('needs_call');
  });
});

describe('FilterChipRow', () => {
  it('lays the same section out as pressed chips on a wide screen', () => {
    render(<FilterChipRow section={section({ value: ['catching_up'] })} />);
    expect(screen.getByRole('button', { name: /Catching up 10/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /^Everyone 16$/ }).getAttribute('aria-pressed')).toBe('false');
  });
});

describe('StudentListToolbar, by the width of its own box', () => {
  let width = 1000;
  const realRect = HTMLElement.prototype.getBoundingClientRect;

  beforeEach(() => {
    HTMLElement.prototype.getBoundingClientRect = function () {
      return { width, height: 48, top: 0, left: 0, right: width, bottom: 48, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    };
  });
  afterEach(() => {
    HTMLElement.prototype.getBoundingClientRect = realRect;
  });

  function fakeView(): StudentListView<unknown, never, never> {
    return {
      shown: [],
      staged: [],
      total: 0,
      pausedHidden: 0,
      query: '',
      setQuery: vi.fn(),
      sort: 'name_asc',
      setSort: vi.fn(),
      sortOptions: [{ key: 'name_asc', label: 'Name A to Z' }],
      stages: [],
      toggleStage: vi.fn(),
      clearStages: vi.fn(),
      stageCounts: { exam_this_year: 26, exam_next_year: 11, lower: 0, unset: 0 },
      stageReady: true,
      status: 'all',
      setStatus: vi.fn(),
      statusCounts: {} as Record<never, number>,
      activeFilterCount: 0,
      clearAll: vi.fn(),
    } as unknown as StudentListView<unknown, never, never>;
  }

  it('keeps the stage chips inline in a wide box', () => {
    width = 1000;
    render(<StudentListToolbar view={fakeView()} />);
    expect(screen.getByTestId('stage-chip-exam_this_year')).toBeTruthy();
    expect(screen.queryByTestId('filter-menu-button')).toBeNull();
  });

  it('folds stage and screen filters into one Filter button in a narrow box', () => {
    width = 448;
    render(<StudentListToolbar view={fakeView()} filters={[section()]} />);
    expect(screen.queryByTestId('stage-chip-exam_this_year')).toBeNull();
    expect(screen.queryByRole('group', { name: 'Follow-up' })).toBeNull();
    // Sort is an icon that still says the order.
    expect(screen.getByRole('button', { name: 'Sort: Name A to Z' })).toBeTruthy();
    fireEvent.click(screen.getByTestId('filter-menu-button'));
    expect(screen.getByRole('group', { name: 'Stage' })).toBeTruthy();
    expect(screen.getByRole('radiogroup', { name: 'Follow-up' })).toBeTruthy();
  });
});
