'use client';

/**
 * Measure a drawing photo in the browser, from a local file or a URL.
 *
 * Returns null rather than throwing: a photo that cannot be measured is simply
 * "not checked yet" to triage, and must never block an upload or a review.
 */

import { MEASURE_SIDE, measureQuality, type ImageQuality } from './image-quality';
import { drawingFingerprint } from './image-fingerprint';

/** Never wait on a photo for longer than this; unknown is a fine answer. */
const LOAD_TIMEOUT_MS = 8000;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Needed to read pixels back from a photo on another origin.
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => reject(new Error('The photo took too long to load')), LOAD_TIMEOUT_MS);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); reject(new Error('The photo could not be loaded')); };
    img.src = src;
  });
}

type Drawable = { source: CanvasImageSource; width: number; height: number; close?: () => void };

async function decode(source: Blob | string): Promise<Drawable | null> {
  if (typeof source === 'string') {
    const img = await loadImage(source);
    return { source: img, width: img.naturalWidth || img.width, height: img.naturalHeight || img.height };
  }
  // A local file decodes off the main thread. Where the browser (or a test
  // environment) cannot, say so at once rather than hang an upload waiting.
  if (typeof createImageBitmap !== 'function') return null;
  const bitmap = await createImageBitmap(source);
  return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
}

export async function measureImageQuality(source: Blob | string): Promise<ImageQuality | null> {
  let drawable: Drawable | null = null;
  try {
    drawable = await decode(source);
    if (!drawable || !drawable.width || !drawable.height) return null;
    const { width: naturalW, height: naturalH } = drawable;

    const scale = Math.min(1, MEASURE_SIDE / Math.max(naturalW, naturalH));
    const w = Math.max(3, Math.round(naturalW * scale));
    const h = Math.max(3, Math.round(naturalH * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(drawable.source, 0, 0, w, h);
    const pixels = ctx.getImageData(0, 0, w, h).data;
    const quality = measureQuality(pixels, w, h, naturalW / naturalH);
    // Same pixels, so a fingerprint costs one more pass, never another decode.
    const fp = drawingFingerprint(pixels, w, h);
    return fp ? { ...quality, fp } : quality;
  } catch {
    return null;
  } finally {
    drawable?.close?.();
  }
}
