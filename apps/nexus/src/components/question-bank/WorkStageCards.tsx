'use client';

/**
 * The counts that ARE the filters.
 *
 * One card per stage. Pressing a card narrows the list to it; pressing it again
 * clears the filter back to "everything unfinished". There is no chip row beside
 * these repeating the same numbers: a count that describes a list is that list's
 * filter (the Forms-style rule for flat pages).
 */

import { Box, CardActionArea, Skeleton, Typography, alpha, useTheme } from '@neram/ui';
import {
  WORK_STAGES,
  WORK_STAGE_LABELS,
  type WorkStage,
} from './papers/paperWorkStage';
import { WORK_STAGE_LOOK, stageTextColor } from './TeacherPaperCard';

export interface WorkStageCardsProps {
  counts: Record<WorkStage, number>;
  selected: WorkStage | null;
  onSelect: (stage: WorkStage | null) => void;
  loading?: boolean;
}

const GRID = {
  display: 'grid',
  gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(5, 1fr)' },
  gap: 1,
} as const;

export default function WorkStageCards({ counts, selected, onSelect, loading }: WorkStageCardsProps) {
  const theme = useTheme();

  if (loading) {
    return (
      <Box sx={GRID} aria-hidden>
        {WORK_STAGES.map((stage) => (
          <Skeleton key={stage} variant="rounded" height={72} sx={{ borderRadius: 2 }} />
        ))}
      </Box>
    );
  }

  return (
    <Box sx={GRID} role="group" aria-label="Filter papers by what they still need">
      {WORK_STAGES.map((stage) => {
        const { palette, icon } = WORK_STAGE_LOOK[stage];
        const main = theme.palette[palette].main;
        const active = selected === stage;
        const count = counts[stage];
        return (
          <CardActionArea
            key={stage}
            onClick={() => onSelect(active ? null : stage)}
            aria-pressed={active}
            aria-label={`${WORK_STAGE_LABELS[stage]}: ${count} paper${count === 1 ? '' : 's'}`}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              justifyContent: 'center',
              textAlign: 'left',
              gap: 0.25,
              minHeight: 72,
              px: 1.5,
              py: 1,
              borderRadius: 2,
              border: '1px solid',
              borderColor: active ? main : 'divider',
              bgcolor: active ? alpha(main, 0.1) : 'background.paper',
              transition: theme.transitions.create(['border-color', 'background-color'], { duration: 150 }),
              '&:hover': { borderColor: main },
              '&.Mui-focusVisible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
              '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: stageTextColor(theme, stage) }}>
              <Box component="span" sx={{ display: 'flex', '& svg': { fontSize: 18 } }}>
                {icon}
              </Box>
              <Typography variant="h6" component="span" sx={{ fontWeight: 700, lineHeight: 1, color: 'text.primary' }}>
                {count}
              </Typography>
            </Box>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', lineHeight: 1.3 }}>
              {WORK_STAGE_LABELS[stage]}
            </Typography>
          </CardActionArea>
        );
      })}
    </Box>
  );
}
