'use client';

import { Box, MenuItem, Paper, Select, Typography } from '@neram/ui';
import { QB_SECTIONS, qbSectionLabel, type QBQuestionSection } from '@neram/database';
import MathText from '@/components/common/MathText';

export interface CollisionCandidate {
  id: string;
  question_text: string | null;
  question_format: string;
  current_section: string;
  suggested_section: QBQuestionSection | null;
}

export interface CollisionReviewGroupProps {
  section: string;
  display_order: number;
  candidates: CollisionCandidate[];
  /** question id -> chosen section. A candidate absent here shows no selection. */
  selections: Record<string, QBQuestionSection>;
  onSelect: (candidateId: string, section: QBQuestionSection) => void;
}

/**
 * One collision: N questions on one paper that all claim the same section and
 * number. Each candidate gets its own Select, defaulted by the caller to its
 * suggestion (or left blank when nothing could be suggested), so nothing is
 * ever silently kept or moved without a visible, overridable choice.
 */
export default function CollisionReviewGroup({
  section,
  display_order,
  candidates,
  selections,
  onSelect,
}: CollisionReviewGroupProps) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 1, borderRadius: 1.5 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
        {qbSectionLabel(section)} Q{display_order}
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {candidates.map((c) => (
          <Box
            key={c.id}
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              alignItems: { xs: 'stretch', sm: 'center' },
              gap: 1,
              p: 1,
              border: 1,
              borderColor: 'divider',
              borderRadius: 1,
            }}
          >
            <MathText
              text={c.question_text || '(no text)'}
              variant="body2"
              sx={{ flex: 1, minWidth: 0 }}
            />
            <Select
              size="small"
              displayEmpty
              value={selections[c.id] ?? ''}
              onChange={(e) => onSelect(c.id, e.target.value as QBQuestionSection)}
              SelectDisplayProps={{ 'aria-label': `Section for question ${c.id}` }}
              renderValue={(value) => (value ? qbSectionLabel(value as string) : <></>)}
              sx={{ minWidth: 160, minHeight: 44 }}
            >
              {QB_SECTIONS.map((s) => (
                <MenuItem key={s} value={s} sx={{ minHeight: 44 }}>
                  {qbSectionLabel(s)}
                </MenuItem>
              ))}
            </Select>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}
