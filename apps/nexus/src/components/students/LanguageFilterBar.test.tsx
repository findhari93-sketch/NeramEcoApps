import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import LanguageFilterBar from './LanguageFilterBar';

const counts = { tamil: 12, english: 4, unset: 21 };

/** The e2e ring selector. A filter chip must never be mistaken for a ring. */
const RING = /(Class 10|Class 11|Class 12|Break Year|Not set|Dormant):/;

describe('LanguageFilterBar', () => {
  it('offers Tamil, English only and Not set with their counts', () => {
    render(<LanguageFilterBar value={[]} counts={counts} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Tamil, 12 students' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'English only, 4 students' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Not set, 21 students' })).toBeTruthy();
  });

  it('is a labelled group of toggles, not tabs', () => {
    render(<LanguageFilterBar value={[]} counts={counts} onChange={vi.fn()} />);
    expect(screen.getByRole('group', { name: 'Filter students by language' })).toBeTruthy();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });

  it('marks the picked languages as pressed', () => {
    render(<LanguageFilterBar value={['english']} counts={counts} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /^English only/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /^Tamil/ }).getAttribute('aria-pressed')).toBe('false');
  });

  it('adds a language when an unpressed chip is tapped', () => {
    const onChange = vi.fn();
    render(<LanguageFilterBar value={['english']} counts={counts} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /^Tamil/ }));
    expect(onChange).toHaveBeenCalledWith(['tamil', 'english']);
  });

  it('removes a language when a pressed chip is tapped again', () => {
    const onChange = vi.fn();
    render(<LanguageFilterBar value={['tamil', 'unset']} counts={counts} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /^Tamil/ }));
    expect(onChange).toHaveBeenCalledWith(['unset']);
  });

  it('never labels a chip the way a ring is labelled', () => {
    render(<LanguageFilterBar value={[]} counts={counts} onChange={vi.fn()} />);
    expect(screen.queryAllByLabelText(RING)).toHaveLength(0);
  });
});
