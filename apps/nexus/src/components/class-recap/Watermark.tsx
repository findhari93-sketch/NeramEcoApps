'use client';

import { useEffect, useState } from 'react';
import { Box } from '@neram/ui';

/**
 * The student's name burned over the video.
 *
 * Be clear about what this is and is not. It is not DRM and it does not stop
 * anyone recording their screen. What it does is make a recording worthless as
 * an anonymous artefact: every frame of a leaked video names the account it was
 * played on. That covers the actual leak vector here, which is a phone pointed
 * at a laptop or a screen recorder, neither of which any amount of client-side
 * protection prevents.
 *
 * Two instances render. A large one that moves every few seconds so it cannot be
 * cropped out or masked at a fixed position, and a small permanent one pinned to
 * a corner so a frame grabbed between moves still carries attribution.
 *
 * The values come from the server (the video-embed response), never from client
 * state, so the page cannot be edited to display someone else's name.
 */

const DRIFT_INTERVAL_MS = 7000;

/**
 * Positions avoid the vertical centre band, where the subject of an
 * architecture class actually is, and the bottom strip where the controls live.
 */
const POSITIONS: Array<{ top: string; left: string }> = [
  { top: '12%', left: '8%' },
  { top: '18%', left: '58%' },
  { top: '68%', left: '12%' },
  { top: '74%', left: '52%' },
  { top: '8%', left: '34%' },
  { top: '62%', left: '32%' },
];

interface WatermarkProps {
  name: string;
  code: string;
}

export default function Watermark({ name, code }: WatermarkProps) {
  const [index, setIndex] = useState(0);
  const [clock, setClock] = useState('');

  useEffect(() => {
    // A still watermark is as identifying as a moving one, and drifting text is
    // exactly the kind of movement that bothers motion-sensitive viewers. Honour
    // the preference and keep the corner instance doing the real work.
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    const id = setInterval(() => {
      setIndex((i) => (i + 1) % POSITIONS.length);
    }, DRIFT_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const tick = () =>
      setClock(
        new Intl.DateTimeFormat('en-IN', {
          timeZone: 'Asia/Kolkata',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }).format(new Date()),
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const label = `${name} · ${code}${clock ? ` · ${clock} IST` : ''}`;

  const shared = {
    position: 'absolute' as const,
    // Never intercepts a tap, so it cannot block the controls underneath it.
    pointerEvents: 'none' as const,
    userSelect: 'none' as const,
    WebkitUserSelect: 'none' as const,
    whiteSpace: 'nowrap' as const,
    fontWeight: 700,
    color: '#fff',
    // Stays legible over both a bright drawing and a dark slide.
    mixBlendMode: 'difference' as const,
    textShadow: '0 1px 3px rgba(0,0,0,0.55)',
  };

  return (
    <>
      <Box
        aria-hidden
        sx={{
          ...shared,
          ...POSITIONS[index],
          fontSize: { xs: 11, sm: 13 },
          letterSpacing: 0.3,
          opacity: 0.34,
          transition: 'top 900ms ease, left 900ms ease',
          '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
        }}
      >
        {label}
      </Box>

      {/* Always present, so a crop or a lucky frame still carries a name. */}
      <Box
        aria-hidden
        sx={{
          ...shared,
          left: 10,
          bottom: 74,
          fontSize: { xs: 9, sm: 10 },
          opacity: 0.22,
        }}
      >
        {label}
      </Box>
    </>
  );
}
