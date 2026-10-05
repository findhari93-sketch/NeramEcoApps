/**
 * The Answer Pad's text size, chosen by the teacher from the console's menu and
 * kept on this device. The pad runs in its own frame, so the size is the frame's
 * root font size: every MUI font is in rem and scales with it, while spacing and
 * touch targets (px) stay as they are.
 *
 * Teachers start one step smaller than the browser's size, so the console fits
 * the narrow Teams side panel (the founder's choice, 2026-10-04). Students, who
 * have no size control, keep the browser's size.
 */

import { useSyncExternalStore } from 'react';

export const TEXT_SCALES = [
  { value: 0.875, label: 'Default' },
  { value: 1, label: 'Larger' },
  { value: 1.15, label: 'Larger still' },
  { value: 1.3, label: 'Largest' },
] as const;

export type TextScale = (typeof TEXT_SCALES)[number]['value'];

/** Where a teacher's console starts until they choose a size. */
export const TEACHER_TEXT_SCALE: TextScale = 0.875;
/** Where everyone else starts: the browser's own size. */
export const STUDENT_TEXT_SCALE: TextScale = 1;

const STORAGE_KEY = 'pad-text-scale';
const listeners = new Set<() => void>();
/** The size chosen on this device, or null when nobody has chosen; undefined until read. */
let current: TextScale | null | undefined;

function isTextScale(value: unknown): value is TextScale {
  return TEXT_SCALES.some((scale) => scale.value === value);
}

/** The size chosen on this device, or null when none was chosen. */
export function readTextScale(): TextScale | null {
  if (current !== undefined) return current;
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    current = isTextScale(stored) ? stored : null;
  } catch {
    current = null;
  }
  return current;
}

export function setTextScale(value: TextScale): void {
  current = value;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Private mode or blocked storage: the size lasts for this visit only.
  }
  for (const listener of listeners) listener();
}

/** One step smaller or larger, staying inside the scale. */
export function stepTextScale(value: TextScale, step: -1 | 1): TextScale {
  const index = TEXT_SCALES.findIndex((scale) => scale.value === value);
  const next = Math.min(TEXT_SCALES.length - 1, Math.max(0, (index < 0 ? 0 : index) + step));
  return TEXT_SCALES[next].value;
}

export function textScaleLabel(value: TextScale): string {
  return TEXT_SCALES.find((scale) => scale.value === value)?.label ?? 'Default';
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The size in use: the one chosen on this device, else `fallback`. */
export function useTextScale(fallback: TextScale = STUDENT_TEXT_SCALE): TextScale {
  const chosen = useSyncExternalStore(subscribe, readTextScale, () => null);
  return chosen ?? fallback;
}

/** Test seam. */
export function __resetTextScale(): void {
  current = undefined;
  listeners.clear();
}
