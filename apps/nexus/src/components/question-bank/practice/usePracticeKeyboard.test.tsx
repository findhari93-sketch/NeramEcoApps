import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePracticeKeyboard, type PracticeKeyboardActions } from './usePracticeKeyboard';

function actions(): PracticeKeyboardActions {
  return { next: vi.fn(), prev: vi.fn(), selectOption: vi.fn(), primary: vi.fn(), goTo: vi.fn(), help: vi.fn() };
}

function press(key: string, target: EventTarget = document.body, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('usePracticeKeyboard', () => {
  it('moves with the arrows and j / k, and picks options by letter or number', () => {
    const a = actions();
    renderHook(() => usePracticeKeyboard(a, true));
    press('ArrowRight');
    press('k');
    press('b');
    press('3');
    expect(a.next).toHaveBeenCalledTimes(1);
    expect(a.prev).toHaveBeenCalledTimes(1);
    expect(a.selectOption).toHaveBeenNthCalledWith(1, 1);
    expect(a.selectOption).toHaveBeenNthCalledWith(2, 2);
  });

  it('leaves typing alone', () => {
    const a = actions();
    renderHook(() => usePracticeKeyboard(a, true));
    const input = document.createElement('input');
    document.body.appendChild(input);
    press('j', input);
    press('ArrowRight', input);
    expect(a.next).not.toHaveBeenCalled();
  });

  it('leaves modifier combinations alone, so Ctrl+F and Alt+Left still work', () => {
    const a = actions();
    renderHook(() => usePracticeKeyboard(a, true));
    press('ArrowLeft', document.body, { altKey: true });
    press('f', document.body, { ctrlKey: true });
    expect(a.prev).not.toHaveBeenCalled();
  });

  it('lets Enter on a button do what the button says', () => {
    const a = actions();
    renderHook(() => usePracticeKeyboard(a, true));
    const button = document.createElement('button');
    document.body.appendChild(button);
    press('Enter', button);
    expect(a.primary).not.toHaveBeenCalled();
    press('Enter');
    expect(a.primary).toHaveBeenCalledTimes(1);
  });

  it('steps aside while a dialog is open', () => {
    const a = actions();
    renderHook(() => usePracticeKeyboard(a, true));
    const modal = document.createElement('div');
    modal.className = 'MuiModal-root';
    document.body.appendChild(modal);
    press('ArrowRight');
    expect(a.next).not.toHaveBeenCalled();
  });

  it('leaves the arrows to the number grid, which moves its own focus', () => {
    const a = actions();
    renderHook(() => usePracticeKeyboard(a, true));
    const grid = document.createElement('div');
    grid.setAttribute('data-roving', '');
    const cell = document.createElement('button');
    grid.appendChild(cell);
    document.body.appendChild(grid);
    press('ArrowRight', cell);
    expect(a.next).not.toHaveBeenCalled();
  });

  it('jumps to a number typed after g', () => {
    vi.useFakeTimers();
    const a = actions();
    renderHook(() => usePracticeKeyboard(a, true));
    press('g');
    press('1');
    press('8');
    vi.advanceTimersByTime(1600);
    expect(a.goTo).toHaveBeenCalledWith(18);
    expect(a.selectOption).not.toHaveBeenCalled();
  });

  it('does nothing when switched off', () => {
    const a = actions();
    renderHook(() => usePracticeKeyboard(a, false));
    press('ArrowRight');
    expect(a.next).not.toHaveBeenCalled();
  });
});
