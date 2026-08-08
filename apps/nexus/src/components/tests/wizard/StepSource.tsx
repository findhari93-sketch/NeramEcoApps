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
 * Four sources, one wizard. What kind of test this becomes is NOT asked here
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

  const options: SourceOption[] = [
    {
      kind: 'ai',
      icon: <AutoAwesomeOutlinedIcon />,
      title: 'Generate with AI',
      blurb:
        'From a topic, chapter PDF or a class recording transcript. Uses inbuilt Gemini, the cheap default.',
      footer: (
        <Typography variant="caption" sx={{ color: 'primary.dark', fontWeight: 700 }}>
          Recommended, about ₹1 per test
        </Typography>
      ),
      recommended: true,
    },
    {
      kind: 'json',
      icon: <UploadFileOutlinedIcon />,
      title: 'Upload JSON',
      blurb:
        'Paste or drop a file from ChatGPT, Claude or any external tool. Preview before anything is saved.',
      footer: (
        <Box
          sx={{
            border: '1.5px dashed',
            borderColor: 'divider',
            borderRadius: 1.5,
            px: 1,
            py: 1,
            textAlign: 'center',
          }}
        >
          <Typography variant="caption" color="text.secondary">
            It stays stored with the test
          </Typography>
        </Box>
      ),
    },
    {
      kind: 'bank',
      icon: <LibraryBooksOutlinedIcon />,
      title: 'Pick from question bank',
      blurb:
        'Filter the questions you already have by subject, chapter, difficulty and year. Reuse, do not regenerate.',
    },
    {
      kind: 'pyq',
      icon: <HistoryEduOutlinedIcon />,
      title: 'Previous-year paper',
      blurb:
        'JEE Paper 2 or NATA, by year. Imports the full paper as an exam-faithful mock, sections and marking included.',
      footer: (
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {['2024', '2023', '2022'].map((y) => (
            <Chip key={y} size="small" label={y} variant="outlined" sx={{ height: 22 }} />
          ))}
          <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
            and earlier
          </Typography>
        </Box>
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

      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
        or{' '}
        <Button
          onClick={() => onPick('blank')}
          sx={{ textTransform: 'none', p: 0, minWidth: 0, fontWeight: 700, verticalAlign: 'baseline' }}
        >
          start blank
        </Button>{' '}
        and add questions by hand
      </Typography>
    </Box>
  );
}
