'use client';

import { memo } from 'react';
import { Box, Typography, alpha, useTheme } from '@neram/ui';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import type { NexusQBQuestionListItem } from '@neram/database';
import { QB_DIFFICULTY_COLORS } from '@neram/database';
import MathText from '@/components/common/MathText';
import { STATUS_SPEECH, statusOf } from './practice-logic';

const DIFFICULTY: Record<string, string> = { EASY: 'Easy', MEDIUM: 'Medium', HARD: 'Hard' };

/** Hidden from the eye, read by a screen reader. Width '1px', never 1 (which sx reads as 100%). */
export const SR_ONLY = {
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

interface QuestionRowProps {
  question: NexusQBQuestionListItem;
  number: number;
  current: boolean;
  lang: 'en' | 'hi';
  /** "Sets & Relations": the one topic worth printing. */
  topic: string | null;
  /** "JEE 2014 Q18", for a list that spans papers. Null inside one paper. */
  source: string | null;
  highlight?: string[];
  selecting: boolean;
  selected: boolean;
  onOpen: (id: string) => void;
  onToggleSelect: (id: string) => void;
}

/**
 * One question in the practice list: about 72px where a card used to be 190.
 *
 * The number badge carries the status the way the grid does (green and a tick,
 * red and a cross, an outline for not answered), so the list and the grid read
 * the same. One caption line holds what the old chips said: difficulty, the
 * specific topic, a video, and the paper it came from when the list spans
 * several. "JEE 2014" is not printed on every row inside the 2014 paper.
 *
 * The whole row is one button. In selection mode it toggles the question,
 * and the checkbox is a picture of that state rather than a second control
 * nested inside the first.
 */
function QuestionRow({
  question,
  number,
  current,
  lang,
  topic,
  source,
  highlight,
  selecting,
  selected,
  onOpen,
  onToggleSelect,
}: QuestionRowProps) {
  const theme = useTheme();
  const status = statusOf(question.attempt_summary);
  const text = lang === 'hi' && question.question_text_hi ? question.question_text_hi : question.question_text;

  const badge =
    status === 'right'
      ? { bg: theme.palette.success.main, fg: theme.palette.success.contrastText, border: theme.palette.success.main }
      : status === 'wrong'
        ? { bg: theme.palette.error.main, fg: theme.palette.error.contrastText, border: theme.palette.error.main }
        : { bg: 'transparent', fg: theme.palette.text.primary, border: theme.palette.divider };

  const caption: string[] = [];
  if (DIFFICULTY[question.difficulty]) caption.push(DIFFICULTY[question.difficulty]);
  if (topic) caption.push(topic);
  if (question.question_format === 'DRAWING_PROMPT') caption.push('Drawing');
  if (source) caption.push(source);

  return (
    <Box
      component="button"
      type="button"
      data-qid={question.id}
      aria-current={current && !selecting ? 'true' : undefined}
      aria-pressed={selecting ? selected : undefined}
      onClick={() => (selecting ? onToggleSelect(question.id) : onOpen(question.id))}
      sx={{
        // The containing block for the screen-reader text inside. Without it
        // that absolutely positioned text escaped the rail's scroll box, and
        // 113 rows of it stretched the document to 11,000px behind the panes.
        position: 'relative',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1.25,
        width: '100%',
        minHeight: 64,
        m: 0,
        px: 1.25,
        py: 1.25,
        textAlign: 'left',
        fontFamily: 'inherit',
        color: 'text.primary',
        bgcolor: current ? alpha(theme.palette.primary.main, 0.08) : 'background.paper',
        border: 0,
        borderBottom: '1px solid',
        borderColor: 'divider',
        // A left rule rather than only a fill: it keeps its contrast in both themes.
        boxShadow: current ? `inset 3px 0 0 ${theme.palette.primary.main}` : 'none',
        cursor: 'pointer',
        transition: 'background-color 150ms ease',
        '&:hover': { bgcolor: current ? alpha(theme.palette.primary.main, 0.1) : alpha(theme.palette.primary.main, 0.04) },
        '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: -2 },
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
      }}
    >
      {selecting && (
        <Box component="span" aria-hidden sx={{ display: 'flex', color: selected ? 'primary.main' : 'text.secondary', pt: 0.5 }}>
          {selected ? <CheckBoxIcon /> : <CheckBoxOutlineBlankIcon />}
        </Box>
      )}

      {/* Number, coloured by status */}
      <Box
        component="span"
        aria-hidden
        sx={{
          position: 'relative',
          flexShrink: 0,
          width: 36,
          height: 36,
          borderRadius: '10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          fontSize: '0.875rem',
          fontVariantNumeric: 'tabular-nums',
          bgcolor: badge.bg,
          color: badge.fg,
          border: '1px solid',
          borderColor: badge.border,
          boxShadow: current ? `0 0 0 2px ${theme.palette.background.paper}, 0 0 0 4px ${theme.palette.primary.main}` : 'none',
        }}
      >
        {number}
        {status !== 'unanswered' && (
          <Box component="span" sx={{ position: 'absolute', right: 1, bottom: 0, display: 'flex', lineHeight: 0 }}>
            {status === 'right' ? <CheckIcon sx={{ fontSize: 11 }} /> : <CloseIcon sx={{ fontSize: 11 }} />}
          </Box>
        )}
      </Box>

      <Box component="span" sx={{ flex: 1, minWidth: 0, display: 'block' }}>
        <Box component="span" sx={SR_ONLY}>
          {`Question ${number}, ${STATUS_SPEECH[status]}${selecting && selected ? ', selected for the test' : ''}. `}
        </Box>
        {/* Two lines of the stem */}
        <Box
          component="span"
          sx={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            lineHeight: 1.45,
            fontSize: '0.9375rem',
          }}
        >
          {text ? (
            <MathText text={text} variant="body2" component="span" highlight={highlight} sx={{ fontSize: 'inherit', lineHeight: 'inherit' }} />
          ) : (
            <Typography variant="body2" component="span" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
              Image-based question
            </Typography>
          )}
        </Box>

        {/* One caption line in place of four chips */}
        <Box
          component="span"
          sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 0.75, rowGap: 0.25, mt: 0.5 }}
        >
          <Box
            component="span"
            aria-hidden
            sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: QB_DIFFICULTY_COLORS[question.difficulty] ?? 'divider', flexShrink: 0 }}
          />
          <Typography variant="caption" component="span" sx={{ color: 'text.secondary', fontWeight: 500 }}>
            {caption.join(' · ')}
          </Typography>
          {/* The list ships a flag, never the link: the video opens only after an answer. */}
          {question.has_solution_video && (
            <Box
              component="span"
              aria-label="Has a video solution, unlocks after you answer"
              title="Has a video solution, unlocks after you answer"
              sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, color: 'primary.main' }}
            >
              <PlayCircleOutlineIcon aria-hidden sx={{ fontSize: 14 }} />
              <Typography variant="caption" component="span" sx={{ fontWeight: 600, color: 'inherit' }}>
                Video
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      {question.question_image_url && (
        <Box
          component="img"
          src={question.question_image_url}
          alt=""
          loading="lazy"
          sx={{ width: 48, height: 48, flexShrink: 0, borderRadius: 1, objectFit: 'cover', bgcolor: 'action.hover' }}
        />
      )}
    </Box>
  );
}

export default memo(QuestionRow);
