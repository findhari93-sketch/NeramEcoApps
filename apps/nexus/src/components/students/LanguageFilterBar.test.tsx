import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import LanguageFilterBar from './LanguageFilterBar';

const counts = { tamil: 12, hindi: 1, kannada: 1, malayalam: 0, english: 23 };

/** The e2e ring selector. A filter chip must never be mistaken for a ring. */
const RING = /(Class 10|Class 11|Class 12|Break Year|Not set|Dormant):/;

function setup(overrides: Partial<ComponentProps<typeof LanguageFilterBar>> = {}) {
  const onChange = vi.fn();
  const onLimitedChange = vi.fn();
  render(
    <LanguageFilterBar
      value={[]}
      counts={counts}
      limitedOnly={false}
      limitedCount={2}
      onChange={onChange}
      onLimitedChange={onLimitedChange}
      {...overrides}
    />,
  );
  return { onChange, onLimitedChange };
}

describe('LanguageFilterBar', () => {
  it('offers all five languages with their counts', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Tamil, 12 students' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hindi, 1 students' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Kannada, 1 students' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Malayalam, 0 students' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'English, 23 students' })).toBeTruthy();
  });

  it('offers the English fluency narrowing separately, worded as a narrowing', () => {
    setup();
    expect(
      screen.getByRole('button', { name: 'Only students with limited English, 2 students' }),
    ).toBeTruthy();
  });

  it('is a labelled group of toggles, not tabs', () => {
    setup();
    expect(screen.getByRole('group', { name: 'Filter students by language' })).toBeTruthy();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });

  it('marks the picked languages as pressed', () => {
    setup({ value: ['hindi'] });
    expect(screen.getByRole('button', { name: /^Hindi/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /^Tamil/ }).getAttribute('aria-pressed')).toBe('false');
  });

  it('adds a language when an unpressed chip is tapped, in the row order', () => {
    const { onChange } = setup({ value: ['english'] });
    fireEvent.click(screen.getByRole('button', { name: /^Tamil/ }));
    expect(onChange).toHaveBeenCalledWith(['tamil', 'english']);
  });

  it('removes a language when a pressed chip is tapped again', () => {
    const { onChange } = setup({ value: ['tamil', 'kannada'] });
    fireEvent.click(screen.getByRole('button', { name: /^Tamil/ }));
    expect(onChange).toHaveBeenCalledWith(['kannada']);
  });

  it('toggles the limited English narrowing on its own channel', () => {
    const { onChange, onLimitedChange } = setup();
    fireEvent.click(screen.getByRole('button', { name: /^Only students with limited English/ }));
    expect(onLimitedChange).toHaveBeenCalledWith(true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('never labels a chip the way a ring is labelled', () => {
    setup();
    expect(screen.queryAllByLabelText(RING)).toHaveLength(0);
  });
});
