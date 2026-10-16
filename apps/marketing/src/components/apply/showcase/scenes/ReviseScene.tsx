'use client';

import { Box } from '@neram/ui';
import CheckOutlined from '@mui/icons-material/CheckOutlined';
import MilitaryTechOutlined from '@mui/icons-material/MilitaryTechOutlined';
import { tokens } from '@/design-system';
import { NARROW, motion, type SceneProps } from '../motion';
import { CoverImage, splitRule, tagSx } from './shared';

const RUBRIC: Array<[string, number]> = [
  ['Composition', 5],
  ['Proportion & scale', 4],
  ['Tonal quality', 4],
  ['Line quality', 4],
];

/** 02 Revise: the resubmitted plate scores full marks, row by row. */
export default function ReviseScene(props: SceneProps) {
  const { k, appear } = motion(props);
  const values = RUBRIC.map(([, base], i) => base + (5 - base) * k(1.4 + i * 0.5, 0.7));
  const avg = values.reduce((a, b) => a + b, 0) / values.length;

  return (
    <Box sx={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)' }}>
      <Box sx={{ position: 'relative', overflow: 'hidden', bgcolor: tokens.navy800 }}>
        <CoverImage name="drawing-1215" small="drawing-680" sizes="(min-width: 900px) min(22vw, 340px), 55vw" eager />
        <Box component="span" sx={tagSx}>
          Revision 2
        </Box>
        <Box
          component="span"
          style={appear(0.5)}
          sx={{
            position: 'absolute',
            left: 10,
            bottom: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            bgcolor: tokens.gold500,
            color: tokens.navy900,
            fontSize: 12,
            fontWeight: 800,
            p: '6px 10px',
            borderRadius: '6px',
          }}
        >
          <CheckOutlined sx={{ fontSize: 16 }} />
          Resubmitted
        </Box>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, p: '12px 14px', borderLeft: splitRule, minWidth: 0, [NARROW]: { p: '10px' } }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 1,
            pb: 1,
            borderBottom: `1px solid ${tokens.ink}`,
          }}
        >
          <Box component="strong" sx={{ fontSize: 13 }}>
            Your score
          </Box>
          <Box component="span" sx={{ fontSize: 26, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {avg.toFixed(1)}
            <Box component="small" sx={{ fontSize: 12, fontWeight: 600, color: tokens.inkMuted }}>
              /5
            </Box>
          </Box>
        </Box>

        {RUBRIC.map(([label, base], i) => {
          const v = values[i];
          return (
            <Box key={label} sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, fontSize: 12, fontWeight: 600 }}>
                <Box component="span" sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {label}
                </Box>
                <span>{v > 4.5 ? '5' : base}</span>
              </Box>
              <Box component="span" sx={{ display: 'block', height: 6, borderRadius: '3px', bgcolor: tokens.line, overflow: 'hidden' }}>
                <Box
                  component="span"
                  style={{ width: `${(v / 5) * 100}%`, backgroundColor: v >= 4.99 ? tokens.gold500 : tokens.inkMuted }}
                  sx={{ display: 'block', height: 6 }}
                />
              </Box>
            </Box>
          );
        })}

        <Box
          style={appear(4.4)}
          sx={{
            mt: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            bgcolor: tokens.navy900,
            color: tokens.paper,
            p: '8px 10px',
            borderRadius: '6px',
          }}
        >
          <MilitaryTechOutlined sx={{ fontSize: 18, color: tokens.gold500, flex: 'none' }} />
          <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <Box component="strong" sx={{ fontSize: 12 }}>
              Full marks
            </Box>
            <Box component="span" sx={{ fontSize: 11, color: tokens.paperMuted }}>
              Fixed in one revision
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
