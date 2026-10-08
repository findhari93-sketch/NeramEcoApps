'use client';

import { Box } from '@neram/ui';
import { NX, mono } from '../palette';
import { fadeIn, pop, slideIn } from '../keyframes';

const CHAPTERS = [
  { n: 1, title: '3D Geometry', note: 'Asked in 16 of 17 years · 1.6 a paper', tag: 'HIGH', hot: true, delay: 0.4 },
  { n: 2, title: 'Sequences & Series', note: 'Asked in 15 of 17 years · 1.4 a paper', tag: 'HIGH', hot: true, delay: 0.7 },
  { n: 3, title: 'Applications of Derivatives', note: '16 of 17 years · less common lately', tag: 'MED', hot: false, delay: 1.0 },
  { n: 4, title: 'Definite Integrals', note: 'Asked in 16 of 17 years · 1.1 a paper', tag: 'MED', hot: false, delay: 1.3 },
];

const SLATE = NX.dim;
const BUBBLES: Array<[number, number, number, string]> = [
  [86, 38, 26, NX.gold],
  [80, 44, 22, NX.orange],
  [90, 47, 24, NX.text],
  [84, 56, 20, NX.gold],
  [92, 62, 18, SLATE],
  [78, 64, 16, NX.orange],
  [88, 74, 20, NX.text],
  [70, 52, 12, SLATE],
  [62, 71, 12, NX.gold],
  [60, 78, 10, NX.orange],
  [28, 22, 10, NX.gold],
  [34, 34, 9, SLATE],
  [44, 30, 10, NX.orange],
  [40, 52, 9, NX.text],
  [20, 72, 7, SLATE],
  [14, 86, 6, NX.gold],
];

const LABELS = [
  { text: '3D Geometry', x: 84, y: 38, delay: 2.4 },
  { text: 'Probability', x: 82, y: 56, delay: 2.6 },
  { text: 'Vectors', x: 86, y: 74, delay: 2.8 },
];

/** Scene 3: the question predictor ranks chapters from 17 years of weightage. */
export default function PredictScene() {
  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.15fr)',
        gap: 1.5,
        p: 1.5,
        animation: `${fadeIn} .4s ease both`,
      }}
    >
      <Box sx={{ bgcolor: NX.white, color: NX.ink, p: 1.5, display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
        <Box
          component="span"
          sx={{ alignSelf: 'flex-start', px: 0.875, py: 0.375, bgcolor: NX.navy, color: NX.gold, fontFamily: mono, fontSize: 10, fontWeight: 700, letterSpacing: '.06em' }}
        >
          AI · 2027 PREDICTOR
        </Box>
        <Box component="b" sx={{ fontSize: 14 }}>
          Start with these 10
        </Box>
        <Box component="span" sx={{ fontFamily: mono, fontSize: 10, fontWeight: 600, letterSpacing: '.1em', color: NX.inkMuted }}>
          MUST DO
        </Box>
        {CHAPTERS.map((c) => (
          <Box
            key={c.n}
            sx={{
              display: 'grid',
              gridTemplateColumns: '16px minmax(0, 1fr) auto',
              gap: 1,
              alignItems: 'center',
              py: 0.75,
              borderBottom: `1px solid ${NX.line}`,
              animation: `${slideIn} .35s ease ${c.delay}s both`,
            }}
          >
            <Box component="span" sx={{ fontFamily: mono, fontSize: 11, fontWeight: 700 }}>
              {c.n}
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Box sx={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.title}</Box>
              <Box sx={{ fontSize: 10, color: NX.inkMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.note}</Box>
            </Box>
            <Box
              component="span"
              sx={{ fontSize: 10, fontWeight: 800, px: 0.75, py: 0.25, bgcolor: c.hot ? NX.gold : NX.line, color: c.hot ? NX.navy : NX.ink }}
            >
              {c.tag}
            </Box>
          </Box>
        ))}
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, minWidth: 0 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, fontSize: 11 }}>
          <Box component="b" sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Chapter weightage · 17 years
          </Box>
          <Box component="span" sx={{ color: NX.muted, whiteSpace: 'nowrap' }}>
            JEE Paper 2A
          </Box>
        </Box>
        <Box
          sx={{
            flex: 1,
            position: 'relative',
            border: `2px solid ${NX.rule}`,
            backgroundImage: `linear-gradient(90deg, transparent calc(50% - 1px), ${NX.rule} calc(50% - 1px), ${NX.rule} calc(50% + 1px), transparent calc(50% + 1px)), linear-gradient(transparent calc(50% - 1px), ${NX.rule} calc(50% - 1px), ${NX.rule} calc(50% + 1px), transparent calc(50% + 1px))`,
          }}
        >
          <Box component="span" sx={{ position: 'absolute', left: 6, top: 5, fontSize: 9, fontWeight: 700, color: NX.muted }}>
            Rare but rising
          </Box>
          <Box component="span" sx={{ position: 'absolute', right: 6, top: 5, fontSize: 9, fontWeight: 700, color: NX.gold }}>
            Regular and rising
          </Box>
          {BUBBLES.map(([x, y, size, colour], i) => (
            <Box
              key={i}
              component="span"
              sx={{
                position: 'absolute',
                left: `${x}%`,
                top: `${y}%`,
                width: size,
                height: size,
                m: `-${size / 2}px 0 0 -${size / 2}px`,
                borderRadius: '50%',
                bgcolor: colour,
                animation: `${pop} .45s ease ${0.3 + i * 0.12}s both`,
              }}
            />
          ))}
          {LABELS.map((l) => (
            <Box
              key={l.text}
              component="span"
              sx={{
                position: 'absolute',
                left: `${l.x}%`,
                top: `${l.y}%`,
                transform: 'translate(-100%, -50%)',
                pr: 1.5,
                fontSize: 10,
                fontWeight: 700,
                whiteSpace: 'nowrap',
                animation: `${fadeIn} .3s ease ${l.delay}s both`,
              }}
            >
              {l.text}
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
