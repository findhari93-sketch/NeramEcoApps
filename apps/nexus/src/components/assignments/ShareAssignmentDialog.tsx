'use client';

/**
 * "Share this assignment": the link, the message, and the group post, in one tap.
 *
 * Before this, an assignment could be published once and never handed out
 * again. A teacher chasing the students still to submit had nothing to paste:
 * no link, no wording, and no way to reach the class group. The per-student
 * Message button next door does DMs; this one does the group.
 *
 * The preview is rendered from the SAME pure model the server posts to Graph
 * (assignment-share-model), so what a teacher reads here is what the class
 * receives. The server re-reads the roster and re-renders from the database
 * rather than trusting anything sent from here, which is why the POST body
 * carries only checkbox state.
 *
 * Modelled on ShareClassDialog, deliberately: a teacher who has shared a class
 * already knows how this works.
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
import LinkIcon from '@mui/icons-material/Link';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import {
  renderAssignmentShareText,
  splitPending,
  type AssignmentShareResponse,
} from '@/lib/assignment-share-model';

interface ShareAssignmentDialogProps {
  open: boolean;
  onClose: () => void;
  assignmentId: string;
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

/** Every button in here is a thumb target on a phone. */
const TOUCH = { minHeight: 48, textTransform: 'none' as const };

