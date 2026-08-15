'use client';

/**
 * The chapter workspace: Document, Setup, Students, Comments, all as full-width
 * tabs on one real page.
 *
 * This replaces a Dialog that opened on top of the folder grid and stacked a
 * further dialog on top of itself for every Setup action, which is what made
 * it feel heavy. A page has a URL (`?tab=` is shareable and survives a
 * refresh), a working back button, and no second layer of chrome around
 * whatever dialog Setup opens next.
 */

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  Box, Typography, IconButton, Button, ToggleButton, ToggleButtonGroup, Alert, Snackbar, Skeleton,
  alpha, useTheme, useMediaQuery,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import PDFReader from '@/components/reader/PDFReader';
import ProtectedContent from '@/components/ProtectedContent';
import ChapterWorkspaceRail, { type ChapterManageActions } from '@/components/study-materials/ChapterWorkspaceRail';
import ChapterCompletionPanel from '@/components/study-materials/ChapterCompletionPanel';
import DownloadGrantDialog, { type GrantTarget } from '@/components/study-materials/DownloadGrantDialog';
import StudyTestAuthorDialog from '@/components/study-materials/StudyTestAuthorDialog';
import GenerateChapterTestSheet from '@/components/study-materials/GenerateChapterTestSheet';
import StudyVideoTracksDialog from '@/components/study-materials/StudyVideoTracksDialog';
import type { NexusStudyFileDTO, NexusStudyFileRecording } from '@neram/database/types';

type FileDTO = NexusStudyFileDTO & {
  allow_download?: boolean | null;
  qb_paper?: { id: string; title: string; short_title: string } | null;
};
type Tab = 'doc' | 'setup' | 'students' | 'comments';

