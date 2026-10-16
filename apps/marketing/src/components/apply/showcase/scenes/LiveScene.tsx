'use client';

import { Box } from '@neram/ui';
import CheckOutlined from '@mui/icons-material/CheckOutlined';
import GroupOutlined from '@mui/icons-material/GroupOutlined';
import { tokens } from '@/design-system';
import { NARROW, motion, type SceneProps } from '../motion';
import { CoverImage } from './shared';

const OPTIONS = ['A', 'B', 'C', 'D'];

const pillSx = {
  position: 'absolute',
  top: 10,
  display: 'flex',
  alignItems: 'center',
  gap: 0.75,
  bgcolor: tokens.navy900,
  color: tokens.paper,
  fontSize: 11,
  fontWeight: 700,
  lineHeight: 1.2,
  p: '5px 9px',
  borderRadius: `${tokens.radiusPill}px`,
  whiteSpace: 'nowrap',
} as const;

/** 07 Live: a live class in Teams where students answer on the answer pad. */
export default function LiveScene(props: SceneProps) {
  const { s, k, appear } = motion(props);
  const selected = s >= 2.0;
  const status = s >= 3.0 ? 'Submitted' : selected ? 'Selected' : 'Choose one';
  const res = k(4.0, 0.8);
  const students = Math.round(96 + 32 * k(0.2, 1.6));

  return (
    <Box sx={{ position: 'absolute', inset: 0, overflow: 'hidden', bgcolor: tokens.navy800 }}>
      <CoverImage name="live-1360" small="live-680" sizes="(min-width: 900px) min(44vw, 680px), 100vw" />

      <Box component="span" sx={{ ...pillSx, left: 10 }}>
        <Box
          component="span"
          // Opacity pulse only, no scale. Frozen while paused, still under reduced motion.
          style={{ opacity: 0.55 + 0.45 * Math.abs(Math.sin(props.t * 3)) }}
          sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: tokens.statusDone, flex: 'none' }}
        />
        <Box component="span" sx={{ [NARROW]: { display: 'none' } }}>
          LIVE · NATA drawing class
        </Box>
        <Box component="span" sx={{ display: 'none', [NARROW]: { display: 'inline' } }}>
          LIVE
        </Box>
      </Box>

      <Box component="span" sx={{ ...pillSx, right: 10, fontVariantNumeric: 'tabular-nums' }}>
        <GroupOutlined sx={{ fontSize: 14 }} />
        {`${students} students`}
      </Box>

      <Box
        style={appear(0.8, 0.5, 12)}
        sx={{
          position: 'absolute',
          right: 10,
          bottom: 10,
          width: '46%',
          minWidth: 180,
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          p: 1.25,
          bgcolor: tokens.surface,
          color: tokens.ink,
          borderRadius: `${tokens.radius}px`,
          boxShadow: '0 12px 24px rgba(0,0,0,0.3)',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, fontSize: 11 }}>
          <Box component="strong" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
            Answer pad · Q4
          </Box>
          <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.25, color: tokens.inkMuted, whiteSpace: 'nowrap' }}>
            {status}
            {s >= 3.0 && <CheckOutlined sx={{ fontSize: 13 }} />}
          </Box>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 0.5 }}>
          {OPTIONS.map((o) => {
            const on = o === 'C' && selected;
            return (
              <Box
                key={o}
                component="span"
                sx={{
                  height: 26,
                  display: 'grid',
                  placeItems: 'center',
                  borderRadius: '6px',
                  fontSize: 12,
                  fontWeight: 700,
                  border: `2px solid ${on ? tokens.navy900 : tokens.line}`,
                  bgcolor: on ? tokens.navy900 : tokens.surface,
                  color: on ? tokens.paper : tokens.ink,
                  transition: 'background-color 200ms ease, border-color 200ms ease',
                }}
              >
                {o}
              </Box>
            );
          })}
        </Box>

        <Box style={appear(4.0)} sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span>Class chose C</span>
            <Box component="strong" sx={{ fontVariantNumeric: 'tabular-nums' }}>{`${Math.round(72 * res)}%`}</Box>
          </Box>
          <Box component="span" sx={{ display: 'block', height: 5, borderRadius: '3px', bgcolor: tokens.line, overflow: 'hidden' }}>
            <Box component="span" style={{ width: `${72 * res}%` }} sx={{ display: 'block', height: 5, bgcolor: tokens.gold500 }} />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
