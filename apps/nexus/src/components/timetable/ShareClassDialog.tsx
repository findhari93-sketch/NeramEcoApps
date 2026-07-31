'use client';

/**
 * "Share this class": the one message a student needs, in one tap.
 *
 * Before this, a student who missed a class hunted for the recording in one
 * place, the homework in another and the test in a third. A teacher had no way
 * to hand them all three at once. This builds that message, lets the teacher
 * trim it, then copies it or posts it to the class Teams channel.
 *
 * The preview is rendered from the SAME section model the server posts to
 * Graph (class-share-model + class-share-render), so what a teacher reads here
 * is what the class receives. The server re-renders from the database rather
 * than trusting anything sent from here.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormGroup,
  IconButton,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import {
  buildShareSections,
  TOGGLEABLE_SECTIONS,
  type ClassShareResponse,
  type ShareSectionId,
} from '@/lib/class-share-model';
import { renderShareText } from '@/lib/class-share-render';

interface ShareClassDialogProps {
  open: boolean;
  onClose: () => void;
  classId: string;
  getToken: () => Promise<string | null>;
  onNotify?: (message: string, severity?: 'success' | 'error' | 'warning') => void;
}

/** "shared 12 minutes ago", so a second tap is a decision rather than an accident. */
function agoLabel(iso: string | null): string | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export default function ShareClassDialog({
  open,
  onClose,
  classId,
  getToken,
  onNotify,
}: ShareClassDialogProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ClassShareResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<Set<ShareSectionId>>(new Set());
  const [copied, setCopied] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  /** Set when the clipboard API refuses, so the preview becomes selectable. */
  const [manualCopy, setManualCopy] = useState(false);

  // Self-fetching on open, never on mount: the panel renders this for every
  // class the teacher taps and only one of them is ever shared.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setLoadError(null);
      setPostError(null);
      setManualCopy(false);
      try {
        const token = await getToken();
        const res = await fetch(`/api/timetable/${classId}/share`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(json?.error || 'Could not build the message for this class.');
          return;
        }
        setData(json as ClassShareResponse);
      } catch {
        if (!cancelled) setLoadError('Could not reach Nexus. Check your connection and try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, classId, getToken]);

  const sections = useMemo(() => (data ? buildShareSections(data) : []), [data]);
  const toggleable = useMemo(() => sections.filter((s) => s.toggleable), [sections]);

  // Everything a class actually has starts ticked. A teacher trims down far
  // more often than they build up.
  useEffect(() => {
    setEnabled(new Set(toggleable.map((s) => s.id)));
  }, [toggleable]);

  const message = useMemo(() => renderShareText(sections, enabled), [sections, enabled]);

  const toggle = useCallback((id: ShareSectionId) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      // iOS Safari rejects this outside a tightly bound gesture, and the panel's
      // old copy button had no catch at all, so it failed in silence.
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setManualCopy(false);
      onNotify?.('Message copied. Paste it in your class group.', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setManualCopy(true);
    }
  }, [message, onNotify]);

  const handlePost = useCallback(async () => {
    setPosting(true);
    setPostError(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/timetable/${classId}/share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ sections: Array.from(enabled) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        // The dialog stays open and the section choices survive, so the teacher
        // can copy the message instead rather than rebuild it.
        setPostError(json?.error || 'Could not post to Teams.');
        return;
      }
      const where = [json?.posted?.channel && 'the channel', json?.posted?.chat && 'the group chat']
        .filter(Boolean)
        .join(' and ');
      const partial: string[] = json?.warnings || [];
      onNotify?.(
        partial.length ? `Posted to ${where}. ${partial[0]}` : `Posted to ${where}.`,
        partial.length ? 'warning' : 'success',
      );
      onClose();
    } catch {
      setPostError('Could not reach Teams. Try again, or copy the message instead.');
    } finally {
      setPosting(false);
    }
  }, [classId, enabled, getToken, onClose, onNotify]);

  const noTeamsTarget = !!data && !data.teams.hasChannel && !data.teams.hasGroupChat;
  const sharedAgo = agoLabel(data?.lastPostedAt ?? null);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      // Full screen on a phone: a checkbox list, a scrolling preview and two
      // actions do not fit a bottom sheet without the preview becoming a slit.
      fullScreen={isMobile}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, pr: 1 }}>
        <Box component="span" sx={{ fontWeight: 700 }}>
          Share this class
        </Box>
        <IconButton onClick={onClose} aria-label="Close" sx={{ minWidth: 48, minHeight: 48 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {loading && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 4, justifyContent: 'center' }}>
            <CircularProgress size={22} />
            <Typography variant="body2" color="text.secondary">
              Building the message
            </Typography>
          </Box>
        )}

        {!loading && loadError && <Alert severity="error">{loadError}</Alert>}

        {!loading && !loadError && data && data.state === 'cancelled' && (
          <Alert severity="info">
            This class was cancelled, so there is nothing to share. Students have already been told.
          </Alert>
        )}

        {!loading && !loadError && data && data.state !== 'cancelled' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              <Chip
                size="small"
                color={data.state === 'past' ? 'success' : 'primary'}
                variant="outlined"
                label={data.state === 'past' ? 'Class finished' : 'Upcoming class'}
              />
              {sharedAgo && (
                <Typography variant="caption" color="text.secondary">
                  Shared to Teams {sharedAgo}
                </Typography>
              )}
            </Box>

            {toggleable.length > 0 && (
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                  Include
                </Typography>
                <FormGroup>
                  {toggleable.map((section) => (
                    <FormControlLabel
                      key={section.id}
                      sx={{ minHeight: 48, m: 0 }}
                      control={
                        <Checkbox
                          checked={enabled.has(section.id)}
                          onChange={() => toggle(section.id)}
                          sx={{ minWidth: 48, minHeight: 48 }}
                        />
                      }
                      label={section.checkboxLabel}
                    />
                  ))}
                </FormGroup>
              </Box>
            )}

            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                Preview
              </Typography>
              <Box
                component="pre"
                // overflowWrap is load-bearing: a Teams join URL runs to about
                // 180 characters and would otherwise scroll the dialog sideways.
                sx={{
                  m: 0,
                  mt: 0.5,
                  p: 1.5,
                  bgcolor: 'action.hover',
                  borderRadius: 1,
                  fontFamily: 'inherit',
                  fontSize: '0.85rem',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  overflowWrap: 'anywhere',
                  maxHeight: { xs: '38vh', sm: 320 },
                  overflowY: 'auto',
                  userSelect: 'text',
                }}
              >
                {message}
              </Box>
            </Box>

            {manualCopy && (
              <Alert severity="info">
                Your browser blocked the clipboard. Press and hold the preview above to select and copy it.
              </Alert>
            )}

            {data.recapPending && (
              <Alert severity="info">
                The guided recap is not published yet, so this links to the catch-up page instead.
              </Alert>
            )}

            {data.state === 'past' && data.links.watchKind === 'none' && (
              <Alert severity="info">
                No recording on this class yet. Sync it from Teams, then share again.
              </Alert>
            )}

            {data.flagWarnings.length > 0 && (
              <Alert severity="warning">
                {data.flagWarnings.map((f) => f.label).join(' and ')}{' '}
                {data.flagWarnings.length === 1 ? 'is' : 'are'} switched off for students right now, so
                {data.flagWarnings.length === 1 ? ' that link' : ' those links'} will not open for them.
              </Alert>
            )}

            {noTeamsTarget && (
              <Alert severity="info">
                This classroom has no Teams channel or group chat, so there is nowhere to post. Copy the
                message and paste it wherever your class talks.
              </Alert>
            )}

            {postError && <Alert severity="error">{postError}</Alert>}
          </Box>
        )}
      </DialogContent>

      <DialogActions
        sx={{
          flexDirection: { xs: 'column-reverse', sm: 'row' },
          gap: 1,
          p: 2,
          '& > :not(style) ~ :not(style)': { ml: { xs: 0, sm: 1 } },
        }}
      >
        <Button
          onClick={handleCopy}
          variant="outlined"
          disabled={!message}
          startIcon={copied ? <CheckCircleIcon /> : <ContentCopyIcon />}
          fullWidth={isMobile}
          sx={{ minHeight: 48, textTransform: 'none' }}
        >
          {copied ? 'Copied' : 'Copy message'}
        </Button>
        <Button
          onClick={handlePost}
          variant="contained"
          // Disabled with a reason stated above, never a bare grey button.
          disabled={!message || posting || noTeamsTarget || !data || data.state === 'cancelled'}
          startIcon={posting ? <CircularProgress size={16} color="inherit" /> : <ChatBubbleOutlineIcon />}
          fullWidth={isMobile}
          sx={{ minHeight: 48, textTransform: 'none' }}
        >
          {posting ? 'Posting' : 'Post to Teams'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
