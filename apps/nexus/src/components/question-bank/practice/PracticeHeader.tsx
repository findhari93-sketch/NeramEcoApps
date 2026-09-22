'use client';

import NextLink from 'next/link';
import { Box, Button, IconButton, LinearProgress, Tooltip, Typography } from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import KeyboardIcon from '@mui/icons-material/KeyboardOutlined';
import type { PracticeScope } from '@/lib/qb-paper-number';
import LangToggle from './LangToggle';

interface PracticeHeaderProps {
  variant: 'desktop' | 'mobile';
  title: string;
  backHref: string;
  backLabel: string;
  scope: PracticeScope;
  progress: { total: number; answered: number; right: number };
  /** For a list that loads in batches: how many are on screen, of how many. */
  shown: number;
  total: number;
  loading: boolean;
  /** "Continue at Q13", or null when every question is answered. */
  continueLabel: string | null;
  onContinue: () => void;
  lang: 'en' | 'hi';
  onLangChange: (lang: 'en' | 'hi') => void;
  showLang: boolean;
  selecting: boolean;
  onCreateTest: () => void;
  onHelp?: () => void;
}

/**
 * One header in place of four rows (a back link, a search bar, a chip row and
 * a "Showing 20 of 30" row with two test buttons) that pushed the first
 * question about 290px down the screen.
 *
 * It says where you are, how far through you are, and offers the one next step
 * worth taking: continue at the first question not yet answered.
 */
export default function PracticeHeader({
  variant,
  title,
  backHref,
  backLabel,
  scope,
  progress,
  shown,
  total,
  loading,
  continueLabel,
  onContinue,
  lang,
  onLangChange,
  showLang,
  selecting,
  onCreateTest,
  onHelp,
}: PracticeHeaderProps) {
  const desktop = variant === 'desktop';
  const pct = progress.total ? Math.round((progress.answered / progress.total) * 100) : 0;

  const summary =
    scope === 'paper' ? (
      <Typography variant="body2" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }} aria-live="polite">
        <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>
          {progress.answered} of {progress.total}
        </Box>{' '}
        answered, {progress.right} right
      </Typography>
    ) : (
      <Typography variant="body2" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }} aria-live="polite">
        {loading ? (
          'Loading questions...'
        ) : (
          <>
            Showing{' '}
            <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>
              {shown}
            </Box>{' '}
            of {total} questions
          </>
        )}
      </Typography>
    );

  const progressBar = scope === 'paper' && progress.total > 0 && (
    <LinearProgress
      variant="determinate"
      value={pct}
      aria-label={`${progress.answered} of ${progress.total} answered`}
      sx={{ height: 6, borderRadius: 3, bgcolor: 'action.hover', '& .MuiLinearProgress-bar': { borderRadius: 3 } }}
    />
  );

  const back = (
    <Tooltip title={backLabel}>
      <IconButton component={NextLink} href={backHref} aria-label={backLabel} sx={{ width: 48, height: 48, flexShrink: 0 }}>
        <ArrowBackIcon />
      </IconButton>
    </Tooltip>
  );

  const continueButton = continueLabel && !selecting && (
    <Button
      variant={desktop ? 'outlined' : 'contained'}
      onClick={onContinue}
      startIcon={<PlayArrowRoundedIcon />}
      sx={{ minHeight: 44, textTransform: 'none', fontWeight: 700, whiteSpace: 'nowrap', flex: desktop ? 'none' : 1 }}
    >
      {continueLabel}
    </Button>
  );

  const testButton = !selecting && (
    <Button
      variant={desktop ? 'contained' : 'outlined'}
      onClick={onCreateTest}
      startIcon={<PlaylistAddIcon />}
      sx={{ minHeight: 44, textTransform: 'none', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}
    >
      Create test
    </Button>
  );

  if (desktop) {
    return (
      <Box
        component="header"
        sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minHeight: 64, flexShrink: 0, px: 1, flexWrap: 'wrap', rowGap: 0.5 }}
      >
        {back}
        <Box sx={{ minWidth: 0, mr: 1 }}>
          <Typography variant="h6" component="h1" sx={{ fontWeight: 700, lineHeight: 1.25 }} noWrap>
            {title}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 180 }}>
          {summary}
          {progressBar}
        </Box>
        <Box sx={{ flex: 1 }} />
        {continueButton}
        {showLang && <LangToggle lang={lang} onChange={onLangChange} />}
        {onHelp && (
          <Tooltip title="Keyboard shortcuts (?)">
            <IconButton onClick={onHelp} aria-label="Keyboard shortcuts" sx={{ width: 44, height: 44 }}>
              <KeyboardIcon />
            </IconButton>
          </Tooltip>
        )}
        {testButton}
      </Box>
    );
  }

  return (
    <Box component="header" sx={{ display: 'flex', flexDirection: 'column', gap: 1, pb: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: -1.5 }}>
        {back}
        <Typography variant="h6" component="h1" sx={{ fontWeight: 700, flex: 1, minWidth: 0, fontSize: '1.125rem' }} noWrap>
          {title}
        </Typography>
        {showLang && <LangToggle lang={lang} onChange={onLangChange} />}
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        {summary}
        {progressBar}
      </Box>
      {(continueButton || testButton) && (
        <Box sx={{ display: 'flex', gap: 1 }}>
          {continueButton}
          {testButton}
        </Box>
      )}
    </Box>
  );
}
