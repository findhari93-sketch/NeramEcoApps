/**
 * The Answer Pad's text size, chosen by the teacher from the console's menu and
 * kept on this device. The pad runs in its own frame, so the size is the frame's
 * root font size: every MUI font is in rem and scales with it, while spacing and
 * touch targets (px) stay as they are.
 */

import { useSyncExternalStore } from 'react';

export const TEXT_SCALES = [
  { value: 0.875, label: 'Smaller' },
  { value: 1, label: 'Default' },
  { value: 1.15, label: 'Larger' },
  { value: 1.3, label: 'Largest' },
] as const;

export type TextScale = (typeof TEXT_SCALES)[number]['value'];

const STORAGE_KEY = 'pad-text-scale';
const listeners = new Set<() => void>();
let current: TextScale | null = null;

function isTextScale(value: unknown): value is TextScale {
  return TEXT_SCALES.some((scale) => scale.value === value);
}

export function readTextScale(): TextScale {
  if (current !== null) return current;
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    current = isTextScale(stored) ? stored : 1;
  } catch {
    current = 1;
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
  const next = Math.min(TEXT_SCALES.length - 1, Math.max(0, (index < 0 ? 1 : index) + step));
  return TEXT_SCALES[next].value;
}

export function textScaleLabel(value: TextScale): string {
  return TEXT_SCALES.find((scale) => scale.value === value)?.label ?? 'Default';
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTextScale(): TextScale {
  return useSyncExternalStore(subscribe, readTextScale, () => 1);
}

/** Test seam. */
export function __resetTextScale(): void {
  current = null;
  listeners.clear();
}
