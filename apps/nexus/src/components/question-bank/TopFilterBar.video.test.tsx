import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import TopFilterBar, { type TopFilterBarProps } from './TopFilterBar';

/**
 * "Video solutions" narrows a student's list to questions that have one. It
 * has to be reachable on a year paper, which is where students practise and
 * where the other quick chips are hidden.
 */

const base = (over: Partial<TopFilterBarProps> = {}): TopFilterBarProps => ({
  filters: {},
  onFilterChange: vi.fn(),
  onOpenDrawer: vi.fn(),
  activeFilterCount: 0,
  ...over,
});

describe('TopFilterBar video filter', () => {
  it('turns the video filter on', () => {
    const onFilterChange = vi.fn();
    render(<TopFilterBar {...base({ onFilterChange, filters: { difficulty: ['EASY'] } })} />);
    const toggle = screen.getByRole('button', { name: 'Video solutions' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect(onFilterChange).toHaveBeenCalledWith({ difficulty: ['EASY'], solution_filter: 'has_video' });
  });

  it('turns it off again from the same place', () => {
    const onFilterChange = vi.fn();
    render(<TopFilterBar {...base({ onFilterChange, filters: { solution_filter: 'has_video' } })} />);
    const toggle = screen.getByRole('button', { name: 'Video solutions' });
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(toggle);
    expect(onFilterChange).toHaveBeenCalledWith({ solution_filter: undefined });
  });

  it('is there on a year paper, where the other quick chips are not', () => {
    render(<TopFilterBar {...base({ isYearPaperView: true })} />);
    expect(screen.queryByRole('button', { name: 'Difficulty' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Video solutions' })).not.toBeNull();
  });
});

describe('TopFilterBar chip row', () => {
  it('wraps instead of scrolling, so nothing in it can be clipped', () => {
    // overflow-x:auto forced overflow-y:auto, and a 44px hit area inside a
    // shorter row then scrolled every chip up under the row's top edge.
    render(<TopFilterBar {...base()} />);
    const row = screen.getByRole('button', { name: 'Video solutions' }).parentElement!;
    const style = window.getComputedStyle(row);
    expect(style.overflowX).not.toBe('auto');
    expect(style.overflowY).not.toBe('auto');
    expect(style.flexWrap).toBe('wrap');
  });

  it('renders what the page pins after the chips', () => {
    render(<TopFilterBar {...base({ trailing: <button type="button">Grid</button> })} />);
    expect(screen.getByRole('button', { name: 'Grid' })).not.toBeNull();
  });
});
