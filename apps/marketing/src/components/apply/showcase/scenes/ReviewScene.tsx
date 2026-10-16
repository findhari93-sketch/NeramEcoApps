'use client';

import { Box } from '@neram/ui';
import GraphicEqOutlined from '@mui/icons-material/GraphicEqOutlined';
import { tokens } from '@/design-system';
import { NARROW, motion, type SceneProps } from '../motion';
import { CoverImage, splitRule, tagSx } from './shared';

const NOTES = [
  { at: 1.2, text: 'Extend this edge to the vanishing point.' },
  { at: 2.8, text: 'These corners bend inward. Keep them vertical.' },
  { at: 4.4, text: 'Redraw the curve with the semi-ellipse trick.' },
];

const MARKERS = [
  { x: 1102, y: 244, n: 1, at: 1.1 },
  { x: 693, y: 413, n: 2, at: 2.7 },
  { x: 866, y: 372, n: 3, at: 4.4 },
];

const strokeProps = { fill: 'none', stroke: tokens.gold500, strokeLinecap: 'round', pathLength: 1 } as const;

/** 01 Review: the teacher draws numbered corrections on the plate and explains each one. */
export default function ReviewScene(props: SceneProps) {
  const { s, k, appear, pop, draw } = motion(props);
  const active = NOTES.reduce((last, note, i) => (k(note.at, 0.45) > 0 ? i : last), -1);
  const voice = Math.min(1, s / 6.4);
  const seconds = Math.round(voice * 24);

  return (
    <Box sx={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)' }}>
      <Box sx={{ position: 'relative', overflow: 'hidden', bgcolor: tokens.navy800 }}>
        <CoverImage name="drawing-1215" small="drawing-680" sizes="(min-width: 900px) min(26vw, 420px), 62vw" eager />
        <Box
          component="svg"
          viewBox="0 0 1215 680"
          preserveAspectRatio="xMidYMid slice"
          sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        >
          <path d="M802 330 L1102 244" strokeWidth={7} {...strokeProps} style={draw(0.4, 0.9)} />
          <path d="M741 317 L802 385 M741 365 L693 413" strokeWidth={7} {...strokeProps} style={draw(2.0, 0.9)} />
          <ellipse cx={748} cy={372} rx={118} ry={102} strokeWidth={6} {...strokeProps} style={draw(3.6, 1.0)} />
          {MARKERS.map((m) => (
            <g key={m.n} style={pop(m.at)}>
              <circle cx={m.x} cy={m.y} r={30} fill={tokens.navy900} stroke={tokens.gold500} strokeWidth={4} />
              <text x={m.x} y={m.y + 12} fontSize={34} fontWeight={800} fill={tokens.paper} textAnchor="middle">
                {m.n}
              </text>
            </g>
          ))}
        </Box>
        <Box component="span" sx={tagSx}>
          Your plate · Perspective
        </Box>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, p: 1.5, borderLeft: splitRule, minWidth: 0, [NARROW]: { p: 1, gap: 0.75 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
          <Box
            component="span"
            sx={{
              width: 28,
              height: 28,
              flex: 'none',
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              bgcolor: tokens.navy900,
              color: tokens.gold500,
              fontSize: 11,
              fontWeight: 800,
            }}
          >
            HB
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <Box component="strong" sx={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Ar. Hari Babu
            </Box>
            <Box component="span" sx={{ fontSize: 11, color: tokens.inkMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Reviewing your plate
            </Box>
          </Box>
        </Box>

        {NOTES.map((note, i) => (
          <Box
            key={note.text}
            style={appear(note.at)}
            sx={{
              display: 'flex',
              gap: 1,
              p: '6px 8px',
              borderRadius: '6px',
              transition: 'background-color 200ms ease',
              bgcolor: i === active ? tokens.ground : 'transparent',
              boxShadow: i === active ? `inset 3px 0 0 ${tokens.gold500}` : 'none',
              // A narrow window has room for the newest note only.
              [NARROW]: { display: i === active || (active === -1 && i === 0) ? 'flex' : 'none' },
            }}
          >
            <Box
              component="span"
              sx={{
                width: 18,
                height: 18,
                flex: 'none',
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                bgcolor: tokens.navy900,
                color: tokens.paper,
                fontSize: 11,
                fontWeight: 800,
              }}
            >
              {i + 1}
            </Box>
            <Box component="span" sx={{ fontSize: 12, lineHeight: 1.35 }}>
              {note.text}
            </Box>
          </Box>
        ))}

        <Box sx={{ mt: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
          <GraphicEqOutlined sx={{ fontSize: 18, color: tokens.navy900, flex: 'none' }} />
          <Box component="span" sx={{ flex: 1, height: 4, borderRadius: '2px', bgcolor: tokens.line, overflow: 'hidden' }}>
            <Box component="span" style={{ width: `${voice * 100}%` }} sx={{ display: 'block', height: 4, bgcolor: tokens.navy900 }} />
          </Box>
          <Box component="span" sx={{ fontFamily: tokens.fontMono, fontSize: 11, color: tokens.inkMuted }}>
            {`0:${String(seconds).padStart(2, '0')}`}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
