'use client';

import { Box } from '@neram/ui';
import CheckRounded from '@mui/icons-material/CheckRounded';
import { NX, img, mono, serif } from '../palette';
import { gone, pop, press, rise } from '../keyframes';

const RUBRIC = [
  { label: 'Composition', before: '5', delay: 1.0 },
  { label: 'Proportion & scale', before: '4', delay: 1.5 },
  { label: 'Tonal quality', before: '4', delay: 2.0 },
  { label: 'Line quality', before: '4', delay: 2.5 },
];

/** Scene 2: the student resubmits and every rubric score flips to 5. */
export default function ReviseScene() {
  return (
    <Box sx={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)' }}>
      <Box sx={{ position: 'relative', overflow: 'hidden' }}>
        <Box
          component="img"
          src={img('drawing-1215')}
          srcSet={`${img('drawing-680')} 680w, ${img('drawing-1215')} 1215w`}
          sizes="(min-width: 900px) min(26vw, 400px), 60vw"
          alt=""
          loading="lazy"
          decoding="async"
          sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
        <Box
          component="svg"
          viewBox="0 0 1215 680"
          preserveAspectRatio="xMidYMid slice"
          sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.55 }}
        >
          <Box component="path" d="M802 330 L1102 244 M350 340 L95 244" sx={{ fill: 'none', stroke: NX.orange, strokeWidth: 3 }} />
          <Box
            component="path"
            d="M741 317 L802 385 M741 365 L693 413 M433 397 L504 442"
            sx={{ fill: 'none', stroke: NX.red, strokeWidth: 6, strokeLinecap: 'round' }}
          />
          <Box component="ellipse" cx={748} cy={372} rx={110} ry={96} sx={{ fill: 'none', stroke: NX.orange, strokeWidth: 4 }} />
        </Box>
        <Box
          component="span"
          sx={{
            position: 'absolute',
            left: 10,
            top: 10,
            px: 1,
            py: 0.5,
            bgcolor: NX.navy,
            color: NX.white,
            fontFamily: mono,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '.08em',
          }}
        >
          REVISION 2
        </Box>
        <Box
          component="span"
          sx={{
            position: 'absolute',
            left: 10,
            bottom: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            height: 34,
            px: 1.5,
            bgcolor: NX.gold,
            color: NX.navy,
            fontWeight: 800,
            fontSize: 12,
            animation: `${press} .45s ease .5s both`,
          }}
        >
          Resubmitted
          <CheckRounded sx={{ fontSize: 16 }} />
        </Box>
      </Box>

      <Box sx={{ bgcolor: NX.white, color: NX.ink, p: 1.5, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', pb: 1, borderBottom: `2px solid ${NX.ink}` }}>
          <Box component="b" sx={{ fontSize: 13 }}>
            Scores
          </Box>
          <Box component="span" sx={{ display: 'grid', fontFamily: serif, fontWeight: 700, fontSize: 22, lineHeight: 1 }}>
            <Box component="span" sx={{ gridArea: '1 / 1', animation: `${gone} .3s ease 3s forwards` }}>
              4.3
              <Box component="small" sx={{ fontSize: 12 }}>
                /5
              </Box>
            </Box>
            <Box component="span" sx={{ gridArea: '1 / 1', color: NX.goldDark, animation: `${pop} .4s ease 3.1s both` }}>
              5.0
              <Box component="small" sx={{ fontSize: 12 }}>
                /5
              </Box>
            </Box>
          </Box>
        </Box>
        {RUBRIC.map((row) => (
          <Box
            key={row.label}
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 1,
              py: 1,
              borderBottom: `1px solid ${NX.line}`,
            }}
          >
            <Box component="span" sx={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {row.label}
            </Box>
            <Box component="span" sx={{ display: 'grid', width: 26, height: 26, flex: 'none' }}>
              <Box
                component="span"
                sx={{
                  gridArea: '1 / 1',
                  display: 'grid',
                  placeItems: 'center',
                  border: `2px solid ${NX.ink}`,
                  fontWeight: 800,
                  fontSize: 12,
                  animation: `${gone} .2s ease ${row.delay}s forwards`,
                }}
              >
                {row.before}
              </Box>
              <Box
                component="span"
                sx={{
                  gridArea: '1 / 1',
                  display: 'grid',
                  placeItems: 'center',
                  bgcolor: NX.gold,
                  border: `2px solid ${NX.ink}`,
                  fontWeight: 800,
                  fontSize: 12,
                  animation: `${pop} .35s ease ${row.delay}s both`,
                }}
              >
                5
              </Box>
            </Box>
          </Box>
        ))}
        <Box sx={{ mt: 'auto', px: 1.25, py: 1, bgcolor: NX.navy, color: NX.white, animation: `${rise} .4s ease 3.5s both` }}>
          <Box sx={{ fontWeight: 800, fontSize: 13, color: NX.gold }}>Full marks</Box>
          <Box sx={{ fontSize: 11, color: NX.muted }}>Your teacher cheered your work</Box>
        </Box>
      </Box>
    </Box>
  );
}
