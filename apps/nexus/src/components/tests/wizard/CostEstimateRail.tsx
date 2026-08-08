'use client';

import { Alert, Box, Button, Paper, Skeleton, Typography } from '@neram/ui';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import { formatInr, formatSeconds } from '@/lib/ai-question-cost';

export interface CostEstimateState {
  costInr: number | null;
  seconds: number;
  model: string;
  allowed: boolean;
  message: string;
}

/**
 * What the next Generate press will cost.
 *
 * This is the rail that makes a teacher trust the inbuilt route over pasting
 * into ChatGPT: the number is on screen before the money is spent, and the
 * escape hatch is named right underneath it rather than buried in docs.
 *
 * The figure is computed from the live pricing table, never hardcoded. It says
 * "est." because it is one, and it is recalibrated from real usage rows.
 */
export default function CostEstimateRail({
  estimate,
  loading,
  unavailable,
  onCopySpec,
  copied,
}: {
  estimate: CostEstimateState | null;
  loading: boolean;
  /**
   * The quote could not be fetched. Distinct from `loading`, and the distinction
   * matters: without it a failed estimate shows a skeleton that never resolves,
   * which reads as a hung screen rather than as a missing number.
   */
  unavailable?: boolean;
  onCopySpec: () => void;
  copied: boolean;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
      <Typography
        variant="caption"
        sx={{ fontWeight: 700, letterSpacing: 1, color: 'text.secondary', display: 'block', mb: 1.5 }}
      >
        COST &amp; TIME
      </Typography>

      {unavailable && !loading ? (
        <Typography variant="body2" color="text.secondary">
          The cost could not be checked just now. Generating still works, and the budget is enforced on
          the server either way.
        </Typography>
      ) : loading || !estimate ? (
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Skeleton variant="rounded" width={90} height={48} />
          <Skeleton variant="rounded" width={90} height={48} />
        </Box>
      ) : (
        <Box sx={{ display: 'flex', gap: 3 }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              {formatInr(estimate.costInr)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              est. Gemini cost
            </Typography>
          </Box>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              {formatSeconds(estimate.seconds)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              to first draft
            </Typography>
          </Box>
        </Box>
      )}

      {estimate && !estimate.allowed && (
        // Said BEFORE the button is pressed. Meeting the cap as an error after
        // a 25-second wait is the same information delivered at the worst moment.
        <Alert severity="warning" sx={{ mt: 1.5 }}>
          {estimate.message}
        </Alert>
      )}

      <Box sx={{ borderTop: '1px solid', borderColor: 'divider', mt: 2, pt: 1.5 }}>
        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
          Prefer an external tool? Generate there and come back with <b>Upload JSON</b>. Either way the
          JSON is stored with the test, so you can re-edit it later.
        </Typography>
        <Button
          size="small"
          onClick={onCopySpec}
          startIcon={<ContentCopyOutlinedIcon sx={{ fontSize: 16 }} />}
          sx={{ textTransform: 'none', mt: 1, minHeight: 44 }}
        >
          {copied ? 'Format spec copied' : 'Copy JSON format spec'}
        </Button>
      </Box>
    </Paper>
  );
}
