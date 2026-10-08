'use client';

import { Box } from '@neram/ui';
import { NX, img, mono, serif } from '../palette';
import { marquee, rise } from '../keyframes';

const LIBRARY = [
  { src: 'lib-1', title: 'Two-point perspective: cubes and square planes', duration: '1:12:40' },
  { src: 'lib-2', title: 'Perspective cube composition', duration: '58:12' },
  { src: 'lib-3', title: 'One-point perspective: subtractive forms', duration: '1:04:55' },
  { src: 'lib-4', title: 'Islamic architecture in India', duration: '46:30' },
  { src: 'lib-5', title: 'Logical spatial reasoning · Day 10', duration: '1:07:57' },
  { src: 'lib-6', title: 'Units and estimation in 5 minutes', duration: '5:38' },
  { src: 'lib-7', title: 'Visual perception · Day 9', duration: '50:40' },
];

/** Two copies of each row, so the marquee loops without a seam. */
const ROW_A = [...LIBRARY, ...LIBRARY];
const ROTATED = [...LIBRARY.slice(3), ...LIBRARY.slice(0, 3)];
const ROW_B = [...ROTATED, ...ROTATED];

function Row({ items, seconds, reverse }: { items: typeof LIBRARY; seconds: number; reverse?: boolean }) {
  return (
    <Box sx={{ overflow: 'hidden' }}>
      <Box
        sx={{
          display: 'flex',
          gap: 1.25,
          width: 'max-content',
          animation: `${marquee} ${seconds}s linear infinite${reverse ? ' reverse' : ''}`,
        }}
      >
        {items.map((v, i) => (
          <Box key={`${v.src}-${i}`} sx={{ width: 168, flex: 'none', display: 'flex', flexDirection: 'column', gap: 0.625 }}>
            <Box sx={{ position: 'relative', height: 94, overflow: 'hidden', bgcolor: '#000' }}>
              <Box
                component="img"
                src={img(v.src)}
                alt=""
                loading="lazy"
                decoding="async"
                sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
              <Box
                component="span"
                sx={{ position: 'absolute', right: 4, bottom: 4, px: 0.5, py: '1px', bgcolor: '#000', color: NX.white, fontFamily: mono, fontSize: 9, fontWeight: 600 }}
              >
                {v.duration}
              </Box>
            </Box>
            <Box component="span" sx={{ fontSize: 10.5, lineHeight: 1.3, color: NX.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {v.title}
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

/** Scene 5: rows of class recordings drift past under the 3,000+ count. */
export default function LibraryScene() {
  return (
    <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap: 1.25, py: 1.75 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 1.5,
          px: 1.75,
          flexWrap: 'wrap',
          animation: `${rise} .4s ease both`,
        }}
      >
        <Box>
          <Box sx={{ fontFamily: serif, fontWeight: 700, fontSize: 36, lineHeight: 1, color: NX.gold }}>3,000+</Box>
          <Box sx={{ fontSize: 12, color: NX.muted, mt: 0.5 }}>class recordings · Drawing · Aptitude · Maths</Box>
        </Box>
        <Box component="span" sx={{ fontSize: 11, fontWeight: 700, px: 1.125, py: 0.625, border: `2px solid ${NX.rule}` }}>
          NATA / JEE
        </Box>
      </Box>
      <Row items={ROW_A} seconds={22} />
      <Row items={ROW_B} seconds={26} reverse />
    </Box>
  );
}
