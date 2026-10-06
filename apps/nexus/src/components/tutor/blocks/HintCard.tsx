'use client';

import { Box, Typography, alpha, useTheme } from '@neram/ui';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import MathText from '@/components/common/MathText';
import { MATH_SX, stripBold } from './TutorText';

/** One rung of the hint ladder, labelled "Hint 2 of 4". */
export default function HintCard({ level, md }: { level: 1 | 2 | 3 | 4; md: string }) {
  const theme = useTheme();
  return (
    <Box
      sx={{
        borderRadius: 2,
        borderLeft: '4px solid',
        borderColor: 'warning.main',
        bgcolor: alpha(theme.palette.warning.main, 0.08),
        px: 1.5,
        py: 1.25,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
        <LightbulbOutlinedIcon aria-hidden sx={{ fontSize: 20, color: 'warning.dark' }} />
        <Typography variant="subtitle2" component="p" sx={{ fontWeight: 700, color: 'text.primary' }}>
          Hint {level} of 4
        </Typography>
      </Box>
      <MathText text={stripBold(md)} variant="body1" sx={{ ...MATH_SX, lineHeight: 1.6 }} />
    </Box>
  );
}
