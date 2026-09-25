'use client';

import type { ReactNode } from 'react';
import { Box, Button, Chip, Paper, Typography, alpha, useTheme } from '@neram/ui';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import LibraryBooksOutlinedIcon from '@mui/icons-material/LibraryBooksOutlined';
import HistoryEduOutlinedIcon from '@mui/icons-material/HistoryEduOutlined';
import type { SourceKind } from '@/lib/test-wizard-draft';

/**
 * Step 1. Where do the questions come from?
 *
 * Three sources, one wizard. What kind of test this becomes is NOT asked here
 * and is not asked anywhere in step 1 or 2: a test becomes a class test or a
 * weekly only by where it is placed in step 4. That is the change that lets one
 * wizard replace the five creation paths that existed before it.
 */

interface SourceOption {
  kind: SourceKind;
  icon: ReactNode;
  title: string;
  blurb: string;
  footer?: ReactNode;
  recommended?: boolean;
}

export default function StepSource({ onPick }: { onPick: (kind: SourceKind) => void }) {
  const theme = useTheme();

  // Bank first: it already holds every JEE Paper 2 and NATA past paper, so it
  // answers most requests at no cost. ChatGPT second, marked Free, because it
  // is how most tests here are actually written. The previous-year paper card
  // is gone: its questions were always in the bank, and a full paper as a mock
  // is still one tap away, from the bank's Paper filter or the link below.
  const options: SourceOption[] = [
    {
      kind: 'bank',
      icon: <LibraryBooksOutlinedIcon />,
      title: 'Pick from question bank',
      blurb:
        'Every question you already have, past papers included. Filter by exam, topic, source and paper. Reuse, do not regenerate.',
    },
    {
      kind: 'json',
      icon: <UploadFileOutlinedIcon />,
      title: 'Write with ChatGPT or Gemini',
      blurb: 'Copy a ready prompt, attach your chapter PDF, then paste the reply back. You can also upload a JSON file.',
      footer: <Chip size="small" label="Free" color="success" variant="outlined" sx={{ fontWeight: 700 }} />,
    },
    {
      kind: 'ai',
      icon: <AutoAwesomeOutlinedIcon />,
      title: 'Generate with AI',
      blurb:
        'From a topic, chapter PDF or a class recording transcript. Uses inbuilt Gemini, the cheap default.',
      footer: (
        <Typography variant="caption" sx={{ color: 'primary.dark', fontWeight: 700 }}>
          About ₹1 per test
        </Typography>
      ),
    },
  ];

  return (
    <Box>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
        Where do the questions come from?
      </Typography>

      <Box
        sx={{
          display: 'grid',
          // One column on a phone. Two cards side by side at 375px would put
          // four 40-word blurbs into 170px each.
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
          gap: 1.75,
        }}
      >
        {options.map((o) => (
          <Paper
            key={o.kind}
            variant="outlined"
            role="button"
            tabIndex={0}
            onClick={() => onPick(o.kind)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onPick(o.kind);
              }
            }}
            sx={{
              p: 2,
              minHeight: 96,
              borderRadius: 2,
              cursor: 'pointer',
              borderWidth: 1.5,
              borderColor: o.recommended ? 'primary.light' : 'divider',
              bgcolor: o.recommended ? alpha(theme.palette.primary.main, 0.04) : 'background.paper',
              transition: 'border-color 150ms, background-color 150ms',
              '&:hover': { borderColor: 'primary.light' },
              '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
            }}
          >
            <Box sx={{ color: 'primary.main', display: 'flex', mb: 1 }}>{o.icon}</Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {o.title}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, lineHeight: 1.55 }}>
              {o.blurb}
            </Typography>
            {o.footer && <Box sx={{ mt: 1.25 }}>{o.footer}</Box>}
          </Paper>
        ))}
      </Box>

      <Box sx={{ mt: 2, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: { xs: 0.5, sm: 3 } }}>
        <Button
          startIcon={<HistoryEduOutlinedIcon />}
          onClick={() => onPick('pyq')}
          sx={{ textTransform: 'none', fontWeight: 700, minHeight: 44, justifyContent: 'flex-start' }}
        >
          Use a full past paper as a mock
        </Button>
        <Button
          onClick={() => onPick('blank')}
          sx={{ textTransform: 'none', fontWeight: 700, minHeight: 44, justifyContent: 'flex-start' }}
        >
          Start blank and add questions by hand
        </Button>
      </Box>
    </Box>
  );
}
