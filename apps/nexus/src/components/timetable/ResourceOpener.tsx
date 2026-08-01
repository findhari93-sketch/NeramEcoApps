'use client';

/**
 * What happens when someone taps a piece of reference material.
 *
 * One component for all four student surfaces (the class drawer, the catch-up
 * checklist, the recap player and the browsable page) plus the teacher's own
 * editor, so a PDF opens the same protected way everywhere and nobody has to
 * remember which viewer belongs to which kind.
 *
 * Videos use the plain course-plan dialog, NOT RecapYouTubePlayer: that one
 * registers a global window.__recapPlayer for checkpoint gating, so mounting it
 * beside the recap player would have the two fight over the same handle.
 */

import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  IconButton,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RecordingPlayerDialog from '@/components/course-plan/RecordingPlayerDialog';
import PDFReader from '@/components/reader/PDFReader';
import ProtectedContent from '@/components/ProtectedContent';
import { extractYouTubeId } from '@/lib/youtube';
import type { ClassResource } from '@/lib/class-resources';

interface ResourceOpenerProps {
  /** The item to open, or null when nothing is open. */
  resource: ClassResource | null;
  onClose: () => void;
  getToken: () => Promise<string | null>;
  /**
   * Student identity drawn faintly over a PDF. Leave undefined for staff, who
   * are previewing their own material.
   */
  watermark?: string;
}

export default function ResourceOpener({
  resource,
  onClose,
  getToken,
  watermark,
}: ResourceOpenerProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [token, setToken] = useState<string | null>(null);

  const kind = resource?.kind ?? null;

  // The PDF route reads ?token= rather than a header, because pdf.js cannot set
  // one on the requests it makes for the document.
  useEffect(() => {
    let cancelled = false;
    if (kind !== 'study_file') {
      setToken(null);
      return;
    }
    getToken().then((t) => {
      if (!cancelled) setToken(t);
    });
    return () => {
      cancelled = true;
    };
  }, [kind, resource?.id, getToken]);

  if (!resource) return null;

  if (resource.kind === 'youtube') {
    const videoId = extractYouTubeId(resource.url);
    if (!videoId) return null;
    return (
      <RecordingPlayerDialog
        open
        onClose={onClose}
        youtubeId={videoId}
        title={resource.title}
      />
    );
  }

  if (resource.kind === 'image') {
    return (
      <Dialog open onClose={onClose} maxWidth="lg" fullScreen={fullScreen} fullWidth>
        <ViewerChrome title={resource.title} onClose={onClose}>
          <ProtectedContent disableScreenshot sx={{ width: '100%' }}>
            <Box
              component="img"
              src={resource.url || ''}
              alt={resource.title}
              sx={{ width: '100%', height: 'auto', display: 'block', borderRadius: 1 }}
            />
          </ProtectedContent>
        </ViewerChrome>
      </Dialog>
    );
  }

  if (resource.kind === 'study_file') {
    // The read-only, organisation-scoped SharePoint address. Offered as a
    // secondary action for anyone who would rather read the deck in Office, and
    // as the ONLY action when Graph refused to render it (too large, or a format
    // it cannot convert). `type: 'view'` is what guarantees they cannot edit it.
    const sharePointUrl = resource.file?.sharepoint_web_url || null;

    return (
      <Dialog open onClose={onClose} maxWidth="lg" fullScreen={fullScreen} fullWidth>
        <ViewerChrome title={resource.title} onClose={onClose} openInUrl={sharePointUrl}>
          {token ? (
            <ProtectedContent disableScreenshot sx={{ width: '100%' }}>
              <PDFReader
                pdfUrl={`/api/study-materials/files/${resource.study_file_id}/content?token=${encodeURIComponent(token)}`}
                watermark={watermark}
              />
            </ProtectedContent>
          ) : (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress size={24} />
            </Box>
          )}
        </ViewerChrome>
      </Dialog>
    );
  }

  return null;
}

/**
 * Shared dialog frame: a title, an optional "Open in SharePoint" action, and a
 * 48px close target.
 *
 * The SharePoint action is icon-only below `sm` so the title keeps the room it
 * needs on a 375px screen, which is why it carries an aria-label either way.
 */
function ViewerChrome({
  title,
  onClose,
  openInUrl,
  children,
}: {
  title: string;
  onClose: () => void;
  openInUrl?: string | null;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down('sm'));

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 2,
          py: 1.25,
          borderBottom: (t) => `1px solid ${t.palette.divider}`,
        }}
      >
        <Typography sx={{ flex: 1, fontWeight: 700, fontSize: '0.9375rem' }} noWrap>
          {title}
        </Typography>

        {openInUrl &&
          (compact ? (
            <IconButton
              component="a"
              href={openInUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open in SharePoint, read only"
              sx={{ width: 48, height: 48 }}
            >
              <OpenInNewIcon fontSize="small" />
            </IconButton>
          ) : (
            <Button
              component="a"
              href={openInUrl}
              target="_blank"
              rel="noopener noreferrer"
              size="small"
              startIcon={<OpenInNewIcon sx={{ fontSize: 16 }} />}
              sx={{ textTransform: 'none', minHeight: 40, flexShrink: 0 }}
            >
              Open in SharePoint
            </Button>
          ))}

        <IconButton onClick={onClose} aria-label="Close" sx={{ width: 48, height: 48 }}>
          <CloseIcon />
        </IconButton>
      </Box>
      <Box sx={{ p: { xs: 1, sm: 2 }, overflow: 'auto' }}>{children}</Box>
    </Box>
  );
}

/**
 * Open a resource that needs no dialog. Returns true when it handled the tap.
 *
 * Links leave the app entirely, so they are a side effect rather than a piece of
 * rendered state. noopener is not optional: these URLs are teacher-pasted and the
 * new tab must not get a handle on ours.
 */
export function openExternalResource(resource: ClassResource): boolean {
  if (resource.kind !== 'link' || !resource.url) return false;
  window.open(resource.url, '_blank', 'noopener,noreferrer');
  return true;
}
