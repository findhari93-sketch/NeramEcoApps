'use client';

import { Box, Typography, Paper, Chip } from '@neram/ui';
import type { NexusQBOriginalPaper } from '@neram/database';
import PaperProgressBar from './PaperProgressBar';

const STATUS_CONFIG: Record<string, { label: string; color: 'success' | 'info' | 'warning' | 'default' }> = {
  complete: { label: 'Complete', color: 'success' },
  answer_keyed: { label: 'Answer Keyed', color: 'info' },
  parsed: { label: 'Parsed', color: 'warning' },
  pending: { label: 'Pending', color: 'default' },
};

interface QBPaperCardProps {
  paper: NexusQBOriginalPaper;
  onClick: () => void;
}

export default function QBPaperCard({ paper, onClick }: QBPaperCardProps) {
  const total = paper.questions_parsed || 0;
  const keyed = paper.questions_answer_keyed || 0;
  const complete = paper.questions_complete || 0;
  const draft = Math.max(total - keyed, 0);
  const answerKeyedOnly = Math.max(keyed - complete, 0);

  const status = STATUS_CONFIG[paper.upload_status] || STATUS_CONFIG.pending;

  return (
    <Paper
      variant="outlined"
      onClick={onClick}
      sx={{
        p: 1.5,
        cursor: 'pointer',
        transition: 'all 0.15s',
        '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
        minHeight: 64,
      }}
    >
      {/* Row 1: Year + Session + Status */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
        <Typography variant="subtitle2" fontWeight={700}>
          {paper.year}
        </Typography>
        {paper.session && (
          <Chip label={paper.session} size="small" variant="outlined" sx={{ height: 22, fontSize: '0.75rem' }} />
        )}
        <Box sx={{ flex: 1 }} />
        <Chip
          label={status.label}
          size="small"
          color={status.color}
          sx={{ height: 22, fontSize: '0.7rem' }}
        />
      </Box>

      {/* Row 2: Progress bar */}
      {total > 0 && (
        <Box sx={{ mb: 0.5 }}>
          <PaperProgressBar
            total={total}
            draft={draft}
            answerKeyed={answerKeyedOnly}
            complete={complete}
            active={0}
          />
        </Box>
      )}

      {/* Row 3: Stats summary */}
      <Typography variant="caption" color="text.secondary">
        {total} total{keyed > 0 ? ` · ${keyed} with answers` : ''}{complete > 0 ? ` · ${complete} complete` : ''}
      </Typography>
    </Paper>
  );
}
