'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Paper,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

/**
 * Publish an exam's results, after showing exactly what will be sent.
 *
 * A channel post is irreversible in practice: it reaches every student and
 * often a parent, and deleting it does not unsee it. So the preview is not a
 * nicety, it is the safety mechanism, and it renders the REAL card rather than
 * a description of one.
 *
 * The privacy rule is stated on screen rather than assumed: the channel gets a
 * summary and the top three; everyone's own marks go to them privately.
 */

interface PreviewSection {
  id: string;
  heading?: { emoji: string; text: string };
  toggleable: boolean;
  checkboxLabel?: string;
}

interface PreviewData {
  exam: { id: string; title: string | null; results_state: string };
  results: {
    stats: { roster: number; sat: number; absent: number; average: number; highest: number };
    podium: Array<{ student_name: string; percentage: number; rank: number | null }>;
    drawings_ungraded: number;
  };
  sections: PreviewSection[];
  provisional: boolean;
  blockers: string[];
  warnings: string[];
  preview: { text: string; html: string };
}

export default function PublishExamResultsDialog({
  open,
  onClose,
  examId,
  onPublished,
}: {
  open: boolean;
  onClose: () => void;
  examId: string;
  onPublished?: () => void;
}) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const { getToken } = useNexusAuthContext();

  const [data, setData] = useState<PreviewData | null>(null);
  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const [postToTeams, setPostToTeams] = useState(true);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const authFetch = useCallback(
    async (url: string, init?: RequestInit) => {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      const res = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
          ...(init?.headers || {}),
        },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Request failed');
      return json;
    },
    [getToken],
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setDone(null);
    (async () => {
      try {
        const json = await authFetch(`/api/exams/${examId}/publish`);
        if (cancelled) return;
        setData(json.data);
        setEnabled(
          new Set<string>(
            (json.data.sections as PreviewSection[]).filter((s) => s.toggleable).map((s) => s.id),
          ),
        );
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not build the preview');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, examId, authFetch]);

  const handlePublish = async () => {
    setPublishing(true);
    setError(null);
    try {
      // The bearer token authFetch already sends IS the delegated Microsoft
      // token the server needs to post a chatMessage, exactly as the class
      // share dialog works. Nothing extra to attach.
      const published = await authFetch(`/api/exams/${examId}/publish`, {
        method: 'POST',
        body: JSON.stringify({ sections: [...enabled], post_to_teams: postToTeams }),
      });

      // Personal messages are a separate call on purpose: thirty personalised
      // nudges plus a Graph post will not fit one function budget, and a
      // timeout there must not cost the teacher the announcement.
      const notified = await authFetch(`/api/exams/${examId}/notify`, {
        method: 'POST',
        body: JSON.stringify({}),
      }).catch(() => ({ data: { notified: 0 } }));

      setDone(
        `Published to ${published.data.students} students. ${notified.data?.notified ?? 0} told privately.` +
          (published.data.teams_error ? ` Teams post failed: ${published.data.teams_error}` : ''),
      );
      onPublished?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not publish');
    } finally {
      setPublishing(false);
    }
  };

  const toggle = (id: string) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Dialog open={open} onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 700 }}>Publish results</DialogTitle>

      <DialogContent dividers>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
            <CircularProgress size={28} />
          </Box>
        ) : !data ? (
          <Alert severity="error" role="alert">
            {error || 'Could not build the preview'}
          </Alert>
        ) : done ? (
          <Alert severity="success">{done}</Alert>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {error && (
              <Alert severity="error" role="alert" onClose={() => setError(null)}>
                {error}
              </Alert>
            )}
            {data.blockers.map((b) => (
              <Alert key={b} severity="error" role="alert">
                {b}
              </Alert>
            ))}
            {data.warnings.map((w) => (
              <Alert key={w} severity="warning">
                {w}
              </Alert>
            ))}

            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                {data.results.stats.sat} of {data.results.stats.roster} sat it
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Average {Math.round(data.results.stats.average)}%, highest{' '}
                {Math.round(data.results.stats.highest)}%
                {data.results.stats.absent > 0 ? `, ${data.results.stats.absent} absent` : ''}
              </Typography>
            </Box>

            <Divider />

            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                What goes in the channel
              </Typography>
              {data.sections
                .filter((s) => s.toggleable)
                .map((s) => (
                  <FormControlLabel
                    key={s.id}
                    control={
                      <Checkbox
                        checked={enabled.has(s.id)}
                        onChange={() => toggle(s.id)}
                        sx={{ p: 1.25 }}
                      />
                    }
                    label={s.checkboxLabel || s.heading?.text || s.id}
                    sx={{ display: 'flex', minHeight: 48, m: 0 }}
                  />
                ))}
            </Box>

            {/* The real card, not a description of one. */}
            <Paper
              variant="outlined"
              sx={{ p: 2, borderRadius: 2, bgcolor: 'background.default', overflowX: 'auto' }}
            >
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block', mb: 1, fontWeight: 700 }}
              >
                Preview
              </Typography>
              <Box
                component="pre"
                sx={{
                  m: 0,
                  fontFamily: 'inherit',
                  fontSize: '0.8125rem',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  lineHeight: 1.6,
                }}
              >
                {data.preview.text}
              </Box>
            </Paper>

            <FormControlLabel
              control={
                <Checkbox
                  checked={postToTeams}
                  onChange={(e) => setPostToTeams(e.target.checked)}
                  sx={{ p: 1.25 }}
                />
              }
              label="Post this to the classroom's Teams channel"
              sx={{ display: 'flex', minHeight: 48, m: 0 }}
            />

            <Alert severity="info" icon={false}>
              <Typography variant="caption">
                Only the summary and the top three are named in the channel. Every student gets
                their own rank and marks privately, through their notifications.
              </Typography>
            </Alert>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        <Button onClick={onClose} sx={{ minHeight: 48 }}>
          {done ? 'Close' : 'Cancel'}
        </Button>
        {!done && (
          <Button
            variant="contained"
            onClick={handlePublish}
            disabled={publishing || loading || (data?.blockers.length ?? 0) > 0}
            sx={{ minHeight: 48 }}
          >
            {publishing
              ? 'Publishing...'
              : data?.provisional
                ? 'Publish provisional results'
                : 'Publish results'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
