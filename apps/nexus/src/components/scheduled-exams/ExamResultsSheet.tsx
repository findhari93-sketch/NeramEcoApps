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
import StudentAvatar from '@/components/students/StudentAvatar';

/**
 * A teacher's results screen for one exam: two sittings, ranked separately.
 *
 * Replaces the old publish dialog, which showed counts, a podium of three
 * and the Teams preview, and never the roster. A teacher could not see who
 * scored what anywhere in Nexus. Four stat cards filter one ranked list:
 * exam day, second sitting, still to sit, absent. The cards ARE the filter,
 * matching the Forms-style convention used across Nexus: one tab level,
 * never tabs inside tabs.
 *
 * A channel post is irreversible in practice: it reaches every student and
 * often a parent, and deleting it does not unsee it. So the preview is not a
 * nicety, it is the safety mechanism, and it renders the REAL card rather than
 * a description of one.
 *
 * The privacy rule is stated on screen rather than assumed: the channel gets a
 * summary and the top three; everyone's own marks go to them privately.
 *
 * The channel hears about an exam once. A republish exists to add the second
 * sitting, and that sitting is deliberately never announced, so once the exam
 * has been announced the whole Teams half of the sheet disappears.
 */

interface PreviewSection {
  id: string;
  heading?: { emoji: string; text: string };
  toggleable: boolean;
  checkboxLabel?: string;
}

interface ResultRow {
  student_id: string;
  student_name: string;
  avatar_url: string | null;
  bucket: 'exam_day' | 'second_sitting' | 'still_to_sit' | 'absent';
  sitting: 'main' | 'second' | null;
  rank: number | null;
  sitting_size: number;
  window_closes_at?: string | null;
  score: number;
  total_marks: number;
  percentage: number;
  provisional: boolean;
}

interface PreviewData {
  exam: { id: string; title: string | null; results_state: string };
  results: {
    stats: { roster: number; sat: number; absent: number; still_to_sit: number; average: number; highest: number };
    second: { sat: number; average: number; highest: number; lowest: number; passed: number } | null;
    podium: Array<{ student_name: string; percentage: number; rank: number | null }>;
    drawings_ungraded: number;
    rows: ResultRow[];
  };
  sections: PreviewSection[];
  provisional: boolean;
  blockers: string[];
  warnings: string[];
  preview: { text: string; html: string };
  last_published_at: string | null;
}

const BUCKETS = [
  { id: 'exam_day', label: 'Exam day' },
  { id: 'second_sitting', label: 'Second sitting' },
  { id: 'still_to_sit', label: 'Still to sit' },
  { id: 'absent', label: 'Absent' },
] as const;

type BucketId = (typeof BUCKETS)[number]['id'];

export default function ExamResultsSheet({
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
  const [bucket, setBucket] = useState<BucketId>('exam_day');
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
        setPostToTeams(!json.data.last_published_at);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not build the preview');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // authFetch is deliberately not a dependency: it is a fresh closure
    // whenever getToken's identity changes, and loading should be keyed on
    // the sheet opening or the exam changing, never on that churn. Depending
    // on it re-fires this effect every render (an RTL test double for
    // useNexusAuthContext that returns a new getToken each call turns that
    // into a livelock, since setEnabled(new Set(...)) always produces a
    // referentially new value).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, examId]);

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

  const counts = (id: BucketId) => (data?.results.rows ?? []).filter((r) => r.bucket === id).length;
  const shown = (data?.results.rows ?? []).filter((r) => r.bucket === bucket);

  const examDay = counts('exam_day');
  const secondSitting = counts('second_sitting');
  const publishedBefore = Boolean(data?.last_published_at);
  const cta = !publishedBefore
    ? examDay > 0 || secondSitting > 0
      ? `Publish exam day results (${examDay})`
      : null
    : secondSitting > 0
      ? `Publish ${secondSitting} second sitting result${secondSitting === 1 ? '' : 's'}`
      : null;

  return (
    <Dialog open={open} onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 700 }}>
        Results
        {data?.exam.title && (
          <Typography
            variant="body2"
            component="span"
            color="text.secondary"
            sx={{ display: 'block', fontWeight: 400 }}
          >
            {data.exam.title}
          </Typography>
        )}
      </DialogTitle>

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

            <Box
              sx={{
                display: 'flex',
                gap: 1,
                overflowX: 'auto',
                pb: 0.5,
                // The row scrolls inside itself so four cards never push the sheet sideways.
                '&::-webkit-scrollbar': { display: 'none' },
                scrollbarWidth: 'none',
              }}
            >
              {BUCKETS.map((b) => {
                const selected = bucket === b.id;
                return (
                  <Paper
                    key={b.id}
                    component="button"
                    type="button"
                    elevation={0}
                    data-testid={`bucket-${b.id}`}
                    aria-pressed={selected}
                    onClick={() => setBucket(b.id)}
                    sx={{
                      flex: '0 0 auto',
                      minWidth: 92,
                      minHeight: 64,
                      px: 1.5,
                      py: 1,
                      cursor: 'pointer',
                      textAlign: 'left',
                      borderRadius: 2,
                      border: 1,
                      borderColor: selected ? 'primary.main' : 'divider',
                      bgcolor: selected ? 'action.selected' : 'background.paper',
                      font: 'inherit',
                      color: 'inherit',
                    }}
                  >
                    <Typography variant="h6" component="div" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                      {counts(b.id)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {b.label}
                    </Typography>
                  </Paper>
                );
              })}
            </Box>

            <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0 }}>
              {shown.map((r) => (
                <Box
                  key={r.student_id}
                  component="li"
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    minHeight: 48,
                    py: 1,
                    borderBottom: 1,
                    borderColor: 'divider',
                  }}
                >
                  <Typography variant="body2" sx={{ width: 28, fontWeight: 700, color: 'text.secondary' }}>
                    {r.rank ?? ''}
                  </Typography>
                  <StudentAvatar userId={r.student_id} src={r.avatar_url} name={r.student_name} size={32} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2">{r.student_name}</Typography>
                    {r.window_closes_at && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        Open until{' '}
                        {new Date(r.window_closes_at).toLocaleDateString('en-IN', {
                          timeZone: 'Asia/Kolkata',
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                        })}
                      </Typography>
                    )}
                  </Box>
                  {r.rank != null && (
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {Math.round(r.percentage)}%
                    </Typography>
                  )}
                </Box>
              ))}
              {shown.length === 0 && (
                <Typography variant="caption" color="text.secondary">
                  Nobody is in this group.
                </Typography>
              )}
            </Box>

            {!publishedBefore && (
              <>
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
              </>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        <Button onClick={onClose} sx={{ minHeight: 48 }}>
          {done ? 'Close' : 'Cancel'}
        </Button>
        {!done && cta && (
          <Button
            variant="contained"
            onClick={handlePublish}
            data-testid="exam-publish-cta"
            sx={{ minHeight: 48 }}
          >
            {publishing ? 'Publishing...' : cta}
          </Button>
        )}
        {!done && !cta && data?.last_published_at && (
          <Typography variant="caption" color="text.secondary">
            Results last went out on {new Date(data.last_published_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' })}.
          </Typography>
        )}
      </DialogActions>
    </Dialog>
  );
}
