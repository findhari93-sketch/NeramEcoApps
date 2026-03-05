'use client';

/**
 * Neram Classes - aiArchitek Era 2026 Design Tokens
 *
 * Standalone token system for the "aiArchitek Era" redesign.
 * Does NOT modify or depend on existing tokens.ts or brand-2025.ts.
 *
 * Design concept: "Neram = Time"
 * - Clock-compass hero visual identity
 * - Blueprint grid backgrounds = architectural credibility
 * - Gold = tradition, warmth, Tamil identity
 * - Blue = AI, technology, Microsoft
 */

// ── CORE COLOR TOKENS ──

export const neramTokens = {
  navy: {
    950: '#030812', // deepest bg (almost black)
    900: '#060d1f', // primary dark bg ← HERO BG
    800: '#0b1629', // card bg in dark
    700: '#122040', // elevated surface
    600: '#1a2d55', // border in dark
    500: '#243b6e', // muted interactive
  },

  gold: {
    400: '#f4bf5a', // hover / light variant
    500: '#e8a020', // PRIMARY GOLD ← brand colour
    600: '#c47d10', // pressed state
    700: '#9c5f08', // dark accessible variant
  },

  blue: {
    300: '#7dd3fc', // very light, tags
    400: '#3eb8ff', // bright AI accent
    500: '#1a8fff', // PRIMARY BLUE ← AI colour
    600: '#0d6ecd', // pressed state
    700: '#0a4f99', // dark variant
  },

  cream: {
    50: '#fdfcf9', // white (light mode bg)
    100: '#f5f0e8', // warm off-white ← dark mode text
    200: '#e8e0d0', // secondary text (light mode)
    300: '#c8bfaa', // muted (light mode)
  },

  // Semantic
  success: '#22c55e',
  error: '#ef4444',
  warning: '#f59e0b',
  info: '#3eb8ff', // = blue.400
} as const;

// ── FONT FAMILIES ──

export const neramFontFamilies = {
  /** Display serif for H1/H2 (hero, section titles) */
  serif: '"Cormorant Garamond", "Lora", Georgia, serif',
  /** Body / UI font */
  body: '"DM Sans", "Noto Sans Tamil", system-ui, sans-serif',
  /** Monospace for captions, code, stats */
  mono: '"Space Mono", monospace',
  /** Tamil support */
  tamil: '"Noto Sans Tamil", "DM Sans", sans-serif',
} as const;

// ── SHADOWS ──

export const neramShadows = {
  goldGlow: `0 12px 40px rgba(232, 160, 32, 0.35)`,
  goldGlowSm: `0 4px 16px rgba(232, 160, 32, 0.2)`,
  blueGlow: `0 12px 40px rgba(26, 143, 255, 0.25)`,
  glass: `0 8px 32px rgba(0, 0, 0, 0.4)`,
  cardHover: `0 20px 60px rgba(0, 0, 0, 0.4)`,
  elevated: `0 10px 30px rgba(0, 0, 0, 0.3)`,
} as const;

// ── TYPE ALIASES ──

export type NeramTokens = typeof neramTokens;
export type NeramFontFamilies = typeof neramFontFamilies;
export type NeramShadows = typeof neramShadows;
