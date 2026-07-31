'use client';

/**
 * Who sat this test, and which questions are not doing their job.
 *
 * Two halves that answer two different questions. The student table answers
 * "who needs help". The question table answers "is this paper any good", which
 * is the loop that keeps a growing bank trustworthy: a question almost nobody
 * gets right is usually ambiguous rather than hard, and without surfacing it
 * nobody ever finds it again.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Chip,
  Skeleton,
  Alert,
  Divider,
  TextField,
  LinearProgress,
  ToggleButton,
  ToggleButtonGroup,
  InputAdornment,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';

interface ResultRow {
  student_id: string;
  student_name: string | null;
  attempts: number;
  best_percentage: number | null;
  last_percentage: number | null;
  last_submitted_at: string | null;
  passed: boolean | null;
}

interface QuestionRow {
  question_id: string;
  question_text: string | null;
  sort_order: number;
  answered: number;
  correct: number;
  correct_pct: number | null;
  top_wrong_option: { key: string; text: string | null; count: number } | null;
  needs_review: boolean;
}

interface Stats {
  students: number;
  attempts: number;
  average: number | null;
  passed: number;
}

function formatWhen(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, flex: 1, minWidth: 120 }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
        {label}
      </Typography>
      <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
        {value}
      </Typography>
      {hint && (
        <Typography variant="caption" color="text.secondary">
          {hint}
        </Typography>
      )}
    </Paper>
  );
}

export default function TestResultsPanel({
  testId,
  authFetch,
}: {
  testId: string;
  authFetch: (url: string, init?: RequestInit) => Promise<any>;
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [view, setView] = useState<'students' | 'questions'>('students');
  const [rows, setRows] = useState<ResultRow[] | null>(null);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const json = await authFetch(`/api/question-bank/tests/${testId}/results`);
      setRows(json.data?.rows || []);
      setQuestions(json.data?.questions || []);
      setStats(json.data?.stats || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load results');
      setRows([]);
    }
  }, [authFetch, testId]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = (rows || []).filter((r) =>
    !search.trim() ? true : (r.student_name || '').toLowerCase().includes(search.trim().toLowerCase()),
  );

  function exportCsv() {
    const header = ['Student', 'Attempts', 'Best %', 'Latest %', 'Passed', 'Last attempt'];
    const lines = [header.join(',')];
    for (const r of rows || []) {
      lines.push(
        [
          `"${(r.student_name || 'Unknown').replace(/"/g, '""')}"`,
          r.attempts,
          r.best_percentage ?? '',
          r.last_percentage ?? '',
          r.passed == null ? '' : r.passed ? 'yes' : 'no',
          r.last_submitted_at ?? '',
        ].join(','),
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `test-results-${testId.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (rows === null) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} variant="rectangular" height={64} sx={{ borderRadius: 1.5 }} />
        ))}
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" action={<Button onClick={load}>Retry</Button>}>
        {error}
      </Alert>
    );
  }

  if (stats && stats.attempts === 0) {
    return (
      <Paper variant="outlined" sx={{ py: 6, px: 3, textAlign: 'center', borderRadius: 2 }}>
        <GroupsOutlinedIcon sx={{ fontSize: 44, color: 'text.disabled', mb: 1 }} />
        <Typography variant="body2" color="text.secondary">
          Nobody has sat this test yet. Results appear here as soon as they do.
        </Typography>
      </Paper>
    );
  }

  const flagged = questions.filter((q) => q.needs_review);

  return (
    <Box>
      {stats && (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
          <StatTile label="STUDENTS" value={String(stats.students)} />
          <StatTile label="ATTEMPTS" value={String(stats.attempts)} hint="retakes included" />
          <StatTile label="AVERAGE" value={stats.average == null ? '-' : `${stats.average}%`} hint="best score each" />
          <StatTile label="PASSED" value={String(stats.passed)} />
        </Box>
      )}

      {flagged.length > 0 && view === 'students' && (
        <Alert
          severity="warning"
          icon={<WarningAmberOutlinedIcon />}
          sx={{ mb: 2 }}
          action={
            <Button size="small" onClick={() => setView('questions')} sx={{ textTransform: 'none' }}>
              Show me
            </Button>
          }
        >
          {flagged.length} question{flagged.length !== 1 ? 's' : ''} almost nobody got right. Worth a read before
          you blame the class.
        </Alert>
      )}

      <ToggleButtonGroup
        size="small"
        exclusive
        value={view}
        onChange={(_, v) => v && setView(v)}
        sx={{ mb: 2, flexWrap: 'wrap' }}
      >
        <ToggleButton value="students" sx={{ textTransform: 'none', px: 2, minHeight: 40 }}>
          Students
        </ToggleButton>
        <ToggleButton value="questions" sx={{ textTransform: 'none', px: 2, minHeight: 40 }}>
          Question analysis
        </ToggleButton>
      </ToggleButtonGroup>

      {view === 'students' ? (
        <>
          <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
            <TextField
              size="small"
              placeholder="Search students"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ flex: 1, minWidth: 180 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchOutlinedIcon sx={{ fontSize: 18 }} />
                  </InputAdornment>
                ),
              }}
            />
            <Button
              variant="outlined"
              startIcon={<DownloadOutlinedIcon />}
              onClick={exportCsv}
              sx={{ textTransform: 'none', minHeight: 44 }}
            >
              CSV
            </Button>
          </Box>

          <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
            {filtered.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
                No student matches that search.
              </Typography>
            ) : (
              filtered.map((r, i) => (
                <Box key={r.student_id}>
                  {i > 0 && <Divider />}
                  <Box sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                    <Box sx={{ flex: 1, minWidth: 140 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                        {r.student_name || 'Unknown student'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {r.attempts} attempt{r.attempts !== 1 ? 's' : ''}
                        {r.last_submitted_at ? ` · last ${formatWhen(r.last_submitted_at)}` : ''}
                      </Typography>
                    </Box>
                    {!isMobile && r.best_percentage != null && (
                      <Box sx={{ width: 120 }}>
                        <LinearProgress
                          variant="determinate"
                          value={Math.min(100, r.best_percentage)}
                          color={r.passed === false ? 'warning' : 'success'}
                          sx={{ height: 6, borderRadius: 3 }}
                        />
                      </Box>
                    )}
                    <Chip
                      size="small"
                      label={r.best_percentage == null ? '-' : `${Math.round(r.best_percentage)}%`}
                      color={r.passed === true ? 'success' : r.passed === false ? 'default' : 'primary'}
                      sx={{ height: 26, fontWeight: 700, minWidth: 56 }}
                    />
                  </Box>
                </Box>
              ))
            )}
          </Paper>
        </>
      ) : (
        <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
          {questions.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
              No answers recorded yet.
            </Typography>
          ) : (
            questions.map((q, i) => (
              <Box key={q.question_id}>
                {i > 0 && <Divider />}
                <Box sx={{ p: 1.75, bgcolor: q.needs_review ? 'warning.light' : 'transparent' }}>
                  <Box sx={{ display: 'flex', gap: 1, mb: 0.75 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', minWidth: 20 }}>
                      {i + 1}
                    </Typography>
                    <Typography variant="body2" sx={{ flex: 1, fontWeight: 500 }}>
                      {q.question_text || 'Question'}
                    </Typography>
                    <Chip
                      size="small"
                      label={q.correct_pct == null ? 'No data' : `${q.correct_pct}%`}
                      color={
                        q.correct_pct == null
                          ? 'default'
                          : q.correct_pct >= 70
                            ? 'success'
                            : q.correct_pct >= 40
                              ? 'warning'
                              : 'error'
                      }
                      sx={{ height: 24, fontWeight: 700, flexShrink: 0 }}
                    />
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {q.correct} of {q.answered} got it right
                    {q.top_wrong_option
                      ? ` · most picked "${q.top_wrong_option.text || q.top_wrong_option.key}" (${q.top_wrong_option.count})`
                      : ''}
                  </Typography>
                  {q.needs_review && (
                    <Typography variant="caption" sx={{ display: 'block', mt: 0.5, fontWeight: 700 }}>
                      Check this question. At this rate it is more likely unclear than hard.
                    </Typography>
                  )}
                </Box>
              </Box>
            ))
          )}
        </Paper>
      )}
    </Box>
  );
}
