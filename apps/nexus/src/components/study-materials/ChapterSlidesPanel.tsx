'use client';

/**
 * The Slides tab of a teacher's chapter page: which PowerPoint students read
 * beside the PDF, whether it is current, and a preview of the pages they get.
 *
 * Flat, like the rest of the page. Find, paste, refresh, replace and remove all
 * happen here. The only layers on top are the SharePoint picker and the
 * confirmation before removing.
 *
 * The deck stays in SharePoint. Nexus keeps a PDF made from it and looks for a
 * newer version when students open the chapter (lib/study-slides.ts), so a
 * teacher who edits the deck has nothing more to do here. Refresh now is for
 * when they want the change live this minute.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box, Typography, Button, Alert, Skeleton, TextField, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions, alpha, useTheme,
} from '@neram/ui';
import SlideshowOutlinedIcon from '@mui/icons-material/SlideshowOutlined';
import SearchIcon from '@mui/icons-material/Search';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PDFReader from '@/components/reader/PDFReader';
import DriveFilePickerDialog from '@/components/shared/DriveFilePickerDialog';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { slidesMessage, slidesNeedFix, type SlidesMessageCode } from '@/lib/slides-messages';
import { slidesAttachBody, slidesSourceLine, type StaffSlides } from '@/lib/slides-panel';

interface ChapterSlidesPanelProps {
  fileId: string;
  getToken: () => Promise<string | null>;
  /** After a deck is attached, refreshed or removed, so the page re-reads the chapter. */
  onChanged?: () => void;
}

type Busy = null | 'attach' | 'refresh' | 'remove';

const BUTTON_SX = { minHeight: 44, textTransform: 'none' } as const;

