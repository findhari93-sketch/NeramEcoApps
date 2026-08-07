'use client';

/**
 * The teacher's side of an open chapter.
 *
 * Everything here was already reachable, from the grid card's menu, which meant
 * closing the document first. Worse, none of it answered the question a teacher
 * actually opens a chapter with: does this chapter work, and is anyone getting
 * through it. On production every one of the twelve chapters had been opened by
 * students and not one had ever been completed, and nothing on any screen said
 * why.
 *
 * Nothing is fetched until the tab that needs it is opened, and nothing is
 * fetched twice. Most opens are reading, and a reader should not pay for a
 * cohort report.
 *
 * The actions do not own their dialogs. Every button calls back up to the page,
 * which already holds the test sheet, the recordings board, the link dialog and
 * the download grant, so this rail adds a way in rather than a second copy.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box, Typography, Button, Chip, Skeleton, Alert, Divider, alpha, useTheme,
} from '@neram/ui';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import StudentAvatar from '@/components/students/StudentAvatar';
import StudyCommentPanel from '@/components/study-materials/StudyCommentPanel';
import { ChapterStatusChip, WatchHonesty, type ChapterStatus } from '@/components/study-materials/chapter-status';
import {
  chapterReadiness,
  summariseWatchLanguages,
  type PlacedChapterTest,
  type ReadinessLine,
  type ReadinessState,
  type WorkspaceFile,
  type WorkspaceTrack,
} from '@/lib/chapter-workspace';

export type WorkspaceTab = 'setup' | 'students' | 'comments';

/** What the page does when a line's button is pressed. The page owns the dialogs. */
export interface ChapterManageActions {
  /** No test yet: build or link one. */
  onTest: () => void;
  /**
   * A test is already here: open it where everything about it lives, rather
   * than offering a third place to edit questions. That page carries the
   * question editor, the JSON download, publish, and where it came from.
   */
  onOpenTest: (testId: string) => void;
  /** Every video on this chapter, per language. Also where an old link is moved. */
  onRecordings: () => void;
  /** Time-limited download grants. */
  onDownloadAccess: () => void;
  /** The full completion page, with filters, sorting and Message. */
  onOpenReport: () => void;
}

interface ReportRow {
  student_id: string;
  name: string | null;
  avatar_url: string | null;
  status: ChapterStatus;
  best_score_pct: number | null;
  video_language?: string | null;
  watched_seconds?: number;
  blocked_seeks?: number;
  checkpoint_attempts?: number;
}

interface ReportBody {
  rows: ReportRow[];
  stats: {
    total: number;
    completed: number;
    video_pending: number;
    test_pending: number;
    studying: number;
    not_opened: number;
    avg_score: number | null;
  };
}

interface Props {
  fileId: string;
  file: WorkspaceFile;
  classroomId: string | null;
  getToken: () => Promise<string | null>;
  tab: WorkspaceTab;
  actions: ChapterManageActions;
  /** Bumped by the page after a dialog saves, so the rail re-reads. */
  refreshKey?: number;
}

const STATE_ICON: Record<ReadinessState, typeof CheckCircleRoundedIcon> = {
  ready: CheckCircleRoundedIcon,
  attention: ReportProblemOutlinedIcon,
  missing: ErrorOutlineRoundedIcon,
  info: InfoOutlinedIcon,
};

/**
 * Colour is never the only signal: each state also carries its own icon, so the
 * checklist still reads for anyone who cannot tell the amber from the green.
 */
function stateColour(state: ReadinessState, optional: boolean): string {
  if (state === 'ready') return 'success.main';
  if (state === 'attention') return 'warning.main';
  if (state === 'missing') return optional ? 'text.secondary' : 'error.main';
  return 'text.secondary';
}

