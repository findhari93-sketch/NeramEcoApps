'use client';

import { Box } from '@neram/ui';
import CheckRounded from '@mui/icons-material/CheckRounded';
import FavoriteRounded from '@mui/icons-material/FavoriteRounded';
import { NX, img } from '../palette';
import { drift, pop, rise } from '../keyframes';

const COLUMNS = [
  { delay: 0, items: [{ src: 'insp-1', tag: 'Featured', delay: 0.2 }, { src: 'insp-4', tag: 'Reference', delay: 1.0 }] },
  { delay: 0.2, items: [{ src: 'insp-3', tag: "Teacher's pick", delay: 0.4, liked: true }, { src: 'insp-5', tag: '2D composition', delay: 1.2 }] },
  { delay: 0.4, items: [{ src: 'insp-2', tag: 'Featured', delay: 0.6 }, { src: 'insp-6', tag: '3D composition', delay: 1.4 }] },
];

/** Scene 6: the sketchbook grid of drawings and references, one of them saved. */
export default function SketchbookScene() {
  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        p: 1.5,
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 1,
        alignItems: 'start',
        overflow: 'hidden',
      }}
    >
      {COLUMNS.map((col, ci) => (
        <Box
          key={ci}
          sx={{ display: 'flex', flexDirection: 'column', gap: 1, animation: `${drift} 6s ease-out both`, animationDelay: `${col.delay}s` }}
        >
          {col.items.map((it) => (
            <Box key={it.src} sx={{ position: 'relative', bgcolor: NX.white, animation: `${pop} .45s ease ${it.delay}s both` }}>
              <Box component="img" src={img(it.src)} alt="" loading="lazy" decoding="async" sx={{ display: 'block', width: '100%', height: 'auto' }} />
              <Box
                component="span"
                sx={{ position: 'absolute', left: 6, top: 6, px: 0.75, py: 0.25, bgcolor: NX.navy, color: NX.white, fontSize: 9, fontWeight: 700 }}
              >
                {it.tag}
              </Box>
              <Box
                component="span"
                sx={{
                  position: 'absolute',
                  right: 6,
                  top: 6,
                  width: 20,
                  height: 20,
                  display: 'grid',
                  placeItems: 'center',
                  bgcolor: it.liked ? NX.live : NX.white,
                  color: it.liked ? NX.white : NX.ink,
                }}
              >
                <FavoriteRounded sx={{ fontSize: 12 }} />
              </Box>
            </Box>
          ))}
        </Box>
      ))}
      <Box
        sx={{
          position: 'absolute',
          left: 12,
          bottom: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          px: 1.5,
          py: 1,
          bgcolor: NX.gold,
          color: NX.navy,
          fontSize: 12,
          fontWeight: 800,
          animation: `${rise} .4s ease 3s both`,
        }}
      >
        <CheckRounded sx={{ fontSize: 16 }} />
        Saved to your sketchbook
      </Box>
    </Box>
  );
}
