'use client';

/**
 * Re-exported from the shared @neram/ui package so there is a single source of
 * truth. See packages/ui/src/hooks/index.ts for the implementation and rationale.
 *
 * True only on devices whose primary pointer is touch (phones, most tablets),
 * where the file input's `capture` hint actually opens the rear camera. Laptops
 * and desktops return false. Resolves on mount (false during SSR / first paint).
 */
export { useCanCapturePhoto } from '@neram/ui';
