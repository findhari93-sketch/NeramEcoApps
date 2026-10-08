'use client';

import { Box } from '@neram/ui';
import BackHand from '@mui/icons-material/BackHand';
import { NX, img, mono, serif } from '../palette';
import { blink, fadeIn, pop, rise, slideIn, toGold } from '../keyframes';

const OPTIONS = ['A', 'B', 'C', 'D'];

/** Scene 7: a live class in Teams with the answer pad scoring the session. */
export default function LiveScene() {
  return (
    <Box sx={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1.7fr) minmax(0, 1fr)' }}>
      <Box sx={{ position: 'relative', overflow: 'hidden', animation: `${fadeIn} .4s ease both` }}>
        <Box
          component="img"
          src={img('live-1360')}
          srcSet={`${img('live-680')} 680w, ${img('live-1360')} 1360w`}
          sizes="(min-width: 900px) min(28vw, 430px), 64vw"
          alt=""
          loading="lazy"
          decoding="async"
          sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'left top', display: 'block' }}
        />
        <Box
          component="span"
          sx={{
            position: 'absolute',
            left: 10,
            top: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            px: 1,
            py: 0.5,
            bgcolor: NX.live,
            color: NX.white,
            fontFamily: mono,
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '.08em',
          }}
        >
          <Box component="span" sx={{ width: 6, height: 6, bgcolor: NX.white, animation: `${blink} 1s infinite` }} />
          LIVE · 01:24:27
        </Box>
        <Box
          component="span"
          sx={{
            position: 'absolute',
            left: 10,
            bottom: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            px: 1.125,
            py: 0.625,
            bgcolor: NX.navy,
            color: NX.gold,
            fontSize: 11,
            fontWeight: 700,
            animation: `${rise} .3s ease 1.2s both`,
          }}
        >
          <BackHand sx={{ fontSize: 14 }} />3 hands raised
        </Box>
      </Box>

      <Box sx={{ bgcolor: NX.white, color: NX.ink, p: 1.5, display: 'flex', flexDirection: 'column', gap: 1, animation: `${slideIn} .45s ease .5s both` }}>
        <Box component="b" sx={{ fontSize: 13 }}>
          Answer Pad
        </Box>
        <Box component="span" sx={{ fontSize: 11, color: NX.inkMuted }}>
          JEE B.Arch · Session 1 · Q6
        </Box>
        <Box component="span" sx={{ fontSize: 11.5, lineHeight: 1.35, fontWeight: 600 }}>
          Which view shows the object from the top?
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5 }}>
          {OPTIONS.map((o) => (
            <Box
              key={o}
              component="span"
              sx={{
                p: 0.75,
                border: `2px solid ${o === 'C' ? NX.ink : NX.border}`,
                fontSize: 11,
                fontWeight: 700,
                animation: o === 'C' ? `${toGold} .3s ease 1.8s forwards` : undefined,
              }}
            >
              {o}
            </Box>
          ))}
        </Box>
        <Box sx={{ mt: 'auto', px: 1.25, py: 1, bgcolor: NX.navy, color: NX.white, animation: `${pop} .45s ease 2.8s both` }}>
          <Box component="span" sx={{ fontFamily: mono, fontSize: 10, fontWeight: 700, color: NX.gold, letterSpacing: '.08em' }}>
            CLASS ENDED
          </Box>
          <Box sx={{ fontFamily: serif, fontWeight: 700, fontSize: 20, lineHeight: 1.1 }}>5 of 6</Box>
          <Box sx={{ fontSize: 10, color: NX.muted }}>graded questions correct</Box>
        </Box>
      </Box>
    </Box>
  );
}
