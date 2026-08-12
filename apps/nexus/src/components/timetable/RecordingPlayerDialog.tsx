'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  IconButton,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import NeramVideoPlayer from '@/components/video/NeramVideoPlayer';
import { OPEN_GATE } from '@/lib/video-gate';

/**
 * Plays a class recording inside Nexus.
 *
 * The point is who can watch. Linking out to SharePoint let MICROSOFT decide:
 * a recording in the organizer's OneDrive is shared only with the people on the
 * meeting invite, so a student who was not invited, or a teacher who was not,
 * simply got refused. The stream endpoint resolves the file with the app-only
 * token after checking Nexus enrollment, so anyone who belongs in the class can
 * watch, wherever the file happens to live.
 *
 * SharePoint refuses to be iframed, so this points the shared player at a
 * short-lived pre-authenticated URL. Those URLs expire, hence the retry.
 *
 * Ungated: this is a teacher, or a student reviewing a class they have no debt
 * on, so there are no checkpoints to earn. That is now a fact the stream route
 * checks rather than an assumption this component makes. A student who still
 * owes the class is refused there and sent to the guided recap, because a watch
 * here is recorded nowhere and would have to be repeated in full to count.
 *
 * It goes through the shared player anyway, which is what removes the native
 * Download and Picture in picture entries that a plain <video controls> was
 * handing out with the file.
 */

const MAX_RETRIES = 2;

interface RecordingPlayerDialogProps {
  open: boolean;
  onClose: () => void;
  classId: string;
  title: string;
  /** The caller's MS token getter, as every other timetable component takes. */
  getToken: () => Promise<string | null>;
  /**
   * The raw SharePoint/Teams link, offered as an escape hatch. Teachers get the
   * full Teams recap (transcript, chat, attendance) this way; students are not
   * shown it, since it is the link that refuses them.
   */
  fallbackUrl?: string | null;
  showFallbackLink?: boolean;
}

export default function RecordingPlayerDialog({
  open,
  onClose,
  classId,
  title,
  getToken,
  fallbackUrl,
  showFallbackLink = false,
}: RecordingPlayerDialogProps) {
  const theme = useTheme();
  const router = useRouter();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /**
   * Set when the route refused because this student still owes the class.
   *
   * The refusal arrives with somewhere to go, so this dialog does not need to
   * know anything about absences to be useful: any caller that opens it, the
   * dashboard included, gets the way forward without carrying its own copy of
   * the rule.
   */
  const [catchupUrl, setCatchupUrl] = useState<string | null>(null);
  const retryCountRef = useRef(0);

  const fetchStreamUrl = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCatchupUrl(null);
    try {
      const token = await getToken();
      if (!token) {
        setError('Your session expired. Sign in again to watch this recording.');
        return;
      }
      const res = await fetch(`/api/timetable/${classId}/recording-stream`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.streamUrl) {
        setStreamUrl(data.streamUrl);
        retryCountRef.current = 0;
      } else {
        setError(data.error || 'Could not load this recording.');
        if (typeof data.catchup_url === 'string') setCatchupUrl(data.catchup_url);
      }
    } catch {
      setError('Network error, could not load the recording.');
    } finally {
      setLoading(false);
    }
  }, [classId, getToken]);

  useEffect(() => {
    if (!open) return;
    retryCountRef.current = 0;
    setStreamUrl(null);
    fetchStreamUrl();
  }, [open, fetchStreamUrl]);

  // A pre-authenticated URL that expired mid-session looks like a decode error.
  // Fetch a fresh one before telling the user anything is wrong.
  const handleVideoError = useCallback(() => {
    if (retryCountRef.current < MAX_RETRIES) {
      retryCountRef.current++;
      fetchStreamUrl();
    } else {
      setError('The recording stopped loading. Close this and try again.');
    }
  }, [fetchStreamUrl]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={fullScreen}
      maxWidth="md"
      fullWidth
      aria-label={`Recording: ${title}`}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 2,
          py: 1.5,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Typography
          variant="subtitle1"
          sx={{ fontWeight: 700, flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}
        >
          {title}
        </Typography>
        <IconButton
          onClick={onClose}
          aria-label="Close recording"
          sx={{ minWidth: 48, minHeight: 48 }}
        >
          <CloseIcon />
        </IconButton>
      </Box>

      <DialogContent sx={{ p: 0, bgcolor: '#000' }}>
        <Box
          sx={{
            position: 'relative',
            width: '100%',
            aspectRatio: '16 / 9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {loading && <CircularProgress size={32} sx={{ color: 'common.white' }} />}

          {!loading && error && (
            <Box sx={{ textAlign: 'center', color: 'common.white', px: 3 }}>
              <Typography variant="body2" sx={{ mb: 2 }}>
                {error}
              </Typography>
              {/* Try again is the wrong offer for an obligation: asking twice
                  gets refused twice. Where the server named a way through, that
                  is the only button worth showing. */}
              {catchupUrl ? (
                <Button
                  variant="contained"
                  onClick={() => {
                    onClose();
                    router.push(catchupUrl);
                  }}
                  sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600 }}
                >
                  Do catch-up
                </Button>
              ) : (
                <Button
                  variant="outlined"
                  onClick={fetchStreamUrl}
                  sx={{ minHeight: 48, textTransform: 'none', color: 'common.white', borderColor: 'grey.600' }}
                >
                  Try again
                </Button>
              )}
            </Box>
          )}

          {!loading && !error && streamUrl && (
            <Box sx={{ position: 'absolute', inset: 0 }}>
              <NeramVideoPlayer
                source={{ kind: 'html5', src: streamUrl }}
                gate={OPEN_GATE}
                allowFullscreen
                // Safe here and only here: no checkpoints to escape and no
                // watermark to leave behind. The player refuses this anyway if
                // either of those stops being true.
                allowPictureInPicture
                onError={handleVideoError}
              />
            </Box>
          )}
        </Box>
      </DialogContent>

      {showFallbackLink && fallbackUrl && (
        <Box sx={{ px: 2, py: 1.5, borderTop: 1, borderColor: 'divider' }}>
          <Button
            href={fallbackUrl}
            target="_blank"
            rel="noopener noreferrer"
            startIcon={<OpenInNewIcon />}
            sx={{ minHeight: 48, textTransform: 'none' }}
          >
            Open in Teams (transcript and chat)
          </Button>
        </Box>
      )}
    </Dialog>
  );
}
