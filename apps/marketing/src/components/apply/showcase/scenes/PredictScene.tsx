'use client';

import { Box } from '@neram/ui';
import FlagOutlined from '@mui/icons-material/FlagOutlined';
import { tokens } from '@/design-system';
import { NARROW, motion, type SceneProps } from '../motion';
import { SHOWCASE_COLORS, goldTint } from '../palette';

const CHAPTERS: Array<[string, number]> = [
  ['3D geometry', 16],
  ['Sequences & series', 15],
  ['Probability', 13],
  ['Applications of derivatives', 11],
  ['Mensuration', 9],
];
const YEARS = 17;

/** 03 Predict: AI ranks the chapters by how many of the last 17 papers asked them. */
export default function PredictScene(props: SceneProps) {
  const { k, appear } = motion(props);
  const hi = k(4.4, 0.4);

  return (
    <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap: 0.5, p: '14px 16px', [NARROW]: { p: '10px 12px' } }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1, pb: 1, borderBottom: `1px solid ${tokens.ink}` }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Box component="strong" sx={{ fontSize: 14, lineHeight: 1.3 }}>
            Most likely chapters · 2027
          </Box>
          <Box component="span" sx={{ fontSize: 11, color: tokens.inkMuted }}>
            JEE Paper 2A · from 17 years of papers
          </Box>
        </Box>
        <Box
          component="span"
          sx={{
            flex: 'none',
            fontFamily: tokens.fontMono,
            // The reference says 10px; 11px is the floor inside the window.
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '.1em',
            bgcolor: tokens.navy900,
            color: tokens.gold500,
            p: '4px 8px',
            borderRadius: '4px',
            whiteSpace: 'nowrap',
          }}
        >
          AI PREDICTOR
        </Box>
      </Box>

      {CHAPTERS.map(([name, n], i) => {
        const top = i < 3;
        const q = k(0.5 + i * 0.4, 0.9);
        const tint = top && hi > 0;
        return (
          <Box
            key={name}
            style={{
              ...appear(0.3 + i * 0.4, 0.4, 6),
              backgroundColor: tint ? goldTint(0.12 * hi) : undefined,
              boxShadow: top && hi > 0.5 ? `inset 3px 0 0 ${tokens.gold500}` : undefined,
            }}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.25,
              minHeight: 30,
              px: 1,
              mx: -1,
              borderRadius: '6px',
              borderBottom: `1px solid ${tokens.line}`,
              [NARROW]: { minHeight: 26 },
            }}
          >
            <Box component="span" sx={{ width: 16, flex: 'none', fontFamily: tokens.fontMono, fontSize: 12, fontWeight: 700, color: tokens.inkMuted }}>
              {i + 1}
            </Box>
            <Box
              component="span"
              sx={{ width: '38%', flex: 'none', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
            >
              {name}
            </Box>
            <Box component="span" sx={{ flex: 1, height: 8, borderRadius: '4px', bgcolor: tokens.line, overflow: 'hidden' }}>
              <Box
                component="span"
                style={{ width: `${(n / YEARS) * q * 100}%` }}
                sx={{ display: 'block', height: 8, bgcolor: top ? tokens.gold500 : SHOWCASE_COLORS.greyBar }}
              />
            </Box>
            <Box
              component="span"
              sx={{ width: 38, flex: 'none', textAlign: 'right', fontFamily: tokens.fontMono, fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
            >
              {`${Math.round(n * q)}/${YEARS}`}
            </Box>
          </Box>
        );
      })}

      <Box style={appear(4.6)} sx={{ mt: 'auto', display: 'flex', alignItems: 'flex-start', gap: 0.75, fontSize: 11, lineHeight: 1.4, color: tokens.ink }}>
        <FlagOutlined sx={{ fontSize: 16, color: tokens.gold800, flex: 'none' }} />
        Start with the top 3. Bars show how many years each chapter was asked.
      </Box>
    </Box>
  );
}
