'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Skeleton,
  alpha,
  useTheme,
  Button,
  Tooltip,
} from '@neram/ui';
import DownloadIcon from '@mui/icons-material/Download';

interface ChapterStudentScore {
  student_id: string;
  student_name: string;
  student_email: string;
  sections: Array<{
    section_id: string;
    section_title: string;
    sort_order: number;
    score_pct: number | null;
    passed: boolean;
    attempt_count: number;
    watched_seconds: number;
    watch_completion_pct: number;
    seek_count: number;
  }>;
  overall_score_pct: number;
  completed_sections: number;
  total_sections: number;
  total_watch_seconds: number;
}

interface StudentScoresTableProps {
  chapterId: string;
  chapterNumber?: number;
  getToken: () => Promise<string | null>;
}

function formatWatchTime(seconds: number): string {
  if (seconds <= 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

function getWatchColor(completionPct: number, theme: any): string {
  if (completionPct >= 80) return theme.palette.success.main;
  if (completionPct >= 40) return theme.palette.warning.main;
  if (completionPct > 0) return theme.palette.error.main;
  return theme.palette.text.disabled;
}

function ScoreCell({ score, passed }: { score: number | null; passed: boolean }) {
  const theme = useTheme();
  if (score === null) {
    return (
      <Box sx={{ textAlign: 'center', color: 'text.disabled', fontSize: '0.75rem' }}>
        —
      </Box>
    );
  }

  const color = passed
    ? score >= 80 ? theme.palette.success.main : theme.palette.success.light
    : score >= 50 ? theme.palette.warning.main : theme.palette.error.main;

  return (
    <Box
      sx={{
        textAlign: 'center',
        fontWeight: 600,
        fontSize: '0.8rem',
        color,
        bgcolor: alpha(color, 0.08),
        borderRadius: 1,
        py: 0.5,
        px: 1,
        minWidth: 48,
      }}
    >
      {Math.round(score)}%
    </Box>
  );
}

function WatchDot({ watchedSeconds, completionPct, seekCount }: {
  watchedSeconds: number;
  completionPct: number;
  seekCount: number;
}) {
  const theme = useTheme();
  const color = getWatchColor(completionPct, theme);
  const tooltip = watchedSeconds > 0
    ? `Watched ${formatWatchTime(watchedSeconds)} (${Math.round(completionPct)}%)${seekCount > 0 ? ` · ${seekCount} seeks` : ''}`
    : 'Not watched';

  return (
    <Tooltip title={tooltip} arrow>
      <Box
        sx={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          bgcolor: color,
          mx: 'auto',
          mt: 0.5,
          cursor: 'help',
        }}
      />
    </Tooltip>
  );
}

export default function StudentScoresTable({
  chapterId,
  chapterNumber,
  getToken,
}: StudentScoresTableProps) {
  const theme = useTheme();
  const [scores, setScores] = useState<ChapterStudentScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchScores = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/foundation/chapters/${chapterId}/student-scores`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setScores(await res.json());
      } else {
        const errData = await res.json().catch(() => ({ error: 'Failed to load scores' }));
        setError(errData.error);
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [chapterId, getToken]);

  useEffect(() => {
    fetchScores();
  }, [fetchScores]);

  const exportCsv = useCallback(() => {
    if (!scores.length) return;
    const sectionHeaders: string[] = [];
    scores[0].sections.forEach((s, i) => {
      const label = chapterNumber != null
        ? `${chapterNumber}${String.fromCharCode(65 + i)}`
        : s.section_title;
      sectionHeaders.push(`${label} Score`);
      sectionHeaders.push(`${label} Watch Time`);
      sectionHeaders.push(`${label} Watch %`);
      sectionHeaders.push(`${label} Seeks`);
    });
    const header = ['Student Name', 'Email', ...sectionHeaders, 'Overall %', 'Sections Passed', 'Total Watch Time'].join(',');
    const rows = scores.map(s => [
      `"${s.student_name}"`,
      s.student_email,
      ...s.sections.flatMap(sec => [
        sec.score_pct !== null ? `${Math.round(sec.score_pct)}%` : '',
        formatWatchTime(sec.watched_seconds),
        `${Math.round(sec.watch_completion_pct)}%`,
        `${sec.seek_count}`,
      ]),
      `${s.overall_score_pct}%`,
      `${s.completed_sections}/${s.total_sections}`,
      formatWatchTime(s.total_watch_seconds),
    ].join(','));

    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chapter-${chapterNumber ?? chapterId}-scores.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [scores, chapterId, chapterNumber]);

  if (loading) {
    return (
      <Box sx={{ p: 2 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} variant="rectangular" height={48} sx={{ borderRadius: 1, mb: 0.5 }} />
        ))}
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="body2" color="error">{error}</Typography>
        <Button size="small" onClick={fetchScores} sx={{ mt: 1 }}>Retry</Button>
      </Box>
    );
  }

  if (!scores.length) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          No students have started this chapter yet.
        </Typography>
      </Box>
    );
  }

  const sectionCount = scores[0]?.sections.length ?? 0;

  return (
    <Box>
      {/* Header with export */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, px: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          Student Scores ({scores.length} students)
        </Typography>
        <Tooltip title="Export to CSV">
          <Button
            size="small"
            startIcon={<DownloadIcon />}
            onClick={exportCsv}
            sx={{ textTransform: 'none', fontSize: '0.8rem' }}
          >
            Export
          </Button>
        </Tooltip>
      </Box>

      {/* Legend */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1, px: 1 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem' }}>
          Watch:
        </Typography>
        {[
          { color: theme.palette.success.main, label: '80%+' },
          { color: theme.palette.warning.main, label: '40-80%' },
          { color: theme.palette.error.main, label: '<40%' },
        ].map(({ color, label }) => (
          <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color }} />
            <Typography variant="caption" sx={{ fontSize: '0.6rem', color: 'text.secondary' }}>
              {label}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* Scrollable table */}
      <Box sx={{ overflowX: 'auto', borderRadius: 2, border: `1px solid ${theme.palette.divider}` }}>
        <Box
          component="table"
          sx={{
            width: '100%',
            borderCollapse: 'collapse',
            minWidth: 400 + sectionCount * 72,
            '& th, & td': {
              px: 1.5,
              py: 1,
              fontSize: '0.8rem',
              borderBottom: `1px solid ${theme.palette.divider}`,
              whiteSpace: 'nowrap',
            },
            '& th': {
              bgcolor: alpha(theme.palette.primary.main, 0.04),
              fontWeight: 700,
              fontSize: '0.7rem',
              color: 'text.secondary',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              position: 'sticky',
              top: 0,
              zIndex: 1,
            },
            '& tr:last-child td': { borderBottom: 'none' },
            '& tr:hover td': { bgcolor: alpha(theme.palette.action.hover, 0.04) },
          }}
        >
          <thead>
            <tr>
              <Box component="th" sx={{ position: 'sticky', left: 0, bgcolor: `${alpha(theme.palette.primary.main, 0.04)} !important`, zIndex: 2 }}>
                Student
              </Box>
              {scores[0].sections.map((sec, i) => (
                <th key={sec.section_id}>
                  {chapterNumber != null ? `${chapterNumber}${String.fromCharCode(65 + i)}` : sec.section_title}
                </th>
              ))}
              <th>Overall</th>
              <th>Progress</th>
              <th>Watch</th>
            </tr>
          </thead>
          <tbody>
            {scores.map((student) => (
              <tr key={student.student_id}>
                <Box
                  component="td"
                  sx={{
                    position: 'sticky',
                    left: 0,
                    bgcolor: 'background.paper',
                    zIndex: 1,
                    fontWeight: 500,
                    maxWidth: 200,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.8rem' }} noWrap>
                    {student.student_name}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem' }} noWrap>
                    {student.student_email}
                  </Typography>
                </Box>
                {student.sections.map((sec) => (
                  <td key={sec.section_id}>
                    <ScoreCell score={sec.score_pct} passed={sec.passed} />
                    <WatchDot
                      watchedSeconds={sec.watched_seconds}
                      completionPct={sec.watch_completion_pct}
                      seekCount={sec.seek_count}
                    />
                  </td>
                ))}
                <td>
                  <ScoreCell score={student.overall_score_pct} passed={student.completed_sections === student.total_sections} />
                </td>
                <td>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                    {student.completed_sections}/{student.total_sections}
                  </Typography>
                </td>
                <td>
                  <Tooltip title={`Total watch time: ${formatWatchTime(student.total_watch_seconds)}`}>
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 600,
                        fontSize: '0.75rem',
                        color: student.total_watch_seconds > 0 ? 'text.primary' : 'text.disabled',
                        cursor: 'help',
                      }}
                    >
                      {formatWatchTime(student.total_watch_seconds)}
                    </Typography>
                  </Tooltip>
                </td>
              </tr>
            ))}
          </tbody>
        </Box>
      </Box>
    </Box>
  );
}
