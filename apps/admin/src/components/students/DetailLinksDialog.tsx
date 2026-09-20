'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Tooltip,
  Typography,
} from '@neram/ui';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import DownloadIcon from '@mui/icons-material/Download';
import type { StudentRow } from './StudentHubTable';

export interface DetailLink {
  userId: string;
  name: string;
  firstName: string | null;
  url: string;
  message: string;
  expiresAt: string;
  reused: boolean;
  progress: 'not_asked' | 'asked' | 'opened' | 'answered';
  requestId: string;
}

interface DetailLinksDialogProps {
  open: boolean;
  rows: StudentRow[];
  adminId?: string | null;
  onClose: () => void;
  /** Called after links are handed out, so the grid can refresh its Asked column. */
  onDone?: () => void;
}

const PROGRESS_LABEL: Record<DetailLink['progress'], string> = {
  not_asked: 'New link',
  asked: 'Already sent',
  opened: 'They opened it',
  answered: 'Already answered',
};

/**
 * Hand staff a sendable link for every selected student in one pass.
 *
 * Why a dialog full of plain text rather than a "send" button: we hold a phone
 * number for almost none of these students (1 of 28 on the day this was built), so
 * there is nothing to send to. What staff actually have is the parent's number in
 * their own phone, so the job here is to produce something pasteable and get out of
 * the way. Every link is rendered as selectable text, not only copied to the
 * clipboard, because a clipboard write that silently fails would leave staff
 * pasting the previous thing they copied.
 */
export default function DetailLinksDialog({
  open,
  rows,
  adminId,
  onClose,
  onDone,
}: DetailLinksDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [links, setLinks] = useState<DetailLink[]>([]);
  const [failed, setFailed] = useState<{ name: string; reason: string }[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  const userIds = rows.map((r) => r.id);
  const key = userIds.join(',');

  useEffect(() => {
    if (!open || !userIds.length) return;
    let cancelled = false;

    setLoading(true);
    setError(null);
    setLinks([]);
    setFailed([]);
    setCopied(null);
    setCopiedAll(false);

    fetch('/api/students/detail-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIds, adminId: adminId || undefined }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not make the links.');
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        setLinks(data.links || []);
        setFailed(data.failed || []);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key, adminId]);

  // Stamp sent_at only when staff actually take a link away, so the Asked column
  // never claims a student was contacted because somebody opened this dialog to look.
  const markSent = useCallback(
    (ids: string[]) => {
      if (!ids.length) return;
      fetch('/api/students/detail-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestIds: ids, adminId: adminId || undefined }),
      })
        .then(() => onDone?.())
        .catch(() => {
          /* the link is already in their clipboard; bookkeeping must not interrupt */
        });
    },
    [adminId, onDone]
  );

  const copyOne = useCallback(
    async (link: DetailLink, what: 'url' | 'message') => {
      const text = what === 'url' ? link.url : link.message;
      try {
        await navigator.clipboard.writeText(text);
        setCopied(`${link.userId}:${what}`);
        setTimeout(() => setCopied(null), 2000);
      } catch {
        setError('Could not reach the clipboard. Select the text below and copy it by hand.');
      }
      markSent([link.requestId]);
    },
    [markSent]
  );

  const copyAll = useCallback(async () => {
    const text = links.map((l) => `${l.name}\n${l.url}`).join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2500);
    } catch {
      setError('Could not reach the clipboard. Select the list below and copy it by hand.');
    }
    markSent(links.map((l) => l.requestId));
  }, [links, markSent]);

  // A spreadsheet is what actually gets handed to whoever makes the calls.
  const downloadCsv = useCallback(() => {
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [
      ['Student', 'Link', 'Expires', 'Status'].join(','),
      ...links.map((l) =>
        [esc(l.name), esc(l.url), esc(new Date(l.expiresAt).toLocaleDateString('en-IN')), esc(PROGRESS_LABEL[l.progress])].join(',')
      ),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `application-links-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    markSent(links.map((l) => l.requestId));
  }, [links, markSent]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        Links to ask for application details
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Each student gets their own link. It needs no password, works for 14 days, and
          saves straight into their record.
        </Typography>
      </DialogTitle>

      <DialogContent dividers>
        {loading && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 4, justifyContent: 'center' }}>
            <CircularProgress size={22} />
            <Typography variant="body2" color="text.secondary">
              Making {userIds.length} {userIds.length === 1 ? 'link' : 'links'}...
            </Typography>
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {!loading && failed.length > 0 && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {failed.length} could not be made: {failed.map((f) => f.name).join(', ')}.
          </Alert>
        )}

        {!loading && links.length > 0 && (
          <>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
              <Button
                variant="contained"
                size="small"
                startIcon={copiedAll ? <CheckIcon /> : <ContentCopyIcon />}
                onClick={copyAll}
                sx={{ textTransform: 'none', minHeight: 40 }}
              >
                {copiedAll ? 'Copied all' : `Copy all ${links.length}`}
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<DownloadIcon />}
                onClick={downloadCsv}
                sx={{ textTransform: 'none', minHeight: 40 }}
              >
                Download as CSV
              </Button>
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {links.map((link, i) => (
                <Box key={link.userId}>
                  {i > 0 && <Divider />}
                  <Box sx={{ py: 1.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.75 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        {link.name}
                      </Typography>
                      {link.progress !== 'not_asked' && (
                        <Chip
                          label={PROGRESS_LABEL[link.progress]}
                          size="small"
                          sx={{ height: 20, fontSize: 11 }}
                          color={link.progress === 'answered' ? 'success' : 'default'}
                        />
                      )}
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {/* Always visible as text: a clipboard write can fail silently,
                          and staff must still be able to read the link off the screen. */}
                      <Typography
                        variant="body2"
                        sx={{
                          fontFamily: 'monospace',
                          fontSize: 12.5,
                          color: 'text.secondary',
                          wordBreak: 'break-all',
                          userSelect: 'all',
                          flexGrow: 1,
                        }}
                      >
                        {link.url}
                      </Typography>
                      <Tooltip title="Copy the link">
                        <IconButton size="small" onClick={() => copyOne(link, 'url')}>
                          {copied === `${link.userId}:url` ? (
                            <CheckIcon fontSize="small" color="success" />
                          ) : (
                            <ContentCopyIcon fontSize="small" />
                          )}
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Copy a ready WhatsApp message">
                        <IconButton size="small" onClick={() => copyOne(link, 'message')}>
                          {copied === `${link.userId}:message` ? (
                            <CheckIcon fontSize="small" color="success" />
                          ) : (
                            <WhatsAppIcon fontSize="small" />
                          )}
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </Box>
                </Box>
              ))}
            </Box>
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} sx={{ textTransform: 'none' }}>
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}
