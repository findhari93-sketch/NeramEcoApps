import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { TEACHER_TEXT_SCALE, __resetTextScale, readTextScale, setTextScale, stepTextScale, textScaleLabel, useTextScale } from './text-scale';

beforeEach(() => {
  localStorage.clear();
  __resetTextScale();
});

describe('text scale', () => {
  it('has no choice until one is made, and remembers a choice on this device', () => {
    expect(readTextScale()).toBeNull();
    setTextScale(1.15);
    __resetTextScale();
    expect(readTextScale()).toBe(1.15);
  });

  it('ignores a stored value that is not one of the sizes', () => {
    localStorage.setItem('pad-text-scale', '3');
    expect(readTextScale()).toBeNull();
  });

  it('steps one size at a time and stops at either end', () => {
    expect(stepTextScale(1, 1)).toBe(1.15);
    expect(stepTextScale(1.3, 1)).toBe(1.3);
    expect(stepTextScale(1, -1)).toBe(0.875);
    expect(stepTextScale(0.875, -1)).toBe(0.875);
    expect(textScaleLabel(1.3)).toBe('Largest');
    expect(textScaleLabel(0.875)).toBe('Default');
  });

  it('starts a teacher one step smaller and a student at the browser size, until a size is chosen', () => {
    expect(renderHook(() => useTextScale(TEACHER_TEXT_SCALE)).result.current).toBe(0.875);
    expect(renderHook(() => useTextScale()).result.current).toBe(1);
    act(() => setTextScale(1.15));
    expect(renderHook(() => useTextScale(TEACHER_TEXT_SCALE)).result.current).toBe(1.15);
  });

  it('tells every screen using it when the size changes', () => {
    const { result } = renderHook(() => useTextScale(TEACHER_TEXT_SCALE));
    expect(result.current).toBe(0.875);
    act(() => setTextScale(1.3));
    expect(result.current).toBe(1.3);
  });
});
