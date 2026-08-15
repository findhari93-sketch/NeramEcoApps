'use client';

/**
 * The single implementation of "who's through this chapter and how."
 *
 * This used to exist twice: a compact 360px roster inside the chapter popup's
 * Students tab, and a full filterable table one navigation away at
 * `/completion/[fileId]`. The two read the same API and still managed to
 * disagree (one showed a "no test attached" warning the other never checked),
 * because there were two render paths for one fact. There is only one now,
 * used as the Students tab of the chapter workspace page at full width, where
 * a table this dense actually fits.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, Card, Button, IconButton, TextField, InputAdornment, Chip, Skeleton,
  Alert, Checkbox, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TableSortLabel,
  ToggleButton, ToggleButtonGroup, Paper, EmptyState, Dialog, alpha, useTheme, useMediaQuery,
} from '@neram/ui';
import StudentAvatar from '@/components/students/StudentAvatar';
import SearchIcon from '@mui/icons-material/Search';
import SendIcon from '@mui/icons-material/Send';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import StickyNote2OutlinedIcon from '@mui/icons-material/StickyNote2Outlined';
import CloseIcon from '@mui/icons-material/Close';
import StudyNudgeDialog from '@/components/study-materials/StudyNudgeDialog';
import PDFAnnotationsPanel from '@/components/study-materials/PDFAnnotationsPanel';
import StudentAttemptSheet from '@/components/study-materials/StudentAttemptSheet';
import { useFileAnnotations } from '@/hooks/useFileAnnotations';
import {
  ChapterStatusChip,
  WatchHonesty,
  type ChapterStatus,
} from '@/components/study-materials/chapter-status';
import { summariseWatchLanguages, type WorkspaceTrack } from '@/lib/chapter-workspace';

type Status = ChapterStatus;

interface Row {
  student_id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  status: Status;
  active_seconds: number;
  best_score_pct: number | null;
  days_since_started: number | null;
  video_language?: string | null;
  watched_seconds?: number;
  blocked_seeks?: number;
  checkpoint_attempts?: number;
  annotation_count?: number;
}

interface CompletionData {
  file: { id: string; title: string; has_test?: boolean };
  requires_video?: boolean;
  students: Row[];
  stats: {
    total: number;
    completed: number;
    studying: number;
    not_opened: number;
    video_pending?: number;
    test_pending?: number;
    avg_score: number | null;
  };
}

// Sorted by how far along they are, so "sort by status" surfaces the students
// who need chasing rather than the ones who are finished.
const STATUS_ORDER: Record<Status, number> = {
  not_opened: 0,
  studying: 1,
  video_pending: 2,
  test_pending: 3,
  completed: 4,
};

function fmtTime(sec: number): string {
  if (!sec) return '-';
  const m = Math.round(sec / 60);
  if (m < 1) return '<1m';
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

type SortKey = 'name' | 'status' | 'score' | 'time' | 'days';

interface ChapterCompletionPanelProps {
  fileId: string;
  classroomId: string | null;
  getToken: () => Promise<string | null>;
}

export default function ChapterCompletionPanel({ fileId, classroomId, getToken }: ChapterCompletionPanelProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [data, setData] = useState<CompletionData | null>(null);
  const [tracks, setTracks] = useState<WorkspaceTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Status>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'status', dir: 'asc' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [nudgeOpen, setNudgeOpen] = useState(false);

  // A student's marks, read-only: this panel shows the roster, not the PDF
  // itself, so this is a list (PDFAnnotationsPanel), not a second reader.
  const [notesFor, setNotesFor] = useState<{ id: string; name: string | null } | null>(null);
  const notesHook = useFileAnnotations({
    fileId,
    getToken,
    enabled: !!notesFor,
    studentId: notesFor?.id,
  });

  // A student's full response sheet, opened from their score. Index into the
  // current filtered/sorted `rows`, so prev/next walks the same list the
  // teacher is looking at rather than the unfiltered roster.
  const [attemptSheetIndex, setAttemptSheetIndex] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!classroomId) return;
    setLoading(true);
    setError(null);
    try {
      const t = await getToken();
      const res = await fetch(
        `/api/study-materials/reports/chapter/${fileId}?classroom=${classroomId}`,
        { headers: { Authorization: `Bearer ${t}` } },
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Failed to load');
      setData({ ...body, students: body.rows || [] });

      // Labels only, and never allowed to fail the panel: without them the tally
      // falls back to bare codes, which is worse but still correct.
      try {
        const tr = await fetch(`/api/study-materials/files/${fileId}/video-tracks`, {
          headers: { Authorization: `Bearer ${t}` },
        });
        if (tr.ok) setTracks((await tr.json())?.tracks || []);
      } catch {
        setTracks([]);
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load completion');
    } finally {
      setLoading(false);
    }
  }, [fileId, classroomId, getToken]);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    let list = data?.students || [];
    if (statusFilter !== 'all') list = list.filter((s) => s.status === statusFilter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((s) => (s.name || '').toLowerCase().includes(q) || (s.email || '').toLowerCase().includes(q));
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      switch (sort.key) {
        case 'name': return dir * (a.name || '').localeCompare(b.name || '');
        case 'status': return dir * (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
        case 'score': return dir * ((a.best_score_pct ?? -1) - (b.best_score_pct ?? -1));
        case 'time': return dir * (a.active_seconds - b.active_seconds);
        case 'days': return dir * ((a.days_since_started ?? -1) - (b.days_since_started ?? -1));
        default: return 0;
      }
    });
  }, [data, statusFilter, search, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const allVisibleSelected = rows.length > 0 && rows.every((r) => selected.has(r.student_id));
  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) rows.forEach((r) => next.delete(r.student_id));
      else rows.forEach((r) => next.add(r.student_id));
      return next;
    });

  const selectedRecipients = (data?.students || [])
    .filter((s) => selected.has(s.student_id))
    .map((s) => ({ id: s.student_id, name: s.name }));

  const annotationChip = (r: Row) =>
    !!r.annotation_count && (
      <Chip
        size="small"
        variant="outlined"
        icon={<StickyNote2OutlinedIcon sx={{ fontSize: 14 }} />}
        label={`${r.annotation_count} mark${r.annotation_count === 1 ? '' : 's'}`}
        onClick={() => setNotesFor({ id: r.student_id, name: r.name })}
        sx={{ cursor: 'pointer' }}
      />
    );

  // Tappable once there is a real test to have answered, and a score to show
  // for it. Opens the full response sheet for that student, at their place in
  // whatever filter/sort is currently applied.
  const canOpenResponses = (r: Row) => !!data?.file.has_test && r.best_score_pct != null;
  const scoreLabel = (r: Row) => (r.best_score_pct != null ? `${Math.round(r.best_score_pct)}%` : '-');

  return (
    <Box sx={{ p: { xs: 1.5, sm: 2 }, maxWidth: 1100, mx: 'auto' }}>
      {data && !data.file.has_test && (
        <Alert severity="warning" icon={<ErrorOutlineIcon />} sx={{ mb: 2 }}>
          No test attached, students cannot complete this chapter until you add one.
        </Alert>
      )}

      {/* Stat tiles */}
      {loading ? (
        <Skeleton variant="rounded" height={72} sx={{ mb: 2 }} />
      ) : data ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, gap: 1, mb: 2 }}>
          {[
            { label: 'Completed', value: data.stats.completed, color: theme.palette.success.main },
            { label: 'Studying', value: data.stats.studying, color: theme.palette.warning.main },
            { label: 'Not opened', value: data.stats.not_opened, color: theme.palette.text.secondary },
            { label: 'Avg score', value: data.stats.avg_score != null ? `${data.stats.avg_score}%` : '-', color: theme.palette.primary.main },
          ].map((t) => (
            <Card key={t.label} elevation={0} sx={{ p: 1.5, border: `1px solid ${theme.palette.divider}`, borderRadius: 2 }}>
              <Typography variant="h5" fontWeight={800} sx={{ color: t.color }}>{t.value}</Typography>
              <Typography variant="caption" color="text.secondary">{t.label}</Typography>
            </Card>
          ))}
        </Box>
      ) : null}

      {/* Which language the cohort actually finished in. */}
      {data && data.students.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
            Watched in
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
            {(() => {
              const watch = summariseWatchLanguages(data.students, tracks);
              return (
                <>
                  {watch.languages.map((l) => (
                    <Chip
                      key={l.code}
                      size="small"
                      variant="outlined"
                      color={l.count > 0 ? 'success' : 'default'}
                      label={`${l.label} ${l.count}`}
                    />
                  ))}
                  <Chip size="small" variant="outlined" label={`not watched ${watch.notWatched}`} />
                </>
              );
            })()}
          </Box>
        </Box>
      )}

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Controls */}
      <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          size="small" placeholder="Search students..." value={search} onChange={(e) => setSearch(e.target.value)}
          sx={{ flex: 1, minWidth: 180 }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
        />
        <ToggleButtonGroup
          value={statusFilter} exclusive size="small" onChange={(_, v) => v && setStatusFilter(v)}
          sx={{ '& .MuiToggleButton-root': { textTransform: 'none', px: 1.25, minHeight: 40 } }}
        >
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="completed">Done</ToggleButton>
          <ToggleButton value="studying">Studying</ToggleButton>
          <ToggleButton value="not_opened">Not opened</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* Selection action bar */}
      {selected.size > 0 && (
        <Paper elevation={0} sx={{ p: 1, mb: 1.5, display: 'flex', alignItems: 'center', gap: 1, border: `1px solid ${theme.palette.primary.main}`, borderRadius: 2, bgcolor: alpha(theme.palette.primary.main, 0.06) }}>
          <Typography variant="body2" fontWeight={700} sx={{ flex: 1 }}>{selected.size} selected</Typography>
          <Button size="small" onClick={() => setSelected(new Set())} sx={{ textTransform: 'none' }}>Clear</Button>
          <Button size="small" variant="contained" startIcon={<SendIcon />} onClick={() => setNudgeOpen(true)} sx={{ textTransform: 'none' }}>
            Message
          </Button>
        </Paper>
      )}

      {/* List */}
      {loading ? (
        <Skeleton variant="rounded" height={300} />
      ) : rows.length === 0 ? (
        <EmptyState title="No students" description={search || statusFilter !== 'all' ? 'No students match this filter.' : 'No students in this classroom yet.'} />
      ) : isMobile ? (
        // Mobile cards
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {rows.map((r, i) => (
            <Card key={r.student_id} elevation={0} sx={{ p: 1.25, border: `1px solid ${theme.palette.divider}`, borderRadius: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              <Checkbox checked={selected.has(r.student_id)} onChange={() => toggleOne(r.student_id)} size="small" />
              <StudentAvatar userId={r.student_id} src={r.avatar_url} name={r.name} size={34} tapToView={false} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" fontWeight={700} noWrap>{r.name || 'Student'}</Typography>
                <Box sx={{ display: 'flex', gap: 0.75, mt: 0.25, alignItems: 'center', flexWrap: 'wrap' }}>
                  <ChapterStatusChip status={r.status} />
                  {r.best_score_pct != null && (
                    canOpenResponses(r) ? (
                      <Chip
                        size="small"
                        variant="outlined"
                        color="primary"
                        label={scoreLabel(r)}
                        onClick={() => setAttemptSheetIndex(i)}
                        sx={{ height: 20, fontSize: '0.68rem', cursor: 'pointer' }}
                      />
                    ) : (
                      <Typography variant="caption" color="text.secondary">{scoreLabel(r)}</Typography>
                    )
                  )}
                  {r.video_language && (
                    <Chip
                      size="small"
                      variant="outlined"
                      color="success"
                      label={tracks.find((t) => t.language === r.video_language)?.language_label || r.video_language}
                    />
                  )}
                  {annotationChip(r)}
                  <Typography variant="caption" color="text.secondary">· {fmtTime(r.active_seconds)}</Typography>
                </Box>
                {(r.watched_seconds || r.blocked_seeks || r.checkpoint_attempts) ? (
                  <Box sx={{ mt: 0.5 }}>
                    <WatchHonesty
                      watchedSeconds={r.watched_seconds || 0}
                      blockedSeeks={r.blocked_seeks || 0}
                      attempts={r.checkpoint_attempts || 0}
                    />
                  </Box>
                ) : null}
              </Box>
            </Card>
          ))}
        </Box>
      ) : (
        // Desktop table
        <TableContainer component={Paper} elevation={0} sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox size="small" checked={allVisibleSelected} indeterminate={!allVisibleSelected && rows.some((r) => selected.has(r.student_id))} onChange={toggleAll} />
                </TableCell>
                <TableCell><TableSortLabel active={sort.key === 'name'} direction={sort.dir} onClick={() => toggleSort('name')}>Student</TableSortLabel></TableCell>
                <TableCell><TableSortLabel active={sort.key === 'status'} direction={sort.dir} onClick={() => toggleSort('status')}>Status</TableSortLabel></TableCell>
                <TableCell>Watched</TableCell>
                <TableCell align="right"><TableSortLabel active={sort.key === 'score'} direction={sort.dir} onClick={() => toggleSort('score')}>Score</TableSortLabel></TableCell>
                <TableCell align="right"><TableSortLabel active={sort.key === 'time'} direction={sort.dir} onClick={() => toggleSort('time')}>Time</TableSortLabel></TableCell>
                <TableCell align="right"><TableSortLabel active={sort.key === 'days'} direction={sort.dir} onClick={() => toggleSort('days')}>Days</TableSortLabel></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={r.student_id} hover selected={selected.has(r.student_id)}>
                  <TableCell padding="checkbox">
                    <Checkbox size="small" checked={selected.has(r.student_id)} onChange={() => toggleOne(r.student_id)} />
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <StudentAvatar userId={r.student_id} src={r.avatar_url} name={r.name} size={30} tapToView={false} />
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={600} noWrap>{r.name || 'Student'}</Typography>
                        {r.email && <Typography variant="caption" color="text.secondary" noWrap>{r.email}</Typography>}
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell><ChapterStatusChip status={r.status} /></TableCell>
                  <TableCell>
                    {r.video_language ? (
                      <Chip
                        size="small"
                        variant="outlined"
                        color="success"
                        label={tracks.find((t) => t.language === r.video_language)?.language_label || r.video_language}
                      />
                    ) : (
                      <Typography variant="caption" color="text.secondary">-</Typography>
                    )}
                    {annotationChip(r) && <Box sx={{ mt: 0.5 }}>{annotationChip(r)}</Box>}
                    {(r.watched_seconds || r.blocked_seeks || r.checkpoint_attempts) ? (
                      <Box sx={{ mt: 0.5 }}>
                        <WatchHonesty
                          watchedSeconds={r.watched_seconds || 0}
                          blockedSeeks={r.blocked_seeks || 0}
                          attempts={r.checkpoint_attempts || 0}
                        />
                      </Box>
                    ) : null}
                  </TableCell>
                  <TableCell align="right">
                    {r.best_score_pct != null && canOpenResponses(r) ? (
                      <Chip
                        size="small"
                        variant="outlined"
                        color="primary"
                        label={scoreLabel(r)}
                        onClick={() => setAttemptSheetIndex(i)}
                        sx={{ cursor: 'pointer' }}
                      />
                    ) : (
                      scoreLabel(r)
                    )}
                  </TableCell>
                  <TableCell align="right">{fmtTime(r.active_seconds)}</TableCell>
                  <TableCell align="right">{r.days_since_started != null ? r.days_since_started : '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {data && (
        <StudyNudgeDialog
          open={nudgeOpen}
          fileId={data.file.id}
          fileTitle={data.file.title}
          recipients={selectedRecipients}
          getToken={getToken}
          onClose={() => setNudgeOpen(false)}
        />
      )}

      {/* A student's marks, read-only. */}
      <Dialog
        open={!!notesFor}
        onClose={() => setNotesFor(null)}
        fullScreen={isMobile}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { height: isMobile ? '100%' : 480, borderRadius: isMobile ? 0 : 2 } }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1.25, borderBottom: `1px solid ${theme.palette.divider}` }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1 }} noWrap>
              {notesFor?.name || 'Student'}'s marks on this chapter
            </Typography>
            <IconButton size="small" onClick={() => setNotesFor(null)} aria-label="Close" sx={{ width: 40, height: 40 }}>
              <CloseIcon />
            </IconButton>
          </Box>
          <PDFAnnotationsPanel
            annotations={notesHook.annotations}
            loading={notesHook.loading}
            readOnly
            onJumpToPage={() => {}}
          />
        </Box>
      </Dialog>

      {/* A student's full response sheet: every attempt, question by question. */}
      <StudentAttemptSheet
        open={attemptSheetIndex != null}
        fileId={fileId}
        student={
          attemptSheetIndex != null && rows[attemptSheetIndex]
            ? {
                id: rows[attemptSheetIndex].student_id,
                name: rows[attemptSheetIndex].name,
                avatar_url: rows[attemptSheetIndex].avatar_url,
              }
            : null
        }
        getToken={getToken}
        onClose={() => setAttemptSheetIndex(null)}
        onPrev={() => setAttemptSheetIndex((i) => (i != null && i > 0 ? i - 1 : i))}
        onNext={() => setAttemptSheetIndex((i) => (i != null && i < rows.length - 1 ? i + 1 : i))}
        hasPrev={attemptSheetIndex != null && attemptSheetIndex > 0}
        hasNext={attemptSheetIndex != null && attemptSheetIndex < rows.length - 1}
      />
    </Box>
  );
}
