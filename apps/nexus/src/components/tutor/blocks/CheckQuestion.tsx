'use client';

import { Box, Button, Typography, useTheme } from '@neram/ui';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import type { TutorBlock } from '@/lib/assistant/tutor/types';
import MathText from '@/components/common/MathText';
import { focusRing } from '@/components/assistant/focusRing';
import { letterOf } from '../labels';
import { MATH_SX, stripBold } from './TutorText';

type CheckBlock = Extract<TutorBlock, { kind: 'check_question' }>;

interface CheckQuestionProps {
  block: CheckBlock;
  /** Only the newest open check takes an answer; older ones are a record. */
  interactive: boolean;
  /** A turn is in flight. */
  disabled?: boolean;
  onChoose: (choiceId: string, label: string) => void;
}

/**
 * A check the tutor asks: choices as full-width 48px buttons lettered A, B,
 * C, or a number to type in the composer below.
 *
 * Choices already tried on this check are greyed, struck through and
 * disabled, with "Tried" said in words. An older check (the tutor has moved
 * on) keeps its text but its choices are not buttons any more.
 */
export default function CheckQuestion({ block, interactive, disabled = false, onChoose }: CheckQuestionProps) {
  const theme = useTheme();
  const tried = new Set(block.tried || []);
  const choices = block.choices || [];
  const questionId = `check-${block.stepId}-${block.id}`;

  return (
    <Box
      role="group"
      aria-labelledby={questionId}
      sx={{
        border: '1px solid',
        borderColor: interactive ? 'primary.main' : 'divider',
        borderRadius: 2,
        p: 1.5,
        bgcolor: 'background.paper',
      }}
    >
      <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, color: interactive ? 'primary.main' : 'text.secondary', mb: 0.5, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {interactive ? 'Your turn' : 'Check'}
      </Typography>
      <Box id={questionId}>
        <MathText text={stripBold(block.md)} variant="body1" sx={{ ...MATH_SX, fontWeight: 600, lineHeight: 1.55 }} />
      </Box>

      {choices.length > 0 && (
        <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, mt: 1.25, display: 'grid', gap: 1 }}>
          {choices.map((c, i) => {
            const letter = letterOf(i);
            const wasTried = tried.has(c.id);
            if (!interactive) {
              return (
                <Box
                  component="li"
                  key={c.id}
                  sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, px: 1, py: 0.5, color: 'text.secondary' }}
                >
                  <Typography component="span" sx={{ fontWeight: 700, minWidth: 20 }}>{letter}.</Typography>
                  <MathText text={c.md} variant="body2" color="text.secondary" sx={{ textDecoration: wasTried ? 'line-through' : 'none' }} />
                </Box>
              );
            }
            const off = disabled || wasTried;
            return (
              <Box component="li" key={c.id}>
                <Button
                  fullWidth
                  disableElevation
                  onClick={() => onChoose(c.id, `${letter}. ${c.md}`)}
                  disabled={off}
                  aria-label={wasTried ? `${letter}, tried already` : undefined}
                  data-testid="tutor-choice"
                  sx={{
                    width: '100%',
                    minHeight: 48,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                    gap: 1.25,
                    px: 1.5,
                    py: 1,
                    textAlign: 'left',
                    textTransform: 'none',
                    fontWeight: 400,
                    fontSize: '1rem',
                    lineHeight: 1.5,
                    border: '1px solid',
                    borderColor: wasTried ? 'divider' : 'grey.400',
                    borderRadius: 2,
                    bgcolor: wasTried ? 'action.disabledBackground' : 'background.paper',
                    color: 'text.primary',
                    cursor: off ? 'default' : 'pointer',
                    // The theme lifts buttons on hover with `transition: all`; keep it to colours.
                    transition: 'background-color 150ms, border-color 150ms',
                    transform: 'none !important',
                    boxShadow: 'none !important',
                    '@media (hover: hover)': { '&:hover': { bgcolor: off ? undefined : 'action.hover', borderColor: off ? undefined : 'primary.main' } },
                    '&.Mui-focusVisible': focusRing(theme.palette.primary.dark),
                    '&.Mui-disabled': { color: 'text.secondary', opacity: wasTried ? 0.75 : 0.6 },
                  }}
                >
                  <Box
                    component="span"
                    aria-hidden
                    sx={{
                      width: 28,
                      height: 28,
                      flexShrink: 0,
                      borderRadius: '50%',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '0.875rem',
                      border: '1.5px solid',
                      borderColor: wasTried ? 'text.disabled' : 'primary.main',
                      color: wasTried ? 'text.secondary' : 'primary.main',
                    }}
                  >
                    {wasTried ? <CloseRoundedIcon sx={{ fontSize: 16 }} /> : letter}
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <MathText
                      text={c.md}
                      variant="body1"
                      component="span"
                      sx={{ display: 'block', textDecoration: wasTried ? 'line-through' : 'none', overflowWrap: 'anywhere' }}
                    />
                  </Box>
                  {wasTried && (
                    <Typography component="span" variant="caption" sx={{ flexShrink: 0, color: 'text.secondary', fontWeight: 600 }}>
                      Tried
                    </Typography>
                  )}
                </Button>
              </Box>
            );
          })}
        </Box>
      )}

      {block.input === 'number' && interactive && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Type your answer in the box below.
        </Typography>
      )}
    </Box>
  );
}
