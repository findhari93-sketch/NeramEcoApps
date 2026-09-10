'use client';

/**
 * "Sixteen people were marked on the old answer. Re-grade them?"
 *
 * Correcting a key fixes every future attempt on its own, because the grader
 * reads the answer live. It cannot fix the attempts already submitted, which
 * keep the score written at submit time. That gap used to be invisible, and it
 * showed up as a student's review screen disagreeing with the score on their
 * record.
 *
 * This is the only screen in Nexus that changes a score a student has already
 * been shown, so it is built to be read rather than clicked through: the preview
 * runs the real re-grade with dry_run, shows every mark that moves and which way,
 * and puts the two numbers that matter (who crosses the pass mark, in each
 * direction) above the fold. Applying is a second, deliberate press.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Paper,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import GradingOutlinedIcon from '@mui/icons-material/GradingOutlined';
import StudentAvatar from '@/components/students/StudentAvatar';

interface RegradeRow {
  attempt_id: string;
  student_id: string;
  student_name: string | null;
  attempt_number: number;
  old_percentage: number | null;
  new_percentage: number;
  old_passed: boolean | null;
  new_passed: boolean | null;
  changed: boolean;
}

interface RegradeSummary {
  attempts: number;
  changed: number;
  moved_up: number;
  moved_down: number;
  now_passing: number;
  now_failing: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  testId: string;
  placementId: string | null;
  authFetch: (url: string, init?: RequestInit) => Promise<any>;
  /** Fired after a real re-grade, with the students whose score moved. */
  onApplied: (movedStudentIds: string[]) => void;
}

function pct(v: number | null): string {
  return v == null ? '-' : `${Math.round(v)}%`;
}

export default function RegradePreviewDialog({
  open,
  onClose,
  testId,
  placementId,
  authFetch,
  onApplied,
}: Props) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<RegradeRow[]>([]);
  const [summary, setSummary] = useState<RegradeSummary | null>(null);

  const preview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await authFetch(`/api/question-bank/tests/${testId}/regrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placement_id: placementId, dry_run: true }),
      });
      setRows(json.data?.rows || []);
      setSummary(json.data?.summary || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not work out what would change');
    } finally {
      setLoading(false);
    }
  }, [authFetch, testId, placementId]);

  useEffect(() => {
    if (open) preview();
  }, [open, preview]);

  async function apply() {
    setApplying(true);
    setError(null);
    try {
      const json = await authFetch(`/api/question-bank/tests/${testId}/regrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placement_id: placementId, dry_run: false }),
      });
      const moved: string[] = (json.data?.rows || [])
        .filter((r: RegradeRow) => r.changed)
        .map((r: RegradeRow) => r.student_id);
      onApplied(moved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not apply the re-grade');
    } finally {
      setApplying(false);
    }
  }

  const changed = rows.filter((r) => r.changed);

  return (
    <Dialog
      open={open}
      onClose={applying ? undefined : onClose}
      fullScreen={fullScreen}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
        <GradingOutlinedIcon />
        <Typography component="span" sx={{ fontWeight: 700, flex: 1 }}>
          Re-grade with the corrected answer
        </Typography>
        <IconButton onClick={onClose} disabled={applying} aria-label="Close" sx={{ minWidth: 44, minHeight: 44 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ px: { xs: 1.5, sm: 3 } }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} action={<Button onClick={preview}>Retry</Button>}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Every paper already sat is marked again against the questions as they now stand. New
              attempts are already using the corrected answer, so this is only about the ones on
              record.
            </Typography>

            {summary && (
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                <Chip
                  label={`${summary.changed} of ${summary.attempts} change`}
                  color={summary.changed > 0 ? 'primary' : 'default'}
                  sx={{ fontWeight: 700 }}
                />
                {summary.now_passing > 0 && (
                  <Chip
                    color="success"
                    icon={<ArrowUpwardIcon sx={{ fontSize: 16 }} />}
                    label={`${summary.now_passing} now pass`}
                    sx={{ fontWeight: 700 }}
                  />
                )}
                {summary.now_failing > 0 && (
                  <Chip
                    color="warning"
                    icon={<ArrowDownwardIcon sx={{ fontSize: 16 }} />}
                    label={`${summary.now_failing} now fall below`}
                    sx={{ fontWeight: 700 }}
                  />
                )}
              </Box>
            )}

            {summary && summary.now_failing > 0 && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                {summary.now_failing} student{summary.now_failing === 1 ? '' : 's'} drop below the
                pass mark. They were told they passed. Tell them what changed, and why it was not
                their fault, on the next screen.
              </Alert>
            )}

            {changed.length === 0 ? (
              <Paper variant="outlined" sx={{ p: 3, textAlign: 'center', borderRadius: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Nothing moves. Every recorded score already matches the corrected answer, so there
                  is nothing to apply.
                </Typography>
              </Paper>
            ) : (
              <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
                {changed.map((r, i) => {
                  const up = r.new_percentage > (r.old_percentage ?? 0);
                  return (
                    <Box key={r.attempt_id}>
                      {i > 0 && <Divider />}
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          p: 1.5,
                          minHeight: 48,
                          flexWrap: 'wrap',
                        }}
                      >
                        {/* The face, with its cohort ring, in front of the name.
                            A teacher about to change somebody's recorded score
                            should recognise who, not read who. */}
                        <StudentAvatar
                          userId={r.student_id}
                          name={r.student_name}
                          size={28}
                        />
                        <Box sx={{ flex: 1, minWidth: 130 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                            {r.student_name || 'Unknown student'}
                          </Typography>
                          {r.attempt_number > 1 && (
                            <Typography variant="caption" color="text.secondary">
                              attempt {r.attempt_number}
                            </Typography>
                          )}
                        </Box>
                        <Typography
                          variant="body2"
                          sx={{ textDecoration: 'line-through', color: 'text.disabled' }}
                        >
                          {pct(r.old_percentage)}
                        </Typography>
                        {up ? (
                          <ArrowUpwardIcon sx={{ fontSize: 16, color: 'success.main' }} />
                        ) : (
                          <ArrowDownwardIcon sx={{ fontSize: 16, color: 'warning.main' }} />
                        )}
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 700, color: up ? 'success.dark' : 'warning.dark', minWidth: 44 }}
                        >
                          {pct(r.new_percentage)}
                        </Typography>
                        {r.old_passed !== r.new_passed && (
                          <Chip
                            size="small"
                            color={r.new_passed ? 'success' : 'warning'}
                            label={r.new_passed ? 'now passes' : 'now below'}
                            sx={{ height: 22, fontWeight: 700 }}
                          />
                        )}
                      </Box>
                    </Box>
                  );
                })}
              </Paper>
            )}
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ px: { xs: 1.5, sm: 3 }, py: 1.5, gap: 1 }}>
        <Button onClick={onClose} disabled={applying} sx={{ minHeight: 48 }}>
          Not now
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button
          variant="contained"
          onClick={apply}
          disabled={loading || applying || changed.length === 0}
          startIcon={applying ? <CircularProgress size={16} color="inherit" /> : <GradingOutlinedIcon />}
          sx={{ minHeight: 48, textTransform: 'none' }}
        >
          {applying
            ? 'Re-grading'
            : `Re-grade ${changed.length} attempt${changed.length === 1 ? '' : 's'}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
