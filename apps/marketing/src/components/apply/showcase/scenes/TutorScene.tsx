'use client';

import { Box } from '@neram/ui';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import { NX, img, mono } from '../palette';
import { fadeIn, rise, toGold } from '../keyframes';

const CHAT = [
  { from: 'student', text: 'Why is it 12 × (n − 2)?', delay: 0.6 },
  {
    from: 'tutor',
    text: 'A cube has 12 edges. On each edge, the cubes between the two corners have exactly two painted faces. That is n − 2 per edge.',
    delay: 1.6,
  },
  { from: 'student', text: 'So for 4×4×4 it is 24?', delay: 3.0 },
  { from: 'tutor', text: 'Exactly. Want a harder one on hidden faces next?', delay: 3.9 },
];

/** Scene 4: a solved question with video, image and an AI tutor you can ask anything. */
export default function TutorScene() {
  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
        gap: 1.5,
        p: 1.5,
        animation: `${fadeIn} .4s ease both`,
      }}
    >
      <Box sx={{ bgcolor: NX.white, color: NX.ink, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Box sx={{ px: 1.5, py: 1.25, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          <Box component="span" sx={{ fontFamily: mono, fontSize: 10, fontWeight: 700, letterSpacing: '.06em', color: NX.goldDark }}>
            JEE 2024 · APTITUDE
          </Box>
          <Box component="span" sx={{ fontSize: 12, lineHeight: 1.4, fontWeight: 600 }}>
            A 4×4×4 painted cube is cut into unit cubes. How many have exactly two faces painted?
          </Box>
        </Box>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            borderTop: `2px solid ${NX.ink}`,
            borderBottom: `2px solid ${NX.ink}`,
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          <Box component="span" sx={{ px: 1, py: 0.75, bgcolor: NX.ink, color: NX.white }}>
            Video
          </Box>
          <Box component="span" sx={{ px: 1, py: 0.75, borderLeft: `2px solid ${NX.ink}` }}>
            Image
          </Box>
          <Box component="span" sx={{ px: 1, py: 0.75, borderLeft: `2px solid ${NX.ink}`, animation: `${toGold} .3s ease 1s forwards` }}>
            AI tutor
          </Box>
        </Box>
        <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>
          <Box
            component="img"
            src={img('lib-6')}
            alt=""
            loading="lazy"
            decoding="async"
            sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
          <Box
            component="span"
            sx={{ position: 'absolute', left: 10, bottom: 10, width: 34, height: 34, display: 'grid', placeItems: 'center', bgcolor: NX.gold, color: NX.navy }}
          >
            <PlayArrowRounded sx={{ fontSize: 22 }} />
          </Box>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
        <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 12, fontWeight: 700 }}>
          <Box
            component="span"
            sx={{ width: 22, height: 22, display: 'grid', placeItems: 'center', bgcolor: NX.gold, color: NX.navy, fontSize: 10, fontWeight: 800 }}
          >
            AI
          </Box>
          Your personal tutor
        </Box>
        {CHAT.map((m) => (
          <Box
            key={m.text}
            sx={{
              alignSelf: m.from === 'student' ? 'flex-end' : 'flex-start',
              maxWidth: '88%',
              px: 1.25,
              py: 1,
              bgcolor: m.from === 'student' ? NX.gold : NX.white,
              color: m.from === 'student' ? NX.navy : NX.ink,
              fontSize: 11.5,
              lineHeight: 1.4,
              animation: `${rise} .35s ease ${m.delay}s both`,
            }}
          >
            {m.text}
          </Box>
        ))}
        <Box
          sx={{
            mt: 'auto',
            display: 'flex',
            alignItems: 'center',
            height: 32,
            px: 1.25,
            border: `2px solid ${NX.rule}`,
            fontSize: 11,
            color: NX.muted,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          Ask anything. No question is too small.
        </Box>
      </Box>
    </Box>
  );
}
