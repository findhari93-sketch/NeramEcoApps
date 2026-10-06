'use client';

import { Box, Chip, Typography, alpha, useTheme } from '@neram/ui';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded';
import MathText from '@/components/common/MathText';
import { MATH_SX, stripBold } from './TutorText';

interface VerdictProps {
  result: 'correct' | 'not_yet';
  md: string;
  mistakeLabel?: string;
}

/** Right or not yet: an icon, a word and a colour, never the colour alone. */
export default function Verdict({ result, md, mistakeLabel }: VerdictProps) {
  const theme = useTheme();
  const ok = result === 'correct';
  const tone = ok ? theme.palette.success : theme.palette.warning;
  const Icon = ok ? CheckCircleOutlineRoundedIcon : ReplayRoundedIcon;
  return (
    // No live role of its own: it renders inside the tutor's log, which already announces it.
    <Box
      sx={{
        display: 'flex',
        gap: 1.25,
        alignItems: 'flex-start',
        borderRadius: 2,
        border: '1px solid',
        borderColor: alpha(tone.main, 0.5),
        bgcolor: alpha(tone.main, 0.08),
        px: 1.5,
        py: 1.25,
      }}
    >
      <Icon aria-hidden sx={{ fontSize: 24, color: tone.dark, mt: '1px', flexShrink: 0 }} />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        {/* The word in text.primary: the theme's warning.dark is 3.8:1 on this tint, short of 4.5:1. The icon carries the colour. */}
        <Typography variant="subtitle2" component="p" sx={{ fontWeight: 700, color: ok ? tone.dark : 'text.primary' }}>
          {ok ? 'Correct' : 'Not yet'}
        </Typography>
        {md && <MathText text={stripBold(md)} variant="body1" sx={{ ...MATH_SX, lineHeight: 1.6 }} />}
        {mistakeLabel && (
          <Chip
            size="small"
            label={mistakeLabel}
            variant="outlined"
            sx={{ mt: 0.75, maxWidth: '100%', fontWeight: 600, borderColor: alpha(tone.main, 0.6), color: 'text.primary' }}
          />
        )}
      </Box>
    </Box>
  );
}
