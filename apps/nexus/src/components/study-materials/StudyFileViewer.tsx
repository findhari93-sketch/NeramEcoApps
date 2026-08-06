'use client';

/**
 * StudyFileViewer — the view-only file viewer with a Google Classroom style comments panel.
 * PDFs render in the in-app PDFReader (download/print toolbar hidden); images render as a contained
 * <img>. Desktop shows document + comments side by side; mobile uses a Document / Comments toggle.
 * Shared by the Study Materials browser and the Starred view.
 *
 * The chapter test does NOT open here. It used to: a Dialog holding every
 * question in one scroll, opened on top of this Dialog, with no timer, no
 * progress, no palette and no resume, and closing it threw the answers away.
 * Worse, it recorded a percentage and nothing else, while the app's real player
 * captures why each answer was wrong and why a paper was abandoned. Pressing
 * Take test now goes to that player and comes back here afterwards.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box, Typography, IconButton, Button, ToggleButton, ToggleButtonGroup, Dialog, Alert,
  alpha, useTheme, useMediaQuery,
} from '@neram/ui';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import CloseIcon from '@mui/icons-material/Close';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import PDFReader from '@/components/reader/PDFReader';
import ProtectedContent from '@/components/ProtectedContent';
import StudyCommentPanel from '@/components/study-materials/StudyCommentPanel';
import ChapterVideoPanel from '@/components/study-materials/ChapterVideoPanel';
import ChapterWorkspaceRail, {
  type ChapterManageActions,
  type WorkspaceTab,
} from '@/components/study-materials/ChapterWorkspaceRail';
import { useStudyTimeTracker } from '@/hooks/useStudyTimeTracker';
import { takeTestHref } from '@/lib/test-return';
import type { NexusStudyFileDTO } from '@neram/database/types';

/** Everything the teacher rail needs. Absent, this is the plain student viewer. */
export interface StudyFileManage {
  classroomId: string | null;
  actions: ChapterManageActions;
  /** Bumped by the page after a dialog saves, so the rail re-reads. */
  refreshKey?: number;
}

type ViewerTab = 'doc' | WorkspaceTab;

interface StudyFileViewerProps {
  file: NexusStudyFileDTO | null;
  token: string | null;
  getToken: () => Promise<string | null>;
  onClose: () => void;
  /**
   * When set (student viewers), a faint diagonal watermark of the student's identity is drawn over
   * PDF pages and images. Leave undefined for trusted viewers (teacher preview).
   */
  watermark?: string;
  /** Silently record the student's reading time on this file while the viewer is open. */
  track?: boolean;
  /**
   * Teacher mode. The comments panel becomes a three-tab rail (Setup, Students,
   * Comments) and, on mobile, the Document / Comments toggle grows to four.
   * Omitted by both student callers, which therefore behave exactly as before.
   */
  manage?: StudyFileManage;
}

/** A tiled, low-opacity diagonal watermark background (for images; PDFs bake it onto the canvas). */
function watermarkBackground(text: string): string {
  const safe = text.replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string)
  );
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='200'>` +
    `<text x='150' y='100' font-family='sans-serif' font-size='15' font-weight='600' ` +
    `fill='rgba(107,114,128,0.13)' text-anchor='middle' transform='rotate(-30 150 100)'>${safe}</text>` +
    `</svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

function Glyph({ kind, size = 22 }: { kind: string; size?: number }) {
  if (kind === 'pdf') return <PictureAsPdfOutlinedIcon sx={{ fontSize: size, color: '#d32f2f' }} />;
  if (kind === 'image') return <ImageOutlinedIcon sx={{ fontSize: size, color: '#1976d2' }} />;
  return <InsertDriveFileOutlinedIcon sx={{ fontSize: size, color: 'text.secondary' }} />;
}

