'use client';

import { Box, Typography, Tooltip } from '@neram/ui';
import { QB_QUESTION_STATUS_COLORS } from '@neram/database';

interface PaperProgressBarProps {
  total: number;
  draft: number;
  answerKeyed: number;
  complete: number;
  active: number;
  showLabels?: boolean;
}

export default function PaperProgressBar({
  total,
  draft,
  answerKeyed,
  complete,
  active,
  showLabels = false,
}: PaperProgressBarProps) {
  if (total === 0) return null;

  const segments = [
    { count: active, color: QB_QUESTION_STATUS_COLORS.active, label: 'Active' },
    { count: complete, color: QB_QUESTION_STATUS_COLORS.complete, label: 'Complete' },
    { count: answerKeyed, color: QB_QUESTION_STATUS_COLORS.answer_keyed, label: 'Answer Keyed' },
    { count: draft, color: QB_QUESTION_STATUS_COLORS.draft, label: 'Draft' },
  ].filter((s) => s.count > 0);

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          height: 8,
          borderRadius: 4,
          overflow: 'hidden',
          bgcolor: 'grey.200',
        }}
      >
        {segments.map((seg) => (
          <Tooltip key={seg.label} title={`${seg.label}: ${seg.count}/${total}`} arrow>
            <Box
              sx={{
                width: `${(seg.count / total) * 100}%`,
                bgcolor: seg.color,
                transition: 'width 0.3s ease',
              }}
            />
          </Tooltip>
        ))}
      </Box>
      {showLabels && (
        <Box sx={{ display: 'flex', gap: 1.5, mt: 0.5, flexWrap: 'wrap' }}>
          {segments.map((seg) => (
            <Box key={seg.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  bgcolor: seg.color,
                }}
              />
              <Typography variant="caption" color="text.secondary">
                {seg.label}: {seg.count}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
