/**
 * Neram marketing site tokens (neramclasses.com), 2026 design system.
 *
 * One token set, two surfaces: a dark navy band (hero, header on dark pages,
 * CTA band, footer) and a light body for long-form content. Role names follow
 * the design handoff in apps/marketing/Docs/Marketing Website Design Audit.
 *
 * Pure constants with no 'use client', so server components can import them
 * through `@neram/ui/site-tokens`. Hex values match `neramTokens` where the two
 * overlap; they are written out here because neram-2026.ts is a client module.
 * `neramTokens` itself is never changed (App and Nexus import it).
 */

const GOLD_500 = '#e8a020';

export const siteTokens = {
  // ── Dark surface ──
  navy900: '#060d1f', // dark ground, header (dark), footer, CTA band, icon tiles
  navy800: '#0b1629', // cards and inputs on dark
  navy700: '#122040', // avatars, hover on dark buttons
  paper: '#f5f0e8', // text on dark
  paperMuted: 'rgba(245,240,232,0.72)', // lede and body on dark
  paperSubtle: 'rgba(245,240,232,0.62)', // breadcrumbs, stat labels on dark
  lineDark: 'rgba(255,255,255,0.08)', // rules and borders on dark
  outlineDark: 'rgba(245,240,232,0.4)', // outline buttons on dark

  // ── Gold ──
  gold500: GOLD_500, // primary action fill only, eyebrows on dark, stat numbers
  gold300: '#f4bf5a', // primary hover, pill text on dark
  goldTintBg: 'rgba(232,160,32,0.12)', // pills and chips on dark
  goldTintBorder: 'rgba(232,160,32,0.35)',
  goldRule: 'rgba(232,160,32,0.15)', // CTA band top border
  gold800: '#8a5a05', // eyebrows, check icons and gold text on light (5.9:1 on white)

  // ── Light surface ──
  ground: '#FAFBFC', // page body
  surface: '#ffffff', // cards, alternate bands, header (light)
  surfaceHover: '#F1F3F6', // open nav item on light
  line: '#E1E5EB', // card borders, row rules
  lineStrong: '#c5ccd4', // input and outline-button borders
  ink: '#1A2027', // text
  inkMuted: '#55606c', // secondary text

  // ── Status ──
  success: '#2E7D32', // verified, enrolment status, "Live" rail only
  statusDraft: '#f4bf5a', // header application status dots
  statusReview: '#5aa9ff',
  statusDone: '#3fae5a',
  statusIdle: '#8a939e', // "coming soon" rail

  // ── Type ──
  fontSans: 'var(--font-inter), "Inter", "Noto Sans Tamil", system-ui, sans-serif',
  fontMono: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',

  // ── Shape ──
  radius: 8, // cards, buttons, inputs, panels
  radiusPill: 100,

  // ── Layout ──
  container: { page: 1200, narrow: 900, article: 780, legal: 700 },
  headerHeight: { desktop: 64, mobile: 56 },

  // ── Effects ──
  shadowHeroCard: '0 24px 48px rgba(0,0,0,0.35)',
  shadowMegaMenu: '0 24px 48px rgba(6,13,31,0.28)',
  focusOutline: `2px solid ${GOLD_500}`,
  /** Dark hero only: white 0.035 on a 40px grid, gold 0.06 on a 200px grid. */
  blueprint: {
    backgroundImage: [
      'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px)',
      'linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)',
      'linear-gradient(rgba(232,160,32,0.06) 1px, transparent 1px)',
      'linear-gradient(90deg, rgba(232,160,32,0.06) 1px, transparent 1px)',
    ].join(', '),
    backgroundSize: '40px 40px, 40px 40px, 200px 200px, 200px 200px',
  },
} as const;

export type SiteTokens = typeof siteTokens;
