'use client';

import { useState } from 'react';
import { Box, IconButton, Paper, Typography, alpha, useTheme } from '@neram/ui';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import type { NexusQBQuestionOption } from '@neram/database';
import MathText from '@/components/common/MathText';
import { optionMentionsFigure } from '@/lib/qb-image-needs';
import FigureViewer from './FigureViewer';

interface MCQOptionsProps {
  options: NexusQBQuestionOption[];
  selectedId: string | null;
  correctId?: string | null;
  submitted: boolean;
  onSelect: (id: string) => void;
  /** Language for option text display */
  lang?: 'en' | 'hi';
}

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

/**
 * A figure question is one whose answers are pictures.
 *
 * Two is enough: the student is being asked to compare, and comparing is what
 * the old layout made impossible. It stacked picture options one per row at
 * every width, so four of them ran to about 680px and pushed the question off
 * the top of the screen. On paper all five sit on one page, and a student
 * flicks between them without losing the problem.
 */
function isFigureQuestion(options: NexusQBQuestionOption[]): boolean {
  return options.filter((o) => Boolean(o.image_url)).length >= 2;
}

export default function MCQOptions({
  options,
  selectedId,
  correctId,
  submitted,
  onSelect,
  lang = 'en',
}: MCQOptionsProps) {
  const theme = useTheme();
  const [zoomIdx, setZoomIdx] = useState<number | null>(null);

  const figureMode = isFigureQuestion(options);

  // Determine if options are short enough for 2-column layout
  const allShort =
    options.every((o) => (!o.text || o.text.length < 80) && !o.image_url);

  const getOptionStyles = (optionId: string) => {
    const isSelected = optionId === selectedId;
    const isCorrect = optionId === correctId;

    if (submitted && correctId) {
      if (isCorrect) {
        return {
          bgcolor: alpha(theme.palette.success.main, 0.12),
          borderColor: theme.palette.success.main,
          borderWidth: 2,
        };
      }
      if (isSelected && !isCorrect) {
        return {
          bgcolor: alpha(theme.palette.error.main, 0.12),
          borderColor: theme.palette.error.main,
          borderWidth: 2,
        };
      }
      return {
        bgcolor: 'background.paper',
        borderColor: 'divider',
        borderWidth: 1,
        opacity: 0.6,
      };
    }

    if (isSelected) {
      return {
        bgcolor: alpha(theme.palette.primary.main, 0.08),
        borderColor: theme.palette.primary.main,
        borderWidth: 2,
      };
    }

    return {
      bgcolor: 'background.paper',
      borderColor: 'divider',
      borderWidth: 1,
    };
  };

  // Check if Hindi mode is active but no options have Hindi text
  const hindiActive = lang === 'hi';
  const hasAnyHindiOption = hindiActive && options.some((o) => !!o.text_hi);
  const showFallbackHint = hindiActive && !hasAnyHindiOption;

  const textOf = (option: NexusQBQuestionOption) =>
    (lang === 'hi' && option.text_hi ? option.text_hi : option.text) || '';

  return (
    // Two columns when the OPTIONS have the room, not the window: beside the
    // practice rail a 1024px window leaves the reader about 600px, and a
    // viewport breakpoint split that into two cramped columns.
    <Box sx={{ containerType: 'inline-size' }}>
      {showFallbackHint && (
        <Typography
          variant="caption"
          sx={{ color: 'text.disabled', mb: 0.5, display: 'block', fontStyle: 'italic' }}
        >
          Hindi options are not available, showing English
        </Typography>
      )}
      <Box
        role="radiogroup"
        aria-label="Answer options"
        sx={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          gap: 1,
          ...(figureMode && {
            // Two even on the narrowest phone: at 328px of container that is
            // about 142px of picture each, and the bank's answer figures are
            // 79 to 280px across, so they are shown at or under natural size
            // rather than blown up. Four once there is room, which is how the
            // paper prints them.
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            // 600, not 640: a 1280px laptop leaves this container 626px, and
            // at 640 it fell back to two rows, which put the last two answers
            // under the fold again.
            '@container (min-width: 600px)': { gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' },
          }),
          ...(!figureMode &&
            allShort && {
              '@container (min-width: 520px)': { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' },
            }),
        }}
      >
      {options.map((option, idx) => {
        const styles = getOptionStyles(option.id);
        const letter = OPTION_LETTERS[idx] || String(idx + 1);
        const displayText = textOf(option);
        const isFigure = figureMode && Boolean(option.image_url);
        // "Figure (1)" beside the figure it names is noise. Kept for a screen
        // reader on the picture itself, dropped from the page.
        const hideText = isFigure && optionMentionsFigure(option);
        return (
          <Paper
            key={option.id}
            variant="outlined"
            onClick={() => !submitted && onSelect(option.id)}
            role="radio"
            aria-checked={option.id === selectedId}
            aria-disabled={submitted}
            // Named only when its words are hidden. With words on the card
            // they are read from the content, and a label here would silence
            // them.
            aria-label={hideText ? `Option ${letter}` : undefined}
            tabIndex={submitted ? -1 : 0}
            onKeyDown={(e) => {
              if (!submitted && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                onSelect(option.id);
              }
            }}
            sx={{
              display: 'flex',
              position: 'relative',
              // A figure needs the whole width of its cell, so the letter goes
              // into its corner instead of beside it stealing 40px.
              flexDirection: isFigure ? 'column' : 'row',
              alignItems: isFigure ? 'stretch' : 'center',
              gap: isFigure ? 0.75 : 1.5,
              p: { xs: 1, md: 1.25 },
              minHeight: 56,
              cursor: submitted ? 'default' : 'pointer',
              transition: 'all 0.15s ease',
              '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
              borderStyle: 'solid',
              ...styles,
              '&:hover': submitted
                ? {}
                : {
                    borderColor: theme.palette.primary.main,
                    bgcolor: alpha(theme.palette.primary.main, 0.04),
                  },
              '&:focus-visible': {
                outline: `2px solid ${theme.palette.primary.main}`,
                outlineOffset: 2,
              },
            }}
          >
            {/* Option letter. On a figure it sits in the picture's corner:
                a row of its own costs 28px of height per row, and on a 1280px
                laptop that is the difference between the answers being on the
                screen with the question and being under it. */}
            <Box
              sx={{
                ...(isFigure && {
                  position: 'absolute',
                  top: 4,
                  left: 4,
                  zIndex: 1,
                }),
                width: { xs: 32, sm: 28 },
                height: { xs: 32, sm: 28 },
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor:
                  option.id === selectedId
                    ? theme.palette.primary.main
                    : alpha(theme.palette.text.primary, 0.08),
                color:
                  option.id === selectedId ? '#fff' : 'text.secondary',
                fontWeight: 700,
                fontSize: { xs: '0.8rem', sm: '0.75rem' },
                flexShrink: 0,
                transition: 'all 0.15s ease',
                '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
              }}
            >
              {letter}
            </Box>

            {/* Option content */}
            <Box sx={{ flex: isFigure ? 'none' : 1, minWidth: 0 }}>
              {displayText && !hideText ? (
                <MathText
                  text={displayText}
                  variant="body2"
                  sx={{
                    lineHeight: 1.5,
                    ...(isFigure && {
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }),
                  }}
                />
              ) : null}
              {option.image_url && (
                <Box sx={{ position: 'relative', mt: displayText && !hideText ? 1 : 0 }}>
                  <Box
                    component="img"
                    src={option.image_url}
                    // Just the letter: when the option has words they sit
                    // beside the picture and would otherwise be read twice.
                    alt={`Option ${letter}`}
                    loading="lazy"
                    sx={{
                      display: 'block',
                      mx: 'auto',
                      // Never blown up: the source scans are small, and a
                      // stretched one is the "pixelated" look the founder
                      // reported. The zoom button is how you get closer.
                      width: 'auto',
                      height: 'auto',
                      maxWidth: '100%',
                      maxHeight: isFigure ? 200 : 120,
                      borderRadius: 1,
                      objectFit: 'contain',
                      // The bank's figures are line art on a transparent
                      // background, invisible on a dark card without this.
                      bgcolor: 'common.white',
                    }}
                  />
                  {isFigure && (
                    <IconButton
                      onClick={(e) => {
                        // The card is the answer; the button is only the zoom.
                        e.stopPropagation();
                        setZoomIdx(idx);
                      }}
                      aria-label={`Look closer at option ${letter}`}
                      size="small"
                      sx={{
                        position: 'absolute',
                        top: 2,
                        right: 2,
                        width: 36,
                        height: 36,
                        color: 'text.secondary',
                        bgcolor: 'rgba(255,255,255,0.82)',
                        border: '1px solid',
                        borderColor: 'divider',
                        '&:hover': { bgcolor: 'common.white' },
                        // 36px reads better over a small figure than 44px, so
                        // the hit area is pushed out to 44 instead.
                        '&::after': {
                          content: '""',
                          position: 'absolute',
                          inset: '-4px',
                        },
                      }}
                    >
                      <ZoomInIcon fontSize="small" />
                    </IconButton>
                  )}
                </Box>
              )}
            </Box>
          </Paper>
        );
      })}
      </Box>

      {zoomIdx !== null && options[zoomIdx]?.image_url ? (
        <FigureViewer
          open
          onClose={() => setZoomIdx(null)}
          src={options[zoomIdx].image_url!}
          label={`Option ${OPTION_LETTERS[zoomIdx] || zoomIdx + 1}`}
          caption={
            optionMentionsFigure(options[zoomIdx]) ? null : textOf(options[zoomIdx]) || null
          }
        />
      ) : null}
    </Box>
  );
}
