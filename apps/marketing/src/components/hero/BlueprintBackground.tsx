'use client';

import { Box } from '@neram/ui';

/**
 * BlueprintBackground — 5 CSS layers for the hero background
 * 1. Animated blueprint grid (small 40px + large 200px)
 * 2. Radial glow (gold, centered on clock position)
 * 3. Radial glow (blue, bottom-left)
 * 4. Radial glow (blue, top-right subtle)
 * 5. Noise texture overlay
 */
export default function BlueprintBackground() {
  return (
    <>
      {/* Blueprint grid (animated) */}
      <Box
        className="neram-blueprint-bg-animated"
        sx={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
        }}
      />

      {/* Radial glows */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: {
            xs: `
              radial-gradient(ellipse 300px 300px at 72% 50%, rgba(232,160,32,0.07) 0%, transparent 70%),
              radial-gradient(ellipse 400px 250px at 20% 80%, rgba(26,143,255,0.05) 0%, transparent 70%),
              radial-gradient(ellipse 200px 150px at 80% 10%, rgba(62,184,255,0.04) 0%, transparent 70%)
            `,
            md: `
              radial-gradient(ellipse 600px 600px at 72% 50%, rgba(232,160,32,0.07) 0%, transparent 70%),
              radial-gradient(ellipse 800px 500px at 20% 80%, rgba(26,143,255,0.05) 0%, transparent 70%),
              radial-gradient(ellipse 400px 300px at 80% 10%, rgba(62,184,255,0.04) 0%, transparent 70%)
            `,
          },
        }}
      />

      {/* Noise texture */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          opacity: 0.025,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: '256px',
          pointerEvents: 'none',
        }}
      />
    </>
  );
}
