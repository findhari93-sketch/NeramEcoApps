'use client';

import { Box } from '@neram/ui';
import { tokens } from '@/design-system';
import { NARROW, motion, type SceneProps } from '../motion';
import { img } from '../palette';
import { splitRule } from './shared';

const INSPIRATION = ['insp-1', 'insp-2', 'insp-3', 'insp-4'];

/** 06 Sketchbook: a two-point perspective block draws itself, then inspiration for the question appears. */
export default function SketchbookScene(props: SceneProps) {
  const { appear, draw } = motion(props);
  const line = { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round', pathLength: 1 } as const;

  return (
    <Box sx={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)' }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, p: 1.5, borderRight: splitRule, minWidth: 0, [NARROW]: { p: 1 } }}>
        <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1, fontSize: 12 }}>
          <Box component="strong" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
            Your sketchbook
          </Box>
          <Box component="span" sx={{ fontSize: 11, fontWeight: 600, color: tokens.inkMuted, whiteSpace: 'nowrap' }}>
            Page 12
          </Box>
        </Box>
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            borderRadius: '6px',
            bgcolor: tokens.ground,
            backgroundImage: `radial-gradient(${tokens.lineStrong} 1px, transparent 1px)`,
            backgroundSize: '14px 14px',
          }}
        >
          <Box component="svg" viewBox="0 0 300 200" preserveAspectRatio="xMidYMid meet" sx={{ display: 'block', width: '100%', height: '100%' }}>
            <path d="M20 60 L280 60" stroke={tokens.lineStrong} strokeWidth={1} strokeDasharray="4 4" fill="none" />
            <path
              d="M150 50 L150 150 M150 50 L95 70 L95 140 L150 150 L215 138 L215 72 L150 50"
              stroke={tokens.ink}
              strokeWidth={2.2}
              {...line}
              style={draw(0.3, 1.6)}
            />
            <path d="M95 70 L20 60 M215 72 L280 60" stroke={tokens.gold500} strokeWidth={1.6} {...line} style={draw(2.0, 0.8)} />
            <path
              d="M110 140 L110 100 L135 96 L135 145 M170 146 L170 100 L198 104 L198 141"
              stroke={tokens.ink}
              strokeWidth={1.6}
              {...line}
              style={draw(2.8, 1.0)}
            />
          </Box>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, p: 1.5, minWidth: 0, [NARROW]: { p: 1 } }}>
        <Box component="strong" sx={{ fontSize: 12, fontWeight: 700, lineHeight: 1.3 }}>
          Inspiration for this question
        </Box>
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gridTemplateRows: 'repeat(2, minmax(0, 1fr))',
            gap: 0.75,
          }}
        >
          {INSPIRATION.map((name, i) => (
            <Box
              key={name}
              style={appear(3.4 + i * 0.3, 0.45, 6)}
              sx={{ position: 'relative', minHeight: 0, borderRadius: '6px', overflow: 'hidden', bgcolor: tokens.navy800 }}
            >
              <Box
                component="img"
                src={img(name)}
                alt=""
                loading="lazy"
                decoding="async"
                sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
