import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isNarrow, useContainerWidth } from './useContainerWidth';

/**
 * The width of the box a component sits in, which MUI breakpoints cannot give
 * (they measure the window). A resize of the box has to reach the component.
 */

let width = 480;
let observers: Array<() => void> = [];
const realRect = HTMLElement.prototype.getBoundingClientRect;
const realRO = globalThis.ResizeObserver;

beforeEach(() => {
  observers = [];
  HTMLElement.prototype.getBoundingClientRect = function () {
    return { width, height: 10, top: 0, left: 0, right: width, bottom: 10, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  };
  globalThis.ResizeObserver = class {
    cb: () => void;
    constructor(cb: () => void) {
      this.cb = cb;
    }
    observe() {
      observers.push(this.cb);
    }
    unobserve() {}
    disconnect() {
      observers = observers.filter((o) => o !== this.cb);
    }
  } as unknown as typeof ResizeObserver;
});

afterEach(() => {
  HTMLElement.prototype.getBoundingClientRect = realRect;
  globalThis.ResizeObserver = realRO;
});

function Probe() {
  const [ref, w] = useContainerWidth();
  return (
    <div ref={ref} data-testid="probe">
      {w == null ? 'unknown' : String(w)}
    </div>
  );
}

describe('useContainerWidth', () => {
  it('measures the box on mount and follows it as it resizes', () => {
    width = 480;
    render(<Probe />);
    expect(screen.getByTestId('probe').textContent).toBe('480');

    width = 760;
    act(() => observers.forEach((o) => o()));
    expect(screen.getByTestId('probe').textContent).toBe('760');
  });

  it('reads a box with no layout as unknown, not as narrow', () => {
    width = 0;
    render(<Probe />);
    expect(screen.getByTestId('probe').textContent).toBe('unknown');
  });

  it('stops listening once the box is gone', () => {
    const { unmount } = render(<Probe />);
    expect(observers).toHaveLength(1);
    unmount();
    expect(observers).toHaveLength(0);
  });
});

describe('isNarrow', () => {
  it('answers the fallback before the first measurement', () => {
    expect(isNarrow(null, 720)).toBe(false);
    expect(isNarrow(null, 720, true)).toBe(true);
    expect(isNarrow(480, 720)).toBe(true);
    expect(isNarrow(900, 720)).toBe(false);
  });
});