export default function ChapterSlidesPanel({ fileId, getToken, onChanged }: ChapterSlidesPanelProps) {
  const theme = useTheme();
  const { getFileSearchToken } = useNexusAuthContext();

  /** undefined while loading, null when the chapter has no slides. */
  const [slides, setSlides] = useState<StaffSlides | null | undefined>(undefined);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState<Busy>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteUrl, setPasteUrl] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);

  // Read through a ref so a new getToken identity from the page cannot refetch.
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const call = useCallback(
    async (method: 'GET' | 'PUT' | 'PATCH' | 'DELETE', body?: unknown) => {
      const token = await getTokenRef.current();
      const res = await fetch(`/api/study-materials/files/${fileId}/slides`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Something went wrong. Try again in a moment.');
      return json as { slides?: StaffSlides | null };
    },
    [fileId],
  );

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const json = await call('GET');
      setSlides(json.slides ?? null);
    } catch (e: any) {
      setLoadError(e?.message || 'The slides could not be read right now.');
    }
  }, [call]);

  useEffect(() => {
    setSlides(undefined);
    load();
  }, [load]);

  const start = (kind: Exclude<Busy, null>) => {
    setBusy(kind);
    setActionError('');
    setDone('');
  };

  const attach = async (body: unknown) => {
    start('attach');
    try {
      const json = await call('PUT', body);
      setSlides(json.slides ?? null);
      setPasteOpen(false);
      setPasteUrl('');
      setDone('Slides added. Students can now switch between the PDF and the slides.');
      onChanged?.();
    } catch (e: any) {
      setActionError(e?.message || 'The slides could not be added right now.');
    } finally {
      setBusy(null);
    }
  };

  const refresh = async () => {
    start('refresh');
    try {
      const json = await call('PATCH');
      setSlides(json.slides ?? null);
      // A refresh never throws for a SharePoint failure: it records the problem
      // and keeps the last good slides, so success has to be read off the answer.
      const problem = json.slides?.source?.problem ?? null;
      if (problem === 'GRAPH_UNAVAILABLE') setActionError(slidesMessage('GRAPH_UNAVAILABLE'));
      else if (!slidesNeedFix(problem)) setDone('The slides match the PowerPoint in SharePoint.');
      onChanged?.();
    } catch (e: any) {
      setActionError(e?.message || 'The slides could not be refreshed right now.');
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    start('remove');
    try {
      await call('DELETE');
      setSlides(null);
      setConfirmRemove(false);
      setDone('Slides removed. Students read this chapter from the PDF only.');
      onChanged?.();
    } catch (e: any) {
      setActionError(e?.message || 'The slides could not be removed right now.');
    } finally {
      setBusy(null);
    }
  };

  const source = slides?.source;
  const problem = source?.problem ?? slides?.code ?? null;
  const needsFix = slidesNeedFix(problem);

  const pasteForm = pasteOpen && (
    <Box
      component="form"
      onSubmit={(e: React.FormEvent) => {
        e.preventDefault();
        if (pasteUrl.trim() && !busy) attach({ url: pasteUrl.trim() });
      }}
      sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1, width: '100%', textAlign: 'left' }}
    >
      <TextField
        label="SharePoint link to the deck"
        value={pasteUrl}
        onChange={(e) => setPasteUrl(e.target.value)}
        fullWidth
        autoFocus
        disabled={!!busy}
        inputProps={{ inputMode: 'url' }}
        helperText="Open the deck in SharePoint, choose Copy link, and paste it here."
        sx={{ '& .MuiInputBase-root': { minHeight: 48 } }}
      />
      <Box sx={{ display: 'flex', gap: 1, alignSelf: { xs: 'stretch', sm: 'flex-start' } }}>
        <Button type="submit" variant="contained" disabled={!pasteUrl.trim() || !!busy} sx={{ ...BUTTON_SX, minHeight: 48, flex: { xs: 1, sm: 'none' }, whiteSpace: 'nowrap' }}>
          Add slides
        </Button>
        <Button
          onClick={() => {
            setPasteOpen(false);
            setPasteUrl('');
          }}
          disabled={!!busy}
          sx={{ ...BUTTON_SX, minHeight: 48 }}
        >
          Cancel
        </Button>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ px: { xs: 2, sm: 3 }, py: 2, maxWidth: 960, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="body2" color="text.secondary">
        The PowerPoint this chapter is taught from. Students read it as pages beside the PDF, and never get the .pptx.
      </Typography>

      {done && (
        <Alert severity="success" onClose={() => setDone('')}>
          {done}
        </Alert>
      )}
      {actionError && (
        <Alert severity="warning" onClose={() => setActionError('')}>
          {actionError}
        </Alert>
      )}

      {busy === 'attach' ? (
        <Box
          role="status"
          sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2.5, borderRadius: 2, border: `1px solid ${theme.palette.divider}` }}
        >
          <CircularProgress size={22} />
          <Typography variant="body2">Preparing slides. Large decks take up to a minute.</Typography>
        </Box>
      ) : slides === undefined ? (
        loadError ? (
          <Alert
            severity="warning"
            action={
              <Button color="inherit" onClick={load} sx={BUTTON_SX}>
                Try again
              </Button>
            }
          >
            {loadError}
          </Alert>
        ) : (
          <Box aria-busy="true" sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Skeleton variant="rounded" height={88} />
            <Skeleton variant="rounded" sx={{ width: '100%', height: 'auto', aspectRatio: '16 / 9' }} />
          </Box>
        )
      ) : slides === null ? (
        <Box
          sx={{
            border: `1px dashed ${theme.palette.divider}`,
            borderRadius: 2,
            p: { xs: 2.5, sm: 4 },
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1.5,
          }}
        >
          <SlideshowOutlinedIcon sx={{ fontSize: 40, color: 'primary.main' }} />
          <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700 }}>
            No slides yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 440 }}>
            Find the deck in SharePoint, or paste its link. It stays in SharePoint, and edits made there reach students the next time they open the chapter.
          </Typography>
          {!pasteOpen && (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
              <Button variant="contained" startIcon={<SearchIcon />} onClick={() => setPickerOpen(true)} sx={BUTTON_SX}>
                Find in SharePoint
              </Button>
              <Button variant="outlined" startIcon={<LinkOutlinedIcon />} onClick={() => setPasteOpen(true)} sx={BUTTON_SX}>
                Paste a SharePoint link
              </Button>
            </Box>
          )}
          {pasteForm}
        </Box>
      ) : (
        <>
          <Box sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: 2, p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
              <Box
                sx={{
                  width: 44,
                  height: 44,
                  borderRadius: 1.5,
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                  color: 'primary.main',
                  bgcolor: alpha(theme.palette.primary.main, 0.1),
                }}
              >
                <SlideshowOutlinedIcon />
              </Box>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="subtitle2" component="h2" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>
                  {source?.name || 'Class slides'}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  {slidesSourceLine(source)}
                </Typography>
              </Box>
            </Box>

            {needsFix && <Alert severity="warning">{slidesMessage(problem as SlidesMessageCode)}</Alert>}

            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              <Button
                variant="outlined"
                startIcon={busy === 'refresh' ? <CircularProgress size={16} /> : <RefreshIcon />}
                onClick={refresh}
                disabled={!!busy}
                sx={BUTTON_SX}
              >
                {busy === 'refresh' ? 'Refreshing' : 'Refresh now'}
              </Button>
              {source?.web_url && (
                <Button href={source.web_url} target="_blank" rel="noopener noreferrer" startIcon={<OpenInNewIcon />} sx={BUTTON_SX}>
                  Open in SharePoint
                </Button>
              )}
              <Button startIcon={<SwapHorizIcon />} onClick={() => setPickerOpen(true)} disabled={!!busy} sx={BUTTON_SX}>
                Replace
              </Button>
              {/* Set apart from the everyday actions, since it is the one that changes what students see. */}
              <Button
                color="error"
                startIcon={<DeleteOutlineIcon />}
                onClick={() => setConfirmRemove(true)}
                disabled={!!busy}
                sx={{ ...BUTTON_SX, ml: { sm: 'auto' } }}
              >
                Remove
              </Button>
            </Box>
            {pasteForm}
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.5 }}>
              Preview. Students also see their name across each page.
            </Typography>
            {slides.status === 'ready' && slides.url ? (
              <Box
                sx={{
                  height: { xs: '60vh', sm: '70vh' },
                  minHeight: 320,
                  display: 'flex',
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: 2,
                  overflow: 'hidden',
                }}
              >
                {/* Keyed on the link, so a refresh shows the new version rather than the cached pages. */}
                <PDFReader key={slides.url} pdfUrl={slides.url} label="Slides" onRetry={load} />
              </Box>
            ) : (
              <Alert severity="info">
                Nothing to preview yet. {needsFix ? 'Fix the problem above, then press Refresh now.' : 'Press Refresh now to try again.'}
              </Alert>
            )}
          </Box>
        </>
      )}

      <DriveFilePickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        getToken={getToken}
        getSearchToken={getFileSearchToken}
        kind="presentation"
        scope="both"
        onPick={(item) => attach(slidesAttachBody(item))}
        onPasteLink={() => setPasteOpen(true)}
      />

      <Dialog open={confirmRemove} onClose={() => busy !== 'remove' && setConfirmRemove(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Remove the slides?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Students will read this chapter from the PDF only. The PowerPoint stays in SharePoint, untouched.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmRemove(false)} disabled={busy === 'remove'} sx={BUTTON_SX}>
            Keep them
          </Button>
          <Button color="error" variant="contained" onClick={remove} disabled={busy === 'remove'} sx={BUTTON_SX}>
            {busy === 'remove' ? 'Removing' : 'Remove'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
