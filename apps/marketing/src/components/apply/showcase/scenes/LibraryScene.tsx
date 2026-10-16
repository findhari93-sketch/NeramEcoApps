'use client';

import { Box } from '@neram/ui';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import { tokens } from '@/design-system';
import { NARROW, motion, type SceneProps } from '../motion';
import { img } from '../palette';

const QUERY = '3D geometry';

const CLASSES = [
  { src: 'lib-1', title: '3D geometry · Solids', duration: '42 min', match: true },
  { src: 'lib-2', title: 'Perspective drawing', duration: '38 min', match: false },
  { src: 'lib-3', title: '3D geometry · Sections', duration: '51 min', match: true },
  { src: 'lib-4', title: '3D geometry · Practice', duration: '35 min', match: true },
  { src: 'lib-5', title: 'Colour theory', duration: '40 min', match: false },
  { src: 'lib-6', title: 'Mental ability', duration: '29 min', match: false },
];

/** 05 Library: a typed search narrows 3,000+ recorded classes to the matches. */
export default function LibraryScene(props: SceneProps) {
  const { k, appear } = motion(props);
  const typed = Math.round(QUERY.length * k(0.6, 1.2));
  const filt = k(2.1, 0.5);

  return (
    <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap: 1.25, p: '12px 14px', [NARROW]: { p: '10px', gap: 1 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            px: 1.25,
            border: `1px solid ${tokens.lineStrong}`,
            borderRadius: '6px',
          }}
        >
          <SearchOutlined sx={{ fontSize: 18, color: tokens.inkMuted, flex: 'none' }} />
          <Box
            component="span"
            sx={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', color: typed ? tokens.ink : tokens.inkMuted }}
          >
            {QUERY.slice(0, typed) || 'Search classes'}
          </Box>
          {typed > 0 && typed < QUERY.length && (
            <Box component="span" sx={{ width: 2, height: 16, flex: 'none', bgcolor: tokens.navy900, ml: '-4px' }} />
          )}
        </Box>
        <Box component="strong" sx={{ fontSize: 12, whiteSpace: 'nowrap', minWidth: 120, textAlign: 'right', [NARROW]: { minWidth: 0 } }}>
          {filt > 0 ? '48 classes found' : '3,000+ classes'}
        </Box>
      </Box>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gridTemplateRows: 'repeat(2, minmax(0, 1fr))',
          gap: 1,
        }}
      >
        {CLASSES.map((c, i) => {
          const shown = appear(0.1 + i * 0.12, 0.4, 6);
          const opacity = Math.min(Number(shown.opacity), c.match ? 1 : 1 - 0.75 * filt);
          return (
            <Box
              key={c.src}
              style={{ ...shown, opacity, outline: c.match && filt > 0.5 ? `2px solid ${tokens.gold500}` : 'none' }}
              sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minHeight: 0, borderRadius: '8px', outlineOffset: '2px' }}
            >
              <Box sx={{ position: 'relative', flex: 1, minHeight: 0, borderRadius: '6px', overflow: 'hidden', bgcolor: tokens.navy800 }}>
                <Box
                  component="img"
                  src={img(c.src)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
                <Box
                  component="span"
                  sx={{
                    position: 'absolute',
                    right: 4,
                    bottom: 4,
                    p: '2px 5px',
                    borderRadius: '3px',
                    bgcolor: tokens.navy900,
                    color: tokens.paper,
                    fontSize: 11,
                    fontWeight: 700,
                    lineHeight: 1.2,
                  }}
                >
                  {c.duration}
                </Box>
              </Box>
              <Box component="span" sx={{ fontSize: 11, fontWeight: 600, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {c.title}
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
