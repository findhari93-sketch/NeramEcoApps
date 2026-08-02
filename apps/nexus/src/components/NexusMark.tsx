'use client';

import { useId } from 'react';

/**
 * The Nexus logo mark.
 *
 * Deliberately the same artwork as public/icon.svg, which is what the PWA
 * installs to the home screen and what the browser shows in the tab. Drawn
 * inline rather than loaded as an image so it costs no request, cannot flash
 * on a cold load, and reserves its own space (no layout shift in the app bar).
 *
 * It replaced a "Nexus" text wordmark in the mobile app bar. The wordmark ate
 * around 55px of a 360px row, which is what pushed the notification bell and
 * the avatar off the right edge of the screen.
 */
export default function NexusMark({
  size = 28,
  title,
}: {
  size?: number;
  /** Accessible name. Omit for a decorative mark next to existing label text. */
  title?: string;
}) {
  // Gradient ids are document-global. Two marks on one page (app bar + sidebar)
  // with the same id would make the second one adopt the first one's gradient.
  const gradientId = useId();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
      focusable="false"
      style={{ display: 'block', flexShrink: 0 }}
    >
      {title && <title>{title}</title>}
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7C3AED" />
          <stop offset="100%" stopColor="#5B21B6" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="96" fill={`url(#${gradientId})`} />
      <text
        x="256"
        y="340"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontSize="280"
        fontWeight="800"
        fill="#fff"
        textAnchor="middle"
        dominantBaseline="central"
        letterSpacing="-10"
      >
        N
      </text>
    </svg>
  );
}
