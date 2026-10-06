'use client';

import { Box, Typography, alpha, useTheme } from '@neram/ui';
import MathText from '@/components/common/MathText';
import { SR_ONLY } from '@/components/question-bank/practice/QuestionRow';
import { MATH_SX, stripBold } from './TutorText';

/** The full worked solution, shown only once the student has earned it. */
export default function SolutionBlock({ steps, finalMd }: { steps: string[]; finalMd: string }) {
  const theme = useTheme();
  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5 }}>
      <Typography variant="subtitle2" component="h3" sx={{ fontWeight: 700, mb: 1 }}>
        Full solution
      </Typography>
      <Box component="ol" sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gap: 1.25 }}>
        {steps.map((s, i) => (
          <Box component="li" key={i} sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
            <Box
              aria-hidden
              sx={{
                width: 26,
                height: 26,
                flexShrink: 0,
                borderRadius: '50%',
                bgcolor: alpha(theme.palette.primary.main, 0.12),
                color: 'primary.dark',
                fontWeight: 700,
                fontSize: '0.8125rem',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {i + 1}
            </Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography component="span" sx={SR_ONLY}>
                Step {i + 1}.
              </Typography>
              <MathText text={stripBold(s)} variant="body1" sx={{ ...MATH_SX, lineHeight: 1.6 }} />
            </Box>
          </Box>
        ))}
      </Box>
      <Box sx={{ mt: 1.5, p: 1.25, borderRadius: 2, bgcolor: alpha(theme.palette.success.main, 0.08), border: '1px solid', borderColor: alpha(theme.palette.success.main, 0.4) }}>
        <Typography variant="caption" component="p" sx={{ fontWeight: 700, color: 'success.dark' }}>
          Answer
        </Typography>
        <MathText text={stripBold(finalMd)} variant="body1" sx={{ ...MATH_SX, fontWeight: 600 }} />
      </Box>
    </Box>
  );
}
