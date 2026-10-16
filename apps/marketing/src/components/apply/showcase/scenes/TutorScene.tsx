'use client';

import { Box } from '@neram/ui';
import { tokens } from '@/design-system';
import { NARROW, motion, type SceneProps } from '../motion';
import { splitRule } from './shared';

interface Message {
  me: boolean;
  text: string;
  at: number;
  /** Seconds the tutor spends typing the message, character by character. */
  types?: number;
}

const MESSAGES: Message[] = [
  { me: true, text: 'Why is it 12 × (n − 2)?', at: 0.4 },
  {
    me: false,
    text: 'A cube has 12 edges. On each edge, the cubes between the two corners have two painted faces: n − 2 per edge.',
    at: 1.2,
    types: 1.6,
  },
  { me: true, text: 'So for 4×4×4 it is 24?', at: 3.3 },
  { me: false, text: 'Exactly. Want a harder one on hidden faces?', at: 4.2, types: 1.0 },
];

const TABS = ['Video', 'Image', 'AI tutor'];

/** 04 AI tutor: a solved question with a tutor that answers follow-ups as it types. */
export default function TutorScene(props: SceneProps) {
  const { s, appear, clamp01 } = motion(props);

  return (
    <Box sx={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.15fr)' }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, p: 1.75, borderRight: splitRule, minWidth: 0, [NARROW]: { p: 1.25, gap: 0.75 } }}>
        <Box component="span" sx={{ fontFamily: tokens.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: '.1em', color: tokens.gold800 }}>
          JEE 2024 · APTITUDE
        </Box>
        <Box component="p" sx={{ m: 0, fontSize: 13, lineHeight: 1.4, fontWeight: 600, [NARROW]: { fontSize: 12 } }}>
          A 4×4×4 painted cube is cut into unit cubes. How many have exactly two faces painted?
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 0.5, [NARROW]: { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' } }}>
          {TABS.map((label) => {
            const on = label === 'AI tutor';
            return (
              <Box
                key={label}
                component="span"
                sx={{
                  fontSize: 11,
                  fontWeight: 700,
                  p: '5px 6px',
                  borderRadius: '4px',
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  border: `1px solid ${on ? tokens.navy900 : tokens.line}`,
                  bgcolor: on ? tokens.navy900 : 'transparent',
                  color: on ? tokens.gold500 : tokens.ink,
                  // Narrow: Video and Image share a row, the AI tutor tab takes the next.
                  [NARROW]: on ? { gridColumn: '1 / -1' } : {},
                }}
              >
                {label}
              </Box>
            );
          })}
        </Box>
        <Box
          style={appear(3.5)}
          sx={{
            mt: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 0.5,
            p: '10px 12px',
            borderRadius: '6px',
            border: `1px solid ${tokens.line}`,
            boxShadow: `inset 3px 0 0 ${tokens.gold500}`,
          }}
        >
          <Box component="span" sx={{ fontSize: 11, color: tokens.inkMuted }}>
            Answer
          </Box>
          <Box component="strong" sx={{ fontSize: 22, lineHeight: 1 }}>
            24
          </Box>
        </Box>
      </Box>

      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          gap: 0.75,
          p: 1.5,
          bgcolor: tokens.ground,
          minWidth: 0,
          overflow: 'hidden',
          [NARROW]: { p: 1 },
        }}
      >
        {MESSAGES.filter((m) => s >= m.at).map((m) => {
          let text = m.text;
          let typing = false;
          if (m.types) {
            const q = clamp01((s - m.at) / m.types);
            text = m.text.slice(0, Math.max(1, Math.round(m.text.length * q)));
            typing = q < 1;
          }
          return (
            <Box
              key={m.at}
              style={appear(m.at, 0.3, 6)}
              sx={{
                flex: 'none',
                maxWidth: '88%',
                p: '7px 10px',
                fontSize: 12,
                lineHeight: 1.4,
                alignSelf: m.me ? 'flex-end' : 'flex-start',
                bgcolor: m.me ? tokens.navy900 : tokens.surface,
                color: m.me ? tokens.paper : tokens.ink,
                border: m.me ? 'none' : `1px solid ${tokens.line}`,
                borderRadius: m.me ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
              }}
            >
              {text}
              {typing ? '▍' : ''}
            </Box>
          );
        })}
        <Box
          sx={{
            flex: 'none',
            height: 30,
            display: 'flex',
            alignItems: 'center',
            px: 1.25,
            border: `1px solid ${tokens.lineStrong}`,
            borderRadius: '6px',
            bgcolor: tokens.surface,
            fontSize: 11,
            color: tokens.inkMuted,
          }}
        >
          <Box component="span" sx={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Ask anything. No question is too small.
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