function ReadinessRow({ line, onAction }: { line: ReadinessLine; onAction: () => void }) {
  const Icon = STATE_ICON[line.state];
  const label =
    line.key === 'test'
      ? 'Test'
      : line.key === 'recordings'
        ? 'Recordings'
        : line.key === 'quick_link'
          ? // The only thing left to do with an old link is move it, so the
            // button says that rather than offering to edit it.
            'Move it'
          : 'Access';
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25, py: 1 }}>
      <Icon sx={{ fontSize: 20, mt: '2px', color: stateColour(line.state, line.optional), flexShrink: 0 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          {line.title}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {line.detail}
        </Typography>
      </Box>
      <Button
        size="small"
        variant={line.state === 'missing' && !line.optional ? 'contained' : 'outlined'}
        onClick={onAction}
        sx={{ textTransform: 'none', flexShrink: 0, minHeight: 40, alignSelf: 'center' }}
      >
        {label}
      </Button>
    </Box>
  );
}

export default function ChapterWorkspaceRail({
  fileId,
  file,
  classroomId,
  getToken,
  tab,
  actions,
  refreshKey = 0,
}: Props) {
  const theme = useTheme();

  const [tracks, setTracks] = useState<WorkspaceTrack[] | null>(null);
  const [placedTest, setPlacedTest] = useState<PlacedChapterTest | null>(null);
  const [report, setReport] = useState<ReportBody | null>(null);
  const [error, setError] = useState('');

  // Which (fileId, refreshKey) each panel has already loaded, so switching tabs
  // back and forth does not refetch and a save does.
  const loaded = useRef<{ tracks: string; report: string }>({ tracks: '', report: '' });
  const stamp = `${fileId}:${refreshKey}`;

  const loadTracks = useCallback(async () => {
    if (loaded.current.tracks === stamp) return;
    loaded.current.tracks = stamp;
    try {
      const t = await getToken();
      const res = await fetch(`/api/study-materials/files/${fileId}/video-tracks`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'Could not read the recordings.');
      setTracks(body.tracks || []);
    } catch (e: any) {
      // A chapter must still open. The checklist degrades to "none added",
      // which is wrong but harmless, rather than taking the panel down.
      setTracks([]);
      setError(e?.message || 'Could not read the recordings.');
    }

    // The placed test, for the numbers on the Test line and the way through to
    // it. Metadata only on the staff branch, so this is not the paper.
    try {
      const t = await getToken();
      const res = await fetch(`/api/study-materials/files/${fileId}/test`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) setPlacedTest((await res.json())?.test ?? null);
    } catch {
      // Falls back to file.has_test, which is enough to avoid saying "no test"
      // about a chapter that has one.
      setPlacedTest(null);
    }
  }, [fileId, getToken, stamp]);

  const loadReport = useCallback(async () => {
    if (loaded.current.report === stamp) return;
    loaded.current.report = stamp;
    try {
      const t = await getToken();
      // Classroom is optional on this endpoint, and omitting it reports across
      // every cohort, which is the right default for Foundation chapters: they
      // are standard for all of them.
      const qs = classroomId ? `?classroom=${encodeURIComponent(classroomId)}` : '';
      const res = await fetch(`/api/study-materials/reports/chapter/${fileId}${qs}`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'Could not read the report.');
      setReport(body);
    } catch (e: any) {
      setError(e?.message || 'Could not read the report.');
    }
  }, [fileId, classroomId, getToken, stamp]);

  // Reset when the chapter changes, so the previous chapter's numbers never
  // flash under the new chapter's title.
  useEffect(() => {
    setTracks(null);
    setPlacedTest(null);
    setReport(null);
    setError('');
    loaded.current = { tracks: '', report: '' };
  }, [fileId, refreshKey]);

  useEffect(() => {
    if (tab === 'setup') loadTracks();
    if (tab === 'students') {
      loadTracks();
      loadReport();
    }
  }, [tab, loadTracks, loadReport]);

  if (tab === 'comments') {
    return <StudyCommentPanel fileId={fileId} getToken={getToken} />;
  }

  // ── Setup ────────────────────────────────────────────────────────────────
  if (tab === 'setup') {
    if (tracks === null) {
      return (
        <Box sx={{ p: 2 }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rounded" height={56} sx={{ mb: 1 }} />
          ))}
        </Box>
      );
    }

    const lines = chapterReadiness(file, tracks, placedTest);
    const action: Record<ReadinessLine['key'], () => void> = {
      // With a paper already here, Test opens it where the question editor,
      // the JSON download and its provenance already live. Offering a second
      // authoring surface from the chapter is how there came to be four.
      test: placedTest ? () => actions.onOpenTest(placedTest.test_id) : actions.onTest,
      recordings: actions.onRecordings,
      // The old ungated link is cleared by moving it into a recording, so its
      // line leads to the same dialog rather than to an editor for a feature
      // that no longer exists.
      quick_link: actions.onRecordings,
      download: actions.onDownloadAccess,
    };

    return (
      <Box sx={{ p: 2, overflowY: 'auto' }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          A student finishes a chapter by watching one recording, if there is one, and then
          passing the test.
        </Typography>
        {error && (
          <Alert severity="warning" sx={{ mb: 1.5 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}
        <Divider />
        {lines.map((line) => (
          <Box key={line.key}>
            <ReadinessRow line={line} onAction={action[line.key]} />
            <Divider />
          </Box>
        ))}
      </Box>
    );
  }

  // ── Students ─────────────────────────────────────────────────────────────
  if (report === null) {
    return (
      <Box sx={{ p: 2 }}>
        <Skeleton variant="rounded" height={72} sx={{ mb: 1.5 }} />
        <Skeleton variant="rounded" height={32} sx={{ mb: 1.5 }} />
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} variant="rounded" height={52} sx={{ mb: 1 }} />
        ))}
      </Box>
    );
  }

  const watch = summariseWatchLanguages(report.rows, tracks || []);
  const tiles = [
    { label: 'Completed', value: report.stats.completed, color: theme.palette.success.main },
    { label: 'Needs the test', value: report.stats.test_pending, color: theme.palette.warning.main },
    { label: 'Studying', value: report.stats.studying, color: theme.palette.info.main },
    { label: 'Not opened', value: report.stats.not_opened, color: theme.palette.text.secondary },
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      <Box sx={{ p: 2, pb: 1, flexShrink: 0 }}>
        {error && (
          <Alert severity="warning" sx={{ mb: 1.5 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1, mb: 1.5 }}>
          {tiles.map((t) => (
            <Box
              key={t.label}
              sx={{ p: 1, borderRadius: 2, border: `1px solid ${theme.palette.divider}` }}
            >
              <Typography variant="h6" fontWeight={800} sx={{ color: t.color, lineHeight: 1.2 }}>
                {t.value}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                {t.label}
              </Typography>
            </Box>
          ))}
        </Box>

        {/* The line the report has always had the data for and never drawn. */}
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
          Watched in
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
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
        </Box>
      </Box>

      <Divider />

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 2, py: 1 }}>
        {report.rows.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
            No students are enrolled in this classroom yet.
          </Typography>
        ) : (
          report.rows.map((r) => (
            <Box
              key={r.student_id}
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 1,
                py: 1,
                borderBottom: `1px solid ${alpha(theme.palette.divider, 0.6)}`,
              }}
            >
              <StudentAvatar userId={r.student_id} src={r.avatar_url} name={r.name} size={32} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" fontWeight={600} noWrap>
                  {r.name || 'Student'}
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap', mt: 0.25 }}>
                  <ChapterStatusChip status={r.status} />
                  {r.best_score_pct != null && (
                    <Typography variant="caption" color="text.secondary">
                      {Math.round(r.best_score_pct)}%
                    </Typography>
                  )}
                  {r.video_language && (
                    <Chip
                      size="small"
                      variant="outlined"
                      color="success"
                      label={
                        watch.languages.find((l) => l.code === r.video_language)?.label ||
                        r.video_language
                      }
                    />
                  )}
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
            </Box>
          ))
        )}
      </Box>

      <Box sx={{ p: 1.5, flexShrink: 0, borderTop: `1px solid ${theme.palette.divider}` }}>
        {/* Filtering, sorting, multi-select and Message stay on the full page.
            Rebuilding them in a 360px rail would be a second implementation of
            a screen that already works. */}
        <Button
          fullWidth
          variant="outlined"
          endIcon={<OpenInNewRoundedIcon />}
          onClick={actions.onOpenReport}
          sx={{ textTransform: 'none', minHeight: 48 }}
        >
          Open the full report
        </Button>
      </Box>
    </Box>
  );
}
