'use client';

/**
 * "Show question": a question bank question asked from Present to class, on
 * the student's pad, below the answer buttons (answering stays one tap).
 *
 * Folded away by default in the Teams side panel, where the shared screen
 * already shows the question and the panel is narrow; open by default on the
 * browser pad, where the pad is the only screen. KaTeX loads only when a text
 * with math is shown, so the side panel's first load never carries it.
 *
 * It never shows the answer: the student's view of a question bank question
 * (pad_qb_view) has none.
 */

import { useId, useState } from 'react';
import dynamic from 'next/dynamic';
import { Box, Button, Skeleton, Stack, Typography } from '@neram/ui';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import ArticleOutlined from '@mui/icons-material/ArticleOutlined';
import type { QBQuestionView } from '@/lib/pad/client/types';
import QuestionPicture from './QuestionPicture';

const MathText = dynamic(() => import('@/components/common/MathText'), {
  ssr: false,
  loading: () => <Skeleton variant="text" width="80%" />,
});

const LETTERS = 'ABCDEFGH';

/** Plain text as typed, or KaTeX for text with $ math. A wide formula scrolls inside its own line, never the pad. */
function QBText({ text, variant = 'body1' }: { text: string; variant?: 'body1' | 'body2' }) {
  if (!text.includes('$')) {
    return (
      <Typography variant={variant} sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.5 }}>
        {text}
      </Typography>
    );
  }
  return (
    <Box sx={{ maxWidth: '100%', overflowX: 'auto', overflowY: 'hidden' }}>
      <MathText text={text} variant={variant} sx={{ overflowWrap: 'anywhere', lineHeight: 1.5 }} />
    </Box>
  );
}

export default function ShowQuestion({
  qb,
  title,
  defaultOpen,
  compact,
  onButtons,
}: {
  qb: QBQuestionView;
  /** "Q.38", for the pictures' names. */
  title: string;
  defaultOpen: boolean;
  compact: boolean;
  /** The option texts already printed on the answer buttons, which the list leaves out. */
  onButtons?: ReadonlyArray<string | null> | null;
}) {
  const panelId = useId();
  const [open, setOpen] = useState(defaultOpen);

  const options = qb.options.map((option, index) => ({ ...option, letter: LETTERS.charAt(index) || String(index + 1) }));
  const figures = options.filter((option) => option.image_url);
  const texts = options.filter((option) => !option.image_url && option.text?.trim() && !onButtons?.[options.indexOf(option)]);
  const hasContent = Boolean(qb.text?.trim() || qb.image_url || figures.length || texts.length);
  if (!hasContent) return null;

  return (
    <Stack spacing={1.5}>
      <Button
        variant="outlined"
        color="inherit"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={panelId}
        startIcon={<ArticleOutlined />}
        endIcon={
          <ExpandMoreRounded
            sx={{
              transform: open ? 'rotate(180deg)' : 'none',
              transition: 'transform 150ms',
              '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
            }}
          />
        }
        sx={{
          minHeight: 48,
          justifyContent: 'space-between',
          fontWeight: 700,
          textTransform: 'none',
          borderColor: 'divider',
          touchAction: 'manipulation',
          '&.Mui-focusVisible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 2 },
        }}
      >
        <Box component="span" sx={{ flex: 1, textAlign: 'left' }}>
          {open ? 'Hide question' : 'Show question'}
        </Box>
      </Button>

      <Box id={panelId} hidden={!open} sx={{ minWidth: 0, maxWidth: '100%' }}>
        {open && (
          <Stack spacing={1.5}>
            {qb.text?.trim() && <QBText text={qb.text} />}
            {qb.image_url && <QuestionPicture key={qb.image_url} url={qb.image_url} title={title} compact={compact} />}

            {texts.length > 0 && (
              <Stack component="ol" spacing={0.75} aria-label="Options" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                {texts.map((option) => (
                  <Stack component="li" key={option.letter} direction="row" spacing={1} alignItems="baseline" sx={{ minWidth: 0 }}>
                    <Typography component="span" fontWeight={800} sx={{ flexShrink: 0 }}>
                      {`${option.letter}.`}
                    </Typography>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <QBText text={option.text ?? ''} />
                    </Box>
                  </Stack>
                ))}
              </Stack>
            )}

            {figures.length > 0 && (
              <Box
                role="list"
                aria-label="Option pictures"
                sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}
              >
                {figures.map((option) => (
                  <Stack role="listitem" key={option.letter} spacing={0.5} sx={{ minWidth: 0 }}>
                    <QuestionPicture
                      url={option.image_url as string}
                      title={`Option ${option.letter}`}
                      compact={compact}
                      alt={`Option ${option.letter}`}
                      openLabel={`Show option ${option.letter} larger`}
                      badge={option.letter}
                      maxHeight={compact ? 120 : 160}
                      minHeight={96}
                    />
                    {option.text?.trim() && <QBText text={option.text} variant="body2" />}
                  </Stack>
                ))}
              </Box>
            )}
          </Stack>
        )}
      </Box>
    </Stack>
  );
}