export default function ShareAssignmentDialog({
  open,
  onClose,
  assignmentId,
  getToken,
  onNotify,
}: ShareAssignmentDialogProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AssignmentShareResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [includeNames, setIncludeNames] = useState(true);
  const [toChannel, setToChannel] = useState(true);
  const [toChat, setToChat] = useState(true);
  const [copied, setCopied] = useState<'link' | 'message' | null>(null);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  /** Set when the clipboard API refuses, so the preview becomes selectable. */
  const [manualCopy, setManualCopy] = useState(false);

  // Self-fetching on open, never on mount: the page renders this once but only
  // some assignments are ever shared, and the roster read is not free.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setLoadError(null);
      setPostError(null);
      setManualCopy(false);
      setCopied(null);
      try {
        const token = await getToken();
        const res = await fetch(`/api/assignments/${assignmentId}/share`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(json?.error || 'Could not build the message for this assignment.');
          return;
        }
        const payload = json as AssignmentShareResponse;
        setData(payload);
        // Only offer a target the classroom actually has, so a tick can never
        // promise a post that has nowhere to go.
        setToChannel(payload.teams.hasChannel);
        setToChat(payload.teams.hasGroupChat);
      } catch {
        if (!cancelled) setLoadError('Could not reach Nexus. Check your connection and try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, assignmentId, getToken]);

  const message = useMemo(
    () => (data ? renderAssignmentShareText(data, { includeNames }) : ''),
    [data, includeNames],
  );

  const pendingCount = data?.pending.length ?? 0;
  const taggedCount = data ? splitPending(data.pending).named.length : 0;
  const noTeamsTarget = !!data && !data.teams.hasChannel && !data.teams.hasGroupChat;
  const sharedAgo = agoLabel(data?.lastPostedAt ?? null);
  const canPost =
    !!data && !data.isDraft && !noTeamsTarget && (toChannel || toChat) && !posting;

  const copy = useCallback(
    async (what: 'link' | 'message', text: string) => {
      try {
        // iOS Safari rejects this outside a tightly bound gesture, and a copy
        // button that fails in silence is worse than one that is not there.
        await navigator.clipboard.writeText(text);
        setCopied(what);
        setManualCopy(false);
        onNotify?.(what === 'link' ? 'Link copied.' : 'Message copied.', 'success');
        setTimeout(() => setCopied(null), 2000);
      } catch {
        setManualCopy(true);
      }
    },
    [onNotify],
  );

  const handlePost = useCallback(async () => {
    setPosting(true);
    setPostError(null);
    try {
      const token = await getToken();
      const targets = [toChannel && 'channel', toChat && 'chat'].filter(Boolean);
      const res = await fetch(`/api/assignments/${assignmentId}/share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        // Choices only. The server re-derives who is pending and re-renders the
        // card, so nothing typed or held here can decide who gets tagged.
        body: JSON.stringify({ includeNames, targets }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        // The dialog stays open and the choices survive, so the teacher can copy
        // the message instead rather than rebuild it.
        setPostError(json?.error || 'Could not post to Teams.');
        return;
      }
      const where = [json?.posted?.channel && 'the channel', json?.posted?.chat && 'the group chat']
        .filter(Boolean)
        .join(' and ');
      const tagged = json?.tagged
        ? ` ${json.tagged} student${json.tagged === 1 ? '' : 's'} tagged.`
        : '';
      const partial: string[] = json?.warnings || [];
      onNotify?.(
        partial.length ? `Posted to ${where}.${tagged} ${partial[0]}` : `Posted to ${where}.${tagged}`,
        partial.length ? 'warning' : 'success',
      );
      onClose();
    } catch {
      setPostError('Could not reach Teams. Try again, or copy the message instead.');
    } finally {
      setPosting(false);
    }
  }, [assignmentId, getToken, includeNames, onClose, onNotify, toChannel, toChat]);

  return (
    <Dialog
      open={open}
      onClose={() => !posting && onClose()}
      // Full screen on a phone: a checkbox list, a scrolling preview and three
      // actions do not fit a bottom sheet without the preview becoming a slit.
      fullScreen={isMobile}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, pr: 1 }}
      >
        <Box component="span" sx={{ fontWeight: 700 }}>
          Share this assignment
        </Box>
        <IconButton
          onClick={() => !posting && onClose()}
          aria-label="Close"
          sx={{ minWidth: 48, minHeight: 48 }}
        >
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

        {!loading && loadError && (
          <Alert severity="error" role="alert">
            {loadError}
          </Alert>
        )}

        {!loading && !loadError && data && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              <Chip
                size="small"
                variant="outlined"
                color={pendingCount === 0 ? 'success' : 'warning'}
                label={
                  pendingCount === 0
                    ? `All ${data.totalCount} submitted`
                    : `${pendingCount} of ${data.totalCount} not submitted`
                }
              />
              {sharedAgo && (
                <Typography variant="caption" color="text.secondary">
                  Shared to Teams {sharedAgo}
                </Typography>
              )}
            </Box>

            {pendingCount > 0 && (
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                  Who to name
                </Typography>
                <FormGroup>
                  <FormControlLabel
                    sx={{ minHeight: 48, m: 0 }}
                    control={
                      <Checkbox
                        checked={includeNames}
                        onChange={(e) => setIncludeNames(e.target.checked)}
                        sx={{ minWidth: 48, minHeight: 48 }}
                      />
                    }
                    label={`Name the ${pendingCount} who have not submitted`}
                  />
                </FormGroup>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  {includeNames
                    ? 'Posting to Teams tags them, so it reaches their activity feed too.'
                    : 'The message goes out as a plain announcement to the whole group.'}
                </Typography>
              </Box>
            )}

            {(data.teams.hasChannel || data.teams.hasGroupChat) && (
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                  Post to
                </Typography>
                <FormGroup>
                  {data.teams.hasChannel && (
                    <FormControlLabel
                      sx={{ minHeight: 48, m: 0 }}
                      control={
                        <Checkbox
                          checked={toChannel}
                          onChange={(e) => setToChannel(e.target.checked)}
                          sx={{ minWidth: 48, minHeight: 48 }}
                        />
                      }
                      label="Assignment channel"
                    />
                  )}
                  {data.teams.hasGroupChat && (
                    <FormControlLabel
                      sx={{ minHeight: 48, m: 0 }}
                      control={
                        <Checkbox
                          checked={toChat}
                          onChange={(e) => setToChat(e.target.checked)}
                          sx={{ minWidth: 48, minHeight: 48 }}
                        />
                      }
                      label="Group chat"
                    />
                  )}
                </FormGroup>
              </Box>
            )}

            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                Preview
              </Typography>
              <Box
                component="pre"
                // overflowWrap is load-bearing: the share URL would otherwise
                // scroll the dialog sideways on a 375px screen.
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
                  maxHeight: { xs: '32vh', sm: 300 },
                  overflowY: 'auto',
                  userSelect: 'text',
                }}
              >
                {message}
              </Box>
            </Box>

            {manualCopy && (
              <Alert severity="info">
                Your browser blocked the clipboard. Press and hold the preview above to select and
                copy it.
              </Alert>
            )}

            {data.isDraft && (
              <Alert severity="warning">
                This assignment is still a draft, so students cannot open the link. Publish it
                first. You can still copy the link for your own notes.
              </Alert>
            )}

            {includeNames && data.unmentionableCount > 0 && (
              <Alert severity="info">
                {data.unmentionableCount} of them{' '}
                {data.unmentionableCount === 1 ? 'has' : 'have'} no Microsoft account yet, so{' '}
                {data.unmentionableCount === 1 ? 'that name appears' : 'those names appear'} in bold
                instead of as a tag.
              </Alert>
            )}

            {pendingCount > splitPending(data.pending).named.length && includeNames && (
              <Alert severity="info">
                Teams tags the first {taggedCount}; the rest are counted as &quot;and{' '}
                {pendingCount - taggedCount} more&quot;.
              </Alert>
            )}

            {noTeamsTarget && (
              <Alert severity="info">
                This classroom has no assignment channel or group chat, so there is nowhere to post.
                Copy the message and paste it wherever your class talks.
              </Alert>
            )}

            {postError && (
              <Alert severity="error" role="alert">
                {postError}
              </Alert>
            )}
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
          onClick={() => data && copy('link', data.shareUrl)}
          variant="outlined"
          disabled={!data}
          startIcon={copied === 'link' ? <CheckCircleIcon /> : <LinkIcon />}
          fullWidth={isMobile}
          sx={TOUCH}
        >
          {copied === 'link' ? 'Copied' : 'Copy link'}
        </Button>
        <Button
          onClick={() => copy('message', message)}
          variant="outlined"
          disabled={!message}
          startIcon={copied === 'message' ? <CheckCircleIcon /> : <ContentCopyIcon />}
          fullWidth={isMobile}
          sx={TOUCH}
        >
          {copied === 'message' ? 'Copied' : 'Copy message'}
        </Button>
        <Button
          onClick={handlePost}
          variant="contained"
          // Disabled only with a reason stated above, never a bare grey button.
          disabled={!canPost}
          startIcon={
            posting ? <CircularProgress size={16} color="inherit" /> : <ChatBubbleOutlineIcon />
          }
          fullWidth={isMobile}
          sx={TOUCH}
        >
          {posting
            ? 'Posting'
            : includeNames && taggedCount > 0
              ? `Post and tag ${taggedCount}`
              : 'Post to Teams'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
