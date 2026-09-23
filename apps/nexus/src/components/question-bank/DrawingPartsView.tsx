'use client';

import { Fragment, useState } from 'react';
import {
  Box,
  Stack,
  Typography,
  Button,
  Chip,
  alpha,
} from '@neram/ui';
import AltRouteIcon from '@mui/icons-material/AltRoute';
import ChecklistIcon from '@mui/icons-material/Checklist';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import type { QBDrawingPart, QBDrawingParts } from '@neram/database';
import MathText from '@/components/common/MathText';
import { drawingPartsSummary, partNumberLabel } from '@/lib/drawing-parts';
import FigureViewer from './FigureViewer';

/**
 * A drawing question split into parts, as anyone reading it sees it: the
 * student practising, the student sitting a test, and the teacher marking.
 *
 * The first thing on screen is how to answer, in words and with an icon,
 * because that is exactly what the old single text blob hid. "Attempt any one
 * of 2" with an OR between the options, or "Answer both parts" with each part's
 * marks. Stacked cards rather than tabs: tabs would hide the very choice the
 * student is meant to see.
 *
 * Solutions show only when the caller says so. A test passes false, and its
 * payload never carries them anyway (stripDrawingPartSolutions).
 */

/**
 * Screen-reader only. Sizes are string px on purpose: in sx a bare `1` means
 * 100%, which once stretched every sr-only label to full width on phones.
 */
const visuallyHidden = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  p: 0,
  m: '-1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;

interface Props {
  parts: QBDrawingParts;
  /** Shown before the label, so "81A". Omit where the position is not the paper number (a test). */
  questionNumber?: number | null;
  language?: 'en' | 'hi';
  showSolutions?: boolean;
  /**
   * How many options the paper printed, when only one of them is on screen.
   *
   * In practice an "attempt any one of two" drawing is listed and opened as
   * two separate questions, so the banner telling a student to choose would be
   * telling them to choose from a list of one. They still get told the exam
   * only asked for one of them.
   */
  soloOf?: number | null;
}

/** The OR between two options. Shared with the teacher's parts editor. */
export function PartsOrDivider() {
  return (
    <Box
      role="separator"
      aria-label="or"
      sx={{ display: 'flex', alignItems: 'center', gap: 1.5, my: 1 }}
    >
      <Box sx={{ flex: 1, height: '1px', bgcolor: 'divider' }} />
      <Typography
        aria-hidden
        variant="caption"
        sx={{ fontWeight: 700, letterSpacing: 1, color: 'text.secondary' }}
      >
        OR
      </Typography>
      <Box sx={{ flex: 1, height: '1px', bgcolor: 'divider' }} />
    </Box>
  );
}

