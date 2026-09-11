import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PeopleSearchField, { ANNOUNCE_DELAY_MS, describeResults } from './PeopleSearchField';

/** Controlled the way the Photo Review page drives it. */
function Harness({
  initial = '',
  resultCount,
  onChangeSpy,
}: {
  initial?: string;
  resultCount?: number;
  onChangeSpy?: (next: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <PeopleSearchField
      value={value}
      onChange={(next) => {
        onChangeSpy?.(next);
        setValue(next);
      }}
      label="Search students by name"
      placeholder="Search by name"
      resultCount={resultCount}
    />
  );
}

const box = () => screen.getByRole('searchbox') as HTMLInputElement;

afterEach(() => {
  vi.useRealTimers();
});

describe('PeopleSearchField', () => {
  it('is a named search box inside a search landmark', () => {
    render(<Harness />);
    expect(screen.getByRole('search')).toBeTruthy();
    expect(screen.getByRole('searchbox', { name: 'Search students by name' })).toBeTruthy();
  });

  it('shows the clear button only once there is text', () => {
    render(<Harness />);
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();

    fireEvent.change(box(), { target: { value: 'ba' } });

    expect(screen.getByRole('button', { name: 'Clear search' })).toBeTruthy();
  });

  it('clears in one tap and leaves the cursor in the box', () => {
    render(<Harness initial="ba" />);

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));

    expect(box().value).toBe('');
    expect(document.activeElement).toBe(box());
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
  });

  it('clears on Escape and keeps the key to itself, so a surrounding dialog stays open', () => {
    const onChangeSpy = vi.fn();
    const outer = vi.fn();
    render(
      <div onKeyDown={outer}>
        <Harness initial="ba" onChangeSpy={onChangeSpy} />
      </div>,
    );

    fireEvent.keyDown(box(), { key: 'Escape' });

    expect(onChangeSpy).toHaveBeenCalledWith('');
    expect(box().value).toBe('');
    expect(outer).not.toHaveBeenCalled();
  });

  it('lets Escape through when there is nothing to clear', () => {
    const onChangeSpy = vi.fn();
    const outer = vi.fn();
    render(
      <div onKeyDown={outer}>
        <Harness onChangeSpy={onChangeSpy} />
      </div>,
    );

    fireEvent.keyDown(box(), { key: 'Escape' });

    expect(onChangeSpy).not.toHaveBeenCalled();
    expect(outer).toHaveBeenCalled();
  });

  it('searches a half-typed name as typed, with no autocorrect or capitals', () => {
    render(<Harness />);
    expect(box().getAttribute('autocorrect')).toBe('off');
    expect(box().getAttribute('autocapitalize')).toBe('none');
    expect(box().getAttribute('spellcheck')).toBe('false');
    expect(box().getAttribute('enterkeyhint')).toBe('search');
  });

  it('announces how many matched once typing pauses', () => {
    vi.useFakeTimers();
    render(<Harness initial="ba" resultCount={3} />);
    const status = screen.getByRole('status');
    expect(status.textContent).toBe('');

    act(() => {
      vi.advanceTimersByTime(ANNOUNCE_DELAY_MS);
    });

    expect(status.textContent).toBe('3 students match');
  });

  it('announces nothing while the box is empty', () => {
    vi.useFakeTimers();
    render(<Harness resultCount={36} />);

    act(() => {
      vi.advanceTimersByTime(ANNOUNCE_DELAY_MS);
    });

    expect(screen.getByRole('status').textContent).toBe('');
  });
});

describe('describeResults', () => {
  it('reads naturally for none, one and many', () => {
    expect(describeResults(0, ['student', 'students'])).toBe('No students match');
    expect(describeResults(1, ['student', 'students'])).toBe('1 student matches');
    expect(describeResults(3, ['student', 'students'])).toBe('3 students match');
  });
});
