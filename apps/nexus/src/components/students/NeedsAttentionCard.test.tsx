import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import NeedsAttentionCard, { ATTENTION_COLLAPSED_KEY } from './NeedsAttentionCard';

const none = {
  duplicateCount: 0,
  mismatchCount: 0,
  neverSignedInCount: 0,
  noFormCount: 0,
  noStageCount: 0,
  noYearCount: 0,
  suggestionCount: 0,
};

beforeEach(() => {
  localStorage.clear();
});

describe('NeedsAttentionCard', () => {
  it('renders nothing when nothing needs attention', () => {
    const { container } = render(<NeedsAttentionCard {...none} canEdit onAction={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('is a labelled region that counts its rows and runs an action by key', () => {
    const onAction = vi.fn();
    render(<NeedsAttentionCard {...none} neverSignedInCount={6} noYearCount={2} canEdit onAction={onAction} />);
    expect(screen.getByRole('region', { name: 'Needs attention' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Needs attention (2)' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show them' }));
    expect(onAction).toHaveBeenCalledWith('show_never_signed_in');
  });

  it('remembers being collapsed', () => {
    const { unmount } = render(<NeedsAttentionCard {...none} noYearCount={2} canEdit onAction={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Needs attention (1)' }));
    expect(screen.queryByText(/no exam year/)).toBeNull();
    expect(localStorage.getItem(ATTENTION_COLLAPSED_KEY)).toBe('1');
    unmount();

    render(<NeedsAttentionCard {...none} noYearCount={2} canEdit onAction={vi.fn()} />);
    expect(screen.queryByText(/no exam year/)).toBeNull();
  });

  it('hides data-changing actions from someone who cannot edit, and says why', () => {
    render(<NeedsAttentionCard {...none} noYearCount={2} neverSignedInCount={1} canEdit={false} onAction={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Set exam year' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Show them' })).toBeTruthy();
    expect(screen.getByText(/Ask a manager/)).toBeTruthy();
  });

  it('lets anyone look for missing application forms', () => {
    const onAction = vi.fn();
    render(<NeedsAttentionCard {...none} noFormCount={3} canEdit={false} onAction={onAction} />);
    expect(screen.getByText(/3 students have no application form linked/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Find their forms' }));
    expect(onAction).toHaveBeenCalledWith('review_forms');
  });
});
