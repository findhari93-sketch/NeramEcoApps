'use client';

/**
 * Every recorded class and where its backup stands.
 *
 * Split out of YouTubeBackupCard rather than nested in it: the card's job is the
 * grant and the sweep, and this is the answer to the question the sweep raises.
 * The dry run says "3 queued". Nobody can act on that without knowing which 3,
 * and until this existed the only way to find out was to open classes one at a
 * time in the timetable drawer.
 *
 * Read-only on purpose. Marking a class already-done belongs in the class panel,
 * next to the link being pasted, not on a screen that is here to be looked at.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  useTheme,
} from '@neram/ui';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

interface Props {
  getToken: () => Promise<string | null>;
  /** Bumped by the card after a run, so the table reflects what just happened. */
  refreshKey?: number;
}

interface BacklogRow {
  id: string;
  scheduled_date: string;
  title: string | null;
  youtube_url: string | null;
  blocked: string | null;
  transcript: { status: string; segments: number } | null;
  listing: { status: string; yt_title: string | null } | null;
  upload: {
    status: string;
    attempts: number;
    detail: string | null;
    youtube_video_id: string | null;
    privacy_status: string | null;
    studio_url: string | null;
  } | null;
}

interface Backlog {
  classes: BacklogRow[];
  queued: number;
  awaitingPrivacyFlip: number;
}

type ChipColor = 'default' | 'success' | 'warning' | 'error' | 'info';

/** What each reason means to somebody deciding whether to intervene. */
const BLOCK_LABELS: Record<string, { label: string; color: ChipColor }> = {
  done: { label: 'On YouTube', color: 'success' },
  skipped: { label: 'Done by hand', color: 'success' },
  given_up: { label: 'Gave up', color: 'error' },
  attempts_spent: { label: 'Gave up', color: 'error' },
  too_recent: { label: 'Too recent', color: 'default' },
  not_published: { label: 'Not published', color: 'default' },
};

/** "2026-07-20" to "20 Jul", the same reading order as the video titles. */
function shortDate(iso: string): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  if (!match) return iso;
  return `${match[3]} ${months[Number(match[2]) - 1] || '?'}`;
}

export default function YouTubeBacklogTable({ getToken, refreshKey }: Props) {
  const theme = useTheme();
  const [data, setData] = useState<Backlog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/youtube-backup/backlog', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not read the backlog');
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read the backlog');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (loading) {
    return (
      <Box sx={{ textAlign: 'center', py: 3 }}>
        <CircularProgress size={20} />
      </Box>
    );
  }
  if (error) {
    return (
      <Alert severity="error" sx={{ borderRadius: 2 }}>
        {error}
      </Alert>
    );
  }
  if (!data?.classes.length) {
    return (
      <Typography variant="caption" color="text.secondary">
        No class has a recording yet, so there is nothing to back up.
      </Typography>
    );
  }

  const cell = { py: 1, borderColor: theme.palette.divider };
  // The date column stays put while the rest scrolls, which is the only way this
  // reads on a phone: without it you lose track of which class a row belongs to.
  const stickyDate = {
    ...cell,
    position: 'sticky' as const,
    left: 0,
    bgcolor: theme.palette.background.paper,
    zIndex: 1,
    whiteSpace: 'nowrap' as const,
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
        <Chip size="small" color={data.queued ? 'warning' : 'default'} label={`${data.queued} queued`} />
        {data.awaitingPrivacyFlip > 0 && (
          <Chip
            size="small"
            color="info"
            label={`${data.awaitingPrivacyFlip} waiting for you in Studio`}
          />
        )}
      </Box>

      {data.awaitingPrivacyFlip > 0 && (
        <Alert severity="info" sx={{ borderRadius: 2, mb: 1.5 }}>
          Those uploads finished but are still private, which is where YouTube leaves them until the
          compliance audit passes. Open each in Studio, set it to Unlisted, and the next nightly run
          puts it in the student Library.
        </Alert>
      )}

      {/* Wide content scrolls inside its own container, never the page body. */}
      <Box sx={{ overflowX: 'auto', border: `1px solid ${theme.palette.divider}`, borderRadius: 2 }}>
        <Table size="small" sx={{ minWidth: 620 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ ...stickyDate, fontWeight: 700 }}>Date</TableCell>
              <TableCell sx={{ ...cell, fontWeight: 700 }}>Class</TableCell>
              <TableCell sx={{ ...cell, fontWeight: 700 }}>Transcript</TableCell>
              <TableCell sx={{ ...cell, fontWeight: 700 }}>Listing</TableCell>
              <TableCell sx={{ ...cell, fontWeight: 700 }}>Backup</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.classes.map((row) => {
              const block = row.blocked ? BLOCK_LABELS[row.blocked] : null;
              const link = row.youtube_url || row.upload?.studio_url;
              return (
                <TableRow key={row.id} hover>
                  <TableCell sx={stickyDate}>
                    <Typography variant="caption" fontWeight={600}>
                      {shortDate(row.scheduled_date)}
                    </Typography>
                  </TableCell>

                  <TableCell sx={{ ...cell, maxWidth: 260 }}>
                    <Typography variant="caption" sx={{ display: 'block' }}>
                      {row.title || 'Untitled class'}
                    </Typography>
                    {link && (
                      <Typography
                        component="a"
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        variant="caption"
                        sx={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 0.25,
                          color: 'primary.main',
                          minHeight: 32,
                        }}
                      >
                        {row.youtube_url ? 'Watch' : 'Open in Studio'}
                        <OpenInNewIcon sx={{ fontSize: 12 }} />
                      </Typography>
                    )}
                  </TableCell>

                  <TableCell sx={cell}>
                    {row.transcript?.status === 'ok' ? (
                      <Typography variant="caption" color="text.secondary">
                        {row.transcript.segments} lines
                      </Typography>
                    ) : (
                      <Chip
                        size="small"
                        variant="outlined"
                        label={row.transcript?.status === 'unavailable' ? 'None' : 'Waiting'}
                      />
                    )}
                  </TableCell>

                  <TableCell sx={cell}>
                    <Chip
                      size="small"
                      variant="outlined"
                      color={row.listing?.status === 'published' ? 'success' : 'default'}
                      label={row.listing ? row.listing.status : 'not written'}
                    />
                  </TableCell>

                  <TableCell sx={cell}>
                    {block ? (
                      <Chip size="small" color={block.color} label={block.label} />
                    ) : (
                      <Chip size="small" color="warning" label="Queued" />
                    )}
                    {row.upload?.status === 'ok' && row.upload.privacy_status === 'private' && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        private
                      </Typography>
                    )}
                    {row.upload?.detail && row.blocked === 'given_up' && (
                      <Typography variant="caption" color="error" sx={{ display: 'block' }}>
                        {row.upload.detail.slice(0, 60)}
                      </Typography>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Box>
    </Box>
  );
}
