'use client';

import { useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from '@neram/ui';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import LinkIcon from '@mui/icons-material/Link';
import RefreshIcon from '@mui/icons-material/Refresh';
import type { ClassCardData } from '../ClassCard';

/**
 * The recording, and an honest account of where it is.
 *
 * This replaced a line reading "Recording not yet available" and a Sync button.
 * That line said exactly the same thing whether the class had ended ninety
 * seconds ago, the nightly sweep was going to look tonight, or Teams had been
 * asked four times over a week and never had one. Three completely different
 * situations, only one of which a teacher can do anything about, and the panel
 * made them indistinguishable.
 *
 * Nothing here polls. The columns are written by the sweep in
 * lib/recording-backfill and arrive with the class row.
 */

interface RecordingSectionProps {
  cls: ClassCardData;
  isTeacher: boolean;
  hasRecording: boolean;
  hasMeeting: boolean;
  /** Opens the in-app player. */
  onOpenRecording?: () => void;
  /** Ask Teams again, now. */
  onSyncRecording?: (cls: ClassCardData) => void;
  getToken: () => Promise<string | null>;
  classroomId: string;
  onNotify: (message: string, severity: 'success' | 'error' | 'warning') => void;
  /** Refetch the class so the new link shows without closing the panel. */
  onChanged?: () => void;
}

function whenFetched(iso?: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return null;
  }
}

export default function RecordingSection({
  cls,
  isTeacher,
  hasRecording,
  hasMeeting,
  onOpenRecording,
  onSyncRecording,
  getToken,
  classroomId,
  onNotify,
  onChanged,
}: RecordingSectionProps) {
  const [pasteOpen, setPasteOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const status = cls.recording_sync_status ?? null;
  const attempts = cls.recording_sync_attempts ?? 0;
  const exhausted = status === 'unavailable';
  const fetchedAt = whenFetched(cls.recording_fetched_at);

  const save = async () => {
    setSaving(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/timetable/recording', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          class_id: cls.id,
          classroom_id: cls.classroom?.id || classroomId,
          recording_url: url.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onNotify(data.error || 'Could not save that link', 'error');
        return;
      }
      onNotify(data.message || 'Recording link saved', 'success');
      setPasteOpen(false);
      setUrl('');
      onChanged?.();
    } catch {
      onNotify('Could not save that link', 'error');
    } finally {
      setSaving(false);
    }
  };

  /** One sentence about where the automatic hunt has got to. */
  const statusLine = (() => {
    if (hasRecording) {
      if (status === 'manual') return 'Added by hand';
      return fetchedAt ? `Found automatically, ${fetchedAt}` : null;
    }
    if (!hasMeeting) return null;
    if (exhausted) {
      return `Teams had no recording after ${attempts} tries, so nothing will look again.`;
    }
    if (status === 'pending') {
      return `Not found yet. Tried ${attempts} of 4 times, next check tonight.`;
    }
    return 'Teams may still be processing it. Nexus checks again tonight.';
  })();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {/* Opens the in-app player rather than linking out to Microsoft: a
          recording that lives in the organizer's OneDrive is shared only with
          the meeting invitees, so the outbound link refuses most students and
          any teacher who was not invited. */}
      {hasRecording && (
        <Button
          variant="contained"
          color="success"
          fullWidth
          onClick={onOpenRecording}
          startIcon={<PlayCircleOutlineIcon />}
          sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600 }}
        >
          Watch Recording
        </Button>
      )}

      {statusLine && (
        <Typography
          variant="caption"
          color={exhausted ? 'error.main' : 'text.secondary'}
          sx={{ textAlign: 'center', display: 'block' }}
        >
          {statusLine}
        </Typography>
      )}

      {/* The detail is only worth showing once the sweep has given up: before
          that it reads as an error about something still in progress. */}
      {isTeacher && exhausted && cls.recording_sync_detail && (
        <Typography variant="caption" color="text.disabled" sx={{ textAlign: 'center', display: 'block' }}>
          {cls.recording_sync_detail}
        </Typography>
      )}

      {isTeacher && hasMeeting && (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {/* Checking again is pointless once Teams has been asked four times
              and answered nothing four times. Pasting a link is the only move
              left, so it is the only one offered. */}
          {!hasRecording && !exhausted && onSyncRecording && (
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={() => onSyncRecording(cls)}
              sx={{ flex: 1, minWidth: 140, minHeight: 48, textTransform: 'none' }}
            >
              Check now
            </Button>
          )}
          <Button
            variant={hasRecording ? 'text' : 'outlined'}
            startIcon={<LinkIcon />}
            onClick={() => {
              setUrl(cls.recording_url || '');
              setPasteOpen(true);
            }}
            sx={{ flex: 1, minWidth: 140, minHeight: 48, textTransform: 'none' }}
          >
            {hasRecording ? 'Replace the link' : 'Paste a link'}
          </Button>
        </Box>
      )}

      <Dialog open={pasteOpen} onClose={() => setPasteOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 800 }}>
          {hasRecording ? 'Replace the recording link' : 'Add the recording link'}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Paste the link to the recording wherever it actually lives: SharePoint, OneDrive,
            Stream or a YouTube video. Students open it through the Nexus player, so they never
            need access to the file itself.
          </Typography>
          <TextField
            label="Recording link"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            fullWidth
            autoFocus
            placeholder="https://..."
            // 16px prevents the iOS zoom-on-focus that shifts the whole dialog.
            inputProps={{ style: { fontSize: 16 } }}
          />
          {hasRecording && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
              Clear the box and save to remove the link and let the nightly check try again.
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setPasteOpen(false)} sx={{ minHeight: 44, textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={save}
            disabled={saving}
            startIcon={saving ? <CircularProgress size={16} /> : undefined}
            sx={{ minHeight: 44, textTransform: 'none' }}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
