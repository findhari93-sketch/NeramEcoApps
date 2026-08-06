'use client';

/**
 * The three faces of a paper, at a glance.
 *
 * Read, practise, sit. One pip each, in that order, because that is the order a
 * student meets them. Drawn identically on the student's own card and in the
 * teacher's class matrix, so a teacher pointing at a cell and a student looking
 * at their card are looking at the same picture.
 *
 * ACCESSIBILITY
 *
 * Colour is never the only signal. Each pip carries an icon, a fill state and a
 * tooltip/aria-label naming both the face and its state, so the grid reads the
 * same to a colour-blind student and to a screen reader. Done is filled, in
 * progress is half-filled by a ring, available is outlined, unavailable is not
 * rendered at all.
 */

import { Box, Tooltip, Typography, alpha, useTheme } from '@neram/ui';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import EditNoteOutlinedIcon from '@mui/icons-material/EditNoteOutlined';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import type { QBPaperFace, QBPaperFaceState, QBPaperFaceStates } from '@neram/database';

/**
 * Only the three swatches this map reads.
 *
 * Structural rather than MUI's own Theme, because MUI reaches this app through
 * @neram/ui and its re-exported useTheme is generic, so ReturnType lands on
 * unknown. Naming what is actually used also means a caller can hand this a
 * plain object in a test without constructing a theme.
 */
type FaceTheme = {
  palette: {
    info: { main: string };
    primary: { main: string };
    success: { main: string };
  };
};

/**
 * One hue per face, held here so the card, the detail screen and the matrix
 * cannot drift. Read is indigo (the app's reading accent), practise purple (the
 * Question Bank's own), sit green (the colour of a finished test everywhere
 * else in Nexus).
 */
export const FACE_COLOR: Record<QBPaperFace, (t: FaceTheme) => string> = {
  read: (t) => t.palette.info.main,
  practice: (t) => t.palette.primary.main,
  test: (t) => t.palette.success.main,
};

export const FACE_LABEL: Record<QBPaperFace, string> = {
  read: 'Read',
  practice: 'Practice',
  test: 'Test',
};

const FACE_ICON: Record<QBPaperFace, typeof MenuBookOutlinedIcon> = {
  read: MenuBookOutlinedIcon,
  practice: EditNoteOutlinedIcon,
  test: TimerOutlinedIcon,
};

const STATE_WORD: Record<QBPaperFaceState, string> = {
  unavailable: 'not available',
  available: 'not started',
  in_progress: 'in progress',
  done: 'done',
};

const FACES: QBPaperFace[] = ['read', 'practice', 'test'];

export interface PaperFacePipsProps {
  faces: QBPaperFaceStates;
  /**
   * 'chip' shows the icon and the word, for a card with room. 'dot' shows the
   * icon alone at 24px, for a matrix cell where three of these sit in a column
   * 44px wide.
   */
  variant?: 'chip' | 'dot';
  /** Prefixes every tooltip, so a matrix cell can say which paper it belongs to. */
  context?: string;
}

export default function PaperFacePips({ faces, variant = 'chip', context }: PaperFacePipsProps) {
  const theme = useTheme();
  const dot = variant === 'dot';

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: dot ? 0.5 : 1, flexWrap: 'wrap' }}>
      {FACES.map((face) => {
        const state = faces[face];
        // Hidden rather than greyed. A Read pip on a paper with no PDF invites a
        // tap that cannot do anything, and a disabled control is a promise the
        // interface cannot keep.
        if (state === 'unavailable') return null;

        const Icon = FACE_ICON[face];
        const color = FACE_COLOR[face](theme);
        const done = state === 'done';
        const started = state === 'in_progress';
        const label = `${context ? `${context}: ` : ''}${FACE_LABEL[face]}, ${STATE_WORD[state]}`;

        return (
          <Tooltip key={face} title={label} enterTouchDelay={0}>
            <Box
              aria-label={label}
              role="img"
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.5,
                px: dot ? 0 : 0.75,
                height: dot ? 24 : 24,
                width: dot ? 24 : 'auto',
                justifyContent: 'center',
                borderRadius: dot ? '50%' : 1,
                border: '1px solid',
                borderColor: done || started ? color : alpha(theme.palette.text.primary, 0.18),
                bgcolor: done ? alpha(color, 0.14) : 'transparent',
                color: done || started ? color : 'text.disabled',
                // A ring rather than a fill, so in-progress is distinguishable
                // from done without relying on the hue difference alone.
                boxShadow: started ? `inset 0 0 0 1px ${color}` : 'none',
              }}
            >
              <Icon sx={{ fontSize: dot ? 14 : 15 }} />
              {!dot && (
                <Typography
                  variant="caption"
                  sx={{ fontWeight: done ? 700 : 500, fontSize: '0.68rem', lineHeight: 1 }}
                >
                  {FACE_LABEL[face]}
                </Typography>
              )}
            </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
}
