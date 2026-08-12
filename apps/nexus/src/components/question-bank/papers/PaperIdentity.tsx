'use client';

import { Box, Chip, Typography } from '@neram/ui';
import TranslateIcon from '@mui/icons-material/Translate';
import { QB_EXAM_TYPE_LABELS } from '@neram/database';
import type { PaperStats } from './derivePaperStats';
import type { PaperWithBreakdown } from './paperTypes';

export interface PaperIdentityProps {
  paper: PaperWithBreakdown;
  stats: PaperStats;
  /** The Hindi chip is detail, not identity. Off where space is tight. */
  showHindi?: boolean;
}

/**
 * What this paper IS: exam, year, and the variant that distinguishes it from
 * the other paper of the same year.
 *
 * Session and shift are not decoration. Two JEE Paper 2 rows for 2024 are only
 * told apart by "Session 1 (FN)", so this pair travels together in every view.
 */
export default function PaperIdentity({ paper, stats, showHindi = true }: PaperIdentityProps) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', minWidth: 0 }}>
      <Chip
        label={QB_EXAM_TYPE_LABELS[paper.exam_type] || paper.exam_type}
        size="small"
        color="primary"
      />
      <Typography variant="subtitle1" fontWeight={600}>
        {paper.year}
      </Typography>
      {paper.session && (
        <Chip
          label={paper.shift
            ? `${paper.session} (${paper.shift === 'forenoon' ? 'FN' : 'AN'})`
            : paper.session}
          size="small"
          variant="outlined"
        />
      )}
      {showHindi && stats.hindiCount > 0 && (
        <Chip
          icon={<TranslateIcon sx={{ fontSize: 14 }} />}
          label={`हिंदी ${stats.hindiCount}/${stats.total}`}
          size="small"
          sx={{
            bgcolor: '#fff3e0',
            color: '#e65100',
            fontWeight: 600,
            fontSize: '0.65rem',
            height: 22,
            maxWidth: '100%',
          }}
        />
      )}
    </Box>
  );
}
