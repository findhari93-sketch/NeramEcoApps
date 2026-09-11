import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import TimecodeField from './TimecodeField';

/**
 * A checkpoint's start or end, as a time a teacher reads off the video.
 *
 * It replaces a raw "Start (sec)" number box. "Now" takes the time the video is
 * paused at, so a boundary is set by watching, not by arithmetic.
 */

function renderField(over: Partial<React.ComponentProps<typeof TimecodeField>> = {}) {
  const props = {
    label: 'Start',
    seconds: 924,
    onChange: vi.fn(),
    nowSeconds: 754,
    onPlayFrom: vi.fn(),
    ...over,
  };
  render(<TimecodeField {...props} />);
  return props;
}

const input = () => screen.getByLabelText('Start') as HTMLInputElement;

describe('TimecodeField', () => {
  it('shows the time as the player shows it', () => {
    renderField();
    expect(input().value).toBe('15:24');
  });

  it('commits a typed time when the field is left', () => {
    const props = renderField();
    fireEvent.change(input(), { target: { value: '15:30' } });
    fireEvent.blur(input());
    expect(props.onChange).toHaveBeenCalledWith(930);
  });

  it('refuses something that is not a time, says how to write one, and changes nothing', () => {
    const props = renderField();
    fireEvent.change(input(), { target: { value: 'abc' } });
    fireEvent.blur(input());
    expect(props.onChange).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('like 15:24');
  });

  it('takes the time the video is at', () => {
    const props = renderField();
    fireEvent.click(screen.getByRole('button', { name: 'Set start to 12:34, where the video is now' }));
    expect(props.onChange).toHaveBeenCalledWith(754);
  });

  it('plays the video from this time', () => {
    const props = renderField();
    fireEvent.click(screen.getByRole('button', { name: 'Play the video from 15:24' }));
    expect(props.onPlayFrom).toHaveBeenCalledWith(924);
  });

  it('shows the new time when the value changes from outside', () => {
    const { rerender } = render(<TimecodeField label="End" seconds={60} onChange={vi.fn()} />);
    rerender(<TimecodeField label="End" seconds={3758} onChange={vi.fn()} />);
    expect((screen.getByLabelText('End') as HTMLInputElement).value).toBe('1:02:38');
  });
});
