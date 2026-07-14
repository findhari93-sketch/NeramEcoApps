'use client';

import { Box, Typography, Button, Stack, Chip, Divider, CircularProgress } from '@neram/ui';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';

export interface DedupeCandidate {
  id: string;
  question_text: string | null;
  options?: unknown;
  similarity: number;
  used_in_tests: number;
  verdict?: 'likely_duplicate' | 'near_identical' | 'similar';
}

interface DedupeWarningProps {
  candidates: DedupeCandidate[];
  loading?: boolean;
  /** Add the existing question to the current test instead of creating a new one. */
  onUseExisting: (candidate: DedupeCandidate) => void;
  /** Dismiss the warning and keep the new (duplicate) question. */
  onAddAnyway: () => void;
}

const VERDICT_LABEL: Record<string, string> = {
  likely_duplicate: 'Very likely duplicate',
  near_identical: 'Near-identical',
  similar: 'Similar',
};

/**
 * Surfaces near-duplicate questions found in the bank before a teacher adds a new one.
 * Presentational only, the parent decides what "use existing" / "add anyway" do.
 */
export default function DedupeWarning({ candidates, loading, onUseExisting, onAddAnyway }: DedupeWarningProps) {
  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          p: 1.5,
          borderRadius: 2,
          bgcolor: 'action.hover',
        }}
      >
        <CircularProgress size={16} />
        <Typography variant="body2" color="text.secondary">
          Checking for duplicates.
        </Typography>
      </Box>
    );
  }

  if (!candidates || candidates.length === 0) return null;

  const topVerdict = candidates[0]?.verdict === 'likely_duplicate';

  return (
    <Box
      sx={{
        borderRadius: 2,
        border: 1,
        borderColor: topVerdict ? 'warning.main' : 'warning.light',
        bgcolor: 'rgba(255, 167, 38, 0.10)',
        p: 1.5,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <ReportProblemOutlinedIcon color="warning" fontSize="small" />
        <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1 }}>
          {candidates.length} similar question{candidates.length > 1 ? 's' : ''} already in the bank
        </Typography>
      </Box>

      <Stack spacing={1} divider={<Divider flexItem />}>
        {candidates.map((c) => (
          <Box key={c.id} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                variant="body2"
                sx={{
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {c.question_text || '(image-based question)'}
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 0.5 }}>
                <Chip
                  size="small"
                  label={`${VERDICT_LABEL[c.verdict || 'similar']} · ${Math.round(c.similarity * 100)}%`}
                  color={c.verdict === 'likely_duplicate' ? 'warning' : 'default'}
                  sx={{ height: 22 }}
                />
                {c.used_in_tests > 0 && (
                  <Chip size="small" variant="outlined" label={`Used in ${c.used_in_tests} test${c.used_in_tests > 1 ? 's' : ''}`} sx={{ height: 22 }} />
                )}
              </Box>
            </Box>
            <Button
              size="small"
              variant="outlined"
              onClick={() => onUseExisting(c)}
              sx={{ textTransform: 'none', flexShrink: 0, minHeight: 36 }}
            >
              Use this
            </Button>
          </Box>
        ))}
      </Stack>

      <Box sx={{ mt: 1.5, textAlign: 'right' }}>
        <Button size="small" onClick={onAddAnyway} sx={{ textTransform: 'none' }}>
          Not a duplicate, add anyway
        </Button>
      </Box>
    </Box>
  );
}
