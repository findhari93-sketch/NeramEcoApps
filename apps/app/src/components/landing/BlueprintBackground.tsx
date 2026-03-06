'use client';

import { Box } from '@neram/ui';

/**
 * BlueprintBackground — CSS-only background layers for the aiArchitek landing page.
 * Adapted from the marketing app's BlueprintBackground.
 */
export default function BlueprintBackground() {
  return (
    <>
      {/* Animated blueprint grid */}
      <Box
        className="ai-blueprint-bg-animated"
        sx={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      />

      {/* Radial glows */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: {
            xs: `
              radial-gradient(ellipse 300px 300px at 50% 40%, rgba(232,160,32,0.08) 0%, transparent 70%),
              radial-gradient(ellipse 400px 250px at 20% 80%, rgba(26,143,255,0.06) 0%, transparent 70%)
            `,
            md: `
              radial-gradient(ellipse 600px 500px at 50% 40%, rgba(232,160,32,0.08) 0%, transparent 70%),
              radial-gradient(ellipse 800px 400px at 15% 85%, rgba(26,143,255,0.06) 0%, transparent 70%),
              radial-gradient(ellipse 400px 300px at 85% 15%, rgba(62,184,255,0.04) 0%, transparent 70%)
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