export default function StudyFileViewer({ file, token, getToken, onClose, watermark, track, manage }: StudyFileViewerProps) {
  const theme = useTheme();
  const router = useRouter();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [tab, setTab] = useState<ViewerTab>('doc');
  const [startingTest, setStartingTest] = useState(false);
  const [testError, setTestError] = useState('');

  // Reset to the document tab whenever a new file opens. A teacher opening a
  // chapter is still reading it first; Setup is one tap away, not in the way.
  useEffect(() => { if (file) { setTab('doc'); setTestError(''); } }, [file]);

  /**
   * Which panel the side rail shows.
   *
   * On desktop the document is always on screen, so 'doc' is not a rail state:
   * it falls through to whatever that viewer's rail leads with. On mobile the
   * tabs are exclusive and 'doc' means the document fills the screen.
   */
  const railTab: WorkspaceTab = tab === 'doc' ? (manage ? 'setup' : 'comments') : tab;

  // Silently accrue reading time for the student while this file is open.
  useStudyTimeTracker({ fileId: track && file ? file.id : null, token, enabled: !!track });

  /**
   * Hand this chapter's test to the player.
   *
   * The placement is looked up on the press rather than when the chapter opens,
   * because most opens are reading rather than testing and this is a request a
   * reader should not pay for. The placement id matters: it carries the passing
   * mark and the side effect that marks the chapter complete, so a chapter test
   * opened without one grades against the test's own defaults and records
   * nothing against the chapter.
   *
   * The return path is read off window.location at click time rather than
   * through useSearchParams, so this component adds no Suspense requirement to
   * the two pages that mount it.
   */
  const startTest = useCallback(
    async (mode: 'official' | 'revision') => {
      if (!file || startingTest) return;
      setStartingTest(true);
      setTestError('');
      try {
        const t = await getToken();
        // meta=1: the two ids only. The unqualified call composes the whole
        // paper and fixes this sitting's draw, which is the player's job.
        const res = await fetch(`/api/study-materials/files/${file.id}/test?meta=1`, {
          headers: { Authorization: `Bearer ${t}` },
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error || 'Could not open the test.');

        if (body?.locked) {
          throw new Error('Watch one of the class recordings before taking the test.');
        }
        const testId = body?.test?.test_id || body?.test?.id;
        const placementId = body?.test?.placement_id;
        if (!testId) throw new Error('No test is attached to this chapter yet.');

        router.push(
          takeTestHref({
            testId,
            placementId,
            mode,
            returnTo: `${window.location.pathname}${window.location.search}`,
            returnLabel: 'Back to the chapter',
          }),
        );
      } catch (e: any) {
        setTestError(e?.message || 'Could not open the test.');
        setStartingTest(false);
      }
      // Deliberately not clearing `startingTest` on success: the push unmounts
      // this dialog, and re-enabling the button first lets a second press start
      // a second navigation.
    },
    [file, getToken, router, startingTest],
  );

  const contentUrl = (download = false) =>
    file
      ? `/api/study-materials/files/${file.id}/content?token=${encodeURIComponent(token || '')}${download ? '&download=1' : ''}`
      : '';

  return (
    <Dialog
      open={!!file}
      onClose={onClose}
      fullScreen={isMobile}
      maxWidth="lg"
      fullWidth
      PaperProps={{ sx: { height: isMobile ? '100%' : '92vh', borderRadius: isMobile ? 0 : 2 } }}
    >
      {file && (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Header */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1.25, borderBottom: `1px solid ${theme.palette.divider}`, flexShrink: 0 }}>
            <Glyph kind={file.kind} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1, minWidth: 0 }} noWrap>{file.title}</Typography>
            {file.downloadable && (
              <Button size="small" startIcon={<DownloadOutlinedIcon />} onClick={() => window.open(contentUrl(true), '_blank')}>
                Download
              </Button>
            )}
            <IconButton size="small" onClick={onClose} aria-label="Close" sx={{ width: 40, height: 40 }}>
              <CloseIcon />
            </IconButton>
          </Box>

          {/*
            Mobile tabs.

            Two for a student, unchanged. Four for a teacher, stacked icon over
            label so all four still clear 48px and read at 375px, where a single
            row of side-by-side icon-and-word buttons would not fit.
          */}
          {isMobile && (
            <ToggleButtonGroup
              value={tab}
              exclusive
              onChange={(_, v) => v && setTab(v)}
              fullWidth
              size="small"
              sx={{
                p: 1,
                flexShrink: 0,
                '& .MuiToggleButton-root': manage
                  ? { minHeight: 52, textTransform: 'none', flexDirection: 'column', gap: 0.25, fontSize: 10, px: 0.5 }
                  : { minHeight: 48, textTransform: 'none', gap: 0.5 },
              }}
            >
              <ToggleButton value="doc">
                {file.kind === 'pdf' ? <PictureAsPdfOutlinedIcon fontSize="small" /> : <ImageOutlinedIcon fontSize="small" />}
                {manage ? 'Doc' : 'Document'}
              </ToggleButton>
              {manage && (
                <ToggleButton value="setup">
                  <TuneRoundedIcon fontSize="small" /> Setup
                </ToggleButton>
              )}
              {manage && (
                <ToggleButton value="students">
                  <GroupsOutlinedIcon fontSize="small" /> Students
                </ToggleButton>
              )}
              <ToggleButton value="comments">
                <ChatBubbleOutlineIcon fontSize="small" /> Comments
              </ToggleButton>
            </ToggleButtonGroup>
          )}

          {/* Body */}
          <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
            {(!isMobile || tab === 'doc') && (
              <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', bgcolor: alpha(theme.palette.text.primary, 0.03) }}>
                {/* ProtectedContent blocks right-click, text selection, Ctrl+S/P and printing while viewing. */}
                <ProtectedContent disableScreenshot sx={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', width: '100%' }}>
                  {file.kind === 'pdf' ? (
                    <PDFReader pdfUrl={contentUrl()} watermark={watermark} />
                  ) : (
                    <Box
                      onContextMenu={(e) => e.preventDefault()}
                      sx={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={contentUrl()}
                        alt={file.title}
                        draggable={false}
                        onContextMenu={(e) => e.preventDefault()}
                        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', userSelect: 'none', pointerEvents: 'none' }}
                      />
                      {watermark && (
                        <Box
                          aria-hidden
                          sx={{
                            position: 'absolute',
                            inset: 0,
                            pointerEvents: 'none',
                            backgroundImage: watermarkBackground(watermark),
                            backgroundRepeat: 'repeat',
                          }}
                        />
                      )}
                    </Box>
                  )}
                </ProtectedContent>
              </Box>
            )}

            {(!isMobile || tab !== 'doc') && (
              <Box
                sx={{
                  width: isMobile ? '100%' : 360,
                  flexShrink: 0,
                  minHeight: 0,
                  borderLeft: isMobile ? 'none' : `1px solid ${theme.palette.divider}`,
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {/* Desktop keeps the document on screen, so the rail carries its
                    own tabs. On mobile the row above has already chosen. */}
                {manage && !isMobile && (
                  <ToggleButtonGroup
                    value={railTab}
                    exclusive
                    onChange={(_, v) => v && setTab(v)}
                    fullWidth
                    size="small"
                    sx={{
                      p: 1,
                      flexShrink: 0,
                      '& .MuiToggleButton-root': { minHeight: 40, textTransform: 'none', gap: 0.5, fontSize: 12 },
                    }}
                  >
                    <ToggleButton value="setup"><TuneRoundedIcon fontSize="small" /> Setup</ToggleButton>
                    <ToggleButton value="students"><GroupsOutlinedIcon fontSize="small" /> Students</ToggleButton>
                    <ToggleButton value="comments"><ChatBubbleOutlineIcon fontSize="small" /> Comments</ToggleButton>
                  </ToggleButtonGroup>
                )}

                {manage ? (
                  <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                    <ChapterWorkspaceRail
                      fileId={file.id}
                      file={file}
                      classroomId={manage.classroomId}
                      getToken={getToken}
                      tab={railTab}
                      actions={manage.actions}
                      refreshKey={manage.refreshKey}
                    />
                  </Box>
                ) : (
                  <StudyCommentPanel fileId={file.id} getToken={getToken} />
                )}
              </Box>
            )}
          </Box>

          {/*
            Student "next step" footer.
            The PDF stays readable from the moment the chapter opens; this is
            about finishing it. ChapterVideoPanel owns the whole rule now,
            because "watch one language, then pass the test" is one sentence and
            splitting it across a button here and a message there is how a
            student ends up thinking the test is broken.
          */}
          {track && (
            <Box sx={{ flexShrink: 0, borderTop: `1px solid ${theme.palette.divider}`, px: 2, py: 1.25, bgcolor: 'background.paper' }}>
              {testError && (
                <Alert severity="warning" onClose={() => setTestError('')} sx={{ mb: 1 }}>
                  {testError}
                </Alert>
              )}
              <ChapterVideoPanel
                fileId={file.id}
                hasTest={!!file.has_test}
                bestScorePct={file.best_score_pct ?? null}
                getToken={getToken}
                busy={startingTest}
                onTakeTest={() => startTest('official')}
                onPractise={() => startTest('revision')}
              />
            </Box>
          )}
        </Box>
      )}
    </Dialog>
  );
}
