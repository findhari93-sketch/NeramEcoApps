import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import StudentFilterSheet, { ActiveFilterChips, narrowingCount } from './StudentFilterSheet';
import { DEFAULT_FILTERS } from '@/lib/student-roster-view';

function baseProps() {
  return {
    filters: DEFAULT_FILTERS,
    examBatchFilter: 'current',
    batchFilter: null as string | null,
    onFiltersChange: vi.fn(),
    onExamBatchFilterChange: vi.fn(),
    onBatchFilterChange: vi.fn(),
    examBatches: [{ code: '2026-27' }],
    examYearLocked: false,
    batches: [],
  };
}

describe('StudentFilterSheet', () => {
  it('applies a sign-in filter the moment it is chosen', () => {
    const props = baseProps();
    render(<StudentFilterSheet {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Never signed in' }));
    expect(props.onFiltersChange).toHaveBeenCalledWith({ signIn: 'never', account: 'any', form: 'any' });
  });

  it('narrows to students with no application form', () => {
    const props = baseProps();
    render(<StudentFilterSheet {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.click(screen.getByRole('radio', { name: 'No application form' }));
    expect(props.onFiltersChange).toHaveBeenCalledWith({ signIn: 'any', account: 'any', form: 'missing' });
  });

  it('clears every facet at once', () => {
    const props = {
      ...baseProps(),
      filters: { signIn: 'never' as const, account: 'no_microsoft' as const, form: 'missing' as const },
      examBatchFilter: 'all',
      batchFilter: 'unassigned',
    };
    render(<StudentFilterSheet {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(props.onFiltersChange).toHaveBeenCalledWith(DEFAULT_FILTERS);
    expect(props.onExamBatchFilterChange).toHaveBeenCalledWith('current');
    expect(props.onBatchFilterChange).toHaveBeenCalledWith(null);
  });

  it('counts every narrowing facet', () => {
    expect(narrowingCount({ filters: DEFAULT_FILTERS, examBatchFilter: 'current', batchFilter: null })).toBe(0);
    expect(
      narrowingCount({
        filters: { signIn: 'never', account: 'any', form: 'missing' },
        examBatchFilter: 'all',
        batchFilter: 'b1',
      }),
    ).toBe(4);
  });
});

describe('ActiveFilterChips', () => {
  it('shows a removable chip per facet and removes just that one', () => {
    const props = {
      ...baseProps(),
      filters: { signIn: 'never' as const, account: 'any' as const, form: 'any' as const },
    };
    render(<ActiveFilterChips {...props} />);
    const chip = screen.getByRole('button', { name: /Never signed in/ });
    fireEvent.click(chip.querySelector('.MuiChip-deleteIcon') as Element);
    expect(props.onFiltersChange).toHaveBeenCalledWith({ signIn: 'any', account: 'any', form: 'any' });
  });

  it('shows the application form filter as a chip too', () => {
    const props = {
      ...baseProps(),
      filters: { signIn: 'any' as const, account: 'any' as const, form: 'missing' as const },
    };
    render(<ActiveFilterChips {...props} />);
    const chip = screen.getByRole('button', { name: /No application form/ });
    fireEvent.click(chip.querySelector('.MuiChip-deleteIcon') as Element);
    expect(props.onFiltersChange).toHaveBeenCalledWith({ signIn: 'any', account: 'any', form: 'any' });
  });

  it('renders nothing when nothing narrows', () => {
    const { container } = render(<ActiveFilterChips {...baseProps()} />);
    expect(container.firstChild).toBeNull();
  });
});
