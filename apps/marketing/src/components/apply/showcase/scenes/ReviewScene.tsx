'use client';

import { Box } from '@neram/ui';
import PauseRounded from '@mui/icons-material/PauseRounded';
import { NX, img, mono } from '../palette';
import { chip, draw, fadeIn, fill, pop, ring, wave } from '../keyframes';

const WAVE_BARS = [8, 14, 20, 12, 24, 16, 10, 22, 18, 9, 26, 14, 20, 11, 17, 23, 13, 8];

const CAPTIONS = [
  { text: 'Extend this edge back to the vanishing point.', delay: 0.4, duration: 2 },
  { text: 'This corner of the cube is bending inward.', delay: 2.5, duration: 1.8 },
  { text: 'Same fix on the left box. Use the semi-ellipse trick.', delay: 4.4, duration: 1.6 },
];

const stroke = (colour: string, width: number, duration: number, delay: number) => ({
  fill: 'none',
  stroke: colour,
  strokeWidth: width,
  strokeLinecap: 'round',
  strokeDasharray: '1200',
  animation: `${draw} ${duration}s ease-out ${delay}s both`,
});

/** Scene 1: the teacher draws guide lines and corrections over the student's plate while a voice note plays. */
export default function ReviewScene() {
  return (
    <Box sx={{ position: 'absolute', inset: 0, animation: `${fadeIn} .4s ease both` }}>
      <Box
        component="img"
        src={img('drawing-1215')}
        srcSet={`${img('drawing-680')} 680w, ${img('drawing-1215')} 1215w`}
        sizes="(min-width: 900px) min(44vw, 680px), 100vw"
        alt=""
        loading="eager"
        decoding="async"
        sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
      <Box
        component="svg"
        viewBox="0 0 1215 680"
        preserveAspectRatio="xMidYMid slice"
        sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      >
        <Box component="path" d="M802 330 L1102 244" sx={stroke(NX.orange, 3, 1.2, 0.6)} />
        <Box component="rect" x={1094} y={236} width={16} height={16} sx={{ fill: NX.orange, animation: `${pop} .3s ease 1.3s both` }} />
        <Box component="path" d="M741 317 L802 385" sx={stroke(NX.red, 6, 1.4, 1.6)} />
        <Box component="path" d="M741 365 L693 413" sx={stroke(NX.red, 6, 1.4, 2.3)} />
        <Box component="ellipse" cx={748} cy={372} rx={110} ry={96} sx={stroke(NX.orange, 4, 1.6, 3.0)} />
        <Box component="path" d="M350 340 L95 244" sx={stroke(NX.orange, 3, 1.2, 3.8)} />
        <Box component="rect" x={87} y={236} width={16} height={16} sx={{ fill: NX.orange, animation: `${pop} .3s ease 4.4s both` }} />
        <Box component="path" d="M433 397 L504 442" sx={stroke(NX.red, 6, 1.4, 4.3)} />
      </Box>

      <Box sx={{ position: 'absolute', left: 12, top: 12, display: 'grid', maxWidth: '62%' }}>
        {CAPTIONS.map((c) => (
          <Box
            key={c.text}
            component="span"
            sx={{
              gridArea: '1 / 1',
              alignSelf: 'start',
              bgcolor: NX.navy,
              color: NX.white,
              fontSize: 12,
              lineHeight: 1.4,
              px: 1.25,
              py: 0.875,
              animation: `${chip} ${c.duration}s ease ${c.delay}s both`,
            }}
          >
            &ldquo;{c.text}&rdquo;
          </Box>
        ))}
      </Box>

      <Box
        sx={{
          position: 'absolute',
          right: 12,
          top: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          p: '5px 10px 5px 5px',
          bgcolor: NX.white,
          color: NX.ink,
        }}
      >
        <Box
          component="span"
          sx={{
            width: 26,
            height: 26,
            display: 'grid',
            placeItems: 'center',
            bgcolor: NX.navy,
            color: NX.gold,
            fontSize: 10,
            fontWeight: 800,
            animation: `${ring} 1s infinite`,
          }}
        >
          HB
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          <Box component="b" sx={{ fontSize: 11 }}>
            Ar. Hari Babu
          </Box>
          <Box component="span" sx={{ fontSize: 10, color: NX.inkMuted }}>
            sketch + voice
          </Box>
        </Box>
      </Box>

      <Box
        sx={{
          position: 'absolute',
          left: 12,
          right: 12,
          bottom: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 1.25,
          p: '8px 12px 8px 8px',
          bgcolor: NX.white,
          color: NX.ink,
        }}
      >
        <Box sx={{ width: 30, height: 30, flex: 'none', display: 'grid', placeItems: 'center', bgcolor: NX.orange, color: NX.white }}>
          <PauseRounded sx={{ fontSize: 18 }} />
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 12, fontWeight: 700 }}>
            <Box component="span" sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Voice feedback from your teacher
            </Box>
            <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: '2px', height: 14 }}>
              {WAVE_BARS.map((h, i) => (
                <Box
                  key={i}
                  component="span"
                  sx={{
                    width: 2,
                    height: h,
                    bgcolor: NX.orange,
                    transformOrigin: 'center',
                    animation: `${wave} .6s ease-in-out ${(i % 7) * 0.08}s infinite alternate`,
                  }}
                />
              ))}
            </Box>
          </Box>
          <Box component="span" sx={{ display: 'block', height: 4, bgcolor: NX.line }}>
            <Box component="span" sx={{ display: 'block', height: 4, bgcolor: NX.orange, animation: `${fill} 5.6s linear .2s both` }} />
          </Box>
        </Box>
        <Box component="span" sx={{ fontFamily: mono, fontSize: 11, fontWeight: 600, color: NX.inkMuted }}>
          0:24
        </Box>
      </Box>
    </Box>
  );
}