/** "81A" in a filled square. Shared with the teacher's parts editor. */
export function PartBadge({ children }: { children: string }) {
  return (
    <Box
      component="span"
      sx={{
        minWidth: 40,
        height: 32,
        px: 0.75,
        borderRadius: 1,
        bgcolor: 'primary.main',
        color: 'primary.contrastText',
        fontWeight: 700,
        fontSize: '0.875rem',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {children}
    </Box>
  );
}

/**
 * The figure for one part.
 *
 * It used to be one image on the question, printed above both parts. On 2014
 * Q81 that meant the student who chose "draw a frame of cubes and cones" was
 * shown the graphic belonging to "rotate the graphic below", which is a
 * different question they did not pick.
 */
function PartFigure({ part }: { part: QBDrawingPart }) {
  const [viewerOpen, setViewerOpen] = useState(false);
  if (!part.image_url) return null;
  return (
    <Box sx={{ mt: 1.5 }}>
      <Box
        component="button"
        type="button"
        onClick={() => setViewerOpen(true)}
        aria-label={`Look closer at the figure for ${part.label}`}
        sx={{
          display: 'block',
          p: 0,
          border: 0,
          bgcolor: 'transparent',
          cursor: 'zoom-in',
          borderRadius: 1,
          '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 2 },
        }}
      >
        <Box
          component="img"
          src={part.image_url}
          alt={`Figure for ${part.label}`}
          loading="lazy"
          sx={{
            display: 'block',
            width: 'auto',
            height: 'auto',
            maxWidth: '100%',
            maxHeight: { xs: '30vh', md: 280 },
            objectFit: 'contain',
            borderRadius: 1,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'common.white',
          }}
        />
      </Box>
      <FigureViewer
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
        src={part.image_url}
        label={`Figure for ${part.label}`}
      />
    </Box>
  );
}

function PartSolution({ part }: { part: QBDrawingPart }) {
  const [viewerOpen, setViewerOpen] = useState(false);
  // Say so rather than showing nothing. Each option carries its own solution,
  // and the question-level image is only ever a copy of the first option's, so
  // a student who unlocks an option nobody has drawn yet would otherwise watch
  // the switch turn on and the page stay exactly the same.
  if (!part.solution_image_url && !part.solution_video_url) {
    return (
      <Typography
        variant="caption"
        sx={{ display: 'block', mt: 1.5, color: 'text.secondary', fontStyle: 'italic' }}
      >
        No solution for {part.label} yet. Your teacher is still adding it.
      </Typography>
    );
  }
  return (
    <Box sx={{ mt: 1.5 }}>
      <Typography
        variant="caption"
        sx={{ display: 'block', fontWeight: 600, color: 'text.secondary', mb: 0.5 }}
      >
        Solution for {part.label}
      </Typography>
      {part.solution_image_url && (
        <>
          <Box
            component="button"
            type="button"
            onClick={() => setViewerOpen(true)}
            aria-label={`View the solution for ${part.label} full size`}
            sx={{
              display: 'block',
              width: '100%',
              p: 0,
              border: 0,
              bgcolor: 'transparent',
              cursor: 'pointer',
              borderRadius: 1,
              '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 2 },
            }}
          >
            <Box
              component="img"
              src={part.solution_image_url}
              alt={`Solution for ${part.label}`}
              loading="lazy"
              sx={{
                display: 'block',
                // Never blown up to fill the card: a small scan stretched is
                // the pixelated look, and the viewer is one tap away.
                width: 'auto',
                height: 'auto',
                maxWidth: '100%',
                maxHeight: 300,
                objectFit: 'contain',
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'common.white',
              }}
            />
          </Box>
          <FigureViewer
            open={viewerOpen}
            onClose={() => setViewerOpen(false)}
            src={part.solution_image_url}
            label={`Solution for ${part.label}`}
          />
        </>
      )}
      {part.solution_video_url && (
        <Button
          component="a"
          href={part.solution_video_url}
          target="_blank"
          rel="noopener noreferrer"
          startIcon={<PlayCircleOutlineIcon />}
          sx={{ mt: 1, minHeight: 44, textTransform: 'none' }}
        >
          Watch the solution video for {part.label}
        </Button>
      )}
    </Box>
  );
}

export default function DrawingPartsView({
  parts,
  questionNumber,
  language = 'en',
  showSolutions = false,
  soloOf = null,
}: Props) {
  const anyOne = parts.mode === 'any_one';
  const solo = Boolean(soloOf && soloOf > 1 && parts.items.length === 1);
  const stem = language === 'hi' && parts.stem_hi ? parts.stem_hi : parts.stem;
  const noun = anyOne ? 'Option' : 'Part';

  return (
    <Box>
      <Stack
        role="note"
        direction="row"
        spacing={1.25}
        alignItems="flex-start"
        sx={(theme) => ({
          p: 1.5,
          mb: 2,
          borderRadius: 1.5,
          bgcolor: alpha(theme.palette.info.main, 0.08),
          border: '1px solid',
          borderColor: alpha(theme.palette.info.main, 0.35),
        })}
      >
        {anyOne ? (
          <AltRouteIcon sx={{ color: 'info.dark', mt: '1px' }} aria-hidden />
        ) : (
          <ChecklistIcon sx={{ color: 'info.dark', mt: '1px' }} aria-hidden />
        )}
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>
            {solo ? `One of ${soloOf} options in the exam` : drawingPartsSummary(parts)}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {solo
              ? 'In the exam you answer either one. Here you can practise both, separately.'
              : anyOne
                ? 'Choose the option you want to draw. You do not draw the others.'
                : 'Draw every part below.'}
          </Typography>
        </Box>
      </Stack>

      {stem && (
        <MathText text={stem} variant="body1" sx={{ mb: 1.5, lineHeight: 1.7 }} />
      )}

      <Box component="ol" sx={{ listStyle: 'none', p: 0, m: 0 }}>
        {parts.items.map((part, i) => (
          <Fragment key={part.id}>
            {anyOne && i > 0 && (
              <Box component="li" role="presentation">
                <PartsOrDivider />
              </Box>
            )}
            <Box
              component="li"
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1.5,
                p: { xs: 1.5, sm: 2 },
                bgcolor: 'background.paper',
                mb: anyOne ? 0 : 1.5,
              }}
            >
              <Stack direction="row" spacing={1.25} alignItems="flex-start">
                <PartBadge>{partNumberLabel(questionNumber, part)}</PartBadge>
                <Box sx={{ flex: 1, minWidth: 0, position: 'relative' }}>
                  <Box component="span" sx={visuallyHidden}>
                    {noun} {part.label}:
                  </Box>
                  <MathText
                    text={language === 'hi' && part.text_hi ? part.text_hi : part.text}
                    variant="body1"
                    sx={{ lineHeight: 1.7 }}
                  />
                  {part.image_url && <PartFigure part={part} />}
                  {!anyOne && part.marks ? (
                    <Chip
                      size="small"
                      variant="outlined"
                      label={`${part.marks} marks`}
                      sx={{ mt: 1 }}
                    />
                  ) : null}
                </Box>
              </Stack>
              {showSolutions && <PartSolution part={part} />}
            </Box>
          </Fragment>
        ))}
      </Box>
    </Box>
  );
}