function ChapterWorkspace() {
  const theme = useTheme();
  const router = useRouter();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { fileId } = useParams<{ fileId: string }>();
  const searchParams = useSearchParams();
  const { getToken, activeClassroom, isTeacher, loading: authLoading } = useNexusAuthContext();

  const [file, setFile] = useState<FileDTO | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [snack, setSnack] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null);
  /** Bumped on every save, so the Setup checklist re-reads its recordings and test. */
  const [refreshKey, setRefreshKey] = useState(0);

  const [tab, setTab] = useState<Tab>((searchParams.get('tab') as Tab) || 'doc');

  const changeTab = (next: Tab) => {
    setTab(next);
    const sp = new URLSearchParams(Array.from(searchParams.entries()));
    if (next === 'doc') sp.delete('tab');
    else sp.set('tab', next);
    const qs = sp.toString();
    router.replace(`/teacher/study-materials/${fileId}${qs ? `?${qs}` : ''}`);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const t = await getToken();
      if (t) setToken(t);
      const res = await fetch(`/api/study-materials/files/${fileId}`, {
        headers: t ? { Authorization: `Bearer ${t}` } : undefined,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'Could not load this chapter.');
      setFile(body.file);
      setRefreshKey((n) => n + 1);
    } catch (e: any) {
      setError(e?.message || 'Could not load this chapter.');
    } finally {
      setLoading(false);
    }
  }, [fileId, getToken]);

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading, load]);

  // Dialogs this page owns: the same four the Setup checklist's buttons reach
  // for, so opening the workspace never loses the way in to any of them.
  const [grantTarget, setGrantTarget] = useState<GrantTarget | null>(null);
  const [testFile, setTestFile] = useState<{ id: string; title: string; qb_paper?: FileDTO['qb_paper'] } | null>(null);
  const [generateFile, setGenerateFile] = useState<{ id: string; title: string } | null>(null);
  const [tracksFile, setTracksFile] = useState<
    { id: string; title: string; recording?: NexusStudyFileRecording | null } | null
  >(null);

  const authFetch = useCallback(
    async (url: string, init?: RequestInit) => {
      const t = await getToken();
      if (!t) throw new Error('Not authenticated');
      return fetch(url, { ...init, headers: { ...(init?.headers || {}), Authorization: `Bearer ${t}` } });
    },
    [getToken],
  );

  const authJson = useCallback(
    async (url: string, init?: RequestInit) => {
      const res = await authFetch(url, {
        ...init,
        headers: { ...(init?.headers || {}), ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(json?.error || 'Request failed');
        if (res.status === 409 && json?.manualPrompt) {
          (err as Error & { manualPrompt?: string; reason?: string }).manualPrompt = json.manualPrompt;
          (err as Error & { manualPrompt?: string; reason?: string }).reason = json.reason;
        }
        throw err;
      }
      return json;
    },
    [authFetch],
  );

  const manageActions: ChapterManageActions = {
    onTest: () => {
      if (!file) return;
      // With a test already linked the honest action is to edit that one, not
      // to quietly build a second.
      if (file.file_type === 'application/pdf' && !file.has_test && !file.qb_paper) {
        setGenerateFile({ id: file.id, title: file.title });
      } else {
        setTestFile({ id: file.id, title: file.title, qb_paper: file.qb_paper });
      }
    },
    onOpenTest: (testId: string) => router.push(`/teacher/tests/${testId}`),
    onRecordings: () =>
      file && setTracksFile({ id: file.id, title: file.title, recording: file.recording ?? null }),
    onDownloadAccess: () =>
      file && setGrantTarget({ kind: 'file', id: file.id, name: file.title, folderId: file.folder_id }),
  };

  const contentUrl = (download = false) =>
    file
      ? `/api/study-materials/files/${file.id}/content?token=${encodeURIComponent(token || '')}${download ? '&download=1' : ''}`
      : '';

  if (!authLoading && !isTeacher) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">This page is for teachers only.</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1.25, borderBottom: `1px solid ${theme.palette.divider}`, flexShrink: 0 }}>
        <IconButton
          onClick={() => router.push(file ? `/teacher/study-materials?folder=${file.folder_id}` : '/teacher/study-materials')}
          aria-label="Back"
        >
          <ArrowBackIcon />
        </IconButton>
        {!file ? (
          <Skeleton variant="text" width={220} height={32} />
        ) : (
          <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: 1, minWidth: 0 }} noWrap>
            {file.title}
          </Typography>
        )}
        {file?.downloadable && (
          <Button size="small" startIcon={<DownloadOutlinedIcon />} onClick={() => window.open(contentUrl(true), '_blank')}>
            Download
          </Button>
        )}
      </Box>

      {/* Tabs: full width, exclusive, at every breakpoint. Students needs the
          space for a filterable table, and the same shape reads better on a
          phone than a side rail ever did. */}
      <ToggleButtonGroup
        value={tab}
        exclusive
        onChange={(_, v) => v && changeTab(v)}
        fullWidth
        size="small"
        sx={{
          p: 1,
          flexShrink: 0,
          borderBottom: `1px solid ${theme.palette.divider}`,
          '& .MuiToggleButton-root': isMobile
            ? { minHeight: 52, textTransform: 'none', flexDirection: 'column', gap: 0.25, fontSize: 10, px: 0.5 }
            : { minHeight: 44, textTransform: 'none', gap: 0.75 },
        }}
      >
        <ToggleButton value="doc">
          {file?.kind === 'image' ? <ImageOutlinedIcon fontSize="small" /> : <PictureAsPdfOutlinedIcon fontSize="small" />}
          Document
        </ToggleButton>
        <ToggleButton value="setup">
          <TuneRoundedIcon fontSize="small" /> Setup
        </ToggleButton>
        <ToggleButton value="students">
          <GroupsOutlinedIcon fontSize="small" /> Students
        </ToggleButton>
        <ToggleButton value="comments">
          <ChatBubbleOutlineIcon fontSize="small" /> Comments
        </ToggleButton>
      </ToggleButtonGroup>

      {error && (
        <Alert severity="warning" sx={{ m: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Body */}
      <Box sx={{ flex: 1, minHeight: 0 }}>
        {loading && !file ? (
          <Box sx={{ p: 2 }}>
            <Skeleton variant="rounded" height={400} />
          </Box>
        ) : !file ? null : tab === 'doc' ? (
          <Box sx={{ height: '100%', minHeight: '70vh', display: 'flex', bgcolor: alpha(theme.palette.text.primary, 0.03) }}>
            {/* ProtectedContent blocks right-click, text selection, Ctrl+S/P and printing. */}
            <ProtectedContent disableScreenshot sx={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', width: '100%' }}>
              {file.kind === 'pdf' ? (
                <PDFReader pdfUrl={contentUrl()} />
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
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', userSelect: 'none' }}
                  />
                </Box>
              )}
            </ProtectedContent>
          </Box>
        ) : tab === 'students' ? (
          <ChapterCompletionPanel fileId={fileId} classroomId={activeClassroom?.id ?? null} getToken={getToken} />
        ) : (tab === 'setup' || tab === 'comments') ? (
          <ChapterWorkspaceRail
            fileId={fileId}
            file={file}
            getToken={getToken}
            tab={tab}
            actions={manageActions}
            refreshKey={refreshKey}
          />
        ) : null}
      </Box>

      {/* Per-file test authoring (JSON upload or manual). */}
      <StudyTestAuthorDialog
        open={!!testFile}
        file={testFile}
        authFetch={authJson}
        onClose={() => setTestFile(null)}
        onSaved={load}
        onGenerate={(f) => {
          setTestFile(null);
          setGenerateFile(f);
        }}
      />

      {/* Chapter PDF straight to a live test. */}
      <GenerateChapterTestSheet
        open={!!generateFile}
        file={generateFile}
        authFetch={authJson}
        onClose={() => {
          setGenerateFile(null);
          load();
        }}
        onGenerated={(s) => setSnack({ msg: `${s.title} is live, ${s.serve} questions per attempt`, sev: 'success' })}
      />

      {/* Every video on this chapter, one dialog. */}
      <StudyVideoTracksDialog
        open={!!tracksFile}
        file={tracksFile}
        getToken={getToken}
        onClose={() => setTracksFile(null)}
        onChanged={load}
      />

      {/* Time-limited download grants. */}
      <DownloadGrantDialog
        open={!!grantTarget}
        target={grantTarget}
        classroomId={activeClassroom?.id ?? null}
        authFetch={authFetch}
        onClose={() => setGrantTarget(null)}
      />

      <Snackbar open={!!snack} autoHideDuration={3000} onClose={() => setSnack(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {snack ? <Alert severity={snack.sev} onClose={() => setSnack(null)} variant="filled">{snack.msg}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}

export default function ChapterWorkspacePage() {
  return (
    <Suspense fallback={<Box sx={{ p: 2 }}><Skeleton variant="rounded" height={400} /></Box>}>
      <ChapterWorkspace />
    </Suspense>
  );
}
