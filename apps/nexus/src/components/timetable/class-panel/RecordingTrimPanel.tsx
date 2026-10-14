'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link,
  Skeleton,
  Typography,
} from '@neram/ui';
import ContentCutRoundedIcon from '@mui/icons-material/ContentCutRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';

/**
 * What silence trimming did to this class's recording, for staff.
 *
 * Students asked for shorter catch-up: recordings start with the teacher
 * waiting for people to join and have dead stretches in the middle. Nexus cuts
 * those out automatically (lib/recording-trim.ts), keeps the original, and this
 * is where staff see what went and switch back if a cut was wrong.
 *
 * Fetched only when a staff member opens the class panel, never polled.
 */

interface Cut {
  from: number;
  to: number;
  kind: 'lead' | 'tail' | 'pause';
}

interface TrimInfo {
  status: string;
  reason: string | null;
  removed_seconds: number;
  original_duration_seconds: number;
  trimmed_duration_seconds: number;
  cuts: Cut[];
}

interface YouTubeInfo {
  status: string;
  variant: string;
  replaced_video_id: string | null;
}

interface Props {
  classId: string;
  getToken: () => Promise<string | null>;
  onNotify: (message: string, severity: 'success' | 'error' | 'warning') => void;
  onChanged?: () => void;
}

function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

function minutes(seconds: number): string {
  const m = Math.round(seconds / 60);
  return m === 1 ? '1 min' : `${m} min`;
}

const KIND_LABEL: Record<Cut['kind'], string> = {
  lead: 'before class',
  tail: 'after class',
  pause: 'silent and still',
};

const SKIP_REASON: Record<string, string> = {
  NO_CUTS: 'Nothing long enough to remove.',
  NOT_WORTH_IT: 'Less than a minute to remove, so it was left as it is.',
  GUARD_RATIO: 'It would have removed too much, so it was left as it is.',
  NO_SPEECH: 'No speech found to trim around.',
  NO_DURATION: 'The recording could not be measured.',
};

function summary(cuts: Cut[]): string {
  const lead = cuts.find((c) => c.kind === 'lead');
  const pauses = cuts.filter((c) => c.kind === 'pause').length;
  const parts: string[] = [];
  if (lead) parts.push(`${minutes(lead.to - lead.from)} before class`);
  if (pauses) parts.push(pauses === 1 ? '1 pause' : `${pauses} pauses`);
  if (cuts.some((c) => c.kind === 'tail')) parts.push('the end');
  return parts.join(', ');
}

