import type { CSSProperties } from 'react';

/** Seconds a scene plays for, before the hold. The scripts are authored for this length. */
export const AUTHORED_SECONDS = 7;
/** Pause on the finished scene before the tour moves on. */
export const HOLD_SECONDS = 0.6;

/**
 * The showcase section is a size container. Scenes use this query to tighten
 * their layout when the window is narrow (phones, and laptops at 1024 to
 * 1280px where the panel sits beside the form).
 */
export const CONTAINER = 'nxshow';
export const NARROW = `@container ${CONTAINER} (max-width: 479px)`;

export interface SceneProps {
  /** Seconds since the scene started (frozen while paused; equal to `d` under reduced motion). */
  t: number;
  /** Scene length in seconds (sceneSeconds). */
  d: number;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ease = (x: number) => 1 - Math.pow(1 - x, 3);

/**
 * Motion helpers for one frame. Every timestamp in the scene scripts is
 * written for a 7 second scene, so time is rescaled to that clock first.
 * They return inline `style` objects (not sx) so a new value per frame does
 * not mint a new emotion class.
 */
export function motion({ t, d }: SceneProps) {
  const s = (t * AUTHORED_SECONDS) / d;
  const k = (at: number, dur = 0.5) => ease(clamp01((s - at) / dur));
  const appear = (at: number, dur = 0.45, y = 8): CSSProperties => {
    const v = k(at, dur);
    return { opacity: v, transform: v >= 1 ? 'none' : `translateY(${(1 - v) * y}px)` };
  };
  const pop = (at: number): CSSProperties => {
    const v = k(at, 0.35);
    return { opacity: v, transform: `scale(${0.6 + 0.4 * v})`, transformOrigin: 'center', transformBox: 'fill-box' };
  };
  /** For an SVG shape with pathLength={1}. */
  const draw = (at: number, dur: number): CSSProperties => ({ strokeDasharray: 1, strokeDashoffset: 1 - k(at, dur) });
  return { s, k, appear, pop, draw, clamp01 };
}
