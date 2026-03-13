'use client';

import { Box } from '@neram/ui';

/**
 * ArchitecturalSVG — Decorative floor-plan lines + compass rose
 * Positioned on the right side of the hero, behind the clock.
 */
export default function ArchitecturalSVG() {
  return (
    <Box
      sx={{
        position: 'absolute',
        right: 0,
        top: 0,
        width: '55%',
        height: '100%',
        pointerEvents: 'none',
        overflow: 'hidden',
        display: { xs: 'none', md: 'block' },
      }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 700 800"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ position: 'absolute', inset: 0, opacity: 0.18 }}
      >
        {/* Floor plan style lines */}
        <rect x="200" y="150" width="320" height="220" stroke="#e8a020" strokeWidth="0.8" strokeDasharray="4 8" />
        <rect x="240" y="190" width="100" height="80" stroke="#e8a020" strokeWidth="0.5" />
        <rect x="370" y="190" width="110" height="80" stroke="#e8a020" strokeWidth="0.5" />
        <line x1="200" y1="310" x2="520" y2="310" stroke="#e8a020" strokeWidth="0.5" />

        {/* Compass rose */}
        <circle cx="580" cy="600" r="80" stroke="#1a8fff" strokeWidth="0.5" strokeDasharray="3 6" />
        <circle cx="580" cy="600" r="50" stroke="#1a8fff" strokeWidth="0.3" />
        <line x1="580" y1="520" x2="580" y2="680" stroke="#1a8fff" strokeWidth="0.6" />
        <line x1="500" y1="600" x2="660" y2="600" stroke="#1a8fff" strokeWidth="0.6" />
        <line x1="523" y1="543" x2="637" y2="657" stroke="#1a8fff" strokeWidth="0.3" strokeDasharray="2 4" />
        <line x1="637" y1="543" x2="523" y2="657" stroke="#1a8fff" strokeWidth="0.3" strokeDasharray="2 4" />

        {/* Dimension arrows */}
        <line x1="200" y1="420" x2="520" y2="420" stroke="#e8a020" strokeWidth="0.4" strokeDasharray="2 6" />
        <text x="350" y="416" fill="#e8a020" fontSize="8" textAnchor="middle" fontFamily="SFMono-Regular, Cascadia Code, Consolas, monospace">3200mm</text>

        {/* Section lines */}
        <line x1="150" y1="100" x2="150" y2="750" stroke="#1a8fff" strokeWidth="0.4" strokeDasharray="8 4" />
        <line x1="600" y1="100" x2="600" y2="200" stroke="#e8a020" strokeWidth="0.4" strokeDasharray="8 4" />
      </svg>
    </Box>
  );
}
