'use client';

/**
 * The teacher's side of an open chapter: what's still missing to make it
 * completable (Setup), and the running conversation about it (Comments).
 *
 * "Who's getting through it" used to live here too, as a second, 360px-wide
 * implementation of the same report the full completion page already had at
 * full width — the two independently forgot to agree on whether a test was
 * attached. That roster is gone from this file; it lives once, in
 * ChapterCompletionPanel, as the Students tab of the chapter workspace page.
 *
 * Nothing is fetched until the tab that needs it is opened, and nothing is
 * fetched twice.
 *
 * The actions do not own their dialogs. Every button calls back up to the page,
 * which already holds the test sheet, the recordings board, and the download
 * grant, so this rail adds a way in rather than a second copy.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Typography, Button, Skeleton, Alert, Divider } from '@neram/ui';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import StudyCommentPanel from '@/components/study-materials/StudyCommentPanel';
import {
  chapterReadiness,
  type PlacedChapterTest,
  type ReadinessLine,
  type ReadinessState,
  type WorkspaceFile,
  type WorkspaceTrack,
} from '@/lib/chapter-workspace';

export type WorkspaceTab = 'setup' | 'comments';

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
}

interface Props {
  fileId: string;
  file: WorkspaceFile;
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
  getToken,
  tab,
  actions,
  refreshKey = 0,
}: Props) {
  const [tracks, setTracks] = useState<WorkspaceTrack[] | null>(null);
  const [placedTest, setPlacedTest] = useState<PlacedChapterTest | null>(null);
  const [error, setError] = useState('');

  // Which (fileId, refreshKey) tracks has already loaded, so switching tabs
  // back and forth does not refetch and a save does.
  const loaded = useRef<string>('');
  const stamp = `${fileId}:${refreshKey}`;

  const loadTracks = useCallback(async () => {
    if (loaded.current === stamp) return;
    loaded.current = stamp;
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

  // Reset when the chapter changes, so the previous chapter's numbers never
  // flash under the new chapter's title.
  useEffect(() => {
    setTracks(null);
    setPlacedTest(null);
    setError('');
    loaded.current = '';
  }, [fileId, refreshKey]);

  useEffect(() => {
    if (tab === 'setup') loadTracks();
  }, [tab, loadTracks]);

  if (tab === 'comments') {
    return <StudyCommentPanel fileId={fileId} getToken={getToken} />;
  }

  // ── Setup ────────────────────────────────────────────────────────────────
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