export default function RecordingTrimPanel({ classId, getToken, onNotify, onChanged }: Props) {
  const [loading, setLoading] = useState(true);
  const [trim, setTrim] = useState<TrimInfo | null>(null);
  const [youtube, setYouTube] = useState<YouTubeInfo | null>(null);
  const [showCuts, setShowCuts] = useState(false);
  const [confirm, setConfirm] = useState<'use_original' | 'use_trimmed' | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/timetable/${classId}/recording-trim`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const data = await res.json();
      setTrim(data.trim);
      setYouTube(data.youtube);
    } finally {
      setLoading(false);
    }
  }, [classId, getToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (action: 'use_original' | 'use_trimmed' | 'retry') => {
    setBusy(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/timetable/${classId}/recording-trim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onNotify(data.error || 'Could not change the recording', 'error');
        return;
      }
      onNotify(data.message || 'Done', 'success');
      setConfirm(null);
      await load();
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Skeleton variant="rounded" height={56} sx={{ borderRadius: 2 }} />;
  if (!trim || trim.status === 'superseded') return null;

  const { status } = trim;
  const line = (() => {
    switch (status) {
      case 'applied':
        return `Trimmed: ${minutes(trim.removed_seconds)} removed (${summary(trim.cuts)}). Students see ${clock(trim.trimmed_duration_seconds)} instead of ${clock(trim.original_duration_seconds)}.`;
      case 'ready':
        return `Trimmed copy ready: ${minutes(trim.removed_seconds)} shorter. Students are part way through, so it switches in overnight.`;
      case 'queued':
      case 'running':
        return 'Removing the silent parts. This takes a few minutes in the evening run.';
      case 'dry_run':
        return `Trial run: would remove ${minutes(trim.removed_seconds)} (${summary(trim.cuts)}). Nothing has changed yet.`;
      case 'skipped':
        return `Not trimmed. ${SKIP_REASON[trim.reason ?? ''] ?? ''}`.trim();
      case 'failed':
        return 'Could not trim this recording. Students see the full recording.';
      case 'reverted':
        return `Students see the full recording. The trimmed copy (${minutes(trim.removed_seconds)} shorter) is kept.`;
      default:
        return null;
    }
  })();
  if (!line) return null;

  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        p: 1.5,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
      }}
    >
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
        <ContentCutRoundedIcon aria-hidden sx={{ fontSize: 18, color: 'text.secondary', mt: '2px' }} />
        <Typography variant="body2" sx={{ color: 'text.primary', lineHeight: 1.5 }}>
          {line}
        </Typography>
      </Box>

      {trim.cuts.length > 0 && ['applied', 'ready', 'dry_run', 'reverted'].includes(status) && (
        <>
          <Button
            size="small"
            onClick={() => setShowCuts((v) => !v)}
            endIcon={
              <ExpandMoreRoundedIcon
                sx={{ transform: showCuts ? 'rotate(180deg)' : 'none', transition: 'transform 200ms', '@media (prefers-reduced-motion: reduce)': { transition: 'none' } }}
              />
            }
            aria-expanded={showCuts}
            sx={{ alignSelf: 'flex-start', minHeight: 44, textTransform: 'none' }}
          >
            What was removed
          </Button>
          <Collapse in={showCuts} unmountOnExit>
            <Box component="ul" sx={{ m: 0, pl: 3, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {trim.cuts.map((c) => (
                <Typography component="li" variant="body2" key={`${c.from}-${c.to}`} color="text.secondary">
                  {clock(c.from)} to {clock(c.to)}, {KIND_LABEL[c.kind]} ({minutes(c.to - c.from)})
                </Typography>
              ))}
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              Times are on the original recording.
            </Typography>
          </Collapse>
        </>
      )}

      {youtube?.replaced_video_id && youtube.status === 'ok' && youtube.variant === 'trimmed' && (
        <Typography variant="caption" color="text.secondary">
          The trimmed copy is on YouTube. The old video is still up:{' '}
          <Link
            href={`https://studio.youtube.com/video/${youtube.replaced_video_id}/edit`}
            target="_blank"
            rel="noopener noreferrer"
          >
            make it private in YouTube Studio
          </Link>
          .
        </Typography>
      )}

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {status === 'applied' && (
          <Button variant="outlined" onClick={() => setConfirm('use_original')} sx={{ minHeight: 44, textTransform: 'none' }}>
            Use original
          </Button>
        )}
        {status === 'reverted' && (
          <Button variant="outlined" onClick={() => setConfirm('use_trimmed')} sx={{ minHeight: 44, textTransform: 'none' }}>
            Use trimmed
          </Button>
        )}
        {(status === 'failed' || status === 'skipped') && (
          <Button
            variant="outlined"
            disabled={busy}
            onClick={() => act('retry')}
            sx={{ minHeight: 44, textTransform: 'none' }}
          >
            Try again
          </Button>
        )}
      </Box>

      <Dialog open={confirm !== null} onClose={() => !busy && setConfirm(null)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 800 }}>
          {confirm === 'use_original' ? 'Switch back to the original?' : 'Switch to the trimmed copy?'}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {confirm === 'use_original'
              ? 'Students will see the full recording again. Checkpoints, captions and everyone’s saved place move back to the original timing.'
              : 'Students will see the shorter recording. Checkpoints, captions and everyone’s saved place move onto it.'}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirm(null)} disabled={busy} sx={{ minHeight: 44, textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={busy}
            onClick={() => confirm && act(confirm)}
            startIcon={busy ? <CircularProgress size={16} /> : undefined}
            sx={{ minHeight: 44, textTransform: 'none' }}
          >
            {busy ? 'Switching...' : 'Switch'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
