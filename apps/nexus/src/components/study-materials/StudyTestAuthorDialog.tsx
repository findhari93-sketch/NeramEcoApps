'use client';

/**
 * Link a test to a study chapter.
 *
 * This used to author questions in place: paste AI JSON, type them manually, or
 * pick from the bank, all saved into a chapter-only table with its own grader.
 * That is a large part of why the same question could exist in four shapes.
 *
 * Authoring now lives in the Tests module. This dialog only chooses which
 * library test gates this chapter, and at what pass mark. The file name is kept
 * so the page's existing wiring and deep link (?testFile=) keep working.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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
  Slider,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import LinkOffOutlinedIcon from '@mui/icons-material/LinkOffOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import TestBrowser, { type PickableTest } from '@/components/tests/TestBrowser';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

interface LinkedTest {
  placement_id: string;
  test_id: string;
  title: string;
  passing_pct: number;
  question_count: number;
  is_published: boolean;
}

interface StudyTestAuthorDialogProps {
  open: boolean;
  file: { id: string; title: string } | null;
  authFetch: (url: string, init?: RequestInit) => Promise<any>;
  onClose: () => void;
  onSaved: () => void;
}

export default function StudyTestAuthorDialog({
  open,
  file,
  authFetch,
  onClose,
  onSaved,
}: StudyTestAuthorDialogProps) {
  const theme = useTheme();
  const router = useRouter();
  const { getToken } = useNexusAuthContext();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

  const [linked, setLinked] = useState<LinkedTest | null>(null);
  const [picked, setPicked] = useState<PickableTest | null>(null);
  const [passingPct, setPassingPct] = useState(70);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !file?.id) return;
    setPicked(null);
    setError(null);
    setLoading(true);
    let cancelled = false;
    (async () => {
      try {
        const json = await authFetch(`/api/study-materials/files/${file.id}/test`);
        if (cancelled) return;
        const current = (json?.test as LinkedTest) || null;
        setLinked(current);
        setPassingPct(current?.passing_pct ?? 70);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the current test');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, file?.id, authFetch]);

  const questionCount = picked?.question_count ?? linked?.question_count ?? 0;
  const mustGetRight = questionCount > 0 ? Math.ceil((passingPct / 100) * questionCount) : 0;

  async function save() {
    const testId = picked?.id ?? linked?.test_id;
    if (!file?.id || !testId) return;
    setBusy(true);
    setError(null);
    try {
      await authFetch(`/api/study-materials/files/${file.id}/test`, {
        method: 'POST',
        body: JSON.stringify({ test_id: testId, passing_pct: passingPct }),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not link the test');
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    if (!file?.id) return;
    setBusy(true);
    setError(null);
    try {
      await authFetch(`/api/study-materials/files/${file.id}/test`, { method: 'DELETE' });
      setLinked(null);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not unlink the test');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" fullScreen={fullScreen}>
      <DialogTitle sx={{ pb: 0.5 }}>
        <Typography sx={{ fontWeight: 800, fontSize: '1.0625rem' }}>Test for this chapter</Typography>
        <Typography variant="caption" color="text.secondary">
          {file?.title || 'Chapter'}
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ pt: 1 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={22} />
          </Box>
        ) : (
          <>
            {linked && (
              <Box
                sx={{
                  p: 1.5,
                  mb: 2,
                  borderRadius: 1.5,
                  border: '1px solid',
                  borderColor: 'success.main',
                  bgcolor: 'action.hover',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <QuizOutlinedIcon sx={{ fontSize: 18, color: 'success.main' }} />
                  <Typography variant="body2" sx={{ fontWeight: 700, flex: 1, minWidth: 0 }}>
                    {linked.title}
                  </Typography>
                  <Chip
                    size="small"
                    label={`${linked.question_count} question${linked.question_count !== 1 ? 's' : ''}`}
                    sx={{ height: 22, fontSize: '0.7rem' }}
                  />
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  Currently linked. Pick another below to replace it.
                </Typography>
                {!linked.is_published && (
                  <Alert severity="warning" sx={{ mt: 1, py: 0 }}>
                    This test is still a draft, so students cannot see it. Publish it in Tests.
                  </Alert>
                )}
              </Box>
            )}

            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
              {linked ? 'Choose a different test' : 'Choose a test'}
            </Typography>

            <TestBrowser
              getToken={getToken}
              value={picked}
              onChange={setPicked}
              resetToken={open ? file?.id : null}
              maxListHeight={260}
              onBuildNew={() => router.push('/teacher/tests/new/import')}
            />

            <Divider sx={{ my: 2 }} />

            <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
              Pass mark
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Slider
                value={passingPct}
                onChange={(_e, v) => setPassingPct(v as number)}
                min={10}
                max={100}
                step={5}
                marks={[{ value: 50 }, { value: 70 }, { value: 90 }]}
                valueLabelDisplay="auto"
                sx={{ flex: 1 }}
                aria-label="Pass mark percentage"
              />
              <Typography sx={{ fontWeight: 800, minWidth: 52, textAlign: 'right' }}>{passingPct}%</Typography>
            </Box>
            {questionCount > 0 && (
              <Alert severity="info" icon={false} sx={{ mt: 1, py: 0.25 }}>
                <Typography variant="caption">
                  {questionCount} question{questionCount === 1 ? '' : 's'}, so a pass means getting{' '}
                  <strong>
                    {mustGetRight} of {questionCount}
                  </strong>{' '}
                  right. Passing marks the chapter complete.
                </Typography>
              </Alert>
            )}

            {!linked && !picked && (
              <Alert severity="info" icon={<AutoAwesomeOutlinedIcon />} sx={{ mt: 2 }}>
                Nothing suitable in the library? Import a test from this chapter PDF in Tests, then come back
                and link it here.
              </Alert>
            )}
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2, gap: 1, flexWrap: 'wrap' }}>
        {linked && (
          <Button
            color="error"
            startIcon={<LinkOffOutlinedIcon />}
            onClick={unlink}
            disabled={busy}
            sx={{ textTransform: 'none', minHeight: 44, mr: 'auto' }}
          >
            Unlink
          </Button>
        )}
        <Button onClick={onClose} sx={{ textTransform: 'none', minHeight: 44 }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={save}
          disabled={busy || (!picked && !linked)}
          sx={{ textTransform: 'none', minHeight: 44 }}
        >
          {busy ? <CircularProgress size={18} /> : picked ? 'Link this test' : 'Save pass mark'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
