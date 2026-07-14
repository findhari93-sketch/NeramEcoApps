'use client';

/**
 * StudyVideoLinkDialog — teacher/admin links (or clears) the class recording for a study file.
 * Paste a YouTube link (embeds inline for students) or any other URL (opens externally).
 */

import { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Box, Typography, TextField, Button, Alert,
  CircularProgress, Divider, IconButton, useMediaQuery,
} from '@neram/ui';
import SmartDisplayOutlinedIcon from '@mui/icons-material/SmartDisplayOutlined';
import CloseIcon from '@mui/icons-material/Close';
import { extractYouTubeId } from '@/lib/youtube';
import type { NexusStudyFileRecording } from '@neram/database/types';

interface StudyVideoLinkDialogProps {
  open: boolean;
  file: { id: string; title: string; recording?: NexusStudyFileRecording | null } | null;
  authFetch: (url: string, init?: RequestInit) => Promise<Response>;
  onClose: () => void;
  onSaved?: () => void;
}

export default function StudyVideoLinkDialog({ open, file, authFetch, onClose, onSaved }: StudyVideoLinkDialogProps) {
  const fullScreen = useMediaQuery('(max-width:599px)');
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setUrl(file?.recording?.url || '');
      setError('');
    }
  }, [open, file]);

  const detected = url.trim() ? (extractYouTubeId(url) ? 'youtube' : 'link') : null;
  const hasExisting = !!file?.recording;

  const patch = async (recording: string | null) => {
    if (!file || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await authFetch(`/api/study-materials/files/${file.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recording }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b?.error || 'Failed to save');
      }
      onSaved?.();
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Failed to save the video link');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => !submitting && onClose()} maxWidth="sm" fullWidth fullScreen={fullScreen}
      PaperProps={{ sx: { borderRadius: fullScreen ? 0 : 2 } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1 }}>
        <SmartDisplayOutlinedIcon color="primary" />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6" fontWeight={700}>Link class recording</Typography>
          <Typography variant="caption" color="text.secondary" noWrap>{file?.title}</Typography>
        </Box>
        <IconButton onClick={() => !submitting && onClose()} aria-label="Close" sx={{ width: 40, height: 40 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <Divider />
      <DialogContent sx={{ pt: 2 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Paste the recording link for the class where this chapter was taught. Students can choose to
          watch it, but they still need to pass the test to complete the chapter.
        </Typography>
        <TextField
          fullWidth size="small" label="Recording URL" placeholder="https://youtu.be/... or a Teams/SharePoint link"
          value={url} onChange={(e) => setUrl(e.target.value)} autoFocus
        />
        {detected && (
          <Typography variant="caption" sx={{ display: 'block', mt: 1, color: detected === 'youtube' ? 'success.main' : 'text.secondary' }}>
            {detected === 'youtube'
              ? 'YouTube detected: this will play inside the app.'
              : 'Not a YouTube link: students will open it in a new tab.'}
          </Typography>
        )}
      </DialogContent>
      <Divider />
      <DialogActions sx={{ p: 2, gap: 1, justifyContent: 'space-between' }}>
        <Box>
          {hasExisting && (
            <Button color="error" onClick={() => patch(null)} disabled={submitting} sx={{ textTransform: 'none' }}>
              Remove video
            </Button>
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button onClick={onClose} disabled={submitting} sx={{ textTransform: 'none' }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => patch(url.trim())}
            disabled={submitting || !url.trim()}
            startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : <SmartDisplayOutlinedIcon />}
            sx={{ textTransform: 'none', minWidth: 140 }}
          >
            {submitting ? 'Saving...' : hasExisting ? 'Update link' : 'Link video'}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}
